import {
  comVideoDoAdmin,
  faltandoNaSecaoDaHome,
  homeDoSite,
  lerHome,
  lerSecaoDaHome,
  SEMENTE_DA_HOME,
  urlsDaSecaoDaHome,
} from "../home"

/**
 * A home (`fb_home`, no metadata da loja) como a loja e o painel leem: o
 * que passa, o que cai e vira o texto de fábrica, e o que o editor avisa
 * que falta.
 */

const home = (fb_home: unknown) => lerHome({ fb_home })

describe("a home guardada", () => {
  it("sem nada guardado, a loja recebe a home de fábrica, na ordem do registro", () => {
    const site = homeDoSite(lerHome({}))
    // O vídeo da história vai sempre, nem que seja `null` (ver `homeDoSite`).
    expect(site.conteudo).toEqual({
      ...SEMENTE_DA_HOME,
      sobre: { ...SEMENTE_DA_HOME.sobre, video: null },
    })
    expect(site.layout).toEqual({})
  })

  it("a seção salva vale; a quebrada cai e volta o texto de fábrica", () => {
    const h = home({
      publicado: {
        conteudo: {
          vitrine: { titulo: "  Os mais pedidos  " },
          colecao: { titulo: "" },
          banner: { chapeu: "Black", titulo: "Tudo com 20%" },
        },
        layout: { visibilidade: { "home.amam": false, "home.x": "sim" }, ordem: ["home.sobre", 3] },
      },
    })
    const site = homeDoSite(h)
    expect(site.conteudo.vitrine).toEqual({ titulo: "Os mais pedidos" })
    expect(site.conteudo.colecao).toEqual(SEMENTE_DA_HOME.colecao)
    expect(site.conteudo.banner).toEqual(SEMENTE_DA_HOME.banner)
    expect(site.layout).toEqual({ visibilidade: { "home.amam": false }, ordem: ["home.sobre"] })
  })

  it("o rascunho nunca vai pra loja", () => {
    const h = home({
      publicado: { conteudo: {}, layout: {} },
      rascunho: { conteudo: { vitrine: { titulo: "Rascunho" } }, layout: {} },
      publicadoEm: "2026-09-24T12:00:00.000Z",
      publicadoPor: "Ana",
    })
    expect(h.rascunho?.conteudo.vitrine).toEqual({ titulo: "Rascunho" })
    expect(homeDoSite(h).conteudo.vitrine).toEqual(SEMENTE_DA_HOME.vitrine)
    expect(h.publicadoPor).toBe("Ana")
  })

  it("data de publicação que não é data some", () => {
    expect(home({ publicadoEm: "ontem" }).publicadoEm).toBeNull()
  })

  it("os limites: duas vantagens, três passos, palco de pelo menos dois", () => {
    const palco = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...SEMENTE_DA_HOME.altaPerformance.produtos[0],
        produto: `p${i}`,
        passos: ["a", "b", "c", "d"],
      }))
    const h = home({
      publicado: {
        conteudo: {
          trustbar: {
            vantagens: [
              { titulo: "A", detalhe: "a" },
              { titulo: "B", detalhe: "" },
              { titulo: "C", detalhe: "c" },
              { titulo: "D", detalhe: "d" },
            ],
          },
          altaPerformance: { produtos: palco(1) },
        },
      },
    })
    expect(h.publicado.conteudo.trustbar?.vantagens.map((v) => v.titulo)).toEqual(["A", "C"])
    // Um produto só: o palco não vale, e fica o de fábrica.
    expect(h.publicado.conteudo.altaPerformance).toBeUndefined()
    const dois = home({ publicado: { conteudo: { altaPerformance: { produtos: palco(2) } } } })
    expect(dois.publicado.conteudo.altaPerformance?.produtos[0].passos).toEqual(["a", "b", "c"])
  })
})

