import {
  FLUXOS,
  IDS_DOS_FLUXOS,
  LIMITES_DO_DESCONTO,
  TOQUE_DO_PREMIO,
  type ConfigDosFluxos,
  type IdDoFluxo,
} from "../crm/fluxos"
import { LOTES, type PublicoDaEstreia } from "../crm/estreia"
import { dia, hora } from "./formato"

/**
 * A ABA FLUXOS DO CRM — cada fluxo (Pix pendente, checkout abandonado), se
 * está ligado e desde quando, os toques com quantos saíram, e o que ele
 * vendeu nos últimos 30 dias:
 *
 *   - quem recebeu e comprou em até 7 dias do primeiro e-mail, e quanto;
 *   - o mesmo pro grupo de controle (os 5% que não recebem) — é a conta
 *     que diz se o fluxo vende de verdade ou se a pessoa ia comprar de
 *     qualquer jeito;
 *   - os cupons que o fluxo deu, e quantos foram usados.
 *
 * Código puro, com testes. Quem lê o banco é a rota
 * (`GET /dashboard/crm/fluxos`).
 */

export const DIAS_DA_TELA = 30
export const DIAS_PRA_COMPRAR = 7

const DIA_MS = 24 * 60 * 60 * 1000

export type RegistroDaTela = {
  email: string
  fluxo: string
  /** A chave (no prêmio do indique, `premio|<pedido do brother>`). */
  chave?: string
  toque: string
  como: string
  em: Date | string
  cupom: string | null
}

export type PedidoDaTela = {
  /** O id (o pedido do brother, no indique). */
  id?: string
  email: string | null
  created_at: Date | string
  total: number
  status: string
}

export type ToqueDaTela = {
  id: string
  nome: string
  quando: string
  cupom: boolean
  enviados: number
}

/** Quem entra na estreia, de que jeito, e quantos saem em cada dia (`lib/crm/estreia.ts`). */
export type PublicoDaEstreiaNaTela = {
  pessoas: number
  repor: number
  cliente: number
  sumido: number
  lead: number
  /** Quantos em cada lote: o 1º dia, o 2º, o 3º e o 4º. */
  lotes: number[]
  /** Quem aceita ofertas e fica de fora por já ter comprado na loja nova. */
  jaCompraram: number
}

/** O público da estreia do jeito da tela: só números. */
export function publicoNaTela(p: PublicoDaEstreia): PublicoDaEstreiaNaTela {
  const lotes = Array.from({ length: LOTES.length + 1 }, () => 0)
  for (const pessoa of p.fila) lotes[pessoa.lote]++
  return { pessoas: p.fila.length, ...p.segmentos, lotes, jaCompraram: p.jaCompraram }
}

export type FluxoDaTela = {
  id: IdDoFluxo
  nome: string
  ligado: boolean
  /** "27/09, 20:15" — desde quando vale; null se ainda não rodou ligado. */
  desde: string | null
  toques: ToqueDaTela[]
  numeros: {
    pessoas: number
    enviados: number
    cupons: number
    cuponsUsados: number
    compraram: number
    vendido: number
    controle: { pessoas: number; compraram: number }
  }
  /** Só na estreia: quem entra. */
  publico?: PublicoDaEstreiaNaTela
}

/** O indique um brother (0215, `lib/crm/indicacao.ts`), nos dias da tela. */
export type IndicacaoNaTela = {
  /** Quantas pessoas já têm o link (desde sempre). */
  links: number
  /** Os brothers que pagaram a 1ª compra com um link. */
  amigos: number
  /** O que eles compraram (o pedido com o link). */
  vendido: number
  /** Os cupons de 15% que quem indicou ganhou, e quantos já foram usados. */
  cupons: number
  cuponsUsados: number
}

export type TelaDosFluxos = {
  desconto: number
  limites: readonly [number, number]
  dias: number
  fluxos: FluxoDaTela[]
  indicacao: IndicacaoNaTela
}

const ms = (d: Date | string) => new Date(d).getTime()
const minusculo = (e: string | null) => (e ?? "").trim().toLowerCase()

/** A primeira vez de cada pessoa, nos registros dados (as campanhas também usam, entrega 0206). */
export function primeiraVez(
  registros: readonly Pick<RegistroDaTela, "email" | "em">[]
): Map<string, number> {
  const primeira = new Map<string, number>()
  for (const r of registros) {
    const t = ms(r.em)
    const antes = primeira.get(r.email)
    if (antes === undefined || t < antes) primeira.set(r.email, t)
  }
  return primeira
}

/**
 * Quem comprou até 7 dias depois da primeira vez, e o valor do primeiro pedido de cada um. Os
 * pedidos vão por e-mail antes: a campanha passa por milhares de pessoas (entrega 0206).
 */
export function compras(
  primeira: Map<string, number>,
  pedidos: readonly PedidoDaTela[]
): { pessoas: number; vendido: number } {
  const porEmail = new Map<string, PedidoDaTela[]>()
  for (const p of pedidos) {
    if (p.status === "canceled") continue
    const email = minusculo(p.email)
    const dele = porEmail.get(email)
    if (dele) dele.push(p)
    else porEmail.set(email, [p])
  }
  let pessoas = 0
  let vendido = 0
  for (const [email, t] of primeira) {
    const pedido = (porEmail.get(email) ?? [])
      .filter((p) => ms(p.created_at) > t && ms(p.created_at) <= t + DIAS_PRA_COMPRAR * DIA_MS)
      .sort((a, b) => ms(a.created_at) - ms(b.created_at))[0]
    if (!pedido) continue
    pessoas++
    vendido += Number(pedido.total) || 0
  }
  return { pessoas, vendido: Math.round(vendido * 100) / 100 }
}

