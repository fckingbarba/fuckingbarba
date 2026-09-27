import { MedusaError } from "@medusajs/framework/utils"
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto"
import { normalizarEmail } from "../../modules/codigo/regras"
import type { EmailDoCrm } from "../emails/crm"

/**
 * O LINK DE SAIR DA LISTA — o que vai no rodapé de todo e-mail de oferta do
 * CRM, e no cabeçalho `List-Unsubscribe` (o "cancelar inscrição" que o Gmail
 * e o Mail do iPhone mostram lá no alto).
 *
 * O `t` do link é o e-mail da pessoa CIFRADO (AES-256-GCM), e não o e-mail:
 * endereço de página vai pra histórico de navegador e log de servidor, e o
 * e-mail de alguém não tem que estar lá. A chave é só pra isto, derivada do
 * `JWT_SECRET` (que só o Medusa tem), como a do link da avaliação. Ninguém
 * faz o link de outra pessoa sem ela: o GCM recusa o `t` mexido.
 *
 * NÃO VENCE: o e-mail pode ser aberto meses depois, e sair da lista tem que
 * funcionar do mesmo jeito. Trocou o `JWT_SECRET`, os links velhos param —
 * e a pessoa ainda sai pela página de privacidade ou pelo WhatsApp.
 *
 * Código puro, com testes.
 */

/** A chave de cifrar os links (32 bytes). */
export function chaveDeSair(): Buffer {
  const segredo = process.env.JWT_SECRET
  if (!segredo)
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "JWT_SECRET não configurado")
  return createHmac("sha256", segredo).update("fb-crm-sair-da-lista").digest()
}

/** O `t` do link pra este e-mail. */
export function tokenDeSair(email: string, chave: Buffer = chaveDeSair()): string {
  const limpo = normalizarEmail(email)
  if (!limpo) throw new MedusaError(MedusaError.Types.INVALID_DATA, "e-mail inválido")
  const iv = randomBytes(12)
  const cifra = createCipheriv("aes-256-gcm", chave, iv)
  const texto = Buffer.concat([cifra.update(limpo, "utf8"), cifra.final()])
  return Buffer.concat([iv, texto, cifra.getAuthTag()]).toString("base64url")
}

/** O e-mail do `t`, se é um link que esta loja fez; `null` pra qualquer outra coisa. */
export function emailDoTokenDeSair(t: unknown, chave: Buffer = chaveDeSair()): string | null {
  if (typeof t !== "string" || t.length < 40 || t.length > 600 || !/^[\w-]+$/.test(t)) return null
  const bytes = Buffer.from(t, "base64url")
  if (bytes.length < 12 + 16 + 3) return null
  try {
    const decifra = createDecipheriv("aes-256-gcm", chave, bytes.subarray(0, 12))
    decifra.setAuthTag(bytes.subarray(bytes.length - 16))
    const email = Buffer.concat([
      decifra.update(bytes.subarray(12, bytes.length - 16)),
      decifra.final(),
    ]).toString("utf8")
    return normalizarEmail(email)
  } catch {
    return null
  }
}

/** Os links de sair da lista pra um e-mail: a página da loja e o clique único do backend. */
export function linksDeSair(loja: string, email: string): EmailDoCrm["sair"] {
  const t = tokenDeSair(email)
  const backend = (process.env.MEDUSA_BACKEND_URL ?? "").trim().replace(/\/+$/, "")
  return {
    pagina: `${loja}/sair/${t}`,
    umClique: /^https:\/\//.test(backend) ? `${backend}/crm/sair?t=${t}` : null,
  }
}
