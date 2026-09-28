import { decidir, FLUXOS, lerConfigDosFluxos, type Entrada, type Registro } from "../fluxos"
import { SKU_DA_ROTINA } from "../jornada"
import {
  agiuDepois,
  chaveDaNavegacao,
  comANavegacaoDaVez,
  interessesDaPessoa,
  navegacaoDaVez,
  sugestoesDaNavegacao,
  type SinalDoProduto,
} from "../navegacao"

/**
 * A navegação abandonada (0198): quem a loja conhece e mostrou interesse num
 * produto — 2 visitas, 1 minuto na página ou o vídeo — sem pôr nada na
 * sacola. Uma a cada 7 dias por pessoa, sem cupom.
 */

const MIN = 60 * 1000
const HORA = 60 * MIN
const DIA = 24 * HORA
// 28/09, meio-dia em Brasília.
const AGORA = new Date("2026-09-28T15:00:00Z")
const antes = (ms: number) => new Date(AGORA.getTime() - ms)
const EMAIL = "rafael@exemplo.com"
const FATOR = "fator-de-crescimento-para-barba"
const OLEO = "oleo-para-barba"

const visto = (produto: string, em: Date): SinalDoProduto => ({
  tipo: "produto_visto",
  produto,
  em,
})

describe("o interesse", () => {
  it("2 visitas ao mesmo produto, com pelo menos 1 minuto e até 7 dias entre elas", () => {
    expect(interessesDaPessoa([visto(FATOR, antes(5 * HORA)), visto(FATOR, antes(HORA))])).toEqual([
      { produto: FATOR, em: antes(HORA), porque: "duas-visitas" },
    ])
    // Recarregar a página não é voltar a ela; a 3ª visita, depois, conta.
    expect(
      interessesDaPessoa([visto(FATOR, antes(HORA)), visto(FATOR, antes(HORA - 20_000))])
    ).toEqual([])
    expect(
      interessesDaPessoa([
        visto(FATOR, antes(HORA)),
        visto(FATOR, antes(HORA - 20_000)),
        visto(FATOR, antes(10 * MIN)),
      ])
    ).toEqual([{ produto: FATOR, em: antes(10 * MIN), porque: "duas-visitas" }])
    // Mais de 7 dias entre as duas: é outra visita, que começa a conta de novo.
    expect(interessesDaPessoa([visto(FATOR, antes(9 * DIA)), visto(FATOR, antes(HORA))])).toEqual(
      []
    )
    // Uma visita a cada produto não é interesse.
    expect(interessesDaPessoa([visto(FATOR, antes(2 * HORA)), visto(OLEO, antes(HORA))])).toEqual(
      []
    )
  })

  it("1 minuto na página ou o vídeo bastam — o primeiro de cada produto, do mais velho pro mais novo", () => {
    expect(
      interessesDaPessoa([
        { tipo: "video_assistido", produto: OLEO, em: antes(HORA) },
        { tipo: "produto_lido", produto: FATOR, em: antes(3 * HORA) },
        { tipo: "produto_lido", produto: FATOR, em: antes(2 * HORA) },
      ])
    ).toEqual([
      { produto: FATOR, em: antes(3 * HORA), porque: "um-minuto" },
      { produto: OLEO, em: antes(HORA), porque: "video" },
    ])
  })

  it("agiu: pôs na sacola ou começou o checkout DEPOIS do interesse", () => {
    expect(agiuDepois([antes(2 * HORA)], antes(HORA))).toBe(false)
    expect(agiuDepois([antes(2 * HORA), antes(30 * MIN)], antes(HORA))).toBe(true)
  })

  it("a chave: a pessoa, o produto e o dia do interesse em Brasília", () => {
    expect(chaveDaNavegacao(EMAIL, FATOR, new Date("2026-09-28T02:00:00Z"))).toBe(
      `${EMAIL}|${FATOR}|2026-09-27`
    )
  })
})

