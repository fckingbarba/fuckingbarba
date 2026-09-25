import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import {
  cancelOrderWorkflow,
  processPaymentWorkflow,
  refundPaymentsWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  clienteDoPagarme,
  emReais,
  ENDERECO_PADRAO,
  ErroDoPagarme,
  origemDestaLoja,
  type ClienteDoPagarme,
  type PedidoPagarme,
} from "../modules/pagarme/client"
import {
  gravar,
  lerEstado,
  podeCobrar,
  reservaPraDesfazer,
  traduzir,
  type Estado,
  type Situacao,
} from "../modules/pagarme/situacao"
import { conferirEstornos, estornoAndando, type RelatorioDeEstornos } from "./estornos"

/**
 * A CONCILIAÇÃO — o que o webhook não resolve.
 *
 * Roda a cada 5 minutos no worker (`src/jobs/conciliar-pagamentos.ts`) e sob
 * demanda pelo admin (`POST /admin/pagamentos/conciliar`). Olha, no Pagar.me,
 * toda sessão que o Medusa ainda acha pendente e põe as duas pontas de
 * acordo:
 *
 *   PAGO LÁ, PENDENTE AQUI → registra o pagamento pelo MESMO caminho do
 *     webhook (`processPaymentWorkflow`). É a rede de proteção do aviso que
 *     não chegou: Edge Function fora, Medusa reiniciando, segredo trocado.
 *
 *   PIX VENCIDO → cancela o pedido aqui, e o estoque volta. Com folga: só
 *     depois de `expires_at` + 10 minutos, e relendo o estado antes, porque
 *     Pix pago no último minuto existe.
 *
 *   CARTÃO APROVADO NA ANÁLISE, AINDA SÓ RESERVADO → cobra, pelo mesmo
 *     caminho do pago: o `processPaymentWorkflow` chama o `authorizePayment`
 *     do provedor, que faz a cobrança (ver "A ANÁLISE ANTES DA COBRANÇA", no
 *     `situacao.ts`). É a rede do aviso `charge.antifraud_approved`.
 *
 *   CARTÃO RECUSADO NA ANÁLISE, PIX QUE FALHOU → cancela o pedido aqui (e
 *     desfaz a reserva do cartão, se o Pagar.me ainda não desfez).
 *
 *   PAGAMENTO QUE TERMINOU POR FORA — recusado ou cancelado sem passar por
 *     aqui (o "Check status" do admin num cartão reprovado) — com o pedido
 *     ainda aberto → cancela o pedido, e o estoque volta (`pedidoPreso`).
 *
 *   PEDIDO CANCELADO NO ADMIN COM PIX AINDA ABERTO → o QR continua vivo (ver
 *     a caixa abaixo): a sessão fica VIGIADA. O que for pago nela é
 *     REGISTRADO no pedido cancelado e devolvido pelo Medusa — nunca estornado
 *     direto lá, onde ninguém confere (ver `fecharDePedidoCancelado`).
 *
 *   PAGO NUM PEDIDO CANCELADO → todo pedido cancelado nos últimos 7 dias é
 *     olhado: pagamento capturado e não devolvido é devolvido pelo
 *     `refundPaymentsWorkflow` — o do QR pago depois, e o que o aviso
 *     registrou no meio do cancelamento.
 *
 *   "INCERTO" — a criação que sumiu no caminho, sem resposta (ver o
 *     `authorizePayment`). A tela prometeu: "se aparecer alguma cobrança,
 *     ela é estornada sozinha". É aqui que essa promessa é cumprida: procura
 *     o pedido pelo código da sessão e, se achar, estorna ou cancela.
 *
 *   ÓRFÃOS — a cobrança cuja sessão SUMIU do Medusa: a pessoa tentou de
 *     novo depois de um "incerto" (e a sessão velha foi apagada), ou o
 *     processo caiu no meio da autorização. Estes só se acham pelo lado do
 *     Pagar.me: a conciliação lista os pedidos das últimas 48 horas e
 *     procura a sessão de cada um no banco. Sem dono, pago é estornado e
 *     pendente é cancelado. É também por isso que o provedor não cancela
 *     nada ao apagar sessão (ver `deletePayment`): aqui a decisão sai só do
 *     banco e do Pagar.me, nunca de um dado que veio de fora. A sessão que
 *     parou no meio COM PEDIDO criado é retomada: paga, vira pagamento do
 *     pedido; se não, o pedido é cancelado (`retomarAutorizacaoParada`).
 *
 *   ESTORNO QUE NÃO ACONTECEU — o Medusa registrou o estorno e o Pagar.me
 *     não fez (o de Pix sai do saldo disponível, e às vezes ele não tem).
 *     Todo estorno dos últimos 7 dias é conferido na cobrança; o que falhou
 *     fica anotado no pedido, avisa quem cuida da loja e, se for do
 *     pagamento inteiro, é pedido de novo de 6 em 6 horas. Ver
 *     `lib/estornos.ts`.
 *
 * ┌─ O PAGAR.ME NÃO CANCELA PIX PENDENTE — e isso desenha o resto ─────────┐
 * │ `DELETE /charges/:id` numa cobrança de Pix esperando pagamento         │
 * │ responde 412: "This charge cannot be canceled because is pending". E   │
 * │ Pix VENCIDO continua `pending` lá: o 412 não passa nunca.              │
 * │                                                                         │
 * │ O #7 ficou um dia "Aguardando Pix" com o estoque preso por causa       │
 * │ disso: o cancelamento do pedido vinha DEPOIS do DELETE, e o DELETE     │
 * │ estourava a cada 5 minutos. Então, regra: NINGUÉM manda DELETE em Pix  │
 * │ pendente — nem aqui, nem o `cancelPayment` do provedor, nem o          │
 * │ subscriber de pedido cancelado.                                        │
 * │                                                                         │
 * │ O que fica no lugar:                                                   │
 * │ • Pix vencido: cancela SÓ o pedido no Medusa. O QR morre sozinho.      │
 * │ • pedido cancelado com o Pix ainda valendo: a sessão continua          │
 * │   `pending_authorization`, VIGIADA. Se a pessoa pagar, o dinheiro      │
 * │   entra num pedido cancelado — e a varredura de "pago depois de        │
 * │   cancelado" devolve.                                                  │
 * │ • cartão pendente (análise) ainda se cancela com DELETE — e a sessão   │
 * │   é marcada "cancelando" antes: se vier 412, ela fica vigiada, e a     │
 * │   análise que aprovar depois não cobra nada (`authorizePayment`).      │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NÃO FALA COM O CLIENTE, SÓ COM O PAGAR.ME E O MEDUSA ─────────────────┐
 * │ E-mail de "seu Pix venceu" é fase 5, com o Resend. O que esta função   │
 * │ garante é que o estoque não fica preso e que nenhum dinheiro fica sem  │
 * │ pedido — o resto é comunicação. O único e-mail que sai daqui é pra     │
 * │ quem cuida da loja: o do estorno que o Pagar.me não fez.               │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A chave é a mesma do provedor, lida do mesmo lugar. Sem ela, não há o que
 * conciliar, e a função diz isso em vez de fingir que conferiu.
 */

