import { emailDoCodigo } from "../codigo"
import { emailDoConvite } from "../convite"
import { emailDoEnvio, type EnvioDoAviso, type PedidoDoAviso } from "../envio"
import { emReais, esc, urlDaLoja } from "../moldura"
import { emailDaNotaComProblema, emailDaNotaParaConferir, emailDoPedidoParaDesfazer } from "../erp"
import {
  emailDePagamentoDevolvido,
  emailDePedidoCancelado,
  type CancelamentoDoEmail,
  type DevolucaoDoEmail,
} from "../pedido-cancelado"
import { emailDePedidoConfirmado, rotuloDaEntrega, type PedidoDoEmail } from "../pedido-confirmado"
import { emailDaTroca, emailDeEmailTrocado } from "../troca-de-email"

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

describe("e-mail do código do painel", () => {
  it("diz que é do painel, no assunto e no texto, e segue sem link", () => {
    const e = emailDoCodigo({
      para: "carla@loja.com",
      codigo: "482917",
      minutos: 10,
      onde: "painel",
    })
    expect(e.assunto).toBe("482917 é o seu código do painel da FuckingBarba")
    expect(e.texto).toContain("Digite na tela do painel pra entrar.")
    expect(e.texto).toContain("ninguém entra no painel")
    expect(e.html).not.toMatch(/<a[\s>]/)
  })
})

