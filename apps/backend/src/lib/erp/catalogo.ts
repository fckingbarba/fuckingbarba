import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import {
  batchPriceListPricesWorkflow,
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  deletePriceListsWorkflow,
  deleteProductsWorkflow,
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"
import { sincronizarBumps } from "../bumps"
import { gerarHandle } from "../handle"
import { sincronizarPrecosPorQuantidade, TITULO_DA_LISTA } from "../precos-por-quantidade"
import { avisarALoja } from "../revalidar"
import { acessoAoErp } from "./conexao"
import type { Acesso, ErpDaLoja, FotoNoErp, MedidasDaCaixa, ProdutoNoErp } from "./contrato"
import { erpDaLoja } from "./erps"
import { sincronizarEstoque } from "./estoque"
import { baixarFoto, guardarFoto } from "./fotos"
import { MARCA_DAS_FOTOS, MARCA_DO_ERP, MARCA_DO_NOME, temNomeDaLoja } from "./marcas"

/**
 * OS PRODUTOS DO SITE VÊM DO ERP — a importação do catálogo (decidida em
 * 23/09: "apagar tudo e importar do zero").
 *
 * O ERP manda no nome, na descrição, no preço, no peso, nas medidas e nas
 * fotos, e diz quais produtos existem. A pessoa escolhe, numa prévia no admin
 * (`admin/routes/erp/catalogo`), o que é de vender: o ERP também cadastra
 * insumo e embalagem.
 *
 * ┌─ POR QUE O MESMO SKU É ATUALIZADO NO LUGAR, E NÃO APAGADO E RECRIADO ──┐
 * │ O combinado era apagar e importar. Pro produto que o site já vende     │
 * │ (mesmo SKU nos dois lados), o resultado é o mesmo, mas escrito por     │
 * │ cima, mantendo o id:                                                   │
 * │  • o Medusa NÃO apaga produto com pedido esperando envio (a reserva de │
 * │    estoque trava), e numa loja no ar sempre tem um;                    │
 * │  • o pedido pago que ainda não saiu continua achando o produto, o peso │
 * │    e a reserva dele — e o estoque não é descontado duas vezes;         │
 * │  • a sacola de quem está comprando continua valendo;                   │
 * │  • o endereço (/produtos/<handle>) e as categorias ficam, sem 301.     │
 * │ O resto é "do zero": o subtítulo e os textos da página (`fb_pdp`)      │
 * │ saem, a promoção "de/por" sai, as fotos são as do ERP.                 │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O "DO ZERO" É SÓ NA PRIMEIRA VEZ de cada produto (a marca `fb_erp` diz se
 * ele já veio). Rodar de novo — mudou o preço no ERP — atualiza nome,
 * descrição, preço, peso e medidas, e só: o subtítulo, os textos da página,
 * a promoção e as fotos que a equipe pôs depois (as da Nuvemshop,
 * `lib/nuvemshop.ts`) ficam. Foto do ERP, depois da primeira vez, só entra
 * em produto que está sem nenhuma.
 *
 * CAMPO VAZIO NO ERP NÃO APAGA O DO SITE: sem foto, sem peso, sem medidas ou
 * sem descrição lá, fica o de hoje (e a prévia avisa). Sem preço ou sem SKU,
 * o produto não entra.
 *
 * O QUE ACONTECE COM CADA UM:
 *   atualiza  mesmo SKU, mesmas variações → reescrito no lugar
 *   recria    mesmo SKU, variações diferentes → o do site sai e nasce outro,
 *             com o endereço, as categorias e a situação dele
 *   novo      SKU que o site não tem → entra em RASCUNHO, sem categoria, pra
 *             alguém revisar e publicar
 *   sai       produto do site que nenhum escolhido cobre, e que a pessoa viu
 *             na lista "saem" da prévia → apagado; com pedido esperando
 *             envio, vira rascunho
 *
 * NADA SAI SEM A PESSOA TER VISTO: a importação só apaga os ids que vieram na
 * lista `remover` (a que a prévia mostrou), e relê o ERP em vez de confiar na
 * prévia. Uma importação por vez (trava), e rodar de novo dá no mesmo — o
 * que já veio é achado pelo SKU e reescrito igual, e a foto já copiada não
 * sobe de novo (a chave dela fica na marca `fb_erp` do produto).
 *
 * DEPOIS: o estoque é sincronizado, o desconto por quantidade e as ofertas
 * do checkout se refazem na hora (os jobs de sempre também refariam), e a
 * loja é avisada.
 */

export { MARCA_DAS_FOTOS, MARCA_DO_ERP, MARCA_DO_NOME, nomeNoErp, temNomeDaLoja } from "./marcas"
const MOEDA = "brl"

export type FotoCopiada = { chave: string; url: string }
/** `nome`: o do ERP na última importação — o painel mostra ao lado do nome da loja. */
type MarcaDoErp = { erp: string; id: string; fotos: FotoCopiada[]; nome?: string }

function marcaDe(metadata: unknown): MarcaDoErp | null {
  const m = (metadata as Record<string, unknown> | null)?.[MARCA_DO_ERP] as
    Partial<MarcaDoErp> | undefined
  if (!m || typeof m !== "object") return null
  return {
    erp: String(m.erp ?? ""),
    id: String(m.id ?? ""),
    fotos: (Array.isArray(m.fotos) ? m.fotos : []).filter(
      (f): f is FotoCopiada => typeof f?.chave === "string" && typeof f?.url === "string"
    ),
    ...(typeof m.nome === "string" && m.nome ? { nome: m.nome } : {}),
  }
}

/* ── o site, como a importação enxerga ────────────────────────────────────── */

export type VariacaoDoSite = {
  id: string
  sku: string | null
  /** O conjunto de preços (é por ele que a promoção aponta). */
  conjunto: string | null
  pesoGramas: number | null
  medidas: MedidasDaCaixa | null
}

export type ProdutoDoSite = {
  id: string
  titulo: string
  handle: string
  status: string
  descricao: string | null
  fotos: string[]
  categorias: { id: string; nome: string }[]
  canais: string[]
  perfil: string | null
  metadata: Record<string, unknown>
  variacoes: VariacaoDoSite[]
  /** Reservas de estoque: pedido pago que não saiu, Pix esperando. */
  esperando: number
}

const numeroOuNulo = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null
}

