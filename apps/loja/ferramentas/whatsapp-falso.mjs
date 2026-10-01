import { createServer } from "node:http"

/**
 * O WHATSAPP E A IA DE MENTIRA, pros testes do atendente — um servidor só,
 * na porta 4380, com as três coisas que o backend procura:
 *
 *   POST /v26.0/<número>/messages   a Cloud API da Meta: GUARDA a mensagem
 *                                   (e o "digitando…") em vez de mandar.
 *   POST /v1/messages               a API da Anthropic: responde com um
 *                                   roteiro pela mensagem do cliente.
 *   GET  /duvidas                   a página de dúvidas da loja, com o
 *                                   JSON-LD que o atendente lê.
 *
 * O backend precisa subir apontando pra cá:
 *   WHATSAPP_URL=http://127.0.0.1:4380 ANTHROPIC_URL=http://127.0.0.1:4380
 *   LOJA_URL=http://127.0.0.1:4380 WHATSAPP_TOKEN=token-de-teste
 *   WHATSAPP_NUMERO_ID=100000000000001 WHATSAPP_APP_SEGREDO=segredo-de-teste
 *   WHATSAPP_VERIFICACAO=verificacao-de-teste ANTHROPIC_API_KEY=sk-ant-teste
 *
 * O ROTEIRO DA IA, pela última mensagem do cliente (o conferidor escreve as
 * palavras de propósito):
 *   "humano"  → avisa e chama a equipe (`chamar_a_equipe`), como a IA de verdade;
 *   "RECUSA"  → `stop_reason: "refusal"` (a recusa, mesmo com a reserva);
 *   "IAFORA"  → 529, a Anthropic sobrecarregada;
 *   o resto   → "Recebi: <as mensagens>" e o primeiro link de produto do
 *               catálogo que veio nas instruções (prova que o catálogo foi).
 * `roteiro.recusarPara` (números): a Meta responde 131047, a janela fechada.
 *
 * Rodando sozinho (`node ferramentas/whatsapp-falso.mjs`), ele imprime o que
 * chega: serve pra conversar com o atendente à mão no desenvolvimento.
 */

export const PORTA_PADRAO = Number(process.env.PORTA_WHATSAPP || 4380)

const PAGINA_DE_DUVIDAS = `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Tem frete grátis?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Frete grátis nas compras a partir de R$ 149,90 (de teste).",
        },
      },
    ],
  }
)}</script></head><body>Dúvidas</body></html>`

const json = (res, status, corpo) => {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(corpo))
}

/** O texto da última mensagem do cliente (a última `user` que não é resultado de ferramenta). */
function ultimaDoCliente(mensagens) {
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i]
    if (m.role !== "user") continue
    if (typeof m.content === "string") return m.content
    if (m.content.every((b) => b.type === "tool_result")) continue
    return m.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
  }
  return ""
}

function respostaDaIa(corpo, n) {
  const base = {
    id: `msg_falsa_${n}`,
    type: "message",
    role: "assistant",
    model: corpo.model,
    stop_sequence: null,
    usage: {
      input_tokens: 50,
      output_tokens: 20,
      cache_read_input_tokens: n > 1 ? 4000 : 0,
      cache_creation_input_tokens: n > 1 ? 0 : 4000,
    },
  }
  const ultima = corpo.messages[corpo.messages.length - 1]
  const voltouDaFerramenta =
    Array.isArray(ultima.content) && ultima.content.some((b) => b.type === "tool_result")
  if (voltouDaFerramenta) return { ...base, content: [], stop_reason: "end_turn" }

  const doCliente = ultimaDoCliente(corpo.messages)
  if (doCliente.includes("RECUSA"))
    return {
      ...base,
      content: [],
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: null, explanation: "de teste" },
    }
  if (doCliente.includes("humano"))
    return {
      ...base,
      content: [
        { type: "thinking", thinking: "", signature: "assinatura-falsa" },
        {
          type: "text",
          text: "Beleza! Vou chamar alguém do time pra continuar com você por aqui.",
        },
        {
          type: "tool_use",
          id: `toolu_falso_${n}`,
          name: "chamar_a_equipe",
          input: { motivo: "pediu pra falar com uma pessoa" },
        },
      ],
      stop_reason: "tool_use",
    }
  const instrucoes = (corpo.system ?? []).map((b) => b.text).join("\n")
  const link = instrucoes.match(/Link: (\S+)/)?.[1] ?? "sem link"
  return {
    ...base,
    content: [
      { type: "thinking", thinking: "", signature: "assinatura-falsa" },
      { type: "text", text: `Opa! Recebi: ${doCliente.replace(/\n/g, " | ")}. Olha esse: ${link}` },
    ],
    stop_reason: "end_turn",
  }
}

