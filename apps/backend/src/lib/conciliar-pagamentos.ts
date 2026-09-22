import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import { cancelOrderWorkflow, processPaymentWorkflow } from "@medusajs/medusa/core-flows"
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
  traduzir,
  type Estado,
  type Situacao,
} from "../modules/pagarme/situacao"
import { conferirEstornos, type RelatorioDeEstornos } from "./estornos"

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
 *   PIX VENCIDO → cancela a cobrança lá (o QR morre) e o pedido aqui (o
 *     estoque volta). Com folga: só depois de `expires_at` + 10 minutos, e
 *     relendo o estado antes, porque Pix pago no último minuto existe.
 *
 *   CARTÃO RECUSADO NA ANÁLISE, PIX QUE FALHOU → cancela o pedido aqui.
 *
 *   PEDIDO CANCELADO NO ADMIN COM PIX AINDA ABERTO → cancela o Pix lá. Sem
 *     isso, o QR continuaria pagável pra um pedido que não existe mais.
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
 *     banco e do Pagar.me, nunca de um dado que veio de fora.
 *
 *   ESTORNO QUE NÃO ACONTECEU — o Medusa registrou o estorno e o Pagar.me
 *     não fez (o de Pix sai do saldo disponível, e às vezes ele não tem).
 *     Todo estorno dos últimos 7 dias é conferido na cobrança; o que falhou
 *     fica anotado no pedido, avisa quem cuida da loja e, se for do
 *     pagamento inteiro, é pedido de novo de 6 em 6 horas. Ver
 *     `lib/estornos.ts`.
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

/** Cartão em análise por mais que isto é caso pra gente olhar. */
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
      relatorio.avisos.push(`${sessao.id}: ${e instanceof Error ? e.message : String(e)}`)
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
      relatorio.avisos.push(`${sessao.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  try {
    await conciliarOrfaos(container, cliente, agora, relatorio)
  } catch (e) {
    relatorio.avisos.push(`órfãos: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Cada estorno que falha, é pedido de novo ou volta tem a sua linha
  // `[estorno]` no log; o resumo abaixo só leva os avisos.
  try {
    const { avisos, ...estornos } = await conferirEstornos(container, cliente, agora)
    relatorio.estornos = estornos
    relatorio.avisos.push(...avisos.map((a) => `estornos: ${a}`))
  } catch (e) {
    relatorio.avisos.push(`estornos: ${e instanceof Error ? e.message : String(e)}`)
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
    const { situacao, agiu } = await fecharCobranca(cliente, pedido, lido)
    await anotar(container, sessao, { ...lido.estado, situacao }, "canceled")
    if (agiu) {
      ;(situacao === "estornado" ? relatorio.estornadas : relatorio.canceladas).push(
        `${nome} (cancelado aqui; cobrança ${situacao === "estornado" ? "estornada" : "cancelada"} lá)`
      )
    }
    return
  }

  if (lido.status === PaymentSessionStatus.CAPTURED) {
    await registrarPagamento(container, sessao.id, Number(pedido.amount))
    relatorio.pagas.push(nome)
    return
  }

  if (lido.status === PaymentSessionStatus.ERROR || lido.status === PaymentSessionStatus.CANCELED) {
    await cancelarPedido(container, pedidoMedusa?.id)
    await anotar(container, sessao, lido.estado, lido.status)
    relatorio.canceladas.push(`${nome} (${lido.estado.situacao} no Pagar.me)`)
    return
  }

  // Ainda pendente.
  if (estado.forma === "pix") {
    const expira = Date.parse(lido.estado.pix?.expiraEm ?? estado.pix?.expiraEm ?? "")
    if (Number.isFinite(expira) && agora.getTime() > expira + FOLGA_DO_PIX_MS) {
      await cancelarPixVencido(container, cliente, sessao, pedido.id, nome, relatorio)
      return
    }
  } else if (agora.getTime() - new Date(sessao.created_at).getTime() > ANALISE_LONGA_MS) {
    relatorio.avisos.push(`${nome}: cartão em análise há mais de 3 dias (${pedido.id})`)
  }
  relatorio.esperando++
}

