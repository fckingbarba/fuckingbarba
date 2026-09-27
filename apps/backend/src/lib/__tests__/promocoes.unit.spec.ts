import { getComputedActionsForBuyGet } from "@medusajs/promotion/dist/utils/compute-actions/buy-get"
import { areRulesValidForContext } from "@medusajs/promotion/dist/utils/validations/promotion-rule"
import {
  ehCupomDeCampanha,
  lerCupomNovo,
  MARCA_DA_LINHA,
  outroCupomNoCarrinho,
  promocaoDoCupom,
  type Catalogo,
  type CupomNovo,
} from "../cupons"
import {
  descricaoDaPromocao,
  ehCodigoDePromocao,
  ehPromocaoDoPainel,
  etiquetaPadrao,
  gratisEm,
  lerPromocaoNova,
  MARCA_DO_PRECO,
  marcarPromocoes,
  MAX_GRATIS,
  promocaoDoMedusa,
  promocaoGuardada,
  promocaoNaLista,
  promocoesNaLoja,
  produtosDaPromocao,
  regraDaPromocao,
  regrasDoPeriodo,
  valeAgora,
  type LevePague,
  type PromocaoGuardada,
} from "../promocoes"

/**
 * O "Leve X, pague Y" do painel: o formulário, a promoção que vai pro
 * Medusa (e a conta que o PRÓPRIO Medusa faz com ela), as marcas que o
 * gancho põe nas linhas, o que a loja mostra e a lista do painel.
 */

const AGORA = new Date("2026-09-26T21:10:00-03:00")
const CATALOGO: Catalogo = {
  categorias: [
    { id: "pcat_barba", nome: "Barba" },
    { id: "pcat_kits", nome: "Kits" },
  ],
  produtos: [
    { id: "prod_fator", nome: "Fator de Crescimento" },
    { id: "prod_oleo", nome: "Óleo para barba" },
    { id: "prod_balm", nome: "Balm para barba" },
  ],
}

const FORM = {
  nome: "  Leve 3 do Fator   (outubro) ",
  tipo: "leve-pague",
  comprando: "3",
  pague: "2",
  aplicarA: "produtos",
  alvos: ["prod_fator"],
  promocional: true,
  data: "periodo",
  de: "2026-10-01T00:00",
  ate: "2026-10-31T23:59",
  etiqueta: "",
}

const LEVE_3: LevePague = {
  nome: "Leve 3 do Fator",
  etiqueta: "Leve 3, pague 2",
  comprando: 3,
  pague: 2,
  aplicarA: "produtos",
  alvos: [{ id: "prod_fator", nome: "Fator de Crescimento" }],
  promocional: true,
  de: null,
  ate: null,
}

