import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { mandarCompra } from "../../../../lib/anuncios/enviar"
import { lerRastro } from "../../../../lib/anuncios/rastro"
import { daLoja } from "../../../../lib/quem-pede"
import { registrarRastroWorkflow } from "../../../../workflows/anuncios/registrar-rastro"

/**
 * POST /store/pedidos/rastro — `{ pedido, rastro }`: a resposta sobre os
 * cookies e, com o sim, os cookies dos parceiros, o IP e o navegador de quem
 * comprou (`lib/anuncios/rastro.ts`).
 *
 * Quem chama é a loja, logo depois de fechar o pedido (`after()` na ação de
 * finalizar). SÓ A LOJA (`x-loja-segredo`): de fora, qualquer um poderia
 * dizer que outra pessoa aceitou os cookies. GRAVA UMA VEZ.
 *
 * O pedido já pago (o cartão aprovado na hora) manda a compra na mesma hora;
 * o Pix manda quando o pagamento entrar (`pagamento-capturado`).
 *
 * RESPOSTAS: 200 `{ gravado }`; 400 `dados_invalidos`; 401 sem assinatura;
 * 404 `pedido_nao_existe`.
 */

const PEDIDO = /^order_[A-Za-z0-9]+$/

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!daLoja(req)) {
    res.status(401).json({ message: "sem_assinatura" })
    return
  }
  const corpo = (req.body ?? {}) as { pedido?: unknown; rastro?: unknown }
  const pedido = typeof corpo.pedido === "string" && PEDIDO.test(corpo.pedido) ? corpo.pedido : ""
  const rastro = lerRastro(corpo.rastro)
  if (!pedido || !rastro) {
    res.status(400).json({ message: "dados_invalidos" })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: ["id"], filters: { id: pedido } })
  if (!data[0]) {
    res.status(404).json({ message: "pedido_nao_existe" })
    return
  }

  const { result } = await registrarRastroWorkflow(req.scope).run({
    input: { pedidoId: pedido, rastro },
  })
  res.json({ gravado: result.gravado })

  // Depois da resposta: a compra do pedido que já está pago. Falhou, a varredura tenta.
  if (result.gravado && rastro.consentimento === "sim") {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    mandarCompra(req.scope, pedido).catch((e) =>
      logger.warn(
        `[anuncios] a compra do ${pedido} ficou pra varredura: ${e instanceof Error ? e.message : String(e)}`
      )
    )
  }
}
