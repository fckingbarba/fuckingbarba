import { PaymentSessionStatus } from "@medusajs/framework/utils"
import {
  ErroDoPagarme,
  type ClienteDoPagarme,
  type PedidoPagarme,
} from "../../modules/pagarme/client"
import { traduzir, type Estado } from "../../modules/pagarme/situacao"
import {
  fecharCobranca,
  pedidoPreso,
  venceuOPix,
  type SessaoEncerrada,
} from "../conciliar-pagamentos"

/**
 * O QUE PRENDEU O ESTOQUE DO #7 — e o que ficou no lugar.
 *
 * `DELETE /charges/:id` em Pix pendente responde 412, e Pix VENCIDO continua
 * `pending` lá: o 412 não passa nunca. Os testes daqui guardam as duas
 * decisões que saíram disso — quando o Pix vence (sem perguntar ao Pagar.me
 * se dá pra cancelar) e o que `fecharCobranca` faz com cada cobrança.
 */

const NASCEU = "2026-09-21T15:00:00.000Z"
const minutos = (n: number) => new Date(Date.parse(NASCEU) + n * 60 * 1000)

/** Um pedido de Pix esperando pagamento, como o Pagar.me devolve. */
function pedidoPix(
  { expiraEm, ...extra }: { expiraEm?: string | null } & Record<string, unknown> = {},
  cobranca: Record<string, unknown> = {}
): PedidoPagarme {
  return {
    id: "or_1",
    code: "payses_1",
    amount: 6258,
    status: "pending",
    created_at: NASCEU,
    charges: [
      {
        id: "ch_1",
        amount: 6258,
        status: "pending",
        payment_method: "pix",
        last_transaction: {
          status: "waiting_payment",
          qr_code: "00020126…",
          qr_code_url: "https://api.pagar.me/qr.png",
          ...(expiraEm ? { expires_at: expiraEm } : {}),
        },
        ...cobranca,
      },
    ],
    ...extra,
  } as unknown as PedidoPagarme
}

/** Um cartão em análise: esse o Pagar.me cancela. */
const pedidoCartao = (cobranca: Record<string, unknown> = {}): PedidoPagarme =>
  ({
    id: "or_2",
    code: "payses_2",
    amount: 6258,
    status: "pending",
    created_at: NASCEU,
    charges: [
      {
        id: "ch_2",
        amount: 6258,
        status: "pending",
        payment_method: "credit_card",
        last_transaction: {
          status: "waiting_capture",
          installments: 1,
          card: { brand: "visa", last_four_digits: "4444" },
        },
        ...cobranca,
      },
    ],
  }) as unknown as PedidoPagarme

/** O estado que ficou gravado na sessão quando o QR nasceu. */
const gravado = (expiraEm: string): Estado => ({
  forma: "pix",
  situacao: "aguardando",
  valor: 6258,
  pedido: "or_1",
  cobranca: "ch_1",
  parcelas: 1,
  pix: { copiaECola: "00020126…", imagem: "", expiraEm },
  cartao: null,
  recusa: null,
  estornado: 0,
})