function medidasDoMedusa(v: {
  length?: unknown
  width?: unknown
  height?: unknown
}): MedidasDaCaixa | null {
  const comprimento = numeroOuNulo(v.length)
  const largura = numeroOuNulo(v.width)
  const altura = numeroOuNulo(v.height)
  return comprimento && largura && altura ? { comprimento, largura, altura } : null
}

type ProdutoLido = {
  id: string
  title?: string | null
  handle?: string | null
  status?: string | null
  description?: string | null
  metadata?: Record<string, unknown> | null
  images?: ({ url?: string | null; rank?: number | null } | null)[] | null
  categories?: ({ id?: string; name?: string | null } | null)[] | null
  sales_channels?: ({ id?: string } | null)[] | null
  shipping_profile?: { id?: string } | null
  variants?:
    | ({
        id: string
        sku?: string | null
        weight?: unknown
        length?: unknown
        width?: unknown
        height?: unknown
        price_set?: { id?: string } | null
        inventory_items?: ({ inventory_item_id?: string | null } | null)[] | null
      } | null)[]
    | null
}

export async function lerOSite(container: MedusaContainer): Promise<ProdutoDoSite[]> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "status",
      "description",
      "metadata",
      "images.url",
      "images.rank",
      "categories.id",
      "categories.name",
      "sales_channels.id",
      "shipping_profile.id",
      "variants.id",
      "variants.sku",
      "variants.weight",
      "variants.length",
      "variants.width",
      "variants.height",
      "variants.price_set.id",
      "variants.inventory_items.inventory_item_id",
    ],
  })
  const produtos = data as unknown as ProdutoLido[]

  const itemDoProduto = new Map<string, string>()
  for (const p of produtos)
    for (const v of p.variants ?? [])
      for (const i of v?.inventory_items ?? [])
        if (i?.inventory_item_id) itemDoProduto.set(i.inventory_item_id, p.id)
  const reservas = itemDoProduto.size
    ? await container
        .resolve(Modules.INVENTORY)
        .listReservationItems(
          { inventory_item_id: [...itemDoProduto.keys()] },
          { select: ["id", "inventory_item_id"], take: 10000 }
        )
    : []
  const esperando = new Map<string, number>()
  for (const r of reservas) {
    const p = itemDoProduto.get(r.inventory_item_id)
    if (p) esperando.set(p, (esperando.get(p) ?? 0) + 1)
  }

  return produtos.map((p) => ({
    id: p.id,
    titulo: p.title ?? "",
    handle: p.handle ?? "",
    status: p.status ?? ProductStatus.DRAFT,
    descricao: p.description?.trim() || null,
    fotos: [...(p.images ?? [])]
      .filter((i): i is { url: string; rank?: number | null } => Boolean(i?.url))
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .map((i) => i.url),
    categorias: (p.categories ?? []).flatMap((c) =>
      c?.id ? [{ id: c.id, nome: c.name ?? c.id }] : []
    ),
    canais: (p.sales_channels ?? []).flatMap((c) => (c?.id ? [c.id] : [])),
    perfil: p.shipping_profile?.id ?? null,
    metadata: p.metadata ?? {},
    variacoes: (p.variants ?? []).flatMap((v) =>
      v
        ? [
            {
              id: v.id,
              sku: v.sku?.trim() || null,
              conjunto: v.price_set?.id ?? null,
              pesoGramas: numeroOuNulo(v.weight),
              medidas: medidasDoMedusa(v),
            },
          ]
        : []
    ),
    esperando: esperando.get(p.id) ?? 0,
  }))
}

/* ── o plano (sem efeito nenhum: é o que a prévia mostra e o teste confere) ── */

export type Como = "atualiza" | "recria" | "novo"

export type VariacaoPlanejada = {
  sku: string
  titulo: string
  opcoes: Record<string, string>
  /** Em reais. */
  preco: number
  pesoGramas: number | null
  medidas: MedidasDaCaixa | null
}

export type ItemDoPlano = {
  erp: ProdutoNoErp
  como: Como
  /** O endereço que o produto vai ter (o de hoje, no atualiza e no recria). */
  handle: string
  /** Os produtos do site com os mesmos SKUs; no recria, o primeiro é quem passa o endereço. */
  noSite: string[]
  variacoes: VariacaoPlanejada[]
  /**
   * A primeira vez que o produto vem do ERP (novo, recriado, ou sem a marca
   * `fb_erp`): é só nela que o "do zero" vale — saem o subtítulo, os textos
   * da página e o "de/por", e as fotos passam a ser as do ERP. Da segunda em
   * diante, o que a equipe refez no site depois (textos, promoção, as fotos
   * da Nuvemshop) fica.
   */
  primeira: boolean
  /** As fotos do ERP entram (na primeira vez, ou no produto que está sem foto). */
  fotosDoErp: boolean
  /**
   * O nome que a equipe deu no painel (`fb_nome`): ele fica, e o do ERP não
   * entra. Null é o nome do ERP, como sempre.
   */
  nomeDaLoja: string | null
  /** Por que não entra. */
  bloqueio: string | null
  avisos: string[]
}

/** Os SKUs do produto no ERP: o dele, ou os das variações. */
export function skusDoErp(p: ProdutoNoErp): string[] {
  const skus = p.variacoes.length ? p.variacoes.map((v) => v.sku) : [p.sku]
  return skus.filter((s): s is string => Boolean(s))
}

/**
 * As variações que entram, cada uma com o preço, o peso e as medidas que
 * valem (os dela, senão os do produto). Produto simples vira uma variação
 * "Único" — o mesmo formato dos produtos que já estão no site.
 */
