import type { HttpTypes } from "@medusajs/types"
import { buscarCategoria, listarProdutos, precosDe } from "@/lib/medusa"
import { site } from "@/lib/site"

/**
 * A CAMADA DE DADOS DA TELA DE CATEGORIA.
 *
 * Separada da página porque quem decide o que é "mais barato" ou "maior
 * desconto" é regra de negócio, e regra de negócio dentro de JSX é regra que
 * ninguém consegue testar sem abrir o navegador.
 */

/* ── A ORDENAÇÃO ──────────────────────────────────────────────────────────
 *
 * ORDENA-SE AQUI, no servidor, DEPOIS de buscar — e não com o `order` do
 * Medusa. Dois motivos, os dois concretos:
 *
 *   1. preço no Medusa v2 é CALCULADO por região e por promoção. Ele não é
 *      uma coluna que dá pra ordenar no banco; `calculated_amount` só existe
 *      depois que o cálculo roda. Pedir `order=variants.calculated_price`
 *      ordena pelo preço de tabela, que não é o que está na tela;
 *   2. os kits de quantidade ("2 frascos", "3 frascos") são peneirados em
 *      Node, depois da resposta, porque o Medusa não filtra por metadata.
 *      Ordenar antes da peneira ordena uma lista que não é a exibida.
 *
 * Ordenar aqui custa nada num catálogo desse tamanho e é a única versão que
 * concorda com o que a pessoa vê. Quando o catálogo passar de umas centenas,
 * isso vira paginação de verdade e a conversa muda — está anotado no README.
 */

export const ORDENS = [
  { id: "", nome: "Relevância" },
  { id: "barato", nome: "Menor preço" },
  { id: "caro", nome: "Maior preço" },
  { id: "desconto", nome: "Maior desconto" },
  { id: "novidade", nome: "Novidades" },
] as const

export type Ordem = (typeof ORDENS)[number]["id"]

/**
 * `?ordem=` vem da URL, ou seja, de qualquer um. Valor que não está na lista
 * vira relevância em silêncio — a alternativa seria 404 numa página que
 * existe, por causa de um parâmetro que alguém digitou errado.
 */
export function lerOrdem(valor: string | string[] | undefined): Ordem {
  const texto = Array.isArray(valor) ? valor[0] : valor
  const achou = ORDENS.find((o) => o.id === texto)
  return achou ? achou.id : ""
}

/** Desconto em fração (0,31 = 31% off). Sem preço cheio, não há desconto. */
function descontoDe(produto: HttpTypes.StoreProduct): number {
  const precos = precosDe(produto)
  if (!precos?.cheio) return 0
  return 1 - precos.atual / precos.cheio
}

function precoDeOrdenacao(produto: HttpTypes.StoreProduct): number | null {
  return precosDe(produto)?.atual ?? null
}

/**
 * Produto sem preço vai sempre pro FIM, nas duas direções. Ele não é "o mais
 * barato" nem "o mais caro" — ele é um produto que o Medusa devolveu sem
 * preço pra esta região, e jogá-lo no topo de "menor preço" faria a primeira
 * coisa da lista ser a única sem número na tela.
 */
export function ordenar(
  produtos: HttpTypes.StoreProduct[],
  ordem: Ordem
): HttpTypes.StoreProduct[] {
  if (!ordem) return produtos

  const lista = produtos.slice()

  if (ordem === "novidade") {
    return lista.sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""))
  }

  if (ordem === "desconto") {
    return lista.sort((a, b) => descontoDe(b) - descontoDe(a))
  }

  const sinal = ordem === "barato" ? 1 : -1
  return lista.sort((a, b) => {
    const pa = precoDeOrdenacao(a)
    const pb = precoDeOrdenacao(b)
    if (pa === null && pb === null) return 0
    if (pa === null) return 1
    if (pb === null) return -1
    return (pa - pb) * sinal
  })
}

/* ── O CATÁLOGO POR CATEGORIA ─────────────────────────────────────────── */

/**
 * O handle LITERAL, não `string`. Com `typedRoutes` ligado, `/${handle}` só
 * é aceito como rota quando o compilador enxerga o texto — é a mesma razão
 * que está explicada no `conhecida()` da dobra da PDP. Com `string` aqui, o
 * único jeito de calar o erro nos trilhos seria um `as Route`, que é
 * desligar a checagem justamente onde ela serve.
 */
export type HandleDeCategoria = (typeof site.categorias)[number]["handle"]

export type Prateleira = {
  handle: HandleDeCategoria
  nome: string
  produtos: HttpTypes.StoreProduct[]
}

/**
 * Uma prateleira por categoria de `site.categorias`, na ordem do menu.
 *
 * UMA BUSCA POR CATEGORIA, e não uma busca geral peneirada aqui: o filtro
 * por categoria é do Medusa, e continua certo quando o catálogo crescer. A
 * peneira em Node só valeria hoje, com seis produtos, e é exatamente o tipo
 * de atalho que ninguém revisita depois da importação da Nuvemshop.
 *
 * As buscas são todas `"use cache"` lá dentro, e saem em paralelo — na
 * prática é uma ida só ao Medusa, e nenhuma depois que o cache esquenta.
 */
export async function prateleiras(): Promise<Prateleira[]> {
  return Promise.all(
    site.categorias.map(async (c): Promise<Prateleira> => {
      const dados = await buscarCategoria(c.handle)
      const produtos = dados ? await listarProdutos({ categoriaId: dados.id }) : []
      return { handle: c.handle, nome: dados?.name ?? c.nome, produtos }
    })
  )
}

/**
 * Os produtos das OUTRAS categorias, pra "o resto da loja".
 *
 * Quatro e não todos: é uma linha cheia no desktop e o suficiente pra provar
 * que a loja continua de pé. Sem repetir o que já está na grade de cima —
 * um produto pode estar em mais de uma categoria, e vê-lo duas vezes na
 * mesma tela faz a loja parecer menor do que é, não maior.
 */
export function oRestoDaLoja(
  todas: Prateleira[],
  atual: string,
  jaNaTela: HttpTypes.StoreProduct[],
  quantos = 4
): HttpTypes.StoreProduct[] {
  const mostrados = new Set(jaNaTela.map((p) => p.id))
  const fora: HttpTypes.StoreProduct[] = []

  for (const p of todas) {
    if (p.handle === atual) continue
    for (const produto of p.produtos) {
      if (mostrados.has(produto.id)) continue
      mostrados.add(produto.id)
      fora.push(produto)
    }
  }

  return fora.slice(0, quantos)
}

/**
 * Quantos produtos a loja tem ao todo, pro trilho "Todos".
 *
 * Por `id` e não somando os tamanhos: um produto pode estar em duas
 * categorias, e a soma diria que a loja tem sete produtos quando tem seis —
 * bem na frente do trilho que leva pra lista onde dá pra contar.
 */
export function contarTudo(todas: Prateleira[]): number {
  return new Set(todas.flatMap((p) => p.produtos.map((produto) => produto.id))).size
}

/**
 * A maior categoria fora a atual — pro convite que preenche a linha de uma
 * categoria magra apontar pra onde de fato tem o que ver.
 */
export function aMaiorDasOutras(todas: Prateleira[], atual: string): Prateleira | null {
  const outras = todas.filter((p) => p.handle !== atual && p.produtos.length > 0)
  if (!outras.length) return null
  return outras.reduce((a, b) => (b.produtos.length > a.produtos.length ? b : a))
}
