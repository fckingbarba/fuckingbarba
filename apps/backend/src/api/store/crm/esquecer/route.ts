import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ehVisitante } from "../../../../lib/crm/eventos"
import { criarLimite } from "../../../../lib/limite"
import { daLoja, quemPede } from "../../../../lib/quem-pede"
import { CRM } from "../../../../modules/crm"
import type CrmService from "../../../../modules/crm/service"

/**
 * POST /store/crm/esquecer — `{ visitante }`: a pessoa disse não aos cookies
 * depois de ter dito sim. Tudo o que o CRM anotou deste navegador sai do
 * banco (`esquecer`), e a loja apaga o cookie dela.
 *
 * Só o servidor da loja chama (assinado): o visitante é o cookie `httpOnly`
 * que ela guarda, e ninguém de fora sabe o de outra pessoa.
 *
 * RESPOSTAS: 204; 401 sem assinatura; 429 `limite`.
 */

const POR_QUEM_PEDE = { limite: 10, ms: 60_000 }
const limite = criarLimite()

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!daLoja(req)) {
    res.status(401).json({ message: "sem_assinatura" })
    return
  }
  const { chave } = quemPede(req)
  if (!limite.cabe(chave, POR_QUEM_PEDE)) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(chave, POR_QUEM_PEDE)

  const visitante = (req.body as { visitante?: unknown } | null)?.visitante
  if (ehVisitante(visitante)) {
    await req.scope
      .resolve<CrmService>(CRM)
      .esquecer(visitante)
      .catch((e) =>
        req.scope
          .resolve(ContainerRegistrationKeys.LOGGER)
          .warn(`[crm] não esqueci o visitante: ${e instanceof Error ? e.message : e}`)
      )
  }
  res.status(204).send()
}
