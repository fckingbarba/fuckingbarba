import type { Avaliacao } from "../conteudo/depoimentos"

/**
 * AS AVALIAÇÕES QUE VÊM DO MEDUSA — as aprovadas no painel, de quem comprou
 * (a página `/avaliar`; `GET /store/avaliacoes`), no formato do cartão.
 *
 * Num arquivo à parte, e não em `lib/avaliacoes.ts`, DE PROPÓSITO: aquele vai
 * no JavaScript da primeira tela da home e da página do produto (os
 * sorteios), e cada byte ali conta no LCP (ver o AGENTS.md, perto do
 * Lighthouse). Isto só roda no servidor (`lib/medusa.ts`) e no pedaço que a
 * esteira busca quando chega perto (`lib/depoimentos-da-esteira.ts`). Só
 * TIPO vem de `conteudo/depoimentos`, e o caminho é relativo: o
 * `conferir-esteira.mjs` lê este arquivo direto, sem bundler.
 *
 * `compraVerificada` é verdade em todas: cada uma veio de um pedido pago, e
 * o Medusa só aceita avaliação com o link assinado daquele pedido. O que
 * vier torto (nota fora de 1 a 5, sem produto) fica de fora, sem derrubar o
 * resto.
 */
export function avaliacoesDoMedusa(lista: unknown): Avaliacao[] {
  if (!Array.isArray(lista)) return []
  return lista.flatMap((a): Avaliacao[] => {
    if (!a || typeof a !== "object") return []
    const { nome, nota, texto, produto } = a as Record<string, unknown>
    if (typeof nome !== "string" || typeof texto !== "string" || typeof produto !== "string")
      return []
    if (nota !== 1 && nota !== 2 && nota !== 3 && nota !== 4 && nota !== 5) return []
    return [{ nome, nota, texto, compraVerificada: true, produtoHandle: produto }]
  })
}
