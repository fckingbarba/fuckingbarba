import {
  EXPIRA_EM_DIAS,
  GUARDA_EM_DIAS,
  planoDaRodada,
  produtosQueMudaram,
  vendeAgora,
  type AvisoCru,
  type Situacao,
} from "../avise-me"

const AGORA = new Date("2026-09-26T15:00:00Z")
const DIA = 24 * 60 * 60 * 1000
const atras = (dias: number) => new Date(AGORA.getTime() - dias * DIA)

function situacao(extra: Partial<Situacao> = {}): Situacao {
  return {
    varianteId: "variant_spray",
    produtoId: "prod_spray",
    handle: "spray",
    nome: "Spray Modelador",
    imagem: null,
    publicado: true,
    vende: true,
    ...extra,
  }
}

function aviso(extra: Partial<AvisoCru> = {}): AvisoCru {
  return {
    id: "avis_1",
    email: "rafael@exemplo.com",
    variante_id: "variant_spray",
    produto_id: "prod_spray",
    consentido_em: atras(3),
    avisado_em: null,
    falhas: 0,
    ...extra,
  }
}

const mapa = (...s: Situacao[]) => new Map(s.map((x) => [x.varianteId, x]))

describe("vende agora — a régua do temEstoque da loja", () => {
  it("sem controle de estoque, sempre", () => {
    expect(vendeAgora({ manage_inventory: false }, 0)).toBe(true)
  })

  it("com venda sem estoque (backorder), sempre", () => {
    expect(vendeAgora({ manage_inventory: true, allow_backorder: true }, 0)).toBe(true)
  })

  it("com controle, pelo menos uma", () => {
    expect(vendeAgora({ manage_inventory: true }, 1)).toBe(true)
    expect(vendeAgora({ manage_inventory: true }, 0)).toBe(false)
    expect(vendeAgora({ manage_inventory: true }, -2)).toBe(false)
  })

  it("sem o número (variante sem item de estoque), vende — como a loja", () => {
    expect(vendeAgora({ manage_inventory: true }, null)).toBe(true)
    expect(vendeAgora({ manage_inventory: true }, undefined)).toBe(true)
  })
})

describe("o plano da rodada", () => {
  it("manda pra quem espera um produto no site e com estoque", () => {
    const plano = planoDaRodada([aviso()], mapa(situacao()), AGORA)
    expect(plano.mandar.map((a) => a.id)).toEqual(["avis_1"])
    expect(plano.apagar).toEqual([])
    expect(plano.esperando).toBe(0)
  })

  it("esgotado ou fora do site, segue esperando — o rascunho pode voltar", () => {
    const esgotado = planoDaRodada([aviso()], mapa(situacao({ vende: false })), AGORA)
    expect(esgotado).toEqual({ mandar: [], apagar: [], esperando: 1 })
    const rascunho = planoDaRodada([aviso()], mapa(situacao({ publicado: false })), AGORA)
    expect(rascunho).toEqual({ mandar: [], apagar: [], esperando: 1 })
  })

  it("apaga o pedido de variante que sumiu do catálogo", () => {
    const plano = planoDaRodada([aviso()], mapa(), AGORA)
    expect(plano).toEqual({ mandar: [], apagar: ["avis_1"], esperando: 0 })
  })

  it("apaga quem esperou mais que o prazo, mesmo com o produto de volta", () => {
    const velho = aviso({ consentido_em: atras(EXPIRA_EM_DIAS + 1) })
    const noPrazo = aviso({ id: "avis_2", consentido_em: atras(EXPIRA_EM_DIAS - 1) })
    const plano = planoDaRodada([velho, noPrazo], mapa(situacao()), AGORA)
    expect(plano.apagar).toEqual(["avis_1"])
    expect(plano.mandar.map((a) => a.id)).toEqual(["avis_2"])
  })

  it("o avisado fica pra conta do painel e sai depois do prazo de guarda", () => {
    const recente = aviso({ email: null, avisado_em: atras(GUARDA_EM_DIAS - 1) })
    const antigo = aviso({ id: "avis_2", email: null, avisado_em: atras(GUARDA_EM_DIAS + 1) })
    const plano = planoDaRodada([recente, antigo], mapa(situacao()), AGORA)
    expect(plano).toEqual({ mandar: [], apagar: ["avis_2"], esperando: 0 })
  })

  it("linha sem e-mail e sem aviso (não devia existir) sai", () => {
    const plano = planoDaRodada([aviso({ email: null })], mapa(situacao()), AGORA)
    expect(plano.apagar).toEqual(["avis_1"])
  })

  it("quem pediu primeiro recebe primeiro, e o que passa do limite fica pra próxima", () => {
    const avisos = [
      aviso({ id: "c", consentido_em: atras(1) }),
      aviso({ id: "a", consentido_em: atras(9) }),
      aviso({ id: "b", consentido_em: atras(5) }),
    ]
    const plano = planoDaRodada(avisos, mapa(situacao()), AGORA, 2)
    expect(plano.mandar.map((a) => a.id)).toEqual(["a", "b"])
    expect(plano.esperando).toBe(1)
  })

  it("produto sem endereço (handle) não manda: o e-mail não teria pra onde levar", () => {
    const plano = planoDaRodada([aviso()], mapa(situacao({ handle: null })), AGORA)
    expect(plano).toEqual({ mandar: [], apagar: [], esperando: 1 })
  })
})

describe("os produtos que a loja precisa redesenhar", () => {
  it("sem a rodada de antes (o processo acabou de subir), todos os do site", () => {
    const agora = mapa(
      situacao(),
      situacao({ varianteId: "variant_oleo", produtoId: "prod_oleo", handle: "oleo" }),
      situacao({ varianteId: "variant_rasc", handle: "rascunho", publicado: false })
    )
    expect(produtosQueMudaram(null, agora)).toEqual(["oleo", "spray"])
  })

  it("depois, só o que esgotou ou voltou", () => {
    const agora = mapa(
      situacao({ vende: false }),
      situacao({ varianteId: "variant_oleo", handle: "oleo", vende: true })
    )
    const antes = new Map([
      ["variant_spray", true],
      ["variant_oleo", true],
    ])
    expect(produtosQueMudaram(antes, agora)).toEqual(["spray"])
    expect(
      produtosQueMudaram(
        new Map([
          ["variant_spray", false],
          ["variant_oleo", true],
        ]),
        agora
      )
    ).toEqual([])
  })

  it("variante nova (produto publicado agora) também avisa", () => {
    const agora = mapa(situacao())
    expect(produtosQueMudaram(new Map(), agora)).toEqual(["spray"])
  })

  it("um produto com duas variantes que mudam é um aviso só", () => {
    const agora = mapa(
      situacao({ varianteId: "v1", vende: false }),
      situacao({ varianteId: "v2", vende: false })
    )
    expect(
      produtosQueMudaram(
        new Map([
          ["v1", true],
          ["v2", true],
        ]),
        agora
      )
    ).toEqual(["spray"])
  })
})
