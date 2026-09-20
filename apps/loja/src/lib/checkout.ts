import "server-only"
import type { HttpTypes } from "@medusajs/types"
import { lerCarrinho, paraVisivel } from "./carrinho"
import {
  ENDERECO_VAZIO,
  type CheckoutVisivel,
  type EnderecoVisivel,
  type OpcaoDeFrete,
  type ProvedorDePagamento,
} from "./checkout-visivel"
import { cliente } from "./medusa"

/**
 * A LEITURA DO CHECKOUT
 *
 * O carrinho já existe em `carrinho.ts`; o que falta pro checkout é o resto do
 * estado: endereço, documento, frete escolhido e as opções que o Medusa
 * oferece pra este carrinho específico.
 *
 * NADA AQUI É CACHEADO — nem as opções de frete, que parecem catálogo e não
 * são: o preço de cada uma depende do valor do carrinho (é assim que o frete
 * grátis acontece), então cachear seria mostrar o frete de outra pessoa.
 *
 * TUDO QUE ESCREVE está em `acoes/checkout.ts`.
 */

/**
 * Os campos que o checkout precisa. `*billing_address` entra mesmo a tela
 * nunca mostrando cobrança separada: é lá que mora o CPF/CNPJ (veja o porquê
 * em `acoes/checkout.ts`).
 */
export const CAMPOS_CHECKOUT =
  "id,region_id,currency_code,email,subtotal,discount_total,shipping_total,tax_total,total," +
  "item_subtotal,item_total,*items,*items.variant,*items.product,*items.thumbnail," +
  "*shipping_address,*billing_address,*shipping_methods"

function aviso(erro: unknown, contexto: string) {
  const msg = erro instanceof Error ? erro.message : String(erro)
  console.warn(`[checkout] ${contexto}: ${msg}`)
}

/**
 * O endereço do Medusa de volta pros campos do formulário brasileiro.
 *
 * O modelo de endereço do Medusa é o americano — não tem bairro nem número.
 * Os dois viajam no `metadata`, e a leitura tem que desfazer exatamente o que
 * a escrita fez, senão a pessoa que volta pra corrigir o endereço encontra o
 * número dela dentro do campo "rua".
 */
function paraEndereco(e: HttpTypes.StoreCartAddress | null | undefined): EnderecoVisivel {
  if (!e) return ENDERECO_VAZIO
  const meta = (e.metadata ?? {}) as Record<string, unknown>
  const texto = (v: unknown) => (typeof v === "string" ? v : "")

  return {
    nome: e.first_name ?? "",
    sobrenome: e.last_name ?? "",
    telefone: e.phone ?? "",
    cep: e.postal_code ?? "",
    // `address_1` guarda "Rua, número" pra etiqueta sair legível; o número
    // estruturado está no metadata, e é dele que o formulário se serve.
    rua: texto(meta.rua) || (e.address_1 ?? "").replace(/,\s*[^,]*$/, ""),
    numero: texto(meta.numero),
    complemento: texto(meta.complemento),
    bairro: texto(meta.bairro),
    cidade: e.city ?? "",
    uf: (e.province ?? "").toUpperCase(),
  }
}

/** O documento guardado no endereço de cobrança, ou string vazia. */
function paraDocumento(e: HttpTypes.StoreCartAddress | null | undefined): string {
  const doc = (e?.metadata as Record<string, unknown> | undefined)?.documento
  if (doc && typeof doc === "object" && "valor" in doc) {
    const valor = (doc as { valor?: unknown }).valor
    return typeof valor === "string" ? valor : ""
  }
  return ""
}

