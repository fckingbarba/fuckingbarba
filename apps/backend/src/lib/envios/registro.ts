import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ENVIOS } from "../../modules/envios"
import type EnviosService from "../../modules/envios/service"
import {
  capturasDo,
  documentoDoPedido,
  faltaNoEndereco,
  lerEndereco,
  linha,
  nomeDoEndereco,
  telefone,
  type EnderecoDoMedusa,
} from "../dados-do-pedido"
import { emailNoLog, enviarEmail } from "../email"
import { emailDoCanceladoNaFrenet } from "../emails/cancelado-na-frenet"
import { emailsPraAvisar } from "../equipe/avisados"
import { notaParaAEtiqueta, type NotaParaAEtiqueta } from "../erp/notas"
import { gravarNoMetadataDoPedido } from "../metadata-do-pedido"
import { referenciaDoPedido, type ParceiroDeEntrega, type PedidoParaOParceiro } from "./parceiro"
import { parceiroDeEntrega, parceiroQueRegistra } from "./parceiros"

/**
 * O PEDIDO PAGO VAI SOZINHO PRO PAINEL DO PARCEIRO — e volta "enviado" sozinho.
 *
 *   pago ──▶ registrarNoParceiro ──▶ painel da Frenet (endereço, itens, serviço)
 *                                       │ quem despacha gera a etiqueta e posta
 *                                       ▼
 *   "enviado" + e-mail "a caminho" ◀── aviso de rastreio (`/hooks/envio/frenet`)
 *
 * É o caminho que a loja tinha na Nuvemshop: ninguém digita endereço no
 * painel, ninguém marca pedido como enviado. O formato do parceiro mora no
 * tradutor dele (`modules/frenet/pedidos.ts`); aqui é quando, quais pedidos
 * e quantas vezes. Desligado enquanto nenhum parceiro registra
 * (`parceiroQueRegistra`) — na Frenet, até o token de parceiro chegar.
 *
 * QUEM CHAMA: o `payment.captured` (`subscribers/pagamento-capturado.ts`),
 * logo depois do e-mail de confirmação; e a varredura (`registrarPendentes`:
 * o job `registrar-pedidos`, de 10 em 10 minutos, e
 * `POST /admin/envios/registrar`), pro que o evento não levou.
 *
 * ┌─ QUAIS PEDIDOS ────────────────────────────────────────────────────────┐
 * │ Pago, não cancelado, sem envio no admin — e pago DEPOIS de o registro  │
 * │ ligar. O "desde" fica guardado na loja (`fb_parceiros`) na primeira    │
 * │ vez que ele roda ligado: o pedido pago antes disso pode já ter         │
 * │ etiqueta feita à mão no painel, e mandar de novo seria o mesmo pacote  │
 * │ duas vezes lá. A varredura olha três dias pra trás.                    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * UMA VEZ SÓ: trava por pedido, e o registro no pedido
 * (`metadata.fb_parceiro`) lido dentro dela. O mesmo pagamento solta o
 * evento mais de uma vez (ver `pagamento-capturado.ts`), e a varredura passa
 * por cima de tudo.
 *
 * QUANDO O PARCEIRO DIZ NÃO: pedido recusado (um endereço que ele não
 * aceita, por exemplo) é definitivo — fica no registro, e o log diz qual,
 * pra alguém fazer a etiqueta à mão. Fora do ar, tempo esgotado, token
 * recusado: a varredura tenta de novo, cada vez mais espaçado (10 min, 20,
 * 40… até 6 horas), enquanto o pedido estiver nos três dias. Passou disso sem
 * entrar, a loja para (`registroAtrasado`): o registro fica definitivo, com
 * `desistiu_em`, e o painel mostra "Não entrou na Frenet" com o "Mandar de
 * novo" — em vez de "tentando entrar" num pedido que ninguém mais tentava.
 *
 * O ENVIO NASCE JUNTO: registrado o pedido, o núcleo ganha um envio
 * "aguardando", sem código, com o id que o parceiro deu. O aviso de rastreio
 * traz esse id de volta, e é por ele que o pacote acha o pedido — sem
 * depender do número. Sem código, ele não aparece pra ninguém: a conta, os
 * e-mails e os jobs só olham envio com código.
 *
 * E O CANCELADO SAI DO PAINEL (`tirarDoParceiro`, no `order.canceled`). Se
 * a Frenet não deixar, a equipe recebe um e-mail (um só: "não gere a
 * etiqueta"), o painel da loja mostra o problema, e a varredura tenta de
 * novo por 7 dias (`tirarCanceladosQueFicaram`) — também o cancelado cujo
 * evento se perdeu. O que entrou e não foi postado em cinco dias aparece no
 * log uma vez por dia (`noPainelSemPostagem`, no job `acompanhar-envios`).
 */

export const CHAVE_NO_PEDIDO = "fb_parceiro"
const CHAVE_NA_LOJA = "fb_parceiros"

