import { createHmac } from "node:crypto"
import { PaymentSessionStatus } from "@medusajs/framework/utils"
import type { EntradaDaLoja } from "../../../lib/pagamento/entrada"
import { RECUSA } from "../../../lib/pagamento/recusas"
import { acaoDoAviso, assinaturaConfere, ehDaLoja } from "../aviso"
import { PIX_COM_RESERVA_MS } from "../../../lib/pagamento/disjuntor"
import { ErroDoMercadoPago, type PagamentoMP } from "../client"
import { montarPix, validadeDoPix } from "../pedido"
import MercadoPagoServico from "../service"
import { estadoNovo, gravar, lerEstado, RECUSAS, traduzir } from "../situacao"

const ORIGEM = "abc123def4567890"
const SESSAO = "payses_01TESTE"

const pagamento = (extra: Partial<PagamentoMP> = {}): PagamentoMP => ({
  id: 1325647281,
  status: "pending",
  status_detail: "pending_waiting_transfer",
  external_reference: SESSAO,
  transaction_amount: 123.45,
  transaction_amount_refunded: 0,
  payment_method_id: "pix",
  date_created: "2026-09-27T12:00:00.000-04:00",
  date_of_expiration: "2026-09-27T12:31:00.000-04:00",
  metadata: { origem: ORIGEM, sessao: SESSAO },
  point_of_interaction: {
    transaction_data: { qr_code: "00020126580014br.gov.bcb.pix", qr_code_base64: "iVBORw0KGgo=" },
  },
  ...extra,
})

describe("o que o Mercado Pago respondeu, no estado comum", () => {
  it("Pix gerado: esperando, com o QR, o valor em centavos e o id nos dois campos", () => {
    const { status, estado } = traduzir(pagamento())
    expect(status).toBe(PaymentSessionStatus.PENDING_AUTHORIZATION)
    expect(estado).toEqual({
      forma: "pix",
      situacao: "aguardando",
      valor: 12345,
      pedido: "1325647281",
      cobranca: "1325647281",
      parcelas: 1,
      pix: {
        copiaECola: "00020126580014br.gov.bcb.pix",
        imagem: "data:image/png;base64,iVBORw0KGgo=",
        expiraEm: "2026-09-27T12:31:00.000-04:00",
      },
      cartao: null,
      recusa: null,
      falha: null,
      estornado: 0,
    })
  })

  it("pago é capturado; o estorno parcial fica em `estornado`, e o pagamento segue pago", () => {
    expect(traduzir(pagamento({ status: "approved" }))).toMatchObject({
      status: PaymentSessionStatus.CAPTURED,
      estado: { situacao: "pago", estornado: 0 },
    })
    expect(
      traduzir(pagamento({ status: "approved", transaction_amount_refunded: 20.1 }))
    ).toMatchObject({ status: PaymentSessionStatus.CAPTURED, estado: { estornado: 2010 } })
  })

  it("estornado inteiro, vencido ou cancelado fecham; recusado é falha com a frase do Pix", () => {
    expect(
      traduzir(pagamento({ status: "refunded", transaction_amount_refunded: 123.45 }))
    ).toMatchObject({
      status: PaymentSessionStatus.CANCELED,
      estado: { situacao: "estornado", estornado: 12345 },
    })
    expect(traduzir(pagamento({ status: "cancelled", status_detail: "expired" }))).toMatchObject({
      status: PaymentSessionStatus.CANCELED,
      estado: { situacao: "cancelado" },
    })
    expect(traduzir(pagamento({ status: "rejected" }))).toMatchObject({
      status: PaymentSessionStatus.ERROR,
      estado: { situacao: "falhou", recusa: RECUSA.pix },
    })
  })

  it("status que a loja não conhece é espera, nunca pagamento perdido", () => {
    expect(traduzir(pagamento({ status: "coisa_nova" })).status).toBe(
      PaymentSessionStatus.PENDING_AUTHORIZATION
    )
  })

  it("grava em `data.mercadopago`, e a entrada sai da sessão", () => {
    const { estado } = traduzir(pagamento())
    const data = gravar(estado)
    expect(data).toEqual({ mercadopago: estado, entrada: null })
    expect(lerEstado(data)).toEqual(estado)
    expect(lerEstado({ pagarme: estado })).toBeNull()
  })

  it("as frases são as de todo parceiro", () => {
    expect(RECUSAS).toEqual({ pix: RECUSA.pix, fora: RECUSA.fora })
  })
})

