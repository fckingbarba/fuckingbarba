import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { lerOSite, MARCA_DAS_FOTOS, type ProdutoDoSite } from "./erp/catalogo"
import { baixarFoto, guardarFoto } from "./erp/fotos"
import { avisarALoja } from "./revalidar"

/**
 * DA LOJA ANTIGA (NUVEMSHOP) PRA NOVA: OS ENDEREÇOS E AS FOTOS.
 *
 * Na virada do domínio (fase 6), fuckingbarba.com.br passa a apontar pra loja
 * nova. O link de cada produto que já circula (anúncio, Google, WhatsApp) é o
 * /produtos/<slug>/ da Nuvemshop — então o produto aqui precisa do MESMO
 * handle. E as fotos da vitrine de lá são as que a equipe escolheu, na ordem.
 *
 * DE ONDE LÊ: da própria loja no ar, sem API e sem senha. O mapa do site
 * (`/sitemap.xml`) diz quais produtos existem; a página de cada um traz:
 *   - o SKU, no `mainEntity` do JSON-LD e no `data-variants`;
 *   - a categoria, na trilha do JSON-LD (posição 2);
 *   - a galeria, nos links `data-fancybox="product-gallery"`, na ordem, em
 *     1024 px — o maior tamanho que o CDN de lá serve em webp. A página
 *     também mostra fotos de OUTROS produtos (os relacionados); a galeria é
 *     só a do produto. O vídeo do produto também é um link da galeria
 *     (`#product-video-modal-…`): fica de fora, porque aqui só entra foto.
 *
 * COMO CASA: pelo SKU, que é o mesmo nos três lados (Nuvemshop, Bling, loja
 * nova) — a integração do Bling com a Nuvemshop já exigia.
 *
 * O QUE MUDA NO PRODUTO DAQUI:
 *   - o handle vira o slug da Nuvemshop. Se outro produto estiver com ele: o
 *     rascunho que a Nuvemshop não tem sai do caminho (ganha "-antigo"); o
 *     publicado não é mexido, e a prévia avisa;
 *   - as fotos passam a ser as da galeria de lá, copiadas pro armazenamento da
 *     loja (o CDN da Nuvemshop some com ela), com a marca `fb_fotos` — e a
 *     importação do ERP nunca mais troca essas fotos. Menos no produto cuja
 *     galeria já foi mexida no painel (`fb_fotos` com origem "painel"): essa
 *     fica como está;
 *   - a categoria, SÓ no produto que está sem nenhuma (o novo que veio do ERP).
 * Nome, preço, peso e o resto: nada — é do ERP.
 *
 * RODAR DE NOVO DÁ NO MESMO: a foto já copiada não sobe outra vez (a chave é
 * o caminho no CDN), e o produto que já está igual aparece como "pronto".
 */

/** A loja antiga. `NUVEMSHOP_LOJA_URL` existe pro conferidor apontar pra uma falsa. */
export const lojaAntiga = () =>
  (process.env.NUVEMSHOP_LOJA_URL || "https://www.fuckingbarba.com.br").replace(/\/+$/, "")

const PRAZO_MS = 20_000
/** Uma página por vez, com folga: é a loja no ar, atendendo cliente. */
const ESPACO_MS = 300

export type ProdutoDaNuvemshop = {
  slug: string
  nome: string
  skus: string[]
  /** Endereços absolutos, na ordem da galeria. */
  fotos: string[]
  /** A categoria principal lá: "Para o Cabelo", `para-o-cabelo`. */
  categoria: { nome: string; slug: string } | null
}

/* ── a leitura da página (sem efeito: é o que o teste confere) ──────────────── */

function desescapar(t: string): string {
  return t
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
}

