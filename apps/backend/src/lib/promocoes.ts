import {
  ApplicationMethodAllocation,
  ApplicationMethodTargetType,
  ApplicationMethodType,
  PromotionStatus,
  PromotionType,
} from "@medusajs/framework/utils"
import {
  CAMPOS_DO_CONTEXTO,
  fimDe,
  inicioDe,
  lerAlcance,
  lerPeriodo,
  MARCA_DA_LINHA,
  numeroBrasileiro,
  periodoEmFrase,
  PREFIXO_DA_PROMOCAO,
  type Alcance,
  type Alvo,
  type Catalogo,
  type ItemDoCarrinho,
  type PromocaoCrua,
  type UsoDoCupom,
} from "./cupons"

/**
 * AS PROMOÇÕES AUTOMÁTICAS DO PAINEL — por enquanto, o "Leve X, pague Y" (o
 * "Compre X e pague Y" da Nuvemshop): levando 3, paga 2.
 *
 * É uma PROMOÇÃO DO MEDUSA, automática (ninguém digita código) e do tipo
 * "compre-leve" (`buyget`), que o Medusa já sabe fazer: a cada grupo de
 * `comprando` unidades dos produtos da promoção, as `comprando − pague` mais
 * baratas saem de graça (100% de desconto nelas). Quem aplica e quem tira é
 * o Medusa, a cada mudança no carrinho; a loja e o painel só mostram.
 *
 * ┌─ O QUE O MEDUSA FAZ, E ONDE ELE DIFERE DA NUVEMSHOP ───────────────────┐
 * │ Num grupo, o Medusa reserva as mais caras como "compradas" e dá de     │
 * │ graça a mais barata: com um produto só, é exatamente a conta da        │
 * │ Nuvemshop. Com produtos de preços diferentes numa sacola grande, ele   │
 * │ agrupa das linhas mais caras pras mais baratas e dá a mais barata DE   │
 * │ CADA GRUPO — a Nuvemshop dá as mais baratas da sacola inteira. 3 de    │
 * │ R$ 100 e 3 de R$ 50, leve 3 pague 2: aqui saem R$ 150 de graça (uma de │
 * │ cada), lá R$ 100 (as duas de R$ 50). O teste trava o número.           │
 * │                                                                        │
 * │ Sem `max_quantity`, o Medusa dá de graça UMA unidade por carrinho e    │
 * │ para: a promoção leva `MAX_GRATIS`, e 6 unidades dão 2 de graça.       │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * AS DECISÕES DA LOJA (26/09):
 * - NÃO SOMA com o desconto por quantidade (4% em 2, 6% em 3): enquanto a
 *   promoção vale, o produto sai das faixas (`lib/precos-por-quantidade.ts`,
 *   que lê `promocoesNaLoja`), e a conta fica "3 pelo preço de 2".
 * - O cupom que NÃO COMBINA não desconta item de promoção que disparou (a
 *   marca `fb_promocional` da linha, a mesma do preço promocional —
 *   `marcarPromocoes`). O que combina desconta o que sobrou.
 * - "Vale em produto com preço promocional" (a caixa da Nuvemshop): marcada
 *   por padrão; desmarcada, o produto com "de/por" fica de fora — pela marca
 *   `fb_preco_promocional` que o gancho do carrinho põe em cada linha.
 *
 * O PERÍODO é como o do cupom: regras sobre a hora que o gancho põe no
 * contexto (`fb_cupons.agora`). A trava não é a do cupom (`conferido`, que
 * cai quando o histórico do e-mail não vem): é a própria hora estar lá
 * (`agora > 0`). Sem o gancho, a hora falta, e o Medusa leria o "até"
 * como zero — a promoção valeria pra sempre.
 *
 * O CÓDIGO é `PROMO-` e oito letras sorteadas (quem sorteia é a rota): nunca
 * é digitado, mas aparece na lista de promoções do carrinho, nos ajustes do
 * pedido e no Marketing — por ele se sabe o que é promoção, e não cupom.
 */

/** Quantas unidades de graça, no máximo, num carrinho (o `max_quantity` do Medusa). */
export const MAX_GRATIS = 99

/** Levando no máximo 10: "leve 11, pague 10" é outra conversa. */
const MAX_COMPRANDO = 10
const NOME_MAX = 60
const ETIQUETA_MAX = 30

