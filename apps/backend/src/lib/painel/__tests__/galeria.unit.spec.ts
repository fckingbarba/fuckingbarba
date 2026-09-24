import type { VideoDaGaleria } from "../../pdp"
import {
  desmontarGaleria,
  fotosDoProduto,
  montarGaleria,
  mudarGaleria,
  type ItemDaGaleria,
} from "../galeria"

/**
 * A galeria da dobra: as fotos do Medusa e os vídeos do `fb_pdp` numa lista
 * só, a capa sempre foto, uma mudança por vez.
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
  it("o vídeo entra na posição dele, nunca na frente da capa", () => {
    const itens = montarGaleria(["f1", "f2"], [video("v1", 1), video("v0", 0), video("v9", 9)])
    expect(urls(itens)).toEqual(["f1", "▶v0", "▶v1", "f2", "▶v9"])
    const { fotos, videos } = desmontarGaleria(itens)
    expect(fotos).toEqual(["f1", "f2"])
    expect(videos.map((v) => [v.url, v.posicao])).toEqual([
      ["v0", 1],
      ["v1", 2],
      ["v9", 4],
    ])
  })

  it("sem foto nenhuma, os vídeos ficam como estão", () => {
    expect(urls(montarGaleria([], [video("v1", 3)]))).toEqual(["▶v1"])
  })
})

describe("uma mudança", () => {
  const base = montarGaleria(["f1", "f2"], [video("v1", 2)])

  it("incluir vai pro fim; repetido e cheio não", () => {
    const r = mudarGaleria(base, { acao: "incluir", item: { tipo: "foto", url: "f3" } }, 4)
    expect(r.ok && urls(r.itens)).toEqual(["f1", "f2", "▶v1", "f3"])
    expect(mudarGaleria(base, { acao: "incluir", item: { tipo: "foto", url: "f1" } }, 4)).toEqual({
      ok: false,
      motivo: "repetido",
    })
    const { posicao: _, ...v2 } = video("v2", 0)
    expect(mudarGaleria(base, { acao: "incluir", item: { tipo: "video", ...v2 } }, 1)).toEqual({
      ok: false,
      motivo: "cheia",
    })
  })

  it("foto que entra numa galeria só de vídeos vira a capa", () => {
    const soVideo = montarGaleria([], [video("v1", 0)])
    const r = mudarGaleria(soVideo, { acao: "incluir", item: { tipo: "foto", url: "f1" } }, 4)
    expect(r.ok && urls(r.itens)).toEqual(["f1", "▶v1"])
  })

  it("mover anda uma casa; vídeo não vai pra capa; nas pontas não anda", () => {
    const r = mudarGaleria(base, { acao: "mover", url: "v1", para: "antes" }, 4)
    expect(r.ok && urls(r.itens)).toEqual(["f1", "▶v1", "f2"])
    const capa = mudarGaleria(r.ok ? r.itens : [], { acao: "mover", url: "v1", para: "antes" }, 4)
    expect(capa).toEqual({ ok: false, motivo: "capa" })
    expect(mudarGaleria(base, { acao: "mover", url: "v1", para: "depois" }, 4)).toEqual({
      ok: false,
      motivo: "ponta",
    })
    expect(mudarGaleria(base, { acao: "mover", url: "xx", para: "depois" }, 4)).toEqual({
      ok: false,
      motivo: "nao_achei",
    })
  })

  it("tirar a capa: a próxima foto vem pra frente, mesmo com vídeo no meio", () => {
    const comVideoNoMeio = montarGaleria(["f1", "f2"], [video("v1", 1)])
    const r = mudarGaleria(comVideoNoMeio, { acao: "tirar", url: "f1" }, 4)
    expect(r.ok && urls(r.itens)).toEqual(["f2", "▶v1"])
  })
})
