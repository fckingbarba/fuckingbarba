import { emailDoCrm } from "../crm"
import {
  emailDaTrilha,
  PRODUTOS_DAS_TRILHAS as H,
  semMarcas,
  type ConteudoDoProduto,
  type SequenciaDoEmail,
} from "../boas-vindas"

/**
 * A sequência das boas-vindas (0178): o e-mail de cada dia de cada trilha,
 * com o texto da página do produto — e o dia sem e-mail (null) quando a
 * trilha não tem, ou quando a página não tem a seção.
 */

const LOJA = "https://www.fuckingbarba.com.br"
const produto = (handle: string, nome: string) => ({
  nome,
  handle,
  imagem: null,
  preco: 79.9,
  precoCheio: 99.9,
})
const conteudo = (
  handle: string,
  nome: string,
  curto: string,
  artigo: "o" | "a",
  extra: Partial<ConteudoDoProduto> = {}
): ConteudoDoProduto => ({
  produto: produto(handle, nome),
  curto,
  artigo,
  tempo: null,
  uso: { titulo: "Modo de uso", passos: ["Passo um.", "Passo dois."], dica: "A dica." },
  duvidas: {
    titulo: "Perguntas que todo mundo faz",
    perguntas: [{ pergunta: `Como usar ${curto}?`, resposta: "Assim." }],
  },
  promessa: { titulo: "A promessa", itens: [`${nome} faz isso`, "E aquilo"] },
  ...extra,
})
const CONTEUDOS = new Map<string, ConteudoDoProduto>([
  [
    H.fator,
    conteudo(H.fator, "Fator de Crescimento para Barba 30ml", "Fator de Crescimento", "o", {
      tempo: {
        titulo: "Quando o resultado aparece",
        passos: ["Semanas 1 e 2 · Textura", "Dia 30 · Começa a encher"],
      },
    }),
  ],
  [H.kit, conteudo(H.kit, "Kit Completo para Barba", "Kit Completo", "o")],
  [H.oleo, conteudo(H.oleo, "Óleo para Barba 30ml", "óleo", "o")],
  [H.balm, conteudo(H.balm, "Balm Modelador para Barba 90g", "balm", "o")],
  [H.matte, conteudo(H.matte, "Pasta Modeladora Matte", "pasta matte", "a")],
  [H.brilho, conteudo(H.brilho, "Pasta Modeladora Brilho", "pasta brilho", "a")],
])
const seq = (extra: Partial<SequenciaDoEmail>): SequenciaDoEmail => ({
  toque: "boas-vindas-1d",
  trilha: "crescimento",
  para: "rafael@exemplo.com",
  nome: "rafael",
  cupom: { codigo: "BEMVINDO-7KQ2MX", porcento: 10, ate: new Date("2026-09-30T21:40:00Z") },
  conteudos: CONTEUDOS,
  visto: null,
  produtos: [produto(H.fator, "Fator de Crescimento para Barba 30ml")],
  depoimentos: [{ texto: "Fechou a falha.", quem: "Diego", estrelas: 5 }],
  escolhas: null,
  daLoja: { prazoDePostagem: "1 a 2 dias úteis", freteGratisAcima: 139.9 },
  sair: { pagina: `${LOJA}/sair/xyz`, umClique: null },
  loja: { url: LOJA, whatsapp: null, empresa: null, cnpj: null },
  ...extra,
})
const montar = (extra: Partial<SequenciaDoEmail>) => {
  const e = emailDaTrilha(seq(extra))
  return e ? { bruto: e, pronto: emailDoCrm(e) } : null
}

describe("crescer a barba", () => {
  it("1 dia: a linha do tempo do Fator e as avaliações, como lembrete", () => {
    const e = montar({})!
    expect(e.bruto.estilo).toBe("lembrete")
    expect(e.pronto.assunto).toBe("Quando o resultado do Fator de Crescimento aparece")
    expect(e.pronto.html).toContain("Semanas 1 e 2 · Textura")
    expect(e.pronto.html).toContain("Fechou a falha.")
    expect(e.pronto.html).toContain("Oi, Rafael!")
    expect(e.pronto.cabecalhos).toEqual({})
  })

  it("2 dias: o cupom vence amanhã, como oferta; sem cupom, não sai", () => {
    const e = montar({ toque: "boas-vindas-2d" })!
    expect(e.bruto.estilo).toBe("oferta")
    expect(e.pronto.assunto).toBe("Seu cupom de 10% vence amanhã")
    expect(e.pronto.html).toContain("/discount/BEMVINDO-7KQ2MX?")
    expect(montar({ toque: "boas-vindas-2d", cupom: null })).toBeNull()
  })

  it("5, 7 e 10 dias: o modo de uso, as dúvidas e o tratamento de 90 dias", () => {
    expect(montar({ toque: "boas-vindas-5d" })!.pronto.assunto).toBe(
      "Como usar o Fator de Crescimento do jeito certo"
    )
    const duvidas = montar({ toque: "boas-vindas-7d" })!
    expect(duvidas.pronto.assunto).toBe(
      "As perguntas que todo mundo faz sobre o Fator de Crescimento"
    )
    expect(duvidas.pronto.html).toContain("Como usar Fator de Crescimento?")
    expect(montar({ toque: "boas-vindas-10d" })!.pronto.assunto).toBe(
      "90 dias de tratamento pelo melhor preço"
    )
  })
})

