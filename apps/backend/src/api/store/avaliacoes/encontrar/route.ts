import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { mandarLinkDaAvaliacao } from "../../../../lib/avaliacoes/encontrar"
import { numeroDoPedido } from "../../../../lib/avaliacoes/regras"
import { criarLimite } from "../../../../lib/limite"
import { quemPede } from "../../../../lib/quem-pede"
import { normalizarEmail } from "../../../../modules/codigo/regras"

/**
 * POST /store/avaliacoes/encontrar — `{ numero, email }`: a página
 * `/avaliar` aberta SEM o link do e-mail (a pessoa apagou o e-mail, ou a
 * loja mandou a página por outro caminho). O número do pedido ("#1234",
 * "1234") e o e-mail da compra têm que bater; aí o link vai PRO E-MAIL DA
 * COMPRA (`lib/avaliacoes/encontrar.ts`) — nunca na resposta: quem sabe o
 * número e o e-mail de alguém não avalia no nome dele sem a caixa de entrada.
 *
 * A RESPOSTA É SEMPRE A MESMA, e sai antes de a loja procurar: nem ela nem o
 * tempo dela dizem se o número existe, se o e-mail é o do pedido, ou se o
 * pedido aceita avaliação.
 *
 * OS LIMITES contam TODA tentativa: por quem pede, 10 por hora com a
 * assinatura da loja e 30 sem; da loja toda, 300 por hora. E o e-mail, no
 * máximo um por pedido a cada 10 minutos (3 por dia).
 *
 * RESPOSTAS: 200 `{ mandado: true }`; 400 `campo_invalido` com o `campo`
 * (`numero` ou `email`); 429 `limite`.
 */

const HORA = 60 * 60 * 1000
const POR_IP_ASSINADO = { limite: 10, ms: HORA }
const POR_IP_SEM_ASSINATURA = { limite: 30, ms: HORA }
const DA_LOJA = { limite: 300, ms: HORA }
const limite = criarLimite()

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const corpo = (req.body ?? {}) as { numero?: unknown; email?: unknown }
  const numero = numeroDoPedido(corpo.numero)
  if (!numero) {
    res.status(400).json({ message: "campo_invalido", campo: "numero" })
    return
  }
  const email = normalizarEmail(corpo.email)
  if (!email) {
    res.status(400).json({ message: "campo_invalido", campo: "email" })
    return
  }

  const quem = quemPede(req)
  const porIp = quem.assinado ? POR_IP_ASSINADO : POR_IP_SEM_ASSINATURA
  if (!limite.cabe(quem.chave, porIp) || !limite.cabe("loja", DA_LOJA)) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(quem.chave, porIp)
  limite.contar("loja", DA_LOJA)

  res.json({ mandado: true })

  // Depois da resposta: o que a loja acha (ou não) fica no log, não no tempo dela.
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  void mandarLinkDaAvaliacao(req.scope, numero, email).catch((e: unknown) =>
    logger.warn(
      `[avaliacoes] o link pedido na página não saiu: ${e instanceof Error ? e.message : String(e)}`
    )
  )
}
