import sharp from "sharp"

/**
 * A FOTO DO PRODUTO EM JPEG, pro catálogo dos anúncios (`/catalogo.xml`, na
 * loja). As fotos da loja são WebP (`lib/imagens.ts`), e a Meta só aceita
 * JPEG ou PNG no catálogo; o Google aceita os dois. Então a foto do catálogo
 * sai daqui, convertida: `GET /catalogo/fotos/<handle>.jpg`
 * (`api/catalogo/fotos/[foto]/route.ts`).
 *
 * Quadrada não: a foto vai inteira, deitada na orientação certa, até 1200 px
 * no lado maior (a Meta pede no mínimo 500 × 500 e recomenda 1024), fundo
 * branco onde a original é transparente (JPEG não tem transparência, e o
 * preto que sobraria no lugar vira foto reprovada), qualidade 88.
 */

export const LADO_MAXIMO = 1200
/** Até 12 MB lidos da foto original — a mesma régua de quem sobe foto pelo painel. */
export const LIMITE_DA_ORIGINAL = 12 * 1024 * 1024
const LIMITE_DE_PIXELS = 60_000_000

export async function fotoEmJpeg(original: Buffer): Promise<Buffer | null> {
  if (!original.length || original.length > LIMITE_DA_ORIGINAL) return null
  try {
    return await sharp(original, { limitInputPixels: LIMITE_DE_PIXELS })
      .rotate()
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer()
  } catch {
    return null
  }
}

/**
 * A foto do produto, na ordem da galeria do painel (o `rank`), ou a miniatura
 * — a mesma escolha do catálogo na loja (`apps/loja/src/lib/feed-de-produtos.ts`).
 */
export function fotoPrincipal(produto: {
  thumbnail?: string | null
  images?: ({ url?: string | null; rank?: number | null } | null)[] | null
}): string | null {
  const galeria = (produto.images ?? [])
    .filter((i): i is { url: string; rank?: number | null } => Boolean(i?.url))
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
  return galeria[0]?.url ?? produto.thumbnail ?? null
}

/**
 * AS JÁ CONVERTIDAS FICAM NA MEMÓRIA, pelo endereço da original: o Google e a
 * Meta buscam o catálogo inteiro de uma vez, e às vezes mais de uma, e cada
 * conversão é trabalho de processador. Foto nova no produto é endereço novo
 * — não tem o que esquecer à mão. Teto de 60 fotos, e 24 horas cada.
 */
const GUARDADAS = new Map<string, { jpeg: Buffer; em: number }>()
const TETO = 60
const DIA = 24 * 60 * 60 * 1000

export function guardada(url: string, agora = Date.now()): Buffer | null {
  const achada = GUARDADAS.get(url)
  if (!achada) return null
  if (agora - achada.em > DIA) {
    GUARDADAS.delete(url)
    return null
  }
  return achada.jpeg
}

export function guardar(url: string, jpeg: Buffer, agora = Date.now()): void {
  if (GUARDADAS.size >= TETO) {
    const maisVelha = GUARDADAS.keys().next().value
    if (maisVelha !== undefined) GUARDADAS.delete(maisVelha)
  }
  GUARDADAS.set(url, { jpeg, em: agora })
}
