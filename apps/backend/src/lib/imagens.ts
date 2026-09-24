import sharp from "sharp"
import { tipoDaImagem } from "./erp/fotos"
import type { Pdp } from "./pdp"

/**
 * A IMAGEM QUE SOBE PELO PAINEL — do jeito que a loja entrega.
 *
 * Aceita JPG, PNG e WebP (decisão de 24/09: foto de celular quase sempre é
 * JPG) e guarda SEMPRE WebP, deitada na orientação certa e no tamanho que a
 * loja usa — nunca maior. Foto em PNG pesa várias vezes mais que a mesma em
 * WebP, e fundo de seção é baixado por todo mundo que abre a página.
 *
 *   1. o tipo sai dos BYTES, não do nome do arquivo (`tipoDaImagem`);
 *   2. o `rotate()` aplica a orientação do EXIF (a foto do celular vem
 *      "deitada" com uma etiqueta dizendo pra girar) e joga o EXIF fora —
 *      com ele, a localização de onde a foto foi tirada;
 *   3. encolhe até caber na medida máxima do uso (sem aumentar a pequena);
 *   4. WebP, qualidade 82.
 *
 * Arquivo gigante em pixels é recusado antes de abrir: uma imagem de
 * 20.000 × 20.000 com poucos KB (a "bomba de descompressão") ocuparia a
 * memória do servidor inteira.
 */

export type UsoDaImagem = "fundo-computador" | "fundo-celular" | "galeria" | "poster" | "caso"

/**
 * A medida máxima de cada uso, em px — a maior que a loja chega a mostrar.
 *
 *   fundo do computador: 2880 de largura, a tela de 1440 com densidade 2x
 *     (o fundo vai de ponta a ponta da tela; mais que isso só pesa, e o véu
 *     da seção por cima esconde a diferença);
 *   fundo do celular: 1290 de largura, o celular de 430 com densidade 3x;
 *   galeria: 2000 — o palco da dobra tem 620 de largura, e o zoom 860;
 *   poster: 1920 — a capa de um vídeo, o primeiro quadro dele;
 *   caso: a foto de antes ou de depois, 1200 × 1400 (o quadro é 6 × 7).
 *
 * A altura tem teto largo: quem define o corte é a loja (`cover`).
 */
export const MEDIDA_MAXIMA: Record<UsoDaImagem, { largura: number; altura: number }> = {
  "fundo-computador": { largura: 2880, altura: 2400 },
  "fundo-celular": { largura: 1290, altura: 4000 },
  galeria: { largura: 2000, altura: 2000 },
  poster: { largura: 1920, altura: 1920 },
  caso: { largura: 1200, altura: 1400 },
}

export const ehUsoDaImagem = (v: unknown): v is UsoDaImagem =>
  typeof v === "string" && v in MEDIDA_MAXIMA

/** Até 12 MB de arquivo: o painel já encolhe antes de mandar, então só passa disso o que é estranho. */
export const LIMITE_DA_IMAGEM_EM_BYTES = 12 * 1024 * 1024
const LIMITE_DE_PIXELS = 60_000_000

export type ImagemPronta =
  | { ok: true; bytes: Buffer; largura: number; altura: number }
  | { ok: false; motivo: "grande" | "tipo" | "ilegivel" }

export async function prepararImagem(bruto: Buffer, uso: UsoDaImagem): Promise<ImagemPronta> {
  if (bruto.length > LIMITE_DA_IMAGEM_EM_BYTES) return { ok: false, motivo: "grande" }
  const tipo = tipoDaImagem(bruto)
  if (!tipo || !["image/jpeg", "image/png", "image/webp"].includes(tipo.mime))
    return { ok: false, motivo: "tipo" }
  const { largura, altura } = MEDIDA_MAXIMA[uso]
  try {
    const { data, info } = await sharp(bruto, { limitInputPixels: LIMITE_DE_PIXELS })
      .rotate()
      .resize({ width: largura, height: altura, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true })
    return { ok: true, bytes: data, largura: info.width, altura: info.height }
  } catch {
    return { ok: false, motivo: "ilegivel" }
  }
}

/**
 * A imagem está no armazenamento da loja? O fundo de seção só aceita as que
 * subiram por aqui (ou pelo admin): endereço de fora num fundo seria um
 * pixel de rastreio na página de todo cliente — e o otimizador de imagem da
 * loja nem abre host que não conhece.
 *
 * Em produção, o endereço público do Supabase Storage (`S3_FILE_URL`); sem
 * ele (a máquina de quem desenvolve), o `/static/` do próprio Medusa.
 */
export function ehDoArmazenamento(url: string, base = process.env.S3_FILE_URL): boolean {
  if (base) return url.startsWith(base.replace(/\/+$/, "") + "/")
  try {
    return new URL(url, "http://x.invalid").pathname.startsWith("/static/")
  } catch {
    return false
  }
}

/**
 * A página do produto com os fundos que a loja mostra — os do armazenamento
 * (a loja faz a mesma conta, em `apps/loja/src/lib/pdp.ts`). Um fundo de
 * fora, gravado pelo admin antigo, some da tela do painel; no próximo
 * "Salvar" da seção, sai do produto também.
 */
export function comFundosDoArmazenamento(pdp: Pdp, base = process.env.S3_FILE_URL): Pdp {
  const fundos: Pdp["fundos"] = {}
  for (const [id, f] of Object.entries(pdp.fundos)) {
    if (!ehDoArmazenamento(f.imagem, base)) continue
    const { imagemCelular, ...resto } = f
    fundos[id] =
      imagemCelular && ehDoArmazenamento(imagemCelular, base) ? { ...resto, imagemCelular } : resto
  }
  return { ...pdp, fundos }
}
