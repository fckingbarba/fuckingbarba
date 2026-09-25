import { after, NextResponse, type NextRequest } from "next/server"

/**
 * POST /api/telemetria — o recado do navegador (`lib/telemetria.ts`): a
 * velocidade da visita, a página que não existe, o erro na tela. Repassa ao
 * Medusa (`/store/telemetria`), assinado com o `REVALIDAR_SEGREDO` e o IP de
 * quem visitou, que é como o Medusa conta o limite por pessoa.
 *
 * Responde 204 na hora e repassa DEPOIS (`after`): quem visitou não espera
 * nada, e nada daqui aparece pra ele — nem erro. Fica de fora: o recado
 * grande demais, o robô (o Google também roda JavaScript), e o preview da
 * Vercel, que falaria com o Medusa de produção.
 */

const LIMITE = 8_000
const ROBO = /bot|crawl|spider|slurp|facebookexternalhit|preview|lighthouse/i
const nada = () => new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } })

export async function POST(req: NextRequest) {
  const base = process.env.MEDUSA_BACKEND_URL
  const chave = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  const segredo = process.env.REVALIDAR_SEGREDO
  if (!base || !chave || !segredo || process.env.VERCEL_ENV === "preview") return nada()
  if (ROBO.test(req.headers.get("user-agent") ?? "")) return nada()

  const corpo = await req.text().catch(() => "")
  if (!corpo || corpo.length > LIMITE) return nada()

  const ip =
    req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim()
  after(() =>
    fetch(new URL("/store/telemetria", base), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-publishable-api-key": chave,
        "x-loja-segredo": segredo,
        ...(ip ? { "x-cliente-ip": ip.slice(0, 64) } : {}),
      },
      body: corpo,
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined)
  )
  return nada()
}