const MINUTO = 60 * 1000
/** Até onde a varredura olha pra trás, pela hora da captura. */
const JANELA_MS = 3 * 24 * 60 * MINUTO
/** Quantos pedidos cada rodada tenta. */
const POR_RODADA = 20
/** Até onde o "passou dos três dias tentando" olha pra trás, pela hora da captura. */
const ATRASADOS_ATE_MS = 30 * 24 * 60 * MINUTO
/** Por quantos dias, depois do cancelamento, a loja tenta tirar o pedido do painel. */
export const DIAS_TIRANDO = 7
/**
 * O "desde" nasce dez minutos antes da primeira rodada ligada: o pagamento
 * que chegou enquanto o servidor reiniciava com o token novo entra também.
 */
const FOLGA_AO_LIGAR_MS = 10 * MINUTO

/* ── o registro no pedido ─────────────────────────────────────────────────── */

export type RegistroNoPedido = {
  parceiro: string
  /** Como o pedido se chama lá ("FB-1042"). */
  referencia: string
  entrou: boolean
  /** O id que o parceiro deu (o `ShipmentId` da Frenet). */
  id: string | null
  /** A última tentativa — ou a que deu certo. */
  em: string
  tentativas: number
  /** Por que a última tentativa não entrou. */
  erro?: string
  /** O parceiro recusou o pedido: tentar de novo não resolve. */
  definitivo?: boolean
  /**
   * A loja parou de tentar: passaram três dias sem o pedido entrar
   * (`registroAtrasado`). Vem junto com `definitivo`, e o `erro` é o último.
   */
  desistiu_em?: string
  /** Saiu do painel porque o pedido foi cancelado. */
  tirado_em?: string
  /** Por que não saiu. */
  erro_ao_tirar?: string
  /**
   * As tentativas de tirar (o `order.canceled` e a varredura, com a mesma
   * espera do registro) e a última — ver `tirarCanceladosQueFicaram`.
   */
  tentativas_ao_tirar?: number
  tentou_tirar_em?: string
  /** O e-mail pra equipe de que o cancelado ficou no painel — um só. */
  avisou_ao_tirar_em?: string
}

export function lerRegistroNoPedido(metadata: unknown): RegistroNoPedido | null {
  const r = (metadata as Record<string, unknown> | null | undefined)?.[CHAVE_NO_PEDIDO]
  if (!r || typeof r !== "object") return null
  const { parceiro, em, entrou, tentativas } = r as Record<string, unknown>
  if (typeof parceiro !== "string" || typeof em !== "string" || typeof entrou !== "boolean") {
    return null
  }
  return { ...(r as RegistroNoPedido), tentativas: Number(tentativas) || 0 }
}

/**
 * Troca só a chave do registro, pela porta do metadata do pedido
 * (`metadata-do-pedido.ts`): o e-mail de confirmação, a oferta do checkout e
 * os estornos moram no mesmo metadata, e podem ser gravados enquanto o
 * parceiro responde. Relido sem a trava de lá, um registro gravado junto
 * com outro ainda se perdia — e registro perdido aqui é o pedido entrando
 * de novo no painel.
 */
async function gravar(container: MedusaContainer, pedidoId: string, registro: RegistroNoPedido) {
  await gravarNoMetadataDoPedido(container, pedidoId, CHAVE_NO_PEDIDO, registro)
}

/* ── o pedido, como o Medusa devolve ──────────────────────────────────────── */

type Endereco = EnderecoDoMedusa

export type PedidoLido = {
  id: string
  display_id?: number | null
  email?: string | null
  status?: string | null
  created_at?: string | Date | null
  metadata?: Record<string, unknown> | null
  total?: unknown
  item_total?: unknown
  shipping_total?: unknown
  items?:
    | ({
        id?: string | null
        title?: string | null
        product_title?: string | null
        variant_title?: string | null
        product_id?: string | null
        variant_sku?: string | null
        quantity?: unknown
        unit_price?: unknown
        total?: unknown
        variant?: { weight?: unknown; length?: unknown; width?: unknown; height?: unknown } | null
      } | null)[]
    | null
  shipping_address?: Endereco | null
  billing_address?: Pick<Endereco, "metadata"> | null
  shipping_methods?: ({ data?: Record<string, unknown> | null } | null)[] | null
  payment_collections?: ({ payments?: ({ captured_at?: unknown } | null)[] | null } | null)[] | null
  fulfillments?: ({ canceled_at?: unknown } | null)[] | null
}

