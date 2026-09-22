import { NextResponse, type NextRequest } from "next/server"
import { COOKIE_CARRINHO } from "@/lib/carrinho"
import { carrinhoEhDaConta } from "@/lib/conta"
import { COOKIE_SESSAO } from "@/lib/sessao"

/**
 * GET /conta/sair — apaga a sessão e manda pro "entrar".
 *
 * Existe por causa do token que o Medusa recusou (venceu, ou foi forjado):
 * a página que descobre isso não pode apagar cookie — só ação e rota podem
 * —, então ela redireciona pra cá. O botão "Sair" usa a ação `sair`, que é
 * POST; esta rota só completa o serviço de quem já não tinha sessão válida.
 *
 * E leva a sacola, se ela for da conta — pelo mesmo motivo da ação `sair`:
 * sessão vencida num computador de todo mundo é a situação em que a pessoa
 * seguinte mais compraria na conta de quem saiu.
 */
export async function GET(req: NextRequest) {
  const destino = new URL("/conta/entrar", req.nextUrl)
  if (req.nextUrl.searchParams.get("motivo") === "expirou") {
    destino.searchParams.set("motivo", "expirou")
  }
  const resposta = NextResponse.redirect(destino)
  const seguro = process.env.NODE_ENV === "production"
  resposta.cookies.set(COOKIE_SESSAO, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: seguro,
    path: "/",
    maxAge: 0,
  })

  const token = req.cookies.get(COOKIE_SESSAO)?.value
  const carrinho = req.cookies.get(COOKIE_CARRINHO)?.value
  if (token && carrinho && (await carrinhoEhDaConta(carrinho, token))) {
    resposta.cookies.set(COOKIE_CARRINHO, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: seguro,
      path: "/",
      maxAge: 0,
    })
  }
  return resposta
}
