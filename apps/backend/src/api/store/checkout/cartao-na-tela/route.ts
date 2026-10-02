import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { ICartModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MARCA_DO_CARTAO_NA_TELA } from "../../../../lib/painel/inicio-periodo"
import { daLoja } from "../../../../lib/quem-pede"

/**
 * POST /store/checkout/cartao-na-tela — `{ carrinho, porque }`: o cartão
 * deste carrinho não passou da tela. O Pagar.me não devolveu o token — e aí
 * nada chega no Medusa, nem na porta do cartão (`lib/cartao/porta.ts`), que
 * anota todas as outras tentativas. Sem esta marca, quem digitou o cartão e
 * travou ali contava como "saiu sem tentar pagar" no Início do painel (o
 * porquê de quem sai no pagamento, entrega 0244, `saidasDoPagamento`).
 *
 * `porque`: "dados" (o Pagar.me recusou o número, a validade ou o CVV),
 * "conexao" (ele não respondeu) ou "indisponivel" (a loja sem a chave
 * pública). A marca é `{ porque, em }`, da ÚLTIMA vez: o painel compara com a
 * última tentativa da porta, e fica a mais nova.
 *
 * Quem chama é a loja (`cartaoNaoPassou`). SÓ A LOJA (`x-loja-segredo`): o
 * `metadata` do carrinho é dela, como no `POST /store/checkout/aberto` — e,
 * como lá, direto no módulo do carrinho, sem refazer frete nem sessão. Nada
 * de quem comprou: nem o cartão, nem o final dele.
 *
 * RESPOSTAS: 200 `{ marcado }` (false: o carrinho já é pedido); 400
 * `dados_invalidos`; 401 sem assinatura; 404 `carrinho_nao_existe`.
 */

const CARRINHO = /^cart_[A-Za-z0-9]+$/
const PORQUES = new Set(["dados", "conexao", "indisponivel"])

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!daLoja(req)) {
    res.status(401).json({ message: "sem_assinatura" })
    return
  }
  const corpo = (req.body ?? {}) as { carrinho?: unknown; porque?: unknown }
  const id =
    typeof corpo.carrinho === "string" && CARRINHO.test(corpo.carrinho) ? corpo.carrinho : ""
  const porque = typeof corpo.porque === "string" && PORQUES.has(corpo.porque) ? corpo.porque : ""
  if (!id || !porque) {
    res.status(400).json({ message: "dados_invalidos" })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "completed_at"],
    filters: { id },
  })
  const carrinho = data[0] as { completed_at?: unknown } | undefined
  if (!carrinho) {
    res.status(404).json({ message: "carrinho_nao_existe" })
    return
  }
  if (carrinho.completed_at) {
    res.json({ marcado: false })
    return
  }
  await req.scope.resolve<ICartModuleService>(Modules.CART).updateCarts(id, {
    metadata: { [MARCA_DO_CARTAO_NA_TELA]: { porque, em: new Date().toISOString() } },
  })
  res.json({ marcado: true })
}
