import {
  decidir,
  lerRegistro,
  paraCancelamentoDoEmail,
  type PedidoLido,
} from "../avisar-cancelamento"
import { oQueAconteceComODinheiro, porQueCancelou } from "../emails/pedido-cancelado"

/**
 * O E-MAIL QUE NÃO EXISTIA — o #10.
 *
 * Um amigo pagou um Pix, o pedido foi cancelado e estornado, e ele não
 * recebeu uma palavra: viu o dinheiro sair da conta e viu voltar, sem
 * explicação. Os testes daqui guardam a pergunta que o e-mail responde — o
 * dinheiro foi cobrado ou não? — e o motivo de ela ser feita à CAPTURA, e
 * não ao estorno.
 */

const AGORA = new Date("2026-09-22T18:26:00.000Z")
const CEDO = new Date("2026-09-22T15:00:00.000Z")

const pagarme = (estado: Record<string, unknown>) => ({
  provider_id: "pp_pagarme_pagarme",
  data: {
    pagarme: {
      forma: "pix",
      situacao: "aguardando",
      valor: 6258,
      pedido: "or_1",
      cobranca: "ch_1",
      parcelas: 1,
      pix: null,
      cartao: null,
      recusa: null,
      estornado: 0,
      ...estado,
    },
  },
})

/** Um pedido cancelado, como a consulta do `avisar-cancelamento.ts` devolve. */
function pedido(extra: Partial<PedidoLido> = {}): PedidoLido {
  return {
    id: "order_01ABC",
    display_id: 10,
    email: "marcelo@exemplo.com",
    status: "canceled",
    metadata: null,
    total: 62.58,
    items: [
      {
        title: "Shampoo para Barba FuckingBarba 120ml",
        product_title: "Shampoo para Barba FuckingBarba 120ml",
        variant_title: "Único",
        thumbnail: null,
        quantity: 1,
        unit_price: 49.9,
        total: 49.9,
      },
    ],
    payment_collections: [{ payments: [], payment_sessions: [pagarme({})] }],
    ...extra,
  }
}

/** O mesmo pedido, com o Pix pago e capturado pelo Medusa. */
const pago = (extra: Record<string, unknown> = {}) => ({
  payment_collections: [
    {
      payments: [{ amount: 62.58, captured_at: "2026-09-22T15:26:00.000Z" }],
      payment_sessions: [pagarme({ situacao: "pago", ...extra })],
    },
  ],
})

describe("o que o e-mail de cancelamento vai dizer", () => {
  it("pagamento capturado: diz que o valor está voltando — é o #10", () => {
    expect(decidir(pedido(pago()), { agora: AGORA })).toEqual({
      mandar: true,
      motivo: "estornado",
      estorno: { valor: 62.58, forma: "pix" },
    })
  })

  it("a pergunta é feita à CAPTURA, e não ao estorno", () => {
    /*
      O admin cancela e estorna em dois cliques, e o `order.canceled` chega
      entre um e outro. Lendo o estorno, o e-mail sairia dizendo "nada foi
      cobrado" pra quem acabou de ver R$ 62,58 saírem da conta. O pedido
      daqui não tem estorno registrado nenhum — e mesmo assim diz a verdade.
    */
    const d = decidir(pedido(pago()), { agora: AGORA })
    expect(d).toMatchObject({ motivo: "estornado" })
  })

  it("no cartão, o valor e a forma vêm da sessão", () => {
    const noCartao = {
      payment_collections: [
        {
          payments: [{ amount: 129.9, captured_at: "2026-09-22T15:26:00.000Z" }],
          payment_sessions: [pagarme({ forma: "cartao", situacao: "pago", valor: 12990 })],
        },
      ],
    }
    expect(decidir(pedido(noCartao), { agora: AGORA })).toEqual({
      mandar: true,
      motivo: "estornado",
      estorno: { valor: 129.9, forma: "cartao" },
    })
  })

  it("pago no Pagar.me sem o Medusa saber: o subscriber conta, e o valor sai dos centavos de lá", () => {
    // `fecharCobrancasDoPedido` estornou na mão; não há pagamento capturado
    // pra ler aqui, e o e-mail ainda assim precisa avisar do dinheiro.
    expect(decidir(pedido(), { estornouLa: true, agora: AGORA })).toEqual({
      mandar: true,
      motivo: "estornado",
      estorno: { valor: 62.58, forma: "pix" },
    })
  })

  it("cartão reprovado pela antifraude: o valor foi e voltou, e o e-mail não diz que nada foi cobrado", () => {
    /*
      O #9, de verdade: 22/09, R$ 62,58, cobrança ch_JdkpjxImnTx1GDej. A
      Stone autorizou (`0000 — Approved`, autorização 264832), a análise de
      fraude reprovou, e o Pagar.me desfez a captura 4 segundos depois. O
      Medusa nunca registrou pagamento nenhum — nenhum `captured_at`, nenhum
      estorno pedido daqui — mas os R$ 62,58 saíram do cartão e voltaram, e
      quem comprou viu os dois no aplicativo do banco.

      Quem conta é o `estornado` da cobrança, em centavos.
    */
    const reprovado = pedido({
      payment_collections: [
        {
          payments: [],
          payment_sessions: [
            pagarme({
              forma: "cartao",
              situacao: "cancelado",
              cartao: { bandeira: "Mastercard", final: "8187" },
              estornado: 6258,
            }),
          ],
        },
      ],
    })
    expect(decidir(reprovado, { agora: AGORA })).toEqual({
      mandar: true,
      motivo: "estornado",
      estorno: { valor: 62.58, forma: "cartao" },
    })
  })

  it("cobrança sem nada devolvido do lado de lá continua sendo 'nada foi cobrado'", () => {
    // O zero do `estornado` é o caso comum — a recusa na hora, o Pix que
    // nunca foi pago. Só o maior que zero é dinheiro que se mexeu.
    const recusado = pedido({
      payment_collections: [
        {
          payments: [],
          payment_sessions: [pagarme({ forma: "cartao", situacao: "recusado", estornado: 0 })],
        },
      ],
    })
    expect(decidir(recusado, { agora: AGORA })).toMatchObject({
      motivo: "sem-cobranca",
      estorno: null,
    })
  })

  it("Pix que passou da validade tem frase própria", () => {
    const vencido = pedido({
      payment_collections: [
        {
          payments: [],
          payment_sessions: [
            pagarme({ pix: { copiaECola: "00020126…", imagem: "", expiraEm: CEDO.toISOString() } }),
          ],
        },
      ],
    })
    expect(decidir(vencido, { agora: AGORA })).toEqual({
      mandar: true,
      motivo: "pix-vencido",
      estorno: null,
    })
    // Ainda dentro da validade: cancelaram o pedido, o Pix não venceu.
    expect(decidir(vencido, { agora: new Date(CEDO.getTime() - 60_000) })).toMatchObject({
      motivo: "sem-cobranca",
    })
  })

  it("sem data de validade em lugar nenhum, não inventa que o Pix venceu", () => {
    expect(decidir(pedido(), { agora: AGORA })).toEqual({
      mandar: true,
      motivo: "sem-cobranca",
      estorno: null,
    })
  })

  it("pedido sem o Pagar.me (o provisório) avisa igual: cancelaram o pedido de alguém", () => {
    const provisorio = pedido({
      payment_collections: [
        { payments: [], payment_sessions: [{ provider_id: "pp_system_default", data: {} }] },
      ],
    })
    expect(decidir(provisorio, { agora: AGORA })).toMatchObject({
      mandar: true,
      motivo: "sem-cobranca",
    })
  })
})

