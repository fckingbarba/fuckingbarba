import { MedusaError } from "@medusajs/framework/utils"
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto"

/**
 * O CHECK-IN DE 7 DIAS DA JORNADA (entrega 0187) — os dois botões do "Como
 * tá indo?": "Tá indo bem" (leva pra avaliar o pedido) e "Tenho uma dúvida"
 * (leva pro WhatsApp da loja, com a mensagem pronta). Nada de "não gostei":
 * escolha do dono. O clique passa pelo Medusa (`GET /crm/checkin?t=…`), que
 * anota a resposta e manda pro lugar dela.
 *
 * O `t` é o pedido e a resposta CIFRADOS (AES-256-GCM), como o link de
 * escolha: a chave é só pra isto, derivada do `JWT_SECRET`. Não vence: o
 * e-mail pode ser aberto dias depois.
 *
 * Código puro, com testes.
 */

export type RespostaDoCheckin = "bem" | "duvida"

export const RESPOSTAS_DO_CHECKIN: readonly RespostaDoCheckin[] = ["bem", "duvida"]

const PEDIDO = /^order_[0-9A-Z]{26}$/

export function chaveDoCheckin(): Buffer {
  const segredo = process.env.JWT_SECRET
  if (!segredo)
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "JWT_SECRET não configurado")
  return createHmac("sha256", segredo).update("fb-crm-checkin").digest()
}

/** O `t` do botão desta resposta pra este pedido. */
export function tokenDoCheckin(
  pedido: string,
  resposta: RespostaDoCheckin,
  chave: Buffer = chaveDoCheckin()
): string {
  if (!PEDIDO.test(pedido))
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `pedido fora do formato: ${pedido}`)
  const iv = randomBytes(12)
  const cifra = createCipheriv("aes-256-gcm", chave, iv)
  const texto = Buffer.concat([cifra.update(`${resposta}|${pedido}`, "utf8"), cifra.final()])
  return Buffer.concat([iv, texto, cifra.getAuthTag()]).toString("base64url")
}

/** O pedido e a resposta do `t`, se é um link que esta loja fez; `null` pra qualquer outra coisa. */
export function checkinDoToken(
  t: unknown,
  chave: Buffer = chaveDoCheckin()
): { pedido: string; resposta: RespostaDoCheckin } | null {
  if (typeof t !== "string" || t.length < 40 || t.length > 200 || !/^[\w-]+$/.test(t)) return null
  const bytes = Buffer.from(t, "base64url")
  if (bytes.length < 12 + 16 + 5) return null
  try {
    const decifra = createDecipheriv("aes-256-gcm", chave, bytes.subarray(0, 12))
    decifra.setAuthTag(bytes.subarray(bytes.length - 16))
    const [resposta, pedido] = Buffer.concat([
      decifra.update(bytes.subarray(12, bytes.length - 16)),
      decifra.final(),
    ])
      .toString("utf8")
      .split("|")
    if (!PEDIDO.test(pedido) || !RESPOSTAS_DO_CHECKIN.includes(resposta as RespostaDoCheckin))
      return null
    return { pedido, resposta: resposta as RespostaDoCheckin }
  } catch {
    return null
  }
}

/** Os dois botões deste pedido, no endereço do Medusa (`MEDUSA_BACKEND_URL`). */
export function linksDoCheckin(pedido: string): Record<RespostaDoCheckin, string> | null {
  const backend = (process.env.MEDUSA_BACKEND_URL ?? "").trim().replace(/\/+$/, "")
  if (!/^https?:\/\//.test(backend)) return null
  const chave = chaveDoCheckin()
  return Object.fromEntries(
    RESPOSTAS_DO_CHECKIN.map((r) => [
      r,
      `${backend}/crm/checkin?t=${tokenDoCheckin(pedido, r, chave)}`,
    ])
  ) as Record<RespostaDoCheckin, string>
}

/** O link do WhatsApp da loja com a mensagem da dúvida pronta, ou `null` sem o número. */
export function whatsappDaDuvida(whatsapp: string | null, numero: number | null): string | null {
  const digitos = (whatsapp ?? "").replace(/\D/g, "")
  if (digitos.length < 10) return null
  const texto = numero
    ? `Oi! Tenho uma dúvida sobre o meu pedido #${numero}.`
    : "Oi! Tenho uma dúvida sobre o meu pedido."
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`
}
