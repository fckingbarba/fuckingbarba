import { emCentavos } from "../../../modules/pagarme/client"
import { areasDo, matrizCom, MATRIZ_PADRAO, type Matriz, type Papel } from "../../equipe/regras"
import type { EmailLidoDoBanco } from "../crm"
import { duracao, quando, reais } from "../formato"
import { montarInicio, motivoCurto, precisamDoTotal } from "../inicio"
import {
  comPontuacao,
  detalheDo,
  idsDosEmailsDoPedido,
  linhaDaLista,
  mascarar,
  mensagemDoPedido,
  nomeCurto,
  notaTravada,
  pagamentoDo,
  passaNaBusca,
  passaNoFiltro,
  problemaDo,
  prontoPraDespachar,
  situacaoDo,
  totalDo,
  type Contexto,
  type NotaCrua,
  type PedidoCru,
} from "../pedido"

/**
 * O pedido do jeito do painel: onde está, o que travou, o caminho, e o que
 * cada papel recebe. Os pedidos daqui têm a forma que o `query.graph`
 * devolve (conferida no banco local com os pedidos do `pedido-de-teste.mjs`).
 *
 * A hora é de Brasília: 24/09/2026, 12:00 aqui = 15:00 UTC.
 */

const AGORA = new Date("2026-09-24T15:00:00.000Z")
const MIN = 60 * 1000
const antes = (minutos: number) => new Date(AGORA.getTime() - minutos * MIN).toISOString()
const depois = (minutos: number) => new Date(AGORA.getTime() + minutos * MIN).toISOString()

const SEM_ERP: Contexto = { agora: AGORA, notasDesde: null, janelaDaNota: 0 }
const COM_ERP: Contexto = {
  agora: AGORA,
  notasDesde: new Date("2026-09-20T00:00:00Z"),
  janelaDaNota: 5,
}

function sessao(
  situacao: string,
  extra: Record<string, unknown> = {},
  status = "authorized",
  criada = antes(30)
) {
  return {
    provider_id: "pp_pagarme_pagarme",
    status,
    created_at: criada,
    data: {
      pagarme: {
        forma: "pix",
        situacao,
        valor: 12860,
        pedido: "or_1",
        cobranca: "ch_1",
        parcelas: 1,
        pix: { copiaECola: "x", imagem: "x", expiraEm: depois(20) },
        cartao: null,
        recusa: null,
        estornado: 0,
        ...extra,
      },
      entrada: null,
    },
  }
}

function pedido(extra: Partial<PedidoCru> = {}, pago = false): PedidoCru {
  return {
    id: "order_01K0000000000000000000000A",
    display_id: 1042,
    created_at: antes(30),
    status: "pending",
    email: "rafael@exemplo.com",
    customer: { has_account: false },
    total: 128.6,
    shipping_total: 23.7,
    metadata: {},
    items: [
      {
        id: "item_1",
        title: "30ml",
        product_title: "Óleo para Barba FuckingBarba 30ml",
        product_id: "prod_oleo",
        quantity: 2,
        unit_price: 52.45,
        compare_at_unit_price: 79.9,
        total: 104.9,
      },
    ],
    shipping_address: {
      first_name: "Rafael",
      last_name: "Souza",
      phone: "+5511988887777",
      address_1: "Rua das Palmeiras, 123",
      address_2: "Apto 42 — Centro",
      city: "Blumenau",
      province: "sc",
      postal_code: "89036370",
      metadata: {
        rua: "Rua das Palmeiras",
        numero: "123",
        complemento: "Apto 42",
        bairro: "Centro",
      },
    },
    billing_address: { metadata: { documento: { tipo: "cpf", valor: "111.444.777-35" } } },
    shipping_methods: [{ name: "Entrega econômica" }],
    payment_collections: [
      {
        payment_sessions: [sessao(pago ? "pago" : "aguardando")],
        payments: pago
          ? [{ provider_id: "pp_pagarme_pagarme", captured_at: antes(25), amount: 128.6 }]
          : [],
      },
    ],
    fulfillments: [],
    ...extra,
  }
}

const nota = (extra: Partial<NotaCrua> = {}): NotaCrua => ({
  situacao: "a-emitir",
  referencia: "FB-1042",
  created_at: antes(24),
  ...extra,
})

describe("formato", () => {
  it("hoje e ontem são os de Brasília, não os do servidor", () => {
    const meiaNoiteUtc = new Date("2026-09-24T02:30:00.000Z") // 23:30 de 23/09 em Brasília
    expect(quando("2026-09-24T01:00:00.000Z", meiaNoiteUtc)).toBe("hoje, 22:00")
    expect(quando("2026-09-23T01:00:00.000Z", meiaNoiteUtc)).toBe("ontem, 22:00")
    expect(quando("2026-09-20T15:00:00.000Z", AGORA)).toBe("20/09, 12:00")
  })

  it("duração e dinheiro", () => {
    expect(duracao(12)).toBe("12 min")
    expect(duracao(65)).toBe("1 h 05")
    expect(duracao(180)).toBe("3 h")
    expect(reais(128.6).replace(/\s/g, " ")).toBe("R$ 128,60")
  })
})

describe("onde o pedido está", () => {
  it("Pix esperando, e vencido quando o QR passou da hora", () => {
    expect(situacaoDo(pedido(), pagamentoDo(pedido()), AGORA)).toBe("pix")
    const vencido = pedido({
      payment_collections: [
        { payment_sessions: [sessao("aguardando", { pix: { expiraEm: antes(1) } })] },
      ],
    })
    expect(situacaoDo(vencido, pagamentoDo(vencido), AGORA)).toBe("vencido")
  })

  it("cartão em análise, pago, enviado, entregue e cancelado", () => {
    const analise = pedido({
      payment_collections: [
        { payment_sessions: [sessao("analise", { forma: "cartao", pix: null })] },
      ],
    })
    expect(situacaoDo(analise, pagamentoDo(analise), AGORA)).toBe("analise")
    const pago = pedido({}, true)
    expect(situacaoDo(pago, pagamentoDo(pago), AGORA)).toBe("separacao")
    const enviado = pedido({ fulfillments: [{ id: "ful_1", shipped_at: antes(5) }] }, true)
    expect(situacaoDo(enviado, pagamentoDo(enviado), AGORA)).toBe("enviado")
    const entregue = pedido(
      { fulfillments: [{ id: "ful_1", shipped_at: antes(50), delivered_at: antes(5) }] },
      true
    )
    expect(situacaoDo(entregue, pagamentoDo(entregue), AGORA)).toBe("entregue")
    const cancelado = pedido({ status: "canceled" }, true)
    expect(situacaoDo(cancelado, pagamentoDo(cancelado), AGORA)).toBe("cancelado")
  })

  it("envio cancelado não conta como enviado", () => {
    const o = pedido(
      { fulfillments: [{ id: "ful_1", shipped_at: antes(5), canceled_at: antes(1) }] },
      true
    )
    expect(situacaoDo(o, pagamentoDo(o), AGORA)).toBe("separacao")
  })

  it("a sessão que vale é a autorizada, não a última tentativa", () => {
    const o = pedido({
      payment_collections: [
        {
          payment_sessions: [
            sessao(
              "pago",
              { forma: "cartao", cartao: { bandeira: "Visa", final: "4242" } },
              "authorized"
            ),
            sessao("recusado", { forma: "pix" }, "error"),
          ],
          payments: [{ provider_id: "pp_pagarme_pagarme", captured_at: antes(20) }],
        },
      ],
    })
    expect(pagamentoDo(o).forma).toBe("cartao")
    expect(pagamentoDo(o).parceiro).toBe("Pagar.me")
  })

  it("o Pix do Mercado Pago (o Pix reserva) é lido igual, e diz quem cobrou", () => {
    const doPagarme = sessao("aguardando", {}, "pending")
    const o = pedido({
      payment_collections: [
        {
          payment_sessions: [
            {
              ...doPagarme,
              provider_id: "pp_mercadopago_mercadopago",
              data: { mercadopago: doPagarme.data.pagarme, entrada: null },
            },
          ],
          payments: [],
        },
      ],
    })
    const p = pagamentoDo(o)
    expect(p.parceiro).toBe("Mercado Pago")
    expect(p.forma).toBe("pix")
    expect(situacaoDo(o, p, AGORA)).toBe("pix")
    expect(pagamentoDo(pedido({ payment_collections: [] })).parceiro).toBeNull()
  })
})

