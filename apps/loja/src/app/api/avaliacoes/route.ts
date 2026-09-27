import { NextResponse } from "next/server"
import { avaliacoesPublicadas } from "@/lib/medusa"

/**
 * GET /api/avaliacoes — as avaliações de quem comprou, aprovadas no painel,
 * pra esteira da home (`lib/depoimentos-da-esteira.ts`), que busca só quando
 * a seção chega perto da tela.
 *
 * No formato que o Medusa manda (`nome`, `nota`, `texto`, `produto`), do
 * cache da loja (`avaliacoesPublicadas`, com a etiqueta `avaliacoes`). Sem o
 * Medusa, a lista vazia com 503: a esteira segue com os trechos.
 */
export async function GET() {
  try {
    const avaliacoes = await avaliacoesPublicadas()
    return NextResponse.json({
      avaliacoes: avaliacoes.map((a) => ({
        nome: a.nome,
        nota: a.nota,
        texto: a.texto,
        produto: a.produtoHandle,
      })),
    })
  } catch {
    return NextResponse.json({ avaliacoes: [] }, { status: 503 })
  }
}
