import { NextResponse, type NextRequest } from "next/server"
import { COOKIE_SESSAO } from "@/lib/sessao"

/**
 * GET /conta/sair — apaga a sessão e manda pro "entrar".
 *
 * Existe por causa do token que o Medusa recusou (venceu, ou foi forjado):
 * a página que descobre isso não pode apagar cookie — só ação e rota podem
 * —, então ela redireciona pra cá. O botão "Sair" usa a ação `sair`, que é
 * POST; esta rota só completa o serviço de quem já não tinha sessão válida.
 */
export function GET(req: NextRequest) {
  const destino = new URL("/conta/entrar", req.nextUrl)
  if (req.nextUrl.searchParams.get("motivo") === "expirou") {
    destino.searchParams.set("motivo", "expirou")
  }
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
