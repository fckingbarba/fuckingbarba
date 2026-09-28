import { emailDoCrm } from "../crm"
import { emailDaEstreia, PORQUE_DA_ESTREIA, type EstreiaDoEmail } from "../estreia"

/**
 * Os e-mails da estreia (0181): os 4 jeitos do e-mail da loja nova e o
 * "vence amanhã" — que só sai pra quem ganhou cupom.
 */

const LOJA = "https://www.fuckingbarba.com.br"
const produto = (handle: string, nome: string) => ({
  nome,
  handle,
  imagem: null,
  preco: 129.9,
  precoCheio: 145.9,
})
const FATOR = produto("fator-de-crescimento-para-barba", "Fator de Crescimento para Barba 30ml")
const CUPOM = { codigo: "VOLTA-7KQ2MX", porcento: 10, ate: new Date("2026-10-01T13:00:00Z") }

const estreia = (extra: Partial<EstreiaDoEmail>): EstreiaDoEmail => ({
  toque: "estreia-agora",
  segmento: "cliente",
  para: "rafael@exemplo.com",
  nome: "rafael silva",
  cupom: null,
  produtos: [FATOR],
  acabando: null,
  daLoja: { freteGratisAcima: 139.9, prazoDePostagem: "1 a 2 dias úteis" },
  sair: { pagina: `${LOJA}/sair/xyz`, umClique: "https://api.exemplo/crm/sair?t=xyz" },
  loja: { url: LOJA, whatsapp: null, empresa: null, cnpj: null },
  ...extra,
})
const montar = (extra: Partial<EstreiaDoEmail>) => {
  const e = emailDaEstreia(estreia(extra))
  return e ? { bruto: e, pronto: emailDoCrm(e) } : null
}

describe("o e-mail da loja nova", () => {
  it("no meio do tratamento: a loja nova, o que ela tem e o que a pessoa levou, como oferta", () => {
    const e = montar({})!
    expect(e.bruto.estilo).toBe("oferta")
    expect(e.bruto.campanha).toBe("estreia")
    expect(e.bruto.porque).toBe(PORQUE_DA_ESTREIA)
    expect(e.pronto.assunto).toBe("A FuckingBarba tem loja nova")
    expect(e.pronto.html).toContain("Oi, Rafael!")
    expect(e.pronto.html).toContain("O mesmo endereço: fuckingbarba.com.br.")
    expect(e.pronto.html).toContain("Conta sem senha")
    expect(e.pronto.html).toContain("139,90")
    expect(e.pronto.html).toContain("Postagem em 1 a 2 dias úteis.")
    expect(e.pronto.html).toContain("O que você levou da última vez")
    expect(e.pronto.html).toContain("utm_campaign=crm-estreia")
    expect(e.pronto.cabecalhos["List-Unsubscribe"]).toBe("<https://api.exemplo/crm/sair?t=xyz>")
  })

  it("sem frete grátis nem prazo nas Configurações, a lista não inventa", () => {
    const e = montar({ daLoja: { freteGratisAcima: null, prazoDePostagem: null } })!
    expect(e.pronto.html).not.toContain("Frete grátis")
    expect(e.pronto.html).not.toContain("Postagem em")
  })

  it("na hora de repor: o que está acabando, e o botão leva pra ele", () => {
    const e = montar({
      segmento: "repor",
      acabando: { curto: "Fator de Crescimento", artigo: "o", produto: FATOR },
    })!
    expect(e.pronto.assunto).toBe("Seu Fator de Crescimento deve estar acabando")
    expect(e.pronto.html).toContain("Pelas nossas contas, o Fator de Crescimento")
    expect(e.bruto.botao).toEqual({
      texto: "Repor agora",
      caminho: "/produtos/fator-de-crescimento-para-barba",
    })
    expect(
      montar({
        segmento: "repor",
        acabando: { curto: "pasta modeladora", artigo: "a", produto: null },
      })!.pronto.assunto
    ).toBe("Sua pasta modeladora deve estar acabando")
  })

  it("quem sumiu: o cupom da loja toda, com o link que já aplica", () => {
    const e = montar({ segmento: "sumido", cupom: CUPOM })!
    expect(e.pronto.assunto).toBe("Loja nova, e 10% pra você voltar")
    expect(e.pronto.html).toContain("VOLTA-7KQ2MX")
    expect(e.pronto.html).toContain("10% na loja toda")
    expect(e.pronto.html).toContain("/discount/VOLTA-7KQ2MX?")
    // Sem cupom (já ganhou um nos últimos 60 dias): a loja nova, sem desconto.
    const sem = montar({ segmento: "sumido" })!
    expect(sem.pronto.assunto).toBe("A FuckingBarba tem loja nova")
    expect(sem.pronto.html).not.toContain("/discount/")
  })

  it("quem nunca comprou: o cupom da 1ª compra e os mais pedidos", () => {
    const e = montar({
      segmento: "lead",
      cupom: { ...CUPOM, codigo: "BEMVINDO-7KQ2MX" },
    })!
    expect(e.pronto.assunto).toBe("Loja nova, e 10% na sua primeira compra")
    expect(e.pronto.html).toContain("10% na primeira compra")
    expect(e.pronto.html).toContain("Os mais pedidos")
  })

  it("quem compra em dia não ganha cupom, nem se vier um", () => {
    const e = montar({ segmento: "cliente", cupom: CUPOM })!
    expect(e.pronto.html).not.toContain("VOLTA-7KQ2MX")
  })
})

describe("o cupom vence amanhã", () => {
  it("só pra quem ganhou cupom: quem sumiu e quem nunca comprou", () => {
    const e = montar({ toque: "estreia-2d", segmento: "sumido", cupom: CUPOM })!
    expect(e.pronto.assunto).toBe("Seu cupom de 10% vence amanhã")
    expect(e.pronto.html).toContain("/discount/VOLTA-7KQ2MX?")
    expect(montar({ toque: "estreia-2d", segmento: "sumido" })).toBeNull()
    expect(montar({ toque: "estreia-2d", segmento: "repor", cupom: CUPOM })).toBeNull()
    expect(montar({ toque: "estreia-2d", segmento: "cliente", cupom: CUPOM })).toBeNull()
  })
})
