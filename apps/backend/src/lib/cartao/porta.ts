import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { OBSERVABILIDADE } from "../../modules/observabilidade"
import type ObservabilidadeService from "../../modules/observabilidade/service"
import { lerEstado } from "../../modules/pagarme/situacao"
import { quemPede } from "../quem-pede"
import { avisarDoFreio } from "./aviso"
import {
  decidir,
  freioLigado,
  RESPOSTA_DA_BARRADA,
  resultadoDaSessao,
  semOIp,
  sessaoDeCartao,
  type Contagem,
} from "./robo"

/**
 * A PORTA DO CARTÃO — antes do `POST /store/carts/:id/complete`, que é onde o
 * Medusa manda o cartão pro Pagar.me (no `authorizePayment` do provedor).
 * A regra de quem passa mora em `robo.ts`; aqui se lê, se anota e se
 * responde.
 *
 * O CAMINHO DE UMA TENTATIVA:
 *
 *   1. a sessão do carrinho é de cartão e ainda não foi pro Pagar.me? Se
 *      não for (Pix, a sessão que já foi), a porta nem olha;
 *   2. anota a tentativa ("andando") e só DEPOIS conta — com ela dentro. Dez
 *      tentativas ao mesmo tempo viram dez linhas antes de qualquer conta, e
 *      a sexta de uma sacola não passa só porque as outras cinco ainda não
 *      tinham terminado;
 *   3. barrada: responde 429 com o motivo (`cartao_limite` ou
 *      `cartao_freio`), e nada chega no Pagar.me. Passou: o Medusa segue, e
 *      quando a resposta sai, a porta lê na sessão como terminou (aprovada,
 *      em análise, recusada) — e, se esta recusa ligou o freio, avisa o
 *      dono por e-mail.
 *
 * O PAGAMENTO NÃO PARA POR CAUSA DA PORTA. Se anotar ou contar falhar (o
 * banco engasgou, a migração ainda não rodou), a tentativa segue sem a
 * trava, com uma linha no log: a trava é pra segurar robô, não pra derrubar
 * venda.
 *
 * QUEM, SEM O IP: a chave da pessoa (`quemPede`: o IP que a loja manda,
 * assinado, ou o da conexão) vira um resumo com o segredo da loja antes de
 * ir pro banco. Conta "a mesma pessoa" do mesmo jeito, e o IP não fica
 * guardado.
 */
export async function portaDoCartao(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const carrinho = req.params.id

  let sessao: { id: string; valor: number } | null = null
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "cart",
      fields: [
        "id",
        "payment_collection.payment_sessions.id",
        "payment_collection.payment_sessions.provider_id",
        "payment_collection.payment_sessions.data",
      ],
      filters: { id: carrinho },
    })
    sessao = sessaoDeCartao(data[0] as Parameters<typeof sessaoDeCartao>[0])
  } catch (e) {
    logger.error(`[cartão] não consegui ler a sessão do ${carrinho} (${mensagem(e)}) — seguiu sem a trava`)
    return next()
  }
  if (!sessao) return next()

  const pede = quemPede(req)
  const quem = semOIp(pede.chave)
  const obs = req.scope.resolve<ObservabilidadeService>(OBSERVABILIDADE)

  let id: string
  let contagem: Contagem
  try {
    id = await obs.abrirTentativa({
      carrinho,
      sessao: sessao.id,
      quem,
      assinada: pede.assinado,
      valor: sessao.valor,
    })
    contagem = await obs.contarTentativas({ carrinho, quem })
  } catch (e) {
    logger.error(`[cartão] não consegui anotar a tentativa do ${carrinho} (${mensagem(e)}) — seguiu sem a trava`)
    return next()
  }

  const decisao = decidir(contagem, pede.assinado)
  if (!decisao.passa) {
    await obs
      .fecharTentativa(id, { resultado: "barrada", motivo: decisao.motivo })
      .catch((e) => logger.error(`[cartão] não consegui fechar a tentativa ${id}: ${mensagem(e)}`))
    logger.warn(
      `[cartão] tentativa barrada no ${carrinho} (${decisao.motivo}; ${emFrase(contagem)}` +
        `${pede.assinado ? "" : "; sem a assinatura da loja"})`
    )
    res.status(429).json({ type: "not_allowed", message: RESPOSTA_DA_BARRADA[decisao.motivo] })
    return
  }

  const freioAntes = freioLigado(contagem)
  const sessaoId = sessao.id
  let fechada = false
  const fechar = () => {
    if (fechada) return
    fechada = true
    void depoisDaTentativa(req.scope, { id, sessao: sessaoId, carrinho, freioAntes })
  }
  // A resposta saiu: o `complete` terminou, e a sessão diz como.
  res.on("finish", fechar)
  next()
}

/**
 * Como a tentativa terminou, lido na sessão — e o aviso, se foi esta recusa
 * que ligou o freio. Nunca lança: a resposta já foi.
 */
async function depoisDaTentativa(
  container: MedusaContainer,
  t: { id: string; sessao: string; carrinho: string; freioAntes: boolean }
) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "payment_session",
      fields: ["id", "data"],
      filters: { id: t.sessao },
    })
    const lida = data[0] as { data?: Record<string, unknown> | null } | undefined
    const { resultado, motivo } = resultadoDaSessao(lerEstado(lida?.data))
    const obs = container.resolve<ObservabilidadeService>(OBSERVABILIDADE)
    await obs.fecharTentativa(t.id, { resultado, motivo })
    if (resultado !== "recusada" || t.freioAntes) return

    const depois = await obs.contarTentativas({ carrinho: t.carrinho, quem: "" })
    if (!freioLigado(depois)) return
    logger.warn(
      `[cartão] FREIO LIGADO: ${depois.recusas} recusas de ${depois.terminadas} tentativas de ` +
        "cartão em 30 minutos — parece robô testando cartão. Poucas tentativas por vez até passar."
    )
    await avisarDoFreio(container, depois)
  } catch (e) {
    logger.error(`[cartão] não consegui fechar a tentativa ${t.id}: ${mensagem(e)}`)
  }
}

function emFrase(c: Contagem): string {
  return (
    `sacola ${c.doCarrinho}, pessoa ${c.daPessoa}, sem assinatura ${c.diretas}, ` +
    `recusas ${c.recusas} de ${c.terminadas} em 30 min`
  )
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e))
