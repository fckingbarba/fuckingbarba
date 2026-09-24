import { emitirEnvio, gastarEnvio, lerEnvio, tipoDoVideo } from "../videos"

/**
 * O vídeo que sobe direto do navegador: o tipo pelos bytes, e o bilhete —
 * assinado, com prazo, de uso único.
 */

const original = process.env.JWT_SECRET
beforeAll(() => {
  process.env.JWT_SECRET = "segredo-do-teste"
})
afterAll(() => {
  if (original === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = original
})

const caixa = (marca: string) =>
  Buffer.concat([
    Buffer.from([0, 0, 0, 0x20]),
    Buffer.from(`ftyp${marca}`, "latin1"),
    Buffer.alloc(8),
  ])

describe("o tipo do vídeo, pelos primeiros bytes", () => {
  it("MP4 pela caixa ftyp; o .MOV do iPhone tem a marca qt; WebM pelo EBML", () => {
    expect(tipoDoVideo(caixa("isom"))).toBe("video/mp4")
    expect(tipoDoVideo(caixa("mp42"))).toBe("video/mp4")
    expect(tipoDoVideo(caixa("qt  "))).toBe("mov")
    expect(tipoDoVideo(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42]))).toBe("video/webm")
    expect(tipoDoVideo(Buffer.from("<html>não é vídeo</html>"))).toBeNull()
    expect(tipoDoVideo(Buffer.alloc(3))).toBeNull()
  })
})

describe("o bilhete", () => {
  const envio = {
    produtoId: "prod_01",
    membroId: "mem_01",
    tipo: "video/mp4" as const,
    tamanho: 1234,
  }

  it("volta igual, e vale só uma vez", () => {
    const b = emitirEnvio(envio, 1_000)
    const lido = lerEnvio(b, 2_000)
    expect(lido).toMatchObject(envio)
    expect(gastarEnvio(lido!.n, 2_000)).toBe(true)
    expect(gastarEnvio(lido!.n, 3_000)).toBe(false)
  })

  it("mexido, com outra chave ou vencido: não vale", () => {
    const b = emitirEnvio(envio, 1_000)
    const [corpo, assinatura] = b.split(".")
    const outro = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(corpo!, "base64url").toString()), tamanho: 99 })
    ).toString("base64url")
    expect(lerEnvio(`${outro}.${assinatura}`, 2_000)).toBeNull()
    expect(lerEnvio(`${corpo}.x${assinatura!.slice(1)}`, 2_000)).toBeNull()
    expect(lerEnvio(b, 1_000 + 16 * 60 * 1000)).toBeNull()
    process.env.JWT_SECRET = "outro-segredo"
    expect(lerEnvio(b, 2_000)).toBeNull()
    process.env.JWT_SECRET = "segredo-do-teste"
  })
})
