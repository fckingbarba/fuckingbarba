import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"
import type { Credenciais } from "./contrato"

/**
 * O COFRE DAS CREDENCIAIS DO ERP — AES-256-GCM.
 *
 * Os tokens do ERP abrem tudo lá: emitir nota, ler cliente, mexer em
 * estoque. No banco eles ficam cifrados, com uma chave que NÃO está no
 * banco: ela sai, por HKDF, do segredo do app no ERP (no Bling, o
 * `BLING_CLIENT_SECRET`, que só existe no Railway). Quem copiar o banco
 * leva um texto que não serve pra nada.
 *
 * TROCOU O SEGREDO DO APP, CONECTA DE NOVO: o que estava guardado deixa de
 * abrir (`abrir` devolve `null`), e o admin mostra "desconectado". É o
 * comportamento certo — o segredo novo é justamente pra invalidar o velho.
 */

const VERSAO = "v1"

function chave(segredo: string, erp: string): Buffer {
  return Buffer.from(hkdfSync("sha256", segredo, "fuckingbarba/erp", `credenciais:${erp}`, 32))
}

export function fechar(credenciais: Credenciais, segredo: string, erp: string): string {
  const iv = randomBytes(12)
  const cifra = createCipheriv("aes-256-gcm", chave(segredo, erp), iv)
  const corpo = Buffer.concat([cifra.update(JSON.stringify(credenciais), "utf8"), cifra.final()])
  return [VERSAO, iv, cifra.getAuthTag(), corpo]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".")
}

/** As credenciais, ou `null` se não abrir (segredo trocado, texto adulterado). */
export function abrir(fechado: string, segredo: string, erp: string): Credenciais | null {
  const [versao, iv, marca, corpo] = fechado.split(".")
  if (versao !== VERSAO || !iv || !marca || !corpo) return null
  try {
    const decifra = createDecipheriv(
      "aes-256-gcm",
      chave(segredo, erp),
      Buffer.from(iv, "base64url")
    )
    decifra.setAuthTag(Buffer.from(marca, "base64url"))
    const texto = Buffer.concat([decifra.update(Buffer.from(corpo, "base64url")), decifra.final()])
    const c = JSON.parse(texto.toString("utf8")) as Partial<Credenciais>
    if (
      typeof c.acesso !== "string" ||
      typeof c.renovacao !== "string" ||
      typeof c.expiraEm !== "string"
    ) {
      return null
    }
    return { acesso: c.acesso, renovacao: c.renovacao, expiraEm: c.expiraEm }
  } catch {
    return null
  }
}
