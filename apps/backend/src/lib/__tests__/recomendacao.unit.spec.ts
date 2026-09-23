import {
  AJUSTES,
  lerOferta,
  montarModelo,
  pecasDosKits,
  type PedidoDoModelo,
  type ProdutoDoModelo,
} from "../recomendacao"

/** O catálogo de 23/09, com a rotina que está na PDP do fator. */
const CATALOGO: ProdutoDoModelo[] = [
  {
    handle: "oleo",
    titulo: "Óleo para Barba FuckingBarba 30ml",
    categorias: ["barba"],
    combina: [],
  },
  {
    handle: "shampoo",
    titulo: "Shampoo para Barba FuckingBarba 120ml",
    categorias: ["barba"],
    combina: [],
  },
  {
    handle: "balm",
    titulo: "Balm Modelador para Barba FuckingBarba 90g",
    categorias: ["barba"],
    combina: [],
  },
  {
    handle: "fator",
    titulo: "Fator de Crescimento para Barba 30ml",
    categorias: ["barba"],
    combina: ["shampoo", "oleo"],
  },
  { handle: "spray", titulo: "Spray Modelador Matte 100ml", categorias: ["cabelo"], combina: [] },
  {
    handle: "kit",
    titulo: "Kit Completo FuckingBarba — Shampoo, Balm e Óleo",
    categorias: ["kits", "barba"],
    combina: [],
  },
]

const pedido = (handles: string[], bump: PedidoDoModelo["bump"] = null): PedidoDoModelo => ({
  handles,
  bump,
})
const vezes = (n: number, p: PedidoDoModelo) => Array.from({ length: n }, () => p)
const TODOS = new Set(CATALOGO.map((p) => p.handle))

describe("sem pedido nenhum, o motor sai do que a loja já diz", () => {
  const modelo = montarModelo(CATALOGO, [], TODOS)
  const { crenca } = AJUSTES

  it("a rotina da PDP: o fator puxa o shampoo e o óleo", () => {
    expect(modelo.afinidade.fator.shampoo).toBe(crenca.combina)
    expect(modelo.afinidade.fator.oleo).toBe(crenca.combina)
  })

  it("de volta vale menos: quem leva o óleo não precisa do fator", () => {
    expect(modelo.afinidade.oleo.fator).toBe(crenca.combinaDeVolta)
  })

  it("quem divide a rotina de um terceiro combina entre si", () => {
    expect(modelo.afinidade.shampoo.oleo).toBe(crenca.mesmaRotina)
    expect(modelo.afinidade.oleo.shampoo).toBe(crenca.mesmaRotina)
  })

  it("mesma categoria vale mais que categoria nenhuma em comum", () => {
    expect(modelo.afinidade.oleo.balm).toBe(crenca.mesmaCategoria)
    expect(modelo.afinidade.oleo.spray).toBe(crenca.outro)
  })

  it("o que a loja diz vira 'combina' — é o que a oferta pode escrever", () => {
    expect(modelo.combina.fator).toEqual(expect.arrayContaining(["shampoo", "oleo"]))
    expect(modelo.combina.oleo).toEqual(expect.arrayContaining(["fator", "shampoo"]))
    expect(modelo.combina.spray).toBeUndefined()
  })

  it("e ninguém é 'comprado junto' nem 'mais pedido' sem pedido", () => {
    expect(modelo.juntos).toEqual({})
    expect(modelo.maisPedidos).toEqual([])
    expect(Object.values(modelo.popularidade).every((p) => p === 0)).toBe(true)
  })

  it("toda oferta começa com o mesmo peso", () => {
    expect(Object.values(modelo.bump)).toEqual(CATALOGO.map(() => 1))
  })
})

describe("as peças do kit, pelo nome", () => {
  it("shampoo, balm e óleo são peças; fator e spray não", () => {
    expect(pecasDosKits(CATALOGO).kit.sort()).toEqual(["balm", "oleo", "shampoo"])
  })

  it("a peça precisa ser da família do kit: shampoo de cabelo não entra no kit de barba", () => {
    const comCabelo = [
      ...CATALOGO,
      {
        handle: "shampoo-cabelo",
        titulo: "Shampoo para Cabelo 200ml",
        categorias: ["cabelo"],
        combina: [],
      },
    ]
    expect(pecasDosKits(comCabelo).kit).not.toContain("shampoo-cabelo")
  })

  it("kit não é peça de kit", () => {
    const doisKits = [
      ...CATALOGO,
      {
        handle: "kit-duplo",
        titulo: "Kit Duplo — Kit Completo e Fator",
        categorias: ["kits", "barba"],
        combina: [],
      },
    ]
    expect(pecasDosKits(doisKits)["kit-duplo"]).toEqual(["fator"])
  })
})

