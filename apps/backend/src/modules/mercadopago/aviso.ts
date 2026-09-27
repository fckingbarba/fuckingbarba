import { createHmac } from "node:crypto"
import { segredosIguais } from "../../lib/pagamento/comum"
import { centavosDe } from "./situacao"
import type { PagamentoMP } from "./client"

/**
 * O AVISO DO MERCADO PAGO — que chega DIRETO no Medusa, em
 * `/hooks/payment/mercadopago_mercadopago`, sem passar pela Edge Function do
 * Supabase (a do Pagar.me). Como os avisos da Frenet: o que a Edge Function
 * guarda, aqui a conciliação cobre (ela pergunta ao próprio Mercado Pago, de
 * 5 em 5 minutos), e ninguém precisa publicar função à mão pra ligar o Pix
 * reserva.
 *
 * ┌─ A ASSINATURA ─────────────────────────────────────────────────────────┐
 * │ O Mercado Pago assina cada aviso com a "assinatura secreta" da         │
 * │ aplicação (Suas integrações → Webhooks), que mora no Railway como      │
 * │ `MERCADOPAGO_WEBHOOK_SEGREDO`:                                          │
 * │                                                                         │
 * │   x-signature: ts=<momento>,v1=<HMAC-SHA256 em hexadecimal>            │
 * │   manifesto:   id:<data.id>;request-id:<x-request-id>;ts:<momento>;    │
 * │                                                                         │
 * │ O `data.id` vai em minúsculas, e o par sem valor sai do manifesto — é  │
 * │ o que o SDK oficial deles faz (`sdk-go`, `pkg/webhook`).               │
 * │                                                                         │
 * │ E a assinatura NÃO é a única trava: mesmo assinado, o aviso só diz     │
 * │ QUAL pagamento olhar. O status vem da API, com o token.                │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export function assinaturaConfere({
  assinatura,
  requisicao,
  idDoDado,
  segredo,
}: {
  assinatura: string
  requisicao: string
  idDoDado: string
  segredo: string
}): boolean {
  if (!segredo || !assinatura) return false
  const partes = new Map<string, string>()
  for (const parte of assinatura.split(",")) {
    const i = parte.indexOf("=")
    if (i <= 0) continue
    const chave = parte.slice(0, i).trim().toLowerCase()
    const valor = parte.slice(i + 1).trim()
    if (chave && valor) partes.set(chave, valor)
  }
  const ts = partes.get("ts")
  const v1 = partes.get("v1")
  if (!ts || !v1) return false

  const manifesto =
    [
      idDoDado ? `id:${idDoDado.toLowerCase()}` : "",
      requisicao ? `request-id:${requisicao}` : "",
      `ts:${ts}`,
    ]
      .filter(Boolean)
      .join(";") + ";"
  const calculada = createHmac("sha256", segredo).update(manifesto).digest("hex")
  return segredosIguais(calculada, v1.toLowerCase())
}

/** O id da sessão do Medusa — é ele que vai na referência de todo Pix da loja. */
export const CODIGO_DE_SESSAO = /^payses_[A-Za-z0-9]+$/

/**
 * O pagamento é DA LOJA — desta instalação, nascido de uma sessão do Medusa?
 * A conta é a mesma das vendas do Mercado Livre (ver o `client.ts`): o que
 * não passa aqui não é da loja, e nada acontece com ele.
 */
export function ehDaLoja(p: PagamentoMP, origem: string): boolean {
  return (
    CODIGO_DE_SESSAO.test(String(p.external_reference ?? "")) &&
    String(p.metadata?.origem ?? "") === origem
  )
}

/**
 * O que o aviso vira no Medusa: pagamento de uma sessão da loja, APROVADO,
 * vira pagamento registrado (`session_id` e o valor em reais). O resto — o
 * Pix gerado, o cancelado, o estornado — não muda nada pelo aviso: quem
 * fecha o que não virou venda é a conciliação.
 */
export function acaoDoAviso(
  p: PagamentoMP,
  origem: string
): { session_id: string; amount: number } | null {
  if (!ehDaLoja(p, origem)) return null
  if (String(p.status ?? "").toLowerCase() !== "approved") return null
  return {
    session_id: String(p.external_reference),
    amount: centavosDe(p.transaction_amount) / 100,
  }
}
