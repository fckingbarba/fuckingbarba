import type { MetadataRoute } from "next"
import { emProducao, site } from "@/lib/site"

/**
 * Produção indexa tudo que é público e bloqueia o que não deve rankear.
 * Preview e staging bloqueiam tudo — e o proxy ainda manda X-Robots-Tag.
 */
export default function robots(): MetadataRoute.Robots {
  if (!emProducao) {
    return { rules: { userAgent: "*", disallow: "/" } }
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/checkout", "/conta", "/carrinho", "/api/", "/busca"],
    },
    sitemap: `${site.url}/sitemap.xml`,
  }
}
