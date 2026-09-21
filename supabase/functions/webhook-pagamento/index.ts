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
 * ┌─ QUEM PODE CHAMAR ─────────────────────────────────────────────────────┐
 * │ O painel do Pagar.me tem autenticação OPCIONAL no cadastro do webhook, │
 * │ e a documentação não diz de que tipo ela é. Então a função aceita as   │
 * │ duas formas que funcionam sem código do lado deles, e basta UMA estar  │
 * │ configurada:                                                           │
 * │                                                                         │
 * │ • Basic — PAGARME_WEBHOOK_USER e PAGARME_WEBHOOK_PASS iguais aos do    │
 * │   painel, se o painel oferecer usuário e senha;                        │
 * │ • chave na URL — PAGARME_WEBHOOK_CHAVE, e a URL cadastrada no painel   │
 * │   termina em `?chave=<o mesmo valor>`. É o que sobra quando o painel   │
 * │   não manda cabeçalho nenhum.                                          │
 * │                                                                         │
 * │ Sem nenhuma das duas configurada, ninguém passa — a porta falha        │
 * │ FECHADA. E nada disto é a única trava: o Medusa exige o                │
 * │ `x-webhook-segredo` que esta função põe, e mesmo com ele só usa o      │
 * │ aviso pra saber QUAL pedido olhar — o status vem da API do Pagar.me,   │
 * │ com a chave secreta. O payload é aviso; a API é a verdade.             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Variáveis (supabase secrets set …):
 *   PAGARME_WEBHOOK_USER, PAGARME_WEBHOOK_PASS  — se o painel autenticar com usuário e senha
 *   PAGARME_WEBHOOK_CHAVE                       — se não: openssl rand -hex 24, e ?chave=… na URL
 *   MEDUSA_WEBHOOK_URL                          — ex.: https://api.SEUDOMINIO.com.br/hooks/payment/pagarme_pagarme
 *   MEDUSA_WEBHOOK_SEGREDO                      — header x-webhook-segredo; IGUAL ao do Railway
 *
 * E SE ESTA FUNÇÃO NÃO REPASSAR? A conciliação do worker do Medusa (a cada 5
 * minutos) não depende desta tabela: ela pergunta ao próprio Pagar.me por
 * toda sessão pendente — o que cobre também o aviso que nunca chegou aqui.
 * `loja.eventos_webhook` fica como registro: auditoria, e reenvio à mão se
 * um dia for preciso.
 */

const ORIGEM = "pagarme" as const

function autenticado(req: Request): boolean {
  const usuario = Deno.env.get("PAGARME_WEBHOOK_USER") ?? ""
  const senha = Deno.env.get("PAGARME_WEBHOOK_PASS") ?? ""
  if (usuario && senha) {
    const recebido = req.headers.get("authorization") ?? ""
    if (iguais(recebido, `Basic ${btoa(`${usuario}:${senha}`)}`)) return true
  }

  // A chave vem na query string. A URL inteira NUNCA vai pra log nem pra
  // tabela por causa disso: quem lê o log leria a chave.
  const chave = Deno.env.get("PAGARME_WEBHOOK_CHAVE") ?? ""
  if (chave) {
    const recebida = new URL(req.url).searchParams.get("chave") ?? ""
    if (iguais(recebida, chave)) return true
  }

  return false
}

async function repassaAoMedusa(
  corpoBruto: string,
  cabecalhos: Headers
): Promise<{ ok: boolean; erro?: string }> {
  const url = Deno.env.get("MEDUSA_WEBHOOK_URL")
  if (!url) return { ok: false, erro: "MEDUSA_WEBHOOK_URL não configurada" }
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

  // Mesmo sem repasse, 200: o evento está salvo, e a conciliação do Medusa
  // acha o pagamento perguntando ao Pagar.me. Um erro aqui não adiantaria —
  // o reenvio dele cairia no "duplicado" lá em cima e não repassaria de novo.
  return json({ ok: true, id: linha.id, repassado: repasse.ok })
})