describe("com pedidos, os pedidos mandam", () => {
  it("óleo e balm comprados juntos passam a rotina do fator", () => {
    const modelo = montarModelo(CATALOGO, vezes(10, pedido(["oleo", "balm"])), TODOS)
    // (10 + 10 × 0,1) / (10 + 10)
    expect(modelo.afinidade.oleo.balm).toBe(0.55)
    expect(modelo.afinidade.oleo.balm).toBeGreaterThan(modelo.afinidade.oleo.fator)
    expect(modelo.juntos.oleo).toEqual(["balm"])
  })

  it("um pedido só não vira regra — nem 'comprado junto'", () => {
    const modelo = montarModelo(CATALOGO, [pedido(["oleo", "spray"])], TODOS)
    // (1 + 10 × 0,03) / (1 + 10), contra (0 + 10 × 0,15) / (1 + 10) do fator
    expect(modelo.afinidade.oleo.spray).toBe(0.118)
    expect(modelo.afinidade.oleo.spray).toBeLessThan(modelo.afinidade.oleo.fator)
    expect(modelo.juntos.oleo).toBeUndefined()
  })

  it("'comprado junto' pede 5 pedidos E 15% de quem leva o produto", () => {
    const poucos = montarModelo(CATALOGO, vezes(4, pedido(["oleo", "balm"])), TODOS)
    expect(poucos.juntos.oleo).toBeUndefined()

    const diluido = montarModelo(
      CATALOGO,
      [...vezes(5, pedido(["oleo", "balm"])), ...vezes(40, pedido(["oleo"]))],
      TODOS
    )
    // 5 de 45 pedidos com óleo: 11%
    expect(diluido.juntos.oleo).toBeUndefined()
  })

  it("mais pedidos: os dois primeiros, com pelo menos 10 pedidos", () => {
    const modelo = montarModelo(
      CATALOGO,
      [
        ...vezes(12, pedido(["oleo"])),
        ...vezes(10, pedido(["fator"])),
        ...vezes(9, pedido(["balm"])),
      ],
      TODOS
    )
    expect(modelo.maisPedidos).toEqual(["oleo", "fator"])
    expect(modelo.popularidade.oleo).toBeCloseTo(12 / 31, 3)
  })

  it("produto fora do catálogo e pedido vazio não entram na conta", () => {
    const modelo = montarModelo(
      CATALOGO,
      [pedido(["oleo", "produto-apagado"]), pedido(["produto-apagado"]), pedido([])],
      TODOS
    )
    expect(modelo.popularidade.oleo).toBe(1)
    expect(modelo.afinidade["produto-apagado"]).toBeUndefined()
  })

  it("o produto repetido no pedido conta uma vez", () => {
    const modelo = montarModelo(CATALOGO, [pedido(["oleo", "oleo", "balm"])], TODOS)
    expect(modelo.popularidade.oleo).toBe(1)
    // (1 + 10 × 0,1) / (1 + 10)
    expect(modelo.afinidade.oleo.balm).toBe(0.182)
  })
})

describe("o modelo que vai pro navegador", () => {
  const grande = Array.from({ length: 14 }, (_, i) => ({
    handle: `p${i}`,
    titulo: `Produto ${i}`,
    categorias: ["barba"],
    combina: [],
  }))

  it("guarda só os vizinhos mais fortes de cada produto", () => {
    const modelo = montarModelo(grande, [], new Set())
    expect(Object.keys(modelo.afinidade.p0)).toHaveLength(AJUSTES.vizinhos)
  })

  it("não leva contagem nenhuma: tudo é fração", () => {
    const modelo = montarModelo(CATALOGO, vezes(30, pedido(["oleo", "balm"])), TODOS)
    const numeros = [
      ...Object.values(modelo.afinidade).flatMap((l) => Object.values(l)),
      ...Object.values(modelo.popularidade),
    ]
    expect(numeros.every((n) => n >= 0 && n <= 1)).toBe(true)
  })
})

describe("a oferta do checkout aprende com o aceite", () => {
  const aceito = (produto: string, sim: boolean) => pedido([produto], { produto, aceito: sim })

  it("só produto com promoção ligada pode ser oferecido", () => {
    const modelo = montarModelo(CATALOGO, [], new Set(["oleo"]))
    expect(Object.keys(modelo.bump)).toEqual(["oleo"])
  })

  it("aceito mais que a média, sobe; recusado, desce", () => {
    const modelo = montarModelo(
      CATALOGO,
      [
        ...vezes(10, aceito("oleo", true)),
        ...vezes(10, aceito("oleo", false)),
        ...vezes(20, aceito("balm", false)),
      ],
      TODOS
    )
    expect(modelo.bump.oleo).toBeGreaterThan(1)
    expect(modelo.bump.balm).toBeLessThan(1)
    // quem nunca foi oferecido fica na média
    expect(modelo.bump.spray).toBe(1)
  })

  it("entre metade e o dobro, por mais que os pedidos puxem", () => {
    const modelo = montarModelo(
      CATALOGO,
      [...vezes(200, aceito("oleo", true)), ...vezes(2000, aceito("balm", false))],
      TODOS
    )
    expect(modelo.bump.oleo).toBeLessThanOrEqual(AJUSTES.bump.teto)
    expect(modelo.bump.balm).toBeGreaterThanOrEqual(AJUSTES.bump.piso)
  })
})

describe("o registro da oferta no pedido", () => {
  it("lê o que a loja gravou", () => {
    expect(lerOferta({ fb_bump: { produto: "oleo", aceito: true, em: "2026-09-23" } })).toEqual({
      produto: "oleo",
      aceito: true,
    })
  })

  it("ignora o que estiver torto", () => {
    expect(lerOferta(null)).toBeNull()
    expect(lerOferta({})).toBeNull()
    expect(lerOferta({ fb_bump: null })).toBeNull()
    expect(lerOferta({ fb_bump: { produto: "", aceito: true } })).toBeNull()
    expect(lerOferta({ fb_bump: { produto: "oleo", aceito: "sim" } })).toBeNull()
  })
})
