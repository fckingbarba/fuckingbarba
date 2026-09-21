/**
 * O QUE AS TELAS DE ENTRAR MOSTRAM — os formatos das respostas das ações.
 *
 * Arquivo separado pelo mesmo motivo do `checkout-visivel.ts`: um arquivo
 * `"use server"` só exporta função assíncrona, e o formulário precisa do
 * estado inicial; e os componentes de cliente não podem puxar nada
 * `server-only` pro grafo deles.
 */

export type EstadoEntrar = {
  erro: string
  /** O que a pessoa digitou — o React limpa o formulário depois da ação. */
  email: string
  rodada: number
}

export const ENTRAR_INICIAL: EstadoEntrar = { erro: "", email: "", rodada: 0 }

export type EstadoCodigo = {
  erro: string
  /**
   * O código morreu (errou cinco vezes, ou venceu): a tela destaca o
   * "reenviar", que é a única saída — digitar de novo não adianta mais.
   */
  morto: boolean
  /** O tempo do cookie acabou: não há mais pra quem mandar. Volta pro e-mail. */
  perdido: boolean
  rodada: number
}

export const CODIGO_INICIAL: EstadoCodigo = { erro: "", morto: false, perdido: false, rodada: 0 }

export type Reenvio = { ok: boolean; segundos: number; erro: string }

/** Os 30 segundos entre um código e outro — os mesmos de `regras.ts`, no backend. */
export const SEGUNDOS_ENTRE_ENVIOS = 30
