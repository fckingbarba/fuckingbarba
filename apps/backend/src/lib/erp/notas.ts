import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ERP } from "../../modules/erp"
import type ErpService from "../../modules/erp/service"
import { lerEstado } from "../../modules/pagarme/situacao"
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
import { emailDaNotaComProblema, emailDaNotaParaCancelar } from "../emails/erp"
import { referenciaDoPedido } from "../envios/parceiro"
import { avisarAEquipe } from "./avisos"
import { acessoAoErp, avisarQuedaSeForAHora, lerConexao } from "./conexao"
import type { Acesso, ErpDaLoja, EstadoDaNota, PedidoParaNota } from "./contrato"
import { erpDaLoja, erpPorId } from "./erps"

/**
 * A NOTA FISCAL DE CADA PEDIDO PAGO — quando, quais e quantas vezes. O
 * formato do ERP mora no tradutor dele; aqui é a regra da loja.
 *
 *   pago ──▶ emitirNotaDoPedido ──▶ ERP ──▶ SEFAZ
 *                                            │
 *                     autorizada ◀───────────┤  (na hora, pelo aviso do ERP,
 *                     │                      │   ou pela varredura)
 *                     ▼                      ▼
 *   `erp.nota_autorizada` → Frenet      rejeitada → e-mail pra equipe
 *
 * QUEM CHAMA: o `payment.captured` (`subscribers/pagamento-capturado.ts`),
 * logo depois do e-mail de confirmação; a varredura (`acompanharNotas`: o
 * job `acompanhar-notas`, de 5 em 5 minutos, e `POST /admin/erp/notas`); e
 * o aviso do ERP, quando uma nota muda lá.
 *
 * ┌─ QUAIS PEDIDOS ────────────────────────────────────────────────────────┐
 * │ Pago, não cancelado, e pago DEPOIS da primeira conexão com o ERP       │
 * │ (`notas_desde`): o pedido pago antes pode já ter nota feita à mão, e   │
 * │ nota em dobro é problema com a Receita. A varredura olha três dias pra │
 * │ trás — é também o tempo que a conexão pode ficar caída sem que pedido  │
 * │ nenhum fique sem nota.                                                 │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * UMA NOTA SÓ: a trava por pedido, o registro (`erp_nota`) lido dentro
 * dela, e os passos do ERP gravados um a um (ver o tradutor). Falha que
 * passa (ERP fora, tempo esgotado) espera cada vez mais pra tentar de novo;
 * falha que não passa (o ERP não tem o produto, falta o CPF) vira e-mail pra
 * equipe, uma vez, e a loja não insiste.
 *
 * ┌─ PEDIDO CANCELADO ─────────────────────────────────────────────────────┐
 * │ Sem nota autorizada, a loja desfaz sozinha o que fez no ERP (apaga a   │
 * │ nota que não foi autorizada, cancela o pedido de venda). Com nota      │
 * │ autorizada, a API não cancela (no Bling, não existe a rota): vai um    │
 * │ e-mail pra equipe dizendo qual nota cancelar e até que horas — 24      │
 * │ horas depois da autorização, em Santa Catarina.                        │
 * └────────────────────────────────────────────────────────────────────────┘
 */

const MINUTO = 60 * 1000
const HORA = 60 * MINUTO
/** Até onde a varredura olha pra trás, pela hora da captura. */
const JANELA_MS = 3 * 24 * HORA
/** Quantos pedidos cada rodada emite — cada um são várias chamadas ao ERP. */
const POR_RODADA = 10
/** O prazo da SEFAZ de Santa Catarina pra cancelar a nota autorizada. */
const PRAZO_DE_CANCELAMENTO_MS = 24 * HORA

/* ── o registro ───────────────────────────────────────────────────────────── */

export type LinhaDaNota = {
  id: string
  pedido_id: string
  erp: string
  referencia: string
  situacao: string
  no_erp: Record<string, unknown> | null
  id_no_erp: string | null
  detalhe: string | null
  numero: string | null
  serie: string | null
  chave: string | null
  valor: number | null
  emitida_em: Date | string | null
  link_danfe: string | null
  tentativas: number
  erro: string | null
  definitivo: boolean
  proxima_em: Date | string | null
  cancelar: boolean
  avisos: Record<string, unknown> | null
}

const servico = (container: MedusaContainer) => container.resolve<ErpService>(ERP)

