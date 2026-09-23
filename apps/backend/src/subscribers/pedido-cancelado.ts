import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { avisarCancelamento } from "../lib/avisar-cancelamento"
import { fecharCobrancasDoPedido } from "../lib/conciliar-pagamentos"
import { tirarDoParceiro } from "../lib/envios/registro"

/**
 * PEDIDO CANCELADO FECHA NO PAGAR.ME O QUE DÁ PRA FECHAR, na hora — e avisa
 * quem comprou.
 *
 * O Medusa, ao cancelar um pedido, estorna o que ele SABE que foi pago — o
 * cartão aprovado, o Pix já registrado — pelo `refundPayment` do provedor. O
 * que ele não sabe é a cobrança que ficou aberta: pra ele, é uma sessão
 * pendente, sem pagamento, e o cancelamento não chama o provedor pra ela.
 *
 * Este subscriber cuida dessa ponta: o cartão em análise é cancelado, e o que
 * tiver sido pago sem o Medusa saber (o aviso ainda no caminho) é estornado.
 *
 * ┌─ O PIX ESPERANDO NÃO MORRE, E ISSO É DE PROPÓSITO ─────────────────────┐
 * │ O Pagar.me não cancela cobrança de Pix pendente — responde 412, e Pix  │
 * │ vencido continua `pending` lá. Tentar só rendia erro a cada rodada e   │
 * │ estoque preso (foi o #7).                                             │
 * │                                                                        │
 * │ Então o QR continua pagável até vencer, e a sessão fica VIGIADA. Se o  │
 * │ cliente pagar um pedido que não existe mais, o dinheiro entra e a      │
 * │ conciliação devolve: é a varredura de "pago depois de cancelado", em   │
 * │ `lib/conciliar-pagamentos.ts`.                                         │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Se falhar (Pagar.me fora do ar), não trava o cancelamento, que já
 * aconteceu: a conciliação de 5 em 5 minutos olha toda sessão pendente de
 * pedido cancelado e faz o mesmo.
 *
 * E DEPOIS O E-MAIL, nesta ordem e não na outra: fechar a cobrança é o que
 * descobre o dinheiro que entrou sem o Medusa saber, e é isso que decide se
 * o e-mail diz "nada foi cobrado" ou "o valor está voltando". Cobrança
 * fechada é dinheiro resolvido; e-mail é gente avisada, e vai mesmo que o
 * Pagar.me esteja fora do ar.
 *
 * POR ÚLTIMO, O PAINEL DO PARCEIRO: o pedido que já tinha entrado lá
 * (`lib/envios/registro.ts`) sai, pra ninguém gerar etiqueta de pedido
 * cancelado. Se não sair — o pacote já foi postado, a Frenet fora do ar —,
 * o log diz qual, pra alguém olhar no painel.
 */
export default async function pedidoCancelado({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  let estornouLa = false
  try {
    const r = await fecharCobrancasDoPedido(container, data.id)
    estornouLa = r.estornadas.length > 0
    const partes = [
      r.canceladas.length && `cobrança cancelada no Pagar.me: ${r.canceladas.join(", ")}`,
      r.estornadas.length && `estornada: ${r.estornadas.join(", ")}`,
      r.avisos.length && `avisos: ${r.avisos.join(" | ")}`,
    ].filter(Boolean)
    if (partes.length) {
      logger.info(`[pagamento] pedido ${data.id} cancelado — ${partes.join("; ")}`)
    }
  } catch (e) {
    logger.warn(
      `[pagamento] pedido ${data.id} cancelado, e a cobrança dele no Pagar.me não foi fechada ` +
        `agora (${e instanceof Error ? e.message : String(e)}) — a conciliação tenta de novo.`
    )
  }

  try {
    const aviso = await avisarCancelamento(container, data.id, { estornouLa })
    if (aviso.resultado === "falhou") {
      logger.warn(`[pedido] o aviso de cancelamento do #${aviso.numero} não saiu (${aviso.motivo})`)
    }
  } catch (e) {
    logger.warn(
      `[pedido] o aviso de cancelamento do pedido ${data.id} não saiu ` +
        `(${e instanceof Error ? e.message : String(e)})`
    )
  }

  try {
    const r = await tirarDoParceiro(container, data.id)
    if (r.resultado === "tirou") {
      logger.info(`[envio] #${r.numero} cancelado: saiu do painel do parceiro`)
    } else if (r.resultado === "falhou") {
      logger.warn(
        `[envio] #${r.numero} cancelado, e continua no painel do parceiro (${r.motivo}) — ` +
          "confira lá antes de gerar a etiqueta"
      )
    }
  } catch (e) {
    logger.warn(
      `[envio] o pedido cancelado ${data.id} pode ter ficado no painel do parceiro ` +
        `(${e instanceof Error ? e.message : String(e)}) — confira lá`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.canceled",
}
