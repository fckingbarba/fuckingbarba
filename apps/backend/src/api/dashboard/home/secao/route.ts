import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import {
  CHAVE_DA_SECAO_DA_HOME,
  ehIdDaSecaoDaHome,
  lerSecaoDaHome,
  urlsDaSecaoDaHome,
} from "../../../../lib/home"
import { ehDoArmazenamento } from "../../../../lib/imagens"
import { anotar } from "../../../../lib/painel/anotar"
import { mudarHome } from "../../../../lib/painel/gravar-home"
import { ALVO_DA_HOME, pendentesDaHome, salvarSecaoDaHome } from "../../../../lib/painel/home"
import { lerFundo, type Fundo } from "../../../../lib/pdp"

/**
 * POST /dashboard/home/secao — `{ secao, valores, fundo? }`: o texto de uma
 * seção da home e a foto de fundo dela, no "Salvar" da gaveta. Vai pro
 * RASCUNHO: o site só muda no "Publicar". Dono e marketing.
 *
 * Pela metade, não grava nada e devolve o que falta (`faltando`, as chaves
 * dos campos). Igual ao texto de fábrica, a seção volta a ser a de fábrica.
 * `fundo` ausente não mexe no fundo; `null` tira. Toda imagem — o fundo, as
 * do banner, a da última chamada — tem que estar no armazenamento da loja:
 * as que subiram por `/dashboard/home/imagens`.
 *
 * RESPOSTAS: 200 `{ pendentes }`; 400 `secao_invalida`, `fundo_invalido` ou
 * `imagem_invalida`; 404 `sem_loja`; 422 `faltando`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "home")) return

  const corpo = (req.body ?? {}) as { secao?: unknown; valores?: unknown; fundo?: unknown }
  if (!ehIdDaSecaoDaHome(corpo.secao)) {
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

  // As imagens do banner e a da última chamada: só as que subiram pelo painel.
  const chave = CHAVE_DA_SECAO_DA_HOME[secao]
  const lida = lerSecaoDaHome(chave, corpo.valores).secao
  if (lida && !urlsDaSecaoDaHome(chave, lida).every((u) => ehDoArmazenamento(u))) {
    res.status(400).json({ message: "imagem_invalida" })
    return
  }

  const r = await mudarHome(req.scope, (home) =>
    salvarSecaoDaHome(home, secao, corpo.valores, fundo)
  )
  if (!r.ok) {
    res
      .status(r.motivo === "sem_loja" ? 404 : 422)
      .json({ message: r.motivo, ...(r.faltando ? { faltando: r.faltando } : {}) })
    return
  }
  await anotar(pedido, "editou-secao-da-home", ALVO_DA_HOME, {
    secao,
    ...(fundo !== undefined ? { fundo: Boolean(fundo) } : {}),
  })
  res.json({ pendentes: pendentesDaHome(r.home) })
}
