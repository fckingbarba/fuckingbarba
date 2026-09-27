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
import { emCentavos, origemDestaLoja } from "../../lib/pagamento/comum"
import { conferirEntrada, type EntradaDaLoja } from "../../lib/pagamento/entrada"
import type { Estado, Situacao } from "../../lib/pagamento/estado"
import { sinal } from "../../lib/observabilidade/sinal"
import { acaoDoAviso, assinaturaConfere, CODIGO_DE_SESSAO } from "./aviso"
import {
  clienteDoMercadoPago,
  ENDERECO_PADRAO,
  ErroDoMercadoPago,
  type ClienteDoMercadoPago,
  type PagamentoMP,
} from "./client"
import { montarPix } from "./pedido"
import {
  CHAVE_DA_ENTRADA,
  estadoNovo,
  gravar,
  lerEstado,
  RECUSAS,
  traduzir,
  type Traduzido,
} from "./situacao"

/**
 * O PROVEDOR DO MERCADO PAGO — só Pix, a reserva do Pagar.me (0140).
 *
 * Registrado no `medusa-config.ts` com `id: "mercadopago"`, o que faz o
 * Medusa chamá-lo de `pp_mercadopago_mercadopago`. É o MESMO desenho do
 * provedor do Pagar.me (`modules/pagarme/service.ts`, onde cada escolha tem
 * o porquê), sem o que é de cartão:
 *
 *   1. a loja abre a sessão com a entrada (`initiatePayment`): só confere,
 *      nada vai pro Mercado Pago;
 *   2. o Medusa fecha o carrinho e chama `authorizePayment`, que é onde o Pix
 *      nasce lá — com o id da sessão na referência E na chave de
 *      idempotência. O pedido fecha "aguardando o Pix", com o QR;
 *   3. o Pix é pago: o Mercado Pago avisa direto no Medusa
 *      (`/hooks/payment/mercadopago_mercadopago`, ver `aviso.ts`), e o
 *      `getWebhookActionAndData` confere a assinatura e LÊ o pagamento na
 *      API antes de acreditar;
 *   4. o que o aviso não resolve — Pix vencido, aviso perdido, a criação que
 *      sumiu no caminho, o Pix cuja sessão sumiu — a conciliação resolve, de
 *      5 em 5 minutos (`lib/conciliar-mercadopago.ts`).
 *
 * O PAGAMENTO É ACHADO PELA REFERÊNCIA, NUNCA PELOS DADOS DA SESSÃO — a
 * referência é o id da sessão, que o Medusa passa por fora dos dados. Os
 * dados passam pela mão de quem chama a API pública (a caixa do porquê está
 * no `modules/pagarme/situacao.ts`).
 *
 * DIFERENTE DO PAGAR.ME, aqui o Pix pendente SE CANCELA (`PUT` com
 * `cancelled`): o QR do pedido cancelado morre na hora, em vez de ficar
 * pagável até vencer.
 *
 * SEM O TOKEN O PROVEDOR SOBE MESMO ASSIM, e avisa no log: derrubar o
 * servidor no arranque derrubaria o Pagar.me junto. Sem token, ele só não
 * cobra — e o script da região não o liga.
 */

type Opcoes = {
  tokenDeAcesso?: string
  /** A "assinatura secreta" dos avisos (Suas integrações → Webhooks). */
  segredoDoAviso?: string
  /** Quanto tempo o QR vale — o Mercado Pago não aceita menos de 30 minutos. */
  pixMinutos?: number
  url?: string
}

const PIX_MINUTOS_PADRAO = 30

/**
 * A criação que não respondeu é mandada de novo com a MESMA chave de
 * idempotência: se ela tinha nascido, volta a mesma; se não, nasce agora.
 * Duas vezes, com uma espera antes de cada uma.
 */
const REPETICOES_MS = [1_500, 4_000]

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Situações de onde uma sessão não volta a ser paga — ver o `authorizePayment` do Pagar.me. */
const SEM_VOLTA = new Set<Situacao>(["incerto", "cancelado", "estornado", "falhou", "recusado"])

export default class MercadoPagoServico extends AbstractPaymentProvider<Opcoes> {
  static identifier = "mercadopago"

