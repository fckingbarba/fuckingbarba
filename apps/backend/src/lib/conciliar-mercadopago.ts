import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, PaymentSessionStatus } from "@medusajs/framework/utils"
import { ehDaLoja } from "../modules/mercadopago/aviso"
import {
  clienteDoMercadoPago,
  ENDERECO_PADRAO,
  ErroDoMercadoPago,
  type ClienteDoMercadoPago,
  type PagamentoMP,
} from "../modules/mercadopago/client"
import {
  centavosDe,
  estadoNovo,
  gravar,
  lerEstado,
  traduzir,
  type Traduzido,
} from "../modules/mercadopago/situacao"
import { origemDestaLoja } from "./pagamento/comum"
import {
  cancelarPedido,
  devolverDoPedidoCancelado,
  mensagemDe,
  pedidoPreso,
  registrarPagamento,
  type Relatorio,
  type Sessao,
  type SessaoEncerrada,
} from "./pagamento/conciliacao"
import type { Estado } from "./pagamento/estado"
import { MERCADOPAGO } from "./pagamento/parceiros"

/**
 * A CONCILIAÇÃO DO MERCADO PAGO — o Pix reserva (0140). O que o aviso não
 * resolve, a cada 5 minutos, junto com a do Pagar.me (quem roda as duas é o
 * `conciliarPagamentos`, em `conciliar-pagamentos.ts`, onde estão os porquês
 * de cada regra):
 *
 *   PAGO LÁ, PENDENTE AQUI → registra o pagamento pelo caminho do aviso;
 *   PIX VENCIDO → cancela o Pix lá (se ainda não morreu sozinho) e o pedido
 *     aqui, e o estoque volta — com a folga de sempre, relendo antes;
 *   PIX QUE TERMINOU LÁ (cancelado, recusado) com o pedido aberto → cancela;
 *   PEDIDO CANCELADO COM O PIX ABERTO → cancela o Pix lá: diferente do
 *     Pagar.me, aqui o QR MORRE, e ninguém paga pedido que não existe;
 *   "INCERTO" → procura pela referência e fecha o que achar;
 *   ÓRFÃOS → o Pix cuja sessão sumiu (a pessoa tentou de novo, o processo
 *     caiu no meio): pago é estornado, pendente é cancelado — ou, se a
 *     sessão parou com o pedido criado, a compra é retomada;
 *   ESTORNO QUE NÃO VOLTOU → avisa (o do Mercado Pago responde na hora; o
 *     que ficar "em processamento" é conferido aqui).
 *
 * ┌─ SÓ O QUE É DA LOJA ───────────────────────────────────────────────────┐
 * │ A conta é a mesma das vendas do Mercado Livre. Nada aqui toca num      │
 * │ pagamento que não tenha a referência de uma sessão nossa E a origem    │
 * │ desta instalação (`ehDaLoja`) — os órfãos, principalmente: a listagem  │
 * │ traz tudo o que a conta recebeu.                                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Sem o `MERCADOPAGO_ACCESS_TOKEN`, não faz nada: o Pix reserva está
 * desligado, e isso não é problema.
 */

const PROVEDOR = MERCADOPAGO.id

/** Depois da validade, quanto esperar antes de dar o Pix por perdido — a mesma do Pagar.me. */
const FOLGA_DO_PIX_MS = 10 * 60 * 1000
/** Sem data nenhuma, a validade que o provedor pede (31 minutos, ver `pedido.ts`). */
const VALIDADE_PADRAO_MS = 31 * 60 * 1000

const JANELA_PENDENTES_MS = 7 * 24 * 60 * 60 * 1000
const JANELA_INCERTAS_MS = 2 * 24 * 60 * 60 * 1000
/** A incerta sem Pix nenhum lá depois disto não nasceu. */
const INCERTA_SEM_PIX_MS = 60 * 60 * 1000
/** Órfão, só com mais de 15 minutos, e dos últimos 2 dias — como no Pagar.me. */
const ORFAO_DEPOIS_DE_MS = 15 * 60 * 1000
const DIAS_DE_ORFAOS = 2
/** 10 páginas de 50: 500 pagamentos da conta em 2 dias (as vendas do Mercado Livre contam). */
const PAGINAS_DE_ORFAOS = 10
/** Estorno sem o dinheiro de volta depois disto é caso pra olhar. */
const ESTORNO_SEM_VOLTA_MS = 2 * 60 * 60 * 1000
const JANELA_ESTORNOS_MS = 7 * 24 * 60 * 60 * 1000

