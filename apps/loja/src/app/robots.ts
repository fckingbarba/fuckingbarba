import type { MetadataRoute } from "next"
import { emProducao, site } from "@/lib/site"

/**
 * Produção indexa tudo que é público e bloqueia o que não deve rankear.
 * Preview e staging bloqueiam tudo — e o proxy ainda manda X-Robots-Tag.
 *
 * A REGRA DO ROBOTS.TXT VALE PELO COMEÇO DO ENDEREÇO: `Disallow: /conta`
 * pegava também o `/contato`, que está no sitemap — o Google fica com a regra
 * mais comprida que casa, e ela vencia o `Allow: /`. Por isso a conta vai com
 * a barra (`/conta/`, as páginas dela) e com o `$` (o `/conta` exato, que só
 * redireciona). O `conferir-links.mjs` confere o robots contra o sitemap
 * quando a loja indexa. A `/avaliar` é a página escondida da avaliação (o
 * link vem no e-mail): fora do Google, com o `noindex` dela de segunda tranca.
 * A `/sair` (o sair da lista dos e-mails de oferta) e a `/voltar` (o botão
 * dos e-mails dos fluxos) vão do mesmo jeito, e a `/criadores` (a proposta pra
 * quem grava vídeo pra loja, que vai por mensagem) também. As ofertas ocultas
 * (`/oferta/<endereço>`, um preço só pra quem tem o link) idem, com a barra:
 * é a pasta.
 */
export default function robots(): MetadataRoute.Robots {
  if (!emProducao) {
    return { rules: { userAgent: "*", disallow: "/" } }
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/checkout",
        "/conta/",
        "/conta$",
        "/carrinho",
        "/api/",
        "/busca",
        "/avaliar",
        "/sair",
        "/voltar",
        "/criadores",
        "/oferta/",
      ],
    },
    sitemap: `${site.url}/sitemap.xml`,
  }
}
