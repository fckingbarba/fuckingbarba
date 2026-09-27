import "server-only"
import type { HttpTypes } from "@medusajs/types"
import { parceiroDe, type PagamentoVisivel } from "./checkout-visivel"
import type { cliente } from "./medusa"

/**
 * O PAGAMENTO, DO LADO DO SERVIDOR DA LOJA.
 *
 * Três traduções entre a loja e o parceiro de pagamento que mora no Medusa
 * (hoje, o Pagar.me: `apps/backend/src/modules/pagarme/`):
 *
 *   1. o carrinho → a `entrada` da sessão de pagamento (quem compra, o que,
 *      pra onde). O provedor não enxerga o carrinho — é módulo isolado do
 *      Medusa —, então quem entrega isso é a ação de finalizar;
 *   2. a sessão recusada → a frase que a pessoa lê;
 *   3. o pedido fechado → o que a tela de obrigado desenha.
 *
 * As duas últimas leem a sessão de qualquer parceiro da lista (`PARCEIROS`,
 * em `checkout-visivel.ts`): todos gravam o mesmo estado, cada um na sua
 * chave.
 *
 * ┌─ O QUE A LOJA MANDA E O QUE ELA NÃO DECIDE ────────────────────────────┐
 * │ Tudo aqui sai do CARRINHO lido do Medusa, nunca do formulário — a      │
 * │ única coisa que vem da tela é a escolha (Pix ou cartão, parcelas, o    │
 * │ token). E nada daqui decide VALOR: o que o Pagar.me cobra é o total da │
 * │ sessão, que o Medusa calcula sozinho. Os itens e o frete vão só pra o  │
 * │ pedido aparecer discriminado no painel e na análise de fraude; se a    │
 * │ soma deles não bater com o total, o provedor manda uma linha só.       │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

export type Escolha = {
  forma: "pix" | "cartao"
  parcelas: number
  token: string | null
  ip: string | null
}

type Sdk = NonNullable<ReturnType<typeof cliente>>

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/**
 * A `entrada` da sessão de pagamento, montada do carrinho.
 *
 * Devolve erro com frase pronta quando falta o que o Pagar.me exige — o
 * checkout já pede tudo isso nos passos 1 e 2, então cair aqui é carrinho
 * mexido por fora (ou um passo que regrediu), e a frase diz qual.
 */
export function entradaDoCarrinho(
  carrinho: HttpTypes.StoreCart,
  escolha: Escolha
): { ok: true; entrada: Record<string, unknown> } | { ok: false; mensagem: string } {
  const e = carrinho.shipping_address
  const meta = (e?.metadata ?? {}) as Record<string, unknown>
  const doc = (carrinho.billing_address?.metadata as Record<string, unknown> | undefined)
    ?.documento as { tipo?: unknown; valor?: unknown } | undefined

  const nome = [e?.first_name, e?.last_name].map(texto).filter(Boolean).join(" ")
  const documento = texto(doc?.valor)
  if (!nome || !documento) return { ok: false, mensagem: "Falta o seu nome ou o CPF lá em cima." }
  if (!texto(e?.phone)) return { ok: false, mensagem: "Falta o seu telefone lá em cima." }
  // O limite do Pagar.me pro e-mail. O passo 1 já recusa; isto é o carrinho
  // que chegou aqui com um maior (gravado antes, ou vindo da conta).
  if ((carrinho.email ?? "").length > 64) {
    return {
      ok: false,
      mensagem:
        "Seu e-mail passa de 64 caracteres, o limite do pagamento. Troca ele no passo 1 (Contato).",
    }
  }

  const endereco = {
    rua: texto(meta.rua) || texto(e?.address_1).replace(/,\s*[^,]*$/, ""),
    numero: texto(meta.numero),
    complemento: texto(meta.complemento),
    bairro: texto(meta.bairro),
    cidade: texto(e?.city),
    uf: texto(e?.province).toUpperCase(),
    cep: texto(e?.postal_code).replace(/\D+/g, ""),
  }
  if (!endereco.rua || !endereco.numero || !endereco.bairro || !endereco.cidade) {
    return { ok: false, mensagem: "O endereço de entrega está incompleto. Confere o passo 2." }
  }

  const itens = (carrinho.items ?? []).map((i) => {
    const variante = i.variant_title && !/^(único|default)/i.test(i.variant_title)
    return {
      codigo: i.variant_sku || i.variant_id || i.id,
      descricao: [i.product_title ?? i.title ?? "Produto", variante ? i.variant_title : ""]
        .filter(Boolean)
        .join(" — "),
      quantidade: i.quantity ?? 1,
      total: Number(i.total ?? 0),
    }
  })

  return {
    ok: true,
    entrada: {
      forma: escolha.forma,
      parcelas: escolha.forma === "cartao" ? escolha.parcelas : 1,
      token: escolha.forma === "cartao" ? escolha.token : null,
      comprador: {
        nome,
        email: carrinho.email ?? "",
        documento,
        tipoDocumento: doc?.tipo === "cnpj" ? "cnpj" : "cpf",
        telefone: texto(e?.phone),
      },
      endereco,
      itens,
      frete: {
        total: Number(carrinho.shipping_total ?? 0),
        descricao: carrinho.shipping_methods?.[0]?.name ?? "",
      },
      ip: escolha.ip,
    },
  }
}