const entrada: EntradaDaLoja = {
  forma: "pix",
  parcelas: 1,
  token: null,
  comprador: {
    nome: "Rafael de Souza Teste",
    email: "rafael@fuckingbarba.invalid",
    documento: "11144477735",
    tipoDocumento: "cpf",
    telefone: "+5511988887777",
  },
  endereco: {
    rua: "Rua A",
    numero: "1",
    complemento: "",
    bairro: "Centro",
    cidade: "Blumenau",
    uf: "SC",
    cep: "89036370",
  },
  itens: [{ codigo: "FBOL01", descricao: "Óleo", quantidade: 1, total: 123.45 }],
  frete: { total: 0, descricao: "" },
  ip: null,
  reserva: false,
}

describe("o Pix que vai pro Mercado Pago", () => {
  const agora = new Date("2026-09-27T15:00:00.000Z")

  it("o valor da sessão em reais, a referência e a origem pra achar depois", () => {
    const corpo = montarPix(entrada, 12345, SESSAO, 30, ORIGEM, agora)
    expect(corpo).toMatchObject({
      transaction_amount: 123.45,
      payment_method_id: "pix",
      external_reference: SESSAO,
      metadata: { origem: ORIGEM, sessao: SESSAO },
      payer: {
        email: "rafael@fuckingbarba.invalid",
        first_name: "Rafael",
        last_name: "de Souza Teste",
        identification: { type: "CPF", number: "11144477735" },
      },
    })
  })

  it("CNPJ vai como CNPJ, e nome de uma palavra só se repete no sobrenome", () => {
    const corpo = montarPix(
      {
        ...entrada,
        comprador: {
          ...entrada.comprador,
          nome: "Barbearia",
          tipoDocumento: "cnpj",
          documento: "11222333000181",
        },
      },
      5000,
      SESSAO,
      30,
      ORIGEM,
      agora
    )
    expect(corpo.payer).toMatchObject({
      first_name: "Barbearia",
      last_name: "Barbearia",
      identification: { type: "CNPJ", number: "11222333000181" },
    })
  })

  it("vale ao menos 30 minutos na chegada, com o fuso de Brasília escrito", () => {
    expect(validadeDoPix(agora, 30)).toBe("2026-09-27T12:31:00.000-03:00")
    // Pedir menos que o mínimo de lá não passa: vira 30 (+ a folga).
    expect(validadeDoPix(agora, 10)).toBe("2026-09-27T12:31:00.000-03:00")
    expect(validadeDoPix(agora, 60)).toBe("2026-09-27T13:01:00.000-03:00")
    const ms = Date.parse(validadeDoPix(agora, 30)) - agora.getTime()
    expect(ms).toBeGreaterThan(30 * 60_000)
  })
})

describe("a assinatura do aviso", () => {
  const segredo = "segredo-do-mercado-pago"
  const assinar = (manifesto: string) =>
    createHmac("sha256", segredo).update(manifesto).digest("hex")

  it("confere com o manifesto do SDK oficial: id em minúsculas, request-id e ts", () => {
    const v1 = assinar("id:abc123;request-id:req-1;ts:1704908010;")
    expect(
      assinaturaConfere({
        assinatura: `ts=1704908010,v1=${v1}`,
        requisicao: "req-1",
        idDoDado: "ABC123",
        segredo,
      })
    ).toBe(true)
  })

  it("sem request-id, o par sai do manifesto", () => {
    const v1 = assinar("id:42;ts:99;")
    expect(
      assinaturaConfere({ assinatura: `ts=99, v1=${v1}`, requisicao: "", idDoDado: "42", segredo })
    ).toBe(true)
  })

  it("assinatura de outro corpo, de outro segredo, ou sem as partes não passa", () => {
    const v1 = assinar("id:42;request-id:r;ts:99;")
    expect(
      assinaturaConfere({ assinatura: `ts=99,v1=${v1}`, requisicao: "r", idDoDado: "43", segredo })
    ).toBe(false)
    expect(
      assinaturaConfere({
        assinatura: `ts=99,v1=${v1}`,
        requisicao: "r",
        idDoDado: "42",
        segredo: "outro",
      })
    ).toBe(false)
    expect(
      assinaturaConfere({ assinatura: `v1=${v1}`, requisicao: "r", idDoDado: "42", segredo })
    ).toBe(false)
    expect(
      assinaturaConfere({ assinatura: "ts=99", requisicao: "r", idDoDado: "42", segredo })
    ).toBe(false)
    expect(assinaturaConfere({ assinatura: "", requisicao: "r", idDoDado: "42", segredo })).toBe(
      false
    )
    // Sem o segredo configurado, nada passa — nem assinado com vazio.
    expect(
      assinaturaConfere({
        assinatura: `ts=99,v1=${createHmac("sha256", "").update("id:42;ts:99;").digest("hex")}`,
        requisicao: "",
        idDoDado: "42",
        segredo: "",
      })
    ).toBe(false)
  })
})

