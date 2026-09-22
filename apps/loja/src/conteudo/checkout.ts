import { PARCELAS_SEM_JUROS } from "@/lib/site"

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

export type Garantia = {
  icone: "escudo" | "cadeado" | "caminhao" | "relogio" | "whatsapp"
  texto: string
}

/**
 * Onde a mão hesita, no passo do pagamento. Três frases curtas, e nenhuma
 * repetindo o pé do resumo (`CONFIANCA`) — na mesma tela, dizer duas vezes a
 * mesma coisa não tranquiliza ninguém, só ocupa espaço.
 *
 * Só o que a loja cumpre:
 *
 * - o pagamento é do Pagar.me, e o cartão vai do navegador direto pra lá —
 *   ele não passa pelo servidor da loja (ver o passo 3);
 * - o pedido é postado em até 1 dia útil, que é o que o site promete;
 * - o WhatsApp da loja responde de verdade, e está no rodapé de toda página.
 *
 * Nada de "compra 100% segura" nem selo inventado de certificadora: promessa
 * que a loja não cumpre é propaganda enganosa, e quem descobre é o cliente.
 */
export const GARANTIAS: Garantia[] = [
  { icone: "cadeado", texto: "Compra segura" },
  { icone: "caminhao", texto: "Envio imediato" },
  { icone: "whatsapp", texto: "Suporte no WhatsApp" },
]

/** As duas linhas do pé do resumo. */
export const CONFIANCA: Garantia[] = [
  { icone: "caminhao", texto: "Enviamos em até 1 dia útil" },
  { icone: "escudo", texto: "7 dias pra trocar ou devolver" },
]

/* ── as formas de pagamento ───────────────────────────────────────────────── */

export type FormaDePagamento = {
  id: "pix" | "cartao"
  nome: string
  descricao: string
  /** Selo amarelo em cima da linha. Vazio, some. */
  selo?: string
}

/**
 * Pix e cartão — as duas que o Pagar.me cobra na loja (`pp_pagarme_pagarme`).
 *
 * O protótipo tinha boleto também, e ele ficou de fora do lançamento por
 * escolha: boleto segura o estoque por dias esperando uma compensação que
 * pode nunca vir, e o Pix faz o mesmo papel (pagar sem cartão) em segundos.
 * Voltar com ele é decisão comercial, não só uma linha aqui — o provedor do
 * backend também teria que saber gerar boleto.
 *
 * Sem desconto no Pix, também de propósito: o valor das duas linhas é o
 * total do Medusa, igual. Desconto que existisse só aqui seria um preço que
 * o Pagar.me não cobraria.
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
    descricao: `Em até ${PARCELAS_SEM_JUROS}x sem juros.`,
  },
]

export const BANDEIRAS = ["Visa", "Mastercard", "Elo", "Amex", "Hipercard"] as const
