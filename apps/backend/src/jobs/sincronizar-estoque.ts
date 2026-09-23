import type { MedusaContainer } from "@medusajs/framework/types"
import { sincronizarEstoque } from "../lib/erp/estoque"

/**
 * De 5 em 5 minutos, no worker: o estoque da loja espelha o do ERP
 * (`lib/erp/estoque.ts`). O aviso do ERP já sincroniza na hora; este é o
 * chão — o aviso que se perdeu, o webhook que o ERP desligou.
 *
 * Sem ERP conectado, volta na primeira linha. Nos minutos 3, 8, 13…
 */
export default async function sincronizarEstoqueDoErp(container: MedusaContainer) {
  await sincronizarEstoque(container)
}

export const config = {
  name: "sincronizar-estoque",
  schedule: "3-59/5 * * * *",
}
