import type { Acesso } from "../../lib/erp/contrato"

/**
 * O TELEFONE DO BLING — toda chamada da API v3 passa por aqui.
 *
 * ┌─ TRÊS POR SEGUNDO, SOMANDO TUDO ───────────────────────────────────────┐
 * │ O limite do Bling é da CONTA (3 chamadas por segundo, 120 mil por dia),│
 * │ e a integração da Nuvemshop divide com esta. Estourar dá 429, e 600    │
 * │ chamadas em 10 segundos bloqueiam o IP. Por isso as chamadas saem em   │
 * │ fila, uma a cada 400 ms (2,5 por segundo), e o 429 espera e tenta de   │
 * │ novo, até três vezes.                                                  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O TOKEN VENCE NO MEIO: um 401 troca o token (`acesso.renovado`) e repete
 * a chamada uma vez.
 *
 * `enable-jwt: 1` em TODA chamada: o Bling está trocando o token opaco por
 * JWT, e o JWT só vem com o cabeçalho — no pedido do token e em cada
 * chamada (https://developer.bling.com.br/migracao-jwt).
 *
 * `BLING_URL` existe pro conferidor apontar pro Bling falso; em produção,
 * não existe.
 */

export const urlDaApi = () =>
  (process.env.BLING_URL || "https://api.bling.com.br/Api/v3").replace(/\/+$/, "")

export class ErroDoBling extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly corpo: unknown,
    /** Vale tentar de novo: rede, 429, 5xx, token recusado. */
    readonly temporario: boolean,
    /**
     * 403: o app não tem o escopo do recurso. Não é dado errado nem o Bling
     * fora do ar — alguém marca o escopo no app e conecta de novo, e aí a
     * mesma chamada passa.
     */
    readonly semPermissao = false
  ) {
    super(message)
    this.name = "ErroDoBling"
  }
}

/**
 * O escopo do app que cada recurso pede, com o nome que a pessoa acha na tela
 * de escopos do app no Bling. O 403 da API não diz qual falta; o caminho diz.
 */
const ESCOPOS: [RegExp, string, string][] = [
  [/^\/contatos/, "Clientes e Fornecedores", "pro cliente"],
  [/^\/pedidos\/vendas/, "Pedidos de Venda", "pro pedido de venda"],
  [/^\/nfe/, "Notas Fiscais", "pra nota fiscal"],
  [/^\/produtos/, "Produtos", "pros produtos"],
  [/^\/estoques/, "Controle de Estoque", "pro estoque"],
  [/^\/formas-pagamentos/, "Formas de pagamento", "pras formas de pagamento"],
  [/^\/situacoes/, "Gerenciador de transições", "pras situações do pedido"],
  [/^\/empresas/, "Visualizar os dados básicos da empresa", "pros dados da empresa"],
]

/** O escopo do recurso, e o "pra quê" pra frase: "pro cliente", "pra nota fiscal". */
export function escopoDoCaminho(caminho: string): { escopo: string; pra: string } | null {
  const achado = ESCOPOS.find(([r]) => r.test(caminho))
  return achado ? { escopo: achado[1], pra: achado[2] } : null
}

/**
 * `{ error: { type, message, description, fields: [{ msg, element }] } }` →
 * uma linha. É o formato de erro da API v3 (ver `limites` e `erros-comuns`
 * na documentação).
 */
export function motivoDoErro(corpo: unknown): string | null {
  const c = corpo as { error?: unknown; error_description?: unknown; message?: unknown } | null
  const erro = c?.error
  // O formato do OAuth (`{ error: "insufficient_scope", error_description }`)
  // também aparece, nas recusas de permissão.
  if (typeof erro === "string" || (!erro && typeof c?.message === "string")) {
    const partes = [erro, c?.error_description, c?.message]
      .filter((p): p is string => typeof p === "string" && p.trim() !== "")
      .map((p) => p.trim())
    return partes.length ? [...new Set(partes)].join(" — ") : null
  }
  if (!erro || typeof erro !== "object") return null
  const e = erro as { message?: unknown; description?: unknown; fields?: unknown }
  const campos = (Array.isArray(e.fields) ? e.fields : [])
    .map((f) => {
      const c = f as { msg?: unknown; element?: unknown } | null
      return typeof c?.msg === "string" ? c.msg : null
    })
    .filter((m): m is string => Boolean(m))
  const partes = [e.message, e.description, ...campos]
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .map((p) => p.trim())
  return partes.length ? [...new Set(partes)].join(" — ") : null
}

