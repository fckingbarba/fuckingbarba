import {
  componentesDoItem,
  componentesDoProduto,
  etiquetasDaPessoa,
  REGRAS_PADRAO,
  type PedidoDaPessoa,
  type SinaisDaPessoa,
} from "../etiquetas"

/**
 * As cinco etiquetas de cada pessoa: a etapa, o engajamento, o dia do
 * tratamento, a próxima compra e o cupom — com o porquê de cada uma.
 */

const AGORA = new Date("2026-09-27T15:00:00Z")
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000)
const SEM_SINAIS: SinaisDaPessoa = { ultimoClique: null, ultimaVisita: null, newsletterDesde: null }

const pedido = (extra: Partial<PedidoDaPessoa>): PedidoDaPessoa => ({
  id: "order_1",
  numero: "1001",
  pagoEm: diasAtras(20),
  entregueEm: diasAtras(14),
  cancelado: false,
  itens: [
    { handle: "fator-de-crescimento-para-barba", nome: "Fator de Crescimento", quantidade: 1 },
  ],
  cupons: [],
  ...extra,
})

describe("o que vem em cada produto", () => {
  it("pelo endereço: o kit de N, o duplo, o kit de dois produtos e o completo", () => {
    expect(componentesDoProduto("fator-de-crescimento-para-barba")).toEqual([
      { componente: "fator", unidades: 1 },
    ])
    expect(componentesDoProduto("kit-3-fator-de-crescimento-para-barba")).toEqual([
      { componente: "fator", unidades: 3 },
    ])
    expect(componentesDoProduto("kit-shampoo-para-barba-duplo-fuckingbarba")).toEqual([
      { componente: "shampoo", unidades: 2 },
    ])
    expect(componentesDoProduto("kit-fator-de-crescimento-para-barba-e-shampoo")).toEqual([
      { componente: "fator", unidades: 1 },
      { componente: "shampoo", unidades: 1 },
    ])
    expect(componentesDoProduto("kit-completo-para-barba").map((c) => c.componente)).toEqual([
      "shampoo",
      "balm",
      "oleo",
    ])
    expect(componentesDoProduto("pasta-modeladora-matte-80g-fucking-barba")).toEqual([
      { componente: "pasta", unidades: 1 },
    ])
    expect(componentesDoProduto("camiseta-da-loja")).toEqual([])
    expect(componentesDoProduto(null)).toEqual([])
  })
})

describe("o que vem em cada item: o SKU antes do endereço", () => {
  it("os kits que o nome não diz; o SKU desconhecido cai no endereço", () => {
    expect(componentesDoItem({ sku: "FBKIT02", handle: "kit-essencial-fuckingbarba" })).toEqual([
      { componente: "shampoo", unidades: 1 },
      { componente: "balm", unidades: 1 },
    ])
    expect(componentesDoItem({ sku: " fbkit06 ", handle: null })).toEqual([
      { componente: "fator", unidades: 3 },
    ])
    expect(componentesDoItem({ sku: "OUTRO01", handle: "oleo-para-barba" })).toEqual([
      { componente: "oleo", unidades: 1 },
    ])
    expect(componentesDoItem({ sku: null, handle: "camiseta" })).toEqual([])
  })

  it("a próxima compra de quem levou o Kit Hidratação pelo SKU", () => {
    const e = etiquetasDaPessoa({
      pedidos: [
        pedido({
          entregueEm: new Date("2026-09-20T12:00:00Z"),
          itens: [
            {
              handle: "kit-hidratacao-fuckingbarba",
              sku: "FBKIT04",
              nome: "Kit Hidratação",
              quantidade: 1,
            },
          ],
        }),
      ],
      sinais: SEM_SINAIS,
      agora: AGORA,
    })
    // Shampoo (65 dias) e óleo (70): a próxima compra é a do que acaba primeiro, o shampoo.
    expect(e.proximaCompra.em).toEqual(new Date("2026-11-24T12:00:00Z"))
    expect(e.tratamento.dia).toBeNull()
  })
})

