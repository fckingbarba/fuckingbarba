import type { ItemDoCarrinho } from "./carrinho-visivel"

/**
 * O QUE O CHECKOUT MOSTRA
 *
 * Sem import de nada que toque servidor — igual ao `carrinho-visivel.ts`, e
 * pela mesma razão: as etapas são componentes de cliente, e qualquer coisa
 * `server-only` ou com `"use cache"` que entre no grafo delas quebra o build
 * com um erro que não aponta pra cá.
 *
 * O formato é o que a tela precisa desenhar, não o que o Medusa devolve. Todo
 * número aqui saiu de uma conta do Medusa — nada nesta camada soma, desconta
 * ou arredonda.
 */

export type { ItemDoCarrinho }

/** As quatro etapas, na ordem. */
export const ETAPAS = ["contato", "entrega", "frete", "pagamento"] as const
export type Etapa = (typeof ETAPAS)[number]

export type EnderecoVisivel = {
  nome: string
  sobrenome: string
  telefone: string
  cep: string
  rua: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export const ENDERECO_VAZIO: EnderecoVisivel = {
  nome: "",
  sobrenome: "",
  telefone: "",
  cep: "",
  rua: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
}

export type OpcaoDeFrete = {
  id: string
  nome: string
  /** "5 a 10 dias úteis" — vem do tipo da opção, cadastrado no Medusa. */
  prazo: string
  /** Em reais. Zero é frete grátis, e a tela escreve isso com todas as letras. */
  preco: number
}

export type ProvedorDePagamento = {
  id: string
  nome: string
  descricao: string
  /**
   * `true` quando o provedor não cobra nada de verdade — hoje só o
   * `pp_system_default`. A tela precisa saber pra não escrever "pagamento
   * aprovado" sobre um pagamento que não existiu.
   */
  simbolico: boolean
}

export type CheckoutVisivel = {
  id: string
  regiaoId: string
  itens: ItemDoCarrinho[]
  unidades: number
  subtotal: number
  desconto: number
  /** `null` enquanto nenhum método foi escolhido — diferente de zero, que é grátis. */
  frete: number | null
  total: number
  email: string
  documento: string
  entrega: EnderecoVisivel
  /** id da opção de frete já pendurada no carrinho. */
  freteEscolhido: string | null
}

/**
 * Em que etapa o checkout está, olhando só pro que o carrinho já tem.
 *
 * A etapa sai do ESTADO, não de um contador na tela. Quem recarrega a página
 * no meio, volta do e-mail no dia seguinte ou abre o link em outra aba cai
 * exatamente onde parou, porque a resposta é a mesma pergunta feita ao mesmo
 * carrinho — e não um passo guardado em algum lugar que pode divergir dele.
 */
export function etapaDoCarrinho(c: CheckoutVisivel): Etapa {
  if (!c.email || !c.documento) return "contato"
  if (!c.entrega.cep || !c.entrega.rua || !c.entrega.numero) return "entrega"
  if (!c.freteEscolhido) return "frete"
  return "pagamento"
}

/** Quantas etapas já foram vencidas — pra barra de progresso e pro `aria-label`. */
export function indiceDaEtapa(etapa: Etapa): number {
  return ETAPAS.indexOf(etapa)
}

/* ── o que as ações devolvem ──────────────────────────────────────────────── */

export type ErrosDoFormulario = Record<string, string>

export type EstadoDaEtapa = {
  ok: boolean
  /** Por campo, pra mensagem ficar embaixo do campo certo. */
  erros: ErrosDoFormulario
  /** Erro que não é de nenhum campo: rede fora, Medusa recusando. */
  mensagem: string
  /**
   * Sobe a cada resposta. Existe porque o Next preserva o estado de
   * `useActionState` ao navegar pra fora e voltar: sem um contador, uma etapa
   * não distingue "a resposta que acabou de chegar" de "o erro que ficou na
   * tela desde ontem".
   */
  rodada: number
  /**
   * O que a pessoa tinha digitado, devolvido tal e qual.
   *
   * O React DÁ RESET no formulário depois que a ação roda — é comportamento
   * de `<form action={…}>`, não bug. Sem isto, quem erra um dígito do CPF vê
   * os outros cinco campos esvaziarem junto, e é aí que se desiste da compra.
   * Os campos leem daqui antes de ler do carrinho, então o reset devolve o
   * que estava na tela.
   */
  valores?: Record<string, string>
}

/**
 * Mora aqui, e não junto das ações, por uma regra do Next: arquivo com
 * `"use server"` só pode exportar função assíncrona. Constante exportada de lá
 * quebra o build.
 */
export const ESTADO_INICIAL: EstadoDaEtapa = { ok: false, erros: {}, mensagem: "", rodada: 0 }
