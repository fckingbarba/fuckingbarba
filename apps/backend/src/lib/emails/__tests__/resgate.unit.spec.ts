import { emailDoCrm } from "../crm"
import { emailDoResgate, type ResgateDoEmail } from "../resgate"

/**
 * Os e-mails do resgate e do sunset (0192): a pergunta de 1 clique e o
 * "Posso continuar te escrevendo?" são lembretes, na cara da loja, sem emoji
 * e sem palavra de propaganda (0197); o cupom de 15% e o "vence amanhã" são
 * oferta, com o "Refazer o pedido" já com o desconto.
 */

const LOJA = "https://www.fuckingbarba.com.br"
const FATOR = {
  nome: "Fator de Crescimento para Barba 30ml",
  handle: "fator-de-crescimento-para-barba",
  imagem: null,
  preco: 79.9,
  precoCheio: null,
}
const ATE = new Date("2026-10-01T15:00:00Z")
const resgate = (extra: Partial<ResgateDoEmail>): ResgateDoEmail => ({
  toque: "resgate-agora",
  para: "rafael@exemplo.com",
  nome: "rafael",
  acabou: { curto: "Fator de Crescimento", artigo: "o" },
  produtos: [FATOR],
  botoes: {
    caro: "https://api.exemplo/crm/resgate?t=caro",
    esqueci: "https://api.exemplo/crm/resgate?t=esqueci",
    resultado: "https://api.exemplo/crm/resgate?t=resultado",
    outro: "https://api.exemplo/crm/resgate?t=outro",
  },
  sim: "https://api.exemplo/crm/resgate?t=sim",
  cupom: { codigo: "VOLTA-7KQ2MX", porcento: 15, ate: ATE },
  voltar: "/voltar/repor-nso_01K5ZB0W6Y7Q8R9S0T1V2W3X4Y.tmg36r.abc",
  sair: { pagina: `${LOJA}/sair/xyz`, umClique: "https://api.exemplo/crm/sair?t=xyz" },
  loja: { url: LOJA, whatsapp: null, empresa: null, cnpj: null },
  ...extra,
})
const montar = (extra: Partial<ResgateDoEmail>) => {
  const bruto = emailDoResgate(resgate(extra))
  return bruto ? { bruto, pronto: emailDoCrm(bruto) } : null
}
const PROPAGANDA =
  /esqueceu|última chamada|ainda dá tempo|em 1 clique|tá aqui|grátis|desconto|oferta|cupom/i

describe("os e-mails do resgate", () => {
  it("no dia: “Tá tudo bem com a barba?”, com os 4 botões, na cara da loja e sem emoji", () => {
    const { bruto, pronto } = montar({})!
    expect(bruto.assunto).toBe("Tá tudo bem com a barba?")
    expect(bruto.estilo).toBe("lembrete")
    expect(pronto.cabecalhos).toEqual({})
    // Sem emoji: emoji em botão tem cara de campanha.
    expect(pronto.html).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(pronto.html).toContain("Sair da lista")
    expect(bruto.texto).toContain("o Fator de Crescimento da sua última compra acabou")
    for (const [texto, t] of [
      ["Tá caro", "caro"],
      ["Esqueci de repor", "esqueci"],
      ["Não vi resultado", "resultado"],
      ["Comprei em outro lugar", "outro"],
    ]) {
      expect(pronto.html).toContain(texto)
      expect(pronto.html).toContain(`https://api.exemplo/crm/resgate?t=${t}`)
    }
    expect([bruto.assunto, bruto.previa, bruto.texto].join(" ")).not.toMatch(PROPAGANDA)
    // Sem saber o que acabou, a pergunta segue, sem o produto.
    expect(montar({ acabou: null })!.bruto.texto).toMatch(/^Faz um tempo que você não compra/)
    // Sem os links, não tem e-mail.
    expect(montar({ botoes: null })).toBeNull()
  })

  it("7 dias: 15% pra voltar, como oferta, com o pedido de sempre já com o desconto", () => {
    const { bruto, pronto } = montar({ toque: "resgate-7d" })!
    expect(bruto.assunto).toBe("15% pra voltar pra rotina")
    expect(bruto.estilo).toBe("oferta")
    expect(pronto.cabecalhos["List-Unsubscribe"]).toBeTruthy()
    expect(bruto.botao).toEqual({
      texto: "Refazer o pedido com 15%",
      caminho: "/voltar/repor-nso_01K5ZB0W6Y7Q8R9S0T1V2W3X4Y.tmg36r.abc?cupom=VOLTA-7KQ2MX",
    })
    expect(pronto.html).toContain("VOLTA-7KQ2MX")
    expect(pronto.html).toContain("15% na loja toda")
    // Sem o pedido pra refazer, o cupom guardado na loja.
    expect(montar({ toque: "resgate-7d", voltar: null })!.bruto.botao).toEqual({
      texto: "Usar meu cupom",
      caminho: "/discount/VOLTA-7KQ2MX",
    })
    // Sem cupom (ganhou outro há pouco), não tem e-mail.
    expect(montar({ toque: "resgate-7d", cupom: null })).toBeNull()
  })

  it("9 dias: o cupom vence amanhã", () => {
    const { bruto } = montar({ toque: "resgate-9d" })!
    expect(bruto.assunto).toBe("Seu cupom de 15% vence amanhã")
    expect(bruto.estilo).toBe("oferta")
    expect(montar({ toque: "resgate-9d", cupom: null })).toBeNull()
  })

  it("45 dias: “Posso continuar te escrevendo?”, com o Sim, na cara da loja", () => {
    const { bruto, pronto } = montar({ toque: "resgate-45d" })!
    expect(bruto.assunto).toBe("Posso continuar te escrevendo?")
    expect(bruto.estilo).toBe("lembrete")
    expect(pronto.cabecalhos).toEqual({})
    expect(pronto.html).toContain("Sair da lista")
    expect(pronto.html).toContain("Sim, quero continuar")
    expect(pronto.html).toContain("https://api.exemplo/crm/resgate?t=sim")
    expect(bruto.texto).toContain("Os avisos dos seus pedidos seguem chegando")
    const tudo = [bruto.assunto, bruto.previa, bruto.texto].join(" ")
    expect(tudo).not.toMatch(PROPAGANDA)
    // Sem a frase de lista de e-mails.
    expect(tudo).not.toMatch(/continuar recebendo|nossos e-mails/i)
    expect(montar({ toque: "resgate-45d", sim: null })).toBeNull()
  })
})
