import { capturasDo } from "../dados-do-pedido"

/**
 * As capturas que fazem um pedido "pago" pra etiqueta, pra nota e pro e-mail
 * de confirmado: só das cobranças pagas por inteiro (auditoria de 27/09).
 */

const EM = "2026-09-27T15:00:00.000Z"

describe("as capturas do pedido", () => {
  it("o pagamento capturado com o valor da cobrança conta", () => {
    expect(
      capturasDo({
        payment_collections: [{ amount: 153.9, payments: [{ amount: 153.9, captured_at: EM }] }],
      })
    ).toEqual([new Date(EM)])
  })

  it("capturado com menos que a cobrança não conta (R$ 10 num pedido de R$ 1.010)", () => {
    expect(
      capturasDo({
        payment_collections: [{ amount: 1010, payments: [{ amount: 10, captured_at: EM }] }],
      })
    ).toEqual([])
  })

  it("dois pagamentos que somam a cobrança contam os dois", () => {
    expect(
      capturasDo({
        payment_collections: [
          {
            amount: 100,
            payments: [
              { amount: 60, captured_at: EM },
              { amount: 40, captured_at: "2026-09-27T15:05:00.000Z" },
            ],
          },
        ],
      })
    ).toHaveLength(2)
  })

  it("a cobrança nova de uma edição, ainda sem pagamento, não tira o pago da primeira", () => {
    expect(
      capturasDo({
        payment_collections: [
          { amount: 100, payments: [{ amount: 100, captured_at: EM }] },
          { amount: 30, payments: [] },
        ],
      })
    ).toEqual([new Date(EM)])
  })

  it("sem os valores na consulta, capturado é pago — como antes", () => {
    expect(capturasDo({ payment_collections: [{ payments: [{ captured_at: EM }] }] })).toEqual([
      new Date(EM),
    ])
    expect(
      capturasDo({ payment_collections: [{ amount: 100, payments: [{ captured_at: EM }] }] })
    ).toEqual([new Date(EM)])
  })

  it("nada capturado, nada conta", () => {
    expect(
      capturasDo({ payment_collections: [{ amount: 100, payments: [{ amount: 100 }] }] })
    ).toEqual([])
    expect(capturasDo({})).toEqual([])
  })
})
