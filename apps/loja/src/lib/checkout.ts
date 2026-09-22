import "server-only"
import type { HttpTypes } from "@medusajs/types"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { BUMP } from "@/conteudo/checkout"
import { COOKIE_CARRINHO, lerCarrinho, paraVisivel } from "./carrinho"
import { mascararCep } from "./cep-formato"
import {
  ENDERECO_VAZIO,
  type CheckoutVisivel,
  type EnderecoVisivel,
  type Oferta,
  type OpcaoDeFrete,
  type ProvedorDePagamento,
} from "./checkout-visivel"
import { lerCliente, lerSessao, medusa, type ClienteVisivel } from "./conta"
import { documentoGuardado } from "./documento"
import { lerEndereco, montarEndereco } from "./endereco"
import { semEntregaEmpatada } from "./frete"
import { cliente, temEstoque } from "./medusa"
import { CHECKOUT_ABERTO, site } from "./site"

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
 * em `acoes/checkout.ts`). `customer.id` é de quem é o carrinho — a ação de
 * finalizar confere se é da conta aberta (`garantirDonoDoCarrinho`).
 */
export const CAMPOS_CHECKOUT =
  "id,region_id,currency_code,email,subtotal,discount_total,shipping_total,tax_total,total," +
  "item_subtotal,item_total,*items,*items.variant,*items.product,*items.thumbnail," +
  "*shipping_address,*billing_address,*shipping_methods,*promotions,customer.id"

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

/* ── o checkout de quem está na conta ─────────────────────────────────────── */

type CarrinhoComDono = {
  id: string
  email?: string | null
  customer?: { id?: string } | null
}

/**
 * De quem é o carrinho. O tipo do SDK não lista `customer` no carrinho da
 * loja, mas a API devolve quando o campo é pedido (`customer.id`, em
 * `CAMPOS_CHECKOUT`).
 */
export function donoDoCarrinho(carrinho: object): string | null {
  return (carrinho as CarrinhoComDono).customer?.id ?? null
}

/**
 * O carrinho passa pro nome da conta aberta — e o pedido nasce nela.
 *
 * ┌─ POR QUE NÃO BASTA O E-MAIL ───────────────────────────────────────────┐
 * │ O Medusa já liga à conta o carrinho que recebe o e-mail dela. Quase    │
 * │ sempre: carrinho que ganhou OUTRO e-mail antes (um erro de digitação   │
 * │ corrigido depois) fica com um cliente convidado novo, e o pedido nasce │
 * │ fora da conta — medido, não suposto. A troca de dono pelo token, na    │
 * │ rota `/store/carts/:id/customer`, é a que não depende de ordem.        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A troca põe o e-mail da conta no carrinho, por cima do que estava lá.
 * Quem já tinha digitado outro no passo 1 fica com o dele: carrinho de
 * cliente com conta aceita outro e-mail sem mudar de dono, e o que a pessoa
 * escreveu pra esta compra manda.
 *
 * Devolve se trocou (`true`) — quem chama pode precisar reler o carrinho.
 * Falha não é erro de tela: o checkout segue como se a conta não estivesse
 * aberta, e o pedido cai onde o e-mail mandar.
 */
export async function garantirDonoDoCarrinho(
  carrinho: CarrinhoComDono,
  token: string,
  conta: Pick<ClienteVisivel, "id" | "email">
): Promise<boolean> {
  if (donoDoCarrinho(carrinho) === conta.id) return false

  const r = await medusa(`/store/carts/${encodeURIComponent(carrinho.id)}/customer?fields=id`, {
    corpo: {},
    token,
  })
  if (r.status !== 200) {
    aviso(new Error(`${r.status} ${String(r.corpo.message ?? "")}`), "carrinho pra conta")
    return false
  }

  const antes = (carrinho.email ?? "").trim().toLowerCase()
  const sdk = cliente()
  if (sdk && antes && antes !== conta.email.toLowerCase()) {
    try {
      await sdk.store.cart.update(carrinho.id, { email: antes }, { fields: "id" })
    } catch (e) {
      aviso(e, "e-mail de volta depois da troca de dono")
    }
  }
  return true
}

/**
 * O CHECKOUT ABRE PREENCHIDO pra quem está na conta — é a promessa da tela
 * de endereços ("o principal já vem preenchido no checkout").
 *
 * Roda na página, antes de ler o checkout, e ESCREVE NO CARRINHO, não só no
 * formulário: a etapa em que o checkout abre sai do carrinho
 * (`etapaDoCarrinho`), e as opções de frete só existem pra CEP gravado nele.
 * Preencher só a tela deixaria o passo 1 aberto com tudo escrito, e o passo
 * 2 com um CEP sem entrega nenhuma pra escolher.
 *
 * SÓ O QUE ESTÁ VAZIO, grupo por grupo — o que a pessoa digitou neste
 * carrinho manda, sempre:
 *   - o passo 1 (nome, celular, documento), se ele nunca foi salvo aqui;
 *   - o endereço principal, se o passo 2 nunca foi salvo (sem número) e o
 *     CEP que já estiver no carrinho for o dele — a sacola grava o CEP da
 *     cotação, e CEP de outro lugar é presente pra alguém: não é o
 *     principal que a pessoa quer ali.
 *
 * Como toda escrita espera o carrinho vazio daquele grupo, rodar de novo (a
 * página roda a cada `refresh()` das ações) não muda nada. Nunca lança.
 */
