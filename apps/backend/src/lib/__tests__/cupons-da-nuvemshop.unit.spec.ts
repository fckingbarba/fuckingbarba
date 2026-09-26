import { areRulesValidForContext } from "@medusajs/promotion/dist/utils/validations/promotion-rule"
import {
  CUPONS_DA_NUVEMSHOP,
  lerCupomDaNuvemshop,
  planoDosCupons,
  type CupomDaNuvemshop,
} from "../cupons-da-nuvemshop"
import { contextoDosCupons, cupomNaLista, fimDoDia, lerCupomNovo, promocaoDoCupom } from "../cupons"

/**
 * Os cupons da Nuvemshop na loja nova: a lista que o dono mandou em 26/09,
 * como cada coluna vira cupom, e o plano da migração (o que cria, o que pula
 * e o que fica de fora).
 */

const AGORA = new Date("2026-09-26T17:00:00-03:00")
const linha = (codigo: string) => CUPONS_DA_NUVEMSHOP.find((c) => c.codigo === codigo)!

describe("a lista da Nuvemshop", () => {
  it("tem os 111 cupons ativos de 26/09, sem código repetido, na ordem de lá", () => {
    const codigos = CUPONS_DA_NUVEMSHOP.map((c) => c.codigo)
    expect(codigos).toHaveLength(111)
    expect(new Set(codigos.map((c) => c.toUpperCase())).size).toBe(111)
    expect(codigos).toEqual([...codigos].sort())
  })

  it("só tem o que a leitura conhece em cada coluna", () => {
    for (const c of CUPONS_DA_NUVEMSHOP) {
      const lido = lerCupomDaNuvemshop(c)
      if (lido.ok) continue
      expect([c.codigo, lido.motivo]).toEqual([
        c.codigo,
        expect.stringMatching(/^(frete grátis|"1 limite" na Nuvemshop)/),
      ])
    }
  })
})

describe("cada coluna de lá vira o cupom do painel", () => {
  it('"0 de 1" é 1 uso no total; "14 usos", sem limite; sem condição nenhuma', () => {
    expect(lerCupomDaNuvemshop(linha("0P2XSB"))).toEqual({
      ok: true,
      cupom: {
        codigo: "0P2XSB",
        tipo: "porcento",
        valor: 10,
        soMaisBarato: false,
        aplicarA: "loja",
        alvos: [],
        combina: true,
        limite: 1,
        porCliente: null,
        primeiraCompra: false,
        de: null,
        ate: null,
        minimo: null,
      },
    })
    const primeira = lerCupomDaNuvemshop(linha("PRIMEIRACOMPRA"))
    expect(primeira.ok && primeira.cupom).toMatchObject({ valor: 10, limite: null })
    const barba = lerCupomDaNuvemshop(linha("BARBA15"))
    expect(barba.ok && barba.cupom).toMatchObject({ tipo: "porcento", valor: 15, limite: null })
  })

  it('"R$ 20" é desconto em reais', () => {
    const r = lerCupomDaNuvemshop(linha("ARTHUR20"))
    expect(r.ok && r.cupom).toMatchObject({ tipo: "reais", valor: 20, limite: 1 })
    const centavos = lerCupomDaNuvemshop({ codigo: "X10", desconto: "R$ 12,50", usos: "0 usos" })
    expect(centavos.ok && centavos.cupom).toMatchObject({ tipo: "reais", valor: 12.5 })
  })

  it("a vigência vale até o fim do último dia, e o código fica com o _", () => {
    const r = lerCupomDaNuvemshop(linha("ARTIDA10_7XGS"))
    expect(r.ok && r.cupom).toMatchObject({ codigo: "ARTIDA10_7XGS", ate: "2026-09-29", limite: 1 })
  })

  it("o que já foi usado lá sai do limite; esgotado fica de fora", () => {
    const r = lerCupomDaNuvemshop({ codigo: "DOIS", desconto: "10 %", usos: "1 de 3" })
    expect(r.ok && r.cupom.limite).toBe(2)
    expect(lerCupomDaNuvemshop({ codigo: "UMUSO", desconto: "10 %", usos: "1 de 1" })).toEqual({
      ok: false,
      motivo: "esgotado lá (1 de 1)",
    })
  })

  it('frete grátis e o "1 limite" sem a condição ficam de fora; com a condição, entram', () => {
    expect(lerCupomDaNuvemshop(linha("FRETEGRATISDOM"))).toMatchObject({
      ok: false,
      motivo: expect.stringMatching(/^frete grátis/),
    })
    expect(lerCupomDaNuvemshop(linha("KIT15"))).toEqual({
      ok: false,
      motivo: '"1 limite" na Nuvemshop, e a lista não diz qual',
    })
    const comCondicao: CupomDaNuvemshop = {
      ...linha("ITAPEMA25"),
      condicao: { minimo: 150, porCliente: 1 },
    }
    const r = lerCupomDaNuvemshop(comCondicao)
    expect(r.ok && r.cupom).toMatchObject({
      tipo: "reais",
      valor: 25,
      minimo: 150,
      porCliente: 1,
      primeiraCompra: false,
      limite: null,
    })
  })

  it("o que não sabe ler, não inventa", () => {
    const base = { codigo: "ABC10", desconto: "10 %", usos: "0 usos" }
    for (const errada of [
      { ...base, codigo: "abc10" },
      { ...base, codigo: "BUMP-OLEO" },
      { ...base, desconto: "10" },
      { ...base, desconto: "150 %" },
      { ...base, desconto: "R$ 0" },
      { ...base, usos: "muitos" },
      { ...base, vigencia: "até 29/09/2026" },
      { ...base, vigencia: "26/09/2026 às 00:00 até 29/09/2026 às 12:00" },
    ])
      expect(lerCupomDaNuvemshop(errada).ok).toBe(false)
  })

  it("todo cupom que entra passaria no formulário do painel (o _ vira -, a data antes de vencer)", () => {
    const antes = new Date("2026-09-22T12:00:00-03:00")
    for (const c of CUPONS_DA_NUVEMSHOP) {
      const lido = lerCupomDaNuvemshop(c)
      if (!lido.ok) continue
      const { codigo, ...resto } = lido.cupom
      const noFormulario = lerCupomNovo({ ...resto, codigo: codigo.replace(/_/g, "-") }, antes)
      expect([codigo, noFormulario.ok]).toEqual([codigo, true])
    }
  })
})