export function variacoesDoProduto(p: ProdutoNoErp): {
  variacoes: VariacaoPlanejada[]
  avisos: string[]
  bloqueio: string | null
} {
  const avisos: string[] = []
  if (!p.variacoes.length) {
    if (!p.sku) return { variacoes: [], avisos, bloqueio: "sem código (SKU) no ERP" }
    if (!p.preco) return { variacoes: [], avisos, bloqueio: "sem preço de venda no ERP" }
    return {
      variacoes: [
        {
          sku: p.sku,
          titulo: "Único",
          opcoes: { Tamanho: "Único" },
          preco: p.preco,
          pesoGramas: p.pesoGramas,
          medidas: p.medidas,
        },
      ],
      avisos,
      bloqueio: null,
    }
  }

  const variacoes: VariacaoPlanejada[] = []
  for (const v of p.variacoes) {
    const nome = Object.values(v.opcoes).join(" / ") || v.sku || v.id
    if (!v.sku) {
      avisos.push(`a variação ${nome} não tem código (SKU) no ERP: fica de fora`)
      continue
    }
    const preco = v.preco ?? p.preco
    if (!preco) {
      avisos.push(`a variação ${nome} não tem preço no ERP: fica de fora`)
      continue
    }
    variacoes.push({
      sku: v.sku,
      titulo: nome,
      opcoes: Object.keys(v.opcoes).length ? { ...v.opcoes } : { Opção: nome },
      preco,
      pesoGramas: v.pesoGramas ?? p.pesoGramas,
      medidas: v.medidas ?? p.medidas,
    })
  }
  if (!variacoes.length)
    return { variacoes, avisos, bloqueio: "nenhuma variação com código e preço no ERP" }

  // Toda variação precisa de um valor em cada opção, e duas não podem ser iguais.
  const titulos = [...new Set(variacoes.flatMap((v) => Object.keys(v.opcoes)))]
  for (const v of variacoes) for (const t of titulos) v.opcoes[t] ??= "—"
  const combinacoes = new Set(variacoes.map((v) => titulos.map((t) => v.opcoes[t]).join("\u0000")))
  if (combinacoes.size !== variacoes.length)
    return { variacoes: [], avisos, bloqueio: "duas variações com as mesmas opções no ERP" }
  return { variacoes, avisos, bloqueio: null }
}

/** Um handle que ninguém usa, a partir do nome: "oleo-para-barba", "oleo-para-barba-2"… */
export function handleLivre(nome: string, usados: Set<string>): string {
  const base = gerarHandle(nome).slice(0, 80).replace(/-+$/, "") || "produto"
  let handle = base
  for (let n = 2; usados.has(handle); n++) handle = `${base}-${n}`
  usados.add(handle)
  return handle
}

const mesmoConjunto = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x))

function avisosDosCampos(i: ItemDoPlano, temFoto: boolean): string[] {
  const mantem = i.como !== "novo"
  const avisos: string[] = []
  // Da segunda vez em diante, a foto do site fica de qualquer jeito.
  if (!i.erp.fotos.length && (i.primeira || !temFoto))
    avisos.push(mantem && temFoto ? "sem foto no ERP: ficam as fotos de hoje" : "sem foto no ERP")
  if (i.variacoes.some((v) => !v.pesoGramas))
    avisos.push(
      mantem ? "sem peso no ERP: fica o peso de hoje" : "sem peso no ERP: o frete não cota sem ele"
    )
  if (i.variacoes.some((v) => !v.medidas))
    avisos.push(mantem ? "sem medidas no ERP: ficam as de hoje" : "sem medidas da caixa no ERP")
  if (!i.erp.descricao)
    avisos.push(mantem ? "sem descrição no ERP: fica a de hoje" : "sem descrição no ERP")
  return avisos
}

export function planejar(doErp: ProdutoNoErp[], doSite: ProdutoDoSite[]): ItemDoPlano[] {
  const site = new Map(doSite.map((s) => [s.id, s]))
  const donoDoSku = new Map<string, string>()
  for (const s of doSite) for (const v of s.variacoes) if (v.sku) donoDoSku.set(v.sku, s.id)

  const itens: ItemDoPlano[] = doErp.map((erp) => {
    const { variacoes, avisos, bloqueio } = variacoesDoProduto(erp)
    // O que o site tem destes SKUs, inclusive os de variação que não entra.
    const noSite = [...new Set(skusDoErp(erp).flatMap((sku) => donoDoSku.get(sku) ?? []))]
    return {
      erp,
      como: "novo",
      handle: "",
      noSite,
      variacoes,
      primeira: true,
      fotosDoErp: false,
      nomeDaLoja: null,
      bloqueio,
      avisos,
    }
  })

  // O mesmo SKU em dois produtos do ERP: nenhum dos dois entra.
  const vezes = new Map<string, number>()
  for (const i of itens) for (const s of skusDoErp(i.erp)) vezes.set(s, (vezes.get(s) ?? 0) + 1)
  // Um produto do site com SKUs de dois produtos do ERP: não dá pra saber quem herda.
  const cobertura = new Map<string, number>()
  for (const i of itens) for (const id of i.noSite) cobertura.set(id, (cobertura.get(id) ?? 0) + 1)

  const usados = new Set(doSite.map((s) => s.handle))
  for (const i of itens) {
    if (i.bloqueio) continue
    const repetido = skusDoErp(i.erp).find((s) => (vezes.get(s) ?? 0) > 1)
    if (repetido) {
      i.bloqueio = `o código ${repetido} está em mais de um produto do ERP`
      continue
    }
    const juntado = i.noSite.find((id) => (cobertura.get(id) ?? 0) > 1)
    if (juntado) {
      i.bloqueio =
        `o produto do site “${site.get(juntado)?.titulo}” tem códigos de mais de um produto ` +
        "do ERP — separe no admin antes"
      continue
    }
    if (!i.noSite.length) {
      i.como = "novo"
      i.handle = handleLivre(i.erp.nome, usados)
      continue
    }
    const skus = i.variacoes.map((v) => v.sku)
    const unico = i.noSite.length === 1 ? site.get(i.noSite[0]!) : undefined
    const doUnico = unico?.variacoes.map((v) => v.sku) ?? []
    const mesmas =
      unico && doUnico.every((s): s is string => Boolean(s)) && mesmoConjunto(doUnico, skus)
    i.como = mesmas ? "atualiza" : "recria"
    if (i.como === "recria") {
      // Passa o endereço quem tem o primeiro SKU do produto.
      const principal = donoDoSku.get(skus[0] ?? "")
      if (principal && i.noSite.includes(principal))
        i.noSite = [principal, ...i.noSite.filter((id) => id !== principal)]
    }
    i.handle = site.get(i.noSite[0]!)?.handle ?? handleLivre(i.erp.nome, usados)
  }
  for (const i of itens) {
    if (i.bloqueio) continue
    // O de hoje: o reescrito no atualiza; o que passa o endereço no recria.
    const deHoje = i.noSite.length ? site.get(i.noSite[0]!) : undefined
    const temFoto = Boolean(deHoje?.fotos.length)
    const escolhidas = Boolean((deHoje?.metadata as Record<string, unknown>)?.[MARCA_DAS_FOTOS])
    i.primeira = i.como !== "atualiza" || !marcaDe(deHoje?.metadata)
    i.fotosDoErp = i.erp.fotos.length > 0 && !(temFoto && escolhidas) && (i.primeira || !temFoto)
    i.nomeDaLoja = deHoje && temNomeDaLoja(deHoje.metadata) ? deHoje.titulo : null
    i.avisos.push(...avisosDosCampos(i, temFoto))
  }
  return itens
}

