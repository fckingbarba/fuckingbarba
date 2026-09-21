import type { Metadata } from "next"
import { Suspense } from "react"
import { CartaoDoPedido, ForaDoAr, NenhumPedido, seSessaoAcabou } from "@/components/conta/pedidos"
import { listarPedidos } from "@/lib/pedidos-da-conta"

/**
 * /conta/pedidos — a lista, do mais novo pro mais velho.
 *
 * Os pedidos da Nuvemshop entram aqui embaixo, separados e com o número de
 * lá, quando a importação existir (fase 2) — é o "Da loja antiga" do
 * protótipo.
 */
export const metadata: Metadata = {
  title: "Pedidos",
}

export default function Pagina() {
  return (
    <section aria-labelledby="t-pedidos">
      <div className="cabeca-tela">
        <div>
          <h1 id="t-pedidos">Pedidos</h1>
          <Suspense fallback={null}>
            <Quantos />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={<p className="bloco">Buscando seus pedidos…</p>}>
        <Lista />
      </Suspense>
    </section>
  )
}

async function Quantos() {
  const leitura = await listarPedidos()
  if (leitura.estado !== "ok" || !leitura.pedidos.length) return null
  const n = leitura.pedidos.length
  return <p className="cabeca-tela__sub">{n === 1 ? "1 pedido" : `${n} pedidos`}</p>
}

async function Lista() {
  const leitura = await listarPedidos()
  seSessaoAcabou(leitura.estado)
  if (leitura.estado !== "ok") return <ForaDoAr />
  if (!leitura.pedidos.length) {
    return (
      <NenhumPedido>
        Comprou com outro e-mail? Entra com ele pra ver aqueles pedidos — cada e-mail é uma conta.
      </NenhumPedido>
    )
  }
  return (
    <div className="pedidos">
      {leitura.pedidos.map((p) => (
        <CartaoDoPedido key={p.id} p={p} />
      ))}
    </div>
  )
}
