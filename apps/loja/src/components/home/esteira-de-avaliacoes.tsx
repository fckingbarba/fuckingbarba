"use client"

import { getImageProps } from "next/image"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { Estrelas } from "@/components/estrelas"
import { ForaDaTela } from "@/components/layout/fora-da-tela"
import type { Avaliacao, Depoimento, Trecho } from "@/conteudo/depoimentos"
import {
  MINIMO_NA_FILA,
  POR_PRODUTO_NA_ESTEIRA,
  SEGUNDOS_POR_CARTAO,
  encherAFila,
  semRepetidas,
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
 * embaixo. A semente da visita entra por `useSyncExternalStore`, como o CEP
 * guardado da calculadora da PDP — uma por carregamento, sem `setState`
 * dentro de efeito.
 *
 * ┌─ OS CARTÕES SÓ SÃO DESENHADOS QUANDO A SEÇÃO CHEGA PERTO DA TELA ──────┐
 * │ A esteira fica lá embaixo da home, e desenhada no carregamento ela     │
 * │ cobrava da primeira tela: 64 cartões pra montar e ativar junto com o   │
 * │ resto. Com os 160 trechos, o LCP da home foi de 2,27 s pra 2,48 s no   │
 * │ Lighthouse do CI rodado aqui — e o CI já vivia no limite de 2,5 s (a   │
 * │ mediana da #93 lá deu 2,64 s). Então o servidor manda o LUGAR, com a   │
 * │ altura da faixa reservada (`.amam__lugar`, pra nada pular), e os       │
 * │ cartões entram quando a seção está a uma tela de distância. Sem        │
 * │ JavaScript, a seção fica com o título e a pílula — os trechos estão na │
 * │ página de cada produto.                                                │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E OS TEXTOS SÓ VÊM NESSA HORA TAMBÉM ─────────────────────────────────┐
 * │ Os 160 trechos iam como propriedade deste componente — e propriedade   │
 * │ de componente do navegador viaja DENTRO do HTML da home (os dados do   │
 * │ React, no fim da página): 26 KB de texto, 5 KB comprimidos, em toda    │
 * │ visita, pra uma seção lá embaixo. No Lighthouse do CI, o HTML e o CSS  │
 * │ chegam juntos nas primeiras voltas da conexão, e esses 5 KB a mais     │
 * │ empurravam o CSS pra volta seguinte: +0,3 s no LCP da home.            │
 * │                                                                        │
 * │ Agora `conteudo/depoimentos.ts` é importado aqui com `import()`: o     │
 * │ arquivo vira um pedaço de JavaScript à parte, que o navegador só pede  │
 * │ quando a seção chega perto (`carregarDepoimentos`). Do servidor vêm só │
 * │ as fotos dos produtos.                                                 │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Avaliação e trecho de entrevista passam na mesma esteira, cada um como é:
 * a avaliação com nome, estrela e selo; o trecho com "Entrevista com
 * cliente" no lugar do nome, e nada de estrela (`conteudo/depoimentos.ts`).
 *
 * ┌─ A FOTO DO CARTÃO É UM <img> SIMPLES, NO TAMANHO DA CAIXA ─────────────┐
 * │ Com o `<Image>` do Next e `sizes="80px"`, cada cartão levava uma lista │
 * │ de 16 tamanhos (de 32 a 3.840 px) pra uma caixa de 54 px: 2 KB de HTML │
 * │ por cartão, e um componente com estado pra ativar em cada um dos 64.   │
 * │ Agora é `getImageProps` no tamanho da caixa (`FOTO`): só 1x e 2x, e a  │
 * │ mesma conta feita uma vez por produto, não por cartão.                 │
 * └────────────────────────────────────────────────────────────────────────┘
 */
const SEMENTE_DO_SERVIDOR = 1

/** A caixa da foto no cartão (`.avaliacao__foto`, em `estilos/provas.css`). */
const FOTO = 54

type Miniatura = ReturnType<typeof getImageProps>["props"]

let sementeDaVisita: number | null = null
/** Sorteada uma vez por carregamento da página: é a "visita". */
function semente(): number {
  if (sementeDaVisita === null) sementeDaVisita = Math.floor(Math.random() * 0x100000000)
  return sementeDaVisita
}
const semAssinatura = () => () => {}

/**
 * As avaliações publicadas e os trechos, cada um uma vez só — buscados na
 * hora em que a seção chega perto (ver a segunda caixa lá em cima).
 */
async function carregarDepoimentos(): Promise<Depoimento[]> {
  const { AVALIACOES, TRECHOS } = await import("@/conteudo/depoimentos")
  return [...semRepetidas(AVALIACOES), ...semRepetidas(TRECHOS)]
}

export function EsteiraDeAvaliacoes({
  fotos,
}: {
  /** A foto de cada produto, pelo handle. */
  fotos: Record<string, string>
}) {
  const lugar = useRef<HTMLDivElement>(null)
  // Vazia até a seção chegar perto e os textos chegarem.
  const [depoimentos, setDepoimentos] = useState<Depoimento[]>([])
  useEffect(() => {
    const alvo = lugar.current
    if (!alvo) return
    let vivo = true
    const carregar = () =>
      carregarDepoimentos().then(
        (lista) => {
          if (vivo) setDepoimentos(lista)
        },
        // Sem os textos (a rede caiu no meio), a seção fica como sem
        // JavaScript: título e pílula.
        () => {}
      )
    // Navegador sem o observador (antigo): busca logo.
    if (typeof IntersectionObserver === "undefined") {
      carregar()
      return () => {
        vivo = false
      }
    }
    const vigia = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return
        vigia.disconnect()
        carregar()
      },
      // Uma tela inteira antes: quando a pessoa chega, os cartões já estão lá.
      { rootMargin: "100% 0px" }
    )
    vigia.observe(alvo)
    return () => {
      vivo = false
      vigia.disconnect()
    }
  }, [])

  const s = useSyncExternalStore(semAssinatura, semente, () => SEMENTE_DO_SERVIDOR)
  const miniaturas = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(fotos).map(([handle, src]) => [
          handle,
          getImageProps({ src, alt: "", width: FOTO, height: FOTO }).props,
        ])
      ) as Record<string, Miniatura>,
    [fotos]
  )
  const fila = useMemo(
    () =>
      encherAFila(
        sortearDaEsteira(depoimentos, POR_PRODUTO_NA_ESTEIRA, sequencia(s)),
        MINIMO_NA_FILA
      ),
    [depoimentos, s]
  )

  return (
    <div ref={lugar} className="amam__lugar">
      {fila.length ? (
        <ForaDaTela className="amam__esteiras">
          <div
            className="amam__esteira"
            style={{ animationDuration: `${fila.length * SEGUNDOS_POR_CARTAO}s` }}
          >
            <Fila depoimentos={fila} miniaturas={miniaturas} />
            <Fila depoimentos={fila} miniaturas={miniaturas} oculta />
          </div>
        </ForaDaTela>
      ) : null}
    </div>
  )
}

