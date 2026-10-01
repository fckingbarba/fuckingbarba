import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { WHATSAPP } from "../../modules/whatsapp"
import type WhatsappService from "../../modules/whatsapp/service"
import type { ConversaDaFila } from "../../modules/whatsapp/service"
import { urlDaLoja } from "../emails/moldura"
import { ajustesDoWhatsapp } from "./ajustes"
import {
  clienteDaIa,
  contextoDaConversa,
  ErroDaIa,
  instrucoesDoAtendente,
  responderComIa,
  type ClienteDaIa,
} from "./atendente"
import { catalogoDoAtendente } from "./catalogo"
import { duvidasDaLoja } from "./duvidas"
import {
  credenciaisDoWhatsapp,
  enviarTexto,
  ErroDaMeta,
  mostrarDigitando,
  type Credenciais,
} from "./meta"
import {
  conversaPraIa,
  decidir,
  DIAS_LIDOS,
  MENSAGENS_LIDAS,
  RESPOSTA_DE_SOCORRO,
  TENTATIVAS_ANTES_DO_SOCORRO,
  TETO_POR_HORA,
  textoPraEnviar,
} from "./regras"

/**
 * A RODADA DO ATENDENTE — de minuto em minuto (o job `responder-no-whatsapp`):
 * pega as conversas com mensagem esperando resposta e responde cada uma.
 *
 * Por que um job, e não a resposta na hora em que a mensagem chega: quem
 * escreve em três mensagens seguidas recebe UMA resposta (`ESPERA_S`), e a
 * fila mora no banco — um deploy no meio não perde ninguém (o Loopfy
 * guardava o "vou responder" num relógio da memória, e o deploy apagava).
 *
 * A RESPOSTA QUE NÃO SAI fica na fila e a próxima rodada tenta de novo; na
 * terceira seguida, a pessoa recebe o "vou chamar alguém do time" e a
 * conversa vai pra equipe. Ninguém fica falando sozinho.
 */

/** Quantas conversas uma rodada pega, e quantas responde ao mesmo tempo. */
export const POR_RODADA = 20
export const AO_MESMO_TEMPO = 4

export type RelatorioDoWhatsapp = {
  respondidas: number
  /** Passaram pra equipe nesta rodada (a IA chamou, recusou, ou não conseguiu). */
  praEquipe: number
  /** Saíram da fila sem resposta: a equipe cuida, a janela fechou, o atendente desligado. */
  largadas: number
  esperando: number
  falhas: number
  /** O que falta pra responder (as variáveis do Railway), quando falta. */
  falta: string[]
}

const vazio = (): RelatorioDoWhatsapp => ({
  respondidas: 0,
  praEquipe: 0,
  largadas: 0,
  esperando: 0,
  falhas: 0,
  falta: [],
})

type Rodada = {
  whatsapp: WhatsappService
  cred: Credenciais
  ia: ClienteDaIa
  instrucoes: () => Promise<string>
  agora: Date
  relatorio: RelatorioDoWhatsapp
}

export async function rodadaDoWhatsapp(
  container: MedusaContainer,
  agora = new Date()
): Promise<RelatorioDoWhatsapp> {
  const relatorio = vazio()
  const whatsapp = container.resolve<WhatsappService>(WHATSAPP)
  const fila = await whatsapp.fila(POR_RODADA)
  if (!fila.length) return relatorio

  const cred = credenciaisDoWhatsapp()
  const ia = clienteDaIa()
  const loja = urlDaLoja()
  if (!cred) relatorio.falta.push("WHATSAPP_TOKEN e WHATSAPP_NUMERO_ID")
  if (!ia) relatorio.falta.push("ANTHROPIC_API_KEY")
  if (!loja) relatorio.falta.push("LOJA_URL")
  // Sem como responder, a fila espera: a variável que entra no Railway destrava.
  if (!cred || !ia || !loja) return relatorio

  const ajustes = await ajustesDoWhatsapp(container)
  if (!ajustes.ligado) {
    // Desligado, quem responde é a equipe, pelo painel: nada fica esperando o atendente.
    for (const c of fila) await whatsapp.largar(c.id)
    relatorio.largadas = fila.length
    return relatorio
  }

  let instrucoes: Promise<string> | null = null
  const rodada: Rodada = {
    whatsapp,
    cred,
    ia,
    agora,
    relatorio,
    instrucoes: () =>
      (instrucoes ??= Promise.all([catalogoDoAtendente(container, loja), duvidasDaLoja(loja)]).then(
        ([catalogo, duvidas]) =>
          instrucoesDoAtendente({ loja, catalogo, duvidas, regras: ajustes.regras })
      )),
  }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const restantes = [...fila]
  await Promise.all(
    Array.from({ length: Math.min(AO_MESMO_TEMPO, restantes.length) }, async () => {
      for (let c = restantes.shift(); c; c = restantes.shift()) {
        try {
          await cuidar(rodada, c)
        } catch (e) {
          // Erro do banco ou do catálogo: a conversa fica na fila pra próxima rodada.
          relatorio.falhas++
          logger.warn(`[whatsapp] não respondi agora: ${e instanceof Error ? e.message : e}`)
        }
      }
    })
  )
  return relatorio
}

