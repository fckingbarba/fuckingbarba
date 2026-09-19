import Link from "next/link"
import { Logo } from "@/components/marca/logo"
import { Raio } from "@/components/marca/raio"
import { site } from "@/lib/site"

/**
 * Página inicial da FASE 1: a marca no ar, nada à venda ainda.
 * A home de verdade (vitrine, carrossel, gaveta) entra na fase 3, lendo
 * produto real do Medusa — o protótipo HTML é o desenho dela.
 */
export default function Inicio() {
  return (
    <>
      <div className="faixa-perigo h-3 w-full" aria-hidden="true" />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        {site.lojaAtualUrl ? (
          <a
            href={site.lojaAtualUrl}
            className="chanfro-sm border-2 border-tinta bg-amarelo px-4 py-2 text-sm font-extrabold uppercase tracking-wide text-tinta shadow-dura-sm transition-transform duration-150 ease-suave hover:-translate-y-0.5"
          >
            Ir pra loja
          </a>
        ) : null}
      </header>

      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-12 sm:px-6 sm:py-20"
      >
        <p className="mb-4 inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.18em] text-tinta">
          <Raio className="h-4 w-4" />
          Loja nova em construção
        </p>

        <h1 className="titulo-marca max-w-4xl text-[clamp(2.6rem,9vw,6.5rem)] text-tinta">
          Barba e cabelo
          <br />
          <span className="text-papel [text-shadow:4px_4px_0_#12181f]">sem frescura.</span>
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-snug text-tinta sm:text-xl">
          Estamos mudando de casa pra ter uma loja mais rápida, mais nossa e com frete grátis mais
          fácil de bater. Enquanto isso, tudo continua à venda na loja atual.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {site.lojaAtualUrl ? (
            <a
              href={site.lojaAtualUrl}
              className="chanfro border-2 border-tinta bg-tinta px-6 py-3 text-base font-extrabold uppercase tracking-wide text-amarelo shadow-[6px_6px_0_0_#ffd84d] transition-transform duration-150 ease-suave hover:-translate-y-0.5"
            >
              Comprar na loja atual
            </a>
          ) : null}
          <a
            href={site.instagram}
            rel="noopener"
            className="chanfro border-2 border-tinta bg-papel px-6 py-3 text-base font-extrabold uppercase tracking-wide text-tinta shadow-dura transition-transform duration-150 ease-suave hover:-translate-y-0.5"
          >
            Instagram
          </a>
        </div>

        <nav aria-label="Categorias" className="mt-14">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.18em] text-tinta">
            O que vem por aí
          </p>
          <ul className="flex flex-wrap gap-2">
            {site.categorias.map((c) => (
              <li key={c.handle}>
                <Link
                  href={`/${c.handle}`}
                  className="chanfro-sm inline-block border-2 border-tinta bg-menta-clara px-4 py-2 text-sm font-bold text-tinta"
                >
                  {c.nome}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>

      <footer className="border-t-2 border-tinta bg-tinta px-4 py-6 text-sm text-papel sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
          <span className="font-extrabold uppercase tracking-wide">{site.nome}</span>
          <span className="text-white/70">
            <Link href="/privacidade" className="underline underline-offset-2">
              Privacidade
            </Link>
            {" · "}
            <Link href="/trocas" className="underline underline-offset-2">
              Trocas e devoluções
            </Link>
          </span>
        </div>
      </footer>
    </>
  )
}
