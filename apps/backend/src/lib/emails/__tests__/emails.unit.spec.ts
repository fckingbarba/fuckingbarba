import { emailDoCodigo } from "../codigo"
import { emailDoEnvio, type EnvioDoAviso, type PedidoDoAviso } from "../envio"
import { emReais, esc, urlDaLoja } from "../moldura"
import { emailDePedidoConfirmado, rotuloDaEntrega, type PedidoDoEmail } from "../pedido-confirmado"

const LOJA = "https://fuckingbarba-loja.vercel.app"
const original = process.env.LOJA_URL

beforeEach(() => {
  process.env.LOJA_URL = LOJA
})
afterAll(() => {
  if (original === undefined) delete process.env.LOJA_URL
  else process.env.LOJA_URL = original
})

function pedido(extra: Partial<PedidoDoEmail> = {}): PedidoDoEmail {
  return {
    id: "order_01ABC",
    numero: 1042,
    email: "rafael@exemplo.com",
    itens: [
      {
        nome: "Óleo para Barba 30ml",
        variante: null,
        imagem: "https://exemplo.supabase.co/storage/v1/object/public/p/oleo.webp",
        quantidade: 2,
        precoUnitario: 54.9,
        total: 109.8,
      },
    ],
    subtotal: 109.8,
    desconto: 0,
    frete: 0,
    total: 109.8,
    formaDeEntrega: "Entrega econômica",
    entrega: {
      nome: "Rafael Souza",
      linha1: "Rua das Palmeiras, 123",
      linha2: "Apto 42 — Centro",
      cidade: "Blumenau",
      uf: "SC",
      cep: "89036-370",
    },
    pagamento: { forma: "pix" },
    ...extra,
  }
}

describe("moldura", () => {
  it("escapa o que vem de fora", () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;")
  })

  it("escreve reais como a loja, com o espaço fixo", () => {
    // O espaço fixo (U+00A0) escrito por código: literal, ele é invisível no fonte.
    const fixo = String.fromCharCode(0xa0)
    expect(emReais(272.6)).toBe(`R$${fixo}272,60`)
  })

  it("só aceita LOJA_URL com http(s), e tira a barra do fim", () => {
    process.env.LOJA_URL = `${LOJA}/`
    expect(urlDaLoja()).toBe(LOJA)
    process.env.LOJA_URL = "fuckingbarba.com.br"
    expect(urlDaLoja()).toBeNull()
    delete process.env.LOJA_URL
    expect(urlDaLoja()).toBeNull()
  })
})

describe("e-mail do código", () => {
  it("leva o código no assunto, no HTML e no texto", () => {
    const e = emailDoCodigo({ para: "rafael@exemplo.com", codigo: "482917", minutos: 10 })
    expect(e.assunto).toBe("482917 é o seu código da FuckingBarba")
    expect(e.html).toContain(">482917<")
    expect(e.texto).toContain("482917")
    expect(e.texto).toContain("Vale por 10 minutos")
  })

  it("não tem link nenhum — nem no pé", () => {
    const e = emailDoCodigo({ para: "rafael@exemplo.com", codigo: "482917", minutos: 10 })
    expect(e.html).not.toMatch(/<a[\s>]/)
    expect(e.html).not.toContain("rafael@exemplo.com")
  })

  it("puxa a logo da loja, e vira texto sem LOJA_URL", () => {
    const com = emailDoCodigo({ para: "a@b.co", codigo: "123456", minutos: 10 })
    expect(com.html).toContain(`src="${LOJA}/email/logo.png"`)

    delete process.env.LOJA_URL
    const sem = emailDoCodigo({ para: "a@b.co", codigo: "123456", minutos: 10 })
    expect(sem.html).not.toMatch(/<img/)
    expect(sem.html).toContain("Fucking<span")
  })
})

