import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { lerConfiguracoes, PADRAO, soOPublico } from "../../../lib/configuracoes"

/**
 * GET /store/configuracoes — o que a loja anuncia, lido de onde ele é editado.
 *
 * Mesma ideia do `/store/promocao` que já existe aqui do lado: quem manda no
 * que a vitrine diz é o admin do Medusa, não uma constante no Next. A
 * diferença é que ali o dado já existia (a data da lista de preço) e aqui ele
 * precisou de um lugar — o `metadata` da loja.
 *
 * DEVOLVE O PADRÃO, NUNCA ERRO. Se a loja não existe, se o metadata está
 * vazio ou se alguém gravou lixo lá dentro, a resposta é o padrão: sem
 * promoção de frete e sem dado de empresa. Uma loja que responde 500 aqui é
 * uma loja cuja faixa do topo some junto com o cabeçalho; uma que responde o
 * padrão é uma loja que só deixa de anunciar o que não conseguiu confirmar.
 *
 * É rota pública (`/store/*`), e por isso NADA aqui devolve dado interno: o
 * que sai é o que já vai estar impresso no rodapé e nas páginas legais de
 * qualquer jeito.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service = req.scope.resolve(Modules.STORE)
    const [loja] = await service.listStores({}, { select: ["id", "metadata"], take: 1 })

    res.json({ configuracoes: soOPublico(lerConfiguracoes(loja?.metadata)) })
  } catch (e) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).warn(`[configuracoes] ${e instanceof Error ? e.message : e}`)
    res.json({ configuracoes: soOPublico(PADRAO) })
  }
}
