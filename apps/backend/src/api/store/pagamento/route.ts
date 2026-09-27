import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { OBSERVABILIDADE } from "../../../modules/observabilidade"
import type ObservabilidadeService from "../../../modules/observabilidade/service"
import { saudeDoParceiro } from "../../../lib/pagamento/disjuntor"
import { PARCEIROS } from "../../../lib/pagamento/parceiros"

/**
 * GET /store/pagamento — quais parceiros de pagamento estão FORA DO CAMINHO
 * agora (o disjuntor aberto, `lib/pagamento/disjuntor.ts`), e até quando.
 *
 * A loja pergunta ao desenhar o passo 3 e de novo no clique de pagar
 * (`finalizar`), e decide com isto e com os parceiros da região
 * (`rotaDoPagamento`, em `apps/loja/src/lib/checkout-visivel.ts`): o Pix vai
 * pelo parceiro que está de pé, e o cartão sai da tela enquanto o Pagar.me
 * estiver fora e o Pix puder sair pelo outro.
 *
 * NA DÚVIDA, NINGUÉM FORA: se a conta falhar (o banco engasgou, a migração
 * ainda não rodou), a resposta é a lista vazia — a loja cobra como antes do
 * disjuntor existir. Rota pública: sai só o id do parceiro e a hora.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const agora = new Date()
  try {
    const terminadas = await req.scope
      .resolve<ObservabilidadeService>(OBSERVABILIDADE)
      .terminadasDosParceiros()
    const fora = PARCEIROS.map((p) => saudeDoParceiro(p.id, terminadas, agora))
      .filter((s) => s.foraAte)
      .map((s) => ({ id: s.id, ate: s.foraAte!.toISOString() }))
    res.json({ fora })
  } catch (e) {
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`[pagamento] a saúde dos parceiros não saiu: ${e instanceof Error ? e.message : e}`)
    res.json({ fora: [] })
  }
}
