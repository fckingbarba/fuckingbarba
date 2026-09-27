import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { voltarAoCheckout } from "../../../../lib/crm/voltar-ao-checkout"
import { voltaDoLink } from "../../../../lib/crm/voltar"
import { criarLimite } from "../../../../lib/limite"
import { quemPede } from "../../../../lib/quem-pede"

/**
 * POST /store/crm/voltar — `{ t }`: o link de voltar dos e-mails dos fluxos
 * (`lib/crm/voltar.ts`). A loja chama da página `/voltar/<t>` e põe o
 * carrinho que volta no cookie: o do checkout abandonado, ou um novo com os
 * produtos do Pix que venceu (`lib/crm/voltar-ao-checkout.ts`).
 *
 * 30 por hora por pessoa. RESPOSTAS: 200 `{ carrinho }` ou `{ acabou: true }`
 * (o carrinho fechou, o pedido não foi cancelado, os produtos esgotaram);
 * 400 `link_invalido` (torto, de outra loja, ou vencido); 429 `limite`.
 */

const LIMITE = { limite: 30, ms: 60 * 60 * 1000 }
const limite = criarLimite()

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const volta = voltaDoLink((req.body as { t?: unknown } | undefined)?.t)
  if (!volta) {
    res.status(400).json({ message: "link_invalido" })
    return
  }
  const quem = quemPede(req)
  if (!limite.cabe(quem.chave, LIMITE)) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(quem.chave, LIMITE)
  res.json(await voltarAoCheckout(req.scope, volta))
}
