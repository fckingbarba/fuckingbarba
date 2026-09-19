/**
 * Constantes do site. Tudo que é URL pública ou identidade mora aqui —
 * o resto (preço, frete grátis, estoque) vem do Medusa, nunca de constante.
 */
export const site = {
  nome: "FuckingBarba",
  descricao:
    "Cosméticos masculinos pra barba e cabelo: óleo, balm, shampoo, spray matte e kits. Feito pra rotina de verdade.",
  /** Domínio final. Em preview/staging a Vercel injeta a própria URL. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  /** Loja atual na Nuvemshop — some na fase 6 (virada). */
  lojaAtualUrl: process.env.NEXT_PUBLIC_LOJA_ATUAL_URL,
  instagram: "https://www.instagram.com/fuckingbarba",
  /** Categorias de topo = URLs de primeiro nível. Mesmos handles do Medusa. */
  categorias: [
    { handle: "barba", nome: "Barba" },
    { handle: "cabelo", nome: "Cabelo" },
    { handle: "kits", nome: "Kits" },
  ] as const,
} as const

/** Produção de verdade = domínio final. Preview e staging nunca indexam. */
export const emProducao =
  process.env.VERCEL_ENV === "production" || process.env.SITE_INDEXAVEL === "true"

export type HandleCategoria = (typeof site.categorias)[number]["handle"]

export function ehCategoria(handle: string): handle is HandleCategoria {
  return site.categorias.some((c) => c.handle === handle)
}