describe("quando o Pix vence", () => {
  const venceu = (
    pedido: PedidoPagarme,
    naSessao: Estado | null,
    agora: Date,
    forma: "pix" | "cartao" = "pix"
  ) => venceuOPix(traduzir(pedido, forma).estado, naSessao, pedido, agora)

  it("manda o `expires_at` que o Pagar.me acabou de dizer, com 10 minutos de folga", () => {
    const p = pedidoPix({ expiraEm: minutos(30).toISOString() })
    expect(venceu(p, null, minutos(35))).toBe(false)
    expect(venceu(p, null, minutos(40))).toBe(false)
    expect(venceu(p, null, minutos(41))).toBe(true)
  })

  it("sem data na leitura, vale a gravada na sessão — e é `||`, não `??`", () => {
    /*
      `traduzir` põe STRING VAZIA no `expiraEm` quando o Pagar.me não manda a
      data. Com `??`, a vazia passaria por cima da gravada e a conta cairia no
      `created_at` + 30 minutos — cancelando, aos 60 minutos, um QR de 2 horas
      que ainda pode virar venda. É exatamente o que este teste não deixa.
    */
    const p = pedidoPix()
    expect(traduzir(p, "pix").estado.pix?.expiraEm).toBe("")
    expect(venceu(p, gravado(minutos(120).toISOString()), minutos(60))).toBe(false)
    expect(venceu(p, gravado(minutos(120).toISOString()), minutos(131))).toBe(true)
  })

  it("sem data em lugar nenhum, o `created_at` de lá + a validade que a loja pede", () => {
    const p = pedidoPix()
    expect(venceu(p, gravado(""), minutos(39))).toBe(false)
    expect(venceu(p, null, minutos(41))).toBe(true)
  })

  it("a validade da loja é a mesma do provedor; menos de 5 minutos não conta", () => {
    const p = pedidoPix()
    const original = process.env.PAGARME_PIX_MINUTOS
    try {
      process.env.PAGARME_PIX_MINUTOS = "120"
      expect(venceu(p, null, minutos(41))).toBe(false)
      expect(venceu(p, null, minutos(131))).toBe(true)
      for (const bobagem of ["2", "meia hora", "30.5", ""]) {
        process.env.PAGARME_PIX_MINUTOS = bobagem
        expect(venceu(p, null, minutos(41))).toBe(true)
      }
    } finally {
      if (original === undefined) delete process.env.PAGARME_PIX_MINUTOS
      else process.env.PAGARME_PIX_MINUTOS = original
    }
  })

  it("sem nenhuma das três, o Pix NÃO vence — melhor o estoque preso que a venda cancelada", () => {
    const p = pedidoPix({ created_at: undefined })
    expect(venceu(p, null, minutos(60 * 24 * 30))).toBe(false)
  })
})

describe("fechar a cobrança de um pedido que não vira mais venda", () => {
  const clienteQue = (cancelar: jest.Mock) =>
    ({ cancelarCobranca: cancelar }) as unknown as ClienteDoPagarme

  const fechar = (
    pedido: PedidoPagarme,
    {
      forma = "pix",
      naSessao = null,
      agora = minutos(5),
      cancelar = jest.fn().mockResolvedValue({}),
    }: {
      forma?: "pix" | "cartao"
      naSessao?: Estado | null
      agora?: Date
      cancelar?: jest.Mock
    } = {}
  ) =>
    fecharCobranca(clienteQue(cancelar), pedido, traduzir(pedido, forma), agora, naSessao).then(
      (r) => ({ ...r, cancelar })
    )

  it("Pix esperando: NINGUÉM pede DELETE — vigia até vencer", async () => {
    const p = pedidoPix({ expiraEm: minutos(30).toISOString() })
    const r = await fechar(p)
    expect(r).toMatchObject({ feito: "vigiando", situacao: "aguardando" })
    expect(r.cancelar).not.toHaveBeenCalled()
  })

  it("Pix vencido: também não pede DELETE (lá é 412 pra sempre) — só não há mais o que fechar", async () => {
    const p = pedidoPix({ expiraEm: minutos(30).toISOString() })
    const r = await fechar(p, { agora: minutos(41) })
    expect(r).toMatchObject({ feito: "nada", situacao: "cancelado" })
    expect(r.cancelar).not.toHaveBeenCalled()
  })

  it("cartão em análise: esse o DELETE cancela", async () => {
    const r = await fechar(pedidoCartao(), { forma: "cartao" })
    expect(r).toMatchObject({ feito: "cancelou", situacao: "cancelado" })
    expect(r.cancelar).toHaveBeenCalledWith("ch_2")
  })

  it("cartão, e o Pagar.me responde 412: é 'ainda não', e vira vigiado", async () => {
    const cancelar = jest
      .fn()
      .mockRejectedValue(new ErroDoPagarme("não dá agora", "validacao", 412))
    const r = await fechar(pedidoCartao(), { forma: "cartao", cancelar })
    expect(r).toMatchObject({ feito: "vigiando", situacao: "analise" })
  })

  it("cartão, e o Pagar.me responde outra coisa: o erro sobe", async () => {
    const cancelar = jest.fn().mockRejectedValue(new ErroDoPagarme("caiu", "servidor", 500))
    await expect(fechar(pedidoCartao(), { forma: "cartao", cancelar })).rejects.toThrow("caiu")
  })

  it("cobrança paga: estorna só o que ainda não voltou", async () => {
    const p = pedidoPix({}, { status: "paid", paid_amount: 6258, refunded_amount: 1000 })
    const r = await fechar(p)
    expect(r).toMatchObject({ feito: "estornou", situacao: "estornado" })
    expect(r.cancelar).toHaveBeenCalledWith("ch_1", 5258)
  })

  it("com estorno andando, não pede outro por cima — dinheiro devolvido duas vezes", async () => {
    const p = pedidoPix({}, { status: "paid", paid_amount: 6258, pending_cancellation: true })
    const r = await fechar(p)
    expect(r).toMatchObject({ feito: "vigiando", situacao: "pago" })
    expect(r.cancelar).not.toHaveBeenCalled()
  })

  it("já voltou tudo, ou não há cobrança nenhuma: nada", async () => {
    const tudo = pedidoPix({}, { status: "paid", paid_amount: 6258, refunded_amount: 6258 })
    const r = await fechar(tudo)
    expect(r).toMatchObject({ feito: "nada", situacao: "estornado" })
    expect(r.cancelar).not.toHaveBeenCalled()

    const vazio = await fechar(pedidoPix({ charges: [] }))
    expect(vazio.feito).toBe("nada")
    expect(vazio.cancelar).not.toHaveBeenCalled()
  })

  it("o Pix que falhou lá já está fechado: nada a pedir", async () => {
    const p = pedidoPix({ status: "failed" })
    const lido = traduzir(p, "pix")
    expect(lido.status).toBe(PaymentSessionStatus.ERROR)
    const r = await fechar(p)
    expect(r).toMatchObject({ feito: "nada", situacao: "falhou" })
    expect(r.cancelar).not.toHaveBeenCalled()
  })
})

