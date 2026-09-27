import "server-only"
import { cookies } from "next/headers"
import type { PedidoParaAvaliar } from "./avaliar-visivel"
import { medusa } from "./conta"

/**
 * O LINK DA AVALIAÇÃO — `<pedido>.<assinatura>`, feito pelo Medusa
 * (`apps/backend/src/lib/avaliacoes/link.ts`), que só ele confere. É ele que
 * abre a página `/avaliar` sem conta e sem senha.
 *
 * MORA NUM COOKIE, NÃO NO ENDEREÇO. O botão do e-mail leva a
 * `/avaliar/<link>` (`app/avaliar/[link]/route.ts`), que guarda o link aqui
 * e manda pra `/avaliar` limpa: o endereço que fica na barra, no histórico
 * e no Google Analytics (que manda a URL inteira) não carrega o link. É o
 * mesmo caminho do link do cupom (`lib/cupom-pendente.ts`).
 *
 * `httpOnly` e só no caminho `/avaliar`: nenhum script lê, e nenhuma outra
 * página manda. Sessenta dias — o e-mail pode ser aberto bem depois.
 */

export const COOKIE_DA_AVALIACAO = "avaliar"

const OPCOES = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/avaliar",
  maxAge: 60 * 60 * 24 * 60,
} as const

/** O formato do link — quem diz se ele vale é o Medusa. */
const LINK = /^order_[0-9A-Z]{26}\.[A-Za-z0-9_-]{22}$/

/** O link como o endereço e o cookie trazem, ou null se nem tem a forma. */
export function linkDaAvaliacao(v: unknown): string | null {
  if (typeof v !== "string") return null
  let texto = v
  try {
    texto = decodeURIComponent(v)
  } catch {
    // Um "%" solto: fica como veio, e o formato recusa.
  }
  return LINK.test(texto) ? texto : null
}

export async function lerLinkDaAvaliacao(): Promise<string | null> {
  return linkDaAvaliacao((await cookies()).get(COOKIE_DA_AVALIACAO)?.value)
}

/** Só em ação ou rota: a página não pode escrever cookie. */
export async function guardarLinkDaAvaliacao(link: string) {
  ;(await cookies()).set(COOKIE_DA_AVALIACAO, link, OPCOES)
}

/** Só em ação ou rota. */
export async function esquecerLinkDaAvaliacao() {
  const jar = await cookies()
  if (jar.get(COOKIE_DA_AVALIACAO)) jar.delete({ name: COOKIE_DA_AVALIACAO, path: OPCOES.path })
}

export type LeituraDoPedido =
  | { tipo: "ok"; pedido: PedidoParaAvaliar }
  /** O link não vale (não é desta loja, ou o pedido não existe mais). */
  | { tipo: "invalido" }
  /** Cancelado, ou sem pagamento. */
  | { tipo: "nao-aceita" }
  /** O Medusa não respondeu. */
  | { tipo: "fora" }

/**
 * O pedido do link, como a página mostra (`GET /store/avaliacoes/pedido`).
 * Sem cache: é o pedido de uma pessoa, e o "já avaliado" muda a cada envio.
 */
export async function lerPedidoDaAvaliacao(link: string): Promise<LeituraDoPedido> {
  const r = await medusa(`/store/avaliacoes/pedido?p=${encodeURIComponent(link)}`, {
    metodo: "GET",
  })
  if (r.status === 200 && r.corpo.pedido && typeof r.corpo.pedido === "object") {
    return { tipo: "ok", pedido: r.corpo.pedido as PedidoParaAvaliar }
  }
  if (r.status === 404) return { tipo: "invalido" }
  if (r.status === 409) return { tipo: "nao-aceita" }
  return { tipo: "fora" }
}