const CAMPOS = [
  "id",
  "display_id",
  "email",
  "status",
  "created_at",
  "metadata",
  "total",
  "item_total",
  "shipping_total",
  "items.id",
  "items.title",
  "items.product_title",
  "items.variant_title",
  "items.product_id",
  "items.variant_sku",
  "items.quantity",
  "items.unit_price",
  "items.total",
  "items.variant.weight",
  "items.variant.length",
  "items.variant.width",
  "items.variant.height",
  "shipping_address.*",
  "billing_address.metadata",
  "shipping_methods.data",
  "payment_collections.amount",
  "payment_collections.payments.amount",
  "payment_collections.payments.captured_at",
  "fulfillments.canceled_at",
]

async function lerPedido(container: MedusaContainer, id: string): Promise<PedidoLido | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: CAMPOS, filters: { id } })
  return (data[0] as unknown as PedidoLido | undefined) ?? null
}

/* ── a decisão, sem efeito nenhum ─────────────────────────────────────────── */

/** Depois de `tentativas` falhas, quanto esperar: 10 min, 20, 40… até 6 horas. */
export function esperaDepoisDe(tentativas: number): number {
  return Math.min(10 * MINUTO * 2 ** Math.max(0, tentativas - 1), 6 * 60 * MINUTO)
}

const emEspera = (r: RegistroNoPedido, agora: Date) =>
  agora.getTime() - new Date(r.em).getTime() < esperaDepoisDe(r.tentativas)

/**
 * Passou dos três dias tentando? O pedido pago, não cancelado, sem envio no
 * admin, com todos os pagamentos fora da janela da varredura — e o registro
 * diz que ele não entrou, sem a recusa de vez: a loja ainda achava que ia.
 */
export function registroAtrasado(
  o: Pick<PedidoLido, "status" | "metadata" | "payment_collections" | "fulfillments">,
  agora: Date
): boolean {
  if (o.status === "canceled") return false
  if ((o.fulfillments ?? []).some((f) => f && !f.canceled_at)) return false
  const r = lerRegistroNoPedido(o.metadata)
  if (!r || r.entrou || r.definitivo) return false
  const capturas = capturasDo(o)
  return capturas.length > 0 && capturas.every((d) => d.getTime() < agora.getTime() - JANELA_MS)
}

export type DecisaoDoRegistro =
  | { registrar: true }
  | {
      registrar: false
      motivo:
        | "ja-entrou"
        | "cancelado"
        | "nao-pago"
        | "pago-antes"
        | "ja-tem-envio"
        | "recusado"
        | "esperando"
        | "esperando-nota"
    }

export function decidirRegistro(
  o: PedidoLido,
  {
    desde,
    agora,
    nota = { esperar: false, nota: null },
    deNovo = false,
  }: { desde: Date; agora: Date; nota?: NotaParaAEtiqueta; deNovo?: boolean }
): DecisaoDoRegistro {
  const r = lerRegistroNoPedido(o.metadata)
  if (r?.entrou) return { registrar: false, motivo: "ja-entrou" }
  if (o.status === "canceled") return { registrar: false, motivo: "cancelado" }
  const capturas = capturasDo(o)
  if (!capturas.length) return { registrar: false, motivo: "nao-pago" }
  if (!capturas.some((d) => d >= desde)) return { registrar: false, motivo: "pago-antes" }
  // Envio criado no admin — postado ou não — é alguém cuidando dele à mão.
  if ((o.fulfillments ?? []).some((f) => f && !f.canceled_at)) {
    return { registrar: false, motivo: "ja-tem-envio" }
  }
  // "Mandar de novo" (o botão do painel): passa por cima da recusa e da espera.
  if (r?.definitivo && !deNovo) return { registrar: false, motivo: "recusado" }
  if (r && !deNovo && emEspera(r, agora)) return { registrar: false, motivo: "esperando" }
  // Com o ERP emitindo, a etiqueta espera a nota: ela vai junto pro painel.
  if (nota.esperar) return { registrar: false, motivo: "esperando-nota" }
  return { registrar: true }
}

/* ── o pedido no formato do contrato ──────────────────────────────────────── */

