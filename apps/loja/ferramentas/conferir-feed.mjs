/**
 * CONFERIDOR DO CATÁLOGO PROS ANÚNCIOS — `/catalogo.xml`, o arquivo que o
 * Google Merchant Center e a Meta leem (`src/lib/feed-de-produtos.ts`).
 *
 * Lê o XML da loja num navegador de verdade (o `DOMParser` diz se ele é XML
 * válido, como o Google e a Meta vão dizer) e compara CADA linha com o que a
 * API do Medusa responde — nunca com outra conta feita aqui dentro.
 *
 *   node ferramentas/conferir-feed.mjs [url-da-loja]
 *
 * Variáveis: LOJA (padrão http://localhost:3000), MEDUSA_BACKEND_URL,
 * NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY e CHROMIUM. Só lê: não muda nada no
 * Medusa.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • um produto publicado que não entra no catálogo, ou um kit de         │
 * │   quantidade aposentado que entra;                                     │
 * │ • o id da linha diferente do `variant_…` que o pixel e o GA4 mandam — │
 * │   o remarketing dinâmico não acharia o produto;                        │
 * │ • o preço (e o "de/por" da promoção) diferente do Medusa — o Google    │
 * │   reprova o item quando a página diz outro preço;                      │
 * │ • o esgotado dito "em estoque", ou o contrário;                        │
 * │ • foto a mais (as artes com antes e depois derrubam conta de anúncio), │
 * │   foto em WebP (a Meta recusa), link que não abre, descrição com HTML, │
 * │   XML quebrado.                                                        │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { createHash } from "node:crypto"
import { chromium } from "playwright"
import { site } from "../src/lib/site.ts"

const LOJA = (process.argv[2] ?? process.env.LOJA ?? "http://localhost:3000").replace(/\/$/, "")
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
const CROMO = process.env.CHROMIUM || undefined

let testes = 0
let falhas = 0
const ok = (cond, texto, det = "") => {
  testes++
  if (cond) console.log(`  ✓ ${texto}`)
  else {
    falhas++
    console.log(`  ✗ ${texto}${det ? ` — ${det}` : ""}`)
  }
}
const titulo = (t) => console.log(`\n${t}`)
const cabecalho = { "x-publishable-api-key": CHAVE }

/** O catálogo como a API o vê: publicados, sem os kits de quantidade, com preço e estoque. */
async function daApi() {
  const reg = await fetch(`${MEDUSA}/store/regions`, { headers: cabecalho })
  if (!reg.ok) throw new Error(`Medusa respondeu ${reg.status} nas regiões — confira a CHAVE`)
  const { regions } = await reg.json()
  const regiao = regions.find((r) => r.currency_code === "brl") ?? regions[0]
  const r = await fetch(
    `${MEDUSA}/store/products?limit=500&region_id=${regiao.id}` +
      "&fields=id,handle,title,description,thumbnail,metadata,*images,*categories," +
      "*variants,*variants.calculated_price,+variants.inventory_quantity,+variants.manage_inventory",
    { headers: cabecalho }
  )
  if (!r.ok) throw new Error(`Medusa respondeu ${r.status} nos produtos`)
  const { products } = await r.json()
  return products.filter((p) => p.metadata?.tipo !== "kit-quantidade")
}

const temEstoque = (v) =>
  !v.manage_inventory ||
  v.allow_backorder ||
  typeof v.inventory_quantity !== "number" ||
  v.inventory_quantity >= 1
const emPreco = (reais) => `${(Math.round(reais * 100) / 100).toFixed(2)} BRL`
const fotoDo = (p) =>
  [...(p.images ?? [])].filter((i) => i?.url).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))[0]
    ?.url ??
  p.thumbnail ??
  null

const navegador = await chromium.launch(CROMO ? { executablePath: CROMO } : {})
const pagina = await navegador.newPage()

