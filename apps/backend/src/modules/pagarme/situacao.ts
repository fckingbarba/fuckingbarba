import { PaymentSessionStatus } from "@medusajs/framework/utils"
import {
  devolvidoNaCobranca,
  type CobrancaPagarme,
  type PedidoPagarme,
  type TransacaoPagarme,
} from "./client"
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
  /**
   * Cartão autorizado, com o valor só RESERVADO: esperando a análise de
   * fraude (ou, aprovada, a cobrança) — pode virar pago ou recusado. Ver
   * "A ANÁLISE ANTES DA COBRANÇA", lá embaixo.
   */
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
  if (analiseDoCartao(t) === "reprovada") return RECUSAS.antifraude
  if (t?.status === "not_authorized") return RECUSAS.banco
  return RECUSAS.fora
}

/* ── a análise antes da cobrança ──────────────────────────────────────────── */

/**
 * A ANÁLISE ANTES DA COBRANÇA — o cartão é AUTORIZADO na criação do pedido
 * (`auth_only`, no `pedido.ts`) e só é COBRADO com a análise de fraude
 * aprovada.
 *
 * ┌─ POR QUE ──────────────────────────────────────────────────────────────┐
 * │ O Pagar.me analisa a compra DEPOIS de o banco autorizar. Com           │
 * │ `auth_and_capture`, o cartão era cobrado junto com a autorização, e    │
 * │ quando a análise reprovava, segundos depois, o Pagar.me devolvia: o    │
 * │ valor aparecia e sumia da fatura de quem tinha comprado de verdade (as │
 * │ três compras de 22/09). Agora o valor fica só RESERVADO no limite do   │
 * │ cartão enquanto a análise pensa; reprovada, a reserva é desfeita, e    │
 * │ nada entra na fatura.                                                  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * QUEM COBRA é o provedor, no `authorizePayment`, sempre perguntando aqui:
 * no checkout, que espera uns segundos pela análise (costuma responder em
 * segundos); e depois, pelo `processPaymentWorkflow`, quando chega o aviso
 * `charge.antifraud_approved` ou a conciliação passa (5 em 5 minutos).
 *
 * SEM RESPOSTA NENHUMA DA ANÁLISE (nem "pendente"): pode ser a resposta que
 * ainda não chegou — e aí cobrar seria o problema de antes —, ou compra que o
 * Pagar.me não analisa. Espera 10 minutos (a análise mais lenta que se viu
 * levou um) e então cobra, com uma linha no log: sem isso, a venda morreria
 * quando a autorização vencesse, em 5 dias.
 *
 * "manual" é uma PESSOA do Pagar.me analisando, em até 48 horas úteis: espera
 * — cabe nos 5 dias da autorização.
 */

export type Analise = "aprovada" | "reprovada" | "pendente" | "manual" | "sem-resposta"

export function analiseDoCartao(t: TransacaoPagarme | undefined): Analise {
  const s = String(t?.antifraud_response?.status ?? "").toLowerCase()
  if (s === "approved") return "aprovada"
  if (s === "reproved") return "reprovada"
  if (s === "manual") return "manual"
  if (s === "pending") return "pendente"
  return "sem-resposta"
}

/** A transação que o banco autorizou e ninguém cobrou ainda. */
export const AUTORIZADA = "authorized_pending_capture"

/** Sem resposta nenhuma da análise, quanto esperar antes de cobrar assim mesmo. */
export const SEM_ANALISE_COBRA_DEPOIS_MS = 10 * 60 * 1000

/**
 * A transação de cartão que já tirou dinheiro da conta de alguém — mesmo que
 * depois tenha devolvido. A que só reservou (`authorized_pending_capture`,
 * `voided`) nunca tirou.
 */
const TIROU_DINHEIRO = new Set([
  "captured",
  "partial_capture",
  "paid",
  "refunded",
  "partial_refunded",
  "chargedback",
  "waiting_cancellation",
  "pending_refund",
  "error_on_refunding",
])

function cobrouOCartao(c: CobrancaPagarme | undefined): boolean {
  return (
    Number(c?.paid_amount ?? 0) > 0 ||
    TIROU_DINHEIRO.has(String(c?.last_transaction?.status ?? "").toLowerCase())
  )
}

