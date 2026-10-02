import type { NextRequest } from "next/server"
import { redirecionarDaOferta } from "@/lib/oferta-do-link"

/**
 * /oferta/<endereço>/<produto> — o link de um produto da oferta oculta: a
 * página dele, com a marca da oferta. Ver `lib/oferta-do-link.ts`.
 */
export async function GET(
  req: NextRequest,
  { params }: RouteContext<"/oferta/[endereco]/[produto]">
) {
  const { endereco, produto } = await params
  return redirecionarDaOferta(req, endereco, produto)
}
