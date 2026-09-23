import type { SugestaoDaSacola } from "./carrinho-visivel"

/**
 * O MOTOR DE RECOMENDAÇÃO — a parte que decide, na hora, com a sacola na mão.
 *
 * Duas telas usam: o "Leva junto" da gaveta (até três produtos) e a oferta
 * do checkout (um, com desconto). Nenhuma das duas é fixa, e ninguém escolhe
 * no admin: o que aparece depende do que está na sacola.
 *
 * ┌─ AS DUAS METADES ──────────────────────────────────────────────────────┐
 * │ O MODELO vem pronto do Medusa (`apps/backend/src/lib/recomendacao.ts`, │
 * │ onde está a conta inteira): pra cada produto, com quem ele combina, e  │
 * │ com que força — aprendido dos pedidos, e da rotina da PDP enquanto não │
 * │ há pedido bastante. A loja guarda o modelo por uma hora                │
 * │ (`modeloDeRecomendacao`, em `lib/medusa.ts`).                          │
 * │                                                                        │
 * │ A DECISÃO é daqui, sem ida ao servidor: com a sacola que a pessoa tem  │
 * │ AGORA, quem fica na frente. É por isso que a gaveta muda a lista no    │
 * │ instante em que um produto entra — sem esperar ninguém.                │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A NOTA DE UM CANDIDATO é a chance de ele ir junto com ALGUM item da
 * sacola — `1 − (1 − a₁)(1 − a₂)…`, e não a soma, que passaria de 100% com
 * três itens fracos — mais um pouco da popularidade dele na loja, que é o
 * desempate quando a sacola não diz nada.
 *
 * Nada aqui decide preço. O desconto da oferta é do Medusa; a nota só
 * escolhe o produto.
 */

/** O que o Medusa manda. Contrato: `Modelo`, em `apps/backend/src/lib/recomendacao.ts`. */
export type ModeloDeRecomendacao = {
  versao: 1
  afinidade: Record<string, Record<string, number>>
  juntos: Record<string, string[]>
  combina: Record<string, string[]>
  popularidade: Record<string, number>
  maisPedidos: string[]
  kits: Record<string, string[]>
  bump: Record<string, number>
}

/** A sacola, do jeito que o motor precisa. */
export type Sacola = {
  /** as variações na sacola — não voltam como sugestão */
  varianteIds: ReadonlySet<string>
  /** os produtos na sacola — é deles que sai a afinidade */
  handles: readonly string[]
}

/**
 * POR QUE aquele produto — é o que a oferta do checkout escreve, e só o que
 * dá pra provar:
 *
 *   juntos  — os PEDIDOS mostram que quem leva `com` leva este também;
 *   combina — a LOJA diz que combinam (a rotina da PDP);
 *   popular — está entre os mais pedidos da loja;
 *   nenhum  — nada disso: a oferta fala só do desconto.
 */
export type Motivo =
  | { tipo: "juntos"; com: string }
  | { tipo: "combina"; com: string }
  | { tipo: "popular" }
  | { tipo: "nenhum" }

export const AJUSTES = {
  /** O quanto a popularidade (de 0 a 1) pesa ao lado da afinidade. */
  popularidade: 0.15,
  /** No "Leva junto": o produto que sozinho fecha o frete grátis vale 35% a mais. */
  freteGratis: 1.35,
  /**
   * Na oferta do checkout, o preço perto do pedido. Oferta de um clique é
   * compra por impulso: até 60% do que já está na sacola, vale inteira; até
   * o valor da sacola, 75%; acima disso, menos da metade.
   */
  preco: { barato: 0.6, fatorMedio: 0.75, fatorCaro: 0.45 },
  /**
   * Um carrinho em dez vê o SEGUNDO colocado, se ele não estiver muito atrás
   * (pelo menos 40% da nota do primeiro). Sem isso o motor só aprende sobre o
   * produto que já oferece — nunca descobriria que outro seria mais aceito.
   * O sorteio é pelo id do carrinho: a mesma pessoa vê sempre a mesma oferta.
   */
  exploracao: { vezes: 0.1, minimo: 0.4 },
} as const

