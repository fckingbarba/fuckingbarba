import "server-only"
import { cookies, headers } from "next/headers"
import { after } from "next/server"
import { COOKIE_CONSENTIMENTO, lerConsentimento } from "@/lib/consentimento"

/**
 * O CRM DA LOJA, DO LADO DO SERVIDOR — o cookie do visitante e o recado
 * assinado pro Medusa (`POST /store/crm/eventos`). Quem usa: a rota que
 * recebe o recado do navegador (`app/api/eventos`) e as ações que anotam do
 * servidor (a newsletter, a entrada na conta).
 *
 * ┌─ SÓ COM O "ACEITAR" ───────────────────────────────────────────────────┐
 * │ Sem o sim da faixa de cookies, nada daqui sai, e o cookie do visitante │
 * │ nem é criado. O navegador já não manda sem o sim (`lib/rastrear.ts`);  │
 * │ o servidor confere de novo, porque a rota é pública.                   │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O VISITANTE é um código aleatório deste navegador (`fb_visitante`), num
 * cookie `httpOnly`: o JavaScript da página não lê, e quem manda qual
 * visitante é a loja, nunca o navegador. Dura um ano, renovado a cada
 * recado, como a resposta sobre os cookies.
 */

export const COOKIE_VISITANTE = "fb_visitante"

const UM_ANO = 60 * 60 * 24 * 365

export const OPCOES_VISITANTE = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: UM_ANO,
} as const

const VISITANTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const ehVisitante = (v: unknown): v is string => typeof v === "string" && VISITANTE.test(v)

/** A pessoa disse sim à faixa de cookies (a versão de agora). */
export const aceitouOsCookies = (valor: string | null | undefined) =>
  lerConsentimento(valor)?.resposta === "sim"

/** O IP de quem visitou: o Medusa conta o limite por ele (e não pela Vercel inteira). */
export function ipDe(h: Headers): string | null {
  const ip = h.get("x-real-ip") || (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim()
  return ip ? ip.slice(0, 64) : null
}

/**
 * O CRM funciona aqui? Precisa do Medusa e do segredo que assina — e nunca
 * no preview da Vercel, que falaria com o Medusa de produção (como a
 * telemetria).
 */
export const crmLigado = () =>
  Boolean(
    process.env.MEDUSA_BACKEND_URL &&
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY &&
    process.env.REVALIDAR_SEGREDO
  ) && process.env.VERCEL_ENV !== "preview"

/**
 * O recado assinado pro Medusa. Nunca lança. `token`: o do cliente logado
 * (o Medusa confere e liga o navegador à conta).
 */
export async function mandarAoCrm(
  caminho: "/store/crm/eventos" | "/store/crm/esquecer",
  corpo: object,
  { token, ip }: { token?: string | null; ip: string | null }
): Promise<void> {
  const base = process.env.MEDUSA_BACKEND_URL
  const chave = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  const segredo = process.env.REVALIDAR_SEGREDO
  if (!base || !chave || !segredo || !crmLigado()) return
  try {
    await fetch(new URL(caminho, base), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-publishable-api-key": chave,
        "x-loja-segredo": segredo,
        ...(ip ? { "x-cliente-ip": ip } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // o CRM nunca atrapalha a loja: o recado que não foi se perde
  }
}

/**
 * O QUE SÓ O SERVIDOR SABE — a inscrição na newsletter (com o e-mail que
 * acabou de entrar na lista) e a entrada na conta (com o token novo, que o
 * Medusa confere). Vai DEPOIS da resposta (`after`): a pessoa não espera
 * nada disto. Só com o sim dos cookies; sem o cookie do visitante ainda (o
 * sim veio agora), ele nasce aqui.
 */
export async function anotarNoServidor(
  evento: { nome: "newsletter"; email: string } | { nome: "conta_entrou"; token: string }
): Promise<void> {
  const jar = await cookies()
  if (!crmLigado() || !aceitouOsCookies(jar.get(COOKIE_CONSENTIMENTO)?.value)) return
  let visitante = jar.get(COOKIE_VISITANTE)?.value
  if (!ehVisitante(visitante)) {
    visitante = crypto.randomUUID()
    jar.set(COOKIE_VISITANTE, visitante, OPCOES_VISITANTE)
  }
  const h = await headers()
  const ip = ipDe(h)
  let pagina = "/"
  try {
    pagina = new URL(h.get("referer") ?? "").pathname || "/"
  } catch {
    // sem a página de onde veio: fica a home
  }
  const corpo = {
    visitante,
    identificacao:
      evento.nome === "newsletter"
        ? { como: "newsletter", email: evento.email }
        : { como: "conta" },
    eventos: [{ nome: evento.nome, pagina, ha: 0 }],
  }
  const token = evento.nome === "conta_entrou" ? evento.token : null
  after(() => mandarAoCrm("/store/crm/eventos", corpo, { token, ip }))
}
