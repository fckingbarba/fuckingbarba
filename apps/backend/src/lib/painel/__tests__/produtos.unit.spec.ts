import { PDP_VAZIA, type Pdp } from "../../pdp"
import {
  caixaDo,
  detalheDoProduto,
  linhaDoProduto,
  mudarNaOrdem,
  ordemDaPagina,
  passaNoFiltroDeProduto,
  salvarCaixa,
  salvarSecao,
  secoesDaPagina,
  type ProdutoCru,
} from "../produtos"

/**
 * Os produtos no painel: a ordem da página, o editor de seção, a caixa de
 * compra e a lista.
 */

const FOTO = "https://ref.supabase.co/storage/v1/object/public/produtos/x.webp"
const pagina = (extra: Partial<Pdp> = {}): Pdp => ({ ...PDP_VAZIA, ...extra })

describe("a ordem da página", () => {
  it("o topo fica no topo, mesmo que uma ordem velha o tenha tirado de lá", () => {
    const ordem = ordemDaPagina({ ordem: ["produto.quem", "produto.dobra", "produto.promessa"] })
    expect(ordem.slice(0, 3)).toEqual(["produto.dobra", "produto.quem", "produto.promessa"])
    expect(ordem).toHaveLength(12)
  })

  it("subir e descer trocam com a vizinha; ninguém passa do topo", () => {
    const desceu = mudarNaOrdem({}, "produto.promessa", "descer")
    expect(desceu?.ordem?.slice(0, 3)).toEqual([
      "produto.dobra",
      "produto.antes-depois",
      "produto.promessa",
    ])
    expect(mudarNaOrdem({}, "produto.promessa", "subir")).toBeNull()
    expect(mudarNaOrdem({}, "produto.relacionados", "descer")).toBeNull()
    expect(mudarNaOrdem({}, "produto.dobra", "desligar")).toBeNull()
  })

  it("ligar e desligar guardam só a escolha, e a ordem fica", () => {
    const layout = mudarNaOrdem({ ordem: ["produto.quem"] }, "produto.quem", "desligar")
    expect(layout).toEqual({ ordem: ["produto.quem"], visibilidade: { "produto.quem": false } })
  })

  it("as seções da página: vazia, ligada, com fundo", () => {
    const secoes = secoesDaPagina(
      pagina({
        conteudo: { quem: { titulo: "Pra quem", sim: ["a"], nao: ["b"] } },
        layout: { visibilidade: { "produto.versus": false } },
        fundos: { "produto.quem": { imagem: FOTO } },
      })
    )
    const de = (id: string) => secoes.find((s) => s.id === id)!
    expect(de("produto.quem")).toMatchObject({
      vazia: false,
      ligada: true,
      fundo: { imagem: FOTO },
    })
    expect(de("produto.versus")).toMatchObject({ vazia: true, ligada: false, aceitaFundo: true })
    expect(de("produto.dobra")).toMatchObject({ fixa: true, ligada: true, aceitaFundo: false })
    expect(de("produto.relacionados").vazia).toBe(false)
  })
})

describe("o editor de seção", () => {
  it("pela metade não grava: diz o que falta", () => {
    expect(salvarSecao(pagina(), "produto.quem", { titulo: "Pra quem" }, undefined)).toEqual({
      ok: false,
      motivo: "faltando",
      faltando: ["sim", "nao"],
    })
  })

  it("inteira grava o texto e o fundo; vazia tira a seção e o fundo fica", () => {
    const r = salvarSecao(
      pagina(),
      "produto.quem",
      { titulo: "Pra quem", sim: ["a"], nao: ["b"] },
      { imagem: FOTO, veu: 80 }
    )
    expect(r.ok && r.pdp.conteudo.quem?.sim).toEqual(["a"])
    expect(r.ok && r.pdp.fundos["produto.quem"]).toEqual({ imagem: FOTO, veu: 80 })
    const vazia = r.ok ? salvarSecao(r.pdp, "produto.quem", {}, undefined) : null
    expect(vazia?.ok && vazia.pdp.conteudo.quem).toBeUndefined()
    expect(vazia?.ok && vazia.pdp.fundos["produto.quem"]).toEqual({ imagem: FOTO, veu: 80 })
  })

  it("o fundo `null` tira; nas seções sem véu, fundo não entra", () => {
    const comFundo = pagina({ fundos: { "produto.quem": { imagem: FOTO } } })
    const sem = salvarSecao(comFundo, "produto.quem", {}, null)
    expect(sem.ok && sem.pdp.fundos).toEqual({})
    const faixa = salvarSecao(
      pagina(),
      "produto.relacionados",
      { titulo: "Leve" },
      { imagem: FOTO }
    )
    expect(faixa.ok && faixa.pdp.fundos).toEqual({})
  })

  it("seção sem texto do produto não se salva por aqui", () => {
    expect(salvarSecao(pagina(), "produto.avaliacoes", {}, undefined)).toEqual({
      ok: false,
      motivo: "sem_texto",
    })
  })
})