const numeroOuZero = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function montarPedido(
  o: PedidoLido,
  nota: PedidoParaOParceiro["nota"] = null
): { ok: true; pedido: PedidoParaOParceiro } | { ok: false; motivo: string } {
  const numero = Number(o.display_id ?? 0)
  if (!numero) return { ok: false, motivo: "pedido sem número" }
  const e = o.shipping_address
  if (!e) return { ok: false, motivo: "pedido sem endereço de entrega" }

  const nome = nomeDoEndereco(e)
  const endereco = lerEndereco(e)
  const falta = faltaNoEndereco(nome, endereco)
  if (falta.length) return { ok: false, motivo: `endereço incompleto (falta ${falta.join(", ")})` }

  const itens = (o.items ?? [])
    .filter((i): i is NonNullable<typeof i> => Boolean(i?.id))
    .map((i) => {
      const quantidade = numeroOuZero(i.quantity) || 1
      const total = numeroOuZero(i.total)
      const variante = [
        linha(i.product_title) || linha(i.title) || "Produto",
        linha(i.variant_title),
      ]
      return {
        id: i.id!,
        produtoId: i.product_id ?? null,
        sku: linha(i.variant_sku) || null,
        nome: variante[1] && variante[1] !== "Único" ? variante.join(" — ") : variante[0]!,
        quantidade,
        // O que a pessoa pagou pela unidade, já com desconto: é o valor declarado.
        preco: total > 0 ? total / quantidade : numeroOuZero(i.unit_price),
        pesoEmGramas: numeroOuZero(i.variant?.weight),
        comprimento: numeroOuZero(i.variant?.length),
        largura: numeroOuZero(i.variant?.width),
        altura: numeroOuZero(i.variant?.height),
      }
    })
  if (!itens.length) return { ok: false, motivo: "pedido sem itens" }

  let servico: PedidoParaOParceiro["servico"] = null
  for (const m of o.shipping_methods ?? []) {
    const s = (m?.data as { servico?: Record<string, unknown> } | null | undefined)?.servico
    if (typeof s?.codigo === "string" && s.codigo) {
      servico = {
        codigo: s.codigo,
        nome: typeof s.nome === "string" ? s.nome : null,
        transportadora: typeof s.transportadora === "string" ? s.transportadora : null,
      }
      break
    }
  }

  const criado = o.created_at ? new Date(o.created_at) : new Date()
  return {
    ok: true,
    pedido: {
      numero,
      referencia: referenciaDoPedido(numero),
      criadoEm: criado.toISOString(),
      total: numeroOuZero(o.total),
      valorDosProdutos: numeroOuZero(o.item_total),
      frete: numeroOuZero(o.shipping_total),
      email: o.email?.includes("@") ? o.email : null,
      destinatario: {
        nome,
        documento: documentoDoPedido(o.billing_address, o.shipping_address)?.valor ?? null,
        telefone: telefone(e.phone),
        endereco,
      },
      itens,
      servico,
      nota,
    },
  }
}

/* ── desde quando ─────────────────────────────────────────────────────────── */

/**
 * A partir de quando o registro vale — gravado na loja na primeira vez que
 * ele roda ligado (ver "QUAIS PEDIDOS", lá em cima). Se o token sair e
 * voltar, o "desde" continua o da primeira vez: os pedidos pagos no meio
 * do caminho entram no painel se ainda estiverem nos três dias da
 * varredura.
 */
export async function registroLigadoDesde(
  container: MedusaContainer,
  parceiro: ParceiroDeEntrega,
  agora = new Date()
): Promise<Date> {
  const trava = container.resolve(Modules.LOCKING)
  return trava.execute(
    `registro-ligado:${parceiro.id}`,
    async () => {
      const lojas = container.resolve(Modules.STORE)
      const [loja] = await lojas.listStores({}, { select: ["id", "metadata"], take: 1 })
      if (!loja) return agora
      const meta = (loja.metadata ?? {}) as Record<string, unknown>
      const todos = (
        meta[CHAVE_NA_LOJA] && typeof meta[CHAVE_NA_LOJA] === "object" ? meta[CHAVE_NA_LOJA] : {}
      ) as Record<string, Record<string, unknown> | undefined>
      const guardado = new Date(String(todos[parceiro.id]?.pedidos_desde ?? ""))
      if (!Number.isNaN(guardado.getTime())) return guardado

      const desde = new Date(agora.getTime() - FOLGA_AO_LIGAR_MS)
      await lojas.updateStores(loja.id, {
        metadata: {
          ...meta,
          [CHAVE_NA_LOJA]: {
            ...todos,
            [parceiro.id]: { ...todos[parceiro.id], pedidos_desde: desde.toISOString() },
          },
        },
      })
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .info(
          `[envio] registro de pedidos na ${parceiro.nome} ligado: vale pros pedidos pagos ` +
            `desde ${desde.toISOString()}. Os de antes seguem pela etiqueta feita à mão.`
        )
      return desde
    },
    { timeout: 30 }
  )
}

/* ── um pedido ────────────────────────────────────────────────────────────── */

export type ResultadoDoRegistro =
  | { resultado: "entrou"; numero: number; id: string }
  | { resultado: "nada"; motivo: string }
  | { resultado: "falhou"; numero: number; motivo: string; definitivo: boolean }

/**
 * Manda o pedido pro painel do parceiro, se for a hora e se ainda não foi.
 *
 * `quieto` é pra varredura: ela diz num resumo o que não entrou, em vez de
 * uma linha por pedido a cada 10 minutos. A recusa definitiva sai sempre —
 * é a única que pede alguém.
 */
