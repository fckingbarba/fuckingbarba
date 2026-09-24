import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { HOME_VAZIA, homeDoSite, lerHome } from "../../../lib/home"

/**
 * GET /store/home — a home PUBLICADA, pra loja montar a página: a ordem e o
 * texto de todas as seções (o salvo no painel, ou o de fábrica). O rascunho
 * não sai daqui: o que está sendo editado no painel não é da conta de quem
 * visita a loja.
 *
 * Se a leitura falhar, responde a home de fábrica — a mesma que a loja
 * mostrava antes do painel —, e não um erro que derrubaria a página inicial.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const [loja] = await req.scope
      .resolve(Modules.STORE)
      .listStores({}, { select: ["id", "metadata"], take: 1 })
    res.json({ home: homeDoSite(lerHome(loja?.metadata)) })
  } catch (e) {
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`[home] ${e instanceof Error ? e.message : e}`)
    res.json({ home: homeDoSite(HOME_VAZIA) })
  }
}