async function cuidar(r: Rodada, c: ConversaDaFila) {
  const decisao = decidir(c, r.agora, await r.whatsapp.ultimaDaEquipe(c.id))
  if (decisao.fazer === "esperar") {
    r.relatorio.esperando++
    return
  }
  if (decisao.fazer === "largar") {
    await r.whatsapp.largar(c.id)
    r.relatorio.largadas++
    return
  }
  // A equipe ficou com ela e não respondeu a tempo: o atendente volta.
  if (c.situacao === "equipe") await r.whatsapp.passar(c.id, { situacao: "bot" })

  const desdeUmaHora = new Date(r.agora.getTime() - 3_600_000)
  if ((await r.whatsapp.respostasDoBot(c.id, desdeUmaHora)) >= TETO_POR_HORA) {
    await praEquipe(r, c, "muitas mensagens seguidas (o teto do atendente)")
    await r.whatsapp.largar(c.id)
    return
  }

  const historico = await r.whatsapp.historico(c.id, {
    limite: MENSAGENS_LIDAS,
    desde: new Date(r.agora.getTime() - DIAS_LIDOS * 86_400_000),
  })
  const conversa = conversaPraIa(historico)
  const doCliente = historico
    .filter((m) => m.autor === "cliente")
    .sort((a, b) => b.em.getTime() - a.em.getTime())
  if (!conversa || !doCliente.length) {
    await r.whatsapp.largar(c.id)
    r.relatorio.largadas++
    return
  }
  const lidaAte = doCliente[0].em
  if (doCliente[0].wamid) await mostrarDigitando(r.cred, doCliente[0].wamid)

  let resposta: Awaited<ReturnType<typeof responderComIa>>
  try {
    resposta = await responderComIa({
      cliente: r.ia,
      instrucoes: await r.instrucoes(),
      contexto: contextoDaConversa({ agora: r.agora, nome: c.nome }),
      conversa,
    })
  } catch (e) {
    if (!(e instanceof ErroDaIa)) throw e
    await naoSaiu(r, c, lidaAte, "a IA não respondeu")
    return
  }

  if (resposta.tipo === "recusou") {
    await mandar(r, c, RESPOSTA_DE_SOCORRO, { uso: resposta.uso, recusou: true })
    await praEquipe(r, c, "a IA não quis responder esta mensagem")
    await r.whatsapp.respondida(c.id, lidaAte)
    return
  }

  const saiu = await mandar(r, c, textoPraEnviar(resposta.texto), {
    uso: resposta.uso,
    ferramentas: resposta.ferramentas,
    ...(resposta.equipe ? { equipe: resposta.equipe } : {}),
  })
  if (saiu === "fora-da-janela") {
    await r.whatsapp.largar(c.id)
    r.relatorio.largadas++
    return
  }
  if (saiu === "nao") {
    await naoSaiu(r, c, lidaAte, "a Meta não aceitou a resposta")
    return
  }
  if (resposta.equipe) await praEquipe(r, c, resposta.equipe)
  await r.whatsapp.respondida(c.id, lidaAte)
  r.relatorio.respondidas++
}

/** Manda e anota (a que não saiu também, com o erro: a tela de conversas mostra). */
async function mandar(
  r: Rodada,
  c: ConversaDaFila,
  texto: string,
  dados: Record<string, unknown>
): Promise<"sim" | "nao" | "fora-da-janela"> {
  try {
    const { wamid } = await enviarTexto(r.cred, c.telefone, texto)
    await r.whatsapp.anotarSaida({
      conversaId: c.id,
      autor: "bot",
      texto,
      wamid,
      situacao: "enviada",
      dados,
      em: new Date(),
    })
    return "sim"
  } catch (e) {
    await r.whatsapp.anotarSaida({
      conversaId: c.id,
      autor: "bot",
      texto,
      wamid: null,
      situacao: "falhou",
      erro: e instanceof Error ? e.message : String(e),
      dados,
      em: new Date(),
    })
    // 131047: passou de 24 horas desde a última mensagem da pessoa — texto livre não sai mais.
    return e instanceof ErroDaMeta && e.codigo === 131047 ? "fora-da-janela" : "nao"
  }
}

/** Não saiu nesta rodada; na terceira seguida, o aviso e a equipe. */
async function naoSaiu(r: Rodada, c: ConversaDaFila, lidaAte: Date, porque: string) {
  r.relatorio.falhas++
  const tentativas = await r.whatsapp.falhou(c.id)
  if (tentativas < TENTATIVAS_ANTES_DO_SOCORRO) return
  await mandar(r, c, RESPOSTA_DE_SOCORRO, { socorro: porque })
  await praEquipe(r, c, porque)
  await r.whatsapp.respondida(c.id, lidaAte)
}

async function praEquipe(r: Rodada, c: ConversaDaFila, motivo: string) {
  await r.whatsapp.passar(c.id, { situacao: "equipe", motivo, em: new Date() })
  r.relatorio.praEquipe++
}
