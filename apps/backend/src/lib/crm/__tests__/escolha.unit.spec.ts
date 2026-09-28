import { randomBytes } from "node:crypto"
import { trilhaDaPessoa } from "../boas-vindas"
import { escolhaDoToken, tokenDeEscolha } from "../escolha"
import { decidir, FLUXOS, registrosDoMotor, TOQUE_DA_ESCOLHA } from "../fluxos"

/**
 * A escolha do "Barba ou cabelo?" (0178): o link cifrado com o e-mail e a
 * trilha, a trilha de cada pessoa na hora do e-mail, e as boas-vindas sem o
 * grupo de controle.
 */

const CHAVE = randomBytes(32)

describe("o link de escolha", () => {
  it("vai e volta com o e-mail e a trilha, sem o e-mail aparecer", () => {
    const t = tokenDeEscolha("Rafael@Exemplo.com", "cabelo", CHAVE)
    expect(t).not.toContain("rafael")
    expect(escolhaDoToken(t, CHAVE)).toEqual({ email: "rafael@exemplo.com", trilha: "cabelo" })
  })

  it("mexido, de outra chave ou torto: nada", () => {
    const t = tokenDeEscolha("rafael@exemplo.com", "cuidado", CHAVE)
    const mexido = t.slice(0, -2) + (t.endsWith("AA") ? "BB" : "AA")
    expect(escolhaDoToken(mexido, CHAVE)).toBeNull()
    expect(escolhaDoToken(t, randomBytes(32))).toBeNull()
    for (const torto of [undefined, "", "abc", 42, "x".repeat(700)])
      expect(escolhaDoToken(torto, CHAVE)).toBeNull()
  })
})

describe("a trilha da pessoa", () => {
  it("a escolha vale mais que a página; sem escolha, a página diz", () => {
    expect(trilhaDaPessoa({ escolha: "cabelo", pagina: "/produtos/oleo-para-barba" })).toEqual({
      trilha: "cabelo",
      visto: null,
    })
    expect(trilhaDaPessoa({ escolha: null, pagina: "/produtos/oleo-para-barba" })).toEqual({
      trilha: "cuidado",
      visto: "oleo-para-barba",
    })
    expect(trilhaDaPessoa({ escolha: "torta", pagina: "/" }).trilha).toBe("geral")
  })
})

describe("as boas-vindas no motor", () => {
  it("sem grupo de controle: ninguém fica sem o e-mail de 1 dia", () => {
    const agora = new Date("2026-09-29T15:00:00Z")
    const comeco = new Date("2026-09-28T14:00:00Z")
    expect(FLUXOS["boas-vindas"].semControle).toBe(true)
    for (let i = 0; i < 60; i++) {
      const email = `pessoa${i}@exemplo.com`
      const r = decidir({
        entradas: [{ fluxo: "boas-vindas", chave: email, email, comeco, comprou: false }],
        registros: [
          {
            email,
            fluxo: "boas-vindas",
            chave: email,
            toque: "boas-vindas-agora",
            como: "enviado",
            em: comeco,
            cupom: "BEMVINDO-AAAAAA",
          },
        ],
        ligados: { "boas-vindas": new Date("2026-09-01T00:00:00Z") },
        agora,
      })
      expect(r?.decisao.tipo).toBe("mandar")
    }
  })

  it("a escolha do “Barba ou cabelo?” não é e-mail: não conta no teto", () => {
    const agora = new Date("2026-09-29T15:00:00Z")
    const comeco = new Date("2026-09-28T14:00:00Z")
    const email = "rafael@exemplo.com"
    const linha = (fluxo: string, chave: string, toque: string, como: string, em: string) => ({
      email,
      fluxo,
      chave,
      toque,
      como,
      em: new Date(em),
      cupom: null,
    })
    // Nas últimas 24 horas: 2 e-mails do Pix e a escolha. O teto do dia é 3.
    const lidos = [
      linha("boas-vindas", email, "boas-vindas-agora", "enviado", "2026-09-28T14:00:00Z"),
      linha("pix", "order_1", FLUXOS.pix.toques[0].id, "enviado", "2026-09-29T09:00:00Z"),
      linha("pix", "order_1", FLUXOS.pix.toques[1].id, "enviado", "2026-09-29T10:00:00Z"),
      linha("boas-vindas", email, TOQUE_DA_ESCOLHA, "cuidado", "2026-09-29T14:30:00Z"),
    ]
    const registros = registrosDoMotor(lidos)
    expect(registros.map((r) => r.toque)).not.toContain(TOQUE_DA_ESCOLHA)
    const r = decidir({
      entradas: [{ fluxo: "boas-vindas", chave: email, email, comeco, comprou: false }],
      registros,
      ligados: { "boas-vindas": new Date("2026-09-01T00:00:00Z") },
      agora,
    })
    expect(r?.decisao.tipo).toBe("mandar")
    // A reserva que não foi confirmada segue contando como envio.
    expect(
      registrosDoMotor([linha("pix", "order_2", "pix-24h", "enviando", "2026-09-29T11:00:00Z")])[0]
        .como
    ).toBe("enviado")
  })
})
