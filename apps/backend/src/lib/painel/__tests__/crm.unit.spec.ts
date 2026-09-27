import { emFraseDoCrm, lerPeriodoDoCrm, montarTelaDoCrm } from "../crm"

/**
 * A primeira tela do CRM: as anotações em frase, o e-mail mascarado, e todos
 * os tipos na ordem do caminho, com zero onde não houve nada.
 */

const OLEO = { variante: "variant_01", nome: "Óleo para barba", preco: 59.9, quantidade: 1 }
const FATOR = { variante: "variant_02", nome: "Fator de crescimento", preco: 89.9, quantidade: 2 }

describe("o período", () => {
  it("hoje, 7 ou 30 dias; o resto abre a semana", () => {
    expect(lerPeriodoDoCrm("hoje")).toBe("hoje")
    expect(lerPeriodoDoCrm("30d")).toBe("30d")
    expect(lerPeriodoDoCrm("90d")).toBe("7d")
    expect(lerPeriodoDoCrm(undefined)).toBe("7d")
  })
})

describe("cada anotação em frase", () => {
  it("de onde chegou, com o nome das origens do painel", () => {
    expect(emFraseDoCrm("visita", {})).toBe("chegou na loja · direto")
    expect(
      emFraseDoCrm("visita", {
        origem: {
          fonte: "ig",
          meio: "social",
          campanha: "black",
          conteudo: null,
          termo: null,
          de: null,
        },
      })
    ).toBe("chegou na loja · Instagram (black)")
    expect(
      emFraseDoCrm("visita", {
        origem: {
          fonte: null,
          meio: null,
          campanha: null,
          conteudo: null,
          termo: null,
          de: "google.com",
        },
      })
    ).toBe("chegou na loja · Google")
  })

  it("os produtos, a sacola e o checkout", () => {
    expect(emFraseDoCrm("produto_visto", { itens: [OLEO] })).toBe("viu Óleo para barba")
    expect(emFraseDoCrm("sacola_entrou", { itens: [FATOR, OLEO] })).toBe(
      "pôs 2× Fator de crescimento e mais 1 na sacola"
    )
    expect(emFraseDoCrm("sacola_saiu", { itens: [OLEO] })).toBe("tirou Óleo para barba da sacola")
    expect(emFraseDoCrm("checkout_comecou", { itens: [OLEO], valor: 59.9 })).toBe(
      "começou o checkout · R$\u00a059,90"
    )
    expect(emFraseDoCrm("entrega_escolhida", { frete: "PAC" })).toBe("escolheu a entrega · PAC")
    expect(emFraseDoCrm("pagamento_escolhido", { forma: "cartao", valor: 10 })).toBe(
      "escolheu cartão · R$\u00a010,00"
    )
    expect(emFraseDoCrm("pix_copiado", {})).toBe("copiou o Pix")
    expect(emFraseDoCrm("newsletter", null)).toBe("assinou a newsletter")
  })
})

describe("a tela", () => {
  it("todos os tipos na ordem, com zero; e-mail mascarado; tipo desconhecido fora", () => {
    const agora = new Date("2026-09-26T18:00:00Z")
    const tela = montarTelaDoCrm(
      {
        periodo: "hoje",
        numeros: { visitantes: 3, identificados: 1, pessoas: 1, anotacoes: 5 },
        tipos: [
          { tipo: "sacola_entrou", vezes: 2, visitantes: 1 },
          { tipo: "visita", vezes: 3, visitantes: 3 },
        ],
        ultimos: [
          {
            id: "evt_2",
            tipo: "sacola_entrou",
            dados: { itens: [OLEO] },
            em: "2026-09-26T17:30:00Z",
            email: "rafael.souza@gmail.com",
          },
          { id: "evt_1", tipo: "coisa_velha", dados: null, em: agora, email: null },
          { id: "evt_0", tipo: "visita", dados: {}, em: "2026-09-26T17:00:00Z", email: null },
        ],
      },
      agora
    )
    expect(tela.tipos.map((t) => t.tipo)).toEqual([
      "visita",
      "produto_visto",
      "sacola_entrou",
      "sacola_saiu",
      "checkout_comecou",
      "contato_informado",
      "entrega_escolhida",
      "pagamento_escolhido",
      "pix_copiado",
      "newsletter",
      "conta_entrou",
    ])
    expect(tela.tipos[0]).toEqual({ tipo: "visita", nome: "Visitas", vezes: 3, visitantes: 3 })
    expect(tela.tipos[1]?.vezes).toBe(0)
    expect(tela.ultimos).toEqual([
      {
        id: "evt_2",
        tipo: "sacola_entrou",
        quando: "hoje, 14:30",
        quem: "r•••@gmail.com",
        oque: "pôs Óleo para barba na sacola",
      },
      {
        id: "evt_0",
        tipo: "visita",
        quando: "hoje, 14:00",
        quem: null,
        oque: "chegou na loja · direto",
      },
    ])
  })
})
