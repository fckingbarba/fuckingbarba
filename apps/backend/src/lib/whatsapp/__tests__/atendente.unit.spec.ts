import type Anthropic from "@anthropic-ai/sdk"
import {
  BETAS,
  contextoDaConversa,
  ErroDaIa,
  ESFORCO,
  instrucoesDoAtendente,
  MAX_RODADAS,
  MODELO,
  responderComIa,
  type ClienteDaIa,
} from "../atendente"
import { RESPOSTA_DE_SOCORRO } from "../regras"

/**
 * O atendente: o que vai pra IA (o modelo, o cache do pedaço fixo, a reserva
 * quando ela recusa) e o que volta (o texto, a equipe chamada, a recusa).
 */

type Corpo = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming

const uso = {
  input_tokens: 100,
  output_tokens: 20,
  cache_read_input_tokens: 5000,
  cache_creation_input_tokens: 0,
}

function resposta(
  content: unknown[],
  stop_reason: Anthropic.Beta.BetaMessage["stop_reason"] = "end_turn"
): Anthropic.Beta.BetaMessage {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: MODELO,
    content,
    stop_reason,
    usage: uso,
  } as unknown as Anthropic.Beta.BetaMessage
}

/** Uma IA de mentira: devolve as respostas em ordem e guarda o que recebeu. */
function iaFalsa(respostas: (Anthropic.Beta.BetaMessage | Error)[]) {
  const pedidos: Corpo[] = []
  const cliente: ClienteDaIa = {
    beta: {
      messages: {
        async create(corpo) {
          pedidos.push(JSON.parse(JSON.stringify(corpo)))
          const r = respostas.shift()
          if (!r) throw new Error("a IA falsa ficou sem resposta")
          if (r instanceof Error) throw r
          return r
        },
      },
    },
  }
  return { cliente, pedidos }
}

const base = {
  instrucoes: "INSTRUÇÕES",
  contexto: "CONTEXTO",
  conversa: [{ role: "user" as const, content: "quanto tá o fator?" }],
}

describe("o pedido à IA", () => {
  it("o modelo, o esforço, a reserva e o pedaço fixo no cache de uma hora", async () => {
    const { cliente, pedidos } = iaFalsa([
      resposta([{ type: "text", text: "R$ 129,90: https://loja/produtos/fator" }]),
    ])
    const r = await responderComIa({ cliente, ...base })
    expect(r).toMatchObject({ tipo: "resposta", texto: "R$ 129,90: https://loja/produtos/fator" })
    const p = pedidos[0]
    expect(p.model).toBe(MODELO)
    expect(p.betas).toEqual(BETAS)
    expect(p.fallbacks).toBe("default")
    expect(p.output_config).toEqual({ effort: ESFORCO })
    expect(p.system).toEqual([
      { type: "text", text: "INSTRUÇÕES", cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: "CONTEXTO" },
    ])
    expect(p.cache_control).toEqual({ type: "ephemeral" })
    expect(p.messages).toEqual(base.conversa)
    expect(p.tools?.map((t) => (t as { name: string }).name)).toEqual(["chamar_a_equipe"])
    // Nunca forçar ferramenta: o Sonnet 5.5 recusa `tool_choice` any/tool.
    expect(p.tool_choice).toBeUndefined()
  })

  it("soma o uso de cada chamada", async () => {
    const { cliente } = iaFalsa([resposta([{ type: "text", text: "Opa!" }])])
    const r = await responderComIa({ cliente, ...base })
    expect(r.uso).toEqual({
      chamadas: 1,
      entrada: 100,
      saida: 20,
      cacheLido: 5000,
      cacheCriado: 0,
      cacheCriado1h: 0,
      modelo: MODELO,
    })
  })

  it("separa a gravação de 1 hora (o catálogo) da de 5 minutos (o fim da conversa)", async () => {
    const gravou = {
      ...resposta([{ type: "text", text: "Opa!" }]),
      usage: {
        ...uso,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 7300,
        cache_creation: { ephemeral_1h_input_tokens: 7000, ephemeral_5m_input_tokens: 300 },
      },
    } as unknown as Anthropic.Beta.BetaMessage
    const { cliente } = iaFalsa([gravou])
    const r = await responderComIa({ cliente, ...base })
    expect(r.uso).toMatchObject({ cacheCriado: 7300, cacheCriado1h: 7000 })
  })
})

