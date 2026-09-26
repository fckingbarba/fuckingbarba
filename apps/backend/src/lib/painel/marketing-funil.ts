import type { Data } from "./formato"
import {
  datasDo,
  dentro,
  SO_AS_COMPRAS_DA_LOJA,
  soDoEndereco,
  type Janela,
  type Periodo,
} from "./marketing"
import type { Achado } from "./marketing-canais"
import type { LinhaGa4, RelatorioGa4 } from "./visitas"

/**
 * O FUNIL DO MARKETING — onde as pessoas desistem. A aba "Funil" do
 * protótipo, em três pedaços:
 *
 * - DO SITE ATÉ O PAGAMENTO, pelo GA4: as sessões com cada evento que a
 *   loja manda (`apps/loja/src/lib/rastrear.ts`: view_item, add_to_cart,
 *   begin_checkout, add_shipping_info e add_payment_info) e as compras que
 *   ela manda pelo servidor. Só de quem aceitou os cookies — como as visitas.
 * - DA SACOLA AO PAGAMENTO, pelos carrinhos da loja: todo mundo, com cookie
 *   ou sem. Os passos acumulam (quem escolheu a entrega também deu o
 *   e-mail), com a régua do checkout (`carrinhos.ts`, `ondeParou`).
 * - CELULAR E COMPUTADOR: as visitas do GA4 por aparelho, e os pedidos pagos
 *   pelo navegador que o rastro da compra guardou (`fb_rastro`, só com o sim
 *   — os dois lados contam as mesmas pessoas).
 *
 * Código puro, com testes (`__tests__/marketing-funil.unit.spec.ts`).
 */

export type Passo = {
  nome: string
  n: number
  /** Quanto passou do passo anterior, em %; `null` no primeiro (ou com o anterior zerado). */
  taxa: number | null
  /** A maior perda do funil: de onde mais gente sai. */
  pior: boolean
}

const EVENTOS = [
  "view_item",
  "add_to_cart",
  "begin_checkout",
  "add_shipping_info",
  "add_payment_info",
] as const

type ChaveDoPasso = "sessoes" | (typeof EVENTOS)[number] | "purchase"

/** Os passos do site, o nome na tela e o verbo da frase ("8 em cada 10 que veem um produto não põem na sacola"). */
const PASSOS_DO_SITE: { chave: ChaveDoPasso; nome: string; verbo: string }[] = [
  { chave: "sessoes", nome: "Entraram no site", verbo: "entram no site" },
  { chave: "view_item", nome: "Viram um produto", verbo: "veem um produto" },
  { chave: "add_to_cart", nome: "Puseram na sacola", verbo: "põem na sacola" },
  { chave: "begin_checkout", nome: "Começaram o checkout", verbo: "começam o checkout" },
  { chave: "add_shipping_info", nome: "Escolheram a entrega", verbo: "escolhem a entrega" },
  { chave: "add_payment_info", nome: "Foram pagar", verbo: "vão pagar" },
  { chave: "purchase", nome: "Pagaram", verbo: "pagam" },
]

/** O que olhar primeiro, quando a maior perda é chegando em cada passo. */
const O_QUE_OLHAR: Record<ChaveDoPasso, string> = {
  sessoes: "",
  view_item: "A home e a vitrine mostram logo o que a pessoa veio procurar?",
  add_to_cart:
    "Vale revisar as páginas dos produtos mais vistos: as fotos, o texto e o que aparece abaixo do preço.",
  begin_checkout: "Na sacola: o total e o frete aparecem? O botão de fechar está à vista?",
  add_shipping_info:
    "Na entrega: o valor do frete assusta? O frete grátis aparece pra quem está perto dele?",
  add_payment_info: "Entre a entrega e o pagamento: o que a tela pede antes de pagar?",
  purchase: "No pagamento: o Pix que venceu e o cartão recusado são os suspeitos de sempre.",
}

const numero = (v: string | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}
const dimensao = (l: LinhaGa4, i: number) => l.dimensionValues?.[i]?.value ?? ""
const metrica = (l: LinhaGa4, i = 0) => numero(l.metricValues?.[i]?.value ?? undefined)
const soma = (r: RelatorioGa4 | undefined) => (r?.rows ?? []).reduce((s, l) => s + metrica(l), 0)
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const porcento = (v: number) => `${v.toFixed(2).replace(".", ",")}%`

