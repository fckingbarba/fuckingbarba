/**
 * O QUE AS TELAS DE ENTRAR MOSTRAM — os formatos das respostas das ações.
 *
 * Arquivo separado pelo mesmo motivo do `checkout-visivel.ts`: um arquivo
 * `"use server"` só exporta função assíncrona, e o formulário precisa do
 * estado inicial; e os componentes de cliente não podem puxar nada
 * `server-only` pro grafo deles.
 */

import type { CarrinhoVisivel } from "./carrinho-visivel"
import { mascararCep } from "./cep-formato"
import type { EstadoDaEtapa } from "./checkout-visivel"
import type { Documento } from "./documento"

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

/* ── quem está na conta: os dados e os endereços ──────────────────────────── */

/**
 * Um endereço guardado na conta. Sem nome de quem recebe: é o dono da conta,
 * com o nome de "Meus dados" (ver `lugarParaMedusa`, em `endereco.ts`).
 */
export type EnderecoDaConta = {
  id: string
  /** "Casa", "Trabalho" — ou vazio, e a tela escreve "Endereço". */
  apelido: string
  /** O que o checkout abre preenchido. É o `is_default_shipping` do Medusa. */
  principal: boolean
  /** Só os oito dígitos. */
  cep: string
  rua: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export type ClienteVisivel = {
  id: string
  email: string
  nome: string
  sobrenome: string
  /** Como o checkout grava: `+55` e os dígitos. Vazio se nunca foi dado. */
  telefone: string
  documento: Documento | null
  /**
   * O CONSENTIMENTO, COM DATA: quando a pessoa marcou que quer ofertas por
   * e-mail e por WhatsApp (ISO), ou `null` se não quer. Nasce `null` —
   * consentimento não vem marcado (LGPD) —, e a data é a do primeiro "sim",
   * que é o que se mostra se um dia alguém perguntar desde quando.
   */
  ofertas: { email: string | null; whatsapp: string | null }
  /** O principal primeiro; depois, do mais antigo pro mais novo. */
  enderecos: EnderecoDaConta[]
}

/**
 * Até quantos endereços uma conta guarda. Quem compra pra casa, trabalho e
 * pra mãe tem três; vinte é folga — e é o teto que impede uma conta de
 * encher o banco de endereço, que a API aceitaria sem fim.
 */
export const LIMITE_DE_ENDERECOS = 20

/** A resposta de salvar um endereço: a do checkout, e o id de quem foi salvo (pro foco). */
export type EstadoDoEndereco = EstadoDaEtapa & { id?: string }

export const ENDERECO_INICIAL: EstadoDoEndereco = { ok: false, erros: {}, mensagem: "", rodada: 0 }

/**
 * A resposta de um formulário da conta que não passou — com o que foi
 * digitado de volta (o React dá reset no `<form action>`; ver `valores` em
 * `checkout-visivel.ts`). Mora aqui, e não nas ações, pela regra do Next:
 * arquivo `"use server"` só exporta função assíncrona.
 */
export function naoSalvou<E extends EstadoDaEtapa>(
  anterior: E,
  erros: Record<string, string>,
  mensagem = "",
  fd?: FormData
): E {
  const valores: Record<string, string> = {}
  for (const [chave, valor] of fd?.entries() ?? []) {
    if (typeof valor === "string") valores[chave] = valor
  }
  return { ok: false, erros, mensagem, rodada: anterior.rodada + 1, valores } as E
}

/** A resposta dos botões do cartão (tornar principal, excluir). */
export type RespostaDaConta = { ok: boolean; mensagem: string }

/**
 * As três linhas de um endereço, como o obrigado e o pedido escrevem: rua e
 * número; complemento e bairro; cidade/UF · CEP.
 */
export function linhasDoEndereco(e: EnderecoDaConta): string[] {
  const meio = [e.complemento, e.bairro].filter(Boolean).join(" — ")
  return [
    [e.rua, e.numero].filter(Boolean).join(", "),
    ...(meio ? [meio] : []),
    `${e.cidade}/${e.uf} · ${mascararCep(e.cep)}`,
  ]
}

/** Os dados que o checkout pede estão todos aqui? É o que decide "Completar dados". */
export const dadosCompletos = (c: ClienteVisivel): boolean =>
  Boolean(c.nome && c.telefone && c.documento)

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