/* ── a prévia ─────────────────────────────────────────────────────────────── */

export type ProdutoNaPrevia = {
  id: string
  nome: string
  skus: string[]
  como: Como
  handle: string
  /** A primeira vez que ele vem do ERP (ver `ItemDoPlano.primeira`). */
  primeira: boolean
  /** O nome da loja, que fica no lugar do `nome` do ERP (ver `ItemDoPlano.nomeDaLoja`). */
  nomeDaLoja: string | null
  bloqueio: string | null
  avisos: string[]
  noSite: string[]
  /** Em reais: o menor e o maior das variações. */
  preco: { de: number; ate: number } | null
  pesoGramas: number | null
  medidas: MedidasDaCaixa | null
  /** Os links do ERP, pra ver na prévia (os que sobem pra loja são outros). */
  fotos: string[]
  variacoes: number
  composicao: boolean
  descricao: string | null
}

export type ProdutoDoSiteNaPrevia = {
  id: string
  titulo: string
  handle: string
  status: string
  skus: string[]
  categorias: string[]
  /** O que o cliente paga hoje, e o "de" riscado, se houver promoção. */
  preco: number | null
  precoDe: number | null
  pesoGramas: number | null
  medidas: MedidasDaCaixa | null
  fotos: number
  temTextos: boolean
  esperando: number
}

export type PreviaDoCatalogo = {
  erp: { id: string; nome: string }
  lidoEm: string
  produtos: ProdutoNaPrevia[]
  doSite: ProdutoDoSiteNaPrevia[]
  restantes: number
}

export type Falha = { ok: false; status: number; motivo: string }
const falha = (status: number, motivo: string): Falha => ({ ok: false, status, motivo })

async function conectado(
  container: MedusaContainer
): Promise<{ erp: ErpDaLoja; acesso: Acesso } | Falha> {
  const erp = erpDaLoja()
  if (!erp) return falha(409, "erp_desconectado")
  const acesso = await acessoAoErp(container, erp)
  if (!acesso) return falha(409, "erp_desconectado")
  return { erp, acesso }
}

/** O preço de hoje (o que o cliente paga, e o cheio) da primeira variação de cada produto. */
async function precosDeHoje(
  container: MedusaContainer,
  site: ProdutoDoSite[]
): Promise<Map<string, { preco: number | null; de: number | null }>> {
  const conjuntoDo = new Map<string, string>()
  for (const s of site) {
    const c = s.variacoes[0]?.conjunto
    if (c) conjuntoDo.set(c, s.id)
  }
  const mapa = new Map<string, { preco: number | null; de: number | null }>()
  if (!conjuntoDo.size) return mapa
  const calculados = await container
    .resolve(Modules.PRICING)
    .calculatePrices({ id: [...conjuntoDo.keys()] }, { context: { currency_code: MOEDA } })
  for (const c of calculados) {
    const produto = conjuntoDo.get(c.id)
    if (!produto) continue
    const preco = numeroOuNulo(c.calculated_amount)
    const cheio = numeroOuNulo(c.original_amount)
    mapa.set(produto, { preco, de: cheio && preco && cheio > preco ? cheio : null })
  }
  return mapa
}

const faixa = (valores: number[]) =>
  valores.length ? { de: Math.min(...valores), ate: Math.max(...valores) } : null

export async function lerPrevia(
  container: MedusaContainer,
  agora = new Date()
): Promise<{ ok: true; previa: PreviaDoCatalogo } | Falha> {
  const c = await conectado(container)
  if ("ok" in c) return c
  const { erp, acesso } = c

  const leitura = await erp.lerCatalogo(acesso)
  if (!leitura.ok) return falha(502, `não consegui ler o ${erp.nome}: ${leitura.motivo}`)
  const site = await lerOSite(container)
  const plano = planejar(leitura.produtos, site)
  const precos = await precosDeHoje(container, site)

  return {
    ok: true,
    previa: {
      erp: { id: erp.id, nome: erp.nome },
      lidoEm: agora.toISOString(),
      restantes: leitura.restantes,
      produtos: plano.map((i) => ({
        id: i.erp.id,
        nome: i.erp.nome,
        skus: skusDoErp(i.erp),
        como: i.como,
        handle: i.handle,
        primeira: i.primeira,
        nomeDaLoja: i.nomeDaLoja,
        bloqueio: i.bloqueio,
        avisos: i.avisos,
        noSite: i.noSite,
        preco:
          faixa(i.variacoes.map((v) => v.preco)) ??
          (i.erp.preco ? { de: i.erp.preco, ate: i.erp.preco } : null),
        pesoGramas: i.variacoes[0]?.pesoGramas ?? i.erp.pesoGramas,
        medidas: i.variacoes[0]?.medidas ?? i.erp.medidas,
        fotos: i.erp.fotos.map((f) => f.url),
        variacoes: i.erp.variacoes.length,
        composicao: i.erp.composicao,
        descricao:
          i.erp.descricao && i.erp.descricao.length > 280
            ? `${i.erp.descricao.slice(0, 279).trimEnd()}…`
            : i.erp.descricao,
      })),
      doSite: site.map((s) => ({
        id: s.id,
        titulo: s.titulo,
        handle: s.handle,
        status: s.status,
        skus: s.variacoes.flatMap((v) => (v.sku ? [v.sku] : [])),
        categorias: s.categorias.map((cat) => cat.nome),
        preco: precos.get(s.id)?.preco ?? null,
        precoDe: precos.get(s.id)?.de ?? null,
        pesoGramas: s.variacoes[0]?.pesoGramas ?? null,
        medidas: s.variacoes[0]?.medidas ?? null,
        fotos: s.fotos.length,
        temTextos: Boolean((s.metadata as Record<string, unknown>)?.fb_pdp),
        esperando: s.esperando,
      })),
    },
  }
}

