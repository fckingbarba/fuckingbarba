import { clienteLoja, iguais, json } from "../_shared/supabase.ts"

/**
 * webhook-pagamento — porta de entrada dos webhooks do Pagar.me.
 *
 *   Pagar.me ──POST──▶ esta função ──▶ loja.eventos_webhook ──▶ Medusa
 *
 * Por que não direto no Medusa: se o Medusa estiver reiniciando (deploy) ou
 * fora, o evento fica salvo aqui e é reenviado; sem isso, pedido pago fica
 * pendente. A função responde 200 rápido — o Pagar.me reenvia em falha, e é
 * bom que reenvie, mas nunca por nossa lentidão.
 *
 * Segurança: o Pagar.me protege webhook com autenticação básica configurada
 * no painel dele (usuário/senha). Conferimos aqui e, além disso, o Medusa
 * confirma o status do pedido na API do Pagar.me antes de mudar qualquer
 * coisa — o payload é aviso, a API é a verdade.
 *
 * Variáveis (supabase secrets set …):
 *   PAGARME_WEBHOOK_USER, PAGARME_WEBHOOK_PASS  — os mesmos do painel do Pagar.me
 *   MEDUSA_WEBHOOK_URL                          — ex.: https://api.SEUDOMINIO.com.br/hooks/payment/pagarme_pagarme
 *   MEDUSA_WEBHOOK_SEGREDO                      — header x-webhook-segredo que o Medusa exige (fase 4)
 *
 * Fase 4 liga o provider do Pagar.me no Medusa e o job do worker que reenvia
 * os pendentes (processado_em is null) lendo direto de loja.eventos_webhook —
 * o Medusa está no mesmo Postgres.
 */

const ORIGEM = "pagarme" as const

function autenticado(req: Request): boolean {
  const usuario = Deno.env.get("PAGARME_WEBHOOK_USER") ?? ""
  const senha = Deno.env.get("PAGARME_WEBHOOK_PASS") ?? ""
  if (!usuario || !senha) return false
  const recebido = req.headers.get("authorization") ?? ""
  const esperado = `Basic ${btoa(`${usuario}:${senha}`)}`
  return iguais(recebido, esperado)
}

async function repassaAoMedusa(
  corpoBruto: string,
  cabecalhos: Headers
): Promise<{ ok: boolean; erro?: string }> {
  const url = Deno.env.get("MEDUSA_WEBHOOK_URL")
  if (!url) return { ok: false, erro: "MEDUSA_WEBHOOK_URL não configurada (fase 4)" }
  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": cabecalhos.get("content-type") ?? "application/json",
        "x-webhook-segredo": Deno.env.get("MEDUSA_WEBHOOK_SEGREDO") ?? "",
        "x-webhook-origem": ORIGEM,
      },
      body: corpoBruto,
      signal: AbortSignal.timeout(8_000),
    })
    if (!resposta.ok) return { ok: false, erro: `Medusa respondeu ${resposta.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405)
  if (!autenticado(req)) return json({ erro: "não autorizado" }, 401)

  // Corpo bruto: é o que vai pro Medusa (assinatura/validação lá usa o texto original).
  const corpoBruto = await req.text()
  if (corpoBruto.length > 512_000) return json({ erro: "payload grande demais" }, 413)

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(corpoBruto)
  } catch {
    return json({ erro: "JSON inválido" }, 400)
  }

  // Pagar.me v5: { id: "hook_…", type: "order.paid", data: {…} }
  const idExterno = typeof payload.id === "string" ? payload.id : null
  const evento = typeof payload.type === "string" ? payload.type : null

  const supabase = clienteLoja()
  const { data: linha, error } = await supabase
    .from("eventos_webhook")
    .insert({
      origem: ORIGEM,
      id_externo: idExterno,
      evento,
      payload,
      cabecalhos: {
        "content-type": req.headers.get("content-type"),
        "user-agent": req.headers.get("user-agent"),
      },
    })
    .select("id")
    .single()

  // 23505 = já recebemos este evento (o Pagar.me reenviou). Idempotente: 200 e pronto.
  if (error?.code === "23505") return json({ ok: true, duplicado: true })
  if (error) {
    console.error("[webhook-pagamento] falha ao gravar", error)
    return json({ erro: "falha ao gravar; tente de novo" }, 500) // o Pagar.me reenvia
  }

  const repasse = await repassaAoMedusa(corpoBruto, req.headers)
  await supabase
    .from("eventos_webhook")
    .update(
      repasse.ok
        ? { processado_em: new Date().toISOString(), tentativas: 1, erro: null }
        : { tentativas: 1, erro: repasse.erro }
    )
    .eq("id", linha.id)

  // Mesmo sem repasse o evento está salvo: 200 pro Pagar.me, o job reenvia.
  return json({ ok: true, id: linha.id, repassado: repasse.ok })
})
