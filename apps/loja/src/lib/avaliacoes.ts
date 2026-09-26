import type { Depoimento } from "../conteudo/depoimentos"

/**
 * OS SORTEIOS DE DEPOIMENTO — a esteira da home ("Nossos clientes nos amam")
 * e os três da página do produto —, sem servidor nem navegador: dá pra
 * conferir com o `ferramentas/conferir-esteira.mjs`.
 *
 * Na esteira, até `POR_PRODUTO_NA_ESTEIRA` de cada produto, sorteadas a cada
 * visita, repartidas em duas fileiras e a ordem embaralhada. Com todas as
 * avaliações da loja na esteira, ela crescia sem fim e corria cada vez mais
 * rápido (a volta inteira tinha tempo fixo).
 *
 * Vale igual pra avaliação e pra trecho de entrevista (`Depoimento`): o
 * sorteio só olha o produto. Sem este limite, as 245 entradas da PR #90 (os
 * trechos de hoje, com as cópias do Fator nos kits) viravam 1.470 cartões na
 * home — tudo, três vezes, mais a cópia da esteira —, e o Lighthouse do CI
 * caiu pra 0,54.
 *
 * Só TIPO vem de `conteudo/depoimentos`: os sorteios rodam no navegador, e um
 * valor importado de lá levaria o arquivo inteiro, com os textos, pro
 * JavaScript da página (e este arquivo é lido direto pelo conferidor, sem
 * bundler).
 */
export const POR_PRODUTO_NA_ESTEIRA = 4

/**
 * Quantos cartões uma fila tem, no mínimo. A esteira corre duas filas iguais
 * até a metade e volta pro começo: fila mais estreita que a tela deixa um
 * buraco antes de voltar. Oito cartões (de até 380px, com o vão) cobrem uma
 * tela de 3000px.
 */
export const MINIMO_NA_FILA = 8

/**
 * O ritmo da esteira, por cartão: o do protótipo aprovado (seis cartões em
 * 46s). A volta dura o número de cartões vezes isto — com mais avaliações,
 * ela fica mais longa, e não mais rápida.
 */
export const SEGUNDOS_POR_CARTAO = 7.5

/**
 * O ritmo da SEGUNDA fileira, a que corre pro outro lado: o do protótipo
 * (seis cartões em 58s). Um pouco mais lenta que a primeira, como lá — as
 * duas não andam no mesmo compasso.
 */
export const SEGUNDOS_POR_CARTAO_NA_VOLTA = 9.5

/**
 * Quantos depoimentos a página do produto mostra: três, sorteados a cada
 * visita — a grade do protótipo. Com todos, a página de cada produto com
 * trechos terminava numa parede de vinte cartões de texto inteiro.
 */
export const NA_PAGINA_DO_PRODUTO = 3

/** Trecho não tem nome: aí o texto sozinho é a chave. */
const chave = (a: Depoimento) =>
  `${"nome" in a ? a.nome.trim().toLowerCase() : ""}|${a.texto
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()}`

/**
 * A MESMA AVALIAÇÃO EM VÁRIOS PRODUTOS CONTA UMA VEZ SÓ — a mesma pessoa com
 * o mesmo texto, posta no produto e nos kits dele. Fica a primeira, com o
 * produto dela. Sem isto, a esteira podia mostrar o mesmo cartão duas vezes
 * lado a lado, e a nota média dizia "em 100 avaliações" com 20 escritas. O
 * mesmo texto de trecho, idem.
 */
export function semRepetidas<T extends Depoimento>(avaliacoes: T[]): T[] {
  const vistas = new Set<string>()
  return avaliacoes.filter((a) => {
    const k = chave(a)
    if (vistas.has(k)) return false
    vistas.add(k)
    return true
  })
}

/** Fisher–Yates, numa cópia. */
function embaralhar<T>(lista: T[], aleatorio: () => number): T[] {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

/** Os depoimentos de cada produto, na ordem da lista; os sem produto fazem um grupo deles. */
function gruposPorProduto<T extends Depoimento>(lista: T[]): T[][] {
  const grupos = new Map<string, T[]>()
  for (const a of lista) {
    const grupo = grupos.get(a.produtoHandle ?? "")
    if (grupo) grupo.push(a)
    else grupos.set(a.produtoHandle ?? "", [a])
  }
  return [...grupos.values()]
}

/**
 * Até `porProduto` de cada produto (as sem produto fazem um grupo delas),
 * sorteadas, e a lista toda embaralhada — os produtos se alternam na esteira.
 * `aleatorio` decide o sorteio: a mesma sequência dá o mesmo resultado.
 */
export function sortearDaEsteira<T extends Depoimento>(
  avaliacoes: T[],
  porProduto: number,
  aleatorio: () => number
): T[] {
  const escolhidas = gruposPorProduto(avaliacoes).flatMap((grupo) =>
    embaralhar(grupo, aleatorio).slice(0, porProduto)
  )
  return embaralhar(escolhidas, aleatorio)
}

/**
 * As DUAS FILEIRAS da esteira, como no protótipo: a primeira corre pra
 * esquerda e a segunda pra direita (`.amam__esteira--volta`). O sorteio se
 * reparte produto por produto, um cartão pra cada lado: cada fileira fica
 * com a metade dos de cada produto, as duas com o mesmo tanto (uma com um a
 * mais, no máximo), e a partir de dois cartões nenhuma fica vazia. Cada uma
 * sai embaralhada de novo — repartidos assim, os produtos andariam em bloco.
 */
export function emDuasFileiras<T extends Depoimento>(
  sorteio: T[],
  aleatorio: () => number
): [T[], T[]] {
  const fileiras: [T[], T[]] = [[], []]
  let lado = 0
  for (const grupo of gruposPorProduto(sorteio))
    for (const a of grupo) {
      fileiras[lado].push(a)
      lado = 1 - lado
    }
  return [embaralhar(fileiras[0], aleatorio), embaralhar(fileiras[1], aleatorio)]
}

/**
 * `quantos` da lista, sorteados e em ordem sorteada — a lista inteira, se
 * ela tiver menos. É o sorteio da página do produto: avaliação e trecho com
 * a mesma chance, sem escolher "os melhores".
 */
export function sortear<T>(lista: T[], quantos: number, aleatorio: () => number): T[] {
  return embaralhar(lista, aleatorio).slice(0, quantos)
}

/**
 * Uma sequência de números entre 0 e 1 que é sempre a mesma pra mesma
 * semente (mulberry32). É o que deixa o servidor e a primeira renderização
 * do navegador desenharem o MESMO sorteio — senão a hidratação não bate.
 */
export function sequencia(semente: number): () => number {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A lista repetida até ter pelo menos `minimo` cartões (vazia continua vazia). */
export function encherAFila<T>(lista: T[], minimo: number): T[] {
  if (!lista.length) return []
  const fila: T[] = []
  while (fila.length < minimo) fila.push(...lista)
  return fila
}
