import { createClient } from "npm:@supabase/supabase-js@2"

/**
 * Cliente com a service_role: enxerga o schema `loja`, que está fechado pra
 * anon/authenticated (RLS sem política). SUPABASE_URL e
 * SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente em toda Edge Function.
 */
export function clienteLoja() {
  const url = Deno.env.get("SUPABASE_URL")
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !chave) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes")
  return createClient(url, chave, {
    db: { schema: "loja" },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Comparação em tempo constante — evita vazar o segredo pelo tempo de resposta. */
export function iguais(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let diff = 0
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i]
  return diff === 0
}

export function json(corpo: unknown, status = 200, cabecalhos: HeadersInit = {}): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cabecalhos },
  })
}