export const PROVEDOR = "pp_pagarme_pagarme"

/** Depois de `expires_at`, quanto esperar antes de dar o Pix por perdido. */
const FOLGA_DO_PIX_MS = 10 * 60 * 1000

/** O mesmo padrão do provedor, pra quando nem o Pagar.me disser a validade. */
const PIX_MINUTOS_PADRAO = 30

/**
 * Cartão em análise por mais que isto é caso pra gente olhar: a autorização
 * vence em 5 dias, e aí o Pagar.me solta a reserva e a venda se perde.
 */
const ANALISE_LONGA_MS = 3 * 24 * 60 * 60 * 1000

/** Até onde olhar pra trás. Pendente mais velho que isso é caso pra gente. */
const JANELA_PENDENTES_MS = 7 * 24 * 60 * 60 * 1000
const JANELA_INCERTAS_MS = 2 * 24 * 60 * 60 * 1000

/** "Incerta" sem pedido lá, passado este tempo, é porque nunca nasceu. */
const INCERTA_SEM_PEDIDO_MS = 60 * 60 * 1000

/**
 * Órfão, só com mais de 15 minutos: tempo de sobra pro checkout terminar e
 * pra resposta perdida ser procurada, antes de alguém decidir que o pedido
 * não tem dono. E só das últimas 48 horas, que é o que cabe numa listagem.
 */
const ORFAO_DEPOIS_DE_MS = 15 * 60 * 1000
const JANELA_ORFAOS_MS = 48 * 60 * 60 * 1000

/** Até quando procurar dinheiro que entrou depois de o pedido ser cancelado. */
const JANELA_CANCELADOS_MS = 7 * 24 * 60 * 60 * 1000
/** 20 páginas de 30: 600 pedidos em 48 horas. Passou disso, o log avisa. */
const PAGINAS_DE_ORFAOS = 20

const CODIGO_DE_SESSAO = /^payses_[A-Za-z0-9]+$/

export type Relatorio = {
  conferidas: number
  pagas: string[]
  canceladas: string[]
  estornadas: string[]
  esperando: number
  /** O que a rodada dos estornos viu e fez — ver `lib/estornos.ts`. */
  estornos: Omit<RelatorioDeEstornos, "avisos">
  avisos: string[]
}

const relatorioVazio = (): Relatorio => ({
  conferidas: 0,
  pagas: [],
  canceladas: [],
  estornadas: [],
  esperando: 0,
  estornos: { falharam: [], pedidosDeNovo: [], confirmados: [] },
  avisos: [],
})

type Sessao = {
  id: string
  provider_id?: string
  amount: unknown
  currency_code: string
  status: string
  data: Record<string, unknown> | null
  created_at: string | Date
  payment_collection?: {
    id: string
    status?: string
    order?: { id: string; status?: string; display_id?: number } | null
  } | null
}

