import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ofertaDaPagina, ofertaPeloEndereco } from "../../../../lib/ofertas/loja"

/**
 * GET /store/oferta/:endereco — a oferta oculta da página `/oferta/<endereço>`
 * da loja (`lib/ofertas/regras.ts`): o título, a frase, o começo e o fim, a
 * situação, e os produtos com o "por" de cada um. Pausada ou encerrada, vem
 * sem os produtos — a página diz que acabou.
 *
 * Só pelo endereço exato: não há lista das ofertas na Store API. O "por" é o
 * que o painel escolheu; a página mostra o menor entre ele e o preço de hoje
 * da vitrine, que é o que o carrinho cobra (a lista guarda os dois).
 *
 * RESPOSTAS: 200 `{ oferta }`; 404 `nao_encontrada`.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const oferta = await ofertaPeloEndereco(req.scope, String(req.params.endereco ?? ""))
  if (!oferta) {
    res.status(404).json({ message: "nao_encontrada" })
    return
  }
  res.json({ oferta: ofertaDaPagina(oferta) })
}
