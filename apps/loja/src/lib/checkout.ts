import "server-only"
import type { HttpTypes } from "@medusajs/types"
import { BUMP } from "@/conteudo/checkout"
import { lerCarrinho, paraVisivel } from "./carrinho"
import { mascararCep } from "./cep-formato"
import {
  ENDERECO_VAZIO,
  type CheckoutVisivel,
  type EnderecoVisivel,
  type Oferta,
  type OpcaoDeFrete,
  type ProvedorDePagamento,
} from "./checkout-visivel"
import { cliente, temEstoque } from "./medusa"
import { site } from "./site"

/**
 * A LEITURA DO CHECKOUT
 *
 * O carrinho já existe em `carrinho.ts`; o que falta pro checkout é o resto do
 * estado: endereço, documento, frete escolhido, cupons, e as ofertas que a
 * tela faz (o bump e os chips de completar o frete grátis).
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
  "*shipping_address,*billing_address,*shipping_methods,*promotions"

function aviso(erro: unknown, contexto: string) {
  const msg = erro instanceof Error ? erro.message : String(erro)
  console.warn(`[checkout] ${contexto}: ${msg}`)
}

const texto = (v: unknown) => (typeof v === "string" ? v : "")

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

  return {
    nome: e.first_name ?? "",
    sobrenome: e.last_name ?? "",
    telefone: e.phone ?? "",
    cep: mascararCep(e.postal_code ?? ""),
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
    return texto((doc as { valor?: unknown }).valor)
  }
  return ""
}

/** O carrinho no formato que as etapas desenham, ou null se não há carrinho. */
export async function lerCheckout(): Promise<CheckoutVisivel | null> {
  const carrinho = await lerCarrinho(CAMPOS_CHECKOUT)
  if (!carrinho) return null

  const base = paraVisivel(carrinho)
  const metodo = carrinho.shipping_methods?.[0]
  const cupons = (carrinho.promotions ?? [])
    .map((p) => ({ codigo: p?.code ?? "" }))
    .filter((c) => c.codigo)

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
    // O código do bump é um cupom como outro qualquer pro Medusa; quem sabe
    // que ele é o bump é a loja.
    cupons: cupons.filter((c) => c.codigo !== BUMP.codigo),
    bumpMarcado: cupons.some((c) => c.codigo === BUMP.codigo),
  }
}

/**
 * As opções de frete pra ESTE carrinho.
 *
 * O preço vem do Medusa já resolvido pelo valor do carrinho — é aqui que o
 * frete grátis aparece como `preco: 0`, sem a loja saber que existe regra.
 *
 * `precoCheio` é o valor riscado do lado de "Grátis". Ele não vem da API: o
 * Medusa devolve o preço que vale agora, e mais nada. Sai da MAIOR cotação
 * que aquela opção já mostrou nesta mesma tela — ou seja, do preço que a
 * pessoa via antes de o carrinho passar do piso. Sem isso, "Grátis" não diz
 * quanto foi economizado, e economia invisível não convence ninguém.
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
        precoCheio: null as number | null,
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

/* ── as ofertas do checkout ───────────────────────────────────────────────── */

/**
 * Os produtos que o checkout pode oferecer, com categoria e preço.
 *
 * Uma consulta só, e ela serve tanto o order bump quanto os chips de
 * completar o frete. Não é cacheada porque precisa do preço calculado da
 * região — e porque uma consulta a mais numa tela que já está falando com o
 * Medusa cinco vezes não é o que vai pesar.
 */
async function catalogoDoCheckout(regiaoId: string): Promise<Oferta[]> {
  const sdk = cliente()
  if (!sdk || !regiaoId) return []

  try {
    const { products } = await sdk.store.product.list({
      limit: 100,
      region_id: regiaoId,
      // `inventory_quantity` é o que separa "existe no catálogo" de "dá pra
      // comprar agora". Sem ele o `temEstoque` responde sempre sim.
      fields:
        "handle,title,thumbnail,*categories,*variants,*variants.calculated_price," +
        "*variants.inventory_quantity",
    })

    return (products ?? [])
      .flatMap((p) => {
        // Produto com mais de uma variante não vira oferta de um clique: a
        // pessoa teria que escolher tamanho no meio do checkout, e aí não é
        // mais um clique.
        const variante = p.variants?.length === 1 ? p.variants[0] : null
        const preco = Number(variante?.calculated_price?.calculated_amount ?? 0)
        if (!variante || !preco) return []

        // SEM ESTOQUE NÃO É OFERTA. O chip promete liberar o frete grátis num
        // clique; se o produto acabou, o clique falha e a promessa some junto
        // com a paciência de quem estava a um passo de pagar. Vale igual pro
        // bump, que sai da mesma lista.
        if (!temEstoque(variante)) return []

        return [
          {
            varianteId: variante.id,
            handle: p.handle ?? "",
            nome: p.title ?? "",
            categoria: p.categories?.[0]?.handle ?? "",
            imagem: p.thumbnail ?? null,
            preco,
            precoComDesconto: preco,
          },
        ]
      })
      .filter((o) => o.varianteId)
  } catch (e) {
    aviso(e, "catálogo do checkout")
    return []
  }
}

/**
 * O produto do order bump, ou null.
 *
 * `precoComDesconto` é calculado com a mesma porcentagem que a promoção do
 * Medusa aplica — e o conferidor prova que os dois batem. Enquanto a pessoa
 * não marca a caixinha, é o único jeito de mostrar o "por" sem inventar um
 * carrinho fantasma só pra perguntar ao Medusa quanto ficaria.
 *
 * Some quando o produto já está no pedido: oferecer desconto em algo que a
 * pessoa acabou de pagar inteiro é a melhor forma de irritar um cliente.
 */
export async function lerBump(regiaoId: string, jaNoCarrinho: Set<string>): Promise<Oferta | null> {
  const catalogo = await catalogoDoCheckout(regiaoId)
  const achado = catalogo.find((o) => o.handle === BUMP.handle)
  if (!achado || jaNoCarrinho.has(achado.varianteId)) return null

  return {
    ...achado,
    precoComDesconto: Math.round(achado.preco * (1 - BUMP.desconto / 100) * 100) / 100,
  }
}

/**
 * Os chips de "completa o frete grátis": um produto por categoria, o mais
 * barato que SOZINHO fecha a conta.
 *
 * A regra do `preco >= falta` é o que torna a oferta honesta. Sugerir um
 * produto de R$ 20 quando faltam R$ 40 é mandar a pessoa clicar duas vezes
 * pra descobrir que ainda não deu — e aí a promessa do chip era mentira.
 *
 * Vazio quando já é grátis, quando nada fecha a conta, ou quando não há CEP
 * (sem frete calculado não há o que completar).
 */
export async function listarSugestoes(
  regiaoId: string,
  falta: number,
  jaNoCarrinho: Set<string>
): Promise<Oferta[]> {
  if (falta <= 0) return []

  const catalogo = await catalogoDoCheckout(regiaoId)
  const porCategoria = new Map<string, Oferta>()

  for (const o of catalogo) {
    if (jaNoCarrinho.has(o.varianteId) || o.preco < falta) continue
    const atual = porCategoria.get(o.categoria)
    if (!atual || o.preco < atual.preco) porCategoria.set(o.categoria, o)
  }

  // Na ordem do menu, pra lista não dançar entre uma visita e outra.
  return site.categorias
    .map((c) => porCategoria.get(c.handle))
    .filter((o): o is Oferta => Boolean(o))
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
