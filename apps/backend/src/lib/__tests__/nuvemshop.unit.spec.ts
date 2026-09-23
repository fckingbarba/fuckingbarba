import type { ProdutoDoSite } from "../erp/catalogo"
import {
  categoriaCorrespondente,
  chaveDaFoto,
  lerPaginaDoProduto,
  planejarNuvemshop,
  type ProdutoDaNuvemshop,
  slugsDoMapa,
} from "../nuvemshop"

const CDN = "//acdn-us.mitiendanube.com/stores/006/689/600/products"

/** Uma página de produto no formato da Nuvemshop, só com o que importa. */
const PAGINA = `
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"WebPage","name":"Pasta Modeladora Efeito Brilho 80g — FuckingBarba",
 "breadcrumb":{"@type":"BreadcrumbList","itemListElement":[
   {"@type":"ListItem","position":1,"name":"Início","item":"https://www.fuckingbarba.com.br"},
   {"@type":"ListItem","position":2,"name":"Para o Cabelo","item":"https://www.fuckingbarba.com.br/para-o-cabelo/"},
   {"@type":"ListItem","position":3,"name":"Pasta","item":"https://www.fuckingbarba.com.br/produtos/pasta-modeladora-brilho-80g-fucking-barba/"}]},
 "mainEntity":{"@type":"Product","name":"Pasta Modeladora Efeito Brilho 80g — FuckingBarba","sku":"FBPBR01"}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"Product","name":"Spray (relacionado)","sku":"FBMSP01"}
</script>
</head><body>
<div class="js-product-container" data-variants="[{&quot;sku&quot;:&quot;FBPBR01&quot;,&quot;price_short&quot;:&quot;R$59,90&quot;}]">
  <div class="js-product-slide" data-image="1" data-image-position="0">
    <a href="${CDN}/brilho-1-1024-1024.webp" data-fancybox="product-gallery" class="js-product-slide-link"><img src="${CDN}/brilho-1-480-0.webp"></a>
  </div>
  <div class="js-product-slide" data-image="2" data-image-position="1">
    <a class="js-product-slide-link" data-fancybox='product-gallery' href="${CDN}/brilho-2-1024-1024.webp"><img></a>
  </div>
  <a href="${CDN}/brilho-1-1024-1024.webp" data-fancybox="product-gallery"><img></a>
  <a id="trigger-video-modal-57849" href="#product-video-modal-57849" data-fancybox="product-gallery">vídeo</a>
</div>
<section class="relacionados">
  <a href="/produtos/spray/"><img src="${CDN}/spray-1-480-0.webp"></a>
  <a href="${CDN}/spray-1-1024-1024.webp" data-fancybox="outra-galeria">zoom</a>
</section>
</body></html>`

const produtoDoSite = (
  p: Partial<ProdutoDoSite> & { id: string; handle: string; skus: string[] }
) => {
  const { skus, ...resto } = p
  return {
    titulo: p.handle,
    status: "published",
    descricao: null,
    fotos: ["https://loja/foto-do-bling.jpg"],
    categorias: [],
    canais: [],
    perfil: null,
    metadata: {},
    esperando: 0,
    variacoes: skus.map((sku, n) => ({
      id: `var_${p.id}_${n}`,
      sku,
      conjunto: null,
      pesoGramas: null,
      medidas: null,
    })),
    ...resto,
  } satisfies ProdutoDoSite
}

const daNuvemshop = (p: Partial<ProdutoDaNuvemshop> & { slug: string; skus: string[] }) => ({
  nome: p.slug,
  fotos: [`https:${CDN}/${p.slug}-1-1024-1024.webp`, `https:${CDN}/${p.slug}-2-1024-1024.webp`],
  categoria: { nome: "Kits", slug: "kits-para-barba" },
  ...p,
})

const CATEGORIAS = [
  { id: "cat_barba", handle: "barba", nome: "Barba" },
  { id: "cat_cabelo", handle: "cabelo", nome: "Cabelo" },
  { id: "cat_kits", handle: "kits", nome: "Kits" },
]

