import type { Integracao } from "../painel/observabilidade"

/**
 * O SINAL DE UMA INTEGRAÇÃO — "falei com o Resend e deu certo", "a Frenet
 * não respondeu". Quem fala com cada serviço de fora chama `sinal(...)` ali
 * mesmo, na função que faz a chamada (`lib/email.ts`, o cliente do Pagar.me,
 * o do Bling, o provedor da Frenet, o do Google), e o módulo de
 * observabilidade soma o dia (`obs_sinal`).
 *
 * ┌─ POR QUE UMA PORTA GLOBAL, E NÃO O CONTAINER ──────────────────────────┐
 * │ Essas funções não recebem o container: o `enviarEmail` recebe só o     │
 * │ logger, e o provedor da Frenet mora num módulo que não enxerga os     │
 * │ outros. O serviço do módulo liga a porta quando nasce (no começo do    │
 * │ Medusa); antes disso, e nos testes, o sinal simplesmente não vai.      │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * NUNCA ESPERA E NUNCA LANÇA: o sinal não pode atrasar o checkout nem
 * derrubar um e-mail. E nunca leva dado de cliente — o e-mail vai
 * mascarado, e `semDadoPessoal` passa em tudo o que vira texto.
 */

export type Sinal = {
  integracao: Integracao
  ok: boolean
  /** A falha em frase, pra tela ("o assunto" pra r•••@gmail.com). */
  resumo?: string | null
  /** A linha técnica da falha. */
  detalhe?: string | null
}

type Destino = (s: Sinal) => Promise<unknown>

let destino: Destino | null = null

/** O serviço do módulo liga, quando o Medusa sobe. */
export function ligarSinais(d: Destino | null) {
  destino = d
}

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g

/** "rafael@x.com, CPF 123.456.789-00" → "r•••@x.com, CPF •••" — o texto que fica guardado. */
export function semDadoPessoal(texto: string | null | undefined, limite = 500): string | null {
  if (!texto) return null
  const limpo = texto.replace(EMAIL, "$1•••@$2").replace(CPF, "•••").trim()
  return limpo.length > limite ? `${limpo.slice(0, limite - 1)}…` : limpo
}

export function sinal(s: Sinal): void {
  if (!destino) return
  try {
    void destino({
      integracao: s.integracao,
      ok: s.ok,
      resumo: semDadoPessoal(s.resumo, 200),
      detalhe: semDadoPessoal(s.detalhe),
    }).catch(() => undefined)
  } catch {
    // o sinal nunca derruba quem mandou
  }
}
