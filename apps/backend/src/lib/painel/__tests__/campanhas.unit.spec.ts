import { montarTelaDasCampanhas } from "../campanhas"

/** A aba Campanhas (0206): a ordem da lista, os públicos e o resultado só de quem saiu. */

const linha = (id: string, situacao: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome: `Campanha ${id}`,
  assunto: "Assunto A",
  assunto_b: null,
  previa: "",
  titulo: "Título",
  texto: "Texto.",
  botao_texto: null,
  botao_caminho: null,
  produtos: [],
  publico: "todos",
  situacao,
  agenda: null,
  comecou_em: null,
  acabou_em: null,
  por: "dono@loja.test",
  updated_at: "2026-09-29T10:00:00Z",
  ...extra,
})

describe("a tela das campanhas", () => {
  it("a que está saindo, as agendadas pela hora, os rascunhos e as que saíram", () => {
    const tela = montarTelaDasCampanhas({
      campanhas: [
        linha("r1", "rascunho"),
        linha("e1", "enviada", {
          comecou_em: "2026-09-20T12:00:00Z",
          acabou_em: "2026-09-20T15:00:00Z",
        }),
        linha("g2", "agendada", { agenda: "2026-11-27T11:00:00Z" }),
        linha("s1", "enviando", { comecou_em: "2026-09-29T12:00:00Z" }),
        linha("g1", "agendada", { agenda: "2026-10-12T11:00:00Z", jeito: "recado" }),
      ],
      registros: new Map([
        ["e1", [{ email: "a@x.com", toque: "a", como: "enviado", em: "2026-09-20T12:00:00Z" }]],
      ]),
      pedidos: [
        { email: "a@x.com", created_at: "2026-09-21T12:00:00Z", total: 120, status: "pending" },
      ],
      publicos: { todos: 3000, clientes: 1800, leads: 1200, "em-risco": 400 },
      produtos: [{ handle: "oleo-para-barba", nome: "Óleo para Barba" }],
    })
    expect(tela.campanhas.map((c) => c.id)).toEqual(["s1", "g1", "g2", "r1", "e1"])
    expect(tela.campanhas.find((c) => c.id === "e1")?.resultado?.variantes[0]).toMatchObject({
      pessoas: 1,
      compraram: 1,
      vendido: 120,
    })
    expect(tela.campanhas.find((c) => c.id === "r1")?.resultado).toBeNull()
    // O jeito (0210): a linha de antes, sem ele, é oferta.
    expect(tela.campanhas.find((c) => c.id === "r1")?.nomeDoJeito).toBe("Oferta")
    expect(tela.campanhas.find((c) => c.id === "g1")?.nomeDoJeito).toBe("Recado do Matheus")
    expect(tela.publicos).toEqual([
      { id: "todos", nome: "Todos que aceitam ofertas", pessoas: 3000 },
      { id: "clientes", nome: "Quem já comprou", pessoas: 1800 },
      { id: "leads", nome: "Quem nunca comprou", pessoas: 1200 },
      { id: "em-risco", nome: "Quem está em risco", pessoas: 400 },
    ])
  })

  it("a que tem o resultado guardado usa ele, sem o registro", () => {
    const guardado = {
      variantes: [
        { variante: "a", assunto: "Assunto A", pessoas: 900, compraram: 27, vendido: 3240 },
      ],
      controle: { pessoas: 47, compraram: 1 },
      vendeuMais: null,
    }
    const tela = montarTelaDasCampanhas({
      campanhas: [
        linha("e1", "enviada", {
          comecou_em: "2026-09-01T12:00:00Z",
          acabou_em: "2026-09-01T15:00:00Z",
          resultado: guardado,
        }),
      ],
      registros: new Map(),
      pedidos: [],
      publicos: { todos: 0, clientes: 0, leads: 0, "em-risco": 0 },
      produtos: [],
    })
    expect(tela.campanhas[0]?.resultado).toEqual(guardado)
  })
})