export async function subirWhatsappFalso({ porta = PORTA_PADRAO, aoReceber } = {}) {
  /** O que a loja mandou pela "Meta": { para, texto, wamid, em }. */
  const enviadas = []
  /** Os "digitando…": { wamid, em }. */
  const digitando = []
  /** Os pedidos à "IA": { corpo, cabecalhos, em }. */
  const pedidosAIa = []
  const roteiro = { recusarPara: new Set() }
  let contador = 0

  const servidor = createServer((req, res) => {
    let bruto = ""
    req.on("data", (c) => (bruto += c))
    req.on("end", () => {
      const url = new URL(req.url, "http://x")
      if (req.method === "GET" && url.pathname === "/duvidas") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
        res.end(PAGINA_DE_DUVIDAS)
        return
      }
      // O backend avisa a "loja" quando um preço muda: aqui, só diz que ouviu.
      if (req.method === "POST" && url.pathname === "/api/revalidar") return json(res, 200, {})

      let corpo
      try {
        corpo = JSON.parse(bruto || "{}")
      } catch {
        return json(res, 400, { error: { message: "corpo não é JSON" } })
      }

      if (req.method === "POST" && /^\/v\d+\.\d+\/\d+\/messages$/.test(url.pathname)) {
        if (req.headers.authorization !== "Bearer token-de-teste")
          return json(res, 401, { error: { message: "Invalid OAuth access token", code: 190 } })
        if (corpo.status === "read") {
          digitando.push({
            wamid: corpo.message_id,
            tipo: corpo.typing_indicator?.type,
            em: new Date(),
          })
          return json(res, 200, { success: true })
        }
        if (roteiro.recusarPara.has(corpo.to))
          return json(res, 400, {
            error: { message: "Re-engagement message", type: "OAuthException", code: 131047 },
          })
        const wamid = `wamid.FALSO${++contador}`
        const enviada = {
          para: corpo.to,
          texto: corpo.text?.body,
          previa: corpo.text?.preview_url,
          wamid,
          em: new Date(),
        }
        enviadas.push(enviada)
        aoReceber?.(enviada)
        return json(res, 200, {
          messaging_product: "whatsapp",
          contacts: [{ input: corpo.to, wa_id: corpo.to }],
          messages: [{ id: wamid }],
        })
      }

      if (req.method === "POST" && url.pathname === "/v1/messages") {
        pedidosAIa.push({ corpo, cabecalhos: req.headers, em: new Date() })
        if (!req.headers["x-api-key"])
          return json(res, 401, {
            type: "error",
            error: { type: "authentication_error", message: "sem chave" },
          })
        if (ultimaDoCliente(corpo.messages ?? []).includes("IAFORA"))
          return json(res, 529, {
            type: "error",
            error: { type: "overloaded_error", message: "Overloaded" },
          })
        return json(res, 200, respostaDaIa(corpo, pedidosAIa.length))
      }

      json(res, 404, {
        error: { message: `rota que o WhatsApp falso não conhece: ${req.method} ${url.pathname}` },
      })
    })
  })

  await new Promise((ok, erro) => {
    servidor.once("error", erro)
    servidor.listen(porta, "127.0.0.1", ok)
  })
  return {
    enviadas,
    digitando,
    pedidosAIa,
    roteiro,
    fechar: () => new Promise((ok) => servidor.close(ok)),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await subirWhatsappFalso({
    aoReceber: (m) => console.log(`→ ${m.para}: ${m.texto}`),
  })
  console.log(`WhatsApp e IA falsos em http://127.0.0.1:${PORTA_PADRAO}`)
}
