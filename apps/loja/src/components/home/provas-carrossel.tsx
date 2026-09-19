"use client"

import type { ReactNode } from "react"
import { SetaDireita, SetaEsquerda } from "@/components/icones"
import { useCarrossel } from "./use-carrossel"

/**
 * A casca do carrossel de antes e depois: setas nas laterais e bolinhas
 * embaixo. Os depoimentos chegam prontos do servidor como `children`.
 *
 * A diferença pro carrossel da coleção é só de controles — a lógica de
 * rolagem é a mesma e mora no `useCarrossel`.
 */
export function ProvasCarrossel({
  total,
  children,
}: {
  total: number
  children: ReactNode
}) {
  const { trilho, rola, noInicio, noFim, atual, andar, irPara } = useCarrossel()

  return (
    <>
      <div className="provas__palco">
        <div
          ref={trilho}
          className="provas__track"
          tabIndex={0}
          role="region"
          aria-label="Depoimentos de clientes"
        >
          {children}
        </div>

        <div className="provas__navs" hidden={!rola}>
          <button
            type="button"
            className="provas__nav provas__nav--ant"
            onClick={() => andar(-1)}
            disabled={noInicio}
            aria-label="Depoimento anterior"
          >
            <SetaEsquerda />
          </button>
          <button
            type="button"
            className="provas__nav provas__nav--prox"
            onClick={() => andar(1)}
            disabled={noFim}
            aria-label="Próximo depoimento"
          >
            <SetaDireita />
          </button>
        </div>
      </div>

      <div className="carrossel__pontos" hidden={!rola}>
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            type="button"
            className="carrossel__ponto"
            onClick={() => irPara(i)}
            aria-label={`Ir para o depoimento ${i + 1} de ${total}`}
            aria-current={i === atual ? "true" : "false"}
          />
        ))}
      </div>
    </>
  )
}
