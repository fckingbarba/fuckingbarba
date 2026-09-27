import { sinal } from "../../lib/observabilidade/sinal"

/**
 * O CLIENTE DO MERCADO PAGO — a API de pagamentos, e só o formato DELES.
 *
 *   https://api.mercadopago.com/v1/payments
 *   autenticação: Bearer, com o Access Token de produção da aplicação
 *
 * A mesma divisão do Pagar.me (`modules/pagarme/client.ts`): aqui mora o
 * formato de lá (nomes de campo, valor em reais, a referência externa); no
 * `service.ts`, a regra nossa. E só o pedaço que o Pix usa: criar, ler,
 * procurar pela referência, listar os recentes, cancelar e estornar.
 *
 * ┌─ A CONTA É A MESMA DAS VENDAS DO MERCADO LIVRE ────────────────────────┐
 * │ O que o Mercado Livre vende passa por esta mesma conta. Então NADA     │
 * │ aqui mexe num pagamento só por ele existir: é da loja o que tem a      │
 * │ referência de uma sessão nossa (`payses_…`) E a origem desta           │
 * │ instalação no `metadata` (ver `origemDestaLoja`). O resto é de outro   │
 * │ canal, e ninguém toca — nem a conciliação, nem o aviso.                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A CHAVE DE IDEMPOTÊNCIA ──────────────────────────────────────────────┐
 * │ Todo POST leva `X-Idempotency-Key` — a API exige, e é ela que desfaz a │
 * │ dúvida "criou ou não criou?": a criação do Pix vai com o id da sessão, │
 * │ e mandar de novo com a mesma chave devolve o MESMO pagamento em vez de │
 * │ criar outro. É o que o Pagar.me não tem, e lá vira busca por código.   │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

export const ENDERECO_PADRAO = "https://api.mercadopago.com"

/** Um pagamento, como a API devolve — só os campos que a loja lê. */
export type PagamentoMP = {
  id: number | string
  /** pending, approved, in_process, rejected, cancelled, refunded, charged_back… */
  status?: string
  /** pending_waiting_transfer, accredited, expired, by_collector… */
  status_detail?: string
  external_reference?: string | null
  /** Em REAIS. */
  transaction_amount?: number
  /** Em REAIS: o quanto já voltou. */
  transaction_amount_refunded?: number
  payment_method_id?: string
  date_created?: string
  date_approved?: string | null
  date_of_expiration?: string | null
  metadata?: Record<string, unknown> | null
  point_of_interaction?: {
    transaction_data?: {
      /** O copia-e-cola. */
      qr_code?: string
      /** A imagem do QR, PNG em base64. */
      qr_code_base64?: string
      ticket_url?: string
    } | null
  } | null
  refunds?: EstornoMP[] | null
}

export type EstornoMP = {
  id?: number | string
  payment_id?: number | string
  /** Em REAIS. */
  amount?: number
  /** approved, in_process, rejected, cancelled… */
  status?: string
  date_created?: string
}

/** O corpo da criação de um Pix — ver `pedido.ts`. */
export type CorpoDoPix = {
  /** Em REAIS. */
  transaction_amount: number
  description: string
  payment_method_id: "pix"
  /** O id da sessão do Medusa — é por ele que a loja acha o pagamento. */
  external_reference: string
  /** "2026-09-27T15:31:00.000-03:00": de 30 minutos a 30 dias pra frente. */
  date_of_expiration: string
  payer: {
    email: string
    first_name: string
    last_name: string
    identification: { type: "CPF" | "CNPJ"; number: string }
  }
  metadata: { origem: string; sessao: string }
}

/**
 * O que deu errado, e se dá pra saber se o pagamento nasceu:
 *
 * - `rede`: a conexão caiu ou o tempo acabou — a criação PODE ter
 *   acontecido lá;
 * - `servidor`: 5xx. Mesma dúvida da rede;
 * - `validacao`: 400. Nada foi criado; o que mandamos estava errado;
 * - `autenticacao`: 401/403. Token errado, ou de outro ambiente;
 * - `nao_encontrado`: 404.
 */
