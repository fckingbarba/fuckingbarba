import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { ICartModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MARCA_DO_CHECKOUT } from "../../../../lib/painel/inicio-periodo"
import { daLoja } from "../../../../lib/quem-pede"

/**
 * POST /store/checkout/aberto — `{ carrinho }`: o checkout deste carrinho
 * abriu. A marca (`fb_checkout_em`, a hora da primeira vez) é o "começaram o
 * checkout" do Início do painel (entrega 0186, `lib/painel/inicio-periodo.ts`)
 * — de todo mundo, com cookie ou sem: é do carrinho, não de quem compra.
 *
 * Quem chama é a loja, logo que a tela do checkout aparece
 * (`abriuOCheckout`). SÓ A LOJA (`x-loja-segredo`): o `metadata` do carrinho é
 * dela (`semMetadataNoCarrinho`, nos middlewares). GRAVA UMA VEZ: abrir de
 * novo não muda nada, e o carrinho que já virou pedido fica como está.
 *
 * DIRETO NO MÓDULO DO CARRINHO, e não pelo `POST /store/carts/:id`: aquele
 * refaz a cotação do frete e a sessão de pagamento a cada mudança (o motivo
 * de o rastro da compra não morar no carrinho — `apps/loja/src/lib/rastro.ts`).
 * Aqui só o `metadata` muda, e o Medusa junta a chave nova com as que já
 * estavam.
 *
 * RESPOSTAS: 200 `{ marcado }` (false: já estava marcado, ou já é pedido);
 * 400 `dados_invalidos`; 401 sem assinatura; 404 `carrinho_nao_existe`.
 */

const CARRINHO = /^cart_[A-Za-z0-9]+$/

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!daLoja(req)) {
    res.status(401).json({ message: "sem_assinatura" })
    return
  }
  const corpo = (req.body ?? {}) as { carrinho?: unknown }
  const id =
    typeof corpo.carrinho === "string" && CARRINHO.test(corpo.carrinho) ? corpo.carrinho : ""
  if (!id) {
    res.status(400).json({ message: "dados_invalidos" })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "completed_at", "metadata"],
    filters: { id },
  })
  const carrinho = data[0] as
    { completed_at?: unknown; metadata?: Record<string, unknown> | null } | undefined
  if (!carrinho) {
    res.status(404).json({ message: "carrinho_nao_existe" })
    return
  }
  if (carrinho.completed_at || carrinho.metadata?.[MARCA_DO_CHECKOUT]) {
    res.json({ marcado: false })
    return
  }
  await req.scope
    .resolve<ICartModuleService>(Modules.CART)
    .updateCarts(id, { metadata: { [MARCA_DO_CHECKOUT]: new Date().toISOString() } })
  res.json({ marcado: true })
}
