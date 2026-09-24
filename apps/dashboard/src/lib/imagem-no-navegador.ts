import { MEDIDA_MAXIMA, type Lado } from "@/lib/produtos"

/**
 * A FOTO ESCOLHIDA, PREPARADA NO NAVEGADOR — antes de subir.
 *
 * Foto de celular tem 4000 px e 5 a 12 MB; a Vercel não deixa passar pedido
 * maior que 4,5 MB. Então o navegador faz a primeira parte: abre a foto (já
 * na orientação certa — a do celular vem "deitada" com uma etiqueta dizendo
 * pra girar), encolhe até a medida máxima do lado e salva em WebP (ou JPG,
 * no navegador que não grava WebP). O servidor da loja refaz tudo
 * (`apps/backend/src/lib/imagens.ts`): aqui é só pra caber no caminho.
 *
 * Só roda no navegador (canvas).
 */

const TIPOS = ["image/jpeg", "image/png", "image/webp"]
const EXTENSOES = ["jpg", "jpeg", "png", "webp"]

/** O que o `accept` do campo de arquivo oferece. */
export const ACEITA = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"

/** O arquivo escolhido pode ter até isto — o navegador encolhe antes de mandar. */
const LIMITE_DO_ARQUIVO = 40 * 1024 * 1024
/** O que sobe cabe folgado nos 4 MB da ação do servidor (`next.config.ts`). */
const LIMITE_DO_ENVIO = 3.5 * 1024 * 1024

export type Preparada =
  { ok: true; arquivo: Blob; largura: number; altura: number } | { ok: false; texto: string }

export async function prepararNoNavegador(arquivo: File, lado: Lado): Promise<Preparada> {
  const extensao = (arquivo.name.split(".").pop() ?? "").toLowerCase()
  if (extensao === "heic" || extensao === "heif" || /hei[cf]/.test(arquivo.type))
    return {
      ok: false,
      texto:
        "Foto .HEIC (do iPhone) não abre em todo navegador. Mande pelo próprio celular, que ele converte sozinho — ou exporte como JPG.",
    }
  if (!TIPOS.includes(arquivo.type) && !EXTENSOES.includes(extensao))
    return {
      ok: false,
      texto: `Esse arquivo é .${(extensao || "?").toUpperCase()}. Use JPG, PNG ou WebP.`,
    }
  if (arquivo.size > LIMITE_DO_ARQUIVO)
    return { ok: false, texto: "Pesada demais: até 40 MB. Diminua a foto e tente de novo." }

  const aberta = await abrir(arquivo)
  if (!aberta)
    return {
      ok: false,
      texto:
        "Não deu pra abrir essa imagem. Salve de novo como JPG, PNG ou WebP e tente outra vez.",
    }
  try {
    const { largura: maxL, altura: maxA } = MEDIDA_MAXIMA[lado]
    const escala = Math.min(1, maxL / aberta.largura, maxA / aberta.altura)

    // Qualidade caindo aos poucos até caber; em último caso, a foto encolhe.
    for (const reduzir of [1, 0.8, 0.64]) {
      const largura = Math.max(1, Math.round(aberta.largura * escala * reduzir))
      const altura = Math.max(1, Math.round(aberta.altura * escala * reduzir))
      for (const qualidade of [0.9, 0.82, 0.72]) {
        const blob = await desenhar(aberta.imagem, largura, altura, qualidade)
        if (blob && blob.size <= LIMITE_DO_ENVIO)
          return { ok: true, arquivo: blob, largura, altura }
      }
    }
    return { ok: false, texto: "Não consegui deixar essa foto leve o bastante. Tente outra." }
  } finally {
    aberta.soltar()
  }
}

type Aberta = {
  imagem: CanvasImageSource
  largura: number
  altura: number
  soltar: () => void
}

/**
 * Abre a foto JÁ GIRADA: o `createImageBitmap` com `from-image` aplica a
 * etiqueta de orientação; onde ele não existe (ou recusa a opção), o `<img>`
 * — que todo navegador de hoje também desenha girado.
 */
async function abrir(arquivo: Blob): Promise<Aberta | null> {
  try {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" })
    return {
      imagem: bitmap,
      largura: bitmap.width,
      altura: bitmap.height,
      soltar: () => bitmap.close(),
    }
  } catch {
    // segue pro <img>
  }
  const url = URL.createObjectURL(arquivo)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return {
      imagem: img,
      largura: img.naturalWidth,
      altura: img.naturalHeight,
      soltar: () => URL.revokeObjectURL(url),
    }
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
}

async function desenhar(
  imagem: CanvasImageSource,
  largura: number,
  altura: number,
  qualidade: number
): Promise<Blob | null> {
  const canvas = document.createElement("canvas")
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  // Fundo de seção não tem transparência: o que for transparente vira branco (e não preto, no JPG).
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, largura, altura)
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(imagem, 0, 0, largura, altura)
  const webp = await comoBlob(canvas, "image/webp", qualidade)
  // O Safari não grava WebP: devolve PNG, que pesa várias vezes mais. Aí vai JPG.
  if (webp?.type === "image/webp") return webp
  return comoBlob(canvas, "image/jpeg", qualidade)
}

const comoBlob = (canvas: HTMLCanvasElement, tipo: string, qualidade: number) =>
  new Promise<Blob | null>((pronto) => canvas.toBlob(pronto, tipo, qualidade))
