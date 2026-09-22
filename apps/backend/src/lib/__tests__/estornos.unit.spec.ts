import { emailDoEstornoQueFalhou } from "../emails/estorno-falhou"
import { ehAVez, lerEstorno, lerRegistros, TENTATIVAS } from "../estornos"

const PEDIDO_EM = new Date("2026-09-21T15:00:00.000Z")
const minutos = (n: number) => new Date(PEDIDO_EM.getTime() + n * 60 * 1000)

/** Uma cobrança de R$ 62,58 paga no Pix, como o Pagar.me devolve. */
const paga = (extra: Record<string, unknown> = {}) => ({
  id: "ch_1",
  amount: 6258,
  paid_amount: 6258,
  status: "paid",
  updated_at: "2026-09-21T14:00:00.000Z",
  last_transaction: { status: "paid" },
  ...extra,
})

const ler = (cobranca: Record<string, unknown>, esperado = 6258, agora = minutos(10)) =>
  lerEstorno({ cobranca, esperado, pedidoEm: PEDIDO_EM, agora })

describe("o estorno aconteceu?", () => {
  it("cancelada ou estornada inteira: voltou, conte o campo ou não", () => {
    expect(ler(paga({ status: "canceled", canceled_amount: 6258 }))).toEqual({
      situacao: "devolvido",
      devolvido: 6258,
    })
    expect(ler(paga({ status: "refunded" }))).toEqual({ situacao: "devolvido", devolvido: 6258 })
  })

  it("parcial que deu certo continua 'paga' — é o dinheiro que diz", () => {
    expect(ler(paga({ refunded_amount: 2000 }), 2000)).toEqual({
      situacao: "devolvido",
      devolvido: 2000,
    })
    expect(ler(paga({ canceled_amount: 2000 }), 2000)).toEqual({
      situacao: "devolvido",
      devolvido: 2000,
    })
  })

  it("aguardando cancelamento, processando ou estorno pendente na transação: andando", () => {
    expect(ler(paga({ pending_cancellation: true }))).toEqual({ situacao: "andando" })
    expect(ler(paga({ status: "processing" }))).toEqual({ situacao: "andando" })
    expect(ler(paga({ last_transaction: { status: "pending_refund" } }))).toEqual({
      situacao: "andando",
    })
    expect(ler(paga({ last_transaction: { status: "waiting_cancellation" } }))).toEqual({
      situacao: "andando",
    })
  })

  it("paga e sem sinal nenhum do Pagar.me: dá duas horas antes de chamar de falha", () => {
    expect(ler(paga(), 6258, minutos(10))).toEqual({ situacao: "andando" })
    expect(ler(paga(), 6258, minutos(121))).toMatchObject({
      situacao: "falhou",
      falta: 6258,
      retentavel: true,
    })
  })

  it("paga, e o Pagar.me mexeu na cobrança depois do pedido: foi ele desistindo", () => {
    const desistiu = paga({ updated_at: minutos(3).toISOString(), pending_cancellation: false })
    expect(ler(desistiu, 6258, minutos(5))).toEqual({
      situacao: "falhou",
      devolvido: 0,
      falta: 6258,
      retentavel: true,
      motivo: "a cobrança voltou pra paga",
    })
  })

  it("devolveu menos do que o Medusa diz: falta a diferença", () => {
    const parcial = paga({ refunded_amount: 1000, updated_at: minutos(3).toISOString() })
    expect(ler(parcial, 6258, minutos(5))).toMatchObject({ devolvido: 1000, falta: 5258 })
  })

  it("cobrança fora do comum não é pedida de novo — só avisa", () => {
    expect(ler(paga({ status: "chargedback" }))).toMatchObject({
      situacao: "falhou",
      retentavel: false,
      motivo: 'a cobrança está "chargedback" lá',
    })
  })
})

