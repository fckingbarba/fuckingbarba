import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  fotoEmJpeg,
  fotoPrincipal,
  guardada,
  guardar,
  LIMITE_DA_ORIGINAL,
} from "../../../../lib/foto-do-catalogo"

/**
 * GET /catalogo/fotos/<handle>.jpg — a foto de um produto publicado, em JPEG,
 * pro catálogo dos anúncios (o porquê está em `lib/foto-do-catalogo.ts`).
 *
 * Fora de `/store` de propósito: quem busca é o robô do Google e o da Meta,
 * que não mandam a chave publicável. Só abre produto PUBLICADO, e só a foto
 * principal dele — o mesmo que a página do produto mostra pra qualquer um.
 * O `?v=` que o catálogo põe no fim muda quando a foto muda, pra quem guarda
 * a foto antiga buscar de novo; aqui ele não é lido.
 *
 * RESPOSTAS: 200 com a imagem (guardada por um dia, também do lado de lá);
 * 404 `produto` (não existe, ou não está publicado) ou `foto` (sem foto, ou
 * uma que não abre).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const handle = String(req.params.foto ?? "")
    .toLowerCase()
    .replace(/\.jpe?g$/, "")
  if (!/^[a-z0-9-]{1,200}$/.test(handle)) {
    res.status(404).json({ message: "produto" })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "thumbnail", "images.url", "images.rank"],
    filters: { handle, status: "published" },
  })
  const produto = data[0] as Parameters<typeof fotoPrincipal>[0] | undefined
  if (!produto) {
    res.status(404).json({ message: "produto" })
    return
  }
  const url = fotoPrincipal(produto)
  if (!url || !/^https?:\/\//.test(url)) {
    res.status(404).json({ message: "foto" })
    return
  }

  let jpeg = guardada(url)
  if (!jpeg) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      const tamanho = Number(r.headers.get("content-length") ?? 0)
      if (r.ok && tamanho <= LIMITE_DA_ORIGINAL) {
        jpeg = await fotoEmJpeg(Buffer.from(await r.arrayBuffer()))
      } else {
        await r.body?.cancel().catch(() => undefined)
      }
    } catch (e) {
      req.scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(`[catálogo] a foto de ${handle} não abriu: ${e instanceof Error ? e.message : e}`)
    }
    if (jpeg) guardar(url, jpeg)
  }
  if (!jpeg) {
    res.status(404).json({ message: "foto" })
    return
  }

  res.setHeader("content-type", "image/jpeg")
  res.setHeader("cache-control", "public, max-age=86400")
  res.send(jpeg)
}
