/**
 * O QUE AS TELAS DE ENTRAR MOSTRAM — os formatos das respostas das ações.
 *
 * Arquivo à parte porque um arquivo `"use server"` só exporta função
 * assíncrona, e o formulário precisa do estado inicial.
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
  /** O código morreu (cinco erros, ou venceu): a saída é o "reenviar". */
  morto: boolean
  /** O tempo do cookie acabou: volta pro e-mail. */
  perdido: boolean
  rodada: number
}

export const CODIGO_INICIAL: EstadoCodigo = { erro: "", morto: false, perdido: false, rodada: 0 }

export type Reenvio = { ok: boolean; segundos: number; erro: string }

/** Os 30 segundos entre um código e outro — os mesmos do backend (`modules/codigo/regras.ts`). */
export const SEGUNDOS_ENTRE_ENVIOS = 30
