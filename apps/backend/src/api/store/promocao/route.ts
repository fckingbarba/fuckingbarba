import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/**
 * GET /store/promocao — quando a promoção que está valendo termina.
 *
 * Existe por um motivo específico: a vitrine tem um contador de "ofertas
 * relâmpago", e contador precisa de uma data. A tentação é escrever a data no
 * código da loja. O problema disso aparece no primeiro descompasso — o relógio
 * zera e o desconto continua no carrinho, ou o desconto acaba e o relógio
 * segue correndo. As duas versões são propaganda enganosa, e a segunda é
 * daquelas que o cliente descobre no checkout.
 *
 * Então a data sai de onde o desconto mora: a lista de preço. Quem manda no
 * que a loja anuncia é o admin do Medusa, não uma constante no Next.
 *
 * Devolve `{ termina_em: null }` quando não há promoção com prazo — e aí a
 * vitrine simplesmente não mostra a seção. Promoção sem data de fim (como a
 * de lançamento) continua valendo no preço; ela só não vira contagem
 * regressiva, porque não há o que contar.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const pricing = req.scope.resolve(Modules.PRICING)

  const listas = await pricing.listPriceLists(
    { status: ["active"] },
    { select: ["id", "title", "type", "starts_at", "ends_at"] }
  )

  const agora = Date.now()
  const comPrazo = listas
    .filter((l) => l.type === "sale" && l.ends_at)
    .map((l) => ({ ...l, fim: new Date(l.ends_at as string).getTime() }))
    .filter((l) => l.fim > agora)
    // Se houver mais de uma valendo, manda a que acaba primeiro: é a que
    // cria urgência de verdade e a primeira a mudar o preço de alguém.
    .sort((a, b) => a.fim - b.fim)

  const promocao = comPrazo[0]

  res.json({
    promocao: promocao
      ? { titulo: promocao.title, termina_em: new Date(promocao.fim).toISOString() }
      : null,
  })
}