/** As perguntas ao GA4: as sessões, as sessões com cada evento, as compras da loja e as sessões por aparelho. */
export function perguntasDoFunil(periodo: Periodo, hosts: string[]) {
  const endereco = soDoEndereco(hosts)
  const soOsEventos = {
    filter: { fieldName: "eventName", inListFilter: { values: [...EVENTOS] } },
  }
  const soDaLoja = endereco ? { dimensionFilter: endereco } : {}
  return [
    { dateRanges: datasDo(periodo), metrics: [{ name: "sessions" }], ...soDaLoja },
    {
      dateRanges: datasDo(periodo),
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: endereco
        ? { andGroup: { expressions: [endereco, soOsEventos] } }
        : soOsEventos,
    },
    {
      dateRanges: datasDo(periodo),
      metrics: [{ name: "ecommercePurchases" }],
      dimensionFilter: SO_AS_COMPRAS_DA_LOJA,
    },
    {
      dateRanges: datasDo(periodo),
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
      ...soDaLoja,
    },
  ]
}

/** Cada passo, quanto passou do anterior e a maior perda. */
export function passosDo(passos: { nome: string; n: number }[]): Passo[] {
  let pior = -1
  let maiorQueda = 0
  passos.forEach((p, i) => {
    const antes = i ? passos[i - 1].n : 0
    const queda = antes > 0 ? 1 - p.n / antes : 0
    if (queda > maiorQueda) {
      maiorQueda = queda
      pior = i
    }
  })
  return passos.map((p, i) => {
    const antes = i ? passos[i - 1].n : 0
    return {
      nome: p.nome,
      n: p.n,
      taxa: antes > 0 ? Math.round((p.n / antes) * 100) : null,
      pior: i === pior,
    }
  })
}

/** Do site até o pagamento, pelas respostas do GA4 (as três primeiras de `perguntasDoFunil`). */
export function funilDoSite([total, porEvento, compras]: RelatorioGa4[]): Passo[] {
  const valores = new Map<ChaveDoPasso, number>([
    ["sessoes", soma(total)],
    ["purchase", soma(compras)],
  ])
  for (const l of porEvento?.rows ?? [])
    valores.set(
      dimensao(l, 0) as ChaveDoPasso,
      (valores.get(dimensao(l, 0) as ChaveDoPasso) ?? 0) + metrica(l)
    )
  return passosDo(PASSOS_DO_SITE.map((p) => ({ nome: p.nome, n: valores.get(p.chave) ?? 0 })))
}

export type CarrinhoDoFunil = {
  id: string
  created_at: Data
  email?: string | null
  completed_at?: Data | null
  items?: ({ id?: string | null } | null)[] | null
  shipping_address?: { postal_code?: string | null } | null
  shipping_methods?: ({ id?: string | null } | null)[] | null
  order?: { id?: string | null } | null
}

/**
 * Da sacola ao pagamento, pelos carrinhos criados no período (com produto).
 * `pagos`: os pedidos que foram pagos (os ids). Cada passo exige os de antes.
 */
export function funilDoCheckout(
  carrinhos: CarrinhoDoFunil[],
  pagos: ReadonlySet<string>,
  j: Janela
): Passo[] {
  const sacola = carrinhos.filter(
    (c) => dentro(new Date(c.created_at), j) && (c.items ?? []).some(Boolean)
  )
  const email = sacola.filter((c) => texto(c.email))
  const frete = email.filter((c) => texto(c.shipping_address?.postal_code))
  const entrega = frete.filter((c) => (c.shipping_methods ?? []).some(Boolean))
  const fechou = entrega.filter((c) => Boolean(c.completed_at))
  const pagou = fechou.filter((c) => Boolean(c.order?.id && pagos.has(c.order.id)))
  return passosDo([
    { nome: "Puseram na sacola", n: sacola.length },
    { nome: "Deram o e-mail", n: email.length },
    { nome: "Viram o frete", n: frete.length },
    { nome: "Escolheram a entrega", n: entrega.length },
    { nome: "Fecharam o pedido", n: fechou.length },
    { nome: "Pagaram", n: pagou.length },
  ])
}

export type Aparelho = {
  nome: "Celular" | "Computador"
  visitas: number
  pedidos: number
  /** A parte das visitas, em %. */
  parte: number
  /** De cada 100 visitas no aparelho, quantas viraram pedido pago (duas casas). */
  conversao: number | null
}

