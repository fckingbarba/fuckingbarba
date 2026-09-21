import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import {
  ForaDoAr,
  LinhaDoAndamento,
  NenhumPedido,
  RepetirPedido,
  seSessaoAcabou,
} from "@/components/conta/pedidos"
import { EM_ANDAMENTO } from "@/lib/conta-visivel"
import { listarPedidos } from "@/lib/pedidos-da-conta"

/**
 * /conta — a visão geral.
 *
 * O que a pessoa veio fazer, na ordem em que ela vem fazer: pagar o Pix que
 * ficou pendente, ver onde está a encomenda, e repor o que acabou.
 * Endereço e dados (os dois blocos pequenos do pé, no protótipo) chegam na
 * parte 3, com as telas deles.
 *
 * Esta página ainda não tem link na loja: o "Minha conta" do cabeçalho
 * continua no /em-breve até a conta estar inteira.
 */
export const metadata: Metadata = {
  title: "Minha conta",
}

export default function Pagina() {
  return (
    <section aria-labelledby="t-painel">
      <div className="cabeca-tela">
        <h1 id="t-painel">Visão geral</h1>
      </div>
      <Suspense fallback={<p className="bloco">Buscando seus pedidos…</p>}>
        <Painel />
      </Suspense>
    </section>
  )
}

async function Painel() {
  const leitura = await listarPedidos()
  seSessaoAcabou(leitura.estado)
  if (leitura.estado !== "ok") return <ForaDoAr />

  const { pedidos } = leitura
  if (!pedidos.length) {
    return <NenhumPedido>Quando você comprar, ele aparece aqui — com rastreio e tudo.</NenhumPedido>
  }

  // O Pix primeiro: é o único que depende da pessoa. O resto, do mais novo
  // pro mais velho, que é como a lista já vem.
  const abertos = pedidos
    .filter((p) => EM_ANDAMENTO.includes(p.situacao))
    .sort((a, b) => Number(b.situacao === "pix") - Number(a.situacao === "pix"))
  // Comprar de novo: o último que chegou (ou está chegando) — é o que acaba.
  const repetir = pedidos.find((p) => p.situacao === "entregue" || p.situacao === "enviado")

  return (
    <div className="painel-grade">
      {abertos.length ? (
        <div className="bloco bloco--largo" data-bloco-andamento>
          <p className="rotulo">Em andamento</p>
          <div className="andamento">
            {abertos.map((p) => (
              <LinhaDoAndamento key={p.id} p={p} />
            ))}
          </div>
        </div>
      ) : null}

      {repetir ? (
        <div className="bloco bloco--largo" data-bloco-de-novo>
          <p className="rotulo">Comprar de novo</p>
          <RepetirPedido p={repetir} />
        </div>
      ) : null}

      {!abertos.length && !repetir ? (
        <div className="bloco bloco--largo">
          <p className="rotulo">Em andamento</p>
          <p className="resumo-curto">Nenhum pedido em andamento agora.</p>
        </div>
      ) : null}

      <p className="ajuda">
        <Link className="link" href="/conta/pedidos">
          Ver todos os pedidos ({pedidos.length})
        </Link>
      </p>
    </div>
  )
}
