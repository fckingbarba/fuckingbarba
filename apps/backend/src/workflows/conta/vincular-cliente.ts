import { Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createCustomersWorkflow,
  setAuthAppMetadataStep,
  updateCustomersWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * LIGAR QUEM PROVOU O E-MAIL A UM CLIENTE — a primeira entrada na conta.
 *
 * ┌─ QUEM COMPROU SEM CONTA JÁ É CLIENTE — SÓ NÃO SABE ────────────────────┐
 * │ Todo checkout de hoje cria um cliente "convidado" no Medusa            │
 * │ (`has_account: false`) com o e-mail da compra, e o pedido fica no nome │
 * │ dele. Se a conta nascesse como um cliente NOVO, a pessoa entraria e    │
 * │ acharia a conta vazia — com os pedidos pendurados no convidado.        │
 * │                                                                        │
 * │ Então, nesta ordem:                                                    │
 * │   1. já existe cliente COM conta nesse e-mail → é ele;                 │
 * │   2. existe o convidado → ele VIRA a conta (`has_account: true`), e    │
 * │      os pedidos dele aparecem sem copiar nada;                         │
 * │   3. ninguém → cliente novo, já com conta.                             │
 * │                                                                        │
 * │ O código prova que o e-mail é de quem digitou, e é isso que autoriza   │
 * │ juntar. (Quem digitar o e-mail de outra pessoa no checkout põe o       │
 * │ pedido na conta dela — é o mesmo risco de toda loja que liga pedido a  │
 * │ conta por e-mail.)                                                     │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Por último, o `customer_id` vai pra identidade — pelo passo do próprio
 * Medusa, que recusa se ela já estiver ligada a outro cliente. Se esse passo
 * falhar, os de antes se desfazem: o convidado volta a ser convidado, o
 * cliente criado some.
 */

type Entrada = { authIdentityId: string; email: string }

type Escolha = { existente: string | null; promover: string | null }

const escolherClienteStep = createStep(
  "escolher-cliente",
  async ({ email }: { email: string }, { container }) => {
    const clientes = container.resolve(Modules.CUSTOMER)
    const existentes = await clientes.listCustomers({ email })
    const comConta = existentes.find((c) => c.has_account)
    const convidado = existentes.find((c) => !c.has_account)
    return new StepResponse<Escolha>({
      existente: comConta?.id ?? null,
      promover: comConta ? null : (convidado?.id ?? null),
    })
  }
)

/*
  O tipo do Medusa não lista `has_account` entre os campos que se atualizam
  — convidado virar conta não é um caminho que ele oferece pronto. A coluna
  existe e o módulo grava; o `unique` do banco é em (email, has_account), e
  só se promove quando ainda não há cliente com conta nesse e-mail. O
  `conferir-conta.mjs` confere que o id continua o mesmo depois de entrar.
*/
const PROMOCAO = { has_account: true } as unknown as { email?: string }

export const vincularClienteWorkflow = createWorkflow("vincular-cliente", (entrada: Entrada) => {
  const escolha = escolherClienteStep({ email: entrada.email })

  when({ escolha }, ({ escolha }) => Boolean(escolha.promover)).then(() => {
    updateCustomersWorkflow.runAsStep({
      input: transform({ escolha }, ({ escolha }) => ({
        selector: { id: escolha.promover as string },
        update: PROMOCAO,
      })),
    })
  })

  const criados = when({ escolha }, ({ escolha }) => !escolha.existente && !escolha.promover).then(
    () =>
      createCustomersWorkflow.runAsStep({
        input: transform({ entrada }, ({ entrada }) => ({
          customersData: [{ email: entrada.email, has_account: true }],
        })),
      })
  )

  const clienteId = transform(
    { escolha, criados },
    ({ escolha, criados }) => escolha.existente ?? escolha.promover ?? criados?.[0]?.id ?? ""
  )

  setAuthAppMetadataStep({
    authIdentityId: entrada.authIdentityId,
    actorType: "customer",
    value: clienteId,
  })

  return new WorkflowResponse(clienteId)
})