describe("a etapa", () => {
  it("lead: sem compra paga (o cancelado não conta)", () => {
    expect(
      etiquetasDaPessoa({
        pedidos: [pedido({ cancelado: true })],
        sinais: SEM_SINAIS,
        agora: AGORA,
      }).etapa
    ).toEqual({ valor: "lead", porque: "tem e-mail e ainda não comprou" })
  })

  it("1ª compra: pago e ainda a caminho; em tratamento: entregue", () => {
    const aCaminho = etiquetasDaPessoa({
      pedidos: [pedido({ pagoEm: diasAtras(2), entregueEm: null })],
      sinais: SEM_SINAIS,
      agora: AGORA,
    })
    expect(aCaminho.etapa).toEqual({
      valor: "primeira-compra",
      porque: "pagou o pedido #1001, que ainda não chegou",
    })
    expect(aCaminho.tratamento).toEqual({ dia: null, porque: "o primeiro Fator está a caminho" })

    const recebido = etiquetasDaPessoa({ pedidos: [pedido({})], sinais: SEM_SINAIS, agora: AGORA })
    expect(recebido.etapa.valor).toBe("em-tratamento")
    expect(recebido.etapa.porque).toMatch(/^1 pedido, recebido em \d\d\/\d\d$/)
    expect(recebido.tratamento.dia).toBe(14)
  })

  it("sem o aviso de entrega, conta entregue 7 dias depois de pago (passados 10)", () => {
    const e = etiquetasDaPessoa({
      pedidos: [pedido({ pagoEm: diasAtras(12), entregueEm: null })],
      sinais: SEM_SINAIS,
      agora: AGORA,
    })
    expect(e.etapa.valor).toBe("em-tratamento")
    expect(e.etapa.porque).toMatch(/entregue por volta de/)
    expect(e.tratamento.dia).toBe(5)
    expect(e.proximaCompra.estimada).toBe(true)
  })

  it("recorrente: dois pedidos pagos", () => {
    const e = etiquetasDaPessoa({
      pedidos: [pedido({}), pedido({ id: "order_2", pagoEm: diasAtras(3), entregueEm: null })],
      sinais: SEM_SINAIS,
      agora: AGORA,
    })
    expect(e.etapa).toEqual({ valor: "recorrente", porque: "2 pedidos pagos" })
  })

  it("em risco: 20 dias depois do dia de comprar de novo; sunset: 45 dias em risco sem sinal", () => {
    // Entregue há 60 dias, 1 Fator (30 dias): acabou há 30, e passou dos 20 de tolerância.
    const velho = pedido({ pagoEm: diasAtras(66), entregueEm: diasAtras(60) })
    const risco = etiquetasDaPessoa({ pedidos: [velho], sinais: SEM_SINAIS, agora: AGORA })
    expect(risco.etapa.valor).toBe("em-risco")
    expect(risco.etapa.porque).toMatch(/^passou 20 dias do dia de comprar de novo \(\d\d\/\d\d\)$/)

    const muitoVelho = pedido({ pagoEm: diasAtras(126), entregueEm: diasAtras(120) })
    expect(
      etiquetasDaPessoa({ pedidos: [muitoVelho], sinais: SEM_SINAIS, agora: AGORA }).etapa.valor
    ).toBe("sunset")
    // Mas quem clicou num e-mail na semana passada ainda está em risco, não sumiu.
    expect(
      etiquetasDaPessoa({
        pedidos: [muitoVelho],
        sinais: { ...SEM_SINAIS, ultimoClique: diasAtras(7) },
        agora: AGORA,
      }).etapa.valor
    ).toBe("em-risco")
  })

  it("sem saber quanto dura o produto: em risco com 60 dias sem pedido", () => {
    const outro = pedido({
      pagoEm: diasAtras(61),
      entregueEm: diasAtras(55),
      itens: [{ handle: "camiseta", nome: "Camiseta", quantidade: 1 }],
    })
    const e = etiquetasDaPessoa({ pedidos: [outro], sinais: SEM_SINAIS, agora: AGORA })
    // O `desde` é o começo do resgate (0192): o dia em que fez 60 dias sem pedido.
    expect(e.etapa).toEqual({
      valor: "em-risco",
      porque: "60 dias sem pedido",
      desde: diasAtras(1),
    })
    expect(e.proximaCompra.em).toBeNull()
  })
})

describe("a próxima compra", () => {
  it("a entrega mais o que dura o primeiro produto a acabar, com a quantidade", () => {
    const e = etiquetasDaPessoa({
      pedidos: [
        pedido({
          entregueEm: new Date("2026-09-20T12:00:00Z"),
          itens: [
            { handle: "kit-2-fator-de-crescimento-para-barba", nome: "Kit 2 Fator", quantidade: 1 },
            { handle: "balm-para-barba", nome: "Balm", quantidade: 1 },
          ],
        }),
      ],
      sinais: SEM_SINAIS,
      agora: AGORA,
    })
    // 2 Fatores = 60 dias; o Balm, 60 também — o primeiro que aparece fica.
    expect(e.proximaCompra.em).toEqual(new Date("2026-11-19T12:00:00Z"))
    expect(e.proximaCompra.porque).toBe("acaba o Fator de Crescimento (2 unidades)")
    expect(e.proximaCompra.estimada).toBe(false)
  })

  it("os dias de cada produto podem mudar (os Ajustes)", () => {
    const e = etiquetasDaPessoa({
      pedidos: [pedido({ entregueEm: new Date("2026-09-20T12:00:00Z") })],
      sinais: SEM_SINAIS,
      agora: AGORA,
      dias: { fator: 40, oleo: 45, shampoo: 45, balm: 60, spray: 45, pasta: 60 },
    })
    expect(e.proximaCompra.em).toEqual(new Date("2026-10-30T12:00:00Z"))
  })
})

