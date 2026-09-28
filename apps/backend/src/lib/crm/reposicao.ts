import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { normalizarEmail } from "../../modules/codigo/regras"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import { pedidoDaBase, pedidoDaPessoa } from "../painel/crm"
import { pedidosParaAsEtiquetas } from "../painel/ler"
import { lerAjustesGuardados } from "./ajustes"
import { CURTO_DO_COMPONENTE } from "./estreia"
import {
  componentesDoItem,
  ENTREGA_ESTIMADA_DIAS,
  type Componente,
  type PedidoDaPessoa,
} from "./etiquetas"
import { juntar } from "./nuvemshop"

/**
 * A REPOSIÇÃO (entrega 0185, a etapa 3 do "Ciclo da Barba") — o produto que
 * a pessoa comprou está pra acabar. Pra cada tipo de produto (o Fator, o
 * óleo…), a ÚLTIMA compra paga que o trouxe — na loja nova ou na Nuvemshop —
 * diz o dia em que ele acaba: a entrega (ou a estimada, 7 dias depois de
 * pago) mais as unidades × os dias que cada uma dura (os Ajustes do CRM).
 *
 * Quem manda é o motor (`FLUXOS.reposicao`): 7 e 2 dias antes, 3 e 10 dias
 * depois desse dia, com o "Refazer o pedido" (o link de voltar, tipo repor).
 * Comprou o mesmo tipo de novo, a compra nova vira a última, e a conta
 * recomeça do dia dela. Pra todo cliente (escolha do dono, 28/09), com o
 * sair da lista; sem cupom e sem frete grátis (o plano e a escolha dele).
 *
 * O SITE TAMBÉM AVISA (entrega 0188): quem está com a conta aberta vê "Seu
 * Fator de Crescimento acaba em 5 dias", com o "Refazer o pedido", na visão
 * geral da conta e na home (`avisoDaReposicao`, `GET /store/crm/reposicao`).
 * A mesma conta e a mesma janela dos e-mails, só com os pedidos da pessoa. O
 * aviso não é e-mail: não depende do fluxo ligado nem da lista.
 *
 * As partes puras (a conta de cada tipo, a janela, o aviso) têm testes.
 */

const DIA = 24 * 60 * 60 * 1000

/**
 * O que o e-mail de 7 dias oferece pra durar mais, por tipo (o "subir para"
 * do plano): 3 Fatores pro Fator, o Kit Completo pro cuidado da barba.
 */
export const SUBIR_PARA: Partial<Record<Componente, string>> = {
  fator: "FBKIT06",
  oleo: "FBKIT01",
  shampoo: "FBKIT01",
  balm: "FBKIT01",
}

/** Até quantos dias antes e depois do dia de acabar a reposição olha: os toques e a validade. */
export const JANELA_DA_REPOSICAO = { antes: 8, depois: 11 } as const

export type PedidoDaReposicao = PedidoDaPessoa & {
  /** O pedido pro "Refazer": `order_…` (a loja nova) ou `nso_…` (a Nuvemshop). */
  ref: string
}

export type Reposicao = {
  email: string
  componente: Componente
  /** O pedido da última compra que trouxe esse tipo (`ref`). */
  pedido: string
  /** Os SKUs dos itens desse pedido que trazem esse tipo: "o de sempre". */
  skus: string[]
  /** O dia em que acaba. */
  acaba: Date
}

