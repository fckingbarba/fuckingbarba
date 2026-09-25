import { numeroBrasileiro } from "../cupons"

/**
 * A PROMOÇÃO DO PAINEL — o "de/por" de cada produto, que a equipe muda na
 * lista de Produtos. Código puro, com testes; a leitura e a gravação no
 * Medusa são `gravar-promocao.ts` e `ler-produtos.ts`.
 *
 * ┌─ ONDE MORA ────────────────────────────────────────────────────────────┐
 * │ Numa lista de preço do Medusa, "Promoção do painel", do tipo "sale":   │
 * │ o Medusa fica com o MENOR preço entre o do produto e o das listas, e   │
 * │ devolve os dois pra loja — o riscado e o que se paga. A loja já        │
 * │ desenha o "de/por" com isso (`precosDe`, em `apps/loja/src/lib/        │
 * │ medusa.ts`): nada muda do lado dela.                                   │
 * │                                                                        │
 * │ O "DE" é o preço do produto, o do Bling. O "POR" é o desta lista. O    │
 * │ desconto por quantidade sai do "por" (o job `precos-por-quantidade`    │
 * │ lê o preço de hoje, com promoção), e o cupom e a oferta do checkout    │
 * │ descontam em cima dele.                                                │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O PAINEL MANDA NO "DE/POR": gravar a promoção de um produto tira o preço
 * dele das OUTRAS listas (fora a do desconto por quantidade) — a de
 * lançamento, uma feita à mão no admin —, e "Tirar" deixa o produto sem
 * promoção nenhuma. É a mesma regra da importação do Bling (a promoção sai
 * na primeira vez de cada produto). Duas listas com preço pro mesmo
 * produto fariam o painel dizer uma coisa e a loja cobrar outra.
 *
 * O QUE A LISTA MOSTRA é o que a loja cobra por UMA unidade: o preço de
 * hoje, com a promoção que estiver valendo — do painel ou de outra lista
 * (aí a tela diz de onde veio).
 */

export const TITULO_DA_PROMOCAO = "Promoção do painel"

/**
 * Mais que isso de desconto é quase sempre dedo errado ("5,99" no lugar de
 * "59,90"), e o erro só apareceria no pedido. Promoção maior que isso, se
 * existir um dia, se faz em duas vezes ou no admin.
 */
export const DESCONTO_MAXIMO = 80

export type Promocao = {
  /** O preço de uma unidade com a promoção. */
  por: number
  /** Quanto sai mais barato que o "de", em %, arredondado. */
  desconto: number
  /** Veio de outra lista de preço (a de lançamento, uma do admin) e não do painel. */
  deOutraLista: boolean
}

const centavos = (v: number) => Math.round(v * 100) / 100

export const descontoDe = (de: number, por: number) => Math.round((1 - por / de) * 100)

export type MotivoDaRecusa = "valor_invalido" | "nao_e_desconto" | "desconto_demais"

export type LeituraDaPromocao =
  { ok: true; por: number | null } | { ok: false; motivo: MotivoDaRecusa }

/**
 * O que chegou do painel. Vazio ou `null` tira a promoção; um valor em reais
 * ("59,90", "R$ 59,90", "59.90") põe — menor que o "de" e dentro do
 * `DESCONTO_MAXIMO`.
 */
export function lerPromocao(v: unknown, de: number): LeituraDaPromocao {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim()))
    return { ok: true, por: null }
  const n = typeof v === "string" || typeof v === "number" ? numeroBrasileiro(v) : null
  if (n === null || !(n > 0)) return { ok: false, motivo: "valor_invalido" }
  const por = centavos(n)
  if (por <= 0) return { ok: false, motivo: "valor_invalido" }
  if (por >= centavos(de)) return { ok: false, motivo: "nao_e_desconto" }
  if (descontoDe(de, por) > DESCONTO_MAXIMO) return { ok: false, motivo: "desconto_demais" }
  return { ok: true, por }
}

/** O preço de um produto como a lista mostra. */
export type PrecoDoProduto = {
  /** A promoção valendo hoje, ou `null`. */
  promocao: Promocao | null
  /**
   * O preço gravado na promoção do painel que NÃO vale: o do Bling já está
   * igual ou menor (o preço baixou lá depois). Volta a valer se o do Bling
   * subir — a tela avisa, pra alguém tirar ou mudar.
   */
  semEfeito: number | null
  /** O que a loja cobra por uma unidade hoje. */
  hoje: number | null
}

/**
 * `de`: o preço do produto (o do Bling). `vale`: o que o Medusa calcula pra
 * uma unidade, com as listas. `doPainel`: o preço na lista do painel, se
 * houver.
 */
export function precoDoProduto({
  de,
  vale,
  doPainel,
}: {
  de: number | null
  vale: number | null
  doPainel: number | null
}): PrecoDoProduto {
  const hoje = vale !== null ? centavos(vale) : de
  const promocao =
    de !== null && hoje !== null && hoje < centavos(de)
      ? {
          por: hoje,
          desconto: descontoDe(de, hoje),
          deOutraLista: doPainel === null || centavos(doPainel) !== hoje,
        }
      : null
  return {
    promocao,
    semEfeito:
      de !== null && doPainel !== null && centavos(doPainel) >= centavos(de)
        ? centavos(doPainel)
        : null,
    hoje,
  }
}