export const mercadoPagoConfigurado = () => Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN)

function clienteDaConciliacao(): ClienteDoMercadoPago | null {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN
  return token ? clienteDoMercadoPago(token, process.env.MERCADOPAGO_URL || ENDERECO_PADRAO) : null
}

const CAMPOS = [
  "id",
  "amount",
  "currency_code",
  "status",
  "data",
  "created_at",
  "payment_collection.id",
  "payment_collection.status",
  "payment_collection.order.id",
  "payment_collection.order.status",
  "payment_collection.order.display_id",
]

const nomeDe = (sessao: Sessao) => {
  const pedido = sessao.payment_collection?.order
  return pedido?.display_id ? `#${pedido.display_id}` : sessao.id
}

/**
 * `completa`: os órfãos e os estornos entram só na rodada completa (de 30 em
 * 30 minutos no job; sempre na rota do admin) — ver "A RODADA COMPLETA E A
 * LEVE" no `conciliar-pagamentos.ts`.
 */
export async function conciliarMercadoPago(
  container: MedusaContainer,
  agora: Date,
  relatorio: Relatorio,
  { completa = true }: { completa?: boolean } = {}
) {
  const cliente = clienteDaConciliacao()
  if (!cliente) return
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: pendentes } = await query.graph({
    entity: "payment_session",
    fields: CAMPOS,
    filters: {
      provider_id: PROVEDOR,
      status: PaymentSessionStatus.PENDING_AUTHORIZATION,
      created_at: { $gte: new Date(agora.getTime() - JANELA_PENDENTES_MS) },
    },
  })
  for (const sessao of pendentes as unknown as Sessao[]) {
    relatorio.conferidas++
    try {
      await conciliarPendente(container, cliente, sessao, agora, relatorio)
    } catch (e) {
      relatorio.avisos.push(`${sessao.id}: ${mensagemDe(e)}`)
    }
  }

  const { data: comErro } = await query.graph({
    entity: "payment_session",
    fields: CAMPOS,
    filters: {
      provider_id: PROVEDOR,
      status: PaymentSessionStatus.ERROR,
      created_at: { $gte: new Date(agora.getTime() - JANELA_INCERTAS_MS) },
    },
  })
  for (const sessao of comErro as unknown as Sessao[]) {
    if (lerEstado(sessao.data)?.situacao !== "incerto") continue
    relatorio.conferidas++
    try {
      await conciliarIncerta(container, cliente, sessao, agora, relatorio)
    } catch (e) {
      relatorio.avisos.push(`${sessao.id}: ${mensagemDe(e)}`)
    }
  }

  const { data: encerradas } = await query.graph({
    entity: "payment_session",
    fields: [
      ...CAMPOS,
      "payment_collection.payment_sessions.id",
      "payment_collection.payment_sessions.status",
      "payment_collection.payments.id",
      "payment_collection.payments.canceled_at",
    ],
    filters: {
      provider_id: PROVEDOR,
      status: [PaymentSessionStatus.ERROR, PaymentSessionStatus.CANCELED],
      created_at: { $gte: new Date(agora.getTime() - JANELA_PENDENTES_MS) },
    },
  })
  for (const sessao of encerradas as unknown as SessaoEncerrada[]) {
    if (!pedidoPreso(sessao)) continue
    relatorio.conferidas++
    try {
      await soltarPedidoPreso(container, cliente, sessao, relatorio)
    } catch (e) {
      relatorio.avisos.push(`${sessao.id}: ${mensagemDe(e)}`)
    }
  }

  if (!completa) return
  try {
    await conciliarOrfaos(container, cliente, agora, relatorio)
  } catch (e) {
    relatorio.avisos.push(`órfãos do Mercado Pago: ${mensagemDe(e)}`)
  }

  try {
    await conferirEstornos(container, cliente, agora, relatorio)
  } catch (e) {
    relatorio.avisos.push(`estornos do Mercado Pago: ${mensagemDe(e)}`)
  }
}

