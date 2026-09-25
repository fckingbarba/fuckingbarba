import { handleLivre, planejar, type ProdutoDoSite, variacoesDoProduto } from "../catalogo"
import type { ProdutoNoErp } from "../contrato"
import { enderecoPermitido, tipoDaImagem } from "../fotos"

const CAIXA = { comprimento: 12, largura: 6, altura: 15 }

const doErp = (p: Partial<ProdutoNoErp> & { id: string; nome: string }): ProdutoNoErp => ({
  sku: null,
  descricao: "Texto do ERP.",
  preco: 59.9,
  pesoGramas: 120,
  medidas: CAIXA,
  fotos: [{ url: "https://erp/f.jpg", chave: "erp:1" }],
  composicao: false,
  variacoes: [],
  ...p,
})

const doSite = (p: Partial<ProdutoDoSite> & { id: string; handle: string; skus: string[] }) => {
  const { skus, ...resto } = p
  return {
    titulo: p.handle,
    status: "published",
    descricao: null,
    fotos: [],
    categorias: [],
    canais: [],
    perfil: null,
    metadata: {},
    esperando: 0,
    variacoes: skus.map((sku, n) => ({
      id: `var_${p.id}_${n}`,
      sku,
      conjunto: `pset_${p.id}_${n}`,
      pesoGramas: 90,
      medidas: null,
    })),
    ...resto,
  } satisfies ProdutoDoSite
}

describe("as variações que entram", () => {
  it("produto simples vira uma variação 'Único', como as que o site já tem", () => {
    expect(variacoesDoProduto(doErp({ id: "1", nome: "Óleo", sku: "FBOL01" }))).toEqual({
      variacoes: [
        {
          sku: "FBOL01",
          titulo: "Único",
          opcoes: { Tamanho: "Único" },
          preco: 59.9,
          pesoGramas: 120,
          medidas: CAIXA,
        },
      ],
      avisos: [],
      bloqueio: null,
    })
  })

  it("sem SKU ou sem preço, não entra", () => {
    expect(variacoesDoProduto(doErp({ id: "1", nome: "Caixa" })).bloqueio).toMatch(/SKU/)
    expect(
      variacoesDoProduto(doErp({ id: "1", nome: "Rótulo", sku: "R1", preco: null })).bloqueio
    ).toMatch(/preço/)
  })

  it("com variações: a sem SKU ou sem preço fica de fora com aviso; preço e peso do pai valem", () => {
    const r = variacoesDoProduto(
      doErp({
        id: "5",
        nome: "Pomada",
        sku: "POM",
        preco: 40,
        variacoes: [
          {
            id: "51",
            sku: "POM-50",
            opcoes: { Tamanho: "50g" },
            preco: null,
            pesoGramas: null,
            medidas: null,
          },
          {
            id: "52",
            sku: "POM-100",
            opcoes: { Tamanho: "100g" },
            preco: 60,
            pesoGramas: 150,
            medidas: null,
          },
          {
            id: "53",
            sku: null,
            opcoes: { Tamanho: "200g" },
            preco: 80,
            pesoGramas: null,
            medidas: null,
          },
        ],
      })
    )
    expect(r.bloqueio).toBeNull()
    expect(r.variacoes.map((v) => [v.sku, v.titulo, v.preco, v.pesoGramas])).toEqual([
      ["POM-50", "50g", 40, 120],
      ["POM-100", "100g", 60, 150],
    ])
    expect(r.avisos).toEqual(["a variação 200g não tem código (SKU) no ERP: fica de fora"])
  })

  it("opção que falta numa variação ganha '—'; duas variações iguais, não entra", () => {
    const base = { preco: null, pesoGramas: null, medidas: null }
    const r = variacoesDoProduto(
      doErp({
        id: "6",
        nome: "Camiseta",
        variacoes: [
          { id: "61", sku: "C-P", opcoes: { Tamanho: "P", Cor: "Preta" }, ...base },
          { id: "62", sku: "C-M", opcoes: { Tamanho: "M" }, ...base },
        ],
      })
    )
    expect(r.variacoes[1]?.opcoes).toEqual({ Tamanho: "M", Cor: "—" })
    const iguais = variacoesDoProduto(
      doErp({
        id: "7",
        nome: "Boné",
        variacoes: [
          { id: "71", sku: "B-1", opcoes: { Cor: "Preto" }, ...base },
          { id: "72", sku: "B-2", opcoes: { Cor: "Preto" }, ...base },
        ],
      })
    )
    expect(iguais.bloqueio).toMatch(/mesmas opções/)
  })
})

