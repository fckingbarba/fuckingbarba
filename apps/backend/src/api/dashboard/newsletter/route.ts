import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { juntarPessoas, newsletterDa } from "../../../lib/painel/clientes"
import { inscricoesDaNewsletter, lerClientes } from "../../../lib/painel/ler"

/**
 * GET /dashboard/newsletter — quem aceitou receber ofertas por e-mail: a
 * newsletter do rodapé e a caixa da conta, numa lista só (`newsletterDa`),
 * com os números de cima. Cada e-mail que é de cliente leva pra ficha.
 * Marketing e dono.
 *
 * RESPOSTAS: 200 `{ inscritos, numeros }`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "newsletter")) return

  const [clientes, inscricoes] = await Promise.all([
    lerClientes(req.scope),
    inscricoesDaNewsletter(req.scope),
  ])
  res.json(newsletterDa(juntarPessoas(clientes, [], inscricoes), inscricoes, new Date()))
}
