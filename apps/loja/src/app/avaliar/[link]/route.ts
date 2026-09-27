import { NextResponse, type NextRequest } from "next/server"
import { guardarLinkDaAvaliacao, linkDaAvaliacao } from "@/lib/avaliar"

/**
 * /avaliar/<link> — O BOTÃO DO E-MAIL "o que você achou?" (um por produto
 * do pedido; ver `apps/backend/src/lib/emails/avaliacao.ts`).
 *
 * Guarda o link no cookie e manda pra `/avaliar` LIMPA, levando só o
 * produto escolhido e as UTMs (a visita que veio do e-mail): o link não
 * fica na barra, no histórico nem no Google Analytics, que manda o endereço
 * inteiro — ver `lib/avaliar.ts`. Link torto vai pra página do mesmo jeito,
 * sem guardar nada: lá ela pede o número do pedido e o e-mail.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ link: string }> }) {
  const destino = new URL("/avaliar", req.url)
  for (const [chave, valor] of req.nextUrl.searchParams) {
    if (chave === "produto" || chave.startsWith("utm_")) destino.searchParams.set(chave, valor)
  }
  const link = linkDaAvaliacao((await params).link)
  if (link) await guardarLinkDaAvaliacao(link)
  return NextResponse.redirect(destino, 302)
}
