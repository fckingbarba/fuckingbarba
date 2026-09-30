import { after, NextResponse, type NextRequest } from "next/server"
import { COOKIE_CONSENTIMENTO, lerConsentimento } from "@/lib/consentimento"
import { crmLigado, ipDe, mandarAoCrm } from "@/lib/crm"

/**
 * /api/passos — os passos da visita pra Meta e pro TikTok pelo servidor
 * (`lib/pelo-servidor.ts` → Medusa, entrega 0231), pra contar também quem
 * tem o pixel bloqueado.
 *
 * Vale pra todo mundo que NÃO recusou os cookies (a resposta é lida aqui, do
 * cookie): as tags ligam antes da resposta desde a 0230, e isto é o mesmo
 * que elas mandam. Com o "não", nada sai.
 *
 * OS COOKIES DA META E DO TIKTOK são lidos aqui (o `_fbp`, o `_fbc`, o
 * `_ttp`), com o IP e o navegador. Pra quem teve o pixel da Meta bloqueado,
 * a loja cria os dois cookies da Meta do jeito que o pixel criaria (o
 * formato da documentação dela): o `_fbp` do navegador, e o `_fbc` de quem
 * chegou por um anúncio (`fbclid`) — é o que liga a visita ao clique.
 *
 * Responde 204 na hora e repassa DEPOIS (`after`). Fica de fora o recado
 * grande demais, o robô, o que vem de outro site e o preview da Vercel.
 */

const LIMITE = 32_000
const ROBO = /bot|crawl|spider|slurp|facebookexternalhit|preview|lighthouse/i
const NOVENTA_DIAS = 60 * 60 * 24 * 90
const CLIQUE = /^[A-Za-z0-9_.-]{8,500}$/

const nada = () => new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } })
const aleatorio = () => String(Math.floor(Math.random() * 9e9) + 1e9)

export async function POST(req: NextRequest) {
  if (!crmLigado() || ROBO.test(req.headers.get("user-agent") ?? "")) return nada()
  if (lerConsentimento(req.cookies.get(COOKIE_CONSENTIMENTO)?.value)?.resposta === "nao")
    return nada()
  // O `sendBeacon` e o `fetch` da própria loja dizem "same-origin"; de outro site, não.
  const site = req.headers.get("sec-fetch-site")
  if (site && site !== "same-origin") return nada()

  const texto = await req.text().catch(() => "")
  if (!texto || texto.length > LIMITE) return nada()
  let corpo: {
    passos?: unknown
    bloqueado?: { meta?: unknown }
    fbclid?: unknown
    ttclid?: unknown
  } | null
  try {
    corpo = JSON.parse(texto) as typeof corpo
  } catch {
    return nada()
  }
  if (!Array.isArray(corpo?.passos) || !corpo.passos.length) return nada()

  const resposta = nada()
  const opcoes = { sameSite: "lax", secure: true, path: "/", maxAge: NOVENTA_DIAS } as const
  let fbp = req.cookies.get("_fbp")?.value ?? null
  let fbc = req.cookies.get("_fbc")?.value ?? null
  if (corpo.bloqueado?.meta === true) {
    const agora = Date.now()
    if (!fbp) {
      fbp = `fb.1.${agora}.${aleatorio()}`
      resposta.cookies.set("_fbp", fbp, opcoes)
    }
    const fbclid =
      typeof corpo.fbclid === "string" && CLIQUE.test(corpo.fbclid) ? corpo.fbclid : null
    if (fbclid && !fbc?.endsWith(`.${fbclid}`)) {
      fbc = `fb.1.${agora}.${fbclid}`
      resposta.cookies.set("_fbc", fbc, opcoes)
    }
  }
  const ttclid = typeof corpo.ttclid === "string" && CLIQUE.test(corpo.ttclid) ? corpo.ttclid : null

  const ip = ipDe(req.headers)
  const quem = {
    ip,
    navegador: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    fbp,
    fbc,
    ttp: req.cookies.get("_ttp")?.value ?? null,
    ttclid,
  }
  after(() => mandarAoCrm("/store/anuncios/passos", { passos: corpo.passos, quem }, { ip }))
  return resposta
}
