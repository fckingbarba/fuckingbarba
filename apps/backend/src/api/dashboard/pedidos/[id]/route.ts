import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { abre, exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import {
  emailsDoPedido,
  enviosDos,
  feitosNoPedido,
  lerContexto,
  notasDos,
  pedidoPorId,
} from "../../../../lib/painel/ler"
import { detalheDo } from "../../../../lib/painel/pedido"

/**
 * GET /dashboard/pedidos/:id — o pedido inteiro: onde está, o caminho, o
 * histórico (com o que a equipe fez pelo painel, e quem, e os e-mails do
 * pedido com o que o Resend contou deles — entrega 0248), os itens, o
 * pagamento, a nota, a entrega, o cliente e os botões que o papel pode
 * apertar. De quem abre os Pedidos (no padrão, o dono e a operação); o CPF
 * inteiro só vai pro dono (`lib/painel/pedido.ts`), o "Tentar o estorno de
 * novo" pra quem abre os Estornos (no padrão, só o dono), e o botão do
 * WhatsApp pra quem abre os contatos (como nos Carrinhos).
 *
 * RESPOSTAS: 200 `{ pedido }`; 404 `nao_encontrado`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "pedidos")) return

  const id = req.params.id
  if (!/^order_[0-9A-Z]{10,40}$/.test(id)) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  // Nada aqui depende do pedido lido: sai tudo junto (o pedido que não
  // existe é raro, e custa só as leituras vazias).
  const [o, ctx, notas, envios, feitos] = await Promise.all([
    pedidoPorId(req.scope, id),
    lerContexto(req.scope),
    notasDos(req.scope, [id]),
    enviosDos(req.scope, [id]),
    feitosNoPedido(req.scope, id),
  ])
  if (!o) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  // Os e-mails precisam do pedido lido (os ids moram no metadata): uma ida a mais, ao CRM.
  const emails = await emailsDoPedido(req.scope, o)

  const papel = pedido.membro.papel
  res.json({
    pedido: detalheDo(
      o,
      notas.get(id) ?? null,
      envios.get(id) ?? [],
      ctx,
      {
        verCpf: papel === "dono",
        nota: abre(pedido, "pedidos"),
        estorno: abre(pedido, "estornos"),
        frenet: abre(pedido, "pedidos"),
        whatsapp: abre(pedido, "contatos"),
      },
      feitos,
      emails
    ),
  })
}
