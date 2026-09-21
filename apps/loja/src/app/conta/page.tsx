import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { sair } from "@/lib/acoes/conta"
import { lerCliente } from "@/lib/conta"

/**
 * /conta — por enquanto, só a prova de que entrou.
 *
 * A visão geral do protótipo (pedidos em andamento, comprar de novo,
 * endereço e dados) chega no próximo passo do porte, junto das telas de
 * pedidos. Até lá esta página não tem link em lugar nenhum da loja — o
 * "Minha conta" do cabeçalho continua no /em-breve até a conta estar
 * inteira.
 */
export const metadata: Metadata = {
  title: "Minha conta",
}

export default function Pagina() {
  return (
    <Suspense fallback={<p className="bloco">Abrindo sua conta…</p>}>
      <Painel />
    </Suspense>
  )
}

async function Painel() {
  const leitura = await lerCliente()

  // Sem cookie o proxy já teria mandado pro "entrar"; isto é pra quem chega
  // por um caminho que ele não viu.
  if (leitura.estado === "sem-sessao") redirect("/conta/entrar")
  // Token recusado: `/conta/sair` apaga o cookie (página não pode) e manda
  // pro "entrar" com o recado. Sem apagar, o proxy veria o cookie e mandaria
  // de volta pra cá — um vai e volta sem fim.
  if (leitura.estado === "expirou") redirect("/conta/sair?motivo=expirou")
  if (leitura.estado === "fora-do-ar") {
    return (
      <div className="bloco" role="alert">
        Não consegui abrir sua conta agora. Tenta de novo em instantes.
      </div>
    )
  }

  const { cliente } = leitura
  return (
    <section className="bloco conta__provisoria" aria-labelledby="t-painel">
      <h1 id="t-painel">{cliente.nome ? `Oi, ${cliente.nome}` : "Oi!"}</h1>
      <p>
        Você entrou como <b data-conta-email>{cliente.email}</b>.
      </p>
      <p>Seus pedidos, endereços e dados vão aparecer aqui.</p>
      <form action={sair}>
        <button type="submit" className="btn btn--fantasma">
          Sair
        </button>
      </form>
    </section>
  )
}
