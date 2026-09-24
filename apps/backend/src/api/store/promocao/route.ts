import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/**
 * GET /store/promocao — quando a promoção que está valendo termina.
 *
 * A vitrine tem um contador de "ofertas relâmpago". Desde 24/09 ele fica
 * sempre ligado e zera à meia-noite de Brasília, por decisão da loja (o risco
 * de ser lido como urgência inventada, CDC art. 37, foi explicado e aceito).
 *
 * Esta rota evita o pior descompasso: o desconto acabar e o relógio seguir
 * correndo — daqueles que o cliente descobre no checkout. Se a promoção com
 * prazo acaba antes da meia-noite, o contador vai até ela. Por isso a data
 * sai de onde o desconto mora, a lista de preço, e não de uma constante no
 * Next.
 *
 * Devolve `{ promocao: null }` quando não há promoção com prazo (aí o
 * contador vai até a meia-noite). Promoção sem data de fim (como a de
 * lançamento) continua valendo no preço; ela só não vira prazo, porque não
 * há o que contar.
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
