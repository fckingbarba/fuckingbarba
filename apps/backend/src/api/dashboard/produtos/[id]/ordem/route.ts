import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { comFundosDoArmazenamento } from "../../../../../lib/imagens"
import { anotar } from "../../../../../lib/painel/anotar"
import { mudarPdp } from "../../../../../lib/painel/gravar-produto"
import {
  ehIdDaSecao,
  ehMudancaNaOrdem,
  mudarNaOrdem,
  secoesDaPagina,
} from "../../../../../lib/painel/produtos"

/**
 * POST /dashboard/produtos/:id/ordem — `{ secao, mudanca }`: liga, desliga,
 * sobe ou desce UMA seção da página do produto, na hora (sem "Salvar", como
 * no protótipo). A mudança é aplicada sobre a ordem gravada agora, não sobre
 * a que a tela tinha. Dono e marketing.
 *
 * RESPOSTAS: 200 `{ secoes, lojaAvisada }`; 400 `invalido`; 404
 * `nao_encontrado`; 409 `nao_da` (a seção do topo; subir a primeira).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "editarProdutos")) return

  const { secao, mudanca } = (req.body ?? {}) as { secao?: unknown; mudanca?: unknown }
  if (!ehIdDaSecao(secao) || !ehMudancaNaOrdem(mudanca)) {
    res.status(400).json({ message: "invalido" })
    return
  }
  const r = await mudarPdp(req.scope, req.params.id, (pdp) => {
    const layout = mudarNaOrdem(pdp.layout, secao, mudanca)
    return layout ? { ok: true, pdp: { ...pdp, layout } } : { ok: false, motivo: "nao_da" }
  })
  if (!r.ok) {
    res.status(r.motivo === "nao_encontrado" ? 404 : 409).json({ message: r.motivo })
    return
  }
  await anotar(pedido, "mudou-secao", req.params.id, { secao, mudanca })
  res.json({
    secoes: secoesDaPagina(comFundosDoArmazenamento(r.pdp)),
    lojaAvisada: r.lojaAvisada,
  })
}
