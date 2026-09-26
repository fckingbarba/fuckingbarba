import sharp from "sharp"
import { fotoEmJpeg, fotoPrincipal, guardada, guardar, LADO_MAXIMO } from "../foto-do-catalogo"

/**
 * A foto do catálogo dos anúncios: WebP (e PNG transparente) vira JPEG, até
 * 1200 px, e a escolhida é a primeira da galeria do painel.
 */

const imagem = (largura: number, altura: number, formato: "webp" | "png", alfa = false) =>
  sharp({
    create: {
      width: largura,
      height: altura,
      channels: alfa ? 4 : 3,
      background: alfa ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 200, g: 40, b: 40 },
    },
  })
    [formato]()
    .toBuffer()

describe("a foto em JPEG", () => {
  it("WebP vira JPEG, do mesmo tamanho quando cabe", async () => {
    const jpeg = await fotoEmJpeg(await imagem(800, 600, "webp"))
    expect(jpeg).not.toBeNull()
    const info = await sharp(jpeg!).metadata()
    expect(info.format).toBe("jpeg")
    expect([info.width, info.height]).toEqual([800, 600])
  })

  it(`a grande encolhe até ${LADO_MAXIMO} no lado maior, sem cortar`, async () => {
    const info = await sharp((await fotoEmJpeg(await imagem(2400, 1600, "webp")))!).metadata()
    expect([info.width, info.height]).toEqual([1200, 800])
  })

  it("o transparente vira branco, não preto", async () => {
    const jpeg = await fotoEmJpeg(await imagem(40, 40, "png", true))
    const { data } = await sharp(jpeg!).raw().toBuffer({ resolveWithObject: true })
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255])
  })

  it("o que não é imagem, e o vazio, não viram nada", async () => {
    expect(await fotoEmJpeg(Buffer.from("isto não é uma foto"))).toBeNull()
    expect(await fotoEmJpeg(Buffer.alloc(0))).toBeNull()
  })
})

describe("qual foto", () => {
  it("a primeira da galeria, pela ordem do painel; sem galeria, a miniatura", () => {
    expect(
      fotoPrincipal({
        thumbnail: "https://x/miniatura.webp",
        images: [
          { url: "https://x/segunda.webp", rank: 1 },
          null,
          { url: "https://x/primeira.webp", rank: 0 },
        ],
      })
    ).toBe("https://x/primeira.webp")
    expect(fotoPrincipal({ thumbnail: "https://x/miniatura.webp", images: [] })).toBe(
      "https://x/miniatura.webp"
    )
    expect(fotoPrincipal({ images: null })).toBeNull()
  })
})

describe("as já convertidas", () => {
  it("valem um dia, e a mais velha sai quando passa do teto", () => {
    const agora = 1_000_000
    guardar("https://x/a.webp", Buffer.from("a"), agora)
    expect(guardada("https://x/a.webp", agora + 1000)?.toString()).toBe("a")
    expect(guardada("https://x/a.webp", agora + 25 * 60 * 60 * 1000)).toBeNull()

    for (let i = 0; i < 61; i++) guardar(`https://x/${i}.webp`, Buffer.from(String(i)), agora)
    expect(guardada("https://x/0.webp", agora)).toBeNull()
    expect(guardada("https://x/60.webp", agora)?.toString()).toBe("60")
  })
})
