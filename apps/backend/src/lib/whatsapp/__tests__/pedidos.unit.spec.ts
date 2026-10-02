import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CRM } from "../../../modules/crm"
import { ENVIOS } from "../../../modules/envios"
import { chaveDoTelefone } from "../regras"
import { daLojaAntiga, pedidoEmTexto, situacaoDoPedido, type PedidoNoWhatsapp } from "../pedidos"
import { usarFerramenta, type ContextoDasFerramentas } from "../ferramentas"

/**
 * A parte 2 do atendente: o telefone que casa com o do checkout, a situação
 * do pedido (a mesma da Minha conta), o texto que a IA lê e as ferramentas —
 * quem vê o quê, o Pix em mensagem separada, os limites.
 */

const AGORA = new Date("2026-10-01T15:00:00Z")
/** Um id do Medusa: o prefixo e um ULID (26 letras e números maiúsculos). */
const ulid = (s: string) => s.padEnd(26, "0")
const ID_DO_PIX = `order_${ulid("01K6PIX")}`
const ID_DO_OUTRO = `order_${ulid("01K6OUTRO")}`
const depois = (min: number) => new Date(AGORA.getTime() + min * 60_000).toISOString()

const pix = (situacao: string, expiraEm = depois(20)) => ({
  provider_id: "pp_pagarme_pagarme",
  status: "pending",
  data: {
    pagarme: {
      forma: "pix",
      situacao,
      valor: 12990,
      pix: { copiaECola: "00020126PIXDETESTE", imagem: "", expiraEm },
    },
  },
})

describe("o telefone", () => {
  it("o WhatsApp casa com o do checkout, com ou sem o 55, o nono dígito e a máscara", () => {
    const whatsapp = chaveDoTelefone("5511988887777")
    expect(whatsapp).toBe("1188887777")
    expect(chaveDoTelefone("+55 (11) 98888-7777")).toBe(whatsapp)
    expect(chaveDoTelefone("11988887777")).toBe(whatsapp)
    // O WhatsApp cadastrado antes do nono dígito vem sem ele.
    expect(chaveDoTelefone("551188887777")).toBe(whatsapp)
  })

  it("outro DDD com o mesmo final não casa; o que não é telefone, nada", () => {
    expect(chaveDoTelefone("+55 (21) 98888-7777")).not.toBe(chaveDoTelefone("5511988887777"))
    expect(chaveDoTelefone("123")).toBeNull()
    expect(chaveDoTelefone(null)).toBeNull()
  })
})

describe("a situação do pedido", () => {
  const base = { status: "pending", fulfillment_status: "not_fulfilled", envios: [] }

  it("o Pix que vale traz o copia e cola; o que passou da hora é 'vencido'", () => {
    expect(situacaoDoPedido({ ...base, sessoes: [pix("aguardando")] }, AGORA)).toEqual({
      situacao: "pix",
      pix: { codigo: "00020126PIXDETESTE", vence: new Date(depois(20)) },
      foiPago: false,
    })
    expect(
      situacaoDoPedido({ ...base, sessoes: [pix("aguardando", depois(-1))] }, AGORA).situacao
    ).toBe("vencido")
  })

  it("pago, enviado (pelo admin ou pela transportadora), entregue e cancelado", () => {
    expect(situacaoDoPedido({ ...base, sessoes: [pix("pago")] }, AGORA).situacao).toBe("pago")
    expect(
      situacaoDoPedido(
        { ...base, sessoes: [pix("pago")], envios: [{ situacao: "em_transito" }] },
        AGORA
      ).situacao
    ).toBe("enviado")
    expect(
      situacaoDoPedido({ ...base, fulfillment_status: "shipped", sessoes: [pix("pago")] }, AGORA)
        .situacao
    ).toBe("enviado")
    expect(
      situacaoDoPedido(
        { ...base, sessoes: [pix("pago")], envios: [{ situacao: "entregue" }] },
        AGORA
      ).situacao
    ).toBe("entregue")
    expect(
      situacaoDoPedido({ ...base, status: "canceled", sessoes: [pix("pago")] }, AGORA)
    ).toMatchObject({ situacao: "cancelado", foiPago: true })
    expect(
      situacaoDoPedido({ ...base, status: "canceled", sessoes: [pix("aguardando")] }, AGORA)
    ).toMatchObject({ situacao: "cancelado", foiPago: false })
  })

  it("o número da Nuvemshop é o de antes do 3301", () => {
    expect(daLojaAntiga(3194)).toBe(true)
    expect(daLojaAntiga(3301)).toBe(false)
  })
})

