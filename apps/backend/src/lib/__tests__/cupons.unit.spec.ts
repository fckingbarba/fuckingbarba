import { areRulesValidForContext } from "@medusajs/promotion/dist/utils/validations/promotion-rule"
import {
  CAMPOS_DO_CONTEXTO,
  contextoDosCupons,
  cupomGuardado,
  cupomNaLista,
  descricaoDoCupom,
  ehCupomDeCampanha,
  fimDe,
  fimDoDia,
  inicioDe,
  lerCupomNovo,
  linhasMarcadas,
  MARCA_DA_LINHA,
  outroCupomNoCarrinho,
  promocaoDoCupom,
  regraDoCupom,
  regrasDoCupom,
  SEM_CATEGORIA,
  usosPorCodigo,
  type Catalogo,
  type CupomNovo,
  type ItemDoCarrinho,
  type PedidoDoEmail,
} from "../cupons"
import type { PoliticaDeFrete } from "../configuracoes"

/**
 * Os cupons do painel, do jeito da Nuvemshop: o formulário, a promoção que
 * vai pro Medusa (com as regras sobre o contexto do gancho), o contexto em
 * si, o "um cupom por pedido" e a lista.
 */

const AGORA = new Date("2026-09-24T21:10:00-03:00")
const CATALOGO: Catalogo = {
  categorias: [
    { id: "pcat_barba", nome: "Barba" },
    { id: "pcat_kits", nome: "Kits" },
  ],
  produtos: [
    { id: "prod_oleo", nome: "Óleo para barba" },
    { id: "prod_balm", nome: "Balm para barba" },
    { id: "prod_kit", nome: "Kit completo" },
  ],
}

/** O formulário novo, como o painel manda. */
const FORM = {
  codigo: "barba 20",
  tipo: "porcento",
  valor: "20",
  soMaisBarato: false,
  aplicarA: "loja",
  alvos: [],
  combina: true,
  porCupom: "limitado",
  limite: "200",
  porCliente: "limitado",
  usosPorCliente: "1",
  data: "periodo",
  de: "2026-09-25T00:00",
  ate: "2026-10-15T23:59",
  minimo: "R$ 99,90",
}

