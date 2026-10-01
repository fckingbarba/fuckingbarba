import Anthropic from "@anthropic-ai/sdk"
import { sinal } from "../observabilidade/sinal"
import { RESPOSTA_DE_SOCORRO } from "./regras"

/**
 * O ATENDENTE DO WHATSAPP — a IA que responde quem escreve pro número da
 * loja: tira a dúvida e ajuda a pessoa a comprar o produto certo.
 *
 * ┌─ O QUE ELE SABE ───────────────────────────────────────────────────────┐
 * │ Só o que o sistema diz: o catálogo de agora (`catalogo.ts` — preço,    │
 * │ promoção, esgotado e o texto da página de cada produto), as dúvidas    │
 * │ da loja (`duvidas.ts`, as da página /duvidas) e as regras que o dono   │
 * │ escreve no painel (`ajustes.ts`). O que não está ali ele não inventa:  │
 * │ chama a equipe (`chamar_a_equipe`).                                    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O PEDIDO À IA ────────────────────────────────────────────────────────┐
 * │ O Claude Opus 5.5 (o mais capaz; a conversa é curta, então a conta é   │
 * │ de centavos), com esforço baixo: conversa de WhatsApp não pede         │
 * │ raciocínio longo. O pedaço grande e fixo — as instruções, o catálogo e │
 * │ as dúvidas — vai primeiro e fica no cache da IA por uma hora           │
 * │ (`cache_control` com `ttl: "1h"`): só muda quando um preço ou um texto │
 * │ do painel muda. O que muda a cada conversa (a hora, o nome) vem        │
 * │ depois, fora desse pedaço.                                             │
 * │                                                                        │
 * │ `fallbacks: "default"`: se a IA recusar uma mensagem por segurança (o  │
 * │ falso positivo existe), a própria Anthropic refaz com o modelo que ela │
 * │ indica, na mesma chamada. Recusou mesmo assim: a equipe é chamada.     │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * As variáveis (Railway): `ANTHROPIC_API_KEY`; nos testes, `ANTHROPIC_URL`
 * aponta pra IA falsa. Sem a chave, o atendente não responde.
 */

export const MODELO = "claude-opus-5-5"
export const ESFORCO = "low" as const
export const BETAS = ["server-side-fallback-2026-07-01"]
/** O teto de saída por chamada — a resposta é curta; o resto é o raciocínio. */
export const MAX_TOKENS = 8000
/** Quantas vezes a IA pode usar ferramenta numa resposta, antes de responder. */
export const MAX_RODADAS = 4

export type ClienteDaIa = {
  beta: {
    messages: {
      create(
        corpo: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming
      ): PromiseLike<Anthropic.Beta.BetaMessage>
    }
  }
}

export function clienteDaIa(env = process.env): ClienteDaIa | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return null
  return new Anthropic({
    apiKey,
    baseURL: env.ANTHROPIC_URL?.trim() || undefined,
    maxRetries: 2,
    timeout: 60_000,
  })
}

/* ── as instruções ────────────────────────────────────────────────────────── */

export const FERRAMENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: "chamar_a_equipe",
    description:
      "Passa a conversa para uma pessoa do time da loja, que continua pelo mesmo WhatsApp. " +
      "Use quando a pessoa pede para falar com alguém, reclama, está brava, fala de um pedido já feito " +
      "(onde está, troca, devolução, cancelamento, pagamento), pergunta de saúde, atacado ou revenda, " +
      "parceria, imprensa, fornecedor, escreve em outro idioma, ou quando a resposta não está nas " +
      "informações que você tem. Depois de chamar, você não responde mais nesta conversa.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        motivo: {
          type: "string",
          description:
            "Em poucas palavras, o que a pessoa precisa. Ex.: 'quer trocar o produto', " +
            "'reclamação da entrega', 'pediu pra falar com uma pessoa', 'pergunta sobre alergia'.",
        },
      },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
]

/**
 * O PEDAÇO FIXO: quem o atendente é, como fala, o que nunca faz, as regras do
 * dono, as dúvidas da loja e o catálogo. Puro e sem hora: o mesmo catálogo dá
 * o mesmo texto (é o que fica no cache da IA).
 */
