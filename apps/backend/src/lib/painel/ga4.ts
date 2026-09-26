import { createSign } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { chaveDoDia } from "./formato"
import { perguntaDasVisitas, type Periodo } from "./marketing"
import {
  PERGUNTA_DO_AGORA,
  perguntasDoDia,
  type RelatorioGa4,
  type RespostasDoGa4,
} from "./visitas"
import { sinal } from "../observabilidade/sinal"

/**
 * A CONVERSA COM O GOOGLE ANALYTICS — só leitura, do servidor.
 *
 * Quem lê é uma CONTA DE SERVIÇO do Google Cloud, com acesso de Leitor na
 * propriedade do GA4 da loja: a chave dela (o JSON que o Google baixa) mora
 * no Railway, em `GA4_CREDENCIAIS`, e o número da propriedade em
 * `GA4_PROPERTY_ID`. O navegador nunca vê a chave, nem fala com o Google.
 *
 *   1. a chave assina um JWT (RS256, `node:crypto`) e troca por um token de
 *      uma hora (o escopo é `analytics.readonly`: ler, nada mais);
 *   2. o token pergunta o dia (`batchRunReports`, três relatórios numa
 *      chamada) e o tempo real (`runRealtimeReport`), em paralelo.
 *
 * GUARDADO POR ALGUNS MINUTOS: o Início é aberto muitas vezes por dia, e o
 * Google tem cota por propriedade. As respostas ficam guardadas
 * `GA4_CACHE_SEGUNDOS` (120, sem a variável); o token, até perto de vencer.
 * Quem chega junto espera a mesma pergunta — o Google é perguntado uma vez.
 *
 * `GA4_API_URL` só existe pros testes (o Google falso dos conferidores); o
 * endereço do token vem da própria chave (`token_uri`).
 */

const API = "https://analyticsdata.googleapis.com/v1beta"
const TOKEN_URI = "https://oauth2.googleapis.com/token"
const ESCOPO = "https://www.googleapis.com/auth/analytics.readonly"
const TEMPO_LIMITE_MS = 5_000

type Credenciais = { email: string; chave: string; tokenUri: string }

export type ConfiguracaoDoGa4 = { propriedade: string; credenciais: Credenciais }

/**
 * A chave como o Google baixa (o JSON inteiro, colado no Railway) — ou o
 * mesmo JSON em base64, pra quem preferir uma linha só.
 */
export function lerCredenciais(bruto: string | undefined): Credenciais | null {
  let texto = (bruto ?? "").trim()
  if (!texto) return null
  if (!texto.startsWith("{")) texto = Buffer.from(texto, "base64").toString("utf8").trim()
  try {
    const j = JSON.parse(texto) as Record<string, unknown>
    const email = typeof j.client_email === "string" ? j.client_email : ""
    // Colada à mão, a quebra de linha da chave às vezes vira "\n" escrito.
    const chave = typeof j.private_key === "string" ? j.private_key.replace(/\\n/g, "\n") : ""
    if (!email.includes("@") || !chave.includes("PRIVATE KEY")) return null
    const tokenUri = typeof j.token_uri === "string" && j.token_uri ? j.token_uri : TOKEN_URI
    return { email, chave, tokenUri }
  } catch {
    return null
  }
}

/**
 * "desligado": nenhuma das duas variáveis (a loja segue sem visitas).
 * "invalida": falta uma, o número não é número ou a chave não se lê.
 */
