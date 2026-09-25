import "server-only"
import type { HttpTypes } from "@medusajs/types"
import { cookies } from "next/headers"
import { CARRINHO_VAZIO, type CarrinhoVisivel, type ItemDoCarrinho } from "./carrinho-visivel"
import { cliente, falhaPassageira, regiaoBrasil } from "./medusa"

/**
 * O CARRINHO
 *
 * Carrinho de verdade, no Medusa. O navegador guarda só o id; quantidade,
 * preço, desconto e frete são conta do backend — a mesma regra que já vale
 * pro catálogo: "o front exibe, não calcula".
 *
 * POR QUE NÃO GUARDAR OS ITENS NO NAVEGADOR: porque aí o preço passaria a
 * ser combinado entre o que o navegador lembra e o que o backend cobra, e
 * quando os dois discordarem (promoção que acabou, estoque que sumiu, preço
 * que mudou no meio da compra) quem descobre é o cliente, no checkout. Com o
 * carrinho no servidor só existe uma resposta, e ela é a que vai ser cobrada.
 *
 * NADA AQUI É CACHEADO, e não é descuido: `cookies()` torna o escopo
 * dinâmico de propósito. Carrinho cacheado é carrinho de outra pessoa
 * aparecendo na sua tela — o tipo de bug que só dá as caras em produção,
 * quando duas pessoas caem no mesmo nó do CDN.
 *
 * Quem escreve são as ações em `lib/acoes/carrinho.ts`. Este arquivo lê e
 * empresta os ajudantes.
 */

/**
 * `httpOnly` porque o navegador não tem nada que fazer com este id: quem
 * conversa com o Medusa é o servidor. `lax` deixa o carrinho sobreviver à
 * volta do checkout do provedor de pagamento, que é uma navegação de outro
 * site pra cá.
 */
export const COOKIE_CARRINHO = "carrinho"

const UM_MES = 60 * 60 * 24 * 30

export const OPCOES_COOKIE = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: UM_MES,
} as const

/**
 * Campos que a gaveta precisa. `*items.variant` e `*items.product` trazem
 * foto e handle pra linha do carrinho poder linkar de volta pro produto sem
 * uma segunda consulta por item.
 *
 * `*shipping_methods` e o CEP do endereço entram porque a gaveta tem o bloco
 * "Frete e prazo": a entrega que a pessoa escolhe ali fica NO CARRINHO, e o
 * pé da gaveta mostra o frete e o total que o Medusa calculou com ela.
 */
const CAMPOS_CARRINHO =
  "id,region_id,currency_code,email,subtotal,discount_total,shipping_total,tax_total,total," +
  "item_subtotal,item_total,*items,*items.variant,*items.product,*items.thumbnail," +
  "*shipping_methods,shipping_address.postal_code"

function aviso(erro: unknown, contexto: string) {
  const msg = erro instanceof Error ? erro.message : String(erro)
  console.warn(`[carrinho] ${contexto}: ${msg}`)
}

export type Carrinho = HttpTypes.StoreCart

/**
 * O formato que a interface vê mora em `carrinho-visivel.ts`, sem nenhuma
 * dependência, porque a gaveta é componente de cliente e este arquivo é
 * `server-only`. Reexporto aqui pra quem já importava daqui continuar
 * funcionando — e pra ficar claro que é o mesmo contrato.
 */
export { CARRINHO_VAZIO, type CarrinhoVisivel, type ItemDoCarrinho } from "./carrinho-visivel"

export function paraVisivel(carrinho: Carrinho | null): CarrinhoVisivel {
  if (!carrinho) return CARRINHO_VAZIO

  const itens: ItemDoCarrinho[] = (carrinho.items ?? []).map((item) => ({
    id: item.id,
    varianteId: item.variant_id ?? "",
    nome: item.product_title ?? item.title ?? "Produto",
    // "Único" é o nome que o Medusa dá pra variante de produto sem opção;
    // mostrar isso na sacola só confunde
    variante: item.variant_title && item.variant_title !== "Único" ? item.variant_title : null,
    handle: item.product_handle ?? null,
    imagem: item.thumbnail ?? null,
    quantidade: item.quantity ?? 0,
    precoUnitario: Number(item.unit_price ?? 0),
    total: Number(item.total ?? 0),
  }))

  const metodo = carrinho.shipping_methods?.[0]

  return {
    id: carrinho.id,
    itens,
    unidades: itens.reduce((soma, i) => soma + i.quantidade, 0),
    subtotal: Number(carrinho.item_subtotal ?? carrinho.subtotal ?? 0),
    totalDosItens: Number(carrinho.item_total ?? 0),
    // Sem método, `null` — e não o `shipping_total`, que vem 0 e diria
    // "frete grátis" pra quem ainda nem digitou o CEP.
    frete: metodo ? Number(carrinho.shipping_total ?? 0) : null,
    freteEscolhido: metodo?.shipping_option_id ?? null,
    cep: (carrinho.shipping_address?.postal_code ?? "").replace(/\D+/g, ""),
    total: Number(carrinho.total ?? 0),
  }
}

