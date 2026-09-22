import { timingSafeEqual } from "node:crypto"
import type { Forma } from "../modules/pagarme/pedido"
import { CHAVE } from "../modules/pagarme/situacao"

/**
 * O PEDIDO PRA QUEM SÓ TEM O ID — `GET /store/orders/:id`.
 *
 * O Medusa deixa essa rota aberta de propósito: o id faz as vezes de senha,
 * pro convidado rever a compra sem conta. Só que o id não é segredo. Ele
 * está na URL da tela de obrigado (e daí no histórico, no print, no GA4),
 * no link do e-mail e no admin — e a resposta padrão traz e-mail, endereço,
 * telefone e o CPF (que mora no endereço de cobrança).
 *
 * Então o pedido inteiro só sai pra quem prova que é DONO, de um de dois
 * jeitos:
 *   - o CARRINHO de onde o pedido nasceu, no cabeçalho `x-carrinho`. É o que
 *     a loja guarda no crachá de quem comprou (o cookie `pedido`). O id do
 *     carrinho não aparece em URL nenhuma (nem na versão pública, abaixo), e
 *     quem tem ele já lê o mesmo endereço e o mesmo CPF pelo
 *     `/store/carts/:id` — a prova não abre nada que já não estivesse aberto
 *     pra quem a tem;
 *   - a CONTA dona do pedido (o token de cliente, que o Medusa já lê em toda
 *     rota da loja).
 *
 * Pra todo o resto, a versão PÚBLICA: número, situação e a forma de
 * pagamento — o que a tela de obrigado mostra pra quem abre um link
 * encaminhado, e o que ela pergunta enquanto o Pix não cai. Não importa o
 * que o `fields` pedir: a versão pública é montada campo a campo aqui.
 *
 * Carrinho ERRADO no cabeçalho é 403, e não a versão pública: quem manda um
 * está dizendo que é dono, e a loja precisa saber que o Medusa não
 * reconheceu — é assim que ela não mostra o endereço pra um crachá forjado.
 */

export const CABECALHO_DO_CARRINHO = "x-carrinho"

/** O que a consulta busca pra versão pública — nada além disto sai do banco. */
export const CAMPOS_PUBLICOS = [
  "id",
  "display_id",
  "status",
  "created_at",
  "payment_status",
  "payment_collections.payment_sessions.provider_id",
  "payment_collections.payment_sessions.data",
]

export type Acesso = "dono" | "publico" | "recusado"

/** De quem é o pedido — o que `acessoAoPedido` precisa saber dele. */
export type Posse = { customer_id?: string | null; cart?: { id?: string | null } | null }

/**
 * Quem pede, e se leva o pedido inteiro. `cliente` é o `actor_id` do token
 * (vazio sem conta); `carrinho`, o cabeçalho — `undefined` quando não veio.
 */
export function acessoAoPedido(
  pedido: Posse,
  { cliente, carrinho }: { cliente?: string | null; carrinho?: string }
): Acesso {
  if (cliente && pedido.customer_id && cliente === pedido.customer_id) return "dono"
  if (carrinho === undefined) return "publico"
  const doPedido = pedido.cart?.id
  return doPedido && iguais(carrinho, doPedido) ? "dono" : "recusado"
}

function iguais(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
}

type Sessao = { provider_id?: unknown; data?: unknown }
type Colecao = { payment_sessions?: Sessao[] | null }

/**
 * A versão pública, montada campo a campo (e não recortada do que veio):
 * um campo novo que o Medusa passe a devolver não entra aqui sem alguém
 * escrever ele nesta função.
 *
 * Da sessão de pagamento fica só a FORMA — é o que separa "falta o Pix" de
 * "cartão em análise". O QR do Pix e o final do cartão ficam pra quem
 * comprou, como na tela.
 */
export function paraPedidoPublico(order: Record<string, unknown>) {
  const colecoes = (
    Array.isArray(order.payment_collections) ? order.payment_collections : []
  ) as (Colecao | null)[]
  return {
    id: order.id,
    display_id: order.display_id,
    status: order.status,
    created_at: order.created_at,
    payment_status: order.payment_status,
    payment_collections: colecoes.map((c) => ({
      payment_sessions: (c?.payment_sessions ?? []).map((s) => ({
        provider_id: s?.provider_id,
        data: soAForma(s?.data),
      })),
    })),
  }
}

function soAForma(data: unknown): Record<string, unknown> {
  const estado = (data as Record<string, unknown> | null)?.[CHAVE] as
    { forma?: unknown } | undefined
  const forma: Forma | null =
    estado?.forma === "pix" || estado?.forma === "cartao" ? estado.forma : null
  return forma ? { [CHAVE]: { forma } } : {}
}

/**
 * A resposta da rota com o pedido trocado pela versão pública. Erro (404 de
 * pedido que não existe, por exemplo) passa como veio.
 */
export function respostaPublica(corpo: unknown): unknown {
  const order = (corpo as { order?: unknown } | null)?.order
  if (!order || typeof order !== "object") return corpo
  return { order: paraPedidoPublico(order as Record<string, unknown>) }
}
