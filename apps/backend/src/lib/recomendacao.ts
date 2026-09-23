/**
 * O MOTOR DE RECOMENDAÇÃO — o que combina com o quê, aprendido dos pedidos.
 *
 * Duas telas perguntam a mesma coisa: "o que oferecer pra quem já tem ISTO
 * na sacola?". O "Leva junto" da gaveta mostra até três produtos; a oferta
 * do checkout (o order bump) mostra um, com desconto. Antes, a resposta era
 * fixa — o óleo, pra todo mundo, mesmo pra quem já estava levando o óleo.
 *
 * Ninguém escolhe no admin. A resposta sai de duas fontes, somadas:
 *
 *   1. O QUE OS PEDIDOS MOSTRAM — quem comprou A, quantas vezes levou B no
 *      mesmo pedido. É a fonte que manda, quando existe.
 *   2. O QUE A LOJA JÁ DIZ — a "rotina" da página do produto (Passo 1 ·
 *      limpa, Passo 3 · hidrata…), a venda combinada, a categoria. É o
 *      ponto de partida, pra loja nova ou produto novo, sem pedido nenhum.
 *
 * ┌─ COMO AS DUAS SE SOMAM ────────────────────────────────────────────────┐
 * │ A afinidade de A → B é a chance de quem leva A levar B também:         │
 * │                                                                        │
 * │     (pedidos com A e B  +  K × crença) / (pedidos com A  +  K)         │
 * │                                                                        │
 * │ A crença inicial vale como K pedidos (K = 10). Sem pedido nenhum, a    │
 * │ afinidade É a crença. Com 10 pedidos de A, meio a meio. Com 100, os    │
 * │ pedidos mandam — e a rotina da PDP vira só um desempate. É a conta     │
 * │ que impede um pedido isolado de virar regra, e que deixa a loja        │
 * │ aprender sozinha conforme vende.                                       │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A OFERTA DO CHECKOUT TAMBÉM APRENDE: cada pedido guarda o que foi
 * oferecido e se a pessoa aceitou (`fb_bump` no metadata do pedido — ver
 * `api/store/recomendacoes/oferta/`). Produto que é aceito mais que a média
 * ganha peso; o que é recusado perde. O peso fica entre metade e o dobro,
 * pra um começo de azar não sumir com um produto de vez.
 *
 * AQUI É SÓ CONTA — sem banco, sem Medusa. Quem lê os pedidos e os produtos
 * é a rota (`api/store/recomendacoes/route.ts`); quem ordena as sugestões pra
 * uma sacola de verdade é a loja (`apps/loja/src/lib/recomendacao.ts`), que
 * recebe este modelo pronto. Os testes estão em
 * `__tests__/recomendacao.unit.spec.ts`.
 */

export const CATEGORIA_DE_KITS = "kits"

export type ProdutoDoModelo = {
  handle: string
  titulo: string
  /** handles das categorias */
  categorias: string[]
  /**
   * Com quem a própria loja diz que ele combina: os itens da "rotina" da PDP
   * e a venda combinada escolhida no admin (quando alguém escolheu).
   */
  combina: string[]
}

export type PedidoDoModelo = {
  /** os produtos do pedido, sem repetição */
  handles: string[]
  /** o que a oferta do checkout mostrou, e se a pessoa aceitou */
  bump: { produto: string; aceito: boolean } | null
}

/**
 * O que a loja recebe. Pequeno de propósito — ele vai inteiro pro navegador,
 * junto da gaveta — e SEM contagem nenhuma: quantos pedidos a loja teve não é
 * da conta de quem abre o site. Só frações e listas.
 */
export type Modelo = {
  versao: 1
  /** a → b → afinidade, de 0 a 1. Só os vizinhos mais fortes de cada um. */
  afinidade: Record<string, Record<string, number>>
  /** a → os b que os pedidos PROVAM que vão juntos (é o que a tela pode afirmar). */
  juntos: Record<string, string[]>
  /** a → os b que a loja diz que combinam (rotina e venda combinada). */
  combina: Record<string, string[]>
  /** a fração dos pedidos que leva cada produto, de 0 a 1 */
  popularidade: Record<string, number>
  /** os mais pedidos — vazio enquanto não há pedido bastante pra dizer isso */
  maisPedidos: string[]
  /** kit → as peças dele, pra não oferecer o que já vem no kit */
  kits: Record<string, string[]>
  /**
   * Os produtos que a oferta do checkout pode mostrar (os que têm a promoção
   * ligada — `lib/bumps.ts`), com o peso aprendido: 1 é a média, 0,5 a 2.
   */
  bump: Record<string, number>
}

