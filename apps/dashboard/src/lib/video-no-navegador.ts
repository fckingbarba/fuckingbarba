import { desenharEmArquivo } from "@/lib/imagem-no-navegador"
import { MEDIDA_MAXIMA, tamanhoDoArquivo, VIDEO } from "@/lib/produtos"

/**
 * O VÍDEO ESCOLHIDO, NO NAVEGADOR — antes e durante a subida.
 *
 * Antes: confere o peso e o formato pelos BYTES, não pelo nome — a família
 * do MP4 (o .MOV do iPhone é da mesma família) ou WebM —, lê o codec da
 * trilha de vídeo (`codecDoVideo`: H.264 toca em todo lugar; o HEVC do
 * iPhone toca no iPhone, no Mac e na maioria dos Android, e a tela avisa),
 * lê as medidas e a duração abrindo o vídeo, e tira a CAPA — um quadro do
 * começo, que sobe como imagem (`poster`) e aparece na miniatura da galeria
 * e até o vídeo tocar.
 *
 * Durante: manda o arquivo DIRETO pro Medusa, com o bilhete que o painel
 * pediu (`lib/acoes/produtos.ts`, `pedirEnvioDeVideo`) — a Vercel não passa
 * pedido maior que 4,5 MB. É um PUT com o arquivo cru, e o progresso vem do
 * próprio navegador.
 *
 * Só roda no navegador.
 */

export const ACEITA_VIDEO = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm"

export type TipoDeVideo = "video/mp4" | "video/webm"

/** O codec da trilha de vídeo: é ele que decide em que aparelho o vídeo toca. */
export type CodecDoVideo = "h264" | "hevc" | "webm"

export type VideoLido =
  | {
      ok: true
      tipo: TipoDeVideo
      codec: CodecDoVideo
      largura: number
      altura: number
      duracao: number
      capa: Blob
    }
  | { ok: false; texto: string }

type Caixa = { tipo: string; corpo: number; fim: number }

/** As caixas (`tamanho` + `tipo` de 4 letras) entre `ini` e `fim` — o jeito do MP4 e do MOV. */
function caixas(d: DataView, ini: number, fim: number): Caixa[] {
  const lista: Caixa[] = []
  for (let i = ini; i + 8 <= fim;) {
    let tamanho = d.getUint32(i)
    let cabeca = 8
    if (tamanho === 1 && i + 16 <= fim) {
      tamanho = Number(d.getBigUint64(i + 8))
      cabeca = 16
    } else if (tamanho === 0) tamanho = fim - i
    if (tamanho < cabeca || i + tamanho > fim) break
    const tipo = String.fromCharCode(
      d.getUint8(i + 4),
      d.getUint8(i + 5),
      d.getUint8(i + 6),
      d.getUint8(i + 7)
    )
    lista.push({ tipo, corpo: i + cabeca, fim: i + tamanho })
    i += tamanho
  }
  return lista
}

function dentro(d: DataView, caixa: Caixa, caminho: string[]): Caixa | null {
  let atual: Caixa | null = caixa
  for (const tipo of caminho) {
    atual = atual ? (caixas(d, atual.corpo, atual.fim).find((c) => c.tipo === tipo) ?? null) : null
  }
  return atual
}

/**
 * O codec da trilha de VÍDEO de um arquivo da família do MP4 (MP4, MOV):
 * `moov → trak → mdia → minf → stbl → stsd`, a primeira amostra. `null`
 * quando o arquivo não é dessa família (não começa com `ftyp`).
 */
export function codecDoVideo(bytes: ArrayBuffer): "h264" | "hevc" | "outro" | null {
  const d = new DataView(bytes)
  const topo = caixas(d, 0, d.byteLength)
  if (topo[0]?.tipo !== "ftyp") return null
  const moov = topo.find((c) => c.tipo === "moov")
  if (!moov) return "outro"
  for (const trak of caixas(d, moov.corpo, moov.fim).filter((c) => c.tipo === "trak")) {
    const hdlr = dentro(d, trak, ["mdia", "hdlr"])
    // hdlr: versão e flags (4), pre_defined (4), e o tipo da trilha.
    if (!hdlr || hdlr.corpo + 12 > hdlr.fim) continue
    const trilha = String.fromCharCode(...[8, 9, 10, 11].map((k) => d.getUint8(hdlr.corpo + k)))
    if (trilha !== "vide") continue
    const stsd = dentro(d, trak, ["mdia", "minf", "stbl", "stsd"])
    // stsd: versão e flags (4), quantas (4), e a primeira: tamanho (4) e o codec (4).
    if (!stsd || stsd.corpo + 16 > stsd.fim) return "outro"
    const codec = String.fromCharCode(...[12, 13, 14, 15].map((k) => d.getUint8(stsd.corpo + k)))
    if (codec === "avc1" || codec === "avc3") return "h264"
    if (codec === "hvc1" || codec === "hev1") return "hevc"
    return "outro"
  }
  return "outro"
}

const ESPERA_MS = 20_000

/** Espera um evento do vídeo, com prazo: vídeo que não abre não trava a tela. */
function esperar(v: HTMLVideoElement, evento: string): Promise<boolean> {
  return new Promise((pronto) => {
    const fim = (ok: boolean) => {
      clearTimeout(prazo)
      v.removeEventListener(evento, deu)
      v.removeEventListener("error", falhou)
      pronto(ok)
    }
    const deu = () => fim(true)
    const falhou = () => fim(false)
    const prazo = setTimeout(() => fim(false), ESPERA_MS)
    v.addEventListener(evento, deu, { once: true })
    v.addEventListener("error", falhou, { once: true })
  })
}