export async function conciliarPagamentos(
  container: MedusaContainer,
  { agora = new Date() }: { agora?: Date } = {}
): Promise<Relatorio> {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const relatorio = relatorioVazio()

  const chave = process.env.PAGARME_SECRET_KEY
  if (!chave) {
    relatorio.avisos.push("PAGARME_SECRET_KEY ausente: nada foi conferido")
    return relatorio
  }
  const cliente = clienteDoPagarme(chave, process.env.PAGARME_URL || ENDERECO_PADRAO)

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const campos = [
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

  const { data: pendentes } = await query.graph({
    entity: "payment_session",
    fields: campos,
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
    fields: campos,
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
      ...campos,
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

  try {
    await conciliarOrfaos(container, cliente, agora, relatorio)
  } catch (e) {
    relatorio.avisos.push(`órfãos: ${mensagemDe(e)}`)
  }

  try {
    await devolverPagosDepoisDoCancelamento(container, agora, relatorio)
  } catch (e) {
    relatorio.avisos.push(`pagos depois de cancelados: ${mensagemDe(e)}`)
  }

  // Cada estorno que falha, é pedido de novo ou volta tem a sua linha
  // `[estorno]` no log; o resumo abaixo só leva os avisos.
  try {
    const { avisos, ...estornos } = await conferirEstornos(container, cliente, agora)
    relatorio.estornos = estornos
    relatorio.avisos.push(...avisos.map((a) => `estornos: ${a}`))
  } catch (e) {
    relatorio.avisos.push(`estornos: ${mensagemDe(e)}`)
  }

  const mexeu = relatorio.pagas.length + relatorio.canceladas.length + relatorio.estornadas.length
  if (mexeu || relatorio.avisos.length) {
    logger.info(
      `[conciliação] ${relatorio.conferidas} conferida(s): ` +
        `${relatorio.pagas.length} paga(s), ${relatorio.canceladas.length} cancelada(s), ` +
        `${relatorio.estornadas.length} estornada(s), ${relatorio.esperando} esperando` +
        (relatorio.avisos.length ? ` — avisos: ${relatorio.avisos.join(" | ")}` : "")
    )
  }
  return relatorio
}

/* ── pendente: Pix esperando, cartão em análise ───────────────────────────── */

async function conciliarPendente(
  container: MedusaContainer,
  cliente: ClienteDoPagarme,
  sessao: Sessao,
  agora: Date,
  relatorio: Relatorio
) {
  const estado = lerEstado(sessao.data)
  if (!estado?.pedido) {
    relatorio.avisos.push(`${sessao.id}: pendente sem pedido no Pagar.me`)
    return
  }

  const pedidoMedusa = sessao.payment_collection?.order ?? null
  const nome = pedidoMedusa?.display_id ? `#${pedidoMedusa.display_id}` : sessao.id

  let pedido: PedidoPagarme | null = null
  try {
    pedido = await cliente.lerPedido(estado.pedido)
  } catch (e) {
    if (!(e instanceof ErroDoPagarme && e.tipo === "nao_encontrado")) throw e
  }

  /*
    O PAGAR.ME NÃO CONHECE O PEDIDO. O caso real é a chave trocada: pedidos
    feitos no ensaio com a chave de TESTE não existem na conta de produção.
    Pedido já cancelado aqui (ou que nem chegou a nascer) só sai da lista.
    Pedido de pé NÃO é cancelado sozinho: uma chave de teste esquecida num
    dos dois serviços do Railway faria a conciliação cancelar pedidos de
    verdade. Vira aviso, a cada rodada, até alguém olhar.
  */
  if (!pedido) {
    if (!pedidoMedusa || pedidoMedusa.status === "canceled") {
      await anotar(container, sessao, { ...estado, situacao: "cancelado" }, "canceled")
      return
    }
    relatorio.avisos.push(
      `${nome}: o Pagar.me não conhece ${estado.pedido} — chave de outra conta (teste × ` +
        "produção)? Nada foi feito; se for pedido de teste, cancele no admin."
    )
    return
  }

  // O pedido de lá tem que ser DESTA sessão. O `pedido` gravado foi posto
  // pelo provedor, mas conferir custa uma comparação e fecha a porta.
  if (pedido.code !== sessao.id) {
    relatorio.avisos.push(`${sessao.id}: ${pedido.id} tem o código de outra sessão — ignorado`)
    return
  }
  const lido = traduzir(pedido, estado.forma, estado.parcelas)

  // Pedido cancelado aqui com a cobrança ainda viva lá: fecha lá. Quem
  // costuma chegar antes é o subscriber de pedido cancelado; isto é a rede.
  if (pedidoMedusa?.status === "canceled") {
    await fecharDePedidoCancelado(container, cliente, {
      sessao,
      estado,
      pedido,
      lido,
      pedidoId: pedidoMedusa.id,
      nome,
      agora,
      relatorio,
    })
    return
  }

  if (lido.status === PaymentSessionStatus.CAPTURED) {
    await registrarPagamento(container, sessao.id, Number(pedido.amount))
    relatorio.pagas.push(nome)
    return
  }

  /*
    APROVADO NA ANÁLISE E AINDA NÃO COBRADO (o aviso não chegou): o mesmo
    caminho do pago. Quem cobra é o `authorizePayment` do provedor, chamado
    pelo `processPaymentWorkflow` — e a releitura diz se a cobrança saiu.
  */
  if (podeCobrar(pedido, agora).cobrar) {
    await registrarPagamento(container, sessao.id, Number(pedido.amount))
    const depois = traduzir(await cliente.lerPedido(pedido.id), estado.forma, estado.parcelas)
    if (depois.status === PaymentSessionStatus.CAPTURED) {
      relatorio.pagas.push(`${nome} (cartão cobrado depois da análise)`)
    } else {
      relatorio.avisos.push(`${nome}: aprovado na análise, e a cobrança não saiu (${pedido.id})`)
    }
    return
  }

  if (lido.status === PaymentSessionStatus.ERROR || lido.status === PaymentSessionStatus.CANCELED) {
    await cancelarPedido(container, pedidoMedusa?.id)
    await desfazerReserva(cliente, pedido, nome, relatorio)
    await anotar(container, sessao, lido.estado, lido.status)
    relatorio.canceladas.push(`${nome} (${lido.estado.situacao} no Pagar.me)`)
    return
  }

  // Ainda pendente.
  if (estado.forma === "pix") {
    if (venceuOPix(lido.estado, estado, pedido, agora)) {
      await cancelarPixVencido(container, cliente, sessao, pedido.id, nome, relatorio)
      return
    }
  } else if (agora.getTime() - new Date(sessao.created_at).getTime() > ANALISE_LONGA_MS) {
    relatorio.avisos.push(
      `${nome}: cartão em análise há mais de 3 dias (${pedido.id}) — a reserva vence em 5`
    )
  }
  relatorio.esperando++
}

/**
 * A reserva que a análise reprovou e o Pagar.me ainda não desfez: desfaz (o
 * mesmo `DELETE` do cancelamento, que numa autorização só solta o limite).
 * Não segura o resto: se não der agora, o Pagar.me solta sozinho.
 */
async function desfazerReserva(
  cliente: ClienteDoPagarme,
  pedido: PedidoPagarme,
  nome: string,
  relatorio: Relatorio
) {
  const cobranca = reservaPraDesfazer(pedido)
  if (!cobranca) return
  try {
    await cliente.cancelarCobranca(cobranca)
  } catch (e) {
    relatorio.avisos.push(`${nome}: a reserva reprovada não foi desfeita agora (${mensagemDe(e)})`)
  }
}

/**
 * O PIX VENCEU: CANCELA O PEDIDO, E SÓ.
 *
 * Nada de `DELETE` na cobrança. O Pagar.me não cancela Pix pendente — e Pix
 * vencido continua `pending` lá, então o 412 não passaria nunca. Pedir era
 * exatamente o que prendia o estoque: o erro estourava ANTES do cancelamento
 * do pedido, a cada 5 minutos, pra sempre (foi o #7).
 *
 * O QR morre sozinho na hora que a validade dele acaba; o que a loja precisa
 * é do estoque de volta.
 *
 * E relê antes de cancelar: Pix pago no último minuto existe, e cancelar o
 * pedido de quem acabou de pagar é bem pior do que esperar mais uma rodada.
 */
async function cancelarPixVencido(
  container: MedusaContainer,
  cliente: ClienteDoPagarme,
  sessao: Sessao,
  pedidoId: string,
  nome: string,
  relatorio: Relatorio
) {
  const relido = traduzir(await cliente.lerPedido(pedidoId), "pix")

  if (relido.status === PaymentSessionStatus.CAPTURED) {
    await registrarPagamento(container, sessao.id, relido.estado.valor)
    relatorio.pagas.push(`${nome} (pago no limite)`)
    return
  }
  await cancelarPedido(container, sessao.payment_collection?.order?.id)
  await anotar(container, sessao, { ...relido.estado, situacao: "cancelado" }, "canceled")
  relatorio.canceladas.push(`${nome} (Pix vencido)`)
}

/* ── quando o Pix vence ───────────────────────────────────────────────────── */

/**
 * O PIX JÁ VENCEU (com a folga)? A validade vem em três camadas, da mais
 * confiável pra menos:
 *
 *   1. o `expires_at` que o Pagar.me acabou de dizer, na leitura de agora;
 *   2. o que ficou gravado na sessão quando o QR nasceu;
 *   3. o `created_at` do pedido lá + `PAGARME_PIX_MINUTOS`.
 *
 * As duas primeiras se juntam com `||`, e NÃO com `??`: `expiraEm` nasce
 * STRING VAZIA quando o Pagar.me não manda a data (ver `traduzir`), e o `??`
 * deixaria a vazia passar por cima da que estava gravada — que é justamente
 * o caso em que a terceira camada nunca seria usada.
 *
 * Sem nenhuma das três, o Pix não vence: antes o estoque preso e um pedido
 * na lista do que cancelar um pedido que ainda pode virar venda.
 */
export function venceuOPix(
  lido: Estado,
  gravado: Estado | null,
  pedido: PedidoPagarme,
  agora: Date
) {
  const expira = vencimentoDoPix(lido, gravado, pedido)
  return Number.isFinite(expira) && agora.getTime() > expira + FOLGA_DO_PIX_MS
}

export function vencimentoDoPix(
  lido: Estado,
  gravado: Estado | null,
  pedido: PedidoPagarme
): number {
  const dito = Date.parse(lido.pix?.expiraEm || gravado?.pix?.expiraEm || "")
  if (Number.isFinite(dito)) return dito
  const nasceu = Date.parse(pedido.created_at ?? "")
  return Number.isFinite(nasceu) ? nasceu + minutosDoPix() * 60_000 : NaN
}

/** A mesma validade que o provedor pede ao criar o Pix (ver `service.ts`). */
function minutosDoPix(): number {
  const n = Number(process.env.PAGARME_PIX_MINUTOS)
  return Number.isInteger(n) && n >= 5 ? n : PIX_MINUTOS_PADRAO
}

/* ── o pedido preso num pagamento que já acabou ────────────────────────────── */

/** Uma sessão recusada ou cancelada, com a coleção de pagamento e o pedido dela. */
export type SessaoEncerrada = Omit<Sessao, "payment_collection"> & {
  payment_collection?:
    | (NonNullable<Sessao["payment_collection"]> & {
        payment_sessions?: { id: string; status: string }[] | null
        payments?: { id: string; canceled_at?: string | Date | null }[] | null
      })
    | null
}

/** Sessões que ainda podem virar (ou já viraram) dinheiro. */
const VIVAS = new Set<string>([
  PaymentSessionStatus.PENDING,
  PaymentSessionStatus.PENDING_AUTHORIZATION,
  PaymentSessionStatus.REQUIRES_MORE,
  PaymentSessionStatus.AUTHORIZED,
  PaymentSessionStatus.CAPTURED,
])

/**
 * O PEDIDO QUE FICOU ESPERANDO UM PAGAMENTO QUE JÁ ACABOU.
 *
 * A sessão terminou recusada ou cancelada POR FORA da conciliação — o "Check
 * status" do admin num cartão que a análise reprovou grava a sessão como erro
 * na hora —, e a rodada de pendentes, que só olha sessão pendente, nunca mais
 * passava por ela: o pedido ficava "aguardando" pra sempre, com o estoque
 * reservado e sem e-mail nenhum (24/09).
 *
 * Preso é o pedido AINDA ABERTO, sem pagamento registrado de pé e sem outra
 * sessão viva na mesma coleção. O resto não é com esta rodada: pedido
 * cancelado já soltou o estoque, e pedido com pagamento pagou.
 */
export function pedidoPreso(sessao: SessaoEncerrada): boolean {
  const colecao = sessao.payment_collection
  const pedido = colecao?.order
  if (!pedido?.id || pedido.status !== "pending") return false
  if (
    sessao.status !== PaymentSessionStatus.ERROR &&
    sessao.status !== PaymentSessionStatus.CANCELED
  ) {
    return false
  }
  if ((colecao?.payment_sessions ?? []).some((s) => VIVAS.has(s?.status))) return false
  if ((colecao?.payments ?? []).some((p) => p && !p.canceled_at)) return false
  return true
}

/**
 * Cancela o pedido preso, e o estoque volta (o e-mail de cancelamento sai
 * pelo subscriber). Antes, confere no Pagar.me: dinheiro de pé lá, com a
 * sessão encerrada aqui, é caso pra gente olhar — não se cancela sozinho. E
 * a reserva que a análise reprovou e o Pagar.me não desfez, desfaz.
 */
async function soltarPedidoPreso(
  container: MedusaContainer,
  cliente: ClienteDoPagarme,
  sessao: SessaoEncerrada,
  relatorio: Relatorio
) {
  const pedidoMedusa = sessao.payment_collection!.order!
  const nome = pedidoMedusa.display_id ? `#${pedidoMedusa.display_id}` : pedidoMedusa.id
  const estado = lerEstado(sessao.data)

  if (estado?.pedido) {
    let pedido: PedidoPagarme
    try {
      pedido = await cliente.lerPedido(estado.pedido)
    } catch (e) {
      if (!(e instanceof ErroDoPagarme && e.tipo === "nao_encontrado")) throw e
      relatorio.avisos.push(
        `${nome}: o pedido está aberto e o Pagar.me não conhece ${estado.pedido} — chave de ` +
          "outra conta? Nada foi feito."
      )
      return
    }
    if (traduzir(pedido, estado.forma, estado.parcelas).status === PaymentSessionStatus.CAPTURED) {
      relatorio.avisos.push(
        `${nome}: a sessão ${sessao.id} terminou "${sessao.status}" aqui, e o Pagar.me diz ` +
          `PAGO (${pedido.id}) — confira antes de cancelar`
      )
      return
    }
    await desfazerReserva(cliente, pedido, nome, relatorio)
  }

  await cancelarPedido(container, pedidoMedusa.id)
  relatorio.canceladas.push(
    `${nome} (o pagamento terminou ${sessao.status === PaymentSessionStatus.ERROR ? "recusado" : "cancelado"} ` +
      "fora da conciliação)"
  )
}

/* ── incerta: a criação que sumiu no caminho ──────────────────────────────── */

async function conciliarIncerta(
  container: MedusaContainer,
  cliente: ClienteDoPagarme,
  sessao: Sessao,
  agora: Date,
  relatorio: Relatorio
) {
  const estado = lerEstado(sessao.data)!
  const pedido = await cliente.buscarPorCodigo(sessao.id)

  if (!pedido) {
    if (agora.getTime() - new Date(sessao.created_at).getTime() > INCERTA_SEM_PEDIDO_MS) {
      await anotar(container, sessao, { ...estado, situacao: "falhou" }, "error")
    }
    return
  }

  // Cobrou, e o pedido daqui nunca nasceu (a sessão deu erro): devolve.
  const lido = traduzir(pedido, estado.forma, estado.parcelas)
  const { feito, situacao } = await fecharCobranca(cliente, pedido, lido, agora, estado)
  // Vigiando: a sessão continua "incerta" e a próxima rodada volta nela.
  if (feito === "vigiando") return
  if (feito !== "nada") {
    ;(feito === "estornou" ? relatorio.estornadas : relatorio.canceladas).push(
      `${pedido.id} (sessão ${sessao.id}, sem pedido na loja)`
    )
  }
  await anotar(container, sessao, { ...lido.estado, situacao }, "error")
}

/* ── órfãos: a cobrança cuja sessão sumiu ─────────────────────────────────── */

async function conciliarOrfaos(
  container: MedusaContainer,
  cliente: ClienteDoPagarme,
  agora: Date,
  relatorio: Relatorio
) {
  const origem = origemDestaLoja()
  const desde = new Date(agora.getTime() - JANELA_ORFAOS_MS)

  const lidos: PedidoPagarme[] = []
  for (let pagina = 1; pagina <= PAGINAS_DE_ORFAOS; pagina++) {
    const { pedidos, mais } = await cliente.listarPedidos(desde, pagina)
    lidos.push(...pedidos)
    if (!mais) break
    if (pagina === PAGINAS_DE_ORFAOS) {
      relatorio.avisos.push(
        `órfãos: mais de ${PAGINAS_DE_ORFAOS} páginas de pedidos em 48 horas — só as primeiras foram conferidas`
      )
    }
  }

  // Só pedido desta instalação (ver `origemDestaLoja`), nascido de uma
  // sessão do Medusa, e velho o bastante pra ninguém mais estar cuidando.
  const candidatos = lidos.filter(
    (p) =>
      CODIGO_DE_SESSAO.test(p.code ?? "") &&
      p.metadata?.origem === origem &&
      agora.getTime() - Date.parse(p.created_at ?? "") > ORFAO_DEPOIS_DE_MS
  )
  if (!candidatos.length) return

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: sessoes } = await query.graph({
    entity: "payment_session",
    fields: [
      "id",
      "status",
      "amount",
      "currency_code",
      "data",
      "created_at",
      "payment_collection.id",
      "payment_collection.order.id",
      "payment_collection.order.status",
      "payment_collection.order.display_id",
    ],
    filters: { id: candidatos.map((p) => p.code as string) },
  })
  const paradas = new Map(
    (sessoes as unknown as Sessao[])
      .filter((s) => s.status === PaymentSessionStatus.PENDING)
      .map((s) => [s.id, s])
  )
  /*
    Tem dono quem tem sessão num estado que alguém acompanha: pendente de
    autorização (a rodada de pendentes), autorizada/capturada (pago e
    registrado), cancelada (já resolvida) ou com erro (a das incertas, e as
    recusadas, que não têm o que fechar). Sessão que ficou em `pending` é a
    autorização que nunca terminou — órfã, como a que sumiu.
  */
  const comDono = new Set(
    (sessoes as { id: string; status: string }[])
      .filter((s) => s.status !== PaymentSessionStatus.PENDING)
      .map((s) => s.id)
  )

  /*
    Órfão não tem sessão onde anotar o que foi feito: a próxima rodada o acha
    de novo, já estornado ou cancelado. Por isso o relatório só conta o que
    esta rodada FEZ — senão o mesmo estorno apareceria no log a cada 5
    minutos, por 48 horas.
  */
  for (const pedido of candidatos) {
    if (comDono.has(pedido.code as string)) continue
    relatorio.conferidas++
    const metodo = String(pedido.charges?.[0]?.payment_method ?? "").toLowerCase()
    const lido = traduzir(pedido, metodo === "pix" ? "pix" : "cartao")
    const parada = paradas.get(pedido.code as string)
    const doPedido = parada?.payment_collection?.order
    if (parada && doPedido?.id && doPedido.status !== "canceled") {
      try {
        await retomarAutorizacaoParada(container, cliente, parada, pedido, lido, agora, relatorio)
      } catch (e) {
        relatorio.avisos.push(`${pedido.id}: ${mensagemDe(e)}`)
      }
      continue
    }
    try {
      const { feito } = await fecharCobranca(cliente, pedido, lido, agora)
      if (feito === "estornou" || feito === "cancelou") {
        ;(feito === "estornou" ? relatorio.estornadas : relatorio.canceladas).push(
          `${pedido.id} (a sessão ${pedido.code} não existe mais na loja)`
        )
      }
    } catch (e) {
      relatorio.avisos.push(`${pedido.id}: ${mensagemDe(e)}`)
    }
  }
}

/**
 * A AUTORIZAÇÃO QUE PAROU NO MEIO, com o pedido já criado: o processo caiu
 * (deploy, memória) depois de o Pagar.me responder e antes de o Medusa gravar.
 * A sessão ficou `pending`, que nenhuma rodada olha, e o pedido, aberto e com
 * o estoque reservado. Até 24/09 a cobrança era fechada lá, como órfã, e o
 * pedido ficava aqui, aguardando pra sempre.
 *
 *   PAGO → registra no pedido, pelo mesmo caminho do aviso: a compra valeu.
 *   AINDA VALENDO (o Pix no prazo) → espera; se for pago, cai no caso acima.
 *   O RESTO → fecha a cobrança lá, como órfã, e cancela o pedido aqui.
 */
async function retomarAutorizacaoParada(
  container: MedusaContainer,
  cliente: ClienteDoPagarme,
  sessao: Sessao,
  pedido: PedidoPagarme,
  lido: ReturnType<typeof traduzir>,
  agora: Date,
  relatorio: Relatorio
) {
  const pedidoMedusa = sessao.payment_collection!.order!
  const nome = pedidoMedusa.display_id ? `#${pedidoMedusa.display_id}` : pedidoMedusa.id
  if (
    lido.status === PaymentSessionStatus.CAPTURED &&
    !estornoAndando(pedido.charges?.[0] ?? {}) &&
    lido.estado.estornado === 0
  ) {
    await registrarPagamento(container, sessao.id, Number(pedido.amount))
    relatorio.pagas.push(`${nome} (a autorização tinha parado no meio)`)
    return
  }
  const { feito, situacao } = await fecharCobranca(
    cliente,
    pedido,
    lido,
    agora,
    lerEstado(sessao.data)
  )
  if (feito === "vigiando") {
    relatorio.esperando++
    return
  }
  await cancelarPedido(container, pedidoMedusa.id)
  await anotar(container, sessao, { ...lido.estado, situacao }, "canceled")
  relatorio.canceladas.push(
    `${nome} (a autorização tinha parado no meio; cobrança ` +
      `${feito === "estornou" ? "estornada" : feito === "cancelou" ? "cancelada" : "sem nada a fechar"} lá)`
  )
}

/* ── pago depois de cancelado ─────────────────────────────────────────────── */

/**
 * O DINHEIRO QUE ENTROU NUM PEDIDO QUE NÃO EXISTE MAIS.
 *
 * É a outra ponta do QR que não morre: cancelar o pedido não cancela o Pix
 * pendente lá (412), então a pessoa ainda pode pagar — e paga, porque o QR
 * está no WhatsApp dela desde ontem. O pagamento entra pela sessão vigiada,
 * o webhook (ou a conciliação) registra, e o dinheiro fica num pedido
 * cancelado.
 *
 * Esta varredura olha todo pedido cancelado dos últimos 7 dias e devolve,
 * pelo Medusa, o que estiver capturado e não devolvido — ver
 * `devolverDoCancelado`.
 *
 * ┌─ `refundPaymentsWorkflow`, no PLURAL ──────────────────────────────────┐
 * │ O singular (`refundPaymentWorkflow`) valida o pedido antes e recusa:   │
 * │ "Order … has been canceled" — exatamente o caso que estamos            │
 * │ resolvendo. O plural trabalha no pagamento, e não no pedido, e passa.  │
 * └────────────────────────────────────────────────────────────────────────┘
 */
async function devolverPagosDepoisDoCancelamento(
  container: MedusaContainer,
  agora: Date,
  relatorio: Relatorio
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: pedidos } = await query.graph({
    entity: "order",
    fields: CAMPOS_DO_CANCELADO,
    filters: {
      status: "canceled",
      canceled_at: { $gte: new Date(agora.getTime() - JANELA_CANCELADOS_MS) },
    },
  })
  for (const pedido of pedidos as unknown as Cancelado[]) {
    await devolverDoCancelado(container, pedido, relatorio)
  }
}

/** O mesmo, pra um pedido só: o dinheiro registrado agora num pedido cancelado. */
async function devolverDoPedidoCancelado(
  container: MedusaContainer,
  pedidoId: string,
  relatorio: Relatorio
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: CAMPOS_DO_CANCELADO,
    filters: { id: pedidoId, status: "canceled" },
  })
  const pedido = data[0] as unknown as Cancelado | undefined
  if (pedido) await devolverDoCancelado(container, pedido, relatorio)
}

