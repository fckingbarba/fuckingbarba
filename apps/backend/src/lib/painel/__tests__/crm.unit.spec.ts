import type { Etiquetas } from "../../crm/etiquetas"
import { AJUSTES_PADRAO } from "../../crm/ajustes"
import {
  emFraseDoCrm,
  emFraseDoEmail,
  fichaDoCrmDoCliente,
  montarTelaDaBase,
  pedidoDaBase,
  recomprasDaBase,
  type PedidoLidoDaBase,
  lerPeriodoDoCrm,
  montarEmailsDoCrm,
  montarFichaDoCrm,
  montarTelaDoCrm,
  pedidoDaPessoa,
  type EmailLidoDoBanco,
  type EmailsDaTela,
} from "../crm"
import type { PedidoCru } from "../pedido"

/**
 * A primeira tela do CRM: as anotações em frase, o e-mail mascarado, e todos
 * os tipos na ordem do caminho, com zero onde não houve nada.
 */

const OLEO = { variante: "variant_01", nome: "Óleo para barba", preco: 59.9, quantidade: 1 }
const FATOR = { variante: "variant_02", nome: "Fator de crescimento", preco: 89.9, quantidade: 2 }
const SEM_EMAILS: EmailsDaTela = {
  ligados: false,
  ultimoAviso: null,
  numeros: { enviados: 0, entregues: 0, abertos: 0, clicados: 0, naoChegaram: 0, reclamacoes: 0 },
  porTipo: [],
  ultimos: [],
}

describe("o período", () => {
  it("hoje, 7 ou 30 dias; o resto abre a semana", () => {
    expect(lerPeriodoDoCrm("hoje")).toBe("hoje")
    expect(lerPeriodoDoCrm("30d")).toBe("30d")
    expect(lerPeriodoDoCrm("90d")).toBe("7d")
    expect(lerPeriodoDoCrm(undefined)).toBe("7d")
  })
})

describe("cada anotação em frase", () => {
  it("de onde chegou, com o nome das origens do painel", () => {
    expect(emFraseDoCrm("visita", {})).toBe("chegou na loja · direto")
    expect(
      emFraseDoCrm("visita", {
        origem: {
          fonte: "ig",
          meio: "social",
          campanha: "black",
          conteudo: null,
          termo: null,
          de: null,
        },
      })
    ).toBe("chegou na loja · Instagram (black)")
    expect(
      emFraseDoCrm("visita", {
        origem: {
          fonte: null,
          meio: null,
          campanha: null,
          conteudo: null,
          termo: null,
          de: "google.com",
        },
      })
    ).toBe("chegou na loja · Google")
  })

  it("os produtos, a sacola e o checkout", () => {
    expect(emFraseDoCrm("produto_visto", { itens: [OLEO] })).toBe("viu Óleo para barba")
    expect(emFraseDoCrm("produto_lido", { itens: [OLEO] })).toBe(
      "ficou 1 minuto vendo Óleo para barba"
    )
    expect(emFraseDoCrm("video_assistido", { itens: [OLEO] })).toBe(
      "viu o vídeo de Óleo para barba"
    )
    expect(emFraseDoCrm("sacola_entrou", { itens: [FATOR, OLEO] })).toBe(
      "pôs 2× Fator de crescimento e mais 1 na sacola"
    )
    expect(emFraseDoCrm("sacola_saiu", { itens: [OLEO] })).toBe("tirou Óleo para barba da sacola")
    expect(emFraseDoCrm("checkout_comecou", { itens: [OLEO], valor: 59.9 })).toBe(
      "começou o checkout · R$\u00a059,90"
    )
    expect(emFraseDoCrm("entrega_escolhida", { frete: "PAC" })).toBe("escolheu a entrega · PAC")
    expect(emFraseDoCrm("pagamento_escolhido", { forma: "cartao", valor: 10 })).toBe(
      "escolheu cartão · R$\u00a010,00"
    )
    expect(emFraseDoCrm("pix_copiado", {})).toBe("copiou o Pix")
    expect(emFraseDoCrm("newsletter", null)).toBe("assinou a newsletter")
  })
})

