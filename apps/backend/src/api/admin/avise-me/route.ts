import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { AVISE_ME } from "../../../modules/avise-me"
import type AviseMeService from "../../../modules/avise-me/service"

/**
 * GET /admin/avise-me?produto=<id> — os pedidos de aviso de um produto (ou
 * de todos, sem o `produto`), o mais antigo primeiro, com o e-mail de quem
 * espera. Rota de admin: é o que o conferidor lê pra saber se o pedido da
 * loja chegou, e o dono pode ver quem espera cada produto.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const produto = typeof req.query.produto === "string" ? req.query.produto : null
  const avisos = await req.scope
    .resolve<AviseMeService>(AVISE_ME)
    .listAvisos(produto ? { produto_id: produto } : {}, {
      take: 5000,
      order: { consentido_em: "ASC" },
    })
  res.json({ avisos })
}
