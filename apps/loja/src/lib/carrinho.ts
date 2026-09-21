import "server-only"
import type { HttpTypes } from "@medusajs/types"
import { cookies } from "next/headers"
import { CARRINHO_VAZIO, type CarrinhoVisivel, type ItemDoCarrinho } from "./carrinho-visivel"
import { cliente, regiaoBrasil } from "./medusa"

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
 * `campos` existe porque o checkout precisa de mais coisa que a gaveta
 * (endereço, cobrança, método de frete) e a gaveta não tem por que carregar
 * isso em toda página. O padrão continua sendo o da gaveta.
 */
export async function lerCarrinho(campos = CAMPOS_CARRINHO): Promise<Carrinho | null> {
  const sdk = cliente()
  if (!sdk) return null

  const id = (await cookies()).get(COOKIE_CARRINHO)?.value
  if (!id) return null

  try {
    const { cart } = await sdk.store.cart.retrieve(id, { fields: campos })
    // Carrinho já virado pedido não serve mais pra nada, mas o Medusa ainda
    // devolve ele. Sem esta checagem a pessoa que comprou volta pro site e
    // encontra a própria compra parada na gaveta.
    if (cart?.completed_at) return null
    return cart ?? null
  } catch (e) {
    aviso(e, `carrinho ${id}`)
    return null
  }
}

/** Quantas unidades tem na sacola — é o número do cabeçalho. */
export function quantasUnidades(carrinho: Carrinho | null): number {
  return (carrinho?.items ?? []).reduce((soma, item) => soma + (item.quantity ?? 0), 0)
}

/**
 * O id do carrinho pra escrever, criando um se ainda não existe.
 *
 * Só serve dentro de ação ou route handler: fora deles o Next não deixa
 * gravar cookie, e sem gravar o carrinho recém-criado se perderia no fim da
 * requisição.
 */
export async function garantirCarrinho(): Promise<string | null> {
  const sdk = cliente()
  if (!sdk) return null

  const jar = await cookies()
  const existente = jar.get(COOKIE_CARRINHO)?.value
  if (existente) {
    // confere se ainda vale antes de tentar escrever nele
    const atual = await lerCarrinho()
    if (atual) return atual.id
    jar.delete(COOKIE_CARRINHO)
  }

  const regiao = await regiaoBrasil()
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