describe("o editor da seção", () => {
  it("diz o que falta, com o caminho do item no grupo", () => {
    expect(faltandoNaSecaoDaHome("banner", { slides: [{ produto: "kit", titulo: "" }] })).toEqual([
      "slides.0.imagem",
      "slides.0.titulo",
    ])
    expect(
      faltandoNaSecaoDaHome("hero", {
        chapeu: "x",
        titulo: "y",
        chamada: "z",
        comparativo: [{ rotulo: "Ativos", valor: "" }, {}],
      })
    ).toEqual(["comparativo.0.valor"])
  })

  it("grupo opcional pode ficar vazio; o obrigatório, não", () => {
    expect(faltandoNaSecaoDaHome("hero", { chapeu: "x", titulo: "y", chamada: "z" })).toEqual([])
    expect(faltandoNaSecaoDaHome("trustbar", { vantagens: [{}] })).toEqual(["vantagens"])
  })

  it("o palco pede dois produtos inteiros", () => {
    const um = { ...SEMENTE_DA_HOME.altaPerformance.produtos[0] }
    expect(faltandoNaSecaoDaHome("altaPerformance", { produtos: [um] })).toEqual(["produtos"])
    expect(
      faltandoNaSecaoDaHome("altaPerformance", { produtos: [um, { produto: "b" }] })
    ).toContain("produtos.1.titulo")
  })

  it("produto repetido no palco não conta, e sai na gravação", () => {
    const [kit, fator] = SEMENTE_DA_HOME.altaPerformance.produtos
    expect(faltandoNaSecaoDaHome("altaPerformance", { produtos: [kit, { ...kit }] })).toEqual([
      "produtos",
    ])
    const lida = lerSecaoDaHome("altaPerformance", { produtos: [kit, fator, { ...kit }] })
    expect(lida.secao?.produtos.map((p) => p.produto)).toEqual([kit.produto, fator.produto])
  })

  it("seção inteira passa pelo leitor; toda vazia é o que falta, não 'sem texto'", () => {
    expect(lerSecaoDaHome("sobre", SEMENTE_DA_HOME.sobre).secao).toEqual(SEMENTE_DA_HOME.sobre)
    expect(lerSecaoDaHome("vitrine", {}).faltando).toEqual(["titulo"])
  })

  it("todo texto de fábrica passa pelo próprio editor; o banner de fábrica é banner nenhum", () => {
    for (const [chave, secao] of Object.entries(SEMENTE_DA_HOME)) {
      if (chave === "banner") continue
      expect([chave, faltandoNaSecaoDaHome(chave as keyof typeof SEMENTE_DA_HOME, secao)]).toEqual([
        chave,
        [],
      ])
      expect(lerSecaoDaHome(chave as keyof typeof SEMENTE_DA_HOME, secao).secao).toEqual(secao)
    }
    expect(SEMENTE_DA_HOME.banner.slides).toEqual([])
    expect(faltandoNaSecaoDaHome("banner", SEMENTE_DA_HOME.banner)).toEqual(["slides"])
  })
})

const ARTE = "https://ref.supabase.co/storage/v1/object/public/produtos/home-arte.webp"

describe("o banner com slides", () => {
  it("o banner de texto de antes (sem arte) sai: sem arte, não há banner", () => {
    const h = home({
      publicado: {
        conteudo: {
          banner: { chapeu: "Black", titulo: "Tudo 20%", chamada: "Ver", produto: "kit" },
        },
      },
    })
    expect(h.publicado.conteudo.banner).toBeUndefined()
    expect(homeDoSite(h).conteudo.banner).toEqual({ slides: [], tempo: 7 })
  })

  it("cada slide pede a arte e a descrição; a do celular só vale com a do computador", () => {
    expect(faltandoNaSecaoDaHome("banner", { slides: [{ imagem: ARTE, titulo: "" }] })).toEqual([
      "slides.0.titulo",
    ])
    expect(
      faltandoNaSecaoDaHome("banner", { slides: [{ imagemCelular: `${ARTE}?cel`, titulo: "x" }] })
    ).toEqual(["slides.0.imagem"])
    const certo = lerSecaoDaHome("banner", {
      slides: [
        {
          imagem: ARTE,
          imagemCelular: `${ARTE}?cel`,
          titulo: "Semana do Cliente",
          chapeu: "velho",
        },
      ],
      tempo: "5",
    })
    expect(certo.secao).toEqual({
      slides: [{ imagem: ARTE, imagemCelular: `${ARTE}?cel`, titulo: "Semana do Cliente" }],
      tempo: 5,
    })
  })

  it("até 5 slides; tempo fora da lista volta pro de fábrica; endereço que não é imagem cai", () => {
    const slide = { titulo: "t", imagem: ARTE }
    const h = home({
      publicado: {
        conteudo: {
          banner: {
            slides: [
              { imagem: "javascript:alert(1)", titulo: "x" },
              ...Array.from({ length: 7 }, () => slide),
            ],
            tempo: 3,
          },
        },
      },
    })
    expect(h.publicado.conteudo.banner?.slides).toHaveLength(5)
    expect(h.publicado.conteudo.banner?.slides[0]).toEqual(slide)
    expect(h.publicado.conteudo.banner?.tempo).toBe(7)
  })

  it("as imagens que a rota confere: as do banner e a da última chamada", () => {
    expect(
      urlsDaSecaoDaHome("banner", {
        slides: [{ imagem: ARTE, imagemCelular: `${ARTE}?cel` }, { titulo: "sem" }],
      })
    ).toEqual([ARTE, `${ARTE}?cel`])
    expect(urlsDaSecaoDaHome("fechamento", { imagem: ARTE })).toEqual([ARTE])
    expect(urlsDaSecaoDaHome("vitrine", { titulo: "x" })).toEqual([])
  })
})