describe('o formulário da promoção (o "Compre X e pague Y" da Nuvemshop)', () => {
  it("lê o nome, a conta, a quem vale, o período e dá a etiqueta padrão", () => {
    expect(lerPromocaoNova(FORM, AGORA, CATALOGO)).toEqual({
      ok: true,
      promocao: {
        nome: "Leve 3 do Fator (outubro)",
        etiqueta: "Leve 3, pague 2",
        comprando: 3,
        pague: 2,
        aplicarA: "produtos",
        alvos: [{ id: "prod_fator", nome: "Fator de Crescimento" }],
        promocional: true,
        de: "2026-10-01T00:00",
        ate: "2026-10-31T23:59",
      },
    })
  })

  it("a etiqueta escrita manda; a loja toda não tem alvos; sem data, sem período", () => {
    const r = lerPromocaoNova(
      { ...FORM, aplicarA: "loja", data: "ilimitado", etiqueta: " 3 por 2 ", promocional: false },
      AGORA,
      CATALOGO
    )
    expect(r).toMatchObject({
      ok: true,
      promocao: {
        etiqueta: "3 por 2",
        aplicarA: "loja",
        alvos: [],
        promocional: false,
        de: null,
        ate: null,
      },
    })
  })

  it("a caixa do preço promocional vem marcada quando não chega", () => {
    const { promocional: _, ...sem } = FORM
    expect(lerPromocaoNova(sem, AGORA, CATALOGO)).toMatchObject({
      ok: true,
      promocao: { promocional: true },
    })
  })

  it("recusa campo a campo: sem nome, conta impossível, alvo vazio, fim antes do começo", () => {
    const r = lerPromocaoNova(
      {
        ...FORM,
        nome: "   ",
        comprando: "3",
        pague: "3",
        alvos: [],
        de: "2026-10-10T00:00",
        ate: "2026-10-01T00:00",
        etiqueta: "x".repeat(31),
      },
      AGORA,
      CATALOGO
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.erros).sort()).toEqual(["alvos", "ate", "etiqueta", "nome", "pague"])
    expect(r.erros.pague).toBe("Tem que pagar menos do que leva.")
  })

  it("levando de 2 a 10, pagando de 1 pra cima, sem vírgula", () => {
    const erro = (comprando: unknown, pague: unknown) => {
      const r = lerPromocaoNova({ ...FORM, comprando, pague }, AGORA, CATALOGO)
      return r.ok ? null : { comprando: r.erros.comprando, pague: r.erros.pague }
    }
    expect(erro("1", "1")?.comprando).toBe("De 2 a 10 unidades.")
    expect(erro("11", "2")?.comprando).toBe("De 2 a 10 unidades.")
    expect(erro("2,5", "1")?.comprando).toBe("De 2 a 10 unidades.")
    expect(erro("abc", "1")?.comprando).toBe("De 2 a 10 unidades.")
    expect(erro("3", "0")?.pague).toBe("De 1 pra cima.")
    expect(erro("2", "1")).toBeNull()
    expect(erro("10", "9")).toBeNull()
  })

  it("alvo que não existe mais no catálogo é recusado, como no cupom", () => {
    const r = lerPromocaoNova({ ...FORM, alvos: ["prod_sumiu"] }, AGORA, CATALOGO)
    expect(r).toEqual({
      ok: false,
      erros: { alvos: "Alguma escolha não existe mais na loja: recarregue a página." },
    })
  })

  it('etiqueta padrão: "Leve 4, pague 3"', () => {
    expect(etiquetaPadrao(4, 3)).toBe("Leve 4, pague 3")
  })
})

/* ── a promoção no Medusa ──────────────────────────────────────────────── */

/** Uma regra como o Medusa guarda: os valores viram `{ value }`. */
const comoNoMedusa = (r: { attribute: string; operator: string; values: string[] }) => ({
  attribute: r.attribute,
  operator: r.operator,
  values: r.values.map((value) => ({ value })),
})

/** A promoção criada, no formato que a conta do Medusa lê. */
function noMedusa(p: LevePague) {
  const criada = promocaoDoMedusa(p, "PROMO-TESTE123", "Dono", AGORA)
  const m = criada.application_method
  return {
    code: criada.code,
    type: criada.type,
    application_method: {
      ...m,
      buy_rules: m.buy_rules.map(comoNoMedusa),
      target_rules: m.target_rules.map(comoNoMedusa),
    },
  }
}

type Linha = {
  id: string
  produto: string
  preco: number
  quantidade: number
  categorias?: string[]
  promocional?: boolean
}

/** As linhas como chegam na conta: com as marcas do gancho. */
const linhas = (ls: Linha[]) =>
  ls.map((l) => ({
    id: l.id,
    quantity: l.quantidade,
    subtotal: Math.round(l.preco * l.quantidade * 100) / 100,
    product: { id: l.produto, categories: (l.categorias ?? []).map((id) => ({ id })) },
    [MARCA_DO_PRECO]: l.promocional ? "sim" : "nao",
  }))

/** Quanto sai de graça em cada linha, pela conta do próprio Medusa. */
function gratis(p: LevePague, ls: Linha[]): Record<string, number> {
  const acoes = getComputedActionsForBuyGet(
    noMedusa(p) as never,
    linhas(ls) as never,
    new Map(),
    new Map(),
    new Map()
  ) as { action: string; item_id?: string; amount?: unknown }[]
  const porLinha: Record<string, number> = {}
  for (const a of acoes)
    if (a.action === "addItemAdjustment" && a.item_id)
      porLinha[a.item_id] = Math.round(((porLinha[a.item_id] ?? 0) + Number(a.amount)) * 100) / 100
  return porLinha
}