export async function registrarNoParceiro(
  container: MedusaContainer,
  pedidoId: string,
  {
    agora = new Date(),
    quieto = false,
    desde,
    deNovo = false,
  }: { agora?: Date; quieto?: boolean; desde?: Date; deNovo?: boolean } = {}
): Promise<ResultadoDoRegistro> {
  const parceiro = parceiroQueRegistra()
  if (!parceiro?.registrarPedido) return { resultado: "nada", motivo: "desligado" }
  const valeDesde = desde ?? (await registroLigadoDesde(container, parceiro, agora))
  const trava = container.resolve(Modules.LOCKING)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  return trava.execute(
    `registro-no-parceiro:${pedidoId}`,
    async (): Promise<ResultadoDoRegistro> => {
      const pedido = await lerPedido(container, pedidoId)
      if (!pedido) return { resultado: "nada", motivo: "pedido não existe" }
      const nota = await notaParaAEtiqueta(container, pedidoId, capturasDo(pedido))
      const decisao = decidirRegistro(pedido, { desde: valeDesde, agora, nota, deNovo })
      if (!decisao.registrar) return { resultado: "nada", motivo: decisao.motivo }

      const numero = Number(pedido.display_id ?? 0)
      const referencia = referenciaDoPedido(numero)
      const tentativas = (lerRegistroNoPedido(pedido.metadata)?.tentativas ?? 0) + 1
      const montado = montarPedido(pedido, nota.nota)
      const r = montado.ok
        ? await parceiro.registrarPedido!(montado.pedido)
        : { ok: false as const, motivo: montado.motivo, definitivo: true }

      if (r.ok) {
        await gravar(container, pedidoId, {
          parceiro: parceiro.id,
          referencia,
          entrou: true,
          id: r.idNoParceiro,
          em: agora.toISOString(),
          tentativas,
        })
        const problema = await nascerOEnvio(container, parceiro, {
          pedidoId,
          referencia,
          id: r.idNoParceiro,
          servico: montado.ok ? montado.pedido.servico : null,
        }).catch((e: unknown) => (e instanceof Error ? e.message : String(e)))
        if (problema) {
          logger.warn(
            `[envio] #${numero} entrou na ${parceiro.nome}, mas o envio não nasceu junto ` +
              `(${problema}) — o aviso acha o pedido pelo número`
          )
        }
        logger.info(
          `[envio] #${numero} no painel da ${parceiro.nome} (${referencia}, envio ${r.idNoParceiro})`
        )
        return { resultado: "entrou", numero, id: r.idNoParceiro }
      }

      await gravar(container, pedidoId, {
        parceiro: parceiro.id,
        referencia,
        entrou: false,
        id: null,
        em: agora.toISOString(),
        tentativas,
        erro: r.motivo,
        ...(r.definitivo ? { definitivo: true } : {}),
      })
      if (r.definitivo) {
        logger.warn(
          `[envio] o #${numero} não entrou no painel da ${parceiro.nome}, e não vou tentar de novo: ` +
            `${r.motivo}. A etiqueta dele precisa ser feita à mão.`
        )
      } else if (!quieto) {
        logger.warn(
          `[envio] o #${numero} não entrou no painel da ${parceiro.nome} agora (${r.motivo}) — ` +
            "a varredura tenta de novo"
        )
      }
      return { resultado: "falhou", numero, motivo: r.motivo, definitivo: r.definitivo }
    },
    { timeout: 30 }
  )
}

/**
 * O envio do núcleo, "aguardando" e sem código, com o id que o parceiro
 * deu — é por ele que o aviso de rastreio acha o pedido (`acharEnvio`, no
 * núcleo). Se já existe um com esse id, não mexe — e, se ele for de OUTRO
 * pedido, devolve o problema: o id do envio é único no parceiro, e o aviso
 * iria pro pedido errado.
 */
async function nascerOEnvio(
  container: MedusaContainer,
  parceiro: ParceiroDeEntrega,
  d: { pedidoId: string; referencia: string; id: string; servico: PedidoParaOParceiro["servico"] }
): Promise<string | null> {
  const envios = container.resolve<EnviosService>(ENVIOS)
  const [ja] = await envios.listEnvios(
    { parceiro: parceiro.id, id_no_parceiro: d.id },
    { select: ["id", "pedido_id"], take: 1 }
  )
  if (ja?.pedido_id && ja.pedido_id !== d.pedidoId) {
    return `o envio ${d.id} da ${parceiro.nome} já é de outro pedido (${ja.pedido_id})`
  }
  if (ja) return null
  await envios.createEnvios({
    pedido_id: d.pedidoId,
    parceiro: parceiro.id,
    id_no_parceiro: d.id,
    referencia: d.referencia,
    transportadora: d.servico?.transportadora ?? null,
    servico: d.servico?.nome ?? null,
    situacao: "aguardando",
  })
  return null
}

/* ── o cancelado sai do painel ────────────────────────────────────────────── */

export type Retirada =
  | { resultado: "tirou"; numero: number }
  | { resultado: "nada" }
  | { resultado: "falhou"; numero: number; motivo: string }

