/**
 * O QUE O CHECKOUT DIZ
 *
 * Texto e configuração; nenhum número de dinheiro. Preço, desconto e frete
 * saem do Medusa — aqui mora só o que é redação e o que é escolha comercial.
 */

/* ── order bump ───────────────────────────────────────────────────────────── */

/**
 * A caixinha colada no botão de pagar.
 *
 * `handle` e `desconto` PRECISAM BATER com `apps/backend/src/scripts/promocoes.ts`:
 * lá o desconto existe de verdade, como promoção com código, e é ele que o
 * Medusa cobra. O número aqui é só pra tela poder escrever "20% off" antes de
 * a pessoa marcar — o "de" e o "por" em reais vêm do carrinho depois que o
 * Medusa aplicou.
 *
 * `codigo` é a promoção que o checkout aplica quando a caixinha é marcada, e
 * remove quando é desmarcada.
 *
 * Pra desligar o bump, é só `null`.
 */
export const BUMP = {
  handle: "oleo-para-barba",
  codigo: "BUMP-OLEO",
  desconto: 20,
  texto: "Quem leva tratamento costuma levar o óleo junto — só nessa tela, com desconto.",
} as const

/* ── prova social ─────────────────────────────────────────────────────────── */

export type Depoimento = {
  texto: string
  quem: string
}

/**
 * OS DEPOIMENTOS SÃO REAIS, e é por isso que são só dois.
 *
 * O protótipo trazia um terceiro com o texto "[Cole aqui o texto exato de um
 * cliente real, sem reescrever.]" — aquilo era um lembrete, não um
 * depoimento, e não subiu. Quando houver um terceiro relato de verdade, ele
 * entra aqui do jeito que a pessoa escreveu.
 *
 * NÃO RETOQUE O TEXTO. Depoimento reescrito deixa de ser depoimento e vira
 * propaganda — e propaganda que se apresenta como opinião de cliente é
 * publicidade enganosa (CDC art. 37).
 */
export const DEPOIMENTOS: Depoimento[] = [
  {
    texto:
      "Usei por 1 mês e não vi muita coisa, mas continuei e no terceiro mês começou a aparecer fio novo. Valeu a paciência.",
    quem: "André B. · São Paulo, SP",
  },
  {
    texto: "Produto bom, cheiro suave. Não é milagroso, mas ajuda sim se usar direito.",
    quem: "Rodrigo A. · Curitiba, PR",
  },
]

/**
 * A NOTA MÉDIA — fora até existir.
 *
 * O protótipo escrevia "4,7 com base em todas as avaliações" na faixa do
 * passo 3. Esse número precisa ser a média real das avaliações reais; até as
 * avaliações da Nuvemshop virem pra cá, a faixa mostra as outras duas
 * garantias e nenhuma nota.
 *
 * Quando vier: `{ media: 4.7, quantas: 312 }` — e a frase passa a dizer de
 * quantas avaliações, que é o que dá pra checar.
 */
export const NOTA: { media: number; quantas: number } | null = null

/* ── a faixa de confiança do passo do pagamento ───────────────────────────── */

export type Garantia = { icone: "escudo" | "cadeado" | "caminhao" | "relogio"; texto: string }

/**
 * Onde a mão hesita. Só o que a loja cumpre:
 *
 * - a garantia está escrita na política de trocas;
 * - o cadeado é o TLS do site, que existe;
 * - o prazo de postagem é o que o pedido promete.
 *
 * Nada de "compra 100% segura" nem selo inventado de certificadora.
 */
export const GARANTIAS: Garantia[] = [
  { icone: "escudo", texto: "Barba na cara ou sua grana de volta" },
  { icone: "cadeado", texto: "Conexão criptografada" },
  { icone: "relogio", texto: "7 dias pra trocar ou devolver" },
]

/** As duas linhas do pé do resumo. */
export const CONFIANCA: Garantia[] = [
  { icone: "caminhao", texto: "Enviamos em até 1 dia útil" },
  { icone: "escudo", texto: "7 dias pra trocar ou devolver" },
]

/* ── as três formas de pagamento do protótipo ─────────────────────────────── */

export type FormaDePagamento = {
  id: "pix" | "cartao" | "boleto"
  nome: string
  descricao: string
  /** Selo amarelo em cima da linha. Vazio, some. */
  selo?: string
}

/**
 * O DESENHO das três formas. Quais delas a pessoa pode de fato escolher é
 * outra conversa, e quem responde é o Medusa: `lib/checkout.ts` só deixa
 * aparecer a forma que tem provedor de pagamento ligado.
 *
 * Enquanto o Pagar.me não entrar, nenhuma delas cobra — e a tela diz isso.
 */
export const FORMAS: FormaDePagamento[] = [
  {
    id: "pix",
    nome: "Pix",
    descricao: "QR code na próxima tela. Confirmação em segundos.",
  },
  {
    id: "cartao",
    nome: "Cartão de crédito",
    descricao: "Em até 3x sem juros.",
  },
  {
    id: "boleto",
    nome: "Boleto",
    descricao: "Vence em 3 dias. O pedido sai após a compensação.",
  },
]

export const BANDEIRAS = ["Visa", "Mastercard", "Elo", "Amex", "Hipercard"] as const