describe("o formulário do cupom (o da Nuvemshop)", () => {
  it("lê cada seção: código, tipo, a quem vale e os limites de uso", () => {
    expect(lerCupomNovo(FORM, AGORA, CATALOGO)).toEqual({
      ok: true,
      cupom: {
        codigo: "BARBA20",
        tipo: "porcento",
        valor: 20,
        soMaisBarato: false,
        aplicarA: "loja",
        alvos: [],
        combina: true,
        limite: 200,
        porCliente: 1,
        primeiraCompra: false,
        de: "2026-09-25T00:00",
        ate: "2026-10-15T23:59",
        minimo: 99.9,
      },
    })
    const reais = lerCupomNovo(
      { ...FORM, tipo: "reais", valor: "1.234,50", minimo: "", porCupom: "ilimitado", limite: "9" },
      AGORA,
      CATALOGO
    )
    expect(reais.ok && reais.cupom).toMatchObject({ valor: 1234.5, minimo: null, limite: null })
  })

  it('frete grátis: sem valor, e o "só na opção mais barata" só vale pra ele', () => {
    const frete = lerCupomNovo(
      { ...FORM, tipo: "frete", valor: "", soMaisBarato: true },
      AGORA,
      CATALOGO
    )
    expect(frete.ok && frete.cupom).toMatchObject({ tipo: "frete", valor: 0, soMaisBarato: true })
    const porcento = lerCupomNovo({ ...FORM, soMaisBarato: true }, AGORA, CATALOGO)
    expect(porcento.ok && porcento.cupom.soMaisBarato).toBe(false)
  })

  it("aplicar a categorias ou produtos: os escolhidos, com o nome do catálogo", () => {
    const cat = lerCupomNovo(
      { ...FORM, aplicarA: "categorias", alvos: ["pcat_kits", "pcat_kits"] },
      AGORA,
      CATALOGO
    )
    expect(cat.ok && cat.cupom.alvos).toEqual([{ id: "pcat_kits", nome: "Kits" }])
    const nenhum = lerCupomNovo({ ...FORM, aplicarA: "produtos", alvos: [] }, AGORA, CATALOGO)
    expect(!nenhum.ok && nenhum.erros.alvos).toBe("Escolha pelo menos um produto.")
    const sumiu = lerCupomNovo(
      { ...FORM, aplicarA: "produtos", alvos: ["prod_oleo", "prod_x"] },
      AGORA,
      CATALOGO
    )
    expect(!sumiu.ok && sumiu.erros.alvos).toMatch(/não existe mais/)
    const loja = lerCupomNovo({ ...FORM, alvos: ["pcat_kits"] }, AGORA, CATALOGO)
    expect(loja.ok && loja.cupom.alvos).toEqual([])
  })

  it("por cliente: ilimitado, limitado (quantas vezes) ou só na primeira compra", () => {
    const ilimitado = lerCupomNovo({ ...FORM, porCliente: "ilimitado" }, AGORA, CATALOGO)
    expect(ilimitado.ok && ilimitado.cupom).toMatchObject({
      porCliente: null,
      primeiraCompra: false,
    })
    const tres = lerCupomNovo({ ...FORM, usosPorCliente: "3" }, AGORA, CATALOGO)
    expect(tres.ok && tres.cupom.porCliente).toBe(3)
    const primeira = lerCupomNovo({ ...FORM, porCliente: "primeira" }, AGORA, CATALOGO)
    expect(primeira.ok && primeira.cupom).toMatchObject({ porCliente: null, primeiraCompra: true })
    const semNumero = lerCupomNovo({ ...FORM, usosPorCliente: "" }, AGORA, CATALOGO)
    expect(!semNumero.ok && semNumero.erros.usosPorCliente).toMatch(/de 1 pra cima/)
  })

  it("o período: começo e fim com hora; o fim depois do começo, e ainda por vir", () => {
    const semData = lerCupomNovo({ ...FORM, data: "ilimitado" }, AGORA, CATALOGO)
    expect(semData.ok && semData.cupom).toMatchObject({ de: null, ate: null })
    const invertido = lerCupomNovo(
      { ...FORM, de: "2026-10-15T23:59", ate: "2026-10-01T00:00" },
      AGORA,
      CATALOGO
    )
    expect(!invertido.ok && invertido.erros.ate).toBe("O fim tem que ser depois do começo.")
    const passou = lerCupomNovo(
      { ...FORM, de: "2026-09-20T00:00", ate: "2026-09-24T21:00" },
      AGORA,
      CATALOGO
    )
    expect(!passou.ok && passou.erros.ate).toBe("Esse fim já passou.")
    // O começo pode ter passado (vale desde já); o fim no minuto de agora ainda vale.
    const agoraMesmo = lerCupomNovo(
      { ...FORM, de: "2026-09-20T00:00", ate: "2026-09-24T21:10" },
      AGORA,
      CATALOGO
    )
    expect(agoraMesmo.ok).toBe(true)
    const torto = lerCupomNovo({ ...FORM, de: "25/09", ate: "" }, AGORA, CATALOGO)
    expect(!torto.ok && Object.keys(torto.erros).sort()).toEqual(["ate", "de"])
  })

  it("diz o que está errado em cada campo", () => {
    const r = lerCupomNovo(
      { codigo: "x", tipo: "porcento", valor: "12,5", porCupom: "limitado", limite: "0" },
      AGORA,
      CATALOGO
    )
    expect(!r.ok && Object.keys(r.erros).sort()).toEqual(["codigo", "limite", "valor"])
    const bump = lerCupomNovo({ ...FORM, codigo: "BUMP-XYZ" }, AGORA, CATALOGO)
    expect(!bump.ok && bump.erros.codigo).toMatch(/ofertas do checkout/)
    const menor = lerCupomNovo(
      { ...FORM, tipo: "reais", valor: "50", minimo: "30" },
      AGORA,
      CATALOGO
    )
    expect(!menor.ok && menor.erros.minimo).toMatch(/maior que o desconto/)
    const semTipo = lerCupomNovo({ ...FORM, tipo: "brinde" }, AGORA, CATALOGO)
    expect(!semTipo.ok && semTipo.erros.tipo).toBe("Escolha o tipo.")
    const limitadoSemNumero = lerCupomNovo({ ...FORM, limite: "" }, AGORA, CATALOGO)
    expect(!limitadoSemNumero.ok && limitadoSemNumero.erros.limite).toBe("Quantos usos, no total?")
    // O "_" dos códigos da Nuvemshop vale.
    expect(lerCupomNovo({ ...FORM, codigo: "maria10_t5al" }, AGORA, CATALOGO).ok).toBe(true)
  })

  it("o formulário de antes da 0128 ainda passa (o painel e o backend sobem em horas diferentes)", () => {
    const antigo = {
      codigo: "barba 20",
      tipo: "porcento",
      valor: "20",
      minimo: "R$ 99,90",
      ate: "2026-10-15",
      limite: "200",
      umaVezPorCliente: true,
      primeiraCompra: false,
    }
    expect(lerCupomNovo(antigo, AGORA)).toEqual({
      ok: true,
      cupom: {
        codigo: "BARBA20",
        tipo: "porcento",
        valor: 20,
        soMaisBarato: false,
        aplicarA: "loja",
        alvos: [],
        combina: true,
        limite: 200,
        porCliente: 1,
        primeiraCompra: false,
        de: null,
        ate: "2026-10-15",
        minimo: 99.9,
      },
    })
    // Hoje ainda vale: o cupom dura até o fim do dia.
    expect(lerCupomNovo({ ...antigo, ate: "2026-09-24" }, AGORA).ok).toBe(true)
    const ontem = lerCupomNovo({ ...antigo, ate: "2026-09-23" }, AGORA)
    expect(!ontem.ok && ontem.erros.ate).toBe("Essa data já passou.")
  })
})

