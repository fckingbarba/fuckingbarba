import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { avisarQuemEspera } from "../../../../lib/avise-me"

/**
 * POST /admin/avise-me/rodar — a rodada do avise-me agora, sem esperar os 5
 * minutos do job `avisar-quem-espera`: avisa a loja do produto que esgotou
 * ou voltou e manda o e-mail de quem esperava. Devolve o relatório.
 *
 * Pro conferidor (`apps/loja/ferramentas/conferir-avise-me.mjs`), e pra quem
 * cuida da loja depois de mexer no estoque à mão. É idempotente: rodar duas
 * vezes seguidas não manda nada na segunda.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.json({ relatorio: await avisarQuemEspera(req.scope) })
}
