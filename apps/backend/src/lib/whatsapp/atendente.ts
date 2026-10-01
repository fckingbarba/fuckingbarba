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
export const MAX_RODADAS = 5

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

/** A ferramenta que o atendente tem sempre; as da loja (`ferramentas.ts`) vêm de quem chama. */
export const FERRAMENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: "chamar_a_equipe",
    description:
      "Passa a conversa para uma pessoa do time da loja, que continua pelo mesmo WhatsApp. " +
      "Use quando a pessoa pede para falar com alguém, reclama, está brava, tem problema com um pedido " +
      "(atraso, extravio, troca, devolução, cancelamento, reembolso), pergunta de saúde, atacado ou revenda, " +
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
- Quem já decidiu ("quero", "vou levar", "manda o link"): monte a sacola (montar_sacola) e mande o link dela na hora, sem enrolar.
- Levar mais unidades do mesmo produto sai mais barato (está em "Levando mais do mesmo"), e a promoção que vale agora também conta: mencione quando ajudar a decidir. Esses descontos entram sozinhos na sacola, sem cupom.
- Os links vão exatamente como estão na lista de produtos ou como a ferramenta devolveu (com tudo o que vem depois do "?").
- Respeite o "não": não insista no mesmo produto.

O QUE VOCÊ NUNCA FAZ
- Nunca invente: preço, desconto, cupom, frete, prazo, ingrediente, resultado ou regra que não esteja escrito abaixo. Não está escrito? Chame a equipe.
- Você não tem cupom pra dar. Só fale de cupom se estiver escrito nas regras da loja.
- Frete e prazo de entrega: só pelo cotar_frete, com o CEP da pessoa. Sem CEP, peça o CEP. Nunca chute data de chegada.
- Saúde (alergia, irritação, ferida, remédio, gravidez, doença de pele, menor de idade): não dê conselho. Diga o que a página do produto diz (em "Pra quem NÃO é" e nas dúvidas dele) e chame a equipe.
- Não peça nem repita dados pessoais (CPF, endereço, cartão, e-mail). A loja nunca pede senha nem código por aqui.
- Reclamação, pessoa brava, pedido pra falar com alguém, atacado ou revenda, parceria, imprensa, fornecedor, mensagem em outro idioma: chame a equipe.
- Não fale mal de outras marcas.