/**
 * A marca que o gancho do carrinho põe em cada linha: "sim" quando o produto
 * está com preço promocional (o `compare_at_unit_price` acima do preço). A
 * regra "não vale em produto com preço promocional" lê `items.fb_preco_promocional`.
 */
export const MARCA_DO_PRECO = "fb_preco_promocional"

export const ehCodigoDePromocao = (codigo: string) =>
  codigo.toUpperCase().startsWith(PREFIXO_DA_PROMOCAO)

/** As promoções do painel: automáticas, com o código `PROMO-`. */
export const ehPromocaoDoPainel = (p: PromocaoCrua) =>
  Boolean(p.code) && Boolean(p.is_automatic) && ehCodigoDePromocao(String(p.code))

/* ── a promoção nova ───────────────────────────────────────────────────── */

export type LevePague = {
  /** Só pro painel: "Leve 3 do Fator (outubro)". */
  nome: string
  /** O que o cliente vê, no selo e nos cartões: "Leve 3, pague 2". */
  etiqueta: string
  /** Levando tantas… */
  comprando: number
  /** …paga tantas (menos que `comprando`): as outras, as mais baratas, saem de graça. */
  pague: number
  aplicarA: Alcance
  /** As categorias ou os produtos (vazio na loja toda). */
  alvos: Alvo[]
  /** Vale também no produto com preço promocional (o de/por). */
  promocional: boolean
  /** "2026-10-01T00:00", em Brasília; `null` = já vale. */
  de: string | null
  /** "2026-10-15T23:59", em Brasília; `null` = sem fim. */
  ate: string | null
}

/** O que o painel guarda na promoção (`metadata.fb_promocao`), pra mostrar sem desmontar as regras. */
export type PromocaoGuardada = LevePague & { tipo: "leve-pague" }

export type LeituraDaPromocao =
  { ok: true; promocao: LevePague } | { ok: false; erros: Record<string, string> }

/** "Leve 3, pague 2" — a etiqueta de quem não escreveu outra. */
export const etiquetaPadrao = (comprando: number, pague: number) =>
  `Leve ${comprando}, pague ${pague}`

const frase = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "")

/**
 * O que chegou do formulário do painel: a promoção, ou o que está errado em
 * cada campo. As categorias e os produtos são conferidos no `catalogo`.
 */
export function lerPromocaoNova(
  v: unknown,
  agora: Date,
  catalogo: Catalogo = { categorias: [], produtos: [] }
): LeituraDaPromocao {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const erros: Record<string, string> = {}

  const nome = frase(o.nome)
  if (!nome) erros.nome = "Dê um nome pra achar a promoção depois."
  else if (nome.length > NOME_MAX) erros.nome = `Até ${NOME_MAX} letras.`

  if (o.tipo !== undefined && o.tipo !== "leve-pague") erros.tipo = "Escolha o tipo."

  const comprando = numeroBrasileiro(o.comprando)
  const pague = numeroBrasileiro(o.pague)
  const comprandoOk =
    comprando !== null &&
    Number.isInteger(comprando) &&
    comprando >= 2 &&
    comprando <= MAX_COMPRANDO
  if (!comprandoOk) erros.comprando = `De 2 a ${MAX_COMPRANDO} unidades.`
  if (pague === null || !Number.isInteger(pague) || pague < 1) erros.pague = "De 1 pra cima."
  else if (comprandoOk && pague >= comprando!) erros.pague = "Tem que pagar menos do que leva."

  const { aplicarA, alvos } = lerAlcance(o, catalogo, erros)

  let de: string | null = null
  let ate: string | null = null
  if (o.data === "periodo") ({ de, ate } = lerPeriodo(o, agora, erros))

  const escrita = frase(o.etiqueta)
  if (escrita.length > ETIQUETA_MAX) erros.etiqueta = `Até ${ETIQUETA_MAX} letras: cabe no selo.`

  if (Object.keys(erros).length) return { ok: false, erros }
  return {
    ok: true,
    promocao: {
      nome,
      etiqueta: escrita || etiquetaPadrao(comprando!, pague!),
      comprando: comprando!,
      pague: pague!,
      aplicarA,
      alvos,
      promocional: o.promocional !== false,
      de,
      ate,
    },
  }
}

export type RegraDaPromocao = {
  attribute: string
  operator: "gt" | "gte" | "lte" | "eq" | "in"
  values: string[]
}

