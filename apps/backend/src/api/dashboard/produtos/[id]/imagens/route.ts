import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { guardarFoto } from "../../../../../lib/erp/fotos"
import { ehUsoDaImagem, prepararImagem } from "../../../../../lib/imagens"
import { lerProduto } from "../../../../../lib/painel/ler-produtos"

const MOTIVO = {
  grande: "Pesada demais: até 12 MB.",
  tipo: "Use JPG, PNG ou WebP.",
  ilegivel: "Não deu pra abrir essa imagem. Salve de novo como JPG, PNG ou WebP e tente outra vez.",
} as const

/**
 * POST /dashboard/produtos/:id/imagens — `{ uso, arquivo }` (o arquivo em
 * base64): sobe uma imagem JÁ PRONTA pra loja — WebP, na orientação certa,
 * sem o EXIF e no máximo do tamanho que a loja mostra (`lib/imagens.ts`).
 * `uso`: o fundo de uma seção (computador ou celular), uma foto da galeria,
 * a capa de um vídeo ou uma foto de caso de antes e depois. Devolve o
 * endereço, que o "Salvar" da seção (ou a galeria) grava. Dono e marketing.
 *
 * Sobe e não grava: quem desiste na gaveta deixa um arquivo solto no
 * armazenamento, e isso é barato; gravar na hora mudaria a página antes do
 * "Salvar".
 *
 * RESPOSTAS: 200 `{ url, largura, altura, bytes }`; 400 `uso_invalido`,
 * `sem_arquivo` ou `imagem` (com a frase); 404 `nao_encontrado`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "editarProdutos")) return

  const { uso, arquivo } = (req.body ?? {}) as { uso?: unknown; arquivo?: unknown }
  if (!ehUsoDaImagem(uso)) {
    res.status(400).json({ message: "uso_invalido" })
    return
  }
  if (typeof arquivo !== "string" || !/^[A-Za-z0-9+/]+=*$/.test(arquivo)) {
    res.status(400).json({ message: "sem_arquivo" })
    return
  }
  const p = /^prod_[0-9A-Z]{10,40}$/.test(req.params.id)
    ? await lerProduto(req.scope, req.params.id)
    : null
  if (!p) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  const pronta = await prepararImagem(Buffer.from(arquivo, "base64"), uso)
  if (!pronta.ok) {
    res.status(400).json({ message: "imagem", texto: MOTIVO[pronta.motivo] })
    return
  }
  const url = await guardarFoto(req.scope, `${p.handle ?? "produto"}-${uso}`, {
    bytes: pronta.bytes,
    mime: "image/webp",
    extensao: "webp",
  })
  res.json({ url, largura: pronta.largura, altura: pronta.altura, bytes: pronta.bytes.length })
}
