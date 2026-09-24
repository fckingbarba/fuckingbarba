import {
  aplicarPolitica,
  CHAVE_NO_METADATA,
  lerConfiguracoes,
  PADRAO,
  soOPublico,
  type PoliticaDeFrete,
} from "../configuracoes"

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

describe("o frete grátis na mesma entrega (24/09)", () => {
  const gratis: PoliticaDeFrete = {
    modo: "gratis",
    piso: 149.9,
    alvo: "mais-barata",
    tetoDeCusto: null,
  }
  const preco = (opcoes: ReturnType<typeof aplicarPolitica>, id: string) =>
    opcoes.find((o) => o.id === id)?.preco

  it("o mesmo serviço nas duas faixas: as duas ficam grátis", () => {
    const r = aplicarPolitica(
      gratis,
      [
        { id: "economica", preco: 23.7, servico: "04510" },
        { id: "expressa", preco: 23.7, servico: "04510" },
      ],
      158.7
    )
    expect(preco(r, "economica")).toBe(0)
    expect(preco(r, "expressa")).toBe(0)
  })

  it("serviços diferentes: só a mais barata fica grátis, a expressa segue cobrando", () => {
    const r = aplicarPolitica(
      gratis,
      [
        { id: "economica", preco: 23.7, servico: "04510" },
        { id: "expressa", preco: 31.9, servico: "LOG01" },
      ],
      158.7
    )
    expect(preco(r, "economica")).toBe(0)
    expect(preco(r, "expressa")).toBe(31.9)
  })

  it("mesmo preço, serviços diferentes: continua só a primeira", () => {
    const r = aplicarPolitica(
      gratis,
      [
        { id: "economica", preco: 23.7, servico: "04510" },
        { id: "expressa", preco: 23.7, servico: "LOG01" },
      ],
      158.7
    )
    expect(preco(r, "economica")).toBe(0)
    expect(preco(r, "expressa")).toBe(23.7)
  })

  it("sem o serviço informado, vale a regra de antes (só a primeira)", () => {
    const r = aplicarPolitica(
      gratis,
      [
        { id: "economica", preco: 23.7 },
        { id: "expressa", preco: 23.7 },
      ],
      158.7
    )
    expect(preco(r, "economica")).toBe(0)
    expect(preco(r, "expressa")).toBe(23.7)
  })

  it("abaixo do piso, ninguém muda", () => {
    const r = aplicarPolitica(
      gratis,
      [
        { id: "economica", preco: 23.7, servico: "04510" },
        { id: "expressa", preco: 23.7, servico: "04510" },
      ],
      100
    )
    expect(preco(r, "economica")).toBe(23.7)
    expect(preco(r, "expressa")).toBe(23.7)
  })

  it("o teto continua valendo pro mesmo serviço", () => {
    const r = aplicarPolitica(
      { ...gratis, tetoDeCusto: 20 },
      [
        { id: "economica", preco: 23.7, servico: "04510" },
        { id: "expressa", preco: 23.7, servico: "04510" },
      ],
      158.7
    )
    expect(preco(r, "economica")).toBe(23.7)
    expect(preco(r, "expressa")).toBe(23.7)
  })
})
