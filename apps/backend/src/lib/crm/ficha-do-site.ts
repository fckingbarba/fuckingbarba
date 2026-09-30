import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { normalizarEmail } from "../../modules/codigo/regras"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import { PRODUTOS_DAS_TRILHAS, semMarcas } from "../emails/boas-vindas"
import { pedidoDaBase, pedidoDaPessoa } from "../painel/crm"
import { pedidosParaAsEtiquetas } from "../painel/ler"
import { lerPdp, type PassoDoTempo } from "../pdp"
import { lerAjustesGuardados } from "./ajustes"
import { produtosPorSku } from "./estreia"
import { componentesDoItem, ENTREGA_ESTIMADA_DIAS, type Componente } from "./etiquetas"
import { SKU_DA_ROTINA, sugestoesDaRotina } from "./jornada"
import {
  avisoDaReposicao,
  diasNoCalendario,
  reposicoesDaPessoa,
  type AvisoDaReposicao,
  type PedidoDaReposicao,
  type ProdutoDoAviso,
} from "./reposicao"
import { linkDeVoltar } from "./voltar"

/**
 * A FICHA DO SITE (entregas 0188 e 0190, "o site usando a ficha" do plano) —
 * o que a loja sabe de quem está com a conta aberta, pelas compras dele (na
 * loja nova e na Nuvemshop), com as contas do CRM:
 *
 *   - a reposição: o que está acabando (`avisoDaReposicao`), na conta e na home;
 *   - o tratamento: "Dia 23 do seu tratamento", na conta — os dias desde a
 *     chegada do Fator, com o próximo marco da linha do tempo da página dele;
 *   - as compras: "Você comprou há 25 dias", na página de cada produto;
 *   - o que combina: "Combina com o Fator que você já tem", na página do que
 *     completa a rotina (`sugestoesDaRotina`, a matriz dos e-mails de 21 dias).
 *
 * Não é e-mail: não depende de fluxo ligado nem da lista. Quem pergunta é a
 * loja (`GET /store/crm/ficha`), com o token do cliente. As partes puras
 * (`fichaDoSite`, `diaDoPasso`) têm testes.
 */

const DIA = 24 * 60 * 60 * 1000

/** Sem um marco com "alvo" na linha do tempo do Fator, a barra vai até 90 dias (o plano). */
export const ALVO_PADRAO = 90

/** Por que cada produto da rotina completa combina com o que a pessoa já tem, pelo SKU. */
export const PORQUE_DA_ROTINA: Record<string, string> = {
  [SKU_DA_ROTINA.oleo]: "Combina com o Fator que você já tem",
  [SKU_DA_ROTINA.shampoo]: "Fecha a rotina do Fator e do óleo que você usa",
  [SKU_DA_ROTINA.kitCompleto]: "Completa a rotina da barba que você começou",
  [SKU_DA_ROTINA.tresFatores]: "Os 90 dias do tratamento, de uma vez",
  [SKU_DA_ROTINA.fator]: "O próximo passo da rotina que você já usa",
}

export type TratamentoDoSite = {
  /** "Dia 23": o dia da chegada do Fator é o dia 1. */
  dia: number
  /** Onde a barra termina: o marco com "alvo" da linha do tempo (o dia 90). */
  alvo: number
  /** O primeiro marco da linha do tempo depois de hoje. */
  marco: { quando: string; titulo: string; texto: string } | null
  /** A página do Fator… */
  handle: string
  /** …e se a linha do tempo está ligada nela: o link da conta desce até a seção. */
  linhaDoTempo: boolean
}

export type FichaDoSite = {
  reposicao: AvisoDaReposicao | null
  tratamento: TratamentoDoSite | null
  /** O que a pessoa comprou, por produto: há quantos dias foi a última compra paga dele. */
  compras: { handle: string; dias: number }[]
  /** O que completa a rotina dela, pelo produto, com o porquê. */
  combina: { handle: string; porque: string }[]
}

/**
 * Em que dia do tratamento fica um marco da linha do tempo, pelo "quando"
 * que o dono escreveu na página: "Dia 30" é 30; "Semanas 1 e 2", 14; "3 a 6
 * meses", 180 (o fim da faixa: o marco vale até lá). Sem número, `null`.
 */