/**
 * Quais linhas contam — as mesmas regras pro lado "compra" e pro lado "de
 * graça": os produtos, as categorias, ou a loja toda. A loja toda também é
 * uma regra (o Medusa exige ao menos uma no lado "compra"): a marca do preço
 * existir na linha, que o gancho põe em todas.
 */
export function regrasDosItens(
  p: Pick<LevePague, "aplicarA" | "alvos" | "promocional">
): RegraDaPromocao[] {
  const marca = `items.${MARCA_DO_PRECO}`
  const semPromocional: RegraDaPromocao = { attribute: marca, operator: "eq", values: ["nao"] }
  if (p.aplicarA === "loja")
    return [
      p.promocional ? { attribute: marca, operator: "in", values: ["sim", "nao"] } : semPromocional,
    ]
  return [
    {
      attribute: p.aplicarA === "produtos" ? "items.product.id" : "items.product.categories.id",
      operator: "in",
      values: p.alvos.map((a) => a.id),
    },
    ...(p.promocional ? [] : [semPromocional]),
  ]
}

/** As regras do período, sobre a hora do gancho — e a trava da hora estar lá. */
export function regrasDoPeriodo(p: Pick<LevePague, "de" | "ate">): RegraDaPromocao[] {
  const agora = CAMPOS_DO_CONTEXTO.agora
  const condicoes: RegraDaPromocao[] = [
    ...(p.de
      ? [{ attribute: agora, operator: "gte" as const, values: [String(inicioDe(p.de))] }]
      : []),
    ...(p.ate
      ? [{ attribute: agora, operator: "lte" as const, values: [String(fimDe(p.ate))] }]
      : []),
  ]
  return condicoes.length ? [{ attribute: agora, operator: "gt", values: ["0"] }, ...condicoes] : []
}

/**
 * A promoção do Medusa: automática, "compre-leve", ativa. O lado "compra"
 * pede `pague` unidades; o lado "de graça" dá `comprando − pague`, com 100%.
 */
export function promocaoDoMedusa(p: LevePague, codigo: string, quem: string, agora: Date) {
  const guardada: PromocaoGuardada = { tipo: "leve-pague", ...p }
  const itens = regrasDosItens(p)
  return {
    code: codigo,
    type: PromotionType.BUYGET,
    status: PromotionStatus.ACTIVE,
    is_automatic: true,
    application_method: {
      type: ApplicationMethodType.PERCENTAGE,
      target_type: ApplicationMethodTargetType.ITEMS,
      allocation: ApplicationMethodAllocation.EACH,
      value: 100,
      max_quantity: MAX_GRATIS,
      apply_to_quantity: p.comprando - p.pague,
      buy_rules_min_quantity: p.pague,
      buy_rules: itens,
      target_rules: itens,
    },
    rules: regrasDoPeriodo(p),
    metadata: { fb_promocao: { ...guardada, criadoPor: quem, criadoEm: agora.toISOString() } },
  }
}

/* ── a promoção guardada ───────────────────────────────────────────────── */

const alvosValidos = (v: unknown): Alvo[] =>
  Array.isArray(v)
    ? v
        .filter(
          (a): a is Alvo => Boolean(a) && typeof a.id === "string" && typeof a.nome === "string"
        )
        .map((a) => ({ id: a.id, nome: a.nome }))
    : []

