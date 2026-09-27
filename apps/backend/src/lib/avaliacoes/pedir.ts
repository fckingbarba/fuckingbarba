import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { AVALIACOES } from "../../modules/avaliacoes"
import type AvaliacoesService from "../../modules/avaliacoes/service"
import { ENVIOS } from "../../modules/envios"
import type EnviosService from "../../modules/envios/service"
import { whatsappDaLoja } from "../atendimento"
import { emailNoLog, enviarEmail } from "../email"
import { emailDePedirAvaliacao } from "../emails/avaliacao"
import { gravarNoMetadataDoPedido } from "../metadata-do-pedido"
import { linkDoPedido } from "./link"
import {
  chegouEm,
  decidirPedido,
  dentroDoHorario,
  JANELA_EM_DIAS,
  nomeSugerido,
  produtosDoPedido,
  type EnvioDaRodada,
  type ItemDoPedido,
  type RegistroDoPedido,
} from "./regras"

/**
 * O E-MAIL QUE PEDE A AVALIAÇÃO — "o que você achou?", um dia depois da
 * entrega. A rodada roda no job `pedir-avaliacoes` (de hora em hora) e em
 * `POST /admin/avaliacoes/pedir` (na hora, sem olhar o relógio).
 *
 * ┌─ QUEM RECEBE ──────────────────────────────────────────────────────────┐
 * │ O pedido que CHEGOU INTEIRO (todo pacote dele entregue, nenhum na rua) │
 * │ há pelo menos um dia e no máximo `JANELA_EM_DIAS`, pago, não cancelado │
 * │ e com algum produto sem nota. A entrega é a do rastreio               │
 * │ (`envio.entregue_em`, a hora da transportadora — ou o "Mark as        │
 * │ delivered" do admin, que entra no núcleo dos envios igual).           │
 * │ Uma vez por pedido: o registro fica em `metadata.emails.avaliacao`,   │
 * │ pela porta do metadata, e a chave de idempotência do Resend          │
 * │ (`pedir-avaliacao/<id>`) cobre o instante entre ele aceitar e o      │
 * │ registro gravar.                                                       │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * NO HORÁRIO: das 9h às 20h59 de Brasília (`HORARIO`). Entregue às 23h,
 * o e-mail sai às 9h do dia seguinte ao "um dia depois", e não de
 * madrugada. O botão do admin passa por cima (`qualquerHora`): quem aperta
 * é uma pessoa.
 *
 * O e-mail lista os produtos que ainda não têm nota — quem já avaliou um
 * pela página, sem o link, recebe o pedido dos outros; quem avaliou todos,
 * não recebe nada (fica `dispensado`).
 */

/** E-mails por rodada, um de cada vez — o Resend aceita 2 por segundo. O resto vai na próxima hora. */
export const POR_RODADA = 60
export const PAUSA_ENTRE_EMAILS_MS = 600

const DIA_MS = 24 * 60 * 60 * 1000

type PedidoLido = {
  id: string
  display_id?: number | null
  email?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  items?: (ItemDoPedido | null)[] | null
  shipping_address?: { first_name?: string | null } | null
  payment_collections?: ({ payments?: ({ captured_at?: unknown } | null)[] | null } | null)[] | null
}

const CAMPOS = [
  "id",
  "display_id",
  "email",
  "status",
  "metadata",
  "items.*",
  "shipping_address.first_name",
  "payment_collections.payments.captured_at",
]

const pago = (o: PedidoLido) =>
  (o.payment_collections ?? [])
    .flatMap((c) => c?.payments ?? [])
    .some((p) => Boolean(p?.captured_at))

