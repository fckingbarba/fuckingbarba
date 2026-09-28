import type { ConteudoDoProduto } from "../boas-vindas"
import { emailDoCrm } from "../crm"
import { emailDaNavegacao, type NavegacaoDoEmail } from "../navegacao"

/**
 * Os e-mails da navegação abandonada (0198): em 3 horas, o produto com o que
 * os clientes acharam e as dúvidas da página; em 24, a rotina completa. Sem
 * desconto: lembretes, na cara da loja, sem emoji e sem palavra de propaganda.
 */

const LOJA = "https://www.fuckingbarba.com.br"
const conteudo = (extra: Partial<ConteudoDoProduto> = {}): ConteudoDoProduto => ({
  produto: {
    nome: "Fator de Crescimento para Barba 30ml",
    handle: "fator-de-crescimento-para-barba",
    imagem: null,
    preco: 79.9,
    precoCheio: null,
  },
  curto: "Fator de Crescimento",
  artigo: "o",
  tempo: null,
  uso: null,
  duvidas: {
    titulo: "Dúvidas",
    perguntas: [
      { pergunta: "Em quanto tempo aparece?", resposta: "Os primeiros fios, em 30 dias." },
      { pergunta: "Arde?", resposta: "Não." },
    ],
  },
  promessa: null,
  ...extra,
})
const OLEO = {
  nome: "Óleo para Barba",
  handle: "oleo-para-barba",
  imagem: null,
  preco: 59.9,
  precoCheio: null,
}
const navegacao = (extra: Partial<NavegacaoDoEmail>): NavegacaoDoEmail => ({
  toque: "navegacao-3h",
  para: "rafael@exemplo.com",
  nome: "rafael",
  produto: conteudo(),
  depoimentos: [{ texto: "Encheu as falhas.", quem: "Bruno", estrelas: 5 }],
  sugestoes: [OLEO],
  sair: { pagina: `${LOJA}/sair/xyz`, umClique: "https://api.exemplo/crm/sair?t=xyz" },
  loja: { url: LOJA, whatsapp: null, empresa: null, cnpj: null },
  ...extra,
})
const montar = (extra: Partial<NavegacaoDoEmail>) => {
  const bruto = emailDaNavegacao(navegacao(extra))
  return bruto ? { bruto, pronto: emailDoCrm(bruto) } : null
}
const PROPAGANDA =
  /esqueceu|última chamada|ainda dá tempo|em 1 clique|tá aqui|grátis|desconto|oferta|cupom/i

describe("os e-mails da navegação abandonada", () => {
  it("3 horas: “Ficou de olho no …?”, com as avaliações e as dúvidas, como lembrete", () => {
    const { bruto, pronto } = montar({})!
    expect(bruto.assunto).toBe("Ficou de olho no Fator de Crescimento?")
    expect(bruto.estilo).toBe("lembrete")
    expect(pronto.cabecalhos).toEqual({})
    expect(pronto.html).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(bruto.texto).toBe(
      "Separamos o que os clientes acharam do Fator de Crescimento e as dúvidas que mais chegam sobre ele."
    )
    expect(pronto.html).toContain("Encheu as falhas.")
    expect(pronto.html).toContain("Em quanto tempo aparece?")
    expect(bruto.botao).toEqual({
      texto: "Ver o Fator de Crescimento",
      caminho: "/produtos/fator-de-crescimento-para-barba",
    })
    expect(bruto.porque).toBe("Você recebeu porque viu o Fator de Crescimento na FuckingBarba.")
    expect(pronto.html).toContain("utm_campaign=crm-navegacao")
    const tudo = [bruto.assunto, bruto.previa, bruto.texto, bruto.botao?.texto].join(" ")
    expect(tudo).not.toMatch(PROPAGANDA)
  })

  it("3 horas: o feminino, e o que houver — sem avaliação nem dúvida, não tem e-mail", () => {
    const pasta = conteudo({ curto: "pasta matte", artigo: "a" })
    const soDuvidas = montar({ produto: pasta, depoimentos: [] })!.bruto
    expect(soDuvidas.assunto).toBe("Ficou de olho na pasta matte?")
    expect(soDuvidas.texto).toBe(
      "Separamos as dúvidas que mais chegam sobre a pasta matte, com as respostas."
    )
    const soAvaliacoes = montar({ produto: conteudo({ duvidas: null }) })!.bruto
    expect(soAvaliacoes.texto).toBe("Separamos o que os clientes acharam do Fator de Crescimento.")
    expect(montar({ produto: conteudo({ duvidas: null }), depoimentos: [] })).toBeNull()
    expect(montar({ produto: null })).toBeNull()
  })

  it("24 horas: “Quem levou o … também levou…”, com o produto e a rotina", () => {
    const { bruto, pronto } = montar({ toque: "navegacao-24h" })!
    expect(bruto.assunto).toBe("Quem levou o Fator de Crescimento também levou…")
    expect(bruto.estilo).toBe("lembrete")
    expect(pronto.cabecalhos).toEqual({})
    expect(pronto.html).toContain("Óleo para Barba")
    expect(pronto.html).toContain("Fator de Crescimento para Barba 30ml")
    expect([bruto.assunto, bruto.previa, bruto.texto].join(" ")).not.toMatch(PROPAGANDA)
    // Sem o que sugerir, não tem e-mail.
    expect(montar({ toque: "navegacao-24h", sugestoes: [] })).toBeNull()
  })
})