export async function notaDoPedido(
  container: MedusaContainer,
  pedidoId: string
): Promise<LinhaDaNota | null> {
  const [linha] = await servico(container).listNotas({ pedido_id: pedidoId }, { take: 1 })
  return (linha as LinhaDaNota | undefined) ?? null
}

async function atualizarNota(container: MedusaContainer, id: string, dados: Partial<LinhaDaNota>) {
  await servico(container).updateNotas({ id, ...dados } as never)
}

/** Depois de `tentativas` falhas, quanto esperar: 10 min, 20, 40… até 6 horas. */
export function esperaDaNota(tentativas: number): number {
  return Math.min(10 * MINUTO * 2 ** Math.max(0, tentativas - 1), 6 * HORA)
}

/* ── o pedido, como o Medusa devolve ──────────────────────────────────────── */

export type PedidoLido = {
  id: string
  display_id?: number | null
  status?: string | null
  email?: string | null
  total?: unknown
  shipping_total?: unknown
  items?:
    | ({
        id?: string | null
        variant_sku?: string | null
        title?: string | null
        product_title?: string | null
        variant_title?: string | null
        quantity?: unknown
        unit_price?: unknown
      } | null)[]
    | null
  shipping_address?: EnderecoDoMedusa | null
  billing_address?: EnderecoDoMedusa | null
  payment_collections?:
    | ({
        payments?: ({ captured_at?: unknown } | null)[] | null
        payment_sessions?:
          ({ provider_id?: string | null; data?: Record<string, unknown> | null } | null)[] | null
      } | null)[]
    | null
}

const CAMPOS = [
  "id",
  "display_id",
  "status",
  "email",
  "total",
  "shipping_total",
  "items.id",
  "items.variant_sku",
  "items.title",
  "items.product_title",
  "items.variant_title",
  "items.quantity",
  "items.unit_price",
  "shipping_address.*",
  "billing_address.*",
  "payment_collections.payments.captured_at",
  "payment_collections.payment_sessions.provider_id",
  "payment_collections.payment_sessions.data",
]

async function lerPedido(container: MedusaContainer, id: string): Promise<PedidoLido | null> {
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({ entity: "order", fields: CAMPOS, filters: { id } })
  return (data[0] as unknown as PedidoLido | undefined) ?? null
}

/* ── a decisão, sem efeito nenhum ─────────────────────────────────────────── */

export type DecisaoDaNota =
  | "emitir"
  | "acompanhar"
  | "ja-tem"
  | "cancelado"
  | "nao-pago"
  | "pago-antes"
  | "recusado"
  | "esperando"

export function decidirNota(
  o: Pick<PedidoLido, "status" | "payment_collections">,
  nota: Pick<LinhaDaNota, "situacao" | "definitivo" | "proxima_em"> | null,
  { desde, agora }: { desde: Date; agora: Date }
): DecisaoDaNota {
  if (nota && ["autorizada", "cancelada", "desfeita"].includes(nota.situacao)) return "ja-tem"
  if (nota && ["processando", "rejeitada", "denegada"].includes(nota.situacao)) return "acompanhar"
  if (o.status === "canceled") return "cancelado"
  const capturas = capturasDo(o)
  if (!capturas.length) return "nao-pago"
  if (!nota && !capturas.some((d) => d >= desde)) return "pago-antes"
  if (nota?.definitivo) return "recusado"
  if (nota?.proxima_em && new Date(nota.proxima_em).getTime() > agora.getTime()) return "esperando"
  return "emitir"
}

/* ── o pedido no formato do contrato ──────────────────────────────────────── */

const reais = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

/** O dia, em Brasília: AAAA-MM-DD. */
export const diaEmBrasilia = (d: Date) =>
  d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

const PAGARME = "pp_pagarme_pagarme"

