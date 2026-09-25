import {
  contasDoPedido,
  decidirDevolucao,
  lerRegistroDaDevolucao,
  paraDevolucaoDoEmail,
  type PedidoDevolvido,
} from "../avisar-devolucao"

/**
 * O PIX PAGO DEPOIS DO CANCELAMENTO.
 *
 * O admin cancela um pedido com o Pix esperando, e o e-mail sai: "Nada foi
 * cobrado de você". O QR continua pagável (o Pagar.me não cancela Pix
 * pendente), a pessoa paga, e a conciliação devolve. Até 25/09, calada. Os
 * testes daqui guardam QUEM recebe o segundo e-mail — só quem ouviu que nada
 * tinha sido cobrado — e QUANDO: com a devolução já pedida.
 */

const EM = "2026-09-25T12:00:00.000Z"

const aviso = (porque: string, como = "email") => ({
  emails: { cancelado: { em: EM, como, porque } },
})

const sessaoDoPagarme = (forma: "pix" | "cartao" = "pix") => ({
  provider_id: "pp_pagarme_pagarme",
  data: {
    pagarme: {
      forma,
      situacao: "pago",
      valor: 6258,
      pedido: "or_1",
      cobranca: "ch_1",
      parcelas: 1,
      pix: null,
      cartao: null,
      recusa: null,
      estornado: 0,
    },
  },
})

/** O Pix de R$ 62,58 que entrou depois do cancelamento, com o estorno do Medusa. */
const pagoEDevolvido = (devolvido: number[] = [62.58], forma: "pix" | "cartao" = "pix") => ({
  payment_collections: [
    {
      payments: [
        {
          provider_id: "pp_pagarme_pagarme",
          amount: 62.58,
          captured_at: "2026-09-25T12:10:00.000Z",
          refunds: devolvido.map((amount) => ({ amount })),
        },
      ],
      payment_sessions: [sessaoDoPagarme(forma)],
    },
  ],
})

/** Um pedido cancelado, como a consulta do `avisar-devolucao.ts` devolve. */
function pedido(extra: Partial<PedidoDevolvido> = {}): PedidoDevolvido {
  return {
    id: "order_01DEV",
    display_id: 12,
    email: "joana@exemplo.com",
    status: "canceled",
    metadata: aviso("sem-cobranca"),
    total: 62.58,
    credit_line_total: 0,
    items: [
      {
        title: "Balm para Barba",
        product_title: "Balm para Barba FuckingBarba 60g",
        variant_title: "Único",
        thumbnail: null,
        quantity: 1,
        unit_price: 49.9,
        total: 49.9,
      },
    ],
    ...pagoEDevolvido(),
    ...extra,
  }
}

describe("quem recebe o e-mail do pagamento devolvido", () => {
  it("quem ouviu 'nada foi cobrado' e pagou depois — com o valor e a forma", () => {
    expect(decidirDevolucao(pedido())).toEqual({
      mandar: true,
      devolvido: { valor: 62.58, forma: "pix" },
    })
  })

  it("quem ouviu 'o Pix venceu' e pagou assim mesmo, também", () => {
    expect(decidirDevolucao(pedido({ metadata: aviso("pix-vencido") }))).toMatchObject({
      mandar: true,
    })
  })

  it("quem já ouviu 'cancelado e estornado' não recebe a mesma devolução duas vezes", () => {
    expect(decidirDevolucao(pedido({ metadata: aviso("estornado") }))).toEqual({
      mandar: false,
      motivo: "aviso-ja-falou-do-dinheiro",
    })
  })

  it("sem o aviso de cancelamento ainda, espera — o de cancelamento vai falar do dinheiro", () => {
    // O aviso de cancelamento lê a captura: se sair agora, sai "estornado".
    expect(decidirDevolucao(pedido({ metadata: null }))).toEqual({
      mandar: false,
      motivo: "cancelamento-sem-aviso",
    })
  })

  it("aviso de cancelamento recusado pelo Resend ou dispensado: este também não tem pra onde ir", () => {
    for (const como of ["recusado", "dispensado"]) {
      expect(decidirDevolucao(pedido({ metadata: aviso("sem-cobranca", como) }))).toEqual({
        mandar: false,
        motivo: "cancelamento-sem-aviso",
      })
    }
  })

  it("a confirmação no metadata não é o aviso de cancelamento", () => {
    const metadata = { emails: { confirmado: { em: EM, como: "email" } } }
    expect(decidirDevolucao(pedido({ metadata }))).toMatchObject({
      motivo: "cancelamento-sem-aviso",
    })
  })
})

