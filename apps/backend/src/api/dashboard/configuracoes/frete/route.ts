import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { lerConfiguracoes } from "../../../../lib/configuracoes"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"
import { freteEmFrase, lerFrete } from "../../../../lib/painel/configuracoes"
import { gravarConfiguracoes } from "../../../../lib/painel/ler-configuracoes"

/**
 * POST /dashboard/configuracoes/frete — `{ modo, piso, preco, alvo }`: a
 * promoção de frete. Quem cobra e quem anuncia leem daqui (a sacola, o
 * checkout, a página do produto); vale na próxima cotação.
 *
 * O teto de custo não está na tela: fica o que estiver gravado na hora de
 * gravar (a conta é refeita dentro da trava do metadata).
 *
 * RESPOSTAS: 200 `{ ok, frase, lojaAvisada }`; 422 `{ erros }`; 404 sem loja.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "configuracoes")) return
  const [loja] = await req.scope
    .resolve(Modules.STORE)
    .listStores({}, { select: ["metadata"], take: 1 })
  const lido = lerFrete(req.body, lerConfiguracoes(loja?.metadata).frete)
  if (!lido.ok) {
    res.status(422).json({ erros: lido.erros })
    return
  }
  const r = await gravarConfiguracoes(req.scope, (atual) => {
    const agora = lerFrete(req.body, atual.frete)
    return agora.ok ? { frete: agora.valor } : {}
  })
  if (!r.gravou) {
    res.status(404).json({ message: "sem_loja" })
    return
  }
  const frase = freteEmFrase(lido.valor)
  await anotar(pedido, "mudou-frete", "configuracoes", { frase })
  res.json({ ok: true, frase, lojaAvisada: r.lojaAvisada })
}
