"use client"

import type { ReactNode } from "react"
import { SetaDireita, SetaEsquerda } from "@/components/icones"
import { useCarrossel } from "./use-carrossel"

/**
 * A casca com os controles da faixa de coleção.
 *
 * É componente de cliente, mas só a casca: os cards chegam prontos do
 * servidor como `children` e não viram JavaScript. O que o navegador baixa
 * daqui são as setas e a conta da barra de progresso.
 */
export function ColecaoCarrossel({
  titulo,
  children,
}: {
  titulo: ReactNode
  children: ReactNode
}) {
  const { trilho, rola, noInicio, noFim, barra, andar } = useCarrossel()

  return (
    <>
      <div className="colecao__topo">
        <div>{titulo}</div>
        <div>
          <div className="colecao__navs" hidden={!rola}>
            <button
              type="button"
              className="colecao__nav"
              onClick={() => andar(-1)}
              disabled={noInicio}
              aria-label="Ver produtos anteriores"
            >
              <SetaEsquerda />
            </button>
            <button
              type="button"
              className="colecao__nav"
              onClick={() => andar(1)}
              disabled={noFim}
              aria-label="Ver próximos produtos"
            >
              <SetaDireita />
            </button>
          </div>
        </div>
      </div>

      {/* tabindex 0: sem isso, quem navega por teclado não consegue rolar o
          trilho — ele nunca recebe foco e as setas do teclado não chegam. */}
      <div
        ref={trilho}
        className="colecao__track"
        tabIndex={0}
        role="region"
        aria-label="Produtos da coleção"
      >
        {children}
      </div>

      <div className="colecao__progresso" hidden={!rola}>
        <span
          className="colecao__barra"
          style={{ width: `${barra.largura}%`, marginLeft: `${barra.deslocamento}%` }}
        />
      </div>
    </>
  )
}
