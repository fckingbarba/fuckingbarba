import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import { pedidoDaBase, pedidoDaPessoa } from "../painel/crm"
import { pedidosParaAsEtiquetas } from "../painel/ler"
import { componentesDoItem, type Componente } from "./etiquetas"
import type { Entrada, Registro } from "./fluxos"
import { sugestoesDaRotina } from "./jornada"

/**
 * A NAVEGAÇÃO ABANDONADA (entrega 0198, a etapa 4 do "Ciclo da Barba") —
 * quem a loja conhece (aceitou os cookies e já disse quem é: a conta, a
 * newsletter, o checkout) e mostrou interesse num produto:
 *
 *   - viu a página dele 2 vezes, com pelo menos 1 minuto entre as duas e
 *     até 7 dias uma da outra;
 *   - ficou 1 minuto nela, com a aba na frente (`produto_lido`);
 *   - ou assistiu o "Vê na prática" (`video_assistido`).
 *
 * O começo é a hora desse interesse. Em 3 horas, "Ficou de olho no …?"; em
 * 24, "Quem levou o … também levou…" (a rotina completa). Sem cupom: é o
 * plano (intenção menor, margem protegida). Quem manda é o motor
 * (`FLUXOS.navegacao`); os e-mails são `lib/emails/navegacao.ts`.
 *
 * SAI quem, depois do interesse, pôs qualquer coisa na sacola (aí quem cuida
 * é o carrinho), começou o checkout ou comprou.
 *
 * UMA NAVEGAÇÃO A CADA 7 DIAS por pessoa (`navegacaoDaVez`): a que já
 * começou vai até o fim, e outra só 7 dias depois da última. Entre dois
 * interesses novos, o mais novo.
 *
 * As partes puras têm testes.
 */

const MINUTO = 60 * 1000
const DIA = 24 * 60 * MINUTO

/** Até quantos dias entre as duas visitas ao mesmo produto: o "viu 2 vezes". */
export const JANELA_DAS_VISITAS = 7 * DIA

/** O mínimo entre as duas visitas: recarregar a página não é voltar a ela. */
export const INTERVALO_DAS_VISITAS = MINUTO

/** Uma navegação a cada tantos dias por pessoa. */
export const INTERVALO_DA_NAVEGACAO = 7 * DIA

/** As anotações da loja que mostram interesse num produto. */
export const TIPOS_DO_INTERESSE = ["produto_visto", "produto_lido", "video_assistido"] as const
export type TipoDoInteresse = (typeof TIPOS_DO_INTERESSE)[number]

/** As que dizem que a pessoa agiu: pôs na sacola, começou o checkout. */
export const TIPOS_DA_ACAO = ["sacola_entrou", "checkout_comecou", "contato_informado"] as const

/** O que a pessoa fez com um produto (pelo endereço dele): a visita, o minuto, o vídeo. */
export type SinalDoProduto = { tipo: TipoDoInteresse; produto: string; em: Date }

export type Interesse = {
  /** O endereço do produto ("oleo-para-barba"). */
  produto: string
  em: Date
  /** Por que conta: a 2ª visita, o minuto na página, ou o vídeo. */
  porque: "duas-visitas" | "um-minuto" | "video"
}

/** O primeiro interesse em cada produto, do mais velho pro mais novo. */
export function interessesDaPessoa(sinais: readonly SinalDoProduto[]): Interesse[] {
  const porProduto = new Map<string, SinalDoProduto[]>()
  for (const s of sinais) porProduto.set(s.produto, [...(porProduto.get(s.produto) ?? []), s])
  const interesses: Interesse[] = []
  for (const [produto, lista] of porProduto) {
    let visitaAntes: Date | null = null
    for (const s of [...lista].sort((a, b) => a.em.getTime() - b.em.getTime())) {
      if (s.tipo === "produto_lido") {
        interesses.push({ produto, em: s.em, porque: "um-minuto" })
        break
      }
      if (s.tipo === "video_assistido") {
        interesses.push({ produto, em: s.em, porque: "video" })
        break
      }
      const entre = visitaAntes ? s.em.getTime() - visitaAntes.getTime() : null
      if (entre !== null && entre < INTERVALO_DAS_VISITAS) continue
      if (entre !== null && entre <= JANELA_DAS_VISITAS) {
        interesses.push({ produto, em: s.em, porque: "duas-visitas" })
        break
      }
      visitaAntes = s.em
    }
  }
  return interesses.sort((a, b) => a.em.getTime() - b.em.getTime())
}

/** Se a pessoa agiu (sacola, checkout) depois desta hora. */
export const agiuDepois = (acoes: readonly Date[], depois: Date) =>
  acoes.some((a) => a.getTime() > depois.getTime())

const DIA_DE_BRASILIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** A chave de uma navegação: a pessoa, o produto e o dia do interesse (em Brasília). */
export const chaveDaNavegacao = (email: string, produto: string, em: Date) =>
  `${email}|${produto}|${DIA_DE_BRASILIA.format(em)}`

/**
 * A NAVEGAÇÃO DA VEZ de uma pessoa, das entradas dela: a que já tem toque no
 * registro vai até o fim; sem ela, nenhuma se a última foi há menos de 7
 * dias; e, entre as novas, a mais nova.
 */
