import { revalidateTag } from "next/cache"
import { NextResponse, type NextRequest } from "next/server"

/**
 * O Medusa avisa aqui quando produto, categoria ou região muda (subscriber da
 * fase 3), e a tag correspondente cai. `profile="max"` = serve o conteúdo
 * antigo enquanto revalida em segundo plano, sem pico de latência.
 *
 *   POST /api/revalidar
 *   x-revalidar-segredo: <REVALIDAR_SEGREDO>
 *   { "tags": ["produtos", "produto:oleo-para-barba"] }
 */
export async function POST(req: NextRequest) {
  const segredo = process.env.REVALIDAR_SEGREDO
  if (!segredo || req.headers.get("x-revalidar-segredo") !== segredo) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
  }

  let corpo: { tags?: unknown }
  try {
    corpo = await req.json()
  } catch {
    return NextResponse.json({ erro: "JSON inválido" }, { status: 400 })
  }

  const tags = Array.isArray(corpo.tags)
    ? corpo.tags.filter((t): t is string => typeof t === "string" && t.length > 0 && t.length < 200)
    : []
  if (!tags.length) {
    return NextResponse.json({ erro: "informe tags: string[]" }, { status: 400 })
  }

  for (const tag of tags) revalidateTag(tag, "max")
  return NextResponse.json({ ok: true, tags, em: new Date().toISOString() })
}
