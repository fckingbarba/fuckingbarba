import type { Metadata } from "next"
import { Suspense } from "react"
import { Enderecos } from "@/components/conta/enderecos"
import { seSessaoAcabou } from "@/components/conta/pedidos"
import { lerCliente } from "@/lib/conta"

/**
 * /conta/enderecos — os endereços guardados, e o principal, que é o que o
 * checkout abre preenchido (`preencherDaConta`, em `lib/checkout.ts`).
 *
 * Eles chegam por dois caminhos: daqui, e da compra feita com a conta aberta
 * — o endereço dela entra sozinho (`guardarDaCompra`, em `lib/conta.ts`).
 */
export const metadata: Metadata = {
  title: "Endereços",
}

export default function Pagina() {
  return (
    <section aria-labelledby="t-enderecos">
      <div className="cabeca-tela">
        <div>
          <h1 id="t-enderecos">Endereços</h1>
          <p className="cabeca-tela__sub">O principal já vem preenchido no checkout.</p>
        </div>
      </div>
      <Suspense fallback={<p className="bloco">Buscando seus endereços…</p>}>
        <Lista />
      </Suspense>
    </section>
  )
}

async function Lista() {
  const leitura = await lerCliente()
  seSessaoAcabou(leitura.estado)
  if (leitura.estado !== "ok") {
    return (
      <div className="bloco" role="alert">
        Não consegui buscar seus endereços agora. Tenta de novo em instantes.
      </div>
    )
  }
  const { cliente } = leitura
  return (
    <Enderecos enderecos={cliente.enderecos} quem={`${cliente.nome} ${cliente.sobrenome}`.trim()} />
  )
}