describe("quando pedir o estorno de novo", () => {
  const agora = new Date("2026-09-22T12:00:00.000Z")
  const registro = (tentativas: number, proxima: string | null) => ({ tentativas, proxima })
  const antes = "2026-09-22T11:59:00.000Z"
  const depois = "2026-09-22T18:00:00.000Z"

  it("sozinha, só na hora marcada", () => {
    expect(ehAVez({ registro: registro(0, antes), sozinha: true, manual: false, agora })).toBe(true)
    expect(ehAVez({ registro: registro(0, depois), sozinha: true, manual: false, agora })).toBe(
      false
    )
    expect(ehAVez({ registro: registro(0, null), sozinha: true, manual: false, agora })).toBe(false)
  })

  it(`sozinha, para em ${TENTATIVAS}; o botão do admin não tem limite`, () => {
    const cansou = registro(TENTATIVAS, antes)
    expect(ehAVez({ registro: cansou, sozinha: true, manual: false, agora })).toBe(false)
    expect(ehAVez({ registro: cansou, sozinha: true, manual: true, agora })).toBe(true)
    expect(ehAVez({ registro: registro(0, depois), sozinha: true, manual: true, agora })).toBe(true)
  })

  it("parcial ou cobrança fora do comum: nunca, nem pelo botão", () => {
    expect(ehAVez({ registro: registro(0, antes), sozinha: false, manual: false, agora })).toBe(
      false
    )
    expect(ehAVez({ registro: registro(0, antes), sozinha: false, manual: true, agora })).toBe(
      false
    )
  })
})

describe("o registro no pedido", () => {
  it("lê os registros de cada pagamento e deixa de fora o que não parece um", () => {
    const metadata = {
      emails: { confirmado: { em: "x", como: "email" } },
      estornos: {
        pay_1: { situacao: "falhou", esperado: 6258, cobranca: "ch_1", tentativas: 2 },
        pay_2: { situacao: "talvez", esperado: 1, cobranca: "ch_2" },
        pay_3: { situacao: "devolvido", cobranca: "ch_3" },
        pay_4: null,
      },
    }
    expect(lerRegistros(metadata)).toEqual({
      pay_1: {
        situacao: "falhou",
        esperado: 6258,
        devolvido: 0,
        cobranca: "ch_1",
        tentativas: 2,
        forma: "pix",
      },
    })
    expect(lerRegistros(null)).toEqual({})
    expect(lerRegistros({ estornos: "x" })).toEqual({})
  })
})

describe("o aviso pra quem cuida da loja", () => {
  const original = process.env.MEDUSA_BACKEND_URL
  afterAll(() => {
    if (original === undefined) delete process.env.MEDUSA_BACKEND_URL
    else process.env.MEDUSA_BACKEND_URL = original
  })

  const aviso = (extra: Record<string, unknown> = {}) =>
    emailDoEstornoQueFalhou("dono@exemplo.com", {
      pedidoId: "order_01ABC",
      numero: 6,
      falta: 6258,
      forma: "pix",
      cobranca: "ch_1",
      motivo: "a cobrança voltou pra paga",
      sozinha: true,
      horas: 6,
      tentativas: 8,
      ...extra,
    })

  it("diz o número, o valor, a cobrança e o que acontece agora", () => {
    const e = aviso()
    expect(e.assunto).toBe("O estorno do pedido #6 não saiu")
    for (const trecho of ["#6", "R$ 62,58", "ch_1", "de 6 em 6 horas", "Tentar o estorno"]) {
      expect(e.texto.replace(/\u00a0/g, " ")).toContain(trecho)
    }
    expect(e.texto).toContain("saldo disponível")
  })

  it("parcial ou fora do comum: manda pro painel, sem prometer tentar sozinha", () => {
    const e = aviso({ sozinha: false, forma: "cartao" })
    expect(e.texto).toContain("não pede de novo sozinha")
    expect(e.texto).not.toContain("de 6 em 6 horas")
  })

  it("o botão abre o pedido no admin; sem a URL do backend, não tem botão", () => {
    process.env.MEDUSA_BACKEND_URL = "https://api.exemplo.com/"
    expect(aviso().html).toContain('href="https://api.exemplo.com/app/orders/order_01ABC"')
    delete process.env.MEDUSA_BACKEND_URL
    expect(aviso().html).not.toContain("/app/orders/")
  })
})