describe("chamar a equipe", () => {
  it("a IA avisa e chama: o texto dela vai, e o motivo volta", async () => {
    const { cliente, pedidos } = iaFalsa([
      resposta(
        [
          { type: "thinking", thinking: "", signature: "sig" },
          { type: "text", text: "Entendi! Vou chamar alguém do time pra te ajudar com a troca." },
          {
            type: "tool_use",
            id: "toolu_1",
            name: "chamar_a_equipe",
            input: { motivo: "quer trocar o produto" },
          },
        ],
        "tool_use"
      ),
      resposta([]),
    ])
    const r = await responderComIa({ cliente, ...base })
    expect(r).toMatchObject({
      tipo: "resposta",
      texto: "Entendi! Vou chamar alguém do time pra te ajudar com a troca.",
      equipe: "quer trocar o produto",
      ferramentas: ["chamar_a_equipe"],
    })
    // A segunda chamada leva a resposta da IA inteira (com o raciocínio) e o resultado.
    const segunda = pedidos[1].messages
    expect(segunda).toHaveLength(3)
    expect((segunda[1].content as { type: string }[]).map((b) => b.type)).toEqual([
      "thinking",
      "text",
      "tool_use",
    ])
    expect(segunda[2]).toMatchObject({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_1" }],
    })
  })

  it("chamou sem escrever nada: vai o aviso padrão", async () => {
    const { cliente } = iaFalsa([
      resposta(
        [{ type: "tool_use", id: "t", name: "chamar_a_equipe", input: { motivo: "atacado" } }],
        "tool_use"
      ),
      resposta([]),
    ])
    const r = await responderComIa({ cliente, ...base })
    expect(r).toMatchObject({ tipo: "resposta", texto: RESPOSTA_DE_SOCORRO, equipe: "atacado" })
  })

  it("não fica em volta pra sempre: para em MAX_RODADAS", async () => {
    const pedindo = () =>
      resposta(
        [
          { type: "text", text: "Um instante." },
          { type: "tool_use", id: "t", name: "inexistente", input: {} },
        ],
        "tool_use"
      )
    const { cliente, pedidos } = iaFalsa(Array.from({ length: MAX_RODADAS + 3 }, pedindo))
    await responderComIa({ cliente, ...base })
    expect(pedidos).toHaveLength(MAX_RODADAS + 1)
  })
})

describe("as ferramentas da loja", () => {
  const verPedidos: Anthropic.Beta.BetaTool = {
    name: "ver_meus_pedidos",
    description: "teste",
    input_schema: { type: "object", properties: {} },
  }

  it("vão depois do chamar_a_equipe, sempre na mesma ordem", async () => {
    const { cliente, pedidos } = iaFalsa([resposta([{ type: "text", text: "Opa!" }])])
    await responderComIa({ cliente, ...base, ferramentas: [verPedidos] })
    expect(pedidos[0].tools?.map((t) => (t as { name: string }).name)).toEqual([
      "chamar_a_equipe",
      "ver_meus_pedidos",
    ])
  })

  it("o resultado volta pra IA, e a resposta é o texto da última volta", async () => {
    const chamadas: [string, unknown][] = []
    const { cliente, pedidos } = iaFalsa([
      resposta(
        [
          { type: "text", text: "Deixa eu ver aqui." },
          { type: "tool_use", id: "t1", name: "ver_meus_pedidos", input: {} },
          { type: "tool_use", id: "t2", name: "nao_existe", input: {} },
        ],
        "tool_use"
      ),
      resposta([{ type: "text", text: "Seu pedido #3305 foi postado: AB123BR." }]),
    ])
    const r = await responderComIa({
      cliente,
      ...base,
      ferramentas: [verPedidos],
      executar: async (nome, input) => {
        chamadas.push([nome, input])
        return nome === "ver_meus_pedidos" ? { conteudo: "Pedido #3305: enviado, AB123BR" } : null
      },
    })
    expect(chamadas).toEqual([
      ["ver_meus_pedidos", {}],
      ["nao_existe", {}],
    ])
    expect(r).toMatchObject({
      tipo: "resposta",
      texto: "Seu pedido #3305 foi postado: AB123BR.",
      ferramentas: ["ver_meus_pedidos", "nao_existe"],
    })
    // Os dois resultados numa mensagem só; o que não existe, como erro.
    expect(pedidos[1].messages[2]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1", content: "Pedido #3305: enviado, AB123BR" },
        {
          type: "tool_result",
          tool_use_id: "t2",
          content: "A ferramenta nao_existe não existe.",
          is_error: true,
        },
      ],
    })
  })

  it("a ferramenta que quebra vira erro pra IA, sem derrubar a resposta", async () => {
    const { cliente, pedidos } = iaFalsa([
      resposta([{ type: "tool_use", id: "t1", name: "ver_meus_pedidos", input: {} }], "tool_use"),
      resposta([{ type: "text", text: "Não consegui ver agora." }]),
    ])
    const r = await responderComIa({
      cliente,
      ...base,
      ferramentas: [verPedidos],
      executar: async () => {
        throw new Error("banco fora")
      },
    })
    expect(r).toMatchObject({ texto: "Não consegui ver agora." })
    const resultado = (
      pedidos[1].messages[2].content as { content: string; is_error: boolean }[]
    )[0]
    expect(resultado.is_error).toBe(true)
    expect(resultado.content).toMatch(/falhou agora \(banco fora\)/)
  })
})

