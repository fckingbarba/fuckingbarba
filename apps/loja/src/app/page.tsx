import Link from "next/link"
import { AltaPerformance } from "@/components/home/alta-performance"
import { Banner } from "@/components/home/banner"
import { Fechamento } from "@/components/home/fechamento"
import { Colecao } from "@/components/home/colecao"
import { Ofertas } from "@/components/home/ofertas"
import { Sobre } from "@/components/home/sobre"
import { Trustbar } from "@/components/home/trustbar"
import { Vitrine } from "@/components/home/vitrine"
import { Raio } from "@/components/icones"
import { site } from "@/lib/site"

/**
 * A home, sendo montada seção por seção a partir do protótipo.
 *
 * O `<main>` não tem medida própria de propósito: cada seção é uma faixa de
 * ponta a ponta da tela e segura o próprio limite de largura por dentro
 * (1320px, como no protótipo). Centralizar aqui estreitaria o banner.
 *
 * Já no lugar: banner, vantagens, ofertas, coleção, Alta Performance,
 * grade de produtos, a história da marca e a última chamada.
 * Falta a prova social — a estrutura entra vazia e acende quando houver
 * depoimento de cliente de verdade.
 */
export default function Inicio() {
  return (
    <main id="conteudo" className="flex-1">
      <Banner />
      <Trustbar />
      <Ofertas />
      <Colecao />
      <AltaPerformance />
      <Vitrine />
      <Sobre />
      <Fechamento />

      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="mb-4 inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.18em] text-tinta">
          <Raio className="h-4 w-4" />
          O resto da home vem por aí
        </p>

        <h1 className="titulo-marca max-w-4xl text-[clamp(2.2rem,7vw,5rem)] text-tinta">
          Barba e cabelo
          <br />
          <span className="text-papel [text-shadow:4px_4px_0_#12181f]">sem frescura.</span>
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-snug text-tinta">
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
            Ver por categoria
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
      </div>
    </main>
  )
}