describe("quando o aviso NÃO sai", () => {
  it("pedido que não está cancelado", () => {
    expect(decidir(pedido({ status: "pending" }), { agora: AGORA })).toEqual({
      mandar: false,
      motivo: "nao-cancelado",
    })
  })

  it("já avisado não avisa de novo — mandado, dispensado ou recusado", () => {
    for (const como of ["email", "dispensado", "recusado"]) {
      const metadata = { emails: { cancelado: { em: AGORA.toISOString(), como } } }
      expect(decidir(pedido({ metadata }), { agora: AGORA })).toEqual({
        mandar: false,
        motivo: "ja-registrado",
      })
    }
  })

  it("o registro da confirmação não é o do cancelamento", () => {
    const metadata = { emails: { confirmado: { em: AGORA.toISOString(), como: "email" } } }
    expect(lerRegistro(metadata)).toBeNull()
    expect(decidir(pedido({ metadata }), { agora: AGORA })).toMatchObject({ mandar: true })
  })

  it("sem e-mail no pedido, não tem pra quem", () => {
    expect(decidir(pedido({ email: "" }), { agora: AGORA })).toEqual({
      mandar: false,
      motivo: "sem-email",
    })
    expect(decidir(pedido({ email: null }), { agora: AGORA })).toEqual({
      mandar: false,
      motivo: "sem-email",
    })
  })
})

describe("o cancelamento no formato do e-mail", () => {
  it("os itens e o total são os do Medusa", () => {
    const d = decidir(pedido(pago()), { agora: AGORA })
    const c = paraCancelamentoDoEmail(pedido(pago()), d)
    expect(c).toMatchObject({
      id: "order_01ABC",
      numero: 10,
      email: "marcelo@exemplo.com",
      total: 62.58,
      motivo: "estornado",
      estorno: { valor: 62.58, forma: "pix" },
    })
    expect(c.itens).toEqual([
      {
        nome: "Shampoo para Barba FuckingBarba 120ml",
        variante: null,
        imagem: null,
        quantidade: 1,
        precoUnitario: 49.9,
        total: 49.9,
      },
    ])
  })
})

describe("as frases", () => {
  it("o porquê é o mesmo da conta, palavra por palavra", () => {
    expect(porQueCancelou("estornado")).toBe("Cancelado, com o pagamento estornado.")
    expect(porQueCancelou("pix-vencido")).toBe("O Pix venceu antes do pagamento.")
    expect(porQueCancelou("sem-cobranca")).toBe("Cancelado antes do pagamento.")
  })

  it("sem cobrança, uma frase resolve tudo", () => {
    const c = paraCancelamentoDoEmail(pedido(), decidir(pedido(), { agora: AGORA }))
    expect(oQueAconteceComODinheiro(c)).toBe(
      "Nada foi cobrado de você — não há nada a pagar nem a receber."
    )
  })

  it("o caminho de volta muda com a forma, e nenhuma promete dia", () => {
    const noPix = paraCancelamentoDoEmail(pedido(pago()), decidir(pedido(pago()), { agora: AGORA }))
    const frase = oQueAconteceComODinheiro(noPix)
    expect(frase).toContain("voltam pra conta que pagou")
    expect(frase).toContain("R$")

    const noCartao = { ...noPix, estorno: { valor: 129.9, forma: "cartao" as const } }
    expect(oQueAconteceComODinheiro(noCartao)).toContain("quem manda no prazo")
  })
})