export function sacolaDe(itens: readonly { varianteId: string; handle: string | null }[]): Sacola {
  return {
    varianteIds: new Set(itens.map((i) => i.varianteId)),
    handles: [...new Set(itens.flatMap((i) => (i.handle ? [i.handle] : [])))],
  }
}

/**
 * Quem NÃO pode ser sugerido: o que já está na sacola, as peças de um kit que
 * está nela, e o kit de uma peça que está nela — quem leva o kit completo
 * não precisa de outro shampoo, e quem já pôs o shampoo levaria dois.
 */
export function foraDaSugestao(
  modelo: ModeloDeRecomendacao | null,
  handles: readonly string[]
): Set<string> {
  const fora = new Set(handles)
  for (const [kit, pecas] of Object.entries(modelo?.kits ?? {})) {
    if (fora.has(kit)) pecas.forEach((p) => fora.add(p))
    if (pecas.some((p) => handles.includes(p))) fora.add(kit)
  }
  return fora
}

export function pontuar(
  modelo: ModeloDeRecomendacao,
  handles: readonly string[],
  candidato: string
): { pontos: number; motivo: Motivo } {
  const forca = (a: string) => modelo.afinidade[a]?.[candidato] ?? 0
  const afinidade = 1 - handles.reduce((resto, a) => resto * (1 - forca(a)), 1)
  const pontos = afinidade + AJUSTES.popularidade * (modelo.popularidade[candidato] ?? 0)

  // Do item da sacola que mais puxa o candidato pro que menos puxa. Pedido
  // provado vem antes do que a loja diz, porque é o que a pessoa reconhece.
  const quem = [...handles].sort((a, b) => forca(b) - forca(a))
  const juntos = quem.find((a) => modelo.juntos[a]?.includes(candidato))
  if (juntos) return { pontos, motivo: { tipo: "juntos", com: juntos } }
  const combina = quem.find((a) => modelo.combina[a]?.includes(candidato))
  if (combina) return { pontos, motivo: { tipo: "combina", com: combina } }
  if (modelo.maisPedidos.includes(candidato)) return { pontos, motivo: { tipo: "popular" } }
  return { pontos, motivo: { tipo: "nenhum" } }
}

/* ── o "Leva junto" da gaveta ─────────────────────────────────────────────── */

export type SugestaoEscolhida = SugestaoDaSacola & {
  /** `true` só no primeiro da lista que sozinho fecha o frete grátis */
  libera: boolean
}

/**
 * ATÉ TRÊS PRODUTOS pra gaveta, em ordem de nota.
 *
 * Faltando valor pro frete grátis, quem sozinho fecha a conta ganha peso —
 * e o primeiro deles leva a etiqueta "Libera o frete grátis". A regra do
 * `preco >= falta` é o que mantém a etiqueta honesta: um produto de R$ 20
 * quando faltam R$ 40 não libera nada.
 *
 * SEM MODELO (o Medusa não respondeu, ou a loja está sem o segredo), a
 * gaveta não fica vazia: vale a regra de antes do motor — o que fecha o
 * frete primeiro, do mais barato, depois o resto do mais caro pro mais
 * barato.
 */
export function escolherLevaJunto(
  vitrine: readonly SugestaoDaSacola[],
  sacola: Sacola,
  falta: number | null,
  modelo: ModeloDeRecomendacao | null,
  quantos = 3
): SugestaoEscolhida[] {
  const fora = foraDaSugestao(modelo, sacola.handles)
  const livres = vitrine.filter((s) => !sacola.varianteIds.has(s.varianteId) && !fora.has(s.handle))
  const fecha = (s: SugestaoDaSacola) => falta !== null && falta > 0 && s.preco >= falta

  let ordem: SugestaoDaSacola[]
  if (modelo) {
    ordem = livres
      .map((s) => ({
        s,
        nota:
          pontuar(modelo, sacola.handles, s.handle).pontos * (fecha(s) ? AJUSTES.freteGratis : 1),
      }))
      .sort(
        (x, y) => y.nota - x.nota || x.s.preco - y.s.preco || x.s.handle.localeCompare(y.s.handle)
      )
      .map((x) => x.s)
  } else if (falta === null || falta <= 0) {
    ordem = livres
  } else {
    ordem = [
      ...livres.filter(fecha).sort((a, b) => a.preco - b.preco),
      ...livres.filter((s) => !fecha(s)).sort((a, b) => b.preco - a.preco),
    ]
  }

  const escolhidos = ordem.slice(0, quantos)
  const etiqueta = escolhidos.find(fecha)
  return escolhidos.map((s) => ({ ...s, libera: s === etiqueta }))
}

