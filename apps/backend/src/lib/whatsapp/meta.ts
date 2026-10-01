import { createHmac, timingSafeEqual } from "node:crypto"
import { sinal } from "../observabilidade/sinal"

/**
 * O WHATSAPP DA LOJA PELA API OFICIAL DA META (a Cloud API) — o mesmo app e o
 * mesmo número que o Loopfy usava; nada novo na Meta. Aqui mora tudo o que
 * fala com ela: ler o aviso que chega, conferir a assinatura, mandar texto e
 * o "digitando…".
 *
 * ┌─ AS VARIÁVEIS (Railway, no serviço do backend) ────────────────────────┐
 * │ WHATSAPP_TOKEN        o token do usuário do sistema (Meta Business →    │
 * │                       Usuários do sistema), com whatsapp_business_      │
 * │                       messaging e _management, sem validade.            │
 * │ WHATSAPP_NUMERO_ID    o "Phone number ID" do número da loja.            │
 * │ WHATSAPP_WABA_ID      a conta do WhatsApp Business (não é usada pra     │
 * │                       mandar; fica pros modelos, depois).               │
 * │ WHATSAPP_APP_SEGREDO  a chave secreta do app: a Meta assina cada aviso  │
 * │                       com ela (`x-hub-signature-256`).                  │
 * │ WHATSAPP_VERIFICACAO  a senha inventada que a tela do webhook pede, só  │
 * │                       na hora de "Verificar e salvar".                  │
 * │ WHATSAPP_URL          só nos testes: o WhatsApp falso.                  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Sem o token e o número, a loja não manda nada (e diz no log); sem o
 * segredo, o aviso que chega é recusado. Nunca um valor padrão que funcione.
 */

/** A versão da Graph API — a mesma da compra pelo servidor (`lib/anuncios/enviar.ts`). */
export const VERSAO_DA_GRAPH = "v26.0"

/** O tamanho máximo de um texto na Cloud API. */
export const LIMITE_DO_TEXTO = 4096

export type TipoDaMensagem =
  | "texto"
  | "botao"
  | "imagem"
  | "audio"
  | "video"
  | "documento"
  | "figurinha"
  | "localizacao"
  | "contato"
  | "outro"

/** Uma mensagem que o cliente mandou, já lida do aviso. */
export type MensagemQueChegou = {
  wamid: string
  /** Só dígitos, com o 55 — o `from` da Meta. */
  telefone: string
  nome: string | null
  tipo: TipoDaMensagem
  /** O texto, a legenda da foto ou o título do botão; `null` no áudio, na figurinha… */
  texto: string | null
  em: Date
}

export type SituacaoDaMensagem = "enviada" | "entregue" | "lida" | "falhou"

/** "Entregue", "lida" ou "falhou" de uma mensagem que a loja mandou. */
export type SituacaoQueChegou = {
  wamid: string
  situacao: SituacaoDaMensagem
  erro: string | null
  em: Date
}

export type AvisoDaMeta = {
  mensagens: MensagemQueChegou[]
  situacoes: SituacaoQueChegou[]
  /** Avisos de outro número do mesmo app (o número de teste da Meta): ignorados. */
  deOutroNumero: number
}

const SITUACOES: Record<string, SituacaoDaMensagem> = {
  sent: "enviada",
  delivered: "entregue",
  read: "lida",
  failed: "falhou",
}

type Objeto = Record<string, unknown>
const objeto = (v: unknown): Objeto | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Objeto) : null
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)
const digitos = (v: unknown): string | null => {
  const d = typeof v === "string" ? v.replace(/\D/g, "") : ""
  return d.length >= 10 && d.length <= 15 ? d : null
}
/** O `timestamp` da Meta é em segundos, como texto. */
const momento = (v: unknown, agora: Date): Date => {
  const s = Number(v)
  return Number.isFinite(s) && s > 0 ? new Date(s * 1000) : agora
}