describe("o que travou", () => {
  it("dinheiro de cliente primeiro, depois nota, Frenet e entrega", () => {
    const estorno = {
      situacao: "falhou",
      esperado: 12860,
      devolvido: 0,
      cobranca: "ch_1",
      forma: "pix",
      tentativas: 1,
    }
    const tudo = pedido(
      {
        metadata: {
          estornos: { pay_1: estorno },
          fb_parceiro: {
            parceiro: "frenet",
            referencia: "FB-1042",
            entrou: false,
            em: antes(5),
            tentativas: 3,
            definitivo: true,
          },
        },
      },
      true
    )
    expect(problemaDo(tudo, nota({ situacao: "rejeitada" }), [])).toBe("estorno")
    const semEstorno = { ...tudo, metadata: { fb_parceiro: tudo.metadata!.fb_parceiro } }
    expect(problemaDo(semEstorno, nota({ situacao: "rejeitada" }), [])).toBe("nota")
    expect(problemaDo(semEstorno, null, [])).toBe("frenet")
    expect(
      problemaDo(pedido({}, true), null, [{ situacao: "em_transito", alerta: "nao_entregue" }])
    ).toBe("entrega")
    expect(problemaDo(pedido({}, true), null, [])).toBeNull()
  })

  it("nota travada é a que precisa de alguém — não a que a loja segue tentando", () => {
    expect(notaTravada(nota({ situacao: "rejeitada" }))).toBe(true)
    expect(notaTravada(nota({ situacao: "denegada" }))).toBe(true)
    expect(notaTravada(nota({ definitivo: true }))).toBe(true)
    expect(notaTravada(nota({ erro: "sem CPF" }))).toBe(false)
    expect(notaTravada(nota({ situacao: "autorizada", cancelar: true }))).toBe(true)
    expect(notaTravada(nota({ situacao: "desfeita", cancelar: true }))).toBe(false)
  })

  it("pronto pra despachar: pago, com a nota autorizada — ou de antes do ERP", () => {
    const pagoEm = new Date(antes(25))
    expect(prontoPraDespachar("separacao", null, pagoEm, SEM_ERP)).toBe(true)
    expect(prontoPraDespachar("separacao", nota(), pagoEm, COM_ERP)).toBe(false)
    expect(prontoPraDespachar("separacao", nota({ situacao: "autorizada" }), pagoEm, COM_ERP)).toBe(
      true
    )
    const antesDoErp = new Date("2026-09-19T12:00:00Z")
    expect(prontoPraDespachar("separacao", null, antesDoErp, COM_ERP)).toBe(true)
    expect(prontoPraDespachar("pix", null, null, SEM_ERP)).toBe(false)
  })
})

describe("a lista", () => {
  it("resume o pedido numa linha", () => {
    const l = linhaDaLista(pedido({}, true), null, [], SEM_ERP)
    expect(l).toMatchObject({
      numero: 1042,
      quando: "hoje, 11:30",
      cliente: { nome: "Rafael Souza", cidade: "Blumenau", uf: "SC" },
      itens: "2× Óleo 30ml",
      unidades: 2,
      forma: "pix",
      situacao: "separacao",
      problema: null,
      despachar: true,
      total: 128.6,
    })
  })

  it("as fotos (uma por produto, até três) e os seis passos, os mesmos do pedido aberto", () => {
    const item = (id: string, produto: string, foto: string | null) => ({
      id,
      title: "30ml",
      product_title: `Produto ${produto}`,
      product_id: produto,
      thumbnail: foto,
      quantity: 1,
    })
    const o = pedido(
      {
        items: [
          item("i1", "oleo", "https://x/oleo.webp"),
          item("i2", "oleo", "https://x/oleo.webp"),
          item("i3", "balm", "https://x/balm.webp"),
          item("i4", "kit", null),
          item("i5", "spray", "https://x/spray.webp"),
          item("i6", "fator", "https://x/fator.webp"),
        ],
      },
      true
    )
    const l = linhaDaLista(o, null, [], SEM_ERP)
    expect(l.fotos).toEqual(["https://x/oleo.webp", "https://x/balm.webp", "https://x/spray.webp"])
    expect(l.produtos).toBe(5)
    const caminho = detalheDo(o, null, [], SEM_ERP, { verCpf: true }).caminho
    expect(l.passos).toEqual(caminho.map((x) => x.estado))
    expect(l.passos.slice(0, 2)).toEqual(["feito", "feito"])
  })

  it("nomes curtos sem a marca", () => {
    expect(nomeCurto("Óleo para Barba FuckingBarba — 30ml")).toBe("Óleo")
    expect(nomeCurto("Spray Modelador Matte 100ml Fucking Barba")).toBe(
      "Spray Modelador Matte 100ml"
    )
    expect(nomeCurto("Kit Completo")).toBe("Kit Completo")
  })

  it("filtros e busca, como as fitas do protótipo", () => {
    const l = linhaDaLista(pedido({}, true), null, [], SEM_ERP)
    expect(passaNoFiltro(l, "despachar")).toBe(true)
    expect(passaNoFiltro(l, "pagamento")).toBe(false)
    expect(passaNoFiltro(l, "problemas")).toBe(false)
    expect(passaNaBusca(l, "rafael@exemplo.com", "#1042")).toBe(true)
    expect(passaNaBusca(l, "rafael@exemplo.com", "blumenau")).toBe(true)
    expect(passaNaBusca(l, "rafael@exemplo.com", "SOUZA")).toBe(true)
    expect(passaNaBusca(l, "rafael@exemplo.com", "Joinville")).toBe(false)
  })
})

