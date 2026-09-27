import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { randomBytes } from "node:crypto"
import { PREFIXO_DA_PROMOCAO, type PromocaoCrua } from "../../../lib/cupons"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { anotar } from "../../../lib/painel/anotar"
import { catalogoDaLoja } from "../../../lib/painel/catalogo"
import { valerNaLoja } from "../../../lib/painel/promocoes"
import { lerPromocaoNova, promocaoDoMedusa, promocaoNaLista } from "../../../lib/promocoes"

/**
 * POST /dashboard/promocoes — cria uma promoção do painel: o "Leve X, pague
 * Y" (`lib/promocoes.ts`, o "Compre X e pague Y" da Nuvemshop). A lista mora
 * no `GET /dashboard/cupons`, na mesma tela dos cupons. Marketing e dono.
 *
 * Criada, ela vale na hora: o carrinho lê as promoções de novo
 * (`esquecerPromocoes`), o desconto por quantidade tira os produtos dela das
 * faixas que chegam no X (a loja decidiu que os dois não somam) e a loja é
 * avisada — o selo e os cartões da página do produto são dela.
 *
 * RESPOSTAS: 200 `{ promocao }`; 422 `{ erros }` (campo → frase).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "cupons")) return

  const agora = new Date()
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const lido = lerPromocaoNova(req.body, agora, await catalogoDaLoja(query))
  if (!lido.ok) {
    res.status(422).json({ erros: lido.erros })
    return
  }
  const p = lido.promocao

  // O código ninguém digita: sorteado, e sorteado de novo no raríssimo repetido.
  let codigo = ""
  for (let tentativa = 0; tentativa < 5 && !codigo; tentativa++) {
    const sorteado = `${PREFIXO_DA_PROMOCAO}${randomBytes(4).toString("hex").toUpperCase()}`
    const { data } = await query.graph({
      entity: "promotion",
      fields: ["id"],
      filters: { code: sorteado },
    })
    if (!data.length) codigo = sorteado
  }
  if (!codigo)
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "[promocoes] não achei um código livre em 5 sorteios"
    )

  const { result } = await createPromotionsWorkflow(req.scope).run({
    input: { promotionsData: [promocaoDoMedusa(p, codigo, pedido.membro.nome, agora)] as never },
  })
  const criada = result[0] as unknown as PromocaoCrua
  await anotar(pedido, "criou-promocao", criada.id, { codigo, nome: p.nome })
  await valerNaLoja(req.scope)

  res.json({
    promocao: promocaoNaLista(
      criada,
      { tipo: "leve-pague", ...p },
      { pedidos: 0, desconto: 0, vendeu: 0 },
      agora
    ),
  })
}