export function montarTelaDosFluxos({
  config,
  registros,
  pedidos,
  cuponsUsados,
  publico = null,
  links = 0,
}: {
  config: ConfigDosFluxos
  registros: RegistroDaTela[]
  pedidos: PedidoDaTela[]
  cuponsUsados: ReadonlySet<string>
  /** O público da estreia, pro bloco dela. */
  publico?: PublicoDaEstreiaNaTela | null
  /** Quantas pessoas têm o link do indique. */
  links?: number
}): TelaDosFluxos {
  // O indique: cada prêmio é um brother que pagou (o pulado também — o teto do ano, a equipe).
  const premios = registros.filter((r) => r.fluxo === "indicacao" && r.toque === TOQUE_DO_PREMIO)
  const doBrother = new Set(premios.map((r) => (r.chave ?? "").replace(/^premio\|/, "")))
  const cuponsDoIndique = premios.flatMap((r) => (r.cupom ? [r.cupom] : []))
  return {
    desconto: config.desconto,
    limites: LIMITES_DO_DESCONTO,
    dias: DIAS_DA_TELA,
    fluxos: IDS_DOS_FLUXOS.map((id) => {
      const doFluxo = registros.filter((r) => r.fluxo === id)
      const enviados = doFluxo.filter((r) => r.como === "enviado")
      const controle = doFluxo.filter((r) => r.como === "controle")
      const deQuemRecebeu = primeiraVez(enviados)
      const doControle = primeiraVez(controle.filter((r) => !deQuemRecebeu.has(r.email)))
      const cupons = enviados.flatMap((r) => (r.cupom ? [r.cupom] : []))
      const vendas = compras(deQuemRecebeu, pedidos)
      const { desde, ligado } = config.fluxos[id]
      return {
        id,
        nome: FLUXOS[id].nome,
        ligado,
        desde: desde ? `${dia(desde)}, ${hora(desde)}` : null,
        toques: FLUXOS[id].toques.map((t) => ({
          id: t.id,
          nome: t.nome,
          quando: t.quando,
          cupom: Boolean(t.cupom),
          enviados: enviados.filter((r) => r.toque === t.id).length,
        })),
        numeros: {
          pessoas: deQuemRecebeu.size,
          enviados: enviados.length,
          cupons: cupons.length,
          cuponsUsados: cupons.filter((c) => cuponsUsados.has(c)).length,
          compraram: vendas.pessoas,
          vendido: vendas.vendido,
          controle: { pessoas: doControle.size, compraram: compras(doControle, pedidos).pessoas },
        },
        ...(id === "estreia" && publico ? { publico } : {}),
      }
    }),
    indicacao: {
      links,
      amigos: premios.length,
      vendido:
        Math.round(
          pedidos
            .filter((p) => p.id && doBrother.has(p.id) && p.status !== "canceled")
            .reduce((soma, p) => soma + (Number(p.total) || 0), 0) * 100
        ) / 100,
      cupons: cuponsDoIndique.length,
      cuponsUsados: cuponsDoIndique.filter((c) => cuponsUsados.has(c)).length,
    },
  }
}

/**
 * O que o painel manda pra mudar: `{ fluxo, ligado }` ou `{ desconto }`.
 * Devolve a configuração nova, ou o erro em frase. Ligar de novo começa do
 * zero: o `desde` vira agora (não dispara pro que ficou parado).
 */
export function mudarConfigDosFluxos(
  atual: ConfigDosFluxos,
  corpo: unknown,
  agora: Date
): { ok: true; config: ConfigDosFluxos } | { ok: false; erro: string } {
  const c = (corpo ?? {}) as { fluxo?: unknown; ligado?: unknown; desconto?: unknown }
  const nova: ConfigDosFluxos = {
    desconto: atual.desconto,
    fluxos: Object.fromEntries(
      IDS_DOS_FLUXOS.map((id) => [id, { ...atual.fluxos[id] }])
    ) as ConfigDosFluxos["fluxos"],
  }
  if (c.desconto !== undefined) {
    const [min, max] = LIMITES_DO_DESCONTO
    const d = Number(c.desconto)
    if (!Number.isInteger(d) || d < min || d > max)
      return { ok: false, erro: `O desconto vai de ${min}% a ${max}%, sem vírgula.` }
    nova.desconto = d
  }
  if (c.fluxo !== undefined || c.ligado !== undefined) {
    if (!IDS_DOS_FLUXOS.includes(c.fluxo as IdDoFluxo) || typeof c.ligado !== "boolean")
      return { ok: false, erro: "Qual fluxo, e ligado ou não?" }
    const id = c.fluxo as IdDoFluxo
    const antes = nova.fluxos[id]
    nova.fluxos[id] = c.ligado
      ? { ligado: true, desde: antes.ligado && antes.desde ? antes.desde : agora }
      : { ligado: false, desde: antes.desde }
  }
  if (c.desconto === undefined && c.fluxo === undefined && c.ligado === undefined)
    return { ok: false, erro: "Nada pra mudar." }
  return { ok: true, config: nova }
}