describe("o pedido inteiro", () => {
  it("o CPF inteiro só pro dono", () => {
    const pro = (verCpf: boolean) =>
      detalheDo(pedido({}, true), null, [], SEM_ERP, { verCpf }).cliente
    expect(pro(false).documento).toEqual({
      tipo: "cpf",
      mascarado: "•••.444.777-••",
      inteiro: null,
    })
    expect(pro(true).documento?.inteiro).toBe("111.444.777-35")
    expect(pro(false).celular).toBe("(11) 98888-7777")
  })

  it("máscara e pontuação de CPF e CNPJ", () => {
    expect(mascarar({ tipo: "cpf", valor: "11144477735" })).toBe("•••.444.777-••")
    expect(comPontuacao({ tipo: "cnpj", valor: "11222333000181" })).toBe("11.222.333/0001-81")
    expect(mascarar({ tipo: "cnpj", valor: "11222333000181" })).toBe("••.•••.333/0001-••")
  })

  it("o caminho do Pix esperando", () => {
    const d = detalheDo(pedido(), null, [], COM_ERP, { verCpf: false })
    expect(d.caminho.map((p) => p.estado)).toEqual(["feito", "agora", "", "", "", ""])
    expect(d.caminho[1].texto).toBe("esperando o Pix · vence 12:20")
    expect(d.caminho[2].texto).toBe("espera o pagamento")
    expect(d.faixas.map((f) => f.titulo)).toEqual(["Esperando o Pix"])
    expect(d.faixas[0].etiquetas).toEqual(["vale até 12:20"])
  })

  it("o Pix esperando traz o código pra copiar; vencido ou pago, não", () => {
    const d = detalheDo(pedido(), null, [], SEM_ERP, { verCpf: false })
    expect(d.pagamento.pix).toEqual({ codigo: "x", valeAte: "12:20" })
    const vencido = pedido({
      payment_collections: [
        {
          payment_sessions: [
            sessao("aguardando", { pix: { copiaECola: "x", expiraEm: antes(1) } }),
          ],
        },
      ],
    })
    expect(detalheDo(vencido, null, [], SEM_ERP, { verCpf: false }).pagamento.pix).toBeNull()
    expect(
      detalheDo(pedido({}, true), null, [], SEM_ERP, { verCpf: false }).pagamento.pix
    ).toBeNull()
    const cartao = pedido({
      payment_collections: [
        { payment_sessions: [sessao("analise", { forma: "cartao", pix: null })] },
      ],
    })
    expect(detalheDo(cartao, null, [], SEM_ERP, { verCpf: false }).pagamento.pix).toBeNull()
  })

  it("o WhatsApp do cliente: só pra quem abre os contatos, com celular e a mensagem pronta", () => {
    const link = detalheDo(pedido(), null, [], SEM_ERP, { verCpf: false, whatsapp: true }).cliente
      .whatsapp
    expect(link).toMatch(/^https:\/\/wa\.me\/5511988887777\?text=/)
    expect(decodeURIComponent(link!.split("?text=")[1])).toBe(
      "Oi, Rafael! Aqui é da FuckingBarba. O seu pedido #1042 está esperando o Pix, que vale até 12:20. " +
        "Vou te mandar o código aqui embaixo: é só copiar e colar no app do banco."
    )
    expect(detalheDo(pedido(), null, [], SEM_ERP, { verCpf: false }).cliente.whatsapp).toBeNull()
    const semCelular = pedido({
      shipping_address: { ...pedido().shipping_address!, phone: "" },
    })
    expect(
      detalheDo(semCelular, null, [], SEM_ERP, { verCpf: false, whatsapp: true }).cliente.whatsapp
    ).toBeNull()
    // Pedido pago também tem o botão: a mensagem só fala do pedido.
    const pago = detalheDo(pedido({}, true), null, [], SEM_ERP, { verCpf: false, whatsapp: true })
    expect(decodeURIComponent(pago.cliente.whatsapp!.split("?text=")[1])).toBe(
      "Oi, Rafael! Aqui é da FuckingBarba. É sobre o seu pedido #1042."
    )
  })

  it("a mensagem do Pix vencido, e sem o primeiro nome", () => {
    expect(mensagemDoPedido({ display_id: 7, shipping_address: null }, "vencido", null)).toBe(
      "Oi! Aqui é da FuckingBarba. O Pix do seu pedido #7 venceu antes do pagamento. Ficou alguma dúvida? Posso te ajudar por aqui."
    )
  })

  it("o caminho do pago esperando a nota, com a hora que ela sai", () => {
    const o = pedido(
      {
        payment_collections: [
          {
            payment_sessions: [sessao("pago")],
            payments: [{ provider_id: "pp_pagarme_pagarme", captured_at: antes(2) }],
          },
        ],
      },
      false
    )
    const d = detalheDo(o, nota(), [], COM_ERP, { verCpf: false })
    expect(d.caminho[1]).toEqual({ nome: "Pagamento", estado: "feito", texto: "Pix pago · 11:58" })
    expect(d.caminho[2]).toEqual({ nome: "Nota fiscal", estado: "agora", texto: "sai às 12:03" })
    expect(d.caminho[3].texto).toBe("espera a nota")
    expect(d.nota).toBe("Sai às 12:03 (5 min depois do pagamento)")
    expect(d.despachar).toBe(false)
  })

  it("cancelado: o passo onde parou fica vermelho, e nada mais está andando", () => {
    const d = detalheDo(pedido({ status: "canceled", canceled_at: antes(1) }), null, [], SEM_ERP, {
      verCpf: false,
    })
    expect(d.caminho.map((p) => p.estado)).toEqual(["feito", "erro", "", "", "", ""])
    expect(d.cancelado).toBe("Cancelado em 24/09, às 11:59.")
  })

  it("enviado: postado, e o entregue esperando", () => {
    const o = pedido({ fulfillments: [{ id: "ful_1", shipped_at: antes(10) }] }, true)
    const d = detalheDo(
      o,
      null,
      [
        {
          codigo: "AA123456785BR",
          situacao: "em_transito",
          postado_em: antes(10),
          transportadora: "Correios",
        },
      ],
      SEM_ERP,
      {
        verCpf: false,
      }
    )
    expect(d.caminho[4]).toEqual({
      nome: "Enviado",
      estado: "feito",
      texto: "postado · 24/09, 11:50",
    })
    expect(d.caminho[5]).toEqual({ nome: "Entregue", estado: "agora", texto: "a caminho" })
    expect(d.entrega?.rastreios[0].codigo).toBe("AA123456785BR")
  })

  it("o histórico começa no pedido feito, mesmo com o Pix gerado um instante antes", () => {
    const d = detalheDo(pedido({}, true), null, [], SEM_ERP, { verCpf: false })
    expect(d.historico.map((e) => e.titulo).slice(0, 3)).toEqual([
      "Pedido feito",
      "Pix gerado",
      "Pix pago",
    ])
  })

  it("os totais: o preço cobrado, o cupom e o frete", () => {
    const o = pedido(
      {
        items: [
          {
            id: "item_1",
            product_title: "Óleo",
            quantity: 2,
            unit_price: 52.45,
            compare_at_unit_price: 79.9,
            total: 94.41,
            adjustments: [{ code: "BUMP-OLEO-1a2b3c4d", amount: 10.49 }],
          },
        ],
        total: 118.11,
      },
      true
    )
    const d = detalheDo(o, null, [], SEM_ERP, { verCpf: false })
    expect(d.totais.produtos).toBe(104.9)
    expect(d.totais.cupons).toEqual([{ codigo: "BUMP-OLEO-1a2b3c4d", valor: 10.49 }])
    expect(d.itens[0].cheio).toBe(79.9)
  })

  it('a promoção automática (o Leve X, pague Y) aparece como "Promoção", não pelo código sorteado', () => {
    const o = pedido(
      {
        items: [
          {
            id: "item_1",
            product_title: "Fator",
            quantity: 3,
            unit_price: 79.9,
            total: 159.8,
            adjustments: [{ code: "PROMO-3F9A12C7", amount: 79.9 }],
          },
        ],
        total: 159.8,
      },
      true
    )
    const d = detalheDo(o, null, [], SEM_ERP, { verCpf: false })
    expect(d.totais.cupons).toEqual([{ codigo: "Promoção", valor: 79.9 }])
  })

  it("o total é o cobrado, com o cupom e a oferta descontados — não a conta de antes deles", () => {
    // Como o Medusa devolve: o `original_total` é a conta de ANTES do desconto.
    const doMedusa = { total: 118.11, original_total: 128.6, discount_total: 10.49 }
    const o = pedido(
      {
        ...doMedusa,
        items: [
          {
            id: "item_1",
            product_title: "Óleo",
            quantity: 2,
            unit_price: 52.45,
            total: 94.41,
            adjustments: [{ code: "BUMP-OLEO-1a2b3c4d", amount: 10.49 }],
          },
        ],
      },
      true
    )
    const d = detalheDo(o, null, [], SEM_ERP, { verCpf: false })
    expect(d.total).toBe(118.11)
    expect(d.totais.total).toBe(118.11)
    // A conta da tela fecha: os produtos, menos o desconto, mais o frete.
    expect(d.totais.produtos - d.totais.cupons[0].valor + d.totais.frete).toBeCloseTo(118.11, 2)
    expect(linhaDaLista(o, null, [], SEM_ERP).total).toBe(118.11)
  })

  it("a fração de centavo do Medusa vira o centavo que o Pagar.me cobrou", () => {
    // A oferta dá 10% de R$ 52,45 = R$ 5,245: o pedido fica em R$ 123,355, e o Pix, em R$ 123,36.
    const cobrado = emCentavos(123.355) / 100
    expect(cobrado).toBe(123.36)
    expect(linhaDaLista(pedido({ total: 123.355 }, true), null, [], SEM_ERP).total).toBe(cobrado)
    expect(totalDo({ total: 0, credit_line_total: 123.355 })).toBe(cobrado)
  })

  it("a faixa do estorno que falhou diz quando a loja tenta de novo", () => {
    const o = pedido(
      {
        status: "canceled",
        metadata: {
          estornos: {
            pay_1: {
              situacao: "falhou",
              esperado: 7760,
              devolvido: 0,
              cobranca: "ch_1",
              forma: "pix",
              tentativas: 1,
              motivo: "faltou saldo no Pagar.me",
              proxima: depois(100),
              sozinha: true,
            },
          },
        },
      },
      true
    )
    const [faixa] = detalheDo(o, null, [], SEM_ERP, { verCpf: true }).faixas
    expect(faixa.titulo.replace(/\s/g, " ")).toBe("O estorno de R$ 77,60 não saiu")
    expect(faixa.texto).toContain("a próxima tentativa é às 13:40 de 24/09")
    // À vista, em poucas palavras; a frase inteira vai no "?" do painel.
    expect(faixa.etiquetas).toEqual(["de novo às 13:40"])
  })
})

