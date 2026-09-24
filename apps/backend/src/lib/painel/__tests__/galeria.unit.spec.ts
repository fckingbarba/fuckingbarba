import { lerVideo, type VideoDaGaleria } from "../../pdp"
import {
  desmontarGaleria,
  fotosDoProduto,
  montarGaleria,
  mudarGaleria,
  type ItemDaGaleria,
} from "../galeria"

/**
 * As fotos da galeria (as do Medusa) e os vídeos da faixa "Vê na prática" (os
 * do `fb_pdp`) numa lista só pro painel: as fotos primeiro, os vídeos depois,
 * cada mudança dentro do próprio tipo.
 */

const video = (url: string, posicao: number): VideoDaGaleria => ({
  url,
  poster: `${url}.webp`,
  largura: 1080,
  altura: 1080,
  duracao: 10,
  posicao,
})
const urls = (itens: ItemDaGaleria[]) => itens.map((i) => (i.tipo === "foto" ? i.url : `▶${i.url}`))

describe("as fotos do produto", () => {
  it("pelo rank; no empate, na ordem em que vieram; sem foto, a thumbnail", () => {
    expect(
      fotosDoProduto({
        images: [
          { url: "c", rank: 2 },
          { url: "a", rank: 0 },
          { url: "b", rank: 0 },
        ],
      })
    ).toEqual(["a", "b", "c"])
    expect(fotosDoProduto({ images: [], thumbnail: "t" })).toEqual(["t"])
    expect(fotosDoProduto({ images: null, thumbnail: null })).toEqual([])
  })
})

describe("montar e desmontar", () => {
  it("as fotos primeiro, depois os vídeos pela posição entre eles", () => {
    const itens = montarGaleria(["f1", "f2"], [video("v1", 1), video("v0", 0), video("v9", 9)])
    expect(urls(itens)).toEqual(["f1", "f2", "▶v0", "▶v1", "▶v9"])
    const { fotos, videos } = desmontarGaleria(itens)
    expect(fotos).toEqual(["f1", "f2"])
    // A posição volta renumerada ENTRE OS VÍDEOS: 0, 1, 2.
    expect(videos.map((v) => [v.url, v.posicao])).toEqual([
      ["v0", 0],
      ["v1", 1],
      ["v9", 2],
    ])
  })

  it("a posição antiga (a casa na galeria, até 24/09) mantém a ordem entre os vídeos", () => {
    // Gravado quando o vídeo ia no meio das fotos: v-b na casa 2, v-a na casa 6.
    const itens = montarGaleria(["f1", "f2", "f3"], [video("v-a", 6), video("v-b", 2)])
    expect(urls(itens)).toEqual(["f1", "f2", "f3", "▶v-b", "▶v-a"])
  })

  it("sem foto nenhuma, só os vídeos", () => {
    expect(urls(montarGaleria([], [video("v1", 3)]))).toEqual(["▶v1"])
  })
})

describe("uma mudança", () => {
  const base = montarGaleria(["f1", "f2"], [video("v1", 0), video("v2", 1)])
  const semPosicao = (v: VideoDaGaleria) => {
    const { posicao: _posicao, ...resto } = v
    return resto
  }

  it("foto entra no fim das fotos; vídeo, no fim dos vídeos; repetido e cheio não", () => {
    const foto = mudarGaleria(base, { acao: "incluir", item: { tipo: "foto", url: "f3" } }, 4)
    expect(foto.ok && urls(foto.itens)).toEqual(["f1", "f2", "f3", "▶v1", "▶v2"])
    const vid = mudarGaleria(
      base,
      { acao: "incluir", item: { tipo: "video", ...semPosicao(video("v3", 0)) } },
      4
    )
    expect(vid.ok && urls(vid.itens)).toEqual(["f1", "f2", "▶v1", "▶v2", "▶v3"])
    expect(mudarGaleria(base, { acao: "incluir", item: { tipo: "foto", url: "f1" } }, 4)).toEqual({
      ok: false,
      motivo: "repetido",
    })
    expect(
      mudarGaleria(
        base,
        { acao: "incluir", item: { tipo: "video", ...semPosicao(video("v3", 0)) } },
        2
      )
    ).toEqual({ ok: false, motivo: "cheia" })
  })

  it("mover troca com o vizinho do MESMO tipo; nas pontas do grupo não anda", () => {
    const v = mudarGaleria(base, { acao: "mover", url: "v2", para: "antes" }, 4)
    expect(v.ok && urls(v.itens)).toEqual(["f1", "f2", "▶v2", "▶v1"])
    const f = mudarGaleria(base, { acao: "mover", url: "f2", para: "antes" }, 4)
    expect(f.ok && urls(f.itens)).toEqual(["f2", "f1", "▶v1", "▶v2"])
    // O primeiro vídeo não passa pra antes das fotos; a última foto não passa pros vídeos.
    expect(mudarGaleria(base, { acao: "mover", url: "v1", para: "antes" }, 4)).toEqual({
      ok: false,
      motivo: "ponta",
    })
    expect(mudarGaleria(base, { acao: "mover", url: "f2", para: "depois" }, 4)).toEqual({
      ok: false,
      motivo: "ponta",
    })
    expect(mudarGaleria(base, { acao: "mover", url: "xx", para: "depois" }, 4)).toEqual({
      ok: false,
      motivo: "nao_achei",
    })
  })

  it("tirar a capa: a próxima foto vira a capa; os vídeos continuam depois", () => {
    const r = mudarGaleria(base, { acao: "tirar", url: "f1" }, 4)
    expect(r.ok && urls(r.itens)).toEqual(["f2", "▶v1", "▶v2"])
  })

  it("dar nome a um vídeo: uma linha, até 40 caracteres; vazio tira o nome; foto não tem nome", () => {
    const r = mudarGaleria(base, { acao: "titular", url: "v1", titulo: "  Como   aplicar " }, 4)
    const v1 = r.ok ? r.itens.find((i) => i.url === "v1") : null
    expect(v1).toMatchObject({ tipo: "video", titulo: "Como aplicar" })
    const longo = mudarGaleria(base, { acao: "titular", url: "v1", titulo: "x".repeat(60) }, 4)
    expect(longo.ok && longo.itens.find((i) => i.url === "v1")).toMatchObject({
      titulo: "x".repeat(40),
    })
    const tirou = mudarGaleria(r.ok ? r.itens : [], { acao: "titular", url: "v1", titulo: " " }, 4)
    expect(tirou.ok && "titulo" in tirou.itens.find((i) => i.url === "v1")!).toBe(false)
    expect(mudarGaleria(base, { acao: "titular", url: "f1", titulo: "Capa" }, 4)).toEqual({
      ok: false,
      motivo: "nao_achei",
    })
  })

  it("o nome vai junto no caminho de volta, e o vídeo gravado com nome é lido com ele", () => {
    const r = mudarGaleria(base, { acao: "titular", url: "v2", titulo: "A textura" }, 4)
    const { videos } = desmontarGaleria(r.ok ? r.itens : [])
    expect(videos[1]).toMatchObject({ url: "v2", titulo: "A textura", posicao: 1 })
    expect(lerVideo({ ...videos[1], titulo: 42 })).not.toHaveProperty("titulo")
    expect(lerVideo(videos[1])).toMatchObject({ titulo: "A textura" })
  })
})
