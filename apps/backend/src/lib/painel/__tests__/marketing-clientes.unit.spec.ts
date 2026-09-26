import { janelasDo } from "../marketing"
import { montarClientes, ufDe } from "../marketing-clientes"
import type { PedidoCru } from "../pedido"

/**
 * Os clientes do Marketing: o estado pelo nome ou pela sigla, a primeira
 * compra e a volta (pelo e-mail, na história inteira), o tempo até a segunda
 * compra, os estados e os achados. A hora é de Brasília: 24/09/2026, 12:00
 * aqui = 15:00 UTC.
 */

const AGORA = new Date("2026-09-24T15:00:00.000Z")
const SETE = janelasDo("7d", AGORA).atual
const em = (quando: string) => new Date(`${quando.replace(" ", "T")}:00-03:00`).toISOString()

let n = 0
function pedido(p: {
  email: string
  pagoEm?: string
  total: number
  uf?: string
  frete?: number
  status?: string
}): PedidoCru & { shipping_total: number } {
  n++
  return {
    id: `order_${n}`,
    created_at: p.pagoEm ? em(p.pagoEm) : AGORA.toISOString(),
    status: p.status ?? "pending",
    email: p.email,
    total: p.total,
    shipping_total: p.frete ?? 0,
    shipping_address: { province: p.uf ?? "SP" },
    payment_collections: p.pagoEm ? [{ payments: [{ captured_at: em(p.pagoEm) }] }] : [],
  }
}

describe("o estado", () => {
  it("pela sigla ou pelo nome, com ou sem acento", () => {
    expect(ufDe("SP")).toBe("SP")
    expect(ufDe(" sp ")).toBe("SP")
    expect(ufDe("São Paulo")).toBe("SP")
    expect(ufDe("Rio Grande do Sul")).toBe("RS")
    expect(ufDe("Pará")).toBe("PA")
    expect(ufDe("XX")).toBeNull()
    expect(ufDe(12)).toBeNull()
  })
})

describe("a primeira compra, a volta e o tempo até a segunda", () => {
  const pedidos = [
    pedido({ email: "a@x.com", pagoEm: "2026-08-01 10:00", total: 90 }),
    pedido({ email: "a@x.com", pagoEm: "2026-09-20 10:00", total: 100, uf: "SP", frete: 20 }),
    pedido({ email: "b@x.com", pagoEm: "2026-09-21 10:00", total: 80, uf: "SC", frete: 0 }),
    // A mesma pessoa, com o e-mail em maiúsculas.
    pedido({ email: "B@X.com", pagoEm: "2026-09-23 10:00", total: 120, uf: "sp", frete: 15 }),
    pedido({ email: "c@x.com", pagoEm: "2026-09-22 10:00", total: 60, uf: "Bahia", frete: 35 }),
    // Sem pagar, e pago depois cancelado: não contam.
    pedido({ email: "d@x.com", total: 50 }),
    pedido({ email: "e@x.com", pagoEm: "2026-09-22 11:00", total: 70, status: "canceled" }),
  ]
  const c = montarClientes(pedidos, SETE)

  it("as partes são dos pedidos do período, e a primeira compra é a primeira da história", () => {
    expect(c.compraram).toBe(3)
    expect(c.primeira).toEqual({ pedidos: 2, parte: 50, ticket: 70 })
    expect(c.voltaram).toEqual({ pedidos: 2, parte: 50, ticket: 110 })
  })

  it("as partes somam 100, mesmo quando o arredondamento passaria", () => {
    const oito = montarClientes(
      [
        pedido({ email: "r@x.com", pagoEm: "2026-08-01 10:00", total: 90 }),
        ...Array.from({ length: 7 }, (_, i) =>
          pedido({ email: "r@x.com", pagoEm: `2026-09-2${i % 3} 1${i}:00`, total: 90 })
        ),
        pedido({ email: "n@x.com", pagoEm: "2026-09-22 10:00", total: 90 }),
      ],
      SETE
    )
    // 1 de 8 é 12,5% e 7 de 8, 87,5%: arredondados, dariam 13 + 88 = 101.
    expect([oito.primeira.parte, oito.voltaram.parte]).toEqual([13, 87])
  })

  it("da primeira pra segunda compra: a média de quem voltou, na história inteira", () => {
    // a@: 50 dias; b@: 2 dias.
    expect(c.segunda).toEqual({ dias: 26, pessoas: 2 })
  })

  it("por estado, do que mais vendeu pro que menos, com o frete médio", () => {
    expect(c.estados).toEqual([
      { uf: "SP", pedidos: 2, receita: 220, ticket: 110, frete: 17.5 },
      { uf: "SC", pedidos: 1, receita: 80, ticket: 80, frete: 0 },
      { uf: "BA", pedidos: 1, receita: 60, ticket: 60, frete: 35 },
    ])
  })

  it("com poucos pedidos, o achado diz que ainda é cedo", () => {
    expect(c.achados).toEqual([
      expect.objectContaining({ tipo: "info", titulo: "Ainda é pouco pra conhecer os clientes" }),
    ])
  })
})

describe("os estados de menos venda e os achados", () => {
  it("depois do oitavo estado, os outros vão juntos", () => {
    const ufs = ["SP", "RJ", "MG", "RS", "PR", "SC", "BA", "PE", "CE", "GO"]
    const c = montarClientes(
      ufs.map((uf, i) =>
        pedido({ email: `${uf}@x.com`, pagoEm: "2026-09-22 10:00", total: 100 - i, uf })
      ),
      SETE
    )
    expect(c.estados.map((e) => e.uf)).toEqual([
      "SP",
      "RJ",
      "MG",
      "RS",
      "PR",
      "SC",
      "BA",
      "PE",
      "Outros 2",
    ])
    expect(c.estados.at(-1)).toMatchObject({ pedidos: 2, receita: 183 })
  })

  it("a segunda compra em dias (com gente que chegue) e o estado onde o frete pesa", () => {
    const pedidos = [
      // Cinco pessoas que voltaram, 30 dias depois.
      ...Array.from({ length: 5 }, (_, i) => [
        pedido({ email: `v${i}@x.com`, pagoEm: "2026-08-21 10:00", total: 90 }),
        pedido({
          email: `v${i}@x.com`,
          pagoEm: "2026-09-20 10:00",
          total: 90,
          uf: "SP",
          frete: 10,
        }),
      ]).flat(),
      // Três pedidos no Pará, com frete caro.
      ...Array.from({ length: 3 }, (_, i) =>
        pedido({
          email: `pa${i}@x.com`,
          pagoEm: "2026-09-21 10:00",
          total: 150,
          uf: "PA",
          frete: 42,
        })
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        pedido({ email: `n${i}@x.com`, pagoEm: "2026-09-22 10:00", total: 80, uf: "SP", frete: 0 })
      ),
    ]
    // O "R$" do Intl vem com o espaço fixo: aqui, espaço comum.
    expect(montarClientes(pedidos, SETE).achados.map((a) => a.titulo.replace(/\s/g, " "))).toEqual([
      "A segunda compra vem 30 dias depois da primeira, em média",
      "Em PA, o frete médio passa de R$ 30,00",
    ])
  })
})
