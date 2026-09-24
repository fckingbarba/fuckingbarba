import sharp from "sharp"
import { comFundosDoArmazenamento, ehDoArmazenamento, prepararImagem } from "../imagens"
import { PDP_VAZIA, type Pdp } from "../pdp"

/**
 * A imagem que sobe pelo painel: sai WebP, na orientação certa, sem EXIF e
 * no máximo do tamanho que a loja mostra. As imagens são feitas aqui, na
 * hora.
 */

const imagem = (largura: number, altura: number) =>
  sharp({ create: { width: largura, height: altura, channels: 3, background: "#4fe4b6" } })

describe("a imagem pronta pra loja", () => {
  it("PNG grande vira WebP, encolhido até a largura do computador", async () => {
    const r = await prepararImagem(await imagem(4000, 1200).png().toBuffer(), "fundo-computador")
    expect(r.ok && [r.largura, r.altura]).toEqual([2880, 864])
    expect(r.ok && (await sharp(r.bytes).metadata()).format).toBe("webp")
  })

  it("a pequena não é esticada", async () => {
    const r = await prepararImagem(await imagem(800, 1200).jpeg().toBuffer(), "fundo-celular")
    expect(r.ok && [r.largura, r.altura]).toEqual([800, 1200])
  })

  it("a foto do celular com a etiqueta de girar sai em pé, e sem o EXIF", async () => {
    const deitada = await imagem(1600, 900).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    const r = await prepararImagem(deitada, "fundo-celular")
    expect(r.ok && [r.largura, r.altura]).toEqual([900, 1600])
    expect(r.ok && (await sharp(r.bytes).metadata()).exif).toBeUndefined()
  })

  it("recusa o que não é JPG, PNG ou WebP, e o arquivo quebrado", async () => {
    expect(await prepararImagem(await imagem(10, 10).gif().toBuffer(), "fundo-computador")).toEqual(
      {
        ok: false,
        motivo: "tipo",
      }
    )
    expect(await prepararImagem(Buffer.from("não é imagem"), "fundo-computador")).toEqual({
      ok: false,
      motivo: "tipo",
    })
    const quebrado = (await imagem(100, 100).png().toBuffer()).subarray(0, 60)
    expect(await prepararImagem(quebrado, "fundo-computador")).toEqual({
      ok: false,
      motivo: "ilegivel",
    })
  })
})

describe("a imagem está no armazenamento da loja?", () => {
  const BASE = "https://ref.supabase.co/storage/v1/object/public/produtos"
  it("em produção, só o endereço público do Supabase", () => {
    expect(ehDoArmazenamento(`${BASE}/fundo.webp`, BASE)).toBe(true)
    expect(ehDoArmazenamento(`${BASE}-outro/fundo.webp`, BASE)).toBe(false)
    expect(ehDoArmazenamento("https://rastreio.exemplo/px.gif", BASE)).toBe(false)
  })
  it("sem o Supabase (a máquina de quem desenvolve), o /static/ do Medusa", () => {
    expect(ehDoArmazenamento("http://localhost:9000/static/1-fundo.webp", undefined)).toBe(true)
    expect(ehDoArmazenamento("https://x.exemplo/fundo.webp", undefined)).toBe(false)
  })
})

describe("os fundos que a loja mostra", () => {
  const BASE = "https://ref.supabase.co/storage/v1/object/public/produtos"
  const pdp = (fundos: Pdp["fundos"]): Pdp => ({ ...PDP_VAZIA, fundos })
  it("o fundo de fora some; a foto do celular de fora cai sozinha, a do computador fica", () => {
    const r = comFundosDoArmazenamento(
      pdp({
        "produto.promessa": { imagem: "https://rastreio.exemplo/px.gif", veu: 70 },
        "produto.quem": {
          imagem: `${BASE}/quem.webp`,
          imagemCelular: "https://rastreio.exemplo/cel.jpg",
          veu: 90,
        },
        "produto.tempo": { imagem: `${BASE}/t.webp`, imagemCelular: `${BASE}/t-cel.webp` },
      }),
      BASE
    )
    expect(r.fundos).toEqual({
      "produto.quem": { imagem: `${BASE}/quem.webp`, veu: 90 },
      "produto.tempo": { imagem: `${BASE}/t.webp`, imagemCelular: `${BASE}/t-cel.webp` },
    })
  })
})