/* ── a oferta do checkout ─────────────────────────────────────────────────── */

export type CandidatoDoBump = { varianteId: string; handle: string; preco: number }

/**
 * O produto da oferta do checkout, e o porquê — ou `null`.
 *
 * Só entra quem tem a promoção ligada no Medusa (`modelo.bump`): oferecer
 * desconto que o Medusa não daria é a caixinha que marca e desmarca. E a
 * nota leva junto o que o motor aprendeu dos aceites (o peso do
 * `modelo.bump`) e o preço perto do pedido (`AJUSTES.preco`).
 *
 * `semente` é o id do carrinho: a exploração (`AJUSTES.exploracao`) sorteia
 * por ele, então cada recarga da página mostra a MESMA oferta — mudar o
 * frete não troca o produto debaixo do dedo de ninguém.
 *
 * Sem modelo, sem oferta: não dá pra saber quais promoções existem.
 */
export function escolherBump<T extends CandidatoDoBump>(
  catalogo: readonly T[],
  sacola: Sacola,
  subtotal: number,
  modelo: ModeloDeRecomendacao | null,
  semente: string
): { item: T; motivo: Motivo } | null {
  if (!modelo) return null
  const fora = foraDaSugestao(modelo, sacola.handles)
  const { barato, fatorMedio, fatorCaro } = AJUSTES.preco
  const peloPreco = (preco: number) =>
    preco <= subtotal * barato ? 1 : preco <= subtotal ? fatorMedio : fatorCaro

  const notas = catalogo
    .filter(
      (c) =>
        modelo.bump[c.handle] !== undefined &&
        !sacola.varianteIds.has(c.varianteId) &&
        !fora.has(c.handle)
    )
    .map((c) => {
      const { pontos, motivo } = pontuar(modelo, sacola.handles, c.handle)
      return { item: c, motivo, nota: pontos * modelo.bump[c.handle] * peloPreco(c.preco) }
    })
    .filter((x) => x.nota > 0)
    .sort(
      (x, y) =>
        y.nota - x.nota || x.item.preco - y.item.preco || x.item.handle.localeCompare(y.item.handle)
    )

  const [primeiro, segundo] = notas
  if (!primeiro) return null
  const explora =
    segundo !== undefined &&
    segundo.nota >= primeiro.nota * AJUSTES.exploracao.minimo &&
    sorteio(semente) < AJUSTES.exploracao.vezes
  const { item, motivo } = explora ? segundo : primeiro
  return { item, motivo }
}

/**
 * O nome do produto da sacola, curto, pra caber na frase da oferta:
 *
 *   "Óleo para Barba FuckingBarba 30ml"                  → "Óleo para Barba"
 *   "Kit Completo FuckingBarba — Shampoo, Balm e Óleo"   → "Kit Completo"
 *
 * Sem a marca (junta ou separada — a loja inteira é dela), sem o tamanho, e
 * sem o que vem depois do travessão, que no kit é a lista do que vem nele.
 */
export function nomeCurto(nome: string): string {
  const curto = nome
    .split(/\s[—–-]\s/)[0]
    .replace(/fucking\s*barba/gi, "")
    .replace(/\b\d+([.,]\d+)?\s?(ml|g|kg|l)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
  return curto || nome
}

/** Um número entre 0 e 1 que é sempre o mesmo pro mesmo texto (FNV-1a). */
export function sorteio(texto: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 0x100000000
}