describe("o plano: o que acontece com cada produto do ERP", () => {
  const site = [
    doSite({
      id: "prod_oleo",
      handle: "oleo-para-barba",
      skus: ["FBOL01"],
      fotos: ["https://loja/oleo-1.webp"],
    }),
    doSite({ id: "prod_pomada", handle: "pomada", skus: ["POM"] }),
    doSite({ id: "prod_kit2", handle: "kit-2-fator", skus: ["FBFCB01-K2"], status: "draft" }),
  ]

  it("mesmo SKU: reescrito no lugar, com o endereço de hoje", () => {
    const [i] = planejar([doErp({ id: "1", nome: "Óleo 30ml", sku: "FBOL01" })], site)
    expect(i).toMatchObject({ como: "atualiza", handle: "oleo-para-barba", noSite: ["prod_oleo"] })
    expect(i!.bloqueio).toBeNull()
  })

  it("SKU que o site não tem: novo, com endereço livre gerado do nome", () => {
    const itens = planejar(
      [
        doErp({ id: "2", nome: "Óleo para Barba", sku: "NOVO-1" }),
        doErp({ id: "3", nome: "Óleo para Barba!", sku: "NOVO-2" }),
      ],
      [...site, doSite({ id: "prod_x", handle: "oleo-para-barba-2", skus: ["X"] })]
    )
    // "oleo-para-barba" e "-2" já são do site: o primeiro novo pega o -3, o segundo o -4.
    expect(itens.map((i) => [i.como, i.handle])).toEqual([
      ["novo", "oleo-para-barba-3"],
      ["novo", "oleo-para-barba-4"],
    ])
  })

  it("mesmo SKU, formato diferente (no ERP com variações): recria, herdando o endereço", () => {
    const [i] = planejar(
      [
        doErp({
          id: "5",
          nome: "Pomada",
          variacoes: [
            {
              id: "51",
              sku: "POM",
              opcoes: { Tamanho: "50g" },
              preco: 40,
              pesoGramas: null,
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
          ],
        }),
      ],
      site
    )
    expect(i).toMatchObject({ como: "recria", handle: "pomada", noSite: ["prod_pomada"] })
  })

  it("o mesmo SKU em dois produtos do ERP: nenhum dos dois entra", () => {
    const itens = planejar(
      [doErp({ id: "1", nome: "A", sku: "DUP" }), doErp({ id: "2", nome: "B", sku: "DUP" })],
      site
    )
    expect(itens.map((i) => i.bloqueio)).toEqual([
      "o código DUP está em mais de um produto do ERP",
      "o código DUP está em mais de um produto do ERP",
    ])
  })

  it("um produto do site com SKUs de dois produtos do ERP: não dá pra saber quem herda", () => {
    const itens = planejar(
      [
        doErp({ id: "1", nome: "30ml", sku: "OL-30" }),
        doErp({ id: "2", nome: "60ml", sku: "OL-60" }),
      ],
      [doSite({ id: "prod_ol", handle: "oleo", skus: ["OL-30", "OL-60"] })]
    )
    expect(itens.every((i) => /separe no admin/.test(i.bloqueio ?? ""))).toBe(true)
  })

  it("campo vazio no ERP: no que já existe, fica o de hoje; no novo, só o aviso", () => {
    const vazio = { fotos: [], pesoGramas: null, medidas: null, descricao: null }
    const [atualiza, novo] = planejar(
      [
        doErp({ id: "1", nome: "Óleo", sku: "FBOL01", ...vazio }),
        doErp({ id: "2", nome: "Novo", sku: "N1", ...vazio }),
      ],
      site
    )
    expect(atualiza!.avisos).toEqual([
      "sem foto no ERP: ficam as fotos de hoje",
      "sem peso no ERP: fica o peso de hoje",
      "sem medidas no ERP: ficam as de hoje",
      "sem descrição no ERP: fica a de hoje",
    ])
    expect(novo!.avisos).toEqual([
      "sem foto no ERP",
      "sem peso no ERP: o frete não cota sem ele",
      "sem medidas da caixa no ERP",
      "sem descrição no ERP",
    ])
  })

  it("a primeira vez é o 'do zero'; da segunda em diante, as fotos de hoje ficam", () => {
    const marcado = { fb_erp: { erp: "bling", id: "1", fotos: [] } }
    const [primeira] = planejar([doErp({ id: "1", nome: "Óleo", sku: "FBOL01" })], site)
    expect(primeira).toMatchObject({ como: "atualiza", primeira: true, fotosDoErp: true })

    const [segunda] = planejar(
      [doErp({ id: "1", nome: "Óleo", sku: "FBOL01", fotos: [] })],
      [{ ...site[0]!, metadata: marcado }]
    )
    // Já veio do ERP e tem foto (a da Nuvemshop): nada de foto do ERP, nem aviso.
    expect(segunda).toMatchObject({ primeira: false, fotosDoErp: false })
    expect(segunda!.avisos).not.toContain("sem foto no ERP: ficam as fotos de hoje")

    const [semFoto] = planejar(
      [doErp({ id: "1", nome: "Óleo", sku: "FBOL01" })],
      [{ ...site[0]!, metadata: marcado, fotos: [] }]
    )
    // Já veio, mas está sem nenhuma foto: a do ERP preenche.
    expect(semFoto).toMatchObject({ primeira: false, fotosDoErp: true })

    const [novo] = planejar([doErp({ id: "2", nome: "Novo", sku: "N1" })], site)
    expect(novo).toMatchObject({ como: "novo", primeira: true, fotosDoErp: true })
  })

  it("o nome dado no painel (`fb_nome`) fica, na primeira vez e nas outras; sem a marca, vale o do ERP", () => {
    const doBling = "Óleo para Barba FuckingBarba 30ml — Nutrição, Brilho e Maciez Premium"
    const marca = { fb_nome: { em: "2026-09-25T15:00:00.000Z", por: "mem_1" } }
    const comNome = { ...site[0]!, titulo: "Óleo para Barba 30ml", metadata: marca }

    const [primeira] = planejar([doErp({ id: "1", nome: doBling, sku: "FBOL01" })], [comNome])
    expect(primeira).toMatchObject({
      como: "atualiza",
      primeira: true,
      nomeDaLoja: "Óleo para Barba 30ml",
    })

    const jaVeio = { ...marca, fb_erp: { erp: "bling", id: "1", fotos: [], nome: doBling } }
    const [segunda] = planejar(
      [doErp({ id: "1", nome: doBling, sku: "FBOL01" })],
      [{ ...comNome, metadata: jaVeio }]
    )
    expect(segunda).toMatchObject({ primeira: false, nomeDaLoja: "Óleo para Barba 30ml" })

    const [semMarca] = planejar([doErp({ id: "1", nome: doBling, sku: "FBOL01" })], site)
    expect(semMarca!.nomeDaLoja).toBeNull()
    const [novo] = planejar([doErp({ id: "2", nome: "Novo", sku: "N1" })], [comNome])
    expect(novo!.nomeDaLoja).toBeNull()
  })

  it("o bloqueado não gasta endereço, e o produto do site que ele cobre continua coberto", () => {
    const [i] = planejar([doErp({ id: "1", nome: "Óleo", sku: "FBOL01", preco: null })], site)
    expect(i).toMatchObject({
      bloqueio: "sem preço de venda no ERP",
      noSite: ["prod_oleo"],
      handle: "",
    })
  })
})

describe("o endereço livre", () => {
  it("sem acento, sem símbolo; repetido ganha -2, -3", () => {
    const usados = new Set(["balm-para-barba"])
    expect(handleLivre("Balm para Barba", usados)).toBe("balm-para-barba-2")
    expect(handleLivre("Balm para Barba", usados)).toBe("balm-para-barba-3")
    expect(handleLivre("Shampoo & Condicionador — 2 em 1", usados)).toBe(
      "shampoo-condicionador-2-em-1"
    )
    expect(handleLivre("!!!", usados)).toBe("produto")
  })
})

describe("as fotos que vêm do ERP", () => {
  it("o tipo sai dos bytes, não do cabeçalho", () => {
    const bytes = (...b: number[]) => Uint8Array.from(b)
    const texto = (t: string) => Uint8Array.from(Buffer.from(t, "latin1"))
    expect(tipoDaImagem(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe("image/jpeg")
    expect(tipoDaImagem(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.extensao).toBe(
      "png"
    )
    expect(tipoDaImagem(texto("RIFF\0\0\0\0WEBPVP8 "))?.mime).toBe("image/webp")
    expect(tipoDaImagem(texto("\0\0\0\x1cftypavif"))?.mime).toBe("image/avif")
    expect(tipoDaImagem(texto("<html>erro</html>"))).toBeNull()
  })

  it("em produção, só internet aberta: rede interna não é foto de produto", () => {
    expect(enderecoPermitido("https://cdn.bling.com.br/a.jpg", true)).toBe(true)
    expect(enderecoPermitido("http://127.0.0.1:4340/imagens/1.png", true)).toBe(false)
    expect(enderecoPermitido("http://postgres.railway.internal/x", true)).toBe(false)
    expect(enderecoPermitido("http://10.0.0.8/x", true)).toBe(false)
    expect(enderecoPermitido("http://[::1]/x", true)).toBe(false)
    expect(enderecoPermitido("file:///etc/passwd", true)).toBe(false)
    // fora de produção, o Bling falso do conferidor serve as fotos da própria máquina
    expect(enderecoPermitido("http://127.0.0.1:4340/imagens/1.png", false)).toBe(true)
  })
})
