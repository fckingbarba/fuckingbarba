import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { lerTelaDasConfiguracoes } from "../../../lib/painel/ler-configuracoes"

/**
 * GET /dashboard/configuracoes — as abas das Configurações, prontas
 * (`lib/painel/configuracoes.ts`): os dados da empresa e o frete como estão
 * gravados, o pagamento, a nota (o ERP, a janela e as pendências), a entrega
 * e os e-mails (com quem recebe cada aviso). Só o dono.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "configuracoes")) return
  res.json(await lerTelaDasConfiguracoes(req.scope))
}
