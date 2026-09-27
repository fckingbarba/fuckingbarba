import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { promocoesParaALoja } from "../../../lib/promocoes-ativas"

/**
 * GET /store/promocoes — as promoções do painel que valem AGORA, com os
 * produtos de cada uma (`lib/promocoes.ts`):
 *
 *   { "promocoes": [{ "codigo": "PROMO-3F9A12C7", "etiqueta": "Leve 3, pague 2",
 *     "comprando": 3, "pague": 2, "produtos": ["prod_01…"], "ate": null }] }
 *
 * É o que a loja mostra: o selo no card e na página do produto, o cartão de
 * quantidade com as unidades de graça, e o recado da sacola. Quem DÁ o
 * desconto é o Medusa, no carrinho; esta lista só conta onde ele vai dar.
 *
 * Não confundir com `GET /store/promocao` (no singular), o prazo das ofertas
 * relâmpago da home.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({ promocoes: await promocoesParaALoja(req.scope) })
}