/* ── a importação ─────────────────────────────────────────────────────────── */

export type Escolha = {
  /** Ids no ERP dos produtos que entram. */
  importar: string[]
  /** Ids no site dos produtos que saem: só os que a prévia mostrou. */
  remover: string[]
}

type Resumo = { titulo: string; handle: string }

export type RelatorioDaImportacao = {
  em: string
  erp: string
  atualizados: Resumo[]
  recriados: Resumo[]
  /** Os novos, em rascunho. */
  criados: Resumo[]
  removidos: Resumo[]
  /** Os que deviam sair e têm pedido esperando envio: ficaram em rascunho. */
  rascunho: Resumo[]
  pulados: { nome: string; motivo: string }[]
  fotos: { copiadas: number; reaproveitadas: number; falharam: string[] }
  promocoes: { precos: number; listas: string[] }
  estoque: { ok: boolean; mudaram: number; motivo?: string } | null
  /** O que deu errado depois de os produtos estarem no lugar (e que os jobs refazem). */
  avisos: string[]
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e))

type Contexto = { canal: string | null; perfil: string | null; local: string | null }

/** Onde nasce o produto novo: o canal de venda da loja, o perfil de envio e o local de estoque. */
async function lerContexto(container: MedusaContainer): Promise<Contexto> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const [{ data: lojas }, { data: canais }, { data: perfis }, { data: locais }] = await Promise.all(
    [
      query.graph({ entity: "store", fields: ["default_sales_channel_id"] }),
      query.graph({ entity: "sales_channel", fields: ["id"] }),
      query.graph({ entity: "shipping_profile", fields: ["id", "type"] }),
      query.graph({ entity: "stock_location", fields: ["id"] }),
    ]
  )
  const perfisLidos = perfis as { id: string; type?: string | null }[]
  return {
    canal:
      (lojas[0] as { default_sales_channel_id?: string | null } | undefined)
        ?.default_sales_channel_id ??
      (canais[0] as { id?: string } | undefined)?.id ??
      null,
    perfil: (perfisLidos.find((p) => p.type === "default") ?? perfisLidos[0])?.id ?? null,
    local: (locais[0] as { id?: string } | undefined)?.id ?? null,
  }
}

/** Baixa do ERP e sobe pra loja; a foto que já veio numa importação anterior não sobe de novo. */
async function copiarFotos(
  container: MedusaContainer,
  handle: string,
  fotos: FotoNoErp[],
  anteriores: FotoCopiada[],
  relatorio: RelatorioDaImportacao
): Promise<FotoCopiada[]> {
  const ja = new Map(anteriores.map((f) => [f.chave, f.url]))
  const copiadas: FotoCopiada[] = []
  for (const [n, foto] of fotos.entries()) {
    const url = ja.get(foto.chave)
    if (url) {
      copiadas.push({ chave: foto.chave, url })
      relatorio.fotos.reaproveitadas++
      continue
    }
    const baixada = await baixarFoto(foto.url)
    if (!baixada.ok) {
      relatorio.fotos.falharam.push(`${handle}, foto ${n + 1}: ${baixada.motivo}`)
      continue
    }
    copiadas.push({
      chave: foto.chave,
      url: await guardarFoto(container, `${handle}-${n + 1}`, baixada),
    })
    relatorio.fotos.copiadas++
  }
  return copiadas
}

/**
 * Cada chave que o produto tem, marcada pra sair (o Medusa apaga a chave que
 * vem vazia) — menos a das fotos escolhidas, que o ERP não troca.
 */
const semAsChavesDeHoje = (metadata: Record<string, unknown>) =>
  Object.fromEntries(
    Object.keys(metadata)
      .filter((k) => k !== MARCA_DAS_FOTOS && k !== MARCA_DO_NOME)
      .map((k) => [k, ""])
  )

const medidasPraMedusa = (m: MedidasDaCaixa | null) =>
  m ? { length: m.comprimento, width: m.largura, height: m.altura } : {}

async function atualizarNoLugar(
  container: MedusaContainer,
  i: ItemDoPlano,
  s: ProdutoDoSite,
  marca: MarcaDoErp
) {
  const v1 = i.variacoes[0]!
  const fotos = i.fotosDoErp ? marca.fotos : []
  await updateProductsWorkflow(container).run({
    input: {
      selector: { id: s.id },
      update: {
        title: i.nomeDaLoja ?? i.erp.nome,
        ...(i.primeira ? { subtitle: null } : {}),
        ...(i.erp.descricao ? { description: i.erp.descricao } : {}),
        ...(fotos.length
          ? { images: fotos.map((f) => ({ url: f.url })), thumbnail: fotos[0]!.url }
          : {}),
        ...(v1.pesoGramas ? { weight: v1.pesoGramas } : {}),
        ...medidasPraMedusa(v1.medidas),
        // Na primeira vez, toda chave de hoje sai (os textos da página, o
        // `tipo` do kit antigo); depois, só a marca do ERP muda.
        metadata: i.primeira
          ? { ...semAsChavesDeHoje(s.metadata), [MARCA_DO_ERP]: marca }
          : { [MARCA_DO_ERP]: marca },
      },
    },
  })
  const planejada = new Map(i.variacoes.map((v) => [v.sku, v]))
  await updateProductVariantsWorkflow(container).run({
    input: {
      product_variants: s.variacoes.flatMap((v) => {
        const p = v.sku ? planejada.get(v.sku) : undefined
        if (!p) return []
        return [
          {
            id: v.id,
            prices: [{ amount: p.preco, currency_code: MOEDA }],
            ...(p.pesoGramas ? { weight: p.pesoGramas } : {}),
            ...medidasPraMedusa(p.medidas),
          },
        ]
      }),
    },
  })
}

