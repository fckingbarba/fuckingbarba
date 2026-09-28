import { emailDoCrm } from "../crm"
import { emailDaPrimeiraCompra, PORQUE_DO_CADASTRO, primeiroNome } from "../boas-vindas"

/**
 * O e-mail do cupom da 1ª compra: o assunto com o %, o cupom com a validade,
 * o botão que já aplica (`/discount/<código>`), os produtos da trilha e o pé
 * de quem se cadastrou.
 */

const LOJA = "https://www.fuckingbarba.com.br"
const montar = (extra: Partial<Parameters<typeof emailDaPrimeiraCompra>[0]> = {}) =>
  emailDaPrimeiraCompra({
    para: "rafael@exemplo.com",
    nome: "rafael silva",
    cupom: { codigo: "BEMVINDO-7KQ2MX", porcento: 10, ate: new Date("2026-09-30T21:40:00Z") },
    tituloDosProdutos: "Pra cuidar da barba",
    produtos: [
      {
        nome: "Óleo para Barba 30ml",
        handle: "oleo-para-barba",
        imagem: "https://cdn.exemplo/oleo.jpg",
        preco: 65.9,
        precoCheio: 84.9,
      },
    ],
    sair: { pagina: `${LOJA}/sair/xyz`, umClique: null },
    loja: { url: LOJA, whatsapp: null, empresa: null, cnpj: null },
    ...extra,
  })

describe("o e-mail do cupom da 1ª compra", () => {
  it("o assunto, o cupom com a validade, o nome e o botão que já aplica", () => {
    const bruto = montar()
    expect(bruto.estilo).toBe("oferta")
    const e = emailDoCrm(bruto)
    expect(e.assunto).toBe("Seu cupom de 10% chegou")
    expect(e.html).toContain("Oi, Rafael!")
    expect(e.html).toContain("BEMVINDO-7KQ2MX")
    expect(e.html).toContain("10% na primeira compra")
    expect(e.html).toContain("Vale até 30/09, 18:40, uma vez.")
    expect(e.html).toContain(
      `${LOJA}/discount/BEMVINDO-7KQ2MX?utm_source=loja&amp;utm_medium=email&amp;utm_campaign=crm-boas-vindas`
    )
    expect(e.html).toContain("Pra cuidar da barba")
    expect(e.html).toContain("Óleo para Barba 30ml")
    expect(e.html).toContain(PORQUE_DO_CADASTRO)
    expect(Object.keys(e.cabecalhos)).toContain("List-Unsubscribe")
  })

  it("sem produto, o bloco não aparece; sem nome, “Oi!”", () => {
    const e = emailDoCrm(montar({ produtos: [], nome: null }))
    expect(e.html).not.toContain("Pra cuidar da barba")
    expect(e.html).toContain("Oi!")
  })

  it("o primeiro nome, com a primeira letra maiúscula", () => {
    expect(primeiroNome("  rafael   silva ")).toBe("Rafael")
    expect(primeiroNome("élcio")).toBe("Élcio")
    expect(primeiroNome("")).toBeNull()
    expect(primeiroNome(null)).toBeNull()
  })
})
