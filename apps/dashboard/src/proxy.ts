import { NextResponse, type NextRequest } from "next/server"
import { COOKIE_SESSAO, sessaoParece } from "@/lib/sessao"

/**
 * A PORTA DO PAINEL — roda antes de qualquer tela.
 *
 * Sem sessão, tudo vira o "entrar"; com sessão, o "entrar" vira o Início.
 * Só olha o cookie, sem perguntar ao Medusa: é a checagem otimista do guia
 * de autenticação do Next, e serve pra ninguém ver nem o esqueleto do
 * painel sem ter entrado. A de verdade é a casca (`app/(painel)/layout.tsx`),
 * que pergunta ao Medusa quem é — e o Medusa, que barra cada rota.
 *
 * `/sair` passa sempre: é quem apaga a sessão, tenha ela valor ou não.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const entrando = pathname === "/entrar" || pathname.startsWith("/entrar/")
  const temSessao = sessaoParece(req.cookies.get(COOKIE_SESSAO)?.value)

  if (!entrando && !temSessao) {
    return NextResponse.redirect(new URL("/entrar", req.nextUrl))
  }
  if (entrando && temSessao) {
    return NextResponse.redirect(new URL("/", req.nextUrl))
  }
  return NextResponse.next()
}

export const config = {
  // Tudo, menos os arquivos do Next, o ícone, o robots e o /sair.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico|robots.txt|sair).*)"],
}