export async function tirarDoParceiro(
  container: MedusaContainer,
  pedidoId: string,
  agora = new Date()
): Promise<Retirada> {
  const trava = container.resolve(Modules.LOCKING)
  return trava.execute(
    `registro-no-parceiro:${pedidoId}`,
    async (): Promise<Retirada> => {
      const pedido = await container
        .resolve(Modules.ORDER)
        .retrieveOrder(pedidoId, { select: ["id", "display_id", "metadata"] })
      const r = lerRegistroNoPedido(pedido.metadata)
      if (!r?.entrou || !r.id || r.tirado_em) return { resultado: "nada" }
      const numero = Number(pedido.display_id ?? 0)
      const parceiro = parceiroDeEntrega(r.parceiro)
      const t = parceiro?.tirarPedido
        ? await parceiro.tirarPedido(r.id)
        : { ok: false as const, motivo: `o parceiro "${r.parceiro}" não sabe tirar pedido` }

      if (t.ok) {
        const tirado: RegistroNoPedido = { ...r, tirado_em: agora.toISOString() }
        delete tirado.erro_ao_tirar
        await gravar(container, pedidoId, tirado)
        return { resultado: "tirou", numero }
      }
      const ficou: RegistroNoPedido = {
        ...r,
        erro_ao_tirar: t.motivo,
        tentativas_ao_tirar: (r.tentativas_ao_tirar ?? 0) + 1,
        tentou_tirar_em: agora.toISOString(),
      }
      await gravar(container, pedidoId, ficou)
      if (!r.avisou_ao_tirar_em) {
        const saiu = await avisarQueFicou(container, {
          pedidoId,
          numero,
          referencia: r.referencia,
          motivo: t.motivo,
          dias: DIAS_TIRANDO,
        }).catch(() => false)
        if (saiu)
          await gravar(container, pedidoId, { ...ficou, avisou_ao_tirar_em: agora.toISOString() })
      }
      return { resultado: "falhou", numero, motivo: t.motivo }
    },
    { timeout: 30 }
  )
}

/** O e-mail do cancelado que ficou no painel: pra quem despacha e pro dono. */
async function avisarQueFicou(
  container: MedusaContainer,
  a: Parameters<typeof emailDoCanceladoNaFrenet>[1]
): Promise<boolean> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const emails = await emailsPraAvisar(container, ["operacao", "dono"])
  if (!emails.length) {
    logger.warn(`[envio] #${a.numero}: ninguém na equipe nem no admin pra avisar por e-mail`)
    return false
  }
  let saiu = false
  for (const para of emails) {
    const r = await enviarEmail(emailDoCanceladoNaFrenet(para, a), logger, {
      idempotencia: `frenet-cancelado/${a.pedidoId}/${para}`.slice(0, 256),
    })
    if (r.ok) {
      saiu = true
      logger.info(`[envio] #${a.numero} cancelado e ainda na Frenet: avisei ${emailNoLog(para)}`)
    }
  }
  return saiu
}

/** A mesma espera do registro (10 min, 20, 40… até 6 horas) entre as tentativas de tirar. */
const esperandoPraTirar = (r: RegistroNoPedido, agora: Date) =>
  Boolean(r.tentou_tirar_em) &&
  agora.getTime() - new Date(r.tentou_tirar_em!).getTime() <
    esperaDepoisDe(r.tentativas_ao_tirar ?? 1)

/** O cancelado que entrou no painel e ainda não saiu — e já é hora de tentar de novo. */
export function paraTirarDeNovo(metadata: unknown, agora: Date): boolean {
  const r = lerRegistroNoPedido(metadata)
  return Boolean(r?.entrou && r.id && !r.tirado_em && !esperandoPraTirar(r, agora))
}

export type RelatorioDosCancelados = { tirados: string[]; ficaram: string[] }

/**
 * A rede embaixo do `order.canceled`: o pedido cancelado nos últimos 7 dias
 * que entrou no painel do parceiro e não saiu — a Frenet fora do ar na hora
 * (a espera cresce a cada tentativa, como a do registro), ou o evento que se
 * perdeu (esse sai na primeira rodada).
 */
export async function tirarCanceladosQueFicaram(
  container: MedusaContainer,
  agora = new Date()
): Promise<RelatorioDosCancelados> {
  const relatorio: RelatorioDosCancelados = { tirados: [], ficaram: [] }
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "metadata"],
    filters: {
      status: "canceled",
      canceled_at: {
        $gte: new Date(agora.getTime() - DIAS_TIRANDO * 24 * 60 * MINUTO).toISOString(),
      },
    },
  })
  const pendentes = (data as { id?: string; metadata?: unknown }[])
    .filter((o) => o.id && paraTirarDeNovo(o.metadata, agora))
    .map((o) => o.id as string)
  for (const id of pendentes.slice(0, POR_RODADA)) {
    const r = await tirarDoParceiro(container, id, agora).catch((e) => ({
      resultado: "falhou" as const,
      numero: 0,
      motivo: e instanceof Error ? e.message : String(e),
    }))
    if (r.resultado === "tirou") relatorio.tirados.push(`#${r.numero}`)
    else if (r.resultado === "falhou")
      relatorio.ficaram.push(`${r.numero ? `#${r.numero}` : id} (${r.motivo})`)
  }
  if (relatorio.tirados.length || relatorio.ficaram.length) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        `[envio] cancelados no painel: ${relatorio.tirados.length} saíram, ` +
          `${relatorio.ficaram.length} ainda lá` +
          (relatorio.ficaram.length ? ` — ${relatorio.ficaram.slice(0, 3).join("; ")}` : "")
      )
  }
  return relatorio
}

