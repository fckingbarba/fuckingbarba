import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  ENDERECO_PADRAO as MERCADOPAGO_PADRAO,
  clienteDoMercadoPago,
  type PagamentoMP,
} from "../../modules/mercadopago/client"
import {
  ENDERECO_PADRAO as PAGARME_PADRAO,
  clienteDoPagarme,
  type RecebivelPagarme,
} from "../../modules/pagarme/client"
import {
  cotar,
  ErroDaFrenet,
  escolherFaixas,
  itensPraCotar,
  somaDosProdutos,
  type LinhaDoCarrinho,
} from "../../modules/frenet/client"
import { FINANCEIRO } from "../../modules/financeiro"
import type FinanceiroService from "../../modules/financeiro/service"
import { estadoDaSessao, parceiroDe, sessaoDoParceiro } from "../pagamento/parceiros"
import { DIA_DA_LOJA_NOVA } from "./regras"

/**
 * O QUE CADA PEDIDO DA LOJA NOVA CUSTOU, buscado fora — pro DRE
 * (`dre.ts`): a TAXA que o Pagar.me (no cartão) ou o Mercado Pago cobrou no
 * pagamento e,
 * no pedido que não guardou a cotação da Frenet no checkout (os de antes da
 * 0226, e o que caiu no preço de emergência), o FRETE cotado agora. Roda no
 * job `custos-dos-pedidos`, de 30 em 30 minutos; grava em `fin_pedido`.
 *
 * ┌─ AS REGRAS ────────────────────────────────────────────────────────────┐
 * │ • Só pedido pago (a primeira captura), desde a loja nova, e dos        │
 * │   últimos 90 dias: o que ficou pra trás disso não volta a ser lido.    │
 * │ • A taxa do cartão sai dos recebíveis do Pagar.me (a taxa, a da        │
 * │   antecipação e a da cobertura de fraude); a do Mercado Pago, do       │
 * │   `fee_details`. O Pix do Pagar.me NÃO: a API não traz (o Pagar.me     │
 * │   fatura no mês seguinte) — vem da % do contrato, no DRE. A tarifa de  │
 * │   gateway e a do antifraude também não: vêm no extrato do mês, e       │
 * │   entram lançadas. O frete, só do pedido que saiu.                     │
 * │ • "Ainda não dá pra saber" (o recebível que não nasceu) não é erro: a  │
 * │   rodada seguinte tenta de novo, até `TENTATIVAS` — aí o DRE segue     │
 * │   avisando, e a despesa lançada à mão cobre.                           │
 * │ • No máximo `POR_RODADA` pedidos por rodada: as APIs têm limite, e o   │
 * │   primeiro deploy encontra todos os pedidos de antes sem nada.         │
 * │ • Nada de dado de cliente no log nem no `erro`: o número do pedido e   │
 * │   o motivo.                                                            │
 * └────────────────────────────────────────────────────────────────────────┘
 */

export const TENTATIVAS = 48
export const POR_RODADA = 40
const DIAS = 90
const DIA_MS = 24 * 60 * 60 * 1000

/* ── a taxa de cada parceiro (puro) ───────────────────────────────────────── */

/**
 * A taxa do Pagar.me, em centavos, pelos recebíveis da cobrança: a soma das
 * taxas (`fee`, a de antecipação e a da cobertura de fraude) dos recebíveis
 * da venda (`type: "credit"`) — o estorno e o chargeback nascem como outros
 * recebíveis e não entram. Sem recebível da venda ainda, `null`.
 */
export function taxaDoPagarme(recebiveis: readonly RecebivelPagarme[]): number | null {
  const daVenda = recebiveis.filter((r) => (r.type ?? "credit") === "credit")
  if (!daVenda.length) return null
  return daVenda.reduce(
    (s, r) =>
      s +
      (Number(r.fee) || 0) +
      (Number(r.anticipation_fee) || 0) +
      (Number(r.fraud_coverage_fee) || 0),
    0
  )
}

/**
 * A taxa do Mercado Pago, em centavos: o que ele cobrou da LOJA
 * (`fee_details` com `fee_payer` diferente de "payer"). Só no pagamento que
 * foi aprovado (depois dele, estornado ou contestado); antes, `null`.
 */
export function taxaDoMercadoPago(p: Pick<PagamentoMP, "status" | "fee_details">): number | null {
  if (!["approved", "refunded", "charged_back", "in_mediation"].includes(p.status ?? ""))
    return null
  const daLoja = (p.fee_details ?? []).filter((f) => f?.fee_payer !== "payer")
  return Math.round(daLoja.reduce((s, f) => s + (Number(f?.amount) || 0), 0) * 100)
}

