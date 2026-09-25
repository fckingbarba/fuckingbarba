import { areRulesValidForContext } from "@medusajs/promotion/dist/utils/validations/promotion-rule"
import {
  CAMPOS_DO_CONTEXTO,
  contextoDosCupons,
  cupomNaLista,
  descricaoDoCupom,
  ehCupomDeCampanha,
  fimDoDia,
  lerCupomNovo,
  promocaoDoCupom,
  regraDoCupom,
  regrasDoCupom,
  usosPorCodigo,
  type CupomNovo,
  type PedidoDoEmail,
} from "../cupons"

/**
 * Os cupons do painel: o formulário, a promoção que vai pro Medusa (com as
 * regras sobre o contexto do gancho), o contexto em si, e a lista.
 */

const AGORA = new Date("2026-09-24T21:10:00-03:00")
const BASE = {
  codigo: "barba 20",
  tipo: "porcento",
  valor: "20",
  minimo: "R$ 99,90",
  ate: "2026-10-15",
  limite: "200",
  umaVezPorCliente: true,
  primeiraCompra: false,
}

describe("o formulário do cupom", () => {
  it("normaliza o código e lê os números em reais", () => {
    const r = lerCupomNovo(BASE, AGORA)
    expect(r).toEqual({
      ok: true,
      cupom: {
        codigo: "BARBA20",
        tipo: "porcento",
        valor: 20,
        minimo: 99.9,
        ate: "2026-10-15",
        limite: 200,
        umaVezPorCliente: true,
        primeiraCompra: false,
      },
    })
    const reais = lerCupomNovo({ ...BASE, tipo: "reais", valor: "1.234,50", minimo: "" }, AGORA)
    expect(reais.ok && reais.cupom).toMatchObject({ valor: 1234.5, minimo: null })
  })

  it("diz o que está errado em cada campo", () => {
    const r = lerCupomNovo(
      { codigo: "x", tipo: "porcento", valor: "12,5", ate: "2026-09-23", limite: "0" },
      AGORA
    )
    expect(r.ok).toBe(false)
    expect(!r.ok && Object.keys(r.erros).sort()).toEqual(["ate", "codigo", "limite", "valor"])
    const bump = lerCupomNovo({ ...BASE, codigo: "BUMP-XYZ" }, AGORA)
    expect(!bump.ok && bump.erros.codigo).toMatch(/ofertas do checkout/)
    const menor = lerCupomNovo({ ...BASE, tipo: "reais", valor: "50", minimo: "30" }, AGORA)
    expect(!menor.ok && menor.erros.minimo).toMatch(/maior que o desconto/)
    // Hoje ainda vale: o cupom dura até o fim do dia.
    expect(lerCupomNovo({ ...BASE, ate: "2026-09-24" }, AGORA).ok).toBe(true)
  })
})

const cupom = (extra: Partial<CupomNovo> = {}): CupomNovo => ({
  codigo: "BARBA20",
  tipo: "porcento",
  valor: 20,
  minimo: 99.9,
  ate: "2026-10-15",
  limite: 200,
  umaVezPorCliente: true,
  primeiraCompra: true,
  ...extra,
})

describe("a promoção do Medusa", () => {
  it("porcentagem nos produtos, com o limite e uma regra pra cada condição", () => {
    const p = promocaoDoCupom(cupom(), "Ana", AGORA)
    expect(p).toMatchObject({
      code: "BARBA20",
      status: "active",
      is_automatic: false,
      limit: 200,
      application_method: { type: "percentage", target_type: "items", value: 20 },
    })
    expect(p.rules).toEqual([
      { attribute: CAMPOS_DO_CONTEXTO.conferido, operator: "eq", values: ["sim"] },
      { attribute: CAMPOS_DO_CONTEXTO.produtos, operator: "gte", values: ["99.9"] },
      {
        attribute: CAMPOS_DO_CONTEXTO.agora,
        operator: "lte",
        values: [String(fimDoDia("2026-10-15"))],
      },
      { attribute: CAMPOS_DO_CONTEXTO.usados, operator: "ne", values: ["BARBA20"] },
      { attribute: CAMPOS_DO_CONTEXTO.pedidos, operator: "eq", values: ["0"] },
    ])
    expect(new Date(fimDoDia("2026-10-15")).toISOString()).toBe("2026-10-16T02:59:59.999Z")
  })

  it("reais: no pedido, em real; sem condição nenhuma, sem regra e sem limite", () => {
    const p = promocaoDoCupom(
      cupom({
        tipo: "reais",
        valor: 20,
        minimo: null,
        ate: null,
        limite: null,
        umaVezPorCliente: false,
        primeiraCompra: false,
      }),
      "Ana",
      AGORA
    )
    expect(p.application_method).toMatchObject({
      type: "fixed",
      target_type: "order",
      currency_code: "brl",
    })
    expect(p.rules).toEqual([])
    expect("limit" in p).toBe(false)
  })
})

describe("o contexto que o gancho põe no carrinho", () => {
  it("a soma dos produtos, os pedidos não cancelados e os códigos usados", () => {
    const c = contextoDosCupons({
      itens: [
        { unit_price: 46.3, quantity: 3 },
        { unit_price: 54.9, quantity: 1 },
      ],
      pedidos: [
        { status: "completed", codigos: ["barba20", "BUMP-OLEO-1"] },
        { status: "canceled", codigos: ["PRIMEIRA10"] },
        { status: "pending", codigos: [] },
      ],
      agora: 123,
    })
    expect(c).toEqual({
      fb_cupons: {
        conferido: "sim",
        produtos: 193.8,
        pedidos: 2,
        usados: ["BARBA20", "BUMP-OLEO-1"],
        agora: 123,
      },
    })
  })

  it("sem o histórico (a consulta falhou), sai sem a trava", () => {
    expect(
      contextoDosCupons({ itens: [{ unit_price: 10, quantity: 2 }], pedidos: null, agora: 5 })
    ).toEqual({ fb_cupons: { produtos: 20, agora: 5 } })
  })
})