export function navegacaoDaVez(
  entradas: readonly Entrada[],
  registros: readonly Registro[],
  agora: Date
): Entrada | null {
  const novasPrimeiro = entradas
    .filter((e) => e.fluxo === "navegacao")
    .sort((a, b) => b.comeco.getTime() - a.comeco.getTime())
  if (!novasPrimeiro.length) return null
  const feitos = registros.filter((r) => r.fluxo === "navegacao")
  const comecada = novasPrimeiro.find((e) => feitos.some((r) => r.chave === e.chave))
  if (comecada) return comecada
  if (feitos.some((r) => agora.getTime() - r.em.getTime() < INTERVALO_DA_NAVEGACAO)) return null
  return novasPrimeiro[0]
}

/** As entradas da pessoa com só a navegação da vez — as dos outros fluxos ficam como estão. */
export function comANavegacaoDaVez(
  entradas: readonly Entrada[],
  registros: readonly Registro[],
  agora: Date
): Entrada[] {
  const daVez = navegacaoDaVez(entradas, registros, agora)
  return entradas.filter((e) => e.fluxo !== "navegacao" || e === daVez)
}

/**
 * O QUE COMPLETA A ROTINA de quem olhou o produto (o e-mail de 24 horas): a
 * matriz do plano (`sugestoesDaRotina`), com o produto como se já fosse da
 * pessoa — quem olhou o Fator vê o óleo e os 3 Fatores (o preço de 3
 * unidades); quem olhou um cuidado, o Kit Completo. Pelo SKU.
 */
export function sugestoesDaNavegacao(produto: string, tem: ReadonlySet<Componente>): string[] {
  const doProduto = componentesDoItem({ handle: produto })
  const fatores = doProduto
    .filter((c) => c.componente === "fator")
    .reduce((soma, c) => soma + c.unidades, 0)
  return sugestoesDaRotina(new Set([...tem, ...doProduto.map((c) => c.componente)]), fatores)
}

/** O que a pessoa já tem, das compras pagas das duas lojas: a sugestão é só do que falta. */
export async function oQueAPessoaTem(
  container: MedusaContainer,
  email: string
): Promise<Set<Componente>> {
  const [daLoja, daBase] = await Promise.all([
    pedidosParaAsEtiquetas(container, { email }),
    container.resolve<CrmService>(CRM).pedidosDaBase(email),
  ])
  const tem = new Set<Componente>()
  for (const p of [...daLoja.map((o) => pedidoDaPessoa(o)), ...daBase.map(pedidoDaBase)])
    if (p.pagoEm && !p.cancelado)
      for (const item of p.itens) for (const c of componentesDoItem(item)) tem.add(c.componente)
  return tem
}

/** Quem está na navegação: a pessoa, o produto e a hora do interesse. */
export type NavegacaoDaPessoa = {
  email: string
  produto: string
  em: Date
  /** Se pôs na sacola ou começou o checkout depois (pelas anotações da loja). */
  agiu: boolean
}

/**
 * OS INTERESSES DE QUEM A LOJA CONHECE, desde tal hora: as anotações das
 * pessoas identificadas (`crm.navegacoesDesde`), com o produto pela variante
 * — só os publicados. Cada interesse sai com a hora e se a pessoa agiu depois.
 */
export async function publicoDaNavegacao(
  container: MedusaContainer,
  desde: Date
): Promise<NavegacaoDaPessoa[]> {
  const lidas = await container.resolve<CrmService>(CRM).navegacoesDesde(desde)
  if (!lidas.length) return []
  const variantes = [...new Set(lidas.flatMap((l) => (l.variante ? [l.variante] : [])))]
  const produtoDa = new Map<string, string>()
  for (let i = 0; i < variantes.length; i += 500) {
    const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "product_variant",
      fields: ["id", "product.handle", "product.status"],
      filters: { id: variantes.slice(i, i + 500) },
    })
    for (const v of data as {
      id: string
      product?: { handle?: string | null; status?: string | null } | null
    }[])
      if (v.product?.handle && v.product.status === "published")
        produtoDa.set(v.id, v.product.handle)
  }
  const porEmail = new Map<string, typeof lidas>()
  for (const l of lidas) porEmail.set(l.email, [...(porEmail.get(l.email) ?? []), l])
  const ehInteresse = (t: string): t is TipoDoInteresse =>
    (TIPOS_DO_INTERESSE as readonly string[]).includes(t)
  return [...porEmail].flatMap(([email, dela]) => {
    const sinais = dela.flatMap((l) => {
      const produto = l.variante ? produtoDa.get(l.variante) : undefined
      return ehInteresse(l.tipo) && produto ? [{ tipo: l.tipo, produto, em: l.em }] : []
    })
    const acoes = dela
      .filter((l) => (TIPOS_DA_ACAO as readonly string[]).includes(l.tipo))
      .map((l) => l.em)
    return interessesDaPessoa(sinais).map((i) => ({
      email,
      produto: i.produto,
      em: i.em,
      agiu: agiuDepois(acoes, i.em),
    }))
  })
}