export function montarPedidoParaNota(
  o: PedidoLido,
  agora: Date
): { ok: true; pedido: PedidoParaNota } | { ok: false; motivo: string } {
  const numero = Number(o.display_id ?? 0)
  if (!numero) return { ok: false, motivo: "pedido sem número" }
  const cobranca = o.billing_address ?? o.shipping_address
  const entrega = o.shipping_address ?? o.billing_address
  if (!cobranca || !entrega) return { ok: false, motivo: "pedido sem endereço" }

  const documento = documentoDoPedido(o.billing_address, o.shipping_address)
  if (!documento) return { ok: false, motivo: "o pedido não tem CPF/CNPJ, e a nota precisa" }

  const nome = nomeDoEndereco(cobranca) || nomeDoEndereco(entrega)
  const doCliente = lerEndereco(cobranca)
  const daEntrega = lerEndereco(entrega)
  const nomeDaEntrega = nomeDoEndereco(entrega) || nome
  const falta = [
    ...new Set([...faltaNoEndereco(nome, doCliente), ...faltaNoEndereco(nomeDaEntrega, daEntrega)]),
  ]
  if (falta.length) return { ok: false, motivo: `endereço incompleto (falta ${falta.join(", ")})` }

  const itens: PedidoParaNota["itens"] = []
  for (const i of o.items ?? []) {
    if (!i) continue
    const sku = linha(i.variant_sku)
    const nomeDoItem = linha(i.product_title) || linha(i.title) || "Produto"
    if (!sku)
      return {
        ok: false,
        motivo: `"${nomeDoItem}" não tem SKU, e é por ele que o ERP acha o produto`,
      }
    const variante = linha(i.variant_title)
    itens.push({
      sku,
      nome: variante && variante !== "Único" ? `${nomeDoItem} — ${variante}` : nomeDoItem,
      quantidade: Number(i.quantity ?? 0) || 1,
      precoUnitario: reais(i.unit_price),
    })
  }
  if (!itens.length) return { ok: false, motivo: "pedido sem itens" }

  /*
    O DESCONTO É O QUE FECHA A CONTA: itens a preço de unidade, mais o frete,
    menos o que a pessoa pagou. Assim a soma do pedido no ERP é EXATAMENTE o
    que foi cobrado — cupom, oferta do checkout e o que mais vier, sem somar
    ajuste por ajuste (e sem diferença de centavo na parcela).
  */
  const total = reais(o.total)
  const frete = reais(o.shipping_total)
  const bruto =
    itens.reduce((s, i) => s + Math.round(i.precoUnitario * i.quantidade * 100), 0) / 100
  const desconto = Math.round((bruto + frete - total) * 100) / 100
  if (desconto < 0) {
    return {
      ok: false,
      motivo: `os valores do pedido não fecham (pago R$ ${total}, itens e frete R$ ${bruto + frete})`,
    }
  }

  const sessao = (o.payment_collections ?? [])
    .flatMap((c) => c?.payment_sessions ?? [])
    .find((s) => s?.provider_id === PAGARME)
  const estado = lerEstado(sessao?.data)
  const captura = capturasDo(o).sort((a, b) => a.getTime() - b.getTime())[0] ?? agora

  return {
    ok: true,
    pedido: {
      numero,
      referencia: referenciaDoPedido(numero),
      data: diaEmBrasilia(captura),
      cliente: {
        nome,
        documento,
        email: o.email?.includes("@") ? o.email : null,
        telefone: telefone(cobranca.phone) ?? telefone(entrega.phone),
        endereco: doCliente,
      },
      entrega: { ...daEntrega, nome: nomeDaEntrega },
      itens,
      desconto,
      frete,
      total,
      pagamento:
        estado?.forma === "cartao"
          ? { forma: "cartao", parcelas: estado.parcelas || 1 }
          : estado?.forma === "pix"
            ? { forma: "pix", parcelas: 1 }
            : { forma: "outra", parcelas: 1 },
    },
  }
}

/* ── o que o ERP disse, no registro ───────────────────────────────────────── */

const SITUACAO_DO_REGISTRO: Record<EstadoDaNota["situacao"], string> = {
  pendente: "a-emitir",
  processando: "processando",
  autorizada: "autorizada",
  rejeitada: "rejeitada",
  denegada: "denegada",
  cancelada: "cancelada",
}

type Consequencia = { autorizou: boolean; problema: string | null }