export function diaDoPasso(quando: string): number | null {
  const t = quando.toLowerCase()
  const faixa = (n: string) => `(\\d+)\\s*(?:a|e|-|–|até)\\s*(\\d+)\\s*${n}`
  let m = new RegExp(faixa("m[eê]s")).exec(t)
  if (m) return Number(m[2]) * 30
  if ((m = /(\d+)\s*m[eê]s/.exec(t))) return Number(m[1]) * 30
  if ((m = /semanas?\s*(\d+)(?:\s*(?:a|e|-|–|até)\s*(\d+))?/.exec(t)))
    return Number(m[2] ?? m[1]) * 7
  if ((m = /(\d+)\s*semanas?/.exec(t))) return Number(m[1]) * 7
  if ((m = /dia\s*(\d+)/.exec(t))) return Number(m[1])
  if ((m = /(\d+)\s*dias?/.exec(t))) return Number(m[1])
  return null
}

const temFator = (itens: PedidoDaReposicao["itens"]) =>
  itens.some((i) => componentesDoItem(i).some((c) => c.componente === "fator"))

/** Quantas unidades de Fator vieram no pedido (o kit de 3 conta 3). */
function fatoresDo(p: PedidoDaReposicao): number {
  let n = 0
  for (const item of p.itens)
    for (const c of componentesDoItem(item))
      if (c.componente === "fator") n += c.unidades * Math.max(1, item.quantidade)
  return n
}

const entregaDo = (p: PedidoDaReposicao) =>
  p.entregueEm ?? new Date(p.pagoEm!.getTime() + ENTREGA_ESTIMADA_DIAS * DIA)

/**
 * O TRATAMENTO: o Fator em uso, sem parar. Conta da chegada do primeiro Fator
 * da sequência — cada compra que chega antes de o anterior acabar (mais a
 * tolerância dos Ajustes, a mesma do "em risco") continua a mesma. Some
 * quando o último acaba: daí em diante, quem fala é a reposição.
 */
function tratamentoDe(
  pagos: readonly PedidoDaReposicao[],
  diasDoFator: number,
  tolerancia: number,
  fator: FichaDoFator | null,
  agora: Date
): TratamentoDoSite | null {
  const doFator = pagos
    .filter((p) => temFator(p.itens))
    .map((p) => {
      const chega = entregaDo(p)
      return { chega, acaba: new Date(chega.getTime() + fatoresDo(p) * diasDoFator * DIA) }
    })
  const ultimo = doFator.at(-1)
  if (!ultimo || agora > ultimo.acaba) return null
  let inicio = ultimo.chega
  for (let i = doFator.length - 2; i >= 0; i--) {
    if (doFator[i + 1].chega.getTime() > doFator[i].acaba.getTime() + tolerancia * DIA) break
    inicio = doFator[i].chega
  }
  if (inicio > agora) return null
  const dia = diasNoCalendario(inicio, agora) + 1
  const passos = (fator?.passos ?? []).flatMap((p) => {
    const d = diaDoPasso(p.quando)
    return d === null ? [] : [{ ...p, dia: d }]
  })
  const proximo = passos.find((p) => p.dia > dia)
  return {
    dia,
    alvo: passos.find((p) => p.alvo)?.dia ?? ALVO_PADRAO,
    marco: proximo
      ? { quando: proximo.quando, titulo: proximo.titulo, texto: proximo.texto }
      : null,
    handle: fator?.handle ?? PRODUTOS_DAS_TRILHAS.fator,
    linhaDoTempo: fator?.comLinhaDoTempo ?? false,
  }
}

/** O Fator avulso, com a linha do tempo da página dele (o conteúdo, sem as marcas). */
export type FichaDoFator = {
  handle: string
  passos: readonly PassoDoTempo[]
  /** A seção está ligada na página: o link da conta desce até ela. */
  comLinhaDoTempo: boolean
}

