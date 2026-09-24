import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { guardarFoto } from "../../../../lib/erp/fotos"
import { ehUsoDaImagem, prepararImagem, type UsoDaImagem } from "../../../../lib/imagens"

/** O que sobe pela home: os dois lados de uma foto, e a capa do vídeo da história. */
const USOS_NA_HOME: readonly UsoDaImagem[] = ["fundo-computador", "fundo-celular", "poster"]

const MOTIVO = {
  grande: "Pesada demais: até 12 MB.",
  tipo: "Use JPG, PNG ou WebP.",
  ilegivel: "Não deu pra abrir essa imagem. Salve de novo como JPG, PNG ou WebP e tente outra vez.",
} as const

/**
 * POST /dashboard/home/imagens — `{ uso, arquivo }` (o arquivo em base64):
 * sobe uma imagem da home JÁ PRONTA pra loja — WebP, na orientação certa,
 * sem o EXIF e no máximo do tamanho que a loja mostra (`lib/imagens.ts`).
 * `uso`: um lado da foto (computador ou celular) — o fundo de uma seção, a
 * arte de um slide do banner, a foto da última chamada —, ou a capa do
 * vídeo da história da marca (`poster`, um quadro do começo dele). Devolve
 * o endereço, que o "Salvar" da seção grava no rascunho. Dono e marketing.
 *
 * A mesma subida da página do produto (`/dashboard/produtos/:id/imagens`),
 * sem produto: sobe e não grava.
 *
 * RESPOSTAS: 200 `{ url, largura, altura, bytes }`; 400 `uso_invalido`,
 * `sem_arquivo` ou `imagem` (com a frase).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "home")) return

  const { uso, arquivo } = (req.body ?? {}) as { uso?: unknown; arquivo?: unknown }
  if (!ehUsoDaImagem(uso) || !USOS_NA_HOME.includes(uso)) {
    res.status(400).json({ message: "uso_invalido" })
    return
  }
  if (typeof arquivo !== "string" || !/^[A-Za-z0-9+/]+=*$/.test(arquivo)) {
    res.status(400).json({ message: "sem_arquivo" })
    return
  }
  const pronta = await prepararImagem(Buffer.from(arquivo, "base64"), uso)
  if (!pronta.ok) {
    res.status(400).json({ message: "imagem", texto: MOTIVO[pronta.motivo] })
    return
  }
  const url = await guardarFoto(req.scope, `home-${uso}`, {
    bytes: pronta.bytes,
    mime: "image/webp",
    extensao: "webp",
  })
  res.json({ url, largura: pronta.largura, altura: pronta.altura, bytes: pronta.bytes.length })
}
