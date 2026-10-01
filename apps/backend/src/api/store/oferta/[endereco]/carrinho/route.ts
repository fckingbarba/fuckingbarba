import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  CARRINHO,
  lerCarrinho,
  marcarCarrinho,
  ofertaPeloEndereco,
} from "../../../../../lib/ofertas/loja"
import { MARCA_DA_OFERTA, situacaoDaOferta } from "../../../../../lib/ofertas/regras"
import { daLoja } from "../../../../../lib/quem-pede"

/**
 * POST /store/oferta/:endereco/carrinho — `{ carrinho }`: quem está pondo um
 * produto na sacola pela página da oferta. O carrinho ganha a marca
 * `fb_oferta` (o gancho do preço lê — `workflows/hooks/contexto-da-oferta.ts`)
 * e as linhas que já estavam são refeitas: o produto da oferta que já estava
 * na sacola passa pro "por".
 *
 * A loja chama ANTES de adicionar o produto (`adicionarDaOferta`). SÓ A LOJA
 * (`x-loja-segredo`): o `metadata` do carrinho é dela. Uma oferta por
 * carrinho: a marca de outra é trocada por esta.
 *
 * RESPOSTAS: 200 `{ marcado }` (false: já estava); 400 `dados_invalidos`; 401
 * sem assinatura; 404 `nao_encontrada` | `carrinho_nao_existe`; 409
 * `oferta_fora` (agendada, pausada ou encerrada) | `carrinho_fechado`.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!daLoja(req)) {
    res.status(401).json({ message: "sem_assinatura" })
    return
  }
  const corpo = (req.body ?? {}) as { carrinho?: unknown }
  const id =
    typeof corpo.carrinho === "string" && CARRINHO.test(corpo.carrinho) ? corpo.carrinho : ""
  if (!id) {
    res.status(400).json({ message: "dados_invalidos" })
    return
  }
  const oferta = await ofertaPeloEndereco(req.scope, String(req.params.endereco ?? ""))
  if (!oferta) {
    res.status(404).json({ message: "nao_encontrada" })
    return
  }
  if (situacaoDaOferta(oferta, Date.now()) !== "no-ar") {
    res.status(409).json({ message: "oferta_fora" })
    return
  }
  const carrinho = await lerCarrinho(req.scope, id)
  if (!carrinho) {
    res.status(404).json({ message: "carrinho_nao_existe" })
    return
  }
  if (carrinho.completed_at) {
    res.status(409).json({ message: "carrinho_fechado" })
    return
  }
  if (carrinho.metadata?.[MARCA_DA_OFERTA] === oferta.id) {
    res.json({ marcado: false })
    return
  }
  await marcarCarrinho(req.scope, carrinho, oferta.id)
  res.json({ marcado: true })
}
