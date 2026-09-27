import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { StepResponse } from "@medusajs/framework/workflows-sdk"
import { updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { lerConfiguracoes, type PoliticaDeFrete } from "../../lib/configuracoes"
import {
  categoriasEscolhidas,
  contextoDosCupons,
  cuponsNaConta,
  linhasMarcadas,
  outroCupomNoCarrinho,
  type CarrinhoComCodigos,
  type ItemDoCarrinho,
  type PedidoDoEmail,
  type PromocaoComRegras,
} from "../../lib/cupons"
import { marcarPromocoes, type PromocaoAtiva } from "../../lib/promocoes"
import { promocoesDoPainel } from "../../lib/promocoes-ativas"

/**
 * O QUE AS REGRAS DOS CUPONS LEEM E O CARRINHO NÃO TEM — a soma dos
 * produtos, a hora, os produtos e as categorias do carrinho, se ele já
 * ganhou o frete da loja, quantos pedidos o e-mail já fez e quantas vezes
 * usou cada código, e em cada linha a marca do preço promocional (o porquê
 * está em `lib/cupons.ts`).
 *
 * Roda toda vez que o Medusa confere as promoções de um carrinho: quando
 * alguém digita um cupom, e a cada mudança (produto, quantidade, e-mail). O
 * que ele devolve é mesclado no contexto antes das regras — a porta oficial
 * do Medusa pra isso, a mesma do frete (`contexto-do-frete.ts`).
 *
 * Os pedidos do e-mail: uma consulta, só o status e os códigos. Sem e-mail
 * (a sacola antes do passo 1), nenhum pedido: "por cliente" e "primeira
 * compra" deixam aplicar, e o Medusa confere de novo quando o e-mail chega.
 * A política de frete da loja (o frete grátis pelo valor, que é "outra
 * promoção" pro cupom que não combina) vem das configurações, guardada por
 * 30 segundos.
 *
 * AS LINHAS VOLTAM MARCADAS: o que o gancho devolve é mesclado por cima do
 * carrinho (um espalhar raso, em `getActionsToComputeFromPromotionsStep`), e
 * `items` troca as linhas da conta pelas mesmas linhas com a marca
 * `fb_promocional` — o resto de cada uma é o mesmo objeto. Carrinho sem a
 * lista de linhas (não acontece hoje) fica com as dele.
 *
 * AS PROMOÇÕES DO PAINEL (o "Leve X, pague Y", `lib/promocoes.ts`) leem as
 * linhas também: cada uma ganha a `fb_preco_promocional` (a regra "não vale
 * em produto com preço promocional"), e a linha de uma promoção que disparou
 * vira `fb_promocional` — o cupom que não combina não desconta ela.
 *
 * O CUPOM "SÓ COM PRODUTOS DE" CATEGORIAS: com um na conta (`cuponsNaConta`),
 * uma consulta a mais lê as categorias que ele escolheu, e o produto em mais
 * de uma categoria entra na lista só com a do cupom (entrega 0151; o porquê
 * está em `lib/cupons.ts`). Sem cupom de campanha na conta, nenhuma consulta.
 *
 * SE UMA CONSULTA FALHAR, O CARRINHO NÃO QUEBRA: sem os pedidos, o contexto
 * sai sem a trava do `conferido`, e cupom com condição não aplica naquela
 * conta; sem a política de frete, o pedido conta como se tivesse o frete da
 * loja, e o cupom que não combina não aplica; sem as promoções do painel, a
 * promoção vale do mesmo jeito (ela só precisa da marca do preço), e o cupom
 * que não combina desconta também a linha dela, naquela conta; sem as
 * categorias dos cupons, a lista sai com todas, como antes da 0151 (o produto
 * em mais de uma categoria pode ser recusado naquela conta, nunca aceito a
 * mais). A pessoa tenta de novo; a oferta do checkout e o resto do carrinho
 * seguem.
 */
updateCartPromotionsWorkflow.hooks.setPromotionContext(
  async ({ cart, promo_codes, action }, { container }) => {
    const c = cart as {
      id?: string
      email?: string | null
      items?: ItemDoCarrinho[] | null
    }
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const email = typeof c.email === "string" ? c.email.trim() : ""
    let pedidos: PedidoDoEmail[] | null = []
    if (email) {
      try {
        pedidos = await pedidosDoEmail(container, email)
      } catch (e) {
        logger.warn(`[cupons] o histórico do carrinho ${c.id} não veio: ${e}`)
        pedidos = null
      }
    }
    let frete: PoliticaDeFrete | null = null
    try {
      frete = await politicaDeFrete(container)
    } catch (e) {
      logger.warn(`[cupons] a política de frete não veio pro carrinho ${c.id}: ${e}`)
    }
    let promocoes: PromocaoAtiva[] = []
    try {
      promocoes = await promocoesDoPainel(container)
    } catch (e) {
      logger.warn(`[promocoes] as promoções do painel não vieram pro carrinho ${c.id}: ${e}`)
    }
    let categoriasDosCupons: string[][] = []
    const naConta = cuponsNaConta(cart as CarrinhoComCodigos, promo_codes ?? [], action)
    if (naConta.length) {
      try {
        categoriasDosCupons = categoriasEscolhidas(await regrasDosCupons(container, naConta))
      } catch (e) {
        logger.warn(`[cupons] as categorias dos cupons não vieram pro carrinho ${c.id}: ${e}`)
      }
    }
    const agora = Date.now()
    return new StepResponse({
      ...contextoDosCupons({ itens: c.items ?? [], pedidos, agora, frete, categoriasDosCupons }),
      ...(Array.isArray(c.items)
        ? { items: marcarPromocoes(linhasMarcadas(c.items), promocoes, agora) }
        : {}),
    })
  }
)

/**
 * UM CUPOM POR PEDIDO, como na Nuvemshop: quem põe um código de campanha
 * num carrinho que já tem outro ouve "não" (a oferta do checkout não conta).
 * A loja tira o de antes quando a pessoa digita outro
 * (`apps/loja/src/lib/acoes/checkout.ts`). A conta do Medusa a cada mudança
 * no carrinho (`replace` com os mesmos códigos) passa; o `replace` que traz
 * cupom novo e deixa dois não (o `promo_codes` no corpo do carrinho, que o
 * middleware também fecha — entrega 0136): ver `outroCupomNoCarrinho`.
 */
updateCartPromotionsWorkflow.hooks.validate(async ({ input, cart }) => {
  const c = cart as { promotions?: ({ code?: string | null } | null)[] | null }
  const i = input as { promo_codes?: string[] | null; action?: string | null }
  const outro = outroCupomNoCarrinho(
    (c.promotions ?? []).map((p) => p?.code),
    i.promo_codes ?? [],
    i.action ?? undefined
  )
  if (outro)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Um cupom por pedido: o ${outro} já está no carrinho.`
    )
})

/** O status e os códigos de cada pedido feito com este e-mail. */
async function pedidosDoEmail(
  container: { resolve: (chave: string) => unknown },
  email: string
): Promise<PedidoDoEmail[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (a: object) => Promise<{ data: unknown[] }>
  }
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "status", "items.adjustments.code", "shipping_methods.adjustments.code"],
    filters: { email, is_draft_order: false },
  })
  return (
    data as {
      status?: string | null
      items?: { adjustments?: { code?: string | null }[] | null }[] | null
      shipping_methods?: { adjustments?: { code?: string | null }[] | null }[] | null
    }[]
  ).map((o) => ({
    status: o.status,
    codigos: [...(o.items ?? []), ...(o.shipping_methods ?? [])]
      .flatMap((l) => l.adjustments ?? [])
      .map((a) => a.code ?? "")
      .filter(Boolean),
  }))
}

/** As regras dos cupons que estão na conta — o atributo e os valores de cada uma. */
async function regrasDosCupons(
  container: { resolve: (chave: string) => unknown },
  codigos: string[]
): Promise<PromocaoComRegras[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (a: object) => Promise<{ data: unknown[] }>
  }
  const { data } = await query.graph({
    entity: "promotion",
    fields: ["code", "rules.attribute", "rules.values.value"],
    filters: { code: codigos },
  })
  return data as PromocaoComRegras[]
}

/** A política de frete da loja, lida no máximo a cada 30 s (o carrinho confere a toda mudança). */
let guardada: { frete: PoliticaDeFrete; ate: number } | null = null
async function politicaDeFrete(container: {
  resolve: (chave: string) => unknown
}): Promise<PoliticaDeFrete> {
  if (guardada && guardada.ate > Date.now()) return guardada.frete
  const lojas = container.resolve(Modules.STORE) as {
    listStores: (f: object, c: object) => Promise<{ metadata?: Record<string, unknown> | null }[]>
  }
  const [loja] = await lojas.listStores({}, { select: ["id", "metadata"], take: 1 })
  const frete = lerConfiguracoes(loja?.metadata).frete
  guardada = { frete, ate: Date.now() + 30_000 }
  return frete
}