describe("os botões do pedido", () => {
  const estorno = (extra: Record<string, unknown> = {}) =>
    pedido(
      {
        status: "canceled",
        metadata: {
          estornos: {
            pay_1: {
              situacao: "falhou",
              esperado: 7760,
              devolvido: 0,
              cobranca: "ch_1",
              forma: "pix",
              tentativas: 1,
              motivo: "faltou saldo no Pagar.me",
              proxima: depois(100),
              sozinha: true,
              ...extra,
            },
          },
        },
      },
      true
    )
  const DONO = { verCpf: true, nota: true, estorno: true }
  const OPERACAO = { verCpf: false, nota: true, estorno: false }

  it("o estorno que falhou: o botão só pro dono; a operação lê de quem é", () => {
    const doDono = detalheDo(estorno(), null, [], SEM_ERP, DONO)
    expect(doDono.acoes.estorno).toBe(true)
    expect(doDono.faixas[0]).toMatchObject({ botao: "estorno" })
    const daOperacao = detalheDo(estorno(), null, [], SEM_ERP, OPERACAO)
    expect(daOperacao.acoes.estorno).toBe(false)
    expect(daOperacao.faixas[0].botao).toBeUndefined()
    expect(daOperacao.faixas[0].rodape).toBe("Estorno é com o dono.")
  })

  it("o estorno parcial não tem botão: é pelo painel do Pagar.me", () => {
    const d = detalheDo(estorno({ sozinha: false, proxima: null }), null, [], SEM_ERP, DONO)
    expect(d.acoes.estorno).toBe(false)
    expect(d.faixas[0].botao).toBeUndefined()
    expect(d.faixas[0].texto).toContain("estorne pelo painel do Pagar.me, na cobrança ch_1")
    expect(d.faixas[0].etiquetas).toEqual(["no painel do Pagar.me"])
  })

  it("a loja parou de tentar sozinha: o texto diz, e o botão segue lá", () => {
    const d = detalheDo(estorno({ tentativas: 8, proxima: null }), null, [], SEM_ERP, DONO)
    expect(d.faixas[0].texto).toContain("A loja já pediu de novo 8 vezes e parou de tentar sozinha")
    expect(d.faixas[0].etiquetas).toEqual(["tentou 8×"])
    expect(d.faixas[0].botao).toBe("estorno")
  })

  it("o estorno que falhou e depois saiu vira faixa verde", () => {
    const d = detalheDo(
      estorno({ situacao: "devolvido", devolvido: 7760, desde: antes(300), confirmado: antes(20) }),
      null,
      [],
      SEM_ERP,
      DONO
    )
    expect(d.faixas).toEqual([
      {
        nivel: "info",
        titulo: "O estorno saiu",
        etiquetas: [expect.stringMatching(/^R\$\s77,60 de volta$/), "24/09"],
        texto: expect.stringMatching(
          /^O Pagar\.me confirmou em 24\/09, às 11:40: R\$\s77,60 voltaram/
        ),
      },
    ])
    expect(d.acoes.estorno).toBe(false)
  })

  it("a nota esperando a janela: “Emitir a nota agora”, com a hora que ela sairia", () => {
    const o = pedido(
      {
        payment_collections: [
          {
            payment_sessions: [sessao("pago")],
            payments: [{ provider_id: "pp_pagarme_pagarme", captured_at: antes(2) }],
          },
        ],
      },
      false
    )
    const d = detalheDo(o, nota(), [], COM_ERP, OPERACAO)
    expect(d.acoes.nota).toBe("agora")
    expect(d.acoes.dica).toMatch(/^Ela sai sozinha às 12:03\. Precisa despachar antes\?/)
    expect(d.acoes.saiAs).toBe("12:03")
    expect(d.pagamento).toMatchObject({ forma: "Pix", tipo: "pix" })
    const semBotao = detalheDo(o, nota(), [], COM_ERP, { verCpf: false })
    expect(semBotao.acoes.nota).toBeNull()
    expect(semBotao.acoes.saiAs).toBeNull()
  })

  it("a nota que a loja desistiu de emitir: a faixa diz por quê e tem o botão", () => {
    const d = detalheDo(
      pedido({}, true),
      nota({ definitivo: true, erro: "o pedido não tem CPF/CNPJ, e a nota precisa" }),
      [],
      COM_ERP,
      OPERACAO
    )
    expect(d.acoes.nota).toBe("de-novo")
    expect(d.faixas[0]).toEqual({
      nivel: "grave",
      titulo: "A nota não sai sozinha",
      etiquetas: ["sem CPF/CNPJ"],
      texto:
        "A loja desistiu de emitir: O pedido não tem CPF/CNPJ, e a nota precisa. Corrija o que falta e tente de novo — ou emita à mão no Bling.",
      botao: "nota",
    })
  })

  it("a nota que passou dos 3 dias: a faixa manda conferir no Bling antes de tentar de novo", () => {
    const d = detalheDo(
      pedido({}, true),
      nota({
        definitivo: true,
        erro: "passaram 3 dias do pagamento sem a nota sair (o último erro: o Bling não respondeu (502))",
      }),
      [],
      COM_ERP,
      OPERACAO
    )
    expect(d.acoes.nota).toBe("de-novo")
    expect(d.problema).toBe("nota")
    expect(d.faixas[0]).toEqual({
      nivel: "grave",
      titulo: "A nota não sai sozinha",
      etiquetas: ["3 dias sem nota"],
      texto:
        "Passaram 3 dias do pagamento sem a nota sair (o último erro: o Bling não respondeu (502)). " +
        "A loja parou de tentar sozinha: confira no Bling se a nota já foi feita à mão. Se não foi, tente de novo — ou emita à mão no Bling.",
      botao: "nota",
    })
  })

  it("o pedido estornado mostra o total que foi cobrado, não o que sobrou (zero)", () => {
    // O estorno vira crédito no Medusa: o `total` cai pra zero, e o `credit_line_total` é o que voltou.
    const d = detalheDo(
      estorno({ situacao: "devolvido", devolvido: 7760 }),
      null,
      [],
      SEM_ERP,
      DONO
    )
    expect(d.total).toBe(128.6)
    const zerado = { ...estorno(), total: 0, credit_line_total: 128.6 }
    expect(detalheDo(zerado, null, [], SEM_ERP, DONO).totais.total).toBe(128.6)
    expect(linhaDaLista(zerado, null, [], SEM_ERP).total).toBe(128.6)
    // Com cupom: o que foi cobrado e voltou — nem zero, nem a conta de antes do desconto.
    const doMedusa = { total: 0, original_total: 128.6, credit_line_total: 118.11 }
    const comCupom = { ...estorno(), ...doMedusa }
    expect(detalheDo(comCupom, null, [], SEM_ERP, DONO).totais.total).toBe(118.11)
    expect(linhaDaLista(comCupom, null, [], SEM_ERP).total).toBe(118.11)
  })

  it("o que a equipe fez entra no histórico, com o nome e na hora certa", () => {
    const d = detalheDo(pedido({}, true), null, [], SEM_ERP, DONO, [
      {
        em: antes(1),
        acao: "pediu-estorno",
        quem: "Matheus Santana",
        detalhe: { resultado: "pedido" },
      },
    ])
    const ultimo = d.historico[d.historico.length - 1]
    expect(ultimo).toMatchObject({
      quando: "hoje, 11:59",
      titulo: "Matheus Santana pediu o estorno de novo",
      detalhe: "o Pagar.me aceitou — confirma em minutos",
    })
  })

  it("quem copiou o Pix e chamou no WhatsApp entra no histórico", () => {
    const d = detalheDo(pedido(), null, [], SEM_ERP, DONO, [
      { em: antes(2), acao: "copiou-o-pix", quem: "Matheus Santana", detalhe: {} },
      { em: antes(1), acao: "chamou-no-whatsapp", quem: "Ana", detalhe: {} },
    ])
    expect(d.historico.slice(-2)).toEqual([
      expect.objectContaining({
        titulo: "Matheus Santana copiou o código do Pix",
        detalhe: "pra mandar pro cliente",
      }),
      expect.objectContaining({ titulo: "Ana chamou no WhatsApp", detalhe: "" }),
    ])
  })
})

