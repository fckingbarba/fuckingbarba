import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { PREFIXO_DO_BUMP } from "../../../lib/bumps"
import { PREFIXO_DO_CUPOM } from "../../../lib/crm/fluxos"
import { lerConfiguracoes } from "../../../lib/configuracoes"
import {
  cupomNaLista,
  ehCupomDeCampanha,
  lerCupomNovo,
  promocaoDoCupom,
  usosPorCodigo,
  type PromocaoCrua,
} from "../../../lib/cupons"
import { urlDaLoja } from "../../../lib/emails/moldura"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { anotar } from "../../../lib/painel/anotar"
import { catalogoDaLoja } from "../../../lib/painel/catalogo"
import { descontosAutomaticos } from "../../../lib/painel/cupons"
import { totaisDos } from "../../../lib/painel/ler"
import { lerPagina, paginar } from "../../../lib/painel/paginas"
import { totalDo } from "../../../lib/painel/pedido"
import {
  ehPromocaoDoPainel,
  promocaoGuardada,
  promocaoNaLista,
  valeAgora,
} from "../../../lib/promocoes"

/**
 * GET /dashboard/cupons — os cupons de campanha (com o que os pedidos dizem
 * de cada um), as promoções do painel (o "Leve X, pague Y", `lib/promocoes.ts`,
 * criadas em `POST /dashboard/promocoes`), os descontos que a loja aplica
 * sozinha, as categorias e os produtos que o "Aplicar a" escolhe, e o
 * endereço da loja (o link do cupom é `<loja>/discount/<CÓDIGO>`, como na
 * Nuvemshop).
 * POST /dashboard/cupons — cria um cupom (`lib/cupons.ts`: o código, o tipo,
 * a quem vale e os limites de uso, como no "Criar cupom" da Nuvemshop).
 * Marketing e dono.
 *
 * Os cupons vêm em páginas de 20 (`?pagina=`), e `?busca=` acha pelo código
 * (sem diferença de maiúscula) — os 104 da Nuvemshop enchiam a tela. As
 * promoções e os automáticos vêm inteiros: são poucos.
 *
 * RESPOSTAS: GET 200 `{ cupons, busca, paginacao, promocoes, automaticos, catalogo,
 * loja }`. POST 200 `{ cupom }`; 422 `{ erros }` (campo → frase); 409 `codigo_existe`.
 */

