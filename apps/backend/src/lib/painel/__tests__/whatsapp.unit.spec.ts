import { ACESSO_PADRAO, NOME_DA_AREA } from "../../equipe/regras"
import { custoEmDolar, PRECO_POR_MILHAO } from "../../whatsapp/atendente"
import { termosDaBusca } from "../../whatsapp/regras"
import { lerFalas, testarOAtendente } from "../../whatsapp/testar"
import {
  emDolar,
  janelaAte,
  linhaDaConversa,
  mensagemNaTela,
  quandoCurto,
  telefoneNaTela,
} from "../whatsapp"
import { faltaPraResponder, haQuanto } from "../ler-whatsapp"

/**
 * O WhatsApp no painel (0234): quem abre, o telefone escondido pra quem não
 * abre os contatos, a lista, a conversa, a janela de 24 horas, o custo e o
 * teste do atendente.
 */

const AGORA = new Date("2026-10-01T18:00:00Z") // 15:00 em Brasília

describe("a área", () => {
  it("o WhatsApp é do dono e da operação (tem telefone e pedido de cliente)", () => {
    expect(ACESSO_PADRAO.whatsapp).toEqual(["dono", "operacao"])
    expect(NOME_DA_AREA.whatsapp).toBe("WhatsApp")
  })
})

describe("o telefone na tela", () => {
  it("inteiro pra quem abre os contatos; com o meio escondido pro resto", () => {
    expect(telefoneNaTela("5500900001234", true)).toBe("+55 (00) 90000-1234")
    expect(telefoneNaTela("5500900001234", false)).toBe("+55 (00) 9••••-1234")
    expect(telefoneNaTela("550088001234", true)).toBe("+55 (00) 8800-1234")
  })
})

const conversa = {
  id: "wcon_01",
  telefone: "5500900001234",
  nome: "Rafael Souza",
  situacao: "equipe" as const,
  equipe_desde: new Date("2026-10-01T17:32:00Z"),
  equipe_motivo: "quer trocar o produto",
  ultima_entrada_em: new Date("2026-10-01T17:31:00Z"),
  pendente_desde: null,
  ultima: {
    texto: "chegou vazando, quero trocar",
    autor: "cliente" as const,
    tipo: "texto",
    em: new Date("2026-10-01T17:31:00Z"),
  },
}

describe("a lista", () => {
  it("com a equipe e a última do cliente: esperando, com o motivo", () => {
    const l = linhaDaConversa(conversa, { contatos: true, agora: AGORA, comprou: null })
    expect(l).toMatchObject({
      nome: "Rafael Souza",
      quando: "14:31",
      ultima: "chegou vazando, quero trocar",
      situacao: "equipe",
      motivo: "quer trocar o produto",
      esperando: true,
    })
  })

  it("a equipe respondeu por último: não espera mais; sem nome, o telefone", () => {
    const l = linhaDaConversa(
      { ...conversa, nome: null, ultima: { ...conversa.ultima, autor: "equipe", texto: "Oi!" } },
      { contatos: false, agora: AGORA, comprou: "R$ 99,90" }
    )
    expect(l).toMatchObject({
      nome: "+55 (00) 9••••-1234",
      ultima: "Equipe: Oi!",
      esperando: false,
      comprou: "R$ 99,90",
    })
  })

  it("a do atendente não tem motivo; o áudio aparece como áudio", () => {
    const l = linhaDaConversa(
      { ...conversa, situacao: "bot", ultima: { ...conversa.ultima, tipo: "audio", texto: null } },
      { contatos: true, agora: AGORA, comprou: null }
    )
    expect(l.motivo).toBeNull()
    expect(l.ultima).toMatch(/áudio/)
  })

  it("a busca: com letra é nome (os algarismos do nome não viram telefone); sem letra, número", () => {
    expect(termosDaBusca("Rafael Teste mg8x3k")).toEqual({
      nome: "%Rafael Teste mg8x3k%",
      numero: null,
    })
    expect(termosDaBusca("(47) 9981")).toEqual({ nome: "%(47) 9981%", numero: "%479981%" })
    expect(termosDaBusca("50%_off")).toEqual({ nome: "%50off%", numero: null })
    expect(termosDaBusca("José")).toEqual({ nome: "%José%", numero: null })
  })

  it("a mais antiga esperando: agora, em minutos, em horas", () => {
    expect(haQuanto(0)).toBe("chegou agora")
    expect(haQuanto(12)).toBe("há 12 min")
    expect(haQuanto(65)).toBe("há 1 h 05")
  })

  it("a hora curta: hoje, ontem, o dia", () => {
    expect(quandoCurto(new Date("2026-10-01T12:05:00Z"), AGORA)).toBe("09:05")
    expect(quandoCurto(new Date("2026-09-30T12:05:00Z"), AGORA)).toBe("ontem")
    expect(quandoCurto(new Date("2026-09-28T12:05:00Z"), AGORA)).toBe("28/09")
  })
})