describe("os e-mails do pedido no histórico, e se chegaram (0248)", () => {
  const SEM = { verCpf: false }
  /** Um aviso do Resend (`crm_email`), sem nada: cada teste diz o que aconteceu. */
  const aviso = (resend_id: string, extra: Partial<EmailLidoDoBanco> = {}) => ({
    resend_id,
    id: `eml_${resend_id}`,
    tipo: null,
    para: "rafael@exemplo.com",
    enviado_em: antes(20),
    entregue_em: null,
    atrasado_em: null,
    aberto_em: null,
    ultima_abertura_em: null,
    clicado_em: null,
    ultimo_clique_em: null,
    ultimo_link: null,
    devolvido_em: null,
    devolucao: null,
    reclamou_em: null,
    falhou_em: null,
    suprimido_em: null,
    ...extra,
  })
  const toque = (t: string, como: string, em: string, resend_id: string | null = null) => ({
    fluxo: t.split("-")[0],
    toque: t,
    como,
    em,
    resend_id,
  })
  const comEmails = (metadata: Record<string, unknown>) => pedido({ metadata }, true)

  it("o confirmado que voltou (o hotmail.con do #3355) diz que não chegou, em vermelho", () => {
    const o = comEmails({ emails: { confirmado: { em: antes(20), como: "email", id: "re_1" } } })
    const emails = {
      toques: [],
      avisos: [aviso("re_1", { devolvido_em: antes(19), devolucao: "Transient · General: 450" })],
    }
    const linha = detalheDo(o, null, [], SEM_ERP, SEM, [], emails).historico.find((e) =>
      e.titulo.startsWith('E-mail "Pedido #1042 confirmado"')
    )
    expect(linha).toMatchObject({
      titulo: 'E-mail "Pedido #1042 confirmado" enviado',
      detalhe: "não chegou · a caixa recusou por agora",
      alerta: true,
    })
  })

  it("o que chegou diz que chegou, sem vermelho; sem aviso do Resend, só o enviado", () => {
    const o = comEmails({
      emails: {
        confirmado: { em: antes(20), como: "email", id: "re_1" },
        cancelado: { em: antes(5), como: "email", id: "re_2" },
      },
    })
    const emails = { toques: [], avisos: [aviso("re_1", { entregue_em: antes(19) })] }
    const h = detalheDo(o, null, [], SEM_ERP, SEM, [], emails).historico
    const confirmado = h.find((e) => e.titulo.includes("confirmado"))
    expect(confirmado).toMatchObject({ detalhe: "chegou na caixa do cliente" })
    expect(confirmado).not.toHaveProperty("alerta")
    expect(h.find((e) => e.titulo.includes("cancelado"))).toEqual(
      expect.objectContaining({ titulo: 'E-mail "Pedido #1042 cancelado" enviado', detalhe: "" })
    )
  })

  it("os lembretes do Pix entram com o nome do toque e o que o Resend disse", () => {
    const emails = {
      toques: [toque("pix-vence", "enviado", antes(10), "re_3")],
      avisos: [aviso("re_3", { devolvido_em: antes(9), devolucao: "Permanent · General: 550" })],
    }
    const h = detalheDo(pedido(), null, [], SEM_ERP, SEM, [], emails).historico
    expect(h[h.length - 1]).toEqual({
      quando: "hoje, 11:50",
      em: antes(10),
      titulo: 'E-mail "Pix pendente · Vence em 15 minutos" enviado',
      detalhe: "não chegou · o endereço não aceita e-mail",
      alerta: true,
    })
  })

  it("o grupo de controle vira uma linha só; o pulado, o que está saindo e o fluxo que não existe, nenhuma", () => {
    const emails = {
      toques: [
        toque("pix-vence", "controle", antes(10)),
        toque("pix-24h", "controle", antes(5)),
        toque("pix-48h", "pulado", antes(4)),
        toque("jornada-chegou", "enviando", antes(3)),
        { fluxo: "nao-existe", toque: "x", como: "enviado", em: antes(2), resend_id: null },
      ],
      avisos: [],
    }
    const antesDele = detalheDo(pedido(), null, [], SEM_ERP, SEM).historico.length
    const h = detalheDo(pedido(), null, [], SEM_ERP, SEM, [], emails).historico
    expect(h).toHaveLength(antesDele + 1)
    expect(h[h.length - 1]).toMatchObject({
      titulo: 'Sem os e-mails do "Pix pendente"',
      detalhe: expect.stringContaining("grupo de controle"),
    })
  })

  it("a jornada entra também; o spam e o atraso dizem o que foi", () => {
    const emails = {
      toques: [
        toque("jornada-chegou", "enviado", antes(10), "re_4"),
        toque("jornada-7d", "enviado", antes(5), "re_5"),
      ],
      avisos: [
        aviso("re_4", { entregue_em: antes(9), reclamou_em: antes(8) }),
        aviso("re_5", { atrasado_em: antes(4) }),
      ],
    }
    const h = detalheDo(pedido({}, true), null, [], SEM_ERP, SEM, [], emails).historico.slice(-2)
    expect(h).toEqual([
      expect.objectContaining({
        titulo: 'E-mail "Jornada do resultado · Chegou! Como usar" enviado',
        detalhe: "chegou, e o cliente marcou como spam",
        alerta: true,
      }),
      expect.objectContaining({
        titulo: 'E-mail "Jornada do resultado · Como tá indo?" enviado',
        detalhe: "está atrasando",
      }),
    ])
  })

  it("o cancelamento e a devolução que o Resend recusou não saíram, em vermelho", () => {
    const o = comEmails({
      emails: {
        cancelado: { em: antes(6), como: "recusado", motivo: "endereço inválido" },
        devolvido: { em: antes(4), como: "recusado", motivo: "endereço inválido" },
      },
    })
    const h = detalheDo(o, null, [], SEM_ERP, SEM).historico
    expect(h.filter((e) => e.alerta)).toEqual([
      expect.objectContaining({
        titulo: "O e-mail de cancelamento não saiu",
        detalhe: "endereço inválido",
      }),
      expect.objectContaining({ titulo: "O e-mail da devolução não saiu" }),
    ])
  })

  it("o e-mail da devolução que saiu entra com o que o Resend disse", () => {
    const o = comEmails({ emails: { devolvido: { em: antes(4), como: "email", id: "re_6" } } })
    const emails = { toques: [], avisos: [aviso("re_6", { entregue_em: antes(3) })] }
    expect(detalheDo(o, null, [], SEM_ERP, SEM, [], emails).historico).toContainEqual(
      expect.objectContaining({
        titulo: 'E-mail "Pagamento devolvido" enviado',
        detalhe: "chegou na caixa do cliente",
      })
    )
  })

  it("os ids que o pedido guarda: o confirmado, o cancelado e o da devolução", () => {
    expect(
      idsDosEmailsDoPedido({
        emails: {
          confirmado: { em: antes(20), como: "email", id: "re_1" },
          cancelado: { em: antes(5), como: "recusado", motivo: "x" },
          devolvido: { em: antes(4), como: "email", id: "re_3" },
        },
      })
    ).toEqual(["re_1", "re_3"])
    expect(idsDosEmailsDoPedido(null)).toEqual([])
    expect(idsDosEmailsDoPedido({ emails: { confirmado: { em: "x", como: "email" } } })).toEqual([])
  })
})