describe("a leitura da loja da Nuvemshop", () => {
  it("do mapa do site, só os produtos, na ordem e sem repetir", () => {
    const xml = `<urlset>
      <url><loc>https://www.fuckingbarba.com.br/</loc></url>
      <url><loc>https://www.fuckingbarba.com.br/produtos/</loc></url>
      <url><loc> https://www.fuckingbarba.com.br/produtos/shampoo-para-barba/ </loc></url>
      <url><loc>https://www.fuckingbarba.com.br/para-o-cabelo/</loc></url>
      <url><loc>https://fuckingbarba.com.br/produtos/balm-para-barba</loc></url>
      <url><loc>https://www.fuckingbarba.com.br/produtos/shampoo-para-barba/</loc></url>
    </urlset>`
    expect(slugsDoMapa(xml)).toEqual(["shampoo-para-barba", "balm-para-barba"])
  })

  it("a página: o nome e o SKU do produto (não do relacionado), a categoria e a galeria", () => {
    expect(
      lerPaginaDoProduto(
        PAGINA,
        "https://www.fuckingbarba.com.br/produtos/pasta-modeladora-brilho-80g-fucking-barba/"
      )
    ).toEqual({
      nome: "Pasta Modeladora Efeito Brilho 80g — FuckingBarba",
      skus: ["FBPBR01"],
      // na ordem, sem repetir, em https; sem o vídeo e sem a foto do relacionado
      fotos: [`https:${CDN}/brilho-1-1024-1024.webp`, `https:${CDN}/brilho-2-1024-1024.webp`],
      categoria: { nome: "Para o Cabelo", slug: "para-o-cabelo" },
    })
  })

  it("o link de foto sem protocolo segue o da página (a loja falsa do conferidor é http)", () => {
    const lido = lerPaginaDoProduto(PAGINA, "http://127.0.0.1:4350/produtos/pasta/")
    expect(lido?.fotos[0]).toBe(`http:${CDN}/brilho-1-1024-1024.webp`)
  })

  it("página que não é de produto: nada", () => {
    expect(
      lerPaginaDoProduto("<html><body>Página não encontrada</body></html>", "https://x/")
    ).toBeNull()
  })

  it("a chave da foto é o caminho no CDN: http ou https, a mesma", () => {
    expect(chaveDaFoto(`https:${CDN}/a-1024-1024.webp`)).toBe(
      chaveDaFoto(`http:${CDN}/a-1024-1024.webp`)
    )
  })

  it("a categoria de lá → a daqui; kit antes de barba (lá é kits-para-barba)", () => {
    const de = (slug: string, nome = "") =>
      categoriaCorrespondente({ slug, nome }, CATEGORIAS)?.handle
    expect(de("kits-para-barba", "Kits para Barba")).toBe("kits")
    expect(de("para-o-cabelo", "Para o Cabelo")).toBe("cabelo")
    expect(de("produtos-para-a-barba", "Produtos para a Barba")).toBe("barba")
    expect(de("presentes", "Presentes")).toBeUndefined()
    expect(categoriaCorrespondente(null, CATEGORIAS)).toBeNull()
    expect(categoriaCorrespondente({ slug: "para-o-cabelo", nome: "" }, [])).toBeNull()
  })
})