/** Celular pelo navegador: o que diz "Mobi" (o padrão dos celulares), Android, iPhone ou iPad. */
const DE_CELULAR = /mobi|android|iphone|ipad|ipod/i

/**
 * As visitas por aparelho (a quarta resposta de `perguntasDoFunil`) e os
 * pedidos pagos no período por aparelho, pelo navegador do rastro da compra.
 * O tablet conta como celular. `null` sem visita nenhuma.
 */
export function aparelhosDo(
  r: RelatorioGa4 | undefined,
  pedidos: { pagoEm: Date; navegador: string | null }[],
  j: Janela
): Aparelho[] | null {
  const visitas = { Celular: 0, Computador: 0 }
  for (const l of r?.rows ?? []) {
    const d = dimensao(l, 0).toLowerCase()
    if (d === "desktop") visitas.Computador += metrica(l)
    else if (d === "mobile" || d === "tablet") visitas.Celular += metrica(l)
  }
  const total = visitas.Celular + visitas.Computador
  if (!total) return null
  const compras = { Celular: 0, Computador: 0 }
  for (const p of pedidos)
    if (p.navegador && dentro(p.pagoEm, j))
      compras[DE_CELULAR.test(p.navegador) ? "Celular" : "Computador"]++
  return (["Celular", "Computador"] as const).map((nome) => ({
    nome,
    visitas: visitas[nome],
    pedidos: compras[nome],
    parte: Math.round((visitas[nome] / total) * 100),
    conversao:
      visitas[nome] > 0 ? Math.round((compras[nome] / visitas[nome]) * 10_000) / 100 : null,
  }))
}

/** O navegador que o rastro da compra guardou (só com o sim da faixa de cookies). */
export function navegadorDoPedido(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const rastro = metadata?.fb_rastro as { navegador?: unknown } | undefined
  return typeof rastro?.navegador === "string" && rastro.navegador ? rastro.navegador : null
}

/** Abaixo disso, a maior perda pode ser acaso. */
export const MINIMO_DO_FUNIL = { sessoes: 200, porAparelho: 50 }

/**
 * O que o funil quer dizer: a maior perda do site, e o celular vendendo bem
 * menos que o computador — ou que ainda é pouco pra dizer.
 */
export function achadosDoFunil(site: Passo[] | null, aparelhos: Aparelho[] | null): Achado[] {
  if (!site) return []
  if (site[0].n < MINIMO_DO_FUNIL.sessoes)
    return [
      {
        tipo: "info",
        titulo: "Ainda é pouco pra achar onde a loja perde gente",
        texto:
          `${site[0].n} ${site[0].n === 1 ? "visita" : "visitas"} no período: qualquer passo pode parecer ` +
          "o vilão por acaso. Com mais gente (depois da virada), aqui aparece o maior vazamento.",
      },
    ]
  const achados: Achado[] = []
  const i = site.findIndex((p) => p.pior)
  if (i > 0) {
    const saem = Math.round((1 - site[i].n / site[i - 1].n) * 10)
    achados.push({
      tipo: "oportunidade",
      titulo: `${saem} em cada 10 que ${PASSOS_DO_SITE[i - 1].verbo} não ${PASSOS_DO_SITE[i].verbo}`,
      texto: `É a maior perda do funil no período. ${O_QUE_OLHAR[PASSOS_DO_SITE[i].chave]}`,
    })
  }
  const [celular, computador] = aparelhos ?? []
  if (
    celular &&
    computador &&
    celular.visitas >= MINIMO_DO_FUNIL.porAparelho &&
    computador.visitas >= MINIMO_DO_FUNIL.porAparelho &&
    celular.conversao !== null &&
    computador.conversao !== null &&
    computador.conversao > 0 &&
    celular.conversao <= computador.conversao / 1.8
  )
    achados.push({
      tipo: "oportunidade",
      titulo: "No celular, a conversão é bem menor",
      texto:
        `${celular.parte}% das visitas são no celular, ` +
        (celular.pedidos
          ? `mas lá compram ${porcento(celular.conversao)}`
          : "e lá ninguém comprou no período") +
        ` — no computador, ${porcento(computador.conversao)} compram. ` +
        "O checkout no celular é o primeiro lugar pra olhar.",
    })
  return achados
}
