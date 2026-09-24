import { NextResponse, type NextRequest } from "next/server"
import { COOKIE_SESSAO } from "@/lib/sessao"

/**
 * GET /sair — apaga a sessão e manda pro "entrar".
 *
 * Existe pra casca que descobriu que o Medusa não aceita mais o token —
 * venceu, ou a pessoa saiu da equipe — e não pode apagar cookie enquanto
 * desenha a página: ela redireciona pra cá com o `?motivo=`, e o "entrar"
 * explica. O botão "Sair" é a ação `sair` (`lib/acoes/sair.ts`), que é POST
 * e tem a proteção de origem das ações do Next.
 *
 * O token continua válido no Medusa até vencer (é assim que JWT funciona),
 * mas ele só existia neste cookie. E o Medusa relê o membro a cada pedido:
 * quem foi tirado da equipe não entra com ele de qualquer jeito.
 */
const MOTIVOS = new Set(["fora", "expirou"])

function sair(req: NextRequest, motivo: string | null) {
  const destino = new URL("/entrar", req.nextUrl)
  destino.searchParams.set("saiu", motivo && MOTIVOS.has(motivo) ? motivo : "1")
  const resposta = NextResponse.redirect(destino)
  resposta.cookies.set(COOKIE_SESSAO, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
  return resposta
}

export function GET(req: NextRequest) {
  return sair(req, req.nextUrl.searchParams.get("motivo"))
}
