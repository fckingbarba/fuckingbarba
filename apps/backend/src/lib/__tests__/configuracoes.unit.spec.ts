import { CHAVE_NO_METADATA, lerConfiguracoes, PADRAO, soOPublico } from "../configuracoes"

const com = (home: unknown) => lerConfiguracoes({ [CHAVE_NO_METADATA]: { home } })

describe("o vídeo da história da marca", () => {
  const video = { url: "https://arquivos.exemplo.com/marca.mp4", largura: 1080, altura: 1920 }

  it("inteiro, passa como veio", () => {
    expect(com({ video }).home.video).toEqual(video)
  })

  it("sem vídeo, a home fica com a foto", () => {
    expect(com({ video: null }).home.video).toBeNull()
    expect(com(undefined).home.video).toBeNull()
    expect(lerConfiguracoes({}).home).toEqual(PADRAO.home)
  })

  it("sem as medidas, não vale: a loja não teria como reservar o espaço", () => {
    expect(com({ video: { url: video.url, largura: 1080 } }).home.video).toBeNull()
    expect(com({ video: { ...video, altura: 0 } }).home.video).toBeNull()
    expect(com({ video: { ...video, largura: 1080.5 } }).home.video).toBeNull()
    expect(com({ video: { ...video, altura: "1920" } }).home.video).toBeNull()
  })

  it("só endereço http(s)", () => {
    expect(com({ video: { ...video, url: "javascript:alert(1)" } }).home.video).toBeNull()
    expect(com({ video: { ...video, url: "/static/marca.mp4" } }).home.video).toBeNull()
    expect(com({ video: { ...video, url: "https://a.com/ tem espaço.mp4" } }).home.video).toBeNull()
  })

  it("é público: a home precisa dele", () => {
    expect(soOPublico(com({ video })).home.video).toEqual(video)
  })

  it("e a cotação de emergência continua fora do público", () => {
    expect(soOPublico(PADRAO)).not.toHaveProperty("cotacao")
  })
})