describe("o plano da migração", () => {
  it('em 26/09: cria 104, com 2 de frete e 5 de "1 limite" de fora', () => {
    const plano = planoDosCupons(CUPONS_DA_NUVEMSHOP, [], AGORA)
    expect(plano.criar).toHaveLength(104)
    expect(plano.jaExistem).toEqual([])
    expect(plano.deFora.map((f) => f.codigo)).toEqual([
      "10PILA",
      "FRETEG",
      "FRETEGRATISDOM",
      "ITAPEMA25",
      "KIT15",
      "PRIMEIRA10",
      "RIBEIRO",
    ])
    // A lista do painel põe o mais novo em cima: criar de Z a A faz ela ler de A a Z.
    const ordem = plano.criar.map((c) => c.codigo)
    expect(ordem).toEqual([...ordem].sort().reverse())
    expect(ordem.at(-1)).toBe("0P2XSB")
  })

  it("pula o código que já existe no Medusa, em qualquer caixa", () => {
    const plano = planoDosCupons(
      CUPONS_DA_NUVEMSHOP,
      ["primeiracompra", "BARBA15", null, "BUMP-OLEO-1"],
      AGORA
    )
    expect(plano.jaExistem).toEqual(["BARBA15", "PRIMEIRACOMPRA"])
    expect(plano.criar).toHaveLength(102)
  })

  it("o que venceu antes do deploy fica de fora; o do dia ainda entra", () => {
    const dia28 = new Date("2026-09-28T09:00:00-03:00")
    const plano = planoDosCupons(CUPONS_DA_NUVEMSHOP, [], dia28)
    const vencidos = plano.deFora.filter((f) => f.motivo.startsWith("venceu"))
    expect(vencidos).toEqual([
      { codigo: "CARLOS10_FRJR", motivo: "venceu em 27/09" },
      { codigo: "FLAVIO10_FM5X", motivo: "venceu em 27/09" },
      { codigo: "HENRIQ10_9HYJ", motivo: "venceu em 26/09" },
      { codigo: "JOO10_7YR8", motivo: "venceu em 27/09" },
      { codigo: "LUIZ10_K8C7", motivo: "venceu em 27/09" },
      { codigo: "MARCEL10_26ZC", motivo: "venceu em 26/09" },
    ])
    expect(plano.criar.map((c) => c.codigo)).toEqual(
      expect.arrayContaining(["MARIA10_ZVDB", "WILSON10_6XU5", "ARTIDA10_7XGS"])
    )
    expect(plano.criar).toHaveLength(98)
    // Depois de 29/09, os 12 de poucos dias já não entram.
    const outubro = planoDosCupons(CUPONS_DA_NUVEMSHOP, [], new Date("2026-10-01T12:00:00Z"))
    expect(outubro.criar).toHaveLength(92)
  })

  it("a promoção é a do painel, com a linha de lá guardada", () => {
    const plano = planoDosCupons(CUPONS_DA_NUVEMSHOP, [], AGORA)
    const artida = plano.criar.find((c) => c.codigo === "ARTIDA10_7XGS")!.promocao
    const lido = lerCupomDaNuvemshop(linha("ARTIDA10_7XGS"))
    const doPainel = promocaoDoCupom(lido.ok ? lido.cupom : (null as never), "Nuvemshop", AGORA)
    expect(artida).toEqual({
      ...doPainel,
      metadata: {
        fb_cupom: doPainel.metadata.fb_cupom,
        fb_nuvemshop: {
          desconto: "10 %",
          usos: "0 de 1",
          vigencia: "26/09/2026 às 00:00 até 29/09/2026 às 23:59",
          lista: "2026-09-26",
        },
      },
    })
    expect(artida).toMatchObject({ code: "ARTIDA10_7XGS", status: "active", is_automatic: false })
    expect(artida.metadata.fb_cupom).toMatchObject({ criadoPor: "Nuvemshop", limite: 1 })
    const primeira = plano.criar.find((c) => c.codigo === "PRIMEIRACOMPRA")!.promocao
    expect("limit" in primeira).toBe(false)
    expect(primeira.rules).toEqual([])
    expect(primeira.metadata.fb_nuvemshop).toEqual({
      desconto: "10 %",
      usos: "170 usos",
      lista: "2026-09-26",
    })
  })

  it("o Medusa aplica o de data até 23:59 do último dia, em Brasília, e não depois", () => {
    const plano = planoDosCupons(CUPONS_DA_NUVEMSHOP, [], AGORA)
    const { rules } = plano.criar.find((c) => c.codigo === "VICTOR10_YMMY")!.promocao
    // As regras como o Medusa guarda: cada valor num objeto.
    const guardadas = rules.map((r) => ({ ...r, values: r.values.map((value) => ({ value })) }))
    const em = (agora: number) =>
      areRulesValidForContext(
        guardadas as never,
        contextoDosCupons({ itens: [{ unit_price: 54.9, quantity: 1 }], pedidos: [], agora }),
        "order" as never
      )
    expect(em(new Date("2026-09-29T23:59:00-03:00").getTime())).toBe(true)
    expect(em(fimDoDia("2026-09-29") + 1)).toBe(false)
  })

  it("no painel, cada um aparece em frase, como os criados lá", () => {
    const plano = planoDosCupons(CUPONS_DA_NUVEMSHOP, [], AGORA)
    const naLista = (codigo: string) => {
      const p = plano.criar.find((c) => c.codigo === codigo)!.promocao
      return cupomNaLista(
        { id: `promo_${codigo}`, used: 0, ...p },
        { pedidos: 0, desconto: 0, vendeu: 0 },
        AGORA
      )
    }
    expect(naLista("ARTHUR20")).toMatchObject({
      descricao: "R$ 20,00 de desconto em qualquer pedido",
      regra: "sem data de fim · 1 uso no total",
      usos: "0 de 1 usos",
      situacao: "valendo",
    })
    expect(naLista("MARIA10_T5AL")).toMatchObject({
      descricao: "10% em qualquer pedido",
      regra: "até 29/09 · 1 uso no total",
      situacao: "valendo",
    })
    expect(naLista("PRIMEIRACOMPRA")).toMatchObject({
      regra: "sem data de fim",
      usos: "0 usos",
    })
  })
})
