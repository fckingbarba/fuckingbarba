import {
  conversaPraIa,
  decidir,
  ehRespostaAutomatica,
  ESPERA_S,
  JANELA_H,
  textoDoCliente,
  textoPraEnviar,
  VOLTA_PRO_BOT_EM_H,
  type MensagemLida,
} from "../regras"

/**
 * As regras do atendente: a resposta automática do outro lado, a conversa no
 * formato da IA, o texto do jeito do WhatsApp e quando responder.
 */

const AGORA = new Date("2026-10-01T15:00:00Z")
const antes = (s: number) => new Date(AGORA.getTime() - s * 1000)

describe("a resposta automática do outro lado", () => {
  it("o 'estou ausente' do WhatsApp Business não é conversa", () => {
    expect(ehRespostaAutomatica("Mensagem automática: estou fora")).toBe(true)
    expect(ehRespostaAutomatica("Olá! Agradecemos sua mensagem. Retornaremos em breve.")).toBe(true)
    expect(ehRespostaAutomatica("Estamos fora do horário de atendimento")).toBe(true)
  })

  it("a pergunta de verdade é", () => {
    expect(ehRespostaAutomatica("Quanto tá o Fator?")).toBe(false)
    expect(ehRespostaAutomatica("Quero saber o horário que vocês entregam")).toBe(false)
    expect(ehRespostaAutomatica(null)).toBe(false)
  })
})

describe("a conversa pra IA", () => {
  const m = (autor: MensagemLida["autor"], texto: string | null, s: number, tipo = "texto") => ({
    autor,
    tipo,
    texto,
    em: antes(s),
  })

  it("junta as seguidas do mesmo lado e alterna os papéis", () => {
    expect(
      conversaPraIa([
        m("cliente", "oi", 300),
        m("cliente", "quanto tá o fator?", 290),
        m("bot", "Opa! R$ 129,90", 200),
        m("cliente", "e o óleo?", 10),
      ])
    ).toEqual([
      { role: "user", content: "oi\nquanto tá o fator?" },
      { role: "assistant", content: "Opa! R$ 129,90" },
      { role: "user", content: "e o óleo?" },
    ])
  })

  it("vai na ordem do tempo, mesmo que o banco devolva do mais novo pro mais velho", () => {
    expect(conversaPraIa([m("cliente", "dois", 10), m("cliente", "um", 20)])).toEqual([
      { role: "user", content: "um\ndois" },
    ])
  })

  it("o que a loja disse antes da primeira do cliente fica de fora; a da equipe vai marcada", () => {
    expect(
      conversaPraIa([
        m("bot", "mensagem velha", 900),
        m("cliente", "oi", 300),
        m("equipe", "Oi, aqui é o Matheus", 200),
        m("cliente", "valeu", 10),
      ])
    ).toEqual([
      { role: "user", content: "oi" },
      { role: "assistant", content: "[uma pessoa da equipe escreveu] Oi, aqui é o Matheus" },
      { role: "user", content: "valeu" },
    ])
  })

  it("a mensagem que chegou enquanto o atendente respondia fica DEPOIS da resposta", () => {
    // A hora da Meta é em segundos: o "e o frete?" (12:00:05) é anterior à resposta gravada às
    // 12:00:05.700, mas chegou depois do que o atendente leu — e tem que ficar esperando.
    const leu = new Date("2026-10-01T12:00:04.200Z")
    expect(
      conversaPraIa([
        {
          autor: "cliente",
          tipo: "texto",
          texto: "oi",
          em: new Date("2026-10-01T12:00:04Z"),
          ordem: leu,
        },
        {
          autor: "bot",
          tipo: "texto",
          texto: "Opa!",
          em: new Date("2026-10-01T12:00:05.700Z"),
          ordem: new Date(leu.getTime() + 1),
        },
        {
          autor: "cliente",
          tipo: "texto",
          texto: "e o frete?",
          em: new Date("2026-10-01T12:00:05Z"),
          ordem: new Date("2026-10-01T12:00:05.300Z"),
        },
      ])
    ).toEqual([
      { role: "user", content: "oi" },
      { role: "assistant", content: "Opa!" },
      { role: "user", content: "e o frete?" },
    ])
  })

  it("sem mensagem nova do cliente no fim, não há o que responder", () => {
    expect(conversaPraIa([m("cliente", "oi", 300), m("bot", "Opa!", 200)])).toBeNull()
    expect(conversaPraIa([])).toBeNull()
  })

  it("o que não é texto chega como o que a pessoa mandou", () => {
    expect(textoDoCliente({ tipo: "audio", texto: null })).toMatch(/áudio/)
    expect(textoDoCliente({ tipo: "imagem", texto: "serve pra mim?" })).toBe(
      "[mandou uma foto] serve pra mim?"
    )
    expect(textoDoCliente({ tipo: "botao", texto: "Barba" })).toBe("[tocou no botão] Barba")
    expect(textoDoCliente({ tipo: "desconhecido", texto: null })).toMatch(/não mostra/)
  })
})

describe("o texto do jeito do WhatsApp", () => {
  it("negrito com um asterisco, link sem markdown, sem título", () => {
    expect(
      textoPraEnviar(
        "## Fator\n**R$ 129,90** no [link](https://loja.com/produtos/fator?utm_source=whatsapp)\n\n\n\nvaleu"
      )
    ).toBe(
      "Fator\n*R$ 129,90* no link: https://loja.com/produtos/fator?utm_source=whatsapp\n\nvaleu"
    )
  })

  it("o link que é o próprio endereço fica só o endereço", () => {
    expect(textoPraEnviar("[https://a.com/x](https://a.com/x)")).toBe("https://a.com/x")
  })

  it("corta no limite sem quebrar palavra", () => {
    const t = textoPraEnviar("palavra ".repeat(30), 50)
    expect(t.length).toBeLessThanOrEqual(50)
    expect(t.endsWith("palavra…")).toBe(true)
  })
})

describe("quando responder", () => {
  const conversa = {
    situacao: "bot" as const,
    equipe_desde: null,
    ultima_entrada_em: antes(ESPERA_S + 1),
    pendente_desde: antes(ESPERA_S + 1),
  }

  it("espera a pessoa terminar de escrever, depois responde", () => {
    expect(decidir(conversa, AGORA)).toEqual({ fazer: "responder" })
    expect(decidir({ ...conversa, ultima_entrada_em: antes(3) }, AGORA)).toEqual({
      fazer: "esperar",
    })
  })

  it("sem fila, ou com a janela de 24 horas fechada, larga", () => {
    expect(decidir({ ...conversa, pendente_desde: null }, AGORA)).toEqual({
      fazer: "largar",
      porque: "nada",
    })
    expect(decidir({ ...conversa, ultima_entrada_em: antes(JANELA_H * 3600) }, AGORA)).toEqual({
      fazer: "largar",
      porque: "janela",
    })
  })

  it("com a equipe, o atendente fica quieto até a equipe sumir por um dia", () => {
    const comEquipe = { ...conversa, situacao: "equipe" as const, equipe_desde: antes(3600) }
    expect(decidir(comEquipe, AGORA)).toEqual({ fazer: "largar", porque: "equipe" })
    const antiga = { ...comEquipe, equipe_desde: antes(VOLTA_PRO_BOT_EM_H * 3600 + 60) }
    expect(decidir(antiga, AGORA)).toEqual({ fazer: "responder" })
    // A última mensagem da equipe conta como "ainda está cuidando".
    expect(decidir(antiga, AGORA, antes(600))).toEqual({ fazer: "largar", porque: "equipe" })
  })
})
