"use client"

import { Raio } from "@/components/icones"
import { EVENTO_DO_MODELO, type Modelo } from "@/lib/criadores-visivel"

/**
 * O "QUERO O FIXO" / "QUERO COMISSÃO" das propostas — desce até a inscrição
 * (é um link pro `#inscricao`, e funciona sem JavaScript) e marca o modelo
 * lá, pelo evento que o formulário ouve.
 */
export function BotaoDoModelo({ modelo, children }: { modelo: Modelo; children: string }) {
  return (
    <a
      className="btn btn--preto"
      href="#inscricao"
      data-quero={modelo}
      onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_DO_MODELO, { detail: modelo }))}
    >
      {children} <Raio className="btn__bolt" />
    </a>
  )
}
