import { codigoDoBump, ehKitDeQuantidade } from "../bumps"

describe("o código da oferta do checkout", () => {
  const codigo = codigoDoBump("oleo-para-barba", "prod_01", "segredo")

  it("leva o handle legível e oito letras de assinatura", () => {
    expect(codigo).toMatch(/^BUMP-OLEO-PARA-BARBA-[0-9A-F]{8}$/)
  })

  it("é sempre o mesmo pro mesmo produto — a loja faz a mesma conta", () => {
    expect(codigoDoBump("oleo-para-barba", "prod_01", "segredo")).toBe(codigo)
  })

  /*
    O mesmo par (handle, id, segredo) calculado à mão com o openssl — é o
    número que a loja (`apps/loja/src/lib/bump.ts`) também tem que dar:

      printf 'bump:oleo-para-barba:prod_01' | openssl dgst -sha256 -hmac segredo
  */
  it("bate com a conta de referência", () => {
    expect(codigo).toBe("BUMP-OLEO-PARA-BARBA-7D63BD2F")
  })

  it("muda com o segredo: sem ele, não dá pra adivinhar", () => {
    expect(codigoDoBump("oleo-para-barba", "prod_01", "outro")).not.toBe(codigo)
  })

  it("muda com o id: produto recriado ganha código novo", () => {
    expect(codigoDoBump("oleo-para-barba", "prod_02", "segredo")).not.toBe(codigo)
  })
})

describe("o kit de quantidade", () => {
  it("não vira oferta", () => {
    expect(ehKitDeQuantidade({ tipo: "kit-quantidade" })).toBe(true)
    expect(ehKitDeQuantidade({ tipo: "outro" })).toBe(false)
    expect(ehKitDeQuantidade(null)).toBe(false)
  })
})
