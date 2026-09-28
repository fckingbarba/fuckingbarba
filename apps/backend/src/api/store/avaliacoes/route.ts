import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { pedidoDoLink } from "../../../lib/avaliacoes/link"
import { acharPedidoDireto, lerPedidoParaAvaliar } from "../../../lib/avaliacoes/pedido"
import { lerAvaliacao, lerAvaliacaoDireta } from "../../../lib/avaliacoes/regras"
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
 * POST /store/avaliacoes — da página escondida `/avaliar`, de dois jeitos:
 *
 * - COM O LINK do e-mail "o que você achou?" — `{ p, produto, nome, nota,
 *   texto }`. `p` é o link (`lib/avaliacoes/link.ts`): a página já abriu o
 *   pedido, e o produto é um dos dele.
 * - SEM O LINK — `{ numero, email, produto, nome, nota, texto }`: o número do
 *   pedido e o e-mail da compra, que têm que bater, na loja nova ou na base da
 *   Nuvemshop (`acharPedidoDireto`). A pessoa escolheu o produto na lista da
 *   loja inteira, e ele tem que ser do pedido — ou vir num kit dele
 *   (`produtosQueOPedidoAvalia`). Nada do pedido volta na resposta.
 *
 * Cada produto de cada pedido é avaliado uma vez. Entra como `nova`: aparece
 * no site depois do painel.
 *
 * OS LIMITES são na memória, como os da newsletter: por quem pede, 20 por
 * hora com a assinatura da loja e 60 sem; da loja toda, 500 por hora. Um
 * pedido tem poucos produtos — mais que isso é alguém insistindo. Sem o link,
 * o número e o e-mail que não batem contam à parte, mais apertado (10 por
 * hora com a assinatura, 30 sem; 200 da loja toda): é o que alguém chutando
 * pedido de outra pessoa faria.
 *
 * RESPOSTAS DO POST: 200 `{ ok: true }` (com o link, também `faltam`: os
 * produtos do pedido que ainda não têm nota); 400 `campo_invalido` com o
 * `campo`; 404 `link_invalido` (link que a loja não fez, ou pedido que não
 * existe mais) ou `pedido_nao_encontrado` (sem o link: o número e o e-mail
 * não batem); 409 `nao_aceita` (cancelado, sem pagamento), `fora_do_pedido`
 * (o produto não veio no pedido) ou `ja_avaliou`; 429 `limite`.
 */

const HORA = 60 * 60 * 1000
const POR_IP_ASSINADO = { limite: 20, ms: HORA }
const POR_IP_SEM_ASSINATURA = { limite: 60, ms: HORA }
const DA_LOJA = { limite: 500, ms: HORA }
const ERROS_POR_IP_ASSINADO = { limite: 10, ms: HORA }
const ERROS_POR_IP_SEM_ASSINATURA = { limite: 30, ms: HORA }
const ERROS_DA_LOJA = { limite: 200, ms: HORA }
const limite = criarLimite()

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({ avaliacoes: await avaliacoesDoSite(req.scope) })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const corpo = (req.body ?? {}) as Record<string, unknown>
  if (corpo.p === undefined) {
    await avaliarSemLink(req, res, corpo)
    return
  }
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

/** A página sem o link: o número do pedido e o e-mail da compra, com a avaliação. */
async function avaliarSemLink(
  req: MedusaRequest,
  res: MedusaResponse,
  corpo: Record<string, unknown>
) {
  const lida = lerAvaliacaoDireta(corpo)
  if (!lida.ok) {
    res.status(400).json({ message: "campo_invalido", campo: lida.campo })
    return
  }

  const quem = quemPede(req)
  const porIp = quem.assinado ? POR_IP_ASSINADO : POR_IP_SEM_ASSINATURA
  const errosPorIp = quem.assinado ? ERROS_POR_IP_ASSINADO : ERROS_POR_IP_SEM_ASSINATURA
  const errou = `${quem.chave}:errou`
  if (
    !limite.cabe(quem.chave, porIp) ||
    !limite.cabe("loja", DA_LOJA) ||
    !limite.cabe(errou, errosPorIp) ||
    !limite.cabe("loja:errou", ERROS_DA_LOJA)
  ) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(quem.chave, porIp)
  limite.contar("loja", DA_LOJA)
  // O erro é reservado ANTES de procurar (sem `await` entre conferir e
  // reservar): uma rajada ao mesmo tempo não passa inteira pela conferência.
  // Achou o pedido, a vaga volta.
  const devolver = [
    limite.reservar(errou, errosPorIp),
    limite.reservar("loja:errou", ERROS_DA_LOJA),
  ]

  const { avaliacao } = lida
  const leitura = await acharPedidoDireto(req.scope, avaliacao.numero, avaliacao.email)
  if (!leitura.ok && leitura.motivo === "sem_pedido") {
    res.status(404).json({ message: "pedido_nao_encontrado" })
    return
  }
  for (const d of devolver) d()
  if (!leitura.ok) {
    res.status(409).json({ message: "nao_aceita" })
    return
  }
  const { pedido } = leitura
  const produtoNome = pedido.produtos.get(avaliacao.produtoId)
  if (!produtoNome) {
    res.status(409).json({ message: "fora_do_pedido" })
    return
  }

  const { result } = await enviarAvaliacaoWorkflow(req.scope).run({
    input: {
      pedidoId: pedido.id,
      numero: pedido.numero,
      produtoId: avaliacao.produtoId,
      produtoNome,
      nome: avaliacao.nome,
      nota: avaliacao.nota,
      texto: avaliacao.texto,
    },
  })
  if (!result.nova) {
    res.status(409).json({ message: "ja_avaliou" })
    return
  }
  req.scope
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(
      `[avaliacoes] nota ${avaliacao.nota} pro ${produtoNome}, do pedido #${pedido.numero}` +
        `${pedido.origem === "nuvemshop" ? " da Nuvemshop" : ""} (sem o link)`
    )
  res.json({ ok: true })
}
