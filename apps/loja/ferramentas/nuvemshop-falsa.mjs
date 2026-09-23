import { createServer } from "node:http"

/**
 * UMA LOJA DA NUVEMSHOP DE MENTIRA, pro `conferir-erp.mjs` (a parte dos
 * endereços e das fotos, `apps/backend/src/lib/nuvemshop.ts`).
 *
 * Serve o que a loja nova lê da antiga, no formato da de verdade (conferido
 * em fuckingbarba.com.br em 23/09):
 *   - `/sitemap.xml`, com os produtos em `/produtos/<slug>/`;
 *   - a página de cada produto: o JSON-LD `WebPage` com o `mainEntity` (nome
 *     e SKU) e a trilha (a categoria na posição 2), o `data-variants`, a
 *     galeria em links `data-fancybox="product-gallery"` sem protocolo, o
 *     link do vídeo (que também é da galeria) e fotos de um produto
 *     relacionado (que não são);
 *   - as fotos, em `/cdn/<nome>-1024-1024.webp`.
 *
 * `painel.produto({ slug, nome, skus, fotos, categoria })` cadastra;
 * `painel.fotosServidas` conta quantas fotos a loja nova baixou.
 *
 * Porta: `PORTA_NUVEMSHOP_FALSA` (padrão 4350).
 */

export const PORTA_PADRAO = Number(process.env.PORTA_NUVEMSHOP_FALSA || 4350)

/* Um webp de 1×1 de verdade (a loja nova confere o tipo pelos bytes). */
const WEBP = Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64")

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

export async function subirNuvemshopFalsa({ porta = PORTA_PADRAO } = {}) {
  const painel = {
    /** slug → { slug, nome, skus, fotos (quantas), categoria: { nome, slug } } */
    produtos: new Map(),
    fotosServidas: 0,
    paginasServidas: 0,
  }
  painel.produto = ({ slug, nome, skus, fotos = 2, categoria = null }) => {
    painel.produtos.set(slug, { slug, nome, skus, fotos, categoria })
    return painel.produtos.get(slug)
  }
  const origem = () => `http://127.0.0.1:${porta}`
  /** O endereço de cada foto do produto, como a galeria mostra: sem protocolo. */
  painel.fotosDe = (slug) =>
    Array.from(
      { length: painel.produtos.get(slug)?.fotos ?? 0 },
      (_, n) => `//127.0.0.1:${porta}/cdn/${slug}-${n + 1}-1024-1024.webp`
    )

  const paginaDe = (p) => {
    const trilha = [
      { "@type": "ListItem", position: 1, name: "Início", item: origem() },
      ...(p.categoria
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: p.categoria.nome,
              item: `${origem()}/${p.categoria.slug}/`,
            },
          ]
        : []),
      {
        "@type": "ListItem",
        position: p.categoria ? 3 : 2,
        name: p.nome,
        item: `${origem()}/produtos/${p.slug}/`,
      },
    ]
    const pagina = {
      "@context": "https://schema.org/",
      "@type": "WebPage",
      name: p.nome,
      breadcrumb: { "@type": "BreadcrumbList", itemListElement: trilha },
      mainEntity: { "@type": "Product", name: p.nome, sku: p.skus[0] },
    }
    const relacionado = {
      "@context": "https://schema.org/",
      "@type": "Product",
      name: "Relacionado",
      sku: "OUTRO-SKU",
    }
    const variantes = p.skus.map((sku) => ({ sku, price_short: "R$10,00" }))
    const galeria = painel
      .fotosDe(p.slug)
      .map(
        (u, n) =>
          `<div class="js-product-slide" data-image="${n + 1}" data-image-position="${n}">` +
          `<a href="${u}" data-fancybox="product-gallery" class="js-product-slide-link">` +
          `<img src="${u.replace("-1024-1024", "-480-0")}"></a></div>`
      )
      .join("\n")
    return `<!doctype html><html><head><title>${esc(p.nome)}</title>
<script type="application/ld+json">${JSON.stringify(pagina)}</script>
<script type="application/ld+json">${JSON.stringify(relacionado)}</script>
</head><body>
<div class="js-product-container" data-variants="${esc(JSON.stringify(variantes))}">
${galeria}
<a id="trigger-video-modal-1" href="#product-video-modal-1" data-fancybox="product-gallery">vídeo</a>
</div>
<section><a href="${origem()}/cdn/relacionado-1-1024-1024.webp" data-fancybox="outra">zoom</a>
<img src="//127.0.0.1:${porta}/cdn/relacionado-1-480-0.webp"></section>
</body></html>`
  }

  const servidor = createServer((req, res) => {
    const url = new URL(req.url, origem())
    if (url.pathname === "/sitemap.xml") {
      const locs = [
        `${origem()}/`,
        `${origem()}/produtos/`,
        ...[...painel.produtos.keys()].map((s) => `${origem()}/produtos/${s}/`),
      ]
      res.writeHead(200, { "content-type": "application/xml" })
      return res.end(
        `<?xml version="1.0" encoding="UTF-8"?><urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join("")}</urlset>`
      )
    }
    const produto = url.pathname.match(/^\/produtos\/([a-z0-9-]+)\/?$/)
    if (produto && painel.produtos.has(produto[1])) {
      painel.paginasServidas++
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      return res.end(paginaDe(painel.produtos.get(produto[1])))
    }
    if (url.pathname.startsWith("/cdn/") && url.pathname.endsWith("-1024-1024.webp")) {
      painel.fotosServidas++
      res.writeHead(200, { "content-type": "image/webp" })
      return res.end(WEBP)
    }
    res.writeHead(404, { "content-type": "text/html" })
    res.end("<html>não existe</html>")
  })

  await new Promise((r) => servidor.listen(porta, "127.0.0.1", r))
  painel.fechar = () => servidor.close()
  painel.porta = porta
  painel.url = origem()
  return painel
}
