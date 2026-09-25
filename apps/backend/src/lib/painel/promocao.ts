import { numeroBrasileiro } from "../cupons"

/**
 * O PREÇO E A PROMOÇÃO DO PAINEL — os dois campos de cada produto na lista
 * de Produtos, "Preço" e "Promocional", como na Nuvemshop. Código puro, com
 * testes; a leitura e a gravação no Medusa são `ler-produtos.ts` e
 * `gravar-preco.ts`.
 *
 * ┌─ ONDE MORA CADA UM ────────────────────────────────────────────────────┐
 * │ O PREÇO é o da variação no Medusa. Vem do Bling na importação; mudado  │
 * │ no painel, o produto ganha a marca `fb_preco` e a importação não troca │
 * │ mais (`MARCA_DO_PRECO`, em `lib/erp/catalogo.ts`).                     │
 * │                                                                        │
 * │ O PROMOCIONAL mora numa lista de preço do Medusa, "Promoção do         │
 * │ painel", do tipo "sale": o Medusa fica com o MENOR preço entre o da    │
 * │ variação e o das listas, e devolve os dois pra loja — o riscado e o    │
 * │ que se paga. A loja já desenha o "de/por" com isso (`precosDe`, em     │
 * │ `apps/loja/src/lib/medusa.ts`): nada muda do lado dela.                │
 * │                                                                        │
 * │ O desconto por quantidade sai do preço de hoje (o job                  │
 * │ `precos-por-quantidade` lê com a promoção), e o cupom e a oferta do    │
 * │ checkout descontam em cima dele.                                       │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O PAINEL MANDA NO "DE/POR": gravar o promocional de um produto tira o
 * preço dele das OUTRAS listas (fora a do desconto por quantidade) — a de
 * lançamento, uma feita à mão no admin —, e o promocional vazio deixa o
 * produto sem promoção nenhuma. É a mesma regra da importação do Bling (a
 * promoção sai na primeira vez de cada produto). Duas listas com preço pro
 * mesmo produto fariam o painel dizer uma coisa e a loja cobrar outra.
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

/**
 * O preço novo não pode cair a menos de 1/5 nem subir a mais de 5 vezes o de
 * hoje numa mudança só — de novo, o dedo errado ("8,99" ou "899,00" no lugar
 * de "89,90"). Mudança de verdade desse tamanho se faz em duas vezes.
 */
export const VEZES_NUMA_MUDANCA = 5
const PRECO_MAXIMO = 99_999.99

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

export type MotivoDaRecusa =
  "valor_invalido" | "nao_e_desconto" | "desconto_demais" | "mudanca_demais" | "promocao_acima"

/** Um preço em reais ("59,90", "R$ 59,90", "59.90"), ou `null` se não é um. */
function emReais(v: unknown): number | null {
  const n = typeof v === "string" || typeof v === "number" ? numeroBrasileiro(v) : null
  if (n === null || !(n > 0)) return null
  const reais = centavos(n)
  return reais > 0 && reais <= PRECO_MAXIMO ? reais : null
}

const vazio = (v: unknown) => v === null || (typeof v === "string" && !v.trim())

export type MudancaDePreco = {
  /** O preço novo; `null`: não muda. */
  preco: number | null
  /** O promocional novo; `null`: tira; `undefined`: não muda. */
  promocional: number | null | undefined
}

export type LeituraDoPreco =
  | ({ ok: true } & MudancaDePreco)
  | { ok: false; motivo: MotivoDaRecusa; campo: "preco" | "promocional" }

/**
 * O que chegou da lista: `preco` e `promocional`, um ou os dois (campo que
 * não veio não muda; o promocional vazio tira a promoção). `hoje`: o preço
 * de hoje e o promocional do painel de hoje. O par que fica tem de ser um
 * de/por de verdade: promocional menor que o preço, e no máximo
 * `DESCONTO_MAXIMO` de desconto — a recusa diz qual campo.
 */
export function lerMudancaDePreco(
  corpo: { preco?: unknown; promocional?: unknown },
  hoje: { preco: number; promocional: number | null }
): LeituraDoPreco {
  let preco: number | null = null
  if (corpo.preco !== undefined) {
    const novo = emReais(corpo.preco)
    if (novo === null) return { ok: false, motivo: "valor_invalido", campo: "preco" }
    if (novo * VEZES_NUMA_MUDANCA < hoje.preco || novo > hoje.preco * VEZES_NUMA_MUDANCA)
      return { ok: false, motivo: "mudanca_demais", campo: "preco" }
    if (novo !== centavos(hoje.preco)) preco = novo
  }

  let promocional: number | null | undefined = undefined
  if (corpo.promocional !== undefined) {
    if (vazio(corpo.promocional)) promocional = null
    else {
      const novo = emReais(corpo.promocional)
      if (novo === null) return { ok: false, motivo: "valor_invalido", campo: "promocional" }
      promocional = novo
    }
  }

  const de = preco ?? hoje.preco
  const por = promocional !== undefined ? promocional : hoje.promocional
  if (por !== null) {
    // A culpa é do campo que veio: o promocional novo, ou o preço que passou por baixo dele.
    const campo = promocional !== undefined ? "promocional" : "preco"
    if (por >= centavos(de))
      return {
        ok: false,
        motivo: campo === "promocional" ? "nao_e_desconto" : "promocao_acima",
        campo,
      }
    if (descontoDe(de, por) > DESCONTO_MAXIMO)
      return { ok: false, motivo: "desconto_demais", campo }
  }
  return { ok: true, preco, promocional }
}

/** O preço de um produto como a lista mostra. */
export type PrecoDoProduto = {
  /** A promoção valendo hoje, ou `null`. */
  promocao: Promocao | null
  /** O preço gravado na promoção do painel, valendo ou não. */
  doPainel: number | null
  /**
   * O promocional do painel que NÃO vale: o preço já está igual ou menor
   * (baixou no Bling depois). Volta a valer se o preço subir — a tela
   * avisa, pra alguém tirar ou mudar.
   */
  semEfeito: number | null
  /** O que a loja cobra por uma unidade hoje. */
  hoje: number | null
}

/**
 * `de`: o preço da variação (o "de"). `vale`: o que o Medusa calcula pra uma
 * unidade, com as listas. `doPainel`: o preço na lista do painel, se houver.
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
    doPainel: doPainel !== null ? centavos(doPainel) : null,
    semEfeito:
      de !== null && doPainel !== null && centavos(doPainel) >= centavos(de)
        ? centavos(doPainel)
        : null,
    hoje,
  }
}
