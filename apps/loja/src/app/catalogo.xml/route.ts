import { feedDeProdutos } from "@/lib/feed-de-produtos"
import { listarProdutos } from "@/lib/medusa"

/**
 * `/catalogo.xml` — o catálogo pro Google Merchant Center e pra Meta
 * (`lib/feed-de-produtos.ts`).
 *
 * Sai pronto no build e fica guardado como as páginas: a leitura do Medusa é
 * a mesma da vitrine e do sitemap (`listarProdutos`, com a marca `produtos`),
 * e quando um produto, um preço ou o estoque mudam, o Medusa derruba a marca
 * pelo `/api/revalidar` e a próxima leitura já sai nova. O Google e a Meta
 * buscam de tempos em tempos (a agenda é configurada lá).
 *
 * O proxy não passa por aqui (o `matcher` pula `.xml`), como no sitemap.
 */
export async function GET() {
  const produtos = await listarProdutos({ limite: 500 })
  return new Response(feedDeProdutos(produtos), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  })
}
