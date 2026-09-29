import type { MedusaContainer } from "@medusajs/framework/types"
import { normalizarEmail } from "../../modules/codigo/regras"
import { pedidoDaBase, pedidoDaPessoa } from "../painel/crm"
import { componentesDoItem, type Componente, type PedidoDaPessoa } from "./etiquetas"
import { leituraDaRodada, type LeituraDaRodada } from "./leitura"
import { juntar } from "./nuvemshop"
import { trilhaDosComponentes, type Trilha } from "./primeira-compra"

/**
 * A JORNADA DO RESULTADO (entrega 0187, a etapa 3 do "Ciclo da Barba") — os
 * e-mails de depois que o pedido chega, contados do dia da entrega (o aviso
 * da Frenet, ou 10 dias depois de pago, sem o aviso):
 *
 *   - quando chega: o modo de uso do produto (a página dele);
 *   - 3 dias: não pular dia (só com o Fator);
 *   - 7 dias: o check-in, "Como tá indo?" (`lib/crm/checkin.ts`);
 *   - 10 dias: o indique um brother, pra quem está gostando (0215,
 *     `lib/crm/indicacao.ts`);
 *   - 21 dias: a rotina completa — o que falta pra ela (`sugestoesDaRotina`);
 *   - 40 dias: o lembrete do indique, se nenhum brother comprou;
 *   - 60 dias: o dia 60 do Fator (só com ele).
 *
 * Um pedido, uma jornada (a chave é o pedido). Pedido novo começa outra, e o
 * motor fica com a mais nova (um fluxo por vez). Só pedidos da loja nova: os
 * da Nuvemshop já chegaram há tempo. Quem manda é o motor (`FLUXOS.jornada`).
 *
 * As partes puras (a rotina completa, o dia da chegada) têm testes.
 */

const DIA = 24 * 60 * 60 * 1000

/** Sem o aviso de entrega da Frenet, o pedido conta como chegado tantos dias depois de pago. */
export const CHEGA_SEM_AVISO_DIAS = 10

/** A janela da jornada: da chegada até o último toque (60 dias) e a validade, e os que ainda vão chegar. */
export const JANELA_DA_JORNADA = { antes: 61, depois: CHEGA_SEM_AVISO_DIAS + 1 } as const

/** Os produtos que completam a rotina, pelo SKU (o código do Bling). */
export const SKU_DA_ROTINA = {
  oleo: "FBOL01",
  shampoo: "FBSH01",
  kitCompleto: "FBKIT01",
  tresFatores: "FBKIT06",
} as const

/**
 * O QUE COMPLETA A ROTINA (a matriz do plano): pelo que a pessoa já tem, em
 * qualquer compra, até dois produtos. Quem tem o Fator e não tem o óleo, o
 * óleo; com os dois, o shampoo; quem cuida da barba sem ter os três, o Kit
 * Completo; e quem levou 1 Fator só, os 3 Fatores (90 dias).
 */
export function sugestoesDaRotina(tem: ReadonlySet<Componente>, fatoresNoPedido: number): string[] {
  const sugestoes: string[] = []
  if (tem.has("fator") && !tem.has("oleo")) sugestoes.push(SKU_DA_ROTINA.oleo)
  else if (tem.has("fator") && !tem.has("shampoo")) sugestoes.push(SKU_DA_ROTINA.shampoo)
  const cuidado = (["oleo", "shampoo", "balm"] as const).filter((c) => tem.has(c))
  if (cuidado.length && cuidado.length < 3) sugestoes.push(SKU_DA_ROTINA.kitCompleto)
  if (fatoresNoPedido === 1) sugestoes.push(SKU_DA_ROTINA.tresFatores)
  return sugestoes.slice(0, 2)
}

/** O dia em que o pedido chegou: o aviso de entrega, ou tantos dias depois de pago. */
export function chegadaDo(p: PedidoDaPessoa): Date | null {
  if (!p.pagoEm || p.cancelado) return null
  return p.entregueEm ?? new Date(p.pagoEm.getTime() + CHEGA_SEM_AVISO_DIAS * DIA)
}

