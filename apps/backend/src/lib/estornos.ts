import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  clienteDoPagarme,
  devolvidoNaCobranca,
  emCentavos,
  ENDERECO_PADRAO,
  ErroDoPagarme,
  type ClienteDoPagarme,
  type CobrancaPagarme,
} from "../modules/pagarme/client"
import { lerEstado } from "../modules/pagarme/situacao"
import { emailNoLog, enviarEmail } from "./email"
import { emailDoEstornoQueFalhou } from "./emails/estorno-falhou"

/**
 * O ESTORNO QUE O PAGAR.ME NÃO FEZ.
 *
 * Cancelar no admin um pedido pago pede o estorno ao Pagar.me (o
 * `refundPayment` do provedor), o Pagar.me aceita, e o Medusa marca
 * "Refunded" na hora. Só que o estorno anda DEPOIS, do lado de lá — e pode
 * falhar: o de Pix sai do saldo disponível da conta, e Pix que acabou de
 * entrar ainda não está nele. Foi o que aconteceu com o primeiro Pix real, o
 * #6: a cobrança voltou pra "Aprovada" e ninguém ficou sabendo — o cliente
 * sem o dinheiro, o admin dizendo que devolveu.
 *
 * A conciliação passa por aqui a cada rodada (`conferirEstornos`): todo
 * estorno registrado nos últimos 7 dias é conferido na cobrança do Pagar.me
 * PELO DINHEIRO — o que o Medusa diz que voltou contra o que a cobrança diz
 * que voltou. Pelo status só não dá: estorno parcial deixa a cobrança "paga"
 * mesmo dando certo.
 *
 * ┌─ QUANDO FALHA ─────────────────────────────────────────────────────────┐
 * │ • o pedido guarda o que houve (`metadata.estornos`, um por pagamento), │
 * │   e o admin mostra uma faixa vermelha no pedido, com "Tentar o estorno │
 * │   de novo" (`src/admin/widgets/estorno.tsx`);                          │
 * │ • quem tem acesso ao admin recebe UM e-mail;                           │
 * │ • estorno do pagamento INTEIRO é pedido de novo sozinho, de 6 em 6     │
 * │   horas, até 8 vezes. Parcial, não: um parcial que deu certo e que a   │
 * │   cobrança não contou viraria dinheiro devolvido duas vezes — esse     │
 * │   fica pro painel do Pagar.me.                                         │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * NUNCA DOIS ESTORNOS ANDANDO. O que está "aguardando cancelamento" lá não é
 * pedido de novo; a primeira tentativa nova só vem 6 horas depois da falha,
 * tempo de sobra pra qualquer estorno em andamento terminar; e a cobrança é
 * lida de novo, dentro da trava do pedido, antes de cada pedido. Por baixo
 * de tudo, o Pagar.me não devolve mais do que foi pago.
 */

const PROVEDOR = "pp_pagarme_pagarme"

/** Até onde olhar pra trás. Estorno mais velho que isso não é mais conferido. */
const JANELA_MS = 7 * 24 * 60 * 60 * 1000
/** Sem sinal nenhum do Pagar.me, depois disso o estorno não andou. */
const SEM_SINAL_MS = 2 * 60 * 60 * 1000
export const HORAS_ENTRE_TENTATIVAS = 6
export const TENTATIVAS = 8
const ENTRE_TENTATIVAS_MS = HORAS_ENTRE_TENTATIVAS * 60 * 60 * 1000

/* ── a leitura da cobrança, sem efeito nenhum ─────────────────────────────── */

export type Leitura =
  | { situacao: "devolvido"; devolvido: number }
  | { situacao: "andando" }
  | {
      situacao: "falhou"
      devolvido: number
      falta: number
      /** Cobrança paga, sem nada andando: pedir de novo é seguro. */
      retentavel: boolean
      motivo: string
    }

