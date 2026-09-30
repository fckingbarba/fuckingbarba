import { emailDoCrm } from "../crm"
import { emailDaReposicao, type ReposicaoDoEmail, type ToqueDaReposicao } from "../reposicao"

/**
 * Os e-mails da reposição (0185): os 4 toques, todos lembrete, com o
 * "Refazer o pedido" — e sem palavra de propaganda.
 */

const LOJA = "https://www.fuckingbarba.com.br"
const FATOR = {
  nome: "Fator de Crescimento para Barba 30ml",
  handle: "fator-de-crescimento-para-barba",
  imagem: null,
  preco: 79.9,
  precoCheio: 133.2,
}
const TRES = { ...FATOR, nome: "Kit 3 Fatores de Crescimento", handle: "kit-3-fatores" }
const reposicao = (extra: Partial<ReposicaoDoEmail>): ReposicaoDoEmail => ({
  toque: "reposicao-antes-7d",
  para: "rafael@exemplo.com",
  nome: "rafael silva",
  acabando: { curto: "Fator de Crescimento", artigo: "o" },
  produtos: [FATOR],
  subirPara: TRES,
  voltar: "/voltar/repor-order_01K6ABCDEFGHJKMNPQRSTVWXYZ.abc.xyz",
  sair: { pagina: `${LOJA}/sair/xyz`, umClique: "https://api.exemplo/crm/sair?t=xyz" },
  loja: { url: LOJA, whatsapp: null, empresa: null, cnpj: null },
  ...extra,
})
const montar = (extra: Partial<ReposicaoDoEmail>) => {
  const bruto = emailDaReposicao(reposicao(extra))
  return { bruto, pronto: emailDoCrm(bruto) }
}
const TOQUES: ToqueDaReposicao[] = [
  "reposicao-antes-7d",
  "reposicao-antes-2d",
  "reposicao-depois-3d",
  "reposicao-depois-10d",
]

describe("os e-mails da reposição", () => {
  it("os assuntos dos 4 toques", () => {
    expect(TOQUES.map((toque) => montar({ toque }).pronto.assunto)).toEqual([
      "Seu Fator de Crescimento acaba em uma semana",
      "Não deixa o Fator de Crescimento acabar",
      "Acabou o Fator de Crescimento?",
      "O último lembrete do Fator de Crescimento",
    ])
    expect(montar({ acabando: { curto: "pasta modeladora", artigo: "a" } }).pronto.assunto).toBe(
      "Sua pasta modeladora acaba em uma semana"
    )
  })

  it("todos lembrete: sem o cancelar inscrição do cabeçalho, com o sair no pé, e o Refazer o pedido", () => {
    for (const toque of TOQUES) {
      const { bruto, pronto } = montar({ toque })
      expect(bruto.estilo).toBe("lembrete")
      expect(bruto.campanha).toBe("reposicao")
      expect(pronto.cabecalhos).toEqual({})
      expect(pronto.html).toContain("Sair da lista")
      expect(pronto.html).toContain("/voltar/repor-order_01K6ABCDEFGHJKMNPQRSTVWXYZ.abc.xyz?")
      expect(pronto.html).toContain("utm_campaign=crm-reposicao")
      expect(pronto.html).toContain("O de sempre")
      expect(pronto.html).toContain("Oi, Rafael!")
      expect(bruto.porque).toBe(
        "Você recebeu porque comprou o Fator de Crescimento na FuckingBarba."
      )
      const tudo = [bruto.assunto, bruto.previa, bruto.texto, bruto.botao?.texto ?? ""].join(" ")
      expect(tudo).not.toMatch(
        /esqueceu|última chamada|ainda dá tempo|em 1 clique|tá aqui|grátis|desconto|oferta|cupom/i
      )
    }
  })

  it("só o de 7 dias mostra o que dura mais", () => {
    expect(montar({}).pronto.html).toContain("Pra durar mais")
    expect(montar({}).pronto.html).toContain("Kit 3 Fatores de Crescimento")
    expect(montar({ toque: "reposicao-antes-2d" }).pronto.html).not.toContain("Pra durar mais")
    expect(montar({ subirPara: null }).pronto.html).not.toContain("Pra durar mais")
  })

  it("o de sempre é o Kit Completo: todos mostram também o shampoo sozinho (0229)", () => {
    const KIT = { ...FATOR, nome: "Kit Completo FuckingBarba", handle: "kit-completo-para-barba" }
    const SHAMPOO = { ...FATOR, nome: "Shampoo para Barba 120ml", handle: "shampoo-para-barba" }
    const DUPLO = { ...FATOR, nome: "Kit Shampoo para barba Duplo", handle: "kit-shampoo-duplo" }
    for (const toque of TOQUES) {
      const { pronto } = montar({
        toque,
        acabando: { curto: "shampoo", artigo: "o" },
        produtos: [KIT],
        subirPara: null,
        soEle: [SHAMPOO, DUPLO],
      })
      expect(pronto.html).toContain("O de sempre")
      expect(pronto.html).toContain("Kit Completo FuckingBarba")
      expect(pronto.html).toContain("Só o shampoo")
      expect(pronto.html).toContain("Shampoo para Barba 120ml")
      expect(pronto.html).toContain("Kit Shampoo para barba Duplo")
    }
    // Sem o produto sozinho (o de sempre já é ele), o bloco não aparece.
    expect(montar({ soEle: [] }).pronto.html).not.toContain("Só o")
    expect(montar({}).pronto.html).not.toContain("Só o")
  })
})