export type JornadaDoPedido = {
  email: string
  /** O pedido (`order_…`): a chave da jornada, e o check-in. */
  pedido: string
  numero: number | null
  chegou: Date
  /** Os produtos do pedido, pelo endereço, na ordem dos itens. */
  handles: string[]
  /** Se o Fator veio no pedido: os e-mails de 3 e de 60 dias. */
  temFator: boolean
  /** O que completa a rotina, pelo SKU (o e-mail de 21 dias). */
  sugestoes: string[]
  /**
   * Se a pessoa já tinha comprado antes deste pedido, numa das duas lojas: a
   * 2ª compra é sinal de quem está gostando (o indique um brother, 0215).
   */
  recorrente: boolean
  /**
   * De que é o pedido — a trilha do pop-up: o Fator manda (crescer a barba);
   * depois o óleo, o balm e o shampoo (cuidar); depois a pasta e o spray
   * (cabelo). É o assunto do convite do indique (0217).
   */
  trilha: Trilha
}

/** As jornadas de uma pessoa: cada pedido pago da loja nova, com o que ela tem em todas as compras. */
export function jornadasDaPessoa(
  email: string,
  daLoja: readonly PedidoDaPessoa[],
  daBase: readonly PedidoDaPessoa[]
): JornadaDoPedido[] {
  const tem = new Set<Componente>()
  for (const p of [...daLoja, ...daBase])
    if (p.pagoEm && !p.cancelado)
      for (const item of p.itens) for (const c of componentesDoItem(item)) tem.add(c.componente)
  const pagos = [...daLoja, ...daBase].filter((p) => p.pagoEm && !p.cancelado)
  return daLoja.flatMap((p) => {
    const chegou = chegadaDo(p)
    if (!chegou) return []
    const pagoEm = p.pagoEm!.getTime()
    let fatores = 0
    const doPedido: Componente[] = []
    for (const item of p.itens)
      for (const c of componentesDoItem(item)) {
        doPedido.push(c.componente)
        if (c.componente === "fator") fatores += c.unidades * Math.max(1, item.quantidade)
      }
    return [
      {
        email,
        pedido: p.id,
        numero: p.numero ? Number(p.numero) : null,
        chegou,
        handles: [...new Set(p.itens.flatMap((i) => (i.handle ? [i.handle] : [])))],
        temFator: fatores > 0,
        sugestoes: sugestoesDaRotina(tem, fatores),
        recorrente: pagos.some((o) => o.id !== p.id && o.pagoEm!.getTime() < pagoEm),
        trilha: trilhaDosComponentes(doPedido),
      },
    ]
  })
}

/** Se a chegada está na janela: dá tempo de sair algum toque. */
export function naJanelaDaJornada(j: JornadaDoPedido, agora: Date): boolean {
  const dias = (agora.getTime() - j.chegou.getTime()) / DIA
  return dias <= JANELA_DA_JORNADA.antes && dias >= -JANELA_DA_JORNADA.depois
}

/** QUEM ESTÁ NA JORNADA, agora: os pedidos pagos da loja nova, com as compras da base junto. */
export async function publicoDaJornada(
  container: MedusaContainer,
  agora: Date = new Date(),
  leitura: LeituraDaRodada = leituraDaRodada(container)
): Promise<JornadaDoPedido[]> {
  const [daLoja, daBase] = await Promise.all([leitura.pedidosDaLoja(), leitura.pedidosDaBase()])
  const loja = new Map<string, PedidoDaPessoa[]>()
  for (const o of daLoja) {
    const email = normalizarEmail(o.email)
    if (email) juntar(loja, email, pedidoDaPessoa(o))
  }
  const base = new Map<string, PedidoDaPessoa[]>()
  for (const p of daBase) juntar(base, p.email, pedidoDaBase(p))
  return [...loja].flatMap(([email, pedidos]) =>
    jornadasDaPessoa(email, pedidos, base.get(email) ?? []).filter((j) =>
      naJanelaDaJornada(j, agora)
    )
  )
}