/**
 * O carrinho da pessoa, ou null.
 *
 * Devolve null também quando o cookie aponta pra um carrinho que o backend
 * não reconhece mais — carrinho finalizado, banco recriado, id de outro
 * ambiente. É o caso que acontece toda vez que alguém volta ao site depois
 * de comprar, e tratar como "não tem carrinho" é o certo.
 *
 * E null quando o Medusa não respondeu. Quem precisa separar os dois casos
 * usa a `leituraDoCarrinho`, logo abaixo.
 *
 * `campos` existe porque o checkout precisa de mais coisa que a gaveta
 * (endereço, cobrança, método de frete) e a gaveta não tem por que carregar
 * isso em toda página. O padrão continua sendo o da gaveta.
 */
export async function lerCarrinho(campos = CAMPOS_CARRINHO): Promise<Carrinho | null> {
  const lido = await leituraDoCarrinho(campos)
  return lido === "sem-resposta" ? null : lido
}

/**
 * O carrinho, "não tem" (null) ou "não deu pra saber" (`"sem-resposta"`).
 *
 * Pra quem desenha a sacola, os dois últimos são opostos: um é "sacola
 * vazia", o outro é "a sacola está lá, só não consegui ver agora". Tratados
 * igual, todo deploy do backend (o Medusa reinicia) mostrava a sacola vazia,
 * sem recado — e quem pusesse os produtos de novo ficava com o dobro, porque
 * o carrinho de antes continuava lá (24/09).
 *
 * `"sem-resposta"` é rede, prazo, 5xx ou 429 (`falhaPassageira`). O resto que
 * dá errado — 404, carrinho de outro ambiente — é "não tem", como sempre foi.
 */
export async function leituraDoCarrinho(
  campos = CAMPOS_CARRINHO
): Promise<Carrinho | null | "sem-resposta"> {
  const sdk = cliente()
  if (!sdk) return null

  const id = (await cookies()).get(COOKIE_CARRINHO)?.value
  if (!id) return null

  try {
    /*
      `completed_at` vai SEMPRE, somado ao que quem chamou pediu. Lista de
      campos sem `+` substitui a padrão do Medusa inteira — e nenhuma das
      listas desta loja pedia `completed_at`. A checagem logo abaixo
      comparava com `undefined` e nunca disparava: um carrinho já virado
      pedido continuava "vivo", e o checkout abria sessão de pagamento nova
      em cima dele — o que apaga a sessão do pedido e mata o Pix que o
      cliente está pagando. (A revisão do pagamento pegou.)
    */
    const { cart } = await sdk.store.cart.retrieve(id, { fields: `${campos},completed_at` })
    // Carrinho já virado pedido não serve mais pra nada, mas o Medusa ainda
    // devolve ele. Sem esta checagem a pessoa que comprou volta pro site e
    // encontra a própria compra parada na gaveta.
    if (cart?.completed_at) return null
    return cart ?? null
  } catch (e) {
    aviso(e, `carrinho ${id}`)
    return falhaPassageira(e) ? "sem-resposta" : null
  }
}

/**
 * O CARRINHO DO COOKIE JÁ VIROU PEDIDO? E qual?
 *
 * Acontece quando a resposta do fechamento se perde no caminho — entre o
 * navegador e a loja, ou entre a loja e o Medusa. O pedido existe (no cartão,
 * já cobrado), mas o cookie da sacola não foi apagado e o crachá do pedido
 * não chegou. Sem isto, a pessoa recarrega o checkout, encontra a sacola
 * vazia e compra de novo.
 *
 * Qual pedido: `pedidoDoCarrinho`, mais abaixo.
 */
export async function carrinhoFechado(): Promise<boolean> {
  const sdk = cliente()
  const id = (await cookies()).get(COOKIE_CARRINHO)?.value
  if (!sdk || !id) return false
  try {
    const { cart } = await sdk.store.cart.retrieve(id, { fields: "id,completed_at" })
    return Boolean(cart?.completed_at)
  } catch {
    return false
  }
}

export async function pedidoDoCarrinhoFechado(): Promise<string | null> {
  const id = (await cookies()).get(COOKIE_CARRINHO)?.value
  if (!id || !(await carrinhoFechado())) return null
  return pedidoDoCarrinho(id)
}

