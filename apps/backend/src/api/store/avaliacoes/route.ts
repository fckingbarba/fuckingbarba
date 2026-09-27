import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { pedidoDoLink } from "../../../lib/avaliacoes/link"
import { lerPedidoParaAvaliar } from "../../../lib/avaliacoes/pedido"
import { lerAvaliacao } from "../../../lib/avaliacoes/regras"
import { avaliacoesDoSite } from "../../../lib/avaliacoes/site"
import { criarLimite } from "../../../lib/limite"
import { quemPede } from "../../../lib/quem-pede"
import { enviarAvaliacaoWorkflow } from "../../../workflows/avaliacoes/enviar"

/**
 * AS AVALIAÇÕES — `GET` as do site, `POST` uma nova.
 *
 * GET /store/avaliacoes — as aprovadas no painel, com o produto pelo handle
 * (`avaliacoesDoSite`). A loja guarda com a etiqueta `avaliacoes`, e o
 * painel avisa quando aprova ou tira uma do site.
 *
 * POST /store/avaliacoes — `{ p, produto, nome, nota, texto }`, da página
 * escondida `/avaliar`. `p` é o link do e-mail (`lib/avaliacoes/link.ts`):
 * sem ele, ninguém avalia — é o que faz a avaliação ser de quem comprou. O
 * produto tem que ser do pedido, e cada produto de cada pedido é avaliado
 * uma vez. Entra como `nova`: aparece no site depois do painel.
 *
 * OS LIMITES são na memória, como os da newsletter: por quem pede, 20 por
 * hora com a assinatura da loja e 60 sem; da loja toda, 500 por hora. Um
 * pedido tem poucos produtos — mais que isso é alguém insistindo.
 *
 * RESPOSTAS DO POST: 200 `{ ok: true, faltam }` (os produtos do pedido que
 * ainda não têm nota); 400 `campo_invalido` com o `campo`; 404
 * `link_invalido` (link que a loja não fez, ou pedido que não existe mais);
 * 409 `nao_aceita` (cancelado, sem pagamento) ou `ja_avaliou`; 429 `limite`.
 */

const HORA = 60 * 60 * 1000
const POR_IP_ASSINADO = { limite: 20, ms: HORA }
const POR_IP_SEM_ASSINATURA = { limite: 60, ms: HORA }
const DA_LOJA = { limite: 500, ms: HORA }
const limite = criarLimite()

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({ avaliacoes: await avaliacoesDoSite(req.scope) })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const corpo = (req.body ?? {}) as Record<string, unknown>
  const pedidoId = pedidoDoLink(corpo.p)
  if (!pedidoId) {
    res.status(404).json({ message: "link_invalido" })
    return
  }
  const lida = lerAvaliacao(corpo)
  if (!lida.ok) {
    res.status(400).json({ message: "campo_invalido", campo: lida.campo })
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

  const leitura = await lerPedidoParaAvaliar(req.scope, pedidoId)
  if (!leitura.ok) {
    res
      .status(leitura.motivo === "sem_pedido" ? 404 : 409)
      .json({ message: leitura.motivo === "sem_pedido" ? "link_invalido" : "nao_aceita" })
    return
  }
  const { pedido } = leitura
  const { avaliacao } = lida
  const produto = pedido.produtos.find((p) => p.id === avaliacao.produtoId)
  if (!produto) {
    res.status(400).json({ message: "campo_invalido", campo: "produto" })
    return
  }
  const faltam = pedido.produtos.filter((p) => !p.avaliado && p.id !== produto.id).map((p) => p.id)
  if (produto.avaliado) {
    res.status(409).json({ message: "ja_avaliou", faltam })
    return
  }

  const { result } = await enviarAvaliacaoWorkflow(req.scope).run({
    input: {
      pedidoId: pedido.id,
      numero: pedido.numero,
      produtoId: produto.id,
      produtoNome: produto.nome,
      nome: avaliacao.nome,
      nota: avaliacao.nota,
      texto: avaliacao.texto,
    },
  })
  if (!result.nova) {
    res.status(409).json({ message: "ja_avaliou", faltam })
    return
  }
  req.scope
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(`[avaliacoes] nota ${avaliacao.nota} pro ${produto.nome}, do pedido #${pedido.numero}`)
  res.json({ ok: true, faltam })
}