/** Os sinais de estorno em andamento que a documentação do Pagar.me publica. */
const ANDANDO = new Set(["processing"])
const ANDANDO_NA_TRANSACAO = new Set(["pending_refund", "waiting_cancellation", "processing"])
const PAGA = new Set(["paid", "overpaid", "underpaid"])

/**
 * O estorno aconteceu? `esperado` é o que o Medusa registrou (centavos);
 * `pedidoEm`, o último pedido de estorno — o do Medusa ou o nosso.
 *
 * "Falhou" só com a cobrança PAGA, nada andando, dinheiro faltando e um
 * sinal de que a tentativa terminou: o Pagar.me mexeu na cobrança depois do
 * pedido (foi quando ele desistiu), ou passaram duas horas sem sinal.
 */
export function lerEstorno({
  cobranca,
  esperado,
  pedidoEm,
  agora,
}: {
  cobranca: Partial<CobrancaPagarme>
  esperado: number
  pedidoEm: Date
  agora: Date
}): Leitura {
  const devolvido = devolvidoNaCobranca(cobranca)
  const status = String(cobranca.status ?? "").toLowerCase()
  const transacao = String(cobranca.last_transaction?.status ?? "").toLowerCase()

  if (devolvido >= esperado) return { situacao: "devolvido", devolvido }
  // Cancelada ou estornada inteira: voltou tudo o que dava, conte o campo ou não.
  if (status === "canceled" || status === "refunded") {
    return { situacao: "devolvido", devolvido: Math.max(devolvido, esperado) }
  }
  if (cobranca.pending_cancellation || ANDANDO.has(status) || ANDANDO_NA_TRANSACAO.has(transacao)) {
    return { situacao: "andando" }
  }

  const falta = esperado - devolvido
  if (!PAGA.has(status)) {
    return {
      situacao: "falhou",
      devolvido,
      falta,
      retentavel: false,
      motivo: `a cobrança está "${status || "sem status"}" lá`,
    }
  }
  const mexeuDepois = Date.parse(cobranca.updated_at ?? "") > pedidoEm.getTime()
  if (!mexeuDepois && agora.getTime() - pedidoEm.getTime() < SEM_SINAL_MS) {
    return { situacao: "andando" }
  }
  return {
    situacao: "falhou",
    devolvido,
    falta,
    retentavel: true,
    motivo: "a cobrança voltou pra paga",
  }
}

/**
 * Pedir o estorno de novo AGORA? Só o do pagamento inteiro (`sozinha`). A
 * loja sozinha espera a hora marcada e para em `TENTATIVAS`; quem aperta o
 * botão do admin decide por ela — o limite é o da loja, não o dele.
 */
export function ehAVez({
  registro,
  sozinha,
  manual,
  agora,
}: {
  registro: Pick<Registro, "tentativas" | "proxima">
  sozinha: boolean
  manual: boolean
  agora: Date
}): boolean {
  if (!sozinha) return false
  if (manual) return true
  return (
    registro.tentativas < TENTATIVAS &&
    Boolean(registro.proxima) &&
    agora.getTime() >= Date.parse(registro.proxima as string)
  )
}

/* ── o registro no pedido ─────────────────────────────────────────────────── */

export type Registro = {
  /**
   * "fora": o Pagar.me não conhece a cobrança — pedido feito com a chave de
   * outra conta (o ensaio com a de teste, os falsos dos conferidores). Fica
   * anotado pra não ser perguntado de novo a cada rodada.
   */
  situacao: "falhou" | "devolvido" | "fora"
  /** Centavos que o Medusa diz que voltaram. */
  esperado: number
  /** Centavos que a cobrança diz que voltaram. */
  devolvido: number
  /** `ch_…`, pra achar no painel do Pagar.me. */
  cobranca: string
  forma: "pix" | "cartao"
  /** Quando a falha foi vista pela primeira vez. */
  desde?: string
  motivo?: string
  /** Quantas vezes a LOJA pediu de novo. */
  tentativas: number
  ultima?: string
  /** Quando pode pedir de novo sozinha; `null` quando não vai mais. */
  proxima?: string | null
  /** Quando quem cuida da loja foi avisado por e-mail. */
  avisada?: string
  /** Quando o Pagar.me confirmou. */
  confirmado?: string
  /** Se a loja pede de novo sozinha (e se o botão do admin aparece). */
  sozinha?: boolean
}