export function fichaDoSite(e: {
  email: string
  pedidos: readonly PedidoDaReposicao[]
  dias: Record<Componente, number>
  tolerancia: number
  /** Os produtos publicados, pelo SKU (o código do Bling, em maiúsculas). */
  porSku: ReadonlyMap<string, ProdutoDoAviso>
  fator: FichaDoFator | null
  voltar: (pedido: string) => string
  agora: Date
}): FichaDoSite {
  const pagos = e.pedidos
    .filter((p) => p.pagoEm && !p.cancelado)
    .sort((a, b) => a.pagoEm!.getTime() - b.pagoEm!.getTime())
  const doSku = (sku: string | null | undefined) =>
    sku ? e.porSku.get(sku.trim().toUpperCase()) : undefined

  // As compras: a última de cada produto (o da loja nova pelo endereço; o da Nuvemshop, pelo SKU).
  const ultimaDe = new Map<string, Date>()
  const tem = new Set<Componente>()
  for (const p of pagos)
    for (const item of p.itens) {
      const handle = item.handle ?? doSku(item.sku)?.handle
      if (handle) ultimaDe.set(handle, p.pagoEm!)
      for (const c of componentesDoItem(item)) tem.add(c.componente)
    }
  const compras = [...ultimaDe].map(([handle, em]) => ({
    handle,
    dias: Math.max(0, diasNoCalendario(em, e.agora)),
  }))

  // O que combina: a rotina completa pelo que ela já tem — nunca o que ela já comprou.
  const ultimoComFator = [...pagos].reverse().find((p) => temFator(p.itens))
  const combina = sugestoesDaRotina(tem, ultimoComFator ? fatoresDo(ultimoComFator) : 0).flatMap(
    (sku) => {
      const produto = e.porSku.get(sku)
      return produto && !ultimaDe.has(produto.handle) && PORQUE_DA_ROTINA[sku]
        ? [{ handle: produto.handle, porque: PORQUE_DA_ROTINA[sku] }]
        : []
    }
  )

  return {
    reposicao: avisoDaReposicao(
      reposicoesDaPessoa(e.email, pagos, e.dias),
      e.porSku,
      e.voltar,
      e.agora
    ),
    tratamento: tratamentoDe(pagos, e.dias.fator, e.tolerancia, e.fator, e.agora),
    compras,
    combina,
  }
}

/**
 * A FICHA DE UMA PESSOA, agora: os pedidos dela (os da loja nova feitos com o
 * e-mail, os da base da Nuvemshop), os Ajustes do CRM, os produtos pelo SKU e
 * a linha do tempo da página do Fator.
 */
export async function lerFichaDoSite(
  container: MedusaContainer,
  email: string,
  agora: Date = new Date()
): Promise<FichaDoSite> {
  const [daLoja, daBase, lojas, fatores] = await Promise.all([
    pedidosParaAsEtiquetas(container, { email }),
    container.resolve<CrmService>(CRM).pedidosDaBase(email),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
    container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph({
        entity: "product",
        fields: ["handle", "metadata"],
        filters: { handle: PRODUTOS_DAS_TRILHAS.fator, status: "published" },
      })
      .then((r) => r.data as { handle: string; metadata?: Record<string, unknown> | null }[]),
  ])
  const { dias, regras } = lerAjustesGuardados(lojas[0]?.metadata)
  const pedidos: PedidoDaReposicao[] = [
    ...daLoja
      .filter((o) => normalizarEmail(o.email) === email)
      .map((o) => ({ ...pedidoDaPessoa(o), ref: o.id })),
    ...daBase.flatMap((p) => (p.id ? [{ ...pedidoDaBase(p), ref: p.id }] : [])),
  ]
  const skus = new Set<string>(Object.values(SKU_DA_ROTINA))
  for (const p of pedidos)
    for (const i of p.itens) if (i.sku?.trim()) skus.add(i.sku.trim().toUpperCase())
  const porSku = await produtosPorSku(container, [...skus])
  const fator = fatores[0]
    ? (() => {
        const pdp = lerPdp(fatores[0].metadata)
        const passos = (pdp.conteudo.tempo?.passos ?? []).map((p) => ({
          quando: semMarcas(p.quando),
          titulo: semMarcas(p.titulo),
          texto: semMarcas(p.texto),
          ...(p.alvo ? { alvo: true } : {}),
        }))
        return {
          handle: fatores[0].handle,
          passos,
          comLinhaDoTempo:
            passos.length > 0 && pdp.layout.visibilidade?.["produto.tempo"] !== false,
        }
      })()
    : null
  return fichaDoSite({
    email,
    pedidos,
    dias,
    tolerancia: regras.toleranciaDaReposicao,
    porSku,
    fator,
    voltar: (pedido) => `/voltar/${linkDeVoltar(`repor-${pedido}`, agora)}`,
    agora,
  })
}