describe("o engajamento", () => {
  it("o sinal mais novo: clique, visita, compra ou newsletter; 30 e 90 dias", () => {
    const quente = etiquetasDaPessoa({
      pedidos: [pedido({ pagoEm: diasAtras(100), entregueEm: diasAtras(95) })],
      sinais: { ...SEM_SINAIS, ultimoClique: diasAtras(3), ultimaVisita: diasAtras(40) },
      agora: AGORA,
    })
    expect(quente.engajamento).toEqual({
      valor: "quente",
      porque: "clicou num e-mail da loja há 3 dias",
    })
    expect(
      etiquetasDaPessoa({
        pedidos: [],
        sinais: { ...SEM_SINAIS, ultimaVisita: diasAtras(45) },
        agora: AGORA,
      }).engajamento
    ).toEqual({ valor: "morno", porque: "visitou a loja há 45 dias" })
    expect(
      etiquetasDaPessoa({
        pedidos: [],
        sinais: { ...SEM_SINAIS, newsletterDesde: diasAtras(200) },
        agora: AGORA,
      }).engajamento.valor
    ).toBe("frio")
    expect(
      etiquetasDaPessoa({ pedidos: [], sinais: SEM_SINAIS, agora: AGORA }).engajamento
    ).toEqual({
      valor: "frio",
      porque: "nenhum sinal ainda",
    })
  })
})

describe("o tratamento e o cupom", () => {
  it("quem não comprou o Fator não tem dia de tratamento", () => {
    const e = etiquetasDaPessoa({
      pedidos: [pedido({ itens: [{ handle: "oleo-para-barba", nome: "Óleo", quantidade: 1 }] })],
      sinais: SEM_SINAIS,
      agora: AGORA,
    })
    expect(e.tratamento).toEqual({ dia: null, porque: "não comprou o Fator de Crescimento" })
  })

  it("sensível a cupom: as últimas 3 compras todas com cupom", () => {
    const tres = [30, 20, 10].map((d, i) =>
      pedido({ id: `order_${i}`, pagoEm: diasAtras(d), cupons: ["VOLTA15"] })
    )
    expect(etiquetasDaPessoa({ pedidos: tres, sinais: SEM_SINAIS, agora: AGORA }).cupom).toEqual({
      valor: true,
      porque: "3 das últimas 3 compras com cupom",
    })
    const umaSem = [...tres.slice(0, 2), pedido({ id: "order_9", pagoEm: diasAtras(5) })]
    expect(
      etiquetasDaPessoa({ pedidos: umaSem, sinais: SEM_SINAIS, agora: AGORA }).cupom.valor
    ).toBe(false)
    expect(etiquetasDaPessoa({ pedidos: [], sinais: SEM_SINAIS, agora: AGORA }).cupom).toEqual({
      valor: null,
      porque: "ainda não comprou",
    })
  })
})

describe("as regras dos Ajustes", () => {
  it("em risco no dia seguinte ao de comprar de novo; sunset mais cedo", () => {
    // Entregue há 35 dias, 1 Fator (30 dias): acabou há 5.
    const pedidos = [pedido({ pagoEm: diasAtras(41), entregueEm: diasAtras(35) })]
    expect(etiquetasDaPessoa({ pedidos, sinais: SEM_SINAIS, agora: AGORA }).etapa.valor).toBe(
      "em-tratamento"
    )
    const semTolerancia = etiquetasDaPessoa({
      pedidos,
      sinais: SEM_SINAIS,
      agora: AGORA,
      regras: { ...REGRAS_PADRAO, toleranciaDaReposicao: 0 },
    })
    expect(semTolerancia.etapa.valor).toBe("em-risco")
    expect(semTolerancia.etapa.porque).toMatch(/^passou o dia de comprar de novo \(\d\d\/\d\d\)$/)
    expect(
      etiquetasDaPessoa({
        pedidos,
        sinais: SEM_SINAIS,
        agora: AGORA,
        regras: { ...REGRAS_PADRAO, toleranciaDaReposicao: 0, sunset: 5 },
      }).etapa
    ).toEqual({
      valor: "sunset",
      porque: "em risco há mais de 5 dias, sem clicar nem visitar a loja",
      desde: expect.any(Date),
    })
  })

  it("quente e morno com outros dias; o cupom olhando só a última compra", () => {
    const sinais = { ...SEM_SINAIS, ultimaVisita: diasAtras(10) }
    const regras = { ...REGRAS_PADRAO, quente: 7, morno: 9, comprasDoCupom: 1 }
    expect(etiquetasDaPessoa({ pedidos: [], sinais, agora: AGORA, regras }).engajamento.valor).toBe(
      "frio"
    )
    const tres = [30, 20, 10].map((d, i) =>
      pedido({ id: `order_${i}`, pagoEm: diasAtras(d), cupons: i === 2 ? ["VOLTA15"] : [] })
    )
    expect(
      etiquetasDaPessoa({ pedidos: tres, sinais: SEM_SINAIS, agora: AGORA, regras }).cupom
    ).toEqual({ valor: true, porque: "a última compra foi com cupom" })
  })
})
