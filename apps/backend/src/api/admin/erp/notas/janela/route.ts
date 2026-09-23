import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  atualizarConexao,
  JANELA_MAXIMA_DA_NOTA_MIN,
  minutosDaJanela,
} from "../../../../../lib/erp/conexao"
import { erpDaTela } from "../../../../../lib/erp/erps"

/**
 * POST /admin/erp/notas/janela — `{ minutos }`: quanto a nota espera depois
 * do pagamento (a janela de cancelamento; 0 = na hora). Vale também pros
 * pedidos que já estão esperando: a janela conta do pagamento, a cada vez.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const minutos = (req.body as { minutos?: unknown } | undefined)?.minutos
  if (
    typeof minutos !== "number" ||
    !Number.isInteger(minutos) ||
    minutos < 0 ||
    minutos > JANELA_MAXIMA_DA_NOTA_MIN
  ) {
    res.status(400).json({
      message: `minutos é um número inteiro de 0 a ${JANELA_MAXIMA_DA_NOTA_MIN}`,
    })
    return
  }
  const erp = erpDaTela()
  await atualizarConexao(req.scope, erp, { janela_da_nota: minutos })
  res.json({ janelaDaNota: minutosDaJanela({ janela_da_nota: minutos }) })
}
