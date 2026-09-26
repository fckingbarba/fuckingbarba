import {
  faltandoNaSecao,
  LIMITE_DA_DESCRICAO,
  lerPdp,
  lerSecao,
  lerSeo,
  lerVideo,
  urlsDaSecao,
} from "../pdp"

/**
 * A página do produto (`fb_pdp`) como a loja e o painel leem: o que passa,
 * o que cai, e o que o editor avisa que falta.
 */

const pdp = (fb_pdp: unknown) => lerPdp({ fb_pdp })
const FOTO = "https://ref.supabase.co/storage/v1/object/public/produtos/fundo.webp"

describe("o fundo das seções", () => {
  it("a foto do computador e a do celular; o véu entre 40 e 100", () => {
    const { fundos } = pdp({
      fundos: {
        "produto.quem": { imagem: FOTO, imagemCelular: `${FOTO}?cel`, veu: 130 },
        "produto.versus": { imagem: FOTO, veu: 10 },
      },
    })
    expect(fundos["produto.quem"]).toEqual({ imagem: FOTO, imagemCelular: `${FOTO}?cel`, veu: 100 })
    expect(fundos["produto.versus"]).toEqual({ imagem: FOTO, veu: 40 })
  })

  it("só nas seções que têm véu na loja, e nunca com endereço que não é imagem", () => {
    const { fundos } = pdp({
      fundos: {
        "produto.faixa": { imagem: FOTO },
        "produto.dobra": { imagem: FOTO },
        "produto.tempo": { imagem: "javascript:alert(1)" },
        "produto.duvidas": { imagem: FOTO, imagemCelular: "data:image/png;base64,xx" },
      },
    })
    expect(Object.keys(fundos)).toEqual(["produto.duvidas"])
    expect(fundos["produto.duvidas"].imagemCelular).toBeUndefined()
  })
})

describe("a caixa de compra", () => {
  it("com a escolha feita, o leve junto leva até 2 e o `kits` de antes sai", () => {
    expect(
      pdp({ combinada: { modo: "junto", kits: false, produtos: ["a", "b", "c", "a"] } }).combinada
    ).toEqual({ modo: "junto", produtos: ["a", "b"] })
  })

  it("sem a escolha (o salvo antes dela), fica como era", () => {
    expect(pdp({ combinada: { kits: false, produtos: ["a", "b", "c"] } }).combinada).toEqual({
      kits: false,
      produtos: ["a", "b", "c"],
    })
    expect(pdp({ combinada: { modo: "outro" } }).combinada).toEqual({})
  })
})

describe("a linha do tempo", () => {
  it("guarda o marco — um só, o primeiro marcado", () => {
    const { conteudo } = pdp({
      conteudo: {
        tempo: {
          titulo: "Quando aparece",
          passos: [
            { quando: "2 semanas", titulo: "Pele", texto: "a", alvo: true },
            { quando: "1 mês", titulo: "Fios", texto: "b", alvo: true },
          ],
        },
      },
    })
    expect(conteudo.tempo?.passos.map((p) => p.alvo ?? false)).toEqual([true, false])
  })
})

describe("o título dos relacionados", () => {
  it("é do produto; vazio, não entra", () => {
    expect(pdp({ conteudo: { relacionados: { titulo: " Leve também " } } }).conteudo).toEqual({
      relacionados: { titulo: "Leve também" },
    })
    expect(pdp({ conteudo: { relacionados: { titulo: " " } } }).conteudo).toEqual({})
  })
})