/** As reposições de uma pessoa: pra cada tipo, a última compra paga que o trouxe, e quando ele acaba. */
export function reposicoesDaPessoa(
  email: string,
  pedidos: readonly PedidoDaReposicao[],
  dias: Record<Componente, number>
): Reposicao[] {
  const pagos = pedidos
    .filter((p) => p.pagoEm && !p.cancelado)
    .sort((a, b) => a.pagoEm!.getTime() - b.pagoEm!.getTime())
  const ultima = new Map<Componente, { p: PedidoDaReposicao; unidades: number; skus: string[] }>()
  for (const p of pagos) {
    const doPedido = new Map<Componente, { unidades: number; skus: Set<string> }>()
    for (const item of p.itens)
      for (const { componente, unidades } of componentesDoItem(item)) {
        const tipo = doPedido.get(componente) ?? { unidades: 0, skus: new Set<string>() }
        tipo.unidades += unidades * Math.max(1, item.quantidade)
        const sku = item.sku?.trim().toUpperCase()
        if (sku) tipo.skus.add(sku)
        doPedido.set(componente, tipo)
      }
    // Em ordem de compra: a mais nova passa por cima.
    for (const [componente, tipo] of doPedido)
      ultima.set(componente, { p, unidades: tipo.unidades, skus: [...tipo.skus] })
  }
  return [...ultima].map(([componente, { p, unidades, skus }]) => {
    const entrega = p.entregueEm ?? new Date(p.pagoEm!.getTime() + ENTREGA_ESTIMADA_DIAS * DIA)
    return {
      email,
      componente,
      pedido: p.ref,
      skus,
      acaba: new Date(entrega.getTime() + unidades * dias[componente] * DIA),
    }
  })
}

/** Se o dia de acabar está perto de agora: dá tempo de sair um toque. */
export function naJanelaDaReposicao(r: Reposicao, agora: Date): boolean {
  const dias = (r.acaba.getTime() - agora.getTime()) / DIA
  return dias <= JANELA_DA_REPOSICAO.antes && dias >= -JANELA_DA_REPOSICAO.depois
}

/**
 * QUEM ESTÁ NA HORA DA REPOSIÇÃO, agora: os pedidos pagos da loja nova e da
 * base da Nuvemshop, juntos pelo e-mail, com os dias dos Ajustes.
 */
