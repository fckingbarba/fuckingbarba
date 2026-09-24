import { faltandoNaSecao, lerPdp, lerSecao } from "../pdp"

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