describe("o que falta numa seção (o editor do painel)", () => {
  it("toda vazia não falta nada: sai da página", () => {
    expect(faltandoNaSecao("promessa", { chapeu: "", titulo: " ", itens: ["", " "] })).toEqual([])
    expect(lerSecao("promessa", {})).toEqual({ secao: null, faltando: [] })
  })

  it("pela metade diz os campos", () => {
    expect(faltandoNaSecao("promessa", { titulo: "Barba cheia", rodape: "Varia" })).toEqual([
      "chapeu",
      "itens",
    ])
  })

  it("nos grupos, o item e o campo — a linha toda vazia fica de fora sem aviso", () => {
    expect(
      faltandoNaSecao("tempo", {
        titulo: "Quando",
        passos: [
          { quando: "2 semanas", titulo: "Pele", texto: "" },
          { quando: "", titulo: "", texto: "" },
        ],
      })
    ).toEqual(["passos.0.texto"])
    expect(faltandoNaSecao("tempo", { titulo: "Quando", passos: [] })).toEqual(["passos"])
  })

  it("escrita só no grupo (as etapas, sem o título) conta como começada: falta o título", () => {
    expect(
      faltandoNaSecao("tempo", {
        titulo: "",
        passos: [{ quando: "1 mês", titulo: "A", texto: "B" }],
      })
    ).toEqual(["titulo"])
  })

  it("a resposta das dúvidas é lista de parágrafos", () => {
    const { secao, faltando } = lerSecao("duvidas", {
      titulo: "Dúvidas",
      perguntas: [{ pergunta: "Arde?", resposta: ["Não.", "Nunca."] }],
    })
    expect(faltando).toEqual([])
    expect(secao).toEqual({
      titulo: "Dúvidas",
      perguntas: [{ pergunta: "Arde?", resposta: ["Não.", "Nunca."] }],
    })
  })
})

const VIDEO = {
  url: "https://ref.supabase.co/storage/v1/object/public/produtos/uso.mp4",
  poster: FOTO,
  largura: 1080,
  altura: 1920,
  duracao: 12.34,
}

describe("os vídeos", () => {
  it("vídeo só com tudo: o arquivo, a capa, as medidas e a duração", () => {
    expect(lerVideo(VIDEO)).toEqual({ ...VIDEO, duracao: 12.3 })
    expect(lerVideo({ ...VIDEO, poster: undefined })).toBeNull()
    expect(lerVideo({ ...VIDEO, largura: 0 })).toBeNull()
    expect(lerVideo({ ...VIDEO, duracao: 601 })).toBeNull()
    expect(lerVideo({ ...VIDEO, url: "javascript:alert(1)" })).toBeNull()
  })

  it("na galeria: com a posição, sem repetir, até 4", () => {
    const outro = (n: number) => ({ ...VIDEO, url: `${VIDEO.url}?${n}`, posicao: n })
    const { videos } = pdp({
      videos: [
        { ...VIDEO, posicao: 2 },
        { ...VIDEO, posicao: 5 },
        outro(1),
        outro(3),
        outro(4),
        outro(6),
      ],
    })
    expect(videos.map((v) => v.posicao)).toEqual([2, 1, 3, 4])
    expect(videos[0]).toEqual({ ...VIDEO, duracao: 12.3, posicao: 2 })
  })

  it("no modo de uso: entra junto da seção, e a rota confere o endereço dele", () => {
    const funciona = {
      comoTitulo: "Como",
      comoFotoDe: "oleo",
      comoTexto: ["Um"],
      usoTitulo: "Uso",
      usoFotoDe: "oleo",
      usoPassos: ["Passo"],
      usoVideo: VIDEO,
    }
    const { conteudo } = pdp({ conteudo: { funciona } })
    expect(conteudo.funciona?.usoVideo).toEqual({ ...VIDEO, duracao: 12.3 })
    expect(urlsDaSecao("funciona", conteudo.funciona)).toEqual([VIDEO.url, VIDEO.poster])
  })
})