const CAMPOS_DO_CANCELADO = [
  "id",
  "display_id",
  "canceled_at",
  "payment_collections.payments.id",
  "payment_collections.payments.provider_id",
  "payment_collections.payments.amount",
  "payment_collections.payments.captured_at",
  "payment_collections.payments.refunds.amount",
]

type PagamentoDoCancelado = {
  id: string
  provider_id?: string
  amount: unknown
  captured_at?: string | null
  refunds?: { amount: unknown }[]
}
type Cancelado = {
  id: string
  display_id?: number
  canceled_at?: string | null
  payment_collections?: { payments?: PagamentoDoCancelado[] }[]
}

/**
 * Devolve, pelo Medusa, todo pagamento do Pagar.me CAPTURADO e ainda não
 * devolvido de um pedido cancelado — capturado quando for.
 *
 * O cancelamento do Medusa estorna tudo o que vê pago
 * (`refundCapturedPaymentsWorkflow`), então o que sobra só pode ter entrado
 * DEPOIS dele (o QR pago depois) ou NO MEIO dele: o aviso registrando o Pix
 * enquanto o cancelamento rodava — ele lê os pagamentos no começo e grava o
 * `canceled_at` no fim. Até 24/09 só o capturado depois do `canceled_at`
 * voltava; o do meio ficava com a loja, e o e-mail dizia "estornado".
 */
