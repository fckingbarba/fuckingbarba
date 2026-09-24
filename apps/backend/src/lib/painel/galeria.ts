import { tituloDoVideo, type VideoDaGaleria, type VideoDaPdp } from "../pdp"

/**
 * AS FOTOS E OS VÍDEOS DO PRODUTO — o que o painel edita numa lista só.
 *
 * As FOTOS são as do produto no Medusa (`images`, pela ordem `rank`, e a
 * `thumbnail` = a primeira): é delas que a vitrine, o Google e o link no
 * WhatsApp tiram a imagem, e são elas que a galeria da dobra mostra. Os
 * VÍDEOS moram no `fb_pdp` (`videos`) e vão pra faixa "Vê na prática", FORA
 * da galeria (pedido da loja em 24/09) — cada um com a posição dele entre os
 * vídeos.
 *
 * A lista junta as duas coisas, as fotos primeiro e os vídeos depois, e cada
 * mudança anda DENTRO do tipo: mover uma foto troca com a foto vizinha,
 * mover um vídeo troca com o vídeo vizinho. Assim a capa é sempre foto sem
 * regra nenhuma a mais. Código puro, com testes.
 */

export type ItemDaGaleria = { tipo: "foto"; url: string } | ({ tipo: "video" } & VideoDaPdp)

/**
 * As fotos do produto, na ordem da loja: `rank`, e no empate a ordem em que
 * o Medusa devolveu (as que vieram da importação têm todas `rank` 0). Sem
 * foto nenhuma, a `thumbnail` — como a dobra faz.
 */
export function fotosDoProduto(p: {
  thumbnail?: string | null
  images?: ({ url?: string | null; rank?: number | null } | null)[] | null
}): string[] {
  const fotos = (p.images ?? [])
    .map((img, i) => ({ url: img?.url ?? "", rank: img?.rank ?? 0, i }))
    .filter((f) => f.url)
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((f) => f.url)
  const unicas = [...new Set(fotos)]
  return unicas.length ? unicas : p.thumbnail ? [p.thumbnail] : []
}

/** Fotos numa galeria — a dobra mostra as miniaturas numa fileira só. */
export const LIMITE_DE_FOTOS = 12

/** As fotos na ordem delas, e depois os vídeos, pela posição entre eles. */
export function montarGaleria(
  fotos: readonly string[],
  videos: readonly VideoDaGaleria[]
): ItemDaGaleria[] {
  return [
    ...fotos.map((url): ItemDaGaleria => ({ tipo: "foto", url })),
    ...[...videos]
      .sort((a, b) => a.posicao - b.posicao)
      .map(({ posicao: _posicao, ...video }): ItemDaGaleria => ({ tipo: "video", ...video })),
  ]
}

/** O caminho de volta: as fotos na ordem, e cada vídeo com a posição dele ENTRE OS VÍDEOS. */
export function desmontarGaleria(itens: readonly ItemDaGaleria[]): {
  fotos: string[]
  videos: VideoDaGaleria[]
} {
  const fotos: string[] = []
  const videos: VideoDaGaleria[] = []
  for (const item of itens) {
    if (item.tipo === "foto") fotos.push(item.url)
    else {
      const { tipo: _tipo, ...video } = item
      videos.push({ ...video, posicao: videos.length })
    }
  }
  return { fotos, videos }
}

export type PedidoNaGaleria =
  | { acao: "incluir"; item: ItemDaGaleria }
  | { acao: "mover"; url: string; para: "antes" | "depois" }
  | { acao: "tirar"; url: string }
  /** O nome do vídeo na faixa "Vê na prática"; vazio tira o nome. */
  | { acao: "titular"; url: string; titulo: string }

export type GaleriaMudada =
  | { ok: true; itens: ItemDaGaleria[] }
  | { ok: false; motivo: "nao_achei" | "ponta" | "capa" | "repetido" | "cheia" }

/** As fotos primeiro, os vídeos depois, cada grupo na ordem em que está. */
function emOrdem(itens: readonly ItemDaGaleria[]): ItemDaGaleria[] {
  return [...itens.filter((i) => i.tipo === "foto"), ...itens.filter((i) => i.tipo === "video")]
}

/**
 * UMA mudança, sobre a lista gravada AGORA: incluir (a foto no fim das
 * fotos, o vídeo no fim dos vídeos), andar uma casa entre os do MESMO tipo,
 * tirar, e dar nome a um vídeo. Uma foto nunca passa pra depois de um vídeo,
 * nem o contrário — a `capa` continua recusada por garantia, mas não acontece.
 */
export function mudarGaleria(
  itens: readonly ItemDaGaleria[],
  pedido: PedidoNaGaleria,
  limiteDeVideos: number
): GaleriaMudada {
  const atual = emOrdem(itens)

  if (pedido.acao === "incluir") {
    const { item } = pedido
    if (atual.some((i) => i.url === item.url)) return { ok: false, motivo: "repetido" }
    const mesmoTipo = atual.filter((i) => i.tipo === item.tipo).length
    if (mesmoTipo >= (item.tipo === "foto" ? LIMITE_DE_FOTOS : limiteDeVideos))
      return { ok: false, motivo: "cheia" }
    return { ok: true, itens: emOrdem([...atual, item]) }
  }

  const i = atual.findIndex((x) => x.url === pedido.url)
  if (i < 0) return { ok: false, motivo: "nao_achei" }
  const alvo = atual[i]!

  if (pedido.acao === "tirar") return { ok: true, itens: atual.filter((_, k) => k !== i) }

  if (pedido.acao === "titular") {
    if (alvo.tipo !== "video") return { ok: false, motivo: "nao_achei" }
    const titulo = tituloDoVideo(pedido.titulo)
    const { titulo: _antigo, ...semTitulo } = alvo
    const novo: ItemDaGaleria = titulo ? { ...semTitulo, titulo } : semTitulo
    return { ok: true, itens: atual.map((x, k) => (k === i ? novo : x)) }
  }

  // O vizinho do MESMO tipo, na direção pedida.
  const passo = pedido.para === "antes" ? -1 : 1
  let j = i + passo
  while (j >= 0 && j < atual.length && atual[j]!.tipo !== alvo.tipo) j += passo
  if (j < 0 || j >= atual.length) return { ok: false, motivo: "ponta" }
  const novos = [...atual]
  ;[novos[i], novos[j]] = [novos[j]!, novos[i]!]
  if (novos[0]!.tipo === "video" && novos.some((x) => x.tipo === "foto"))
    return { ok: false, motivo: "capa" }
  return { ok: true, itens: novos }
}