describe("as etiquetas das faixas: o que fica à vista (a frase inteira vai no “?”)", () => {
  const SEM = { verCpf: false }

  it("o cartão em análise e o Pix vencido", () => {
    const analise = pedido({
      payment_collections: [
        { payment_sessions: [sessao("analise", { forma: "cartao", pix: null })] },
      ],
    })
    expect(detalheDo(analise, null, [], SEM_ERP, SEM).faixas).toEqual([
      expect.objectContaining({
        titulo: "Cartão em análise de fraude",
        etiquetas: ["valor só reservado"],
      }),
    ])
    expect(detalheDo(analise, null, [], SEM_ERP, SEM).pagamento.tipo).toBe("cartao")
    const vencido = pedido({
      payment_collections: [
        { payment_sessions: [sessao("aguardando", { pix: { expiraEm: antes(1) } })] },
      ],
    })
    expect(detalheDo(vencido, null, [], SEM_ERP, SEM).faixas[0]).toMatchObject({
      titulo: "O Pix venceu",
      etiquetas: ["cancela sozinho"],
    })
  })

  it("o pacote extraviado: a transportadora e o código", () => {
    const d = detalheDo(
      pedido({}, true),
      null,
      [{ situacao: "extraviado", transportadora: "Correios", codigo: "AB123BR" }],
      SEM_ERP,
      SEM
    )
    expect(d.faixas[0]).toMatchObject({
      titulo: "O pacote foi extraviado",
      etiquetas: ["Correios", "AB123BR"],
    })
  })

  it("a nota pra cancelar tem o prazo; a Frenet recusou fica só com o título e o “?”", () => {
    const d = detalheDo(
      pedido({ status: "canceled" }, true),
      nota({ situacao: "autorizada", cancelar: true }),
      [],
      SEM_ERP,
      SEM
    )
    expect(d.faixas[0]).toMatchObject({
      titulo: "A nota precisa ser cancelada no Bling",
      etiquetas: ["até 24 h da emissão"],
    })
    const recusado = pedido(
      {
        metadata: {
          fb_parceiro: {
            parceiro: "frenet",
            referencia: "FB-1042",
            entrou: false,
            em: antes(5),
            definitivo: true,
            erro: "CEP inválido",
            tentativas: 3,
          },
        },
      },
      true
    )
    const f = detalheDo(recusado, null, [], SEM_ERP, SEM).faixas
    expect(f.find((x) => x.titulo === "A Frenet recusou o pedido")?.etiquetas).toEqual([])
  })

  it("o cancelado que a Frenet não deixou tirar: problema, faixa e o caminho dizem", () => {
    const ficou = pedido(
      {
        status: "canceled",
        metadata: {
          fb_parceiro: {
            parceiro: "frenet",
            referencia: "FB-1042",
            entrou: true,
            id: "7",
            em: antes(120),
            tentativas: 1,
            erro_ao_tirar: "cancelar: 400 (etiqueta já gerada); apagar: 404.",
            tentativas_ao_tirar: 1,
            tentou_tirar_em: antes(5),
          },
        },
      },
      true
    )
    const d = detalheDo(ficou, null, [], SEM_ERP, SEM)
    expect(d.problema).toBe("frenet")
    expect(d.faixas.find((f) => f.titulo === "O pedido cancelado continua na Frenet")).toEqual({
      nivel: "grave",
      titulo: "O pedido cancelado continua na Frenet",
      etiquetas: ["FB-1042"],
      texto:
        "A loja não conseguiu tirar o FB-1042 do painel da Frenet: cancelar: 400 (etiqueta já gerada); apagar: 404. " +
        "Não gere a etiqueta dele — se já gerou, cancele a etiqueta lá. A loja segue tentando tirar sozinha por 7 dias depois do cancelamento.",
    })
    expect(d.caminho.find((p) => p.nome === "Na Frenet")).toMatchObject({
      estado: "erro",
      texto: "cancelado, e ainda lá",
    })
    // Tirado depois: o problema some.
    const tirado = pedido(
      {
        status: "canceled",
        metadata: {
          fb_parceiro: {
            ...(ficou.metadata as { fb_parceiro: Record<string, unknown> }).fb_parceiro,
            tirado_em: antes(1),
          },
        },
      },
      true
    )
    expect(detalheDo(tirado, null, [], SEM_ERP, SEM).problema).toBeNull()
  })

  it("a Frenet que a loja parou de tentar: não é recusa, e tem o “Mandar de novo”", () => {
    const parou = pedido(
      {
        metadata: {
          fb_parceiro: {
            parceiro: "frenet",
            referencia: "FB-1042",
            entrou: false,
            em: antes(60),
            definitivo: true,
            desistiu_em: antes(5),
            erro: "a Frenet não respondeu (502)",
            tentativas: 20,
          },
        },
      },
      true
    )
    const d = detalheDo(parou, null, [], SEM_ERP, { verCpf: false, frenet: true })
    expect(d.problema).toBe("frenet")
    expect(d.faixas[0]).toEqual({
      nivel: "grave",
      titulo: "O pedido não entrou na Frenet",
      etiquetas: ["3 dias tentando"],
      texto:
        "A loja tentou por 3 dias e parou. O último erro: A Frenet não respondeu (502). " +
        "Mande de novo; ou faça a etiqueta à mão no painel da Frenet — e aí não mande de novo, senão o pedido aparece duas vezes lá.",
      botao: "frenet",
    })
    expect(d.caminho.find((p) => p.nome === "Na Frenet")).toMatchObject({
      estado: "erro",
      texto: "parou de tentar",
    })
  })
})