export type ParaCobrar =
  | {
      cobrar: true
      cobranca: string
      /** Centavos: a cobrança inteira. */
      valor: number
      porque: "aprovada" | "sem-analise"
    }
  | {
      cobrar: false
      porque:
        "nao-e-cartao" | "nao-autorizada" | "pendente" | "manual" | "reprovada" | "sem-resposta"
    }

/**
 * DÁ PRA COBRAR ESTE CARTÃO AGORA? Só com a transação autorizada e não
 * cobrada, e a análise aprovada (ou calada há 10 minutos — ver acima).
 * Pedido já pago, cancelado ou recusado não se cobra de novo.
 */
export function podeCobrar(pedido: PedidoPagarme, agora = new Date()): ParaCobrar {
  const c = pedido.charges?.[0]
  if (!c || String(c.payment_method ?? "").toLowerCase() !== "credit_card") {
    return { cobrar: false, porque: "nao-e-cartao" }
  }
  const t = c.last_transaction
  const fechada = ["paid", "canceled", "failed", "refunded"]
  if (
    String(t?.status ?? "").toLowerCase() !== AUTORIZADA ||
    fechada.includes(String(c.status ?? "").toLowerCase()) ||
    fechada.includes(String(pedido.status ?? "").toLowerCase())
  ) {
    return { cobrar: false, porque: "nao-autorizada" }
  }

  const analise = analiseDoCartao(t)
  const valor = Number(c.amount ?? pedido.amount)
  if (analise === "aprovada") return { cobrar: true, cobranca: c.id, valor, porque: "aprovada" }
  if (analise === "sem-resposta") {
    const autorizada = Date.parse(c.created_at ?? pedido.created_at ?? "")
    return Number.isFinite(autorizada) &&
      agora.getTime() - autorizada >= SEM_ANALISE_COBRA_DEPOIS_MS
      ? { cobrar: true, cobranca: c.id, valor, porque: "sem-analise" }
      : { cobrar: false, porque: "sem-resposta" }
  }
  return { cobrar: false, porque: analise }
}

/**
 * A RESERVA QUE PRECISA SER DESFEITA: a análise reprovou e a transação
 * continua autorizada. O Pagar.me desfaz sozinho — mas, se não desfizer, a
 * reserva prenderia o limite de quem tentou comprar por 5 dias. Quem vê isto
 * manda o cancelamento também (é o mesmo `DELETE`, e numa autorização ele só
 * solta a reserva).
 */
export function reservaPraDesfazer(pedido: PedidoPagarme): string | null {
  const c = pedido.charges?.[0]
  const t = c?.last_transaction
  if (!c || String(c.payment_method ?? "").toLowerCase() !== "credit_card") return null
  if (String(t?.status ?? "").toLowerCase() !== AUTORIZADA) return null
  return analiseDoCartao(t) === "reprovada" ? c.id : null
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
    /*
      O cartão que só foi RESERVADO não devolve nada: a reserva desfeita não
      é estorno. Sem isto, o `canceled_amount` de uma autorização desfeita
      viraria "estornado", e o e-mail de cancelamento e a conta diriam "o
      valor está voltando" pra quem nunca foi cobrado.
    */
    estornado: forma === "cartao" && !cobrouOCartao(cobranca) ? 0 : devolvidoNaCobranca(cobranca),
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

  // A análise reprovou: é recusa, com a frase que diz o que fazer — e não um
  // cancelamento qualquer, esteja a cobrança já cancelada ou ainda pendente
  // (a reserva que falta desfazer é o `reservaPraDesfazer`).
  if (forma === "cartao" && analiseDoCartao(t) === "reprovada") {
    return {
      status: PaymentSessionStatus.ERROR,
      estado: { ...base, situacao: "recusado", recusa: RECUSAS.antifraude },
    }
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

  // Pendente. No Pix é o QR esperando; no cartão é a reserva esperando a
  // análise — ou, aprovada, a cobrança (`podeCobrar`).
  return {
    status: PaymentSessionStatus.PENDING_AUTHORIZATION,
    estado: { ...base, situacao: forma === "pix" ? "aguardando" : "analise" },
  }
}
