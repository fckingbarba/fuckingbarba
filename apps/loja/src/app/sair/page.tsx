import type { Metadata } from "next"
import { Suspense } from "react"
import { MarcaDaTela } from "@/components/marca-da-tela"
import { LinkInvalido, Sair } from "@/components/sair/sair"
import { lerLinkDeSair } from "@/lib/sair"
import "@/estilos/telas/sair.css"

/**
 * /sair — SAIR DA LISTA DE OFERTAS. Quem clica no "Sair da lista" do rodapé
 * de um e-mail de oferta chega aqui com o link num cookie
 * (`app/sair/[t]/route.ts`), e a página pergunta antes de tirar.
 *
 * O "cancelar inscrição" que o Gmail e o iPhone mostram no alto do e-mail
 * nem passa por aqui: ele chama o Medusa direto (`POST /crm/sair`, o
 * clique único).
 *
 * ESCONDIDA: fora do menu, do sitemap e do Google (o `Disallow` do robots e
 * o `noindex` daqui).
 */
export const metadata: Metadata = {
  title: "Sair da lista",
  robots: { index: false, follow: false },
}

export default function Pagina() {
  return (
    <main className="sair" id="conteudo" data-clarity-mask="true">
      <MarcaDaTela tela="sair" />
      <div className="sair__wrap">
        <Suspense
          fallback={
            <section className="bloco sair__bloco" aria-busy="true">
              <p className="sair__espera">
                <span className="giro" aria-hidden="true" /> Abrindo…
              </p>
            </section>
          }
        >
          <Conteudo />
        </Suspense>
      </div>
    </main>
  )
}

/** Dentro do `<Suspense>` porque lê o cookie. */
async function Conteudo() {
  return (await lerLinkDeSair()) ? <Sair /> : <LinkInvalido />
}