const CUPONS_POR_PAGINA = 20

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
  id: string
  status?: string | null
  created_at?: string | Date
  total?: unknown
  credit_line_total?: unknown
  payment_collections?: { payments?: { captured_at?: unknown }[] | null }[] | null
  items?: { adjustments?: { code?: string | null; amount?: unknown }[] | null }[] | null
  shipping_methods?: { adjustments?: { code?: string | null; amount?: unknown }[] | null }[] | null
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "cupons")) return

  const q = req.query as { busca?: unknown; pagina?: unknown }
  const busca = typeof q.busca === "string" ? q.busca.trim().slice(0, 40) : ""
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const agora = new Date()
  const [{ data: todas }, { data: pedidos }, [loja], catalogo] = await Promise.all([
    query.graph({
      entity: "promotion",
      fields: CAMPOS_DA_PROMOCAO,
      pagination: { take: 1000, order: { created_at: "DESC" } },
    }),
    // Os últimos 2000 pedidos, só com os ajustes: o que cada código deu de desconto e vendeu.
    // Sem o total (o Medusa calcula pedido a pedido): ele vem depois, só dos
    // pedidos pagos que usaram algum código — os únicos que entram no "vendeu".
    query.graph({
      entity: "order",
      fields: [
        "id",
        "status",
        "created_at",
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
    catalogoDaLoja(query),
  ])

  const crus = (pedidos as PedidoComAjustes[]).map((o) => ({
    o,
    pago: (o.payment_collections ?? []).some((c) => (c.payments ?? []).some((p) => p.captured_at)),
    ajustes: [...(o.items ?? []), ...(o.shipping_methods ?? [])].flatMap(
      (l) => l.adjustments ?? []
    ),
  }))
  const totais = await totaisDos(
    req.scope,
    crus
      .filter(
        ({ o, pago, ajustes }) => pago && o.status !== "canceled" && ajustes.some((a) => a.code)
      )
      .map(({ o }) => o.id)
  )
  const lidos = crus.map(({ o, pago, ajustes }) => ({
    status: o.status,
    criado: new Date(o.created_at ?? 0).getTime(),
    pago,
    // O cobrado, com o desconto do próprio cupom: o `original_total` é de antes dele.
    total: totalDo(totais.get(o.id) ?? o),
    ajustes,
  }))
  const usos = usosPorCodigo(lidos)
  const semUso = { pedidos: 0, desconto: 0, vendeu: 0 }
  const promocoes = (todas as PromocaoCrua[]).flatMap((p) => {
    const g = ehPromocaoDoPainel(p) ? promocaoGuardada(p) : null
    return g ? [{ p, g }] : []
  })
  const semana = lidos.filter(
    (o) => o.pago && o.status !== "canceled" && o.criado >= agora.getTime() - 7 * DIA_MS
  )

  const procurado = busca.toUpperCase()
  const cupons = (todas as PromocaoCrua[])
    .filter(ehCupomDeCampanha)
    // Os cupons dos fluxos do CRM (um por pessoa, que vence em 2 dias) ficam na aba Fluxos do CRM.
    .filter(
      (p) =>
        !String(p.code ?? "")
          .toUpperCase()
          .startsWith(PREFIXO_DO_CUPOM)
    )
    .filter(
      (p) =>
        !procurado ||
        String(p.code ?? "")
          .toUpperCase()
          .includes(procurado)
    )
    .map((p) => cupomNaLista(p, usos.get(String(p.code).toUpperCase()) ?? semUso, agora))
  const { itens, paginacao } = paginar(cupons, lerPagina(q.pagina), CUPONS_POR_PAGINA)

  res.json({
    cupons: itens,
    busca,
    paginacao,
    promocoes: promocoes.map(({ p, g }) =>
      promocaoNaLista(p, g, usos.get(String(p.code).toUpperCase()) ?? semUso, agora)
    ),
    automaticos: descontosAutomaticos({
      levePague: promocoes.some(({ p, g }) => valeAgora(p.status, g, agora.getTime())),
      frete: lerConfiguracoes(loja?.metadata).frete,
      oferta: {
        aceitas: semana.filter((o) =>
          o.ajustes.some((a) => String(a.code ?? "").startsWith(PREFIXO_DO_BUMP))
        ).length,
        pedidos: semana.length,
      },
    }),
    catalogo,
    loja: urlDaLoja(),
  })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "cupons")) return

  const agora = new Date()
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const lido = lerCupomNovo(req.body, agora, await catalogoDaLoja(query))
  if (!lido.ok) {
    res.status(422).json({ erros: lido.erros })
    return
  }
  const c = lido.cupom

  // Frete grátis só na opção mais barata: a entrega econômica (`faixa`, no Frenet).
  let maisBaratas: string[] = []
  if (c.tipo === "frete" && c.soMaisBarato) {
    const { data: opcoes } = await query.graph({
      entity: "shipping_option",
      fields: ["id", "data"],
    })
    maisBaratas = (opcoes as { id: string; data?: Record<string, unknown> | null }[])
      .filter((o) => o.data?.faixa !== "expressa")
      .map((o) => o.id)
    if (!maisBaratas.length) {
      res.status(422).json({
        erros: { soMaisBarato: "A loja não tem a entrega econômica: desmarque esta opção." },
      })
      return
    }
  }

  // O Medusa procura o código como foi gravado; a loja tenta as três caixas: nenhuma pode repetir.
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
    input: {
      promotionsData: [promocaoDoCupom(c, pedido.membro.nome, agora, maisBaratas)] as never,
    },
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
