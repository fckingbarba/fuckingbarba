import { redirect } from "next/navigation"
import { pedidoDoCarrinhoFechado } from "@/lib/carrinho"
import { abrirPedido } from "@/lib/checkout"

/**
 * /checkout/retomar — a volta pra um pedido cuja confirmação se perdeu.
 *
 * O checkout manda pra cá quando o carrinho do cookie já virou pedido: a
 * resposta do fechamento não chegou ao navegador (conexão caiu, aba
 * fechada), o pedido existe, e a pessoa recarregou a página. Aqui — que,
 * diferente da página, pode gravar cookie — ela recebe o crachá do pedido e
 * vai pra tela de obrigado, com o QR do Pix se for o caso.
 *
 * Quem chega sem carrinho fechado volta pro checkout. Não há o que forjar:
 * tudo sai do cookie de quem pede, e só leva ao pedido do próprio carrinho.
 */
export async function GET() {
  const pedidoId = await pedidoDoCarrinhoFechado()
  if (pedidoId) return abrirPedido(pedidoId)
  redirect("/checkout")
}
