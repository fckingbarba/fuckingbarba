import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { comFundosDoArmazenamento, ehDoArmazenamento } from "../../../../../lib/imagens"
import { anotar } from "../../../../../lib/painel/anotar"
import { mudarPdp } from "../../../../../lib/painel/gravar-produto"
import {
  CHAVE_DA_SECAO,
  ehIdDaSecao,
  salvarSecao,
  secoesDaPagina,
} from "../../../../../lib/painel/produtos"
import { lerFundo, lerSecao, urlsDaSecao, type Fundo } from "../../../../../lib/pdp"

/**
 * POST /dashboard/produtos/:id/secao — `{ secao, valores, fundo? }`: o texto
 * de uma seção da página do produto e a imagem de fundo dela, no "Salvar"
 * da gaveta. Dono e marketing.
 *
 * Texto todo vazio tira a seção da página; pela metade, não grava nada e
 * devolve o que falta (`faltando`, as chaves dos campos). `fundo` ausente
 * não mexe no fundo; `null` tira; e as imagens têm que estar no
 * armazenamento da loja — as que subiram por `/imagens`.
 *
 * As fotos dos casos de antes e depois e o vídeo do modo de uso também têm
 * que estar no armazenamento (`imagem_invalida`).
 *
 * RESPOSTAS: 200 `{ secao, lojaAvisada }`; 400 `secao_invalida`,
 * `fundo_invalido`, `imagem_invalida` ou `sem_texto`; 404 `nao_encontrado`;
 * 422 `faltando`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "editarProdutos")) return

  const corpo = (req.body ?? {}) as { secao?: unknown; valores?: unknown; fundo?: unknown }
  if (!ehIdDaSecao(corpo.secao)) {
    res.status(400).json({ message: "secao_invalida" })
    return
  }
  const secao = corpo.secao
  let fundo: Fundo | null | undefined
  if (corpo.fundo === null) fundo = null
  else if (corpo.fundo !== undefined) {
    const lido = lerFundo(corpo.fundo)
    const urls = lido ? [lido.imagem, lido.imagemCelular].filter((u): u is string => !!u) : []
    if (!lido || !urls.every((u) => ehDoArmazenamento(u))) {
      res.status(400).json({ message: "fundo_invalido" })
      return
    }
    fundo = lido
  }

  // As fotos dos casos e o vídeo do modo de uso: só os que subiram pelo painel.
  const chave = CHAVE_DA_SECAO[secao]
  const lida = chave ? lerSecao(chave, corpo.valores).secao : null
  if (chave && lida && !urlsDaSecao(chave, lida).every((u) => ehDoArmazenamento(u))) {
    res.status(400).json({ message: "imagem_invalida" })
    return
  }

  const r = await mudarPdp(req.scope, req.params.id, (pdp) =>
    salvarSecao(pdp, secao, corpo.valores, fundo)
  )
  if (!r.ok) {
    const status = r.motivo === "nao_encontrado" ? 404 : r.motivo === "faltando" ? 422 : 400
    res.status(status).json({ message: r.motivo, ...(r.faltando ? { faltando: r.faltando } : {}) })
    return
  }
  await anotar(pedido, "editou-secao", req.params.id, {
    secao,
    ...(fundo !== undefined ? { fundo: Boolean(fundo) } : {}),
  })
  res.json({
    secao: secoesDaPagina(comFundosDoArmazenamento(r.pdp)).find((s) => s.id === secao),
    lojaAvisada: r.lojaAvisada,
  })
}
