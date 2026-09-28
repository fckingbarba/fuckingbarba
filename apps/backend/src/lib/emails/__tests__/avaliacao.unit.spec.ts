import { emailDePedirAvaliacao, linkDaAvaliacao, type ProdutoParaAvaliar } from "../avaliacao"

const LOJA = "https://fuckingbarba-loja.vercel.app"
const LINK = "order_01M3GF52GC3EB02F1NY7T95Y08.SuIXg0tRqxUpCugtO4KN32"
const original = process.env.LOJA_URL

beforeEach(() => {
  process.env.LOJA_URL = LOJA
})
afterAll(() => {
  if (original === undefined) delete process.env.LOJA_URL
  else process.env.LOJA_URL = original
})

const produtos: ProdutoParaAvaliar[] = [
  { id: "prod_01M3EJPC2SBR23EKZVK6HVGCP3", nome: "Balm Modelador", imagem: "https://x/balm.webp" },
  { id: "prod_01M3EJPC2SBR23EKZVK6HVGCP4", nome: "Óleo para Barba", imagem: null },
]

const email = (extra: Partial<Parameters<typeof emailDePedirAvaliacao>[0]> = {}) =>
  emailDePedirAvaliacao({
    para: "rafael@exemplo.com",
    numero: 591,
    primeiroNome: "Rafael",
    link: LINK,
    produtos,
    whatsapp: "5547988261551",
    ...extra,
  })

describe("o e-mail que pede a avaliação", () => {
  it("o assunto diz o pedido e pergunta", () => {
    const e = email()
    expect(e.para).toBe("rafael@exemplo.com")
    expect(e.assunto).toBe("Pedido #591: o que você achou?")
    expect(e.texto).toContain("Oi, Rafael!")
  })

  it("um botão por produto, com o link do pedido, o produto e a campanha", () => {
    const e = email()
    for (const p of produtos) {
      const link = linkDaAvaliacao(LOJA, LINK, p.id)
      const url = new URL(link)
      expect(url.pathname).toBe(`/avaliar/${LINK}`)
      expect(url.searchParams.get("produto")).toBe(p.id)
      expect(url.searchParams.get("utm_medium")).toBe("email")
      expect(url.searchParams.get("utm_campaign")).toBe("avaliacao")
      expect(e.html).toContain(link.replace(/&/g, "&amp;"))
      expect(e.texto).toContain(link)
    }
    expect(e.html.match(/>Avaliar&nbsp;/g)).toHaveLength(2)
  })

  it("o nome de produto vem de fora e passa pelo esc", () => {
    const e = email({ produtos: [{ ...produtos[0], nome: '<a href="x">Balm</a>' }] })
    expect(e.html).not.toContain('<a href="x">')
    expect(e.html).toContain("&lt;a href=&quot;x&quot;&gt;Balm&lt;/a&gt;")
  })

  it("diz o que acontece com a avaliação e aponta o WhatsApp pra quem teve problema", () => {
    const e = email()
    expect(e.texto).toContain("No site aparece o nome que você escolher")
    expect(e.html).toContain("https://wa.me/5547988261551")
    const semWhats = email({ whatsapp: null })
    expect(semWhats.html).toContain(`${LOJA}/contato`)
    expect(semWhats.html).not.toContain("wa.me")
  })

  it("o rodapé tem o Instagram e o TikTok, como todo e-mail da loja", () => {
    const e = email()
    expect(e.html).toContain("https://www.instagram.com/fuckingbarba")
    expect(e.html).toContain("https://www.tiktok.com/@fuckingbarba")
    expect(e.texto).toContain("https://www.tiktok.com/@fuckingbarba")
  })

  it("sem LOJA_URL o e-mail sai sem os botões, sem link quebrado", () => {
    delete process.env.LOJA_URL
    const e = email()
    expect(e.html).not.toContain("/avaliar/")
    expect(e.texto).not.toContain("Avaliar:")
  })
})
