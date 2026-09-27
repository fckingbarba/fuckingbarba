import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { OBSERVABILIDADE } from "../../modules/observabilidade"
import type ObservabilidadeService from "../../modules/observabilidade/service"
import { conferirOParceiro } from "../pagamento/aviso"
import type { Terminada } from "../pagamento/disjuntor"
import { estadoDaSessao } from "../pagamento/parceiros"
import { quemPede } from "../quem-pede"
import { avisarDoFreio } from "./aviso"
import {
  decidir,
  decidirPix,
  freioLigado,
  maiorLinhaDo,
  RESPOSTA_DA_BARRADA,
  resultadoDaSessao,
  semOIp,
  sessaoQueVai,
  type Contagem,
  type ContagemDoPix,
  type SessaoQueVai,
} from "./robo"

/**
 * A PORTA DO PAGAMENTO — antes do `POST /store/carts/:id/complete`, que é
 * onde o Medusa manda o pagamento pro parceiro (no `authorizePayment` do
 * provedor). Nasceu como a porta do cartão (0129), contra o robô testando
 * cartão — a regra de quem passa mora em `robo.ts`; aqui se lê, se anota e se
 * responde. Desde a 0150 ela anota o Pix também: é das tentativas de todo
 * parceiro que sai o disjuntor (`lib/pagamento/disjuntor.ts`).
 *
 * O CAMINHO DE UMA TENTATIVA:
 *
 *   1. a sessão do carrinho é de um parceiro e ainda não foi pra ele? Se não
 *      for (o provisório, a sessão que já foi), a porta nem olha;
 *   2. anota a tentativa ("andando") — com o parceiro e a forma. No cartão,
 *      só DEPOIS conta, com ela dentro: dez tentativas ao mesmo tempo viram
 *      dez linhas antes de qualquer conta, e a sexta de uma sacola não passa
 *      só porque as outras cinco ainda não tinham terminado;
 *   3. cartão barrado: responde 429 com o motivo (`cartao_limite` ou
 *      `cartao_freio`), e nada chega no Pagar.me. O Pix tem as travas dele
 *      (0163): até 10 unidades de cada produto e 3 Pix por pessoa em 40
 *      minutos (`pix_quantidade`, 400; `pix_limite`, 429) — Pix não testa
 *      cartão, mas segura o estoque (ver `LIMITES_DO_PIX`, em `robo.ts`);
 *   4. passou: o Medusa segue, e quando a resposta sai, a porta lê na sessão
 *      como terminou (aprovada, em análise, recusada, o Pix gerado, o
 *      parceiro que não atendeu) — e avisa o dono por e-mail se foi esta
 *      tentativa que ligou o freio do cartão, ou que derrubou (ou trouxe de
 *      volta) o parceiro (`conferirOParceiro`).
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
export async function portaDoPagamento(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const carrinho = req.params.id

  let sessao: SessaoQueVai | null = null
  let maiorLinha = 0
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "cart",
      fields: [
        "id",
        "items.quantity",
        "payment_collection.payment_sessions.id",
        "payment_collection.payment_sessions.provider_id",
        "payment_collection.payment_sessions.data",
      ],
      filters: { id: carrinho },
    })
    sessao = sessaoQueVai(data[0] as Parameters<typeof sessaoQueVai>[0])
    maiorLinha = maiorLinhaDo(data[0] as Parameters<typeof maiorLinhaDo>[0])
  } catch (e) {
    logger.error(
      `[pagamento] não consegui ler a sessão do ${carrinho} (${mensagem(e)}) — seguiu sem a porta`
    )
    return next()
  }
  if (!sessao) return next()

  const pede = quemPede(req)
  const quem = semOIp(pede.chave)
  const obs = req.scope.resolve<ObservabilidadeService>(OBSERVABILIDADE)

  let id: string
  try {
    id = await obs.abrirTentativa({
      carrinho,
      sessao: sessao.id,
      quem,
      assinada: pede.assinado,
      valor: sessao.valor,
      provedor: sessao.provedor,
      forma: sessao.forma,
    })
  } catch (e) {
    logger.error(
      `[pagamento] não consegui anotar a tentativa do ${carrinho} (${mensagem(e)}) — seguiu sem a porta`
    )
    return next()
  }

  let freioAntes = false
  if (sessao.forma === "cartao") {
    let contagem: Contagem | null = null
    try {
      contagem = await obs.contarTentativas({ carrinho, quem })
    } catch (e) {
      logger.error(
        `[cartão] não consegui contar as tentativas do ${carrinho} (${mensagem(e)}) — seguiu sem a trava`
      )
    }
    if (contagem) {
      const decisao = decidir(contagem, pede.assinado)
      if (!decisao.passa) {
        await obs
          .fecharTentativa(id, { resultado: "barrada", motivo: decisao.motivo })
          .catch((e) =>
            logger.error(`[cartão] não consegui fechar a tentativa ${id}: ${mensagem(e)}`)
          )
        logger.warn(
          `[cartão] tentativa barrada no ${carrinho} (${decisao.motivo}; ${emFrase(contagem)}` +
            `${pede.assinado ? "" : "; sem a assinatura da loja"})`
        )
        res.status(429).json({ type: "not_allowed", message: RESPOSTA_DA_BARRADA[decisao.motivo] })
        return
      }
      freioAntes = freioLigado(contagem)
    }
  }

  if (sessao.forma === "pix") {
    // Sem a contagem (o banco engasgou), a quantidade ainda vale: ela não depende dele.
    let contagem: ContagemDoPix = { daPessoa: 0, diretas: 0 }
    try {
      contagem = await obs.contarPix({ quem })
    } catch (e) {
      logger.error(
        `[pix] não consegui contar os Pix de quem pede no ${carrinho} (${mensagem(e)}) — seguiu só com a quantidade`
      )
    }
    const decisao = decidirPix(contagem, pede.assinado, maiorLinha)
    if (!decisao.passa) {
      await obs
        .fecharTentativa(id, { resultado: "barrada", motivo: decisao.motivo })
        .catch((e) => logger.error(`[pix] não consegui fechar a tentativa ${id}: ${mensagem(e)}`))
      logger.warn(
        `[pix] tentativa barrada no ${carrinho} (${decisao.motivo}; ${maiorLinha} unidades na ` +
          `maior linha, pessoa ${contagem.daPessoa}, sem assinatura ${contagem.diretas} em 40 min` +
          `${pede.assinado ? "" : "; sem a assinatura da loja"})`
      )
      res
        .status(decisao.motivo === "pix_quantidade" ? 400 : 429)
        .json({ type: "not_allowed", message: decisao.motivo })
      return
    }
  }

  const tentativa = {
    id,
    sessao: sessao.id,
    carrinho,
    forma: sessao.forma,
    provedor: sessao.provedor,
  }
  let fechada = false
  const fechar = () => {
    if (fechada) return
    fechada = true
    void depoisDaTentativa(req.scope, { ...tentativa, freioAntes })
  }
  // A resposta saiu: o `complete` terminou, e a sessão diz como.
  res.on("finish", fechar)
  next()
}

/**
 * Como a tentativa terminou, lido na sessão — e os avisos: o do parceiro que
 * caiu ou voltou, e o do freio, se foi esta recusa de cartão que o ligou.
 * Nunca lança: a resposta já foi.
 */
