import { NextResponse, type NextRequest } from "next/server"
import {
  codigoDoCupom,
  ehCupomDeFrete,
  esquecerCupomPendente,
  guardarCupomPendente,
  tentarCupomPendente,
} from "@/lib/cupom-pendente"

/**
 * /discount/<CÓDIGO> — O LINK DO CUPOM, no mesmo caminho da Nuvemshop (o
 * painel mostra e copia: Cupons e descontos). Os links que já circulam —
 * bio, e-mail, story — seguem valendo depois da virada do domínio.
 *
 * Como lá: guarda o cupom e manda pra home. Se a pessoa já tem sacola, o
 * cupom entra na hora; se não, espera guardado (`lib/cupom-pendente.ts`) e
 * entra no checkout. Código torto vai pra home sem guardar nada — o link
 * não diz se um código existe.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  // A campanha do link (o utm_ do e-mail) vai junto pra home: é ela que diz de onde a visita veio.
  const destino = new URL("/", req.url)
  for (const [k, v] of req.nextUrl.searchParams)
    if (k.startsWith("utm_")) destino.searchParams.set(k, v)
  const home = NextResponse.redirect(destino, 302)
  const codigo = codigoDoCupom((await params).codigo)
  if (!codigo) return home

  const { frete, soMaisBarato } = await ehCupomDeFrete(codigo)
  const pendente = { codigo, frete, soMaisBarato }
  await guardarCupomPendente(pendente)
  if ((await tentarCupomPendente(pendente)) === "entrou") await esquecerCupomPendente()
  return home
}
