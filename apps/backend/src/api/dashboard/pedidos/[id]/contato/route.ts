import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { abre, exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { CHAMOU_NO_WHATSAPP, COPIOU_O_PIX } from "../../../../../lib/painel/acoes"
import { anotar } from "../../../../../lib/painel/anotar"
import { EQUIPE } from "../../../../../modules/equipe"
import type EquipeService from "../../../../../modules/equipe/service"

const ACAO = { whatsapp: CHAMOU_NO_WHATSAPP, pix: COPIOU_O_PIX } as const

/** O mesmo clique da mesma pessoa dentro disso vira uma linha só no histórico. */
const JANELA_MS = 30 * 60 * 1000

/**
 * POST /dashboard/pedidos/:id/contato — anota no histórico do pedido que
 * alguém da equipe chamou o cliente no WhatsApp (`{ como: "whatsapp" }`) ou
 * copiou o código do Pix pra mandar (`{ como: "pix" }`). A conversa é no
 * WhatsApp; aqui só fica quem e quando, pra ninguém chamar a mesma pessoa
 * duas vezes. O WhatsApp é de quem abre os `contatos`, como nos Carrinhos.
 *
 * Clicou de novo em menos de 30 min: não anota outra vez — o histórico lê
 * as 50 primeiras ações do pedido, e cliques repetidos empurrariam as outras.
 *
 * RESPOSTAS: 200 `{ ok }`; 400 `como_invalido`; 403 sem os contatos;
 * 404 `nao_encontrado`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "pedidos")) return

  const { como } = (req.body ?? {}) as { como?: unknown }
  if (como !== "whatsapp" && como !== "pix") {
    res.status(400).json({ message: "como_invalido" })
    return
  }
  if (como === "whatsapp" && !abre(pedido, "contatos")) {
    res.status(403).json({ message: "sem_permissao" })
    return
  }
  const id = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = /^order_[0-9A-Z]{10,40}$/.test(id)
    ? await query.graph({ entity: "order", fields: ["id"], filters: { id } })
    : { data: [] }
  if (!data[0]) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }

  const acao = ACAO[como]
  const equipe = req.scope.resolve<EquipeService>(EQUIPE)
  const [ultima] = (await equipe.listRegistros(
    { alvo_id: id, acao, membro_id: pedido.membro.id },
    { take: 1, order: { created_at: "DESC" } }
  )) as unknown as { created_at: Date }[]
  if (!ultima || Date.now() - new Date(ultima.created_at).getTime() > JANELA_MS)
    await anotar(pedido, acao, id, {})
  res.json({ ok: true })
}