/* ── o que falta (puro) ───────────────────────────────────────────────────── */

type Quando = Date | string | number | null | undefined

export type PedidoDosCustos = {
  id: string
  display_id?: number | null
  status?: string | null
  created_at?: Quando
  shipping_address?: { postal_code?: string | null } | null
  items?: (LinhaDoCarrinho & { id?: string })[] | null
  shipping_methods?:
    | {
        name?: string | null
        data?: { servico?: { codigo?: unknown; preco?: unknown } | null } | null
      }[]
    | null
  payment_collections?:
    | {
        payment_sessions?:
          { provider_id?: string | null; status?: string | null; data?: unknown }[] | null
        payments?: { captured_at?: Quando }[] | null
      }[]
    | null
}

export type Guardado = { taxa: number | null; frete: number | null; tentativas: number }

export type Pendente = {
  pedido: PedidoDosCustos
  taxa: { parceiro: "pagarme" | "mercadopago"; cobranca: string } | null
  frete: boolean
}

const pago = (o: PedidoDosCustos) =>
  (o.payment_collections ?? []).some((c) => (c.payments ?? []).some((p) => p.captured_at))

/** O pedido guardou a cotação do checkout em todo método de entrega. */
export const temCotacao = (o: PedidoDosCustos) =>
  (o.shipping_methods ?? []).length > 0 &&
  (o.shipping_methods ?? []).every((m) => Number.isFinite(Number(m.data?.servico?.preco)))

/**
 * Os pedidos que ainda precisam de alguma coisa: a taxa (com o parceiro e a
 * cobrança onde ler) e/ou o frete. O que já tem tudo, o que esgotou as
 * tentativas e o que não foi pago ficam de fora.
 */
export function pendentes(
  pedidos: readonly PedidoDosCustos[],
  guardados: ReadonlyMap<string, Guardado>
): Pendente[] {
  return pedidos.flatMap((o) => {
    if (!pago(o)) return []
    const g = guardados.get(o.id)
    if (g && g.tentativas >= TENTATIVAS) return []
    const sessoes = (o.payment_collections ?? []).flatMap((c) => c.payment_sessions ?? [])
    const sessao = sessaoDoParceiro(sessoes)
    const estado = estadoDaSessao(sessao)
    const parceiro = parceiroDe(sessao?.provider_id)
    // O Pix do Pagar.me não tem a taxa na API (vem da % do contrato, no DRE).
    const lerTaxa = parceiro?.chave === "mercadopago" || estado?.forma === "cartao"
    const taxa =
      lerTaxa && (g?.taxa ?? null) === null && parceiro && estado?.cobranca
        ? { parceiro: parceiro.chave as "pagarme" | "mercadopago", cobranca: estado.cobranca }
        : null
    const frete = o.status !== "canceled" && !temCotacao(o) && (g?.frete ?? null) === null
    return taxa || frete ? [{ pedido: o, taxa, frete }] : []
  })
}

/**
 * O preço do serviço que o pedido escolheu, numa cotação feita agora: o
 * mesmo código de serviço, se o pedido guardou; senão a faixa pelo nome do
 * método ("Expressa"), e a econômica no resto.
 */
export function precoDoServico(
  servicos: Parameters<typeof escolherFaixas>[0],
  o: PedidoDosCustos
): number | null {
  const metodo = (o.shipping_methods ?? [])[0]
  const codigo = metodo?.data?.servico?.codigo
  const mesmo = servicos.find((s) => typeof codigo === "string" && s.codigo === codigo)
  if (mesmo) return mesmo.preco
  const faixas = escolherFaixas(servicos)
  if (!faixas) return null
  return /expressa/i.test(metodo?.name ?? "") ? faixas.expressa.preco : faixas.economica.preco
}

/* ── a rodada ─────────────────────────────────────────────────────────────── */

const CAMPOS = [
  "id",
  "display_id",
  "status",
  "created_at",
  "shipping_address.postal_code",
  "items.id",
  "items.quantity",
  "items.unit_price",
  "items.variant.weight",
  "items.variant.length",
  "items.variant.width",
  "items.variant.height",
  "shipping_methods.name",
  "shipping_methods.data",
  "payment_collections.payment_sessions.provider_id",
  "payment_collections.payment_sessions.status",
  "payment_collections.payment_sessions.data",
  "payment_collections.payments.captured_at",
]

export type RelatorioDosCustos = {
  taxas: number
  fretes: number
  semResposta: number
  erros: string[]
}

