import type { MetadataRoute } from "next"
import { listarCategorias, listarProdutos } from "@/lib/medusa"
import { site } from "@/lib/site"

/**
 * Sitemap gerado do Medusa: home, categorias e produtos, com lastmod real.
 * Blog e institucionais entram na fase 3 junto com as páginas.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categorias, produtos] = await Promise.all([
    listarCategorias(),
    listarProdutos({ limite: 500 }),
  ])

  return [
    { url: site.url, changeFrequency: "daily", priority: 1 },
    ...categorias.map((c) => ({
      url: `${site.url}/${c.handle}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...produtos.map((p) => ({
      url: `${site.url}/produtos/${p.handle}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ]
}
