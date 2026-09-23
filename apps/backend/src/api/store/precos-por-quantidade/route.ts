import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * GET /store/precos-por-quantidade?variante=<id>&variante=<id> — quanto custa
 * UMA unidade de cada variação levando 1, 2 e 3.
 *
 *   { "precos": { "variant_01…": { "1": 79.9, "2": 76.45, "3": 74.3 } } }
 *
 * A API de produto do Medusa calcula o preço sempre pra quantidade 1, e a
 * página do produto precisa mostrar o de 2 e o de 3 (os cartões "2 unidades"
 * e "3 unidades"). Em vez de a loja refazer a conta do desconto, ela pergunta
 * aqui — e a resposta sai do MESMO cálculo que o carrinho usa, com a
 * quantidade no contexto. Mudou a regra (lib/precos-por-quantidade.ts), a
 * página e o carrinho mudam juntos.
 *
 * "3" vale pra 3 ou mais: a faixa não tem teto.
 */

const MAX_VARIANTES = 50
const QUANTIDADES = [1, 2, 3] as const

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const pedidas = [req.query.variante]
    .flat()
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .slice(0, MAX_VARIANTES)
  if (!pedidas.length) return res.json({ precos: {} })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const pricing = req.scope.resolve(Modules.PRICING)

  const { data: variantes } = await query.graph({
    entity: "product_variant",
    fields: ["id", "price_set.id"],
    filters: { id: pedidas },
  })

  const varianteDoConjunto = new Map<string, string>()
  for (const v of variantes) {
    if (v?.id && v.price_set?.id) varianteDoConjunto.set(v.price_set.id, v.id)
  }
  const conjuntos = [...varianteDoConjunto.keys()]

  const precos: Record<string, Record<number, number>> = {}
  if (conjuntos.length) {
    for (const quantidade of QUANTIDADES) {
      const calculados = await pricing.calculatePrices(
        { id: conjuntos },
        { context: { currency_code: "brl", quantity: quantidade } }
      )
      for (const c of calculados) {
        const variante = varianteDoConjunto.get(c.id)
        const unitario = Number(c.calculated_amount)
        if (!variante || !Number.isFinite(unitario)) continue
        ;(precos[variante] ??= {})[quantidade] = unitario
      }
    }
  }

  res.json({ precos })
}
