import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"

/**
 * O METADATA DO PEDIDO TEM VÁRIOS DONOS — e uma porta só pra escrever nele.
 *
 * Moram no mesmo JSON do pedido: os registros dos e-mails de confirmação e
 * de cancelamento (`emails.confirmado`, `emails.cancelado`), os estornos
 * (`estornos`), o registro no painel do parceiro de entrega (`fb_parceiro`)
 * e a oferta do checkout (`fb_bump`). Cada dono tem a trava dele, que
 * segura o trabalho inteiro (o e-mail, o Pagar.me, o parceiro) — mas a
 * coluna é uma só, e ninguém segurava a coluna.
 *
 * ┌─ COMO UM REGISTRO SE PERDIA (o #467, local, em 23/09) ─────────────────┐
 * │ O `updateOrders` do Medusa lê o pedido, mistura o metadata na memória  │
 * │ (`mergeMetadata`, só no primeiro nível) e grava a coluna INTEIRA. Dois │
 * │ donos gravando juntos leem o mesmo "antes", e o último a gravar apaga  │
 * │ o que o outro gravou: a confirmação gravou `emails.confirmado`, a      │
 * │ oferta gravou `fb_bump` uns 10 ms depois, e a confirmação sumiu — a    │
 * │ varredura seguinte "mandou" de novo (a chave de idempotência do Resend │
 * │ segurou o e-mail repetido). E quem espalhava no registro o metadata    │
 * │ lido ANTES de uma chamada lenta (o Resend, o Pagar.me) apagava tudo o  │
 * │ que tivesse chegado no meio — no `fb_parceiro`, isso é o mesmo pedido  │
 * │ entrando duas vezes no painel da Frenet.                               │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A REGRA: todo registro no metadata do pedido passa por
 * `gravarNoMetadataDoPedido`. Uma trava por pedido, a MESMA pra todos os
 * donos; dentro dela o metadata é lido de novo, e só a chave de quem chamou
 * vai pro Medusa. Esta trava é sempre a de dentro — nada aqui pega outra —,
 * então a de cada dono continua por fora, e não há como duas se esperarem.
 * O `metadata-do-pedido.unit.spec.ts` confere que ninguém mais chama o
 * `updateOrders`.
 *
 * FORA DO ALCANCE: o JSON do pedido editado à mão no admin do Medusa grava
 * pelo caminho do próprio Medusa, sem esta trava.
 */

/** A trava da escrita — a mesma pra todo dono do metadata do pedido. */
export const travaDoMetadata = (pedidoId: string) => `metadata-do-pedido:${pedidoId}`

/**
 * O que gravar: o valor, ou uma função que recebe o que está lá AGORA
 * (lido dentro da trava) e devolve o valor — `undefined` é "não grava"
 * (a oferta do checkout, que só entra uma vez).
 */
export type ValorNoMetadata<T> = T | ((atual: unknown) => T | undefined)

const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** O que está no caminho (`["emails", "confirmado"]`), ou `undefined`. */
export function lerNoCaminho(metadata: unknown, caminho: readonly string[]): unknown {
  let atual: unknown = metadata
  for (const parte of caminho) {
    if (!atual || typeof atual !== "object" || Array.isArray(atual)) return undefined
    atual = (atual as Record<string, unknown>)[parte]
  }
  return atual
}

/**
 * `base` com `valor` no caminho, sem mexer no resto: `emails.confirmado`
 * entra ao lado do `emails.cancelado`, e não no lugar dele. O que estiver no
 * meio do caminho e não for objeto vira objeto.
 */
export function comValorNoCaminho(
  base: unknown,
  caminho: readonly string[],
  valor: unknown
): unknown {
  if (!caminho.length) return valor
  const [parte, ...resto] = caminho
  const atual = objeto(base)
  return { ...atual, [parte]: comValorNoCaminho(atual[parte], resto, valor) }
}

/**
 * Grava `valor` em `chave` do metadata do pedido (um nome, ou o caminho até
 * ele: `["emails", "confirmado"]`) — e só nela. Devolve se gravou.
 *
 * O valor vai inteiro, como veio: quem grava um registro de vários pedaços
 * (os estornos, um por pagamento) monta o registro inteiro. `null` grava
 * `null`; `""` no primeiro nível APAGA a chave (é a regra do
 * `mergeMetadata` do Medusa), e nenhum registro daqui grava texto vazio.
 */
export async function gravarNoMetadataDoPedido<T>(
  container: MedusaContainer,
  pedidoId: string,
  chave: string | readonly string[],
  valor: ValorNoMetadata<T>
): Promise<boolean> {
  const caminho = typeof chave === "string" ? [chave] : [...chave]
  if (!caminho.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "gravarNoMetadataDoPedido: chave vazia")
  }
  const [topo, ...resto] = caminho
  const pedidos = container.resolve(Modules.ORDER)

  return container.resolve(Modules.LOCKING).execute(
    travaDoMetadata(pedidoId),
    async () => {
      const pedido = await pedidos.retrieveOrder(pedidoId, { select: ["id", "metadata"] })
      const metadata = objeto(pedido.metadata)
      const novo =
        typeof valor === "function"
          ? (valor as (atual: unknown) => T | undefined)(lerNoCaminho(metadata, caminho))
          : valor
      if (novo === undefined) return false
      // Só a chave de cima: o Medusa mistura com o que está gravado, e as
      // chaves dos outros donos ficam como estão.
      await pedidos.updateOrders([
        { id: pedidoId, metadata: { [topo]: comValorNoCaminho(metadata[topo], resto, novo) } },
      ])
      return true
    },
    { timeout: 30 }
  )
}
