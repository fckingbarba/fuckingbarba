import { RESPOSTA_DO_VALOR, valorDoPagamento, type CarrinhoDoFechamento } from "../valor"

/**
 * O fechamento só autoriza o pagamento que cobra o carrinho inteiro
 * (auditoria de 27/09): a sessão aberta com o valor de antes do carrinho
 * crescer não fecha pedido.
 */

const carrinho = (
  total: unknown,
  sessoes: NonNullable<CarrinhoDoFechamento["payment_collection"]>["payment_sessions"]
): CarrinhoDoFechamento => ({
  total,
  currency_code: "brl",
  payment_collection: { payment_sessions: sessoes },
})

describe("o valor do pagamento no fechamento", () => {
  it("a sessão que cobra o total passa — nos formatos em que o Medusa entrega o valor", () => {
    expect(
      valorDoPagamento(
        carrinho(153.9, [{ id: "ps_1", status: "pending", amount: 153.9, currency_code: "brl" }])
      )
    ).toEqual({ tipo: "bate" })
    expect(
      valorDoPagamento({
        ...carrinho(153.9, [
          {
            id: "ps_1",
            status: "pending",
            raw_amount: { value: "153.9", precision: 20 },
            currency_code: "BRL",
          },
        ]),
        raw_total: { value: "153.90", precision: 20 },
      })
    ).toEqual({ tipo: "bate" })
  })

  it("a sessão com o valor de antes do carrinho crescer não passa (R$ 1.010 pagos com R$ 10)", () => {
    expect(
      valorDoPagamento(
        carrinho(1010, [{ id: "ps_velha", status: "pending", amount: 10, currency_code: "brl" }])
      )
    ).toEqual({ tipo: "fora", sessao: "ps_velha", cobraria: 1000, total: 101000, moeda: "brl" })
    // Nem a de mais: cobrar diferente do que a tela mostrou não tem conserto depois.
    expect(
      valorDoPagamento(carrinho(10, [{ id: "ps_1", status: "pending", amount: 12 }])).tipo
    ).toBe("fora")
  })

  it("outra moeda não passa", () => {
    expect(
      valorDoPagamento(
        carrinho(50, [{ id: "ps_1", status: "pending", amount: 50, currency_code: "usd" }])
      ).tipo
    ).toBe("fora")
  })

  it("só conferem as sessões que o fechamento autoriza — como no Medusa", () => {
    expect(
      valorDoPagamento(
        carrinho(100, [
          { id: "ps_cancelada", status: "canceled", amount: 1 },
          { id: "ps_erro", status: "error", amount: 1 },
          { id: "ps_boa", status: "authorized", amount: 100 },
        ])
      )
    ).toEqual({ tipo: "bate" })
    expect(
      valorDoPagamento(
        carrinho(100, [
          { id: "ps_boa", status: "pending", amount: 100 },
          { id: "ps_velha", status: "requires_more", amount: 40 },
        ])
      ).tipo
    ).toBe("fora")
  })

  it("carrinho de total zero (cupom de 100%) não tem sessão pra conferir", () => {
    expect(valorDoPagamento(carrinho(0, []))).toEqual({ tipo: "bate" })
    expect(valorDoPagamento({ total: 0 })).toEqual({ tipo: "bate" })
  })

  it("valor que não se lê não trava a venda: o gancho só avisa no log", () => {
    expect(
      valorDoPagamento(carrinho("não é número", [{ id: "ps_1", status: "pending", amount: 10 }]))
    ).toEqual({ tipo: "ilegivel", sessao: "ps_1" })
  })

  it("a loja lê o motivo no message", () => {
    expect(RESPOSTA_DO_VALOR).toBe("valor_divergente")
  })
})