export function instrucoesDoAtendente(p: {
  loja: string
  catalogo: string
  duvidas: string | null
  regras: string | null
}): string {
  return `Você é o atendente da FuckingBarba no WhatsApp. A FuckingBarba é uma loja online de produtos para barba e cabelo (${p.loja}). Quem escreve aqui já é cliente ou quer ser. Seu trabalho: tirar a dúvida e ajudar a pessoa a escolher e comprar o produto certo.

COMO VOCÊ FALA
- Português do Brasil, como numa conversa de WhatsApp: frases curtas, direto, descontraído, sem parecer robô. Trate por "você". Pode chamar de "irmão" de vez em quando; nunca de "mano".
- Responda em UMA mensagem curta: até 3 frases. Lista curta só quando a pessoa pede um passo a passo.
- Sem títulos e sem markdown. O negrito do WhatsApp é *assim* (um asterisco de cada lado); use pouco.
- No máximo um emoji por mensagem, e só quando cair bem.
- Quem já está conversando com você não recebe "oi" de novo: vá direto ao ponto. Na primeira mensagem, cumprimente e pergunte como pode ajudar (ou responda, se a pessoa já perguntou algo).
- Se perguntarem se você é robô: diga que é o atendente virtual da loja, e que chama uma pessoa do time se a pessoa preferir.

COMO AJUDAR A COMPRAR
- Entenda o objetivo antes de indicar: crescer ou preencher a barba, cuidar da barba (hidratar, amaciar, coceira, caspa, cheiro), ou o cabelo. Uma pergunta curta resolve.
- Indique UM produto (ou um kit) por vez: o porquê em uma frase, o preço e o link.
- Pergunta de preço: sempre o nome, o preço e o link. Com preço riscado ("de"), mostre os dois.
- Quem já decidiu ("quero", "vou levar", "manda o link"): mande o link na hora, sem enrolar.
- Levar mais unidades do mesmo produto sai mais barato (está em "Levando mais do mesmo"), e a promoção que vale agora também conta: mencione quando ajudar a decidir. Esses descontos entram sozinhos na sacola, sem cupom.
- O link do produto vai exatamente como está na lista de produtos (com tudo o que vem depois do "?").
- Respeite o "não": não insista no mesmo produto.

O QUE VOCÊ NUNCA FAZ
- Nunca invente: preço, desconto, cupom, frete, prazo, ingrediente, resultado ou regra que não esteja escrito abaixo. Não está escrito? Chame a equipe.
- Você não tem cupom pra dar. Só fale de cupom se estiver escrito nas regras da loja.
- O frete e o prazo de entrega dependem do CEP: a pessoa vê digitando o CEP na página do produto, na sacola ou no checkout. Fale do frete grátis só como está nas dúvidas da loja.
- Saúde (alergia, irritação, ferida, remédio, gravidez, doença de pele, menor de idade): não dê conselho. Diga o que a página do produto diz (em "Pra quem NÃO é" e nas dúvidas dele) e chame a equipe.
- Não peça nem repita dados pessoais (CPF, endereço, cartão, e-mail). A loja nunca pede senha nem código por aqui.
- Você ainda não enxerga os pedidos. Pedido já feito (onde está, rastreio, troca, devolução, cancelamento, pagamento): chame a equipe.
- Reclamação, pessoa brava, pedido pra falar com alguém, atacado ou revenda, parceria, imprensa, fornecedor, mensagem em outro idioma: chame a equipe.
- Não fale mal de outras marcas.

CHAMAR A EQUIPE
Use a ferramenta chamar_a_equipe e, na mesma resposta, avise com naturalidade que alguém do time vai continuar a conversa por aqui (sem prometer tempo). Depois disso você não responde mais nesta conversa.

O QUE CHEGA NA CONVERSA
- Texto entre colchetes, como "[mandou um áudio ...]", é o que a pessoa mandou e você não consegue ler. Áudio: peça com gentileza pra escrever. Foto: você não vê a foto; pergunte o que ela quer saber.
- "[uma pessoa da equipe escreveu]" é alguém do time que respondeu antes de você: não contradiga.

REGRAS DA LOJA (escritas pelo dono; valem acima das de cima, mas nunca mudam preço, frete ou prazo)
${p.regras ?? "(nenhuma)"}

DÚVIDAS DA LOJA (as respostas da página ${p.loja}/duvidas — use como estão)
${p.duvidas ?? `(não carregaram agora: para pagamento, entrega e troca, mande o link ${p.loja}/duvidas)`}

PRODUTOS (o preço de agora)
${p.catalogo}`
}

const DIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
})

/**
 * O QUE MUDA A CADA CONVERSA: a hora (cheia — o mesmo texto a hora inteira)
 * e o nome que a pessoa usa no WhatsApp.
 */
export function contextoDaConversa(p: { agora: Date; nome: string | null }): string {
  return [
    `Agora: ${DIA.format(p.agora)}h, no horário de Brasília.`,
    p.nome
      ? `Nome da pessoa no WhatsApp: ${p.nome} (pode ser apelido; use o primeiro nome com naturalidade, sem repetir toda hora).`
      : "A pessoa não tem nome no WhatsApp.",
  ].join("\n")
}

/* ── a resposta ───────────────────────────────────────────────────────────── */