/**
 * A PORTA DO CARTÃO barrou antes do Pagar.me (`backend/src/lib/cartao/`): o
 * robô testando cartão roubado não passa, e quem é de verdade lê o que
 * fazer. Nada foi cobrado — a tentativa nem saiu da loja. O Medusa responde
 * 429 com o motivo no `message`; qualquer outra coisa, `null`.
 *
 * A frase não diz qual trava foi: pra quem compra, importa que o Pix
 * funciona agora e que o cartão volta depois.
 */
export function recusaDaPorta(e: unknown): string | null {
  const motivo = e instanceof Error ? e.message : ""
  if (motivo === "cartao_limite") {
    return (
      "Foram muitas tentativas com cartão, e por segurança o cartão ficou pausado nesta compra. " +
      "Paga no Pix agora ou tenta o cartão de novo daqui a uma hora — nada foi cobrado."
    )
  }
  if (motivo === "cartao_freio") {
    return (
      "O pagamento com cartão está numa pausa de segurança de alguns minutos. O Pix funciona " +
      "normal — ou tenta o cartão de novo daqui a pouco. Nada foi cobrado."
    )
  }
  return null
}

/**
 * Depois de um `complete` que não deu pedido: o carrinho fechou mesmo assim
 * (a resposta se perdeu no caminho), ou a sessão foi recusada — e com qual
 * frase.
 *
 * A frase é do provedor, gravada na sessão ("o banco do cartão não
 * autorizou…"). A mensagem de erro do Medusa não serve pra isso: ela diz
 * "Session … was not authorized with the provider", que não ajuda ninguém a
 * terminar a compra.
 */
export async function depoisDaRecusa(
  sdk: Sdk,
  carrinhoId: string
): Promise<{ fechado: boolean; recusa: string | null }> {
  try {
    const { cart } = await sdk.store.cart.retrieve(carrinhoId, {
      fields: "id,completed_at,*payment_collection,*payment_collection.payment_sessions",
    })
    const sessao = sessaoDoParceiro(
      (cart?.payment_collection?.payment_sessions ?? []) as (SessaoLida | null)[]
    )
    const estado = estadoCru(sessao) as { recusa?: unknown } | undefined
    return {
      fechado: Boolean(cart?.completed_at),
      recusa: typeof estado?.recusa === "string" ? estado.recusa : null,
    }
  } catch {
    return { fechado: false, recusa: null }
  }
}

/* ── o pedido fechado ─────────────────────────────────────────────────────── */

/** Os campos que a tela de obrigado precisa pra desenhar o pagamento. */
export const CAMPOS_DO_PAGAMENTO =
  "status,payment_status,*payment_collections,*payment_collections.payment_sessions"

type SessaoLida = {
  provider_id?: string
  status?: string
  data?: Record<string, unknown> | null
}

/**
 * A sessão que virou o pagamento: a de um parceiro (`PARCEIROS`) que chegou
 * mais longe — autorizada ou capturada — ou, sem nenhuma assim, a última. A
 * mesma escolha do backend (`sessaoDoParceiro`, em
 * `apps/backend/src/lib/pagamento/parceiros.ts`).
 */
function sessaoDoParceiro(sessoes: (SessaoLida | null)[]): SessaoLida | undefined {
  const nossas = sessoes.filter((s): s is SessaoLida => Boolean(parceiroDe(s?.provider_id)))
  return (
    nossas.find((s) => s.status === "authorized" || s.status === "captured") ??
    nossas[nossas.length - 1]
  )
}