/**
 * O registro da oferta no pedido: `metadata.fb_bump = { produto, aceito, em }`.
 *
 * Quem grava é a loja, depois do pedido fechar
 * (`api/store/recomendacoes/oferta/`). Quem lê é o modelo, pra aprender.
 */
export const CHAVE_DA_OFERTA = "fb_bump"

export function lerOferta(metadata: unknown): PedidoDoModelo["bump"] {
  const bruto = (metadata as Record<string, unknown> | null | undefined)?.[CHAVE_DA_OFERTA]
  if (!bruto || typeof bruto !== "object") return null
  const { produto, aceito } = bruto as Record<string, unknown>
  return typeof produto === "string" && produto && typeof aceito === "boolean"
    ? { produto, aceito }
    : null
}

/* ── os números do motor ─────────────────────────────────────────────────── */

export const AJUSTES = {
  /** Quantos pedidos a crença inicial vale (o K da conta lá de cima). */
  forcaDaCrenca: 10,
  crenca: {
    /** A diz que combina com B (a rotina de A tem B). */
    combina: 0.3,
    /** B diz que combina com A: vale menos — quem leva o óleo não precisa do fator. */
    combinaDeVolta: 0.15,
    /** A e B aparecem juntos na rotina de um terceiro. */
    mesmaRotina: 0.15,
    mesmaCategoria: 0.1,
    outro: 0.03,
  },
  /** Vizinhos guardados por produto. É o que segura o tamanho do modelo. */
  vizinhos: 8,
  /** "Quem compra A também leva": pelo menos 5 pedidos, e 15% de quem leva A. */
  juntos: { pedidos: 5, fracao: 0.15 },
  /** "Um dos mais pedidos": os 2 primeiros, com pelo menos 10 pedidos cada. */
  maisPedidos: { quantos: 2, pedidos: 10 },
  bump: {
    /** Quantas ofertas a taxa média vale na conta de cada produto. */
    forca: 10,
    /** A taxa de aceite que se supõe antes de haver oferta nenhuma. */
    taxaInicial: 0.1,
    piso: 0.5,
    teto: 2,
  },
} as const

const arredonda = (n: number) => Math.round(n * 1000) / 1000

