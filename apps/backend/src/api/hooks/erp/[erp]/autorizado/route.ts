import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { concluirAutorizacao } from "../../../../../lib/erp/conexao"
import { erpDaLoja } from "../../../../../lib/erp/erps"

/**
 * GET /hooks/erp/:erp/autorizado — a volta da tela de autorização do ERP.
 *
 * É a URL de redirecionamento cadastrada no app do ERP (no Bling:
 * `https://<api>/hooks/erp/bling/autorizado`). Pública — quem chega aqui é
 * o navegador de quem clicou em "Conectar" —, e por isso a prova de que a
 * autorização saiu do admin é o `state` (`lib/erp/conexao.ts`): aleatório,
 * gravado no clique, de uso único e de 10 minutos.
 *
 * Termina sempre na tela do ERP no admin, dizendo se conectou.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const erp = erpDaLoja()
  const texto = (v: unknown) => (typeof v === "string" ? v : "")
  if (!erp || erp.id !== String(req.params.erp ?? "")) {
    res.redirect(`/app/erp?erro=${encodeURIComponent("ERP desconhecido")}`)
    return
  }
  if (req.query.error) {
    const motivo = texto(req.query.error_description) || texto(req.query.error)
    res.redirect(`/app/erp?erro=${encodeURIComponent(`o ${erp.nome} não autorizou: ${motivo}`)}`)
    return
  }
  const r = await concluirAutorizacao(req.scope, erp, texto(req.query.code), texto(req.query.state))
  if (!r.ok) {
    logger.warn(`[erp] a conexão com o ${erp.nome} não foi concluída: ${r.motivo}`)
    res.redirect(`/app/erp?erro=${encodeURIComponent(r.motivo)}`)
    return
  }
  res.redirect("/app/erp?conectado=1")
}
