import { resolve } from "node:path"
import { MERCADOPAGO, PAGARME } from "../parceiros"

/**
 * POR ONDE A LOJA COBRA — `rotaDoPagamento`, em
 * `apps/loja/src/lib/checkout-visivel.ts` (a loja não tem testes de unidade;
 * o arquivo não importa nada de servidor, e o teste mora ao lado do
 * disjuntor, que é quem diz quem está fora).
 *
 * Carregado pelo caminho, e não por `import`: o typecheck do backend não
 * aceita arquivo fora de `apps/backend` — o jest, sim.
 */
type Rota = { pix: string[]; cartao: string[]; fora: string[] }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { rotaDoPagamento } = require(
  resolve(__dirname, "../../../../../loja/src/lib/checkout-visivel.ts")
) as { rotaDoPagamento: (daRegiao: readonly string[], fora: readonly string[]) => Rota }

const OS_DOIS = [PAGARME.id, MERCADOPAGO.id, "pp_system_default"]

describe("a rota do pagamento, na loja", () => {
  it("os dois de pé: o Pix vai pelo Pagar.me, com o Mercado Pago de reserva; o cartão, pelo Pagar.me", () => {
    expect(rotaDoPagamento(OS_DOIS, [])).toEqual({
      pix: [PAGARME.id, MERCADOPAGO.id],
      cartao: [PAGARME.id],
      fora: [],
    })
  })

  it("o Pagar.me fora: o Pix vai pelo Mercado Pago, e o cartão sai da tela", () => {
    expect(rotaDoPagamento(OS_DOIS, [PAGARME.id])).toEqual({
      pix: [MERCADOPAGO.id],
      cartao: [],
      fora: ["cartao"],
    })
  })

  it("o Mercado Pago fora: nada muda pra quem compra — só não tem reserva", () => {
    expect(rotaDoPagamento(OS_DOIS, [MERCADOPAGO.id])).toEqual({
      pix: [PAGARME.id],
      cartao: [PAGARME.id],
      fora: [],
    })
  })

  it("os dois fora: ninguém sai do caminho — a loja segue tentando, na ordem de sempre", () => {
    expect(rotaDoPagamento(OS_DOIS, [PAGARME.id, MERCADOPAGO.id])).toEqual({
      pix: [PAGARME.id, MERCADOPAGO.id],
      cartao: [PAGARME.id],
      fora: [],
    })
  })

  it("só o Pagar.me na região (a reserva desligada): fora ou não, ele segue", () => {
    const soPagarme = [PAGARME.id]
    expect(rotaDoPagamento(soPagarme, [])).toEqual({
      pix: [PAGARME.id],
      cartao: [PAGARME.id],
      fora: [],
    })
    expect(rotaDoPagamento(soPagarme, [PAGARME.id])).toEqual({
      pix: [PAGARME.id],
      cartao: [PAGARME.id],
      fora: [],
    })
  })

  it("só o provisório (o checkout fechado): nenhum parceiro, nenhuma rota", () => {
    expect(rotaDoPagamento(["pp_system_default"], [])).toEqual({ pix: [], cartao: [], fora: [] })
  })
})
