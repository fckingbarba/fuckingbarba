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

/* ── onde está o pacote ───────────────────────────────────────────────────── */

/*
  ESTE VOCABULÁRIO TEM UM GÊMEO no backend: `apps/backend/src/lib/envios/situacao.ts`,
  o núcleo dos envios. São as palavras dele, venha o aviso de qual parceiro
  vier (a Frenet hoje) — a loja nunca sabe quem levou a notícia. Quem
  acrescentar uma palavra lá, acrescenta aqui; palavra que a loja não
  conhecer vira "sem situação" (e o evento, texto da transportadora).
*/

export const SITUACOES_DO_ENVIO = [
  "aguardando",
  "postado",
  "em_transito",
  "saiu_para_entrega",
  "aguardando_retirada",
  "entregue",
  "devolvido",
  "extraviado",
] as const
export type SituacaoDoEnvio = (typeof SITUACOES_DO_ENVIO)[number]

export const ALERTAS_DO_ENVIO = ["atrasado", "nao_entregue"] as const
export type AlertaDoEnvio = (typeof ALERTAS_DO_ENVIO)[number]

export const TIPOS_DE_EVENTO = [
  "postado",
  "em_transito",
  "saiu_para_entrega",
  "aguardando_retirada",
  "entregue",
  "atrasado",
  "nao_entregue",
  "devolvido",
  "extraviado",
  "informativo",
] as const
export type TipoDeEvento = (typeof TIPOS_DE_EVENTO)[number]

/** O título do rastreio: onde o pacote está agora. */
export const ROTULO_DO_ENVIO: Record<SituacaoDoEnvio, string> = {
  aguardando: "Aguardando postagem",
  postado: "Postado",
  em_transito: "Em trânsito",
  saiu_para_entrega: "Saiu pra entrega",
  aguardando_retirada: "Esperando retirada",
  entregue: "Entregue",
  devolvido: "Voltando pra loja",
  extraviado: "Extraviado",
}

/**
 * A frase embaixo do título — o que isso quer dizer pra quem está
 * esperando. Nos dois finais ruins, a promessa é a de sempre: a gente
 * chama. E-mail automático pra esses a loja não manda (ver o núcleo).
 */
export const FRASE_DO_ENVIO: Record<SituacaoDoEnvio, string> = {
  aguardando: "A etiqueta está pronta; a encomenda sai daqui em breve.",
  postado: "A encomenda saiu daqui e já está com a transportadora.",
  em_transito: "A caminho da sua cidade.",
  saiu_para_entrega: "Chega hoje — precisa ter alguém no endereço pra receber.",
  aguardando_retirada:
    "Não deu pra entregar no endereço: a encomenda está esperando você na agência que o rastreio indica, e fica lá só por poucos dias.",
  entregue: "A encomenda chegou.",
  devolvido:
    "A entrega não deu certo e a encomenda está voltando pra loja. A gente vai te chamar pra combinar.",
  extraviado: "A transportadora perdeu a encomenda. A gente já está resolvendo — e vai te chamar.",
}

/** O alerta por cima da situação: não muda onde o pacote está, mas é o que a pessoa precisa ler primeiro. */
export const ROTULO_DO_ALERTA: Record<AlertaDoEnvio, string> = {
  atrasado: "Atrasado",
  nao_entregue: "Tentativa de entrega",
}

export const FRASE_DO_ALERTA: Record<AlertaDoEnvio, string> = {
  atrasado: "A transportadora avisou atraso. A gente está de olho.",
  nao_entregue: "Tentaram entregar e não conseguiram — o rastreio diz o que a transportadora fez.",
}

/** O título de cada evento da linha do tempo. `informativo` usa o texto da transportadora. */
export const ROTULO_DO_EVENTO: Record<Exclude<TipoDeEvento, "informativo">, string> = {
  postado: "Postado",
  em_transito: "Em trânsito",
  saiu_para_entrega: "Saiu pra entrega",
  aguardando_retirada: "Esperando retirada",
  entregue: "Entregue",
  devolvido: "Devolvido",
  extraviado: "Extraviado",
  atrasado: "Atraso",
  nao_entregue: "Tentativa de entrega",
}
