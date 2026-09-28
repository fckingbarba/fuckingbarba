import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { normalizarEmail } from "../../modules/codigo/regras"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import { pedidoDaBase, pedidoDaPessoa } from "../painel/crm"
import { pedidosParaAsEtiquetas } from "../painel/ler"
import { lerAjustesGuardados } from "./ajustes"
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
 * As partes puras (a conta de cada tipo, a janela) têm testes.
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
