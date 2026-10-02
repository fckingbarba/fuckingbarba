import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { urlDaLoja } from "../emails/moldura"
import { totaisDos } from "../painel/ler"
import { totalDo } from "../painel/pedido"
import { avisarALoja } from "../revalidar"
import { produtosComPreco, produtosGuardados, type OfertaGuardada } from "./lista"
import { MARCA_DA_OFERTA, situacaoDaOferta, type Situacao } from "./regras"

/**
 * AS OFERTAS NO PAINEL — o que a lista de Cupons e descontos → Ofertas
 * ocultas mostra de cada uma, e o catálogo do formulário.
 *
 * AS VENDAS: o `metadata` do carrinho passa pro pedido (Medusa 2.21), então
 * o pedido de quem comprou pela oferta leva a marca `fb_oferta`. Conta os
 * pedidos não cancelados desde o começo da oferta mais antiga da lista, e o
 * vendido só dos pagos — como os cupons.
 */

export type ProdutoNaLista = {
  id: string
  nome: string
  /** O "por" que o painel escolheu. */
  por: number
  /** O preço da vitrine hoje (com o promocional), ou `null`. */
  hoje: number | null
  /**
   * O link deste produto na oferta (`/oferta/<endereço>/<produto>`): leva
   * direto pra página dele, com o preço da oferta (entrega 0241). `null`
   * sem o `LOJA_URL`, ou com o produto fora da loja.
   */
  link: string | null
}

export type OfertaNaLista = {
  id: string
  nome: string
  titulo: string
  chamada: string | null
  endereco: string
  /** O link inteiro, ou `null` sem o `LOJA_URL` no backend. */
  link: string | null
  comecaEm: string
  terminaEm: string
  situacao: Situacao
  /** O tempo do relógio da página, em minutos (recomeça); `null`, até o fim. */
  relogioMinutos: number | null
  produtos: ProdutoNaLista[]
  vendas: { pedidos: number; vendeu: number }
}

export type ProdutoDoFormulario = {
  id: string
  nome: string
  imagem: string | null
  /** O preço de hoje de uma unidade (o teto do "por"). */
  preco: number | null
  /** O cheio, sem o promocional. */
  cheio: number | null
}

/**
 * O link geral da oferta: com um produto só, ele leva direto pra página do
 * produto; com vários, pra página com todos (a loja decide, entrega 0241).
 */
export const linkDaOferta = (endereco: string) => {
  const loja = urlDaLoja()
  return loja ? `${loja}/oferta/${endereco}` : null
}

/** O link de um produto da oferta: direto pra página dele, com o preço da oferta. */
export const linkDoProduto = (endereco: string, handle: string | null | undefined) => {
  const loja = urlDaLoja()
  return loja && handle ? `${loja}/oferta/${endereco}/${handle}` : null
}

type PedidoCru = {
  id: string
  status?: string | null
  metadata?: Record<string, unknown> | null
  payment_collections?: { payments?: { captured_at?: unknown }[] | null }[] | null
}

/** Pedidos e vendido de cada oferta (pela marca no pedido). */
async function vendasDas(
  container: MedusaContainer,
  ofertas: OfertaGuardada[]
): Promise<Map<string, { pedidos: number; vendeu: number }>> {
  const mapa = new Map<string, { pedidos: number; vendeu: number }>()
  if (!ofertas.length) return mapa
  const desde = new Date(Math.min(...ofertas.map((o) => new Date(o.comeca_em).getTime())))
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "status", "metadata", "payment_collections.payments.captured_at"],
    filters: { is_draft_order: false, created_at: { $gte: desde } },
    pagination: { take: 5000, order: { created_at: "DESC" } },
  })
  const daOferta = (data as PedidoCru[]).flatMap((o) => {
    const oferta = o.metadata?.[MARCA_DA_OFERTA]
    if (typeof oferta !== "string" || o.status === "canceled") return []
    const pago = (o.payment_collections ?? []).some((c) =>
      (c.payments ?? []).some((p) => p.captured_at)
    )
    return [{ id: o.id, oferta, pago }]
  })
  const totais = await totaisDos(
    container,
    daOferta.filter((o) => o.pago).map((o) => o.id)
  )
  for (const o of daOferta) {
    const atual = mapa.get(o.oferta) ?? { pedidos: 0, vendeu: 0 }
    const total = o.pago && totais.get(o.id) ? totalDo(totais.get(o.id)!) : 0
    mapa.set(o.oferta, {
      pedidos: atual.pedidos + 1,
      vendeu: Math.round((atual.vendeu + total) * 100) / 100,
    })
  }
  return mapa
}

/** As ofertas como a lista do painel mostra, da mais nova pra mais velha. */
export async function ofertasNaLista(
  container: MedusaContainer,
  lidas: OfertaGuardada[],
  agora = Date.now()
): Promise<OfertaNaLista[]> {
  const ofertas = lidas.map((o) => ({ ...o, produtos: produtosGuardados(o.produtos) }))
  const ids = [...new Set(ofertas.flatMap((o) => o.produtos.map((p) => p.produto)))]
  const [produtos, vendas] = await Promise.all([
    produtosComPreco(container, ids),
    vendasDas(container, ofertas),
  ])
  return ofertas
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
    .map((o) => ({
      id: o.id,
      nome: o.nome,
      titulo: o.titulo,
      chamada: o.chamada ?? null,
      endereco: o.slug,
      link: linkDaOferta(o.slug),
      comecaEm: new Date(o.comeca_em).toISOString(),
      terminaEm: new Date(o.termina_em).toISOString(),
      situacao: situacaoDaOferta(o, agora),
      relogioMinutos: o.relogio_minutos ?? null,
      produtos: o.produtos.map((p) => ({
        id: p.produto,
        nome: produtos.get(p.produto)?.nome ?? "Produto que saiu da loja",
        por: p.por,
        hoje: produtos.get(p.produto)?.preco ?? null,
        link: linkDoProduto(o.slug, produtos.get(p.produto)?.handle),
      })),
      vendas: vendas.get(o.id) ?? { pedidos: 0, vendeu: 0 },
    }))
}

/** Os produtos publicados, em ordem de nome, com o preço de hoje — o formulário. */
export async function produtosDoFormulario(
  container: MedusaContainer
): Promise<ProdutoDoFormulario[]> {
  const produtos = await produtosComPreco(container)
  return [...produtos.entries()]
    .map(([id, p]) => ({ id, nome: p.nome, imagem: p.imagem, preco: p.preco, cheio: p.cheio }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

/**
 * A loja relê as páginas de oferta na hora ("agora"): oferta pausada ou
 * encerrada pelo painel não pode seguir mostrando o preço — ela vincula.
 */
export async function avisarAsPaginas(container: MedusaContainer) {
  await avisarALoja(["ofertas"], container.resolve(ContainerRegistrationKeys.LOGGER), "agora")
}
