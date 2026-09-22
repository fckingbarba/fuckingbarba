import { PaymentSessionStatus } from "@medusajs/framework/utils"
import { devolvidoNaCobranca, type PedidoPagarme, type TransacaoPagarme } from "./client"
import type { EntradaDaLoja, Forma } from "./pedido"

/**
 * O QUE O PAGAR.ME RESPONDEU, NA LÍNGUA DO MEDUSA — e na da tela.
 *
 * Cada resposta vira duas coisas:
 *
 *   1. um STATUS de sessão pro Medusa decidir o que fazer com o carrinho:
 *      `captured` fecha o pedido já pago; `pending_authorization` fecha o
 *      pedido aguardando pagamento (o Pix que ainda não foi pago, o cartão
 *      em análise); `error` NÃO fecha — o carrinho continua aberto e a
 *      pessoa pode tentar de novo;
 *
 *   2. o ESTADO que fica gravado na sessão, e que a tela de obrigado lê: o
 *      QR do Pix, o final do cartão, a frase de recusa.
 *
 * ┌─ O MEDUSA MISTURA, NÃO SUBSTITUI — e isso mudou o desenho inteiro ─────┐
 * │ Toda gravação no `data` de uma sessão é MESCLADA, em profundidade, com │
 * │ o que já estava lá (é o `mergeObjectProperties` do MikroORM). E o que  │
 * │ estava lá primeiro é o que a LOJA mandou — ou quem chamou a API        │
 * │ pública de sessão de pagamento direto, com o corpo que quis.           │
 * │                                                                         │
 * │ Consequência medida, não imaginada: um `pagarme.pedido` mandado de     │
 * │ fora sobrevivia à gravação do provedor. Se o provedor confiasse nele,  │
 * │ bastaria apontar pro pedido PAGO de outra pessoa pra levar a compra    │
 * │ de graça. Por isso, três regras:                                       │
 * │                                                                         │
 * │ • o estado é gravado SEMPRE INTEIRO, com `null` explícito no que não   │
 * │   existe — `null` sobrescreve na mistura; campo ausente, não;          │
 * │ • o pedido do Pagar.me é achado pelo CÓDIGO (o id da sessão, que o     │
 * │   Medusa passa por fora dos dados), nunca pelo que está gravado;       │
 * │ • o que a loja manda mora em outra chave (`entrada`), e é zerada com   │
 * │   `null` quando o pedido nasce — é o que tira CPF, telefone e endereço │
 * │   da sessão, que é legível por quem tem o id do carrinho.              │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

export type Situacao =
  /** Sessão aberta, nada enviado ao Pagar.me ainda. */
  | "nova"
  /** Pix gerado, esperando o pagamento. */
  | "aguardando"
  /** Cartão em análise de fraude — pode virar pago ou recusado. */
  | "analise"
  | "pago"
  /** Cartão não autorizado (banco ou antifraude). */
  | "recusado"
  /** Não deu pra criar a cobrança (Pix fora do ar, dado inválido). */
  | "falhou"
  | "cancelado"
  | "estornado"
  /**
   * A criação sumiu no caminho (rede, 5xx) e a gente NÃO SABE se o Pagar.me
   * cobrou. A conciliação procura pelo código e estorna o que achar.
   */
  | "incerto"

/** O que fica em `data.pagarme`. Sempre com todas as chaves — ver a caixa acima. */
export type Estado = {
  forma: Forma
  situacao: Situacao
  /** Centavos. Antes de autorizar, o da sessão; depois, o do pedido no Pagar.me. */
  valor: number
  /** `or_…` — o pedido no Pagar.me. */
  pedido: string | null
  /** `ch_…` — é nela que se cancela e estorna. */
  cobranca: string | null
  parcelas: number
  pix: { copiaECola: string; imagem: string; expiraEm: string } | null
  cartao: { bandeira: string; final: string } | null
  /** O que dizer pra quem teve o pagamento recusado. Frase pronta. */
  recusa: string | null
  /** Centavos já devolvidos. */
  estornado: number
}

export const CHAVE = "pagarme"
export const CHAVE_DA_ENTRADA = "entrada"

export function estadoNovo(forma: Forma, valor: number, parcelas: number): Estado {
  return {
    forma,
    situacao: "nova",
    valor,
    pedido: null,
    cobranca: null,
    parcelas,
    pix: null,
    cartao: null,
    recusa: null,
    estornado: 0,
  }
}

/** Como gravar: o estado inteiro, e a entrada (ou `null`, que a apaga). */
export function gravar(estado: Estado, entrada: EntradaDaLoja | null = null) {
  return { [CHAVE]: estado, [CHAVE_DA_ENTRADA]: entrada }
}