describe("quando ele sai: com a devolução pedida", () => {
  it("pago e ainda não devolvido: espera o estorno — o e-mail diz 'devolvemos'", () => {
    expect(decidirDevolucao(pedido(pagoEDevolvido([])))).toEqual({
      mandar: false,
      motivo: "devolucao-andando",
    })
  })

  it("devolvido pela metade também espera", () => {
    expect(decidirDevolucao(pedido(pagoEDevolvido([30])))).toMatchObject({
      motivo: "devolucao-andando",
    })
  })

  it("estorno em duas partes soma, sem a vírgula flutuante no caminho", () => {
    // Somando em reais, R$ 14,52 + R$ 35,55 dá 50,069999… — "menos" que os
    // R$ 50,07 capturados, e o e-mail nunca sairia.
    expect(14.52 + 35.55).toBeLessThan(50.07)
    const emDuasPartes = {
      payment_collections: [
        {
          payments: [
            {
              provider_id: "pp_pagarme_pagarme",
              amount: 50.07,
              captured_at: "2026-09-25T12:10:00.000Z",
              refunds: [{ amount: 14.52 }, { amount: 35.55 }],
            },
          ],
          payment_sessions: [sessaoDoPagarme()],
        },
      ],
    }
    expect(contasDoPedido(pedido(emDuasPartes))).toEqual({ capturado: 5007, devolvido: 5007 })
    expect(decidirDevolucao(pedido(emDuasPartes))).toEqual({
      mandar: true,
      devolvido: { valor: 50.07, forma: "pix" },
    })
  })

  it("nada capturado: não houve pagamento depois", () => {
    const semPagamento = {
      payment_collections: [{ payments: [], payment_sessions: [sessaoDoPagarme()] }],
    }
    expect(decidirDevolucao(pedido(semPagamento))).toEqual({
      mandar: false,
      motivo: "nada-pago",
    })
  })

  it("pagamento de outro provedor não conta — o que volta sozinho é o do Pagar.me", () => {
    const deOutro = {
      payment_collections: [
        {
          payments: [
            {
              provider_id: "pp_system_default",
              amount: 62.58,
              captured_at: "2026-09-25T12:10:00.000Z",
              refunds: [{ amount: 62.58 }],
            },
          ],
          payment_sessions: [],
        },
      ],
    }
    expect(decidirDevolucao(pedido(deOutro))).toMatchObject({ motivo: "nada-pago" })
  })

  it("no cartão, a forma vem da sessão", () => {
    expect(decidirDevolucao(pedido(pagoEDevolvido([62.58], "cartao")))).toEqual({
      mandar: true,
      devolvido: { valor: 62.58, forma: "cartao" },
    })
  })
})

describe("quando o aviso NÃO sai", () => {
  it("já avisado não avisa de novo — mandado ou recusado", () => {
    for (const como of ["email", "recusado"]) {
      const metadata = {
        ...aviso("sem-cobranca"),
        emails: { ...aviso("sem-cobranca").emails, devolvido: { em: EM, como } },
      }
      expect(lerRegistroDaDevolucao(metadata)).toMatchObject({ como })
      expect(decidirDevolucao(pedido({ metadata }))).toEqual({
        mandar: false,
        motivo: "ja-registrado",
      })
    }
  })

  it("o registro do cancelamento não é o da devolução", () => {
    expect(lerRegistroDaDevolucao(aviso("sem-cobranca"))).toBeNull()
  })

  it("pedido que não está cancelado", () => {
    expect(decidirDevolucao(pedido({ status: "completed" }))).toEqual({
      mandar: false,
      motivo: "nao-cancelado",
    })
  })

  it("sem e-mail no pedido, não tem pra quem", () => {
    expect(decidirDevolucao(pedido({ email: null }))).toEqual({
      mandar: false,
      motivo: "sem-email",
    })
  })
})

describe("a devolução no formato do e-mail", () => {
  it("os itens e o total do pedido, com o valor que voltou", () => {
    expect(paraDevolucaoDoEmail(pedido(), { valor: 62.58, forma: "pix" })).toEqual({
      id: "order_01DEV",
      numero: 12,
      email: "joana@exemplo.com",
      itens: [
        {
          nome: "Balm para Barba FuckingBarba 60g",
          variante: null,
          imagem: null,
          quantidade: 1,
          precoUnitario: 49.9,
          total: 49.9,
        },
      ],
      total: 62.58,
      devolvido: { valor: 62.58, forma: "pix" },
    })
  })

  it("o total é o que o pedido custou, mesmo com a devolução virando crédito", () => {
    const comCredito = pedido({ total: 0, credit_line_total: 62.58 })
    expect(paraDevolucaoDoEmail(comCredito, { valor: 62.58, forma: "pix" }).total).toBe(62.58)
  })
})
