import "server-only"
import { createHmac } from "node:crypto"

/**
 * O CÓDIGO DA OFERTA DO CHECKOUT — o gêmeo de `apps/backend/src/lib/bumps.ts`.
 *
 * Cada produto tem a própria promoção de 10% no Medusa, e o código dela é
 * "BUMP-" + o handle + oito letras de assinatura. A assinatura é do
 * `REVALIDAR_SEGREDO`, que só a loja e o Medusa conhecem: é o que impede
 * alguém de montar os códigos na mão e aplicar direto na API, um por produto.
 * O porquê completo está no arquivo do backend.
 *
 * A CONTA TEM QUE SER A MESMA DOS DOIS LADOS. O teste do backend
 * (`bumps.unit.spec.ts`) guarda um resultado conferido com o openssl, e o
 * conferidor do checkout aplica o código calculado aqui num carrinho de
 * verdade — se as contas divergirem, o desconto não pega e ele acusa.
 */

const PREFIXO = "BUMP-"

/**
 * "BUMP-OLEO-PARA-BARBA-3F9A12C7" → "oleo-para-barba". O BUMP-OLEO antigo não
 * tem assinatura, e fica de fora.
 */
const FORMATO = /^BUMP-([A-Z0-9]+(?:-[A-Z0-9]+)*)-[0-9A-F]{8}$/

/** O código da promoção de um produto, ou `null` sem o segredo (aí não há oferta). */
export function codigoDoBump(handle: string, produtoId: string): string | null {
  const segredo = process.env.REVALIDAR_SEGREDO
  if (!segredo) return null
  const assinatura = createHmac("sha256", segredo)
    .update(`bump:${handle}:${produtoId}`)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase()
  return `${PREFIXO}${handle.toUpperCase()}-${assinatura}`
}

/**
 * Todo código que começa com "BUMP-" é da caixinha, e não do campo de cupom
 * — inclusive o antigo, pra ele não aparecer na lista de cupons de quem
 * estava no meio do checkout quando a oferta mudou.
 */
export const ehCodigoDeBump = (codigo: string) => codigo.startsWith(PREFIXO)

/** O handle do produto de um código de oferta, ou `null`. */
export function handleDoBump(codigo: string): string | null {
  return FORMATO.exec(codigo)?.[1]?.toLowerCase() ?? null
}
