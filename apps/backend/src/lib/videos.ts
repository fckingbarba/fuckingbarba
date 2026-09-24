import { MedusaError } from "@medusajs/framework/utils"
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

/**
 * O VÍDEO QUE SOBE PELO PAINEL — da galeria da dobra ou do modo de uso.
 *
 * ┌─ POR QUE ELE NÃO PASSA PELO PAINEL ────────────────────────────────────┐
 * │ A foto vai do navegador pro painel (Vercel) e dele pro Medusa. Vídeo   │
 * │ não cabe nesse caminho: a Vercel não deixa passar pedido maior que     │
 * │ 4,5 MB, e um vídeo de 20 segundos tem 20. Então o painel pede ao       │
 * │ Medusa um BILHETE (`/dashboard/produtos/:id/videos/envio`, com o papel │
 * │ conferido) e o navegador manda o arquivo direto pro Medusa, com o      │
 * │ bilhete no endereço (`PUT /painel-envio/:bilhete`). O Medusa grava em  │
 * │ fluxo no armazenamento da loja — o arquivo não fica inteiro na memória │
 * │ — e devolve o endereço, que o painel grava na galeria ou na seção.     │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O BILHETE vale uma vez, por 15 minutos, pra um produto, um tipo e um
 * tamanho exatos, e é assinado com uma chave que só o Medusa tem (derivada
 * do `JWT_SECRET`). O tipo sai dos BYTES do arquivo, não do nome: a família
 * do MP4 (o .MOV do iPhone é da mesma família e sobe como MP4) ou WebM.
 * Quem olha o codec — H.264 toca em todo lugar; o HEVC do iPhone, quase — é
 * o painel, antes de subir (`apps/dashboard/src/lib/video-no-navegador.ts`).
 */

export const TIPOS_DE_VIDEO = { "video/mp4": "mp4", "video/webm": "webm" } as const
export type TipoDeVideo = keyof typeof TIPOS_DE_VIDEO

export const ehTipoDeVideo = (v: unknown): v is TipoDeVideo =>
  typeof v === "string" && v in TIPOS_DE_VIDEO

/** Até 50 MB — o mesmo limite do vídeo da home, no admin (e o do Supabase no plano grátis). */
export const LIMITE_DO_VIDEO_EM_BYTES = 50 * 1024 * 1024

/**
 * O tipo do vídeo pelos primeiros bytes. A família do MP4 começa com a
 * caixa `ftyp` no byte 4 — o .MOV do iPhone (marca `qt  `) inclusive: é o
 * mesmo formato de caixas, e o navegador que toca o codec dele toca o
 * arquivo servido como MP4. WebM começa com o cabeçalho EBML (1A 45 DF A3).
 */
export function tipoDoVideo(bytes: Buffer): TipoDeVideo | null {
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("latin1") === "ftyp") return "video/mp4"
  if (bytes.length >= 4 && bytes.readUInt32BE(0) === 0x1a45dfa3) return "video/webm"
  return null
}

/* ── o bilhete ────────────────────────────────────────────────────────────── */

export type Envio = {
  produtoId: string
  membroId: string
  tipo: TipoDeVideo
  tamanho: number
}

const VALIDADE_MS = 15 * 60 * 1000

function chave(): Buffer {
  const segredo = process.env.JWT_SECRET
  if (!segredo)
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "JWT_SECRET não configurado")
  // Uma chave só pra isto: o bilhete não vale como nada que o JWT_SECRET assine.
  return createHmac("sha256", segredo).update("fb-painel-envio-de-video").digest()
}

const assinar = (corpo: string) => createHmac("sha256", chave()).update(corpo).digest("base64url")

export function emitirEnvio(envio: Envio, agora = Date.now()): string {
  const corpo = Buffer.from(
    JSON.stringify({
      ...envio,
      expira: agora + VALIDADE_MS,
      n: randomBytes(9).toString("base64url"),
    })
  ).toString("base64url")
  return `${corpo}.${assinar(corpo)}`
}

/** O bilhete, se a assinatura confere e ainda está no prazo; `null` pra qualquer outra coisa. */
export function lerEnvio(bilhete: string, agora = Date.now()): (Envio & { n: string }) | null {
  const [corpo, assinatura, ...resto] = bilhete.split(".")
  if (!corpo || !assinatura || resto.length) return null
  const esperada = Buffer.from(assinar(corpo))
  const recebida = Buffer.from(assinatura)
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null
  try {
    const e = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >
    if (typeof e.expira !== "number" || e.expira < agora) return null
    if (
      typeof e.produtoId !== "string" ||
      typeof e.membroId !== "string" ||
      !ehTipoDeVideo(e.tipo) ||
      typeof e.tamanho !== "number" ||
      typeof e.n !== "string"
    )
      return null
    return {
      produtoId: e.produtoId,
      membroId: e.membroId,
      tipo: e.tipo,
      tamanho: e.tamanho,
      n: e.n,
    }
  } catch {
    return null
  }
}

/**
 * Os bilhetes já usados, pra cada um valer UMA vez. Na memória do processo:
 * o envio cai no servidor (o worker não atende HTTP), e o bilhete morre em
 * 15 minutos de qualquer jeito.
 */
const usados = new Map<string, number>()

export function gastarEnvio(n: string, agora = Date.now()): boolean {
  for (const [k, ate] of usados) if (ate < agora) usados.delete(k)
  if (usados.has(n)) return false
  usados.set(n, agora + VALIDADE_MS)
  return true
}
