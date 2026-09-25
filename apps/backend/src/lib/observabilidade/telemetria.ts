import { semDadoPessoal } from "./sinal"

/**
 * O QUE A LOJA MANDA DO NAVEGADOR — a velocidade de cada visita (as três
 * medidas que o Google usa), a página que não existe e o erro no navegador.
 * Chega por `POST /store/telemetria`, que só a loja chama (assinada).
 *
 * Código puro, com testes. Tudo o que entra é suspeito — a rota da loja é
 * pública, e o navegador manda o que quiser: cada evento é conferido, o
 * número tem teto, o texto é cortado, e a página perde o que identifica
 * alguém (a busca, o id do pedido, um e-mail no caminho).
 *
 * NADA IDENTIFICA QUEM VISITOU: sem cookie, sem IP guardado, sem o endereço
 * completo de onde veio (só o domínio, "google.com").
 */

export const METRICAS = ["LCP", "INP", "CLS"] as const
export type Metrica = (typeof METRICAS)[number]
export type Aparelho = "celular" | "computador"

export type EventoLido =
  | { tipo: "vital"; metrica: Metrica; valor: number; aparelho: Aparelho; pagina: string }
  | { tipo: "404"; pagina: string; origem: string | null; interna: boolean }
  | { tipo: "erro"; pagina: string; mensagem: string }

/** Até 20 eventos por envio: uma visita manda 3 medidas e, às vezes, um erro. */
export const MAX_EVENTOS = 20

/** O maior valor que faz sentido: acima disso é lixo (ou a aba esquecida aberta). */
const TETO: Record<Metrica, number> = { LCP: 60_000, INP: 60_000, CLS: 10 }

const ID = /^(order|cus|cart|prod|variant|pay|payses|promo|eqp|reg|ful|fb)_[0-9A-Za-z]+$/i

/**
 * "/conta/pedidos/order_01J…?aba=2" → "/conta/pedidos/:id". Sem a busca e o
 * `#`, e com o que identifica alguém trocado: id do Medusa, número comprido,
 * e-mail, código aleatório. O handle do produto fica: é o que diz qual
 * página é a lenta.
 */
export function normalizarPagina(bruto: unknown): string | null {
  if (typeof bruto !== "string" || !bruto.startsWith("/")) return null
  let caminho = bruto.split(/[?#]/)[0] ?? "/"
  try {
    caminho = decodeURI(caminho)
  } catch {
    // fica como veio
  }
  const partes = caminho
    .split("/")
    .filter(Boolean)
    .slice(0, 8)
    .map((s) =>
      s.includes("@")
        ? ":email"
        : ID.test(s)
          ? ":id"
          : /^\d{5,}$/.test(s)
            ? ":n"
            : /^[0-9A-Za-z_-]{20,}$/.test(s) && /\d/.test(s)
              ? ":id"
              : s.slice(0, 60)
    )
  return `/${partes.join("/")}`
}

/** "https://www.google.com/search?q=…" → "google.com". Só o domínio. */
export function dominioDe(bruto: unknown): string | null {
  if (typeof bruto !== "string" || !bruto) return null
  try {
    return new URL(bruto).hostname.replace(/^www\./, "").slice(0, 80) || null
  } catch {
    return null
  }
}

/**
 * Os eventos que valem, do corpo `{ eventos: [...] }`. `loja` é o domínio da
 * própria loja: a página que não existe vinda de um link DELA é link
 * quebrado nosso (`interna`), e não de fora.
 */
export function lerEventos(corpo: unknown, loja: string | null): EventoLido[] {
  const lista = (corpo as { eventos?: unknown } | null)?.eventos
  if (!Array.isArray(lista)) return []
  const lidos: EventoLido[] = []
  for (const bruto of lista.slice(0, MAX_EVENTOS)) {
    const e = (bruto ?? {}) as Record<string, unknown>
    const pagina = normalizarPagina(e.pagina)
    if (!pagina) continue
    if (e.tipo === "vital") {
      const metrica = METRICAS.find((m) => m === e.metrica)
      const valor = Number(e.valor)
      if (!metrica || !Number.isFinite(valor) || valor < 0 || valor > TETO[metrica]) continue
      lidos.push({
        tipo: "vital",
        metrica,
        valor: Math.round(valor * 1000) / 1000,
        aparelho: e.aparelho === "celular" ? "celular" : "computador",
        pagina,
      })
    } else if (e.tipo === "404") {
      const origem = dominioDe(e.origem)
      lidos.push({
        tipo: "404",
        pagina,
        origem,
        interna: Boolean(origem && loja && origem === loja.replace(/^www\./, "")),
      })
    } else if (e.tipo === "erro") {
      const mensagem = semDadoPessoal(typeof e.mensagem === "string" ? e.mensagem : "", 300)
      if (!mensagem) continue
      lidos.push({ tipo: "erro", pagina, mensagem })
    }
  }
  return lidos
}

/** A ocorrência do dia (a página que não existe, o erro): a chave que soma. */
export function chaveDaOcorrencia(e: Extract<EventoLido, { tipo: "404" | "erro" }>): string {
  return e.tipo === "404" ? e.pagina : `${e.mensagem.slice(0, 120)} @ ${e.pagina}`
}