describe("a caixa de compra", () => {
  const podem = new Set(["oleo", "balm"])

  it("o que a loja mostrava antes da escolha", () => {
    expect(caixaDo({})).toEqual({ modo: "unidades", nota: "", junto: [] })
    expect(caixaDo({ kits: false, produtos: ["oleo"] }).modo).toBe("junto")
  })

  it("o leve junto: pelo menos um, até dois, só do site e nunca o próprio", () => {
    expect(salvarCaixa({ modo: "junto", nota: "", junto: [] }, podem)).toEqual({
      ok: false,
      motivo: "junto_vazio",
    })
    expect(salvarCaixa({ modo: "junto", nota: "", junto: ["oleo", "fator"] }, podem).ok).toBe(false)
    expect(salvarCaixa({ modo: "junto", nota: "", junto: ["oleo", "balm"] }, podem)).toEqual({
      ok: true,
      combinada: { modo: "junto", produtos: ["oleo", "balm"] },
    })
  })

  it("os cartões: a linha do avulso cabe em 48 letras, e o leve junto não vai junto", () => {
    expect(salvarCaixa({ modo: "unidades", nota: "x".repeat(49), junto: [] }, podem)).toEqual({
      ok: false,
      motivo: "nota_longa",
    })
    expect(
      salvarCaixa({ modo: "unidades", nota: " Dura 30 dias ", junto: ["oleo"] }, podem)
    ).toEqual({
      ok: true,
      combinada: { modo: "unidades", notaDoAvulso: "Dura 30 dias" },
    })
  })
})

describe("a lista e a página do produto", () => {
  const produto = (extra: Partial<ProdutoCru> = {}): ProdutoCru => ({
    id: "prod_01",
    handle: "oleo",
    title: "Óleo para Barba FuckingBarba 30ml",
    status: "published",
    variants: [{ id: "v1", sku: "FBOL01", prices: [{ amount: 54.9, currency_code: "brl" }] }],
    ...extra,
  })

  it("a situação: no site, rascunho ou esgotado (que continua no site)", () => {
    expect(linhaDoProduto(produto(), 12).situacao).toBe("publicado")
    expect(linhaDoProduto(produto({ status: "draft" }), 12).situacao).toBe("rascunho")
    const esgotado = linhaDoProduto(produto(), 0)
    expect(esgotado.situacao).toBe("esgotado")
    expect(passaNoFiltroDeProduto(esgotado, "publicado")).toBe(true)
    expect(passaNoFiltroDeProduto(esgotado, "esgotado")).toBe(true)
    expect(passaNoFiltroDeProduto(linhaDoProduto(produto(), null), "esgotado")).toBe(false)
  })

  it("o desconto por quantidade, do preço do Bling", () => {
    const d = detalheDoProduto(produto(), PDP_VAZIA, 5, true)
    expect(d.degraus).toEqual([
      { unidades: 1, total: 54.9 },
      { unidades: 2, total: 104.9 },
      { unidades: 3, total: 153.9 },
    ])
    expect(d.preco).toBe(54.9)
    expect(d.caixa.modo).toBe("unidades")
  })

  it("com promoção: a lista leva o de/por, e as faixas saem do preço da promoção", () => {
    const preco = {
      promocao: { por: 44.9, desconto: 18, deOutraLista: false },
      doPainel: 44.9,
      semEfeito: null,
      hoje: 44.9,
    }
    const linha = linhaDoProduto(produto(), 5, preco)
    expect(linha).toMatchObject({ preco: 54.9, promocao: preco.promocao, promocaoSemEfeito: null })
    const d = detalheDoProduto(produto(), PDP_VAZIA, 5, true, { preco, precoDoPainel: true })
    // O "de" continua o do Bling; 2 e 3 unidades, com 4% e 6% sobre os R$ 44,90 (o de 3
    // desce até um ",90" que divida por 3: R$ 123,90 = 3 x R$ 41,30).
    expect(d.preco).toBe(54.9)
    expect(d.degraus).toEqual([
      { unidades: 1, total: 44.9 },
      { unidades: 2, total: 85.9 },
      { unidades: 3, total: 123.9 },
    ])
    expect(d.precoDoPainel).toBe(true)
  })
})
