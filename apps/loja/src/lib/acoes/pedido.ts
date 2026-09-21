"use server"

import { adicionar } from "@/lib/acoes/carrinho"
import type { CarrinhoVisivel } from "@/lib/carrinho-visivel"
import type { DeNovo } from "@/lib/conta-visivel"
import { ehDeQuemComprou, situacaoDoPedido } from "@/lib/pedido"
import { ehDaConta, lerPedidoDaConta } from "@/lib/pedidos-da-conta"

/**
 * "E aí, o Pix caiu?" — a pergunta que a tela de obrigado (e a do pedido, na
 * conta) faz de tempos em tempos enquanto o pagamento não chega.
 *
 * Só responde a quem tem direito ao pedido, pelo mesmo motivo das próprias
 * telas: server action é POST público, e id de pedido vaza em print e em
 * link encaminhado. Direito é uma de duas coisas: o crachá de quem comprou
 * (o cookie do pedido, neste navegador) ou a conta dona dele — quem abre o
 * Pix pela conta, no celular, não tem o crachá do computador onde comprou.
 * Pra quem não tem nenhum dos dois a resposta é `null` — que a tela trata
 * como "não sei", e continua como estava.
 */
export async function perguntarPagamento(
  pedidoId: string
): Promise<{ pago: boolean; cancelado: boolean } | null> {
  if (typeof pedidoId !== "string" || !/^order_[A-Za-z0-9]+$/.test(pedidoId)) return null
  if (!(await ehDeQuemComprou(pedidoId)) && !(await ehDaConta(pedidoId))) return null
  return situacaoDoPedido(pedidoId)
}

/**
 * COMPRAR DE NOVO — os itens de um pedido da conta de volta na sacola.
 *
 * Pela variante de HOJE, com o preço de hoje: o pedido guarda o que foi
 * pago, e não o que custa agora. Um item por vez, em série, como o
 * `adicionarVarios` (o Medusa recalcula o carrinho inteiro a cada linha).
 *
 * O QUE NÃO ENTRA NÃO DERRUBA O RESTO: produto que saiu de linha ou está
 * sem estoque fica de fora, e a frase diz qual — pra ninguém achar que foi
 * esquecido. Só o dono do pedido compra de novo por aqui: o pedido é lido
 * pela conta, e de outra pessoa ele simplesmente não vem.
 */
export async function comprarDeNovo(pedidoId: string): Promise<DeNovo> {
  const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."
  if (typeof pedidoId !== "string") return { ok: false, texto: GENERICO, carrinho: null }

  const leitura = await lerPedidoDaConta(pedidoId)
  if (leitura.estado !== "ok") return { ok: false, texto: GENERICO, carrinho: null }

  let carrinho: CarrinhoVisivel | null = null
  let unidades = 0
  const ficaram: string[] = []
  for (const item of leitura.pedido.itens) {
    if (!item.varianteId || item.quantidade <= 0) {
      ficaram.push(item.nome)
      continue
    }
    const r = await adicionar(item.varianteId, item.quantidade)
    carrinho = r.carrinho
    if (r.ok) unidades += item.quantidade
    else ficaram.push(item.nome)
  }

  const fora = ficaram.length
    ? `${ficaram.join(", ")} ${ficaram.length === 1 ? "não está disponível" : "não estão disponíveis"} agora.`
    : ""
  if (!unidades) {
    return { ok: false, texto: fora || GENERICO, carrinho }
  }
  const voltaram =
    unidades === 1 ? "1 item voltou pra sacola." : `${unidades} itens voltaram pra sacola.`
  return { ok: true, texto: [voltaram, fora].filter(Boolean).join(" "), carrinho }
}