describe("quando a IA não responde", () => {
  it("recusou (mesmo com a reserva): a recusa volta, pra equipe responder", async () => {
    const { cliente } = iaFalsa([resposta([], "refusal")])
    expect(await responderComIa({ cliente, ...base })).toMatchObject({ tipo: "recusou" })
  })

  it("fora do ar, ou sem texto: ErroDaIa, e a rodada tenta de novo", async () => {
    await expect(
      responderComIa({ cliente: iaFalsa([new Error("529 overloaded")]).cliente, ...base })
    ).rejects.toBeInstanceOf(ErroDaIa)
    await expect(
      responderComIa({ cliente: iaFalsa([resposta([])]).cliente, ...base })
    ).rejects.toBeInstanceOf(ErroDaIa)
  })
})

describe("as instruções", () => {
  const p = {
    loja: "https://www.fuckingbarba.com.br",
    catalogo: "## Fator",
    duvidas: "- P: Tem frete grátis? R: Sim.",
    regras: "Trate por irmão.",
  }

  it("levam as regras do dono, as dúvidas e o catálogo, sempre iguais", () => {
    const t = instrucoesDoAtendente(p)
    expect(t).toContain("Trate por irmão.")
    expect(t).toContain("- P: Tem frete grátis? R: Sim.")
    // 0246: os dois deslizes da simulação.
    expect(t).toContain("Frete grátis só quando a sacola chega no mínimo das dúvidas da loja")
    expect(t).toContain(
      'Se ela perguntou de outra coisa (como "cadê meu pedido"), responda isso e ofereça o código.'
    )
    expect(t.endsWith("## Fator")).toBe(true)
    expect(instrucoesDoAtendente(p)).toBe(t)
    expect(t).not.toMatch(/\d{2}:\d{2}/)
  })

  it("sem dúvidas carregadas, manda o link da página; sem regras, diz que não tem", () => {
    const t = instrucoesDoAtendente({ ...p, duvidas: null, regras: null })
    expect(t).toContain("mande o link https://www.fuckingbarba.com.br/duvidas")
    expect(t).toContain("(nenhuma)")
  })

  it("o contexto: a hora cheia de Brasília e o nome do WhatsApp", () => {
    const c = contextoDaConversa({ agora: new Date("2026-10-01T17:42:00Z"), nome: "Rafael" })
    expect(c).toContain("quinta-feira, 01/10, 14h")
    expect(c).toContain("Rafael")
    expect(contextoDaConversa({ agora: new Date("2026-10-01T17:42:00Z"), nome: null })).toContain(
      "não tem nome"
    )
    expect(c).toContain("não tem compra na loja nova")
    expect(
      contextoDaConversa({ agora: new Date(), nome: "Rafa", cliente: "- Já comprou: Fator" })
    ).toContain("Esta pessoa já é cliente (pelo telefone das compras):\n- Já comprou: Fator")
  })
})