const atributo = (tag: string, nome: string) =>
  tag
    .match(new RegExp(`\\s${nome}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))
    ?.slice(2, 4)
    .find(Boolean) ?? null

/** Os slugs de produto do mapa do site: `/produtos/<slug>/`, na ordem, sem repetir. */
export function slugsDoMapa(xml: string): string[] {
  const slugs: string[] = []
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    let caminho: string
    try {
      caminho = new URL(desescapar(m[1]!)).pathname
    } catch {
      continue
    }
    const slug = caminho.match(/^\/produtos\/([a-z0-9-]+)\/?$/)?.[1]
    if (slug && !slugs.includes(slug)) slugs.push(slug)
  }
  return slugs
}

/**
 * A página do produto → nome, SKUs, fotos da galeria e categoria. `null` se
 * não for página de produto (sem o `mainEntity` nem variação com SKU).
 */
export function lerPaginaDoProduto(
  html: string,
  endereco: string
): Omit<ProdutoDaNuvemshop, "slug"> | null {
  let principal: { name?: unknown; sku?: unknown } | null = null
  let categoria: ProdutoDaNuvemshop["categoria"] = null
  for (const m of html.matchAll(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    let d: {
      "@type"?: unknown
      mainEntity?: { name?: unknown; sku?: unknown }
      breadcrumb?: { itemListElement?: { position?: unknown; name?: unknown; item?: unknown }[] }
    }
    try {
      d = JSON.parse(m[1]!)
    } catch {
      continue
    }
    if (d?.["@type"] !== "WebPage") continue
    principal = d.mainEntity ?? null
    const trilha = Array.isArray(d.breadcrumb?.itemListElement) ? d.breadcrumb.itemListElement : []
    const c = trilha.find((i) => Number(i?.position) === 2)
    if (c && typeof c.name === "string" && typeof c.item === "string") {
      try {
        const slug = new URL(c.item).pathname.replace(/^\/+|\/+$/g, "")
        if (slug && !slug.startsWith("produtos/")) categoria = { nome: c.name.trim(), slug }
      } catch {
        // trilha sem endereço: fica sem categoria
      }
    }
  }

  const skus: string[] = []
  const guardarSku = (v: unknown) => {
    const sku = typeof v === "string" ? v.trim() : ""
    if (sku && !skus.includes(sku)) skus.push(sku)
  }
  guardarSku(principal?.sku)
  const variantes = html.match(/\sdata-variants\s*=\s*"([^"]*)"/)?.[1]
  if (variantes) {
    try {
      for (const v of JSON.parse(desescapar(variantes)) as { sku?: unknown }[]) guardarSku(v?.sku)
    } catch {
      // sem as variações, vale o SKU do JSON-LD
    }
  }

  const fotos: string[] = []
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    if (atributo(m[0], "data-fancybox") !== "product-gallery") continue
    const href = atributo(m[0], "href")
    if (!href || href.startsWith("#")) continue
    let url: URL
    try {
      url = new URL(desescapar(href), endereco)
    } catch {
      continue
    }
    if (!/\.(webp|jpe?g|png|gif|avif)$/i.test(url.pathname)) continue
    if (!fotos.includes(url.toString())) fotos.push(url.toString())
  }

  const nome = typeof principal?.name === "string" ? principal.name.trim() : ""
  if (!nome && !skus.length) return null
  return { nome, skus, fotos, categoria }
}

/* ── a leitura da loja no ar ─────────────────────────────────────────────── */

/** A página da loja antiga, ou o motivo de não ter vindo. Sem `user-agent`, ela responde 403. */
async function pagina(
  url: string
): Promise<{ ok: true; texto: string } | { ok: false; motivo: string }> {
  try {
    const r = await fetch(url, {
      headers: { "user-agent": "FuckingBarba-migracao/1.0", accept: "text/html,application/xml" },
      signal: AbortSignal.timeout(PRAZO_MS),
    })
    if (!r.ok) return { ok: false, motivo: `respondeu ${r.status}` }
    return { ok: true, texto: await r.text() }
  } catch (e) {
    const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
    return {
      ok: false,
      motivo: tempo
        ? "não respondeu a tempo"
        : `não atendeu (${e instanceof Error ? e.message : e})`,
    }
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type LeituraDaNuvemshop =
  | { ok: true; produtos: ProdutoDaNuvemshop[]; falharam: { slug: string; motivo: string }[] }
  | { ok: false; motivo: string }

/** Lê os produtos da loja antiga: os do mapa do site, ou só `slugs`. */
export async function lerLojaAntiga(slugs?: string[]): Promise<LeituraDaNuvemshop> {
  const base = lojaAntiga()
  let alvo = slugs
  if (!alvo) {
    const mapa = await pagina(`${base}/sitemap.xml`)
    if (!mapa.ok) return { ok: false, motivo: `o mapa do site ${mapa.motivo}` }
    alvo = slugsDoMapa(mapa.texto)
    if (!alvo.length) return { ok: false, motivo: "o mapa do site não lista nenhum produto" }
  }
  const produtos: ProdutoDaNuvemshop[] = []
  const falharam: { slug: string; motivo: string }[] = []
  for (const [n, slug] of alvo.entries()) {
    if (!/^[a-z0-9-]+$/.test(slug)) {
      falharam.push({ slug, motivo: "endereço inválido" })
      continue
    }
    if (n) await esperar(ESPACO_MS)
    const endereco = `${base}/produtos/${slug}/`
    const lida = await pagina(endereco)
    if (!lida.ok) {
      falharam.push({ slug, motivo: `a página ${lida.motivo}` })
      continue
    }
    const lido = lerPaginaDoProduto(lida.texto, endereco)
    if (lido) produtos.push({ slug, ...lido })
    else falharam.push({ slug, motivo: "a página não parece de produto" })
  }
  return { ok: true, produtos, falharam }
}

/* ── o plano ──────────────────────────────────────────────────────────────── */

export type FotoEscolhida = { chave: string; url: string }

function fotosEscolhidas(metadata: unknown): FotoEscolhida[] {
  const m = (metadata as Record<string, unknown> | null)?.[MARCA_DAS_FOTOS] as
    { fotos?: unknown } | undefined
  return (Array.isArray(m?.fotos) ? m.fotos : []).filter(
    (f): f is FotoEscolhida => typeof f?.chave === "string" && typeof f?.url === "string"
  )
}

/** A chave de uma foto do CDN: o caminho, sem o endereço (o http ou https não importa). */
export const chaveDaFoto = (url: string) => {
  try {
    return `nuvemshop:${new URL(url).pathname}`
  } catch {
    return `nuvemshop:${url}`
  }
}

export type CategoriaDaLoja = { id: string; handle: string; nome: string }

/**
 * A categoria de lá → a daqui, pelo que o nome diz. "kit" antes de "barba":
 * a de kits na Nuvemshop é `kits-para-barba`.
 */
export function categoriaCorrespondente(
  categoria: ProdutoDaNuvemshop["categoria"],
  daLoja: CategoriaDaLoja[]
): CategoriaDaLoja | null {
  if (!categoria) return null
  const texto = `${categoria.slug} ${categoria.nome}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
  const regra = [
    [/kit/, "kits"],
    [/cabelo/, "cabelo"],
    [/barba/, "barba"],
  ] as const
  const alvo = regra.find(([r]) => r.test(texto))?.[1]
  return (alvo && daLoja.find((c) => c.handle === alvo)) || null
}

export type ItemDaNuvemshop = {
  nuvem: ProdutoDaNuvemshop
  /** O produto do site com o mesmo SKU. */
  produto: { id: string; titulo: string; handle: string; status: string; fotos: number } | null
  /** `null`: o handle já é o slug. */
  endereco: { de: string; para: string } | null
  /** Um rascunho que a Nuvemshop não tem, com o slug: sai do caminho. */
  ocupante: { id: string; titulo: string; handle: string; novoHandle: string } | null
  /** As fotos da galeria entram no lugar das de hoje. */
  trocaFotos: boolean
  /** Só pro produto sem categoria. */
  categoria: CategoriaDaLoja | null
  bloqueio: string | null
  /** Nada a fazer: endereço, fotos e categoria já estão como lá. */
  pronto: boolean
}

export function planejarNuvemshop(
  nuvem: ProdutoDaNuvemshop[],
  site: ProdutoDoSite[],
  categorias: CategoriaDaLoja[]
): ItemDaNuvemshop[] {
  const donoDoSku = new Map<string, ProdutoDoSite>()
  for (const s of site) for (const v of s.variacoes) if (v.sku) donoDoSku.set(v.sku, s)
  const porHandle = new Map(site.map((s) => [s.handle, s]))
  const skusDeLa = new Set(nuvem.flatMap((n) => n.skus))
  const handles = new Set(site.map((s) => s.handle))

  return nuvem.map((n): ItemDaNuvemshop => {
    const base = {
      nuvem: n,
      produto: null,
      endereco: null,
      ocupante: null,
      trocaFotos: false,
      categoria: null,
      bloqueio: null,
      pronto: false,
    }
    const donos = [...new Set(n.skus.flatMap((sku) => donoDoSku.get(sku) ?? []))]
    if (!donos.length)
      return {
        ...base,
        bloqueio: n.skus.length
          ? `nenhum produto do site com o código ${n.skus.join(", ")}`
          : "a página não mostra o código (SKU)",
      }
    if (donos.length > 1)
      return {
        ...base,
        bloqueio: `os códigos estão em mais de um produto do site: ${donos.map((d) => d.titulo).join(", ")}`,
      }
    const s = donos[0]!
    const produto = {
      id: s.id,
      titulo: s.titulo,
      handle: s.handle,
      status: s.status,
      fotos: s.fotos.length,
    }

    let ocupante: ItemDaNuvemshop["ocupante"] = null
    const endereco = s.handle === n.slug ? null : { de: s.handle, para: n.slug }
    if (endereco) {
      const outro = porHandle.get(n.slug)
      if (outro && outro.id !== s.id) {
        const daNuvemshop = outro.variacoes.some((v) => v.sku && skusDeLa.has(v.sku))
        if (outro.status !== ProductStatus.DRAFT || daNuvemshop)
          return {
            ...base,
            produto,
            endereco,
            bloqueio:
              `o endereço /produtos/${n.slug} é de “${outro.titulo}”` +
              (outro.status === ProductStatus.DRAFT ? "" : ", que está publicado") +
              " — resolva no admin e rode de novo",
          }
        let novoHandle = `${n.slug}-antigo`
        for (let k = 2; handles.has(novoHandle); k++) novoHandle = `${n.slug}-antigo-${k}`
        handles.add(novoHandle)
        ocupante = { id: outro.id, titulo: outro.titulo, handle: outro.handle, novoHandle }
      }
    }

    const chaves = n.fotos.map(chaveDaFoto)
    const atuais = fotosEscolhidas(s.metadata).map((f) => f.chave)
    const mesmasFotos =
      atuais.length === chaves.length &&
      atuais.every((c, k) => c === chaves[k]) &&
      s.fotos.length === chaves.length
    // Foto escolhida no painel (a galeria do produto) fica: a loja antiga não manda mais nela.
    const doPainel =
      ((s.metadata as Record<string, unknown> | null)?.[MARCA_DAS_FOTOS] as { origem?: unknown })
        ?.origem === "painel"
    const trocaFotos = n.fotos.length > 0 && !mesmasFotos && !doPainel
    const categoria = s.categorias.length ? null : categoriaCorrespondente(n.categoria, categorias)
    return {
      ...base,
      produto,
      endereco,
      ocupante,
      trocaFotos,
      categoria,
      pronto: !endereco && !trocaFotos && !categoria,
    }
  })
}

/* ── a prévia e a troca ───────────────────────────────────────────────────── */

type Falha = { ok: false; status: number; motivo: string }
const falha = (status: number, motivo: string): Falha => ({ ok: false, status, motivo })

async function categoriasDaLoja(container: MedusaContainer): Promise<CategoriaDaLoja[]> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product_category",
    fields: ["id", "handle", "name"],
  })
  return (data as { id: string; handle?: string | null; name?: string | null }[]).map((c) => ({
    id: c.id,
    handle: c.handle ?? "",
    nome: c.name ?? c.handle ?? c.id,
  }))
}

