import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { abre, exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { anotar } from "../../../../../lib/painel/anotar"
import { lerConversaDoWhatsapp } from "../../../../../lib/painel/ler-whatsapp"
import { devolverProAtendente, responderComoEquipe } from "../../../../../lib/whatsapp/equipe"

const ID = /^wcon_[0-9A-Z]{20,40}$/

/**
 * GET /dashboard/whatsapp/conversas/:id — uma conversa: as mensagens (as
 * últimas 150), quem está cuidando, até quando dá pra responder (a janela de
 * 24 horas) e quem escreve (os pedidos do telefone, a ficha).
 *
 * RESPOSTAS: 200 `{ conversa }`; 403 `sem_acesso`; 404 `nao_encontrada`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "whatsapp")) return
  const id = req.params.id
  const conversa = ID.test(id)
    ? await lerConversaDoWhatsapp(req.scope, id, { contatos: abre(pedido, "contatos") })
    : null
  if (!conversa) {
    res.status(404).json({ message: "nao_encontrada" })
    return
  }
  res.json({ conversa })
}

/**
 * POST /dashboard/whatsapp/conversas/:id — `{ acao: "responder", texto }`: a
 * equipe responde (sai pelo WhatsApp da loja, e a conversa passa a ser da
 * equipe); `{ acao: "devolver" }`: volta pro atendente. No registro da equipe,
 * sem o texto (é conversa de cliente).
 *
 * RESPOSTAS: 200 `{ ok }`; 400 `acao` ou `vazia`; 403 `sem_acesso`; 404
 * `nao_encontrada`; 409 `janela` (passou de 24 horas da última mensagem do
 * cliente); 502 `meta` (a Meta recusou); 503 `sem_credencial`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "whatsapp")) return
  const id = req.params.id
  if (!ID.test(id)) {
    res.status(404).json({ message: "nao_encontrada" })
    return
  }
  const corpo = (req.body ?? {}) as { acao?: unknown; texto?: unknown }
  if (corpo.acao === "devolver") {
    if (!(await devolverProAtendente(req.scope, id))) {
      res.status(404).json({ message: "nao_encontrada" })
      return
    }
    await anotar(pedido, "devolveu-o-whatsapp", id, {})
    res.json({ ok: true })
    return
  }
  if (corpo.acao !== "responder") {
    res.status(400).json({ message: "acao" })
    return
  }
  const r = await responderComoEquipe(req.scope, {
    conversa: id,
    texto: typeof corpo.texto === "string" ? corpo.texto : "",
    membro: { id: pedido.membro.id, nome: pedido.membro.nome ?? null },
  })
  if (!r.ok) {
    const status = { nao_encontrada: 404, vazia: 400, janela: 409, meta: 502, sem_credencial: 503 }
    res.status(status[r.motivo]).json({ message: r.motivo })
    return
  }
  await anotar(pedido, "respondeu-no-whatsapp", id, {})
  res.json({ ok: true })
}