export type Registros = Record<string, Registro>

/** `metadata.estornos` do pedido, pagamento por pagamento. O que não parece registro fica de fora. */
export function lerRegistros(metadata: unknown): Registros {
  const bruto = (metadata as { estornos?: unknown } | null | undefined)?.estornos
  if (!bruto || typeof bruto !== "object") return {}
  const saida: Registros = {}
  for (const [pagamento, r] of Object.entries(bruto as Record<string, unknown>)) {
    const x = r as Partial<Registro> | null
    if (
      x &&
      (x.situacao === "falhou" || x.situacao === "devolvido" || x.situacao === "fora") &&
      typeof x.esperado === "number" &&
      typeof x.cobranca === "string"
    ) {
      saida[pagamento] = {
        ...x,
        devolvido: Number(x.devolvido ?? 0),
        tentativas: Number(x.tentativas ?? 0),
        forma: x.forma === "cartao" ? "cartao" : "pix",
      } as Registro
    }
  }
  return saida
}

/* ── os pagamentos com estorno ────────────────────────────────────────────── */

type Pagamento = {
  id: string
  amount: unknown
  provider_id?: string
  data: Record<string, unknown> | null
  refunds?: { amount: unknown; created_at: string | Date }[] | null
  payment_collection?: { order?: { id: string; display_id?: number } | null } | null
}

type DoPedido = { pedidoId: string; numero: number; pagamentos: Pagamento[] }

const CAMPOS = [
  "id",
  "amount",
  "provider_id",
  "data",
  "refunds.amount",
  "refunds.created_at",
  "payment_collection.order.id",
  "payment_collection.order.display_id",
]

function porPedido(pagamentos: Pagamento[]): DoPedido[] {
  const grupos = new Map<string, DoPedido>()
  for (const p of pagamentos) {
    const pedido = p.payment_collection?.order
    if (!pedido?.id || p.provider_id !== PROVEDOR || !p.refunds?.length) continue
    const g = grupos.get(pedido.id) ?? {
      pedidoId: pedido.id,
      numero: Number(pedido.display_id ?? 0),
      pagamentos: [],
    }
    g.pagamentos.push(p)
    grupos.set(pedido.id, g)
  }
  return [...grupos.values()]
}

export type RelatorioDeEstornos = {
  /** Os que esta rodada viu falhar pela primeira vez. */
  falharam: string[]
  /** Os que esta rodada pediu de novo. */
  pedidosDeNovo: string[]
  /** Os que tinham falhado e agora o Pagar.me confirma. */
  confirmados: string[]
  avisos: string[]
}

/**
 * A rodada da conciliação: todo pagamento do Pagar.me com estorno registrado
 * nos últimos 7 dias. O já confirmado (e sem estorno novo depois) nem
 * pergunta ao Pagar.me de novo.
 */
