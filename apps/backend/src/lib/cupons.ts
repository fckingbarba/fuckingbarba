import {
  ApplicationMethodAllocation,
  ApplicationMethodTargetType,
  ApplicationMethodType,
  PromotionStatus,
  PromotionType,
} from "@medusajs/framework/utils"
import { somaDosProdutos, type LinhaDoCarrinho } from "../modules/frenet/client"
import { PREFIXO_DO_BUMP } from "./bumps"

/**
 * OS CUPONS DA LOJA — o que o painel cria, e as regras que o Medusa confere
 * no carrinho.
 *
 * Cupom é uma PROMOÇÃO DO MEDUSA com código: quem aplica e quem recusa é o
 * Medusa, quando a pessoa digita o código no checkout (a loja só pergunta e
 * mostra a resposta — `apps/loja/src/lib/acoes/checkout.ts`). O limite de
 * usos no total é o do próprio Medusa (`limit`, contado no pedido feito).
 *
 * ┌─ AS REGRAS QUE O MEDUSA NÃO TEM, COMO REGRAS DO MEDUSA ────────────────┐
 * │ Pedido mínimo, "vale até", "uma vez por cliente" e "só na primeira     │
 * │ compra" não existem prontos. O gancho `setPromotionContext`            │
 * │ (`workflows/hooks/contexto-dos-cupons.ts`) põe no contexto do carrinho │
 * │ o que falta — a soma dos produtos, a hora, quantos pedidos esse e-mail │
 * │ já fez e que cupons ele já usou (`contextoDosCupons`) —, e o cupom     │
 * │ nasce com regras comuns sobre esses campos (`regrasDoCupom`). O Medusa │
 * │ confere do jeito de sempre, a cada mudança no carrinho: o cupom que    │
 * │ deixou de valer sai sozinho (o e-mail preenchido depois, o produto     │
 * │ tirado da sacola).                                                     │
 * │                                                                        │
 * │ Sem o e-mail, "uma vez por cliente" e "primeira compra" deixam aplicar │
 * │ — e o Medusa confere de novo quando o e-mail chega. O "uma vez por     │
 * │ atributo" do próprio Medusa não serve: sem e-mail no carrinho, ele     │
 * │ derruba a conta inteira do carrinho com erro.                          │
 * │                                                                        │
 * │ Toda condição vem com uma regra a mais: `conferido = "sim"`, que o     │
 * │ gancho só põe quando leu tudo. Se a leitura falhar (ou se alguma       │
 * │ conta do Medusa rodar sem o gancho), cupom com condição não vale: o    │
 * │ Medusa lê número que falta como zero, e "vale até" passaria sozinho.   │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O pedido mínimo mede como o frete grátis mede: preço dos produtos vezes a
 * quantidade, sem frete e sem desconto de cupom (`somaDosProdutos`). Os
 * dois pisos querem dizer a mesma coisa.
 *
 * O que o painel mostra (o tipo, o valor, o mínimo, a data) vai também no
 * `metadata.fb_cupom` da promoção: a lista não precisa desmontar as regras.
 */

/* ── o contexto do carrinho ────────────────────────────────────────────── */

/** Os campos que o gancho põe no contexto, e que as regras dos cupons leem. */
export const CAMPOS_DO_CONTEXTO = {
  /** "sim" quando o gancho leu tudo — a trava de toda condição. */
  conferido: "fb_cupons.conferido",
  /** A soma dos produtos, em reais. */
  produtos: "fb_cupons.produtos",
  /** Quantos pedidos (não cancelados) esse e-mail já fez. */
  pedidos: "fb_cupons.pedidos",
  /** Os códigos que esse e-mail já usou (em pedido não cancelado). */
  usados: "fb_cupons.usados",
  /** Agora, em milissegundos. */
  agora: "fb_cupons.agora",
} as const

export type PedidoDoEmail = { status?: string | null; codigos: string[] }

export type ContextoDosCupons = {
  fb_cupons:
    | { conferido: "sim"; produtos: number; pedidos: number; usados: string[]; agora: number }
    | { produtos: number; agora: number }
}

/**
 * `pedidos: null` quer dizer "o histórico do e-mail não veio" (a consulta
 * falhou): o contexto sai sem ele e sem o `conferido`, e nenhum cupom com
 * condição vale nessa conta. Sem e-mail é outra coisa: lista vazia.
 */