export async function lerVideoNoNavegador(arquivo: File): Promise<VideoLido> {
  if (arquivo.size > VIDEO.maximoMB * 1024 * 1024)
    return {
      ok: false,
      texto: `O vídeo tem ${tamanhoDoArquivo(arquivo.size)}, e o limite é ${VIDEO.maximoMB} MB. Encurte ou comprima antes.`,
    }
  // O formato sai dos bytes: um .MP4 que é .MOV por dentro (ou o contrário) não engana.
  const bytes = await arquivo.arrayBuffer()
  const inicio = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength))
  const ehWebm = inicio.length === 4 && inicio.join() === [0x1a, 0x45, 0xdf, 0xa3].join()
  const codecMp4 = ehWebm ? null : codecDoVideo(bytes)
  if (!ehWebm && !codecMp4)
    return { ok: false, texto: "Esse arquivo não é um vídeo. Use MP4, MOV ou WebM." }
  if (codecMp4 === "outro")
    return {
      ok: false,
      texto:
        "Esse vídeo está num formato que nem todo navegador toca. Exporte em H.264 (MP4) e tente de novo.",
    }
  const tipo: TipoDeVideo = ehWebm ? "video/webm" : "video/mp4"
  const codec: CodecDoVideo = ehWebm ? "webm" : (codecMp4 as "h264" | "hevc")

  // Aberto como MP4 (o .MOV também): é assim que a loja vai servir.
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }))
  const v = document.createElement("video")
  v.muted = true
  v.playsInline = true
  v.preload = "auto"
  v.src = url
  try {
    const NAO_ABRE =
      codec === "hevc"
        ? "Esse vídeo está em HEVC (o formato do iPhone), que este navegador não abre. Abra o painel no Chrome ou no Safari — ou exporte em H.264."
        : "Esse vídeo não abre neste navegador. Exporte como MP4 (H.264) e tente de novo."
    if (!(await esperar(v, "loadedmetadata")) || !v.videoWidth || !v.videoHeight)
      return { ok: false, texto: NAO_ABRE }
    let duracao = v.duration
    // O WebM gravado pelo navegador vem sem a duração no cabeçalho: ela aparece indo pro fim.
    if (!Number.isFinite(duracao)) {
      v.currentTime = 1e7
      await esperar(v, "seeked")
      duracao = v.duration
    }
    if (!Number.isFinite(duracao) || duracao <= 0) return { ok: false, texto: NAO_ABRE }

    // A capa: um quadro do começo (o primeiro às vezes é preto).
    v.currentTime = Math.min(1, duracao / 3)
    if (!(await esperar(v, "seeked"))) return { ok: false, texto: NAO_ABRE }
    const { largura: maxL, altura: maxA } = MEDIDA_MAXIMA.poster
    const escala = Math.min(1, maxL / v.videoWidth, maxA / v.videoHeight)
    const capa = await desenharEmArquivo(
      v,
      Math.round(v.videoWidth * escala),
      Math.round(v.videoHeight * escala),
      0.85
    )
    if (!capa) return { ok: false, texto: NAO_ABRE }
    return { ok: true, tipo, codec, largura: v.videoWidth, altura: v.videoHeight, duracao, capa }
  } finally {
    v.removeAttribute("src")
    v.load()
    URL.revokeObjectURL(url)
  }
}

const RECUSA: Record<string, string> = {
  nao_e_video: "Esse arquivo não é um vídeo MP4, MOV ou WebM. Exporte de novo e tente outra vez.",
  tamanho: "O vídeo chegou pela metade. Tente de novo.",
  tipo: "O vídeo chegou pela metade. Tente de novo.",
  bilhete_invalido: "A autorização pra subir venceu. Escolha o vídeo de novo.",
  bilhete_usado: "A autorização pra subir venceu. Escolha o vídeo de novo.",
}

/**
 * Manda o arquivo pro endereço do bilhete, contando o progresso (de 0 a 1).
 * É `XMLHttpRequest` e não `fetch` porque só ele conta o que já SUBIU.
 */
export function enviarVideo(
  destino: string,
  arquivo: File,
  tipo: TipoDeVideo,
  aoAndar: (fracao: number) => void
): Promise<{ ok: true; url: string } | { ok: false; texto: string }> {
  return new Promise((pronto) => {
    const x = new XMLHttpRequest()
    x.open("PUT", destino)
    x.setRequestHeader("content-type", tipo)
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) aoAndar(e.loaded / e.total)
    }
    x.onload = () => {
      let corpo: { url?: unknown; message?: unknown } = {}
      try {
        corpo = JSON.parse(x.responseText) as typeof corpo
      } catch {
        // resposta que não é JSON: cai no genérico
      }
      if (x.status === 200 && typeof corpo.url === "string")
        return pronto({ ok: true, url: corpo.url })
      pronto({
        ok: false,
        texto:
          RECUSA[String(corpo.message)] ??
          "Não consegui subir o vídeo agora. Tente de novo em instantes.",
      })
    }
    x.onerror = () =>
      pronto({ ok: false, texto: "A conexão caiu no meio da subida. Tente de novo." })
    x.send(arquivo)
  })
}
