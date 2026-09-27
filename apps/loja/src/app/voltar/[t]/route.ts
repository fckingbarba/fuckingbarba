import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { COOKIE_CARRINHO, OPCOES_COOKIE } from "@/lib/carrinho"
import { cabecalhosDeQuemPede, medusa } from "@/lib/conta"
import { codigoDoCupom, guardarCupomPendente } from "@/lib/cupom-pendente"

/**
 * /voltar/<t> — O BOTÃO DOS E-MAILS DOS FLUXOS do CRM (checkout abandonado,
 * Pix pendente) e do "Refazer o pedido" do Pix que venceu.
 *
 * O Medusa confere o link (`POST /store/crm/voltar`) e devolve o carrinho:
 * o que ficou pelo caminho, ou um novo com os produtos do Pix. A loja põe o
 * carrinho no cookie — no lugar do que o navegador tinha — e manda pro
 * checkout, que retoma do passo onde a pessoa parou. Com `?cupom=`, o
 * desconto fica guardado e o checkout aplica sozinho (`lib/cupom-pendente.ts`).
 *
 * As UTMs vão junto: a visita que veio do e-mail aparece como E-mail no
 * Marketing. O link que não vale (torto, vencido, o carrinho que já virou
 * pedido) vai pra home, sem dizer por quê.
 */

/** O formato do link — quem diz se ele vale é o Medusa. */
const LINK = /^(cart|order)_[0-9A-Z]{26}\.[0-9a-z]{1,10}\.[A-Za-z0-9_-]{22}$/

export async function GET(req: NextRequest, { params }: { params: Promise<{ t: string }> }) {
  const destino = (caminho: string) => {
    const url = new URL(caminho, req.url)
    for (const [chave, valor] of req.nextUrl.searchParams)
      if (chave.startsWith("utm_")) url.searchParams.set(chave, valor)
    return NextResponse.redirect(url, 302)
  }
  const t = (await params).t
  if (!LINK.test(t)) return destino("/")

  const r = await medusa("/store/crm/voltar", {
    corpo: { t },
    extras: await cabecalhosDeQuemPede(),
  })
  const carrinho = r.status === 200 ? r.corpo.carrinho : null
  if (typeof carrinho !== "string" || !/^cart_[0-9A-Z]{26}$/.test(carrinho)) return destino("/")

  ;(await cookies()).set(COOKIE_CARRINHO, carrinho, OPCOES_COOKIE)
  const cupom = codigoDoCupom(req.nextUrl.searchParams.get("cupom"))
  if (cupom) await guardarCupomPendente({ codigo: cupom, frete: false, soMaisBarato: false })
  return destino("/checkout")
}
