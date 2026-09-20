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
    /*
      `/produtos` entra em 0.9, acima das categorias: é a única página que
      lista a loja inteira, e é o destino do "Ver todos os produtos" da home.
      As URLs com `?ordem=` ficam DE FORA de propósito — são a mesma lista
      embaralhada, e cada página delas já aponta a canônica pra cá.
    */
    {
      url: `${site.url}/produtos`,
      changeFrequency: "daily" as const,
      priority: 0.9,
    },
    /*
      As institucionais entram com prioridade baixa mas ENTRAM: o Google usa
      a existência de termos, privacidade e política de devolução como sinal
      de loja legítima, e uma loja nova de marca desconhecida precisa desse
      sinal mais do que uma loja grande.
    */
    ...(["/trocas", "/privacidade", "/termos"] as const).map((caminho) => ({
      url: `${site.url}${caminho}`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
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