export type PreviaDaNuvemshop = {
  loja: string
  lidoEm: string
  itens: ItemDaNuvemshop[]
  falharam: { slug: string; motivo: string }[]
}

export async function previaDaNuvemshop(
  container: MedusaContainer,
  agora = new Date()
): Promise<{ ok: true; previa: PreviaDaNuvemshop } | Falha> {
  const leitura = await lerLojaAntiga()
  if (!leitura.ok) return falha(502, `não consegui ler a loja da Nuvemshop: ${leitura.motivo}`)
  const [site, categorias] = await Promise.all([lerOSite(container), categoriasDaLoja(container)])
  return {
    ok: true,
    previa: {
      loja: lojaAntiga(),
      lidoEm: agora.toISOString(),
      itens: planejarNuvemshop(leitura.produtos, site, categorias),
      falharam: leitura.falharam,
    },
  }
}

type Resumo = { titulo: string; handle: string }

export type RelatorioDaNuvemshop = {
  em: string
  /** Endereço trocado: de → para. */
  enderecos: { titulo: string; de: string; para: string }[]
  /** Os rascunhos que saíram do caminho. */
  afastados: { titulo: string; de: string; para: string }[]
  fotos: { produtos: Resumo[]; copiadas: number; reaproveitadas: number; falharam: string[] }
  categorias: { titulo: string; categoria: string }[]
  pulados: { nome: string; motivo: string }[]
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function trazerDaNuvemshop(
  container: MedusaContainer,
  slugs: string[],
  agora = new Date()
): Promise<{ ok: true; relatorio: RelatorioDaNuvemshop } | Falha> {
  if (!slugs.length) return falha(400, "nada escolhido")
  if (process.env.NODE_ENV === "production" && !process.env.S3_BUCKET) {
    return falha(
      409,
      "sem o S3_BUCKET as fotos iriam pro disco do servidor e sumiriam no próximo deploy"
    )
  }
  try {
    return await container
      .resolve(Modules.LOCKING)
      .execute("nuvemshop-migracao", () => trazer(container, slugs, agora), { timeout: 5 })
  } catch (e) {
    if (/acquiring lock/i.test(mensagem(e)))
      return falha(409, "já tem uma troca andando — espere ela terminar e abra a prévia de novo")
    throw e
  }
}

async function trazer(
  container: MedusaContainer,
  slugs: string[],
  agora: Date
): Promise<{ ok: true; relatorio: RelatorioDaNuvemshop } | Falha> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const relatorio: RelatorioDaNuvemshop = {
    em: agora.toISOString(),
    enderecos: [],
    afastados: [],
    fotos: { produtos: [], copiadas: 0, reaproveitadas: 0, falharam: [] },
    categorias: [],
    pulados: [],
  }

  // A loja antiga de novo, só os escolhidos: a prévia pode ter ficado velha.
  const leitura = await lerLojaAntiga([...new Set(slugs)])
  if (!leitura.ok) return falha(502, `não consegui ler a loja da Nuvemshop: ${leitura.motivo}`)
  for (const f of leitura.falharam) relatorio.pulados.push({ nome: f.slug, motivo: f.motivo })
  const [site, categorias] = await Promise.all([lerOSite(container), categoriasDaLoja(container)])
  const porId = new Map(site.map((s) => [s.id, s]))
  const plano = planejarNuvemshop(leitura.produtos, site, categorias)
  const avisar = new Set<string>()

  for (const i of plano) {
    if (i.bloqueio || !i.produto) {
      relatorio.pulados.push({ nome: i.nuvem.nome || i.nuvem.slug, motivo: i.bloqueio ?? "?" })
      continue
    }
    if (i.pronto) continue
    const s = porId.get(i.produto.id)!
    try {
      // As fotos primeiro: se o armazenamento falhar, o produto fica como estava.
      let fotos: FotoEscolhida[] | null = null
      if (i.trocaFotos) {
        const ja = new Map(fotosEscolhidas(s.metadata).map((f) => [f.chave, f.url]))
        fotos = []
        for (const [n, url] of i.nuvem.fotos.entries()) {
          const chave = chaveDaFoto(url)
          const copiada = ja.get(chave)
          if (copiada) {
            fotos.push({ chave, url: copiada })
            relatorio.fotos.reaproveitadas++
            continue
          }
          const baixada = await baixarFoto(url)
          if (!baixada.ok) {
            relatorio.fotos.falharam.push(`${i.nuvem.slug}, foto ${n + 1}: ${baixada.motivo}`)
            continue
          }
          fotos.push({
            chave,
            url: await guardarFoto(container, `${i.nuvem.slug}-${n + 1}`, baixada),
          })
          relatorio.fotos.copiadas++
        }
        // Nenhuma veio: melhor ficar com as de hoje do que sem foto.
        if (!fotos.length) fotos = null
      }

      if (i.ocupante) {
        await updateProductsWorkflow(container).run({
          input: { selector: { id: i.ocupante.id }, update: { handle: i.ocupante.novoHandle } },
        })
        relatorio.afastados.push({
          titulo: i.ocupante.titulo,
          de: i.ocupante.handle,
          para: i.ocupante.novoHandle,
        })
      }

      await updateProductsWorkflow(container).run({
        input: {
          selector: { id: s.id },
          update: {
            ...(i.endereco ? { handle: i.endereco.para } : {}),
            ...(fotos
              ? {
                  images: fotos.map((f) => ({ url: f.url })),
                  thumbnail: fotos[0]!.url,
                  metadata: { [MARCA_DAS_FOTOS]: { origem: "nuvemshop", fotos } },
                }
              : {}),
            ...(i.categoria ? { category_ids: [i.categoria.id] } : {}),
          },
        },
      })
      if (i.endereco)
        relatorio.enderecos.push({ titulo: s.titulo, de: i.endereco.de, para: i.endereco.para })
      if (fotos) relatorio.fotos.produtos.push({ titulo: s.titulo, handle: i.nuvem.slug })
      if (i.categoria) relatorio.categorias.push({ titulo: s.titulo, categoria: i.categoria.nome })
      avisar.add(s.handle).add(i.nuvem.slug)
    } catch (e) {
      relatorio.pulados.push({ nome: s.titulo, motivo: `o Medusa recusou: ${mensagem(e)}` })
    }
  }

  if (avisar.size)
    await avisarALoja(["produtos", ...[...avisar].map((h) => `produto:${h}`)], logger)
  logger.info(
    `[nuvemshop] ${relatorio.enderecos.length} endereço(s), ${relatorio.fotos.produtos.length} ` +
      `produto(s) com as fotos de lá (${relatorio.fotos.copiadas} copiada(s), ` +
      `${relatorio.fotos.falharam.length} falha(s)), ${relatorio.categorias.length} categoria(s), ` +
      `${relatorio.pulados.length} pulado(s)`
  )
  return { ok: true, relatorio }
}