/**
 * O Pix venceu. A ordem importa: fecha a cobrança LÁ primeiro, e só depois o
 * pedido aqui. Ao contrário, haveria um instante em que o estoque já voltou
 * pra prateleira e o QR ainda aceita pagamento.
 *
 * E relê antes de cancelar: se o pagamento entrou entre a primeira leitura e
 * agora, o `DELETE` viraria ESTORNO — o mesmo endpoint faz os dois.
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
  if (relido.status === PaymentSessionStatus.PENDING_AUTHORIZATION && relido.estado.cobranca) {
    await cliente.cancelarCobranca(relido.estado.cobranca)
  }
  await cancelarPedido(container, sessao.payment_collection?.order?.id)
  await anotar(container, sessao, { ...relido.estado, situacao: "cancelado" }, "canceled")
  relatorio.canceladas.push(`${nome} (Pix vencido)`)
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
  const { situacao, agiu } = await fecharCobranca(cliente, pedido, lido)
  if (agiu) {
    ;(situacao === "estornado" ? relatorio.estornadas : relatorio.canceladas).push(
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
    fields: ["id", "status"],
    filters: { id: candidatos.map((p) => p.code as string) },
  })
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
    try {
      const { situacao, agiu } = await fecharCobranca(cliente, pedido, lido)
      if (agiu) {
        ;(situacao === "estornado" ? relatorio.estornadas : relatorio.canceladas).push(
          `${pedido.id} (a sessão ${pedido.code} não existe mais na loja)`
        )
      }
    } catch (e) {
      relatorio.avisos.push(`${pedido.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

/* ── pedido cancelado no admin ────────────────────────────────────────────── */

/**
 * Fecha no Pagar.me as cobranças de um pedido que acabou de ser cancelado:
 * o Pix esperando é cancelado (o QR morre), e o que já tinha sido pago e o
 * Medusa ainda não sabia é estornado. O subscriber `pedido-cancelado.ts`
 * chama isto no instante do cancelamento — é o que impede o cliente de pagar
 * um QR de pedido que não existe mais. A rodada de pendentes é a rede.
 *
 * A cobrança é achada pelo CÓDIGO (o id da sessão, lido do banco), e não
 * pelo que está nos dados dela.
 */
export async function fecharCobrancasDoPedido(
  container: MedusaContainer,
  pedidoId: string
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
      const lido = traduzir(pedido, estado.forma, estado.parcelas)
      const { situacao, agiu } = await fecharCobranca(cliente, pedido, lido)
      await anotar(container, sessao, { ...lido.estado, situacao }, "canceled")
      if (agiu) {
        ;(situacao === "estornado" ? relatorio.estornadas : relatorio.canceladas).push(
          `#${pedidoMedusa?.display_id ?? pedidoId} (${pedido.id})`
        )
      }
    } catch (e) {
      relatorio.avisos.push(`${sessao.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return relatorio
}

/**
 * Fecha uma cobrança que não vai mais virar venda: pendente, cancela; paga,
 * estorna o que ainda não foi devolvido. Devolve a situação em que ela ficou,
 * e se ESTA chamada mexeu em alguma coisa (cobrança já fechada é conferida e
 * deixada como está). A cobrança é a do pedido LIDO, nunca um id que veio de
 * outro lugar.
 */
async function fecharCobranca(
  cliente: ClienteDoPagarme,
  pedido: PedidoPagarme,
  lido: ReturnType<typeof traduzir>
): Promise<{ situacao: Situacao; agiu: boolean }> {
  const cobranca = lido.estado.cobranca
  if (cobranca && lido.status === PaymentSessionStatus.CAPTURED) {
    const resta = Number(pedido.amount) - lido.estado.estornado
    if (resta <= 0) return { situacao: "estornado", agiu: false }
    await cliente.cancelarCobranca(cobranca, resta)
    return { situacao: "estornado", agiu: true }
  }
  if (cobranca && lido.status === PaymentSessionStatus.PENDING_AUTHORIZATION) {
    await cliente.cancelarCobranca(cobranca)
    return { situacao: "cancelado", agiu: true }
  }
  return { situacao: lido.estado.situacao, agiu: false }
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
 * Cancela o pedido e devolve o estoque. Pedido JÁ cancelado não é erro (o
 * admin pode ter chegado antes); qualquer outra recusa é, e sobe — "tem
 * envio criado" num pedido que ninguém pagou é coisa pra gente ver.
 */
async function cancelarPedido(container: MedusaContainer, pedidoId: string | undefined) {
  if (!pedidoId) return
  try {
    await cancelOrderWorkflow(container).run({ input: { order_id: pedidoId } })
  } catch (e) {
    if (!/has been canceled/i.test(e instanceof Error ? e.message : String(e))) throw e
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
  status: "canceled" | "error"
) {
  const pagamento = container.resolve(Modules.PAYMENT)
  await pagamento.updatePaymentSession({
    id: sessao.id,
    data: { ...(sessao.data ?? {}), ...gravar(estado) },
    amount: sessao.amount as number,
    currency_code: sessao.currency_code,
    status: status === "canceled" ? PaymentSessionStatus.CANCELED : PaymentSessionStatus.ERROR,
  })
}
