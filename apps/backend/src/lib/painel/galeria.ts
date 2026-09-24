import type { VideoDaGaleria, VideoDaPdp } from "../pdp"

/**
 * A GALERIA DA DOBRA — as fotos e os vídeos, na ordem da página.
 *
 * As FOTOS são as do produto no Medusa (`images`, pela ordem `rank`, e a
 * `thumbnail` = a primeira): é delas que a vitrine, o Google e o link no
 * WhatsApp tiram a imagem. Os VÍDEOS moram no `fb_pdp` (`videos`), cada um
 * com a posição dele na lista. Juntar as duas coisas aqui, num lugar só, é o
 * que garante que o painel e a loja mostram a mesma ordem (a loja faz a
 * mesma conta em `apps/loja/src/lib/pdp.ts`).
 *
 * A CAPA É SEMPRE FOTO: vídeo nunca fica na frente da primeira foto. Código
 * puro, com testes.
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

export function montarGaleria(
  fotos: readonly string[],
  videos: readonly VideoDaGaleria[]
): ItemDaGaleria[] {
  const itens: ItemDaGaleria[] = fotos.map((url) => ({ tipo: "foto", url }))
  let ultimo = -1
  for (const { posicao, ...video } of [...videos].sort((a, b) => a.posicao - b.posicao)) {
    // Depois da capa, e depois do vídeo anterior: a ordem entre eles não se inverte.
    const onde = Math.min(Math.max(fotos.length ? 1 : 0, posicao, ultimo + 1), itens.length)
    itens.splice(onde, 0, { tipo: "video", ...video })
    ultimo = onde
  }
  return itens
}

/** O caminho de volta: as fotos na ordem, e cada vídeo com a posição dele. */
export function desmontarGaleria(itens: readonly ItemDaGaleria[]): {
  fotos: string[]
  videos: VideoDaGaleria[]
} {
  const fotos: string[] = []
  const videos: VideoDaGaleria[] = []
  itens.forEach((item, posicao) => {
    if (item.tipo === "foto") fotos.push(item.url)
    else {
      const { tipo: _tipo, ...video } = item
      videos.push({ ...video, posicao })
    }
  })
  return { fotos, videos }
}

export type PedidoNaGaleria =
  | { acao: "incluir"; item: ItemDaGaleria }
  | { acao: "mover"; url: string; para: "antes" | "depois" }
  | { acao: "tirar"; url: string }

export type GaleriaMudada =
  | { ok: true; itens: ItemDaGaleria[] }
  | { ok: false; motivo: "nao_achei" | "ponta" | "capa" | "repetido" | "cheia" }

/** Com a primeira foto na frente, se um vídeo ficou lá (depois de tirar a capa). */
function comCapa(itens: ItemDaGaleria[]): ItemDaGaleria[] {
  const foto = itens.findIndex((i) => i.tipo === "foto")
  if (foto <= 0) return itens
  return [itens[foto]!, ...itens.filter((_, i) => i !== foto)]
}

/**
 * UMA mudança na galeria, sobre a que está gravada AGORA: incluir no fim,
 * andar uma casa pra um lado, tirar. Mover que poria um vídeo na capa é
 * recusado (`capa`) — a tela nem oferece a seta.
 */
export function mudarGaleria(
  itens: readonly ItemDaGaleria[],
  pedido: PedidoNaGaleria,
  limiteDeVideos: number
): GaleriaMudada {
  if (pedido.acao === "incluir") {
    const { item } = pedido
    if (itens.some((i) => i.url === item.url)) return { ok: false, motivo: "repetido" }
    const mesmoTipo = itens.filter((i) => i.tipo === item.tipo).length
    if (mesmoTipo >= (item.tipo === "foto" ? LIMITE_DE_FOTOS : limiteDeVideos))
      return { ok: false, motivo: "cheia" }
    return { ok: true, itens: comCapa([...itens, item]) }
  }

  const i = itens.findIndex((x) => x.url === pedido.url)
  if (i < 0) return { ok: false, motivo: "nao_achei" }

  if (pedido.acao === "tirar") return { ok: true, itens: comCapa(itens.filter((_, k) => k !== i)) }

  const j = pedido.para === "antes" ? i - 1 : i + 1
  if (j < 0 || j >= itens.length) return { ok: false, motivo: "ponta" }
  const novos = [...itens]
  ;[novos[i], novos[j]] = [novos[j]!, novos[i]!]
  if (novos[0]!.tipo === "video" && novos.some((x) => x.tipo === "foto"))
    return { ok: false, motivo: "capa" }
  return { ok: true, itens: novos }
}
