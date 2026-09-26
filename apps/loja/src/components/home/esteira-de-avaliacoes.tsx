"use client"

import Image from "next/image"
import { useMemo, useSyncExternalStore } from "react"
import { Estrelas } from "@/components/estrelas"
import { ForaDaTela } from "@/components/layout/fora-da-tela"
import type { Avaliacao } from "@/conteudo/depoimentos"
import {
  MINIMO_NA_FILA,
  POR_PRODUTO_NA_ESTEIRA,
  SEGUNDOS_POR_CARTAO,
  encherAFila,
  sequencia,
  sortearDaEsteira,
} from "@/lib/avaliacoes"

/**
 * A esteira de "Nossos clientes nos amam", com o sorteio da visita: até
 * quatro avaliações de cada produto (`lib/avaliacoes.ts`).
 *
 * O SORTEIO É NO NAVEGADOR. A home é estática — sai pronta do build, pela
 * CDN —, e sortear no servidor a cada visita faria dela uma página dinâmica:
 * uma função rodando em toda entrada na loja, por causa de uma seção lá
 * embaixo. O servidor desenha o sorteio de uma semente fixa (quem não roda
 * JavaScript vê esse), e o navegador troca pela semente da visita.
 *
 * A semente entra por `useSyncExternalStore`, como o CEP guardado da
 * calculadora da PDP: o terceiro argumento é o que valia no servidor, e o
 * React usa ele na hidratação antes de trocar pelo do navegador — sem
 * acusar diferença de HTML, e sem `setState` dentro de efeito.
 */
const SEMENTE_DO_SERVIDOR = 1

let sementeDaVisita: number | null = null
/** Sorteada uma vez por carregamento da página: é a "visita". */
function semente(): number {
  if (sementeDaVisita === null) sementeDaVisita = Math.floor(Math.random() * 0x100000000)
  return sementeDaVisita
}
const semAssinatura = () => () => {}

export function EsteiraDeAvaliacoes({
  avaliacoes,
  fotos,
}: {
  avaliacoes: Avaliacao[]
  /** A foto de cada produto, pelo handle. */
  fotos: Record<string, string>
}) {
  const s = useSyncExternalStore(semAssinatura, semente, () => SEMENTE_DO_SERVIDOR)
  const fila = useMemo(
    () =>
      encherAFila(
        sortearDaEsteira(avaliacoes, POR_PRODUTO_NA_ESTEIRA, sequencia(s)),
        MINIMO_NA_FILA
      ),
    [avaliacoes, s]
  )

  return (
    <ForaDaTela className="amam__esteiras">
      <div
        className="amam__esteira"
        style={{ animationDuration: `${fila.length * SEGUNDOS_POR_CARTAO}s` }}
      >
        <Fila avaliacoes={fila} fotos={fotos} />
        <Fila avaliacoes={fila} fotos={fotos} oculta />
      </div>
    </ForaDaTela>
  )
}

function Fila({
  avaliacoes,
  fotos,
  oculta = false,
}: {
  avaliacoes: Avaliacao[]
  fotos: Record<string, string>
  oculta?: boolean
}) {
  return (
    <ul className="amam__fila" aria-hidden={oculta || undefined}>
      {avaliacoes.map((a, i) => (
        <li key={`${a.nome}-${i}`}>
          <Cartao avaliacao={a} foto={a.produtoHandle ? fotos[a.produtoHandle] : undefined} />
        </li>
      ))}
    </ul>
  )
}

function Cartao({ avaliacao, foto }: { avaliacao: Avaliacao; foto?: string }) {
  return (
    <article className="avaliacao">
      {foto ? (
        <span className="avaliacao__foto">
          <Image src={foto} alt="" width={160} height={160} loading="lazy" sizes="80px" />
        </span>
      ) : null}
      <div className="avaliacao__corpo">
        <p className="avaliacao__topo">
          <span className="avaliacao__nome">{avaliacao.nome}</span>
          {avaliacao.compraVerificada ? <SeloVerificado /> : null}
          <Estrelas
            nota={avaliacao.nota}
            rotulo={`Nota ${avaliacao.nota} de 5${
              avaliacao.compraVerificada ? ", compra verificada" : ""
            }`}
          />
        </p>
        <p className="avaliacao__texto">{avaliacao.texto}</p>
      </div>
    </article>
  )
}

function SeloVerificado() {
  return (
    <svg className="avaliacao__selo" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M8.4 1.8h7.2l5 5v7.2l-5 5H8.4l-5-5V6.8zm-.6 9.9 1.4-1.4h1.2l1.4 1.4 3.4-3.4h1.2l1.4 1.4-6 6z"
      />
    </svg>
  )
}
