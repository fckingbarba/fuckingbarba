import { createHash, timingSafeEqual } from "node:crypto"
import type { BigNumberInput } from "@medusajs/framework/types"
import { BigNumber } from "@medusajs/framework/utils"

/**
 * O CLIENTE DO PAGAR.ME — a API v5, e só o formato DELES.
 *
 *   https://api.pagar.me/core/v5
 *   autenticação: Basic, com a chave secreta de usuário e a senha vazia
 *
 * Mesma divisão do `modules/frenet/client.ts`: aqui mora o que é formato do
 * Pagar.me (nomes de campo, centavos, "linha 1 do endereço"); do outro lado,
 * no `service.ts`, mora o que é regra nossa (quantas parcelas, quanto tempo
 * vale o Pix, o que dizer pra quem teve o cartão recusado). Quando a API
 * mudar um nome de campo, muda este arquivo e só ele.
 *
 * ┌─ O QUE ESTA API FAZ QUE PARECE ERRO E NÃO É ───────────────────────────┐
 * │ 1. DINHEIRO EM CENTAVOS, inteiro. O Medusa guarda R$ 89,90 como 89.9;  │
 * │    o Pagar.me quer 8990. A conversão acontece em `emCentavos`, num     │
 * │    lugar só — `89.9 * 100` dá 8990.000000000001 em ponto flutuante, e  │
 * │    mandar isso é um 422.                                               │
 * │                                                                         │
 * │ 2. O TOTAL DO PEDIDO É A SOMA DOS ITENS MAIS `shipping.amount`. Não    │
 * │    existe campo "total" pra mandar: quem soma é ele. Por isso quem     │
 * │    monta o pedido garante que a soma dá o valor da sessão do Medusa,   │
 * │    centavo por centavo, e confere de novo na resposta.                 │
 * │                                                                         │
 * │ 3. O CARTÃO CHEGA COMO TOKEN, e o endereço de cobrança não vai junto   │
 * │    ("a entidade de billing address do cartão não é tokenizada"). Ele   │
 * │    precisa ir no pedido, em `credit_card.card.billing_address`, ao     │
 * │    lado do `card_token` — é o que o módulo oficial deles faz.          │
 * │                                                                         │
 * │ 4. NÃO EXISTE CABEÇALHO DE IDEMPOTÊNCIA. O que impede cobrar duas      │
 * │    vezes a mesma sessão é o `code` do pedido: ele é o id da sessão de  │
 * │    pagamento do Medusa, e antes de criar a gente procura por ele.      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE NUNCA VAI PRO LOG: o corpo do pedido. Ele tem CPF, telefone,
 * endereço e o token do cartão. Erro de validação do Pagar.me volta com o
 * NOME do campo recusado, e é isso que aparece.
 */

/**
 * `PAGARME_URL` existe pro mesmo propósito do `FRENET_URL`: o conferidor de
 * pagamento sobe um Pagar.me falso e aponta o backend pra ele. Sem isso, o
 * único jeito de testar recusa de cartão, Pix vencido e webhook atrasado seria
 * esperar acontecer. Em produção a variável não existe.
 */
export const ENDERECO_PADRAO = "https://api.pagar.me/core/v5"

/* ── o formato deles ──────────────────────────────────────────────────────── */

export type TransacaoPagarme = {
  id?: string
  status?: string
  transaction_type?: string
  /** Pix: o copia-e-cola. */
  qr_code?: string
  /** Pix: a imagem do QR, hospedada por eles. */
  qr_code_url?: string
  expires_at?: string
  installments?: number
  acquirer_message?: string
  acquirer_return_code?: string
  card?: { brand?: string; last_four_digits?: string }
  antifraud_response?: { status?: string; return_message?: string }
  gateway_response?: { code?: string; errors?: { message?: string }[] }
}

export type CobrancaPagarme = {
  id: string
  code?: string
  amount: number
  paid_amount?: number
  /**
   * O que já voltou. A documentação publica os dois campos e não diz qual o
   * estorno de Pix preenche — quem lê usa o maior (`devolvidoNaCobranca`).
   */
  canceled_amount?: number
  refunded_amount?: number
  /** O "Aguardando cancelamento" do painel: o estorno foi pedido e está andando. */
  pending_cancellation?: boolean
  status: string
  payment_method?: string
  updated_at?: string
  last_transaction?: TransacaoPagarme
  order?: { id: string; code?: string; status?: string }
}

