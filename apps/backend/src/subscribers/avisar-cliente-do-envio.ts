import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { avisarCliente } from "../lib/envios/avisos"
import { ENVIO_MUDOU } from "../lib/envios/nucleo"

/**
 * O PACOTE MUDOU DE LUGAR: o cliente fica sabendo — se for a hora.
 *
 * Quem decide se este momento vira e-mail (e se já não virou) é o
 * `avisarCliente`. Fora da resposta do aviso de propósito: o parceiro espera
 * 2XX em segundos, e o Resend pode demorar. Se o e-mail falhar, o job de
 * acompanhamento tenta de novo enquanto ainda for notícia.
 */
export default async function avisarClienteDoEnvio({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await avisarCliente(container, data.id)
}

export const config: SubscriberConfig = {
  event: ENVIO_MUDOU,
}