export function contextoDosCupons({
  itens,
  pedidos,
  agora,
}: {
  itens: LinhaDoCarrinho[]
  pedidos: PedidoDoEmail[] | null
  agora: number
}): ContextoDosCupons {
  const produtos = somaDosProdutos(itens)
  if (!pedidos) return { fb_cupons: { produtos, agora } }
  const valendo = pedidos.filter((p) => p.status !== "canceled")
  return {
    fb_cupons: {
      conferido: "sim",
      produtos,
      pedidos: valendo.length,
      usados: [...new Set(valendo.flatMap((p) => p.codigos.map((c) => c.toUpperCase())))],
      agora,
    },
  }
}

/* ── o cupom novo ──────────────────────────────────────────────────────── */

export type TipoDeCupom = "porcento" | "reais"

export type CupomNovo = {
  codigo: string
  tipo: TipoDeCupom
  /** 10 (%), ou 20 (R$). */
  valor: number
  /** Em reais; `null` = qualquer pedido. */
  minimo: number | null
  /** "2026-10-15", até o fim do dia em Brasília; `null` = sem data de fim. */
  ate: string | null
  /** Usos no total; `null` = sem limite. */
  limite: number | null
  umaVezPorCliente: boolean
  primeiraCompra: boolean
}

/** O que o painel guarda na promoção, pra mostrar sem desmontar as regras. */
export type CupomGuardado = Omit<CupomNovo, "codigo">

const CODIGO = /^[A-Z0-9][A-Z0-9-]{2,29}$/

/** "barba 20" → "BARBA20": o código como o Medusa guarda (a loja tenta as três caixas). */
export const normalizarCodigo = (v: unknown) =>
  typeof v === "string" ? v.replace(/\s+/g, "").toUpperCase() : ""

/** "R$ 1.234,56" → 1234.56. Também serve às configurações (`lib/painel/configuracoes.ts`). */
export const numeroBrasileiro = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v !== "string" || !v.trim()) return null
  // "R$ 1.234,56" e "99,90": a vírgula é o decimal.
  const limpo = v
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/** "2026-09-25" em Brasília. */
export const hojeEmBrasilia = (agora: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora)

/** O fim do dia, em Brasília (o Brasil não tem mais horário de verão). */
export const fimDoDia = (ate: string) => new Date(`${ate}T23:59:59.999-03:00`).getTime()

export type Leitura = { ok: true; cupom: CupomNovo } | { ok: false; erros: Record<string, string> }

/** O que chegou do formulário do painel: o cupom, ou o que está errado em cada campo. */
export function lerCupomNovo(v: unknown, agora: Date): Leitura {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const erros: Record<string, string> = {}

  const codigo = normalizarCodigo(o.codigo)
  if (!CODIGO.test(codigo)) erros.codigo = "Use letras, números e hífen: de 3 a 30."
  else if (codigo.startsWith(PREFIXO_DO_BUMP))
    erros.codigo = `"${PREFIXO_DO_BUMP}" é das ofertas do checkout: escolha outro começo.`

  const tipo: TipoDeCupom | null = o.tipo === "porcento" || o.tipo === "reais" ? o.tipo : null
  if (!tipo) erros.tipo = "Escolha o tipo."

  const valor = numeroBrasileiro(o.valor)
  if (
    tipo === "porcento" &&
    (valor === null || !Number.isInteger(valor) || valor < 1 || valor > 100)
  )
    erros.valor = "De 1 a 100, sem vírgula."
  if (tipo === "reais" && (valor === null || valor <= 0 || valor > 10_000))
    erros.valor = "Um valor em reais, maior que zero."

  const minimo = numeroBrasileiro(o.minimo)
  if (minimo !== null && (minimo < 0 || minimo > 100_000)) erros.minimo = "Um valor em reais."
  if (tipo === "reais" && valor !== null && minimo !== null && minimo > 0 && minimo < valor)
    erros.minimo = "O pedido mínimo tem que ser maior que o desconto."

  const ate = typeof o.ate === "string" && o.ate.trim() ? o.ate.trim() : null
  if (ate !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(ate) || Number.isNaN(fimDoDia(ate))))
    erros.ate = "Uma data."
  else if (ate !== null && ate < hojeEmBrasilia(agora)) erros.ate = "Essa data já passou."

  const limite = numeroBrasileiro(o.limite)
  if (limite !== null && (!Number.isInteger(limite) || limite < 1 || limite > 1_000_000))
    erros.limite = "Um número inteiro, de 1 pra cima."

  if (Object.keys(erros).length) return { ok: false, erros }
  return {
    ok: true,
    cupom: {
      codigo,
      tipo: tipo!,
      valor: tipo === "reais" ? Math.round(valor! * 100) / 100 : valor!,
      minimo: minimo && minimo > 0 ? Math.round(minimo * 100) / 100 : null,
      ate,
      limite,
      umaVezPorCliente: o.umaVezPorCliente === true,
      primeiraCompra: o.primeiraCompra === true,
    },
  }
}

