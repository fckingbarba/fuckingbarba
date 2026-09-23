import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { erpDaLoja } from "../../../../lib/erp/erps"
import { pedirSincronizacao } from "../../../../lib/erp/estoque"
import { notaMudouNoErp } from "../../../../lib/erp/notas"

/**
 * POST /hooks/erp/:erp — o aviso do ERP (no Bling, o webhook do app).
 *
 * Quem confere se veio mesmo do ERP é o tradutor (`lerAviso`); aqui é só
 * responder RÁPIDO e trabalhar depois: o Bling espera 5 segundos, tenta de
 * novo por 3 dias e desliga o webhook se continuar falhando. O aviso só diz
 * que algo mudou — o estoque é sincronizado inteiro (poucos segundos depois,
 * juntando a rajada), e a nota é consultada.
 *
 * 404 pra ERP que não é o ligado; 401 sem a assinatura certa; 400 pro que
 * não é aviso; 200 pro resto — inclusive o repetido.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const erp = erpDaLoja()
  if (!erp || erp.id !== String(req.params.erp ?? "")) {
    res.status(404).json({ message: "erp_desconhecido" })
    return
  }
  const leitura = erp.lerAviso({
    cabecalhos: req.headers,
    consulta: (req.query ?? {}) as Record<string, unknown>,
    corpo: req.body,
    bruto: req.rawBody ? String(req.rawBody) : null,
  })
  if (!leitura.ok) {
    if (leitura.motivo === "ilegivel") {
      res.status(400).json({ message: "aviso_ilegivel" })
      return
    }
    logger.warn(`[erp] ${erp.nome}: aviso recusado — ${leitura.detalhe}`)
    res.status(401).json({ message: "nao_autorizado" })
    return
  }

  res.json({ ok: true })

  if (leitura.estoque) pedirSincronizacao(req.scope)
  for (const id of leitura.notas) {
    notaMudouNoErp(req.scope, erp, id).catch((e) =>
      logger.warn(
        `[erp] a nota ${id} do aviso não foi conferida: ${e instanceof Error ? e.message : e}`
      )
    )
  }
}
