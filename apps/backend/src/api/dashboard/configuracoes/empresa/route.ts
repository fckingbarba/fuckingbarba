import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"
import { lerEmpresa } from "../../../../lib/painel/configuracoes"
import { gravarConfiguracoes } from "../../../../lib/painel/ler-configuracoes"

/**
 * POST /dashboard/configuracoes/empresa — os dados da empresa e do
 * atendimento: razão social, CNPJ, endereço, WhatsApp, e-mail, horário e
 * prazo de postagem. Em branco vale (a loja mostra "dado pendente").
 *
 * RESPOSTAS: 200 `{ ok, lojaAvisada }`; 422 `{ erros }`, campo a campo;
 * 404 sem loja no Medusa.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "configuracoes")) return
  const lido = lerEmpresa(req.body)
  if (!lido.ok) {
    res.status(422).json({ erros: lido.erros })
    return
  }
  const r = await gravarConfiguracoes(req.scope, () => lido.valor)
  if (!r.gravou) {
    res.status(404).json({ message: "sem_loja" })
    return
  }
  await anotar(pedido, "mudou-dados-da-empresa", "configuracoes", {})
  res.json({ ok: true, lojaAvisada: r.lojaAvisada })
}
