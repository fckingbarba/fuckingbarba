import { NextResponse, type NextRequest } from "next/server"
import redirects from "./redirects.json"
import { site } from "@/lib/site"

/**
 * Roda antes de qualquer rota, no Node.js da Vercel. Três trabalhos:
 *
 * 1. Redirects 301 da Nuvemshop (redirects.json). É a tarefa mais importante
 *    da virada: cada URL antiga que o Google conhece precisa apontar pra nova.
 *    A query (?utm_*) é preservada — a atribuição sobrevive ao redirect.
 *
 * 2. 404 de verdade no primeiro nível. Com Cache Components, uma rota
 *    dinâmica manda o shell com status 200 antes de saber se o conteúdo
 *    existe, então /qualquer-coisa cairia em /[categoria] e viraria um 200 com
 *    cara de 404. Aqui, um segmento que não é categoria nem página estática é
 *    reescrito pra /nao-encontrado, rota estática que responde 404 no status.
 *
 * 3. Fora de produção, X-Robots-Tag: noindex — preview e staging nunca
 *    aparecem na busca, mesmo que alguém compartilhe o link.
 *
 * O Next já trata barra final (/x/ → /x); maiúscula vira 301 pra minúscula.
 */

const rotasAntigas = new Map<string, string>(
  Object.entries(redirects.rotas).map(([de, para]) => [normaliza(de), para])
)

/** Páginas de primeiro nível que existem em app/ e não são categoria. Mantenha em dia. */
const PAGINAS_RAIZ = new Set(["privacidade", "trocas", "nao-encontrado"])
const CATEGORIAS = new Set<string>(site.categorias.map((c) => c.handle))

function semBarraFinal(caminho: string): string {
  return caminho.length > 1 ? caminho.replace(/\/+$/, "") : caminho
}

function normaliza(caminho: string): string {
  return semBarraFinal(caminho).toLowerCase()
}

const ehProducao = process.env.VERCEL_ENV === "production" || process.env.SITE_INDEXAVEL === "true"

export function proxy(req: NextRequest) {
  const caminho = normaliza(req.nextUrl.pathname)

  // /Barba, /PRODUTOS/x → 301 pra minúsculo: uma URL só por página.
  if (semBarraFinal(req.nextUrl.pathname) !== caminho) {
    const url = req.nextUrl.clone()
    url.pathname = caminho
    return NextResponse.redirect(url, 301)
  }

  const destino = rotasAntigas.get(caminho)
  if (destino) {
    const url = req.nextUrl.clone()
    url.pathname = destino
    return NextResponse.redirect(url, 301)
  }

  const segmentos = caminho.split("/").filter(Boolean)
  if (segmentos.length === 1 && !CATEGORIAS.has(segmentos[0]) && !PAGINAS_RAIZ.has(segmentos[0])) {
    const url = req.nextUrl.clone()
    url.pathname = "/nao-encontrado"
    return NextResponse.rewrite(url)
  }

  const resposta = NextResponse.next()
  if (!ehProducao) resposta.headers.set("X-Robots-Tag", "noindex, nofollow")
  return resposta
}

export const config = {
  // Tudo, menos assets do Next, imagens otimizadas, arquivos estáticos e a API.
  matcher: [
    "/((?!_next/static|_next/image|api/|icon.svg|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|avif|svg|ico|txt|xml|woff2?)$).*)",
  ],
}