describe("uma navegação a cada 7 dias", () => {
  const entrada = (produto: string, comeco: Date): Entrada => ({
    fluxo: "navegacao",
    chave: chaveDaNavegacao(EMAIL, produto, comeco),
    email: EMAIL,
    comeco,
    comprou: false,
  })
  const registro = (e: Entrada, em: Date): Registro => ({
    email: EMAIL,
    fluxo: "navegacao",
    chave: e.chave,
    toque: "navegacao-3h",
    em,
    como: "enviado",
  })
  const fator = entrada(FATOR, antes(20 * HORA))
  const oleo = entrada(OLEO, antes(2 * HORA))

  it("entre as novas, a mais nova; a que já começou vai até o fim", () => {
    expect(navegacaoDaVez([fator, oleo], [], AGORA)).toBe(oleo)
    expect(navegacaoDaVez([fator, oleo], [registro(fator, antes(17 * HORA))], AGORA)).toBe(fator)
  })

  it("outra só 7 dias depois da última", () => {
    const velha = entrada(FATOR, antes(5 * DIA))
    expect(navegacaoDaVez([oleo], [registro(velha, antes(5 * DIA))], AGORA)).toBeNull()
    expect(navegacaoDaVez([oleo], [registro(velha, antes(8 * DIA))], AGORA)).toBe(oleo)
  })

  it("as entradas dos outros fluxos ficam como estão", () => {
    const carrinho: Entrada = { ...fator, fluxo: "carrinho", chave: "cart_1" }
    expect(comANavegacaoDaVez([carrinho, fator, oleo], [], AGORA)).toEqual([carrinho, oleo])
  })
})

describe("a navegação no motor", () => {
  it("começa desligada, sem cupom, com os toques de 3 e 24 horas, logo depois do carrinho", () => {
    expect(lerConfigDosFluxos({}).fluxos.navegacao).toEqual({ ligado: false, desde: null })
    expect(FLUXOS.navegacao.toques.map((t) => [t.id, t.depois / HORA, Boolean(t.cupom)])).toEqual([
      ["navegacao-3h", 3, false],
      ["navegacao-24h", 24, false],
    ])
    expect(FLUXOS.navegacao.prioridade).toBe(FLUXOS.carrinho.prioridade + 1)
    expect(FLUXOS.navegacao.prioridade).toBeLessThan(FLUXOS.reposicao.prioridade)
  })

  it("o carrinho da mesma pessoa vem antes; sozinha, sai em 3 horas", () => {
    const n: Entrada = {
      fluxo: "navegacao",
      chave: chaveDaNavegacao(EMAIL, FATOR, antes(3 * HORA)),
      email: EMAIL,
      comeco: antes(3 * HORA),
      comprou: false,
    }
    const sacola: Entrada = { ...n, fluxo: "carrinho", chave: "cart_1", comeco: antes(HORA) }
    const ligados = { navegacao: antes(10 * DIA), carrinho: antes(10 * DIA) }
    const comSacola = decidir({ entradas: [n, sacola], registros: [], ligados, agora: AGORA })
    expect(comSacola?.entrada.fluxo).toBe("carrinho")
    const r = decidir({ entradas: [n], registros: [], ligados, agora: AGORA })?.decisao
    expect(r?.tipo === "mandar" && r.toque.id).toBe("navegacao-3h")
    expect(r?.tipo === "mandar" && r.darCupom).toBe(false)
  })
})

describe("a rotina do e-mail de 24 horas", () => {
  it("quem olhou o Fator: o óleo e os 3 Fatores; já com o óleo, o shampoo", () => {
    expect(sugestoesDaNavegacao(FATOR, new Set())).toEqual([
      SKU_DA_ROTINA.oleo,
      SKU_DA_ROTINA.tresFatores,
    ])
    expect(sugestoesDaNavegacao(FATOR, new Set(["oleo"]))).toEqual([
      SKU_DA_ROTINA.shampoo,
      SKU_DA_ROTINA.kitCompleto,
    ])
  })

  it("quem olhou um cuidado: o Kit Completo; quem olhou a pasta, nada", () => {
    expect(sugestoesDaNavegacao(OLEO, new Set())).toEqual([SKU_DA_ROTINA.kitCompleto])
    expect(sugestoesDaNavegacao("pasta-modeladora-matte-80g-fucking-barba", new Set())).toEqual([])
  })
})
