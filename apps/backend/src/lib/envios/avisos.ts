import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ENVIOS } from "../../modules/envios"
import type EnviosService from "../../modules/envios/service"
import { whatsappDaLoja } from "../atendimento"
import { emailNoLog, enviarEmail } from "../email"
import { emailDoEnvio, type PedidoDoAviso } from "../emails/envio"
import { avisoPendente, lerAvisos, type SituacaoDoEnvio } from "./situacao"

/**
 * AVISAR O CLIENTE — o e-mail do momento em que o pacote está, uma vez só.
 *
 * Roda no assinante do `envio.mudou` (logo depois do aviso) e no job de
 * acompanhamento (o e-mail que falhou tenta de novo enquanto ainda é
 * notícia). Os dois caminhos passam pela mesma trava e pelo mesmo registro
 * (`avisos`, no envio): o segundo a chegar encontra o momento já avisado e
 * não manda nada.
 *
 * QUAL momento, e se ainda vale, é o `avisoPendente` (`situacao.ts`) quem
 * diz. Aqui é só montar o e-mail e mandar.
 */

export type Aviso = "mandou" | "nada" | "falhou"

type PedidoLido = {
  id: string
  display_id?: number | null
  email?: string | null
  status?: string | null
  items?:
    | ({
        title?: string | null
        product_title?: string | null
        variant_title?: string | null
        quantity?: unknown
      } | null)[]
    | null
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
    address_1?: string | null
    address_2?: string | null
    city?: string | null
    province?: string | null
    postal_code?: string | null
    metadata?: Record<string, unknown> | null
  } | null
}

const cep = (v: string) => {
  const d = v.replace(/\D/g, "")
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : v
}

/**
 * O pedido no formato do e-mail — o molde é o `paraPedidoVisivel` da loja
 * (`apps/loja/src/lib/pedido.ts`): o mesmo nome de item, o mesmo endereço.
 */
async function lerPedidoDoAviso(
  container: MedusaContainer,
  id: string
): Promise<(PedidoDoAviso & { cancelado: boolean }) | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "status",
      // O item inteiro, não campo a campo: a quantidade mora no `detail` do
      // item, e o Medusa (2.21) procura `items.quantity` na linha, onde ela
      // não existe — sem um total na lista, voltava vazia, e o e-mail dizia
      // "0×" (o #19, em 25/09). A mesma regra do `lerPedido` de `medusa.ts`.
      "items.*",
      "shipping_address.*",
    ],
    filters: { id },
  })
  const o = data[0] as unknown as PedidoLido | undefined
  if (!o) return null
  const e = o.shipping_address
  const meta = (e?.metadata ?? {}) as Record<string, unknown>
  const s = (v: unknown) => (typeof v === "string" ? v : "")
  return {
    id: o.id,
    numero: Number(o.display_id ?? 0),
    email: o.email ?? "",
    cancelado: o.status === "canceled",
    itens: (o.items ?? [])
      .filter((i): i is NonNullable<typeof i> => Boolean(i))
      .map((i) => ({
        nome: i.product_title ?? i.title ?? "Produto",
        variante: i.variant_title && i.variant_title !== "Único" ? i.variant_title : null,
        quantidade: Number(i.quantity ?? 0),
      })),
    entrega: e
      ? {
          nome: [e.first_name, e.last_name].filter(Boolean).join(" "),
          linha1: e.address_1 ?? "",
          linha2:
            [s(meta.complemento), s(meta.bairro)].filter(Boolean).join(" — ") ||
            (e.address_2 ?? ""),
          cidade: e.city ?? "",
          uf: (e.province ?? "").toUpperCase(),
          cep: cep(e.postal_code ?? ""),
        }
      : null,
  }
}

export async function avisarCliente(
  container: MedusaContainer,
  envioId: string,
  agora = new Date()
): Promise<Aviso> {
  const envios = container.resolve<EnviosService>(ENVIOS)
  const trava = container.resolve(Modules.LOCKING)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  return trava.execute(
    `envio-aviso:${envioId}`,
    async (): Promise<Aviso> => {
      const [envio] = await envios.listEnvios({ id: envioId }, { take: 1 })
      if (!envio?.pedido_id || !envio.codigo) return "nada"

      const avisos = lerAvisos(envio.avisos)
      const momento = avisoPendente(
        {
          situacao: envio.situacao as SituacaoDoEnvio,
          desde: envio.desde ? new Date(envio.desde) : null,
          avisos,
        },
        agora
      )
      if (!momento) return "nada"

      const pedido = await lerPedidoDoAviso(container, envio.pedido_id)
      if (!pedido || pedido.cancelado || !pedido.email) {
        // Sem a quem mandar — e o job não precisa insistir.
        avisos[momento] = { em: agora.toISOString(), como: "dispensado" }
        await envios.updateEnvios({ id: envio.id, avisos })
        return "nada"
      }

      const email = emailDoEnvio({
        momento,
        pedido,
        envio: {
          codigo: envio.codigo,
          url: envio.url ?? null,
          transportadora: envio.transportadora ?? null,
          servico: envio.servico ?? null,
        },
        whatsapp: await whatsappDaLoja(container),
      })
      const r = await enviarEmail(email, logger)
      if (!r.ok) {
        logger.warn(
          `[envio] o e-mail "${momento}" do pedido #${pedido.numero} não saiu (${r.motivo}) — ` +
            "o acompanhamento tenta de novo"
        )
        return "falhou"
      }
      avisos[momento] = { em: agora.toISOString(), como: "email" }
      await envios.updateEnvios({ id: envio.id, avisos })
      logger.info(
        `[envio] e-mail "${momento}" do pedido #${pedido.numero} pra ${emailNoLog(pedido.email)}`
      )
      return "mandou"
    },
    { timeout: 20 }
  )
}
