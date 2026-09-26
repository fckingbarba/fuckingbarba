import { createHash } from "node:crypto"
import type { HttpTypes } from "@medusajs/types"
import { temEstoque } from "@/lib/medusa"
import { site } from "@/lib/site"

/**
 * O CATÁLOGO PROS ANÚNCIOS — o arquivo que o Google Merchant Center (Shopping
 * e Performance Max) e o Gerenciador de Comércio da Meta (anúncio de
 * catálogo, remarketing dinâmico, Instagram Shopping) leem de tempos em
 * tempos, em `/catalogo.xml` (`app/catalogo.xml/route.ts`).
 *
 * UM ARQUIVO SÓ PROS DOIS: é o RSS 2.0 com os campos `g:` do Google, que a
 * Meta também lê. Uma linha por VARIAÇÃO, com o id dela no Medusa
 * (`variant_…`) — o MESMO id que o pixel e o GA4 mandam no `item_id` e no
 * `content_ids` (`lib/rastrear.ts`, e a compra pelo servidor em
 * `backend/src/lib/anuncios/`). É isso que liga quem viu o produto no site ao
 * anúncio daquele produto: id diferente, e o remarketing dinâmico não acha
 * nada.
 *
 * ┌─ O QUE FICA DE FORA, DE PROPÓSITO ─────────────────────────────────────┐
 * │ • As fotos a mais. Em vários produtos, a segunda foto é arte de        │
 * │   anúncio ("88% de eficácia") ou antes e depois — e o Google e a Meta  │
 * │   proíbem antes e depois de aparência em anúncio, com conta derrubada  │
 * │   (ver `backend/src/scripts/fotos-reprovadas.ts`). Vai só a primeira,  │
 * │   a do produto — em JPEG, pelo Medusa (`/catalogo/fotos/<handle>.jpg`, │
 * │   `backend/src/lib/foto-do-catalogo.ts`): as da loja são WebP, e a     │
 * │   Meta só aceita JPEG ou PNG no catálogo.                              │
 * │ • O frete: muda com o CEP. Mora nas configurações de envio do Merchant │
 * │   Center e da Meta (o frete grátis a partir do piso da loja).          │
 * │ • O código de barras que a loja não tem: sem EAN, a linha diz          │
 * │   `identifier_exists: no`, com a marca e o SKU — é o que o Google pede │
 * │   pra produto de marca própria sem GTIN. Com EAN no Medusa, ele vai.   │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O PREÇO É O DA LOJA, com a promoção: sem promoção, `g:price` é o que se
 * paga; com ela, `g:price` é o cheio e `g:sale_price` o que se paga — os
 * dois como o card mostra (o "de" riscado e o "por"). O Google confere o
 * preço na página do produto: preço diferente reprova o item.
 */

/** A categoria do Google (IDs da taxonomia, que a Meta também aceita), pela categoria da loja. */
export const CATEGORIA_DO_GOOGLE: Record<string, number> = {
  /** Saúde e beleza > Cuidados pessoais > Cuidados com os cabelos > Produtos de penteado. */
  cabelo: 1901,
  /** Saúde e beleza > Cuidados pessoais > Barbearia e embelezamento. */
  barba: 528,
  kits: 528,
}
const CATEGORIA_PADRAO = 528

/** A marca, como o Google e a Meta mostram no anúncio. */
export const MARCA = site.nome

/** Texto que entra no XML. Sempre. */
export function esc(valor: unknown): string {
  return (
    String(valor ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
      // O que o XML 1.0 não aceita (controle, fora o tab e as quebras).
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
  )
}

/** "54.9" → "54.90 BRL", como o Google e a Meta pedem. */
export function emPreco(reais: number): string {
  return `${(Math.round(reais * 100) / 100).toFixed(2)} BRL`
}

const ENTIDADES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
}

/**
 * A descrição em texto corrido: a do Bling pode vir com HTML (`<p>`, `<br>`,
 * `<li>`), e o Google quer texto. Até 5.000 letras, o teto dele.
 */