export async function conferirEstornos(
  container: MedusaContainer,
  cliente: ClienteDoPagarme,
  agora = new Date()
): Promise<RelatorioDeEstornos> {
  const relatorio: RelatorioDeEstornos = {
    falharam: [],
    pedidosDeNovo: [],
    confirmados: [],
    avisos: [],
  }
  const recentes = await container
    .resolve(Modules.PAYMENT)
    .listRefunds(
      { created_at: { $gte: new Date(agora.getTime() - JANELA_MS).toISOString() } },
      { select: ["id", "payment_id"], take: 500 }
    )
  // `payment_id` vem na resposta, mas o tipo do Medusa só declara a relação.
  const ids = [
    ...new Set(recentes.map((r) => (r as unknown as { payment_id?: string }).payment_id)),
  ].filter(Boolean) as string[]
  if (!ids.length) return relatorio

  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "payment",
    fields: CAMPOS,
    filters: { id: ids },
  })
  for (const grupo of porPedido(data as unknown as Pagamento[])) {
    try {
      await conferirPedido(container, cliente, grupo, agora, relatorio, { manual: false })
    } catch (e) {
      relatorio.avisos.push(`#${grupo.numero}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return relatorio
}

export type Tentativa =
  | { resultado: "pedido"; falta: number }
  | { resultado: "devolvido" | "andando" | "sem-estorno" }
  | { resultado: "nao-da"; motivo: string }

/**
 * "Tentar o estorno de novo", o botão do admin: a mesma conferência da
 * rodada, com a tentativa na hora em vez de esperar a vez dela — e só no que
 * a rodada também pediria de novo sozinha.
 */
export async function tentarEstornoAgora(
  container: MedusaContainer,
  pedidoId: string,
  agora = new Date()
): Promise<Tentativa> {
  const chave = process.env.PAGARME_SECRET_KEY
  if (!chave) return { resultado: "nao-da", motivo: "PAGARME_SECRET_KEY ausente" }
  const cliente = clienteDoPagarme(chave, process.env.PAGARME_URL || ENDERECO_PADRAO)

  // Pelo pedido, e dele pros pagamentos — o caminho que o link do Medusa faz.
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      ...CAMPOS.filter((c) => !c.startsWith("payment_collection.")).map(
        (c) => `payment_collections.payments.${c}`
      ),
    ],
    filters: { id: pedidoId },
  })
  const pedido = data[0] as unknown as
    | { id: string; display_id?: number; payment_collections?: { payments?: Pagamento[] }[] }
    | undefined
  const pagamentos = (pedido?.payment_collections ?? []).flatMap((c) =>
    (c?.payments ?? []).map((p) => ({
      ...p,
      payment_collection: { order: { id: pedidoId, display_id: pedido?.display_id } },
    }))
  )
  const [grupo] = porPedido(pagamentos)
  if (!grupo) return { resultado: "sem-estorno" }

  const relatorio: RelatorioDeEstornos = {
    falharam: [],
    pedidosDeNovo: [],
    confirmados: [],
    avisos: [],
  }
  return conferirPedido(container, cliente, grupo, agora, relatorio, { manual: true })
}

/* ── um pedido, dentro da trava dele ──────────────────────────────────────── */

async function conferirPedido(
  container: MedusaContainer,
  cliente: ClienteDoPagarme,
  grupo: DoPedido,
  agora: Date,
  relatorio: RelatorioDeEstornos,
  { manual }: { manual: boolean }
): Promise<Tentativa> {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  return container.resolve(Modules.LOCKING).execute(
    `estorno:${grupo.pedidoId}`,
    async () => {
      // O metadata é lido DENTRO da trava: quem chegou antes pode ter anotado.
      const pedidos = container.resolve(Modules.ORDER)
      const [pedido] = await pedidos.listOrders(
        { id: grupo.pedidoId },
        { select: ["id", "metadata"], take: 1 }
      )
      const meta = (pedido?.metadata ?? {}) as Record<string, unknown>
      const registros = lerRegistros(meta)
      let mudou = false
      let tentativa: Tentativa = { resultado: "sem-estorno" }

      for (const p of grupo.pagamentos) {
        const estado = lerEstado(p.data)
        if (!estado?.cobranca) continue
        const esperado = (p.refunds ?? []).reduce((soma, r) => soma + emCentavos(r.amount), 0)
        const pago = emCentavos(p.amount)
        const antes = registros[p.id]
        if (antes?.situacao === "devolvido" && antes.esperado >= esperado) {
          tentativa = { resultado: "devolvido" }
          continue
        }
        if (antes?.situacao === "fora" && antes.esperado >= esperado) continue

        const ultimoDoMedusa = Math.max(
          ...(p.refunds ?? []).map((r) => new Date(r.created_at).getTime())
        )
        const pedidoEm = new Date(
          Math.max(ultimoDoMedusa, antes?.ultima ? Date.parse(antes.ultima) : 0)
        )
        const base = { esperado, cobranca: estado.cobranca, forma: estado.forma }
        const nome = `#${grupo.numero}`
        let cobranca: CobrancaPagarme
        try {
          cobranca = await cliente.lerCobranca(estado.cobranca)
        } catch (e) {
          if (!(e instanceof ErroDoPagarme && e.tipo === "nao_encontrado")) throw e
          logger.warn(
            `[estorno] ${nome}: o Pagar.me não conhece a cobrança ${estado.cobranca} — ` +
              "chave de outra conta (teste × produção)? Não confiro mais este estorno."
          )
          registros[p.id] = { ...base, situacao: "fora", devolvido: 0, tentativas: 0 }
          mudou = true
          continue
        }
        const leitura = lerEstorno({ cobranca, esperado, pedidoEm, agora })

        if (leitura.situacao === "andando") {
          tentativa = { resultado: "andando" }
          continue
        }

        if (leitura.situacao === "devolvido") {
          if (antes?.situacao === "falhou") {
            logger.info(
              `[estorno] ${nome}: o Pagar.me confirmou — ${reais(leitura.devolvido)} voltaram` +
                (antes.tentativas ? ` (depois de ${antes.tentativas} tentativa(s) da loja)` : "")
            )
            relatorio.confirmados.push(nome)
          }
          registros[p.id] = {
            ...(antes ?? { tentativas: 0 }),
            ...base,
            situacao: "devolvido",
            devolvido: leitura.devolvido,
            proxima: null,
            confirmado: agora.toISOString(),
          }
          mudou = true
          tentativa = { resultado: "devolvido" }
          continue
        }

        // Falhou.
        const sozinha = leitura.retentavel && esperado >= pago
        const nova = antes?.situacao !== "falhou"
        const registro: Registro = nova
          ? {
              ...base,
              situacao: "falhou",
              devolvido: leitura.devolvido,
              desde: agora.toISOString(),
              motivo: leitura.motivo,
              tentativas: 0,
              proxima: sozinha
                ? new Date(agora.getTime() + ENTRE_TENTATIVAS_MS).toISOString()
                : null,
            }
          : { ...antes!, ...base, devolvido: leitura.devolvido }
        registro.sozinha = sozinha
        if (nova) {
          logger.warn(
            `[estorno] ${nome}: o Pagar.me não devolveu ${reais(leitura.falta)} ` +
              `(${leitura.motivo}, cobrança ${estado.cobranca}) — ` +
              (sozinha
                ? `a loja pede de novo em ${HORAS_ENTRE_TENTATIVAS} horas`
                : "estorne pelo painel do Pagar.me")
          )
          relatorio.falharam.push(`${nome} (${reais(leitura.falta)})`)
        }

        if (!registro.avisada) {
          const avisou = await avisarAEquipe(container, grupo, registro, leitura.falta, sozinha)
          if (avisou) registro.avisada = agora.toISOString()
        }

        const naVez = ehAVez({ registro, sozinha, manual, agora })
        if (manual && !sozinha) {
          tentativa = {
            resultado: "nao-da",
            motivo: leitura.retentavel
              ? "estorno de parte do pedido: pelo painel do Pagar.me"
              : `${leitura.motivo}: confira no painel do Pagar.me`,
          }
        }

        if (naVez) {
          let motivo: string | undefined
          let resposta: CobrancaPagarme | null = null
          try {
            resposta = await cliente.cancelarCobranca(estado.cobranca, leitura.falta)
          } catch (e) {
            motivo =
              e instanceof ErroDoPagarme
                ? e.message
                : `não consegui falar com o Pagar.me: ${e instanceof Error ? e.message : String(e)}`
          }
          // A hora da tentativa é a de DEPOIS da chamada: o que o Pagar.me
          // mexer na cobrança a partir daqui é notícia dela (ver `lerEstorno`).
          const feita = new Date()
          registro.tentativas++
          registro.ultima = feita.toISOString()
          registro.proxima =
            registro.tentativas < TENTATIVAS
              ? new Date(feita.getTime() + ENTRE_TENTATIVAS_MS).toISOString()
              : null
          if (motivo) registro.motivo = motivo
          relatorio.pedidosDeNovo.push(`${nome} (tentativa ${registro.tentativas})`)
          const quem = manual ? ", pelo admin" : ""

          // A resposta do pedido já é a cobrança: se ela voltou devolvida,
          // não precisa esperar a próxima rodada pra dizer.
          const depois = resposta
            ? lerEstorno({ cobranca: resposta, esperado, pedidoEm: feita, agora: feita })
            : null
          if (depois?.situacao === "devolvido") {
            Object.assign(registro, {
              situacao: "devolvido",
              devolvido: depois.devolvido,
              proxima: null,
              confirmado: feita.toISOString(),
            })
            logger.info(
              `[estorno] ${nome}: pedi de novo o estorno de ${reais(leitura.falta)} ` +
                `(tentativa ${registro.tentativas}${quem}) e o Pagar.me devolveu na hora`
            )
            relatorio.confirmados.push(nome)
            tentativa = { resultado: "devolvido" }
          } else {
            logger.warn(
              `[estorno] ${nome}: pedi de novo o estorno de ${reais(leitura.falta)} ` +
                `(tentativa ${registro.tentativas} de ${TENTATIVAS}${quem})` +
                (motivo ? ` — o Pagar.me recusou: ${motivo}` : "")
            )
            tentativa = motivo
              ? { resultado: "nao-da", motivo }
              : { resultado: "pedido", falta: leitura.falta }
          }
        }

        registros[p.id] = registro
        mudou = true
      }

      if (mudou) {
        await pedidos.updateOrders([
          { id: grupo.pedidoId, metadata: { ...meta, estornos: registros } },
        ])
      }
      return tentativa
    },
    { timeout: 30 }
  )
}

