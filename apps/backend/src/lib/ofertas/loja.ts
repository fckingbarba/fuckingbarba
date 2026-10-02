import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { refreshCartItemsWorkflow } from "@medusajs/medusa/core-flows"
import { produtosGuardados, servicoDasOfertas, type OfertaGuardada } from "./lista"
import { MARCA_DA_OFERTA, situacaoDaOferta, type Situacao } from "./regras"

/**
 * AS OFERTAS DO LADO DA LOJA — a página `/oferta/<endereço>` e a marca no
 * carrinho (as rotas `GET /store/oferta/:endereco`, `POST
 * /store/oferta/:endereco/carrinho` e `POST /store/ofertas/conferir`).
 */

export const CARRINHO = /^cart_[A-Za-z0-9]+$/
const ENDERECO = /^[a-z0-9-]{3,40}$/

/** O que a página da oferta recebe. Pausada ou encerrada, sem os produtos: o preço não vale mais. */
export type OfertaDaPagina = {
  id: string
  endereco: string
  titulo: string
  chamada: string | null
  comecaEm: string
  terminaEm: string
  situacao: Situacao
  /** O tempo do relógio da página, em minutos (recomeça); `null`, até o fim. */
  relogioMinutos: number | null
  produtos: { id: string; por: number }[]
}

export async function ofertaPeloEndereco(
  container: MedusaContainer,
  endereco: string
): Promise<OfertaGuardada | null> {
  if (!ENDERECO.test(endereco)) return null
  const [lida] = await servicoDasOfertas(container).listOfertas({ slug: endereco }, { take: 1 })
  return lida
    ? { ...(lida as unknown as OfertaGuardada), produtos: produtosGuardados(lida.produtos) }
    : null
}

export function ofertaDaPagina(o: OfertaGuardada, agora = Date.now()): OfertaDaPagina {
  const situacao = situacaoDaOferta(o, agora)
  const vale = situacao === "no-ar" || situacao === "agendada"
  return {
    id: o.id,
    endereco: o.slug,
    titulo: o.titulo,
    chamada: o.chamada ?? null,
    comecaEm: new Date(o.comeca_em).toISOString(),
    terminaEm: new Date(o.termina_em).toISOString(),
    situacao,
    relogioMinutos: o.relogio_minutos ?? null,
    produtos: vale ? o.produtos.map((p) => ({ id: p.produto, por: p.por })) : [],
  }
}

type CarrinhoLido = {
  id: string
  completed_at?: unknown
  metadata?: Record<string, unknown> | null
  items?: unknown[] | null
}

export async function lerCarrinho(
  container: MedusaContainer,
  id: string
): Promise<CarrinhoLido | null> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "cart",
    fields: ["id", "completed_at", "metadata", "items.id"],
    filters: { id },
  })
  return (data[0] as CarrinhoLido | undefined) ?? null
}

/**
 * Marca (ou tira a marca d)o carrinho e refaz o preço das linhas que já
 * estavam — com a marca, as da oferta entram pelo "por"; sem, voltam pro da
 * vitrine. Direto no módulo do carrinho, como o `POST /store/checkout/aberto`
 * (o `POST /store/carts/:id` recusa `metadata` vindo da loja, e refaria o
 * frete à toa). `""` apaga a chave (o Medusa junta o `metadata`).
 */
export async function marcarCarrinho(
  container: MedusaContainer,
  carrinho: CarrinhoLido,
  oferta: string | null
) {
  await container
    .resolve(Modules.CART)
    .updateCarts(carrinho.id, { metadata: { [MARCA_DA_OFERTA]: oferta ?? "" } })
  if (carrinho.items?.length)
    await refreshCartItemsWorkflow(container).run({
      input: { cart_id: carrinho.id, force_refresh: true },
    })
}
