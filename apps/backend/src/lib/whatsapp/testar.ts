import type { MedusaContainer } from "@medusajs/framework/types"
import { urlDaLoja } from "../emails/moldura"
import { emDolar, FERRAMENTAS_NA_TELA } from "../painel/whatsapp"
import { ajustesDoWhatsapp, LIMITE_DAS_REGRAS } from "./ajustes"
import {
  clienteDaIa,
  contextoDaConversa,
  custoEmDolar,
  ErroDaIa,
  responderComIa,
  type ClienteDaIa,
} from "./atendente"
import { clientePeloTelefone, resumoDoCliente } from "./cliente"
import { FERRAMENTAS_DA_LOJA, usarFerramenta, type ContextoDasFerramentas } from "./ferramentas"
import { conversaPraIa, RESPOSTA_DE_SOCORRO, textoPraEnviar, type MensagemLida } from "./regras"
import { instrucoesDaLoja } from "./responder"

/**
 * O "TESTAR O ATENDENTE" DO PAINEL — a equipe escreve como se fosse um
 * cliente e vê o que ele responderia: as mesmas instruções, o mesmo
 * catálogo, as mesmas ferramentas e a mesma IA da conversa de verdade. Nada
 * sai pelo WhatsApp e nada fica nas conversas. As regras ainda não salvas
 * podem ir junto (o campo da tela), pra testar antes de salvar.
 *
 * Com um telefone, responde como pro cliente dele (os pedidos, a ficha); o
 * "Montou a sacola" cria a sacola de verdade (o link funciona, pra conferir).
 */

export type FalaDoTeste = { de: "cliente" | "atendente"; texto: string }

export type ResultadoDoTeste =
  | {
      ok: true
      texto: string
      /** O que sairia em mensagens separadas (o copia e cola do Pix). */
      extras: string[]
      ferramentas: string[]
      /** O motivo, quando ele chamaria a equipe. */
      equipe: string | null
      ms: number
      custo: string
      /** O que ele sabia de quem escreve: "cliente, 3 pedidos". */
      sabia: string
    }
  | { ok: false; motivo: "sem_chave" | "sem_loja" | "conversa" | "regras" | "ia_fora" }

/** Lê a conversa que a tela mandou: 1 a 20 falas, a última do cliente, cada uma até 1000 letras. */
export function lerFalas(v: unknown): FalaDoTeste[] | null {
  if (!Array.isArray(v) || !v.length || v.length > 20) return null
  const falas: FalaDoTeste[] = []
  for (const f of v) {
    const de = (f as { de?: unknown })?.de
    const texto = (f as { texto?: unknown })?.texto
    if ((de !== "cliente" && de !== "atendente") || typeof texto !== "string") return null
    const t = texto.trim().slice(0, 1000)
    if (!t) return null
    falas.push({ de, texto: t })
  }
  return falas[falas.length - 1].de === "cliente" ? falas : null
}

export async function testarOAtendente(
  container: MedusaContainer,
  p: { falas: FalaDoTeste[]; telefone: string | null; regras: string | null | undefined },
  cliente: ClienteDaIa | null = clienteDaIa(),
  agora = new Date()
): Promise<ResultadoDoTeste> {
  if (!cliente) return { ok: false, motivo: "sem_chave" }
  const loja = urlDaLoja()
  if (!loja) return { ok: false, motivo: "sem_loja" }
  if (typeof p.regras === "string" && p.regras.trim().length > LIMITE_DAS_REGRAS)
    return { ok: false, motivo: "regras" }

  const mensagens: MensagemLida[] = p.falas.map((f, i) => ({
    autor: f.de === "cliente" ? "cliente" : "bot",
    tipo: "texto",
    texto: f.texto,
    em: new Date(agora.getTime() - (p.falas.length - i) * 1000),
  }))
  const conversa = conversaPraIa(mensagens)
  if (!conversa) return { ok: false, motivo: "conversa" }

  const telefone = p.telefone?.replace(/\D/g, "") || null
  const quem = telefone ? await clientePeloTelefone(container, telefone).catch(() => null) : null
  const resumo = quem ? await resumoDoCliente(container, quem, agora).catch(() => null) : null
  const regras =
    typeof p.regras === "string"
      ? p.regras.trim() || null
      : (await ajustesDoWhatsapp(container)).regras
  const ctx: ContextoDasFerramentas = {
    container,
    telefone: telefone ?? "teste",
    cliente: quem,
    loja,
    agora,
    depois: [],
  }

  const inicio = Date.now()
  let resposta: Awaited<ReturnType<typeof responderComIa>>
  try {
    resposta = await responderComIa({
      cliente,
      instrucoes: await instrucoesDaLoja(container, loja, regras),
      contexto: contextoDaConversa({ agora, nome: quem?.nome ?? null, cliente: resumo }),
      conversa,
      ferramentas: FERRAMENTAS_DA_LOJA,
      executar: (nome, input) => usarFerramenta(nome, input, ctx),
    })
  } catch (e) {
    if (e instanceof ErroDaIa) return { ok: false, motivo: "ia_fora" }
    throw e
  }
  const ms = Date.now() - inicio
  const sabia = quem
    ? `cliente, ${quem.pedidos.length} ${quem.pedidos.length === 1 ? "pedido" : "pedidos"}`
    : "não é cliente (ou sem número)"
  if (resposta.tipo === "recusou")
    return {
      ok: true,
      texto: RESPOSTA_DE_SOCORRO,
      extras: [],
      ferramentas: ["Chamou a equipe"],
      equipe: "a IA não quis responder esta mensagem",
      ms,
      custo: emDolar(custoEmDolar(resposta.uso)),
      sabia,
    }
  return {
    ok: true,
    texto: textoPraEnviar(resposta.texto),
    extras: ctx.depois,
    ferramentas: [...new Set(resposta.ferramentas.map((f) => FERRAMENTAS_NA_TELA[f] ?? f))],
    equipe: resposta.equipe,
    ms,
    custo: emDolar(custoEmDolar(resposta.uso)),
    sabia,
  }
}
