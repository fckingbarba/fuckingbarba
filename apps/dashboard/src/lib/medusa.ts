import "server-only"
import { cookies, headers } from "next/headers"
import { COOKIE_SESSAO } from "./sessao"

/**
 * A CONVERSA COM O MEDUSA — só do servidor do painel.
 *
 * ┌─ O NAVEGADOR NUNCA FALA COM O MEDUSA ──────────────────────────────────┐
 * │ O token da equipe mora num cookie `httpOnly`: o JavaScript da página   │
 * │ não lê. Quem chama o Medusa é este servidor, com o token no cabeçalho  │
 * │ e a ASSINATURA do painel (`REVALIDAR_SEGREDO`, o mesmo segredo do      │
 * │ Railway e da loja) — as rotas `/dashboard/*` recusam sem ela. Um token │
 * │ que vazasse não abriria nada de fora.                                  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * FETCH DIRETO, E NÃO O SDK: o corpo do erro importa ("espera" vem com os
 * segundos que faltam; `sem_acesso`, `ultimo_dono`…), e o SDK transforma
 * todo erro numa exceção só com a mensagem.
 */

export type Resposta = { status: number; corpo: Record<string, unknown> }

const TEMPO_LIMITE_MS = 10_000

/**
 * Uma chamada que NUNCA lança: rede fora, tempo esgotado ou resposta que não
 * é JSON viram `status: 0`. Quem chama decide a frase.
 *
 * `token: "sessao"` usa o do cookie — é o caso de quase toda tela.
 * `tempoLimite`: o das ações que falam com o Bling ou o Pagar.me, que
 * podem demorar mais que uma leitura.
 */
export async function medusa(
  caminho: string,
  {
    metodo = "POST",
    corpo,
    token,
    tempoLimite = TEMPO_LIMITE_MS,
  }: {
    metodo?: "GET" | "POST"
    corpo?: unknown
    token?: string | "sessao"
    tempoLimite?: number
  } = {}
): Promise<Resposta> {
  // Cookie e cabeçalhos primeiro: é o que diz ao Next que a tela é de quem
  // pediu (dinâmica) — e ele nem tenta montar a página no build.
  const bearer = token === "sessao" ? (await cookies()).get(COOKIE_SESSAO)?.value : token
  const ip = await ipDeQuemPede()

  const base = process.env.MEDUSA_BACKEND_URL
  const segredo = process.env.REVALIDAR_SEGREDO
  if (!base || !segredo) {
    console.error("[painel] falta MEDUSA_BACKEND_URL ou REVALIDAR_SEGREDO (ver .env.example)")
    return { status: 0, corpo: {} }
  }

  const cabecalhos: Record<string, string> = {
    accept: "application/json",
    "x-loja-segredo": segredo,
  }
  if (ip) cabecalhos["x-cliente-ip"] = ip
  if (corpo !== undefined) cabecalhos["content-type"] = "application/json"
  if (bearer) cabecalhos.authorization = `Bearer ${bearer}`

  try {
    const r = await fetch(new URL(caminho, base), {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
      signal: AbortSignal.timeout(tempoLimite),
    })
    const json = (await r.json().catch(() => ({}))) as Record<string, unknown>
    return { status: r.status, corpo: json && typeof json === "object" ? json : {} }
  } catch (e) {
    console.warn(`[painel] ${caminho}: ${e instanceof Error ? e.message : String(e)}`)
    return { status: 0, corpo: {} }
  }
}

/**
 * O IP de quem está no painel, pro Medusa contar os pedidos de código por
 * pessoa, e não pela Vercel inteira. `x-real-ip` primeiro: é o que a Vercel
 * escreve com o IP de quem conectou (o mesmo da loja, em `lib/conta.ts`).
 */
async function ipDeQuemPede(): Promise<string> {
  try {
    const h = await headers()
    return (
      h.get("x-real-ip") ||
      (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
      ""
    ).slice(0, 64)
  } catch {
    // Fora de um pedido (não acontece hoje): sem IP, o Medusa conta pela conexão.
    return ""
  }
}
