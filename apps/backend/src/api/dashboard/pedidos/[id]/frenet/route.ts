import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { registrarNoParceiro } from "../../../../../lib/envios/registro"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import {
  fraseDaFrenet,
  frenetPraTentar,
  MANDOU_PRA_FRENET,
  registroDaFrenet,
} from "../../../../../lib/painel/acoes"
import { pedidoPorId } from "../../../../../lib/painel/ler"
import { anotarAcaoWorkflow } from "../../../../../workflows/equipe/anotar-acao"

/**
 * POST /dashboard/pedidos/:id/frenet — "Mandar pra Frenet de novo": o pedido
 * que a Frenet recusou, depois de alguém corrigir o que ela apontou (ou de a
 * loja corrigir o lado dela, como no #19). Dono e operação.
 *
 * É o mesmo `registrarNoParceiro` do pagamento e da varredura, com `deNovo`:
 * passa por cima da recusa e da espera — e só ali. O resto vale igual: pedido
 * cancelado, com envio no admin (alguém fez à mão) ou esperando a nota não
 * vai. Só no pedido em que o botão aparece (`frenetPraTentar`). Feito, fica
 * no registro da equipe.
 *
 * RESPOSTAS: 200 `{ ok, texto }` (entrou, recusou de novo, ou não deu agora);
 * 404 `nao_encontrado`; 409 `nada_a_fazer` (o pedido mudou desde que a tela
 * abriu — ela recarrega).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "pedidos")) return

  const id = req.params.id
  const o = /^order_[0-9A-Z]{10,40}$/.test(id) ? await pedidoPorId(req.scope, id) : null
  if (!o) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  if (!frenetPraTentar(o)) {
    res.status(409).json({ message: "nada_a_fazer" })
    return
  }

  const resultado = await registrarNoParceiro(req.scope, id, { deNovo: true })
  await anotarAcaoWorkflow(req.scope)
    .run({
      input: {
        membro_id: pedido.membro.id,
        acao: MANDOU_PRA_FRENET,
        alvo_id: id,
        detalhe: registroDaFrenet(resultado, Number(o.display_id ?? 0)),
      },
    })
    .catch((e: unknown) =>
      req.scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(`[painel] o #${o.display_id} foi pra Frenet, mas o registro não gravou: ${e}`)
    )
  res.json(fraseDaFrenet(resultado))
}