/** O estado gravado na sessão, ou null se a sessão não é nossa. */
export function lerEstado(data: Record<string, unknown> | null | undefined): Estado | null {
  const d = data?.[CHAVE]
  if (!d || typeof d !== "object") return null
  const e = d as Partial<Estado>
  if (e.forma !== "pix" && e.forma !== "cartao") return null
  const texto = (v: unknown) => (typeof v === "string" && v ? v : null)
  return {
    forma: e.forma,
    situacao: (e.situacao ?? "nova") as Situacao,
    valor: Number(e.valor ?? 0),
    pedido: texto(e.pedido),
    cobranca: texto(e.cobranca),
    parcelas: Number(e.parcelas ?? 1),
    pix: e.pix && typeof e.pix === "object" ? e.pix : null,
    cartao: e.cartao && typeof e.cartao === "object" ? e.cartao : null,
    recusa: texto(e.recusa),
    estornado: Number(e.estornado ?? 0),
  }
}

/* ── as frases ────────────────────────────────────────────────────────────── */

/**
 * O que a tela diz quando não deu. Cada uma diz O QUE FAZER — "transação não
 * autorizada, código 51" não ajuda ninguém a terminar a compra.
 *
 * E nenhuma diz "saldo insuficiente" ou "cartão bloqueado", mesmo quando o
 * banco conta: quem lê a tela pode não ser o dono do cartão.
 */
export const RECUSAS = {
  antifraude:
    "O pagamento não passou na análise de segurança. Tenta outro cartão ou paga no Pix — nada foi cobrado.",
  banco:
    "O banco do cartão não autorizou o pagamento. Confere os dados, tenta outro cartão ou paga no Pix — nada foi cobrado.",
  dados:
    "Não consegui validar o cartão. Confere número, validade e CVV e tenta de novo — nada foi cobrado.",
  fora: "O pagamento não pôde ser processado agora, e nada foi cobrado. Tenta de novo em instantes ou paga no Pix.",
  pix: "Não consegui gerar o Pix agora, e nada foi cobrado. Tenta de novo em instantes.",
  incerto:
    "O Pagar.me não respondeu a tempo. Se aparecer alguma cobrança, ela é estornada sozinha — tenta de novo em instantes.",
} as const

function motivoDaRecusa(forma: Forma, t: TransacaoPagarme | undefined): string {
  if (forma === "pix") return RECUSAS.pix
  if (t?.antifraud_response?.status === "reproved") return RECUSAS.antifraude
  if (t?.status === "not_authorized") return RECUSAS.banco
  return RECUSAS.fora
}

/* ── a tradução ───────────────────────────────────────────────────────────── */

export type Traduzido = { status: PaymentSessionStatus; estado: Estado }

/**
 * Um pedido do Pagar.me em status + estado.
 *
 * Olha o PEDIDO e a COBRANÇA, e não um só: o pedido é o resumo, mas quem
 * muda primeiro é a cobrança (um pedido `pending` pode ter a cobrança já
 * `paid` por um instante). Pago em qualquer um dos dois é pago.
 */
export function traduzir(pedido: PedidoPagarme, forma: Forma, parcelasPedidas = 1): Traduzido {
  const cobranca = pedido.charges?.[0]
  const t = cobranca?.last_transaction
  const pedidoStatus = String(pedido.status ?? "").toLowerCase()
  const cobrancaStatus = String(cobranca?.status ?? "").toLowerCase()

  const base: Estado = {
    forma,
    situacao: "aguardando",
    valor: Number(pedido.amount ?? 0),
    pedido: pedido.id,
    cobranca: cobranca?.id ?? null,
    parcelas: forma === "cartao" ? Number(t?.installments ?? parcelasPedidas) : 1,
    pix:
      forma === "pix" && t?.qr_code
        ? { copiaECola: t.qr_code, imagem: t.qr_code_url ?? "", expiraEm: t.expires_at ?? "" }
        : null,
    cartao:
      forma === "cartao" && t?.card?.last_four_digits
        ? { bandeira: t.card.brand ?? "", final: t.card.last_four_digits }
        : null,
    recusa: null,
    estornado: devolvidoNaCobranca(cobranca),
  }

  // Estorno ANTES de pago: a cobrança estornada pode deixar o pedido com o
  // status de pago que ele tinha, e ler só o pedido registraria de novo um
  // dinheiro que já voltou.
  if (cobrancaStatus === "refunded") {
    return { status: PaymentSessionStatus.CANCELED, estado: { ...base, situacao: "estornado" } }
  }

  if (pedidoStatus === "paid" || cobrancaStatus === "paid") {
    return { status: PaymentSessionStatus.CAPTURED, estado: { ...base, situacao: "pago" } }
  }

  if (pedidoStatus === "canceled" || cobrancaStatus === "canceled") {
    return { status: PaymentSessionStatus.CANCELED, estado: { ...base, situacao: "cancelado" } }
  }

  if (pedidoStatus === "failed" || cobrancaStatus === "failed") {
    return {
      status: PaymentSessionStatus.ERROR,
      estado: {
        ...base,
        situacao: forma === "pix" ? "falhou" : "recusado",
        recusa: motivoDaRecusa(forma, t),
      },
    }
  }

  // Pendente. No Pix é o QR esperando; no cartão é a antifraude pensando.
  return {
    status: PaymentSessionStatus.PENDING_AUTHORIZATION,
    estado: { ...base, situacao: forma === "pix" ? "aguardando" : "analise" },
  }
}
