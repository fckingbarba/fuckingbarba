import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { linkDoPedido } from "../../../../lib/avaliacoes/link"
import { encontrarPedido, lerPedidoParaAvaliar } from "../../../../lib/avaliacoes/pedido"
import { numeroDoPedido } from "../../../../lib/avaliacoes/regras"
import { criarLimite } from "../../../../lib/limite"
import { quemPede } from "../../../../lib/quem-pede"
import { normalizarEmail } from "../../../../modules/codigo/regras"

/**
 * POST /store/avaliacoes/encontrar — `{ numero, email }`: a página
 * `/avaliar` aberta SEM o link do e-mail (a pessoa apagou o e-mail, ou a
 * loja mandou a página por outro caminho). O número do pedido ("#1234",
 * "1234") e o e-mail da compra têm que bater; aí sai o mesmo link que o
 * e-mail levaria, e a loja guarda num cookie.
 *
 * A RESPOSTA NÃO DIZ O QUE ERROU: número que não existe e e-mail que não é o
 * do pedido são o mesmo 404 — senão a página diria quais números existem.
 *
 * OS LIMITES contam TODA tentativa, a que acha e a que não acha: por quem
 * pede, 10 por hora com a assinatura da loja e 30 sem; da loja toda, 300
 * por hora. Sem teto, dava pra testar e-mails contra números em sequência.
 *
 * RESPOSTAS: 200 `{ p }`; 400 `campo_invalido` com o `campo` (`numero` ou
 * `email`); 404 `nao_achei`; 409 `nao_aceita` (cancelado, sem pagamento —
 * aqui pode dizer: quem pergunta provou que é dono); 429 `limite`.
 */

const HORA = 60 * 60 * 1000
const POR_IP_ASSINADO = { limite: 10, ms: HORA }
const POR_IP_SEM_ASSINATURA = { limite: 30, ms: HORA }
const DA_LOJA = { limite: 300, ms: HORA }
const limite = criarLimite()

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const corpo = (req.body ?? {}) as { numero?: unknown; email?: unknown }
  const numero = numeroDoPedido(corpo.numero)
  if (!numero) {
    res.status(400).json({ message: "campo_invalido", campo: "numero" })
    return
  }
  const email = normalizarEmail(corpo.email)
  if (!email) {
    res.status(400).json({ message: "campo_invalido", campo: "email" })
    return
  }

  const quem = quemPede(req)
  const porIp = quem.assinado ? POR_IP_ASSINADO : POR_IP_SEM_ASSINATURA
  if (!limite.cabe(quem.chave, porIp) || !limite.cabe("loja", DA_LOJA)) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(quem.chave, porIp)
  limite.contar("loja", DA_LOJA)

  const pedidoId = await encontrarPedido(req.scope, numero, email)
  if (!pedidoId) {
    res.status(404).json({ message: "nao_achei" })
    return
  }
  const leitura = await lerPedidoParaAvaliar(req.scope, pedidoId)
  if (!leitura.ok) {
    res.status(409).json({ message: "nao_aceita" })
    return
  }
  res.json({ p: linkDoPedido(pedidoId) })
}