export async function preencherDaConta(): Promise<void> {
  const token = await lerSessao()
  if (!token) return
  const leitura = await lerCliente()
  if (leitura.estado !== "ok") return
  const conta = leitura.cliente
  const sdk = cliente()
  if (!sdk) return

  const carrinho = await lerCarrinho("id,email,customer.id,*shipping_address,*billing_address")
  if (!carrinho) return
  await garantirDonoDoCarrinho(carrinho, token, conta)

  const entrega = lerEndereco(carrinho.shipping_address)
  const gravado = documentoGuardado(
    (carrinho.billing_address?.metadata as Record<string, unknown> | undefined)?.documento
  )
  const novo: EnderecoVisivel = { ...entrega }
  let documento = gravado

  // O DOCUMENTO FECHA O PASSO 1 — a etapa olha e-mail e documento. Então ele
  // só vai com nome, sobrenome e celular junto; com os dados pela metade, o
  // passo abre com o que houver e a pessoa completa.
  if (!gravado && !entrega.nome && conta.nome && conta.sobrenome) {
    novo.nome = conta.nome
    novo.sobrenome = conta.sobrenome
    novo.telefone = conta.telefone
    if (conta.telefone) documento = conta.documento
  }

  const principal = conta.enderecos.find((e) => e.principal)
  const cepNoCarrinho = entrega.cep.replace(/\D+/g, "")
  if (principal && !entrega.numero && (!cepNoCarrinho || cepNoCarrinho === principal.cep)) {
    novo.cep = principal.cep
    novo.rua = principal.rua
    novo.numero = principal.numero
    novo.complemento = principal.complemento
    novo.bairro = principal.bairro
    novo.cidade = principal.cidade
    novo.uf = principal.uf
  }

  if (JSON.stringify(novo) === JSON.stringify(entrega) && documento === gravado) return

  try {
    await sdk.store.cart.update(
      carrinho.id,
      {
        shipping_address: montarEndereco(novo),
        billing_address: montarEndereco(novo, documento ?? undefined),
      },
      { fields: "id" }
    )
  } catch (e) {
    aviso(e, "preencher da conta")
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

    /*
      ┌─ LISTAR NÃO É COTAR, E ISSO CUSTOU UM TESTE VERMELHO INTEIRO ────────┐
      │ `listCartOptions` devolve as opções com o preço que está NO BANCO.  │
      │ Opção `calculated` — as duas da Frenet — não tem preço no banco:    │
      │ quem sabe quanto custa é o provedor, e ele só é chamado pela rota   │
      │ `/store/shipping-options/:id/calculate`, uma opção por vez.          │
      │                                                                      │
      │ Sem esta segunda volta, a tela de entrega mostrava "Entrega          │
      │ econômica — R$ 0,00" e o cliente escolheria frete grátis que não     │
      │ existe. Zero aqui não é promoção: é preço que ninguém calculou.      │
      │                                                                      │
      │ As cotações vão em PARALELO e o backend junta as duas numa chamada   │
      │ só à transportadora — quem faz isso é o provedor, não esta função.   │
      └──────────────────────────────────────────────────────────────────────┘
    */
    const cotadas = await Promise.all(
      (shipping_options ?? []).map(async (o) => {
        if (o.price_type !== "calculated") return o
        try {
          const { shipping_option } = await sdk.store.fulfillment.calculate(
            o.id,
            { cart_id: carrinhoId },
            /*
              `+type.*` porque a rota de cotação devolve o conjunto PADRÃO de
              campos, que não inclui o tipo — e é dele que sai a linha de
              apoio embaixo do nome ("A mais barata para o seu CEP"). Sem
              isto a opção aparece com o nome solto, e a lista passa a ter
              duas entregas sem nada que explique a diferença entre elas.
            */
            { fields: "+type.*" }
          )
          return shipping_option
        } catch (e) {
          /*
            Opção que não cotou some da lista em vez de aparecer com preço
            zero. Some uma; as outras continuam, e o cliente compra com a
            que deu certo. Se nenhuma der, a tela mostra "não consegui
            calcular o frete" — que é a verdade.
          */
          aviso(e, `cotação da opção ${o.id}`)
          return null
        }
      })
    )

    /*
      A faixa vem do `data` que o `scripts/frete.ts` grava, com o `type.code`
      como segunda chance — são os dois lugares onde ela existe, e o provedor
      da Frenet lê o primeiro. Ela não vai pra tela: quem usa é a regra do
      `semEntregaEmpatada`, logo abaixo.
    */
    const opcoes = cotadas
      .filter((o): o is NonNullable<typeof o> => o !== null)
      .map((o) => {
        const doData = (o.data as { faixa?: unknown } | null | undefined)?.faixa
        const faixa = typeof doData === "string" ? doData : (o.type?.code ?? null)
        return {
          id: o.id,
          nome: o.name,
          faixa,
          prazo: o.type?.description ?? "",
          preco: Number(o.amount ?? 0),
          precoCheio: null as number | null,
        }
      })
      .sort((a, b) => a.preco - b.preco)

    return semEntregaEmpatada(opcoes)
  } catch (e) {
    aviso(e, `fretes do carrinho ${carrinhoId}`)
    return []
  }
}