export function textoCorrido(descricao: string | null | undefined, limite = 5000): string {
  const texto = (descricao ?? "")
    .replace(/<\s*(br|\/p|\/li|\/h\d)\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTIDADES[e.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim()
  return texto.length <= limite ? texto : `${texto.slice(0, limite - 1).trimEnd()}…`
}

/** Só dígito, com 8, 12, 13 ou 14 deles: é GTIN (EAN, UPC). O resto não vale. */
export function gtinDa(variante: HttpTypes.StoreProductVariant): string | null {
  for (const bruto of [variante.ean, variante.upc, variante.barcode]) {
    const digitos = String(bruto ?? "").replace(/\s/g, "")
    if (/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(digitos)) return digitos
  }
  return null
}

/** A primeira categoria da loja que o produto tem, na ordem do menu. */
function categoriaDa(produto: HttpTypes.StoreProduct): { nome: string; google: number } | null {
  const handles = new Set((produto.categories ?? []).map((c) => c?.handle))
  const achada = site.categorias.find((c) => handles.has(c.handle))
  return achada
    ? { nome: achada.nome, google: CATEGORIA_DO_GOOGLE[achada.handle] ?? CATEGORIA_PADRAO }
    : null
}

/** A foto do produto: a primeira da galeria (pela ordem do painel), ou a miniatura. */
function fotoDo(produto: HttpTypes.StoreProduct): string | null {
  const galeria = [...(produto.images ?? [])]
    .filter((i) => Boolean(i?.url))
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
  return galeria[0]?.url ?? produto.thumbnail ?? null
}

/**
 * A mesma foto, em JPEG, pelo Medusa. O `?v=` é um resumo do endereço da
 * original: foto nova no produto é endereço novo, e quem guardou a antiga
 * (o Google, a Meta) busca de novo.
 */
export function fotoDoCatalogo(
  handle: string,
  original: string,
  medusa = process.env.MEDUSA_BACKEND_URL ?? ""
): string {
  const versao = createHash("sha1").update(original).digest("hex").slice(0, 8)
  return `${medusa.replace(/\/+$/, "")}/catalogo/fotos/${handle}.jpg?v=${versao}`
}

/** Uma variação no catálogo — ou `null` quando ela não tem preço ou foto (o Google recusaria). */
export type ItemDoFeed = {
  id: string
  titulo: string
  descricao: string
  link: string
  foto: string
  disponivel: boolean
  preco: number
  promocional: number | null
  sku: string | null
  gtin: string | null
  categoria: { nome: string; google: number } | null
  grupo: string | null
}

export function itensDoFeed(
  produtos: HttpTypes.StoreProduct[],
  url: string = site.url
): ItemDoFeed[] {
  return produtos.flatMap((produto) => {
    const variantes = produto.variants ?? []
    const fotoOriginal = fotoDo(produto)
    if (!produto.handle || !fotoOriginal) return []
    const foto = fotoDoCatalogo(produto.handle, fotoOriginal)
    const descricao =
      textoCorrido(produto.description) ||
      textoCorrido([produto.title, produto.subtitle].filter(Boolean).join(" — "))
    const categoria = categoriaDa(produto)
    return variantes.flatMap((v): ItemDoFeed[] => {
      const atual = v.calculated_price?.calculated_amount
      if (typeof atual !== "number" || atual <= 0) return []
      const original = v.calculated_price?.original_amount
      const emPromocao = typeof original === "number" && original > atual
      return [
        {
          id: v.id,
          titulo: variantes.length > 1 && v.title ? `${produto.title} — ${v.title}` : produto.title,
          descricao,
          link: `${url}/produtos/${produto.handle}`,
          foto,
          disponivel: temEstoque(v),
          preco: emPromocao ? original : atual,
          promocional: emPromocao ? atual : null,
          sku: v.sku ?? null,
          gtin: gtinDa(v),
          categoria,
          grupo: variantes.length > 1 ? produto.id : null,
        },
      ]
    })
  })
}

const campo = (nome: string, valor: string | number) => `    <g:${nome}>${esc(valor)}</g:${nome}>`

/** O XML inteiro. */
export function feedDeProdutos(produtos: HttpTypes.StoreProduct[], url: string = site.url): string {
  const itens = itensDoFeed(produtos, url).map((i) =>
    [
      "  <item>",
      campo("id", i.id),
      campo("title", i.titulo),
      campo("description", i.descricao),
      campo("link", i.link),
      campo("image_link", i.foto),
      campo("availability", i.disponivel ? "in_stock" : "out_of_stock"),
      campo("price", emPreco(i.preco)),
      ...(i.promocional !== null ? [campo("sale_price", emPreco(i.promocional))] : []),
      campo("brand", MARCA),
      campo("condition", "new"),
      ...(i.gtin ? [campo("gtin", i.gtin)] : [campo("identifier_exists", "no")]),
      ...(i.sku ? [campo("mpn", i.sku)] : []),
      ...(i.categoria
        ? [
            campo("google_product_category", i.categoria.google),
            campo("product_type", i.categoria.nome),
          ]
        : [campo("google_product_category", CATEGORIA_PADRAO)]),
      ...(i.grupo ? [campo("item_group_id", i.grupo)] : []),
      "  </item>",
    ].join("\n")
  )
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    `  <title>${esc(site.nome)}</title>`,
    `  <link>${esc(url)}</link>`,
    `  <description>${esc(`Os produtos da ${site.nome}`)}</description>`,
    ...itens,
    "</channel>",
    "</rss>",
    "",
  ].join("\n")
}