describe("as regras no avaliador do próprio Medusa", () => {
  // O mesmo código que decide no carrinho: se uma versão nova do Medusa
  // mudar o jeito de comparar, este teste avisa.
  const vale = (c: CupomNovo, contexto: object) =>
    areRulesValidForContext(
      regrasDoCupom(c).map((r) => ({
        ...r,
        values: r.values.map((value) => ({ value })),
      })) as never,
      contexto,
      "order" as never
    )
  const sacola = (reais: number, pedidos: PedidoDoEmail[] | null, agora = AGORA.getTime()) =>
    contextoDosCupons({ itens: [{ unit_price: reais, quantity: 1 }], pedidos, agora })
  const comprou = (codigos: string[], status = "completed") => [{ status, codigos }]

  it("com o histórico lido, confere cada condição", () => {
    expect(vale(cupom(), sacola(120, []))).toBe(true)
    expect(vale(cupom(), sacola(90, []))).toBe(false)
    expect(vale(cupom(), sacola(120, [], fimDoDia("2026-10-15") + 1))).toBe(false)
    expect(vale(cupom(), sacola(120, comprou([])))).toBe(false)
    const outraVez = cupom({ primeiraCompra: false })
    expect(vale(outraVez, sacola(120, comprou(["barba20"])))).toBe(false)
    expect(vale(outraVez, sacola(120, comprou(["barba20"], "canceled")))).toBe(true)
    expect(vale(outraVez, sacola(120, comprou(["OUTRO"])))).toBe(true)
  })

  it("sem a conferência do gancho, cupom com condição não vale; sem condição, vale", () => {
    const soAData = cupom({ minimo: null, umaVezPorCliente: false, primeiraCompra: false })
    expect(vale(soAData, sacola(120, []))).toBe(true)
    expect(vale(soAData, {})).toBe(false)
    expect(vale(cupom({ primeiraCompra: false }), sacola(120, null))).toBe(false)
    const livre = cupom({ minimo: null, ate: null, umaVezPorCliente: false, primeiraCompra: false })
    expect(vale(livre, {})).toBe(true)
  })
})

describe("a lista", () => {
  const promocao = {
    id: "promo_01",
    code: "BARBA20",
    status: "active",
    limit: 100,
    used: 23,
    metadata: {
      fb_cupom: {
        tipo: "porcento",
        valor: 15,
        minimo: 99.9,
        ate: "2026-09-30",
        limite: 100,
        umaVezPorCliente: false,
        primeiraCompra: false,
      },
    },
  }
  const uso = { pedidos: 20, desconto: 412.8, vendeu: 2753.1 }

  it("em frase, com a situação", () => {
    expect(cupomNaLista(promocao, uso, AGORA)).toEqual({
      id: "promo_01",
      codigo: "BARBA20",
      descricao: "15% em pedidos a partir de R$ 99,90",
      regra: "até 30/09 · 100 usos no total",
      usos: "23 de 100 usos",
      situacao: "valendo",
      ligado: true,
      ...uso,
    })
    expect(cupomNaLista({ ...promocao, status: "inactive" }, uso, AGORA).situacao).toBe("pausado")
    expect(cupomNaLista({ ...promocao, used: 100 }, uso, AGORA).situacao).toBe("esgotado")
    expect(cupomNaLista(promocao, uso, new Date("2026-10-01T10:00:00-03:00")).situacao).toBe(
      "vencido"
    )
  })

  it("o cupom de antes do painel (o do script) sai da promoção", () => {
    const antigo = {
      id: "promo_02",
      code: "PRIMEIRA10",
      status: "active",
      application_method: { type: "percentage", value: 10 },
    }
    expect(cupomNaLista(antigo, { pedidos: 0, desconto: 0, vendeu: 0 }, AGORA)).toMatchObject({
      descricao: "10% em qualquer pedido",
      regra: "sem data de fim",
      usos: "0 usos",
    })
  })

  it("as frases do tipo e das regras", () => {
    expect(descricaoDoCupom({ tipo: "reais", valor: 20, minimo: 150 })).toBe(
      "R$ 20,00 de desconto em pedidos a partir de R$ 150,00"
    )
    expect(
      regraDoCupom({ ate: null, limite: 1, umaVezPorCliente: true, primeiraCompra: true })
    ).toBe("sem data de fim · 1 uso no total · uma vez por cliente · só na primeira compra")
  })

  it("a oferta do checkout e as automáticas não são cupom de campanha", () => {
    expect(ehCupomDeCampanha({ id: "a", code: "BUMP-OLEO-X" })).toBe(false)
    expect(ehCupomDeCampanha({ id: "b", code: "FRETE", is_automatic: true })).toBe(false)
    expect(ehCupomDeCampanha({ id: "c", code: "BARBA20" })).toBe(true)
  })

  it("os pedidos contam por código: não cancelados; o vendido, só dos pagos", () => {
    const usos = usosPorCodigo([
      {
        status: "completed",
        pago: true,
        total: 100,
        ajustes: [
          { code: "BARBA20", amount: 10 },
          { code: "BARBA20", amount: 5 },
        ],
      },
      { status: "pending", pago: false, total: 80, ajustes: [{ code: "barba20", amount: 8 }] },
      { status: "canceled", pago: true, total: 90, ajustes: [{ code: "BARBA20", amount: 9 }] },
    ])
    expect(usos.get("BARBA20")).toEqual({ pedidos: 2, desconto: 23, vendeu: 100 })
  })
})
