/**
 * O QUE AS AÇÕES DA EQUIPE DEVOLVEM PRA TELA. À parte do `"use server"`,
 * que só exporta função assíncrona.
 */

export type CampoDoConvite = "nome" | "email" | "papel"

export type EstadoConvite = {
  ok: boolean
  rodada: number
  /** O erro de cada campo, embaixo dele. */
  erros: Partial<Record<CampoDoConvite, string>>
  /** O que foi digitado — o React limpa o formulário depois da ação. */
  valores: Record<CampoDoConvite, string>
  /** A frase do fim: o convite saiu, ou o erro que não é de campo nenhum. */
  aviso: string
}

export const CONVITE_INICIAL: EstadoConvite = {
  ok: false,
  rodada: 0,
  erros: {},
  valores: { nome: "", email: "", papel: "operacao" },
  aviso: "",
}

export type ResultadoDaMudanca = { ok: boolean; aviso: string; erro: string }