async function aplicarEstado(
  container: MedusaContainer,
  erp: ErpDaLoja,
  linha: LinhaDaNota,
  estado: EstadoDaNota,
  agora: Date
): Promise<Consequencia> {
  const situacao = SITUACAO_DO_REGISTRO[estado.situacao]
  const autorizou = situacao === "autorizada" && linha.situacao !== "autorizada"
  await atualizarNota(container, linha.id, {
    situacao,
    detalhe: estado.detalhe,
    ...(estado.numero ? { numero: estado.numero } : {}),
    ...(estado.serie ? { serie: estado.serie } : {}),
    ...(estado.chave ? { chave: estado.chave } : {}),
    ...(estado.valor !== null ? { valor: Math.round(estado.valor * 100) } : {}),
    ...(estado.linkDanfe ? { link_danfe: estado.linkDanfe } : {}),
    ...(autorizou ? { emitida_em: estado.emitidaEm ? new Date(estado.emitidaEm) : agora } : {}),
    erro: null,
    ...(estado.situacao === "pendente"
      ? {
          tentativas: linha.tentativas + 1,
          proxima_em: new Date(agora.getTime() + esperaDaNota(linha.tentativas + 1)),
        }
      : { proxima_em: null }),
  })
  Object.assign(linha, { situacao, detalhe: estado.detalhe })
  const problema =
    situacao === "rejeitada" || situacao === "denegada"
      ? (estado.detalhe ?? `a nota foi ${situacao}`)
      : null
  if (autorizou) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .info(
        `[erp] nota do ${linha.referencia} autorizada no ${erp.nome}${estado.numero ? ` (nº ${estado.numero})` : ""}`
      )
  }
  return { autorizou, problema }
}

/** Um aviso por motivo e por nota — o registro guarda quais já saíram. */
async function avisarUmaVez(
  container: MedusaContainer,
  linha: LinhaDaNota,
  qual: "problema" | "cancelar",
  montar: (para: string) => import("../email").Email,
  agora: Date
) {
  const avisos = linha.avisos ?? {}
  if (avisos[qual]) return
  const saiu = await avisarAEquipe(container, montar, `nota-${qual}/${linha.pedido_id}`)
  if (saiu) {
    linha.avisos = { ...avisos, [qual]: agora.toISOString() }
    await atualizarNota(container, linha.id, { avisos: linha.avisos })
  }
}

async function numeroDoPedido(container: MedusaContainer, linha: LinhaDaNota) {
  const n = Number(linha.referencia.replace(/\D/g, ""))
  if (n) return n
  const [o] = await container
    .resolve(Modules.ORDER)
    .listOrders({ id: linha.pedido_id }, { select: ["display_id"] })
  return Number(o?.display_id ?? 0)
}

async function avisarProblema(
  container: MedusaContainer,
  erp: ErpDaLoja,
  linha: LinhaDaNota,
  motivo: string,
  acompanha: boolean,
  agora: Date
) {
  const numero = await numeroDoPedido(container, linha)
  await avisarUmaVez(
    container,
    linha,
    "problema",
    (para) =>
      emailDaNotaComProblema(para, {
        erp: erp.nome,
        pedidoId: linha.pedido_id,
        numero,
        motivo,
        acompanha,
      }),
    agora
  )
}

async function avisarCancelamento(
  container: MedusaContainer,
  erp: ErpDaLoja,
  linha: LinhaDaNota,
  agora: Date
) {
  const numero = await numeroDoPedido(container, linha)
  const emitida = linha.emitida_em ? new Date(linha.emitida_em) : null
  await avisarUmaVez(
    container,
    linha,
    "cancelar",
    (para) =>
      emailDaNotaParaCancelar(para, {
        erp: erp.nome,
        pedidoId: linha.pedido_id,
        numero,
        nota: { numero: linha.numero, serie: linha.serie, chave: linha.chave },
        prazo: emitida ? new Date(emitida.getTime() + PRAZO_DE_CANCELAMENTO_MS) : null,
        agora,
      }),
    agora
  )
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .warn(
      `[erp] o ${linha.referencia} foi cancelado com a nota autorizada — cancele a nota no ${erp.nome}`
    )
}

async function soltarAutorizada(container: MedusaContainer, pedidoId: string) {
  await container
    .resolve(Modules.EVENT_BUS)
    .emit({ name: "erp.nota_autorizada", data: { id: pedidoId } })
    .catch(() => undefined)
}

/* ── o que fazer com uma nota que já existe no ERP ────────────────────────── */

