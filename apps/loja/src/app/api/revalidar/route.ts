import { revalidateTag } from "next/cache"
import { NextResponse, type NextRequest } from "next/server"

/**
 * O Medusa avisa aqui quando produto, categoria ou região muda (subscriber da
 * fase 3), e a tag correspondente cai. `profile="max"` = serve o conteúdo
 * antigo enquanto revalida em segundo plano, sem pico de latência.
 *
 *   POST /api/revalidar
 *   x-revalidar-segredo: <REVALIDAR_SEGREDO>
 *   { "tags": ["produtos", "produto:oleo-para-barba"], "perfil": "max" }
 *
 * ┌─ O PERFIL NÃO É DETALHE ───────────────────────────────────────────────┐
 * │ `"max"` serve o conteúdo VELHO enquanto atualiza por trás. Pra catálogo │
 * │ é o certo: ninguém se machuca vendo uma descrição de ontem por mais uma │
 * │ visita, e o site não toma um pico de latência.                          │
 * │                                                                          │
 * │ Pra CONFIGURAÇÃO é errado. Quem salvou o piso do frete no admin vai     │
 * │ abrir o site pra conferir, e com `"max"` ele vê o número antigo — e     │
 * │ conclui que não salvou. Pior: entre salvar e a próxima visita, a loja   │
 * │ anuncia um piso que o carrinho não pratica mais.                        │
 * │                                                                          │
 * │ Por isso o perfil é escolhido por QUEM CHAMA, e o padrão continua       │
 * │ sendo `"max"` — quem precisa de urgência pede.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Perfis aceitos. Lista fechada: o valor vem de fora. */
const PERFIS = ["seconds", "minutes", "hours", "days", "weeks", "max", "default"] as const
type Perfil = (typeof PERFIS)[number]
export async function POST(req: NextRequest) {
  const segredo = process.env.REVALIDAR_SEGREDO
  if (!segredo || req.headers.get("x-revalidar-segredo") !== segredo) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
  }

  let corpo: { tags?: unknown; perfil?: unknown }
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

  const perfil: Perfil = PERFIS.includes(corpo.perfil as Perfil)
    ? (corpo.perfil as Perfil)
    : "max"

  for (const tag of tags) revalidateTag(tag, perfil)
  return NextResponse.json({ ok: true, tags, perfil, em: new Date().toISOString() })
}
