import { nomeNoErp, temNomeDaLoja } from "../../erp/marcas"
import { NOMES_CURTOS, nomesPraTrocar } from "../nomes-curtos"
import { LIMITE_DO_NOME, lerNome, mudancaDoNome } from "../produtos"

const BLING = "Óleo para Barba FuckingBarba 30ml — Nutrição, Brilho e Maciez Premium"

describe("o nome que chega do painel", () => {
  it("junta os espaços; vazio e comprido demais voltam com o motivo", () => {
    expect(lerNome("  Óleo   para Barba\n30ml ")).toEqual({
      ok: true,
      nome: "Óleo para Barba 30ml",
    })
    expect(lerNome("   ")).toEqual({ ok: false, motivo: "nome_vazio" })
    expect(lerNome(42)).toEqual({ ok: false, motivo: "nome_vazio" })
    expect(lerNome("x".repeat(LIMITE_DO_NOME + 1))).toEqual({ ok: false, motivo: "nome_longo" })
    expect(lerNome("x".repeat(LIMITE_DO_NOME))).toMatchObject({ ok: true })
  })
})

describe("o que o nome muda no produto", () => {
  const doBling = { titulo: BLING, nomeDaLoja: false, nomeNoBling: BLING }

  it("nome novo: grava e põe a marca (o Bling não troca mais)", () => {
    expect(mudancaDoNome("Óleo para Barba 30ml", doBling)).toEqual({
      titulo: "Óleo para Barba 30ml",
      marca: true,
    })
  })

  it("o mesmo nome de hoje não muda nada — salvar o subtítulo não prende o nome", () => {
    expect(mudancaDoNome(BLING, doBling)).toBeNull()
    const daLoja = { titulo: "Óleo para Barba 30ml", nomeDaLoja: true, nomeNoBling: BLING }
    expect(mudancaDoNome("Óleo para Barba 30ml", daLoja)).toBeNull()
  })

  it("o nome do Bling de volta tira a marca: o Bling volta a mandar", () => {
    const daLoja = { titulo: "Óleo para Barba 30ml", nomeDaLoja: true, nomeNoBling: BLING }
    expect(mudancaDoNome(BLING, daLoja)).toEqual({ titulo: BLING, marca: false })
    // Com a marca e o nome igual ao do Bling, só a marca sai.
    expect(mudancaDoNome(BLING, { ...daLoja, titulo: BLING })).toEqual({
      titulo: BLING,
      marca: false,
    })
  })

  it("produto que nunca veio do Bling: todo nome mudado é da loja", () => {
    const semBling = { titulo: "Kit de teste", nomeDaLoja: false, nomeNoBling: null }
    expect(mudancaDoNome("Kit novo", semBling)).toEqual({ titulo: "Kit novo", marca: true })
  })
})

describe("as marcas no metadata", () => {
  it("a do nome e o nome no Bling", () => {
    expect(temNomeDaLoja({ fb_nome: { em: "2026-09-25", por: "mem_1" } })).toBe(true)
    expect(temNomeDaLoja({ fb_nome: "" })).toBe(false)
    expect(temNomeDaLoja(null)).toBe(false)
    expect(nomeNoErp({ fb_erp: { erp: "bling", id: "1", fotos: [], nome: ` ${BLING} ` } })).toBe(
      BLING
    )
    expect(nomeNoErp({ fb_erp: { erp: "bling", id: "1", fotos: [] } })).toBeNull()
    expect(nomeNoErp({})).toBeNull()
  })
})

describe("os nomes curtos aprovados (a migração da entrega 0099)", () => {
  const produto = (handle: string, title: string, metadata = {}) => ({
    id: `prod_${handle}`,
    handle,
    title,
    metadata,
  })

  it("troca os da lista; o que já tem nome da loja e o de fora ficam", () => {
    const trocas = nomesPraTrocar([
      produto("oleo-para-barba", BLING),
      produto("balm-para-barba", "Balm escolhido no painel", { fb_nome: { em: "x", por: "y" } }),
      produto("shampoo-para-barba", NOMES_CURTOS["shampoo-para-barba"]!),
      produto("pomada", "Pomada"),
    ])
    expect(trocas).toEqual([
      {
        id: "prod_oleo-para-barba",
        handle: "oleo-para-barba",
        de: BLING,
        para: "Óleo para Barba 30ml",
      },
      // Já com o nome certo, mas sem a marca: entra, pra ganhar a marca.
      {
        id: "prod_shampoo-para-barba",
        handle: "shampoo-para-barba",
        de: "Shampoo para Barba 120ml",
        para: "Shampoo para Barba 120ml",
      },
    ])
  })

  it("todo nome da lista cabe no limite do painel", () => {
    for (const nome of Object.values(NOMES_CURTOS))
      expect(lerNome(nome)).toEqual({ ok: true, nome })
  })
})