/** Centavos que a cobrança diz que já voltaram pra quem pagou. */
export function devolvidoNaCobranca(c: Partial<CobrancaPagarme> | null | undefined): number {
  return Math.max(Number(c?.refunded_amount ?? 0) || 0, Number(c?.canceled_amount ?? 0) || 0)
}

export type PedidoPagarme = {
  id: string
  code?: string
  amount: number
  status: string
  created_at?: string
  metadata?: Record<string, unknown> | null
  charges?: CobrancaPagarme[]
}

export type EnderecoPagarme = {
  line_1: string
  line_2?: string
  zip_code: string
  city: string
  state: string
  country: "BR"
}

export type TelefonePagarme = { country_code: string; area_code: string; number: string }

export type CorpoDoPedido = {
  code: string
  items: { amount: number; description: string; quantity: number; code: string }[]
  customer: {
    name: string
    email: string
    document: string
    document_type: "CPF" | "CNPJ"
    type: "individual" | "company"
    phones: { mobile_phone?: TelefonePagarme; home_phone?: TelefonePagarme }
    address: EnderecoPagarme
  }
  shipping: {
    amount: number
    description: string
    recipient_name: string
    recipient_phone: string
    address: EnderecoPagarme
  }
  payments: (
    | {
        payment_method: "pix"
        amount: number
        pix: { expires_in: number }
      }
    | {
        payment_method: "credit_card"
        amount: number
        credit_card: {
          installments: number
          statement_descriptor: string
          operation_type: "auth_and_capture"
          card_token: string
          card: { billing_address: EnderecoPagarme }
        }
      }
  )[]
  ip?: string
  /** `origem`: de que instalação da loja o pedido saiu — ver `origemDestaLoja`. */
  metadata: { origem: string }
  closed: true
}

/* ── o erro ───────────────────────────────────────────────────────────────── */

/**
 * O que deu errado, em categorias que mudam o que fazer depois:
 *
 * - `rede`: não houve resposta. O pedido PODE ter sido criado do lado deles —
 *   é o único caso em que a gente não sabe se cobrou, e por isso o único que
 *   vira "incerto" e é conferido de novo pela conciliação;
 * - `servidor`: 5xx. Mesma dúvida da rede;
 * - `validacao`: 400/422. Nada foi criado; o que mandamos estava errado (ou o
 *   token do cartão venceu — ele dura 60 segundos);
 * - `autenticacao`: 401/403. Chave errada, ou de ambiente trocado;
 * - `nao_encontrado`: 404.
 */
export type TipoDeErro = "rede" | "servidor" | "validacao" | "autenticacao" | "nao_encontrado"

export class ErroDoPagarme extends Error {
  constructor(
    message: string,
    readonly tipo: TipoDeErro,
    readonly status?: number,
    /** Os NOMES dos campos recusados. Nunca o valor. */
    readonly campos: string[] = []
  ) {
    super(message)
    this.name = "ErroDoPagarme"
  }

  /** Rede ou 5xx: não dá pra saber se o pedido nasceu do lado de lá. */
  get incerto() {
    return this.tipo === "rede" || this.tipo === "servidor"
  }
}

/* ── utilidades de formato ────────────────────────────────────────────────── */

/**
 * Reais (como o Medusa guarda) pra centavos (como o Pagar.me quer).
 *
 * O Medusa entrega valor em QUATRO formatos, conforme o caminho: número,
 * texto, o `BigNumber` dele, e o valor cru `{ value: "123.5", precision }`
 * — que é o que chega no estorno (`refund.raw_amount`). Uma versão anterior
 * desta função só conhecia os três primeiros; o estorno chegava como `NaN`,
 * o cancelamento de pedido pago seguia em frente sem devolver o dinheiro, e
 * o conferidor pegou. Quem entende os quatro é o próprio `BigNumber` do
 * Medusa, então é ele que lê.
 *
 * `Math.round` e não `Math.floor`, porque 89.9 * 100 é 8990.000000000001 e
 * 0.29 * 100 é 28.999999999999996.
 */
export function emCentavos(valor: unknown): number {
  let numero: number
  try {
    numero = new BigNumber(valor as BigNumberInput).numeric
  } catch {
    return Number.NaN
  }
  if (!Number.isFinite(numero)) return Number.NaN
  return Math.round(numero * 100)
}