describe("cuidar da barba", () => {
  it("1 dia: a rotina em 3 passos, do Kit Completo", () => {
    const e = montar({ trilha: "cuidado" })!
    expect(e.pronto.assunto).toBe("A rotina da barba em 3 passos")
    expect(e.pronto.html).toContain("Passo um.")
  })

  it("5 dias: óleo ou balm, pela promessa de cada um; 7 dias: as dúvidas do que a pessoa viu", () => {
    const e = montar({ trilha: "cuidado", toque: "boas-vindas-5d" })!
    expect(e.pronto.assunto).toBe("Óleo ou balm: qual usar e quando")
    expect(e.pronto.html).toContain("Óleo para Barba 30ml faz isso")
    expect(e.pronto.html).toContain("Balm Modelador para Barba 90g faz isso")
    expect(
      montar({ trilha: "cuidado", toque: "boas-vindas-7d", visto: H.oleo })!.pronto.assunto
    ).toBe("As perguntas que todo mundo faz sobre o óleo")
    expect(montar({ trilha: "cuidado", toque: "boas-vindas-10d" })!.pronto.assunto).toBe(
      "A rotina completa num kit só"
    )
  })
})

describe("cabelo", () => {
  it("1 dia: matte ou brilho; 5 dias: como aplicar a pasta; 10 dias não tem", () => {
    expect(montar({ trilha: "cabelo" })!.pronto.assunto).toBe(
      "Matte ou brilho: qual combina com você"
    )
    expect(montar({ trilha: "cabelo", toque: "boas-vindas-5d" })!.pronto.assunto).toBe(
      "Como usar a pasta matte do jeito certo"
    )
    expect(montar({ trilha: "cabelo", toque: "boas-vindas-10d" })).toBeNull()
  })
})

describe("quem não viu produto", () => {
  it("1 dia: “Barba ou cabelo?”, com os três botões de escolha", () => {
    const e = montar({
      trilha: "geral",
      escolhas: {
        crescimento: "https://api.exemplo/crm/escolha?t=a",
        cuidado: "https://api.exemplo/crm/escolha?t=b",
        cabelo: "https://api.exemplo/crm/escolha?t=c",
      },
    })!
    expect(e.pronto.assunto).toBe("Barba ou cabelo?")
    for (const t of ["a", "b", "c"])
      expect(e.pronto.html).toContain(`https://api.exemplo/crm/escolha?t=${t}`)
    expect(e.pronto.html).toContain("Encher as falhas da barba")
    expect(montar({ trilha: "geral" })).toBeNull()
  })

  it("5 dias: as dúvidas da loja (prazo, frete, pagamento, troca); depois, nada", () => {
    const e = montar({ trilha: "geral", toque: "boas-vindas-5d" })!
    expect(e.pronto.assunto).toBe("As perguntas que todo mundo faz")
    expect(e.pronto.html).toContain("1 a 2 dias úteis")
    expect(e.pronto.html).toContain("139,90")
    expect(montar({ trilha: "geral", toque: "boas-vindas-7d" })).toBeNull()
    expect(montar({ trilha: "geral", toque: "boas-vindas-10d" })).toBeNull()
  })
})

describe("sem a seção na página do produto", () => {
  it("o dia fica sem e-mail, e o texto da página perde as estrelas da ênfase", () => {
    const semTempo = new Map(CONTEUDOS)
    semTempo.set(H.fator, { ...CONTEUDOS.get(H.fator)!, tempo: null })
    expect(montar({ conteudos: semTempo })).toBeNull()
    expect(semMarcas("Pele *limpa e seca*.")).toBe("Pele limpa e seca.")
  })
})
