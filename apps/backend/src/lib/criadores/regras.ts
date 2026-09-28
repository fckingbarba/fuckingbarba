import { normalizarEmail } from "../../modules/codigo/regras"

/**
 * AS REGRAS DOS CRIADORES — puras, com teste: o que a página escondida
 * `/criadores` aceita em cada campo da inscrição.
 *
 * A página (`apps/loja/src/lib/criadores-visivel.ts`) tem as mesmas listas e
 * os mesmos tamanhos: o navegador recusa no mesmo ponto em que o Medusa
 * recusaria. Mudou aqui, muda lá.
 */

/* ── as opções da página ──────────────────────────────────────────────────── */

export const SEGUIDORES = ["ate-1mil", "1-10mil", "10-50mil", "50-100mil", "mais-100mil"] as const
export const BARBAS = ["cheia", "media", "curta", "crescendo"] as const
export const EXPERIENCIAS = ["nunca", "algumas", "sempre"] as const
export const MODELOS = ["fixo", "comissao", "conversar"] as const

export type Seguidores = (typeof SEGUIDORES)[number]
export type Barba = (typeof BARBAS)[number]
export type Experiencia = (typeof EXPERIENCIAS)[number]
export type Modelo = (typeof MODELOS)[number]

/** Os tamanhos — os mesmos `maxLength` da página. */
export const LIMITES = {
  nome: { min: 5, max: 80 },
  cidade: { min: 3, max: 80 },
  /** O Instagram aceita até 30 caracteres no perfil; o TikTok, 24. */
  instagram: 30,
  tiktok: 24,
  video: 300,
} as const

/* ── cada campo ───────────────────────────────────────────────────────────── */

/** Uma linha só: caractere de controle vira espaço, espaço repetido vira um. */
function umaLinha(v: unknown): string | null {
  if (typeof v !== "string") return null
  return v
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Nome e sobrenome: pelo menos duas palavras com letra, de 5 a 80 caracteres. */
export function limparNome(v: unknown): string | null {
  const nome = umaLinha(v)
  if (!nome || nome.length < LIMITES.nome.min || nome.length > LIMITES.nome.max) return null
  return nome.split(" ").filter((p) => /\p{L}/u.test(p)).length >= 2 ? nome : null
}

/**
 * O WhatsApp em dígitos, com o DDD e sem o 55: "(47) 99999-0000" e
 * "+55 47 99999 0000" viram "47999990000". Celular tem 11 dígitos, com o 9
 * depois do DDD; 10 é fixo com WhatsApp Business (ou celular registrado no
 * WhatsApp sem o 9, que ainda existe). DDD brasileiro não tem zero.
 */
export function limparWhatsapp(v: unknown): string | null {
  if (typeof v !== "string") return null
  let digitos = v.replace(/\D/g, "")
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) {
    digitos = digitos.slice(2)
  }
  if (digitos.length === 11) return /^[1-9]{2}9\d{8}$/.test(digitos) ? digitos : null
  if (digitos.length === 10) return /^[1-9]{2}[2-9]\d{7}$/.test(digitos) ? digitos : null
  return null
}

/** Como a pessoa escreveu ("Joinville, SC"), numa linha, com alguma letra. */
export function limparCidade(v: unknown): string | null {
  const cidade = umaLinha(v)
  if (!cidade || cidade.length < LIMITES.cidade.min || cidade.length > LIMITES.cidade.max) {
    return null
  }
  return /\p{L}/u.test(cidade) ? cidade : null
}

/**
 * O perfil sem o @, em minúsculas (o Instagram e o TikTok não diferenciam):
 * "@Fulano", "instagram.com/fulano/?igsh=…" e "https://www.tiktok.com/@fulano"
 * viram "fulano". Vazio vale (`perfil: null`) — a regra de ter pelo menos um
 * é do `lerInscricao`. Recusado: letra fora de a-z, 0-9, ponto e sublinhado,
 * comprido demais, ou um link que não é de perfil (o curto do TikTok).
 */
export function limparPerfil(
  v: unknown,
  max: number
): { ok: true; perfil: string | null } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, perfil: null }
  if (typeof v !== "string") return { ok: false }
  const perfil = v
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.|m\.)?(instagram\.com|tiktok\.com)\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase()
  if (!perfil) return { ok: true, perfil: null }
  if (
    perfil.length > max ||
    !/^[a-z0-9._]+$/.test(perfil) ||
    /(instagram|tiktok)\.com/.test(perfil)
  ) {
    return { ok: false }
  }
  return { ok: true, perfil }
}