describe("o que o aviso vira", () => {
  it("pago, da loja e desta instalação: o pagamento da sessão, em reais", () => {
    expect(acaoDoAviso(pagamento({ status: "approved" }), ORIGEM)).toEqual({
      session_id: SESSAO,
      amount: 123.45,
    })
  })

  it("Pix esperando, cancelado ou estornado não muda nada pelo aviso", () => {
    for (const status of ["pending", "cancelled", "refunded", "rejected"]) {
      expect(acaoDoAviso(pagamento({ status }), ORIGEM)).toBeNull()
    }
  })

  it("venda do Mercado Livre, de outra instalação ou sem referência de sessão: não é da loja", () => {
    expect(ehDaLoja(pagamento({ external_reference: "2000012345678" }), ORIGEM)).toBe(false)
    expect(ehDaLoja(pagamento({ external_reference: null }), ORIGEM)).toBe(false)
    expect(ehDaLoja(pagamento({ metadata: { origem: "outra" } }), ORIGEM)).toBe(false)
    expect(ehDaLoja(pagamento({ metadata: null }), ORIGEM)).toBe(false)
    expect(acaoDoAviso(pagamento({ status: "approved", metadata: {} }), ORIGEM)).toBeNull()
    expect(ehDaLoja(pagamento(), ORIGEM)).toBe(true)
  })
})

describe("o Pix no checkout, quando o Mercado Pago não atende (0150)", () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date("2026-09-27T15:00:00.000Z") }))
  afterEach(() => jest.useRealTimers())

  function montar() {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
    const servico = new MercadoPagoServico({ logger }, { tokenDeAcesso: "TEST-token" })
    const cliente = {
      buscarDaSessao: jest.fn(async () => null),
      criarPix: jest.fn<Promise<PagamentoMP>, [unknown, string, number?]>(async () => pagamento()),
      cancelar: jest.fn(async () => ({})),
    }
    ;(servico as unknown as { cliente: typeof cliente }).cliente = cliente
    return { servico, cliente }
  }
  async function autorizar(servico: MercadoPagoServico, reserva: boolean) {
    const promessa = servico.authorizePayment({
      data: gravar(estadoNovo("pix", 12345, 1), { ...entrada, reserva }),
      context: { idempotency_key: SESSAO },
    })
    await jest.advanceTimersByTimeAsync(20_000)
    const r = await promessa
    return {
      status: r.status,
      estado: (r.data as { mercadopago: { situacao: string; falha: string | null } }).mercadopago,
    }
  }

  it("com reserva: desiste em 10 s e não manda de novo — incerto, com a falha 'fora'", async () => {
    const { servico, cliente } = montar()
    cliente.criarPix.mockRejectedValue(new ErroDoMercadoPago("sem resposta", "rede"))
    const r = await autorizar(servico, true)
    expect(cliente.criarPix).toHaveBeenCalledTimes(1)
    expect(cliente.criarPix.mock.calls[0][2]).toBe(PIX_COM_RESERVA_MS)
    expect(r.status).toBe(PaymentSessionStatus.ERROR)
    expect(r.estado).toMatchObject({ situacao: "incerto", falha: "fora" })
  })

  it("sem reserva: manda de novo duas vezes com a mesma chave, como antes", async () => {
    const { servico, cliente } = montar()
    cliente.criarPix.mockRejectedValue(
      new ErroDoMercadoPago("o Mercado Pago respondeu 503", "servidor")
    )
    const r = await autorizar(servico, false)
    expect(cliente.criarPix).toHaveBeenCalledTimes(3)
    expect(cliente.criarPix.mock.calls.every((c) => c[1] === SESSAO)).toBe(true)
    expect(r.estado).toMatchObject({ situacao: "incerto", falha: "fora" })
  })

  it("a chave recusada é o Mercado Pago fora; o dado recusado, recusa; o Pix que ele recusou, recusa", async () => {
    const chave = montar()
    chave.cliente.criarPix.mockRejectedValue(new ErroDoMercadoPago("401", "autenticacao", 401))
    expect((await autorizar(chave.servico, true)).estado).toMatchObject({
      situacao: "falhou",
      falha: "fora",
    })
    const dado = montar()
    dado.cliente.criarPix.mockRejectedValue(new ErroDoMercadoPago("400", "validacao", 400))
    expect((await autorizar(dado.servico, true)).estado).toMatchObject({
      situacao: "falhou",
      falha: "recusa",
    })
    expect(traduzir(pagamento({ status: "rejected" })).estado).toMatchObject({
      situacao: "falhou",
      falha: "recusa",
    })
  })

  it("gerado de primeira: esperando o pagamento, sem falha nenhuma", async () => {
    const { servico } = montar()
    const r = await autorizar(servico, true)
    expect(r.status).toBe(PaymentSessionStatus.PENDING_AUTHORIZATION)
    expect(r.estado).toMatchObject({ situacao: "aguardando", falha: null })
  })
})
