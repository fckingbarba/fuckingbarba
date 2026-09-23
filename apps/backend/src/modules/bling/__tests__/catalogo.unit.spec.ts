import type { Acesso } from "../../../lib/erp/contrato"
import {
  emGramas,
  fotosDe,
  idsDaLista,
  lerCatalogo,
  lerProdutoDoBling,
  medidasDe,
  opcoesDaVariacao,
  textoDaDescricao,
} from "../catalogo"
import { listarProdutos } from "../produtos"

const ambiente = { ...process.env }
afterEach(() => {
  process.env = { ...ambiente }
  jest.restoreAllMocks()
})

const acesso: Acesso = {
  token: async () => "token-1",
  renovado: async () => "token-2",
}

describe("peso e medidas do Bling → grama e centímetro", () => {
  it("quilo vira grama; zero, vazio ou lixo é 'o Bling não tem'", () => {
    expect(emGramas(0.09)).toBe(90)
    expect(emGramas("0,150")).toBe(150)
    expect(emGramas(1.2345)).toBe(1235)
    expect(emGramas(0)).toBeNull()
    expect(emGramas(undefined)).toBeNull()
    expect(emGramas("abc")).toBeNull()
  })

  it("metro, centímetro e milímetro viram centímetro; comprimento é a profundidade", () => {
    const caixa = { comprimento: 10, largura: 5, altura: 8 }
    expect(medidasDe({ largura: 5, altura: 8, profundidade: 10, unidadeMedida: 1 })).toEqual(caixa)
    expect(medidasDe({ largura: 0.05, altura: 0.08, profundidade: 0.1, unidadeMedida: 0 })).toEqual(
      caixa
    )
    expect(medidasDe({ largura: 50, altura: 80, profundidade: 100, unidadeMedida: "2" })).toEqual(
      caixa
    )
    // sem a unidade, o padrão do Bling: centímetro
    expect(medidasDe({ largura: 5, altura: 8, profundidade: 10 })).toEqual(caixa)
  })

  it("faltou uma das três, nenhuma vale", () => {
    expect(medidasDe({ largura: 5, altura: 0, profundidade: 10, unidadeMedida: 1 })).toBeNull()
    expect(medidasDe(null)).toBeNull()
  })
})

describe("a descrição: HTML do editor do Bling → texto", () => {
  it("parágrafos com linha em branco, <br> com quebra, sem tag nenhuma", () => {
    expect(
      textoDaDescricao(
        "<p><strong>BRILHO NA MEDIDA.</strong> Zero frescura.</p><p>Linha 1<br/>Linha 2</p>"
      )
    ).toBe("BRILHO NA MEDIDA. Zero frescura.\n\nLinha 1\nLinha 2")
  })

  it("acento em entidade (o Bling guarda assim), e &lt; escrito no texto continua texto", () => {
    expect(textoDaDescricao("Hidrata&ccedil;&atilde;o &amp; brilho&nbsp;&#233; &lt;b&gt;")).toBe(
      "Hidratação & brilho é <b>"
    )
  })

  it("lista vira itens com •; script e estilo somem", () => {
    expect(
      textoDaDescricao(
        "<p>Como usar:</p><ul><li>Lave</li><li>Aplique</li></ul><script>alert(1)</script><style>p{}</style>"
      )
    ).toBe("Como usar:\n\n• Lave\n• Aplique")
  })

  it("vazio, só espaço ou não-texto: nada", () => {
    expect(textoDaDescricao("<p>&nbsp;</p>")).toBeNull()
    expect(textoDaDescricao(undefined)).toBeNull()
  })
})