/**
 * O link de um vídeo da pessoa: só `http` ou `https`, com domínio e sem
 * espaço — o painel mostra como link, e `javascript:` ali seria um clique
 * perigoso na mão da equipe. Sem o protocolo ("instagram.com/reel/…"), ganha
 * o `https://`. Vazio vale (`video: null`): o campo é opcional.
 */
export function limparVideo(v: unknown): { ok: true; video: string | null } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, video: null }
  if (typeof v !== "string") return { ok: false }
  const bruto = v.trim()
  if (!bruto) return { ok: true, video: null }
  if (/\s/.test(bruto)) return { ok: false }
  const comProtocolo = /^[a-z][a-z0-9+.-]*:/i.test(bruto) ? bruto : `https://${bruto}`
  if (comProtocolo.length > LIMITES.video) return { ok: false }
  try {
    const url = new URL(comProtocolo)
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false }
    if (!url.hostname.includes(".") || url.username || url.password) return { ok: false }
    return { ok: true, video: url.toString() }
  } catch {
    return { ok: false }
  }
}

const vazio = (v: unknown) => v === undefined || v === null || v === ""

/** Uma das opções da lista, ou nada (o campo é opcional); fora da lista, recusado. */
function opcional<T extends string>(
  lista: readonly T[],
  v: unknown
): { ok: true; valor: T | null } | { ok: false } {
  if (vazio(v)) return { ok: true, valor: null }
  return typeof v === "string" && (lista as readonly string[]).includes(v)
    ? { ok: true, valor: v as T }
    : { ok: false }
}

/** A caixa marcada, como o formulário manda ("on") ou como o JSON manda (true). */
const marcado = (v: unknown) => v === true || v === "on" || v === "true" || v === "sim"

/* ── a inscrição inteira ──────────────────────────────────────────────────── */

export type InscricaoLida = {
  nome: string
  whatsapp: string
  email: string
  cidade: string
  instagram: string | null
  tiktok: string | null
  seguidores: Seguidores | null
  barba: Barba
  experiencia: Experiencia | null
  video: string | null
  parceria: boolean
  modelo: Modelo
}

export type CampoDaInscricao =
  | "nome"
  | "whatsapp"
  | "email"
  | "cidade"
  | "redes"
  | "seguidores"
  | "barba"
  | "experiencia"
  | "video"
  | "modelo"
  | "aceite"

/**
 * O corpo do `POST /store/criadores`, conferido campo a campo NA ORDEM DA
 * PÁGINA — o primeiro que não serve volta com o nome dele, pra página
 * apontar o campo. `redes` é o par Instagram e TikTok: pelo menos um, e os
 * dois que vierem, certos. Sem o `aceite` (a autorização marcada, com os 18
 * anos), nada entra.
 */
export function lerInscricao(
  corpo: unknown
): { ok: true; inscricao: InscricaoLida } | { ok: false; campo: CampoDaInscricao } {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>
  const nome = limparNome(c.nome)
  if (!nome) return { ok: false, campo: "nome" }
  const whatsapp = limparWhatsapp(c.whatsapp)
  if (!whatsapp) return { ok: false, campo: "whatsapp" }
  const email = normalizarEmail(c.email)
  if (!email) return { ok: false, campo: "email" }
  const cidade = limparCidade(c.cidade)
  if (!cidade) return { ok: false, campo: "cidade" }
  const instagram = limparPerfil(c.instagram, LIMITES.instagram)
  const tiktok = limparPerfil(c.tiktok, LIMITES.tiktok)
  if (!instagram.ok || !tiktok.ok || (!instagram.perfil && !tiktok.perfil)) {
    return { ok: false, campo: "redes" }
  }
  const seguidores = opcional(SEGUIDORES, c.seguidores)
  if (!seguidores.ok) return { ok: false, campo: "seguidores" }
  const barba = opcional(BARBAS, c.barba)
  if (!barba.ok || !barba.valor) return { ok: false, campo: "barba" }
  const experiencia = opcional(EXPERIENCIAS, c.experiencia)
  if (!experiencia.ok) return { ok: false, campo: "experiencia" }
  const video = limparVideo(c.video)
  if (!video.ok) return { ok: false, campo: "video" }
  const modelo = opcional(MODELOS, c.modelo)
  if (!modelo.ok || !modelo.valor) return { ok: false, campo: "modelo" }
  if (!marcado(c.aceite)) return { ok: false, campo: "aceite" }
  return {
    ok: true,
    inscricao: {
      nome,
      whatsapp,
      email,
      cidade,
      instagram: instagram.perfil,
      tiktok: tiktok.perfil,
      seguidores: seguidores.valor,
      barba: barba.valor,
      experiencia: experiencia.valor,
      video: video.video,
      parceria: marcado(c.parceria),
      modelo: modelo.valor,
    },
  }
}
