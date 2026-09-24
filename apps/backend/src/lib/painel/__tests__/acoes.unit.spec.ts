import {
  acaoDaNota,
  estornoPraTentar,
  eventoDoFeito,
  fraseDaNota,
  fraseDoEstorno,
  motivoLegivel,
  registroDaNota,
  registroDoEstorno,
} from "../acoes"
import type { Contexto, NotaCrua } from "../pedido"

/**
 * Os botões do pedido: quando aparecem, o que dizem depois e o que fica no
 * histórico. A hora é de Brasília: 24/09/2026, 12:00 aqui = 15:00 UTC.
 */

const AGORA = new Date("2026-09-24T15:00:00.000Z")
const MIN = 60 * 1000
const antes = (minutos: number) => new Date(AGORA.getTime() - minutos * MIN)

const COM_JANELA: Contexto = {
  agora: AGORA,
  notasDesde: new Date("2026-09-20T00:00:00Z"),
  janelaDaNota: 30,
}
const SEM_ERP: Contexto = { agora: AGORA, notasDesde: null, janelaDaNota: 0 }

const nota = (extra: Partial<NotaCrua> = {}): NotaCrua => ({
  situacao: "a-emitir",
  referencia: "FB-1042",
  ...extra,
})

describe("o botão da nota", () => {
  it("“Emitir a nota agora” enquanto a janela está aberta — e só nela", () => {
    expect(acaoDaNota(nota(), "separacao", antes(10), COM_JANELA)).toBe("agora")
    expect(acaoDaNota(nota(), "separacao", antes(31), COM_JANELA)).toBeNull()
  })

  it("“Tentar a nota de novo” na que a loja desistiu de emitir", () => {
    const desistiu = nota({ definitivo: true, erro: "o pedido não tem CPF/CNPJ, e a nota precisa" })
    expect(acaoDaNota(desistiu, "separacao", antes(90), COM_JANELA)).toBe("de-novo")
  })

  it("nada na que a loja ainda tenta sozinha, na que já saiu, sem ERP ou com o pedido cancelado", () => {
    expect(
      acaoDaNota(nota({ erro: "o Bling não respondeu" }), "separacao", antes(5), COM_JANELA)
    ).toBeNull()
    expect(
      acaoDaNota(nota({ situacao: "autorizada" }), "separacao", antes(5), COM_JANELA)
    ).toBeNull()
    expect(
      acaoDaNota(nota({ situacao: "processando" }), "separacao", antes(5), COM_JANELA)
    ).toBeNull()
    expect(
      acaoDaNota(nota({ situacao: "rejeitada" }), "separacao", antes(5), COM_JANELA)
    ).toBeNull()
    expect(acaoDaNota(nota(), "separacao", antes(5), SEM_ERP)).toBeNull()
    expect(acaoDaNota(nota(), "cancelado", antes(5), COM_JANELA)).toBeNull()
    expect(
      acaoDaNota(nota({ cancelar: true, definitivo: true }), "cancelado", antes(5), COM_JANELA)
    ).toBeNull()
    expect(acaoDaNota(null, "separacao", antes(5), COM_JANELA)).toBeNull()
  })
})

describe("o botão do estorno", () => {
  const registro = (extra: Record<string, unknown>) => ({
    estornos: {
      pay_1: {
        situacao: "falhou",
        esperado: 7760,
        devolvido: 0,
        cobranca: "ch_1",
        forma: "pix",
        tentativas: 0,
        ...extra,
      },
    },
  })

  it("só no estorno do pagamento inteiro que falhou — o que a loja também pede sozinha", () => {
    expect(estornoPraTentar(registro({ sozinha: true }))).toBe(true)
    expect(estornoPraTentar(registro({ sozinha: false }))).toBe(false)
    expect(estornoPraTentar(registro({ situacao: "devolvido", sozinha: true }))).toBe(false)
    expect(estornoPraTentar({})).toBe(false)
    expect(estornoPraTentar(null)).toBe(false)
  })
})

