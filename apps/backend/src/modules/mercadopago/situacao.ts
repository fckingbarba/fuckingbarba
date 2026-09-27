import { PaymentSessionStatus } from "@medusajs/framework/utils"
import type { EntradaDaLoja } from "../../lib/pagamento/entrada"
import { estadoNovo, lerEstado as lerEstadoNaChave, type Estado } from "../../lib/pagamento/estado"
import { MERCADOPAGO } from "../../lib/pagamento/parceiros"
import { RECUSA } from "../../lib/pagamento/recusas"
import type { PagamentoMP } from "./client"

/**
 * O QUE O MERCADO PAGO RESPONDEU, NA LÍNGUA DO MEDUSA — e na da tela.
 *
 * O mesmo desenho do Pagar.me (`modules/pagarme/situacao.ts`, com a caixa
 * de por que o estado é gravado SEMPRE INTEIRO): cada resposta vira um
 * status de sessão pro Medusa e o estado comum (`lib/pagamento/estado.ts`),
 * gravado em `data.mercadopago`. A loja, os e-mails e o painel leem esse
 * estado sem saber quem cobrou.
 */

/** Onde o Mercado Pago grava o estado na sessão (`data.mercadopago`). */
export const CHAVE = MERCADOPAGO.chave
/** Onde a loja manda a entrada — a mesma do Pagar.me. */
export const CHAVE_DA_ENTRADA = "entrada"

export { estadoNovo }

/** Como gravar: o estado inteiro, e a entrada (ou `null`, que a apaga). */
export function gravar(estado: Estado, entrada: EntradaDaLoja | null = null) {
  return { [CHAVE]: estado, [CHAVE_DA_ENTRADA]: entrada }
}

/** O estado gravado numa sessão do Mercado Pago, ou null se não há um em `data.mercadopago`. */
export function lerEstado(data: Record<string, unknown> | null | undefined): Estado | null {
  return lerEstadoNaChave(data, CHAVE)
}

/**
 * As frases de todo parceiro (`lib/pagamento/recusas.ts`); aqui só se recusa
 * Pix. Sem a do "incerto": a dúvida "gerou ou não?" de um Pix não cobra
 * ninguém (o QR não chegou a quem compra), e a frase é a do Pix.
 */
export const RECUSAS = {
  pix: RECUSA.pix,
  fora: RECUSA.fora,
}

/** Reais (como a API devolve) pra centavos (como o estado guarda). */
export const centavosDe = (reais: unknown) => {
  const n = Number(reais ?? 0)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export type Traduzido = { status: PaymentSessionStatus; estado: Estado }

/**
 * Um pagamento do Mercado Pago em status + estado.
 *
 *   pending (e os outros de espera) → `pending_authorization`, "aguardando",
 *     com o QR: o pedido fecha esperando o Pix;
 *   approved → `captured`, "pago" — com o que já voltou em `estornado`,
 *     porque o estorno PARCIAL deixa o pagamento "approved";
 *   refunded / charged_back → `canceled`, "estornado": voltou tudo;
 *   cancelled → `canceled`, "cancelado" — o Pix que venceu (`expired`) e o
 *     que a loja cancelou;
 *   rejected → `error`, "falhou", com a frase do Pix.
 *
 * Status que a loja não conhece é espera: antes o pedido parado e um aviso
 * na conciliação do que um pagamento de verdade dado como perdido.
 */
export function traduzir(p: PagamentoMP): Traduzido {
  const status = String(p.status ?? "").toLowerCase()
  const t = p.point_of_interaction?.transaction_data
  const base: Estado = {
    forma: "pix",
    situacao: "aguardando",
    valor: centavosDe(p.transaction_amount),
    pedido: String(p.id),
    cobranca: String(p.id),
    parcelas: 1,
    pix: t?.qr_code
      ? {
          copiaECola: t.qr_code,
          imagem: t.qr_code_base64 ? `data:image/png;base64,${t.qr_code_base64}` : "",
          expiraEm: p.date_of_expiration ?? "",
        }
      : null,
    cartao: null,
    recusa: null,
    estornado: centavosDe(p.transaction_amount_refunded),
  }

  if (status === "refunded" || status === "charged_back") {
    return {
      status: PaymentSessionStatus.CANCELED,
      estado: { ...base, situacao: "estornado", estornado: Math.max(base.estornado, base.valor) },
    }
  }
  if (status === "approved") {
    return { status: PaymentSessionStatus.CAPTURED, estado: { ...base, situacao: "pago" } }
  }
  if (status === "cancelled") {
    return { status: PaymentSessionStatus.CANCELED, estado: { ...base, situacao: "cancelado" } }
  }
  if (status === "rejected") {
    return {
      status: PaymentSessionStatus.ERROR,
      estado: { ...base, situacao: "falhou", recusa: RECUSAS.pix },
    }
  }
  // pending, in_process… e o que a loja não conhece: esperando (ver acima).
  return { status: PaymentSessionStatus.PENDING_AUTHORIZATION, estado: base }
}
