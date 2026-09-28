import { emLinha, ehFiltro, listaDasAvaliacoes, type AvaliacaoCrua } from "../avaliacoes"

const AGORA = new Date("2026-09-27T15:00:00Z")
const HORA = 60 * 60 * 1000
const atras = (horas: number) => new Date(AGORA.getTime() - horas * HORA)

function crua(extra: Partial<AvaliacaoCrua> = {}): AvaliacaoCrua {
  return {
    id: "aval_1",
    pedido_id: "order_1",
    numero: 591,
    produto_id: "prod_1",
    produto_nome: "Balm Modelador",
    nome: "Rafael S.",
    nota: 5,
    texto: "Segurou o dia todo.",
    situacao: "nova",
    moderada_em: null,
    moderada_por: null,
    created_at: atras(2),
    ...extra,
  }
}

describe("a tela das avaliações", () => {
  const todas = [
    crua({ id: "n-velha", created_at: atras(30) }),
    crua({ id: "n-nova", created_at: atras(1) }),
    crua({ id: "a-1", situacao: "aprovada", nota: 5, moderada_em: atras(5) }),
    crua({ id: "a-2", situacao: "aprovada", nota: 4, moderada_em: atras(1) }),
    crua({ id: "a-3", situacao: "aprovada", nota: 4, moderada_em: atras(3) }),
    crua({ id: "r-1", situacao: "recusada", moderada_em: atras(2) }),
  ]

  it("as contas das fitas e a média do site olham todas", () => {
    const { contagem, noSite } = listaDasAvaliacoes(todas, "novas")
    expect(contagem).toEqual({ novas: 2, "no-site": 3, recusadas: 1 })
    expect(noSite).toEqual({ media: 4.3, total: 3 })
    expect(listaDasAvaliacoes([], "novas").noSite).toEqual({ media: null, total: 0 })
  })

  it("as novas numa fila, da que esperou mais pra mais nova", () => {
    expect(listaDasAvaliacoes(todas, "novas").lista.map((a) => a.id)).toEqual(["n-velha", "n-nova"])
  })

  it("as do site e as recusadas, da mexida mais recente pra mais antiga", () => {
    expect(listaDasAvaliacoes(todas, "no-site").lista.map((a) => a.id)).toEqual([
      "a-2",
      "a-3",
      "a-1",
    ])
    expect(listaDasAvaliacoes(todas, "recusadas").lista.map((a) => a.id)).toEqual(["r-1"])
  })

  it("a fita do endereço: só as três", () => {
    expect(ehFiltro("novas")).toBe(true)
    expect(ehFiltro("no-site")).toBe(true)
    expect(ehFiltro("todas")).toBe(false)
  })
})

describe("uma linha da tela", () => {
  it("o pedido só pra quem abre os pedidos", () => {
    const comPedido = emLinha(crua(), { verPedido: true, agora: AGORA })
    expect(comPedido.pedido).toEqual({ id: "order_1", numero: 591, nuvemshop: false })
    const semPedido = emLinha(crua(), { verPedido: false, agora: AGORA })
    expect(semPedido.pedido).toBeNull()
    expect(JSON.stringify(semPedido)).not.toContain("591")
    expect(JSON.stringify(semPedido)).not.toContain("order_1")
  })

  it("o pedido da loja antiga (a base da Nuvemshop) vem marcado — não tem página no painel", () => {
    const antigo = crua({ pedido_id: "nso_01K6ABCDEF", numero: 2871 })
    expect(emLinha(antigo, { verPedido: true, agora: AGORA }).pedido).toEqual({
      id: "nso_01K6ABCDEF",
      numero: 2871,
      nuvemshop: true,
    })
    expect(emLinha(antigo, { verPedido: false, agora: AGORA }).pedido).toBeNull()
  })

  it("quem aprovou e quando; a nova não diz nada", () => {
    expect(emLinha(crua(), { verPedido: true, agora: AGORA }).moderacao).toBeNull()
    const aprovada = crua({ situacao: "aprovada", moderada_em: atras(1), moderada_por: "eqp_1" })
    expect(emLinha(aprovada, { quem: "Ana", verPedido: true, agora: AGORA }).moderacao).toBe(
      `Aprovada por Ana · hoje, ${new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      }).format(atras(1))}`
    )
    expect(emLinha(aprovada, { quem: null, verPedido: true, agora: AGORA }).moderacao).toMatch(
      /^Aprovada por alguém da equipe · /
    )
    const peloAdmin = crua({ situacao: "recusada", moderada_em: atras(1), moderada_por: null })
    expect(emLinha(peloAdmin, { verPedido: true, agora: AGORA }).moderacao).toMatch(
      /^Recusada pelo admin · /
    )
  })

  it("o produto do catálogo agora; sem ele, o nome da hora da avaliação", () => {
    const noCatalogo = emLinha(crua(), {
      produto: { handle: "balm-para-barba", foto: "f.webp" },
      verPedido: true,
      agora: AGORA,
    })
    expect(noCatalogo.produto).toEqual({
      nome: "Balm Modelador",
      handle: "balm-para-barba",
      foto: "f.webp",
    })
    expect(emLinha(crua(), { verPedido: true, agora: AGORA }).produto).toEqual({
      nome: "Balm Modelador",
      handle: null,
      foto: null,
    })
  })
})
