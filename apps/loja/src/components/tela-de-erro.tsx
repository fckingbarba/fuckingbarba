"use client"

import Link from "next/link"
import { useTransition } from "react"
import { Raio } from "@/components/icones"

/**
 * A TELA DE QUANDO A PÁGINA NÃO CARREGA — `app/error.tsx` e
 * `app/global-error.tsx` desenham esta.
 *
 * Só aparece pra página que não estava pronta e não deu pra montar agora:
 * quase sempre é o Medusa fora do ar por instantes (`lib/medusa.ts`, regra
 * 4). Página que já estava pronta não chega aqui: continua no ar com a
 * última versão boa. Antes desta tela, o mesmo tropeço virava "categoria sem
 * produto" e "produto não encontrado", guardados por horas; agora é uma
 * tela que diz a verdade e some no primeiro "tentar de novo" que der certo.
 *
 * "Tentar de novo" pede a página ao servidor outra vez (o `retry` do Next),
 * sem recarregar a aba. A sacola e o cabeçalho, que estão fora da parte que
 * falhou, ficam como estavam.
 *
 * `noindex` porque isto sai com status 200 — com Cache Components o status
 * vai antes de a página ficar pronta — e o Google não pode guardar esta tela
 * como o conteúdo de um produto.
 */
export function TelaDeErro({
  retry,
  semCarcaca = false,
}: {
  retry: () => void
  /**
   * `global-error`: o layout raiz é que caiu. Sem cabeçalho nem sacola, e o
   * "voltar" recarrega de verdade em vez de navegar dentro de um app sem
   * layout.
   */
  semCarcaca?: boolean
}) {
  const [tentando, tentar] = useTransition()

  const voltar =
    "chanfro-sm inline-block border-2 border-tinta bg-papel px-4 py-2 text-sm font-extrabold uppercase tracking-wide text-tinta shadow-dura-sm"

  return (
    <main id="conteudo" className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6 sm:py-24">
      <meta name="robots" content="noindex" />

      <p className="mb-4 inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.18em] text-tinta">
        <Raio className="h-4 w-4" />
        Tropeço nosso
      </p>

      <h1 className="titulo-marca text-[clamp(2.2rem,7vw,4.5rem)] text-tinta">
        Essa página
        <br />
        <span className="text-papel [text-shadow:4px_4px_0_#12181f]">não carregou.</span>
      </h1>

      <p className="mt-6 max-w-xl text-lg leading-snug text-tinta">
        O problema foi do nosso lado, e costuma passar em segundos. Tenta de novo; se continuar,
        volta daqui a pouco.
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => tentar(() => retry())}
          disabled={tentando}
          aria-busy={tentando || undefined}
          className="chanfro-sm inline-block border-2 border-tinta bg-amarelo px-4 py-2 text-sm font-extrabold uppercase tracking-wide text-tinta shadow-dura-sm disabled:opacity-60"
        >
          {tentando ? "Tentando…" : "Tentar de novo"}
        </button>
        {semCarcaca ? (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- sem o layout raiz, só a volta que recarrega a página inteira é garantida
          <a href="/" className={voltar}>
            Voltar pra home
          </a>
        ) : (
          <Link href="/" className={voltar}>
            Voltar pra home
          </Link>
        )}
      </div>
    </main>
  )
}