const cupom = (extra: Partial<CupomNovo> = {}): CupomNovo => ({
  codigo: "BARBA20",
  tipo: "porcento",
  valor: 20,
  soMaisBarato: false,
  aplicarA: "loja",
  alvos: [],
  combina: true,
  limite: 200,
  porCliente: 1,
  primeiraCompra: true,
  de: null,
  ate: "2026-10-15T23:59",
  minimo: 99.9,
  ...extra,
})

describe("a promoção do Medusa", () => {
  it("porcentagem nos produtos, com o limite e uma regra pra cada condição", () => {
    const p = promocaoDoCupom(
      cupom({
        de: "2026-10-01T08:00",
        aplicarA: "categorias",
        alvos: [{ id: "pcat_kits", nome: "Kits" }],
        combina: false,
      }),
      "Ana",
      AGORA
    )
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
        operator: "gte",
        values: [String(inicioDe("2026-10-01T08:00"))],
      },
      {
        attribute: CAMPOS_DO_CONTEXTO.agora,
        operator: "lte",
        values: [String(fimDe("2026-10-15T23:59"))],
      },
      { attribute: "fb_cupons.vezes.BARBA20", operator: "lt", values: ["1"] },
      { attribute: CAMPOS_DO_CONTEXTO.pedidos, operator: "eq", values: ["0"] },
      { attribute: CAMPOS_DO_CONTEXTO.categoriasDoCarrinho, operator: "eq", values: ["pcat_kits"] },
      { attribute: CAMPOS_DO_CONTEXTO.freteDaLoja, operator: "eq", values: ["nao"] },
    ])
    // Não combina: o produto em promoção fica fora do desconto (regra de alvo).
    expect(p.application_method.target_rules).toEqual([
      { attribute: `items.${MARCA_DA_LINHA}`, operator: "eq", values: ["nao"] },
    ])
    expect(new Date(inicioDe("2026-10-01T08:00")).toISOString()).toBe("2026-10-01T11:00:00.000Z")
    expect(new Date(fimDe("2026-10-15T23:59")).toISOString()).toBe("2026-10-16T02:59:59.999Z")
    expect(fimDe("2026-10-15")).toBe(fimDoDia("2026-10-15"))
    expect(p.metadata.fb_cupom).toMatchObject({
      tipo: "porcento",
      aplicarA: "categorias",
      alvos: [{ id: "pcat_kits", nome: "Kits" }],
      combina: false,
      criadoPor: "Ana",
    })
    expect("codigo" in p.metadata.fb_cupom).toBe(false)
  })

  it("reais: no pedido, em real; sem condição nenhuma, sem regra e sem limite", () => {
    const p = promocaoDoCupom(
      cupom({
        tipo: "reais",
        valor: 20,
        minimo: null,
        ate: null,
        limite: null,
        porCliente: null,
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
    expect("target_rules" in p.application_method).toBe(false)
    const reaisSemPromocao = promocaoDoCupom(cupom({ tipo: "reais", combina: false }), "Ana", AGORA)
    expect(reaisSemPromocao.application_method).toMatchObject({
      target_type: "order",
      target_rules: [{ attribute: `items.${MARCA_DA_LINHA}`, operator: "eq", values: ["nao"] }],
    })
  })

  it("frete grátis: 100% do frete — de qualquer opção, ou só da mais barata", () => {
    const livre = cupom({
      tipo: "frete",
      valor: 0,
      minimo: null,
      ate: null,
      porCliente: null,
      primeiraCompra: false,
    })
    expect(promocaoDoCupom(livre, "Ana", AGORA).application_method).toEqual({
      type: "percentage",
      target_type: "shipping_methods",
      allocation: "across",
      value: 100,
      target_rules: [],
    })
    const barata = promocaoDoCupom({ ...livre, soMaisBarato: true }, "Ana", AGORA, ["so_eco"])
    expect(barata.application_method.target_rules).toEqual([
      { attribute: "shipping_methods.shipping_option_id", operator: "in", values: ["so_eco"] },
    ])
    expect(() => promocaoDoCupom({ ...livre, soMaisBarato: true }, "Ana", AGORA)).toThrow()
  })
})

describe("o contexto que o gancho põe no carrinho", () => {
  const FRETE_GRATIS: PoliticaDeFrete = {
    modo: "gratis",
    piso: 149.9,
    alvo: "mais-barata",
    tetoDeCusto: null,
  }
  const item = (extra: Partial<ItemDoCarrinho> = {}): ItemDoCarrinho => ({
    unit_price: 54.9,
    quantity: 1,
    product_id: "prod_oleo",
    product: { id: "prod_oleo", categories: [{ id: "pcat_barba" }] },
    ...extra,
  })

  it("a soma, os produtos e as categorias, os pedidos não cancelados e as vezes de cada código", () => {
    const c = contextoDosCupons({
      itens: [
        item({ unit_price: 46.3, quantity: 3 }),
        item({ product_id: "prod_kit", product: { id: "prod_kit", categories: [] } }),
      ],
      pedidos: [
        { status: "completed", codigos: ["barba20", "BUMP-OLEO-1", "BARBA20"] },
        { status: "completed", codigos: ["BARBA20"] },
        { status: "canceled", codigos: ["PRIMEIRA10"] },
        { status: "pending", codigos: [] },
      ],
      agora: 123,
      frete: FRETE_GRATIS,
    })
    expect(c).toEqual({
      fb_cupons: {
        conferido: "sim",
        produtos: 193.8,
        pedidos: 3,
        usados: ["BARBA20", "BUMP-OLEO-1"],
        vezes: { BARBA20: 2, "BUMP-OLEO-1": 1 },
        agora: 123,
        itens: { produtos: ["prod_oleo", "prod_kit"], categorias: ["pcat_barba", SEM_CATEGORIA] },
        frete_da_loja: "sim",
      },
    })
  })

  it("o frete da loja: o pedido que já ganhou o frete grátis (ou fixo) pelo valor", () => {
    const daLoja = (itens: ItemDoCarrinho[], frete: PoliticaDeFrete | null = FRETE_GRATIS) =>
      contextoDosCupons({ itens, pedidos: [], agora: 1, frete }).fb_cupons.frete_da_loja
    expect(daLoja([item()])).toBe("nao")
    expect(daLoja([item({ unit_price: 150 })])).toBe("sim")
    expect(daLoja([item({ unit_price: 150 })], { modo: "nenhuma" })).toBe("nao")
    expect(
      daLoja([item({ unit_price: 150 })], {
        modo: "fixo",
        piso: 99,
        preco: 9.9,
        alvo: "todas",
        tetoDeCusto: null,
      })
    ).toBe("sim")
    // Sem a política de frete, não dá pra saber: conta como se tivesse.
    expect(daLoja([item()], null)).toBe("sim")
  })

  it("as linhas voltam marcadas: em promoção quando o preço está abaixo do de antes", () => {
    const linhas = linhasMarcadas([
      item({ id: "l1", compare_at_unit_price: 79.9 } as Partial<ItemDoCarrinho>),
      item({ id: "l2" } as Partial<ItemDoCarrinho>),
      item({ id: "l3", compare_at_unit_price: 54.9 } as Partial<ItemDoCarrinho>),
    ])
    expect(linhas.map((l) => [(l as { id?: string }).id, l[MARCA_DA_LINHA]])).toEqual([
      ["l1", "sim"],
      ["l2", "nao"],
      ["l3", "nao"],
    ])
    // O resto da linha é o mesmo.
    expect(linhas[0]).toMatchObject({ unit_price: 54.9, quantity: 1, product_id: "prod_oleo" })
  })

  it("sem o histórico (a consulta falhou), sai sem a trava", () => {
    expect(
      contextoDosCupons({ itens: [{ unit_price: 10, quantity: 2 }], pedidos: null, agora: 5 })
    ).toEqual({
      fb_cupons: {
        produtos: 20,
        agora: 5,
        itens: { produtos: [], categorias: [SEM_CATEGORIA] },
        frete_da_loja: "sim",
      },
    })
  })
})

describe("um cupom por pedido", () => {
  it("o segundo cupom de campanha ouve não; a oferta do checkout não conta", () => {
    expect(outroCupomNoCarrinho(["BARBA20"], ["VOLTA10"], "add")).toBe("BARBA20")
    expect(outroCupomNoCarrinho(["BARBA20", "BUMP-OLEO-1"], ["BUMP-BALM-1"], "add")).toBeNull()
    expect(outroCupomNoCarrinho(["BUMP-OLEO-1"], ["VOLTA10"], "add")).toBeNull()
    expect(outroCupomNoCarrinho(["BARBA20"], ["barba20"], "add")).toBeNull()
    expect(outroCupomNoCarrinho([], ["A10", "B10"], "add")).toBe("A10")
    expect(outroCupomNoCarrinho(["BARBA20"], ["VOLTA10"], undefined)).toBe("BARBA20")
  })

  it("a conta do Medusa a cada mudança (replace) e o tirar passam direto", () => {
    expect(outroCupomNoCarrinho(["A10", "B10"], ["A10", "B10"], "replace")).toBeNull()
    expect(outroCupomNoCarrinho(["A10"], ["A10"], "remove")).toBeNull()
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
  const FRETE: PoliticaDeFrete = {
    modo: "gratis",
    piso: 149.9,
    alvo: "mais-barata",
    tetoDeCusto: null,
  }
  const sacola = (
    reais: number,
    pedidos: PedidoDoEmail[] | null,
    agora = AGORA.getTime(),
    extra: { itens?: ItemDoCarrinho[] } = {}
  ) =>
    contextoDosCupons({
      itens: extra.itens ?? [
        {
          unit_price: reais,
          quantity: 1,
          product: { id: "prod_oleo", categories: [{ id: "pcat_barba" }] },
        },
      ],
      pedidos,
      agora,
      frete: FRETE,
    })
  const comprou = (codigos: string[], status = "completed") => [{ status, codigos }]

  it("com o histórico lido, confere cada condição", () => {
    expect(vale(cupom(), sacola(120, []))).toBe(true)
    expect(vale(cupom(), sacola(90, []))).toBe(false)
    expect(vale(cupom(), sacola(120, [], fimDe("2026-10-15T23:59") + 1))).toBe(false)
    expect(vale(cupom(), sacola(120, comprou([])))).toBe(false)
    const outraVez = cupom({ primeiraCompra: false })
    expect(vale(outraVez, sacola(120, comprou(["barba20"])))).toBe(false)
    expect(vale(outraVez, sacola(120, comprou(["barba20"], "canceled")))).toBe(true)
    expect(vale(outraVez, sacola(120, comprou(["OUTRO"])))).toBe(true)
  })

  it("por cliente, mais de uma vez: conta os pedidos com o código", () => {
    const duas = cupom({ porCliente: 2, primeiraCompra: false })
    expect(vale(duas, sacola(120, comprou(["BARBA20"])))).toBe(true)
    expect(vale(duas, sacola(120, [...comprou(["BARBA20"]), ...comprou(["barba20"])]))).toBe(false)
  })

  it("o período: antes do começo não vale; do começo ao fim, vale", () => {
    const outubro = cupom({
      de: "2026-10-01T00:00",
      minimo: null,
      porCliente: null,
      primeiraCompra: false,
    })
    expect(vale(outubro, sacola(120, [], inicioDe("2026-10-01T00:00") - 1))).toBe(false)
    expect(vale(outubro, sacola(120, [], inicioDe("2026-10-01T00:00")))).toBe(true)
    expect(vale(outubro, sacola(120, [], new Date("2026-10-15T23:59:30-03:00").getTime()))).toBe(
      true
    )
    expect(vale(outubro, sacola(120, [], new Date("2026-10-16T00:00:00-03:00").getTime()))).toBe(
      false
    )
  })

  it("só com produtos das categorias: TODOS os do carrinho, como na Nuvemshop", () => {
    const kits = cupom({
      aplicarA: "categorias",
      alvos: [{ id: "pcat_kits", nome: "Kits" }],
      minimo: null,
      porCliente: null,
      primeiraCompra: false,
    })
    const doKit = {
      unit_price: 99.9,
      quantity: 1,
      product: { id: "prod_kit", categories: [{ id: "pcat_kits" }] },
    }
    const doOleo = {
      unit_price: 54.9,
      quantity: 1,
      product: { id: "prod_oleo", categories: [{ id: "pcat_barba" }] },
    }
    const semCategoria = { unit_price: 10, quantity: 1, product: { id: "prod_x", categories: [] } }
    expect(vale(kits, sacola(0, [], undefined, { itens: [doKit, doKit] }))).toBe(true)
    expect(vale(kits, sacola(0, [], undefined, { itens: [doKit, doOleo] }))).toBe(false)
    expect(vale(kits, sacola(0, [], undefined, { itens: [doKit, semCategoria] }))).toBe(false)
    expect(vale(kits, sacola(0, [], undefined, { itens: [] }))).toBe(false)
    const oleo = cupom({
      aplicarA: "produtos",
      alvos: [{ id: "prod_oleo", nome: "Óleo" }],
      minimo: null,
      porCliente: null,
      primeiraCompra: false,
    })
    expect(vale(oleo, sacola(0, [], undefined, { itens: [doOleo, doOleo] }))).toBe(true)
    expect(vale(oleo, sacola(0, [], undefined, { itens: [doOleo, doKit] }))).toBe(false)
  })

  it("não combina: no pedido com o frete grátis da loja, não vale; o produto em promoção fica fora", () => {
    const naoCombina = cupom({
      combina: false,
      minimo: null,
      porCliente: null,
      primeiraCompra: false,
    })
    const oleo = (extra = {}) => ({ unit_price: 54.9, quantity: 1, ...extra })
    expect(vale(naoCombina, sacola(0, [], undefined, { itens: [oleo()] }))).toBe(true)
    expect(vale(naoCombina, sacola(0, [], undefined, { itens: [oleo({ quantity: 3 })] }))).toBe(
      false
    )
    // O alvo, no avaliador de linha do Medusa: a linha em promoção não entra no desconto.
    const { target_rules } = promocaoDoCupom(naoCombina, "Ana", AGORA).application_method as {
      target_rules: { attribute: string; operator: string; values: string[] }[]
    }
    const alvo = target_rules.map((r) => ({ ...r, values: r.values.map((value) => ({ value })) }))
    const [cheia, promocional] = linhasMarcadas([oleo(), oleo({ compare_at_unit_price: 79.9 })])
    expect(areRulesValidForContext(alvo as never, cheia, "items" as never)).toBe(true)
    expect(areRulesValidForContext(alvo as never, promocional, "items" as never)).toBe(false)
  })

  it("sem a conferência do gancho, cupom com condição não vale; sem condição, vale", () => {
    const soAData = cupom({ minimo: null, porCliente: null, primeiraCompra: false })
    expect(vale(soAData, sacola(120, []))).toBe(true)
    expect(vale(soAData, {})).toBe(false)
    expect(vale(cupom({ primeiraCompra: false }), sacola(120, null))).toBe(false)
    const livre = cupom({ minimo: null, ate: null, porCliente: null, primeiraCompra: false })
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

  it("em frase, com a situação (o cupom de antes da 0128, guardado do jeito dele)", () => {
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
    const antigoUmaVez = {
      ...promocao,
      metadata: { fb_cupom: { ...promocao.metadata.fb_cupom, umaVezPorCliente: true } },
    }
    expect(cupomGuardado(antigoUmaVez).porCliente).toBe(1)
  })

  it("o cupom novo: o período com hora, agendado antes de começar", () => {
    const novo = promocaoDoCupom(
      cupom({
        de: "2026-10-01T00:00",
        ate: "2026-10-15T23:59",
        porCliente: 2,
        primeiraCompra: false,
        combina: false,
        aplicarA: "produtos",
        alvos: [
          { id: "prod_oleo", nome: "Óleo para barba" },
          { id: "prod_balm", nome: "Balm para barba" },
        ],
      }),
      "Ana",
      AGORA
    )
    const naLista = cupomNaLista({ id: "promo_02", used: 0, ...novo }, uso, AGORA)
    expect(naLista).toMatchObject({
      descricao: "20% só com Óleo para barba ou Balm para barba, em pedidos a partir de R$ 99,90",
      regra:
        "de 01/10 às 00:00 até 15/10 às 23:59 · 200 usos no total · 2 vezes por cliente · não combina com outras promoções",
      situacao: "agendado",
    })
    expect(
      cupomNaLista({ id: "promo_02", used: 0, ...novo }, uso, new Date("2026-10-02T12:00:00-03:00"))
        .situacao
    ).toBe("valendo")
  })

  it("o cupom de antes do painel (o do script) sai da promoção; o de frete também", () => {
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
    const frete = {
      ...antigo,
      application_method: { type: "percentage", target_type: "shipping_methods", value: 100 },
    }
    expect(cupomNaLista(frete, { pedidos: 0, desconto: 0, vendeu: 0 }, AGORA).descricao).toBe(
      "Frete grátis em qualquer pedido"
    )
  })

  it("as frases do tipo e das regras", () => {
    expect(descricaoDoCupom({ tipo: "reais", valor: 20, minimo: 150 })).toBe(
      "R$ 20,00 de desconto em pedidos a partir de R$ 150,00"
    )
    expect(descricaoDoCupom({ tipo: "frete", valor: 0, minimo: null, soMaisBarato: true })).toBe(
      "Frete grátis na opção mais barata em qualquer pedido"
    )
    expect(
      descricaoDoCupom({
        tipo: "porcento",
        valor: 15,
        minimo: null,
        aplicarA: "categorias",
        alvos: [
          { id: "a", nome: "Barba" },
          { id: "b", nome: "Cabelo" },
          { id: "c", nome: "Kits" },
          { id: "d", nome: "Brindes" },
        ],
      })
    ).toBe("15% só com produtos de Barba, Cabelo e mais 2")
    expect(regraDoCupom({ ate: null, limite: 1, porCliente: 1, primeiraCompra: true })).toBe(
      "sem data de fim · 1 uso no total · uma vez por cliente · só na primeira compra"
    )
    expect(
      regraDoCupom({ de: "2026-10-01T09:30", ate: null, limite: null, primeiraCompra: false })
    ).toBe("a partir de 01/10 às 09:30")
  })

  it("só os cupons de campanha", () => {
    expect(ehCupomDeCampanha({ id: "1", code: "BARBA20" })).toBe(true)
    expect(ehCupomDeCampanha({ id: "2", code: "BUMP-OLEO-1" })).toBe(false)
    expect(ehCupomDeCampanha({ id: "3", code: "AUTO", is_automatic: true })).toBe(false)
    expect(ehCupomDeCampanha({ id: "4", code: null })).toBe(false)
  })

  it("os usos contam os pedidos não cancelados; o vendido, só os pagos", () => {
    const mapa = usosPorCodigo([
      {
        status: "completed",
        pago: true,
        total: 180,
        ajustes: [
          { code: "barba20", amount: 20 },
          { code: "BARBA20", amount: 4 },
          { code: "BUMP-OLEO-1", amount: 5.49 },
        ],
      },
      { status: "pending", pago: false, total: 90, ajustes: [{ code: "BARBA20", amount: 10 }] },
      { status: "canceled", pago: true, total: 90, ajustes: [{ code: "BARBA20", amount: 10 }] },
      { status: "completed", pago: true, total: 90, ajustes: [{ code: "FRETEG", amount: 23.7 }] },
    ])
    expect(mapa.get("BARBA20")).toEqual({ pedidos: 2, desconto: 34, vendeu: 180 })
    expect(mapa.get("FRETEG")).toEqual({ pedidos: 1, desconto: 23.7, vendeu: 90 })
  })
})
