import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import {
  avisarNoLog,
  configuracaoDoGa4,
  ErroDoGa4,
  relatoriosDoMarketing,
} from "../../../../lib/painel/ga4"
import { pedidosDesde, produtosPublicados } from "../../../../lib/painel/ler"
import {
  enderecoDaLoja,
  hostsDaLoja,
  janelasDo,
  lerPedidosDesde,
  lerPeriodo,
  somaNa,
  vendasDos,
} from "../../../../lib/painel/marketing"
import { montarCanais, perguntasDosCanais } from "../../../../lib/painel/marketing-canais"

/**
 * GET /dashboard/marketing/canais?periodo=30d — de onde vêm as visitas e as
 * vendas, e as campanhas (`lib/painel/marketing-canais.ts`). Do dono e do
 * marketing.
 *
 * Vem sempre, com ou sem o Google: `pagos` (os pedidos pagos da loja no
 * período), `loja` (o endereço, pro montador de link — o `LOJA_URL`) e
 * `paginas` (a home, a vitrine e os produtos publicados). Os canais, as
 * campanhas e o `semOrigem` vêm com `estado: "ok"`; sem o Google, o
 * `estado` diz por quê (os mesmos do `/visitas`).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "marketing")) return

  const periodo = lerPeriodo(req.query.periodo)
  const agora = new Date()
  const [pedidos, produtos] = await Promise.all([
    pedidosDesde(req.scope, lerPedidosDesde(periodo, agora)),
    produtosPublicados(req.scope),
  ])
  const pagos = somaNa(vendasDos(pedidos), janelasDo(periodo, agora).atual)
  const base = {
    periodo,
    pagos,
    loja: enderecoDaLoja(process.env.LOJA_URL),
    paginas: [
      { nome: "Home", caminho: "/" },
      { nome: "Todos os produtos", caminho: "/produtos" },
      ...produtos.map((p) => ({ nome: p.nome, caminho: `/produtos/${p.handle}` })),
    ],
  }

  const cfg = configuracaoDoGa4()
  if (cfg === "desligado" || cfg === "invalida") {
    res.json({ ...base, estado: cfg })
    return
  }
  try {
    const hosts = hostsDaLoja(process.env.LOJA_URL)
    const r = await relatoriosDoMarketing(
      cfg,
      `canais:${periodo}:${hosts.join(",")}`,
      perguntasDosCanais(periodo, hosts),
      agora
    )
    res.json({ ...base, estado: "ok", ...montarCanais(r, pagos) })
  } catch (e) {
    const tipo = e instanceof ErroDoGa4 ? e.tipo : "fora"
    avisarNoLog(
      req.scope,
      "os canais do marketing",
      tipo,
      e instanceof Error ? e.message : String(e)
    )
    res.json({ ...base, estado: tipo })
  }
}