describe("a promoção que vai pro Medusa", () => {
  it("é automática, do tipo compre-leve, com 100% nas de graça e o teto de unidades", () => {
    const criada = promocaoDoMedusa(LEVE_3, "PROMO-ABC12345", "Dono", AGORA)
    expect(criada).toMatchObject({
      code: "PROMO-ABC12345",
      type: "buyget",
      status: "active",
      is_automatic: true,
      application_method: {
        type: "percentage",
        target_type: "items",
        allocation: "each",
        value: 100,
        max_quantity: MAX_GRATIS,
        apply_to_quantity: 1,
        buy_rules_min_quantity: 2,
        buy_rules: [{ attribute: "items.product.id", operator: "in", values: ["prod_fator"] }],
        target_rules: [{ attribute: "items.product.id", operator: "in", values: ["prod_fator"] }],
      },
      rules: [],
      metadata: { fb_promocao: { tipo: "leve-pague", comprando: 3, pague: 2, criadoPor: "Dono" } },
    })
  })

  it("categorias, loja toda, e o preço promocional de fora quando a caixa está desmarcada", () => {
    const regras = (p: Partial<LevePague>) =>
      promocaoDoMedusa({ ...LEVE_3, ...p }, "PROMO-X", "Dono", AGORA).application_method.buy_rules
    expect(
      regras({ aplicarA: "categorias", alvos: [{ id: "pcat_barba", nome: "Barba" }] })
    ).toEqual([
      { attribute: "items.product.categories.id", operator: "in", values: ["pcat_barba"] },
    ])
    expect(regras({ aplicarA: "loja", alvos: [] })).toEqual([
      { attribute: `items.${MARCA_DO_PRECO}`, operator: "in", values: ["sim", "nao"] },
    ])
    expect(regras({ aplicarA: "loja", alvos: [], promocional: false })).toEqual([
      { attribute: `items.${MARCA_DO_PRECO}`, operator: "eq", values: ["nao"] },
    ])
    expect(regras({ promocional: false })).toEqual([
      { attribute: "items.product.id", operator: "in", values: ["prod_fator"] },
      { attribute: `items.${MARCA_DO_PRECO}`, operator: "eq", values: ["nao"] },
    ])
  })

  it("3 Fatores: um sai de graça; 2: nenhum; 5: um; 6: dois — a conta do Medusa", () => {
    const fator = (quantidade: number) => [
      { id: "l1", produto: "prod_fator", preco: 129.9, quantidade },
    ]
    expect(gratis(LEVE_3, fator(2))).toEqual({})
    expect(gratis(LEVE_3, fator(3))).toEqual({ l1: 129.9 })
    expect(gratis(LEVE_3, fator(5))).toEqual({ l1: 129.9 })
    expect(gratis(LEVE_3, fator(6))).toEqual({ l1: 259.8 })
    // E a mesma conta da loja (`gratisEm`), unidade por unidade.
    for (const q of [1, 2, 3, 4, 5, 6, 7, 9, 10])
      expect(Math.round((gratis(LEVE_3, fator(q)).l1 ?? 0) / 129.9)).toBe(gratisEm(q, 3, 2))
  })

  it("leve 4, pague 2: duas de graça por grupo", () => {
    const p = { ...LEVE_3, comprando: 4, pague: 2 }
    expect(gratis(p, [{ id: "l1", produto: "prod_fator", preco: 100, quantidade: 4 }])).toEqual({
      l1: 200,
    })
    expect(gratisEm(4, 4, 2)).toBe(2)
    expect(gratisEm(7, 4, 2)).toBe(2)
    expect(gratisEm(8, 4, 2)).toBe(4)
  })

  it("só os produtos da promoção contam: o Óleo junto não vira o terceiro", () => {
    expect(
      gratis(LEVE_3, [
        { id: "l1", produto: "prod_fator", preco: 129.9, quantidade: 2 },
        { id: "l2", produto: "prod_oleo", preco: 79.9, quantidade: 1 },
      ])
    ).toEqual({})
  })

  it("com vários produtos, sai de graça a mais barata do grupo", () => {
    const barba = {
      ...LEVE_3,
      aplicarA: "categorias" as const,
      alvos: [{ id: "pcat_barba", nome: "Barba" }],
    }
    expect(
      gratis(barba, [
        {
          id: "l1",
          produto: "prod_fator",
          preco: 129.9,
          quantidade: 1,
          categorias: ["pcat_barba"],
        },
        { id: "l2", produto: "prod_oleo", preco: 79.9, quantidade: 1, categorias: ["pcat_barba"] },
        { id: "l3", produto: "prod_balm", preco: 49.9, quantidade: 1, categorias: ["pcat_barba"] },
      ])
    ).toEqual({ l3: 49.9 })
  })

  it("DIFERENTE da Nuvemshop em sacola grande misturada: a mais barata DE CADA grupo", () => {
    // 3 de R$ 100 e 3 de R$ 50, "leve 3, pague 2" na loja toda: a Nuvemshop daria
    // as duas de R$ 50 (R$ 100); o Medusa agrupa das linhas mais caras e dá R$ 150.
    const loja = { ...LEVE_3, aplicarA: "loja" as const, alvos: [] }
    const r = gratis(loja, [
      { id: "cara", produto: "prod_fator", preco: 100, quantidade: 3 },
      { id: "barata", produto: "prod_balm", preco: 50, quantidade: 3 },
    ])
    expect(r).toEqual({ cara: 100, barata: 50 })
  })

  it("com a caixa desmarcada, o produto com preço promocional não entra na conta", () => {
    const semPromocional = { ...LEVE_3, promocional: false }
    const fator = (promocional: boolean) => [
      { id: "l1", produto: "prod_fator", preco: 99.9, quantidade: 3, promocional },
    ]
    expect(gratis(semPromocional, fator(true))).toEqual({})
    expect(gratis(semPromocional, fator(false))).toEqual({ l1: 99.9 })
    expect(gratis(LEVE_3, fator(true))).toEqual({ l1: 99.9 })
  })

  it("sem a marca do gancho, a promoção da loja toda não vale (nunca de graça sem conferir)", () => {
    const loja = { ...LEVE_3, aplicarA: "loja" as const, alvos: [] }
    const semMarca = linhas([{ id: "l1", produto: "prod_fator", preco: 50, quantidade: 3 }]).map(
      ({ [MARCA_DO_PRECO]: _, ...l }) => l
    )
    expect(
      getComputedActionsForBuyGet(
        noMedusa(loja) as never,
        semMarca as never,
        new Map(),
        new Map(),
        new Map()
      )
    ).toEqual([])
  })

  it("o período: vale entre o começo e o fim, e nunca sem a hora do gancho", () => {
    const regras = regrasDoPeriodo({ de: "2026-10-01T00:00", ate: "2026-10-31T23:59" }).map(
      comoNoMedusa
    )
    const em = (quando: string) => ({ fb_cupons: { agora: new Date(quando).getTime() } })
    const vale = (ctx: object) => areRulesValidForContext(regras as never, ctx, "order" as never)
    expect(vale(em("2026-10-15T12:00:00-03:00"))).toBe(true)
    expect(vale(em("2026-10-01T00:00:00-03:00"))).toBe(true)
    expect(vale(em("2026-10-31T23:59:59-03:00"))).toBe(true)
    expect(vale(em("2026-09-30T23:59:59-03:00"))).toBe(false)
    expect(vale(em("2026-11-01T00:00:00-03:00"))).toBe(false)
    expect(vale({})).toBe(false)
    expect(vale({ fb_cupons: {} })).toBe(false)
    // Só com o fim, também: sem a hora, o "até" passaria (o Medusa lê o que falta como zero).
    const soAte = regrasDoPeriodo({ de: null, ate: "2026-10-31T23:59" }).map(comoNoMedusa)
    expect(areRulesValidForContext(soAte as never, {}, "order" as never)).toBe(false)
    expect(regrasDoPeriodo({ de: null, ate: null })).toEqual([])
  })
})

