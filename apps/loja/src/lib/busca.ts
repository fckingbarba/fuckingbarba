import type { HttpTypes } from "@medusajs/types"

/**
 * A BUSCA DA LOJA — a peneira por trás do `/busca`.
 *
 * ┌─ POR QUE A PENEIRA É AQUI, E NÃO NO MEDUSA ────────────────────────────┐
 * │ O `prateleiras()` (`lib/catalogo.ts`) avisa, com razão, que peneira em │
 * │ Node é o atalho que só vale com seis produtos. Aqui ela é outra coisa: │
 * │ o `q` do Medusa é um `ILIKE '%texto%'` (ver                            │
 * │ `mikro-orm-free-text-search-filter.js` no pacote `@medusajs/utils`), e │
 * │ isso, em português, erra três vezes:                                   │
 * │   • ACENTO: "oleo" não acha "Óleo" — e no celular quase ninguém digita │
 * │     o acento;                                                           │
 * │   • ORDEM: "barba oleo" não acha "Óleo para Barba", porque a frase     │
 * │     inteira precisa aparecer do jeito que foi digitada;                │
 * │   • PLURAL: "oleos" não acha "óleo".                                    │
 * │ Consertar isso lá seria `unaccent` no Postgres — mexer à mão no schema │
 * │ do Medusa, que o projeto não faz (ver AGENTS.md). Então a busca lê o   │
 * │ catálogo pela MESMA função da `/produtos` e decide aqui.               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * O TETO É O DA `/produtos`, e é de propósito: a busca vê exatamente o que a
 * lista inteira mostra (48 produtos, sem os kits de quantidade). O catálogo
 * inteiro da Nuvemshop tem quinze. No dia em que passar do teto, a `/produtos` já vai
 * precisar de paginação — e aí a busca vai junto pro backend, com o acento
 * resolvido lá. Está anotado no ESTADO.md, na importação da Nuvemshop.
 *
 * AS REGRAS, na ordem em que a peneira aplica:
 *   1. o texto vira palavras sem acento, sem caixa e sem pontuação;
 *   2. "de", "para", "com"… saem — ninguém procura por elas, e exigir que
 *      apareçam faria "óleo para barba" perder o que só diz "óleo de barba";
 *   3. TODA palavra que sobrou tem que aparecer no produto, em qualquer ordem;
 *   4. basta a palavra do produto COMEÇAR com a digitada ("fat" já acha
 *      "fator"), e o "s" do fim é opcional ("oleos" acha "óleo");
 *   5. o título pesa mais que a categoria, que pesa mais que a descrição; e
 *      a frase inteira no título, na ordem digitada, passa na frente de tudo.
 *      Empate fica na ordem do catálogo.
 */

/** Até onde a busca lê. Mais que isso é colagem acidental, não busca. */
export const TAMANHO_MAXIMO = 80

/** O que ninguém procura sozinho. */
const PALAVRAS_VAZIAS = new Set([
  "a",
  "o",
  "as",
  "os",
  "e",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "na",
  "no",
  "nas",
  "nos",
  "com",
  "para",
  "pra",
  "pro",
  "p",
  "um",
  "uma",
])

/** O `?q=` da URL, limpo: primeira ocorrência, espaços apertados, no tamanho. */
export function lerBusca(valor: string | string[] | undefined): string {
  const bruto = Array.isArray(valor) ? valor[0] : valor
  return (bruto ?? "").replace(/\s+/g, " ").trim().slice(0, TAMANHO_MAXIMO)
}

/** "Óleo p/ Barba!" → "oleo p barba". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** As palavras que valem — sem as vazias, a não ser que só sobrem elas. */
export function termosDa(busca: string): string[] {
  const todas = normalizar(busca).split(" ").filter(Boolean)
  const cheias = todas.filter((t) => !PALAVRAS_VAZIAS.has(t))
  return cheias.length ? cheias : todas
}

/**
 * A descrição pode chegar com HTML (a da Nuvemshop chega). A tag e a
 * entidade viram espaço antes de virar palavra — senão "&nbsp;" entraria na
 * busca como a palavra "nbsp".
 */
function palavrasDe(...textos: (string | null | undefined)[]): string[] {
  return normalizar(
    textos
      .filter(Boolean)
      .join(" ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&[a-z0-9#]+;/gi, " ")
  )
    .split(" ")
    .filter(Boolean)
}

type Campo = { palavras: string[]; peso: number }

function camposDo(produto: HttpTypes.StoreProduct): Campo[] {
  return [
    { palavras: palavrasDe(produto.title), peso: 4 },
    {
      palavras: palavrasDe(produto.subtitle, ...(produto.categories ?? []).map((c) => c.name)),
      peso: 2,
    },
    {
      palavras: palavrasDe(produto.description, ...(produto.variants ?? []).map((v) => v.title)),
      peso: 1,
    },
  ]
}

function casa(termo: string, palavras: string[]): boolean {
  const formas = termo.length > 3 && termo.endsWith("s") ? [termo, termo.slice(0, -1)] : [termo]
  return palavras.some((p) => formas.some((f) => p.startsWith(f)))
}

/** 0 = não serve. Acima disso, quanto maior, mais pra cima. */
function nota(campos: Campo[], termos: string[], frase: string): number {
  let total = 0
  for (const termo of termos) {
    const melhor = Math.max(0, ...campos.filter((c) => casa(termo, c.palavras)).map((c) => c.peso))
    if (melhor === 0) return 0
    total += melhor
  }
  if (campos[0].palavras.join(" ").includes(frase)) total += 10
  return total
}

/** Os produtos que servem pra busca, do mais certeiro pro menos. */
export function buscar(
  produtos: HttpTypes.StoreProduct[],
  busca: string
): HttpTypes.StoreProduct[] {
  const termos = termosDa(busca)
  if (!termos.length) return []
  const frase = normalizar(busca)

  return produtos
    .map((produto, ordem) => ({ produto, ordem, nota: nota(camposDo(produto), termos, frase) }))
    .filter((r) => r.nota > 0)
    .sort((a, b) => b.nota - a.nota || a.ordem - b.ordem)
    .map((r) => r.produto)
}
