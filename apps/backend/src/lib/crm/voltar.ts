import { MedusaError } from "@medusajs/framework/utils"
import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * O LINK DE VOLTAR — o botão dos e-mails dos fluxos (checkout abandonado,
 * Pix pendente) e do "refazer o pedido" do Pix vencido. Abre a página
 * `/voltar/<t>` da loja, que põe a pessoa de volta no checkout:
 *
 *   - `cart_…`: o carrinho que ficou pelo caminho, do jeito que estava;
 *   - `order_…`: o pedido do Pix que venceu — a loja monta um carrinho novo
 *     com os mesmos produtos (`POST /store/crm/voltar`).
 *
 * O `t` é `<id>.<vence>.<assinatura>`: a assinatura é um HMAC do id e da
 * hora de vencer, com uma chave só pra isto (derivada do `JWT_SECRET`, que
 * só o Medusa tem). O id do carrinho vale como senha — abre o e-mail, o
 * endereço e o CPF de quem comprou —, e por isso nunca vai cru num link.
 *
 * VENCE EM 7 DIAS: o último e-mail do fluxo sai em 48 horas, e o cupom vale
 * 2 dias depois dele. Link velho vai pra loja, sem abrir nada.
 *
 * Código puro, com testes.
 */

const TAMANHO = 22
const SETE_DIAS = 7 * 24 * 60 * 60 * 1000

/** O id do carrinho ou do pedido do Medusa: o prefixo e um ULID. */
const ID = /^(cart|order)_[0-9A-Z]{26}$/

function chave(): Buffer {
  const segredo = process.env.JWT_SECRET
  if (!segredo)
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "JWT_SECRET não configurado")
  return createHmac("sha256", segredo).update("fb-crm-voltar").digest()
}

const assinar = (id: string, vence: string) =>
  createHmac("sha256", chave()).update(`${id}.${vence}`).digest("base64url").slice(0, TAMANHO)

/** O `t` do link pra este carrinho ou pedido, valendo 7 dias a partir de `agora`. */
export function linkDeVoltar(id: string, agora = new Date()): string {
  if (!ID.test(id))
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `id fora do formato: ${id}`)
  const vence = Math.floor((agora.getTime() + SETE_DIAS) / 1000).toString(36)
  return `${id}.${vence}.${assinar(id, vence)}`
}

export type Volta = { tipo: "carrinho" | "pedido"; id: string }

/**
 * O carrinho ou o pedido do link, se é um link que esta loja fez e ainda não
 * venceu; `null` pra qualquer outra coisa.
 */
export function voltaDoLink(t: unknown, agora = new Date()): Volta | null {
  if (typeof t !== "string" || t.length > 80) return null
  const [id, vence, assinatura, ...resto] = t.split(".")
  if (!id || !vence || !assinatura || resto.length || !ID.test(id)) return null
  if (!/^[0-9a-z]{1,10}$/.test(vence)) return null
  const esperada = Buffer.from(assinar(id, vence))
  const recebida = Buffer.from(assinatura)
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null
  if (parseInt(vence, 36) * 1000 < agora.getTime()) return null
  return { tipo: id.startsWith("cart_") ? "carrinho" : "pedido", id }
}
