import {
  AbstractPaymentProvider,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import {
  clienteDoPagarme,
  emCentavos,
  emReais,
  ENDERECO_PADRAO,
  ErroDoPagarme,
  origemDestaLoja,
  segredosIguais,
  type ClienteDoPagarme,
  type PedidoPagarme,
} from "./client"
import { conferirEntrada, montarPedido, type EntradaDaLoja, type Forma } from "./pedido"
import {
  CHAVE_DA_ENTRADA,
  estadoNovo,
  gravar,
  lerEstado,
  podeCobrar,
  RECUSAS,
  reservaPraDesfazer,
  traduzir,
  type Estado,
  type Situacao,
  type Traduzido,
} from "./situacao"

/**
 * O PROVEDOR DE PAGAMENTO — Pix e cartão em até 3x, pelo Pagar.me.
 *
 * Registrado no `medusa-config.ts` com `id: "pagarme"`, o que faz o Medusa
 * chamá-lo de `pp_pagarme_pagarme` — é esse o id que vai na região (pelo
 * `npm run backend:pagamento`) e o que a loja procura pra mostrar Pix e cartão.
 *
 * ┌─ O CAMINHO DE UM PEDIDO ───────────────────────────────────────────────┐
 * │ 1. A loja abre a sessão com o comprador e a forma (`initiatePayment`). │
 * │    Nada vai pro Pagar.me ainda: é só conferência.                      │
 * │                                                                         │
 * │ 2. A loja manda fechar o carrinho. O Medusa cria o pedido, reserva o   │
 * │    estoque e, por ÚLTIMO, chama `authorizePayment` — que é onde o      │
 * │    pedido nasce no Pagar.me. O cartão só é AUTORIZADO (o valor fica    │
 * │    reservado), e a espera pela análise de fraude é de uns segundos:    │
 * │      • análise aprovada → o cartão é COBRADO aqui, e `captured`:       │
 * │        pedido pago na hora;                                            │
 * │      • Pix gerado, ou cartão ainda em análise → `pending_authorization`│
 * │        : o pedido existe, aguardando pagamento, com o estoque          │
 * │        reservado (o cartão, só com a reserva — nada na fatura);        │
 * │      • cartão recusado, pelo banco ou pela análise → `error`: o Medusa │
 * │        DESFAZ o pedido, devolve o estoque, e o carrinho continua       │
 * │        aberto pra outra tentativa.                                     │
 * │                                                                         │
 * │ 3. O Pix é pago, ou a análise aprova o cartão. O Pagar.me avisa a Edge │
 * │    Function, que avisa o Medusa (`/hooks/payment/pagarme_pagarme`).    │
 * │    `getWebhookActionAndData` NÃO ACREDITA no aviso: busca o pedido na  │
 * │    API e só age se a API disser "pago" (ou "aprovado, falta cobrar").  │
 * │    O Medusa então chama `authorizePayment` de novo, que cobra o cartão │
 * │    se for o caso e responde `captured`, e o pagamento é registrado.    │
 * │                                                                         │
 * │ 4. O que o webhook não resolve — Pix que venceu, cartão que a análise  │
 * │    recusou ou aprovou sem aviso, aviso que nunca chegou — a            │
 * │    conciliação resolve, a cada 5 minutos, no worker                    │
 * │    (`src/lib/conciliar-pagamentos.ts`).                                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * O PEDIDO DO PAGAR.ME É ACHADO PELO CÓDIGO, NUNCA PELOS DADOS DA SESSÃO. O
 * código é o id da sessão, que o Medusa passa em `context.idempotency_key`,
 * por fora dos dados. Os dados da sessão passam pela mão de quem chama a API
 * pública — o porquê disso importar está na caixa do `situacao.ts`.
 *
 * SEM A CHAVE O PROVEDOR SOBE MESMO ASSIM, e avisa no log na primeira vez que
 * é usado. É a mesma escolha do provedor da Frenet: derrubar o servidor no
 * arranque derruba admin e catálogo junto. Sem chave, ele só não cobra — e o
 * script da região se recusa a ligá-lo.
 */

type Opcoes = {
  chaveSecreta?: string
  /** O mesmo `MEDUSA_WEBHOOK_SEGREDO` que a Edge Function manda no cabeçalho. */
  segredoDoWebhook?: string
  /** Quanto tempo o QR do Pix vale. */
  pixMinutos?: number
  url?: string
}

/**
 * 30 minutos: tempo de abrir o app do banco com calma, e curto o bastante
 * pra não segurar estoque de quem desistiu. O pedido não pago é cancelado
 * pela conciliação depois disso (e da folga dela), e o estoque volta.
 */
const PIX_MINUTOS_PADRAO = 30

/**
 * Espera antes de perguntar de novo "o pedido nasceu?" quando a criação some
 * no meio do caminho. Duas perguntas, porque a primeira costuma chegar antes
 * de o pedido aparecer na listagem deles.
 */
const REPERGUNTAS_MS = [2_000, 5_000]

/**
 * No checkout, quanto esperar pela análise de fraude do cartão, releitura a
 * releitura: uns 6 segundos no total. As análises que se viram responderam
 * em 2 a 6 segundos (e uma, em um minuto). Quem espera aqui sai da tela com
 * a resposta: pago, ou "tenta outro cartão" com o carrinho aberto — em vez
 * de um pedido que nasce e é cancelado minutos depois. Mais que isso, o
 * pedido nasce em análise e a cobrança vem depois (ver o passo 3 lá em cima).
 */
const ESPERAS_DA_ANALISE_MS = [1_500, 2_000, 2_500]

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** O id de sessão do Medusa — é ele que vira o `code` do pedido no Pagar.me. */
const CODIGO_DE_SESSAO = /^payses_[A-Za-z0-9]+$/

/** Situações de onde uma sessão não volta a ser paga — ver `authorizePayment`. */
const SEM_VOLTA = new Set<Situacao>(["incerto", "cancelado", "estornado", "falhou", "recusado"])

export default class PagarmeServico extends AbstractPaymentProvider<Opcoes> {
  static identifier = "pagarme"

  private readonly cliente: ClienteDoPagarme
  private readonly logger: Logger
  private readonly segredoDoWebhook: string
  private readonly pixMinutos: number
  private readonly origem = origemDestaLoja()

  constructor(cradle: Record<string, unknown>, opcoes: Opcoes = {}) {
    super(cradle, opcoes)
    this.logger = cradle.logger as Logger
    this.segredoDoWebhook = opcoes.segredoDoWebhook ?? ""
    this.pixMinutos =
      Number.isInteger(opcoes.pixMinutos) && (opcoes.pixMinutos ?? 0) >= 5
        ? (opcoes.pixMinutos as number)
        : PIX_MINUTOS_PADRAO
    this.cliente = clienteDoPagarme(opcoes.chaveSecreta ?? "", opcoes.url || ENDERECO_PADRAO)

    if (!opcoes.chaveSecreta) {
      this.logger.warn(
        "[pagarme] PAGARME_SECRET_KEY ausente — o provedor sobe, mas não cobra nada. " +
          "Não ligue ele na região (npm run backend:pagamento) enquanto isso não mudar."
      )
    } else if (opcoes.chaveSecreta.startsWith("sk_test_")) {
      this.logger.info("[pagarme] chave de TESTE: nenhuma cobrança é de verdade")
    }
    if (!this.segredoDoWebhook) {
      this.logger.warn(
        "[pagarme] MEDUSA_WEBHOOK_SEGREDO ausente — todo aviso do Pagar.me vai ser ignorado, " +
          "e Pix pago só vira pedido pago pela conciliação, a cada 5 minutos."
      )
    }
  }

  /* ── 1. abrir a sessão ──────────────────────────────────────────────────── */

  /**
   * Confere o pedido e guarda. Não fala com o Pagar.me.
   *
   * O VALOR vem do `amount` que o Medusa passa aqui — o da coleção de
   * pagamento do carrinho —, nunca do que a loja mandou. E o estado nasce
   * INTEIRO, com `null` em `pedido` e `cobranca`: é o que apaga qualquer
   * `pagarme.pedido` que tenha chegado junto (ver `situacao.ts`).
   */
  async initiatePayment({
    amount,
    currency_code,
    data,
  }: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    if (String(currency_code).toLowerCase() !== "brl") {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "O Pagar.me só cobra em reais.")
    }
    const valor = emCentavos(amount)
    if (!Number.isInteger(valor) || valor <= 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Valor de pagamento inválido.")
    }

    const entrada = conferirEntrada(data?.[CHAVE_DA_ENTRADA], valor)

    return {
      id: typeof data?.session_id === "string" ? data.session_id : "",
      data: gravar(estadoNovo(entrada.forma, valor, entrada.parcelas), entrada),
      status: PaymentSessionStatus.PENDING,
    }
  }

  /**
   * O Medusa 2.21 não chama isto sozinho (sessão com valor velho é apagada e
   * aberta de novo). Quem chama é a conciliação, pra anotar na sessão o que
   * aconteceu com ela — e aí os dados passam como vieram. Sessão ainda não
   * enviada ao Pagar.me é conferida de novo com o valor novo.
   */
  async updatePayment({ data, amount }: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const estado = lerEstado(data)
    if (estado?.situacao === "nova") {
      const valor = emCentavos(amount)
      const entrada = conferirEntrada(data?.[CHAVE_DA_ENTRADA], valor)
      return {
        data: gravar({ ...estadoNovo(entrada.forma, valor, entrada.parcelas) }, entrada),
      }
    }
    return { data: data ?? {} }
  }

  /* ── 2. autorizar: onde o pedido nasce no Pagar.me ──────────────────────── */

  async authorizePayment({
    data,
    context,
  }: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const estado = lerEstado(data)
    const codigo = context?.idempotency_key ?? ""
    if (!estado || !CODIGO_DE_SESSAO.test(codigo)) {
      return this.falha(estado, "sessão sem estado do Pagar.me ou sem código", RECUSAS.fora)
    }

    /*
      O QUE EXISTE NO PAGAR.ME PRA ESTA SESSÃO — pelo código, que é o id da
      sessão. Serve às duas situações em que isto é chamado:

      • no checkout, é a trava contra cobrar duas vezes: se esta mesma sessão
        já tentou e a resposta se perdeu (o processo caiu entre criar e
        gravar), o pedido existe lá, e criar outro seria cobrar o cartão de
        novo;
      • depois (webhook, conciliação), é a pergunta "e agora, pagou?".

      Nesse segundo caso, se a pergunta falhar, ESTOURA: o Medusa não mexe na
      sessão quando o provedor estoura, e ela continua pendente pra próxima
      vez. Responder "error" marcaria como recusado um Pix que só estava
      esperando.
    */
    let pedido: PedidoPagarme | null
    try {
      pedido = await this.cliente.buscarPorCodigo(codigo)
    } catch (e) {
      if (estado.situacao !== "nova") throw e
      pedido = null
    }

    if (pedido) {
      /*
        SESSÃO QUE JÁ TEVE FIM NÃO RESSUSCITA. "Incerto" é a criação que
        sumiu no caminho — a tela disse "tenta de novo, e o que foi cobrado
        é estornado". Se o aviso de pago chegasse aqui e virasse
        `captured`, o Medusa fecharia o carrinho com ela (é o que o fluxo do
        webhook faz com carrinho sem pedido) ao mesmo tempo em que a
        conciliação estorna: pedido pago, dinheiro devolvido, encomenda
        enviada de graça. Então quem decide o destino dessas é UM só — a
        conciliação, que estorna. O mesmo pra cancelada e estornada. E
        cartão de sessão assim não é COBRADO aqui, nem com a análise
        aprovada: a conciliação desfaz a reserva.
      */
      if (SEM_VOLTA.has(estado.situacao)) {
        const traduzido = traduzir(pedido, estado.forma, estado.parcelas)
        if (traduzido.status === PaymentSessionStatus.CAPTURED) {
          this.logger.error(
            `[pagarme] ${pedido.id} consta PAGO, e a sessão ${codigo} já tinha terminado como ` +
              `"${estado.situacao}". Não vira pedido: a conciliação estorna.`
          )
        }
        return {
          status: PaymentSessionStatus.ERROR,
          data: gravar({ ...traduzido.estado, situacao: estado.situacao, recusa: estado.recusa }),
        }
      }
      // O cartão que a análise aprovou é cobrado aqui: no checkout (a
      // resposta da criação que se perdeu), no aviso e na conciliação.
      pedido = await this.cobrarSePuder(pedido, codigo)
      return this.responder(traduzir(pedido, estado.forma, estado.parcelas))
    }

    if (estado.situacao !== "nova") {
      // A sessão diz que já foi pro Pagar.me, e ele não conhece o código.
      // Não é caso de criar outro: é caso de alguém olhar.
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `A sessão ${codigo} está "${estado.situacao}" e o Pagar.me não tem pedido com esse código.`
      )
    }

    // Conferida de novo: os dados da sessão passaram pela mistura do Medusa
    // desde que foram conferidos na abertura.
    let entrada: EntradaDaLoja
    try {
      entrada = conferirEntrada(data?.[CHAVE_DA_ENTRADA], estado.valor)
    } catch (e) {
      return this.falha(estado, e instanceof Error ? e.message : String(e), RECUSAS.fora)
    }

    try {
      pedido = await this.cliente.criarPedido(
        montarPedido(entrada, estado.valor, codigo, this.pixMinutos, this.origem)
      )
    } catch (e) {
      if (!(e instanceof ErroDoPagarme)) throw e

      if (!e.incerto) {
        // 4xx: nada foi criado. Token vencido (dura 60 s) e dado recusado
        // caem aqui.
        return this.falha(
          estado,
          `pedido recusado na entrada (${codigo}): ${e.message}`,
          entrada.forma === "pix"
            ? RECUSAS.pix
            : e.tipo === "validacao"
              ? RECUSAS.dados
              : RECUSAS.fora
        )
      }

      // Rede ou 5xx: pode ter sido criado. Pergunta mais duas vezes.
      this.logger.warn(`[pagarme] criação sem resposta (${codigo}): ${e.message}`)
      for (const ms of REPERGUNTAS_MS) {
        await esperar(ms)
        pedido = await this.cliente.buscarPorCodigo(codigo).catch(() => null)
        if (pedido) break
      }
      if (!pedido) {
        this.logger.error(
          `[pagarme] não sei se ${codigo} foi cobrado. A conciliação procura por ele e ` +
            "estorna o que achar."
        )
        return {
          status: PaymentSessionStatus.ERROR,
          data: gravar({ ...estado, situacao: "incerto", recusa: RECUSAS.incerto }),
        }
      }
    }

    /*
      O VALOR QUE O PAGAR.ME VAI COBRAR É O DA SESSÃO? É a última trava. Se
      não for — o que só acontece se a montagem tiver um bug —, o pedido de
      lá é cancelado (ou estornado, se o cartão já passou) e a compra não
      fecha. Cobrar diferente do que a tela mostrou não tem conserto depois.

      No Pix, o cancelamento não pega (412, ver o `cancelPayment`) — e não
      precisa: a compra não fechou, o pedido daqui não nasceu, e se alguém
      pagar esse QR a cobrança vira órfã e a conciliação estorna.
    */
    if (Number(pedido.amount) !== estado.valor) {
      this.logger.error(
        `[pagarme] ${pedido.id} saiu com ${pedido.amount} centavos, e a sessão é de ` +
          `${estado.valor}. Cancelando.`
      )
      const cobranca = pedido.charges?.[0]?.id
      if (cobranca) await this.cliente.cancelarCobranca(cobranca).catch(() => null)
      return this.falha(estado, "valor divergente", RECUSAS.fora)
    }

    pedido = await this.esperarAAnalise(pedido, entrada.forma, codigo)
    const traduzido = traduzir(pedido, entrada.forma, entrada.parcelas)
    this.logger.info(
      `[pagarme] ${codigo} → ${pedido.id}: ${traduzido.estado.situacao} ` +
        `(${entrada.forma}, ${estado.valor} centavos)`
    )
    return this.responder(traduzido)
  }

  /* ── o que o Medusa faz com um pagamento já registrado ──────────────────── */

  /*
    Daqui pra baixo, `data` é o do PAGAMENTO (gravado com o que o
    `authorizePayment` devolveu, sem mistura) ou o de uma sessão que já
    passou por ele. O `pedido` que está lá foi posto por este provedor.
  */

  /**
   * Só é chamado pra pagamento registrado sem estar capturado — e este
   * provedor nunca registra assim: ele cobra o cartão ANTES de responder
   * `captured` (ver `cobrarSePuder`), e até lá a sessão fica pendente. Se um
   * dia chegar aqui (o "Capture" do admin), cobra se a análise deixou, e só
   * deixa o Medusa marcar se o Pagar.me disser "pago".
   */
  async capturePayment({ data }: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const estado = this.exigirPedido(data)
    const lido = traduzir(
      await this.cobrarSePuder(await this.cliente.lerPedido(estado.pedido!), estado.pedido!),
      estado.forma,
      estado.parcelas
    )
    if (lido.status !== PaymentSessionStatus.CAPTURED) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `O Pagar.me ainda não confirmou o pagamento ${estado.pedido} (${lido.estado.situacao}).`
      )
    }
    return { data: gravar(lido.estado) }
  }

  /**
   * O Medusa desiste de um pagamento. Pendente, a cobrança é cancelada; já
   * CAPTURADA, é estornada — porque os dois caminhos em que o Medusa chama
   * isto com o cartão já cobrado são justamente os em que o pedido não vai
   * existir: o registro do pagamento falhou depois de o Pagar.me cobrar, ou
   * o fechamento do carrinho foi desfeito. (Cancelar pedido pago no admin
   * não passa por aqui: passa pelo `refundPayment`.)
   *
   * PIX PENDENTE NÃO SE CANCELA: o Pagar.me responde 412 ("This charge
   * cannot be canceled because is pending"), vencido ou não. A sessão é
   * anotada como cancelada aqui — o Medusa desistiu dela mesmo —, o QR morre
   * sozinho na hora da validade, e o que for pago nesse meio-tempo a
   * conciliação devolve (ver `lib/conciliar-pagamentos.ts`).
   *
   * A cobrança cancelada é a do pedido LIDO agora no Pagar.me, e não um id
   * que veio nos dados: um estado lido e uma cobrança de outro pedido
   * misturados seriam o estorno de uma venda que não tem nada a ver.
   */
  async cancelPayment({ data }: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const estado = lerEstado(data)
    if (!estado?.pedido) return { data: data ?? {} }

    const pedido = await this.cliente.lerPedido(estado.pedido)
    const lido = traduzir(pedido, estado.forma, estado.parcelas)
    const cobranca = lido.estado.cobranca
    if (!cobranca) return { data: gravar(lido.estado) }

    if (lido.status === PaymentSessionStatus.CAPTURED) {
      const resta = Number(pedido.amount) - lido.estado.estornado
      if (resta > 0) await this.cliente.cancelarCobranca(cobranca, resta)
      this.logger.warn(`[pagarme] ${pedido.id} estava pago e o pagamento foi desfeito: estornado`)
      return {
        data: gravar({ ...lido.estado, situacao: "estornado", estornado: Number(pedido.amount) }),
      }
    }
    if (lido.status === PaymentSessionStatus.PENDING_AUTHORIZATION && lido.estado.forma !== "pix") {
      await this.cliente.cancelarCobranca(cobranca)
    }
    return { data: gravar({ ...lido.estado, situacao: "cancelado" }) }
  }

  /**
   * Devolve o dinheiro — tudo ou parte. É o mesmo `DELETE` do cancelamento,
   * com o valor: no cartão vira estorno na fatura; no Pix, devolução pra
   * conta de quem pagou.
   */
  async refundPayment({ data, amount }: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const estado = this.exigirPedido(data)
    if (!estado.cobranca) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Pagamento sem cobrança no Pagar.me.")
    }
    const centavos = emCentavos(amount)
    if (!Number.isInteger(centavos) || centavos <= 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Valor de estorno inválido.")
    }
    /*
      O que já voltou por OUTRO caminho conta. O fechamento de carrinho que
      falha depois de o cartão passar desfaz o pagamento duas vezes: primeiro
      pelo `cancelPayment` (que estorna, e anota), depois por um estorno do
      próprio Medusa, que não sabe do primeiro. O segundo pararia no Pagar.me
      de qualquer jeito; aqui ele para com uma frase que diz por quê.
    */
    const resta = estado.valor - estado.estornado
    if (centavos > resta) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Estorno de ${centavos} centavos em ${estado.pedido}, que só tem ${Math.max(resta, 0)} ` +
          "a devolver — o resto já foi estornado."
      )
    }

    await this.cliente.cancelarCobranca(estado.cobranca, centavos)
    const estornado = estado.estornado + centavos
    this.logger.info(`[pagarme] estorno de ${centavos} centavos em ${estado.pedido}`)
    return {
      data: gravar({
        ...estado,
        estornado,
        situacao: estornado >= estado.valor ? "estornado" : estado.situacao,
      }),
    }
  }

  /**
   * A sessão está sendo jogada fora — a pessoa voltou e abriu outra, ou o
   * carrinho mudou. AQUI NÃO SE MEXE NO PAGAR.ME, de propósito.
   *
   * Parecia o lugar certo pra cancelar o Pix da sessão que sai, e já foi.
   * Mas `data` aqui nem sempre é a sessão gravada: quando a abertura de
   * sessão falha no meio, o Medusa chama isto com o corpo CRU que chegou da
   * API pública — o que deixaria qualquer um mandar cancelar (ou estornar)
   * a cobrança de outra pessoa, bastando pôr o id dela no corpo.
   *
   * A cobrança que perde a sessão — o Pix de quem desistiu, o cartão cobrado
   * cuja resposta se perdeu antes de a pessoa tentar de novo — é achada pela
   * conciliação, que lista os pedidos do próprio Pagar.me e compara com as
   * sessões que existem no banco. Nenhum dado de fora entra nessa conta.
   */
  async deletePayment({ data }: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: data ?? {} }
  }

  async getPaymentStatus({ data }: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const estado = lerEstado(data)
    if (!estado?.pedido) return { status: PaymentSessionStatus.PENDING, data: data ?? {} }
    const lido = traduzir(
      await this.cliente.lerPedido(estado.pedido),
      estado.forma,
      estado.parcelas
    )
    return { status: lido.status, data: gravar(lido.estado) }
  }

  async retrievePayment({ data }: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    const estado = lerEstado(data)
    if (!estado?.pedido) return { data: data ?? {} }
    const lido = traduzir(
      await this.cliente.lerPedido(estado.pedido),
      estado.forma,
      estado.parcelas
    )
    return { data: gravar(lido.estado) }
  }

  /* ── 3. o aviso do Pagar.me ─────────────────────────────────────────────── */

  /**
   * O que fazer com um aviso que chegou em `/hooks/payment/pagarme_pagarme`.
   *
   * ┌─ O AVISO É SÓ UM AVISO ────────────────────────────────────────────────┐
   * │ Aquela rota é pública. Qualquer um pode mandar pra ela um JSON dizendo │
   * │ "order.paid". Então:                                                   │
   * │                                                                         │
   * │ 1. sem o cabeçalho `x-webhook-segredo` certo — o que a Edge Function   │
   * │    põe depois de conferir a autenticação do Pagar.me —, nada acontece; │
   * │ 2. mesmo com ele, o corpo só serve pra saber QUAL pedido olhar. O      │
   * │    estado vem da API do Pagar.me, com a chave secreta. Um aviso        │
   * │    forjado, no máximo, faz a gente conferir um pedido de verdade.      │
   * │                                                                         │
   * │ E a sessão vem do `code` do pedido lido na API — nunca do corpo.       │
   * └─────────────────────────────────────────────────────────────────────────┘
   *
   * Só "pago" vira ação — e o cartão que a análise aprovou e ainda não foi
   * cobrado (`charge.antifraud_approved`): o Medusa chama o
   * `authorizePayment`, e é lá que ele é cobrado. O Medusa ignora falha e
   * cancelamento vindos de webhook, e quem cuida deles é a conciliação.
   */
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const nada = { action: PaymentActions.NOT_SUPPORTED }

    const cabecalho = payload.headers?.["x-webhook-segredo"]
    const recebido = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho
    if (!this.segredoDoWebhook || !segredosIguais(String(recebido ?? ""), this.segredoDoWebhook)) {
      this.logger.warn("[pagarme] aviso sem o segredo certo — ignorado")
      return nada
    }

    const corpo = (payload.data ?? {}) as {
      type?: unknown
      data?: { id?: unknown; order?: { id?: unknown } }
    }
    const tipo = typeof corpo.type === "string" ? corpo.type : ""
    const candidato = tipo.startsWith("order.") ? corpo.data?.id : corpo.data?.order?.id
    if (typeof candidato !== "string" || !/^or_[A-Za-z0-9]+$/.test(candidato)) return nada

    const pedido = await this.cliente.lerPedido(candidato)
    const sessao = pedido.code ?? ""
    // Pedido que não nasceu de uma sessão do Medusa (link de pagamento feito
    // à mão no painel, outra integração na mesma conta) não é da nossa conta.
    if (!CODIGO_DE_SESSAO.test(sessao)) return nada

    // A forma não muda o que é "pago"; só o nome da situação.
    const pago = traduzir(pedido, "pix").status === PaymentSessionStatus.CAPTURED
    const aCobrar = !pago && podeCobrar(pedido).cobrar
    this.logger.info(
      `[pagarme] aviso ${tipo} de ${pedido.id}: ` +
        (pago ? "pago" : aCobrar ? "aprovado na análise — vai ser cobrado" : pedido.status)
    )
    if (!pago && !aCobrar) return nada

    return {
      action: PaymentActions.SUCCESSFUL,
      data: { session_id: sessao, amount: emReais(Number(pedido.amount)) },
    }
  }

  /* ── a cobrança do cartão, depois da análise ─────────────────────────────── */

  /**
   * NO CHECKOUT, uns segundos de espera pela análise de fraude do cartão
   * recém-autorizado (`ESPERAS_DA_ANALISE_MS`), relendo o pedido — e cobra,
   * se ela aprovar. Resposta "manual" (uma pessoa analisando) não chega em
   * segundos: não espera. Pix passa direto.
   */
  private async esperarAAnalise(
    pedido: PedidoPagarme,
    forma: Forma,
    codigo: string
  ): Promise<PedidoPagarme> {
    if (forma !== "cartao") return pedido
    let atual = pedido
    for (const ms of ESPERAS_DA_ANALISE_MS) {
      const decisao = podeCobrar(atual)
      if (decisao.cobrar || (decisao.porque !== "pendente" && decisao.porque !== "sem-resposta")) {
        break
      }
      await esperar(ms)
      atual = await this.cliente.lerPedido(atual.id).catch(() => atual)
    }
    return this.cobrarSePuder(atual, codigo)
  }

  /**
   * COBRA O CARTÃO se a análise deixou (`podeCobrar`), e devolve o pedido
   * RELIDO: é a leitura que diz se cobrou. A cobrança pode ter saído e a
   * resposta se perdido, ou ter sido feita um instante antes por outro
   * caminho (o aviso e a conciliação chegando juntos). Sem conseguir reler,
   * volta o pedido de antes — a sessão continua em análise, e a próxima
   * passada (aviso ou conciliação) confere.
   *
   * E desfaz a reserva que a análise reprovou e o Pagar.me não desfez.
   */
  private async cobrarSePuder(pedido: PedidoPagarme, codigo: string): Promise<PedidoPagarme> {
    const reprovada = reservaPraDesfazer(pedido)
    if (reprovada) {
      await this.cliente.cancelarCobranca(reprovada).catch((e) => {
        this.logger.warn(
          `[pagarme] a análise reprovou ${pedido.id} e a reserva no cartão não foi desfeita agora ` +
            `(${mensagemDe(e)}) — o Pagar.me solta sozinho, e a conciliação tenta de novo`
        )
      })
      return pedido
    }

    const decisao = podeCobrar(pedido)
    if (!decisao.cobrar) return pedido
    try {
      await this.cliente.capturarCobranca(decisao.cobranca, decisao.valor)
    } catch (e) {
      this.logger.warn(
        `[pagarme] a cobrança do cartão de ${pedido.id} (${codigo}) não respondeu certo: ` +
          `${mensagemDe(e)} — conferindo no Pagar.me`
      )
    }
    const relido = await this.cliente.lerPedido(pedido.id).catch(() => null)
    if (!relido) return pedido
    if (traduzir(relido, "cartao").status === PaymentSessionStatus.CAPTURED) {
      this.logger.info(
        `[pagarme] ${pedido.id} cobrado (${decisao.valor} centavos) ` +
          (decisao.porque === "aprovada"
            ? "depois de a análise de fraude aprovar"
            : "sem resposta da análise de fraude em 10 minutos")
      )
    } else {
      this.logger.warn(
        `[pagarme] ${pedido.id} continua sem cobrança depois de pedir a captura ` +
          `(${relido.charges?.[0]?.status ?? "?"}) — a conciliação tenta de novo`
      )
    }
    return relido
  }

  /* ── utilidades ─────────────────────────────────────────────────────────── */

  /** O estado inteiro, e a entrada zerada — é aqui que o CPF sai da sessão. */
  private responder({ status, estado }: Traduzido): AuthorizePaymentOutput {
    return { status, data: gravar(estado) }
  }

  /**
   * `error` com a frase pra tela. O Medusa grava estes dados na sessão
   * mesmo recusando, e é de lá que a loja lê o que mostrar.
   */
  private falha(estado: Estado | null, motivo: string, frase: string): AuthorizePaymentOutput {
    this.logger.warn(`[pagarme] não autorizado: ${motivo}`)
    return {
      status: PaymentSessionStatus.ERROR,
      data: gravar({
        ...(estado ?? estadoNovo("pix", 0, 1)),
        situacao: "falhou",
        recusa: frase,
      }),
    }
  }

  private exigirPedido(data: Record<string, unknown> | undefined): Estado {
    const estado = lerEstado(data)
    if (!estado?.pedido) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Pagamento sem pedido no Pagar.me.")
    }
    return estado
  }
}
