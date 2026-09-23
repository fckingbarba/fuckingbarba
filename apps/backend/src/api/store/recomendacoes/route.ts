import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"
import { ehKitDeQuantidade, handlesComBumpAtivo } from "../../../lib/bumps"
import { lerPdp } from "../../../lib/pdp"
import { daLoja } from "../../../lib/quem-pede"
import {
  lerOferta,
  montarModelo,
  type Modelo,
  type PedidoDoModelo,
  type ProdutoDoModelo,
} from "../../../lib/recomendacao"

/**
 * GET /store/recomendacoes — o modelo do motor de recomendação, pronto.
 *
 *   { "modelo": { "afinidade": { "fator-…": { "oleo-…": 0.3, … } }, … } }
 *
 * A conta mora em `lib/recomendacao.ts`; aqui só se junta o que ela pede: os
 * produtos publicados (com a rotina da PDP e as categorias), os pedidos do
 * último ano (quem foi comprado junto, e a oferta do checkout de cada um) e
 * as ofertas que estão valendo (`lib/bumps.ts`).
 *
 * SÓ A LOJA PERGUNTA (`x-loja-segredo`). O modelo não traz contagem nenhuma,
 * mas montar ele lê um ano de pedidos — rota pública assim é convite pra
 * alguém fazer o banco trabalhar à toa. A loja guarda a resposta por uma
 * hora (`modeloDeRecomendacao`, em `apps/loja/src/lib/medusa.ts`), e esta
 * rota guarda a conta por dez minutos: várias cópias da loja perguntando ao
 * mesmo tempo fazem UMA conta.
 */

const VALE_POR_MS = 10 * 60 * 1000
const JANELA_MS = 365 * 24 * 60 * 60 * 1000
const PAGINA = 500
/** Teto de pedidos lidos. Um ano de loja pequena cabe folgado. */
const MAX_PEDIDOS = 5000

let guardado: { em: number; modelo: Modelo } | null = null
let calculando: Promise<Modelo> | null = null

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (!daLoja(req)) {
    res.status(401).json({ message: "sem_assinatura" })
    return
  }
  res.json({ modelo: await modeloAtual(req.scope) })
}

async function modeloAtual(container: MedusaContainer): Promise<Modelo> {
  if (guardado && Date.now() - guardado.em < VALE_POR_MS) return guardado.modelo
  calculando ??= calcular(container)
    .then((modelo) => {
      guardado = { em: Date.now(), modelo }
      return modelo
    })
    .finally(() => {
      calculando = null
    })
  return calculando
}

async function calcular(container: MedusaContainer): Promise<Modelo> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: brutos } = await query.graph({
    entity: "product",
    fields: ["handle", "title", "metadata", "categories.handle"],
    filters: { status: ProductStatus.PUBLISHED },
  })
  const produtos: ProdutoDoModelo[] = brutos.flatMap((p) => {
    if (!p.handle || ehKitDeQuantidade(p.metadata)) return []
    const pdp = lerPdp(p.metadata)
    return [
      {
        handle: p.handle,
        titulo: p.title ?? p.handle,
        categorias: (p.categories ?? []).flatMap((c) => (c?.handle ? [c.handle] : [])),
        combina: [
          ...(pdp.conteudo.rotina?.itens ?? []).map((i) => i.handle),
          ...(pdp.combinada.produtos ?? []),
        ],
      },
    ]
  })

  const desde = new Date(Date.now() - JANELA_MS)
  const pedidos: PedidoDoModelo[] = []
  for (let pulados = 0; pulados < MAX_PEDIDOS; pulados += PAGINA) {
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "status", "metadata", "items.product_handle"],
      filters: { created_at: { $gte: desde } },
      pagination: { skip: pulados, take: PAGINA, order: { created_at: "DESC" } },
    })
    for (const pedido of data) {
      // Cancelado não conta: foi desistência (ou Pix que não foi pago), e o
      // que ele diz sobre "comprado junto" é menos do que parece.
      if (pedido.status === "canceled" || pedido.status === "draft") continue
      pedidos.push({
        handles: (pedido.items ?? []).flatMap((i) => (i?.product_handle ? [i.product_handle] : [])),
        bump: lerOferta(pedido.metadata),
      })
    }
    if (data.length < PAGINA) break
  }

  return montarModelo(produtos, pedidos, await handlesComBumpAtivo(container))
}