/** Pergunta ao ERP como está a nota, e age: autorizou, rejeitou, e o pedido cancelado. */
async function acompanharSobTrava(
  container: MedusaContainer,
  erp: ErpDaLoja,
  acesso: Acesso,
  linha: LinhaDaNota,
  agora: Date
): Promise<Consequencia> {
  const r = await erp.consultarNota(acesso, (linha.no_erp ?? {}) as Record<string, unknown>)
  if (!r.ok) {
    await atualizarNota(container, linha.id, { erro: r.motivo })
    return { autorizou: false, problema: null }
  }
  const c = await aplicarEstado(container, erp, linha, r.nota, agora)
  if (linha.cancelar) {
    await tratarCancelado(container, erp, acesso, linha, agora)
  } else if (c.problema) {
    await avisarProblema(container, erp, linha, c.problema, true, agora)
  }
  return c
}

/** O pedido foi cancelado: desfazer no ERP o que dá, ou avisar pra cancelar lá. */
async function tratarCancelado(
  container: MedusaContainer,
  erp: ErpDaLoja,
  acesso: Acesso | null,
  linha: LinhaDaNota,
  agora: Date
) {
  if (linha.situacao === "autorizada") return avisarCancelamento(container, erp, linha, agora)
  if (
    linha.situacao === "processando" ||
    linha.situacao === "cancelada" ||
    linha.situacao === "desfeita"
  ) {
    return // a varredura volta quando a SEFAZ responder
  }
  if (!acesso) return
  const r = await erp.desfazerNota(acesso, (linha.no_erp ?? {}) as Record<string, unknown>)
  if (r.ok) {
    await atualizarNota(container, linha.id, { situacao: "desfeita", detalhe: r.como, erro: null })
    linha.situacao = "desfeita"
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .info(`[erp] ${linha.referencia} cancelado: ${r.como} no ${erp.nome}`)
    return
  }
  await atualizarNota(container, linha.id, { erro: r.motivo })
  if (r.precisaDeGente) {
    await avisarProblema(
      container,
      erp,
      linha,
      `o pedido foi cancelado, e a loja não conseguiu desfazer no ${erp.nome} (${r.motivo}) — cancele o pedido de venda lá`,
      false,
      agora
    )
  }
}

/* ── um pedido ────────────────────────────────────────────────────────────── */

export type ResultadoDaNota =
  | { resultado: "autorizada"; referencia: string; numero: string | null }
  | { resultado: "processando"; referencia: string }
  | { resultado: "nada"; motivo: string }
  | { resultado: "falhou"; referencia: string; motivo: string; definitivo: boolean }

export async function emitirNotaDoPedido(
  container: MedusaContainer,
  pedidoId: string,
  { agora = new Date(), quieto = false }: { agora?: Date; quieto?: boolean } = {}
): Promise<ResultadoDaNota> {
  const erp = erpDaLoja()
  if (!erp) return { resultado: "nada", motivo: "sem ERP" }
  const conexao = await lerConexao(container, erp)
  const acesso = conexao?.notas_desde ? await acessoAoErp(container, erp) : null
  if (!conexao?.notas_desde || !acesso)
    return { resultado: "nada", motivo: `${erp.nome} desconectado` }
  const desde = new Date(conexao.notas_desde)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  let autorizou = false
  const resultado = await container.resolve(Modules.LOCKING).execute(
    `erp-nota:${pedidoId}`,
    async (): Promise<ResultadoDaNota> => {
      const pedido = await lerPedido(container, pedidoId)
      if (!pedido) return { resultado: "nada", motivo: "pedido não existe" }
      let linha = await notaDoPedido(container, pedidoId)
      const decisao = decidirNota(pedido, linha, { desde, agora })

      if (decisao === "acompanhar" && linha) {
        const c = await acompanharSobTrava(container, erp, acesso, linha, agora)
        autorizou = c.autorizou
        return linha.situacao === "autorizada"
          ? { resultado: "autorizada", referencia: linha.referencia, numero: linha.numero }
          : { resultado: "nada", motivo: `nota ${linha.situacao}` }
      }
      if (decisao !== "emitir") return { resultado: "nada", motivo: decisao }

      const montado = montarPedidoParaNota(pedido, agora)
      const referencia = referenciaDoPedido(Number(pedido.display_id ?? 0))
      linha ??= (await servico(container).createNotas({
        pedido_id: pedidoId,
        erp: erp.id,
        referencia,
        situacao: "a-emitir",
      })) as LinhaDaNota
      const atual = linha

      if (!montado.ok) {
        await atualizarNota(container, atual.id, {
          erro: montado.motivo,
          definitivo: true,
          tentativas: atual.tentativas + 1,
        })
        logger.warn(`[erp] a nota do ${referencia} não sai: ${montado.motivo}`)
        await avisarProblema(container, erp, atual, montado.motivo, false, agora)
        return { resultado: "falhou", referencia, motivo: montado.motivo, definitivo: true }
      }

      const r = await erp.emitirNota(acesso, montado.pedido, atual.no_erp ?? {}, async (passos) => {
        atual.no_erp = passos
        await atualizarNota(container, atual.id, {
          no_erp: passos,
          id_no_erp: erp.idDaNota(passos),
        })
      })

      if (!r.ok) {
        const tentativas = atual.tentativas + 1
        await atualizarNota(container, atual.id, {
          erro: r.motivo,
          definitivo: r.definitivo,
          tentativas,
          proxima_em: r.definitivo ? null : new Date(agora.getTime() + esperaDaNota(tentativas)),
        })
        if (r.definitivo) {
          logger.warn(`[erp] a nota do ${referencia} foi recusada pelo ${erp.nome}: ${r.motivo}`)
          await avisarProblema(container, erp, atual, r.motivo, false, agora)
        } else if (!quieto) {
          logger.warn(
            `[erp] a nota do ${referencia} não saiu agora (${r.motivo}) — a varredura tenta de novo`
          )
        }
        return { resultado: "falhou", referencia, motivo: r.motivo, definitivo: r.definitivo }
      }

      const c = await aplicarEstado(container, erp, atual, r.nota, agora)
      autorizou = c.autorizou
      if (c.problema) await avisarProblema(container, erp, atual, c.problema, true, agora)
      if (atual.situacao === "autorizada")
        return { resultado: "autorizada", referencia, numero: r.nota.numero }
      if (atual.situacao === "processando" || atual.situacao === "a-emitir")
        return { resultado: "processando", referencia }
      return {
        resultado: "falhou",
        referencia,
        motivo: c.problema ?? atual.situacao,
        definitivo: false,
      }
    },
    { timeout: 120 }
  )
  if (autorizou) await soltarAutorizada(container, pedidoId)
  return resultado
}