/* ── a guardada, e o que vale agora ────────────────────────────────────── */

const guardada = (p: Partial<PromocaoGuardada> = {}): PromocaoGuardada => ({
  tipo: "leve-pague",
  ...LEVE_3,
  ...p,
})

describe("a promoção guardada", () => {
  it("lê o que o painel gravou, e recusa o que não é dela ou está torto", () => {
    const criada = promocaoDoMedusa(LEVE_3, "PROMO-X", "Dono", AGORA)
    expect(promocaoGuardada({ metadata: criada.metadata })).toEqual(guardada())
    expect(promocaoGuardada({ metadata: null })).toBeNull()
    expect(promocaoGuardada({ metadata: { fb_cupom: { tipo: "porcento" } } })).toBeNull()
    expect(promocaoGuardada({ metadata: { fb_promocao: { ...guardada(), pague: 3 } } })).toBeNull()
    expect(
      promocaoGuardada({ metadata: { fb_promocao: { ...guardada(), comprando: 11 } } })
    ).toBeNull()
  })

  it("é do painel: automática e com o código PROMO-", () => {
    expect(ehCodigoDePromocao("promo-abc")).toBe(true)
    expect(ehPromocaoDoPainel({ id: "1", code: "PROMO-ABC", is_automatic: true })).toBe(true)
    expect(ehPromocaoDoPainel({ id: "2", code: "PROMO-ABC", is_automatic: false })).toBe(false)
    expect(ehPromocaoDoPainel({ id: "3", code: "BUMP-OLEO-1", is_automatic: true })).toBe(false)
  })

  it("vale agora: ligada e dentro do período", () => {
    const t = AGORA.getTime()
    expect(valeAgora("active", guardada(), t)).toBe(true)
    expect(valeAgora("inactive", guardada(), t)).toBe(false)
    expect(valeAgora("active", guardada({ de: "2026-10-01T00:00" }), t)).toBe(false)
    expect(valeAgora("active", guardada({ ate: "2026-09-26T21:00" }), t)).toBe(false)
    expect(valeAgora("active", guardada({ ate: "2026-09-26T21:10" }), t)).toBe(true)
  })
})