export function configuracaoDoGa4(
  env: Record<string, string | undefined> = process.env
): ConfiguracaoDoGa4 | "desligado" | "invalida" {
  const bruto = (env.GA4_PROPERTY_ID ?? "").trim().replace(/^properties\//, "")
  if (!bruto && !env.GA4_CREDENCIAIS?.trim()) return "desligado"
  const credenciais = lerCredenciais(env.GA4_CREDENCIAIS)
  if (!/^\d{5,15}$/.test(bruto) || !credenciais) return "invalida"
  return { propriedade: bruto, credenciais }
}

const base64url = (texto: string | Buffer) => Buffer.from(texto).toString("base64url")

/** O JWT que a chave assina pra pedir o token (o fluxo de conta de serviço do Google). */
export function assinarJwt(c: Credenciais, agora = Date.now()): string {
  const iat = Math.floor(agora / 1000)
  const cabeca = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const corpo = base64url(
    JSON.stringify({ iss: c.email, scope: ESCOPO, aud: c.tokenUri, iat, exp: iat + 3600 })
  )
  const assinatura = createSign("RSA-SHA256").update(`${cabeca}.${corpo}`).sign(c.chave)
  return `${cabeca}.${corpo}.${base64url(assinatura)}`
}

/**
 * "recusado": o Google disse não — a chave, a API desligada no projeto ou a
 * conta sem acesso à propriedade. "fora": não respondeu (ou respondeu erro
 * dele). A mensagem vai pro log, nunca pra tela.
 */
export class ErroDoGa4 extends Error {
  constructor(
    readonly tipo: "recusado" | "fora",
    mensagem: string,
    readonly status = 0
  ) {
    super(mensagem)
  }
}

async function postar(url: string, init: RequestInit, onde: string): Promise<unknown> {
  let r: Response
  try {
    r = await fetch(url, { ...init, method: "POST", signal: AbortSignal.timeout(TEMPO_LIMITE_MS) })
  } catch (e) {
    const motivo = `${onde}: ${e instanceof Error ? e.message : String(e)}`
    sinal({ integracao: "ga4", ok: false, resumo: "o Google não respondeu", detalhe: motivo })
    throw new ErroDoGa4("fora", motivo)
  }
  const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>
  sinal(
    r.ok
      ? { integracao: "ga4", ok: true }
      : {
          integracao: "ga4",
          ok: false,
          resumo: `o Google respondeu ${r.status}`,
          detalhe: `${onde}: ${r.status}`,
        }
  )
  if (r.ok) return corpo
  const erro = corpo.error as { message?: string } | string | undefined
  const detalhe =
    typeof erro === "string"
      ? `${erro} ${String(corpo.error_description ?? "")}`
      : (erro?.message ?? "")
  throw new ErroDoGa4(
    r.status >= 400 && r.status < 500 && r.status !== 429 ? "recusado" : "fora",
    `${onde}: ${r.status} ${detalhe}`.trim(),
    r.status
  )
}

let token: { valor: string; vale: number; email: string } | null = null

async function tokenDoGoogle(c: Credenciais, agora = Date.now()): Promise<string> {
  if (token && token.email === c.email && token.vale - agora > 5 * 60_000) return token.valor
  const corpo = (await postar(
    c.tokenUri,
    {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: assinarJwt(c, agora),
      }),
    },
    "token"
  )) as { access_token?: unknown; expires_in?: unknown }
  if (typeof corpo.access_token !== "string") throw new ErroDoGa4("fora", "token: veio sem token")
  const segundos = Number(corpo.expires_in) > 0 ? Number(corpo.expires_in) : 3600
  token = { valor: corpo.access_token, vale: agora + segundos * 1000, email: c.email }
  return token.valor
}

async function perguntar(cfg: ConfiguracaoDoGa4): Promise<RespostasDoGa4> {
  const acesso = await tokenDoGoogle(cfg.credenciais)
  const api = (process.env.GA4_API_URL || API).replace(/\/+$/, "")
  const init = (corpo: unknown): RequestInit => ({
    headers: { authorization: `Bearer ${acesso}`, "content-type": "application/json" },
    body: JSON.stringify(corpo),
  })
  const propriedade = `${api}/properties/${cfg.propriedade}`
  const [dia, agoraNoSite] = await Promise.all([
    postar(
      `${propriedade}:batchRunReports`,
      init({ requests: perguntasDoDia() }),
      "relatórios"
    ) as Promise<{ reports?: RespostasDoGa4["horas"][] }>,
    postar(`${propriedade}:runRealtimeReport`, init(PERGUNTA_DO_AGORA), "tempo real") as Promise<
      RespostasDoGa4["agora"]
    >,
  ]).catch((e: unknown) => {
    if (e instanceof ErroDoGa4 && e.status === 401) token = null
    throw e
  })
  const [horas = {}, origens = {}, paginas = {}] = dia.reports ?? []
  return { horas, origens, paginas, agora: agoraNoSite }
}

/** Token recusado no meio (revogado, relógio torto): pede outro e pergunta de novo, uma vez. */
function perguntarComToken(cfg: ConfiguracaoDoGa4): Promise<RespostasDoGa4> {
  return perguntar(cfg).catch((e: unknown) => {
    if (e instanceof ErroDoGa4 && e.status === 401) return perguntar(cfg)
    throw e
  })
}

let guardado: { chave: string; em: number; respostas: RespostasDoGa4 } | null = null
let andando: { chave: string; promessa: Promise<RespostasDoGa4> } | null = null

function segundosGuardado(): number {
  const n = Number(process.env.GA4_CACHE_SEGUNDOS ?? 120)
  return Number.isFinite(n) && n >= 0 ? n : 120
}