/** O aviso do ERP: esta nota mudou. */
export async function notaMudouNoErp(
  container: MedusaContainer,
  erp: ErpDaLoja,
  idNoErp: string,
  agora = new Date()
) {
  // O id é único no ERP; se um dia não for, pergunta por cada um — a consulta decide.
  const linhas = await servico(container).listNotas(
    { erp: erp.id, id_no_erp: idNoErp },
    { take: 5, order: { created_at: "DESC" } }
  )
  if (!linhas.length) return
  const acesso = await acessoAoErp(container, erp)
  if (!acesso) return
  for (const linha of linhas) {
    let autorizou = false
    await container.resolve(Modules.LOCKING).execute(
      `erp-nota:${linha.pedido_id}`,
      async () => {
        const atual = await notaDoPedido(container, linha.pedido_id)
        if (atual) {
          autorizou = (await acompanharSobTrava(container, erp, acesso, atual, agora)).autorizou
        }
      },
      { timeout: 120 }
    )
    if (autorizou) await soltarAutorizada(container, linha.pedido_id)
  }
}

/* ── o cancelado ──────────────────────────────────────────────────────────── */

export async function desfazerNotaDoPedido(
  container: MedusaContainer,
  pedidoId: string,
  agora = new Date()
): Promise<void> {
  const inicial = await notaDoPedido(container, pedidoId)
  if (!inicial || inicial.situacao === "desfeita" || inicial.situacao === "cancelada") return
  const erp = erpPorId(inicial.erp)
  if (!erp) return
  const acesso = await acessoAoErp(container, erp)
  await container.resolve(Modules.LOCKING).execute(
    `erp-nota:${pedidoId}`,
    async () => {
      const linha = await notaDoPedido(container, pedidoId)
      if (!linha) return
      if (!linha.cancelar) {
        await atualizarNota(container, linha.id, { cancelar: true })
        linha.cancelar = true
      }
      await tratarCancelado(container, erp, acesso, linha, agora)
    },
    { timeout: 120 }
  )
}

/* ── pra etiqueta da Frenet ───────────────────────────────────────────────── */

export type NotaParaAEtiqueta = {
  /** Esperar a nota antes de mandar o pedido pro painel: ela está vindo. */
  esperar: boolean
  nota: {
    numero: string
    serie: string | null
    chave: string
    valor: number | null
    emitidaEm: string | null
  } | null
}