async function devolverDoCancelado(
  container: MedusaContainer,
  pedido: Cancelado,
  relatorio: Relatorio
) {
  const cancelado = Date.parse(pedido.canceled_at ?? "")
  const nome = `#${pedido.display_id ?? pedido.id}`

  for (const pagamento of (pedido.payment_collections ?? []).flatMap((c) => c?.payments ?? [])) {
    if (pagamento.provider_id !== PROVEDOR) continue
    const capturado = Date.parse(pagamento.captured_at ?? "")
    if (!Number.isFinite(capturado)) continue

    const devolvido = (pagamento.refunds ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
    const resta = Number(pagamento.amount) - devolvido
    if (!(resta > 0)) continue

    const quando =
      Number.isFinite(cancelado) && capturado <= cancelado
        ? "pago no meio do cancelamento"
        : "pago depois de o pedido ser cancelado"
    relatorio.conferidas++
    try {
      await refundPaymentsWorkflow(container).run({
        input: [{ payment_id: pagamento.id, amount: resta, note: quando }],
      })
      relatorio.estornadas.push(`${nome} (${quando})`)
    } catch (e) {
      relatorio.avisos.push(`${nome}: ${quando}, e o estorno ${mensagemDe(e)}`)
    }
  }
}

/* ── pedido cancelado no admin ────────────────────────────────────────────── */

/**
 * Fecha no Pagar.me o que dá pra fechar num pedido recém-cancelado: o que já
 * tinha sido pago (e o Medusa não sabia) é estornado, e o cartão em análise é
 * cancelado. O subscriber `pedido-cancelado.ts` chama isto no instante do
 * cancelamento; a rodada de pendentes é a rede.
 *
 * O PIX ESPERANDO NÃO SE FECHA — o Pagar.me responde 412 (ver a caixa no
 * começo do arquivo). O QR continua pagável até vencer, e a sessão fica
 * VIGIADA: o que entrar nela vai pro pedido cancelado, e a varredura de
 * pagos depois de cancelados devolve o dinheiro.
 *
 * A cobrança é achada pelo CÓDIGO (o id da sessão, lido do banco), e não
 * pelo que está nos dados dela.
 */
export async function fecharCobrancasDoPedido(
  container: MedusaContainer,
  pedidoId: string,
  { agora = new Date() }: { agora?: Date } = {}
): Promise<Relatorio> {
  const relatorio = relatorioVazio()
  const chave = process.env.PAGARME_SECRET_KEY
  if (!chave) return relatorio
  const cliente = clienteDoPagarme(chave, process.env.PAGARME_URL || ENDERECO_PADRAO)

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: pedidos } = await query.graph({
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
  const pedidoMedusa = pedidos[0] as unknown as {
    display_id?: number
    payment_collections?: { payment_sessions?: Sessao[] }[]
  }
  const sessoes = (pedidoMedusa?.payment_collections ?? [])
    .flatMap((c) => c?.payment_sessions ?? [])
    .filter(
      (s) => s?.provider_id === PROVEDOR && s.status === PaymentSessionStatus.PENDING_AUTHORIZATION
    )

  for (const sessao of sessoes) {
    relatorio.conferidas++
    try {
      const estado = lerEstado(sessao.data)
      const pedido = await cliente.buscarPorCodigo(sessao.id)
      if (!estado || !pedido) continue
      await fecharDePedidoCancelado(container, cliente, {
        sessao,
        estado,
        pedido,
        lido: traduzir(pedido, estado.forma, estado.parcelas),
        pedidoId,
        nome: `#${pedidoMedusa?.display_id ?? pedidoId}`,
        agora,
        relatorio,
      })
    } catch (e) {
      relatorio.avisos.push(`${sessao.id}: ${mensagemDe(e)}`)
    }
  }
  return relatorio
}

/**
 * A COBRANÇA DE UM PEDIDO JÁ CANCELADO — pelo subscriber, na hora do
 * cancelamento, e pela rodada de pendentes, como rede.
 *
 *   PAGA → o pagamento é REGISTRADO no pedido cancelado, pelo mesmo caminho do
 *     aviso, e DEVOLVIDO PELO MEDUSA (`devolverDoPedidoCancelado`). Até 24/09 o
 *     estorno saía direto no Pagar.me e não ficava em lugar nenhum: se ele
 *     falhasse (o Pix recém-pago, que ainda não está no saldo — foi o #6), o
 *     dinheiro ficava com a loja sem faixa no admin, sem e-mail e sem nova
 *     tentativa. Registrado, ele é conferido como qualquer outro estorno
 *     (`lib/estornos.ts`). Com estorno andando lá, ou dinheiro já devolvido
 *     por fora, NÃO registra — o Medusa pediria de novo o que já voltou —, e
 *     segue o caminho de antes (`fecharCobranca`).
 *
 *   CARTÃO PENDENTE → a sessão é marcada "cancelando" ANTES do `DELETE`: se
 *     ele não passar agora (412, rede), a análise que aprovar depois não cobra
 *     nada (ver o `authorizePayment`), e a rodada seguinte tenta de novo.
 *
 *   PIX PENDENTE → vigia, como sempre: lá não se cancela (412), e o que for
 *     pago cai no primeiro caso.
 */
async function fecharDePedidoCancelado(
  container: MedusaContainer,
  cliente: ClienteDoPagarme,
  {
    sessao,
    estado,
    pedido,
    lido,
    pedidoId,
    nome,
    agora,
    relatorio,
  }: {
    sessao: Sessao
    estado: Estado
    pedido: PedidoPagarme
    lido: ReturnType<typeof traduzir>
    pedidoId: string
    nome: string
    agora: Date
    relatorio: Relatorio
  }
) {
  if (
    lido.status === PaymentSessionStatus.CAPTURED &&
    !estornoAndando(pedido.charges?.[0] ?? {}) &&
    lido.estado.estornado === 0
  ) {
    await registrarPagamento(container, sessao.id, Number(pedido.amount))
    relatorio.pagas.push(`${nome} (pago com o pedido já cancelado)`)
    await devolverDoPedidoCancelado(container, pedidoId, relatorio)
    return
  }

  if (
    estado.forma === "cartao" &&
    lido.status === PaymentSessionStatus.PENDING_AUTHORIZATION &&
    estado.situacao !== "cancelando"
  ) {
    await anotar(container, sessao, { ...lido.estado, situacao: "cancelando" }, "pendente")
  }

  const { feito, situacao } = await fecharCobranca(cliente, pedido, lido, agora, estado)
  /*
    VIGIANDO: o Pix ainda vale (não se cancela lá), o 412 disse "ainda não",
    ou há estorno andando. A sessão fica pendente pra próxima rodada olhar.
  */
  if (feito === "vigiando") {
    relatorio.esperando++
    return
  }
  await anotar(container, sessao, { ...lido.estado, situacao }, "canceled")
  if (feito !== "nada") {
    ;(feito === "estornou" ? relatorio.estornadas : relatorio.canceladas).push(
      `${nome} (cancelado aqui; cobrança ${feito === "estornou" ? "estornada" : "cancelada"} lá)`
    )
  }
}

/**
 * O QUE ESTA PASSADA FEZ COM A COBRANÇA.
 *
 *   `estornou`  — o dinheiro voltou (ou o Pagar.me aceitou devolver);
 *   `cancelou`  — a cobrança foi cancelada lá, e não vira mais venda;
 *   `vigiando`  — não dava pra mexer AGORA, e não é erro: o Pix ainda vale,
 *                 o 412 disse que não, ou já há um estorno andando. Quem
 *                 chamou deixa a sessão como está, pendente, e a próxima
 *                 rodada volta nela;
 *   `nada`      — não havia o que fazer: já estava fechada, já tinha voltado
 *                 tudo, ou é um Pix pendente que já venceu (e que lá não se
 *                 cancela de jeito nenhum).
 *
 * A diferença entre `vigiando` e `nada` é a única que importa pra quem
 * chama: `nada` fecha a sessão; `vigiando`, não.
 */
export type Fecho = "estornou" | "cancelou" | "vigiando" | "nada"

/**
 * Fecha uma cobrança que não vai mais virar venda, no que der:
 *
 *   PAGA → estorna o que ainda não voltou. NUNCA por cima de um estorno
 *     andando (`pending_cancellation`): dois pedidos de estorno na mesma
 *     cobrança devolvem o dinheiro duas vezes. Nesse caso, vigia.
 *
 *   PIX PENDENTE → NÃO MANDA DELETE. O Pagar.me responde 412, vencido ou
 *     não. Enquanto o QR vale, vigia; depois de vencido, não há mais nada a
 *     fechar lá — só anotar aqui.
 *
 *   CARTÃO PENDENTE (análise, com o valor só reservado — mesmo já aprovado
 *     e ainda não cobrado) → esse o DELETE cancela, e a reserva é desfeita
 *     sem nada entrar na fatura. E se vier 412 assim mesmo, é o Pagar.me
 *     dizendo "ainda não": vigia.
 *
 * A cobrança é a do pedido LIDO, nunca um id que veio de outro lugar. O
 * `gravado` é o estado da sessão, e serve só pra saber quando o Pix vence.
 */
export async function fecharCobranca(
  cliente: ClienteDoPagarme,
  pedido: PedidoPagarme,
  lido: ReturnType<typeof traduzir>,
  agora: Date,
  gravado: Estado | null = null
): Promise<{ feito: Fecho; situacao: Situacao }> {
  const cobranca = lido.estado.cobranca
  if (!cobranca) return { feito: "nada", situacao: lido.estado.situacao }

  if (lido.status === PaymentSessionStatus.CAPTURED) {
    if (estornoAndando(pedido.charges?.[0] ?? {})) {
      return { feito: "vigiando", situacao: lido.estado.situacao }
    }
    const resta = Number(pedido.amount) - lido.estado.estornado
    if (resta <= 0) return { feito: "nada", situacao: "estornado" }
    await cliente.cancelarCobranca(cobranca, resta)
    return { feito: "estornou", situacao: "estornado" }
  }

  if (lido.status === PaymentSessionStatus.PENDING_AUTHORIZATION) {
    if (lido.estado.forma === "pix") {
      return venceuOPix(lido.estado, gravado, pedido, agora)
        ? { feito: "nada", situacao: "cancelado" }
        : { feito: "vigiando", situacao: lido.estado.situacao }
    }
    try {
      await cliente.cancelarCobranca(cobranca)
      return { feito: "cancelou", situacao: "cancelado" }
    } catch (e) {
      if (e instanceof ErroDoPagarme && e.status === 412) {
        return { feito: "vigiando", situacao: lido.estado.situacao }
      }
      throw e
    }
  }

  return { feito: "nada", situacao: lido.estado.situacao }
}

/* ── as três escritas ─────────────────────────────────────────────────────── */

/**
 * O pagamento pelo MESMO caminho do webhook — é ele que cria o registro do
 * pagamento, a transação do pedido e o evento `payment.captured` que o worker
 * vai usar pra nota fiscal e conversão. Registrar "na mão" pularia os três.
 */
async function registrarPagamento(container: MedusaContainer, sessaoId: string, centavos: number) {
  await processPaymentWorkflow(container).run({
    input: {
      action: PaymentActions.SUCCESSFUL,
      data: { session_id: sessaoId, amount: emReais(centavos) },
    },
  })
}

/**
 * A MENSAGEM DE UM ERRO QUALQUER.
 *
 * Os workflows do Medusa não jogam `Error`: jogam um objeto com `message`
 * (e `type`, e `code`). Com `e instanceof Error ? … : String(e)`, esse
 * objeto virava "[object Object]" no log — e, pior, o `cancelarPedido`
 * abaixo deixava de reconhecer o "has been canceled" e subia um erro por
 * um pedido que já estava cancelado.
 */
function mensagemDe(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message)
  }
  return String(e)
}

