import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { buscarOferta, listarProdutos } from "@/lib/medusa"
import { COOKIE_DA_OFERTA, ehEnderecoDeOferta, situacaoAgora } from "@/lib/ofertas"

/**
 * O LINK DA OFERTA OCULTA LEVA DIRETO PRA PÁGINA DO PRODUTO (entrega 0241,
 * pedido da loja: "ele tem que mandar direto para a PDP").
 *
 * - `/oferta/<endereço>/<produto>`: o link de um produto da oferta (o painel
 *   dá um por produto);
 * - `/oferta/<endereço>`: o link geral — com um produto só, o dele; com
 *   vários, a página com todos (`/oferta/<endereço>/vitrine`).
 *
 * No ar, a resposta deixa a marca no navegador (o cookie `fb_oferta`, até o
 * fim da oferta) e redireciona pra PDP, que mostra a faixa e o preço da
 * oferta (`components/oferta/na-pdp.tsx`). O resto do endereço (`?utm_…`)
 * vai junto: é a campanha de quem mandou o link. Fora do ar (ainda não
 * começou, pausada, acabou), sem oferta, ou produto de fora: a página da
 * oferta, que diz o que houve (ou dá o 404).
 */
export async function redirecionarDaOferta(
  req: NextRequest,
  endereco: string,
  handle: string | null
): Promise<NextResponse> {
  const vitrine = () => destino(req, `/oferta/${endereco}/vitrine`)
  if (!ehEnderecoDeOferta(endereco)) return vitrine()

  let oferta: Awaited<ReturnType<typeof buscarOferta>> = null
  let produtos: Awaited<ReturnType<typeof listarProdutos>> = []
  try {
    ;[oferta, produtos] = await Promise.all([buscarOferta(endereco), listarProdutos()])
  } catch (e) {
    // Sem o Medusa, a página da oferta mostra o erro dela (e tenta de novo).
    console.warn(`[oferta] ${endereco}: ${e instanceof Error ? e.message : e}`)
    return vitrine()
  }
  if (!oferta || situacaoAgora(oferta, Date.now()) !== "no-ar") return vitrine()

  const daOferta = new Set(oferta.produtos.map((p) => p.id))
  const naLoja = produtos.filter((p) => daOferta.has(p.id) && p.handle)
  const alvo = handle
    ? naLoja.find((p) => p.handle === handle)
    : naLoja.length === 1
      ? naLoja[0]
      : null
  if (!alvo?.handle) return vitrine()

  const resposta = destino(req, `/produtos/${alvo.handle}`)
  const segundos = Math.floor((new Date(oferta.terminaEm).getTime() - Date.now()) / 1000)
  resposta.cookies.set(COOKIE_DA_OFERTA, endereco, {
    path: "/",
    maxAge: Math.max(1, segundos),
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    // A página do produto lê a marca no navegador: não é segredo, o link é a chave.
    httpOnly: false,
  })
  return resposta
}

/** 307 pro caminho, com a busca do link (as `utm_…` de quem mandou). Nunca guardado. */
function destino(req: NextRequest, caminho: string): NextResponse {
  const url = req.nextUrl.clone()
  url.pathname = caminho
  const resposta = NextResponse.redirect(url, 307)
  resposta.headers.set("cache-control", "no-store")
  return resposta
}
