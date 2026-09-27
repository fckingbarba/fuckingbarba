import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import {
  RESPOSTA_DO_VALOR,
  valorDoPagamento,
  type CarrinhoDoFechamento,
} from "../../lib/pagamento/valor"

/**
 * O FECHAMENTO SÓ AUTORIZA O PAGAMENTO QUE COBRA O CARRINHO INTEIRO — o
 * porquê está em `lib/pagamento/valor.ts`.
 *
 * O `validate` do `completeCartWorkflow` roda DENTRO da trava do carrinho,
 * com o carrinho já lido (é dele que o pedido nasce) e antes de o pagamento
 * ir pro parceiro: nada cobra, nada reserva, e a loja lê o motivo no
 * `message` (400). O Medusa aceita UM tratador por gancho — este é o do
 * fechamento; outra regra do fechamento entra aqui, não num segundo arquivo.
 *
 * O valor que não se lê (formato novo do Medusa, por exemplo) não trava a
 * venda: vai pro log, e o pagamento segue como antes deste gancho.
 */
completeCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  const c = cart as CarrinhoDoFechamento & { id?: string }
  const r = valorDoPagamento(c)
  if (r.tipo === "bate") return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  if (r.tipo === "ilegivel") {
    logger.error(
      `[pagamento] ${c.id}: não consegui ler o valor da sessão ${r.sessao} ou do carrinho — ` +
        "fechou sem conferir"
    )
    return
  }
  logger.warn(
    `[pagamento] ${c.id}: a sessão ${r.sessao} cobraria ${r.cobraria} centavos` +
      `${r.moeda ? ` (${r.moeda})` : ""}, e o carrinho é de ${r.total} — fechamento recusado`
  )
  throw new MedusaError(MedusaError.Types.NOT_ALLOWED, RESPOSTA_DO_VALOR)
})
