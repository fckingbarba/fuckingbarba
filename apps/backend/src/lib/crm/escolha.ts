import { MedusaError } from "@medusajs/framework/utils"
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto"
import { normalizarEmail } from "../../modules/codigo/regras"

/**
 * O LINK DE ESCOLHA — os botões do "Barba ou cabelo?", o e-mail de 1 dia das
 * boas-vindas de quem se cadastrou sem ver produto (entrega 0178). Cada botão
 * diz uma trilha; o clique passa pelo Medusa (`GET /crm/escolha?t=…`), que
 * anota a escolha e manda pra loja, na página do que a pessoa escolheu.
 *
 * O `t` é o e-mail e a trilha CIFRADOS (AES-256-GCM), como o link de sair da
 * lista: e-mail de alguém não vai cru em endereço de página. A chave é só
 * pra isto, derivada do `JWT_SECRET`. Não vence: o e-mail pode ser aberto
 * dias depois, e a escolha vale do mesmo jeito.
 *
 * Código puro, com testes.
 */

export type TrilhaEscolhida = "crescimento" | "cuidado" | "cabelo"

export const TRILHAS_ESCOLHIDAS: readonly TrilhaEscolhida[] = ["crescimento", "cuidado", "cabelo"]

/** Pra onde cada escolha leva, na loja. */
export const DESTINO_DA_ESCOLHA: Record<TrilhaEscolhida, string> = {
  crescimento: "/produtos/fator-de-crescimento-para-barba",
  cuidado: "/para-barba",
  cabelo: "/para-cabelo",
}

export function chaveDeEscolha(): Buffer {
  const segredo = process.env.JWT_SECRET
  if (!segredo)
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "JWT_SECRET não configurado")
  return createHmac("sha256", segredo).update("fb-crm-escolha").digest()
}

/** O `t` do botão desta trilha pra este e-mail. */
export function tokenDeEscolha(
  email: string,
  trilha: TrilhaEscolhida,
  chave: Buffer = chaveDeEscolha()
): string {
  const limpo = normalizarEmail(email)
  if (!limpo) throw new MedusaError(MedusaError.Types.INVALID_DATA, "e-mail inválido")
  const iv = randomBytes(12)
  const cifra = createCipheriv("aes-256-gcm", chave, iv)
  const texto = Buffer.concat([cifra.update(`${trilha}|${limpo}`, "utf8"), cifra.final()])
  return Buffer.concat([iv, texto, cifra.getAuthTag()]).toString("base64url")
}

/** O e-mail e a trilha do `t`, se é um link que esta loja fez; `null` pra qualquer outra coisa. */
export function escolhaDoToken(
  t: unknown,
  chave: Buffer = chaveDeEscolha()
): { email: string; trilha: TrilhaEscolhida } | null {
  if (typeof t !== "string" || t.length < 40 || t.length > 600 || !/^[\w-]+$/.test(t)) return null
  const bytes = Buffer.from(t, "base64url")
  if (bytes.length < 12 + 16 + 5) return null
  try {
    const decifra = createDecipheriv("aes-256-gcm", chave, bytes.subarray(0, 12))
    decifra.setAuthTag(bytes.subarray(bytes.length - 16))
    const [trilha, bruto] = Buffer.concat([
      decifra.update(bytes.subarray(12, bytes.length - 16)),
      decifra.final(),
    ])
      .toString("utf8")
      .split("|")
    const email = normalizarEmail(bruto)
    if (!email || !TRILHAS_ESCOLHIDAS.includes(trilha as TrilhaEscolhida)) return null
    return { email, trilha: trilha as TrilhaEscolhida }
  } catch {
    return null
  }
}

/** Os três botões pra este e-mail, no endereço do Medusa (`MEDUSA_BACKEND_URL`). */
export function linksDeEscolha(email: string): Record<TrilhaEscolhida, string> | null {
  const backend = (process.env.MEDUSA_BACKEND_URL ?? "").trim().replace(/\/+$/, "")
  if (!/^https?:\/\//.test(backend)) return null
  const chave = chaveDeEscolha()
  return Object.fromEntries(
    TRILHAS_ESCOLHIDAS.map((t) => [
      t,
      `${backend}/crm/escolha?t=${tokenDeEscolha(email, t, chave)}`,
    ])
  ) as Record<TrilhaEscolhida, string>
}