describe("o plano: o que muda em cada produto daqui", () => {
  it("casa pelo SKU; troca o endereço e as fotos; a categoria só entra no que está sem", () => {
    const [kit, oleo] = planejarNuvemshop(
      [
        daNuvemshop({ slug: "kit-2-fator-de-crescimento-para-barba", skus: ["FBKIT05"] }),
        daNuvemshop({ slug: "oleo-para-barba", skus: ["FBOL01"] }),
      ],
      [
        produtoDoSite({ id: "p1", handle: "kit-2x-fator-de-crescimento", skus: ["FBKIT05"] }),
        produtoDoSite({
          id: "p2",
          handle: "oleo-para-barba",
          skus: ["FBOL01"],
          categorias: [{ id: "cat_barba", nome: "Barba" }],
        }),
      ],
      CATEGORIAS
    )
    expect(kit).toMatchObject({
      produto: { id: "p1" },
      endereco: {
        de: "kit-2x-fator-de-crescimento",
        para: "kit-2-fator-de-crescimento-para-barba",
      },
      trocaFotos: true,
      categoria: { handle: "kits" },
      bloqueio: null,
      pronto: false,
    })
    // O óleo já tem o endereço e a categoria: só as fotos mudam.
    expect(oleo).toMatchObject({ endereco: null, trocaFotos: true, categoria: null, pronto: false })
  })

  it("com as mesmas fotos de lá já copiadas, e o mesmo endereço: pronto", () => {
    const n = daNuvemshop({ slug: "oleo-para-barba", skus: ["FBOL01"] })
    const [i] = planejarNuvemshop(
      [n],
      [
        produtoDoSite({
          id: "p2",
          handle: "oleo-para-barba",
          skus: ["FBOL01"],
          categorias: [{ id: "cat_barba", nome: "Barba" }],
          fotos: ["https://loja/1.webp", "https://loja/2.webp"],
          metadata: {
            fb_fotos: {
              origem: "nuvemshop",
              fotos: n.fotos.map((f, k) => ({
                chave: chaveDaFoto(f),
                url: `https://loja/${k + 1}.webp`,
              })),
            },
          },
        }),
      ],
      CATEGORIAS
    )
    expect(i).toMatchObject({ endereco: null, trocaFotos: false, categoria: null, pronto: true })
  })

  it("sem produto com o código: não dá; código em dois produtos daqui: não dá", () => {
    const [sem, dois] = planejarNuvemshop(
      [
        daNuvemshop({ slug: "kit-6", skus: ["FBKIT07"] }),
        daNuvemshop({ slug: "pomada", skus: ["POM-50", "POM-100"] }),
      ],
      [
        produtoDoSite({ id: "a", handle: "pomada-50", skus: ["POM-50"] }),
        produtoDoSite({ id: "b", handle: "pomada-100", skus: ["POM-100"] }),
      ],
      CATEGORIAS
    )
    expect(sem!.bloqueio).toBe("nenhum produto do site com o código FBKIT07")
    expect(dois!.bloqueio).toMatch(/mais de um produto do site/)
  })

  it("o endereço de lá com um rascunho que a Nuvemshop não tem: ele sai do caminho", () => {
    const [i] = planejarNuvemshop(
      [daNuvemshop({ slug: "kit-2-fator-de-crescimento-para-barba", skus: ["FBKIT05"] })],
      [
        produtoDoSite({ id: "novo", handle: "kit-2x-fator", skus: ["FBKIT05"] }),
        // o kit antigo, aposentado, com o código que o Bling nunca teve
        produtoDoSite({
          id: "velho",
          handle: "kit-2-fator-de-crescimento-para-barba",
          skus: ["FBFCB01-K2"],
          status: "draft",
          titulo: "Kit 2 frascos",
        }),
        produtoDoSite({
          id: "outro",
          handle: "kit-2-fator-de-crescimento-para-barba-antigo",
          skus: ["X"],
          status: "draft",
        }),
      ],
      CATEGORIAS
    )
    expect(i).toMatchObject({
      bloqueio: null,
      ocupante: {
        id: "velho",
        handle: "kit-2-fator-de-crescimento-para-barba",
        novoHandle: "kit-2-fator-de-crescimento-para-barba-antigo-2",
      },
    })
  })

  it("o endereço de lá com um produto publicado, ou com um que a Nuvemshop também tem: não mexe", () => {
    const [publicado] = planejarNuvemshop(
      [daNuvemshop({ slug: "kit-2-fator-de-crescimento-para-barba", skus: ["FBKIT05"] })],
      [
        produtoDoSite({ id: "k2", handle: "kit-2x", skus: ["FBKIT05"] }),
        produtoDoSite({
          id: "velho",
          handle: "kit-2-fator-de-crescimento-para-barba",
          skus: ["FBFCB01-K2"],
          titulo: "Kit 2 frascos",
        }),
      ],
      CATEGORIAS
    )
    expect(publicado!.bloqueio).toBe(
      "o endereço /produtos/kit-2-fator-de-crescimento-para-barba é de “Kit 2 frascos”, que está " +
        "publicado — resolva no admin e rode de novo"
    )

    // O rascunho que ocupa o endereço é outro produto da Nuvemshop: ele vai
    // pro endereço dele nesta mesma troca, e este entra na próxima rodada.
    const [a, b] = planejarNuvemshop(
      [daNuvemshop({ slug: "a", skus: ["SA"] }), daNuvemshop({ slug: "b", skus: ["SB"] })],
      [
        produtoDoSite({ id: "p1", handle: "x", skus: ["SA"] }),
        produtoDoSite({ id: "p2", handle: "a", skus: ["SB"], status: "draft", titulo: "B" }),
      ],
      CATEGORIAS
    )
    expect(a!.bloqueio).toBe("o endereço /produtos/a é de “B” — resolva no admin e rode de novo")
    expect(b).toMatchObject({ bloqueio: null, endereco: { de: "a", para: "b" } })
  })
})