const pedido: PedidoNoWhatsapp = {
  id: "order_01",
  numero: 3305,
  email: "rafael@teste.com",
  feitoEm: new Date("2026-09-28T13:00:00Z"),
  itens: [{ nome: "Fator de Crescimento", quantidade: 2 }],
  total: 159.8,
  situacao: "enviado",
  foiPago: true,
  pix: null,
  envios: [
    {
      codigo: "AB123456789BR",
      url: "https://rastreio.exemplo/AB123456789BR",
      transportadora: "Correios",
      situacao: "em_transito",
      alerta: null,
      ultimo: { descricao: "Objeto em trânsito", local: "Curitiba/PR", quando: AGORA },
    },
  ],
}

describe("o pedido em texto", () => {
  it("pro dono: os produtos, o total, a situação e o rastreio", () => {
    const t = pedidoEmTexto(pedido, { dono: true })
    expect(t).toContain("Pedido #3305, feito em 28/09")
    expect(t).toContain("Produtos: 2x Fator de Crescimento")
    expect(t).toMatch(/Total: R\$\s159,80/)
    expect(t).toContain("Situação: enviado")
    expect(t).toContain(
      "Rastreio: AB123456789BR (Correios) — em trânsito — acompanhar: https://rastreio.exemplo/AB123456789BR"
    )
    expect(t).toContain("Último movimento: Objeto em trânsito, Curitiba/PR (01/10, 12:00)")
  })

  it("pra quem confirmou só com o número e o e-mail: sem os produtos nem o total", () => {
    const t = pedidoEmTexto(pedido, { dono: false })
    expect(t).not.toContain("Produtos")
    expect(t).not.toContain("Total")
    expect(t).toContain("Rastreio: AB123456789BR")
  })

  it("o cancelado diz se volta dinheiro; o atraso da transportadora aparece", () => {
    expect(pedidoEmTexto({ ...pedido, situacao: "cancelado", envios: [] }, { dono: true })).toMatch(
      /cancelado \(o valor pago é devolvido/
    )
    expect(
      pedidoEmTexto(
        { ...pedido, situacao: "cancelado", foiPago: false, envios: [] },
        { dono: true }
      )
    ).toMatch(/cancelado \(nada foi cobrado\)/)
    expect(
      pedidoEmTexto(
        { ...pedido, envios: [{ ...pedido.envios[0], alerta: "atrasado" }] },
        { dono: true }
      )
    ).toContain("ATRASADO")
  })
})

/* ── as ferramentas, com um Medusa de mentira ───────────────────────────── */

type PedidoCru = Record<string, unknown>

function contexto(pedidos: PedidoCru[], extra: Partial<ContextoDasFerramentas> = {}) {
  const graph = async ({
    entity,
    filters,
  }: {
    entity: string
    filters: Record<string, unknown>
  }) => {
    if (entity !== "order") return { data: [] }
    if (filters.id)
      return { data: pedidos.filter((p) => (filters.id as string[]).includes(String(p.id))) }
    return { data: pedidos.filter((p) => String(p.display_id) === filters.display_id) }
  }
  const container = {
    resolve: (chave: string) => {
      if (chave === ContainerRegistrationKeys.QUERY) return { graph }
      if (chave === ENVIOS) return { listEnvios: async () => [] }
      if (chave === CRM) return { pedidosDaBase: async () => [] }
      throw new Error(`o teste não tem ${chave}`)
    },
  }
  const ctx: ContextoDasFerramentas = {
    container: container as never,
    telefone: "5511988887777",
    cliente: { nome: "Rafael", email: "rafael@teste.com", clienteId: null, pedidos: [ID_DO_PIX] },
    loja: "https://www.fuckingbarba.com.br",
    agora: AGORA,
    depois: [],
    ...extra,
  }
  return ctx
}

const pedidoDoPix: PedidoCru = {
  id: ID_DO_PIX,
  display_id: 3310,
  email: "rafael@teste.com",
  status: "pending",
  created_at: AGORA.toISOString(),
  total: 129.9,
  fulfillment_status: "not_fulfilled",
  items: [{ product_title: "Fator de Crescimento", quantity: 1 }],
  payment_collections: [{ payment_sessions: [pix("aguardando")] }],
  fulfillments: [],
}
const deOutraPessoa: PedidoCru = {
  ...pedidoDoPix,
  id: ID_DO_OUTRO,
  display_id: 3320,
  email: "maria@teste.com",
  payment_collections: [{ payment_sessions: [pix("pago")] }],
}

describe("as ferramentas do atendente", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "segredo-de-teste"
  })

  it("ver_meus_pedidos: os do telefone, com o aviso de que dá pra mandar o Pix", async () => {
    const r = await usarFerramenta("ver_meus_pedidos", {}, contexto([pedidoDoPix, deOutraPessoa]))
    expect(r?.conteudo).toContain("Pedido #3310")
    expect(r?.conteudo).toContain("esperando o pagamento do Pix")
    expect(r?.conteudo).toContain(
      "Se a pessoa pedir o código ou quiser pagar: mandar_codigo_do_pix. Se não, ofereça."
    )
    expect(r?.conteudo).not.toContain("#3320")
    // O código mesmo não vai pra IA: ele sai sozinho, pela outra ferramenta.
    expect(r?.conteudo).not.toContain("00020126PIXDETESTE")
  })

  it("mandar_codigo_do_pix: o código vai numa mensagem só dele, e só pro dono", async () => {
    const ctx = contexto([pedidoDoPix, deOutraPessoa])
    const r = await usarFerramenta("mandar_codigo_do_pix", { numero: 3310 }, ctx)
    expect(ctx.depois).toEqual(["00020126PIXDETESTE"])
    expect(r?.conteudo).toContain("mensagem separada")
    expect(r?.conteudo).not.toContain("00020126PIXDETESTE")
    const outro = contexto([pedidoDoPix, deOutraPessoa])
    expect((await usarFerramenta("mandar_codigo_do_pix", { numero: 3320 }, outro))?.erro).toBe(true)
    expect(outro.depois).toEqual([])
  })

  it("ver_pedido: o e-mail errado e o pedido que não existe respondem igual", async () => {
    const ctx = contexto([deOutraPessoa], { telefone: "5521911112222" })
    const errado = await usarFerramenta("ver_pedido", { numero: 3320, email: "x@y.com" }, ctx)
    const inexistente = await usarFerramenta("ver_pedido", { numero: 3999, email: "x@y.com" }, ctx)
    expect(errado?.conteudo).toBe(inexistente?.conteudo)
    const certo = await usarFerramenta(
      "ver_pedido",
      { numero: 3320, email: " Maria@Teste.com " },
      ctx
    )
    expect(certo?.conteudo).toContain("Pedido #3320")
    expect(certo?.conteudo).not.toContain("Produtos")
  })

  it("ver_pedido: o da loja antiga vai pra equipe; e as tentativas têm limite", async () => {
    const ctx = contexto([deOutraPessoa], { telefone: "5531933334444" })
    expect(
      (await usarFerramenta("ver_pedido", { numero: 3100, email: "a@b.com" }, ctx))?.conteudo
    ).toMatch(/loja antiga.*equipe/)
    for (let i = 0; i < 5; i++)
      await usarFerramenta("ver_pedido", { numero: 3320, email: "chute@b.com" }, ctx)
    const sexta = await usarFerramenta(
      "ver_pedido",
      { numero: 3320, email: "maria@teste.com" },
      ctx
    )
    expect(sexta?.erro).toBe(true)
    expect(sexta?.conteudo).toMatch(/Muitas tentativas/)
  })

  it("refazer_pedido: só pro telefone da compra; o Pix que ainda vale não se refaz", async () => {
    const sem = contexto([pedidoDoPix], { cliente: null })
    expect((await usarFerramenta("refazer_pedido", { numero: 0 }, sem))?.erro).toBe(true)
    const pago = { ...pedidoDoPix, payment_collections: [{ payment_sessions: [pix("pago")] }] }
    const r = await usarFerramenta("refazer_pedido", { numero: 0 }, contexto([pago]))
    expect(r?.conteudo).toMatch(
      new RegExp(
        `https://www\\.fuckingbarba\\.com\\.br/voltar/repor-${ID_DO_PIX}\\.[0-9a-z]+\\.[\\w-]+\\?utm_source=whatsapp`
      )
    )
    const ainda = await usarFerramenta("refazer_pedido", { numero: 3310 }, contexto([pedidoDoPix]))
    expect(ainda?.conteudo).toMatch(/esperando o Pix/)
  })

  it("cotar_frete: o CEP torto volta pra IA sem ir à Frenet; ferramenta que não é daqui, null", async () => {
    const r = await usarFerramenta("cotar_frete", { cep: "123", itens: [] }, contexto([]))
    expect(r).toMatchObject({ erro: true })
    expect(await usarFerramenta("chamar_a_equipe", {}, contexto([]))).toBeNull()
  })
})