/** O carrinho no formato que as etapas desenham, ou null se não há carrinho. */
export async function lerCheckout(): Promise<CheckoutVisivel | null> {
  const carrinho = await lerCarrinho(CAMPOS_CHECKOUT)
  if (!carrinho) return null

  const base = paraVisivel(carrinho)
  const metodo = carrinho.shipping_methods?.[0]

  return {
    id: base.id,
    regiaoId: carrinho.region_id ?? "",
    itens: base.itens,
    unidades: base.unidades,
    subtotal: base.subtotal,
    desconto: Number(carrinho.discount_total ?? 0),
    // `undefined` vira null: "ainda não escolheu" e "escolheu e é grátis" são
    // coisas diferentes, e zero significa a segunda.
    frete: metodo ? Number(carrinho.shipping_total ?? 0) : null,
    total: base.total,
    email: carrinho.email ?? "",
    documento: paraDocumento(carrinho.billing_address),
    entrega: paraEndereco(carrinho.shipping_address),
    freteEscolhido: metodo?.shipping_option_id ?? null,
  }
}

/**
 * As opções de frete pra ESTE carrinho.
 *
 * O preço vem do Medusa já resolvido pelo valor do carrinho — é aqui que o
 * frete grátis acima do piso aparece como `preco: 0`, sem a loja precisar
 * saber que existe uma regra.
 */
export async function listarFretes(carrinhoId: string): Promise<OpcaoDeFrete[]> {
  const sdk = cliente()
  if (!sdk) return []

  try {
    const { shipping_options } = await sdk.store.fulfillment.listCartOptions({
      cart_id: carrinhoId,
    })
    return (shipping_options ?? [])
      .map((o) => ({
        id: o.id,
        nome: o.name,
        prazo: o.type?.description ?? "",
        preco: Number(o.amount ?? 0),
      }))
      .sort((a, b) => a.preco - b.preco)
  } catch (e) {
    aviso(e, `fretes do carrinho ${carrinhoId}`)
    return []
  }
}

/**
 * COMO CADA MEIO DE PAGAMENTO SE CHAMA NA TELA.
 *
 * O Medusa devolve id de provedor (`pp_system_default`, e um dia
 * `pp_pagarme_pagarme`) e mais nada — nome e explicação são nossos. Quem não
 * estiver nesta lista aparece com o id cru em vez de sumir: provedor ligado no
 * painel e invisível na loja é o tipo de bug que ninguém encontra.
 */
const NOMES: Record<string, Omit<ProvedorDePagamento, "id">> = {
  pp_system_default: {
    nome: "Combinar com a loja",
    descricao:
      "O pedido entra e a gente chama você pra acertar o pagamento. " +
      "É provisório, até o pagamento no site entrar no ar.",
    simbolico: true,
  },
}

export async function listarProvedores(regiaoId: string): Promise<ProvedorDePagamento[]> {
  const sdk = cliente()
  if (!sdk) return []

  try {
    const { payment_providers } = await sdk.store.payment.listPaymentProviders({
      region_id: regiaoId,
      limit: 20,
    })
    return (payment_providers ?? []).map((p) => ({
      id: p.id,
      ...(NOMES[p.id] ?? { nome: p.id, descricao: "", simbolico: false }),
    }))
  } catch (e) {
    aviso(e, `provedores da região ${regiaoId}`)
    return []
  }
}

/** A região do carrinho, que é o que `listarProvedores` precisa. */
export async function regiaoDoCarrinho(): Promise<string | null> {
  const carrinho = await lerCarrinho()
  return carrinho?.region_id ?? null
}

/* ── o pedido recém-fechado ───────────────────────────────────────────────── */

/**
 * Quem acabou de comprar vê o pedido inteiro; quem só tem o link, não.
 *
 * O id do pedido é imprevisível, mas "imprevisível" não é "privado" — URL
 * vaza em histórico, em print, no grupo da família. E a tela de obrigado
 * mostra endereço completo e documento. Então ela só abre tudo quando este
 * cookie confirma que quem está olhando é quem comprou.
 *
 * Uma semana: tempo de conferir o pedido algumas vezes, e curto o bastante pra
 * não virar um crachá esquecido num computador compartilhado.
 */
export const COOKIE_PEDIDO = "pedido"

const UMA_SEMANA = 60 * 60 * 24 * 7

export const OPCOES_COOKIE_PEDIDO = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: UMA_SEMANA,
} as const