describe("e-mail do convite pro painel", () => {
  const original = process.env.DASHBOARD_URL
  afterEach(() => {
    if (original === undefined) delete process.env.DASHBOARD_URL
    else process.env.DASHBOARD_URL = original
  })

  it("diz quem chamou, o papel, o que ele abre e o prazo", () => {
    process.env.DASHBOARD_URL = "https://dashboard.fuckingbarba.com.br/"
    const e = emailDoConvite({
      para: "carla@loja.com",
      nome: "Carla Mendes",
      papel: "operacao",
      quem: "Matheus",
    })
    expect(e.assunto).toBe("Seu convite pro painel da FuckingBarba")
    expect(e.texto).toContain("Oi, Carla!")
    expect(e.texto).toContain(
      "Matheus te chamou pra equipe do painel da FuckingBarba, com o papel Operação."
    )
    expect(e.texto).toContain("Pedidos")
    expect(e.texto).not.toContain("Cupons")
    expect(e.texto).toContain("abra dashboard.fuckingbarba.com.br")
    expect(e.texto).toContain("O convite vale 7 dias")
    expect(e.html).toContain('href="https://dashboard.fuckingbarba.com.br/entrar"')
  })

  it("o link é só o endereço — sem e-mail, sem token", () => {
    process.env.DASHBOARD_URL = "https://dashboard.fuckingbarba.com.br"
    const e = emailDoConvite({
      para: "carla@loja.com",
      nome: "Carla",
      papel: "marketing",
      quem: "Matheus",
    })
    const links = [...e.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    expect(links.filter((l) => l.startsWith("https://dashboard"))).toEqual([
      "https://dashboard.fuckingbarba.com.br/entrar",
    ])
    expect(e.html).not.toContain("carla@loja.com")
  })

  it("sem DASHBOARD_URL, sai sem botão", () => {
    delete process.env.DASHBOARD_URL
    const e = emailDoConvite({
      para: "carla@loja.com",
      nome: "Carla",
      papel: "marketing",
      quem: "Matheus",
    })
    expect(e.html).not.toContain("Entrar no painel")
    expect(e.texto).toContain("abra o painel da loja")
  })

  it("escapa o nome de quem convidou e de quem foi convidado", () => {
    const e = emailDoConvite({
      para: "c@loja.com",
      nome: "<b>Carla</b>",
      papel: "dono",
      quem: "<i>M</i>",
    })
    expect(e.html).not.toContain("<b>Carla")
    expect(e.html).not.toContain("<i>M")
  })
})

describe("e-mails da troca de e-mail", () => {
  const codigo = () => emailDaTroca({ para: "novo@exemplo.com", codigo: "482917", minutos: 10 })
  const aviso = (whatsapp: string | null = "5547999990000") =>
    emailDeEmailTrocado({ para: "antigo@exemplo.com", novo: "novo@exemplo.com", whatsapp })

  it("o código vai no assunto — e o assunto não é o de entrar", () => {
    const e = codigo()
    expect(e.assunto).toBe("482917 é o código pra confirmar seu e-mail na FuckingBarba")
    expect(e.assunto).not.toMatch(/é o seu código/)
    expect(e.html).toContain(">482917<")
    expect(e.texto).toContain("482917")
    expect(e.texto).toContain("Vale por 10 minutos")
  })

  it("nenhum dos dois tem link", () => {
    for (const e of [codigo(), aviso(), aviso(null)]) expect(e.html).not.toMatch(/<a[\s>]/)
  })

  it("o aviso vai pro endereço antigo, com o novo escrito e o WhatsApp da loja", () => {
    const e = aviso()
    expect(e.para).toBe("antigo@exemplo.com")
    expect(e.html).toContain("<b>novo@exemplo.com</b>")
    expect(e.texto).toContain("novo@exemplo.com")
    expect(e.texto).toContain("WhatsApp (47) 99999-0000")
    expect(aviso(null).texto).toContain("no Instagram, @fuckingbarba")
  })

  it("escapa o e-mail novo", () => {
    const e = emailDeEmailTrocado({ para: "a@b.co", novo: '"><img src=x>@b.co', whatsapp: null })
    expect(e.html).not.toContain("<img src=x>")
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

describe("e-mail de pedido cancelado", () => {
  const cancelado = (extra: Partial<CancelamentoDoEmail> = {}): CancelamentoDoEmail => {
    const p = pedido()
    return {
      id: p.id,
      numero: p.numero,
      email: p.email,
      itens: p.itens,
      total: p.total,
      motivo: "estornado",
      estorno: { valor: 109.8, forma: "pix" },
      ...extra,
    }
  }
  const montar = (extra: Partial<CancelamentoDoEmail> = {}, whatsapp: string | null = null) =>
    emailDePedidoCancelado({ cancelamento: cancelado(extra), whatsapp })

  it("o assunto diz o estorno quando houve estorno", () => {
    expect(montar().assunto).toBe("Pedido #1042 cancelado e estornado")
    expect(montar({ motivo: "pix-vencido", estorno: null }).assunto).toBe("Pedido #1042 cancelado")
  })

  it("com dinheiro de volta, diz o valor e de onde ele vem", () => {
    const e = montar()
    expect(e.html).toContain("Cancelado, com o pagamento estornado.")
    expect(e.html).toContain(emReais(109.8))
    expect(e.html).toContain("voltam pra conta que pagou")

    const noCartao = montar({ estorno: { valor: 109.8, forma: "cartao" } })
    expect(noCartao.html).toContain("voltam pro mesmo cartão")
    expect(noCartao.html).toContain("quem manda no prazo")
  })

  it("nenhuma promessa de dia — o prazo é do banco", () => {
    for (const forma of ["pix", "cartao"] as const) {
      const e = montar({ estorno: { valor: 109.8, forma } })
      expect(e.html).not.toMatch(/\b(amanhã|hoje|em \d+ dias?\b)/i)
    }
  })

  it("sem cobrança, uma frase só — e nada de 'o seu dinheiro'", () => {
    const e = montar({ motivo: "sem-cobranca", estorno: null })
    expect(e.html).toContain("Cancelado antes do pagamento.")
    expect(e.html).toContain("Nada foi cobrado de você")
    expect(e.html).not.toContain("O seu dinheiro")
    expect(e.html).not.toContain("corre atrás")
  })

  it("Pix vencido convida a refazer; os outros, não", () => {
    expect(montar({ motivo: "pix-vencido", estorno: null }).html).toContain(
      "um Pix novo nasce na hora"
    )
    expect(montar().html).toContain("continuam à venda")
  })

  it("escapa nome de produto", () => {
    const e = montar({
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
    })
    expect(e.html).not.toContain("<script>")
    expect(e.html).toContain("&lt;script&gt;")
  })

  it("o botão volta pra loja; sem LOJA_URL, não tem botão", () => {
    expect(montar().html).toContain(`href="${LOJA}"`)
    delete process.env.LOJA_URL
    expect(montar().html).not.toMatch(/<a[^>]+class="fb-botao"/)
  })

  it("pedido sem itens não deixa cartão vazio", () => {
    const e = montar({ itens: [] })
    expect(e.html).not.toContain("O que estava no pedido")
    expect(e.texto).not.toContain("O QUE ESTAVA NO PEDIDO")
  })

  it("a versão em texto tem o que importa", () => {
    const e = montar({}, "5547999990000")
    expect(e.texto).toContain("pedido #1042 cancelado")
    expect(e.texto).toContain(`Total: ${emReais(109.8)}`)
    expect(e.texto).toContain("(47) 99999-0000")
    expect(e.para).toBe("rafael@exemplo.com")
  })
})

describe("e-mail do pagamento que chegou depois do cancelamento", () => {
  /*
    Quem recebe este já recebeu o de cancelamento, dizendo "Nada foi cobrado
    de você" — e depois pagou o QR que ainda valia. O e-mail precisa dizer o
    que mudou, sem desmentir o outro.
  */
  const devolucao = (extra: Partial<DevolucaoDoEmail> = {}): DevolucaoDoEmail => {
    const p = pedido()
    return {
      id: p.id,
      numero: p.numero,
      email: p.email,
      itens: p.itens,
      total: p.total,
      devolvido: { valor: 109.8, forma: "pix" },
      ...extra,
    }
  }
  const montar = (extra: Partial<DevolucaoDoEmail> = {}, whatsapp: string | null = null) =>
    emailDePagamentoDevolvido({ devolucao: devolucao(extra), whatsapp })

  it("o assunto diz o que houve com o dinheiro, e o número do pedido", () => {
    expect(montar().assunto).toBe("Pedido #1042: devolvemos o seu Pix")
    expect(montar({ devolvido: { valor: 109.8, forma: "cartao" } }).assunto).toBe(
      "Pedido #1042: devolvemos o seu pagamento"
    )
  })

  it("conta o que mudou depois do e-mail do cancelamento, sem desmenti-lo", () => {
    const e = montar()
    expect(e.html).toContain("O pagamento chegou depois do cancelamento.")
    expect(e.html).toContain("ainda não tinha sido pago — e foi isso que o e-mail do cancelamento")
    expect(e.html).toContain("O Pix foi pago depois")
    expect(e.html).not.toContain("Nada foi cobrado")
  })

  it("diz o valor e o caminho de volta — as mesmas frases do cancelado e estornado", () => {
    const e = montar()
    expect(e.html).toContain(emReais(109.8))
    expect(e.html).toContain("voltam pra conta que pagou")
    expect(e.html).toContain("corre atrás")

    const noCartao = montar({ devolvido: { valor: 109.8, forma: "cartao" } })
    expect(noCartao.html).toContain("voltam pro mesmo cartão")
    expect(noCartao.html).toContain("O pagamento no cartão entrou depois")
  })

  it("a prévia da caixa de entrada é o dinheiro", () => {
    const e = montar()
    expect(e.html).toMatch(/Os R\$\s109,80 do Pix voltam pra conta que pagou/)
  })

  it("nenhuma promessa de dia — o prazo é do banco", () => {
    for (const forma of ["pix", "cartao"] as const) {
      const e = montar({ devolvido: { valor: 109.8, forma } })
      expect(e.html).not.toMatch(/\b(amanhã|hoje|em \d+ dias?\b)/i)
    }
  })

  it("quem pagou queria os produtos: o caminho de volta pra loja", () => {
    const e = montar()
    expect(e.html).toContain("Ainda quer os produtos?")
    expect(e.html).toContain("um Pix novo nasce na hora")
    expect(e.html).toContain(`href="${LOJA}"`)
    expect(montar({ devolvido: { valor: 109.8, forma: "cartao" } }).html).not.toContain(
      "um Pix novo"
    )
  })

  it("escapa nome de produto", () => {
    const e = montar({
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
    })
    expect(e.html).not.toContain("<script>")
    expect(e.html).toContain("&lt;script&gt;")
  })

  it("pedido sem itens não deixa cartão vazio", () => {
    const e = montar({ itens: [] })
    expect(e.html).not.toContain("O que estava no pedido")
    expect(e.texto).not.toContain("O QUE ESTAVA NO PEDIDO")
  })

  it("cabe no Gmail (corta acima de 102 KB) mesmo com dez produtos", () => {
    const p = pedido()
    const e = montar({ itens: Array.from({ length: 10 }, () => p.itens[0]) })
    expect(Buffer.byteLength(e.html)).toBeLessThan(102 * 1024)
  })

  it("a versão em texto tem o que importa", () => {
    const e = montar({}, "5547999990000")
    expect(e.texto).toContain("pedido #1042: devolvemos o seu Pix")
    expect(e.texto).toContain("O Pix foi pago depois")
    expect(e.texto).toContain(`Os ${emReais(109.8)} do Pix voltam pra conta que pagou`)
    expect(e.texto).toContain(`Total: ${emReais(109.8)}`)
    expect(e.texto).toContain("(47) 99999-0000")
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

describe("a nota que não saiu (pra equipe)", () => {
  const antes = process.env.MEDUSA_BACKEND_URL
  beforeEach(() => {
    process.env.MEDUSA_BACKEND_URL = "https://api.exemplo.com"
  })
  afterAll(() => {
    if (antes === undefined) delete process.env.MEDUSA_BACKEND_URL
    else process.env.MEDUSA_BACKEND_URL = antes
  })
  const aviso = (jeito: "a-mao" | "acompanha" | "reconectar") =>
    emailDaNotaComProblema("equipe@exemplo.com", {
      erp: "Bling",
      pedidoId: "order_01ABC",
      numero: 14,
      motivo:
        "o Bling negou a permissão pro cliente (403): falta o escopo “Clientes e Fornecedores” no app",
      jeito,
    })

  it("falta permissão: marcar o escopo e conectar de novo — e NÃO emitir à mão", () => {
    const e = aviso("reconectar")
    expect(e.assunto).toBe("A nota do pedido #14 não saiu")
    expect(e.html).toContain("Clientes e Fornecedores")
    expect(e.html).toContain("Conectar de novo")
    expect(e.html).toContain("não emita à mão")
    expect(e.html).toContain('href="https://api.exemplo.com/app/erp"')
  })

  it("a loja desistiu: corrigir e tentar de novo pelo admin, ou emitir à mão", () => {
    const e = aviso("a-mao")
    expect(e.html).toContain("Tentar de novo")
    expect(e.html).toContain("emita a nota à mão no Bling")
  })

  it("a nota está no ERP: corrigir e reenviar lá, com o link do pedido", () => {
    expect(aviso("acompanha").html).toContain(
      'href="https://api.exemplo.com/app/orders/order_01ABC"'
    )
  })
})

describe("a nota que saiu com o cadastro antigo (pra equipe)", () => {
  it("diz o que conferir, e o que fazer se estiver errado", () => {
    const e = emailDaNotaParaConferir("equipe@exemplo.com", {
      erp: "Bling",
      pedidoId: "order_01ABC",
      numero: 15,
      motivo: "o cadastro do cliente no Bling não foi atualizado com este pedido (erro)",
    })
    expect(e.assunto).toBe("Confira a nota do pedido #15")
    expect(e.html).toContain("carta de correção")
    expect(e.html).toContain("em até 24 horas")
  })

  it("com a nota ainda na janela: dá tempo de corrigir o cadastro, e o e-mail diz até quando", () => {
    const e = emailDaNotaParaConferir("equipe@exemplo.com", {
      erp: "Bling",
      pedidoId: "order_01ABC",
      numero: 16,
      motivo: "o cadastro do cliente no Bling não foi atualizado com este pedido (erro)",
      notaEm: new Date("2026-09-23T20:05:00.000Z"),
    })
    expect(e.assunto).toBe("Confira a nota do pedido #16")
    expect(e.texto).toContain("sai depois de 23/09, 17:05")
    expect(e.texto).toContain("Corrija o cadastro do cliente no Bling antes de 23/09, 17:05")
    expect(e.texto).not.toContain("A nota fiscal do pedido #16 saiu")
  })
})

describe("o pedido cancelado que a loja não desfez no ERP (pra equipe)", () => {
  it("diz o que cancelar lá, e não manda emitir nada", () => {
    const e = emailDoPedidoParaDesfazer("equipe@exemplo.com", {
      erp: "Bling",
      pedidoId: "order_01ABC",
      numero: 16,
      referencia: "FB-16",
      motivo: "o Bling negou a permissão pro pedido de venda (403)",
    })
    expect(e.assunto).toBe("Cancele no Bling o pedido #16")
    expect(e.texto).toContain("Vendas → Pedidos de venda → FB-16")
    expect(e.texto).toContain("o Bling negou a permissão pro pedido de venda (403)")
    expect(e.texto).toContain("A loja segue tentando")
    expect(e.texto).not.toMatch(/emita/)
  })
})