/* ── pendente: o Pix esperando ─────────────────────────────────────────────── */

async function conciliarPendente(
  container: MedusaContainer,
  cliente: ClienteDoMercadoPago,
  sessao: Sessao,
  agora: Date,
  relatorio: Relatorio
) {
  const gravado = lerEstado(sessao.data)
  const pedidoMedusa = sessao.payment_collection?.order ?? null
  const nome = nomeDe(sessao)

  // Pela REFERÊNCIA — o id da sessão, lido do banco. O id gravado só vale
  // se o pagamento dele for desta sessão (`buscarDaSessao`).
  const pagamento = await cliente.buscarDaSessao(sessao.id, gravado?.pedido)

  /*
    O MERCADO PAGO NÃO CONHECE A SESSÃO: token de outra conta (teste ×
    produção). Como no Pagar.me, pedido de pé NÃO é cancelado sozinho: vira
    aviso, até alguém olhar. Já cancelado (ou sem pedido), só sai da lista.
  */
  if (!pagamento) {
    if (!pedidoMedusa || pedidoMedusa.status === "canceled") {
      await anotar(
        container,
        sessao,
        { ...(gravado ?? estadoNovo("pix", 0, 1)), situacao: "cancelado" },
        "canceled"
      )
      return
    }
    relatorio.avisos.push(
      `${nome}: o Mercado Pago não tem Pix da sessão ${sessao.id} — token de outra conta ` +
        "(teste × produção)? Nada foi feito; se for pedido de teste, cancele no admin."
    )
    return
  }
  const lido = traduzir(pagamento)

  if (pedidoMedusa?.status === "canceled") {
    await fecharDoCancelado(
      container,
      cliente,
      sessao,
      pagamento,
      lido,
      pedidoMedusa.id,
      nome,
      relatorio
    )
    return
  }

  if (lido.status === PaymentSessionStatus.CAPTURED) {
    await registrarPagamento(container, sessao.id, lido.estado.valor)
    relatorio.pagas.push(nome)
    return
  }

  if (lido.status === PaymentSessionStatus.ERROR || lido.status === PaymentSessionStatus.CANCELED) {
    await cancelarPedido(container, pedidoMedusa?.id)
    await anotar(
      container,
      sessao,
      lido.estado,
      lido.status === PaymentSessionStatus.ERROR ? "error" : "canceled"
    )
    relatorio.canceladas.push(`${nome} (${lido.estado.situacao} no Mercado Pago)`)
    return
  }

  if (venceuOPix(lido.estado, gravado, pagamento, agora)) {
    await cancelarPixVencido(container, cliente, sessao, pagamento, nome, relatorio)
    return
  }
  relatorio.esperando++
}

/**
 * O Pix que passou da validade (com a folga) e continua pendente lá: RELÊ
 * antes (o Pix pago no último minuto existe), cancela lá — o QR morre — e
 * cancela o pedido aqui, e o estoque volta.
 */
async function cancelarPixVencido(
  container: MedusaContainer,
  cliente: ClienteDoMercadoPago,
  sessao: Sessao,
  pagamento: PagamentoMP,
  nome: string,
  relatorio: Relatorio
) {
  const relido = traduzir(await cliente.lerPagamento(pagamento.id))
  if (relido.status === PaymentSessionStatus.CAPTURED) {
    await registrarPagamento(container, sessao.id, relido.estado.valor)
    relatorio.pagas.push(`${nome} (pago no limite)`)
    return
  }
  if (relido.status === PaymentSessionStatus.PENDING_AUTHORIZATION) {
    await cancelarLa(cliente, pagamento.id)
  }
  await cancelarPedido(container, sessao.payment_collection?.order?.id)
  await anotar(container, sessao, { ...relido.estado, situacao: "cancelado" }, "canceled")
  relatorio.canceladas.push(`${nome} (Pix vencido)`)
}

