import type { PoliticaDeFrete } from "../configuracoes"
import { lerEstado, RECUSAS, type Estado } from "../../modules/pagarme/situacao"
import { reais } from "./formato"
import { dentro, type Janela } from "./marketing"
import type { Achado } from "./marketing-canais"
import { pagamentoDo, totalDo, type PedidoCru } from "./pedido"

/**
 * O PAGAMENTO E O FRETE DO MARKETING — como as pessoas pagam, o que não
 * passa, e o que o frete faz com a venda. A aba "Pagamento e frete" do
 * protótipo. Código puro, com testes (`__tests__/marketing-pagamento.unit.spec.ts`).
 *
 * TUDO DA LOJA, pelo estado que o Pagar.me deixa na sessão de pagamento
 * (`lerEstado`: a forma, a situação, as parcelas e a frase da recusa). Os
 * PEDIDOS PAGOS são os do Resumo — pagos no período, sem os cancelados (o
 * cartão que ficou em análise conta no dia que passou); as TENTATIVAS, as
 * feitas no período:
 * - o PIX dos pedidos do período: pago, venceu sem pagar (passou da hora de
 *   vencer que o Pagar.me deu — sem ela, uma hora — ou o pedido já foi
 *   cancelado) ou ainda esperando;
 * - o CARTÃO: cada tentativa é uma sessão — a do pedido e a do carrinho que
 *   não fechou (o cartão recusado na hora não vira pedido). O motivo é a
 *   frase da recusa (`RECUSAS`): a análise de fraude, o banco, os dados. A
 *   mesma pessoa tentando de novo no mesmo carrinho grava por cima: conta a
 *   última tentativa de cada carrinho;
 * - as PARCELAS dos pedidos pagos no cartão;
 * - o FRETE dos pedidos pagos: com frete grátis, o frete médio de quem
 *   pagou, quem desiste no frete (os carrinhos que viram o frete e não
 *   escolheram) e o "quase lá" — quem pagou frete a menos de R$ 30 do piso
 *   do frete grátis (`fb_configuracoes`).
 */

export type TentativasDoCartao = {
  total: number
  aprovados: number
  emAnalise: number
  antifraude: number
  banco: number
  dados: number
  outros: number
}

export type PagamentoEFrete = {
  comoPagaram: { pix: number; cartao: number }
  pix: { gerados: number; pagos: number; venceram: number; esperando: number }
  cartao: TentativasDoCartao
  parcelas: { parcelas: number; pedidos: number }[]
  frete: {
    pedidos: number
    gratis: number
    /** Em %, dos pedidos pagos. */
    parteGratis: number | null
    /** O frete médio de quem pagou frete. */
    medioPago: number | null
    /** Dos carrinhos que viram o frete (deram o CEP), quantos não escolheram a entrega, em %. */
    desistem: number | null
    /** Pedidos que pagaram frete a menos de `QUASE_LA` do piso do frete grátis; `null` sem frete grátis. */
    quaseLa: number | null
    piso: number | null
  }
  achados: Achado[]
}

/** Até onde é "quase lá": a menos disso do piso do frete grátis. */
export const QUASE_LA = 30
/** Sem a hora de vencer do Pagar.me, o Pix que passou disso sem pagar venceu (a loja dá 30 minutos). */
const PIX_VENCE_MS = 60 * 60 * 1000

const centavos = (v: number) => Math.round(v * 100) / 100
const numero = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const PAGARME = "pp_pagarme_pagarme"

type Sessao = {
  provider_id?: string | null
  status?: string | null
  data?: Record<string, unknown> | null
} | null

/** Os estados do Pagar.me nas sessões de uma coleção de pagamento. */
const estadosDas = (sessoes: Sessao[] | null | undefined): Estado[] =>
  (sessoes ?? []).flatMap((s) => {
    const e = s?.provider_id === PAGARME ? lerEstado(s.data ?? null) : null
    return e ? [e] : []
  })

export type PedidoDoPagamento = PedidoCru & { shipping_total?: unknown; item_subtotal?: unknown }