function Fila({
  depoimentos,
  miniaturas,
  oculta = false,
}: {
  depoimentos: Depoimento[]
  miniaturas: Record<string, Miniatura>
  oculta?: boolean
}) {
  return (
    <ul className="amam__fila" aria-hidden={oculta || undefined}>
      {depoimentos.map((d, i) => {
        const foto = d.produtoHandle ? miniaturas[d.produtoHandle] : undefined
        return (
          <li key={`${"nome" in d ? d.nome : "trecho"}-${i}`}>
            {"nota" in d ? (
              <Cartao avaliacao={d} foto={foto} />
            ) : (
              <CartaoDeTrecho trecho={d} foto={foto} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Foto({ foto }: { foto?: Miniatura }) {
  return foto ? (
    <span className="avaliacao__foto">
      {/* eslint-disable-next-line @next/next/no-img-element -- getImageProps: a foto já sai otimizada, sem o componente — ver a caixa lá em cima */}
      <img {...foto} alt="" loading="lazy" />
    </span>
  ) : null
}

function Cartao({ avaliacao, foto }: { avaliacao: Avaliacao; foto?: Miniatura }) {
  return (
    <article className="avaliacao">
      <Foto foto={foto} />
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

/** O trecho de entrevista: sem nome, sem estrela e sem selo — é o que ele é. */
function CartaoDeTrecho({ trecho, foto }: { trecho: Trecho; foto?: Miniatura }) {
  return (
    <article className="avaliacao">
      <Foto foto={foto} />
      <div className="avaliacao__corpo">
        <p className="avaliacao__topo">
          <span className="avaliacao__nome">Entrevista com cliente</span>
        </p>
        <p className="avaliacao__texto">{trecho.texto}</p>
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
