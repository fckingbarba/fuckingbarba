import type { MedusaContainer } from "@medusajs/framework/types"
import { acompanharNotas, horaDasParadas } from "../lib/erp/notas"
import { comRodada } from "../lib/observabilidade/rodada"

/**
 * De 5 em 5 minutos, no worker: as notas fiscais (`lib/erp/notas.ts`) —
 * a resposta da SEFAZ que ainda não veio, a nota corrigida no ERP, o pedido
 * cancelado com o que desfazer, e o pedido pago que ficou sem nota (o ERP
 * fora do ar na hora, o "Check status" do admin, o evento perdido). E, com a
 * conexão caída, o e-mail do dia pra equipe.
 *
 * Sem ERP conectado, volta na primeira linha. Nos minutos 4, 9, 14…
 *
 * A nota parada (rejeitada ou denegada, esperando alguém corrigir no ERP) é
 * olhada de 30 em 30 minutos, nos minutos 4 e 34 (`horaDasParadas`, 0199); a
 * rota do admin olha tudo, sempre.
 */
async function acompanharNotasDoErp(container: MedusaContainer) {
  const agora = new Date()
  await acompanharNotas(container, agora, { paradas: horaDasParadas(agora) })
}

export const config = {
  name: "acompanhar-notas",
  schedule: "4-59/5 * * * *",
}

export default comRodada(config.name, acompanharNotasDoErp)