/**
 * COMO CADA MEIO DE PAGAMENTO SE CHAMA NA TELA.
 *
 * O Medusa devolve id de provedor (`pp_pagarme_pagarme`, ou o provisório
 * `pp_system_default`) e mais nada — nome e explicação são nossos. Quem não
 * estiver nesta lista aparece com o id cru em vez de sumir: provedor ligado no
 * painel e invisível na loja é o tipo de bug que ninguém encontra.
 */
const NOMES: Record<string, Omit<ProvedorDePagamento, "id">> = {
  pp_pagarme_pagarme: {
    nome: "Pix ou cartão",
    descricao: "Pix na hora, ou cartão de crédito em até 3x sem juros, pelo Pagar.me.",
    simbolico: false,
  },
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
    return (
      (payment_providers ?? [])
        .map((p) => ({
          id: p.id,
          ...(NOMES[p.id] ?? { nome: p.id, descricao: "", simbolico: false }),
        }))
        // Checkout aberto só oferece o que cobra: o provisório fecharia pedido
        // de graça. Sem nenhum, o passo 3 diz que não há forma de pagamento.
        .filter((p) => !(CHECKOUT_ABERTO && p.simbolico))
    )
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
 * Some quando o produto já está no pedido a preço cheio: oferecer desconto
 * em algo que a pessoa acabou de pôr inteiro na sacola é a melhor forma de
 * irritar um cliente. Com o bump MARCADO ele também está no pedido, mas aí a
 * caixinha fica — marcada —, porque é por ela que se desmarca. Antes ela
 * sumia no instante em que o óleo entrava, e parecia que o clique tinha dado
 * errado.
 */
export async function lerBump(
  regiaoId: string,
  jaNoCarrinho: Set<string>,
  marcado: boolean
): Promise<Oferta | null> {
  const catalogo = await catalogoDoCheckout(regiaoId)
  const achado = catalogo.find((o) => o.handle === BUMP.handle)
  if (!achado || (jaNoCarrinho.has(achado.varianteId) && !marcado)) return null

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
 * mostra endereço completo e documento. Então ela só abre tudo pra quem tem
 * este cookie, o crachá de quem comprou.
 *
 * O CRACHÁ LEVA O CARRINHO, e não só o pedido: `<pedido>.<carrinho>`. Um
 * crachá só com o id do pedido era forjável por qualquer um que tivesse o
 * link — é o mesmo texto da URL. O id do carrinho, não: ele morava no cookie
 * da sacola e em lugar nenhum mais. É ele que a loja mostra ao Medusa
 * (`x-carrinho`), e é o Medusa que decide se entrega o pedido inteiro —
 * ver `apps/backend/src/lib/pedido-publico.ts`.
 *
 * Uma semana: tempo de conferir o pedido algumas vezes, e curto o bastante pra
 * não virar um crachá esquecido num computador compartilhado.
 */
export const COOKIE_PEDIDO = "pedido"

export type Cracha = { pedido: string; carrinho: string | null }

/** `<pedido>.<carrinho>`. O de antes (só o pedido) ainda é lido, sem carrinho. */
export function lerCracha(valor: string | undefined): Cracha | null {
  if (!valor) return null
  const [pedido, carrinho] = valor.split(".")
  return pedido ? { pedido, carrinho: carrinho || null } : null
}

const UMA_SEMANA = 60 * 60 * 24 * 7

export const OPCOES_COOKIE_PEDIDO = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: UMA_SEMANA,
} as const

/**
 * Entrega o pedido a quem acabou de comprar: apaga a sacola, dá o crachá e
 * leva pra tela de obrigado. Só roda onde o Next deixa gravar cookie — ação
 * e route handler (a ação de finalizar e o `/checkout/retomar`).
 *
 * `redirect` LANÇA: nada depois da chamada roda, e ela fica fora de qualquer
 * try/catch, senão o catch engole a navegação.
 */
export async function abrirPedido(pedidoId: string): Promise<never> {
  const jar = await cookies()
  // Os três caminhos que chegam aqui acharam o pedido pelo carrinho deste
  // cookie — é ele que vai no crachá.
  const carrinhoId = jar.get(COOKIE_CARRINHO)?.value
  // A sacola acabou. Sem isto, quem comprou volta pro site e encontra a
  // própria compra parada na gaveta.
  jar.delete(COOKIE_CARRINHO)
  // O crachá de quem comprou — a tela de obrigado só mostra endereço,
  // documento e o QR do Pix pra quem tem ele.
  jar.set(COOKIE_PEDIDO, carrinhoId ? `${pedidoId}.${carrinhoId}` : pedidoId, OPCOES_COOKIE_PEDIDO)
  redirect(`/checkout/obrigado/${pedidoId}`)
}
