import { NextResponse, type NextRequest } from "next/server"
import { guardarLinkDeSair, linkDeSair } from "@/lib/sair"

/**
 * /sair/<t> — O "SAIR DA LISTA" DO RODAPÉ dos e-mails de oferta (ver
 * `apps/backend/src/lib/emails/crm.ts`).
 *
 * Guarda o link no cookie e manda pra `/sair` LIMPA, que pergunta antes de
 * tirar: abrir o link não tira ninguém da lista — o antivírus do e-mail da
 * empresa, que abre todo link pra olhar, não desinscreve ninguém. Link torto
 * vai pra página do mesmo jeito, sem guardar nada: lá ela explica.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ t: string }> }) {
  const link = linkDeSair((await params).t)
  if (link) await guardarLinkDeSair(link)
  return NextResponse.redirect(new URL("/sair", req.url), 302)
}