/* ── o que ficou no painel ────────────────────────────────────────────────── */

/**
 * Os pedidos que entraram no painel há mais de cinco dias (e menos de 30) e
 * não saíram — sem postagem, sem envio no admin, sem cancelamento. Ou a
 * etiqueta não foi feita, ou o aviso da postagem não chegou: nos dois casos,
 * alguém precisa olhar o painel. Devolve como o painel chama cada um (FB-…).
 */
export async function noPainelSemPostagem(
  container: MedusaContainer,
  agora = new Date()
): Promise<string[]> {
  const DIA = 24 * 60 * MINUTO
  const esperando = await container.resolve<EnviosService>(ENVIOS).listEnvios(
    {
      codigo: null,
      situacao: "aguardando",
      pedido_id: { $ne: null },
      id_no_parceiro: { $ne: null },
      created_at: {
        $lt: new Date(agora.getTime() - 5 * DIA),
        $gte: new Date(agora.getTime() - 30 * DIA),
      },
    },
    { select: ["pedido_id", "referencia"], order: { created_at: "ASC" }, take: 50 }
  )
  if (!esperando.length) return []

  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "status", "fulfillments.canceled_at"],
    filters: { id: [...new Set(esperando.map((e) => e.pedido_id as string))] },
  })
  type Lido = { id: string; status?: string; fulfillments?: ({ canceled_at?: unknown } | null)[] }
  const parados = new Set(
    (data as Lido[])
      .filter(
        (o) => o.status !== "canceled" && !(o.fulfillments ?? []).some((f) => f && !f.canceled_at)
      )
      .map((o) => o.id)
  )
  return esperando
    .filter((e) => parados.has(e.pedido_id as string))
    .map((e) => e.referencia ?? (e.pedido_id as string))
}

/* ── a varredura ──────────────────────────────────────────────────────────── */

export type RelatorioDeRegistros = {
  /** Pedidos pagos na janela que ainda podiam entrar. */
  pendentes: number
  entraram: string[]
  /** Os que a varredura tenta de novo. */
  falharam: string[]
  /** Os que o parceiro recusou — etiqueta à mão. */
  recusados: string[]
  /** Os que passaram dos três dias tentando: a loja parou. */
  desistidos: string[]
  /** Os cancelados que ficaram no painel e saíram agora, e os que ainda estão lá. */
  tirados: string[]
  ficaram: string[]
}

/**
 * O pedido que passou dos três dias tentando entrar (`registroAtrasado`):
 * o registro fica definitivo, com `desistiu_em`, e o painel da loja mostra o
 * problema com o "Mandar de novo".
 */
async function desistirDosAtrasados(
  container: MedusaContainer,
  parceiro: ParceiroDeEntrega,
  desde: Date,
  agora: Date
): Promise<string[]> {
  const inicio = Math.max(desde.getTime(), agora.getTime() - ATRASADOS_ATE_MS)
  const fim = agora.getTime() - JANELA_MS
  if (inicio >= fim) return []
  // Do mais novo pro mais velho: o que acabou de sair da janela vem primeiro.
  const pagos = await container
    .resolve(Modules.PAYMENT)
    .listPayments(
      { captured_at: { $gte: new Date(inicio).toISOString(), $lt: new Date(fim).toISOString() } },
      { select: ["payment_collection_id"], order: { captured_at: "DESC" }, take: 1000 }
    )
  const colecoes = [...new Set(pagos.map((p) => p.payment_collection_id).filter(Boolean))]
  if (!colecoes.length) return []
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order_payment_collection",
    fields: ["order.id", "order.status", "order.metadata"],
    filters: { payment_collection_id: colecoes },
  })
  const candidatos = [
    ...new Set(
      (data as { order?: { id?: string; status?: string; metadata?: unknown } | null }[])
        .filter((l) => {
          if (!l.order?.id || l.order.status === "canceled") return false
          const r = lerRegistroNoPedido(l.order.metadata)
          return Boolean(r && !r.entrou && !r.definitivo)
        })
        .map((l) => l.order!.id!)
    ),
  ]

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const desistidos: string[] = []
  for (const id of candidatos.slice(0, 50)) {
    const numero = await container
      .resolve(Modules.LOCKING)
      .execute(
        `registro-no-parceiro:${id}`,
        async (): Promise<number | null> => {
          // Relido na trava: o "Mandar de novo" pode ter chegado antes.
          const pedido = await lerPedido(container, id)
          const r = pedido ? lerRegistroNoPedido(pedido.metadata) : null
          if (!pedido || !r || !registroAtrasado(pedido, agora)) return null
          await gravar(container, id, { ...r, definitivo: true, desistiu_em: agora.toISOString() })
          const n = Number(pedido.display_id ?? 0)
          logger.warn(
            `[envio] o #${n} passou dos 3 dias sem entrar no painel da ${parceiro.nome} ` +
              `(o último erro: ${r.erro ?? "sem detalhe"}) — a loja parou de tentar; o pedido ` +
              'tem o "Mandar de novo" no painel da loja'
          )
          return n
        },
        { timeout: 30 }
      )
      .catch((e) => {
        logger.warn(
          `[envio] não deu pra marcar o pedido ${id} que passou dos 3 dias: ` +
            `${e instanceof Error ? e.message : String(e)} — a próxima rodada tenta de novo`
        )
        return null
      })
    if (numero !== null) desistidos.push(`#${numero}`)
  }
  return desistidos
}

