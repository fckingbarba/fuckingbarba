import { NextResponse, type NextRequest } from "next/server"
import redirects from "./redirects.json"
import { ORDENS_COM_PAGINA } from "@/lib/ordens"
import { COOKIE_SESSAO, destinoSeguro, sessaoParece } from "@/lib/sessao"
import { emProducao, site } from "@/lib/site"

/**
 * Roda antes de qualquer rota, no Node.js da Vercel. Cinco trabalhos:
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
 * 4. A porta da /conta: sem sessão, a página da conta vira o "entrar" (com
 *    `?para=` pra voltar depois); com sessão, o "entrar" vira a conta. Só
 *    olha o cookie, sem perguntar ao Medusa — é a checagem otimista do guia
 *    de autenticação do Next. A de verdade é a página, que pergunta.
 *
 * 5. A ordenação da vitrine: `/barba?ordem=barato` vira, por dentro, a
 *    página estática `/barba/ordem/barato` — sem mudar o endereço na barra.
 *    Ler o `?ordem=` na própria categoria a tornava dinâmica (esqueleto,
 *    streaming, rodapé pulando); o porquê está em `components/catalogo/tela.tsx`.
 *
 * O Next já trata barra final (/x/ → /x); maiúscula vira 301 pra minúscula.
 */

const rotasAntigas = new Map<string, string>(
  Object.entries(redirects.rotas).map(([de, para]) => [normaliza(de), para])
)

/**
 * Páginas de primeiro nível que existem em `app/` e não são categoria.
 *
 * ESTA LISTA À MÃO É UMA ARMADILHA, e vale saber disso: quem criar uma página
 * nova em `app/` e esquecer de anotar aqui vai ver a página responder 404 —
 * não no build, não no lint, só ao abrir a URL. Já aconteceu com o
 * `/checkout`. Não dá pra derivar as rotas daqui (o proxy roda antes do
 * roteador), então o que segura a peça é o conferidor: `conferir-checkout.mjs`
 * pede `/checkout` e falha se vier 404.
 */
const PAGINAS_RAIZ = new Set([
  "privacidade",
  "trocas",
  "termos",
  "contato",
  "duvidas",
  "busca",
  "nao-encontrado",
  "em-breve",
  "checkout",
  "conta",
  // `/produtos` (a lista inteira). `/produtos/<handle>` tem dois segmentos e
  // nunca caiu nesta peneira, o que torna o esquecimento aqui especialmente
  // traiçoeiro: a PDP funcionaria e só a lista daria 404.
  "produtos",
])
const CATEGORIAS = new Set<string>(site.categorias.map((c) => c.handle))

/** Onde o `?ordem=` vale: as categorias e a lista inteira. */
const ORDENAVEIS = new Set<string>([...CATEGORIAS, "produtos"])
const ORDENS = new Set<string>(ORDENS_COM_PAGINA)

function semBarraFinal(caminho: string): string {
  return caminho.length > 1 ? caminho.replace(/\/+$/, "") : caminho
}

function normaliza(caminho: string): string {
  return semBarraFinal(caminho).toLowerCase()
}

/**
 * Caminhos que carregam um IDENTIFICADOR no meio e por isso NÃO podem ser
 * passados pra minúscula.
 *
 * O id de pedido do Medusa é um ULID — `order_01M2ZFEF6J256CVS4KJS5B8QZ0`,
 * com maiúsculas que fazem parte do valor. Baixar a caixa dele transforma o
 * id em outro id, e a tela de "pedido feito" vira "não achei esse pedido"
 * pra TODA compra. Aconteceu; está travado em `conferir-checkout.mjs` — e
 * o pedido da conta tem o mesmo id no endereço (`conferir-conta.mjs`).
 *
 * Handle de produto e de categoria continua minúsculo por construção (o
 * middleware do backend garante), então a regra segue valendo pro resto.
 */
const CAMINHOS_COM_ID = ["/checkout/obrigado/", "/conta/pedidos/"]

export function proxy(req: NextRequest) {
  const bruto = semBarraFinal(req.nextUrl.pathname)
  const temId = CAMINHOS_COM_ID.some((prefixo) => bruto.toLowerCase().startsWith(prefixo))
  const caminho = temId ? bruto : normaliza(bruto)

  // /Barba, /PRODUTOS/x → 301 pra minúsculo: uma URL só por página.
  if (!temId && bruto !== caminho) {
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

  /*
    O endereço INTERNO da ordenação, digitado direto, volta pro público: uma
    URL só por página. Não dá laço — o proxy roda uma vez por requisição, e
    a troca de baixo (`rewrite`) acontece por dentro, sem passar por aqui de
    novo.
  */
  if (segmentos.length === 3 && segmentos[1] === "ordem" && ORDENAVEIS.has(segmentos[0])) {
    const url = req.nextUrl.clone()
    url.pathname = `/${segmentos[0]}`
    url.searchParams.set("ordem", segmentos[2])
    return NextResponse.redirect(url, 301)
  }

  // `/barba?ordem=barato` → a página estática daquela ordem. Ordem que não
  // existe segue pra categoria, que mostra a relevância.
  const ordem = req.nextUrl.searchParams.get("ordem")
  if (ordem && ORDENS.has(ordem) && segmentos.length === 1 && ORDENAVEIS.has(segmentos[0])) {
    const url = req.nextUrl.clone()
    url.pathname = `/${segmentos[0]}/ordem/${ordem}`
    url.searchParams.delete("ordem")
    const trocada = NextResponse.rewrite(url)
    if (!emProducao) trocada.headers.set("X-Robots-Tag", "noindex, nofollow")
    return trocada
  }

  if (segmentos[0] === "conta") {
    const porta = portaDaConta(caminho, req)
    if (porta) return porta
  }

  const resposta = NextResponse.next()
  if (!emProducao) resposta.headers.set("X-Robots-Tag", "noindex, nofollow")
  return resposta
}

/**
 * Quem entra e quem fica na porta da /conta. `/conta/sair` passa sempre: é
 * quem apaga o cookie do token que o Medusa recusou.
 */
function portaDaConta(caminho: string, req: NextRequest): NextResponse | null {
  if (caminho === "/conta/sair") return null

  const logado = sessaoParece(req.cookies.get(COOKIE_SESSAO)?.value)
  const entrando = caminho === "/conta/entrar" || caminho.startsWith("/conta/entrar/")

  if (entrando && logado) {
    const url = req.nextUrl.clone()
    url.pathname = destinoSeguro(req.nextUrl.searchParams.get("para"))
    url.search = ""
    return NextResponse.redirect(url)
  }
  if (!entrando && !logado) {
    const url = req.nextUrl.clone()
    url.pathname = "/conta/entrar"
    url.search = caminho === "/conta" ? "" : `?para=${encodeURIComponent(caminho)}`
    return NextResponse.redirect(url)
  }
  return null
}

export const config = {
  // Tudo, menos assets do Next, imagens otimizadas, arquivos estáticos e a API.
  matcher: [
    "/((?!_next/static|_next/image|api/|icon.svg|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|avif|svg|ico|txt|xml|woff2?)$).*)",
  ],
}
