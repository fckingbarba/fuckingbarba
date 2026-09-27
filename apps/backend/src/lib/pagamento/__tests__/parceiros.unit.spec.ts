import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { lerEstado } from "../estado"
import {
  ehParceiro,
  estadoDaSessao,
  PAGARME,
  parceiroDe,
  PARCEIROS,
  PROVISORIO,
  sessaoDoParceiro,
} from "../parceiros"

const estadoPix = {
  forma: "pix",
  situacao: "aguardando",
  valor: 12350,
  pedido: "or_1",
  cobranca: "ch_1",
  parcelas: 1,
  pix: { copiaECola: "000201", imagem: "https://qr", expiraEm: "2026-09-26T20:00:00.000Z" },
  cartao: null,
  recusa: null,
  estornado: 0,
}

describe("a lista dos parceiros", () => {
  it("o Pagar.me é parceiro; o provisório e o desconhecido, não", () => {
    expect(parceiroDe("pp_pagarme_pagarme")).toBe(PAGARME)
    expect(ehParceiro(PAGARME.id)).toBe(true)
    expect(ehParceiro(PROVISORIO)).toBe(false)
    expect(ehParceiro("pp_outro_outro")).toBe(false)
    expect(ehParceiro(undefined)).toBe(false)
    expect(ehParceiro(null)).toBe(false)
  })

  it("ids e chaves não se repetem, e o provisório não entra", () => {
    const ids = PARCEIROS.map((p) => p.id)
    const chaves = PARCEIROS.map((p) => p.chave)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(chaves).size).toBe(chaves.length)
    expect(ids).not.toContain(PROVISORIO)
    for (const id of ids) expect(id).toMatch(/^pp_[a-z0-9]+_[a-z0-9]+$/)
    // `entrada` é a chave do que a loja manda: estado de parceiro nenhum mora lá.
    expect(chaves).not.toContain("entrada")
  })

  it("a loja tem os mesmos parceiros (apps/loja/src/lib/checkout-visivel.ts)", () => {
    const loja = readFileSync(
      resolve(__dirname, "../../../../../loja/src/lib/checkout-visivel.ts"),
      "utf8"
    )
    for (const p of PARCEIROS) {
      expect(loja).toContain(`"${p.id}"`)
      expect(loja).toContain(`chave: "${p.chave}"`)
    }
  })
})

describe("a sessão que virou o pagamento", () => {
  it("ignora o provisório e fica com a do parceiro", () => {
    const sessoes = [
      { id: "a", provider_id: PROVISORIO, status: "authorized" },
      { id: "b", provider_id: PAGARME.id, status: "pending" },
    ]
    expect(sessaoDoParceiro(sessoes)?.id).toBe("b")
  })

  it("prefere a que chegou mais longe; sem nenhuma assim, a última", () => {
    expect(
      sessaoDoParceiro([
        { id: "a", provider_id: PAGARME.id, status: "error" },
        { id: "b", provider_id: PAGARME.id, status: "captured" },
        { id: "c", provider_id: PAGARME.id, status: "pending" },
      ])?.id
    ).toBe("b")
    expect(
      sessaoDoParceiro([
        { id: "a", provider_id: PAGARME.id, status: "error" },
        { id: "b", provider_id: PAGARME.id, status: "pending" },
      ])?.id
    ).toBe("b")
    expect(
      sessaoDoParceiro([
        null,
        { id: "a", provider_id: PAGARME.id, status: "authorized" },
        undefined,
      ])?.id
    ).toBe("a")
  })

  it("sem sessão de parceiro nenhum, nenhuma", () => {
    expect(sessaoDoParceiro([{ provider_id: PROVISORIO, status: "authorized" }])).toBeNull()
    expect(sessaoDoParceiro([])).toBeNull()
    expect(sessaoDoParceiro(null)).toBeNull()
    expect(sessaoDoParceiro(undefined)).toBeNull()
  })
})

describe("o estado da sessão", () => {
  it("lê a chave do parceiro dono da sessão", () => {
    expect(estadoDaSessao({ provider_id: PAGARME.id, data: { pagarme: estadoPix } })).toEqual(
      estadoPix
    )
  })

  it("não lê o estado de quem não é parceiro, mesmo com a chave no data", () => {
    // A API pública deixa escrever no `data` de qualquer sessão.
    expect(estadoDaSessao({ provider_id: PROVISORIO, data: { pagarme: estadoPix } })).toBeNull()
    expect(estadoDaSessao({ data: { pagarme: estadoPix } })).toBeNull()
    expect(estadoDaSessao(null)).toBeNull()
  })

  it("sem estado, ou com forma que não existe, é nulo", () => {
    expect(estadoDaSessao({ provider_id: PAGARME.id, data: {} })).toBeNull()
    expect(estadoDaSessao({ provider_id: PAGARME.id, data: null })).toBeNull()
    expect(estadoDaSessao({ provider_id: PAGARME.id, data: "texto" })).toBeNull()
    expect(
      estadoDaSessao({ provider_id: PAGARME.id, data: { pagarme: { forma: "boleto" } } })
    ).toBeNull()
  })

  it("completa o que falta com o padrão, e cada parceiro lê a sua chave", () => {
    expect(lerEstado({ outro: { forma: "cartao" } }, "outro")).toEqual({
      forma: "cartao",
      situacao: "nova",
      valor: 0,
      pedido: null,
      cobranca: null,
      parcelas: 1,
      pix: null,
      cartao: null,
      recusa: null,
      estornado: 0,
    })
    expect(lerEstado({ outro: { forma: "cartao" } }, "pagarme")).toBeNull()
  })
})