/**
 * As regras do cupom, sobre os campos do gancho (`CAMPOS_DO_CONTEXTO`). Com
 * alguma condição, vai junto a trava do `conferido`; sem nenhuma, nenhuma
 * regra.
 */
export function regrasDoCupom(c: CupomNovo) {
  const condicoes = [
    ...(c.minimo
      ? [{ attribute: CAMPOS_DO_CONTEXTO.produtos, operator: "gte", values: [String(c.minimo)] }]
      : []),
    ...(c.ate
      ? [
          {
            attribute: CAMPOS_DO_CONTEXTO.agora,
            operator: "lte",
            values: [String(fimDoDia(c.ate))],
          },
        ]
      : []),
    ...(c.umaVezPorCliente
      ? [{ attribute: CAMPOS_DO_CONTEXTO.usados, operator: "ne", values: [c.codigo] }]
      : []),
    ...(c.primeiraCompra
      ? [{ attribute: CAMPOS_DO_CONTEXTO.pedidos, operator: "eq", values: ["0"] }]
      : []),
  ]
  return (
    condicoes.length
      ? [{ attribute: CAMPOS_DO_CONTEXTO.conferido, operator: "eq", values: ["sim"] }, ...condicoes]
      : []
  ) as { attribute: string; operator: "gte" | "lte" | "ne" | "eq"; values: string[] }[]
}

/**
 * A promoção do Medusa pro cupom: código, ativa, sem ser automática (só vale
 * digitada), o limite de usos, o desconto e as regras.
 *
 * Porcentagem: sobre a soma dos produtos, dividida entre eles (o "cada
 * produto" do Medusa 2.21 pede um teto de unidades, e dá no mesmo); não pega
 * o frete. Reais: sobre o pedido, dividido entre os produtos.
 */
export function promocaoDoCupom(c: CupomNovo, quem: string, agora: Date) {
  const guardado: CupomGuardado & { criadoPor: string; criadoEm: string } = {
    tipo: c.tipo,
    valor: c.valor,
    minimo: c.minimo,
    ate: c.ate,
    limite: c.limite,
    umaVezPorCliente: c.umaVezPorCliente,
    primeiraCompra: c.primeiraCompra,
    criadoPor: quem,
    criadoEm: agora.toISOString(),
  }
  return {
    code: c.codigo,
    type: PromotionType.STANDARD,
    status: PromotionStatus.ACTIVE,
    is_automatic: false,
    ...(c.limite ? { limit: c.limite } : {}),
    application_method:
      c.tipo === "porcento"
        ? {
            type: ApplicationMethodType.PERCENTAGE,
            target_type: ApplicationMethodTargetType.ITEMS,
            allocation: ApplicationMethodAllocation.ACROSS,
            value: c.valor,
            target_rules: [],
          }
        : {
            type: ApplicationMethodType.FIXED,
            target_type: ApplicationMethodTargetType.ORDER,
            allocation: ApplicationMethodAllocation.ACROSS,
            value: c.valor,
            currency_code: "brl",
          },
    rules: regrasDoCupom(c),
    metadata: { fb_cupom: guardado },
  }
}

/* ── a lista ───────────────────────────────────────────────────────────── */

/** A promoção como o Medusa devolve — só o que a lista usa. */
export type PromocaoCrua = {
  id: string
  code?: string | null
  status?: string | null
  is_automatic?: boolean | null
  limit?: number | null
  used?: number | null
  created_at?: string | Date | null
  metadata?: Record<string, unknown> | null
  application_method?: {
    type?: string | null
    target_type?: string | null
    value?: unknown
  } | null
}

/** O que os pedidos dizem de um cupom: quantos, quanto de desconto, quanto venderam. */
export type UsoDoCupom = { pedidos: number; desconto: number; vendeu: number }

export type Situacao = "valendo" | "pausado" | "vencido" | "esgotado"