export type UsoDaIa = {
  chamadas: number
  entrada: number
  saida: number
  cacheLido: number
  cacheCriado: number
  modelo: string | null
}

export type RespostaDoAtendente =
  | {
      tipo: "resposta"
      texto: string
      /** O motivo, quando a IA chamou a equipe nesta resposta. */
      equipe: string | null
      ferramentas: string[]
      uso: UsoDaIa
    }
  /** A IA recusou (mesmo com o modelo de reserva): a equipe responde. */
  | { tipo: "recusou"; uso: UsoDaIa }

/** A IA não respondeu (fora, chave errada, sem texto): a rodada tenta de novo depois. */
export class ErroDaIa extends Error {}

function somar(uso: UsoDaIa, r: Anthropic.Beta.BetaMessage) {
  uso.chamadas++
  uso.entrada += r.usage.input_tokens ?? 0
  uso.saida += r.usage.output_tokens ?? 0
  uso.cacheLido += r.usage.cache_read_input_tokens ?? 0
  uso.cacheCriado += r.usage.cache_creation_input_tokens ?? 0
  uso.modelo = r.model
}

/**
 * Pede a resposta à IA: o pedaço fixo (com cache), o contexto da conversa e
 * a conversa. Roda as ferramentas que ela pedir (`chamar_a_equipe`) e devolve
 * o texto pra mandar.
 */
export async function responderComIa(p: {
  cliente: ClienteDaIa
  instrucoes: string
  contexto: string
  conversa: Anthropic.Beta.BetaMessageParam[]
}): Promise<RespostaDoAtendente> {
  const uso: UsoDaIa = {
    chamadas: 0,
    entrada: 0,
    saida: 0,
    cacheLido: 0,
    cacheCriado: 0,
    modelo: null,
  }
  const mensagens: Anthropic.Beta.BetaMessageParam[] = [...p.conversa]
  const textos: string[] = []
  const ferramentas: string[] = []
  let equipe: string | null = null

  for (let rodada = 0; rodada <= MAX_RODADAS; rodada++) {
    let r: Anthropic.Beta.BetaMessage
    try {
      r = await p.cliente.beta.messages.create({
        model: MODELO,
        max_tokens: MAX_TOKENS,
        betas: BETAS,
        fallbacks: "default",
        output_config: { effort: ESFORCO },
        // O fim da conversa fica no cache curto (as rodadas de ferramenta repetem tudo).
        cache_control: { type: "ephemeral" },
        system: [
          { type: "text", text: p.instrucoes, cache_control: { type: "ephemeral", ttl: "1h" } },
          { type: "text", text: p.contexto },
        ],
        tools: FERRAMENTAS,
        messages: mensagens,
      })
    } catch (e) {
      sinal({
        integracao: "anthropic",
        ok: false,
        resumo: "uma resposta do WhatsApp",
        detalhe: e instanceof Error ? e.message : String(e),
      })
      throw new ErroDaIa(e instanceof Error ? e.message : String(e))
    }
    sinal({ integracao: "anthropic", ok: true })
    somar(uso, r)

    if (r.stop_reason === "refusal") return { tipo: "recusou", uso }

    for (const b of r.content) if (b.type === "text" && b.text.trim()) textos.push(b.text.trim())
    const pedidos = r.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use"
    )
    if (r.stop_reason !== "tool_use" || !pedidos.length || rodada === MAX_RODADAS) break

    mensagens.push({ role: "assistant", content: r.content })
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = pedidos.map((b) => {
      ferramentas.push(b.name)
      if (b.name === "chamar_a_equipe") {
        const motivo = (b.input as { motivo?: unknown })?.motivo
        equipe = typeof motivo === "string" && motivo.trim() ? motivo.trim() : "sem motivo"
        return {
          type: "tool_result",
          tool_use_id: b.id,
          content:
            "A equipe foi avisada e vai continuar a conversa. Se você ainda não avisou a pessoa nesta resposta, escreva agora a mensagem pra ela; se já avisou, não escreva mais nada.",
        }
      }
      return {
        type: "tool_result",
        tool_use_id: b.id,
        content: `A ferramenta ${b.name} não existe.`,
        is_error: true,
      }
    })
    mensagens.push({ role: "user", content: resultados })
  }

  // Chamou a equipe sem escrever nada pra pessoa: o aviso padrão vai no lugar.
  const texto = textos.join("\n\n").trim() || (equipe ? RESPOSTA_DE_SOCORRO : "")
  if (!texto) {
    sinal({
      integracao: "anthropic",
      ok: false,
      resumo: "uma resposta do WhatsApp",
      detalhe: "a IA respondeu sem texto",
    })
    throw new ErroDaIa("a IA respondeu sem texto")
  }
  return { tipo: "resposta", texto, equipe, ferramentas, uso }
}