/** Centavos de volta pra reais — é o que o Medusa espera no webhook. */
export function emReais(centavos: number): number {
  return Math.round(centavos) / 100
}

/**
 * DE QUE INSTALAÇÃO DA LOJA o pedido saiu — vai no `metadata.origem` de todo
 * pedido criado, e a conciliação só mexe em pedido órfão com a MESMA origem.
 *
 * Por quê: a conciliação procura no Pagar.me pedidos cuja sessão sumiu do
 * Medusa, e estorna o que achar pago. Se duas instalações dividirem a mesma
 * conta — o Railway e uma máquina de desenvolvimento, as duas com a chave de
 * teste —, cada uma veria os pedidos da outra como órfãos e estornaria.
 *
 * Sai do BANCO — usuário, host, porta e nome, NUNCA a senha —, passado por
 * hash: é o que o server e o worker do Railway têm igual, sem configuração
 * nenhuma, e o que muda de uma instalação pra outra. O usuário entra porque,
 * no pooler do Supabase, o host é o mesmo pra todo projeto da região
 * (`aws-0-sa-east-1.pooler.supabase.com`) e o banco se chama `postgres` em
 * todos: quem diz QUAL projeto é o usuário, `postgres.<ref>`.
 *
 * Se o server e o worker tiverem URLs diferentes (um pelo pooler, outro
 * direto), a origem não bate e a conciliação simplesmente não mexe em órfão
 * nenhum — erra pro lado seguro. Por isso os dois leem a MESMA variável.
 */
export function origemDestaLoja(databaseUrl = process.env.DATABASE_URL ?? ""): string {
  let base = "sem-banco"
  try {
    const u = new URL(databaseUrl)
    base = `${decodeURIComponent(u.username)}@${u.hostname}:${u.port || "5432"}${u.pathname}`
  } catch {
    // URL torta: todos os processos da instalação erram igual, e a origem
    // continua sendo a mesma entre eles.
  }
  return createHash("sha256").update(base).digest("hex").slice(0, 16)
}

/** Comparação de segredo que não vaza, pelo tempo de resposta, quantas letras bateram. */
export function segredosIguais(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length || !a.length) return false
  return timingSafeEqual(a, b)
}

/* ── o cliente ────────────────────────────────────────────────────────────── */

export type ClienteDoPagarme = ReturnType<typeof clienteDoPagarme>

/**
 * Tempo de espera: 30 segundos pra CRIAR (cartão passa por antifraude e
 * adquirente antes de responder, e desistir cedo demais é justamente o que
 * cria a dúvida "cobrou ou não cobrou?"), 10 pra LER.
 */
const PRA_CRIAR = 30_000
const PRA_LER = 10_000

