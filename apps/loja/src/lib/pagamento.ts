import "server-only"
import type { HttpTypes } from "@medusajs/types"
import { PROVEDOR_PAGARME, type PagamentoVisivel } from "./checkout-visivel"
import type { cliente } from "./medusa"

/**
 * O PAGAMENTO, DO LADO DO SERVIDOR DA LOJA.
 *
 * Três traduções entre a loja e o provedor do Pagar.me que mora no Medusa
 * (`apps/backend/src/modules/pagarme/`):
 *
 *   1. o carrinho → a `entrada` da sessão de pagamento (quem compra, o que,
 *      pra onde). O provedor não enxerga o carrinho — é módulo isolado do
 *      Medusa —, então quem entrega isso é a ação de finalizar;
 *   2. a sessão recusada → a frase que a pessoa lê;
 *   3. o pedido fechado → o que a tela de obrigado desenha.
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
    const sessao = (cart?.payment_collection?.payment_sessions ?? []).find(
      (s) => s?.provider_id === PROVEDOR_PAGARME
    )
    const estado = (sessao?.data as Record<string, unknown> | undefined)?.pagarme as
      { recusa?: unknown } | undefined
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
 * O pagamento de um pedido, na pergunta que a pessoa faz ("e o meu
 * pagamento?"), já respondida.
 *
 * O PAGO sai do `payment_status` do Medusa, e não do que o Pagar.me disse na
 * sessão: é o Medusa que registra o pagamento (pelo webhook ou pela
 * conciliação), e é ele que libera a separação. A sessão só empresta o QR do
 * Pix e o final do cartão.
 */
export function lerPagamento(order: HttpTypes.StoreOrder): PagamentoVisivel {
  const sessoes = (order.payment_collections ?? []).flatMap(
    (c) => (c?.payment_sessions ?? []) as SessaoLida[]
  )
  const doPagarme = sessoes.find((s) => s.provider_id === PROVEDOR_PAGARME)

  if (order.status === "canceled") {
    return { estado: "cancelado", forma: null, pix: null, cartao: null }
  }
  if (!doPagarme) {
    return { estado: "combinar", forma: null, pix: null, cartao: null }
  }

  const estado = (doPagarme.data?.pagarme ?? {}) as {
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

  return {
    estado: pago ? "pago" : forma === "cartao" ? "analise" : "aguardando",
    forma,
    pix,
    cartao,
  }
}
