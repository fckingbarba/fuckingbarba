import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { lerClientesDoMarketing } from "../../../../lib/painel/ler-marketing"
import { lerPeriodo } from "../../../../lib/painel/marketing"

/**
 * GET /dashboard/marketing/clientes?periodo=30d — quem compra, se volta, em
 * quanto tempo e de onde (`lib/painel/marketing-clientes.ts`), e a
 * newsletter. Lê a história inteira da loja nova: a primeira compra de cada
 * pessoa pode ser de antes do período. Do dono e do marketing; nenhum
 * e-mail sai daqui, só a conta.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!exigirArea(req as PedidoDaEquipe, res, "marketing")) return
  res.json(await lerClientesDoMarketing(req.scope, lerPeriodo(req.query.periodo), new Date()))
}