  private readonly cliente: ClienteDoMercadoPago
  private readonly logger: Logger
  private readonly segredoDoAviso: string
  private readonly pixMinutos: number
  private readonly origem = origemDestaLoja()

  constructor(cradle: Record<string, unknown>, opcoes: Opcoes = {}) {
    super(cradle, opcoes)
    this.logger = cradle.logger as Logger
    this.segredoDoAviso = opcoes.segredoDoAviso ?? ""
    this.pixMinutos =
      Number.isInteger(opcoes.pixMinutos) && (opcoes.pixMinutos ?? 0) >= 5
        ? (opcoes.pixMinutos as number)
        : PIX_MINUTOS_PADRAO
    this.cliente = clienteDoMercadoPago(opcoes.tokenDeAcesso ?? "", opcoes.url || ENDERECO_PADRAO)

    if (!opcoes.tokenDeAcesso) {
      this.logger.info(
        "[mercadopago] MERCADOPAGO_ACCESS_TOKEN ausente — o Pix reserva está desligado " +
          "(o provedor sobe, mas não cobra nada)."
      )
    } else {
      if (opcoes.tokenDeAcesso.startsWith("TEST-")) {
        this.logger.info("[mercadopago] token de TESTE: nenhuma cobrança é de verdade")
      }
      if (!this.segredoDoAviso) {
        this.logger.warn(
          "[mercadopago] MERCADOPAGO_WEBHOOK_SEGREDO ausente — todo aviso do Mercado Pago vai " +
            "ser ignorado, e Pix pago só vira pedido pago pela conciliação, a cada 5 minutos."
        )
      }
    }
  }

  /* ── 1. abrir a sessão ──────────────────────────────────────────────────── */

