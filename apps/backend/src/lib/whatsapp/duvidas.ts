/**
 * AS DÚVIDAS DA LOJA PRO ATENDENTE DO WHATSAPP — pagamento, entrega, troca,
 * conta: as mesmas respostas da página /duvidas, lidas DELA.
 *
 * ┌─ POR QUE LER DA PÁGINA, E NÃO ESCREVER DE NOVO AQUI ───────────────────┐
 * │ As respostas da loja são uma FUNÇÃO das configurações (o piso do frete │
 * │ grátis, as parcelas, o prazo de postagem — `apps/loja/src/conteudo/    │
 * │ duvidas.ts`). Escritas de novo aqui, o dia em que o painel mudasse o   │
 * │ frete grátis o site diria um valor e o WhatsApp outro — e anúncio      │
 * │ vincula (CDC, art. 30). A página publica as respostas pro Google, em   │
 * │ texto puro (o JSON-LD `FAQPage`): é essa a fonte, e ela muda junto.    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Lidas de hora em hora. Com a loja fora, fica a última leitura boa; sem
 * nenhuma, `null` — e o atendente manda o link da página em vez de responder.
 */

export const MEMORIA_MS = 60 * 60_000

export type Duvida = { pergunta: string; resposta: string }

type Objeto = Record<string, unknown>

function* objetos(v: unknown): Generator<Objeto> {
  if (Array.isArray(v)) {
    for (const item of v) yield* objetos(item)
  } else if (v && typeof v === "object") {
    const o = v as Objeto
    yield o
    if (o["@graph"]) yield* objetos(o["@graph"])
  }
}

/** As perguntas e respostas do JSON-LD `FAQPage` de uma página. */
export function duvidasDoHtml(html: string): Duvida[] {
  const duvidas: Duvida[] = []
  const blocos = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )
  for (const [, bruto] of blocos) {
    let json: unknown
    try {
      json = JSON.parse(bruto)
    } catch {
      continue
    }
    for (const o of objetos(json)) {
      if (o["@type"] !== "FAQPage") continue
      for (const q of objetos(o.mainEntity)) {
        const pergunta = typeof q.name === "string" ? q.name.trim() : ""
        const r = q.acceptedAnswer as Objeto | undefined
        const resposta = typeof r?.text === "string" ? r.text.trim() : ""
        if (pergunta && resposta) duvidas.push({ pergunta, resposta })
      }
    }
  }
  return duvidas
}

export function duvidasEmTexto(duvidas: readonly Duvida[]): string {
  return duvidas.map((d) => `- P: ${d.pergunta} R: ${d.resposta}`).join("\n")
}

let guardadas: { texto: string; ate: number; loja: string } | null = null

/** As dúvidas da loja em texto, da página /duvidas; `null` quando nunca deu pra ler. */
export async function duvidasDaLoja(loja: string, agora = Date.now()): Promise<string | null> {
  if (guardadas && guardadas.loja === loja && guardadas.ate > agora) return guardadas.texto
  const duvidas = await fetch(`${loja}/duvidas`, { signal: AbortSignal.timeout(10_000) })
    .then(async (r) => (r.ok ? duvidasDoHtml(await r.text()) : []))
    .catch(() => [])
  if (duvidas.length) {
    guardadas = { texto: duvidasEmTexto(duvidas), ate: agora + MEMORIA_MS, loja }
  } else if (guardadas && guardadas.loja === loja) {
    // A página fora (ou sem as dúvidas): fica a última boa, e tenta de novo em 5 minutos.
    guardadas = { ...guardadas, ate: agora + 5 * 60_000 }
  }
  return guardadas && guardadas.loja === loja ? guardadas.texto : null
}

/** Só pros testes: esquece a leitura guardada. */
export function esquecerDuvidas() {
  guardadas = null
}