/**
 * O PIX JÁ VENCEU (com a folga)? A validade que o Mercado Pago acabou de
 * dizer; sem ela, a gravada; sem nenhuma, a criação + a validade padrão.
 */
export function venceuOPix(
  lido: Estado,
  gravado: Estado | null,
  pagamento: Pick<PagamentoMP, "date_created">,
  agora: Date
): boolean {
  let expira = Date.parse(lido.pix?.expiraEm || gravado?.pix?.expiraEm || "")
  if (!Number.isFinite(expira)) {
    const nasceu = Date.parse(pagamento.date_created ?? "")
    expira = Number.isFinite(nasceu) ? nasceu + VALIDADE_PADRAO_MS : NaN
  }
  return Number.isFinite(expira) && agora.getTime() > expira + FOLGA_DO_PIX_MS
}

/* ── o pedido cancelado: o Pix aberto morre ────────────────────────────────── */

/**
 * O Pix de um pedido já cancelado — pelo subscriber, na hora do
 * cancelamento, e pela rodada de pendentes, como rede:
 *
 *   PAGO → o pagamento é REGISTRADO no pedido cancelado e DEVOLVIDO PELO
 *     MEDUSA (a mesma regra do Pagar.me: o estorno fica registrado);
 *   PENDENTE → cancela lá: o QR morre, e ninguém paga pedido que não existe;
 *   JÁ FECHADO LÁ → só anota.
 */
async function fecharDoCancelado(
  container: MedusaContainer,
  cliente: ClienteDoMercadoPago,
  sessao: Sessao,
  pagamento: PagamentoMP,
  lido: Traduzido,
  pedidoId: string,
  nome: string,
  relatorio: Relatorio
) {
  if (lido.status === PaymentSessionStatus.CAPTURED && lido.estado.estornado === 0) {
    await registrarPagamento(container, sessao.id, lido.estado.valor)
    relatorio.pagas.push(`${nome} (pago com o pedido já cancelado)`)
    await devolverDoPedidoCancelado(container, pedidoId, relatorio)
    return
  }
  if (lido.status === PaymentSessionStatus.PENDING_AUTHORIZATION) {
    await cancelarLa(cliente, pagamento.id)
    await anotar(container, sessao, { ...lido.estado, situacao: "cancelado" }, "canceled")
    relatorio.canceladas.push(`${nome} (cancelado aqui; o Pix foi cancelado lá)`)
    return
  }
  await anotar(container, sessao, lido.estado, "canceled")
}

/**
 * Fecha no Mercado Pago o que dá num pedido recém-cancelado — é o que o
 * subscriber `pedido-cancelado.ts` chama, pelo `fecharCobrancasDoPedido`.
 */
export async function fecharCobrancasDoMercadoPago(
  container: MedusaContainer,
  pedidoId: string,
  relatorio: Relatorio
) {
  const cliente = clienteDaConciliacao()
  if (!cliente) return

  const { data: pedidos } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "payment_collections.payment_sessions.id",
      "payment_collections.payment_sessions.provider_id",
      "payment_collections.payment_sessions.status",
      "payment_collections.payment_sessions.amount",
      "payment_collections.payment_sessions.currency_code",
      "payment_collections.payment_sessions.data",
      "payment_collections.payment_sessions.created_at",
    ],
    filters: { id: pedidoId },
  })
  const pedido = pedidos[0] as unknown as {
    display_id?: number
    payment_collections?: { payment_sessions?: Sessao[] }[]
  }
  const sessoes = (pedido?.payment_collections ?? [])
    .flatMap((c) => c?.payment_sessions ?? [])
    .filter(
      (s) => s?.provider_id === PROVEDOR && s.status === PaymentSessionStatus.PENDING_AUTHORIZATION
    )

  for (const sessao of sessoes) {
    relatorio.conferidas++
    try {
      const pagamento = await cliente.buscarDaSessao(sessao.id, lerEstado(sessao.data)?.pedido)
      if (!pagamento) continue
      await fecharDoCancelado(
        container,
        cliente,
        sessao,
        pagamento,
        traduzir(pagamento),
        pedidoId,
        `#${pedido?.display_id ?? pedidoId}`,
        relatorio
      )
    } catch (e) {
      relatorio.avisos.push(`${sessao.id}: ${mensagemDe(e)}`)
    }
  }
}

