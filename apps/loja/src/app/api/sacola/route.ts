import { NextResponse } from "next/server"
import { leituraDoCarrinho, paraVisivel } from "@/lib/carrinho"

/**
 * GET /api/sacola — a sacola de agora, pra quem só quer LER: a primeira
 * leitura da aba, e a gaveta toda vez que abre.
 *
 *   200 { "carrinho": { … } }     — sem carrinho, o vazio
 *   503 { "carrinho": null }      — o Medusa não respondeu (ver `leituraDoCarrinho`)
 *
 * ┌─ POR QUE UMA ROTA, E NÃO UMA SERVER ACTION ────────────────────────────┐
 * │ Era uma action (`sincronizar`). Só que o Next roda as actions de uma   │
 * │ aba UMA POR VEZ, na fila do roteador: uma leitura presa na rede (o 4G  │
 * │ que caiu com ela no caminho) segurava atrás dela o "+" e o "Adicionar" │
 * │ — e ninguém tira uma action da fila. Um GET corre por fora da fila, e  │
 * │ quem pede põe prazo (`AbortSignal.timeout`, no provedor da sacola).     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Lê o cookie de quem pede, então nunca é a sacola de outra pessoa: nada de
 * cache — nem aqui, nem no CDN.
 */
export async function GET() {
  const lido = await leituraDoCarrinho()
  const semCache = { "cache-control": "private, no-store" }
  if (lido === "sem-resposta") {
    return NextResponse.json({ carrinho: null }, { status: 503, headers: semCache })
  }
  return NextResponse.json({ carrinho: paraVisivel(lido) }, { headers: semCache })
}
