import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import {
  avisarNoLog,
  configuracaoDoGa4,
  ErroDoGa4,
  relatoriosDoMarketing,
} from "../../../../lib/painel/ga4"
import { carrinhosDesde, pedidosDesde } from "../../../../lib/painel/ler"
import { hostsDaLoja, janelasDo, lerPeriodo, vendasDos } from "../../../../lib/painel/marketing"
import {
  achadosDoFunil,
  aparelhosDo,
  funilDoCheckout,
  funilDoSite,
  navegadorDoPedido,
  perguntasDoFunil,
  type Aparelho,
  type Passo,
} from "../../../../lib/painel/marketing-funil"

/**
 * GET /dashboard/marketing/funil?periodo=30d — onde as pessoas desistem
 * (`lib/painel/marketing-funil.ts`): do site até o pagamento (o GA4), da
 * sacola ao pagamento (os carrinhos da loja) e o celular contra o
 * computador. Do dono e do marketing.
 *
 * O GOOGLE PODE FALTAR: os carrinhos vêm sempre; o site e os aparelhos vêm
 * com o `estado` — "ok", ou por que não vieram (os mesmos do `/visitas`).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "marketing")) return

  const periodo = lerPeriodo(req.query.periodo)
  const agora = new Date()
  const { atual } = janelasDo(periodo, agora)
  const [carrinhos, pedidos] = await Promise.all([
    carrinhosDesde(req.scope, atual.de),
    pedidosDesde(req.scope, atual.de, { comMetadata: true }),
  ])
  const vendas = vendasDos(pedidos)
  const checkout = funilDoCheckout(carrinhos, new Set(vendas.map((v) => v.id)), atual)
  const navegador = new Map(pedidos.map((o) => [o.id, navegadorDoPedido(o.metadata)]))
  const comNavegador = vendas.map((v) => ({
    pagoEm: v.pagoEm,
    navegador: navegador.get(v.id) ?? null,
  }))

  let google:
    | { estado: "ok"; site: Passo[]; aparelhos: Aparelho[] | null }
    | { estado: "desligado" | "invalida" | "recusado" | "fora" }
  const cfg = configuracaoDoGa4()
  if (cfg === "desligado" || cfg === "invalida") google = { estado: cfg }
  else
    try {
      const hosts = hostsDaLoja(process.env.LOJA_URL)
      const r = await relatoriosDoMarketing(
        cfg,
        `funil:${periodo}:${hosts.join(",")}`,
        perguntasDoFunil(periodo, hosts),
        agora
      )
      google = {
        estado: "ok",
        site: funilDoSite(r),
        aparelhos: aparelhosDo(r[3], comNavegador, atual),
      }
    } catch (e) {
      const tipo = e instanceof ErroDoGa4 ? e.tipo : "fora"
      avisarNoLog(
        req.scope,
        "o funil do marketing",
        tipo,
        e instanceof Error ? e.message : String(e)
      )
      google = { estado: tipo }
    }

  res.json({
    periodo,
    checkout,
    ...google,
    achados: google.estado === "ok" ? achadosDoFunil(google.site, google.aparelhos) : [],
  })
}
