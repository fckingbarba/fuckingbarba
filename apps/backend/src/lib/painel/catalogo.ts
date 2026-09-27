import type { Catalogo } from "../cupons"

/**
 * O que o "Aplicar a" dos formulários do painel escolhe (o do cupom e o da
 * promoção): as categorias e os produtos da loja — os rascunhos também, o
 * cupom e a promoção podem nascer antes de o produto ir pro ar —, em ordem
 * de nome.
 */
export async function catalogoDaLoja(query: {
  graph: (a: object) => Promise<{ data: unknown[] }>
}): Promise<Catalogo> {
  const [{ data: categorias }, { data: produtos }] = await Promise.all([
    query.graph({ entity: "product_category", fields: ["id", "name"] }),
    query.graph({ entity: "product", fields: ["id", "title"] }),
  ])
  const porNome = (a: { nome: string }, b: { nome: string }) =>
    a.nome.localeCompare(b.nome, "pt-BR")
  return {
    categorias: (categorias as { id: string; name?: string | null }[])
      .map((c) => ({ id: c.id, nome: c.name ?? c.id }))
      .sort(porNome),
    produtos: (produtos as { id: string; title?: string | null }[])
      .map((p) => ({ id: p.id, nome: p.title ?? p.id }))
      .sort(porNome),
  }
}
