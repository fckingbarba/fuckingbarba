import { MedusaError } from "@medusajs/framework/utils"
import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * O LINK DA AVALIAÇÃO — o que abre a página `/avaliar` da loja pra um
 * pedido, sem conta e sem senha: `?p=<pedido>.<assinatura>`.
 *
 * A assinatura é um HMAC do id do pedido, com uma chave só pra isto (derivada
 * do `JWT_SECRET`, que só o Medusa tem): o link não vale como nada que o
 * `JWT_SECRET` assine, e ninguém faz o link de outro pedido trocando o id —
 * o número do pedido é sequencial, o id não se adivinha, e mesmo assim os
 * dois sozinhos não abrem nada.
 *
 * NÃO VENCE. O e-mail pode ser aberto uma semana depois, e o que o link
 * abre é pouco: o número do pedido, o primeiro nome e os produtos, pra dar
 * nota a cada um uma vez só. Quem decide se o pedido ainda aceita avaliação
 * (pago, não cancelado) é a leitura do pedido, a cada vez.
 *
 * O link sai de dois e-mails, e só deles: o "o que você achou?" (`pedir.ts`)
 * e o que a página sem o link manda pro e-mail da compra, quando a pessoa
 * escreve o número do pedido e esse e-mail (`encontrar.ts`). Nunca numa
 * resposta da API — quem tem o link é quem tem a caixa de entrada.
 */

/** 22 caracteres de base64url = 132 bits: longe de qualquer tentativa às cegas. */
const TAMANHO = 22

function chave(): Buffer {
  const segredo = process.env.JWT_SECRET
  if (!segredo)
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "JWT_SECRET não configurado")
  // Uma chave só pra isto: o link não vale como nada que o JWT_SECRET assine.
  return createHmac("sha256", segredo).update("fb-avaliacao-do-pedido").digest()
}

const assinar = (pedidoId: string) =>
  createHmac("sha256", chave()).update(pedidoId).digest("base64url").slice(0, TAMANHO)

/** O id de pedido do Medusa: `order_` e um ULID. */
const ID_DO_PEDIDO = /^order_[0-9A-Z]{26}$/

/** O `p` do link pra este pedido. */
export function linkDoPedido(pedidoId: string): string {
  if (!ID_DO_PEDIDO.test(pedidoId))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `id de pedido fora do formato: ${pedidoId}`
    )
  return `${pedidoId}.${assinar(pedidoId)}`
}

/** O id do pedido, se o `p` é um link que esta loja fez; `null` pra qualquer outra coisa. */
export function pedidoDoLink(p: unknown): string | null {
  if (typeof p !== "string" || p.length > 80) return null
  const [pedidoId, assinatura, ...resto] = p.split(".")
  if (!pedidoId || !assinatura || resto.length || !ID_DO_PEDIDO.test(pedidoId)) return null
  const esperada = Buffer.from(assinar(pedidoId))
  const recebida = Buffer.from(assinatura)
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null
  return pedidoId
}