export type TipoDeErro = "rede" | "servidor" | "validacao" | "autenticacao" | "nao_encontrado"

export class ErroDoMercadoPago extends Error {
  constructor(
    message: string,
    readonly tipo: TipoDeErro,
    readonly status?: number
  ) {
    super(message)
    this.name = "ErroDoMercadoPago"
  }

  /** Rede ou 5xx: não dá pra saber se o pagamento nasceu do lado de lá. */
  get incerto() {
    return this.tipo === "rede" || this.tipo === "servidor"
  }
}

export type ClienteDoMercadoPago = ReturnType<typeof clienteDoMercadoPago>

/**
 * Tempo de espera: 15 segundos pra CRIAR (o Pix nasce em menos de um; mais
 * que isso é o Mercado Pago com problema, e a loja precisa responder a quem
 * está no checkout), 10 pra LER.
 */
const PRA_CRIAR = 15_000
const PRA_LER = 10_000

/** Quantos a busca traz por página. O máximo que a API aceita é 100. */
const POR_PAGINA = 50

export function clienteDoMercadoPago(token: string, url = ENDERECO_PADRAO) {
  const base = url.replace(/\/+$/, "")

  async function chamar<T>(
    metodo: "GET" | "POST" | "PUT",
    caminho: string,
    corpo: unknown,
    tempoLimite: number,
    chaveIdempotente?: string
  ): Promise<T> {
    if (!token) throw new ErroDoMercadoPago("MERCADOPAGO_ACCESS_TOKEN ausente", "autenticacao")

    const desistir = new AbortController()
    const relogio = setTimeout(() => desistir.abort(), tempoLimite)

    let resposta: Response
    try {
      resposta = await fetch(`${base}${caminho}`, {
        method: metodo,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          ...(corpo === undefined ? {} : { "content-type": "application/json" }),
          ...(chaveIdempotente ? { "x-idempotency-key": chaveIdempotente } : {}),
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: desistir.signal,
      })
    } catch (e) {
      const abortou = e instanceof Error && e.name === "AbortError"
      const motivo = abortou
        ? `o Mercado Pago não respondeu em ${tempoLimite / 1000}s (${metodo} ${caminho.split("?")[0]})`
        : `falha de rede falando com o Mercado Pago (${metodo} ${caminho.split("?")[0]})`
      sinal({
        integracao: "mercadopago",
        ok: false,
        resumo: motivo,
        detalhe: `[mercadopago] ${motivo}`,
      })
      throw new ErroDoMercadoPago(motivo, "rede")
    } finally {
      clearTimeout(relogio)
    }

    // Erro de negócio (4xx) é o Mercado Pago respondendo; fora do ar é 5xx, e o token é 401/403.
    const status = resposta.status
    sinal(
      status >= 500 || status === 401 || status === 403
        ? {
            integracao: "mercadopago",
            ok: false,
            resumo: `o Mercado Pago respondeu ${status}`,
            detalhe: `[mercadopago] ${metodo} ${caminho.split("?")[0]} → ${status}`,
          }
        : { integracao: "mercadopago", ok: true }
    )

    const texto = await resposta.text()
    let json: unknown = null
    try {
      json = texto ? JSON.parse(texto) : null
    } catch {
      json = null
    }

    if (!resposta.ok) {
      const tipo: TipoDeErro =
        status === 401 || status === 403
          ? "autenticacao"
          : status === 404
            ? "nao_encontrado"
            : status >= 500
              ? "servidor"
              : "validacao"
      // A mensagem deles diz O QUE está errado ("date_of_expiration…"), sem
      // repetir dado de quem compra.
      const mensagem = (json as { message?: unknown } | null)?.message
      throw new ErroDoMercadoPago(
        `o Mercado Pago respondeu ${status} em ${metodo} ${caminho.split("?")[0]}` +
          (typeof mensagem === "string" ? `: ${mensagem}` : ""),
        tipo,
        status
      )
    }

    return json as T
  }

  return {
    /** Cria o Pix. A chave de idempotência é o id da sessão: mandar de novo devolve o mesmo. */
    criarPix: (corpo: CorpoDoPix, chaveIdempotente: string) =>
      chamar<PagamentoMP>("POST", "/v1/payments", corpo, PRA_CRIAR, chaveIdempotente),

    lerPagamento: (id: string | number) =>
      chamar<PagamentoMP>(
        "GET",
        `/v1/payments/${encodeURIComponent(String(id))}`,
        undefined,
        PRA_LER
      ),

    /**
     * O pagamento criado com esta referência (o id da sessão), ou null.
     *
     * O filtro é deles; a conferência da referência é nossa. Com mais de um
     * (não devia: a criação é idempotente), fica o que chegou mais longe.
     */
    async buscarPorReferencia(codigo: string): Promise<PagamentoMP | null> {
      const lista = await chamar<{ results?: PagamentoMP[] }>(
        "GET",
        `/v1/payments/search?external_reference=${encodeURIComponent(codigo)}` +
          "&sort=date_created&criteria=desc&limit=10",
        undefined,
        PRA_LER
      )
      const deste = (lista?.results ?? []).filter((p) => p.external_reference === codigo)
      return (
        deste.find((p) => p.status === "approved" || p.status === "refunded") ?? deste[0] ?? null
      )
    },

    /**
     * O pagamento DESTA sessão: pela referência e, se a busca ainda não
     * trouxer (ela demora uns segundos pra indexar o que acabou de nascer),
     * pelo id que o provedor gravou — aceito só se a referência dele for a
     * da sessão. Um id posto por fora no `data` não leva a pagamento de
     * outra pessoa.
     */
    async buscarDaSessao(codigo: string, idGravado?: string | null): Promise<PagamentoMP | null> {
      const achado = await this.buscarPorReferencia(codigo)
      if (achado || !idGravado) return achado
      try {
        const porId = await this.lerPagamento(idGravado)
        return porId.external_reference === codigo ? porId : null
      } catch (e) {
        if (e instanceof ErroDoMercadoPago && e.tipo === "nao_encontrado") return null
        throw e
      }
    },

    /**
     * Os pagamentos criados nos últimos `dias`, uma página por vez — é por
     * aqui que a conciliação acha o Pix cuja sessão sumiu. Vem tudo o que a
     * conta recebeu (as vendas do Mercado Livre também): quem filtra o que é
     * da loja é a conciliação, pela referência E pela origem.
     */
    async listarRecentes(
      dias: number,
      offset: number
    ): Promise<{ pagamentos: PagamentoMP[]; mais: boolean }> {
      const lista = await chamar<{
        results?: PagamentoMP[]
        paging?: { total?: number; offset?: number; limit?: number } | null
      }>(
        "GET",
        `/v1/payments/search?range=date_created&begin_date=NOW-${dias}DAYS&end_date=NOW` +
          `&sort=date_created&criteria=desc&limit=${POR_PAGINA}&offset=${offset}`,
        undefined,
        PRA_LER
      )
      const pagamentos = lista?.results ?? []
      const total = Number(lista?.paging?.total ?? 0)
      return { pagamentos, mais: pagamentos.length > 0 && offset + pagamentos.length < total }
    },

    /** Cancela o Pix que ninguém pagou: o QR morre na hora. Pago não se cancela — estorna. */
    cancelar: (id: string | number) =>
      chamar<PagamentoMP>(
        "PUT",
        `/v1/payments/${encodeURIComponent(String(id))}`,
        { status: "cancelled" },
        PRA_CRIAR
      ),

    /**
     * Devolve o dinheiro — tudo ou parte, em centavos. A chave de
     * idempotência vem de quem chama e diz QUAL estorno é este: o mesmo
     * estorno pedido duas vezes (o Medusa tentando de novo) sai uma vez só.
     */
    estornar: (id: string | number, centavos: number, chaveIdempotente: string) =>
      chamar<EstornoMP>(
        "POST",
        `/v1/payments/${encodeURIComponent(String(id))}/refunds`,
        { amount: centavos / 100 },
        PRA_CRIAR,
        chaveIdempotente
      ),
  }
}