const sessaoDoPedido = (order: HttpTypes.StoreOrder) =>
  sessaoDoParceiro(
    (order.payment_collections ?? []).flatMap(
      (c) => (c?.payment_sessions ?? []) as (SessaoLida | null)[]
    )
  )

/**
 * O estado que o parceiro gravou na sessão, ainda cru: só a chave DELE
 * (`data[chave]`). O `data` de uma sessão aceita qualquer coisa de quem chama
 * a API pública; o de quem não é parceiro não vira pagamento.
 */
function estadoCru(sessao: SessaoLida | undefined): Record<string, unknown> | undefined {
  const chave = parceiroDe(sessao?.provider_id)?.chave
  const estado = chave ? sessao?.data?.[chave] : undefined
  return estado && typeof estado === "object" ? (estado as Record<string, unknown>) : undefined
}

/**
 * Quanto o parceiro já devolveu da cobrança deste pedido, em centavos.
 *
 * É o `estornado` que o provedor grava na sessão (no Pagar.me, o
 * `canceled_amount` / `refunded_amount` de lá), e existe por causa de UM
 * caso que o Medusa não enxerga: o cartão que o banco aprova e a análise de
 * fraude reprova depois de capturado. O valor sai e volta no cartão de quem
 * comprou, e o Medusa nunca registrou pagamento nenhum — nem estorno. Pelo
 * `payment_status`, é um pedido "cancelado antes do pagamento"; pelo extrato
 * do cliente, não.
 *
 * O e-mail de cancelamento já decide assim (`decidir`, em
 * `apps/backend/src/lib/avisar-cancelamento.ts`); a conta lê daqui pra dizer
 * a mesma coisa que ele.
 */
export function devolvidoNoParceiro(order: HttpTypes.StoreOrder): number {
  const estado = estadoCru(sessaoDoPedido(order)) as { estornado?: unknown } | undefined
  const centavos = Number(estado?.estornado ?? 0)
  return Number.isFinite(centavos) && centavos > 0 ? centavos : 0
}

/**
 * O pagamento de um pedido, na pergunta que a pessoa faz ("e o meu
 * pagamento?"), já respondida.
 *
 * O PAGO sai do `payment_status` do Medusa, e não do que o parceiro disse na
 * sessão: é o Medusa que registra o pagamento (pelo webhook ou pela
 * conciliação), e é ele que libera a separação. A sessão só empresta o QR do
 * Pix e o final do cartão.
 */
export function lerPagamento(order: HttpTypes.StoreOrder): PagamentoVisivel {
  const sessao = sessaoDoPedido(order)

  if (!sessao) {
    return order.status === "canceled"
      ? { estado: "cancelado", forma: null, pix: null, cartao: null }
      : { estado: "combinar", forma: null, pix: null, cartao: null }
  }

  const estado = (estadoCru(sessao) ?? {}) as {
    forma?: unknown
    situacao?: unknown
    parcelas?: unknown
    pix?: { copiaECola?: unknown; imagem?: unknown; expiraEm?: unknown } | null
    cartao?: { bandeira?: unknown; final?: unknown } | null
  }
  const forma = estado.forma === "cartao" ? "cartao" : "pix"
  const pago = order.payment_status === "captured" || order.payment_status === "authorized"

  const pix =
    forma === "pix" && estado.pix && typeof estado.pix.copiaECola === "string"
      ? {
          copiaECola: estado.pix.copiaECola,
          imagem: typeof estado.pix.imagem === "string" ? estado.pix.imagem : "",
          expiraEm: typeof estado.pix.expiraEm === "string" ? estado.pix.expiraEm : "",
        }
      : null
  const cartao =
    forma === "cartao" && estado.cartao && typeof estado.cartao.final === "string"
      ? {
          bandeira: typeof estado.cartao.bandeira === "string" ? estado.cartao.bandeira : "",
          final: estado.cartao.final,
          parcelas: Number(estado.parcelas ?? 1) || 1,
        }
      : null

  /*
    Cancelado continua dizendo COMO foi pago (a conta escreve "Pix — venceu
    sem pagamento", ou o cartão que foi estornado), mas sem o QR: um Pix de
    pedido cancelado não pode aparecer como coisa a pagar.
  */
  if (order.status === "canceled") return { estado: "cancelado", forma, pix: null, cartao }

  return {
    estado: pago ? "pago" : forma === "cartao" ? "analise" : "aguardando",
    forma,
    pix,
    cartao,
  }
}