/**
 * A nota do pedido, pro painel da Frenet (`lib/envios/registro.ts`): a
 * autorizada vai junto do pedido; a que está a caminho segura o pedido até
 * chegar; a que não vai vir (ERP desligado, pedido pago antes de ligar, nota
 * recusada de vez) não segura nada — aí a etiqueta sai como sempre saiu, e
 * a equipe digita a nota feita à mão.
 */
export async function notaParaAEtiqueta(
  container: MedusaContainer,
  pedidoId: string,
  capturas: Date[]
): Promise<NotaParaAEtiqueta> {
  const linha = await notaDoPedido(container, pedidoId)
  if (linha?.situacao === "autorizada" && linha.numero && linha.chave) {
    return {
      esperar: false,
      nota: {
        numero: linha.numero,
        serie: linha.serie,
        chave: linha.chave,
        valor: linha.valor === null ? null : linha.valor / 100,
        emitidaEm: linha.emitida_em ? new Date(linha.emitida_em).toISOString() : null,
      },
    }
  }
  // Sem o ERP conectado, nota nenhuma está vindo — nem a que ficou no meio
  // do caminho antes de ele sair (ou de a conexão cair).
  const erp = erpDaLoja()
  const conexao = erp ? await lerConexao(container, erp) : null
  if (!erp || !conexao?.credenciais || conexao.queda || !conexao.notas_desde) {
    return { esperar: false, nota: null }
  }
  if (linha) {
    const vem =
      linha.erp === erp.id &&
      !linha.definitivo &&
      ["a-emitir", "processando", "rejeitada"].includes(linha.situacao)
    return { esperar: vem, nota: null }
  }
  const desde = new Date(conexao.notas_desde)
  return { esperar: capturas.some((d) => d >= desde), nota: null }
}

/* ── pra tela do admin ────────────────────────────────────────────────────── */

export type Pendencia = {
  pedidoId: string
  referencia: string
  /** "cancelar" (nota autorizada de pedido cancelado), "rejeitada", "denegada" ou "nao-sai". */
  tipo: "cancelar" | "rejeitada" | "denegada" | "nao-sai"
  detalhe: string | null
  /** Até quando a SEFAZ aceita o cancelamento (só no "cancelar"). */
  prazo: string | null
}

/** O que precisa de alguém, dos últimos 7 dias. */
export async function pendenciasDasNotas(
  container: MedusaContainer,
  erp: ErpDaLoja,
  agora = new Date()
): Promise<Pendencia[]> {
  const notas = (await servico(container).listNotas(
    { erp: erp.id, created_at: { $gte: new Date(agora.getTime() - 7 * 24 * HORA) } },
    { take: 500, order: { created_at: "DESC" } }
  )) as LinhaDaNota[]
  return notas.flatMap((n): Pendencia[] => {
    const base = { pedidoId: n.pedido_id, referencia: n.referencia }
    if (n.cancelar && n.situacao === "autorizada") {
      const emitida = n.emitida_em ? new Date(n.emitida_em).getTime() : null
      return [
        {
          ...base,
          tipo: "cancelar",
          detalhe: n.numero ? `NF-e nº ${n.numero}${n.serie ? `, série ${n.serie}` : ""}` : null,
          prazo: emitida ? new Date(emitida + PRAZO_DE_CANCELAMENTO_MS).toISOString() : null,
        },
      ]
    }
    if (n.situacao === "rejeitada" || n.situacao === "denegada") {
      return [{ ...base, tipo: n.situacao, detalhe: n.detalhe, prazo: null }]
    }
    if (n.situacao === "a-emitir" && n.definitivo) {
      return [{ ...base, tipo: "nao-sai", detalhe: n.erro, prazo: null }]
    }
    return []
  })
}

/* ── a varredura ──────────────────────────────────────────────────────────── */

export type RelatorioDasNotas = {
  acompanhadas: number
  autorizadas: string[]
  pendentes: number
  emitidas: string[]
  falharam: string[]
  desfeitas: number
}

