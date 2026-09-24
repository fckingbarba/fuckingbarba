import type { MetadataRoute } from "next"

/** O painel não entra em busca nenhuma. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } }
}
