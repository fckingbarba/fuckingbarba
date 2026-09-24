import { desenharEmArquivo } from "@/lib/imagem-no-navegador"
import { MEDIDA_MAXIMA, tamanhoDoArquivo, VIDEO } from "@/lib/produtos"

/**
 * O VÍDEO ESCOLHIDO, NO NAVEGADOR — antes e durante a subida.
 *
 * Antes: confere o tipo (MP4 ou WebM; o .MOV do iPhone não toca em todo
 * navegador) e o peso, lê as medidas e a duração abrindo o vídeo, e tira a
 * CAPA — um quadro do começo, que sobe como imagem (`poster`) e aparece na
 * miniatura da galeria e até o vídeo tocar.
 *
 * Durante: manda o arquivo DIRETO pro Medusa, com o bilhete que o painel
 * pediu (`lib/acoes/produtos.ts`, `pedirEnvioDeVideo`) — a Vercel não passa
 * pedido maior que 4,5 MB. É um PUT com o arquivo cru, e o progresso vem do
 * próprio navegador.
 *
 * Só roda no navegador.
 */

export const ACEITA_VIDEO = "video/mp4,video/webm,.mp4,.webm"

export type TipoDeVideo = "video/mp4" | "video/webm"

export type VideoLido =
  | {
      ok: true
      tipo: TipoDeVideo
      largura: number
      altura: number
      duracao: number
      capa: Blob
    }
  | { ok: false; texto: string }

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
  const extensao = (arquivo.name.split(".").pop() ?? "").toLowerCase()
  if (extensao === "mov" || arquivo.type === "video/quicktime")
    return {
      ok: false,
      texto: "Vídeo .MOV do iPhone não toca em todo navegador. Exporte como MP4 e tente de novo.",
    }
  const tipo: TipoDeVideo | null =
    arquivo.type === "video/webm" || extensao === "webm"
      ? "video/webm"
      : arquivo.type === "video/mp4" || extensao === "mp4"
        ? "video/mp4"
        : null
  if (!tipo) return { ok: false, texto: "Use um vídeo MP4 ou WebM." }
  if (arquivo.size > VIDEO.maximoMB * 1024 * 1024)
    return {
      ok: false,
      texto: `O vídeo tem ${tamanhoDoArquivo(arquivo.size)}, e o limite é ${VIDEO.maximoMB} MB. Encurte ou comprima antes.`,
    }

  const url = URL.createObjectURL(arquivo)
  const v = document.createElement("video")
  v.muted = true
  v.playsInline = true
  v.preload = "auto"
  v.src = url
  try {
    const NAO_ABRE =
      "Esse vídeo não abre neste navegador. Exporte como MP4 (H.264) e tente de novo."
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
    return { ok: true, tipo, largura: v.videoWidth, altura: v.videoHeight, duracao, capa }
  } finally {
    v.removeAttribute("src")
    v.load()
    URL.revokeObjectURL(url)
  }
}

const RECUSA: Record<string, string> = {
  mov: "Vídeo .MOV do iPhone não toca em todo navegador. Exporte como MP4 e tente de novo.",
  nao_e_video: "Esse arquivo não é um vídeo MP4 ou WebM. Exporte de novo e tente outra vez.",
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