describe("o antes e depois", () => {
  const caso = {
    nome: "André B.",
    tempo: "90 dias",
    antes: FOTO,
    depois: `${FOTO}?d`,
    autorizou: true,
  }

  it("caso sem a autorização marcada não existe; até 3", () => {
    const { conteudo } = pdp({
      conteudo: {
        antesDepois: {
          titulo: "Resultados",
          casos: [caso, { ...caso, autorizou: false }, { ...caso, texto: "Valeu" }, caso, caso],
        },
      },
    })
    expect(conteudo.antesDepois?.titulo).toBe("Resultados")
    expect(conteudo.antesDepois?.casos).toEqual([caso, { ...caso, texto: "Valeu" }, caso])
  })

  it("o editor avisa a autorização que falta, e a foto de cada lado", () => {
    expect(faltandoNaSecao("antesDepois", { casos: [{ ...caso, autorizou: false }] })).toEqual([
      "casos.0.autorizou",
    ])
    expect(faltandoNaSecao("antesDepois", { casos: [{ ...caso, depois: "" }] })).toEqual([
      "casos.0.depois",
    ])
    // Só o título: falta o caso inteiro.
    expect(faltandoNaSecao("antesDepois", { titulo: "Resultados", casos: [] })).toEqual(["casos"])
    const { secao } = lerSecao("antesDepois", { casos: [caso] })
    expect(urlsDaSecao("antesDepois", secao)).toEqual([FOTO, `${FOTO}?d`])
  })
})

describe("a rotina: o passo do produto da página", () => {
  const rotina = {
    titulo: "A rotina",
    itens: [{ handle: "shampoo", passo: "Passo 1 · limpa", para: "Limpa." }],
  }

  it("entra quando vem; sem ele, a loja usa o do Fator", () => {
    const com = pdp({
      conteudo: { rotina: { ...rotina, passoDeste: " Passo 3 · hidrata ", paraDeste: "Gotas." } },
    })
    expect(com.conteudo.rotina).toEqual({
      ...rotina,
      passoDeste: "Passo 3 · hidrata",
      paraDeste: "Gotas.",
    })
    expect(pdp({ conteudo: { rotina } }).conteudo.rotina).toEqual(rotina)
    // Não é obrigatório: a seção sem ele não fica pela metade.
    expect(faltandoNaSecao("rotina", rotina)).toEqual([])
  })
})

describe("as fotos de “como funciona” e do modo de uso", () => {
  const funciona = {
    comoTitulo: "Como",
    comoFotoDe: "oleo",
    comoTexto: ["Um"],
    usoTitulo: "Uso",
    usoFotoDe: "oleo",
    usoPassos: ["Passo"],
  }

  it("a escolhida entra, e a rota confere que ela mora no armazenamento", () => {
    const { secao } = lerSecao("funciona", { ...funciona, comoFoto: FOTO, usoFoto: `${FOTO}?u` })
    expect(secao).toMatchObject({ comoFoto: FOTO, usoFoto: `${FOTO}?u` })
    expect(urlsDaSecao("funciona", secao)).toEqual([FOTO, `${FOTO}?u`])
  })

  it("endereço que não é de imagem sai; sem foto escolhida, a seção vale do mesmo jeito", () => {
    const { conteudo } = pdp({ conteudo: { funciona: { ...funciona, comoFoto: "javascript:x" } } })
    expect(conteudo.funciona).toEqual(funciona)
    expect(urlsDaSecao("funciona", conteudo.funciona)).toEqual([])
  })
})

describe("a descrição do Google", () => {
  it("numa linha só, até o limite; vazia não existe", () => {
    expect(lerSeo({ descricao: "  Óleo para barba\n com   argan. " })).toEqual({
      descricao: "Óleo para barba com argan.",
    })
    expect(lerSeo({ descricao: "x".repeat(LIMITE_DA_DESCRICAO + 30) })?.descricao).toHaveLength(
      LIMITE_DA_DESCRICAO
    )
    expect(lerSeo({ descricao: "   " })).toBeUndefined()
    expect(lerSeo("texto solto")).toBeUndefined()
  })

  it("mora no fb_pdp, e a página sem ela não ganha a chave", () => {
    expect(pdp({ seo: { descricao: "Balm para barba." } }).seo).toEqual({
      descricao: "Balm para barba.",
    })
    expect("seo" in pdp({ conteudo: {} })).toBe(false)
  })
})
