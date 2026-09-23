import type { MedusaContainer } from "@medusajs/framework/types"
import { acompanharNotas } from "../lib/erp/notas"

/**
 * De 5 em 5 minutos, no worker: as notas fiscais (`lib/erp/notas.ts`) —
 * a resposta da SEFAZ que ainda não veio, a nota corrigida no ERP, o pedido
 * cancelado com o que desfazer, e o pedido pago que ficou sem nota (o ERP
 * fora do ar na hora, o "Check status" do admin, o evento perdido). E, com a
 * conexão caída, o e-mail do dia pra equipe.
 *
 * Sem ERP conectado, volta na primeira linha. Nos minutos 4, 9, 14…
 */
export default async function acompanharNotasDoErp(container: MedusaContainer) {
  await acompanharNotas(container)
}

export const config = {
  name: "acompanhar-notas",
  schedule: "4-59/5 * * * *",
}