/* ── o aviso ──────────────────────────────────────────────────────────────── */

/**
 * Um e-mail pra cada usuário do admin — quem resolve é quem entra no painel.
 * Devolve se saiu pra pelo menos um; sem ninguém, a linha `[estorno]` do log
 * e a faixa no admin são o aviso.
 */
async function avisarAEquipe(
  container: MedusaContainer,
  grupo: DoPedido,
  registro: Registro,
  falta: number,
  sozinha: boolean
): Promise<boolean> {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const usuarios = await container
    .resolve(Modules.USER)
    .listUsers({}, { select: ["email"], take: 20 })
    .catch(() => [])
  const emails = [...new Set(usuarios.map((u) => u.email).filter(Boolean))] as string[]
  if (!emails.length) {
    logger.warn(`[estorno] #${grupo.numero}: nenhum usuário no admin pra avisar por e-mail`)
    return false
  }

  let saiu = false
  for (const para of emails) {
    const email = emailDoEstornoQueFalhou(para, {
      pedidoId: grupo.pedidoId,
      numero: grupo.numero,
      falta,
      forma: registro.forma,
      cobranca: registro.cobranca,
      motivo: registro.motivo ?? "a cobrança voltou pra paga",
      sozinha,
      horas: HORAS_ENTRE_TENTATIVAS,
      tentativas: TENTATIVAS,
    })
    const r = await enviarEmail(email, logger, {
      idempotencia: `estorno-falhou/${grupo.pedidoId}/${registro.desde ?? ""}/${para}`.slice(
        0,
        256
      ),
    })
    if (r.ok) {
      saiu = true
      logger.info(`[estorno] #${grupo.numero}: avisei ${emailNoLog(para)}`)
    }
  }
  return saiu
}

const reais = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`