export type CarrinhoDoPagamento = {
  id: string
  created_at: string | Date
  completed_at?: string | Date | null
  shipping_address?: { postal_code?: string | null } | null
  shipping_methods?: ({ id?: string | null } | null)[] | null
  payment_collection?: { payment_sessions?: Sessao[] | null } | null
}

const MOTIVO: [keyof TentativasDoCartao, string][] = [
  ["antifraude", RECUSAS.antifraude],
  ["banco", RECUSAS.banco],
  ["dados", RECUSAS.dados],
]

export function montarPagamento(
  pedidos: PedidoDoPagamento[],
  carrinhos: CarrinhoDoPagamento[],
  politica: PoliticaDeFrete,
  j: Janela,
  agora: Date
): PagamentoEFrete {
  const doPeriodo = pedidos.filter((o) => dentro(new Date(o.created_at), j))
  const pagos = pedidos.flatMap((o) => {
    const p = pagamentoDo(o)
    return p.pagoEm && dentro(p.pagoEm, j) && o.status !== "canceled" ? [{ o, p }] : []
  })

  const comoPagaram = {
    pix: pagos.filter(({ p }) => p.forma === "pix").length,
    cartao: pagos.filter(({ p }) => p.forma === "cartao").length,
  }

  const pixDoPeriodo = doPeriodo.filter((o) => pagamentoDo(o).forma === "pix")
  const pagosNoPix = pixDoPeriodo.filter((o) => pagamentoDo(o).pagoEm).length
  const venceu = (o: PedidoDoPagamento) => {
    const { pagoEm, estado } = pagamentoDo(o)
    if (pagoEm) return false
    if (o.status === "canceled") return true
    const expira = new Date(estado?.pix?.expiraEm ?? NaN)
    return Number.isNaN(expira.getTime())
      ? agora.getTime() - new Date(o.created_at).getTime() > PIX_VENCE_MS
      : expira.getTime() <= agora.getTime()
  }
  const venceram = pixDoPeriodo.filter(venceu).length
  const pix = {
    gerados: pixDoPeriodo.length,
    pagos: pagosNoPix,
    venceram,
    esperando: pixDoPeriodo.length - pagosNoPix - venceram,
  }

  // O cartão: a sessão de cada pedido e a de cada carrinho que não fechou.
  const tentativas = [
    ...doPeriodo.map((o) =>
      estadosDas((o.payment_collections ?? []).flatMap((c) => c.payment_sessions ?? []))
    ),
    ...carrinhos
      .filter((c) => !c.completed_at && dentro(new Date(c.created_at), j))
      .map((c) => estadosDas(c.payment_collection?.payment_sessions)),
  ]
    .map((estados) => estados.filter((e) => e.forma === "cartao" && e.situacao !== "nova").at(-1))
    .filter((e): e is Estado => !!e)
  const cartao: TentativasDoCartao = {
    total: tentativas.length,
    aprovados: tentativas.filter((e) => e.situacao === "pago" || e.situacao === "estornado").length,
    emAnalise: tentativas.filter((e) => e.situacao === "analise").length,
    antifraude: 0,
    banco: 0,
    dados: 0,
    outros: 0,
  }
  for (const e of tentativas) {
    if (e.situacao !== "recusado" && e.situacao !== "falhou" && e.situacao !== "incerto") continue
    const [motivo] = MOTIVO.find(([, frase]) => e.recusa === frase) ?? ["outros"]
    cartao[motivo]++
  }

  const porParcela = new Map<number, number>()
  for (const { p } of pagos) {
    if (p.forma !== "cartao") continue
    const n = Math.max(1, p.estado?.parcelas ?? 1)
    porParcela.set(n, (porParcela.get(n) ?? 0) + 1)
  }

  const fretes = pagos.map(({ o }) => centavos(numero(o.shipping_total)))
  const pagaram = fretes.filter((f) => f > 0)
  const piso = politica.modo === "gratis" ? politica.piso : null
  const carrinhosDoPeriodo = carrinhos.filter((c) => dentro(new Date(c.created_at), j))
  const viramOFrete = carrinhosDoPeriodo.filter((c) =>
    (c.shipping_address?.postal_code ?? "").trim()
  )
  const escolheram = viramOFrete.filter((c) => (c.shipping_methods ?? []).some(Boolean))

  const semAchados: Omit<PagamentoEFrete, "achados"> = {
    comoPagaram,
    pix,
    cartao,
    parcelas: [...porParcela.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([parcelas, pedidos]) => ({ parcelas, pedidos })),
    frete: {
      pedidos: fretes.length,
      gratis: fretes.length - pagaram.length,
      parteGratis: fretes.length
        ? Math.round(((fretes.length - pagaram.length) / fretes.length) * 100)
        : null,
      medioPago: pagaram.length
        ? centavos(pagaram.reduce((s, f) => s + f, 0) / pagaram.length)
        : null,
      desistem: viramOFrete.length
        ? Math.round(((viramOFrete.length - escolheram.length) / viramOFrete.length) * 100)
        : null,
      quaseLa:
        piso === null
          ? null
          : pagos.filter(({ o }) => {
              const produtos = numero(o.item_subtotal) || totalDo(o) - numero(o.shipping_total)
              return numero(o.shipping_total) > 0 && produtos < piso && produtos >= piso - QUASE_LA
            }).length,
      piso,
    },
  }
  return { ...semAchados, achados: achadosDoPagamento(semAchados) }
}