describe("a frase depois do clique", () => {
  it("a nota: autorizada, na SEFAZ, não saiu e nada a fazer", () => {
    expect(fraseDaNota({ resultado: "autorizada", referencia: "FB-1", numero: "3412" })).toEqual({
      ok: true,
      texto: "Nota autorizada — NF-e 3412. O pedido segue pro despacho.",
    })
    expect(fraseDaNota({ resultado: "processando", referencia: "FB-1" }).ok).toBe(true)
    expect(
      fraseDaNota({
        resultado: "falhou",
        referencia: "FB-1",
        motivo: "o pedido não tem CPF/CNPJ, e a nota precisa",
        definitivo: true,
      })
    ).toEqual({
      ok: false,
      texto:
        "A nota não saiu: o pedido não tem CPF/CNPJ, e a nota precisa. Corrija o que falta e tente de novo.",
    })
    expect(fraseDaNota({ resultado: "nada", motivo: "ja-tem" }).texto).toBe(
      "Nada a fazer: a nota já existe."
    )
  })

  it("o motivo do Bling desconectado diz onde resolver", () => {
    expect(motivoLegivel("Bling desconectado")).toBe("o Bling desconectado — reconecte no admin")
    expect(motivoLegivel("algo que ninguém previu")).toBe("algo que ninguém previu")
  })

  it("o estorno: pedido, devolvido, andando e não deu", () => {
    expect(fraseDoEstorno({ resultado: "pedido", falta: 7760 }).texto).toMatch(
      /^Pedi de novo o estorno de R\$\s77,60\. O Pagar\.me leva alguns minutos/
    )
    expect(fraseDoEstorno({ resultado: "devolvido" })).toEqual({
      ok: true,
      texto: "O Pagar.me confirmou: o dinheiro voltou pra quem comprou.",
    })
    expect(fraseDoEstorno({ resultado: "andando" }).ok).toBe(true)
    expect(fraseDoEstorno({ resultado: "sem-estorno" }).ok).toBe(false)
    expect(fraseDoEstorno({ resultado: "nao-da", motivo: "saldo insuficiente" })).toEqual({
      ok: false,
      texto: "Não deu: saldo insuficiente.",
    })
  })
})

describe("o registro e o histórico", () => {
  it("a linha do registro leva o número do pedido e no que deu — nada do cliente", () => {
    expect(
      registroDaNota(
        { resultado: "autorizada", referencia: "FB-1042", numero: "3412" },
        "agora",
        1042
      )
    ).toEqual({ numero: 1042, tipo: "agora", resultado: "autorizada", nf: "3412" })
    expect(registroDoEstorno({ resultado: "nao-da", motivo: "saldo insuficiente" }, 1042)).toEqual({
      numero: 1042,
      resultado: "nao-da",
      motivo: "saldo insuficiente",
    })
  })

  it("no histórico, com o nome de quem apertou", () => {
    const em = antes(3)
    expect(
      eventoDoFeito({
        em,
        acao: "emitiu-nota",
        quem: "Rafael Souza",
        detalhe: { numero: 1042, tipo: "agora", resultado: "autorizada", nf: "3412" },
      })
    ).toEqual({
      titulo: "Rafael Souza mandou emitir a nota antes da janela",
      detalhe: "autorizada na hora — NF-e 3412",
    })
    expect(
      eventoDoFeito({
        em,
        acao: "emitiu-nota",
        quem: "Rafael Souza",
        detalhe: { tipo: "de-novo", resultado: "falhou", motivo: "o pedido não tem CPF/CNPJ" },
      })
    ).toEqual({
      titulo: "Rafael Souza mandou tentar a nota de novo",
      detalhe: "não saiu: o pedido não tem CPF/CNPJ",
    })
    expect(
      eventoDoFeito({
        em,
        acao: "pediu-estorno",
        quem: "Matheus",
        detalhe: { resultado: "pedido" },
      })
    ).toEqual({
      titulo: "Matheus pediu o estorno de novo",
      detalhe: "o Pagar.me aceitou — confirma em minutos",
    })
    expect(eventoDoFeito({ em, acao: "convidou", quem: "Matheus", detalhe: null })).toBeNull()
  })
})
