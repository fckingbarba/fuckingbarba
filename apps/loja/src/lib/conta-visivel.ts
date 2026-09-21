/**
 * O QUE AS TELAS DE ENTRAR MOSTRAM — os formatos das respostas das ações.
 *
 * Arquivo separado pelo mesmo motivo do `checkout-visivel.ts`: um arquivo
 * `"use server"` só exporta função assíncrona, e o formulário precisa do
 * estado inicial; e os componentes de cliente não podem puxar nada
 * `server-only` pro grafo deles.
 */

import type { CarrinhoVisivel } from "./carrinho-visivel"

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

/* ── os pedidos da conta ──────────────────────────────────────────────────── */

/**
 * Onde o pedido está, na pergunta que a pessoa faz ("cadê meu pedido?").
 * "pago" é "Em separação": é o que ela quer saber depois de pagar, e é o que
 * o obrigado diz ("Já estamos separando o seu pedido"). "combinar" é o
 * pedido do checkout provisório, de antes do Pagar.me.
 */
export type SituacaoDoPedido =
  "pix" | "analise" | "pago" | "enviado" | "entregue" | "cancelado" | "combinar"

export const ROTULO_DA_SITUACAO: Record<SituacaoDoPedido, string> = {
  pix: "Aguardando Pix",
  analise: "Em análise",
  pago: "Em separação",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
  combinar: "A combinar",
}

/** O que ainda vai mudar — é o que a visão geral põe em "Em andamento". */
export const EM_ANDAMENTO: readonly SituacaoDoPedido[] = [
  "pix",
  "analise",
  "combinar",
  "pago",
  "enviado",
]

/**
 * O rótulo do frete nos totais. O obrigado escreve "Entrega · <forma>", e
 * como a forma já se chama "Entrega econômica", sai "Entrega · Entrega
 * econômica". Aqui, quando o nome já começa com "Entrega", ele vai sozinho.
 */
export function rotuloDaEntrega(forma: string): string {
  const f = forma.trim()
  if (!f) return "Entrega"
  return /^entrega\b/i.test(f) ? f : `Entrega · ${f}`
}

/** A resposta do "comprar de novo": a frase pra tela e a sacola nova, se mudou. */
export type DeNovo = { ok: boolean; texto: string; carrinho: CarrinhoVisivel | null }
