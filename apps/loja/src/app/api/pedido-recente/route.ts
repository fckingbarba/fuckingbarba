import { NextResponse, type NextRequest } from "next/server"
import { COOKIE_PEDIDO, lerCracha } from "@/lib/checkout"
import { lerPedido } from "@/lib/pedido"
import { COOKIE_BALAO, type DadosDoBalao } from "@/lib/pedido-recente"

/**
 * /api/pedido-recente — o que o balão do pedido mostra (`lib/pedido-recente.ts`).
 *
 * Só pra quem comprou NESTE navegador: o cookie do balão tem de apontar pro
 * mesmo pedido do crachá, e o Medusa tem de reconhecer o crachá (`meu`) —
 * senão o balão teria o Pix e os itens de um pedido de outra pessoa. Quem
 * não passa recebe `{ mostrar: false }`, e o balão não aparece.
 *
 * Sem itens de endereço nem documento: o balão não precisa, e o que não sai
 * daqui não vaza.
 */

const SEM_CACHE = { "cache-control": "no-store" }
const NAO = () => NextResponse.json({ mostrar: false }, { headers: SEM_CACHE })

export async function GET(req: NextRequest) {
  const id = req.cookies.get(COOKIE_BALAO)?.value
  const cracha = lerCracha(req.cookies.get(COOKIE_PEDIDO)?.value)
  if (!id || !/^order_[A-Za-z0-9]+$/.test(id) || cracha?.pedido !== id) return NAO()

  const leitura = await lerPedido(id)
  if (!leitura?.meu) return NAO()
  const { pedido } = leitura

  const dados: DadosDoBalao = {
    id: pedido.id,
    numero: pedido.numero,
    quando: pedido.quando,
    estado: pedido.pagamento.estado,
    pix: pedido.pagamento.pix
      ? { copiaECola: pedido.pagamento.pix.copiaECola, expiraEm: pedido.pagamento.pix.expiraEm }
      : null,
    itens: pedido.itens.map((i) => ({
      nome: i.nome,
      variante: i.variante,
      imagem: i.imagem,
      quantidade: i.quantidade,
      total: i.total,
    })),
    total: pedido.total,
  }
  return NextResponse.json({ mostrar: true, pedido: dados }, { headers: SEM_CACHE })
}