export async function registrarPendentes(
  container: MedusaContainer,
  agora = new Date()
): Promise<RelatorioDeRegistros> {
  const relatorio: RelatorioDeRegistros = {
    pendentes: 0,
    entraram: [],
    falharam: [],
    recusados: [],
    desistidos: [],
    tirados: [],
    ficaram: [],
  }
  const parceiro = parceiroQueRegistra()
  if (!parceiro) return relatorio

  const desde = await registroLigadoDesde(container, parceiro, agora)
  // Antes dos pagos: o cancelado que ficou no painel, e o que passou dos três dias.
  Object.assign(relatorio, await tirarCanceladosQueFicaram(container, agora))
  relatorio.desistidos = await desistirDosAtrasados(container, parceiro, desde, agora)
  const inicio = new Date(Math.max(desde.getTime(), agora.getTime() - JANELA_MS))
  const pagos = await container.resolve(Modules.PAYMENT).listPayments(
    { captured_at: { $gte: inicio.toISOString() } },
    {
      select: ["id", "payment_collection_id", "captured_at"],
      order: { captured_at: "ASC" },
      take: 1000,
    }
  )
  const colecoes = [...new Set(pagos.map((p) => p.payment_collection_id).filter(Boolean))]
  if (!colecoes.length) return relatorio

  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order_payment_collection",
    fields: [
      "payment_collection_id",
      "order.id",
      "order.status",
      "order.metadata",
      "order.fulfillments.canceled_at",
    ],
    filters: { payment_collection_id: colecoes },
  })
  type Ligacao = {
    payment_collection_id?: string
    order?: {
      id?: string
      status?: string
      metadata?: unknown
      fulfillments?: ({ canceled_at?: unknown } | null)[] | null
    } | null
  }
  const porColecao = new Map((data as Ligacao[]).map((l) => [l.payment_collection_id, l.order]))

  // Na ordem da captura: o mais antigo sai da janela antes.
  const pendentes: string[] = []
  for (const colecao of colecoes) {
    const pedido = porColecao.get(colecao)
    if (!pedido?.id || pedido.status === "canceled" || pendentes.includes(pedido.id)) continue
    // Envio criado no admin: alguém já cuida dele (o "ja-tem-envio" da decisão).
    if ((pedido.fulfillments ?? []).some((f) => f && !f.canceled_at)) continue
    const r = lerRegistroNoPedido(pedido.metadata)
    if (r && (r.entrou || r.definitivo || emEspera(r, agora))) continue
    pendentes.push(pedido.id)
  }
  relatorio.pendentes = pendentes.length

  for (const id of pendentes.slice(0, POR_RODADA)) {
    try {
      const r = await registrarNoParceiro(container, id, { agora, quieto: true, desde })
      if (r.resultado === "entrou") relatorio.entraram.push(`#${r.numero}`)
      else if (r.resultado === "falhou") {
        ;(r.definitivo ? relatorio.recusados : relatorio.falharam).push(
          `#${r.numero} (${r.motivo})`
        )
      }
    } catch (e) {
      relatorio.falharam.push(`${id} (${e instanceof Error ? e.message : String(e)})`)
    }
  }

  if (relatorio.falharam.length) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        `[envio] pedidos pro painel da ${parceiro.nome}: ${relatorio.entraram.length} entraram, ` +
          `${relatorio.falharam.length} não — ${relatorio.falharam.slice(0, 3).join("; ")}` +
          `${relatorio.falharam.length > 3 ? "…" : ""} — a varredura tenta de novo`
      )
  }
  return relatorio
}
