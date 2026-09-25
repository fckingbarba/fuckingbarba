import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { PREFIXO_DO_BUMP } from "../../../lib/bumps"
import { lerConfiguracoes } from "../../../lib/configuracoes"
import {
  cupomNaLista,
  ehCupomDeCampanha,
  lerCupomNovo,
  promocaoDoCupom,
  usosPorCodigo,
  type PromocaoCrua,
} from "../../../lib/cupons"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { anotar } from "../../../lib/painel/anotar"
import { descontosAutomaticos } from "../../../lib/painel/cupons"

/**
 * GET /dashboard/cupons — os cupons de campanha (com o que os pedidos dizem
 * de cada um) e os descontos que a loja aplica sozinha.
 * POST /dashboard/cupons — cria um cupom (`lib/cupons.ts`: o código, o tipo,
 * o valor, o mínimo, a data, o limite e as regras de cliente).
 * Marketing e dono.
 *
 * RESPOSTAS: GET 200 `{ cupons, automaticos }`. POST 200 `{ cupom }`; 422
 * `{ erros }` (campo → frase); 409 `codigo_existe`.
 */

const CAMPOS_DA_PROMOCAO = [
  "id",
  "code",
  "status",
  "is_automatic",
  "limit",
  "used",
  "created_at",
  "metadata",
  "application_method.type",
  "application_method.target_type",
  "application_method.value",
]

const DIA_MS = 24 * 60 * 60 * 1000

type PedidoComAjustes = {
  status?: string | null
  created_at?: string | Date
  total?: unknown
  original_total?: unknown
  payment_collections?: { payments?: { captured_at?: unknown }[] | null }[] | null
  items?: { adjustments?: { code?: string | null; amount?: unknown }[] | null }[] | null
  shipping_methods?: { adjustments?: { code?: string | null; amount?: unknown }[] | null }[] | null
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "cupons")) return

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const agora = new Date()
  const [{ data: promocoes }, { data: pedidos }, [loja]] = await Promise.all([
    query.graph({
      entity: "promotion",
      fields: CAMPOS_DA_PROMOCAO,
      pagination: { take: 1000, order: { created_at: "DESC" } },
    }),
    // Os últimos 2000 pedidos, só com os ajustes: o que cada código deu de desconto e vendeu.
    query.graph({
      entity: "order",
      fields: [
        "id",
        "status",
        "created_at",
        "total",
        "original_total",
        "payment_collections.payments.captured_at",
        "items.adjustments.code",
        "items.adjustments.amount",
        "shipping_methods.adjustments.code",
        "shipping_methods.adjustments.amount",
      ],
      filters: { is_draft_order: false },
      pagination: { take: 2000, order: { created_at: "DESC" } },
    }),
    req.scope.resolve(Modules.STORE).listStores({}, { select: ["id", "metadata"], take: 1 }),
  ])

  const lidos = (pedidos as PedidoComAjustes[]).map((o) => ({
    status: o.status,
    criado: new Date(o.created_at ?? 0).getTime(),
    pago: (o.payment_collections ?? []).some((c) => (c.payments ?? []).some((p) => p.captured_at)),
    total: Number(o.original_total ?? o.total ?? 0),
    ajustes: [...(o.items ?? []), ...(o.shipping_methods ?? [])].flatMap(
      (l) => l.adjustments ?? []
    ),
  }))
  const usos = usosPorCodigo(lidos)
  const semana = lidos.filter(
    (o) => o.pago && o.status !== "canceled" && o.criado >= agora.getTime() - 7 * DIA_MS
  )

  res.json({
    cupons: (promocoes as PromocaoCrua[])
      .filter(ehCupomDeCampanha)
      .map((p) =>
        cupomNaLista(
          p,
          usos.get(String(p.code).toUpperCase()) ?? { pedidos: 0, desconto: 0, vendeu: 0 },
          agora
        )
      ),
    automaticos: descontosAutomaticos({
      frete: lerConfiguracoes(loja?.metadata).frete,
      oferta: {
        aceitas: semana.filter((o) =>
          o.ajustes.some((a) => String(a.code ?? "").startsWith(PREFIXO_DO_BUMP))
        ).length,
        pedidos: semana.length,
      },
    }),
  })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "cupons")) return

  const agora = new Date()
  const lido = lerCupomNovo(req.body, agora)
  if (!lido.ok) {
    res.status(422).json({ erros: lido.erros })
    return
  }
  const c = lido.cupom

  // O Medusa procura o código como foi gravado; a loja tenta as três caixas: nenhuma pode repetir.
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: iguais } = await query.graph({
    entity: "promotion",
    fields: ["id"],
    filters: { code: [c.codigo, c.codigo.toLowerCase()] },
  })
  if (iguais.length) {
    res.status(409).json({ message: "codigo_existe" })
    return
  }

  const { result } = await createPromotionsWorkflow(req.scope).run({
    input: { promotionsData: [promocaoDoCupom(c, pedido.membro.nome, agora)] as never },
  })
  const criada = result[0] as unknown as PromocaoCrua
  await anotar(pedido, "criou-cupom", criada.id, { codigo: c.codigo })
  res.json({
    cupom: cupomNaLista(
      { ...criada, used: 0, metadata: { fb_cupom: { ...c } } },
      { pedidos: 0, desconto: 0, vendeu: 0 },
      agora
    ),
  })
}