async function depoisDaTentativa(
  container: MedusaContainer,
  t: {
    id: string
    sessao: string
    carrinho: string
    forma: SessaoQueVai["forma"]
    provedor: string
    freioAntes: boolean
  }
) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "payment_session",
      fields: ["id", "provider_id", "data"],
      filters: { id: t.sessao },
    })
    const lida = data[0] as
      { provider_id?: string | null; data?: Record<string, unknown> | null } | undefined
    const { resultado, motivo } = resultadoDaSessao(estadoDaSessao(lida))
    const obs = container.resolve<ObservabilidadeService>(OBSERVABILIDADE)

    // A saúde dos parceiros SEM esta tentativa — é o "antes" do disjuntor.
    const antes: Terminada[] | null = await obs.terminadasDosParceiros().catch((e) => {
      logger.error(`[pagamento] não consegui ler as tentativas pro disjuntor: ${mensagem(e)}`)
      return null
    })
    await obs.fecharTentativa(t.id, { resultado, motivo })
    if (antes) {
      await conferirOParceiro(container, t.provedor, antes).catch((e) =>
        logger.error(`[pagamento] o disjuntor não conferiu o ${t.provedor}: ${mensagem(e)}`)
      )
    }

    if (t.forma !== "cartao" || resultado !== "recusada" || t.freioAntes) return
    const depois = await obs.contarTentativas({ carrinho: t.carrinho, quem: "" })
    if (!freioLigado(depois)) return
    logger.warn(
      `[cartão] FREIO LIGADO: ${depois.recusas} recusas de ${depois.terminadas} tentativas de ` +
        "cartão em 30 minutos — parece robô testando cartão. Poucas tentativas por vez até passar."
    )
    await avisarDoFreio(container, depois)
  } catch (e) {
    logger.error(`[pagamento] não consegui fechar a tentativa ${t.id}: ${mensagem(e)}`)
  }
}

function emFrase(c: Contagem): string {
  return (
    `sacola ${c.doCarrinho}, pessoa ${c.daPessoa}, sem assinatura ${c.diretas}, ` +
    `recusas ${c.recusas} de ${c.terminadas} em 30 min`
  )
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e))
