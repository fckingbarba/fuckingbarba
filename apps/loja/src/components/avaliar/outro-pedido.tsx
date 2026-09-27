"use client"

import { avaliarOutroPedido } from "@/lib/acoes/avaliar"
import { semQueda } from "@/lib/rede"

/** O `redirect` da ação passa pelo `semQueda`; sem internet, o botão só não faz nada. */
const sair = () =>
  semQueda(
    () => avaliarOutroPedido(),
    () => undefined
  )

/**
 * "NÃO É ESTE PEDIDO?" — esquece o link guardado e volta pra busca pelo
 * número e o e-mail. Quem recebeu dois e-mails (duas compras) usa o botão do
 * outro; isto é pra quem abriu a página no aparelho de outra pessoa.
 */
export function OutroPedido() {
  return (
    <form action={sair} className="avaliar__trocar">
      <button type="submit" className="link" data-outro-pedido>
        Avaliar outro pedido
      </button>
    </form>
  )
}
