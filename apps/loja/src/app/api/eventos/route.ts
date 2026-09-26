import { after, NextResponse, type NextRequest } from "next/server"
import { COOKIE_CARRINHO } from "@/lib/carrinho"
import { COOKIE_CONSENTIMENTO } from "@/lib/consentimento"
import {
  aceitouOsCookies,
  COOKIE_VISITANTE,
  crmLigado,
  ehVisitante,
  ipDe,
  mandarAoCrm,
  OPCOES_VISITANTE,
} from "@/lib/crm"
import { COOKIE_SESSAO } from "@/lib/sessao"

/**
 * /api/eventos — o CRM da loja (`lib/anotar.ts` → Medusa).
 *
 * POST: o que a pessoa fez na loja. Só com o sim dos cookies, lido AQUI, do
 * cookie da resposta: sem ele, nada sai e nenhum cookie nasce. Com ele, o
 * visitante é o cookie `fb_visitante` (criado no primeiro recado), e vão
 * junto o carrinho (o e-mail do checkout mora nele) e o token de quem está
 * logado — é assim que o Medusa sabe de quem é o navegador, sem o navegador
 * dizer nada. O corpo que vai é montado aqui: do navegador, só a lista de
 * eventos.
 *
 * DELETE: a pessoa disse não depois de ter dito sim. O cookie sai, e o
 * Medusa apaga o que anotou deste navegador (`/store/crm/esquecer`).
 *
 * Responde 204 na hora e repassa DEPOIS (`after`). Fica de fora, como na
 * telemetria: o recado grande demais, o robô, e o preview da Vercel.
 */

const LIMITE = 32_000
const ROBO = /bot|crawl|spider|slurp|facebookexternalhit|preview|lighthouse/i
const nada = () => new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } })

export async function POST(req: NextRequest) {
  if (!crmLigado() || ROBO.test(req.headers.get("user-agent") ?? "")) return nada()
  if (!aceitouOsCookies(req.cookies.get(COOKIE_CONSENTIMENTO)?.value)) return nada()

  const texto = await req.text().catch(() => "")
  if (!texto || texto.length > LIMITE) return nada()
  let eventos: unknown
  try {
    eventos = (JSON.parse(texto) as { eventos?: unknown } | null)?.eventos
  } catch {
    return nada()
  }
  if (!Array.isArray(eventos) || !eventos.length) return nada()

  const guardado = req.cookies.get(COOKIE_VISITANTE)?.value
  const visitante = ehVisitante(guardado) ? guardado : crypto.randomUUID()
  const resposta = nada()
  // A cada recado, mais um ano: quem volta sempre continua sendo o mesmo.
  resposta.cookies.set(COOKIE_VISITANTE, visitante, OPCOES_VISITANTE)

  const carrinho = req.cookies.get(COOKIE_CARRINHO)?.value ?? null
  const token = req.cookies.get(COOKIE_SESSAO)?.value ?? null
  const ip = ipDe(req.headers)
  after(() => mandarAoCrm("/store/crm/eventos", { visitante, carrinho, eventos }, { token, ip }))
  return resposta
}

export async function DELETE(req: NextRequest) {
  const visitante = req.cookies.get(COOKIE_VISITANTE)?.value
  const resposta = nada()
  if (!visitante) return resposta
  resposta.cookies.set(COOKIE_VISITANTE, "", { ...OPCOES_VISITANTE, maxAge: 0 })
  if (ehVisitante(visitante)) {
    const ip = ipDe(req.headers)
    after(() => mandarAoCrm("/store/crm/esquecer", { visitante }, { ip }))
  }
  return resposta
}
