import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { urlDaLoja } from "../../../lib/emails/moldura"
import { lerHome } from "../../../lib/home"
import { pendentesDaHome, secoesDaHome, ultimaPublicacao } from "../../../lib/painel/home"
import { feitosNaHome } from "../../../lib/painel/ler"
import { estoquesDos, lerProdutos } from "../../../lib/painel/ler-produtos"
import { linhaDoHistorico, noCatalogo } from "../../../lib/painel/produtos"

/**
 * GET /dashboard/home — o "Layout da home" do painel: as seções na ordem do
 * rascunho (ligada, fixa, o texto de cada uma e o de fábrica), o que está
 * esperando o "Publicar", o último "Publicar", o catálogo (pros seletores de
 * produto: o banner, o palco, a foto do "Sobre") e o que a equipe mudou.
 * Dono e marketing.
 *
 * `noSite`: o endereço da loja (`LOJA_URL`), pro "Ver a home".
 *
 * RESPOSTAS: 200 `{ secoes, pendentes, publicacao, catalogo, noSite,
 * historico }`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "home")) return

  const [[loja], todos, feitos] = await Promise.all([
    req.scope.resolve(Modules.STORE).listStores({}, { select: ["id", "metadata"], take: 1 }),
    lerProdutos(req.scope),
    feitosNaHome(req.scope),
  ])
  const home = lerHome(loja?.metadata)
  const noSite = todos.filter((p) => p.status === "published" && p.handle)
  const estoques = await estoquesDos(req.scope, noSite)
  const agora = Date.now()

  res.json({
    secoes: secoesDaHome(home),
    pendentes: pendentesDaHome(home),
    publicacao: ultimaPublicacao(home, agora),
    catalogo: noSite.map((p) => noCatalogo(p, estoques.get(p.id) ?? null)),
    noSite: urlDaLoja(),
    historico: feitos.map((f) => linhaDoHistorico(f, agora)),
  })
}