/* ── as marcas das linhas (o gancho do carrinho) ───────────────────────── */

type ItemDeTeste = {
  id: string
  quantity: number
  unit_price: number
  compare_at_unit_price?: number
  product: { id: string; categories?: { id: string }[] }
}

describe("as marcas das linhas", () => {
  const fator = (quantity: number, extra: Partial<ItemDeTeste> = {}): ItemDeTeste => ({
    id: "l1",
    quantity,
    unit_price: 129.9,
    product: { id: "prod_fator" },
    ...extra,
  })
  const oleo: ItemDeTeste = {
    id: "l2",
    quantity: 1,
    unit_price: 79.9,
    product: { id: "prod_oleo" },
  }
  const ativa = [{ status: "active", guardada: guardada() }]
  const t = AGORA.getTime()

  it("toda linha ganha a marca do preço; a de promoção disparada vira promocional", () => {
    const [f, o] = marcarPromocoes(
      [
        { ...fator(3), [MARCA_DA_LINHA]: "nao" },
        { ...oleo, [MARCA_DA_LINHA]: "nao" },
      ],
      ativa,
      t
    )
    expect(f).toMatchObject({ [MARCA_DO_PRECO]: "nao", [MARCA_DA_LINHA]: "sim" })
    expect(o).toMatchObject({ [MARCA_DO_PRECO]: "nao", [MARCA_DA_LINHA]: "nao" })
  })

  it("não disparou (2 num leve 3), pausada ou fora do período: a linha fica como estava", () => {
    const marcadas = (itens: ItemDeTeste[], promocoes = ativa) =>
      marcarPromocoes(
        itens.map((i) => ({ ...i, [MARCA_DA_LINHA]: "nao" })),
        promocoes,
        t
      )[0]
    expect(marcadas([fator(2)])).toMatchObject({ [MARCA_DA_LINHA]: "nao" })
    expect(marcadas([fator(3)], [{ status: "inactive", guardada: guardada() }])).toMatchObject({
      [MARCA_DA_LINHA]: "nao",
    })
    expect(
      marcadas([fator(3)], [{ status: "active", guardada: guardada({ de: "2026-10-01T00:00" }) }])
    ).toMatchObject({ [MARCA_DA_LINHA]: "nao" })
  })

  it("o preço promocional é marcado; com a caixa desmarcada, ele não dispara a promoção", () => {
    const promocional = fator(3, { unit_price: 99.9, compare_at_unit_price: 129.9 })
    expect(marcarPromocoes([promocional], ativa, t)[0]).toMatchObject({
      [MARCA_DO_PRECO]: "sim",
      [MARCA_DA_LINHA]: "sim",
    })
    const semPromocional = [{ status: "active", guardada: guardada({ promocional: false }) }]
    expect(
      marcarPromocoes([{ ...promocional, [MARCA_DA_LINHA]: "sim" }], semPromocional, t)[0]
    ).toMatchObject({ [MARCA_DO_PRECO]: "sim", [MARCA_DA_LINHA]: "sim" })
    expect(marcarPromocoes([promocional], semPromocional, t)[0]).not.toHaveProperty(MARCA_DA_LINHA)
  })

  it("por categoria, somando as linhas: Fator + Óleo + Balm da Barba disparam o leve 3", () => {
    const barba = [
      {
        status: "active",
        guardada: guardada({
          aplicarA: "categorias",
          alvos: [{ id: "pcat_barba", nome: "Barba" }],
        }),
      },
    ]
    const cat = (i: ItemDeTeste) => ({
      ...i,
      product: { ...i.product, categories: [{ id: "pcat_barba" }] },
    })
    const balm: ItemDeTeste = {
      id: "l3",
      quantity: 1,
      unit_price: 49.9,
      product: { id: "prod_balm" },
    }
    const marcadas = marcarPromocoes([cat(fator(1)), cat(oleo), cat(balm)], barba, t)
    expect(marcadas.map((l) => (l as Record<string, unknown>)[MARCA_DA_LINHA])).toEqual([
      "sim",
      "sim",
      "sim",
    ])
  })

  it("o cupom que não combina não desconta a linha da promoção que disparou", () => {
    const cupom: CupomNovo = {
      codigo: "BARBA10",
      tipo: "porcento",
      valor: 10,
      soMaisBarato: false,
      aplicarA: "loja",
      alvos: [],
      combina: false,
      limite: null,
      porCliente: null,
      primeiraCompra: false,
      de: null,
      ate: null,
      minimo: null,
    }
    const alvo = promocaoDoCupom(cupom, "Dono", AGORA).application_method.target_rules!.map(
      comoNoMedusa
    )
    const [f3, o] = marcarPromocoes(
      [
        { ...fator(3), [MARCA_DA_LINHA]: "nao" },
        { ...oleo, [MARCA_DA_LINHA]: "nao" },
      ],
      ativa,
      t
    )
    expect(areRulesValidForContext(alvo as never, f3, "items" as never)).toBe(false)
    expect(areRulesValidForContext(alvo as never, o, "items" as never)).toBe(true)
    const [f2] = marcarPromocoes([{ ...fator(2), [MARCA_DA_LINHA]: "nao" }], ativa, t)
    expect(areRulesValidForContext(alvo as never, f2, "items" as never)).toBe(true)
  })
})

