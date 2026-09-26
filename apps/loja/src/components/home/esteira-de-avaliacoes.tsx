"use client"

import { getImageProps } from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"
import { CartaoDeDepoimento, FOTO_DO_CARTAO, type Miniatura } from "@/components/depoimento"
import { ForaDaTela } from "@/components/layout/fora-da-tela"
import type { Depoimento } from "@/conteudo/depoimentos"
import {
  MINIMO_NA_FILA,
  POR_PRODUTO_NA_ESTEIRA,
  SEGUNDOS_POR_CARTAO,
  SEGUNDOS_POR_CARTAO_NA_VOLTA,
  emDuasFileiras,
  encherAFila,
  sequencia,
  sortearDaEsteira,
} from "@/lib/avaliacoes"
import { useSementeDaVisita } from "@/lib/use-semente-da-visita"

/**
 * A esteira de "Nossos clientes nos amam", com o sorteio da visita: até
 * quatro avaliações de cada produto (`lib/avaliacoes.ts`), repartidas em
 * DUAS FILEIRAS, como no protótipo — a de cima corre pra esquerda, a de
 * baixo pra direita (`.amam__esteira--volta`), um pouco mais devagar.
 *
 * O SORTEIO É NO NAVEGADOR, com a semente da visita
 * (`lib/use-semente-da-visita.ts`): a home continua estática, pronta do
 * build na CDN, e cada visita vê um sorteio.
 *
 * ┌─ OS CARTÕES SÓ SÃO DESENHADOS QUANDO A SEÇÃO CHEGA PERTO DA TELA ──────┐
 * │ A esteira fica lá embaixo da home, e desenhada no carregamento ela     │
 * │ cobrava da primeira tela: 64 cartões pra montar e ativar junto com o   │
 * │ resto. Com os 160 trechos, o LCP da home foi de 2,27 s pra 2,48 s no   │
 * │ Lighthouse do CI rodado aqui — e o CI já vivia no limite de 2,5 s (a   │
 * │ mediana da #93 lá deu 2,64 s). Então o servidor manda o LUGAR, com a   │
 * │ altura das duas fileiras reservada (`.amam__lugar`, pra nada pular), e │
 * │ os cartões entram quando a seção está a uma tela de distância. Sem     │
 * │ JavaScript, a seção fica com o título e a pílula — e cada página de    │
 * │ produto mostra três trechos dele.                                      │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Avaliação e trecho de entrevista passam na mesma esteira, cada um como é
 * (`components/depoimento.tsx`). De `conteudo/depoimentos`, aqui só entra
 * TIPO — ver o topo de `lib/avaliacoes.ts`.
 *
 * ┌─ A FOTO DO CARTÃO É UM <img> SIMPLES, NO TAMANHO DA CAIXA ─────────────┐
 * │ Com o `<Image>` do Next e `sizes="80px"`, cada cartão levava uma lista │
 * │ de 16 tamanhos (de 32 a 3.840 px) pra uma caixa de 54 px: 2 KB de HTML │
 * │ por cartão, e um componente com estado pra ativar em cada um dos 64.   │
 * │ Agora é `getImageProps` no tamanho da caixa (`FOTO_DO_CARTAO`): só 1x  │
 * │ e 2x, e a mesma conta feita uma vez por produto, não por cartão.       │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export function EsteiraDeAvaliacoes({
  depoimentos,
  fotos,
}: {
  depoimentos: Depoimento[]
  /** A foto de cada produto, pelo handle. */
  fotos: Record<string, string>
}) {
  const lugar = useRef<HTMLDivElement>(null)
  const [perto, setPerto] = useState(false)
  useEffect(() => {
    const alvo = lugar.current
    if (!alvo) return
    // Navegador sem o observador (antigo): desenha logo, fora do efeito.
    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setPerto(true))
      return
    }
    const vigia = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return
        setPerto(true)
        vigia.disconnect()
      },
      // Uma tela inteira antes: quando a pessoa chega, os cartões já estão lá.
      { rootMargin: "100% 0px" }
    )
    vigia.observe(alvo)
    return () => vigia.disconnect()
  }, [])

  const s = useSementeDaVisita()
  const miniaturas = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(fotos).map(([handle, src]) => [
          handle,
          getImageProps({ src, alt: "", width: FOTO_DO_CARTAO, height: FOTO_DO_CARTAO }).props,
        ])
      ) as Record<string, Miniatura>,
    [fotos]
  )
  const fileiras = useMemo(() => {
    if (!perto) return []
    const aleatorio = sequencia(s)
    return emDuasFileiras(
      sortearDaEsteira(depoimentos, POR_PRODUTO_NA_ESTEIRA, aleatorio),
      aleatorio
    )
      .filter((fileira) => fileira.length)
      .map((fileira) => encherAFila(fileira, MINIMO_NA_FILA))
  }, [perto, depoimentos, s])

  return (
    <div ref={lugar} className="amam__lugar">
      {fileiras.length ? (
        <ForaDaTela className="amam__esteiras">
          {fileiras.map((fila, i) => (
            <div
              key={i}
              className={i ? "amam__esteira amam__esteira--volta" : "amam__esteira"}
              style={{
                animationDuration: `${
                  fila.length * (i ? SEGUNDOS_POR_CARTAO_NA_VOLTA : SEGUNDOS_POR_CARTAO)
                }s`,
              }}
            >
              <Fila depoimentos={fila} miniaturas={miniaturas} />
              <Fila depoimentos={fila} miniaturas={miniaturas} oculta />
            </div>
          ))}
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
      {depoimentos.map((d, i) => (
        <li key={`${"nome" in d ? d.nome : "trecho"}-${i}`}>
          <CartaoDeDepoimento
            depoimento={d}
            foto={d.produtoHandle ? miniaturas[d.produtoHandle] : undefined}
          />
        </li>
      ))}
    </ul>
  )
}