describe("o pedido preso num pagamento que já acabou", () => {
  /*
    O "Check status" do admin num cartão reprovado grava a sessão como erro na
    hora, e a rodada de pendentes nunca mais passava por ela: o pedido ficava
    "aguardando" pra sempre, com o estoque reservado (24/09).
  */
  const encerrada = ({
    status = PaymentSessionStatus.ERROR as string,
    pedido = { id: "order_1", status: "pending", display_id: 12 } as {
      id: string
      status: string
      display_id: number
    } | null,
    outras = [] as { id: string; status: string }[],
    pagamentos = [] as { id: string; canceled_at?: string | null }[],
  } = {}): SessaoEncerrada => ({
    id: "payses_1",
    amount: 62.58,
    currency_code: "brl",
    status,
    data: null,
    created_at: NASCEU,
    payment_collection: {
      id: "pay_col_1",
      order: pedido,
      payment_sessions: [{ id: "payses_1", status }, ...outras],
      payments: pagamentos,
    },
  })

  it("pedido aberto, sessão recusada ou cancelada, e nada mais na coleção: preso", () => {
    expect(pedidoPreso(encerrada())).toBe(true)
    expect(pedidoPreso(encerrada({ status: PaymentSessionStatus.CANCELED }))).toBe(true)
  })

  it("pedido já cancelado ou concluído não é com esta rodada", () => {
    expect(
      pedidoPreso(encerrada({ pedido: { id: "order_1", status: "canceled", display_id: 12 } }))
    ).toBe(false)
    expect(
      pedidoPreso(encerrada({ pedido: { id: "order_1", status: "completed", display_id: 12 } }))
    ).toBe(false)
  })

  it("outra sessão ainda viva na mesma coleção: o pedido ainda pode ser pago", () => {
    for (const status of [
      PaymentSessionStatus.PENDING,
      PaymentSessionStatus.PENDING_AUTHORIZATION,
      PaymentSessionStatus.AUTHORIZED,
      PaymentSessionStatus.CAPTURED,
    ]) {
      expect(pedidoPreso(encerrada({ outras: [{ id: "payses_2", status }] }))).toBe(false)
    }
  })

  it("pagamento registrado de pé: o pedido pagou; o pagamento cancelado não conta", () => {
    expect(pedidoPreso(encerrada({ pagamentos: [{ id: "pay_1", canceled_at: null }] }))).toBe(false)
    expect(
      pedidoPreso(encerrada({ pagamentos: [{ id: "pay_1", canceled_at: "2026-09-24T12:00:00Z" }] }))
    ).toBe(true)
  })

  it("sessão sem pedido — a recusa do checkout, a incerta — não tem pedido pra soltar", () => {
    expect(pedidoPreso(encerrada({ pedido: null }))).toBe(false)
  })

  it("sessão ainda pendente não é encerrada", () => {
    expect(pedidoPreso(encerrada({ status: PaymentSessionStatus.PENDING_AUTHORIZATION }))).toBe(
      false
    )
  })
})
