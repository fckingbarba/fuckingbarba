import { PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils"
import type { PedidoPagarme } from "../client"
import { montarPedido, type EntradaDaLoja } from "../pedido"
import PagarmeServico from "../service"
import {
  estadoNovo,
  gravar,
  podeCobrar,
  RECUSAS,
  reservaPraDesfazer,
  SEM_ANALISE_COBRA_DEPOIS_MS,
  traduzir,
} from "../situacao"

/**
 * O CARTÃO SÓ É COBRADO DEPOIS DA ANÁLISE DE FRAUDE.
 *
 * Em 22/09, três compras de verdade no cartão foram aprovadas pelo banco e
 * reprovadas pela análise segundos depois. Com `auth_and_capture`, cada uma
 * foi cobrada e devolvida: o valor apareceu e sumiu da fatura de quem
 * comprou. Agora o pedido nasce no Pagar.me só AUTORIZADO (`auth_only`), e a
 * cobrança (`POST /charges/:id/capture`) vem quando a análise aprova. Os
 * testes daqui guardam essa ordem — e o que acontece com a reserva quando a
 * análise reprova.
 */

const NASCEU = "2026-09-23T15:00:00.000Z"
const depoisDe = (ms: number) => new Date(Date.parse(NASCEU) + ms)
const CODIGO = "payses_01TESTE"

/** Um pedido de cartão como o Pagar.me devolve: autorizado, e a análise dizendo `analise`. */
function cartao({
  analise,
  cobranca = "pending",
  transacao = "authorized_pending_capture",
  pedido = "pending",
  pago = 0,
  cancelado = 0,
  estornado = 0,
}: {
  analise?: string
  cobranca?: string
  transacao?: string
  pedido?: string
  pago?: number
  cancelado?: number
  estornado?: number
} = {}): PedidoPagarme {
  return {
    id: "or_1",
    code: CODIGO,
    amount: 6258,
    status: pedido,
    created_at: NASCEU,
    charges: [
      {
        id: "ch_1",
        amount: 6258,
        status: cobranca,
        payment_method: "credit_card",
        created_at: NASCEU,
        paid_amount: pago,
        canceled_amount: cancelado,
        refunded_amount: estornado,
        last_transaction: {
          status: transacao,
          operation_type: "auth_only",
          installments: 1,
          card: { brand: "Visa", last_four_digits: "0010" },
          ...(analise ? { antifraud_response: { status: analise } } : {}),
        },
      },
    ],
  }
}

/** O mesmo cartão, já cobrado. */
const cobrado = () =>
  cartao({
    analise: "approved",
    cobranca: "paid",
    transacao: "captured",
    pedido: "paid",
    pago: 6258,
  })

/* ── quando dá pra cobrar ─────────────────────────────────────────────────── */

describe("podeCobrar", () => {
  it("autorizado e aprovado na análise: cobra a cobrança inteira", () => {
    expect(podeCobrar(cartao({ analise: "approved" }), depoisDe(1000))).toEqual({
      cobrar: true,
      cobranca: "ch_1",
      valor: 6258,
      porque: "aprovada",
    })
  })

  it("a análise pensando, reprovando ou com uma pessoa olhando: não cobra", () => {
    expect(podeCobrar(cartao({ analise: "pending" }))).toEqual({
      cobrar: false,
      porque: "pendente",
    })
    expect(podeCobrar(cartao({ analise: "reproved" }))).toEqual({
      cobrar: false,
      porque: "reprovada",
    })
    expect(podeCobrar(cartao({ analise: "manual" }))).toEqual({ cobrar: false, porque: "manual" })
  })

  it("sem resposta nenhuma da análise, espera 10 minutos antes de cobrar assim mesmo", () => {
    const calado = cartao()
    expect(podeCobrar(calado, depoisDe(SEM_ANALISE_COBRA_DEPOIS_MS - 1000))).toEqual({
      cobrar: false,
      porque: "sem-resposta",
    })
    expect(podeCobrar(calado, depoisDe(SEM_ANALISE_COBRA_DEPOIS_MS))).toEqual({
      cobrar: true,
      cobranca: "ch_1",
      valor: 6258,
      porque: "sem-analise",
    })
  })

  it("o que já foi cobrado, desfeito ou recusado pelo banco não se cobra de novo", () => {
    expect(podeCobrar(cobrado())).toEqual({ cobrar: false, porque: "nao-autorizada" })
    expect(
      podeCobrar(cartao({ analise: "approved", cobranca: "canceled", transacao: "voided" }))
    ).toEqual({ cobrar: false, porque: "nao-autorizada" })
    expect(podeCobrar(cartao({ cobranca: "failed", transacao: "not_authorized" }))).toEqual({
      cobrar: false,
      porque: "nao-autorizada",
    })
  })

  it("Pix não é cobrado por aqui", () => {
    const pix = { ...cartao(), charges: [{ ...cartao().charges![0], payment_method: "pix" }] }
    expect(podeCobrar(pix)).toEqual({ cobrar: false, porque: "nao-e-cartao" })
  })
})

describe("reservaPraDesfazer", () => {
  it("reprovada e ainda autorizada: é a reserva que prende o limite de quem tentou", () => {
    expect(reservaPraDesfazer(cartao({ analise: "reproved" }))).toBe("ch_1")
  })

  it("já desfeita, ou aprovada: nada a desfazer", () => {
    expect(
      reservaPraDesfazer(cartao({ analise: "reproved", cobranca: "failed", transacao: "voided" }))
    ).toBeNull()
    expect(reservaPraDesfazer(cartao({ analise: "approved" }))).toBeNull()
  })
})

/* ── a tradução ───────────────────────────────────────────────────────────── */

describe("traduzir, com o cartão só autorizado", () => {
  it("autorizado, aprovado ou não, ainda é análise: o Medusa só vê pago depois da cobrança", () => {
    for (const analise of ["pending", "approved", "manual", undefined]) {
      const t = traduzir(cartao({ analise }), "cartao")
      expect(t.status).toBe(PaymentSessionStatus.PENDING_AUTHORIZATION)
      expect(t.estado.situacao).toBe("analise")
    }
    expect(traduzir(cobrado(), "cartao").status).toBe(PaymentSessionStatus.CAPTURED)
  })

  it("reprovada na análise é recusa, com a frase de antifraude — cancelada ou ainda pendente", () => {
    for (const cobranca of ["pending", "canceled", "failed"]) {
      const t = traduzir(cartao({ analise: "reproved", cobranca }), "cartao")
      expect(t.status).toBe(PaymentSessionStatus.ERROR)
      expect(t.estado.situacao).toBe("recusado")
      expect(t.estado.recusa).toBe(RECUSAS.antifraude)
    }
  })

  it("a reserva desfeita não é estorno: nada voltou porque nada saiu", () => {
    /*
      O `canceled_amount` de uma autorização desfeita é o valor inteiro — e
      virava "estornado", e o e-mail de cancelamento diria "o valor está
      voltando pro cartão" pra quem nunca foi cobrado.
    */
    const desfeita = cartao({
      analise: "reproved",
      cobranca: "canceled",
      transacao: "voided",
      cancelado: 6258,
    })
    expect(traduzir(desfeita, "cartao").estado.estornado).toBe(0)
  })

  it("o cartão cobrado e devolvido continua contando o que voltou", () => {
    const devolvido = cartao({
      analise: "approved",
      cobranca: "refunded",
      transacao: "refunded",
      pedido: "paid",
      pago: 6258,
      estornado: 6258,
    })
    expect(traduzir(devolvido, "cartao").estado.estornado).toBe(6258)
  })
})

describe("montarPedido", () => {
  it("o cartão vai só pra autorizar", () => {
    const corpo = montarPedido(entrada(), 6258, CODIGO, 30, "origem")
    const pagamento = corpo.payments[0]
    expect(pagamento.payment_method).toBe("credit_card")
    expect(pagamento.payment_method === "credit_card" && pagamento.credit_card.operation_type).toBe(
      "auth_only"
    )
  })
})

/* ── o provedor ───────────────────────────────────────────────────────────── */

function entrada(): EntradaDaLoja {
  return {
    forma: "cartao",
    parcelas: 1,
    token: "token_abcdef123456",
    comprador: {
      nome: "Rafael Souza",
      email: "rafael@exemplo.com",
      documento: "11144477735",
      tipoDocumento: "cpf",
      telefone: "+5547999998888",
    },
    endereco: {
      rua: "Rua das Palmeiras",
      numero: "10",
      complemento: "",
      bairro: "Centro",
      cidade: "Blumenau",
      uf: "SC",
      cep: "89036370",
    },
    itens: [{ codigo: "FBOL01", descricao: "Óleo para barba", quantidade: 1, total: 62.58 }],
    frete: { total: 0, descricao: "Entrega econômica" },
    ip: null,
  }
}

type Cliente = {
  buscarPorCodigo: jest.Mock
  criarPedido: jest.Mock
  lerPedido: jest.Mock
  capturarCobranca: jest.Mock
  cancelarCobranca: jest.Mock
}

function montar({ leituras = [] as PedidoPagarme[], criado = cartao() } = {}) {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
  const servico = new PagarmeServico(
    { logger },
    { chaveSecreta: "sk_test_x", segredoDoWebhook: "segredo" }
  )
  const fila = [...leituras]
  const cliente: Cliente = {
    buscarPorCodigo: jest.fn(async () => null),
    criarPedido: jest.fn(async () => criado),
    // Cada releitura tira o próximo da fila; acabada a fila, repete o último.
    lerPedido: jest.fn(async () => (fila.length > 1 ? fila.shift() : fila[0]) ?? criado),
    capturarCobranca: jest.fn(async () => ({})),
    cancelarCobranca: jest.fn(async () => ({})),
  }
  ;(servico as unknown as { cliente: Cliente }).cliente = cliente
  return { servico, cliente, logger }
}

/** A sessão que a loja abriu, como o Medusa passa pro `authorizePayment`. */
const sessaoNova = () => gravar(estadoNovo("cartao", 6258, 1), entrada())

async function autorizar(servico: PagarmeServico, data = sessaoNova()) {
  const promessa = servico.authorizePayment({ data, context: { idempotency_key: CODIGO } })
  await jest.advanceTimersByTimeAsync(20_000)
  return promessa
}

describe("authorizePayment, no checkout", () => {
  beforeEach(() => jest.useFakeTimers({ now: depoisDe(2000) }))
  afterEach(() => jest.useRealTimers())

  it("a análise aprova na hora: cobra a cobrança inteira, e o pedido nasce pago", async () => {
    const { servico, cliente } = montar({
      criado: cartao({ analise: "approved" }),
      leituras: [cobrado()],
    })
    const r = await autorizar(servico)
    expect(cliente.criarPedido.mock.calls[0][0].payments[0].credit_card.operation_type).toBe(
      "auth_only"
    )
    expect(cliente.capturarCobranca).toHaveBeenCalledTimes(1)
    expect(cliente.capturarCobranca).toHaveBeenCalledWith("ch_1", 6258)
    expect(r.status).toBe(PaymentSessionStatus.CAPTURED)
  })

  it("a análise responde enquanto o checkout espera: cobra, e nasce pago", async () => {
    const { servico, cliente } = montar({
      criado: cartao({ analise: "pending" }),
      leituras: [cartao({ analise: "pending" }), cartao({ analise: "approved" }), cobrado()],
    })
    const r = await autorizar(servico)
    expect(cliente.capturarCobranca).toHaveBeenCalledTimes(1)
    expect(r.status).toBe(PaymentSessionStatus.CAPTURED)
  })

  it("a análise não responde a tempo: o pedido nasce em análise, e NADA é cobrado", async () => {
    const { servico, cliente } = montar({ criado: cartao({ analise: "pending" }) })
    const r = await autorizar(servico)
    expect(cliente.capturarCobranca).not.toHaveBeenCalled()
    expect(r.status).toBe(PaymentSessionStatus.PENDING_AUTHORIZATION)
    expect((r.data as { pagarme: { situacao: string } }).pagarme.situacao).toBe("analise")
  })

  it("uma pessoa vai analisar: não fica esperando, e não cobra", async () => {
    const { servico, cliente } = montar({ criado: cartao({ analise: "manual" }) })
    const r = await autorizar(servico)
    expect(cliente.lerPedido).not.toHaveBeenCalled()
    expect(cliente.capturarCobranca).not.toHaveBeenCalled()
    expect(r.status).toBe(PaymentSessionStatus.PENDING_AUTHORIZATION)
  })

  it("a análise reprova enquanto o checkout espera: recusa, desfaz a reserva e não cobra", async () => {
    const { servico, cliente } = montar({
      criado: cartao({ analise: "pending" }),
      leituras: [cartao({ analise: "reproved" })],
    })
    const r = await autorizar(servico)
    expect(cliente.capturarCobranca).not.toHaveBeenCalled()
    expect(cliente.cancelarCobranca).toHaveBeenCalledWith("ch_1")
    expect(r.status).toBe(PaymentSessionStatus.ERROR)
    expect((r.data as { pagarme: { recusa: string } }).pagarme.recusa).toBe(RECUSAS.antifraude)
  })

  it("a cobrança não responde, mas saiu: a releitura diz pago", async () => {
    const { servico, cliente } = montar({
      criado: cartao({ analise: "approved" }),
      leituras: [cobrado()],
    })
    cliente.capturarCobranca.mockRejectedValueOnce(new Error("o Pagar.me não respondeu em 30s"))
    const r = await autorizar(servico)
    expect(r.status).toBe(PaymentSessionStatus.CAPTURED)
  })

  it("a cobrança falhou de verdade: o pedido nasce em análise, e a conciliação cobra depois", async () => {
    const { servico, cliente } = montar({
      criado: cartao({ analise: "approved" }),
      leituras: [cartao({ analise: "approved" })],
    })
    cliente.capturarCobranca.mockRejectedValueOnce(new Error("o Pagar.me respondeu 500"))
    const r = await autorizar(servico)
    expect(r.status).toBe(PaymentSessionStatus.PENDING_AUTHORIZATION)
  })
})

describe("authorizePayment, com o pedido já no Pagar.me", () => {
  beforeEach(() => jest.useFakeTimers({ now: depoisDe(60_000) }))
  afterEach(() => jest.useRealTimers())

  const emAnalise = () =>
    gravar({
      ...estadoNovo("cartao", 6258, 1),
      situacao: "analise",
      pedido: "or_1",
      cobranca: "ch_1",
    })

  it("o aviso ou a conciliação chegam com a análise aprovada: é aqui que o cartão é cobrado", async () => {
    const { servico, cliente } = montar({ leituras: [cobrado()] })
    cliente.buscarPorCodigo.mockResolvedValue(cartao({ analise: "approved" }))
    const r = await autorizar(servico, emAnalise())
    expect(cliente.criarPedido).not.toHaveBeenCalled()
    expect(cliente.capturarCobranca).toHaveBeenCalledWith("ch_1", 6258)
    expect(r.status).toBe(PaymentSessionStatus.CAPTURED)
  })

  it("a resposta da criação se perdeu no checkout: acha pelo código, cobra, e não cria outro", async () => {
    const { servico, cliente } = montar({ leituras: [cobrado()] })
    cliente.buscarPorCodigo.mockResolvedValue(cartao({ analise: "approved" }))
    const r = await autorizar(servico)
    expect(cliente.criarPedido).not.toHaveBeenCalled()
    expect(cliente.capturarCobranca).toHaveBeenCalledTimes(1)
    expect(r.status).toBe(PaymentSessionStatus.CAPTURED)
  })

  it("sessão que já terminou (a criação incerta) não é cobrada, nem aprovada: a conciliação desfaz", async () => {
    const { servico, cliente } = montar()
    cliente.buscarPorCodigo.mockResolvedValue(cartao({ analise: "approved" }))
    const incerta = gravar({ ...estadoNovo("cartao", 6258, 1), situacao: "incerto" })
    const r = await autorizar(servico, incerta)
    expect(cliente.capturarCobranca).not.toHaveBeenCalled()
    expect(r.status).toBe(PaymentSessionStatus.ERROR)
  })
})

describe('authorizePayment, com o pedido já cancelado aqui ("cancelando")', () => {
  beforeEach(() => jest.useFakeTimers({ now: depoisDe(60_000) }))
  afterEach(() => jest.useRealTimers())

  /*
    O pedido foi cancelado e o DELETE da reserva não passou na hora (412, rede):
    a sessão ficou pendente, marcada. Até 24/09 a aprovação da análise que
    chegasse depois — o aviso, ou o "Check status" do admin — COBRAVA o cartão.
  */
  const cancelando = () =>
    gravar({
      ...estadoNovo("cartao", 6258, 1),
      situacao: "cancelando",
      pedido: "or_1",
      cobranca: "ch_1",
    })

  it("a análise aprova com a reserva de pé: desfaz a reserva e NÃO cobra", async () => {
    const { servico, cliente } = montar()
    cliente.buscarPorCodigo.mockResolvedValue(cartao({ analise: "approved" }))
    const r = await autorizar(servico, cancelando())
    expect(cliente.capturarCobranca).not.toHaveBeenCalled()
    expect(cliente.cancelarCobranca).toHaveBeenCalledWith("ch_1")
    expect(r.status).toBe(PaymentSessionStatus.CANCELED)
    expect((r.data as { pagarme: { situacao: string } }).pagarme.situacao).toBe("cancelado")
  })

  it("o Pagar.me ainda não deixa desfazer: estoura, sem cobrar — a conciliação tenta de novo", async () => {
    const { servico, cliente } = montar()
    cliente.buscarPorCodigo.mockResolvedValue(cartao({ analise: "approved" }))
    cliente.cancelarCobranca.mockRejectedValueOnce(new Error("412"))
    // O `catch` preso já na criação: a recusa chega enquanto os relógios andam.
    const resultado = servico
      .authorizePayment({ data: cancelando(), context: { idempotency_key: CODIGO } })
      .then(
        () => "autorizou",
        (e: Error) => e.message
      )
    await jest.advanceTimersByTimeAsync(20_000)
    expect(await resultado).toMatch(/foi cancelado/)
    expect(cliente.capturarCobranca).not.toHaveBeenCalled()
  })

  it("dinheiro já tirado lá: diz pago — o Medusa registra, e a conciliação devolve pelo Medusa", async () => {
    const { servico, cliente } = montar()
    cliente.buscarPorCodigo.mockResolvedValue(cobrado())
    const r = await autorizar(servico, cancelando())
    expect(cliente.capturarCobranca).not.toHaveBeenCalled()
    expect(cliente.cancelarCobranca).not.toHaveBeenCalled()
    expect(r.status).toBe(PaymentSessionStatus.CAPTURED)
  })

  it("a análise reprovou e o Pagar.me já desfez: fecha com o que ele diz, sem DELETE", async () => {
    const { servico, cliente } = montar()
    cliente.buscarPorCodigo.mockResolvedValue(
      cartao({ analise: "reproved", cobranca: "failed", transacao: "voided", pedido: "failed" })
    )
    const r = await autorizar(servico, cancelando())
    expect(cliente.capturarCobranca).not.toHaveBeenCalled()
    expect(cliente.cancelarCobranca).not.toHaveBeenCalled()
    expect(r.status).toBe(PaymentSessionStatus.ERROR)
  })
})

describe("o aviso do Pagar.me", () => {
  const aviso = (tipo: string, segredo = "segredo") => ({
    data: { type: tipo, data: { id: "ch_1", order: { id: "or_1" } } },
    rawData: "",
    headers: { "x-webhook-segredo": segredo },
  })

  it("charge.antifraud_approved de um cartão ainda não cobrado: o Medusa vai cobrar", async () => {
    const { servico, cliente } = montar()
    cliente.lerPedido.mockResolvedValue(cartao({ analise: "approved" }))
    const r = await servico.getWebhookActionAndData(aviso("charge.antifraud_approved"))
    expect(r.action).toBe(PaymentActions.SUCCESSFUL)
    expect(r.data).toEqual({ session_id: CODIGO, amount: 62.58 })
    // Quem cobra é o `authorizePayment`, chamado pelo Medusa — não o aviso.
    expect(cliente.capturarCobranca).not.toHaveBeenCalled()
  })

  it("a análise ainda pensando, ou reprovada: nada a fazer", async () => {
    const { servico, cliente } = montar()
    cliente.lerPedido.mockResolvedValue(cartao({ analise: "pending" }))
    expect((await servico.getWebhookActionAndData(aviso("charge.antifraud_pending"))).action).toBe(
      PaymentActions.NOT_SUPPORTED
    )
    cliente.lerPedido.mockResolvedValue(cartao({ analise: "reproved" }))
    expect((await servico.getWebhookActionAndData(aviso("charge.antifraud_reproved"))).action).toBe(
      PaymentActions.NOT_SUPPORTED
    )
  })

  it("sem o segredo, nem lê o pedido", async () => {
    const { servico, cliente } = montar()
    const r = await servico.getWebhookActionAndData(aviso("charge.antifraud_approved", "outro"))
    expect(r.action).toBe(PaymentActions.NOT_SUPPORTED)
    expect(cliente.lerPedido).not.toHaveBeenCalled()
  })
})