type Heranca = {
  handle: string
  status: ProductStatus
  categorias: string[]
  canais: string[]
  perfil: string | null
  /** O que o ERP não tem e o produto que sai tinha. */
  descricao: string | null
  fotos: string[]
  pesoGramas: number | null
  medidas: MedidasDaCaixa | null
  /** A marca `fb_nome` do produto que sai: o nome da loja passa pro novo. */
  marcaDoNome: unknown
}

async function criarProduto(
  container: MedusaContainer,
  i: ItemDoPlano,
  h: Heranca,
  marca: MarcaDoErp,
  contexto: Contexto
): Promise<string> {
  const titulos = [...new Set(i.variacoes.flatMap((v) => Object.keys(v.opcoes)))]
  const fotos = marca.fotos.length ? marca.fotos.map((f) => f.url) : h.fotos
  const primeira = i.variacoes[0]!
  const {
    result: [produto],
  } = await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: i.nomeDaLoja ?? i.erp.nome,
          handle: h.handle,
          status: h.status,
          ...((i.erp.descricao ?? h.descricao)
            ? { description: i.erp.descricao ?? h.descricao! }
            : {}),
          ...((primeira.pesoGramas ?? h.pesoGramas)
            ? { weight: primeira.pesoGramas ?? h.pesoGramas! }
            : {}),
          ...medidasPraMedusa(primeira.medidas ?? h.medidas),
          ...(fotos.length ? { thumbnail: fotos[0]!, images: fotos.map((url) => ({ url })) } : {}),
          ...(h.perfil ? { shipping_profile_id: h.perfil } : {}),
          category_ids: h.categorias,
          sales_channels: h.canais.map((id) => ({ id })),
          metadata: {
            [MARCA_DO_ERP]: marca,
            ...(i.nomeDaLoja && h.marcaDoNome ? { [MARCA_DO_NOME]: h.marcaDoNome } : {}),
          },
          options: titulos.map((t) => ({
            title: t,
            values: [...new Set(i.variacoes.map((v) => v.opcoes[t]!))],
          })),
          variants: i.variacoes.map((v) => ({
            title: v.titulo,
            sku: v.sku,
            manage_inventory: true,
            options: v.opcoes,
            prices: [{ amount: v.preco, currency_code: MOEDA }],
            ...((v.pesoGramas ?? h.pesoGramas) ? { weight: v.pesoGramas ?? h.pesoGramas! } : {}),
            ...medidasPraMedusa(v.medidas ?? h.medidas),
          })),
        },
      ],
    },
  })

  // O estoque: um nível no local da loja, zerado — a sincronização, logo
  // depois, põe o saldo do ERP. Sem o nível, ela não tem onde escrever.
  if (contexto.local) {
    const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "product_variant",
      fields: ["inventory_items.inventory_item_id"],
      filters: { product_id: produto!.id },
    })
    const itens = (
      data as { inventory_items?: ({ inventory_item_id?: string | null } | null)[] | null }[]
    ).flatMap((v) => (v.inventory_items ?? []).flatMap((x) => x?.inventory_item_id ?? []))
    if (itens.length) {
      await createInventoryLevelsWorkflow(container).run({
        input: {
          inventory_levels: itens.map((item) => ({
            inventory_item_id: item,
            location_id: contexto.local!,
            stocked_quantity: 0,
          })),
        },
      })
    }
  }
  return produto!.id
}

/** Sai do site: apagado; com pedido esperando envio, rascunho (o Medusa não apaga com reserva). */
async function tirarDoSite(
  container: MedusaContainer,
  s: ProdutoDoSite
): Promise<"removido" | "rascunho"> {
  if (!s.esperando) {
    try {
      await deleteProductsWorkflow(container).run({ input: { ids: [s.id] } })
      return "removido"
    } catch (e) {
      if (!/reservation/i.test(mensagem(e))) throw e
    }
  }
  if (s.status !== ProductStatus.DRAFT) {
    await updateProductsWorkflow(container).run({
      input: { selector: { id: s.id }, update: { status: ProductStatus.DRAFT } },
    })
  }
  return "rascunho"
}

/** As listas de preço (fora a do desconto por quantidade) com preço destes conjuntos. */
async function listasComPrecoDe(
  container: MedusaContainer,
  conjuntos: string[]
): Promise<{ id: string; titulo: string }[]> {
  if (!conjuntos.length) return []
  const pricing = container.resolve(Modules.PRICING)
  const listas = await pricing.listPriceLists({}, { select: ["id", "title"], take: 500 })
  const tocadas: { id: string; titulo: string }[] = []
  for (const l of listas) {
    if (l.title === TITULO_DA_LISTA) continue
    const precos = await pricing.listPrices(
      { price_list_id: [l.id], price_set_id: conjuntos },
      { select: ["id"], take: 1 }
    )
    if (precos.length) tocadas.push({ id: l.id, titulo: l.title ?? l.id })
  }
  return tocadas
}

/**
 * A PROMOÇÃO SAI: o preço passa a ser o do ERP. Tira das listas o preço das
 * variações reescritas (as apagadas levam o delas junto) e apaga a lista que
 * ficou vazia por causa disso — a de "Promoção de lançamento", com o
 * contador da vitrine. A do desconto por quantidade não: o job refaz.
 */
async function tirarPromocoes(
  container: MedusaContainer,
  conjuntos: string[],
  tocadas: { id: string; titulo: string }[],
  relatorio: RelatorioDaImportacao
) {
  const pricing = container.resolve(Modules.PRICING)
  for (const lista of tocadas) {
    const precos = conjuntos.length
      ? await pricing.listPrices(
          { price_list_id: [lista.id], price_set_id: conjuntos },
          { select: ["id"], take: 5000 }
        )
      : []
    if (precos.length) {
      await batchPriceListPricesWorkflow(container).run({
        input: { data: { id: lista.id, create: [], update: [], delete: precos.map((p) => p.id) } },
      })
      relatorio.promocoes.precos += precos.length
    }
    const sobram = await pricing.listPrices(
      { price_list_id: [lista.id] },
      { select: ["id"], take: 1 }
    )
    if (!sobram.length) {
      await deletePriceListsWorkflow(container).run({ input: { ids: [lista.id] } })
      relatorio.promocoes.listas.push(lista.titulo)
    }
  }
}