/* ── o que a loja mostra ───────────────────────────────────────────────── */

describe("o que a loja mostra", () => {
  const produtos = [
    { id: "prod_fator", categorias: ["pcat_barba"], precoPromocional: false },
    { id: "prod_oleo", categorias: ["pcat_barba"], precoPromocional: true },
    { id: "prod_kit", categorias: ["pcat_kits"], precoPromocional: false },
    { id: "prod_pasta", categorias: [], precoPromocional: false },
  ]
  const t = AGORA.getTime()

  it("os produtos de cada promoção, com o preço promocional de agora", () => {
    expect(produtosDaPromocao(guardada(), produtos)).toEqual(["prod_fator"])
    expect(
      produtosDaPromocao(
        guardada({ aplicarA: "categorias", alvos: [{ id: "pcat_barba", nome: "Barba" }] }),
        produtos
      )
    ).toEqual(["prod_fator", "prod_oleo"])
    expect(
      produtosDaPromocao(
        guardada({
          aplicarA: "categorias",
          alvos: [{ id: "pcat_barba", nome: "Barba" }],
          promocional: false,
        }),
        produtos
      )
    ).toEqual(["prod_fator"])
    expect(produtosDaPromocao(guardada({ aplicarA: "loja", alvos: [] }), produtos)).toEqual([
      "prod_fator",
      "prod_oleo",
      "prod_kit",
      "prod_pasta",
    ])
  })

  it("só as que valem agora, e só com produto; o fim vai junto", () => {
    const lista = promocoesNaLoja(
      [
        { codigo: "PROMO-A", status: "active", guardada: guardada({ ate: "2026-10-31T23:59" }) },
        { codigo: "PROMO-B", status: "inactive", guardada: guardada() },
        { codigo: "PROMO-C", status: "active", guardada: guardada({ de: "2026-10-01T00:00" }) },
        {
          codigo: "PROMO-D",
          status: "active",
          guardada: guardada({ alvos: [{ id: "prod_sumiu", nome: "Sumiu" }] }),
        },
      ],
      produtos,
      t
    )
    expect(lista).toEqual([
      {
        codigo: "PROMO-A",
        etiqueta: "Leve 3, pague 2",
        comprando: 3,
        pague: 2,
        produtos: ["prod_fator"],
        ate: new Date("2026-10-31T23:59:59.999-03:00").getTime(),
      },
    ])
  })

  it("quantas saem de graça: a conta de grupos, com o teto", () => {
    expect(gratisEm(0, 3, 2)).toBe(0)
    expect(gratisEm(2, 3, 2)).toBe(0)
    expect(gratisEm(3, 3, 2)).toBe(1)
    expect(gratisEm(299, 3, 2)).toBe(MAX_GRATIS)
    expect(gratisEm(3, 3, 3)).toBe(0)
  })
})

