import { NextResponse, type NextRequest } from "next/server"
import { buscarOferta } from "@/lib/medusa"
import { ehEnderecoDeOferta } from "@/lib/ofertas"

/**
 * /api/oferta/<endereço> — a oferta oculta pra página do produto (entrega
 * 0240): a mesma leitura guardada da página `/oferta/<endereço>`
 * (`buscarOferta`), com os produtos e o "por" de cada um. Quem pergunta é o
 * `ProvedorDaOfertaNaPdp`, e só no navegador que tem a marca da oferta (o
 * cookie que a página dela deixa) — a página do produto de todo mundo não
 * chama isto.
 *
 * O preço que vale é o do carrinho (a lista de preço da oferta); isto só
 * conta à tela o que mostrar. 404 sem a oferta; o Medusa fora, 503 — a
 * página do produto fica com o preço de sempre.
 */

const CABECALHOS = { "cache-control": "private, max-age=30" }

export async function GET(_req: NextRequest, { params }: RouteContext<"/api/oferta/[endereco]">) {
  const { endereco } = await params
  if (!ehEnderecoDeOferta(endereco))
    return NextResponse.json({ oferta: null }, { status: 404, headers: CABECALHOS })
  try {
    const oferta = await buscarOferta(endereco)
    return NextResponse.json({ oferta }, { status: oferta ? 200 : 404, headers: CABECALHOS })
  } catch (e) {
    console.warn(`[oferta] ${endereco}: ${e instanceof Error ? e.message : e}`)
    return NextResponse.json(
      { oferta: null },
      { status: 503, headers: { "cache-control": "no-store" } }
    )
  }
}