PEDIDOS, FRETE E SACOLA (as ferramentas)
- "Cadê meu pedido", rastreio, Pix, nota: use ver_meus_pedidos (os pedidos do telefone deste WhatsApp). Diga a situação, o código de rastreio e o link de acompanhar, como a ferramenta devolveu.
- Não achou pedido deste telefone: peça o número do pedido e o e-mail usado na compra, e use ver_pedido. Pra esse caso, diga só a situação e o rastreio.
- Pedido da loja antiga (número menor que 3301, de antes de 27/09): você não vê a situação dele; chame a equipe.
- Pix esperando pagamento: mandar_codigo_do_pix. O código vai sozinho na mensagem seguinte; você só avisa pra copiar e colar no app do banco. Nunca escreva o código.
- Pix vencido, "quero repetir", "manda de novo", reposição: refazer_pedido (número 0 = a última compra).
- Atraso, extravio, devolvido, não entregue, troca, devolução, cancelamento, reembolso: diga o que você vê no pedido, se ajudar, e chame a equipe.
- Frete: cotar_frete com o CEP e os produtos da conversa (1 unidade do produto, se a pessoa não disse). Diga as opções como vieram.
- Comprar: quando a pessoa decidir o que leva, montar_sacola com os produtos e as quantidades (o código está na lista de produtos), e mande o link da sacola. Pra só mostrar um produto, o link do produto.
- Endereço, CPF, e-mail e cartão nunca vão na resposta, mesmo que a pessoa peça.

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
export function contextoDaConversa(p: {
  agora: Date
  nome: string | null
  /** O que a loja sabe de quem escreve (`resumoDoCliente`), quando o telefone é de um cliente. */
  cliente?: string | null
}): string {
  return [
    `Agora: ${DIA.format(p.agora)}h, no horário de Brasília.`,
    p.nome
      ? `Nome da pessoa no WhatsApp: ${p.nome} (pode ser apelido; use o primeiro nome com naturalidade, sem repetir toda hora).`
      : "A pessoa não tem nome no WhatsApp.",
    p.cliente
      ? `Esta pessoa já é cliente (pelo telefone das compras):\n${p.cliente}`
      : "O telefone deste WhatsApp não tem compra na loja nova.",
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

/**
 * O PREÇO DO MODELO, em dólar por milhão de tokens (a tabela da Anthropic do
 * Claude Opus 5.5). A escrita no cache conta como a de 1 hora (o dobro da
 * entrada) — a de 5 minutos, mais barata, também cai aqui: a conta fica por
 * cima. É estimativa pro painel; a fatura é a do console da Anthropic.
 */
export const PRECO_POR_MILHAO = { entrada: 4, saida: 20, cacheLido: 0.2, cacheCriado: 8 }

/** Quanto custou (estimado), em dólar. */
export function custoEmDolar(uso: Partial<UsoDaIa> | null | undefined): number {
  if (!uso) return 0
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  return (
    (n(uso.entrada) * PRECO_POR_MILHAO.entrada +
      n(uso.saida) * PRECO_POR_MILHAO.saida +
      n(uso.cacheLido) * PRECO_POR_MILHAO.cacheLido +
      n(uso.cacheCriado) * PRECO_POR_MILHAO.cacheCriado) /
    1_000_000
  )
}

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
  /** As ferramentas da loja (`ferramentas.ts`), além de `chamar_a_equipe` — sempre na mesma ordem (cache). */
  ferramentas?: Anthropic.Beta.BetaTool[]
  executar?: (nome: string, input: unknown) => Promise<{ conteudo: string; erro?: boolean } | null>
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
  /** O texto de cada volta da IA; a resposta é o da última (o de antes das ferramentas é rascunho). */
  const textos: string[][] = []
  const ferramentas: string[] = []
  const todas = [...FERRAMENTAS, ...(p.ferramentas ?? [])]
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
        tools: todas,
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

    textos.push(
      r.content.flatMap((b) => (b.type === "text" && b.text.trim() ? [b.text.trim()] : []))
    )
    const pedidos = r.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use"
    )
    if (r.stop_reason !== "tool_use" || !pedidos.length || rodada === MAX_RODADAS) break

    mensagens.push({ role: "assistant", content: r.content })
    // Todas as ferramentas pedidas nesta volta, juntas, e os resultados numa mensagem só.
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
      pedidos.map(async (b): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        ferramentas.push(b.name)
        if (b.name === "chamar_a_equipe") {
          const motivo = (b.input as { motivo?: unknown })?.motivo
          equipe = typeof motivo === "string" && motivo.trim() ? motivo.trim() : "sem motivo"
          return {
            type: "tool_result",
            tool_use_id: b.id,
            content:
              "A equipe foi avisada e vai continuar a conversa. Agora escreva a mensagem final pra pessoa, avisando que alguém do time continua por aqui.",
          }
        }
        let r: { conteudo: string; erro?: boolean } | null = null
        try {
          r = (await p.executar?.(b.name, b.input)) ?? null
        } catch (e) {
          r = {
            conteudo: `A ferramenta falhou agora (${e instanceof Error ? e.message : e}). Não tente de novo: diga que não conseguiu ver isso agora, ou chame a equipe.`,
            erro: true,
          }
        }
        return {
          type: "tool_result",
          tool_use_id: b.id,
          content: r?.conteudo ?? `A ferramenta ${b.name} não existe.`,
          ...(r === null || r.erro ? { is_error: true } : {}),
        }
      })
    )
    mensagens.push({ role: "user", content: resultados })
  }

  // Chamou a equipe sem escrever nada pra pessoa: o aviso padrão vai no lugar.
  const ultima = textos[textos.length - 1] ?? []
  const texto =
    (ultima.length ? ultima : textos.flat()).join("\n\n").trim() ||
    (equipe ? RESPOSTA_DE_SOCORRO : "")
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