export async function acompanharNotas(
  container: MedusaContainer,
  agora = new Date()
): Promise<RelatorioDasNotas> {
  const relatorio: RelatorioDasNotas = {
    acompanhadas: 0,
    autorizadas: [],
    pendentes: 0,
    emitidas: [],
    falharam: [],
    desfeitas: 0,
  }
  const erp = erpDaLoja()
  if (!erp) return relatorio
  const conexao = await lerConexao(container, erp)
  if (conexao?.queda) {
    await avisarQuedaSeForAHora(container, erp, conexao.queda_avisada_em, conexao.queda, agora)
    return relatorio
  }
  if (!conexao?.notas_desde) return relatorio
  const acesso = await acessoAoErp(container, erp)
  if (!acesso) return relatorio
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const semana = new Date(agora.getTime() - 7 * 24 * HORA)

  /* 1. as que estão na SEFAZ, ou esperando alguém corrigir no ERP */
  const abertas = (await servico(container).listNotas(
    {
      erp: erp.id,
      situacao: ["processando", "rejeitada", "denegada"],
      created_at: { $gte: semana },
    },
    { take: 100, order: { updated_at: "ASC" } }
  )) as LinhaDaNota[]
  for (const nota of abertas) {
    relatorio.acompanhadas++
    const r = await emitirNotaDoPedido(container, nota.pedido_id, { agora, quieto: true }).catch(
      (e) => ({
        resultado: "falhou" as const,
        referencia: nota.referencia,
        motivo: e instanceof Error ? e.message : String(e),
        definitivo: false,
      })
    )
    if (r.resultado === "autorizada") relatorio.autorizadas.push(nota.referencia)
  }

  /* 2. o cancelado com o que desfazer no ERP */
  const canceladas = (await servico(container).listNotas(
    {
      erp: erp.id,
      cancelar: true,
      situacao: ["a-emitir", "rejeitada", "denegada"],
      created_at: { $gte: semana },
    },
    { take: 50 }
  )) as LinhaDaNota[]
  for (const nota of canceladas) {
    await desfazerNotaDoPedido(container, nota.pedido_id, agora).catch(() => undefined)
    if ((await notaDoPedido(container, nota.pedido_id))?.situacao === "desfeita")
      relatorio.desfeitas++
  }

  /* 3. os pagos sem nota */
  const inicio = new Date(
    Math.max(new Date(conexao.notas_desde).getTime(), agora.getTime() - JANELA_MS)
  )
  const pagos = await container.resolve(Modules.PAYMENT).listPayments(
    { captured_at: { $gte: inicio.toISOString() } },
    {
      select: ["payment_collection_id", "captured_at"],
      order: { captured_at: "ASC" },
      take: 1000,
    }
  )
  const colecoes = [...new Set(pagos.map((p) => p.payment_collection_id).filter(Boolean))]
  if (colecoes.length) {
    const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "order_payment_collection",
      fields: ["payment_collection_id", "order.id", "order.status"],
      filters: { payment_collection_id: colecoes },
    })
    const pedidos = [
      ...new Set(
        (data as { order?: { id?: string; status?: string } | null }[])
          .filter((l) => l.order?.id && l.order.status !== "canceled")
          .map((l) => l.order!.id!)
      ),
    ]
    const notas = new Map(
      (
        (await servico(container).listNotas(
          { pedido_id: pedidos },
          { take: 5000 }
        )) as LinhaDaNota[]
      ).map((n) => [n.pedido_id, n])
    )
    const aEmitir = pedidos.filter((id) => {
      const n = notas.get(id)
      if (!n) return true
      if (n.situacao !== "a-emitir" || n.definitivo) return false
      return !n.proxima_em || new Date(n.proxima_em).getTime() <= agora.getTime()
    })
    relatorio.pendentes = aEmitir.length
    for (const id of aEmitir.slice(0, POR_RODADA)) {
      const r = await emitirNotaDoPedido(container, id, { agora, quieto: true }).catch((e) => ({
        resultado: "falhou" as const,
        referencia: id,
        motivo: e instanceof Error ? e.message : String(e),
        definitivo: false,
      }))
      if (r.resultado === "autorizada" || r.resultado === "processando")
        relatorio.emitidas.push(r.referencia)
      else if (r.resultado === "falhou") relatorio.falharam.push(`${r.referencia} (${r.motivo})`)
    }
  }

  if (relatorio.falharam.length) {
    logger.warn(
      `[erp] notas: ${relatorio.emitidas.length} emitidas, ${relatorio.falharam.length} não — ` +
        `${relatorio.falharam.slice(0, 3).join("; ")}${relatorio.falharam.length > 3 ? "…" : ""}`
    )
  }
  return relatorio
}