describe("a última chamada e os fundos", () => {
  it("a foto da última chamada; a do celular só com a do computador", () => {
    const base = { chapeu: "c", titulo: "t", chamada: "b" }
    expect(lerSecaoDaHome("fechamento", { ...base, imagemCelular: ARTE }).secao).toEqual(base)
    expect(lerSecaoDaHome("fechamento", { ...base, imagem: ARTE }).secao).toEqual({
      ...base,
      imagem: ARTE,
    })
  })

  it("fundo só nas seções que têm véu na loja", () => {
    const h = home({
      publicado: {
        fundos: {
          "home.hero": { imagem: ARTE, veu: 70 },
          "home.banner": { imagem: ARTE },
          "home.vitrine": { imagem: "javascript:alert(1)" },
        },
      },
    })
    expect(h.publicado.fundos).toEqual({ "home.hero": { imagem: ARTE, veu: 70 } })
    expect(homeDoSite(h).fundos).toEqual({ "home.hero": { imagem: ARTE, veu: 70 } })
  })
})

describe("o vídeo da história da marca", () => {
  const VIDEO = { url: `${ARTE}.mp4`, poster: ARTE, largura: 1080, altura: 1920, duracao: 21.37 }
  const sobre = (video: unknown) => ({ ...SEMENTE_DA_HOME.sobre, video })

  it("o do painel vai inteiro; sem as medidas, ou com endereço que não é arquivo, cai", () => {
    expect(lerSecaoDaHome("sobre", sobre(VIDEO)).secao?.video).toEqual({ ...VIDEO, duracao: 21.4 })
    expect(lerSecaoDaHome("sobre", sobre({ url: VIDEO.url })).secao).toEqual(SEMENTE_DA_HOME.sobre)
    expect(lerSecaoDaHome("sobre", sobre({ ...VIDEO, url: "javascript:alert(1)" })).secao).toEqual(
      SEMENTE_DA_HOME.sobre
    )
    // O do admin, de antes do painel: só as medidas, sem capa nem duração.
    const doAdmin = { url: VIDEO.url, largura: 720, altura: 1280 }
    expect(lerSecaoDaHome("sobre", sobre(doAdmin)).secao?.video).toEqual(doAdmin)
  })

  it("a loja sempre recebe a chave: o vídeo publicado, ou `null`", () => {
    const h = home({ publicado: { conteudo: { sobre: sobre(VIDEO) } } })
    expect(homeDoSite(h).conteudo.sobre.video?.url).toBe(VIDEO.url)
    expect(homeDoSite(home({})).conteudo.sobre.video).toBeNull()
  })

  it("a rota confere o vídeo e a capa", () => {
    expect(urlsDaSecaoDaHome("sobre", sobre(VIDEO))).toEqual([VIDEO.url, ARTE])
    expect(urlsDaSecaoDaHome("sobre", SEMENTE_DA_HOME.sobre)).toEqual([])
  })

  it("o vídeo do admin vem pro publicado e pro rascunho, cada um com o texto que tinha", () => {
    const doAdmin = { url: VIDEO.url, largura: 720, altura: 1280 }
    const h = home({
      publicado: { conteudo: { vitrine: { titulo: "Vitrine" } } },
      rascunho: { conteudo: { sobre: { ...SEMENTE_DA_HOME.sobre, titulo: "Nossa história" } } },
    })
    const novo = comVideoDoAdmin(h, doAdmin)!
    expect(novo.publicado.conteudo.sobre).toEqual({ ...SEMENTE_DA_HOME.sobre, video: doAdmin })
    expect(novo.publicado.conteudo.vitrine).toEqual({ titulo: "Vitrine" })
    expect(novo.rascunho?.conteudo.sobre?.titulo).toBe("Nossa história")
    expect(novo.rascunho?.conteudo.sobre?.video).toEqual(doAdmin)
    // Gravado e lido de volta, é o mesmo: a peneira não derruba o vídeo.
    expect(lerHome({ fb_home: novo })).toEqual(novo)
  })

  it("sem vídeo no admin, ou com vídeo já na home, não há o que trazer", () => {
    expect(comVideoDoAdmin(home({}), null)).toBeNull()
    const comVideo = home({ publicado: { conteudo: { sobre: sobre(VIDEO) } } })
    expect(comVideoDoAdmin(comVideo, { url: `${ARTE}-2.mp4`, largura: 1, altura: 1 })).toBeNull()
    const semRascunho = comVideoDoAdmin(home({}), { url: VIDEO.url, largura: 720, altura: 1280 })
    expect(semRascunho?.rascunho).toBeNull()
  })
})