/** Abaixo disso de tentativas (ou de Pix), a parte pode ser acaso. */
export const MINIMO_DE_TENTATIVAS = 10

/**
 * O que o pagamento e o frete querem dizer: o cartão recusado (e por quem),
 * o Pix que vence sem pagar, e quem fica quase no frete grátis.
 */
export function achadosDoPagamento(p: Omit<PagamentoEFrete, "achados">): Achado[] {
  const achados: Achado[] = []
  const { cartao, pix, frete } = p
  const recusados = cartao.antifraude + cartao.banco + cartao.dados + cartao.outros
  if (cartao.total >= MINIMO_DE_TENTATIVAS && recusados / cartao.total >= 0.3) {
    const maior =
      cartao.antifraude >= cartao.banco && cartao.antifraude >= cartao.dados
        ? "a análise de fraude, que não cobra nada — só barra"
        : cartao.banco >= cartao.dados
          ? "o banco do cartão (saldo, limite)"
          : "os dados do cartão digitados errado"
    achados.push({
      tipo: "problema",
      titulo: `${recusados} de ${cartao.total} tentativas no cartão foram recusadas`,
      texto: `A maior parte é ${maior}. Vale acompanhar se esse número cai nos próximos dias.`,
    })
  }
  if (pix.gerados >= MINIMO_DE_TENTATIVAS && pix.venceram / pix.gerados >= 0.4)
    achados.push({
      tipo: "oportunidade",
      titulo: `${pix.venceram} de ${pix.gerados} Pix gerados venceram sem pagar`,
      texto:
        "É comum — a pessoa gera pra ver o valor —, mas o e-mail de carrinho abandonado (ainda por " +
        "fazer) pode trazer parte de volta.",
    })
  if (frete.quaseLa !== null && frete.piso !== null && frete.quaseLa >= 3)
    achados.push({
      tipo: "oportunidade",
      titulo: `${frete.quaseLa} pedidos pagaram frete a menos de ${reais(QUASE_LA)} do grátis`,
      texto: `Fecharam entre ${reais(frete.piso - QUASE_LA)} e ${reais(frete.piso)} de produtos. Um "leve junto" que passe do piso ganha a tarja de frete grátis na caixa de compra.`,
    })
  if (!achados.length && cartao.total + pix.gerados < MINIMO_DE_TENTATIVAS)
    achados.push({
      tipo: "info",
      titulo: "Ainda é pouco pra olhar o pagamento",
      texto:
        `${cartao.total} ${cartao.total === 1 ? "tentativa" : "tentativas"} no cartão e ${pix.gerados} ` +
        `Pix no período. Com mais pedidos (depois da virada), aqui aparece o que não passa.`,
    })
  return achados
}