export type CupomNaLista = {
  id: string
  codigo: string
  /** "15% em pedidos a partir de R$ 99,90" */
  descricao: string
  /** "até 30/09 · 100 usos no total · uma vez por cliente" */
  regra: string
  /** "23 de 100 usos" */
  usos: string
  situacao: Situacao
  /** Pode ligar e desligar: o vencido e o esgotado não voltam pela chave. */
  ligado: boolean
  pedidos: number
  desconto: number
  vendeu: number
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const reais = (v: number) => REAIS.format(v).replace(/\s/g, " ")
const diaCurto = (ate: string) => `${ate.slice(8, 10)}/${ate.slice(5, 7)}`

/** O cupom guardado pelo painel; o de antes dele (o do script) sai da promoção. */
export function cupomGuardado(p: PromocaoCrua): CupomGuardado {
  const g = (p.metadata?.fb_cupom ?? null) as Partial<CupomGuardado> | null
  if (g && (g.tipo === "porcento" || g.tipo === "reais") && typeof g.valor === "number")
    return {
      tipo: g.tipo,
      valor: g.valor,
      minimo: typeof g.minimo === "number" ? g.minimo : null,
      ate: typeof g.ate === "string" ? g.ate : null,
      limite: typeof p.limit === "number" ? p.limit : null,
      umaVezPorCliente: g.umaVezPorCliente === true,
      primeiraCompra: g.primeiraCompra === true,
    }
  return {
    tipo: p.application_method?.type === "fixed" ? "reais" : "porcento",
    valor: Number(p.application_method?.value ?? 0),
    minimo: null,
    ate: null,
    limite: typeof p.limit === "number" ? p.limit : null,
    umaVezPorCliente: false,
    primeiraCompra: false,
  }
}

/** "10% em qualquer pedido" · "R$ 20,00 em pedidos a partir de R$ 150,00" */
export function descricaoDoCupom(c: Pick<CupomGuardado, "tipo" | "valor" | "minimo">): string {
  const quanto = c.tipo === "porcento" ? `${c.valor}%` : `${reais(c.valor)} de desconto`
  return c.minimo
    ? `${quanto} em pedidos a partir de ${reais(c.minimo)}`
    : `${quanto} em qualquer pedido`
}

/** "até 15/10 · 200 usos no total · uma vez por cliente · só na primeira compra" */
export function regraDoCupom(
  c: Pick<CupomGuardado, "ate" | "limite" | "umaVezPorCliente" | "primeiraCompra">
): string {
  return [
    c.ate ? `até ${diaCurto(c.ate)}` : "sem data de fim",
    ...(c.limite ? [`${c.limite} ${c.limite === 1 ? "uso" : "usos"} no total`] : []),
    ...(c.umaVezPorCliente ? ["uma vez por cliente"] : []),
    ...(c.primeiraCompra ? ["só na primeira compra"] : []),
  ].join(" · ")
}

/** Os cupons de campanha: com código, digitados — nem os da oferta do checkout, nem automáticos. */
export const ehCupomDeCampanha = (p: PromocaoCrua) =>
  Boolean(p.code) && !p.is_automatic && !String(p.code).startsWith(PREFIXO_DO_BUMP)

export function cupomNaLista(p: PromocaoCrua, uso: UsoDoCupom, agora: Date): CupomNaLista {
  const c = cupomGuardado(p)
  const usados = Number(p.used ?? 0)
  const pausado = p.status !== PromotionStatus.ACTIVE
  const vencido = c.ate !== null && c.ate < hojeEmBrasilia(agora)
  const esgotado = c.limite !== null && usados >= c.limite
  return {
    id: p.id,
    codigo: String(p.code),
    descricao: descricaoDoCupom(c),
    regra: regraDoCupom(c),
    usos: c.limite ? `${usados} de ${c.limite} usos` : `${usados} ${usados === 1 ? "uso" : "usos"}`,
    situacao: vencido ? "vencido" : esgotado ? "esgotado" : pausado ? "pausado" : "valendo",
    ligado: !pausado,
    ...uso,
  }
}

/**
 * O que os pedidos contam de cada código: em quantos pedidos (não
 * cancelados) ele entrou, quanto de desconto deu, e quanto esses pedidos
 * venderam (os pagos).
 */
export function usosPorCodigo(
  pedidos: {
    status?: string | null
    pago: boolean
    total: number
    ajustes: { code?: string | null; amount?: unknown }[]
  }[]
): Map<string, UsoDoCupom> {
  const mapa = new Map<string, UsoDoCupom>()
  for (const o of pedidos) {
    if (o.status === "canceled") continue
    const porCodigo = new Map<string, number>()
    for (const a of o.ajustes) {
      if (!a.code) continue
      const k = a.code.toUpperCase()
      porCodigo.set(k, (porCodigo.get(k) ?? 0) + Number(a.amount ?? 0))
    }
    for (const [codigo, desconto] of porCodigo) {
      const atual = mapa.get(codigo) ?? { pedidos: 0, desconto: 0, vendeu: 0 }
      mapa.set(codigo, {
        pedidos: atual.pedidos + 1,
        desconto: Math.round((atual.desconto + desconto) * 100) / 100,
        vendeu: Math.round((atual.vendeu + (o.pago ? o.total : 0)) * 100) / 100,
      })
    }
  }
  return mapa
}
