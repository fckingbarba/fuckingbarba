import type { Metadata } from "next"
import Link from "next/link"
import { Raio } from "@/components/icones"
import { site } from "@/lib/site"

/**
 * Destino provisório dos links cujas páginas ainda não existem (blog,
 * contato, minha conta, busca…).
 *
 * Por que não deixar o link apontando pro nada: 404 é a resposta certa pra
 * endereço que não existe, não pra página que a gente ainda não fez. Quem
 * clica em "Contato" e cai num "página não encontrada" entende que o site
 * está quebrado. Aqui ele entende que está sendo construído — e sai daqui
 * com um caminho na mão.
 *
 * `noindex` porque isso é andaime: não queremos essa página na busca do
 * Google nem hoje nem depois. Conforme cada destino nascer, o link some
 * daqui sozinho — todos saem do mapa em `lib/site.ts`.
 */
export const metadata: Metadata = {
  title: "Em breve",
  description: "Esta parte da loja ainda está sendo construída.",
  robots: { index: false, follow: false },
}

export default function EmBreve() {
  return (
    <main id="conteudo" className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6 sm:py-24">
      <p className="mb-4 inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.18em] text-tinta">
        <Raio className="h-4 w-4" />
        Em obras
      </p>

      <h1 className="titulo-marca text-[clamp(2.2rem,7vw,4.5rem)] text-tinta">
        Essa parte ainda
        <br />
        <span className="text-papel [text-shadow:4px_4px_0_#12181f]">não ficou pronta.</span>
      </h1>

      <p className="mt-6 max-w-xl text-lg leading-snug text-tinta">
        A loja nova está sendo montada por partes. Esta aqui ainda não entrou — mas entra. Enquanto
        isso, dá pra ver o que já está de pé:
      </p>

      <ul className="mt-8 flex flex-wrap gap-2">
        {site.categorias.map((c) => (
          <li key={c.handle}>
            <Link
              href={`/${c.handle}`}
              className="chanfro-sm inline-block border-2 border-tinta bg-papel px-4 py-2 text-sm font-extrabold uppercase tracking-wide text-tinta shadow-dura-sm"
            >
              {c.nome}
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/"
            className="chanfro-sm inline-block border-2 border-tinta bg-amarelo px-4 py-2 text-sm font-extrabold uppercase tracking-wide text-tinta shadow-dura-sm"
          >
            Voltar pra home
          </Link>
        </li>
      </ul>

      {site.lojaAtualUrl ? (
        <p className="mt-10 text-base text-tinta">
          Procurando comprar agora?{" "}
          <a href={site.lojaAtualUrl} className="font-bold underline underline-offset-2">
            A loja atual continua no ar.
          </a>
        </p>
      ) : null}
    </main>
  )
}