export async function publicoDaReposicao(
  container: MedusaContainer,
  agora: Date = new Date()
): Promise<Reposicao[]> {
  const [daLoja, daBase, lojas] = await Promise.all([
    pedidosParaAsEtiquetas(container),
    container.resolve<CrmService>(CRM).pedidosDaBase(),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const { dias } = lerAjustesGuardados(lojas[0]?.metadata)
  const porEmail = new Map<string, PedidoDaReposicao[]>()
  for (const o of daLoja) {
    const email = normalizarEmail(o.email)
    if (email) juntar(porEmail, email, { ...pedidoDaPessoa(o), ref: o.id })
  }
  for (const p of daBase) if (p.id) juntar(porEmail, p.email, { ...pedidoDaBase(p), ref: p.id })
  return [...porEmail].flatMap(([email, pedidos]) =>
    reposicoesDaPessoa(email, pedidos, dias).filter((r) => naJanelaDaReposicao(r, agora))
  )
}

/**
 * AS REPOSIÇÕES DE UMA PESSOA, agora (o aviso do site, 0188): a conta do
 * `publicoDaReposicao`, só com os pedidos dela — os da loja nova feitos com o
 * e-mail e os da base da Nuvemshop — e os dias dos Ajustes.
 */
export async function reposicoesDoEmail(
  container: MedusaContainer,
  email: string,
  agora: Date = new Date()
): Promise<Reposicao[]> {
  const [daLoja, daBase, lojas] = await Promise.all([
    pedidosParaAsEtiquetas(container, { email }),
    container.resolve<CrmService>(CRM).pedidosDaBase(email),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const { dias } = lerAjustesGuardados(lojas[0]?.metadata)
  const pedidos: PedidoDaReposicao[] = [
    ...daLoja
      .filter((o) => normalizarEmail(o.email) === email)
      .map((o) => ({ ...pedidoDaPessoa(o), ref: o.id })),
    ...daBase.flatMap((p) => (p.id ? [{ ...pedidoDaBase(p), ref: p.id }] : [])),
  ]
  return reposicoesDaPessoa(email, pedidos, dias).filter((r) => naJanelaDaReposicao(r, agora))
}

/** O produto da foto do aviso: um do "de sempre" que a loja ainda vende. */
export type ProdutoDoAviso = { nome: string; handle: string; imagem: string | null }

/** O AVISO DA REPOSIÇÃO NO SITE (0188): o que a conta e a home mostram. */
export type AvisoDaReposicao = {
  componente: Componente
  /** O pedido da última compra que trouxe esse tipo: `order_…` ou `nso_…`. */
  pedido: string
  /** "Seu Fator de Crescimento acaba em 5 dias", "Acabou o óleo?". */
  titulo: string
  /** A conta por trás do aviso e o que o botão faz, em duas frases. */
  texto: string
  /** Quantos dias (de Brasília) até acabar: 0 é hoje; negativo, há quantos acabou. */
  dias: number
  produto: ProdutoDoAviso
  /** O "Refazer o pedido": `/voltar/<t>`, o mesmo link dos e-mails. */
  voltar: string
  /** Pro "fechar" da home valer só pra este aviso: o tipo e o dia de acabar. */
  chave: string
}

const DIA_DE_BRASILIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
/** "2026-10-03": o dia no fuso da loja. */
const diaDe = (d: Date) => DIA_DE_BRASILIA.format(d)

/** Quantos dias de Brasília de `agora` até `acaba`: 0 é hoje, 1 amanhã, −1 ontem. */
export function diasAteAcabar(acaba: Date, agora: Date): number {
  return Math.round((Date.parse(diaDe(acaba)) - Date.parse(diaDe(agora))) / DIA)
}

/** O que o aviso escreve, pelo tipo e pelos dias. Sem palavra de propaganda, como os e-mails. */
export function textoDoAviso(
  componente: Componente,
  dias: number
): { titulo: string; texto: string } {
  const { curto, artigo } = CURTO_DO_COMPONENTE[componente]
  if (dias < 0)
    return {
      titulo: `Acabou ${artigo} ${curto}?`,
      texto:
        `Pelas nossas contas, acabou ${dias === -1 ? "ontem" : `há ${-dias} dias`}. Se ainda ` +
        "não repôs, o botão monta o mesmo pedido.",
    }
  const quando = dias === 0 ? "hoje" : dias === 1 ? "amanhã" : `em ${dias} dias`
  return {
    titulo: `${artigo === "a" ? "Sua" : "Seu"} ${curto} acaba ${quando}`,
    texto:
      "Pelas nossas contas, a partir da sua última compra. Pra não parar no meio, o botão " +
      "monta o mesmo pedido.",
  }
}

const ORDEM_DOS_TIPOS = Object.keys(CURTO_DO_COMPONENTE)

/**
 * O AVISO, das reposições da pessoa: a do tipo que acaba primeiro (o que já
 * acabou vem antes), dentro da janela dos e-mails — e só se a loja ainda
 * vende algum produto da última compra desse tipo (`porSku`, só os
 * publicados): sem ele, nem foto, nem o que o "Refazer" montar.
 */
export function avisoDaReposicao(
  reposicoes: readonly Reposicao[],
  porSku: ReadonlyMap<string, ProdutoDoAviso>,
  voltar: (pedido: string) => string,
  agora: Date
): AvisoDaReposicao | null {
  const emOrdem = [...reposicoes].sort(
    (a, b) =>
      a.acaba.getTime() - b.acaba.getTime() ||
      ORDEM_DOS_TIPOS.indexOf(a.componente) - ORDEM_DOS_TIPOS.indexOf(b.componente)
  )
  for (const r of emOrdem) {
    if (!naJanelaDaReposicao(r, agora)) continue
    const produto = r.skus.map((s) => porSku.get(s)).find((p) => p !== undefined)
    if (!produto) continue
    const dias = diasAteAcabar(r.acaba, agora)
    return {
      componente: r.componente,
      pedido: r.pedido,
      ...textoDoAviso(r.componente, dias),
      dias,
      produto: { nome: produto.nome, handle: produto.handle, imagem: produto.imagem },
      voltar: voltar(r.pedido),
      chave: `${r.componente}.${diaDe(r.acaba)}`,
    }
  }
  return null
}