describe("as fotos", () => {
  it("as internas na ordem do Bling (chave = o anexo, o link vence), depois as externas", () => {
    const fotos = fotosDe({
      imagemURL: "https://bling/primeira.jpg",
      midia: {
        imagens: {
          internas: [
            { link: "https://s3/b.jpg?X-Amz-Expires=1", ordem: 2, anexo: { id: 22 } },
            { link: "https://s3/a.jpg?X-Amz-Expires=1", ordem: 1, anexo: { id: 11 } },
          ],
          externas: [
            { link: "https://cdn/c.webp" },
            { link: "https://cdn/c.webp" },
            { link: "ftp://x" },
          ],
        },
      },
    })
    expect(fotos).toEqual([
      { url: "https://s3/a.jpg?X-Amz-Expires=1", chave: "bling:anexo:11" },
      { url: "https://s3/b.jpg?X-Amz-Expires=1", chave: "bling:anexo:22" },
      { url: "https://cdn/c.webp", chave: "url:https://cdn/c.webp" },
    ])
  })

  it("sem mídia, a primeira foto da lista (sem o pedaço que vence na chave)", () => {
    expect(fotosDe({ imagemURL: "https://s3/um.jpg?assinatura=9" })).toEqual([
      { url: "https://s3/um.jpg?assinatura=9", chave: "bling:https://s3/um.jpg" },
    ])
    expect(fotosDe({})).toEqual([])
  })
})

describe("o produto do Bling na língua da loja", () => {
  it("as opções da variação: 'Tamanho:G;Cor:Verde'", () => {
    expect(opcoesDaVariacao("Tamanho:G;Cor:Verde")).toEqual({ Tamanho: "G", Cor: "Verde" })
    expect(opcoesDaVariacao(" 30ml ")).toEqual({ Opção: "30ml" })
    expect(opcoesDaVariacao("")).toEqual({})
  })

  it("simples: preço, peso bruto (o líquido se faltar), medidas, descrição e fotos", () => {
    const p = lerProdutoDoBling({
      data: {
        id: 123,
        nome: "Óleo para Barba 30ml",
        codigo: " FBOL01 ",
        preco: 54.9,
        tipo: "P",
        situacao: "A",
        formato: "S",
        descricaoCurta: "<p>Brilho na medida.</p>",
        pesoLiquido: 0.08,
        pesoBruto: 0,
        dimensoes: { largura: 5, altura: 8, profundidade: 10, unidadeMedida: 1 },
        midia: {
          imagens: { internas: [{ link: "https://s3/o.jpg", ordem: 1, anexo: { id: 7 } }] },
        },
      },
    })
    expect(p).toEqual({
      id: "123",
      nome: "Óleo para Barba 30ml",
      sku: "FBOL01",
      descricao: "Brilho na medida.",
      preco: 54.9,
      pesoGramas: 80,
      medidas: { comprimento: 10, largura: 5, altura: 8 },
      fotos: [{ url: "https://s3/o.jpg", chave: "bling:anexo:7" }],
      composicao: false,
      variacoes: [],
    })
  })

  it("kit (composição) é produto como outro; a descrição complementar serve se a curta faltar", () => {
    const p = lerProdutoDoBling({
      data: {
        id: 9,
        nome: "Kit Completo",
        codigo: "FBKIT01",
        preco: 99.9,
        formato: "E",
        descricaoComplementar: "Três produtos.",
      },
    })
    expect(p?.composicao).toBe(true)
    expect(p?.descricao).toBe("Três produtos.")
  })

  it("com variações: só as ativas, cada uma com as opções dela", () => {
    const p = lerProdutoDoBling({
      data: {
        id: 50,
        nome: "Pomada",
        codigo: "POM",
        preco: 40,
        formato: "V",
        variacoes: [
          {
            id: 51,
            nome: "Pomada Tamanho:50g",
            codigo: "POM-50",
            preco: 0,
            pesoBruto: 0.07,
            variacao: { nome: "Tamanho:50g" },
          },
          { id: 52, nome: "Pomada Tamanho:100g", codigo: "POM-100", preco: 60 },
          { id: 53, nome: "Pomada Tamanho:200g", codigo: "POM-200", situacao: "I" },
        ],
      },
    })
    expect(p?.variacoes).toEqual([
      {
        id: "51",
        sku: "POM-50",
        opcoes: { Tamanho: "50g" },
        preco: null,
        pesoGramas: 70,
        medidas: null,
      },
      {
        id: "52",
        sku: "POM-100",
        opcoes: { Tamanho: "100g" },
        preco: 60,
        pesoGramas: null,
        medidas: null,
      },
    ])
  })

  it("serviço, inativo, a própria variação de outro, ou sem nome: não é produto de vender", () => {
    const base = { id: 1, nome: "X", codigo: "X" }
    expect(lerProdutoDoBling({ data: { ...base, tipo: "S" } })).toBeNull()
    expect(lerProdutoDoBling({ data: { ...base, situacao: "I" } })).toBeNull()
    expect(
      lerProdutoDoBling({
        data: { ...base, variacao: { nome: "Cor:Azul", produtoPai: { id: 9 } } },
      })
    ).toBeNull()
    expect(lerProdutoDoBling({ data: { id: 1 } })).toBeNull()
    expect(lerProdutoDoBling(null)).toBeNull()
  })

  it("da lista, só os ids de produto ativo que não é variação", () => {
    expect(
      idsDaLista([
        { id: 1, tipo: "P", situacao: "A" },
        { id: 2, tipo: "S", situacao: "A" },
        { id: 3, tipo: "P", situacao: "I" },
        { id: 4, tipo: "P", situacao: "A", idProdutoPai: 1 },
        { id: 5, tipo: "P", situacao: "A", idProdutoPai: 0 },
        { nome: "sem id" },
      ])
    ).toEqual(["1", "5"])
  })
})