export function clienteDoPagarme(chaveSecreta: string, url = ENDERECO_PADRAO) {
  const base = url.replace(/\/+$/, "")
  const autorizacao = `Basic ${Buffer.from(`${chaveSecreta}:`).toString("base64")}`

  async function chamar<T>(
    metodo: "GET" | "POST" | "DELETE",
    caminho: string,
    corpo: unknown,
    tempoLimite: number
  ): Promise<T> {
    if (!chaveSecreta) {
      throw new ErroDoPagarme("PAGARME_SECRET_KEY ausente", "autenticacao")
    }

    const desistir = new AbortController()
    const relogio = setTimeout(() => desistir.abort(), tempoLimite)

    let resposta: Response
    try {
      resposta = await fetch(`${base}${caminho}`, {
        method: metodo,
        headers: {
          authorization: autorizacao,
          accept: "application/json",
          ...(corpo === undefined ? {} : { "content-type": "application/json" }),
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: desistir.signal,
      })
    } catch (e) {
      const abortou = e instanceof Error && e.name === "AbortError"
      throw new ErroDoPagarme(
        abortou
          ? `o Pagar.me não respondeu em ${tempoLimite / 1000}s (${metodo} ${caminho})`
          : `falha de rede falando com o Pagar.me (${metodo} ${caminho})`,
        "rede"
      )
    } finally {
      clearTimeout(relogio)
    }

    const texto = await resposta.text()
    let json: unknown = null
    try {
      json = texto ? JSON.parse(texto) : null
    } catch {
      json = null
    }

    if (!resposta.ok) {
      const s = resposta.status
      const tipo: TipoDeErro =
        s === 401 || s === 403
          ? "autenticacao"
          : s === 404
            ? "nao_encontrado"
            : s >= 500
              ? "servidor"
              : "validacao"
      // `errors` vem como { "order.customer.document": ["mensagem"] }. Só o
      // nome do campo sai daqui — a mensagem às vezes repete o valor recusado.
      const erros = (json as { errors?: Record<string, unknown> } | null)?.errors
      const campos = erros && typeof erros === "object" ? Object.keys(erros) : []
      const mensagem = (json as { message?: unknown } | null)?.message
      throw new ErroDoPagarme(
        `o Pagar.me respondeu ${s} em ${metodo} ${caminho}` +
          (typeof mensagem === "string" ? `: ${mensagem}` : "") +
          (campos.length ? ` (campos: ${campos.join(", ")})` : ""),
        tipo,
        s,
        campos
      )
    }

    return json as T
  }

  return {
    criarPedido: (corpo: CorpoDoPedido) =>
      chamar<PedidoPagarme>("POST", "/orders", corpo, PRA_CRIAR),

    lerPedido: (id: string) =>
      chamar<PedidoPagarme>("GET", `/orders/${encodeURIComponent(id)}`, undefined, PRA_LER),

    /** A cobrança, com o que já foi devolvido e se há estorno andando — ver `lib/estornos.ts`. */
    lerCobranca: (id: string) =>
      chamar<CobrancaPagarme>("GET", `/charges/${encodeURIComponent(id)}`, undefined, PRA_LER),

    /**
     * O pedido criado com este `code`, ou null.
     *
     * É a idempotência que a API não tem: antes de criar, procura; e quando a
     * criação some no meio do caminho, é por aqui que se descobre se ela
     * aconteceu.
     */
    async buscarPorCodigo(codigo: string): Promise<PedidoPagarme | null> {
      const lista = await chamar<{ data?: PedidoPagarme[] }>(
        "GET",
        `/orders?code=${encodeURIComponent(codigo)}&size=5`,
        undefined,
        PRA_LER
      )
      // O filtro é deles; a conferência do código é nossa. Um filtro que
      // fosse "começa com" devolveria o pedido de outra sessão.
      return (lista?.data ?? []).find((p) => p.code === codigo) ?? null
    },

    /**
     * Os pedidos criados desde uma data, uma página por vez, e se há mais
     * páginas. É por aqui que a conciliação acha a cobrança cuja sessão sumiu
     * do Medusa.
     *
     * "Tem mais" vem do `paging.next` deles, e não de a página ter vindo
     * cheia: se o tamanho máximo da página for menor que o pedido, a página
     * vem com menos itens e mesmo assim não é a última. A data vai sem os
     * milissegundos, no formato dos exemplos da documentação.
     */
    async listarPedidos(
      desde: Date,
      pagina: number,
      tamanho = 30
    ): Promise<{ pedidos: PedidoPagarme[]; mais: boolean }> {
      const quando = desde.toISOString().replace(/\.\d{3}Z$/, "Z")
      const lista = await chamar<{ data?: PedidoPagarme[]; paging?: { next?: unknown } | null }>(
        "GET",
        `/orders?created_since=${encodeURIComponent(quando)}&page=${pagina}&size=${tamanho}`,
        undefined,
        PRA_LER
      )
      const pedidos = lista?.data ?? []
      const mais = lista?.paging ? Boolean(lista.paging.next) : pedidos.length >= tamanho
      return { pedidos, mais: mais && pedidos.length > 0 }
    },

    /**
     * Cancela a cobrança — ou estorna, se ela já foi paga. É o MESMO endpoint
     * pros dois, e é por isso que quem chama sempre lê o estado antes:
     * "cancelar o Pix que ninguém pagou" e "devolver o dinheiro de quem
     * pagou" são decisões diferentes que a API faz com a mesma chamada.
     */
    cancelarCobranca: (id: string, centavos?: number) =>
      chamar<CobrancaPagarme>(
        "DELETE",
        `/charges/${encodeURIComponent(id)}`,
        centavos === undefined ? undefined : { amount: centavos },
        PRA_CRIAR
      ),
  }
}