/**
 * Cancela o pedido e devolve o estoque. Pedido JÁ cancelado não é erro (o
 * admin pode ter chegado antes); qualquer outra recusa é, e sobe — "tem
 * envio criado" num pedido que ninguém pagou é coisa pra gente ver.
 */
async function cancelarPedido(container: MedusaContainer, pedidoId: string | undefined) {
  if (!pedidoId) return
  try {
    await cancelOrderWorkflow(container).run({ input: { order_id: pedidoId } })
  } catch (e) {
    if (!/has been canceled/i.test(mensagemDe(e))) throw e
  }
}

/**
 * Anota na sessão o que aconteceu, pra ela sair da lista da próxima rodada.
 * Sem isto, um Pix vencido seria conferido a cada 5 minutos por uma semana.
 */
async function anotar(
  container: MedusaContainer,
  sessao: Sessao,
  estado: Estado,
  status: "canceled" | "error" | "pendente"
) {
  const pagamento = container.resolve(Modules.PAYMENT)
  await pagamento.updatePaymentSession({
    id: sessao.id,
    data: { ...(sessao.data ?? {}), ...gravar(estado) },
    amount: sessao.amount as number,
    currency_code: sessao.currency_code,
    status:
      status === "canceled"
        ? PaymentSessionStatus.CANCELED
        : status === "error"
          ? PaymentSessionStatus.ERROR
          : PaymentSessionStatus.PENDING_AUTHORIZATION,
  })
}
