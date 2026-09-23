import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ENVIOS } from "../../modules/envios"
import type EnviosService from "../../modules/envios/service"
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
 * 40… até 6 horas), enquanto o pedido estiver nos três dias.
 *
 * O ENVIO NASCE JUNTO: registrado o pedido, o núcleo ganha um envio
 * "aguardando", sem código, com o id que o parceiro deu. O aviso de rastreio
 * traz esse id de volta, e é por ele que o pacote acha o pedido — sem
 * depender do número. Sem código, ele não aparece pra ninguém: a conta, os
 * e-mails e os jobs só olham envio com código.
 *
 * E O CANCELADO SAI DO PAINEL (`tirarDoParceiro`, no `order.canceled`). O
 * que entrou e não foi postado em cinco dias aparece no log uma vez por dia
 * (`noPainelSemPostagem`, no job `acompanhar-envios`).
 */

export const CHAVE_NO_PEDIDO = "fb_parceiro"
const CHAVE_NA_LOJA = "fb_parceiros"

const MINUTO = 60 * 1000
/** Até onde a varredura olha pra trás, pela hora da captura. */
const JANELA_MS = 3 * 24 * 60 * MINUTO
/** Quantos pedidos cada rodada tenta. */
const POR_RODADA = 20
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
  /** Saiu do painel porque o pedido foi cancelado. */
  tirado_em?: string
  /** Por que não saiu. */
  erro_ao_tirar?: string
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
 * Relê o metadata na hora de gravar, e troca só a chave do registro: o
 * e-mail de confirmação, a oferta do checkout e os estornos moram no mesmo
 * metadata, e podem ter sido gravados enquanto o parceiro respondia.
 */
async function gravar(container: MedusaContainer, pedidoId: string, registro: RegistroNoPedido) {
  const pedidos = container.resolve(Modules.ORDER)
  const atual = await pedidos.retrieveOrder(pedidoId, { select: ["id", "metadata"] })
  await pedidos.updateOrders([
    {
      id: pedidoId,
      metadata: {
        ...((atual.metadata as Record<string, unknown> | null) ?? {}),
        [CHAVE_NO_PEDIDO]: registro,
      },
    },
  ])
}

/* ── o pedido, como o Medusa devolve ──────────────────────────────────────── */

type Endereco = {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  postal_code?: string | null
  metadata?: Record<string, unknown> | null
}

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
    }

export function decidirRegistro(
  o: PedidoLido,
  { desde, agora }: { desde: Date; agora: Date }
): DecisaoDoRegistro {
  const r = lerRegistroNoPedido(o.metadata)
  if (r?.entrou) return { registrar: false, motivo: "ja-entrou" }
  if (o.status === "canceled") return { registrar: false, motivo: "cancelado" }
  const capturas = (o.payment_collections ?? [])
    .flatMap((c) => c?.payments ?? [])
    .map((p) => (p?.captured_at ? new Date(p.captured_at as string) : null))
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()))
  if (!capturas.length) return { registrar: false, motivo: "nao-pago" }
  if (!capturas.some((d) => d >= desde)) return { registrar: false, motivo: "pago-antes" }
  // Envio criado no admin — postado ou não — é alguém cuidando dele à mão.
  if ((o.fulfillments ?? []).some((f) => f && !f.canceled_at)) {
    return { registrar: false, motivo: "ja-tem-envio" }
  }
  if (r?.definitivo) return { registrar: false, motivo: "recusado" }
  if (r && emEspera(r, agora)) return { registrar: false, motivo: "esperando" }
  return { registrar: true }
}

/* ── o pedido no formato do contrato ──────────────────────────────────────── */

const digitos = (v: unknown) => (typeof v === "string" ? v.replace(/\D/g, "") : "")
const linha = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "")
const numeroOuZero = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** "+55 (11) 91234-5678" → "11912345678". Sem DDD, não serve pra transportadora. */
function telefone(v: unknown): string | null {
  let d = digitos(v)
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2)
  return d.length === 10 || d.length === 11 ? d : null
}

/** O CPF/CNPJ que o checkout grava no endereço de cobrança (`{ tipo, valor }`). */
function documento(o: PedidoLido): string | null {
  for (const meta of [o.billing_address?.metadata, o.shipping_address?.metadata]) {
    const doc = (meta?.documento as { valor?: unknown } | null | undefined)?.valor
    const limpo = typeof doc === "string" ? doc.replace(/[^0-9A-Za-z]/g, "").toUpperCase() : ""
    if (limpo.length === 11 || limpo.length === 14) return limpo
  }
  return null
}

/**
 * O endereço como o checkout grava (`montarEndereco`, na loja): as partes
 * no metadata, e as linhas montadas — "rua, número" e "complemento —
 * bairro" — pra quem não lê o metadata. As partes valem mais; as linhas são
 * o plano B.
 */
function lerEndereco(e: Endereco) {
  const meta = e.metadata ?? {}
  const l1 = linha(e.address_1)
  const partesDaL2 = linha(e.address_2).split(" — ").filter(Boolean)
  return {
    cep: digitos(e.postal_code),
    rua: linha(meta.rua) || l1.replace(/,\s*[^,]*$/, "").trim(),
    numero: linha(meta.numero) || (l1.includes(",") ? l1.split(",").pop()!.trim() : "") || "S/N",
    complemento:
      linha(meta.complemento) ||
      (partesDaL2.length > 1 ? partesDaL2.slice(0, -1).join(" — ") : "") ||
      null,
    bairro: linha(meta.bairro) || partesDaL2[partesDaL2.length - 1] || "",
    cidade: linha(e.city),
    uf: linha(e.province).toUpperCase(),
  }
}

export function montarPedido(
  o: PedidoLido
): { ok: true; pedido: PedidoParaOParceiro } | { ok: false; motivo: string } {
  const numero = Number(o.display_id ?? 0)
  if (!numero) return { ok: false, motivo: "pedido sem número" }
  const e = o.shipping_address
  if (!e) return { ok: false, motivo: "pedido sem endereço de entrega" }

  const nome = [linha(e.first_name), linha(e.last_name)].filter(Boolean).join(" ")
  const endereco = lerEndereco(e)
  const falta = [
    !nome && "nome",
    endereco.cep.length !== 8 && "CEP",
    !endereco.rua && "rua",
    !endereco.bairro && "bairro",
    !endereco.cidade && "cidade",
    !/^[A-Z]{2}$/.test(endereco.uf) && "UF",
  ].filter(Boolean)
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
      destinatario: { nome, documento: documento(o), telefone: telefone(e.phone), endereco },
      itens,
      servico,
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
  }: { agora?: Date; quieto?: boolean; desde?: Date } = {}
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
      const decisao = decidirRegistro(pedido, { desde: valeDesde, agora })
      if (!decisao.registrar) return { resultado: "nada", motivo: decisao.motivo }

      const numero = Number(pedido.display_id ?? 0)
      const referencia = referenciaDoPedido(numero)
      const tentativas = (lerRegistroNoPedido(pedido.metadata)?.tentativas ?? 0) + 1
      const montado = montarPedido(pedido)
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
      await gravar(container, pedidoId, { ...r, erro_ao_tirar: t.motivo })
      return { resultado: "falhou", numero, motivo: t.motivo }
    },
    { timeout: 30 }
  )
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
  }
  const parceiro = parceiroQueRegistra()
  if (!parceiro) return relatorio

  const desde = await registroLigadoDesde(container, parceiro, agora)
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