/* ── o pedido preso num Pix que já acabou ──────────────────────────────────── */

/**
 * A sessão terminou recusada ou cancelada fora da conciliação (o "Check
 * status" do admin), e o pedido ficou aberto (`pedidoPreso`). Confere lá: pago
 * de pé com a sessão encerrada aqui é caso pra gente olhar; o resto, cancela.
 */
async function soltarPedidoPreso(
  container: MedusaContainer,
  cliente: ClienteDoMercadoPago,
  sessao: SessaoEncerrada,
  relatorio: Relatorio
) {
  const pedido = sessao.payment_collection!.order!
  const nome = pedido.display_id ? `#${pedido.display_id}` : pedido.id
  const pagamento = await cliente.buscarDaSessao(sessao.id, lerEstado(sessao.data)?.pedido)
  if (pagamento) {
    const lido = traduzir(pagamento)
    if (lido.status === PaymentSessionStatus.CAPTURED) {
      relatorio.avisos.push(
        `${nome}: a sessão ${sessao.id} terminou "${sessao.status}" aqui, e o Mercado Pago diz ` +
          `PAGO (${pagamento.id}) — confira antes de cancelar`
      )
      return
    }
    if (lido.status === PaymentSessionStatus.PENDING_AUTHORIZATION) {
      await cancelarLa(cliente, pagamento.id)
    }
  }
  await cancelarPedido(container, pedido.id)
  relatorio.canceladas.push(
    `${nome} (o Pix terminou ${sessao.status === PaymentSessionStatus.ERROR ? "recusado" : "cancelado"} ` +
      "fora da conciliação)"
  )
}

/* ── incerta: a criação que sumiu no caminho ──────────────────────────────── */

async function conciliarIncerta(
  container: MedusaContainer,
  cliente: ClienteDoMercadoPago,
  sessao: Sessao,
  agora: Date,
  relatorio: Relatorio
) {
  const estado = lerEstado(sessao.data)!
  const pagamento = await cliente.buscarPorReferencia(sessao.id)
  if (!pagamento) {
    if (agora.getTime() - new Date(sessao.created_at).getTime() > INCERTA_SEM_PIX_MS) {
      await anotar(container, sessao, { ...estado, situacao: "falhou" }, "error")
    }
    return
  }
  // Nasceu, e o pedido daqui nunca nasceu (a sessão deu erro): fecha lá.
  const lido = traduzir(pagamento)
  const feito = await fecharLa(cliente, pagamento, lido)
  if (feito !== "nada") {
    ;(feito === "estornou" ? relatorio.estornadas : relatorio.canceladas).push(
      `${pagamento.id} (sessão ${sessao.id}, sem pedido na loja)`
    )
  }
  await anotar(
    container,
    sessao,
    { ...lido.estado, situacao: feito === "estornou" ? "estornado" : "cancelado" },
    "error"
  )
}

/* ── órfãos: o Pix cuja sessão sumiu ──────────────────────────────────────── */