describe("a conversa", () => {
  it("o que o atendente fez vira frase; a do Pix sozinho é separada; a da equipe leva quem", () => {
    const base = { id: "m", tipo: "texto", situacao: "lida", erro: null, em: AGORA }
    expect(
      mensagemNaTela(
        {
          ...base,
          autor: "bot",
          texto: "Seu pedido…",
          dados: { ferramentas: ["ver_meus_pedidos", "chamar_a_equipe"] },
        },
        AGORA
      )
    ).toMatchObject({
      ferramentas: ["Viu os pedidos", "Chamou a equipe"],
      hora: "15:00",
      dia: "hoje",
    })
    expect(
      mensagemNaTela(
        { ...base, autor: "bot", texto: "0002012658", dados: { separada: true } },
        AGORA
      ).separada
    ).toBe(true)
    expect(
      mensagemNaTela({ ...base, autor: "equipe", texto: "Oi", dados: { nome: "Matheus" } }, AGORA)
        .quem
    ).toBe("Matheus")
  })

  it("a janela: até 24 horas da última mensagem do cliente; passou, fechada", () => {
    expect(janelaAte(new Date("2026-10-01T17:31:00Z"), AGORA)).toBe("02/10, 14:31")
    expect(janelaAte(new Date("2026-09-30T17:00:00Z"), AGORA)).toBeNull()
    expect(janelaAte(null, AGORA)).toBeNull()
  })
})

describe("o custo e o que falta", () => {
  it("o custo estimado pela tabela do modelo", () => {
    const uso = { entrada: 1_000_000, saida: 100_000, cacheLido: 2_000_000, cacheCriado: 0 }
    expect(custoEmDolar(uso)).toBeCloseTo(
      PRECO_POR_MILHAO.entrada + PRECO_POR_MILHAO.saida / 10 + PRECO_POR_MILHAO.cacheLido * 2
    )
    expect(custoEmDolar(null)).toBe(0)
    expect(emDolar(1.1)).toBe("US$ 1,10")
  })

  it("o que falta no Railway pro atendente responder", () => {
    expect(faltaPraResponder({})).toEqual([
      "WHATSAPP_TOKEN e WHATSAPP_NUMERO_ID",
      "WHATSAPP_APP_SEGREDO",
      "ANTHROPIC_API_KEY",
    ])
    expect(
      faltaPraResponder({
        WHATSAPP_TOKEN: "t",
        WHATSAPP_NUMERO_ID: "1",
        WHATSAPP_APP_SEGREDO: "s",
        ANTHROPIC_API_KEY: "k",
      })
    ).toEqual([])
  })
})

describe("o teste do atendente", () => {
  it("a conversa da tela: de 1 a 20 falas, a última do cliente, sem fala vazia", () => {
    expect(lerFalas([{ de: "cliente", texto: " oi " }])).toEqual([{ de: "cliente", texto: "oi" }])
    expect(
      lerFalas([
        { de: "cliente", texto: "oi" },
        { de: "atendente", texto: "Opa!" },
      ])
    ).toBeNull()
    expect(lerFalas([])).toBeNull()
    expect(lerFalas([{ de: "cliente", texto: "  " }])).toBeNull()
    expect(lerFalas([{ de: "robô", texto: "oi" }])).toBeNull()
    expect(lerFalas(Array.from({ length: 21 }, () => ({ de: "cliente", texto: "oi" })))).toBeNull()
  })

  it("sem a chave da IA, o teste diz o que falta (e não chama nada)", async () => {
    const r = await testarOAtendente(
      {} as never,
      { falas: [{ de: "cliente", texto: "oi" }], telefone: null, regras: undefined },
      null
    )
    expect(r).toEqual({ ok: false, motivo: "sem_chave" })
  })
})