/**
 * O PRODUTO QUE MUDA DE FORMATO (recria): o do site sai e nasce outro com o
 * endereço dele. O endereço e os SKUs são únicos, então o velho sai do
 * caminho primeiro (rascunho, com "-velho-…" no handle e nos SKUs); se o
 * novo não nascer, o velho volta como era.
 */
async function recriar(
  container: MedusaContainer,
  i: ItemDoPlano,
  velhos: ProdutoDoSite[],
  marca: MarcaDoErp,
  contexto: Contexto
): Promise<{ avisos: string[] }> {
  const principal = velhos[0]!
  const sufixo = `-velho-${Date.now().toString(36)}`
  const tirarDoCaminho = async (voltar: boolean) => {
    for (const v of velhos) {
      await updateProductsWorkflow(container).run({
        input: {
          selector: { id: v.id },
          update: voltar
            ? { handle: v.handle, status: v.status as ProductStatus }
            : { handle: `${v.handle}${sufixo}`, status: ProductStatus.DRAFT },
        },
      })
      const comSku = v.variacoes.filter((x) => x.sku)
      if (comSku.length) {
        await updateProductVariantsWorkflow(container).run({
          input: {
            product_variants: comSku.map((x) => ({
              id: x.id,
              sku: voltar ? x.sku! : `${x.sku}${sufixo}`,
            })),
          },
        })
      }
    }
  }

  await tirarDoCaminho(false)
  try {
    await criarProduto(
      container,
      i,
      {
        handle: principal.handle,
        status: principal.status as ProductStatus,
        categorias: principal.categorias.map((c) => c.id),
        canais: principal.canais.length ? principal.canais : contexto.canal ? [contexto.canal] : [],
        perfil: principal.perfil ?? contexto.perfil,
        descricao: principal.descricao,
        fotos: principal.fotos,
        marcaDoNome: principal.metadata[MARCA_DO_NOME] ?? null,
        pesoGramas: principal.variacoes[0]?.pesoGramas ?? null,
        medidas: principal.variacoes[0]?.medidas ?? null,
      },
      marca,
      contexto
    )
  } catch (e) {
    await tirarDoCaminho(true)
    throw e
  }

  const avisos: string[] = []
  for (const v of velhos) {
    try {
      await deleteProductsWorkflow(container).run({ input: { ids: [v.id] } })
    } catch (e) {
      avisos.push(
        `“${v.titulo}” (o antigo) ficou em rascunho como ${v.handle}${sufixo}: ${mensagem(e)}`
      )
    }
  }
  return { avisos }
}

export async function importarCatalogo(
  container: MedusaContainer,
  escolha: Escolha,
  agora = new Date()
): Promise<{ ok: true; relatorio: RelatorioDaImportacao } | Falha> {
  const c = await conectado(container)
  if ("ok" in c) return c
  const { erp, acesso } = c
  if (!escolha.importar.length && !escolha.remover.length) return falha(400, "nada escolhido")
  if (process.env.NODE_ENV === "production" && !process.env.S3_BUCKET) {
    return falha(
      409,
      "sem o S3_BUCKET as fotos iriam pro disco do servidor e sumiriam no próximo deploy — " +
        "configure as variáveis S3_* no Railway antes"
    )
  }

  try {
    return await container
      .resolve(Modules.LOCKING)
      .execute(`erp-catalogo:${erp.id}`, () => importar(container, erp, acesso, escolha, agora), {
        timeout: 5,
      })
  } catch (e) {
    if (/acquiring lock/i.test(mensagem(e)))
      return falha(
        409,
        "já tem uma importação andando — espere ela terminar e abra a prévia de novo"
      )
    throw e
  }
}

