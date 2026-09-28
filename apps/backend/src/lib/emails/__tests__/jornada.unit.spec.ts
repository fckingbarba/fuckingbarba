import type { ConteudoDoProduto } from "../boas-vindas"
import { emailDoCrm } from "../crm"
import { emailDaJornada, type JornadaDoEmail, type ToqueDaJornada } from "../jornada"

/**
 * Os e-mails da jornada do resultado (0187): o texto da página do produto,
 * todos lembrete, e o check-in só com "Tá indo bem" e "Tenho uma dúvida".
 */

const LOJA = "https://www.fuckingbarba.com.br"
const produto = (handle: string, nome: string) => ({
  nome,
  handle,
  imagem: null,
  preco: 79.9,
  precoCheio: null,
})
const FATOR: ConteudoDoProduto = {
  produto: produto("fator-de-crescimento-para-barba", "Fator de Crescimento para Barba 30ml"),
  curto: "Fator de Crescimento",
  artigo: "o",
  tempo: {
    titulo: "Quando o resultado aparece",
    passos: ["Semanas 1 e 2 · Textura", "Dia 30 · Começa a encher"],
  },
  uso: { titulo: "Modo de uso", passos: ["Aplique à noite.", "Massageie."], dica: "Todo dia." },
  duvidas: {
    titulo: "Perguntas",
    perguntas: [{ pergunta: "Em quanto tempo aparece?", resposta: "Veja a linha do tempo." }],
  },
  promessa: null,
}
const jornada = (extra: Partial<JornadaDoEmail>): JornadaDoEmail => ({
  toque: "jornada-chegou",
  para: "rafael@exemplo.com",
  nome: "rafael",
  numero: 3312,
  principal: FATOR,
  fator: FATOR,
  sugestoes: [produto("oleo-para-barba", "Óleo para Barba 30ml")],
  checkin: {
    bem: "https://api.exemplo/crm/checkin?t=a",
    duvida: "https://api.exemplo/crm/checkin?t=b",
  },
  sair: { pagina: `${LOJA}/sair/xyz`, umClique: "https://api.exemplo/crm/sair?t=xyz" },
  loja: { url: LOJA, whatsapp: null, empresa: null, cnpj: null },
  ...extra,
})
const montar = (extra: Partial<JornadaDoEmail>) => {
  const bruto = emailDaJornada(jornada(extra))
  return bruto ? { bruto, pronto: emailDoCrm(bruto) } : null
}
const TOQUES: ToqueDaJornada[] = [
  "jornada-chegou",
  "jornada-3d",
  "jornada-7d",
  "jornada-21d",
  "jornada-60d",
]

describe("os e-mails da jornada", () => {
  it("os assuntos, todos lembrete, sem palavra de propaganda", () => {
    expect(TOQUES.map((toque) => montar({ toque })!.pronto.assunto)).toEqual([
      "Chegou! Veja como usar o Fator de Crescimento",
      "O segredo é não pular dia",
      "Uma semana. Como tá indo?",
      "Agora completa a rotina",
      "Dia 60: é aqui que muita gente desiste",
    ])
    for (const toque of TOQUES) {
      const { bruto, pronto } = montar({ toque })!
      expect(bruto.estilo).toBe("lembrete")
      expect(pronto.cabecalhos).toEqual({})
      expect(pronto.html).toContain("Sair da lista")
      expect(bruto.porque).toBe("Você recebeu porque fez o pedido #3312 na FuckingBarba.")
      const tudo = [bruto.assunto, bruto.previa, bruto.texto, bruto.botao?.texto ?? ""].join(" ")
      expect(tudo).not.toMatch(
        /esqueceu|última chamada|ainda dá tempo|em 1 clique|tá aqui|grátis|desconto|oferta|cupom/i
      )
    }
  })

  it("o check-in: os dois botões, e nada de “não gostei”", () => {
    const { pronto } = montar({ toque: "jornada-7d" })!
    expect(pronto.html).toContain("https://api.exemplo/crm/checkin?t=a")
    expect(pronto.html).toContain("https://api.exemplo/crm/checkin?t=b")
    expect(pronto.html).toContain("Tá indo bem")
    expect(pronto.html).toContain("Tenho uma dúvida")
    expect(pronto.html).not.toMatch(/não gostei/i)
    expect(pronto.html).toContain("Em quanto tempo aparece?")
    expect(montar({ toque: "jornada-7d", checkin: null })).toBeNull()
  })

  it("sem o que o dia pede, o dia fica sem e-mail", () => {
    // Sem o Fator no pedido: nem o de 3, nem o de 60 dias.
    expect(montar({ toque: "jornada-3d", fator: null })).toBeNull()
    expect(montar({ toque: "jornada-60d", fator: null })).toBeNull()
    // Sem o modo de uso na página, sem o "Chegou"; sem o que sugerir, sem a rotina.
    expect(montar({ toque: "jornada-chegou", principal: { ...FATOR, uso: null } })).toBeNull()
    expect(montar({ toque: "jornada-21d", sugestoes: [] })).toBeNull()
  })
})
