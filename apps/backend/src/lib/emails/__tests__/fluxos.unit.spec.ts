import { emailDoCrm } from "../crm"
import { emailDoFluxo, PORQUE_DA_COMPRA, type CompraDoFluxo } from "../fluxos"

/**
 * Os e-mails dos fluxos de compra: o assunto de cada toque, o botão que
 * volta pro checkout (com o cupom, quando tem), o Pix com o copia e cola, e
 * o pé dizendo que a pessoa começou uma compra.
 */

const LOJA = "https://www.fuckingbarba.com.br"
const compra = (extra: Partial<CompraDoFluxo> = {}): CompraDoFluxo => ({
  toque: "checkout-30min",
  para: "rafael@exemplo.com",
  nome: "Rafael",
  itens: [
    {
      nome: "Fator de Crescimento",
      handle: "fator-de-crescimento-para-barba",
      imagem: "https://cdn.exemplo/fator.jpg",
      preco: 79.9,
      precoCheio: 133.2,
      quantidade: 1,
    },
  ],
  numero: null,
  pix: null,
  cupom: null,
  voltar: "cart_01K6ABCDEFGHJKMNPQRSTVWXYZ.abc.assinatura",
  sair: { pagina: `${LOJA}/sair/xyz`, umClique: null },
  loja: { url: LOJA, whatsapp: "5547999990000", empresa: null, cnpj: null },
  ...extra,
})
const montar = (extra: Partial<CompraDoFluxo> = {}) => emailDoCrm(emailDoFluxo(compra(extra)))
const CUPOM = { codigo: "VOLTA-7KQ2MX", porcento: 10, ate: new Date("2026-09-29T18:30:00Z") }

describe("o checkout abandonado", () => {
  it("30 minutos: o botão volta pro checkout, com a campanha", () => {
    const e = montar()
    expect(e.assunto).toBe("Faltou só o pagamento")
    expect(e.html).toContain(
      `${LOJA}/voltar/cart_01K6ABCDEFGHJKMNPQRSTVWXYZ.abc.assinatura?utm_source=loja&amp;utm_medium=email&amp;utm_campaign=crm-checkout`
    )
    expect(e.html).toContain("Fator de Crescimento")
    expect(e.html).toContain(PORQUE_DA_COMPRA)
    expect(e.texto).toContain(PORQUE_DA_COMPRA)
    expect(e.html).not.toContain("aceitou receber ofertas")
  })

  it("4 horas: as dúvidas, e o WhatsApp só quando a loja tem", () => {
    expect(montar({ toque: "checkout-4h" }).assunto).toBe("Ficou alguma dúvida?")
    expect(montar({ toque: "checkout-4h" }).html).toContain("O nosso WhatsApp está no pé")
    const semWhats = montar({ toque: "checkout-4h", loja: { ...compra().loja, whatsapp: null } })
    expect(semWhats.html).toContain("A página de contato da loja")
  })

  it("24 horas: o cupom só da pessoa, e o botão leva o código", () => {
    const e = montar({ toque: "checkout-24h", cupom: CUPOM })
    expect(e.assunto).toBe("10% pra você fechar o pedido")
    expect(e.html).toContain("VOLTA-7KQ2MX")
    expect(e.html).toContain("10% no pedido")
    expect(e.html).toContain("Vale até 29/09, 15:30, uma vez.")
    expect(e.html).toContain(
      `${LOJA}/voltar/cart_01K6ABCDEFGHJKMNPQRSTVWXYZ.abc.assinatura?cupom=VOLTA-7KQ2MX&amp;utm_source=loja`
    )
  })

  it("24 horas sem cupom (já ganhou um há pouco): o lembrete, sem desconto", () => {
    const e = montar({ toque: "checkout-24h" })
    expect(e.assunto).toBe("Seu pedido ainda tá aqui")
    expect(e.html).not.toContain("VOLTA-")
    expect(e.html).not.toContain("?cupom=")
  })

  it("48 horas: a última, com o cupom que ainda vale ou sem", () => {
    expect(montar({ toque: "checkout-48h", cupom: CUPOM }).assunto).toBe(
      "Seu desconto de 10% vence em breve"
    )
    expect(montar({ toque: "checkout-48h" }).assunto).toBe("Última chamada pro seu pedido")
  })
})

describe("o Pix pendente", () => {
  const PIX = {
    codigo: "00020126580014br.gov.bcb.pix0136abc",
    imagem: "https://api.pagar.me/qr/abc.png",
    vence: new Date("2026-09-27T18:30:00Z"),
  }

  it("o aviso: a hora que vence, o copia e cola e o QR (só se for https)", () => {
    const e = montar({ toque: "pix-vence", numero: 3312, pix: PIX })
    expect(e.assunto).toBe("Seu Pix vence às 15:30")
    expect(e.html).toContain("00020126580014br.gov.bcb.pix0136abc")
    expect(e.html).toContain('src="https://api.pagar.me/qr/abc.png"')
    expect(e.html).toContain("do pedido #3312")
    expect(e.texto).toContain("00020126580014br.gov.bcb.pix0136abc")
    const semQr = montar({
      toque: "pix-vence",
      numero: 3312,
      pix: { ...PIX, imagem: "data:image/png;base64,AAAA" },
    })
    expect(semQr.html).not.toContain("data:image")
    expect(semQr.html).toContain("00020126580014br.gov.bcb.pix0136abc")
  })

  it("24 horas: o pedido venceu, e o botão refaz com o desconto", () => {
    const e = montar({
      toque: "pix-24h",
      numero: 3312,
      cupom: CUPOM,
      voltar: "order_01K6ABCDEFGHJKMNPQRSTVWXYZ.abc.assinatura",
    })
    expect(e.assunto).toBe("10% pra você refazer o pedido")
    expect(e.html).toContain("venceu e o pedido foi cancelado")
    expect(e.html).toContain("utm_campaign=crm-pix")
    expect(montar({ toque: "pix-24h", numero: 3312 }).assunto).toBe(
      "Refaz o seu pedido em 1 clique"
    )
  })
})