/** "Óleo para Barba 30ml" → ["oleo", "para", "barba", "30ml"] */
function palavras(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/**
 * AS PEÇAS DE CADA KIT, pelo nome.
 *
 * O catálogo não guarda a composição do kit — o kit é um produto como outro
 * qualquer. O nome guarda: "Kit Completo — Shampoo, Balm e Óleo". Peça é o
 * produto (que não é kit) cuja PRIMEIRA palavra do nome aparece no nome do
 * kit, e que divide com ele uma categoria que não é a de kits — é o que
 * impede um "Shampoo para Cabelo" de virar peça de um kit de barba.
 *
 * Errar aqui custa pouco: a peça deixa de ser oferecida pra quem tem o kit
 * na sacola (e o kit, pra quem tem a peça). Nenhum preço depende disto.
 */
export function pecasDosKits(produtos: readonly ProdutoDoModelo[]): Record<string, string[]> {
  const kits = produtos.filter((p) => p.categorias.includes(CATEGORIA_DE_KITS))
  const avulsos = produtos.filter((p) => !p.categorias.includes(CATEGORIA_DE_KITS))
  const resultado: Record<string, string[]> = {}

  for (const kit of kits) {
    const doNome = new Set(palavras(kit.titulo))
    const familia = new Set(kit.categorias.filter((c) => c !== CATEGORIA_DE_KITS))
    const pecas = avulsos
      .filter((p) => {
        const primeira = palavras(p.titulo)[0]
        return (
          primeira !== undefined && doNome.has(primeira) && p.categorias.some((c) => familia.has(c))
        )
      })
      .map((p) => p.handle)
    if (pecas.length) resultado[kit.handle] = pecas
  }
  return resultado
}

/** A crença inicial de A → B: o que a loja já diz, sem pedido nenhum. */
function crencas(produtos: readonly ProdutoDoModelo[]) {
  const handles = new Set(produtos.map((p) => p.handle))
  const crenca = new Map<string, number>()
  const editorial = new Set<string>()
  const chave = (a: string, b: string) => `${a}\u0000${b}`
  const sobe = (a: string, b: string, valor: number) => {
    if (a === b || !handles.has(a) || !handles.has(b)) return
    const k = chave(a, b)
    crenca.set(k, Math.max(crenca.get(k) ?? 0, valor))
    editorial.add(k)
  }

  for (const p of produtos) {
    const lista = [...new Set(p.combina)].filter((h) => h !== p.handle)
    for (const b of lista) {
      sobe(p.handle, b, AJUSTES.crenca.combina)
      sobe(b, p.handle, AJUSTES.crenca.combinaDeVolta)
      for (const c of lista) sobe(b, c, AJUSTES.crenca.mesmaRotina)
    }
  }

  const familias = new Map(
    produtos.map((p) => [p.handle, new Set(p.categorias.filter((c) => c !== CATEGORIA_DE_KITS))])
  )
  const de = (a: string, b: string): number => {
    const k = chave(a, b)
    if (crenca.has(k)) return crenca.get(k)!
    const fa = familias.get(a)
    const fb = familias.get(b)
    const mesma = fa && fb && [...fa].some((c) => fb.has(c))
    return mesma ? AJUSTES.crenca.mesmaCategoria : AJUSTES.crenca.outro
  }
  return { de, editorial: (a: string, b: string) => editorial.has(chave(a, b)) }
}

export function montarModelo(
  produtos: readonly ProdutoDoModelo[],
  pedidos: readonly PedidoDoModelo[],
  comBump: ReadonlySet<string>
): Modelo {
  const handles = produtos.map((p) => p.handle)
  const noCatalogo = new Set(handles)
  const { de: crenca, editorial } = crencas(produtos)

  // ── as contagens ────────────────────────────────────────────────────────
  let total = 0
  const sozinho = new Map<string, number>()
  const juntos = new Map<string, Map<string, number>>()
  for (const pedido of pedidos) {
    const doPedido = [...new Set(pedido.handles)].filter((h) => noCatalogo.has(h))
    if (!doPedido.length) continue
    total++
    for (const a of doPedido) {
      sozinho.set(a, (sozinho.get(a) ?? 0) + 1)
      const linha = juntos.get(a) ?? new Map<string, number>()
      for (const b of doPedido) if (b !== a) linha.set(b, (linha.get(b) ?? 0) + 1)
      juntos.set(a, linha)
    }
  }

  // ── a afinidade, e o que dá pra afirmar ─────────────────────────────────
  const K = AJUSTES.forcaDaCrenca
  const modelo: Modelo = {
    versao: 1,
    afinidade: {},
    juntos: {},
    combina: {},
    popularidade: {},
    maisPedidos: [],
    kits: pecasDosKits(produtos),
    bump: {},
  }

  for (const a of handles) {
    const nA = sozinho.get(a) ?? 0
    const linha = juntos.get(a)
    const vizinhos = handles
      .filter((b) => b !== a)
      .map((b) => {
        const nAB = linha?.get(b) ?? 0
        return { b, nAB, forca: (nAB + K * crenca(a, b)) / (nA + K) }
      })
      .sort((x, y) => y.forca - x.forca || x.b.localeCompare(y.b))
      .slice(0, AJUSTES.vizinhos)

    modelo.afinidade[a] = Object.fromEntries(vizinhos.map((v) => [v.b, arredonda(v.forca)]))

    const provados = vizinhos
      .filter((v) => v.nAB >= AJUSTES.juntos.pedidos && v.nAB / nA >= AJUSTES.juntos.fracao)
      .map((v) => v.b)
    if (provados.length) modelo.juntos[a] = provados

    const ditos = handles.filter((b) => b !== a && editorial(a, b))
    if (ditos.length) modelo.combina[a] = ditos

    modelo.popularidade[a] = total ? arredonda(nA / total) : 0
  }

  modelo.maisPedidos = handles
    .filter((h) => (sozinho.get(h) ?? 0) >= AJUSTES.maisPedidos.pedidos)
    .sort((x, y) => (sozinho.get(y) ?? 0) - (sozinho.get(x) ?? 0) || x.localeCompare(y))
    .slice(0, AJUSTES.maisPedidos.quantos)

  // ── a oferta do checkout: quem aceita mais, aparece mais ────────────────
  const ofertas = new Map<string, { vezes: number; aceitos: number }>()
  let vezes = 0
  let aceitos = 0
  for (const { bump } of pedidos) {
    if (!bump || !noCatalogo.has(bump.produto)) continue
    const conta = ofertas.get(bump.produto) ?? { vezes: 0, aceitos: 0 }
    conta.vezes++
    vezes++
    if (bump.aceito) {
      conta.aceitos++
      aceitos++
    }
    ofertas.set(bump.produto, conta)
  }
  const { forca, taxaInicial, piso, teto } = AJUSTES.bump
  const media = (aceitos + forca * taxaInicial) / (vezes + forca)
  for (const h of handles) {
    if (!comBump.has(h)) continue
    const conta = ofertas.get(h) ?? { vezes: 0, aceitos: 0 }
    const taxa = (conta.aceitos + forca * media) / (conta.vezes + forca)
    modelo.bump[h] = arredonda(Math.min(teto, Math.max(piso, taxa / media)))
  }

  return modelo
}