describe("o Início", () => {
  const venda = (id: string, minutos: number, total: number, extra: Partial<PedidoCru> = {}) =>
    pedido(
      {
        id,
        total,
        created_at: antes(minutos + 1),
        payment_collections: [
          {
            payment_sessions: [sessao("pago")],
            payments: [{ provider_id: "pp_pagarme_pagarme", captured_at: antes(minutos) }],
          },
        ],
        ...extra,
      },
      false
    )

  const quem = (papel: Papel, matriz: Matriz = MATRIZ_PADRAO) => ({
    papel,
    areas: areasDo(matriz, papel),
  })

  const dados = () => ({
    pedidos: [
      venda("order_A", 10, 100),
      venda("order_B", 60 * 24 * 2, 50),
      venda("order_C", 20, 70, { status: "canceled" }),
      pedido({ id: "order_D" }),
      pedido({
        id: "order_E",
        metadata: {
          estornos: {
            pay_1: {
              situacao: "falhou",
              esperado: 5000,
              devolvido: 0,
              cobranca: "ch_9",
              forma: "pix",
              tentativas: 1,
            },
          },
        },
      }),
    ],
    notas: new Map<string, NotaCrua>(),
    envios: new Map(),
  })

  it("a nota que a loja desistiu de emitir: a fila diz por quê e que se tenta de novo no pedido", () => {
    const d = dados()
    d.notas.set(
      "order_A",
      nota({ definitivo: true, erro: "o pedido não tem CPF/CNPJ, e a nota precisa" })
    )
    const item = montarInicio(quem("operacao"), d, COM_ERP).fila.find((f) => f.icone === "nota")
    expect(item).toMatchObject({
      nivel: "grave",
      titulo: "A nota não sai sozinha",
      etiquetas: ["sem CPF/CNPJ"],
      quantos: 1,
      texto:
        "O pedido não tem CPF/CNPJ, e a nota precisa. Corrija o que falta e tente de novo, no pedido.",
      href: "/pedidos/order_A",
      pedidos: [{ numero: 1042, href: "/pedidos/order_A" }],
    })
  })

  it("a Frenet que a loja parou de tentar tem o item dela, separado da recusa", () => {
    const d = dados()
    d.pedidos[0] = venda("order_A", 10, 100, {
      metadata: {
        fb_parceiro: {
          parceiro: "frenet",
          referencia: "FB-1042",
          entrou: false,
          em: antes(60),
          definitivo: true,
          desistiu_em: antes(5),
          erro: "a Frenet não respondeu (502)",
          tentativas: 20,
        },
      },
    })
    const fila = montarInicio(quem("operacao"), d, SEM_ERP).fila
    expect(fila.find((f) => f.chave === "frenet")).toBeUndefined()
    expect(fila.find((f) => f.chave === "frenet-parou")).toMatchObject({
      nivel: "grave",
      titulo: "Não entrou na Frenet",
      etiquetas: ["3 dias tentando"],
      quantos: 1,
      texto:
        "O último erro: a Frenet não respondeu (502). A loja tentou por 3 dias e parou: mande de novo, no pedido — ou faça a etiqueta à mão no painel da Frenet.",
    })
  })

  it("o cancelado que ficou na Frenet entra na fila: não gerar a etiqueta", () => {
    const d = dados()
    d.pedidos[2] = venda("order_C", 20, 70, {
      status: "canceled",
      metadata: {
        fb_parceiro: {
          parceiro: "frenet",
          referencia: "FB-1043",
          entrou: true,
          id: "8",
          em: antes(60),
          tentativas: 1,
          erro_ao_tirar: "cancelar: 500; apagar: 500",
          tentativas_ao_tirar: 1,
          tentou_tirar_em: antes(5),
        },
      },
    })
    expect(
      montarInicio(quem("operacao"), d, SEM_ERP).fila.find((f) => f.chave === "frenet-cancelado")
    ).toMatchObject({
      nivel: "grave",
      titulo: "Cancelado, e ainda na Frenet",
      quantos: 1,
      texto:
        "A Frenet não deixou tirar o FB-1043. Não gere a etiqueta — se já gerou, cancele lá. A loja segue tentando tirar sozinha.",
    })
  })

  it("as notas que passaram dos 3 dias viram um item só, que manda conferir no Bling", () => {
    const d = dados()
    d.notas.set(
      "order_A",
      nota({ definitivo: true, erro: "passaram 3 dias do pagamento sem a nota sair" })
    )
    const item = montarInicio(quem("operacao"), d, COM_ERP).fila.find((f) => f.icone === "nota")
    expect(item).toMatchObject({
      nivel: "grave",
      titulo: "A nota não sai sozinha",
      etiquetas: ["3 dias sem nota"],
      texto:
        "Passaram 3 dias do pagamento sem a nota sair. Confira no Bling se a nota já foi feita à mão; se não, tente de novo, no pedido.",
    })
  })

  it("venda é pedido pago: hoje, a semana e o ticket", () => {
    const i = montarInicio(quem("dono"), dados(), SEM_ERP)
    expect(i.numeros.vendasHoje).toEqual({ valor: 100, pedidos: 1 })
    expect(i.numeros.semana).toEqual({ valor: 150, pedidos: 2, ticket: 75 })
    expect(i.numeros.esperando).toEqual({ valor: 257.2, pix: 2, analise: 0 })
    expect(i.grafico).toHaveLength(7)
    expect(i.grafico[6]).toMatchObject({ hoje: true, valor: 100, pedidos: 1 })
  })

  it("a venda conta o cobrado, com o cupom descontado — não a conta de antes dele", () => {
    const doMedusa = { original_total: 100, discount_total: 10 }
    const i = montarInicio(
      quem("dono"),
      { pedidos: [venda("order_A", 10, 90, doMedusa)], notas: new Map(), envios: new Map() },
      SEM_ERP
    )
    expect(i.numeros.vendasHoje).toEqual({ valor: 90, pedidos: 1 })
  })

  it("o estorno que falhou só aparece pro dono (no padrão)", () => {
    const titulos = (papel: "dono" | "operacao") =>
      montarInicio(quem(papel), dados(), SEM_ERP).fila.map((f) => f.titulo)
    expect(titulos("dono").some((t) => t.startsWith("O estorno"))).toBe(true)
    expect(titulos("operacao").some((t) => t.startsWith("O estorno"))).toBe(false)
    const despachar = montarInicio(quem("operacao"), dados(), SEM_ERP).fila[0]
    expect(despachar).toMatchObject({
      titulo: "Pra despachar",
      quantos: 2,
      etiquetas: ["2 prontos pra etiqueta"],
      href: "/pedidos?filtro=despachar",
    })
  })

  it("o marketing recebe números e produtos, sem nenhum nome de cliente", () => {
    const i = montarInicio(
      quem("marketing"),
      { ...dados(), newsletter: { semana: 12, total: 214 }, rascunhos: 2 },
      SEM_ERP
    )
    expect(i.pedidosDeHoje).toBeNull()
    expect(i.fila.map((f) => f.titulo)).toEqual(["Produtos em rascunho", "Newsletter"])
    expect(i.fila[0]!.quantos).toBe(2)
    expect(i.fila[1]!.etiquetas).toEqual(["+12 esta semana", "214 no total"])
    expect(JSON.stringify(i)).not.toContain("Rafael")
    expect(i.maisVendidos[0]).toMatchObject({ nome: "Óleo 30ml", unidades: 4 })
  })

  it("a operação sem os Pedidos (o dono tirou) não recebe a fila nem os pedidos de hoje", () => {
    const semPedidos = matrizCom([{ papel: "operacao", area: "pedidos", abre: false }])
    const i = montarInicio(quem("operacao", semPedidos), dados(), SEM_ERP)
    expect(i.pedidosDeHoje).toBeNull()
    expect(i.fila).toEqual([])
    expect(JSON.stringify(i)).not.toContain("Rafael")
    // Os números seguem: vendas não têm nome de cliente.
    expect(i.numeros.vendasHoje).toEqual({ valor: 100, pedidos: 1 })
  })

  it("a operação com os Estornos (o dono deu) vê o estorno que falhou", () => {
    const comEstornos = matrizCom([{ papel: "operacao", area: "estornos", abre: true }])
    const titulos = montarInicio(quem("operacao", comEstornos), dados(), SEM_ERP).fila.map(
      (f) => f.titulo
    )
    expect(titulos.some((t) => t.startsWith("O estorno"))).toBe(true)
  })

  it("as avaliações esperando: pra quem abre a área delas, e só com alguma", () => {
    const estrela = (papel: Papel, extra: object, matriz: Matriz = MATRIZ_PADRAO) =>
      montarInicio(quem(papel, matriz), { ...dados(), ...extra }, SEM_ERP).fila.find(
        (f) => f.icone === "estrela"
      )
    expect(estrela("dono", { avaliacoes: 3 })).toEqual({
      chave: "avaliacoes",
      nivel: "atencao",
      icone: "estrela",
      titulo: "Avaliações esperando",
      texto:
        "Chegaram de quem comprou, pela página de avaliação. Aprovada, a avaliação vai pro site.",
      href: "/avaliacoes",
      quantos: 3,
    })
    expect(estrela("marketing", { avaliacoes: 1 })?.quantos).toBe(1)
    expect(estrela("operacao", { avaliacoes: 2 })?.quantos).toBe(2)
    expect(estrela("dono", { avaliacoes: 0 })).toBeUndefined()
    expect(estrela("dono", {})).toBeUndefined()
    const semAvaliacoes = matrizCom([{ papel: "operacao", area: "avaliacoes", abre: false }])
    expect(estrela("operacao", { avaliacoes: 2 }, semAvaliacoes)).toBeUndefined()
  })

  it("o marketing com os Pedidos (o dono deu) recebe a fila dos pedidos junto da dele", () => {
    const comPedidos = matrizCom([{ papel: "marketing", area: "pedidos", abre: true }])
    const i = montarInicio(
      quem("marketing", comPedidos),
      { ...dados(), newsletter: { semana: 12, total: 214 }, rascunhos: 2 },
      SEM_ERP
    )
    expect(i.pedidosDeHoje).not.toBeNull()
    // O Pix esperando (0186) entra junto dos outros de pagamento, depois do que pede alguém.
    expect(i.fila.map((f) => f.titulo)).toEqual([
      "Pra despachar",
      "Produtos em rascunho",
      "Pix esperando",
      "Newsletter",
    ])
    expect(i.fila.some((f) => f.titulo.startsWith("O estorno"))).toBe(false)
  })
})

