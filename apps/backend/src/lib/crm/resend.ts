import { createHmac, timingSafeEqual } from "node:crypto"
import { normalizarEmail } from "../../modules/codigo/regras"
import { semDadoPessoal } from "../observabilidade/sinal"
import { dominioDe, normalizarPagina } from "../observabilidade/telemetria"

/**
 * OS AVISOS DO RESEND — o que aconteceu com cada e-mail depois que ele saiu:
 * chegou, foi aberto, levou um clique, voltou, virou reclamação de spam. O
 * Resend avisa por webhook (`POST /hooks/resend`), assinado no padrão Svix;
 * a linha de cada e-mail mora na tabela `crm_email` (o módulo `crm`).
 *
 * Código puro, com testes. O aviso vem de fora — nada dele é de confiança
 * antes da assinatura, e mesmo depois dela só fica o que o CRM usa: o
 * endereço (é por ele que o e-mail é da pessoa), o tipo do e-mail (a
 * etiqueta que a loja pôs no envio, `lib/email.ts`), as horas e, no clique,
 * a página da loja sem o que identifica alguém. O assunto NÃO fica: o do
 * código de entrar tem o código. O IP e o navegador do clique também não.
 */

/** O que cada aviso muda na linha do e-mail. */
export type Campo =
  | "enviado"
  | "entregue"
  | "atrasado"
  | "aberto"
  | "clicado"
  | "devolvido"
  | "reclamou"
  | "falhou"
  | "suprimido"

const DO_RESEND = new Map<string, Campo>([
  ["email.sent", "enviado"],
  ["email.delivered", "entregue"],
  ["email.delivery_delayed", "atrasado"],
  ["email.opened", "aberto"],
  ["email.clicked", "clicado"],
  ["email.bounced", "devolvido"],
  ["email.complained", "reclamou"],
  ["email.failed", "falhou"],
  ["email.suppressed", "suprimido"],
])

export type AvisoDoEmail = {
  campo: Campo
  /** O id do e-mail no Resend (`data.email_id`): é a linha. */
  resendId: string
  para: string | null
  /** A etiqueta `tipo` do envio ("pedido-confirmado", "envio-postado"…). */
  tipo: string | null
  /** Quando o e-mail saiu (`data.created_at`). */
  enviadoEm: Date | null
  /** Quando aconteceu o que o aviso conta. */
  em: Date
  /** O clique: a página da loja ("/conta/pedidos/:id") ou o domínio de fora ("instagram.com"). */
  link: string | null
  /** A devolução: o tipo e o porquê, sem e-mail nem CPF ("Permanent · General: …"). */
  devolucao: string | null
}

/** Cinco minutos pra lá ou pra cá: aviso mais velho que isso é repetição de alguém. */
export const TOLERANCIA_S = 5 * 60

/**
 * A ASSINATURA DO RESEND (o padrão Svix): HMAC-SHA256, com a parte do
 * segredo depois do `whsec_` decodificada de base64, sobre
 * `<svix-id>.<svix-timestamp>.<corpo cru>`. O cabeçalho `svix-signature`
 * pode trazer mais de uma (`v1,<base64> v1,<base64>`, na troca de segredo):
 * basta uma bater. E a hora do aviso tem que ser a de agora.
 */
export function assinaturaConfere(p: {
  id: unknown
  timestamp: unknown
  assinaturas: unknown
  corpo: string
  segredo: string | undefined
  agora?: number
}): boolean {
  if (typeof p.id !== "string" || typeof p.timestamp !== "string") return false
  if (typeof p.assinaturas !== "string" || !p.segredo || !p.id || !p.corpo) return false
  const ts = Number(p.timestamp)
  const agora = (p.agora ?? Date.now()) / 1000
  if (!Number.isFinite(ts) || Math.abs(agora - ts) > TOLERANCIA_S) return false
  const chave = Buffer.from(p.segredo.replace(/^whsec_/, ""), "base64")
  if (!chave.length) return false
  const esperada = createHmac("sha256", chave).update(`${p.id}.${p.timestamp}.${p.corpo}`).digest()
  return p.assinaturas.split(" ").some((parte) => {
    const [versao, assinatura] = parte.split(",")
    if (versao !== "v1" || !assinatura) return false
    const recebida = Buffer.from(assinatura, "base64")
    return recebida.length === esperada.length && timingSafeEqual(recebida, esperada)
  })
}

const data = (v: unknown): Date | null => {
  if (typeof v !== "string") return null
  const d = new Date(v)
  return Number.isFinite(d.getTime()) ? d : null
}

/** A etiqueta como a loja põe: minúscula, letra, número, "-" e "_" (é o que o Resend aceita). */
export function etiquetaLimpa(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return t || null
}

/**
 * O clique: na loja, a página sem a busca e sem o que identifica alguém (o
 * link do pedido tem o id); fora dela, só o domínio (o Instagram do rodapé).
 */
export function linkLimpo(bruto: unknown, loja: string | null): string | null {
  if (typeof bruto !== "string" || !bruto) return null
  let url: URL
  try {
    url = new URL(bruto)
  } catch {
    return null
  }
  const dominio = dominioDe(bruto)
  if (loja && dominio === loja.replace(/^www\./, "")) return normalizarPagina(url.pathname)
  return dominio
}

/** "Permanent · General: 550 5.1.1 a•••@x.com não existe" — o porquê, sem dado de ninguém. */
function aDevolucao(bruto: unknown): string | null {
  const b = (bruto ?? {}) as Record<string, unknown>
  const tipo = [b.type, b.subType].filter((v) => typeof v === "string" && v).join(" · ")
  const porque = semDadoPessoal(typeof b.message === "string" ? b.message : "", 200)
  const texto = [tipo, porque].filter(Boolean).join(": ")
  return texto ? texto.slice(0, 260) : null
}

/**
 * O aviso que vale, do corpo `{ type, created_at, data }`. Nulo pro que não é
 * de e-mail, pro tipo que o CRM não usa e pro que não diz de qual e-mail é.
 * `loja` é o domínio da própria loja (o clique que é página dela).
 */
export function lerAvisoDoResend(corpo: unknown, loja: string | null): AvisoDoEmail | null {
  const c = (corpo ?? {}) as Record<string, unknown>
  const campo = typeof c.type === "string" ? DO_RESEND.get(c.type) : undefined
  const d = (c.data ?? {}) as Record<string, unknown>
  const resendId = typeof d.email_id === "string" ? d.email_id.trim().slice(0, 100) : ""
  if (!campo || !resendId) return null

  const para = Array.isArray(d.to) ? normalizarEmail(d.to[0]) : normalizarEmail(d.to)
  const tags = (d.tags ?? {}) as Record<string, unknown>
  const tipo = etiquetaLimpa(Array.isArray(tags) ? null : tags.tipo)
  const clique = (d.click ?? {}) as Record<string, unknown>
  const em =
    (campo === "clicado" ? data(clique.timestamp) : null) ??
    data(c.created_at) ??
    data(d.created_at) ??
    new Date()

  return {
    campo,
    resendId,
    para,
    tipo,
    enviadoEm: data(d.created_at),
    em,
    link: campo === "clicado" ? linkLimpo(clique.link, loja) : null,
    devolucao: campo === "devolvido" ? aDevolucao(d.bounce) : null,
  }
}