describe("a leitura no Bling", () => {
  const respostas = (rotas: (url: URL) => { status?: number; corpo: unknown }) =>
    jest.spyOn(global, "fetch").mockImplementation(async (entrada) => {
      const { status = 200, corpo } = rotas(new URL(String(entrada)))
      return new Response(JSON.stringify(corpo), { status })
    })

  it("a lista pergunta pelos três filtros de saldo e junta pelo id (o zerado não some)", async () => {
    process.env.BLING_URL = "http://bling.teste/Api/v3"
    const chamadas: string[] = []
    respostas((url) => {
      const filtro = url.searchParams.get("filtroSaldoEstoque")
      chamadas.push(filtro ?? "?")
      const porFiltro: Record<string, unknown[]> = {
        "1": [{ id: 1, codigo: "COM-SALDO" }],
        "0": [
          { id: 2, codigo: "ZERADO" },
          { id: 1, codigo: "COM-SALDO" },
        ],
        "2": [],
      }
      return { corpo: { data: porFiltro[filtro ?? ""] ?? [] } }
    })
    const itens = await listarProdutos(acesso, { criterio: 2 })
    expect(chamadas).toEqual(["1", "0", "2"])
    expect((itens as { codigo: string }[]).map((i) => i.codigo)).toEqual(["COM-SALDO", "ZERADO"])
  })

  it("o catálogo: a lista diz quais, o detalhe traz o resto; apagado entre as duas é 'não achado'", async () => {
    process.env.BLING_URL = "http://bling.teste/Api/v3"
    respostas((url) => {
      if (url.pathname.endsWith("/produtos"))
        return {
          corpo: {
            data:
              url.searchParams.get("filtroSaldoEstoque") === "1"
                ? [
                    { id: 10, tipo: "P", situacao: "A" },
                    { id: 20, tipo: "P", situacao: "A" },
                  ]
                : [],
          },
        }
      if (url.pathname.endsWith("/produtos/10"))
        return { corpo: { data: { id: 10, nome: "Balm", codigo: "FBBM01", preco: 53.9 } } }
      return {
        status: 404,
        corpo: { error: { type: "RESOURCE_NOT_FOUND", message: "não existe" } },
      }
    })
    const r = await lerCatalogo(acesso)
    expect(r).toEqual({
      ok: true,
      produtos: [expect.objectContaining({ id: "10", nome: "Balm", sku: "FBBM01" })],
      naoAchados: ["20"],
      restantes: 0,
    })
  })

  it("o Bling fora do ar é falha da leitura inteira, com o motivo", async () => {
    process.env.BLING_URL = "http://bling.teste/Api/v3"
    respostas(() => ({ status: 400, corpo: { error: { message: "limite de requisições" } } }))
    expect(await lerCatalogo(acesso, ["10"])).toEqual({
      ok: false,
      motivo: "limite de requisições",
    })
  })
})
