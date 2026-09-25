import { randomUUID } from "node:crypto"
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"

/**
 * O "CHECK STATUS" DO ADMIN ESPERA A VEZ DELE.
 *
 * O botão (`POST /admin/orders/:id/payment-sessions/authorize`) roda o
 * `authorizePaymentSessionForOrderWorkflow`, que NÃO pega a trava do
 * carrinho — e o aviso do Pagar.me e a conciliação registram o pagamento pelo
 * `processPaymentWorkflow`, que pega. Na mesma sessão, ao mesmo tempo, os dois
 * perguntavam ao Pagar.me, os dois ouviam "pago", e o segundo a gravar batia
 * no índice único do pagamento. O `catch` do Medusa chama então o
 * `cancelPayment` do provedor, que vê a cobrança paga e ESTORNA: o pedido
 * seguia pago pro envio, com o dinheiro devolvido (a revisão de 24/09 achou
 * lendo o código; o `conferir-pagamento` reproduz com o Pagar.me falso lento).
 *
 * Aqui o botão pega a MESMA trava — a chave é o id do carrinho — e espera a
 * vez até 30 s, como o `acquireLockStep` do Medusa. Na vez dele, se o
 * pagamento já foi registrado, diz isso em vez de autorizar de novo.
 *
 * A trava é solta quando a resposta sai (ou a conexão cai), e vence sozinha
 * em 2 minutos, como a do Medusa.
 */

const ESPERA_MS = 30_000
const INTERVALO_MS = 300
const VALIDADE_S = 120

const esperar = (ms: number) => new Promise((pronto) => setTimeout(pronto, ms))

export async function checkStatusNaTravaDoCarrinho(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const sessaoId = (req.body as { payment_session_id?: unknown } | undefined)?.payment_session_id
  if (typeof sessaoId !== "string" || !sessaoId) return next()

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: sessoes } = await query.graph({
    entity: "payment_session",
    fields: ["id", "payment_collection_id"],
    filters: { id: sessaoId },
  })
  const colecao = (sessoes[0] as { payment_collection_id?: string } | undefined)
    ?.payment_collection_id
  if (!colecao) return next()
  const { data: ligacoes } = await query.graph({
    entity: "cart_payment_collection",
    fields: ["cart_id"],
    filters: { payment_collection_id: colecao },
  })
  const carrinho = (ligacoes[0] as { cart_id?: string } | undefined)?.cart_id
  if (!carrinho) return next()

  const trava = req.scope.resolve(Modules.LOCKING)
  const dono = `check-status:${randomUUID()}`
  for (const ate = Date.now() + ESPERA_MS; ;) {
    try {
      await trava.acquire(carrinho, { ownerId: dono, expire: VALIDADE_S })
      break
    } catch {
      if (Date.now() >= ate) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "O pagamento deste pedido está sendo registrado agora. Tenta de novo em instantes."
        )
      }
      await esperar(INTERVALO_MS)
    }
  }

  let solta = false
  const soltar = () => {
    if (solta) return
    solta = true
    void trava.release(carrinho, { ownerId: dono }).catch(() => undefined)
  }
  res.on("finish", soltar)
  res.on("close", soltar)

  // Na vez dele: se o aviso ou a conciliação já registraram, não autoriza de novo.
  const { data: agora } = await query.graph({
    entity: "payment_session",
    fields: ["status"],
    filters: { id: sessaoId },
  })
  if (
    (agora[0] as { status?: string } | undefined)?.status !==
    PaymentSessionStatus.PENDING_AUTHORIZATION
  ) {
    soltar()
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Este pagamento já foi registrado — pelo aviso do Pagar.me ou pela conciliação. " +
        "Recarrega a página do pedido."
    )
  }
  next()
}