describe("o Início lê o total só de quem entra num número em reais", () => {
  const DIA = 24 * 60
  const pago = (id: string, minutosAtras: number) =>
    pedido({
      id,
      created_at: antes(minutosAtras + 5),
      payment_collections: [
        {
          payment_sessions: [sessao("pago")],
          payments: [{ provider_id: "pp_pagarme_pagarme", captured_at: antes(minutosAtras) }],
        },
      ],
    })

  it("os pagos da semana, o que espera pagamento e os de hoje; o pago antigo, não", () => {
    const pedidos = [
      pago("order_hoje", 30),
      pago("order_semana", 6 * DIA),
      pago("order_velho", 20 * DIA),
      // Pix esperando, feito há 10 min: entra no "Esperando pagamento".
      pedido({ id: "order_pix" }),
      // Cartão em análise há 12 dias: segue esperando, e o valor dele aparece.
      pedido({
        id: "order_analise",
        created_at: antes(12 * DIA),
        payment_collections: [
          { payment_sessions: [sessao("analise", { forma: "cartao" })], payments: [] },
        ],
      }),
      // Pix vencido há 20 dias: não é venda nem espera — fica sem o total.
      pedido({
        id: "order_vencido",
        created_at: antes(20 * DIA),
        payment_collections: [
          {
            payment_sessions: [sessao("aguardando", { pix: { expiraEm: antes(20 * DIA - 30) } })],
            payments: [],
          },
        ],
      }),
    ]
    expect(precisamDoTotal(pedidos, AGORA).sort()).toEqual(
      ["order_analise", "order_hoje", "order_pix", "order_semana"].sort()
    )
  })

  it("com o total só desses, os números do Início são os mesmos de antes", () => {
    const comTotal = [pago("order_1", 40), pago("order_2", 3 * DIA), pago("order_3", 30 * DIA)]
    const quem = { papel: "dono" as Papel, areas: areasDo(MATRIZ_PADRAO, "dono") }
    const vazio = { notas: new Map<string, NotaCrua>(), envios: new Map() }
    const antesDaMudanca = montarInicio(quem, { pedidos: comTotal, ...vazio }, SEM_ERP)
    const lidos = new Set(precisamDoTotal(comTotal, AGORA))
    const semOsOutros = comTotal.map((o) => (lidos.has(o.id) ? o : { ...o, total: undefined }))
    const depois = montarInicio(quem, { pedidos: semOsOutros, ...vazio }, SEM_ERP)
    expect(depois.numeros).toEqual(antesDaMudanca.numeros)
    expect(depois.grafico).toEqual(antesDaMudanca.grafico)
  })
})

describe("a fila do Início junta o que é igual (0148)", () => {
  const quem = { papel: "dono" as Papel, areas: areasDo(MATRIZ_PADRAO, "dono") }
  const semNota = (id: string, numero: number, minutos: number) =>
    pedido(
      {
        id,
        display_id: numero,
        created_at: antes(minutos),
        payment_collections: [
          {
            payment_sessions: [sessao("pago")],
            payments: [{ provider_id: "pp_pagarme_pagarme", captured_at: antes(minutos - 1) }],
          },
        ],
      },
      false
    )

  it("três notas pelo mesmo motivo viram um item, do mais antigo pro mais novo", () => {
    const pedidos = [
      semNota("order_B", 12, 30),
      semNota("order_A", 11, 90),
      semNota("order_C", 13, 10),
    ]
    const notas = new Map<string, NotaCrua>(
      pedidos.map((o) => [
        o.id,
        nota({ definitivo: true, erro: "o pedido não tem CPF/CNPJ, e a nota precisa" }),
      ])
    )
    const fila = montarInicio(quem, { pedidos, notas, envios: new Map() }, COM_ERP).fila
    const notasDaFila = fila.filter((f) => f.icone === "nota")
    expect(notasDaFila).toHaveLength(1)
    expect(notasDaFila[0]).toMatchObject({
      titulo: "A nota não sai sozinha",
      quantos: 3,
      etiquetas: ["sem CPF/CNPJ"],
      href: "/pedidos?filtro=problemas",
      texto:
        "O pedido não tem CPF/CNPJ, e a nota precisa. Corrija o que falta e tente de novo, no pedido.",
    })
    expect(notasDaFila[0]!.pedidos?.map((p) => p.numero)).toEqual([11, 12, 13])
  })

  it("motivos diferentes: um item por motivo; sem etiqueta, a frase vai inteira no texto", () => {
    const pedidos = [semNota("order_A", 11, 90), semNota("order_B", 12, 30)]
    const notas = new Map<string, NotaCrua>([
      ["order_A", nota({ definitivo: true, erro: "o pedido não tem CPF/CNPJ, e a nota precisa" })],
      ["order_B", nota({ definitivo: true, erro: "o Bling caiu de um jeito novo" })],
    ])
    const fila = montarInicio(quem, { pedidos, notas, envios: new Map() }, COM_ERP).fila
    const itens = fila.filter((f) => f.icone === "nota")
    expect(itens.map((f) => [f.quantos, f.etiquetas ?? null])).toEqual([
      [1, ["sem CPF/CNPJ"]],
      [1, null],
    ])
    expect(itens[1]!.texto).toBe(
      "O Bling caiu de um jeito novo. Corrija o que falta e tente de novo, no pedido."
    )
    expect(new Set(itens.map((f) => f.chave)).size).toBe(2)
  })

  it("os cartões em análise: um item, com a idade do mais antigo", () => {
    const analise = (id: string, numero: number, minutos: number) =>
      pedido({
        id,
        display_id: numero,
        created_at: antes(minutos),
        payment_collections: [
          {
            payment_sessions: [
              sessao("analise", { forma: "cartao" }, "authorized", antes(minutos)),
            ],
            payments: [],
          },
        ],
      })
    const pedidos = [analise("order_A", 21, 5), analise("order_B", 22, 70)]
    const fila = montarInicio(quem, { pedidos, notas: new Map(), envios: new Map() }, SEM_ERP).fila
    expect(fila.find((f) => f.icone === "cartao")).toMatchObject({
      titulo: "Cartão em análise",
      quantos: 2,
      // A idade do mais antigo e quanto espera (0186: era o número "Esperando pagamento").
      etiquetas: ["há 1 h 10", expect.stringMatching(/^R\$\s257,20$/)],
      href: "/pedidos?filtro=pagamento",
      pedidos: [
        { numero: 22, href: "/pedidos/order_B" },
        { numero: 21, href: "/pedidos/order_A" },
      ],
    })
  })

  it("o motivo curto de cada recusa conhecida da nota", () => {
    expect(motivoCurto("o pedido não tem CPF/CNPJ, e a nota precisa")).toBe("sem CPF/CNPJ")
    expect(motivoCurto("endereço incompleto (falta número)")).toBe("endereço incompleto")
    expect(motivoCurto("pedido sem endereço")).toBe("endereço incompleto")
    expect(motivoCurto('"Óleo" não tem SKU, e é por ele que o ERP acha o produto')).toBe(
      "produto sem SKU"
    )
    expect(motivoCurto("os valores do pedido não fecham (pago R$ 10, itens e frete R$ 12)")).toBe(
      "valores não fecham"
    )
    expect(motivoCurto("qualquer outra coisa")).toBeNull()
  })
})