/* ── a lista do painel ─────────────────────────────────────────────────── */

describe("a lista do painel", () => {
  const cru = (status: string) => ({ id: "promo_01", code: "PROMO-AB12CD34", status })
  const uso = { pedidos: 2, desconto: 259.8, vendeu: 519.6 }

  it("a frase de cada promoção", () => {
    expect(descricaoDaPromocao(LEVE_3)).toBe("Leve 3, pague 2 em Fator de Crescimento")
    expect(
      descricaoDaPromocao({
        ...LEVE_3,
        aplicarA: "produtos",
        alvos: [
          { id: "a", nome: "Óleo" },
          { id: "b", nome: "Balm" },
          { id: "c", nome: "Shampoo" },
        ],
      })
    ).toBe("Leve 3, pague 2 em Óleo, Balm e Shampoo")
    expect(
      descricaoDaPromocao({
        ...LEVE_3,
        aplicarA: "categorias",
        alvos: [{ id: "pcat_barba", nome: "Barba" }],
      })
    ).toBe("Leve 3, pague 2 nos produtos de Barba")
    expect(descricaoDaPromocao({ ...LEVE_3, aplicarA: "loja", alvos: [] })).toBe(
      "Leve 3, pague 2 em toda a loja"
    )
    expect(regraDaPromocao(LEVE_3)).toBe("sem data de fim")
    expect(
      regraDaPromocao({ de: "2026-10-01T00:00", ate: "2026-10-31T23:59", promocional: false })
    ).toBe("de 01/10 às 00:00 até 31/10 às 23:59 · fora do preço promocional")
  })

  it("a situação: valendo, pausada, agendada e vencida", () => {
    expect(promocaoNaLista(cru("active"), guardada(), uso, AGORA)).toEqual({
      id: "promo_01",
      codigo: "PROMO-AB12CD34",
      nome: "Leve 3 do Fator",
      etiqueta: "Leve 3, pague 2",
      descricao: "Leve 3, pague 2 em Fator de Crescimento",
      regra: "sem data de fim",
      situacao: "valendo",
      ligado: true,
      ...uso,
    })
    expect(promocaoNaLista(cru("inactive"), guardada(), uso, AGORA)).toMatchObject({
      situacao: "pausado",
      ligado: false,
    })
    expect(
      promocaoNaLista(cru("active"), guardada({ de: "2026-10-01T00:00" }), uso, AGORA).situacao
    ).toBe("agendado")
    expect(
      promocaoNaLista(cru("inactive"), guardada({ ate: "2026-09-01T00:00" }), uso, AGORA).situacao
    ).toBe("vencido")
  })
})

/* ── os cupons não se confundem com as promoções ───────────────────────── */

describe("cupom e promoção", () => {
  it("um cupom por pedido: o código da promoção no carrinho não conta como outro cupom", () => {
    expect(outroCupomNoCarrinho(["PROMO-AB12CD34"], ["BARBA10"], "add")).toBeNull()
    expect(outroCupomNoCarrinho(["PROMO-AB12CD34", "VOLTA10"], ["BARBA10"], "add")).toBe("VOLTA10")
  })

  it("o cupom não pode começar com PROMO-, nem aparecer na lista de cupons", () => {
    const r = lerCupomNovo({ codigo: "PROMO-10", tipo: "porcento", valor: "10" }, AGORA)
    expect(r.ok ? null : r.erros.codigo).toBe(
      '"PROMO-" é das promoções automáticas: escolha outro começo.'
    )
    expect(ehCupomDeCampanha({ id: "1", code: "PROMO-AB12CD34", is_automatic: false })).toBe(false)
  })
})