describe("a tela", () => {
  it("todos os tipos na ordem, com zero; e-mail mascarado; tipo desconhecido fora", () => {
    const agora = new Date("2026-09-26T18:00:00Z")
    const tela = montarTelaDoCrm(
      {
        periodo: "hoje",
        emails: SEM_EMAILS,
        numeros: { visitantes: 3, identificados: 1, pessoas: 1, anotacoes: 5 },
        tipos: [
          { tipo: "sacola_entrou", vezes: 2, visitantes: 1 },
          { tipo: "visita", vezes: 3, visitantes: 3 },
        ],
        ultimos: [
          {
            id: "evt_2",
            tipo: "sacola_entrou",
            dados: { itens: [OLEO] },
            em: "2026-09-26T17:30:00Z",
            email: "rafael.souza@gmail.com",
          },
          { id: "evt_1", tipo: "coisa_velha", dados: null, em: agora, email: null },
          { id: "evt_0", tipo: "visita", dados: {}, em: "2026-09-26T17:00:00Z", email: null },
        ],
      },
      agora
    )
    expect(tela.tipos.map((t) => t.tipo)).toEqual([
      "visita",
      "produto_visto",
      "produto_lido",
      "video_assistido",
      "sacola_entrou",
      "sacola_saiu",
      "checkout_comecou",
      "contato_informado",
      "entrega_escolhida",
      "pagamento_escolhido",
      "pix_copiado",
      "newsletter",
      "conta_entrou",
    ])
    expect(tela.tipos[0]).toEqual({ tipo: "visita", nome: "Visitas", vezes: 3, visitantes: 3 })
    expect(tela.tipos[1]?.vezes).toBe(0)
    expect(tela.ultimos).toEqual([
      {
        id: "evt_2",
        tipo: "sacola_entrou",
        quando: "hoje, 14:30",
        quem: "r•••@gmail.com",
        oque: "pôs Óleo para barba na sacola",
      },
      {
        id: "evt_0",
        tipo: "visita",
        quando: "hoje, 14:00",
        quem: null,
        oque: "chegou na loja · direto",
      },
    ])
  })
})