  /**
   * Confere a entrada e guarda. Não fala com o Mercado Pago. O valor é o do
   * Medusa (`amount`), e o estado nasce INTEIRO — ver o do Pagar.me.
   */
  async initiatePayment({
    amount,
    currency_code,
    data,
  }: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    if (String(currency_code).toLowerCase() !== "brl") {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "O Mercado Pago só cobra em reais.")
    }
    const valor = emCentavos(amount)
    if (!Number.isInteger(valor) || valor <= 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Valor de pagamento inválido.")
    }
    const entrada = this.entradaDoPix(data?.[CHAVE_DA_ENTRADA], valor)
    return {
      id: typeof data?.session_id === "string" ? data.session_id : "",
      data: gravar(estadoNovo("pix", valor, 1), entrada),
      status: PaymentSessionStatus.PENDING,
    }
  }

  /** Sessão ainda não enviada é conferida de novo com o valor novo — como a do Pagar.me. */
  async updatePayment({ data, amount }: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const estado = lerEstado(data)
    if (estado?.situacao === "nova") {
      const valor = emCentavos(amount)
      const entrada = this.entradaDoPix(data?.[CHAVE_DA_ENTRADA], valor)
      return { data: gravar(estadoNovo("pix", valor, 1), entrada) }
    }
    return { data: data ?? {} }
  }

  /* ── 2. autorizar: onde o Pix nasce no Mercado Pago ─────────────────────── */

  async authorizePayment({
    data,
    context,
  }: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const estado = lerEstado(data)
    const codigo = context?.idempotency_key ?? ""
    if (!estado || !CODIGO_DE_SESSAO.test(codigo)) {
      return this.falha(estado, "sessão sem estado do Mercado Pago ou sem código", RECUSAS.fora)
    }

    /*
      O QUE EXISTE LÁ PRA ESTA SESSÃO, pela referência. No checkout é a trava
      contra gerar dois Pix pra mesma compra (a resposta que se perdeu); depois
      (aviso, conciliação), é o "e agora, pagou?" — e aí, se a pergunta falhar,
      ESTOURA: o Medusa não mexe na sessão, que continua pendente pra próxima
      vez.
    */
    let pagamento: PagamentoMP | null
    try {
      pagamento = await this.cliente.buscarDaSessao(codigo, estado.pedido)
    } catch (e) {
      if (estado.situacao !== "nova") throw e
      pagamento = null
    }

    if (pagamento) {
      // Sessão que já teve fim não ressuscita: quem decide o destino dela é
      // a conciliação (a caixa "SESSÃO QUE JÁ TEVE FIM" do Pagar.me).
      if (SEM_VOLTA.has(estado.situacao)) {
        const lido = traduzir(pagamento)
        if (lido.status === PaymentSessionStatus.CAPTURED) {
          this.logger.error(
            `[mercadopago] ${pagamento.id} consta PAGO, e a sessão ${codigo} já tinha terminado ` +
              `como "${estado.situacao}". Não vira pedido: a conciliação estorna.`
          )
        }
        return {
          status: PaymentSessionStatus.ERROR,
          data: gravar({ ...lido.estado, situacao: estado.situacao, recusa: estado.recusa }),
        }
      }
      return this.responder(traduzir(pagamento))
    }

    if (estado.situacao !== "nova") {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `A sessão ${codigo} está "${estado.situacao}" e o Mercado Pago não tem pagamento com ` +
          "essa referência."
      )
    }

    let entrada: EntradaDaLoja
    try {
      entrada = this.entradaDoPix(data?.[CHAVE_DA_ENTRADA], estado.valor)
    } catch (e) {
      return this.falha(estado, mensagemDe(e), RECUSAS.fora)
    }

    const corpo = montarPix(entrada, estado.valor, codigo, this.pixMinutos, this.origem)
    try {
      pagamento = await this.cliente.criarPix(corpo, codigo)
    } catch (e) {
      if (!(e instanceof ErroDoMercadoPago)) throw e
      if (!e.incerto) {
        // 4xx: nada foi criado.
        return this.falha(estado, `Pix recusado na entrada (${codigo}): ${e.message}`, RECUSAS.pix)
      }
      // Rede ou 5xx: pode ter nascido. A mesma chave devolve o mesmo, se nasceu.
      this.logger.warn(`[mercadopago] criação sem resposta (${codigo}): ${e.message}`)
      pagamento = null
      for (const ms of REPETICOES_MS) {
        await esperar(ms)
        try {
          pagamento = await this.cliente.criarPix(corpo, codigo)
          break
        } catch (outra) {
          if (!(outra instanceof ErroDoMercadoPago) || !outra.incerto) {
            return this.falha(
              estado,
              `Pix recusado na segunda tentativa (${codigo}): ${mensagemDe(outra)}`,
              RECUSAS.pix
            )
          }
        }
      }
      if (!pagamento) {
        this.logger.error(
          `[mercadopago] não sei se ${codigo} gerou Pix. A conciliação procura pela referência ` +
            "e cancela o que achar."
        )
        /*
          "Incerto" pra conciliação — que procura pela referência e cancela o
          Pix que tiver nascido —, mas a frase é a do Pix: o QR não chegou a
          ninguém, e Pix que ninguém viu não cobra ninguém.
        */
        return {
          status: PaymentSessionStatus.ERROR,
          data: gravar({ ...estado, situacao: "incerto", recusa: RECUSAS.pix }),
        }
      }
    }

    /*
      A ÚLTIMA TRAVA: o que o Mercado Pago vai cobrar é o valor da sessão, e o
      pagamento é desta sessão. Se não for — só com um bug na montagem —, o Pix
      é cancelado lá (o QR morre) e a compra não fecha.
    */
    const lido = traduzir(pagamento)
    if (lido.estado.valor !== estado.valor || pagamento.external_reference !== codigo) {
      this.logger.error(
        `[mercadopago] ${pagamento.id} saiu com ${lido.estado.valor} centavos e a referência ` +
          `"${pagamento.external_reference}"; a sessão é ${codigo}, de ${estado.valor}. Cancelando.`
      )
      await this.cliente.cancelar(pagamento.id).catch(() => null)
      return this.falha(estado, "valor ou referência divergente", RECUSAS.fora)
    }

    this.logger.info(
      `[mercadopago] ${codigo} → ${pagamento.id}: ${lido.estado.situacao} (${estado.valor} centavos)`
    )
    return this.responder(lido)
  }

  /* ── o que o Medusa faz com um pagamento já registrado ──────────────────── */

  /** Só com o Mercado Pago dizendo "pago" o Medusa marca capturado. */
  async capturePayment({ data }: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const estado = this.exigirPagamento(data)
    const lido = traduzir(await this.cliente.lerPagamento(estado.pedido!))
    if (lido.status !== PaymentSessionStatus.CAPTURED) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `O Mercado Pago ainda não confirmou o pagamento ${estado.pedido} (${lido.estado.situacao}).`
      )
    }
    return { data: gravar(lido.estado) }
  }

  /**
   * O Medusa desiste de um pagamento. Pendente, o Pix é CANCELADO lá (o QR
   * morre); já pago, é estornado — os caminhos em que o Medusa chama isto
   * com o dinheiro dentro são os do pedido que não vai existir. O pagamento
   * é o LIDO agora, pelo id que o próprio provedor gravou.
   */
  async cancelPayment({ data }: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const estado = lerEstado(data)
    if (!estado?.pedido) return { data: data ?? {} }

    const pagamento = await this.cliente.lerPagamento(estado.pedido)
    const lido = traduzir(pagamento)

    if (lido.status === PaymentSessionStatus.CAPTURED) {
      const resta = lido.estado.valor - lido.estado.estornado
      if (resta > 0) {
        await this.cliente.estornar(pagamento.id, resta, this.chaveDoEstorno(lido.estado, resta))
      }
      this.logger.warn(
        `[mercadopago] ${pagamento.id} estava pago e o pagamento foi desfeito: estornado`
      )
      return {
        data: gravar({ ...lido.estado, situacao: "estornado", estornado: lido.estado.valor }),
      }
    }
    if (lido.status === PaymentSessionStatus.PENDING_AUTHORIZATION) {
      await this.cliente.cancelar(pagamento.id)
    }
    return { data: gravar({ ...lido.estado, situacao: "cancelado" }) }
  }

  /**
   * Devolve o dinheiro — tudo ou parte — pra conta de quem pagou o Pix. O
   * que já voltou por outro caminho conta (a caixa do `refundPayment` do
   * Pagar.me), e a chave de idempotência faz o mesmo estorno pedido duas
   * vezes sair uma.
   */
  async refundPayment({ data, amount }: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const estado = this.exigirPagamento(data)
    const centavos = emCentavos(amount)
    if (!Number.isInteger(centavos) || centavos <= 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Valor de estorno inválido.")
    }
    const resta = estado.valor - estado.estornado
    if (centavos > resta) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Estorno de ${centavos} centavos em ${estado.pedido}, que só tem ${Math.max(resta, 0)} ` +
          "a devolver — o resto já foi estornado."
      )
    }

    const estorno = await this.cliente.estornar(
      estado.pedido!,
      centavos,
      this.chaveDoEstorno(estado, centavos)
    )
    const situacaoDoEstorno = String(estorno?.status ?? "").toLowerCase()
    if (situacaoDoEstorno === "rejected" || situacaoDoEstorno === "cancelled") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `O Mercado Pago recusou o estorno de ${centavos} centavos em ${estado.pedido} ` +
          `(${situacaoDoEstorno}).`
      )
    }
    if (situacaoDoEstorno !== "approved") {
      this.logger.warn(
        `[mercadopago] estorno de ${centavos} centavos em ${estado.pedido} aceito como ` +
          `"${situacaoDoEstorno || "?"}" — a conciliação confere se o dinheiro voltou`
      )
    }
    const estornado = estado.estornado + centavos
    this.logger.info(`[mercadopago] estorno de ${centavos} centavos em ${estado.pedido}`)
    return {
      data: gravar({
        ...estado,
        estornado,
        situacao: estornado >= estado.valor ? "estornado" : estado.situacao,
      }),
    }
  }

  /**
   * A sessão está sendo jogada fora. AQUI NÃO SE MEXE NO MERCADO PAGO, pelo
   * mesmo motivo do Pagar.me (o `data` pode ser o corpo cru da API pública):
   * o Pix que perdeu a sessão, a conciliação acha pela referência.
   */
  async deletePayment({ data }: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: data ?? {} }
  }

  async getPaymentStatus({ data }: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const estado = lerEstado(data)
    if (!estado?.pedido) return { status: PaymentSessionStatus.PENDING, data: data ?? {} }
    const lido = traduzir(await this.cliente.lerPagamento(estado.pedido))
    return { status: lido.status, data: gravar(lido.estado) }
  }

  async retrievePayment({ data }: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    const estado = lerEstado(data)
    if (!estado?.pedido) return { data: data ?? {} }
    const lido = traduzir(await this.cliente.lerPagamento(estado.pedido))
    return { data: gravar(lido.estado) }
  }

  /* ── 3. o aviso ─────────────────────────────────────────────────────────── */

  /**
   * O aviso que chegou em `/hooks/payment/mercadopago_mercadopago` — direto
   * do Mercado Pago (ver `aviso.ts`). Sem a assinatura certa, nada acontece;
   * com ela, o corpo só diz QUAL pagamento olhar, e o status vem da API. Só
   * "pago" vira ação; a sessão é a da referência do pagamento lido, nunca a
   * do corpo.
   */
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const nada = { action: PaymentActions.NOT_SUPPORTED }
    const um = (v: unknown) => String((Array.isArray(v) ? v[0] : v) ?? "")

    const corpo = (payload.data ?? {}) as { type?: unknown; data?: { id?: unknown } }
    const idDoDado =
      corpo.data?.id === undefined || corpo.data?.id === null ? "" : um(corpo.data.id)

    const assinado = assinaturaConfere({
      assinatura: um(payload.headers?.["x-signature"]),
      requisicao: um(payload.headers?.["x-request-id"]),
      idDoDado,
      segredo: this.segredoDoAviso,
    })
    if (!assinado) {
      this.logger.warn("[mercadopago] aviso sem a assinatura certa — ignorado")
      return nada
    }
    sinal({ integracao: "mercadopago-aviso", ok: true })

    if (um(corpo.type) !== "payment" || !/^\d+$/.test(idDoDado)) return nada

    const pagamento = await this.cliente.lerPagamento(idDoDado)
    const acao = acaoDoAviso(pagamento, this.origem)
    this.logger.info(
      `[mercadopago] aviso de ${pagamento.id}: ${pagamento.status ?? "?"}` +
        (acao ? ` — pagamento da sessão ${acao.session_id}` : "")
    )
    if (!acao) return nada
    return { action: PaymentActions.SUCCESSFUL, data: acao }
  }

  /* ── utilidades ─────────────────────────────────────────────────────────── */

  /** A entrada conferida, e só Pix: o Mercado Pago é a reserva do Pix. */
  private entradaDoPix(bruto: unknown, valor: number): EntradaDaLoja {
    const entrada = conferirEntrada(bruto, valor)
    if (entrada.forma !== "pix") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Pagamento recusado antes de sair: o Mercado Pago aqui só recebe Pix"
      )
    }
    return entrada
  }

  /** Qual estorno é este: o do pagamento, a partir do que já voltou, deste valor. */
  private chaveDoEstorno(estado: Estado, centavos: number) {
    return `estorno-${estado.pedido}-${estado.estornado}-${centavos}`
  }

  /** O estado inteiro, e a entrada zerada — é aqui que o CPF sai da sessão. */
  private responder({ status, estado }: Traduzido): AuthorizePaymentOutput {
    return { status, data: gravar(estado) }
  }

  /** `error` com a frase pra tela — a loja lê da sessão o que mostrar. */
  private falha(estado: Estado | null, motivo: string, frase: string): AuthorizePaymentOutput {
    this.logger.warn(`[mercadopago] não autorizado: ${motivo}`)
    return {
      status: PaymentSessionStatus.ERROR,
      data: gravar({ ...(estado ?? estadoNovo("pix", 0, 1)), situacao: "falhou", recusa: frase }),
    }
  }

  private exigirPagamento(data: Record<string, unknown> | undefined): Estado {
    const estado = lerEstado(data)
    if (!estado?.pedido) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Pagamento sem Pix no Mercado Pago.")
    }
    return estado
  }
}