export async function custosDosPedidos(
  container: MedusaContainer,
  { agora = new Date(), limite = POR_RODADA }: { agora?: Date; limite?: number } = {}
): Promise<RelatorioDosCustos> {
  const relatorio: RelatorioDosCustos = { taxas: 0, fretes: 0, semResposta: 0, erros: [] }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fin = container.resolve<FinanceiroService>(FINANCEIRO)
  const desde = new Date(
    Math.max(
      new Date(`${DIA_DA_LOJA_NOVA}T00:00:00-03:00`).getTime() - DIA_MS,
      agora.getTime() - DIAS * DIA_MS
    )
  )
  const { data } = await query.graph({
    entity: "order",
    fields: CAMPOS,
    filters: { is_draft_order: false, created_at: { $gte: desde } },
    pagination: { take: 5000, order: { created_at: "ASC" } },
  })
  const pedidos = data as unknown as PedidoDosCustos[]
  if (!pedidos.length) return relatorio
  const linhas = await fin.listCustosDosPedidos(
    { pedido_id: pedidos.map((o) => o.id) },
    { take: pedidos.length }
  )
  const guardados = new Map(
    linhas.map((l) => [
      l.pedido_id,
      {
        id: l.id,
        taxa: l.taxa === null || l.taxa === undefined ? null : Number(l.taxa),
        frete: l.frete === null || l.frete === undefined ? null : Number(l.frete),
        tentativas: Number(l.tentativas ?? 0),
      },
    ])
  )
  const fila = pendentes(pedidos, guardados).slice(0, limite)
  if (!fila.length) return relatorio

  const chavePagarme = process.env.PAGARME_SECRET_KEY
  const pagarme = chavePagarme
    ? clienteDoPagarme(chavePagarme, process.env.PAGARME_URL || PAGARME_PADRAO)
    : null
  const tokenMp = process.env.MERCADOPAGO_ACCESS_TOKEN
  const mercadopago = tokenMp
    ? clienteDoMercadoPago(tokenMp, process.env.MERCADOPAGO_URL || MERCADOPAGO_PADRAO)
    : null
  const origem = fila.some((p) => p.frete) ? await cepDeOrigem(container) : null
  const tokenFrenet = process.env.FRENET_TOKEN

  for (const { pedido: o, taxa, frete } of fila) {
    const antes = guardados.get(o.id)
    const novo: { taxa?: number; taxa_de?: string; frete?: number } = {}
    const problemas: string[] = []
    if (taxa) {
      try {
        const centavos =
          taxa.parceiro === "pagarme"
            ? pagarme
              ? taxaDoPagarme(await pagarme.lerRecebiveis(taxa.cobranca))
              : null
            : mercadopago
              ? taxaDoMercadoPago(await mercadopago.lerPagamento(taxa.cobranca))
              : null
        if (centavos === null) relatorio.semResposta++
        else {
          novo.taxa = centavos
          novo.taxa_de = taxa.parceiro
          relatorio.taxas++
        }
      } catch (e) {
        problemas.push(`taxa: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (frete) {
      try {
        const cep = o.shipping_address?.postal_code
        if (!tokenFrenet || !origem || !cep)
          throw new ErroDaFrenet("sem token, CEP de origem ou de destino", false)
        const servicos = await cotar({
          token: tokenFrenet,
          cepDeOrigem: origem,
          cepDeDestino: cep,
          valor: somaDosProdutos(o.items ?? []),
          itens: itensPraCotar(o.items ?? []),
        })
        const preco = precoDoServico(servicos, o)
        if (preco === null) relatorio.semResposta++
        else {
          novo.frete = Math.round(preco * 100)
          relatorio.fretes++
        }
      } catch (e) {
        problemas.push(`frete: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    const erro = problemas.length ? problemas.join("; ").slice(0, 300) : null
    if (erro) relatorio.erros.push(`#${o.display_id ?? o.id}: ${erro}`)
    const campos = { ...novo, tentativas: (antes?.tentativas ?? 0) + 1, tentou_em: agora, erro }
    if (antes) await fin.updateCustosDosPedidos({ id: antes.id, ...campos })
    else await fin.createCustosDosPedidos([{ pedido_id: o.id, ...campos }])
  }
  return relatorio
}

/** O CEP de onde as coisas saem: o do local de estoque, como no checkout (`contexto-do-frete.ts`). */
async function cepDeOrigem(container: MedusaContainer): Promise<string | null> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "stock_location",
    fields: ["id", "address.postal_code"],
  })
  return (
    (data as { address?: { postal_code?: string | null } | null }[]).find(
      (l) => l.address?.postal_code
    )?.address?.postal_code ?? null
  )
}