describe("e-mail de pedido confirmado", () => {
  it("escapa nome de produto e endereço", () => {
    const e = emailDePedidoConfirmado({
      pedido: pedido({
        itens: [
          {
            nome: "<script>alert(1)</script>",
            variante: null,
            imagem: null,
            quantidade: 1,
            precoUnitario: 10,
            total: 10,
          },
        ],
        entrega: {
          nome: `<a href="https://golpe.exemplo">clique</a>`,
          linha1: "Rua 1",
          linha2: "",
          cidade: "Blumenau",
          uf: "SC",
          cep: "89036-370",
        },
      }),
      whatsapp: null,
    })
    expect(e.html).not.toContain("<script>")
    expect(e.html).toContain("&lt;script&gt;")
    expect(e.html).not.toContain(`href="https://golpe.exemplo"`)
  })

  it("assunto, número e a frase do obrigado", () => {
    const pix = emailDePedidoConfirmado({ pedido: pedido(), whatsapp: null })
    expect(pix.assunto).toBe("Pedido #1042 confirmado")
    expect(pix.html).toContain("Pix recebido. Já estamos separando o seu pedido.")

    const cartao = emailDePedidoConfirmado({
      pedido: pedido({
        pagamento: { forma: "cartao", bandeira: "Visa", final: "4242", parcelas: 1 },
      }),
      whatsapp: null,
    })
    expect(cartao.html).toContain("Pagamento aprovado no cartão Visa final 4242. Já estamos")
    expect(cartao.html).not.toContain("sem juros")
  })

  it("frete grátis escrito, desconto só quando há", () => {
    const sem = emailDePedidoConfirmado({ pedido: pedido(), whatsapp: null })
    expect(sem.html).toContain("Grátis")
    expect(sem.html).not.toContain("Desconto")

    const com = emailDePedidoConfirmado({
      pedido: pedido({ desconto: 15, frete: 12.5, total: 107.3 }),
      whatsapp: null,
    })
    expect(com.html).toContain("Desconto")
    expect(com.html).toContain(emReais(12.5))
    expect(com.html).toContain(emReais(107.3))
  })

  it("não repete 'Entrega' no rótulo do frete", () => {
    expect(rotuloDaEntrega("Entrega econômica")).toBe("Entrega econômica")
    expect(rotuloDaEntrega("PAC")).toBe("Entrega · PAC")
    expect(rotuloDaEntrega("")).toBe("Entrega")
  })

  it("WhatsApp com número na tela; sem ele, a frase do número do pedido", () => {
    const com = emailDePedidoConfirmado({ pedido: pedido(), whatsapp: "5547999990000" })
    expect(com.html).toContain(`href="https://wa.me/5547999990000"`)
    expect(com.html).toContain("(47) 99999-0000")

    const sem = emailDePedidoConfirmado({ pedido: pedido(), whatsapp: null })
    expect(sem.html).not.toContain("wa.me")
    expect(sem.texto).toContain("Guarde o número #1042")
  })

  it("o botão leva ao pedido na conta; sem LOJA_URL, não tem botão", () => {
    const com = emailDePedidoConfirmado({ pedido: pedido(), whatsapp: null })
    expect(com.html).toContain(`href="${LOJA}/conta/pedidos/order_01ABC"`)

    delete process.env.LOJA_URL
    const sem = emailDePedidoConfirmado({ pedido: pedido(), whatsapp: null })
    expect(sem.html).not.toContain("/conta/pedidos/")
    expect(sem.html).not.toMatch(/<img[^>]+\/email\//)
  })

  it("cabe no Gmail (corta acima de 102 KB) mesmo com dez produtos", () => {
    const p = pedido()
    const e = emailDePedidoConfirmado({
      pedido: { ...p, itens: Array.from({ length: 10 }, () => p.itens[0]) },
      whatsapp: "5547999990000",
    })
    expect(Buffer.byteLength(e.html)).toBeLessThan(102 * 1024)
  })

  it("a versão em texto tem o que importa", () => {
    const e = emailDePedidoConfirmado({ pedido: pedido(), whatsapp: null })
    expect(e.texto).toContain("pedido #1042 confirmado")
    expect(e.texto).toContain(`Total: ${emReais(109.8)}`)
    expect(e.texto).toContain("Blumenau/SC · 89036-370")
    expect(e.para).toBe("rafael@exemplo.com")
  })
})

describe("e-mails do caminho da encomenda", () => {
  const doAviso = (extra: Partial<PedidoDoAviso> = {}): PedidoDoAviso => {
    const p = pedido()
    return {
      id: p.id,
      numero: p.numero,
      email: p.email,
      itens: [{ nome: "Óleo para Barba 30ml", variante: null, quantidade: 2 }],
      entrega: p.entrega,
      ...extra,
    }
  }
  const envio = (extra: Partial<EnvioDoAviso> = {}): EnvioDoAviso => ({
    codigo: "QS123456789BR",
    url: "https://rastreio.frenet.com.br/COR/QS123456789BR",
    transportadora: "Correios",
    servico: "PAC",
    ...extra,
  })
  const montar = (momento: "enviado" | "saiu" | "retirar" | "entregue", e = envio()) =>
    emailDoEnvio({ momento, pedido: doAviso(), envio: e, whatsapp: null })

  it("cada momento com o seu assunto, e o código em todos", () => {
    expect(montar("enviado").assunto).toBe("Pedido #1042 a caminho")
    expect(montar("saiu").assunto).toBe("Pedido #1042 saiu pra entrega")
    expect(montar("retirar").assunto).toBe("Pedido #1042 esperando retirada")
    expect(montar("entregue").assunto).toBe("Pedido #1042 entregue")
    for (const m of ["enviado", "saiu", "retirar", "entregue"] as const) {
      const e = montar(m)
      expect(e.html).toContain(">QS123456789BR<")
      expect(e.texto).toContain("QS123456789BR")
      expect(e.para).toBe("rafael@exemplo.com")
    }
  })

  it("diz quem leva, e com quem está", () => {
    const e = montar("enviado")
    expect(e.html).toContain("Rastreio · Correios · PAC")
    expect(e.html).toContain("já está com os Correios")
    expect(montar("enviado", envio({ transportadora: null })).html).toContain(
      "já está com a transportadora"
    )
  })

  it("o link da transportadora só quando é http(s)", () => {
    expect(montar("enviado").html).toContain(
      `href="https://rastreio.frenet.com.br/COR/QS123456789BR"`
    )
    const falso = montar("enviado", envio({ url: "javascript:alert(1)" }))
    expect(falso.html).not.toContain("javascript:")
    expect(falso.html).not.toContain("Rastrear na transportadora")
    expect(montar("enviado", envio({ url: "#" })).html).not.toContain("Rastrear na transportadora")
  })

  it("cada momento com o bloco dele: endereço, agência ou trocas", () => {
    expect(montar("enviado").html).toContain("Pra onde vai")
    expect(montar("saiu").html).toContain("Precisa ter alguém no endereço")
    const retirar = montar("retirar")
    expect(retirar.html).toContain("Onde retirar")
    expect(retirar.html).not.toContain("Pra onde vai")
    const entregue = montar("entregue")
    expect(entregue.html).toContain(`href="${LOJA}/trocas"`)
    expect(entregue.html).toContain(`src="${LOJA}/email/confirmado.png"`)
    expect(montar("enviado").html).toContain(`src="${LOJA}/email/caminhao.png"`)
  })

  it("a trilha diz, em texto, o que já aconteceu", () => {
    expect(montar("enviado").html).toContain(
      `aria-label="Pedido feito, pagamento aprovado e enviado; falta entregar."`
    )
    expect(montar("entregue").html).toContain(
      `aria-label="Pedido feito, pago, enviado e entregue."`
    )
  })

  it("escapa o que vem de fora — do pedido e do parceiro", () => {
    const e = emailDoEnvio({
      momento: "enviado",
      pedido: doAviso({ itens: [{ nome: "<b>x</b>", variante: null, quantidade: 1 }] }),
      envio: envio({ codigo: "<script>", servico: `"><img src=x>` }),
      whatsapp: null,
    })
    expect(e.html).not.toContain("<script>")
    expect(e.html).not.toContain("<b>x</b>")
    expect(e.html).not.toContain(`"><img src=x>`)
  })

  it("o botão leva ao pedido na conta", () => {
    expect(montar("enviado").html).toContain(`href="${LOJA}/conta/pedidos/order_01ABC"`)
    delete process.env.LOJA_URL
    expect(montar("enviado").html).not.toContain("/conta/pedidos/")
  })
})
