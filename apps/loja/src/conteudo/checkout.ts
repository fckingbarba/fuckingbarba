import type { Configuracoes } from "@/lib/configuracoes"
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

/** O que as duas faixas precisam saber do atendimento — ver `lib/configuracoes.ts`. */
type Atendimento = Pick<Configuracoes["atendimento"], "whatsapp" | "prazoDePostagem">

/**
 * Onde a mão hesita, no passo do pagamento: até três frases curtas.
 *
 * Só o que a loja cumpre, e é por isso que duas delas dependem do admin:
 *
 * - "Compra segura": o pagamento é do Pagar.me, e o cartão vai do navegador
 *   direto pra lá, sem passar pelo servidor da loja. Vale sempre;
 * - a POSTAGEM, com o prazo que a loja configurou (admin → Configurações →
 *   prazo de postagem). Era "Envio imediato", escrito aqui, enquanto o pé do
 *   resumo dizia "até 1 dia útil" — as duas na mesma tela, discordando, e
 *   nenhuma lida de onde a loja diz o prazo de verdade;
 * - "Suporte no WhatsApp", só com um número pra atender. Sem ele, a frase
 *   prometia um canal que não existe.
 *
 * Sem prazo nem WhatsApp configurados, fica só a primeira — em vez de uma
 * promessa de mentira no lugar das outras duas.
 */
export function garantiasDoPagamento({ whatsapp, prazoDePostagem }: Atendimento): Garantia[] {
  return [
    { icone: "cadeado", texto: "Compra segura" },
    ...(prazoDePostagem
      ? [{ icone: "caminhao" as const, texto: `Postagem em ${prazoDePostagem}` }]
      : []),
    ...(whatsapp ? [{ icone: "whatsapp" as const, texto: "Suporte no WhatsApp" }] : []),
  ]
}

/**
 * O pé do resumo: o prazo de postagem, quando existe. Sem ele, nada — o
 * resumo não inventa um.
 *
 * O "7 dias pra trocar ou devolver" que morava aqui saiu por escolha da loja
 * (22/09/2026): o checkout não fala mais de desistência. O direito continua
 * publicado onde a lei pede que ele esteja à mão (Decreto 7.962/2013, art.
 * 5º) — a página `/trocas`, no rodapé de toda página, e as Dúvidas.
 */
export function confiancaDoResumo({ prazoDePostagem }: Atendimento): Garantia[] {
  return prazoDePostagem ? [{ icone: "caminhao", texto: `Postagem em ${prazoDePostagem}` }] : []
}

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
