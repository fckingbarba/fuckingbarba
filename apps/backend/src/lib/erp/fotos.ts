import type { MedusaContainer } from "@medusajs/framework/types"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"

/**
 * AS FOTOS DO ERP VÊM PRO ARMAZENAMENTO DA LOJA.
 *
 * Apontar a vitrine pro link do ERP seria mais rápido e errado: a foto que
 * sobe pro Bling tem link que VENCE (horas), e a externa pode sair do ar com
 * a loja antiga. Então a importação baixa cada uma e sobe pro armazenamento
 * da loja (Supabase Storage em produção), como `scripts/produtos-iniciais.ts`
 * já fazia com as fotos da Nuvemshop.
 *
 * O TIPO SAI DOS BYTES, não do cabeçalho: o S3 por trás do Bling costuma
 * responder `binary/octet-stream`. O que não for jpg, png, webp, gif ou avif
 * fica de fora.
 */

const LIMITE_EM_BYTES = 10 * 1024 * 1024
const PRAZO_MS = 30_000

const ascii = (b: Uint8Array, de: number, ate: number) =>
  String.fromCharCode(...Array.from(b.subarray(de, ate)))

export function tipoDaImagem(b: Uint8Array): { mime: string; extensao: string } | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { mime: "image/jpeg", extensao: "jpg" }
  if (b.length >= 8 && ascii(b, 1, 4) === "PNG" && b[0] === 0x89)
    return { mime: "image/png", extensao: "png" }
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP")
    return { mime: "image/webp", extensao: "webp" }
  if (b.length >= 6 && ascii(b, 0, 4) === "GIF8") return { mime: "image/gif", extensao: "gif" }
  if (b.length >= 12 && ascii(b, 4, 8) === "ftyp" && /^avi[fs]$/.test(ascii(b, 8, 12)))
    return { mime: "image/avif", extensao: "avif" }
  return null
}

/**
 * Em produção, a loja só busca foto na internet aberta: endereço de rede
 * interna (o do Railway, o da própria máquina) não é foto de produto, e
 * buscar ali a pedido de um link cadastrado seria abrir a rede pra ele.
 */
export function enderecoPermitido(url: string, producao: boolean): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false
  if (!producao) return true
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  return !(
    host === "localhost" ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    /^(127|10|0)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "::1" ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe80:/.test(host)
  )
}

export type FotoBaixada =
  { ok: true; bytes: Buffer; mime: string; extensao: string } | { ok: false; motivo: string }

export async function baixarFoto(url: string): Promise<FotoBaixada> {
  if (!enderecoPermitido(url, process.env.NODE_ENV === "production"))
    return { ok: false, motivo: "endereço que a loja não busca" }
  let r: Response
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(PRAZO_MS) })
  } catch (e) {
    const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
    return {
      ok: false,
      motivo: tempo
        ? "não respondeu a tempo"
        : `não atendeu (${e instanceof Error ? e.message : e})`,
    }
  }
  if (!r.ok) return { ok: false, motivo: `respondeu ${r.status}` }
  if (Number(r.headers.get("content-length") ?? 0) > LIMITE_EM_BYTES)
    return { ok: false, motivo: "maior que 10 MB" }
  const bytes = Buffer.from(await r.arrayBuffer())
  if (bytes.length > LIMITE_EM_BYTES) return { ok: false, motivo: "maior que 10 MB" }
  const tipo = tipoDaImagem(bytes)
  if (!tipo) return { ok: false, motivo: "não é imagem (jpg, png, webp, gif ou avif)" }
  return { ok: true, bytes, ...tipo }
}

/** Sobe pro armazenamento da loja e devolve o endereço público. */
export async function guardarFoto(
  container: MedusaContainer,
  nome: string,
  foto: { bytes: Buffer; mime: string; extensao: string }
): Promise<string> {
  const {
    result: [arquivo],
  } = await uploadFilesWorkflow(container).run({
    input: {
      files: [
        {
          filename: `${nome}.${foto.extensao}`,
          mimeType: foto.mime,
          content: foto.bytes.toString("base64"),
          access: "public",
        },
      ],
    },
  })
  return arquivo.url
}