describe("os e-mails da loja", () => {
  const AGORA = new Date("2026-09-27T18:00:00Z")
  const email = (extra: Partial<EmailLidoDoBanco>): EmailLidoDoBanco => ({
    id: "eml_1",
    tipo: "pedido-confirmado",
    para: "rafael.souza@gmail.com",
    enviado_em: "2026-09-27T17:00:00Z",
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

  it("o mais importante primeiro: spam, não chegou, clique, abertura, entrega", () => {
    expect(emFraseDoEmail(email({})).oque).toBe("“Pedido confirmado” saiu")
    expect(emFraseDoEmail(email({ entregue_em: "2026-09-27T17:00:05Z" })).oque).toBe(
      "recebeu “Pedido confirmado”"
    )
    const clicou = email({
      entregue_em: "2026-09-27T17:00:05Z",
      aberto_em: "2026-09-27T17:05:00Z",
      clicado_em: "2026-09-27T17:06:00Z",
      ultimo_clique_em: "2026-09-27T17:30:00Z",
      ultimo_link: "/conta/pedidos/:id",
    })
    expect(emFraseDoEmail(clicou)).toEqual({
      quando: "2026-09-27T17:30:00Z",
      oque: "clicou em “Pedido confirmado” · /conta/pedidos/:id",
      nivel: "bom",
    })
    expect(emFraseDoEmail({ ...clicou, reclamou_em: "2026-09-27T17:40:00Z" })).toMatchObject({
      oque: "marcou “Pedido confirmado” como spam",
      nivel: "ruim",
    })
  })

  it("não chegou, com o porquê em frase", () => {
    expect(
      emFraseDoEmail(
        email({
          tipo: "codigo-de-entrar",
          devolvido_em: "2026-09-27T17:00:03Z",
          devolucao: "Permanent · General: 550",
        })
      ).oque
    ).toBe("“Código de entrar” não chegou · o endereço não aceita e-mail")
    expect(
      emFraseDoEmail(
        email({ devolvido_em: "2026-09-27T17:00:03Z", devolucao: "Transient · MailboxFull" })
      ).oque
    ).toBe("“Pedido confirmado” não chegou · a caixa recusou por agora")
    expect(emFraseDoEmail(email({ tipo: null, suprimido_em: "2026-09-27T17:00:01Z" })).oque).toBe(
      "“Outro” não chegou · o endereço está bloqueado no Resend (já voltou ou reclamou antes)"
    )
    expect(
      emFraseDoEmail(email({ tipo: "envio-saiu", aberto_em: "2026-09-27T17:10:00Z" })).oque
    ).toBe("abriu “Saiu pra entrega”")
  })

  it("a tela: o nome de cada tipo, o e-mail mascarado e a hora do último aviso", () => {
    const tela = montarEmailsDoCrm(
      {
        ligados: true,
        ultimoAviso: new Date("2026-09-27T17:45:00Z"),
        numeros: {
          enviados: 2,
          entregues: 2,
          abertos: 1,
          clicados: 1,
          naoChegaram: 0,
          reclamacoes: 0,
        },
        porTipo: [
          {
            tipo: "pedido-confirmado",
            enviados: 1,
            entregues: 1,
            abertos: 1,
            clicados: 1,
            naoChegaram: 0,
            reclamacoes: 0,
          },
          {
            tipo: null,
            enviados: 1,
            entregues: 1,
            abertos: 0,
            clicados: 0,
            naoChegaram: 0,
            reclamacoes: 0,
          },
        ],
        ultimos: [
          email({ entregue_em: "2026-09-27T17:00:05Z", aberto_em: "2026-09-27T17:05:00Z" }),
        ],
      },
      AGORA
    )
    expect(tela.ultimoAviso).toBe("hoje, 14:45")
    expect(tela.porTipo.map((t) => t.nome)).toEqual(["Pedido confirmado", "Outro"])
    expect(tela.ultimos).toEqual([
      {
        id: "eml_1",
        quando: "hoje, 14:05",
        quem: "r•••@gmail.com",
        oque: "abriu “Pedido confirmado”",
        nivel: "bom",
      },
    ])
  })
})

describe("a ficha da pessoa", () => {
  const AGORA = new Date("2026-09-27T18:00:00Z")
  const ETIQUETAS: Etiquetas = {
    etapa: { valor: "em-risco", porque: "passou 20 dias do dia de comprar de novo (01/09)" },
    engajamento: { valor: "quente", porque: "clicou num e-mail da loja há 3 dias" },
    tratamento: { dia: 58, porque: "o primeiro Fator chegou em 31/07" },
    proximaCompra: {
      em: new Date("2026-09-01T12:00:00Z"),
      porque: "acaba o Fator de Crescimento",
      estimada: false,
    },
    cupom: { valor: null, porque: "ainda não comprou" },
  }
  const semNada = {
    etiquetas: ETIQUETAS,
    origem: null,
    primeiraVisita: null,
    eventos: [],
    emails: [],
    pedidos: [],
  }
  const umEmail = (extra: Partial<EmailLidoDoBanco>): EmailLidoDoBanco => ({
    id: "eml_1",
    tipo: "pedido-confirmado",
    para: "rafael.souza@gmail.com",
    enviado_em: null,
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

  it("as cinco etiquetas: o valor, o porquê e o tom", () => {
    const f = montarFichaDoCrm(semNada, AGORA)
    expect(f.etiquetas).toEqual([
      {
        chave: "etapa",
        nome: "Etapa",
        valor: "Em risco",
        porque: "passou 20 dias do dia de comprar de novo (01/09)",
        tom: "ruim",
      },
      {
        chave: "engajamento",
        nome: "Engajamento",
        valor: "Quente",
        porque: "clicou num e-mail da loja há 3 dias",
        tom: "bom",
      },
      {
        chave: "tratamento",
        nome: "Tratamento",
        valor: "Dia 58",
        porque: "o primeiro Fator chegou em 31/07",
        tom: null,
      },
      {
        chave: "proxima",
        nome: "Próxima compra",
        valor: "01/09",
        porque: "acaba o Fator de Crescimento — a data já passou",
        tom: "ruim",
      },
      {
        chave: "cupom",
        nome: "Sensível a cupom",
        valor: "—",
        porque: "ainda não comprou",
        tom: null,
      },
    ])

    const lead = montarFichaDoCrm(
      {
        ...semNada,
        etiquetas: {
          ...ETIQUETAS,
          etapa: { valor: "recorrente", porque: "2 pedidos pagos" },
          tratamento: { dia: null, porque: "não comprou o Fator de Crescimento" },
          proximaCompra: {
            em: new Date("2026-10-20T12:00:00Z"),
            porque: "acaba o Óleo",
            estimada: true,
          },
          cupom: { valor: true, porque: "3 das últimas 3 compras com cupom" },
        },
      },
      AGORA
    )
    expect(lead.etiquetas.map((e) => [e.valor, e.tom])).toEqual([
      ["Recorrente", "bom"],
      ["Quente", "bom"],
      ["—", null],
      ["20/10", null],
      ["Sim", null],
    ])
  })

  it("de onde chegou da primeira vez", () => {
    expect(montarFichaDoCrm(semNada, AGORA).origem).toBeNull()
    expect(
      montarFichaDoCrm(
        {
          ...semNada,
          origem: {
            fonte: "ig",
            meio: "social",
            campanha: "black",
            conteudo: null,
            termo: null,
            de: null,
          },
          primeiraVisita: "2026-09-12T15:00:00Z",
        },
        AGORA
      ).origem
    ).toBe("Instagram (black) · primeira visita em 12/09")
    // Visitou, mas sem link de campanha nem site que mandou: direto.
    expect(
      montarFichaDoCrm({ ...semNada, primeiraVisita: new Date("2026-09-12T15:00:00Z") }, AGORA)
        .origem
    ).toBe("Direto · primeira visita em 12/09")
  })

  it("o caminho: site, e-mails e compras juntos, do mais novo pro mais velho", () => {
    const f = montarFichaDoCrm(
      {
        ...semNada,
        eventos: [
          {
            id: "ev_2",
            tipo: "sacola_entrou",
            dados: { itens: [OLEO] },
            em: "2026-09-27T16:00:00Z",
            email: "rafael.souza@gmail.com",
          },
          {
            id: "ev_1",
            tipo: "visita",
            dados: {},
            em: "2026-09-26T12:00:00Z",
            email: "rafael.souza@gmail.com",
          },
          // Um tipo que a loja parou de anotar: fica fora.
          { id: "ev_0", tipo: "sumiu", dados: null, em: "2026-09-27T17:00:00Z", email: null },
        ],
        emails: [
          umEmail({ enviado_em: "2026-09-27T16:30:00Z", aberto_em: "2026-09-27T17:10:00Z" }),
        ],
        pedidos: [
          { id: "order_2", numero: "1002", pagoEm: new Date("2026-09-27T16:20:00Z"), total: 59.9 },
          // O que não foi pago não entra no caminho.
          { id: "order_3", numero: "1003", pagoEm: null, total: 89.9 },
        ],
      },
      AGORA
    )
    expect(f.caminho).toEqual([
      {
        id: "eml_1",
        tipo: "email",
        quando: "hoje, 14:10",
        oque: "abriu “Pedido confirmado”",
        nivel: "bom",
      },
      {
        id: "order_2",
        tipo: "pedido",
        quando: "hoje, 13:20",
        oque: "pagou o pedido #1002 · R$\u00a059,90",
        nivel: "bom",
      },
      {
        id: "ev_2",
        tipo: "sacola_entrou",
        quando: "hoje, 13:00",
        oque: "pôs Óleo para barba na sacola",
        nivel: null,
      },
      {
        id: "ev_1",
        tipo: "visita",
        quando: "ontem, 09:00",
        oque: "chegou na loja · direto",
        nivel: null,
      },
    ])
  })

  it("o caminho fica nas 25 mais novas", () => {
    const eventos = Array.from({ length: 30 }, (_, i) => ({
      id: `ev_${i}`,
      tipo: "visita",
      dados: {},
      em: new Date(AGORA.getTime() - i * 60_000),
      email: null,
    }))
    const f = montarFichaDoCrm({ ...semNada, eventos }, AGORA)
    expect(f.caminho).toHaveLength(25)
    expect(f.caminho[0].id).toBe("ev_0")
    expect(f.caminho[24].id).toBe("ev_24")
  })
})

describe("os pedidos na ficha do CRM", () => {
  const AGORA = new Date("2026-09-27T18:00:00Z")
  const pago = (extra: Partial<PedidoCru>): PedidoCru => ({
    id: "order_1",
    display_id: 1001,
    created_at: "2026-09-01T12:00:00Z",
    status: "completed",
    total: 129.9,
    items: [
      {
        id: "item_1",
        product_title: "Kit 2 Fator de Crescimento",
        product_handle: "kit-2-fator-de-crescimento-para-barba",
        variant_sku: "FBKIT05",
        quantity: 1,
        adjustments: [
          { code: "volta15", amount: 10 },
          { code: "BUMP-OLEO-1a2b", amount: 5 },
          { code: "PROMO-LEVE3", amount: 20 },
        ],
      },
      {
        id: "item_2",
        product_title: "Balm",
        product_handle: "balm-para-barba",
        quantity: 2,
        adjustments: [{ code: "VOLTA15", amount: 3 }],
      },
    ],
    payment_collections: [{ payments: [{ captured_at: "2026-09-01T12:05:00Z" }] }],
    fulfillments: [
      { id: "ful_1", delivered_at: "2026-09-06T15:00:00Z" },
      { id: "ful_0", delivered_at: "2026-09-20T15:00:00Z", canceled_at: "2026-09-02T10:00:00Z" },
    ],
    ...extra,
  })

  it("pago, entregue (o aviso mais tarde), os itens e só os cupons digitados", () => {
    const p = pedidoDaPessoa(pago({}), [{ entregue_em: "2026-09-07T11:00:00Z" }])
    expect(p).toEqual({
      id: "order_1",
      numero: "1001",
      pagoEm: new Date("2026-09-01T12:05:00Z"),
      entregueEm: new Date("2026-09-07T11:00:00Z"),
      cancelado: false,
      itens: [
        {
          handle: "kit-2-fator-de-crescimento-para-barba",
          sku: "FBKIT05",
          nome: "Kit 2 Fator de Crescimento",
          quantidade: 1,
        },
        { handle: "balm-para-barba", sku: null, nome: "Balm", quantidade: 2 },
      ],
      cupons: ["VOLTA15"],
    })
    // O envio cancelado não conta como entrega; sem aviso nenhum, não chegou.
    expect(pedidoDaPessoa(pago({ fulfillments: [] })).entregueEm).toBeNull()
    expect(pedidoDaPessoa(pago({ status: "canceled" })).cancelado).toBe(true)
    expect(pedidoDaPessoa(pago({ payment_collections: [] })).pagoEm).toBeNull()
  })

  it("a ficha inteira; sem a área dos pedidos, sem o número do pedido", () => {
    const entrada = {
      crm: {
        ultimoClique: null,
        ultimaVisita: null,
        origem: null,
        primeiraVisita: null,
        eventos: [],
        emails: [],
      },
      pedidos: [
        pago({
          fulfillments: [],
          payment_collections: [{ payments: [{ captured_at: "2026-09-25T12:00:00Z" }] }],
        }),
        pago({ id: "order_0", display_id: 1000, status: "canceled" }),
      ],
      envios: new Map(),
      newsletterDesde: null,
    }
    const comNumero = fichaDoCrmDoCliente({ ...entrada, comNumero: true }, AGORA)
    expect(comNumero.etiquetas[0]).toMatchObject({
      valor: "1ª compra",
      porque: "pagou o pedido #1001, que ainda não chegou",
    })
    // O cancelado fica fora do caminho.
    expect(comNumero.caminho).toEqual([
      {
        id: "order_1",
        tipo: "pedido",
        quando: "25/09, 09:00",
        oque: "pagou o pedido #1001 · R$\u00a0129,90",
        nivel: "bom",
      },
    ])
    const semNumero = fichaDoCrmDoCliente({ ...entrada, comNumero: false }, AGORA)
    expect(semNumero.etiquetas[0].porque).toBe("pagou o pedido, que ainda não chegou")
    expect(semNumero.caminho[0].oque).toBe("pagou o pedido · R$\u00a0129,90")
  })
})

describe("a base da Nuvemshop", () => {
  const AGORA = new Date("2026-09-27T18:00:00Z")
  const daBase = (extra: Partial<PedidoLidoDaBase>): PedidoLidoDaBase => ({
    numero: "5001",
    email: "rafael@exemplo.com",
    feitoEm: "2026-08-01T12:00:00Z",
    pagoEm: "2026-08-01T15:00:00Z",
    pagamento: "confirmado",
    envio: "entregue",
    total: 19480,
    cupom: "PRIMEIRACOMPRA",
    itens: [{ sku: "FBKIT04", nome: "Kit Hidratação", quantidade: 1, valor: 99.9 }],
    ...extra,
  })

  it("o pedido da loja antiga do jeito das etiquetas: pago, recusado e estornado", () => {
    expect(pedidoDaBase(daBase({}))).toEqual({
      id: "nuvemshop:5001",
      numero: "5001",
      pagoEm: new Date("2026-08-01T15:00:00Z"),
      entregueEm: null,
      cancelado: false,
      itens: [{ handle: null, sku: "FBKIT04", nome: "Kit Hidratação", quantidade: 1 }],
      cupons: ["PRIMEIRACOMPRA"],
      total: 194.8,
      daNuvemshop: true,
    })
    expect(pedidoDaBase(daBase({ pagamento: "recusado" })).pagoEm).toBeNull()
    expect(pedidoDaBase(daBase({ pagamento: "estornado" })).cancelado).toBe(true)
  })

  it("na ficha: a compra da Nuvemshop conta (recorrente) e aparece no caminho", () => {
    const ficha = fichaDoCrmDoCliente(
      {
        crm: {
          ultimoClique: null,
          ultimaVisita: null,
          origem: null,
          primeiraVisita: null,
          eventos: [],
          emails: [],
        },
        pedidos: [
          {
            id: "order_1",
            display_id: 1001,
            created_at: "2026-09-20T12:00:00Z",
            total: 79.9,
            items: [{ id: "i1", product_handle: "fator-de-crescimento-para-barba", quantity: 1 }],
            payment_collections: [{ payments: [{ captured_at: "2026-09-20T12:05:00Z" }] }],
          },
        ],
        envios: new Map(),
        newsletterDesde: null,
        comNumero: true,
        pedidosDaNuvemshop: [daBase({})],
      },
      AGORA
    )
    expect(ficha.etiquetas[0]).toMatchObject({ valor: "Recorrente", porque: "2 pedidos pagos" })
    expect(ficha.caminho.map((p) => p.oque)).toEqual([
      "pagou o pedido #1001 · R$\u00a079,90",
      "pagou o pedido #5001 na Nuvemshop · R$\u00a0194,80",
    ])
    const semNumero = fichaDoCrmDoCliente(
      {
        crm: {
          ultimoClique: null,
          ultimaVisita: null,
          origem: null,
          primeiraVisita: null,
          eventos: [],
          emails: [],
        },
        pedidos: [],
        envios: new Map(),
        newsletterDesde: null,
        comNumero: false,
        pedidosDaNuvemshop: [daBase({})],
      },
      AGORA
    )
    expect(semNumero.caminho[0].oque).toBe("pagou um pedido na Nuvemshop · R$\u00a0194,80")
  })

  it("a aba: os números e quem é quem na base, com os pedidos das duas lojas", () => {
    const tela = montarTelaDaBase(
      {
        resumo: {
          pessoas: 3,
          aceitam: 2,
          pedidos: 3,
          pagos: 2,
          vendidoCentavos: 27470,
          primeiroPedido: new Date("2026-01-30T15:00:00Z"),
          ultimoPedido: new Date("2026-08-01T12:00:00Z"),
          carrinhos: 1,
          importadoEm: new Date("2026-09-27T17:30:00Z"),
        },
        pessoas: [
          { email: "rafael@exemplo.com", aceitaOfertas: true, newsletterEm: null },
          { email: "ana@exemplo.com", aceitaOfertas: true, newsletterEm: null },
          { email: "joao@exemplo.com", aceitaOfertas: false, newsletterEm: null },
        ],
        pedidos: [
          daBase({}),
          // A Ana comprou em janeiro e sumiu: em risco há tempo, sem sinal — sunset.
          daBase({
            numero: "5002",
            email: "ana@exemplo.com",
            feitoEm: "2026-01-30T12:00:00Z",
            pagoEm: "2026-01-30T15:00:00Z",
            itens: [{ sku: "FBFCB01", nome: "Fator", quantidade: 1, valor: 79.9 }],
          }),
          daBase({ numero: "5003", email: "joao@exemplo.com", pagamento: "recusado" }),
        ],
        // O Rafael também comprou na loja nova: recorrente.
        pedidosDaLoja: new Map([
          [
            "rafael@exemplo.com",
            [
              {
                id: "order_1",
                numero: "1001",
                pagoEm: new Date("2026-09-20T12:00:00Z"),
                entregueEm: null,
                cancelado: false,
                itens: [],
                cupons: [],
              },
            ],
          ],
        ]),
        sinais: new Map(),
        ajustes: AJUSTES_PADRAO,
      },
      AGORA
    )
    expect(tela.vazia).toBe(false)
    expect(tela.numeros).toEqual({
      pessoas: 3,
      aceitam: 2,
      pedidos: 3,
      pagos: 2,
      vendido: 274.7,
      carrinhos: 1,
      primeiroPedido: "30/01/2026",
      ultimoPedido: "01/08/2026",
      importadoEm: "hoje, 14:30",
    })
    const etapa = (e: string) => tela.etapas.find((x) => x.etapa === e)
    expect(etapa("recorrente")).toMatchObject({ pessoas: 1, aceitam: 1 })
    expect(etapa("sunset")).toMatchObject({ pessoas: 1, aceitam: 1 })
    expect(etapa("lead")).toMatchObject({ pessoas: 1, aceitam: 0 })
    expect(tela.engajamento.map((e) => [e.valor, e.pessoas])).toEqual([
      ["quente", 1],
      ["morno", 0],
      ["frio", 2],
    ])
  })

  it("as recompras da base; sem pedido, nada", () => {
    expect(recomprasDaBase([])).toBeNull()
    const r = recomprasDaBase([
      daBase({
        numero: "1",
        feitoEm: "2026-01-01T12:00:00Z",
        itens: [{ sku: "FBFCB01", nome: "F", quantidade: 1, valor: 1 }],
      }),
      daBase({
        numero: "2",
        feitoEm: "2026-02-10T12:00:00Z",
        itens: [{ sku: "FBFCB01", nome: "F", quantidade: 1, valor: 1 }],
      }),
    ])
    expect(r?.fator).toEqual({ dias: 40, recompras: 1 })
  })
})
