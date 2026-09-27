import { site } from "@/lib/site"

/**
 * A CATEGORIA PRINCIPAL DO PRODUTO (entrega 0151) — a da trilha no topo da
 * página (e do JSON-LD dela), a do catálogo do Google e da Meta e a da oferta
 * do checkout. O produto pode estar em mais de uma categoria (o kit de barba
 * em Kits e em Barba): a vitrine de cada uma mostra ele, mas a trilha tem uma
 * só.
 *
 * A principal é a que o painel marcou (`fb_categoria`, no metadata), se o
 * produto ainda está nela; senão a primeira pela ordem do menu
 * (`site.categorias`), e depois as que o menu não tem, pelo `rank`. Sem a
 * marca, é a ordem que decide: o Medusa não guarda ordem entre as categorias
 * de um produto, e a primeira da resposta muda de uma leitura pra outra.
 * Gêmea de `categoriasDoProduto`, no backend
 * (`apps/backend/src/lib/painel/produtos.ts`).
 *
 * Quem lê o produto sem o metadata (o catálogo do checkout) fica com a ordem
 * do menu.
 */

/** A marca do painel no metadata do produto (`MARCA_DA_CATEGORIA`, no backend). */
const MARCA_DA_CATEGORIA = "fb_categoria"

type CategoriaDoProduto = { id: string; handle?: string | null; rank?: number | null }

const MENU: readonly string[] = site.categorias.map((c) => c.handle)

/** Primeiro as do menu, na ordem dele; depois as outras, pelo `rank`; no empate, o id. */
function naOrdemDoMenu<C extends CategoriaDoProduto>(categorias: C[]): C[] {
  const lugar = (c: C) => {
    const noMenu = c.handle ? MENU.indexOf(c.handle) : -1
    return noMenu >= 0 ? noMenu : MENU.length + (typeof c.rank === "number" ? c.rank : 1e6)
  }
  return [...categorias].sort(
    (a, b) => lugar(a) - lugar(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

export function categoriaPrincipal<C extends CategoriaDoProduto>(produto: {
  categories?: (C | null)[] | null
  metadata?: Record<string, unknown> | null
}): C | null {
  const todas = naOrdemDoMenu((produto.categories ?? []).filter((c): c is C => Boolean(c?.id)))
  const marcada = produto.metadata?.[MARCA_DA_CATEGORIA]
  return todas.find((c) => c.id === marcada) ?? todas[0] ?? null
}