async function conciliarOrfaos(
  container: MedusaContainer,
  cliente: ClienteDoMercadoPago,
  agora: Date,
  relatorio: Relatorio
) {
  const origem = origemDestaLoja()
  const lidos: PagamentoMP[] = []
  let offset = 0
  for (let pagina = 1; pagina <= PAGINAS_DE_ORFAOS; pagina++) {
    const { pagamentos, mais } = await cliente.listarRecentes(DIAS_DE_ORFAOS, offset)
    lidos.push(...pagamentos)
    offset += pagamentos.length
    if (!mais) break
    if (pagina === PAGINAS_DE_ORFAOS) {
      relatorio.avisos.push(
        `órfãos do Mercado Pago: mais de ${lidos.length} pagamentos em ${DIAS_DE_ORFAOS} dias — ` +
          "só os primeiros foram conferidos"
      )
    }
  }

  // Só o que é DA LOJA (a referência de uma sessão e a origem desta
  // instalação) e velho o bastante pra ninguém mais estar cuidando.
  const candidatos = lidos.filter(
    (p) =>
      ehDaLoja(p, origem) && agora.getTime() - Date.parse(p.date_created ?? "") > ORFAO_DEPOIS_DE_MS
  )
  if (!candidatos.length) return

  const { data: sessoes } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "payment_session",
    fields: CAMPOS,
    filters: { id: candidatos.map((p) => String(p.external_reference)) },
  })
  const todas = sessoes as unknown as Sessao[]
  const paradas = new Map(
    todas.filter((s) => s.status === PaymentSessionStatus.PENDING).map((s) => [s.id, s])
  )
  // Tem dono quem tem sessão num estado que alguém acompanha (ver o Pagar.me).
  const comDono = new Set(
    todas.filter((s) => s.status !== PaymentSessionStatus.PENDING).map((s) => s.id)
  )

  for (const pagamento of candidatos) {
    const codigo = String(pagamento.external_reference)
    if (comDono.has(codigo)) continue
    const lido = traduzir(pagamento)
    const parada = paradas.get(codigo)
    const doPedido = parada?.payment_collection?.order
    try {
      if (parada && doPedido?.id && doPedido.status !== "canceled") {
        relatorio.conferidas++
        await retomarAutorizacaoParada(
          container,
          cliente,
          parada,
          pagamento,
          lido,
          agora,
          relatorio
        )
        continue
      }
      const feito = await fecharLa(cliente, pagamento, lido)
      if (feito !== "nada") {
        relatorio.conferidas++
        ;(feito === "estornou" ? relatorio.estornadas : relatorio.canceladas).push(
          `${pagamento.id} (a sessão ${codigo} não existe mais na loja)`
        )
      }
    } catch (e) {
      relatorio.avisos.push(`${pagamento.id}: ${mensagemDe(e)}`)
    }
  }
}

/**
 * A AUTORIZAÇÃO QUE PAROU NO MEIO, com o pedido criado (ver o Pagar.me):
 * pago → registra; ainda valendo → espera; o resto → fecha lá e cancela.
 */
async function retomarAutorizacaoParada(
  container: MedusaContainer,
  cliente: ClienteDoMercadoPago,
  sessao: Sessao,
  pagamento: PagamentoMP,
  lido: Traduzido,
  agora: Date,
  relatorio: Relatorio
) {
  const pedido = sessao.payment_collection!.order!
  const nome = pedido.display_id ? `#${pedido.display_id}` : pedido.id
  if (lido.status === PaymentSessionStatus.CAPTURED && lido.estado.estornado === 0) {
    await registrarPagamento(container, sessao.id, lido.estado.valor)
    relatorio.pagas.push(`${nome} (a autorização tinha parado no meio)`)
    return
  }
  if (
    lido.status === PaymentSessionStatus.PENDING_AUTHORIZATION &&
    !venceuOPix(lido.estado, lerEstado(sessao.data), pagamento, agora)
  ) {
    relatorio.esperando++
    return
  }
  const feito = await fecharLa(cliente, pagamento, lido)
  await cancelarPedido(container, pedido.id)
  await anotar(
    container,
    sessao,
    { ...lido.estado, situacao: feito === "estornou" ? "estornado" : "cancelado" },
    "canceled"
  )
  relatorio.canceladas.push(
    `${nome} (a autorização tinha parado no meio; Pix ` +
      `${feito === "estornou" ? "estornado" : feito === "cancelou" ? "cancelado" : "já fechado"} lá)`
  )
}

/* ── fechar lá ────────────────────────────────────────────────────────────── */

/**
 * Fecha um Pix que não vai virar venda: PAGO → estorna o que ainda não
 * voltou; PENDENTE → cancela (aqui cancela de verdade: o QR morre); o resto
 * já está fechado. O pagamento é o LIDO, nunca um id de outro lugar.
 */
async function fecharLa(
  cliente: ClienteDoMercadoPago,
  pagamento: PagamentoMP,
  lido: Traduzido
): Promise<"estornou" | "cancelou" | "nada"> {
  if (lido.status === PaymentSessionStatus.CAPTURED) {
    const resta = lido.estado.valor - lido.estado.estornado
    if (resta <= 0) return "nada"
    await cliente.estornar(
      pagamento.id,
      resta,
      `orfao-${pagamento.id}-${lido.estado.estornado}-${resta}`
    )
    return "estornou"
  }
  if (lido.status === PaymentSessionStatus.PENDING_AUTHORIZATION) {
    await cancelarLa(cliente, pagamento.id)
    return "cancelou"
  }
  return "nada"
}