async function importar(
  container: MedusaContainer,
  erp: ErpDaLoja,
  acesso: Acesso,
  escolha: Escolha,
  agora: Date
): Promise<{ ok: true; relatorio: RelatorioDaImportacao } | Falha> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const relatorio: RelatorioDaImportacao = {
    em: agora.toISOString(),
    erp: erp.id,
    atualizados: [],
    recriados: [],
    criados: [],
    removidos: [],
    rascunho: [],
    pulados: [],
    fotos: { copiadas: 0, reaproveitadas: 0, falharam: [] },
    promocoes: { precos: 0, listas: [] },
    estoque: null,
    avisos: [],
  }

  /* 1. O ERP de novo, só os escolhidos: a prévia pode ter ficado velha. */
  const leitura = escolha.importar.length
    ? await erp.lerCatalogo(acesso, escolha.importar)
    : { ok: true as const, produtos: [], naoAchados: [], restantes: 0 }
  if (!leitura.ok)
    return falha(502, `não consegui ler o ${erp.nome}: ${leitura.motivo}. Nada foi mudado.`)
  for (const id of leitura.naoAchados)
    relatorio.pulados.push({ nome: `produto ${id}`, motivo: `não está mais ativo no ${erp.nome}` })

  /* 2. O plano, contra o site de agora. */
  const site = await lerOSite(container)
  const porId = new Map(site.map((s) => [s.id, s]))
  const plano = planejar(leitura.produtos, site)
  for (const i of plano)
    if (i.bloqueio) relatorio.pulados.push({ nome: i.erp.nome, motivo: i.bloqueio })
  const validos = plano.filter((i) => !i.bloqueio)

  const recriaveis = validos.filter((i) => {
    if (i.como !== "recria") return false
    const preso = i.noSite.map((id) => porId.get(id)!).find((s) => s.esperando > 0)
    if (preso)
      relatorio.pulados.push({
        nome: i.erp.nome,
        motivo:
          `“${preso.titulo}”, no site, tem pedido esperando envio e não pode ser trocado agora — ` +
          "importe de novo depois de enviar",
      })
    return !preso
  })
  const atualizar = validos.filter((i) => i.como === "atualiza")
  const novos = validos.filter((i) => i.como === "novo")

  // Sai só o que a pessoa viu na prévia, e nunca o que um escolhido cobre.
  const cobertos = new Set(validos.flatMap((i) => i.noSite))
  const sair = [...new Set(escolha.remover)].flatMap((id) => {
    const s = porId.get(id)
    return s && !cobertos.has(id) ? [s] : []
  })

  /* 3. As fotos, antes de mexer em qualquer produto: se o armazenamento
        falhar, nada mudou. */
  const marcas = new Map<ItemDoPlano, MarcaDoErp>()
  for (const i of [...atualizar, ...recriaveis, ...novos]) {
    const anteriores = i.noSite.flatMap((id) => marcaDe(porId.get(id)?.metadata)?.fotos ?? [])
    marcas.set(i, {
      erp: erp.id,
      id: i.erp.id,
      nome: i.erp.nome,
      // Quem fica com as fotos de hoje não baixa nada: a marca guarda as do ERP de antes.
      fotos: i.fotosDoErp
        ? await copiarFotos(container, i.handle, i.erp.fotos, anteriores, relatorio)
        : anteriores,
    })
  }

  // As promoções que apontam pros produtos mexidos, antes de mexer neles. O
  // apagado leva o preço junto; o que fica (reescrito pela primeira vez, ou em
  // rascunho por ter pedido esperando) perde o dele no passo 8. O que já veio
  // do ERP antes guarda a promoção que a equipe criou depois.
  const conjuntos = [
    ...atualizar.filter((i) => i.primeira).map((i) => porId.get(i.noSite[0]!)!),
    ...sair,
    ...recriaveis.flatMap((i) => i.noSite.map((id) => porId.get(id)!)),
  ].flatMap((s) => s.variacoes.flatMap((v) => (v.conjunto ? [v.conjunto] : [])))
  const tocadas = await listasComPrecoDe(container, conjuntos)
  const contexto = await lerContexto(container)
  const mexidos = new Set<string>()

  /* 4. O que sai. */
  for (const s of sair) {
    try {
      const como = await tirarDoSite(container, s)
      relatorio[como === "removido" ? "removidos" : "rascunho"].push({
        titulo: s.titulo,
        handle: s.handle,
      })
      mexidos.add(s.handle)
    } catch (e) {
      relatorio.avisos.push(`“${s.titulo}” não saiu: ${mensagem(e)}`)
    }
  }

  /* 5. O mesmo SKU: reescrito no lugar. */
  for (const i of atualizar) {
    const s = porId.get(i.noSite[0]!)!
    try {
      await atualizarNoLugar(container, i, s, marcas.get(i)!)
      relatorio.atualizados.push({ titulo: i.erp.nome, handle: s.handle })
      mexidos.add(s.handle)
    } catch (e) {
      relatorio.pulados.push({ nome: i.erp.nome, motivo: `o Medusa recusou: ${mensagem(e)}` })
    }
  }

  /* 6. Mudou de formato: o velho sai do caminho e nasce o novo, com o endereço dele. */
  for (const i of recriaveis) {
    try {
      const { avisos } = await recriar(
        container,
        i,
        i.noSite.map((id) => porId.get(id)!),
        marcas.get(i)!,
        contexto
      )
      relatorio.avisos.push(...avisos)
      relatorio.recriados.push({ titulo: i.erp.nome, handle: i.handle })
      mexidos.add(i.handle)
    } catch (e) {
      relatorio.pulados.push({ nome: i.erp.nome, motivo: `o Medusa recusou: ${mensagem(e)}` })
    }
  }

  /* 7. Os novos: rascunho, sem categoria. */
  for (const i of novos) {
    try {
      await criarProduto(
        container,
        i,
        {
          handle: i.handle,
          status: ProductStatus.DRAFT,
          categorias: [],
          canais: contexto.canal ? [contexto.canal] : [],
          perfil: contexto.perfil,
          descricao: null,
          fotos: [],
          pesoGramas: null,
          medidas: null,
          marcaDoNome: null,
        },
        marcas.get(i)!,
        contexto
      )
      relatorio.criados.push({ titulo: i.erp.nome, handle: i.handle })
    } catch (e) {
      relatorio.pulados.push({ nome: i.erp.nome, motivo: `o Medusa recusou: ${mensagem(e)}` })
    }
  }

  /* 8. A promoção sai; o estoque, o desconto por quantidade e as ofertas se refazem. */
  try {
    await tirarPromocoes(container, conjuntos, tocadas, relatorio)
  } catch (e) {
    relatorio.avisos.push(`as promoções não foram tiradas: ${mensagem(e)}`)
  }
  try {
    const estoque = await sincronizarEstoque(container, agora)
    relatorio.estoque = estoque
      ? { ok: estoque.ok, mudaram: estoque.mudaram.length, motivo: estoque.motivo }
      : null
  } catch (e) {
    relatorio.avisos.push(
      `o estoque não sincronizou agora (o job tenta em 5 minutos): ${mensagem(e)}`
    )
  }
  try {
    await sincronizarPrecosPorQuantidade(container)
  } catch (e) {
    relatorio.avisos.push(
      `o desconto por quantidade não se refez agora (o job refaz em 15 minutos): ${mensagem(e)}`
    )
  }
  try {
    await sincronizarBumps(container)
  } catch (e) {
    relatorio.avisos.push(
      `as ofertas do checkout não se refizeram agora (o job refaz em 1 hora): ${mensagem(e)}`
    )
  }
  await avisarALoja(["produtos", "promocao", ...[...mexidos].map((h) => `produto:${h}`)], logger)

  logger.info(
    `[erp] catálogo do ${erp.nome}: ${relatorio.atualizados.length} atualizado(s), ` +
      `${relatorio.recriados.length} recriado(s), ${relatorio.criados.length} novo(s), ` +
      `${relatorio.removidos.length} removido(s), ${relatorio.rascunho.length} em rascunho, ` +
      `${relatorio.pulados.length} pulado(s); fotos: ${relatorio.fotos.copiadas} copiada(s), ` +
      `${relatorio.fotos.falharam.length} falha(s)`
  )
  return { ok: true, relatorio }
}
