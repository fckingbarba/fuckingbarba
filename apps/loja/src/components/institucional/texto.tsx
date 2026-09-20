import type { ReactNode } from "react"

/**
 * AS PEÇAS DAS PÁGINAS DE TEXTO — privacidade, termos, trocas.
 *
 * Existem pra que as três tenham a mesma tipografia sem repetir trinta
 * classes do Tailwind em cada parágrafo. Documento legal que muda de cara de
 * uma página pra outra passa a impressão de recortado da internet, que é
 * exatamente a impressão que ele não pode passar.
 *
 * Em Tailwind, e não em CSS do protótipo, porque é o padrão que essas
 * páginas já seguiam — o desenho da marca mora nas telas de venda; aqui o
 * trabalho é ser legível.
 */

export function Titulo({ children }: { children: ReactNode }) {
  return <h1 className="titulo-marca text-4xl text-tinta sm:text-5xl">{children}</h1>
}

/** A linha de abertura, um pouco maior — o resumo honesto do documento. */
export function Abertura({ children }: { children: ReactNode }) {
  return <p className="mt-6 text-lg leading-relaxed text-tinta">{children}</p>
}

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="titulo-marca text-xl text-tinta sm:text-2xl">{titulo}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

export function P({ children }: { children: ReactNode }) {
  return <p className="leading-relaxed text-tinta">{children}</p>
}

export function Lista({ children }: { children: ReactNode }) {
  return <ul className="ml-5 list-disc space-y-2 leading-relaxed text-tinta">{children}</ul>
}

/**
 * O QUE AINDA FALTA, DITO NA CARA.
 *
 * CNPJ, razão social, endereço e WhatsApp são dados que ninguém pode
 * inventar — num documento legal, dado inventado é pior que dado ausente,
 * porque some a chance de alguém reparar. Enquanto o valor real não entra em
 * `lib/site.ts`, a página mostra esta tarja em vez de um número de mentira.
 *
 * `data-pendente` é o que o conferidor procura: quando os dados entrarem,
 * nenhuma tarja pode sobrar numa página pública.
 */
export function Pendente({ children }: { children: ReactNode }) {
  return (
    <span
      data-pendente
      className="inline-block border-2 border-dashed border-erro/60 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-erro"
    >
      {children}
    </span>
  )
}

/** Data da última alteração. Documento legal sem data não serve de prova. */
export function Atualizado({ em }: { em: string }) {
  return (
    <p className="mt-10 border-t-2 border-linha pt-4 text-sm text-tinta-suave">
      Última atualização: {em}.
    </p>
  )
}
