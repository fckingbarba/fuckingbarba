import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { podeAbrir } from "../../../../lib/equipe/regras"
import { urlDaLoja } from "../../../../lib/emails/moldura"
import { MARCA_DO_PRECO } from "../../../../lib/erp/marcas"
import { comFundosDoArmazenamento } from "../../../../lib/imagens"
import {
  estoquesDos,
  lerCategorias,
  lerProduto,
  lerProdutos,
  precosDos,
} from "../../../../lib/painel/ler-produtos"
import { feitosNoProduto } from "../../../../lib/painel/ler"
import { detalheDoProduto, linhaDoHistorico, noCatalogo } from "../../../../lib/painel/produtos"
import { lerPdp } from "../../../../lib/pdp"

/**
 * GET /dashboard/produtos/:id — a página do produto no painel: o que vem do
 * Bling (nome, preço, estoque, descrição), o que é daqui (subtítulo,
 * categoria, se está no site), as seções da página com o texto e o fundo de
 * cada uma, e a caixa de compra. Junto, o catálogo (pros seletores de
 * produto: a rotina, o "Leve junto") e as categorias.
 *
 * `noSite`: o endereço da página na loja (`LOJA_URL`), pro "Ver no site";
 * `historico`: o que a equipe mudou por aqui, o mais novo primeiro.
 *
 * RESPOSTAS: 200 `{ produto, catalogo, categorias, noSite, historico }`; 404
 * `nao_encontrado`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "produtos")) return

  const id = req.params.id
  const p = /^prod_[0-9A-Z]{10,40}$/.test(id) ? await lerProduto(req.scope, id) : null
  if (!p) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  const [todos, categorias, feitos] = await Promise.all([
    lerProdutos(req.scope),
    lerCategorias(req.scope),
    feitosNoProduto(req.scope, p.id),
  ])
  const [estoques, precos] = await Promise.all([
    estoquesDos(req.scope, [...todos, p]),
    precosDos(req.scope, [...todos.filter((o) => o.id !== p.id), p]),
  ])
  res.json({
    produto: detalheDoProduto(
      p,
      comFundosDoArmazenamento(lerPdp(p.metadata)),
      estoques.get(p.id) ?? null,
      podeAbrir(pedido.membro.papel, "editarProdutos"),
      {
        preco: precos.get(p.id),
        precoDoPainel: Boolean((p.metadata as Record<string, unknown> | null)?.[MARCA_DO_PRECO]),
      }
    ),
    // Os que podem ir num seletor: no site, com endereço, e não o próprio —
    // com o preço de hoje (a promoção), que é o que a prévia do frete soma.
    catalogo: todos
      .filter((o) => o.status === "published" && o.handle && o.id !== p.id)
      .map((o) => noCatalogo(o, estoques.get(o.id) ?? null, precos.get(o.id)?.hoje)),
    categorias,
    noSite: urlDaLoja() && p.handle ? `${urlDaLoja()}/produtos/${p.handle}` : null,
    historico: feitos.map((f) => linhaDoHistorico(f, Date.now())),
  })
}
