import "server-only"
import { cookies, headers } from "next/headers"
import { COOKIE_ENTRANDO, COOKIE_SESSAO, destinoSeguro, type Destino } from "./sessao"

/**
 * A MINHA CONTA DO LADO DO SERVIDOR — cookies e as conversas com o Medusa.
 *
 * ┌─ O TOKEN NUNCA VAI PRO NAVEGADOR ──────────────────────────────────────┐
 * │ Ele mora num cookie `httpOnly`: o JavaScript da página não lê, e um    │
 * │ script de terceiro que um dia entre na loja também não. Quem fala com  │
 * │ o Medusa em nome da pessoa é o servidor da loja, com o token no        │
 * │ cabeçalho — igual ao carrinho, que também só guarda o id no cookie.    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * FETCH DIRETO, E NÃO O SDK, nestas chamadas: o SDK transforma toda resposta
 * de erro numa exceção com só a mensagem, e aqui o corpo do erro importa — o
 * "espera" do código vem com quantos segundos faltam.
 */

const TRINTA_DIAS = 60 * 60 * 24 * 30

/** O mesmo prazo do token (`jwtExpiresIn` no `medusa-config.ts`). */
export const OPCOES_SESSAO = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: TRINTA_DIAS,
} as const

/**
 * Entre a tela do e-mail e a do código: 15 minutos (o código vale 10), e só
 * nas rotas da conta. Leva o e-mail, pra onde voltar e a hora do envio — é
 * da hora que sai a contagem do "reenviar".
 */
export const OPCOES_ENTRANDO = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/conta",
  maxAge: 15 * 60,
} as const

export type Entrando = { email: string; para: Destino; enviadoEm: number }

export async function lerEntrando(): Promise<Entrando | null> {
  const bruto = (await cookies()).get(COOKIE_ENTRANDO)?.value
  if (!bruto) return null
  try {
    const dado = JSON.parse(bruto) as Partial<Entrando>
    if (typeof dado.email !== "string" || !dado.email) return null
    return {
      email: dado.email,
      para: destinoSeguro(dado.para),
      enviadoEm: typeof dado.enviadoEm === "number" ? dado.enviadoEm : 0,
    }
  } catch {
    return null
  }
}

/**
 * Quantos segundos faltam pro "reenviar" liberar, contados da hora do envio
 * de verdade (que mora no cookie) — recarregar a tela não zera a espera.
 */
export function segundosParaReenviar(
  entrando: Entrando,
  espera: number,
  agora = Date.now()
): number {
  const passados = Math.floor((agora - entrando.enviadoEm) / 1000)
  return Math.min(espera, Math.max(0, espera - passados))
}

export async function lerSessao(): Promise<string | null> {
  return (await cookies()).get(COOKIE_SESSAO)?.value ?? null
}

/* ── a conversa com o Medusa ──────────────────────────────────────────────── */

type Resposta = { status: number; corpo: Record<string, unknown> }

const TEMPO_LIMITE_MS = 10_000

/**
 * Uma chamada ao Medusa que NUNCA lança: rede fora, tempo esgotado ou
 * resposta que não é JSON viram `status: 0`. Quem chama decide a frase.
 */
export async function medusa(
  caminho: string,
  {
    metodo = "POST",
    corpo,
    token,
    extras = {},
  }: {
    metodo?: "GET" | "POST"
    corpo?: unknown
    token?: string
    extras?: Record<string, string>
  } = {}
): Promise<Resposta> {
  const base = process.env.MEDUSA_BACKEND_URL
  const chave = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  if (!base || !chave) return { status: 0, corpo: {} }

  const cabecalhos: Record<string, string> = {
    accept: "application/json",
    "x-publishable-api-key": chave,
    ...extras,
  }
  if (corpo !== undefined) cabecalhos["content-type"] = "application/json"
  if (token) cabecalhos.authorization = `Bearer ${token}`

  try {
    const r = await fetch(new URL(caminho, base), {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    })
    const json = (await r.json().catch(() => ({}))) as Record<string, unknown>
    return { status: r.status, corpo: json && typeof json === "object" ? json : {} }
  } catch (e) {
    console.warn(`[conta] ${caminho}: ${e instanceof Error ? e.message : String(e)}`)
    return { status: 0, corpo: {} }
  }
}

/**
 * O IP de quem está na loja, pra o Medusa contar os pedidos de código por
 * pessoa, e não pela Vercel inteira. Vai assinado com o segredo que os dois
 * lados já dividem — ver `backend/src/lib/quem-pede.ts`.
 *
 * `x-real-ip` primeiro: é o que a Vercel escreve com o IP de quem conectou.
 * O primeiro item do `x-forwarded-for` fica de reserva — é o que o próprio
 * navegador poderia inventar, se algum proxy no caminho só acrescentasse.
 */
export async function cabecalhosDeQuemPede(): Promise<Record<string, string>> {
  const h = await headers()
  const ip = h.get("x-real-ip") || (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || ""
  const segredo = process.env.REVALIDAR_SEGREDO
  return ip && segredo ? { "x-cliente-ip": ip.slice(0, 64), "x-loja-segredo": segredo } : {}
}

/** O pedido de código, com a assinatura de quem pede. */
export async function pedirCodigoAoMedusa(email: string): Promise<Resposta> {
  return medusa("/store/conta/codigo", { corpo: { email }, extras: await cabecalhosDeQuemPede() })
}

/* ── quem está logado ─────────────────────────────────────────────────────── */

export type ClienteVisivel = {
  id: string
  email: string
  nome: string
  sobrenome: string
}

export type LeituraDoCliente =
  | { estado: "ok"; cliente: ClienteVisivel }
  | { estado: "sem-sessao" }
  /** O Medusa recusou o token: venceu, foi forjado, ou o cliente sumiu. */
  | { estado: "expirou" }
  /** O Medusa não respondeu. Não é motivo pra tirar ninguém da conta. */
  | { estado: "fora-do-ar" }

export async function lerCliente(): Promise<LeituraDoCliente> {
  const token = await lerSessao()
  if (!token) return { estado: "sem-sessao" }

  const r = await medusa("/store/customers/me?fields=id,email,first_name,last_name", {
    metodo: "GET",
    token,
  })
  if (r.status === 401 || r.status === 404) return { estado: "expirou" }
  const c = r.corpo.customer as
    | { id?: string; email?: string; first_name?: string | null; last_name?: string | null }
    | undefined
  if (r.status !== 200 || !c?.id) return { estado: "fora-do-ar" }

  return {
    estado: "ok",
    cliente: {
      id: c.id,
      email: c.email ?? "",
      nome: c.first_name ?? "",
      sobrenome: c.last_name ?? "",
    },
  }
}
