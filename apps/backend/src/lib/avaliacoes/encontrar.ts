import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { emailNoLog, enviarEmail } from "../email"
import { emailDoLinkDaAvaliacao } from "../emails/avaliacao"
import { criarLimite } from "../limite"
import { linkDoPedido } from "./link"
import { encontrarPedido, lerPedidoParaAvaliar } from "./pedido"

/**
 * O LINK PELO E-MAIL — a página `/avaliar` aberta sem o link pede o número do
 * pedido e o e-mail da compra (`POST /store/avaliacoes/encontrar`), e o link
 * vai PRO E-MAIL DA COMPRA, nunca na resposta. Quem sabe o número e o e-mail
 * de alguém (o pacote na portaria, o e-mail encaminhado) não avalia no nome
 * dele: precisa da caixa de entrada.
 *
 * A rota responde antes de a loja procurar, e sempre igual: nem a resposta
 * nem o tempo dela dizem se o pedido existe. O e-mail só sai pro pedido que
 * aceita avaliação e ainda tem produto sem nota.
 *
 * NO MÁXIMO um e-mail por pedido a cada 10 minutos, e 3 por dia: o botão
 * apertado de novo (ou por quem sabe o número e o e-mail) não enche a caixa
 * de ninguém. A contagem é por processo, como os outros limites da loja.
 */

const MINUTO = 60 * 1000
const POR_PEDIDO = { limite: 1, ms: 10 * MINUTO }
const POR_DIA = { limite: 3, ms: 24 * 60 * MINUTO }
const limite = criarLimite()

export type LinkPedido = "mandou" | "nada" | "limite" | "falhou"

export async function mandarLinkDaAvaliacao(
  container: MedusaContainer,
  numero: number,
  email: string
): Promise<LinkPedido> {
  const pedidoId = await encontrarPedido(container, numero, email)
  if (!pedidoId) return "nada"
  const leitura = await lerPedidoParaAvaliar(container, pedidoId)
  if (!leitura.ok) return "nada"
  const faltam = leitura.pedido.produtos.filter((p) => !p.avaliado)
  if (!faltam.length) return "nada"

  const dia = `${pedidoId}:dia`
  if (!limite.cabe(pedidoId, POR_PEDIDO) || !limite.cabe(dia, POR_DIA)) return "limite"
  // Reservadas antes do envio: dois cliques juntos não mandam dois e-mails.
  const soltar = [limite.reservar(pedidoId, POR_PEDIDO), limite.reservar(dia, POR_DIA)]

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const r = await enviarEmail(
    emailDoLinkDaAvaliacao({
      // O `encontrarPedido` só acha o pedido com este e-mail: é o da compra.
      para: email,
      numero: leitura.pedido.numero,
      primeiroNome: leitura.pedido.nome.split(/\s+/)[0] ?? "",
      link: linkDoPedido(pedidoId),
      produtos: faltam.map((p) => ({ id: p.id, nome: p.nome, imagem: p.imagem })),
    }),
    logger,
    {
      idempotencia: `link-avaliacao/${pedidoId}/${Math.floor(Date.now() / POR_PEDIDO.ms)}`,
      tipo: "link-avaliacao",
    }
  )
  if (!r.ok) {
    for (const s of soltar) s()
    logger.warn(
      `[avaliacoes] o link do pedido #${leitura.pedido.numero} não saiu pra ` +
        `${emailNoLog(email)} (${r.motivo})`
    )
    return "falhou"
  }
  logger.info(
    `[avaliacoes] link do pedido #${leitura.pedido.numero} mandado pra ${emailNoLog(email)}`
  )
  return "mandou"
}