/** As respostas do dia — do Google, ou as guardadas há menos de `GA4_CACHE_SEGUNDOS`. */
export function respostasDoDia(
  cfg: ConfiguracaoDoGa4,
  agora = new Date()
): Promise<RespostasDoGa4> {
  // O dia entra na chave: depois da meia-noite, nada do dia anterior vale.
  const chave = `${cfg.propriedade}:${chaveDoDia(agora)}`
  if (guardado?.chave === chave && Date.now() - guardado.em < segundosGuardado() * 1000)
    return Promise.resolve(guardado.respostas)
  if (andando?.chave === chave) return andando.promessa
  const promessa = perguntarComToken(cfg)
    .then((respostas) => {
      guardado = { chave, em: Date.now(), respostas }
      return respostas
    })
    .finally(() => {
      if (andando?.promessa === promessa) andando = null
    })
  andando = { chave, promessa }
  return promessa
}

/* ── o Marketing: as visitas de um período ────────────────────────────────── */

/** Uma pergunta só (num `batchRunReports`, como as do dia), com o token da conta. */
async function perguntarUma(
  cfg: ConfiguracaoDoGa4,
  pergunta: unknown,
  onde: string
): Promise<RelatorioGa4> {
  const acesso = await tokenDoGoogle(cfg.credenciais)
  const api = (process.env.GA4_API_URL || API).replace(/\/+$/, "")
  const resposta = (await postar(
    `${api}/properties/${cfg.propriedade}:batchRunReports`,
    {
      headers: { authorization: `Bearer ${acesso}`, "content-type": "application/json" },
      body: JSON.stringify({ requests: [pergunta] }),
    },
    onde
  ).catch((e: unknown) => {
    if (e instanceof ErroDoGa4 && e.status === 401) token = null
    throw e
  })) as { reports?: RelatorioGa4[] }
  return resposta.reports?.[0] ?? {}
}

const guardadasDoMarketing = new Map<string, { em: number; relatorio: RelatorioGa4 }>()
const andandoNoMarketing = new Map<string, Promise<RelatorioGa4>>()

/**
 * As visitas do período e do de antes, hora a hora, pro Marketing
 * (`perguntaDasVisitas`) — guardadas `GA4_CACHE_SEGUNDOS` como as do dia, uma
 * por período, e perguntadas uma vez só por quem chega junto.
 */
export function visitasDoMarketing(
  cfg: ConfiguracaoDoGa4,
  periodo: Periodo,
  hosts: string[],
  agora = new Date()
): Promise<RelatorioGa4> {
  const dia = chaveDoDia(agora)
  const chave = `${cfg.propriedade}:${dia}:${periodo}:${hosts.join(",")}`
  const guardada = guardadasDoMarketing.get(chave)
  if (guardada && Date.now() - guardada.em < segundosGuardado() * 1000)
    return Promise.resolve(guardada.relatorio)
  const andando = andandoNoMarketing.get(chave)
  if (andando) return andando
  const pergunta = perguntaDasVisitas(periodo, hosts)
  const promessa = perguntarUma(cfg, pergunta, "visitas do marketing")
    .catch((e: unknown) => {
      // Token recusado no meio: pede outro e pergunta de novo, uma vez.
      if (e instanceof ErroDoGa4 && e.status === 401)
        return perguntarUma(cfg, pergunta, "visitas do marketing")
      throw e
    })
    .then((relatorio) => {
      // As de outro dia não valem mais: saem daqui.
      for (const k of guardadasDoMarketing.keys())
        if (!k.includes(`:${dia}:`)) guardadasDoMarketing.delete(k)
      guardadasDoMarketing.set(chave, { em: Date.now(), relatorio })
      return relatorio
    })
    .finally(() => andandoNoMarketing.delete(chave))
  andandoNoMarketing.set(chave, promessa)
  return promessa
}

const ultimoAviso = new Map<string, number>()

/**
 * Uma linha no log quando o Google não responde, no máximo uma por hora por
 * motivo: o Início e o Marketing abrem o dia todo.
 */
export function avisarNoLog(
  container: MedusaContainer,
  oQue: string,
  tipo: string,
  mensagem: string
) {
  const chave = `${oQue}:${tipo}`
  if (Date.now() - (ultimoAviso.get(chave) ?? 0) < 60 * 60 * 1000) return
  ultimoAviso.set(chave, Date.now())
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .warn(`[ga4] ${oQue} não vieram (${tipo}): ${mensagem}`)
}