try {
  titulo("O arquivo")
  const resposta = await fetch(`${LOJA}/catalogo.xml`)
  const xml = await resposta.text()
  ok(
    resposta.status === 200 && /application\/xml/.test(resposta.headers.get("content-type") ?? ""),
    "/catalogo.xml responde 200, como XML",
    `${resposta.status} ${resposta.headers.get("content-type")}`
  )

  /*
    O XML LIDO COMO O GOOGLE LÊ: o `DOMParser` do navegador recusa o que não é
    XML válido (um "&" solto num nome de produto, um caractere de controle na
    descrição do Bling) com um `<parsererror>`.
  */
  await pagina.goto("about:blank")
  const lido = await pagina.evaluate((texto) => {
    const G = "http://base.google.com/ns/1.0"
    const doc = new DOMParser().parseFromString(texto, "application/xml")
    const erro = doc.getElementsByTagName("parsererror")[0]
    if (erro) return { erro: erro.textContent }
    const campo = (item, nome) => {
      const achados = item.getElementsByTagNameNS(G, nome)
      return achados.length ? achados[0].textContent : null
    }
    const quantos = (item, nome) => item.getElementsByTagNameNS(G, nome).length
    return {
      erro: null,
      raiz: doc.documentElement.nodeName,
      base: doc.getElementsByTagName("link")[0]?.textContent ?? "",
      itens: [...doc.getElementsByTagName("item")].map((item) => ({
        id: campo(item, "id"),
        titulo: campo(item, "title"),
        descricao: campo(item, "description"),
        link: campo(item, "link"),
        foto: campo(item, "image_link"),
        fotosAMais: quantos(item, "additional_image_link"),
        disponibilidade: campo(item, "availability"),
        preco: campo(item, "price"),
        promocional: campo(item, "sale_price"),
        marca: campo(item, "brand"),
        condicao: campo(item, "condition"),
        gtin: campo(item, "gtin"),
        semGtin: campo(item, "identifier_exists"),
        mpn: campo(item, "mpn"),
        categoriaGoogle: campo(item, "google_product_category"),
        tipo: campo(item, "product_type"),
      })),
    }
  }, xml)
  ok(
    !lido.erro && lido.raiz === "rss",
    "é XML válido (RSS 2.0 com os campos g: do Google)",
    lido.erro
  )
  const itens = lido.itens ?? []
  const base = (lido.base ?? "").replace(/\/$/, "")
  ok(/^https?:\/\//.test(base), "o endereço da loja no canal", base)

  titulo("Cada produto, contra a API")
  const catalogo = await daApi()
  const esperados = catalogo.flatMap((p) =>
    fotoDo(p) && p.handle
      ? (p.variants ?? [])
          .filter((v) => typeof v.calculated_price?.calculated_amount === "number")
          .map((v) => ({ p, v }))
      : []
  )
  const ids = itens.map((i) => i.id)
  ok(
    ids.length === esperados.length &&
      esperados.every(({ v }) => ids.includes(v.id)) &&
      new Set(ids).size === ids.length,
    `uma linha por variação publicada, com o id dela (${esperados.length}), sem repetir`,
    `${ids.length} no XML × ${esperados.length} na API`
  )
  ok(
    ids.every((id) => /^variant_/.test(id ?? "")),
    "o id é o variant_… do Medusa — o mesmo que o pixel e o GA4 mandam"
  )

  /**
   * O tipo do produto é a categoria PRINCIPAL, como a API diz (entrega 0151): a marcada no
   * painel (`fb_categoria`), se o produto está nela; senão a primeira dele na ordem do menu.
   */
  const menu = site.categorias.map((c) => c.handle)
  const tipoDe = (p) => {
    const doMenu = (p.categories ?? [])
      .filter((c) => menu.includes(c?.handle))
      .sort((a, b) => menu.indexOf(a.handle) - menu.indexOf(b.handle))
    const principal = doMenu.find((c) => c.id === p.metadata?.fb_categoria) ?? doMenu[0]
    return principal ? site.categorias.find((c) => c.handle === principal.handle).nome : null
  }

  const errados = []
  for (const { p, v } of esperados) {
    const i = itens.find((x) => x.id === v.id)
    if (!i) continue
    const atual = v.calculated_price.calculated_amount
    const original = v.calculated_price.original_amount
    const emPromocao = typeof original === "number" && original > atual
    const conferir = [
      ["o título", i.titulo, (p.variants ?? []).length > 1 ? `${p.title} — ${v.title}` : p.title],
      ["o link", i.link, `${base}/produtos/${p.handle}`],
      [
        "a foto",
        i.foto,
        `${MEDUSA.replace(/\/+$/, "")}/catalogo/fotos/${p.handle}.jpg?v=${createHash("sha1").update(fotoDo(p)).digest("hex").slice(0, 8)}`,
      ],
      ["o preço", i.preco, emPreco(emPromocao ? original : atual)],
      ["o promocional", i.promocional, emPromocao ? emPreco(atual) : null],
      ["o estoque", i.disponibilidade, temEstoque(v) ? "in_stock" : "out_of_stock"],
      ["o SKU", i.mpn, v.sku ?? null],
      ["a categoria", i.tipo, tipoDe(p)],
    ]
    for (const [o_que, veio, esperado] of conferir) {
      if (veio !== esperado)
        errados.push(`${p.handle}: ${o_que} ${JSON.stringify(veio)} × ${JSON.stringify(esperado)}`)
    }
  }
  ok(
    !errados.length,
    "título, link, foto, preço, promocional, estoque, SKU e categoria (a principal) iguais aos do Medusa",
    errados.slice(0, 5).join(" | ")
  )

  const promocionais = itens.filter((i) => i.promocional)
  console.log(
    `  ·  ${promocionais.length} em promoção, ${itens.filter((i) => i.disponibilidade === "out_of_stock").length} esgotado(s)`
  )
  ok(
    promocionais.every((i) => Number.parseFloat(i.promocional) < Number.parseFloat(i.preco)),
    'na promoção, o preço é o cheio e o promocional é o menor (o "de" e o "por" do card)'
  )

  titulo("O que o Google e a Meta pedem")
  ok(
    itens.every((i) => i.marca === "FuckingBarba" && i.condicao === "new"),
    'a marca e o "novo" em toda linha'
  )
  ok(
    itens.every((i) => (i.gtin ? /^\d{8,14}$/.test(i.gtin) : i.semGtin === "no")),
    "sem código de barras, identifier_exists: no (com a marca e o SKU)"
  )
  ok(
    itens.every((i) => /^\d+$/.test(i.categoriaGoogle ?? "")),
    "a categoria do Google, pelo número da taxonomia"
  )
  ok(
    itens.every(
      (i) => i.descricao && !/<[a-z/][^>]*>/i.test(i.descricao) && i.descricao.length <= 5000
    ),
    "descrição em texto corrido, sem HTML, até 5.000 letras"
  )
  ok(
    itens.every((i) => i.fotosAMais === 0),
    "só a foto do produto — as artes a mais (antes e depois) ficam fora"
  )

  titulo("Os links e as fotos abrem")
  const links = [...new Set(itens.map((i) => i.link))]
  const quebrados = []
  for (const link of links) {
    const local = link.replace(base, LOJA)
    const r = await fetch(local, { redirect: "manual" })
    if (r.status !== 200) quebrados.push(`${local} → ${r.status}`)
  }
  ok(!quebrados.length, `as ${links.length} páginas de produto abrem (200)`, quebrados.join(" | "))
  const fotos = [...new Set(itens.map((i) => i.foto))]
  const semFoto = []
  for (const foto of fotos) {
    const r = await fetch(foto, { method: "GET" })
    if (!r.ok || !/^image\/jpeg/.test(r.headers.get("content-type") ?? ""))
      semFoto.push(`${foto} → ${r.status}`)
    await r.body?.cancel().catch(() => undefined)
  }
  ok(
    !semFoto.length,
    `as ${fotos.length} fotos abrem, em JPEG (a Meta não aceita WebP no catálogo)`,
    semFoto.join(" | ")
  )
} catch (e) {
  falhas++
  console.log(`\n  ✗ o conferidor quebrou no meio: ${e instanceof Error ? e.stack : e}`)
} finally {
  await navegador.close()
}

console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