/** O que a pessoa mandou, em tipo e texto. `null` = não é mensagem pra responder (reação, aviso do sistema). */
function conteudo(m: Objeto): { tipo: TipoDaMensagem; texto: string | null } | null {
  const de = (chave: string) => objeto(m[chave])
  switch (m.type) {
    case "text":
      return { tipo: "texto", texto: texto(de("text")?.body) }
    case "button":
      return { tipo: "botao", texto: texto(de("button")?.text) }
    case "interactive": {
      const i = de("interactive")
      const escolha = objeto(i?.button_reply) ?? objeto(i?.list_reply)
      return { tipo: "botao", texto: texto(escolha?.title) }
    }
    case "image":
      return { tipo: "imagem", texto: texto(de("image")?.caption) }
    case "video":
      return { tipo: "video", texto: texto(de("video")?.caption) }
    case "document":
      return {
        tipo: "documento",
        texto: texto(de("document")?.caption) ?? texto(de("document")?.filename),
      }
    case "audio":
      return { tipo: "audio", texto: null }
    case "sticker":
      return { tipo: "figurinha", texto: null }
    case "location": {
      const l = de("location")
      return { tipo: "localizacao", texto: texto(l?.name) ?? texto(l?.address) }
    }
    case "contacts":
      return { tipo: "contato", texto: null }
    // A reação (um emoji em cima de uma mensagem) e os avisos do sistema
    // (o número da pessoa mudou) não pedem resposta.
    case "reaction":
    case "system":
    case "request_welcome":
      return null
    default:
      return { tipo: "outro", texto: null }
  }
}

function erroDaSituacao(s: Objeto): string | null {
  const e = objeto(lista(s.errors)[0])
  if (!e) return null
  const detalhe = texto(objeto(e.error_data)?.details)
  return [e.code, texto(e.title) ?? texto(e.message), detalhe]
    .filter((x) => x !== null && x !== undefined && x !== "")
    .join(" — ")
}

/**
 * O aviso que a Meta manda pro webhook, lido: as mensagens que chegaram e as
 * situações das que a loja mandou. Do número da loja só (`numeroId`): o app
 * pode ter outro número (o de teste da Meta), e esse não é conversa da loja.
 * O que vier torto é pulado — nunca derruba o aviso inteiro.
 */
export function lerAvisoDaMeta(
  json: unknown,
  numeroId: string | null | undefined,
  agora = new Date()
): AvisoDaMeta {
  const aviso: AvisoDaMeta = { mensagens: [], situacoes: [], deOutroNumero: 0 }
  for (const entrada of lista(objeto(json)?.entry)) {
    for (const mudanca of lista(objeto(entrada)?.changes)) {
      const m = objeto(mudanca)
      if (m?.field !== "messages") continue
      const valor = objeto(m.value)
      if (!valor) continue
      const numero = texto(objeto(valor.metadata)?.phone_number_id)
      if (numeroId && numero !== numeroId) {
        aviso.deOutroNumero++
        continue
      }
      const nomes = new Map<string, string>()
      for (const c of lista(valor.contacts)) {
        const tel = digitos(objeto(c)?.wa_id)
        const nome = texto(objeto(objeto(c)?.profile)?.name)
        if (tel && nome) nomes.set(tel, nome.slice(0, 80))
      }
      for (const bruta of lista(valor.messages)) {
        const msg = objeto(bruta)
        const wamid = texto(msg?.id)
        const telefone = digitos(msg?.from)
        if (!msg || !wamid || !telefone) continue
        const c = conteudo(msg)
        if (!c) continue
        aviso.mensagens.push({
          wamid,
          telefone,
          nome: nomes.get(telefone) ?? null,
          tipo: c.tipo,
          texto: c.texto ? c.texto.slice(0, LIMITE_DO_TEXTO) : null,
          em: momento(msg.timestamp, agora),
        })
      }
      for (const bruta of lista(valor.statuses)) {
        const s = objeto(bruta)
        const wamid = texto(s?.id)
        const situacao = SITUACOES[String(s?.status)]
        if (!s || !wamid || !situacao) continue
        aviso.situacoes.push({
          wamid,
          situacao,
          erro: situacao === "falhou" ? erroDaSituacao(s) : null,
          em: momento(s.timestamp, agora),
        })
      }
    }
  }
  return aviso
}

/**
 * A ASSINATURA DA META: `x-hub-signature-256: sha256=<hex>`, o HMAC-SHA256
 * do corpo CRU com a chave secreta do app. Sem segredo, nada confere.
 */