const ESPACO_MS = 400
const PRAZO_MS = 20_000
let fila: Promise<unknown> = Promise.resolve()
let ultima = 0

/** A vez de chamar: no máximo uma saída a cada 400 ms, neste processo. */
function naVez<T>(tarefa: () => Promise<T>): Promise<T> {
  const vez = fila.then(async () => {
    const espera = ultima + ESPACO_MS - Date.now()
    if (espera > 0) await new Promise((r) => setTimeout(r, espera))
    ultima = Date.now()
  })
  fila = vez.catch(() => undefined)
  return vez.then(tarefa)
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Valor = string | number | boolean
export type Consulta = Record<string, Valor | Valor[] | null | undefined>

function montarUrl(caminho: string, consulta?: Consulta): string {
  const url = new URL(`${urlDaApi()}${caminho}`)
  for (const [chave, valor] of Object.entries(consulta ?? {})) {
    if (valor === null || valor === undefined) continue
    for (const v of Array.isArray(valor) ? valor : [valor])
      url.searchParams.append(chave, String(v))
  }
  return url.toString()
}

export type Resposta<T> = { status: number; corpo: T }

/** Resposta que não é JSON (a página de erro de um proxy): o começo do texto, sem tag. */
function textoCurto(texto: string): string | null {
  const t = texto
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return t ? t.slice(0, 120) : null
}

export async function chamarBling<T = unknown>(
  acesso: Acesso,
  metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  caminho: string,
  {
    consulta,
    corpo,
    prazoMs = PRAZO_MS,
  }: { consulta?: Consulta; corpo?: unknown; prazoMs?: number } = {}
): Promise<Resposta<T>> {
  const url = montarUrl(caminho, consulta)
  let token = await acesso.token()
  let renovou = false

  for (let tentativa = 1; ; tentativa++) {
    let resposta: Response
    try {
      resposta = await naVez(() =>
        fetch(url, {
          method: metodo,
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/json",
            "enable-jwt": "1",
            ...(corpo === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
          signal: AbortSignal.timeout(prazoMs),
        })
      )
    } catch (e) {
      const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
      throw new ErroDoBling(
        0,
        tempo
          ? "o Bling não respondeu a tempo"
          : `o Bling não atendeu (${e instanceof Error ? e.message : e})`,
        null,
        true
      )
    }

    const texto = await resposta.text()
    let lido: unknown = null
    try {
      lido = texto ? JSON.parse(texto) : null
    } catch {
      lido = null
    }

    if (resposta.status === 401 && !renovou) {
      token = await acesso.renovado(token)
      renovou = true
      continue
    }
    if (resposta.status === 429 && tentativa < 4) {
      await esperar(1000 * tentativa)
      continue
    }
    if (resposta.ok) return { status: resposta.status, corpo: lido as T }

    const motivo = motivoDoErro(lido) ?? textoCurto(texto)
    if (resposta.status === 403) {
      const e = escopoDoCaminho(caminho)
      throw new ErroDoBling(
        403,
        (e
          ? `o Bling negou a permissão ${e.pra} (403): falta o escopo “${e.escopo}” no app`
          : `o Bling negou a permissão (403) em ${caminho}: falta um escopo no app`) +
          (motivo ? ` (${motivo})` : ""),
        lido,
        false,
        true
      )
    }
    const temporario = resposta.status === 429 || resposta.status >= 500 || resposta.status === 401
    throw new ErroDoBling(
      resposta.status,
      motivo ?? `o Bling respondeu ${resposta.status}`,
      lido,
      temporario
    )
  }
}
