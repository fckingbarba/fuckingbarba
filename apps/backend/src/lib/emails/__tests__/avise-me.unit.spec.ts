import { emailDeVolta, linkDoAviso, type ProdutoQueVoltou } from "../avise-me"
import { emReais } from "../moldura"

const LOJA = "https://fuckingbarba-loja.vercel.app"
const original = process.env.LOJA_URL

beforeEach(() => {
  process.env.LOJA_URL = LOJA
})
afterAll(() => {
  if (original === undefined) delete process.env.LOJA_URL
  else process.env.LOJA_URL = original
})

function produto(extra: Partial<ProdutoQueVoltou> = {}): ProdutoQueVoltou {
  return {
    nome: "Spray Modelador Matte para Cabelo",
    handle: "spray-modelador-matte-100ml-fucking-barba",
    imagem: "https://exemplo.supabase.co/storage/v1/object/public/p/spray.webp",
    preco: 49.9,
    precoCheio: 119.9,
    ...extra,
  }
}

describe("e-mail do avise-me", () => {
  it("o assunto diz que voltou e qual produto", () => {
    const e = emailDeVolta({ para: "rafael@exemplo.com", produto: produto() })
    expect(e.para).toBe("rafael@exemplo.com")
    expect(e.assunto).toBe("Voltou: Spray Modelador Matte para Cabelo")
  })

  it("o botão leva pro produto, com a campanha avise-me pro painel ver", () => {
    const link = linkDoAviso(LOJA, "spray-modelador-matte-100ml-fucking-barba")
    const url = new URL(link)
    expect(url.pathname).toBe("/produtos/spray-modelador-matte-100ml-fucking-barba")
    expect(url.searchParams.get("utm_medium")).toBe("email")
    expect(url.searchParams.get("utm_campaign")).toBe("avise-me")
    const e = emailDeVolta({ para: "r@exemplo.com", produto: produto() })
    expect(e.html).toContain(link.replace(/&/g, "&amp;"))
    expect(e.texto).toContain(link)
  })

  it("o preço de agora, e o riscado só com promoção", () => {
    const comPromo = emailDeVolta({ para: "r@exemplo.com", produto: produto() })
    expect(comPromo.html).toContain(emReais(49.9))
    expect(comPromo.html).toContain(`${emReais(119.9)}</s>`)
    expect(comPromo.texto).toContain(`(de ${emReais(119.9)})`)
    const semPromo = emailDeVolta({
      para: "r@exemplo.com",
      produto: produto({ precoCheio: null }),
    })
    expect(semPromo.html).not.toContain("<s ")
    expect(semPromo.texto).not.toContain("(de ")
  })

  it("sem preço, sem a linha — o e-mail sai do mesmo jeito", () => {
    const e = emailDeVolta({ para: "r@exemplo.com", produto: produto({ preco: null }) })
    expect(e.texto).not.toMatch(/R\$/)
    expect(e.html).toContain("Voltou pro estoque")
  })

  it("Instagram e TikTok no rodapé, sempre", () => {
    const e = emailDeVolta({ para: "r@exemplo.com", produto: produto() })
    expect(e.html).toContain("https://www.instagram.com/fuckingbarba")
    expect(e.html).toContain("https://www.tiktok.com/@fuckingbarba")
    delete process.env.LOJA_URL
    const semLoja = emailDeVolta({ para: "r@exemplo.com", produto: produto() })
    expect(semLoja.html).toContain("https://www.tiktok.com/@fuckingbarba")
  })

  it("diz que é um aviso só, e que o e-mail saiu da lista", () => {
    const e = emailDeVolta({ para: "r@exemplo.com", produto: produto() })
    expect(e.html).toContain("Foi o único aviso")
    expect(e.texto).toContain("Foi o único aviso")
  })

  it("sem LOJA_URL, sai sem botão (e sem link quebrado)", () => {
    delete process.env.LOJA_URL
    const e = emailDeVolta({ para: "r@exemplo.com", produto: produto() })
    expect(e.html).not.toContain("/produtos/")
    expect(e.texto).not.toContain("Comprar:")
  })

  it("escapa o nome do produto — ele vem do painel", () => {
    const e = emailDeVolta({
      para: "r@exemplo.com",
      produto: produto({ nome: 'Spray <a href="x">grátis</a>' }),
    })
    expect(e.html).not.toContain('<a href="x">')
    expect(e.html).toContain("Spray &lt;a href=&quot;x&quot;&gt;grátis&lt;/a&gt;")
  })
})