export function assinaturaConfere(p: {
  assinatura: unknown
  corpo: string
  segredo: string | undefined
}): boolean {
  if (!p.segredo || !p.corpo || typeof p.assinatura !== "string") return false
  const [prefixo, hex] = p.assinatura.split("=")
  if (prefixo !== "sha256" || !hex || !/^[0-9a-f]+$/i.test(hex)) return false
  const recebida = Buffer.from(hex, "hex")
  const esperada = createHmac("sha256", p.segredo).update(p.corpo, "utf8").digest()
  return recebida.length === esperada.length && timingSafeEqual(recebida, esperada)
}

/**
 * O "VERIFICAR E SALVAR" DA TELA DO WEBHOOK: a Meta pede a URL com
 * `hub.mode=subscribe`, a senha e um desafio, e espera o desafio de volta.
 * Devolve o desafio quando a senha confere; senão, `null`.
 */
export function desafioDaVerificacao(
  query: Record<string, unknown>,
  senha: string | undefined
): string | null {
  if (!senha) return null
  const desafio = query["hub.challenge"]
  if (query["hub.mode"] !== "subscribe" || typeof desafio !== "string" || !desafio) return null
  const recebida = Buffer.from(String(query["hub.verify_token"] ?? ""))
  const certa = Buffer.from(senha)
  if (recebida.length !== certa.length || !timingSafeEqual(recebida, certa)) return null
  return desafio
}

/* ── mandar ───────────────────────────────────────────────────────────────── */

export type Credenciais = { numeroId: string; token: string; base: string }

/** As credenciais do Railway, ou `null` quando falta alguma. */
export function credenciaisDoWhatsapp(env = process.env): Credenciais | null {
  const numeroId = env.WHATSAPP_NUMERO_ID?.trim()
  const token = env.WHATSAPP_TOKEN?.trim()
  if (!numeroId || !token) return null
  return {
    numeroId,
    token,
    base: (env.WHATSAPP_URL?.trim() || "https://graph.facebook.com").replace(/\/$/, ""),
  }
}

/** A recusa da Meta, com o código dela (131047 = fora da janela de 24 horas, …). */
export class ErroDaMeta extends Error {
  constructor(
    message: string,
    readonly codigo: number | null,
    readonly status: number
  ) {
    super(message)
  }
}

async function postarNaMeta(cred: Credenciais, corpo: object): Promise<Objeto> {
  const resposta = await fetch(`${cred.base}/${VERSAO_DA_GRAPH}/${cred.numeroId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cred.token}` },
    body: JSON.stringify({ messaging_product: "whatsapp", ...corpo }),
    signal: AbortSignal.timeout(15_000),
  })
  const json = objeto(await resposta.json().catch(() => null)) ?? {}
  const erro = objeto(json.error)
  if (!resposta.ok || erro) {
    const codigo = typeof erro?.code === "number" ? erro.code : null
    throw new ErroDaMeta(
      `a Meta recusou (${resposta.status}${codigo ? `, código ${codigo}` : ""}): ${
        texto(erro?.message) ?? "sem mensagem"
      }`,
      codigo,
      resposta.status
    )
  }
  return json
}

/**
 * Manda um texto livre (só vale dentro da janela de 24 horas da última
 * mensagem da pessoa). Com prévia do link: o produto aparece com a foto.
 * Devolve o `wamid` da mensagem, pra acompanhar a entrega.
 */
export async function enviarTexto(
  cred: Credenciais,
  para: string,
  corpo: string
): Promise<{ wamid: string | null }> {
  try {
    const json = await postarNaMeta(cred, {
      recipient_type: "individual",
      to: para,
      type: "text",
      text: { body: corpo.slice(0, LIMITE_DO_TEXTO), preview_url: true },
    })
    sinal({ integracao: "whatsapp", ok: true })
    return { wamid: texto(objeto(lista(json.messages)[0])?.id) }
  } catch (e) {
    sinal({
      integracao: "whatsapp",
      ok: false,
      resumo: "uma mensagem do atendente",
      detalhe: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}

/**
 * Marca a mensagem da pessoa como lida e mostra o "digitando…" (até 25
 * segundos, ou até a resposta chegar). Nunca lança: é só cortesia.
 */
export async function mostrarDigitando(cred: Credenciais, wamid: string): Promise<void> {
  try {
    await postarNaMeta(cred, {
      status: "read",
      message_id: wamid,
      typing_indicator: { type: "text" },
    })
  } catch {
    // sem o "digitando", a resposta sai do mesmo jeito
  }
}