/** Cancela o Pix lá. O que já morreu (vencido, cancelado antes) não é erro. */
async function cancelarLa(cliente: ClienteDoMercadoPago, id: string | number) {
  try {
    await cliente.cancelar(id)
  } catch (e) {
    if (e instanceof ErroDoMercadoPago && e.tipo === "validacao") {
      const agora = traduzir(await cliente.lerPagamento(id))
      if (agora.status !== PaymentSessionStatus.PENDING_AUTHORIZATION) return
    }
    throw e
  }
}

/* ── o estorno que não voltou ──────────────────────────────────────────────── */

/**
 * Todo pagamento do Mercado Pago com estorno registrado nos últimos 7 dias:
 * o que o Medusa diz que voltou contra o que o Mercado Pago diz que voltou.
 * O estorno do Pix responde na hora; o que ficou "em processamento" e não
 * voltou em 2 horas vira aviso (o log da conciliação e a Observabilidade).
 */
async function conferirEstornos(
  container: MedusaContainer,
  cliente: ClienteDoMercadoPago,
  agora: Date,
  relatorio: Relatorio
) {
  const recentes = await container
    .resolve(Modules.PAYMENT)
    .listRefunds(
      { created_at: { $gte: new Date(agora.getTime() - JANELA_ESTORNOS_MS).toISOString() } },
      { select: ["id", "payment_id"], take: 500 }
    )
  const ids = [
    ...new Set(recentes.map((r) => (r as unknown as { payment_id?: string }).payment_id)),
  ].filter(Boolean) as string[]
  if (!ids.length) return

  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "payment",
    fields: [
      "id",
      "provider_id",
      "data",
      "refunds.amount",
      "refunds.created_at",
      "payment_collection.order.display_id",
    ],
    filters: { id: ids },
  })
  for (const p of data as unknown as {
    id: string
    provider_id?: string
    data: Record<string, unknown> | null
    refunds?: { amount: unknown; created_at: string | Date }[] | null
    payment_collection?: { order?: { display_id?: number } | null } | null
  }[]) {
    if (p.provider_id !== PROVEDOR || !p.refunds?.length) continue
    const estado = lerEstado(p.data)
    if (!estado?.pedido) continue
    const ultimo = Math.max(...p.refunds.map((r) => new Date(r.created_at).getTime()))
    if (agora.getTime() - ultimo < ESTORNO_SEM_VOLTA_MS) continue

    const pedidoNoMedusa = p.refunds.reduce((s, r) => s + centavosDe(r.amount), 0)
    const la = centavosDe((await cliente.lerPagamento(estado.pedido)).transaction_amount_refunded)
    if (la < pedidoNoMedusa) {
      const nome = `#${p.payment_collection?.order?.display_id ?? p.id}`
      relatorio.avisos.push(
        `${nome}: o Medusa registrou R$ ${(pedidoNoMedusa / 100).toFixed(2)} de estorno e o ` +
          `Mercado Pago devolveu R$ ${(la / 100).toFixed(2)} (${estado.pedido}) — confira no ` +
          "painel do Mercado Pago"
      )
    }
  }
}

/* ── a escrita na sessão ──────────────────────────────────────────────────── */

/** Anota na sessão o que aconteceu, pra ela sair da lista da próxima rodada. */
async function anotar(
  container: MedusaContainer,
  sessao: Sessao,
  estado: Estado,
  status: "canceled" | "error"
) {
  await container.resolve(Modules.PAYMENT).updatePaymentSession({
    id: sessao.id,
    data: { ...(sessao.data ?? {}), ...gravar(estado) },
    amount: sessao.amount as number,
    currency_code: sessao.currency_code,
    status: status === "canceled" ? PaymentSessionStatus.CANCELED : PaymentSessionStatus.ERROR,
  })
}