const inteiroEntre = (v: unknown, de: number, ate: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= de && v <= ate

/** A promoção como o painel guardou, ou `null` (não é do painel, ou está torta). */
export function promocaoGuardada(p: Pick<PromocaoCrua, "metadata">): PromocaoGuardada | null {
  const g = (p.metadata?.fb_promocao ?? null) as Partial<
    Record<keyof PromocaoGuardada, unknown>
  > | null
  if (!g || g.tipo !== "leve-pague") return null
  if (!inteiroEntre(g.comprando, 2, MAX_COMPRANDO)) return null
  if (!inteiroEntre(g.pague, 1, Number(g.comprando) - 1)) return null
  const comprando = g.comprando as number
  const pague = g.pague as number
  return {
    tipo: "leve-pague",
    nome: typeof g.nome === "string" ? g.nome : "",
    etiqueta:
      typeof g.etiqueta === "string" && g.etiqueta ? g.etiqueta : etiquetaPadrao(comprando, pague),
    comprando,
    pague,
    aplicarA: g.aplicarA === "categorias" || g.aplicarA === "produtos" ? g.aplicarA : "loja",
    alvos: alvosValidos(g.alvos),
    promocional: g.promocional !== false,
    de: typeof g.de === "string" ? g.de : null,
    ate: typeof g.ate === "string" ? g.ate : null,
  }
}

/** Ligada e dentro do período, agora. */
export function valeAgora(
  status: string | null | undefined,
  g: Pick<LevePague, "de" | "ate">,
  agora: number
): boolean {
  if (status !== PromotionStatus.ACTIVE) return false
  if (g.de && inicioDe(g.de) > agora) return false
  if (g.ate && fimDe(g.ate) < agora) return false
  return true
}

/* ── as linhas do carrinho ─────────────────────────────────────────────── */

/** Uma promoção do painel com a chave dela — o que o gancho do carrinho lê. */
export type PromocaoAtiva = { status?: string | null; guardada: PromocaoGuardada }

const temPrecoPromocional = (i: ItemDoCarrinho) =>
  Number(i.compare_at_unit_price ?? 0) > Number(i.unit_price ?? 0)

/** A linha está entre os produtos da promoção (sem olhar o preço promocional)? */
function noAlvo(g: Pick<LevePague, "aplicarA" | "alvos">, produto: string, categorias: string[]) {
  if (g.aplicarA === "loja") return true
  const alvos = new Set(g.alvos.map((a) => a.id))
  return g.aplicarA === "produtos" ? alvos.has(produto) : categorias.some((c) => alvos.has(c))
}

/**
 * As linhas com as marcas das promoções, pro gancho devolver no lugar das
 * do carrinho (o resto de cada linha fica como veio):
 *
 * - `fb_preco_promocional` em TODAS — "sim" com preço promocional. É ela que
 *   a regra "não vale em produto com preço promocional" da promoção lê, e é
 *   ela que faz a regra da loja toda existir em cada linha.
 * - `fb_promocional` "sim" também nas linhas de uma promoção que DISPAROU
 *   (valendo agora, e com unidades bastantes dos produtos dela): é a marca
 *   que o cupom que não combina lê (`lib/cupons.ts`). A linha de Fator com 2
 *   unidades num "leve 3" não disparou — o cupom desconta como sempre.
 *
 * Vem DEPOIS do `linhasMarcadas` do cupom, que já pôs a `fb_promocional`
 * pelo preço: aqui ela só muda pra "sim".
 */
export function marcarPromocoes<T extends ItemDoCarrinho>(
  itens: T[],
  promocoes: PromocaoAtiva[],
  agora: number
): (T & { [MARCA_DO_PRECO]: "sim" | "nao" })[] {
  const disparadas = new Set<number>()
  for (const { status, guardada: g } of promocoes) {
    if (!valeAgora(status, g, agora)) continue
    const elegiveis = itens.flatMap((i, k) => {
      const produto = i.product?.id ?? i.product_id ?? ""
      const categorias = (i.product?.categories ?? [])
        .map((c) => c?.id ?? "")
        .filter((id): id is string => Boolean(id))
      return noAlvo(g, produto, categorias) && (g.promocional || !temPrecoPromocional(i)) ? [k] : []
    })
    const unidades = elegiveis.reduce((s, k) => s + (Number(itens[k]!.quantity ?? 0) || 0), 0)
    if (unidades >= g.comprando) for (const k of elegiveis) disparadas.add(k)
  }
  return itens.map((i, k) => ({
    ...i,
    [MARCA_DO_PRECO]: temPrecoPromocional(i) ? "sim" : "nao",
    ...(disparadas.has(k) ? { [MARCA_DA_LINHA]: "sim" } : {}),
  })) as (T & { [MARCA_DO_PRECO]: "sim" | "nao" })[]
}

/**
 * Quantas saem de graça levando `unidades` dos produtos da promoção: a cada
 * `comprando`, `comprando − pague` — a conta do Medusa (um grupo por vez, até
 * o teto). 5 num "leve 3, pague 2": 1. 6: 2.
 */
export function gratisEm(unidades: number, comprando: number, pague: number): number {
  if (!(unidades > 0) || !(comprando > pague) || !(pague >= 1)) return 0
  return Math.min(Math.floor(unidades / comprando) * (comprando - pague), MAX_GRATIS)
}

/* ── o que a loja mostra ───────────────────────────────────────────────── */

/** Um produto publicado, como a promoção precisa: as categorias e se está com preço promocional agora. */
export type ProdutoDaPromocao = { id: string; categorias: string[]; precoPromocional: boolean }

/** A promoção como a loja mostra: o selo, a conta e os produtos em que ela vale AGORA. */
export type PromocaoNaLoja = {
  codigo: string
  etiqueta: string
  comprando: number
  pague: number
  /** Os produtos (ids) em que ela vale agora. */
  produtos: string[]
  /** Até quando, em ms; `null` = sem fim. */
  ate: number | null
}

/** Os produtos em que a promoção vale — o preço promocional de agora conta. */
export function produtosDaPromocao(
  g: Pick<LevePague, "aplicarA" | "alvos" | "promocional">,
  produtos: ProdutoDaPromocao[]
): string[] {
  return produtos
    .filter((p) => noAlvo(g, p.id, p.categorias) && (g.promocional || !p.precoPromocional))
    .map((p) => p.id)
}

/**
 * As promoções que valem AGORA, com os produtos de cada uma — a loja (o selo,
 * os cartões de quantidade, a sacola) e o desconto por quantidade (que tira
 * esses produtos das faixas) leem daqui. Promoção sem produto nenhum fica de
 * fora: não há onde mostrar.
 */
export function promocoesNaLoja(
  promocoes: (PromocaoAtiva & { codigo: string })[],
  produtos: ProdutoDaPromocao[],
  agora: number
): PromocaoNaLoja[] {
  return promocoes.flatMap(({ codigo, status, guardada: g }) => {
    if (!valeAgora(status, g, agora)) return []
    const ids = produtosDaPromocao(g, produtos)
    if (!ids.length) return []
    return [
      {
        codigo,
        etiqueta: g.etiqueta,
        comprando: g.comprando,
        pague: g.pague,
        produtos: ids,
        ate: g.ate ? fimDe(g.ate) : null,
      },
    ]
  })
}

/* ── a lista do painel ─────────────────────────────────────────────────── */

export type SituacaoDaPromocao = "valendo" | "agendado" | "pausado" | "vencido"

export type PromocaoNaLista = {
  id: string
  codigo: string
  nome: string
  etiqueta: string
  /** "Leve 3, pague 2 em Fator de Crescimento" */
  descricao: string
  /** "de 01/10 às 00:00 até 15/10 às 23:59 · fora do preço promocional" */
  regra: string
  situacao: SituacaoDaPromocao
  /** A chave: a vencida não volta por ela. */
  ligado: boolean
  pedidos: number
  desconto: number
  vendeu: number
}

/** "Óleo" · "Óleo e Balm" · "Óleo, Balm e Shampoo" · "Óleo, Balm e mais 3". */
function emLista(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? ""
  if (nomes.length <= 3) return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`
  return `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}`
}

/** "Leve 3, pague 2 em Fator de Crescimento" · "… nos produtos de Barba" · "… em toda a loja". */
export function descricaoDaPromocao(
  g: Pick<LevePague, "comprando" | "pague" | "aplicarA" | "alvos">
): string {
  const conta = etiquetaPadrao(g.comprando, g.pague)
  const nomes = g.alvos.map((a) => a.nome)
  if (g.aplicarA === "produtos" && nomes.length) return `${conta} em ${emLista(nomes)}`
  if (g.aplicarA === "categorias" && nomes.length)
    return `${conta} nos produtos de ${emLista(nomes)}`
  return `${conta} em toda a loja`
}

/** "sem data de fim" · "de 01/10 às 00:00 até 15/10 às 23:59 · fora do preço promocional". */
export function regraDaPromocao(g: Pick<LevePague, "de" | "ate" | "promocional">): string {
  return [
    periodoEmFrase(g.de, g.ate),
    ...(g.promocional ? [] : ["fora do preço promocional"]),
  ].join(" · ")
}

export function promocaoNaLista(
  p: PromocaoCrua,
  g: PromocaoGuardada,
  uso: UsoDoCupom,
  agora: Date
): PromocaoNaLista {
  const pausado = p.status !== PromotionStatus.ACTIVE
  const vencido = g.ate !== null && fimDe(g.ate) < agora.getTime()
  const agendado = g.de !== null && inicioDe(g.de) > agora.getTime()
  return {
    id: p.id,
    codigo: String(p.code),
    nome: g.nome || g.etiqueta,
    etiqueta: g.etiqueta,
    descricao: descricaoDaPromocao(g),
    regra: regraDaPromocao(g),
    situacao: vencido ? "vencido" : pausado ? "pausado" : agendado ? "agendado" : "valendo",
    ligado: !pausado,
    ...uso,
  }
}
