import type { NextRequest } from "next/server"
import { redirecionarDaOferta } from "@/lib/oferta-do-link"

/**
 * /oferta/<endereço> — o link geral da oferta oculta: com um produto só, a
 * página dele (com a marca da oferta); com vários, a página com todos. Ver
 * `lib/oferta-do-link.ts`.
 */
export async function GET(req: NextRequest, { params }: RouteContext<"/oferta/[endereco]">) {
  const { endereco } = await params
  return redirecionarDaOferta(req, endereco, null)
}