export type RelatorioDoPedirAvaliacoes = {
  /** Fora das 9h–21h de Brasília: a rodada nem olhou. */
  foraDoHorario: boolean
  mandados: number
  /** Registrados como `dispensado` (cancelado, sem e-mail, já avaliou tudo). */
  dispensados: number
  /** Endereço que o Resend não aceita (422): registrado, não tenta mais. */
  recusados: number
  /** Não saiu agora (o Resend fora); a próxima rodada tenta. */
  falharam: number
  /** Entregues há menos de um dia, ou o que ficou pra próxima rodada. */
  esperando: number
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function pedirAvaliacoes(
  container: MedusaContainer,
  {
    agora = new Date(),
    qualquerHora = false,
    pausaMs = PAUSA_ENTRE_EMAILS_MS,
  }: { agora?: Date; qualquerHora?: boolean; pausaMs?: number } = {}
): Promise<RelatorioDoPedirAvaliacoes> {
  const relatorio: RelatorioDoPedirAvaliacoes = {
    foraDoHorario: false,
    mandados: 0,
    dispensados: 0,
    recusados: 0,
    falharam: 0,
    esperando: 0,
  }
  if (!qualquerHora && !dentroDoHorario(agora)) return { ...relatorio, foraDoHorario: true }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  return container.resolve(Modules.LOCKING).execute(
    "pedir-avaliacoes",
    async (): Promise<RelatorioDoPedirAvaliacoes> => {
      /* 1. os pedidos com entrega na janela */
      const envios = container.resolve<EnviosService>(ENVIOS)
      const entregues = await envios.listEnvios(
        {
          situacao: "entregue",
          entregue_em: {
            $gte: new Date(agora.getTime() - JANELA_EM_DIAS * DIA_MS),
            // Os de menos de um dia entram também: contam como "esperando".
            $lte: agora,
          },
        } as Parameters<EnviosService["listEnvios"]>[0],
        { select: ["pedido_id"], take: 5000 }
      )
      const ids = [...new Set(entregues.flatMap((e) => (e.pedido_id ? [e.pedido_id] : [])))]
      if (!ids.length) return relatorio

      /* 2. todos os pacotes desses pedidos, os pedidos e as notas que já existem */
      const pacotes = (await envios.listEnvios(
        { pedido_id: ids },
        { select: ["pedido_id", "situacao", "codigo", "entregue_em"], take: 10_000 }
      )) as unknown as EnvioDaRodada[]
      const pacotesDo = new Map<string, EnvioDaRodada[]>()
      for (const p of pacotes) {
        if (!p.pedido_id) continue
        pacotesDo.set(p.pedido_id, [...(pacotesDo.get(p.pedido_id) ?? []), p])
      }
      const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "order",
        fields: CAMPOS,
        filters: { id: ids },
      })
      const pedidos = data as unknown as PedidoLido[]
      const avaliados = await container
        .resolve<AvaliacoesService>(AVALIACOES)
        .listAvaliacoes({ pedido_id: ids }, { select: ["pedido_id", "produto_id"], take: 10_000 })
      const avaliadosDo = new Map<string, Set<string>>()
      for (const a of avaliados) {
        avaliadosDo.set(a.pedido_id, (avaliadosDo.get(a.pedido_id) ?? new Set()).add(a.produto_id))
      }

      /* 3. quem recebe */
      const mandar: {
        pedido: PedidoLido
        faltam: ReturnType<typeof produtosDoPedido>
        chegou: Date
      }[] = []
      for (const o of pedidos) {
        const produtos = produtosDoPedido(o.items ?? [])
        const ja = avaliadosDo.get(o.id) ?? new Set<string>()
        const faltam = produtos.filter((p) => !ja.has(p.id))
        const chegou = chegouEm(pacotesDo.get(o.id) ?? [])
        const decisao = decidirPedido(
          {
            id: o.id,
            status: o.status,
            email: o.email,
            metadata: o.metadata,
            pago: pago(o),
            semAvaliacao: faltam.length,
          },
          chegou,
          agora
        )
        if (decisao.mandar && chegou) {
          mandar.push({ pedido: o, faltam, chegou })
          continue
        }
        if (decisao.mandar) continue
        if (decisao.motivo === "esperando") relatorio.esperando++
        if ("registrar" in decisao) {
          await registrar(container, o.id, {
            em: agora.toISOString(),
            como: "dispensado",
            motivo: decisao.motivo,
          })
          relatorio.dispensados++
        }
      }
      mandar.sort((a, b) => a.chegou.getTime() - b.chegou.getTime())
      relatorio.esperando += Math.max(0, mandar.length - POR_RODADA)

      /* 4. os e-mails, de quem chegou primeiro — um de cada vez */
      const whatsapp = mandar.length ? await whatsappDaLoja(container) : null
      const avisosDoEmail: string[] = []
      const quieto = {
        info: (m: string) => logger.info(m),
        warn: (m: string) => void avisosDoEmail.push(m.replace(/^\[email\] /, "")),
        error: (m: string) => logger.error(m),
      }
      const numeros: string[] = []
      for (const [i, { pedido: o, faltam }] of mandar.slice(0, POR_RODADA).entries()) {
        if (i > 0 && pausaMs > 0) await pausa(pausaMs)
        const r = await enviarEmail(
          emailDePedirAvaliacao({
            para: o.email!,
            numero: Number(o.display_id ?? 0),
            primeiroNome: nomeSugerido(o.shipping_address?.first_name, null),
            link: linkDoPedido(o.id),
            produtos: faltam.map((p) => ({ id: p.id, nome: p.nome, imagem: p.imagem })),
            whatsapp,
          }),
          quieto,
          { idempotencia: `pedir-avaliacao/${o.id}`, tipo: "pedir-avaliacao" }
        )
        if (r.ok) {
          await registrar(container, o.id, { em: agora.toISOString(), como: "email" })
          relatorio.mandados++
          numeros.push(`#${o.display_id}`)
          continue
        }
        if (r.status === 422) {
          await registrar(container, o.id, { em: agora.toISOString(), como: "recusado" })
          relatorio.recusados++
          logger.warn(
            `[avaliacoes] o Resend recusou ${emailNoLog(o.email!)} (pedido #${o.display_id}): não tenta mais`
          )
          continue
        }
        // Queda (ou o limite do Resend): o resto espera a próxima rodada —
        // insistir agora só bate na mesma parede.
        relatorio.falharam++
        relatorio.esperando += Math.min(mandar.length, POR_RODADA) - i - 1
        break
      }

      if (relatorio.mandados || relatorio.recusados || relatorio.falharam) {
        logger.info(
          `[avaliacoes] pedido de avaliação: ${relatorio.mandados} mandado(s)` +
            (numeros.length ? ` (${numeros.join(", ")})` : "") +
            (relatorio.recusados ? `, ${relatorio.recusados} recusado(s)` : "") +
            (relatorio.falharam
              ? `, não saiu agora: ${avisosDoEmail[0] ?? "sem motivo no log"}`
              : "") +
            (relatorio.esperando ? `; ${relatorio.esperando} esperando` : "")
        )
      }
      return relatorio
    },
    { timeout: 120 }
  )
}

/** O registro no pedido, pela porta do metadata — nunca por cima de outro. */
async function registrar(container: MedusaContainer, pedidoId: string, r: RegistroDoPedido) {
  await gravarNoMetadataDoPedido(container, pedidoId, ["emails", "avaliacao"], r)
}