/**
 * O pedido que saiu de um carrinho já fechado, ou null.
 *
 * PRIMEIRO PERGUNTA, SEM MEXER EM NADA: `/store/pedido-do-carrinho/:id`, rota
 * nossa no Medusa. O `complete` só devolve o pedido de um carrinho fechado
 * enquanto o pagamento dele segue de pé — o Medusa (2.21) confere as sessões
 * de pagamento ANTES de ver que o pedido já existe. Com o cartão reprovado
 * na análise, ou o Pix vencido, a sessão vira "canceled" e o `complete`
 * responde 400 pra sempre. Era o laço de 24/09: o /checkout mandava pro
 * /checkout/retomar, que não achava o pedido e mandava de volta — 71 idas
 * em 8 segundos.
 *
 * O `complete` fica pro backend de antes da rota (404) — é o jeito que a
 * API pública do Medusa tem de dizer que pedido saiu dele, sem cobrar de
 * novo.
 */
export async function pedidoDoCarrinho(id: string): Promise<string | null> {
  const sdk = cliente()
  if (!sdk) return null
  try {
    const { pedido } = await sdk.client.fetch<{ pedido: string | null }>(
      `/store/pedido-do-carrinho/${encodeURIComponent(id)}`,
      { cache: "no-store" }
    )
    return pedido
  } catch (e) {
    if ((e as { status?: unknown } | null)?.status !== 404) {
      aviso(e, `pedido do carrinho ${id}`)
      return null
    }
  }
  try {
    const resposta = await sdk.store.cart.complete(id)
    return resposta.type === "order" ? resposta.order.id : null
  } catch (e) {
    aviso(e, `pedido do carrinho ${id}`)
    return null
  }
}

/** Quantas unidades tem na sacola — é o número do cabeçalho. */
export function quantasUnidades(carrinho: Carrinho | null): number {
  return (carrinho?.items ?? []).reduce((soma, item) => soma + (item.quantity ?? 0), 0)
}

/**
 * O carrinho do cookie ainda serve pra escrever?
 *
 * "sem-resposta" é o Medusa fora do ar, e aí não dá pra saber. A diferença
 * pesa: o `lerCarrinho` devolve null pros dois casos, e o `garantirCarrinho`
 * apagava o cookie em qualquer null. Um clique em "Adicionar" durante um
 * restart do backend jogava fora a sacola inteira, que continuava lá no
 * Medusa, só que sem ninguém que soubesse o id dela.
 */
async function situacaoDoCarrinho(
  sdk: NonNullable<ReturnType<typeof cliente>>,
  id: string
): Promise<"vale" | "acabou" | "sem-resposta"> {
  try {
    const { cart } = await sdk.store.cart.retrieve(id, { fields: "id,completed_at" })
    return cart && !cart.completed_at ? "vale" : "acabou"
  } catch (e) {
    if (falhaPassageira(e)) {
      aviso(e, `carrinho ${id}`)
      return "sem-resposta"
    }
    // 404: finalizado há tempo, banco recriado, id de outro ambiente.
    return "acabou"
  }
}

/**
 * O id do carrinho pra escrever, criando um se ainda não existe.
 *
 * Só serve dentro de ação ou route handler: fora deles o Next não deixa
 * gravar cookie, e sem gravar o carrinho recém-criado se perderia no fim da
 * requisição.
 *
 * `null` é "agora não deu" — quem chama já diz isso na tela. Nunca lança.
 */
export async function garantirCarrinho(): Promise<string | null> {
  const sdk = cliente()
  if (!sdk) return null

  const jar = await cookies()
  const existente = jar.get(COOKIE_CARRINHO)?.value
  if (existente) {
    const situacao = await situacaoDoCarrinho(sdk, existente)
    if (situacao === "vale") return existente
    // A sacola fica no cookie pra quando o Medusa voltar.
    if (situacao === "sem-resposta") return null
    jar.delete(COOKIE_CARRINHO)
  }

  let regiao: Awaited<ReturnType<typeof regiaoBrasil>>
  try {
    regiao = await regiaoBrasil()
  } catch (e) {
    // A leitura cacheada lança quando o Medusa não responde (ver `lib/medusa.ts`).
    aviso(e, "região")
    return null
  }
  if (!regiao) {
    aviso(new Error("nenhuma região configurada"), "criar")
    return null
  }

  try {
    const { cart } = await sdk.store.cart.create({ region_id: regiao.id })
    jar.set(COOKIE_CARRINHO, cart.id, OPCOES_COOKIE)
    return cart.id
  } catch (e) {
    aviso(e, "criar")
    return null
  }
}

export { CAMPOS_CARRINHO }
