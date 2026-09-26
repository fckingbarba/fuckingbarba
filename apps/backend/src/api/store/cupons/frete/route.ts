import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, PromotionStatus } from "@medusajs/framework/utils"
import { ehCupomDeCampanha, normalizarCodigo, type PromocaoCrua } from "../../../../lib/cupons"
import { criarLimite } from "../../../../lib/limite"
import { daLoja, quemPede } from "../../../../lib/quem-pede"

/**
 * GET /store/cupons/frete?codigo=X — esse código é um cupom de FRETE GRÁTIS
 * valendo? E só na entrega mais barata?
 *
 * O Medusa desconta o frete de uma entrega ESCOLHIDA: digitado antes dela, o
 * cupom de frete grátis é recusado como se não existisse. A loja pergunta
 * aqui, e guarda o código pra quando a entrega for escolhida
 * (`apps/loja/src/lib/cupom-pendente.ts`) — em vez de dizer "esse cupom não
 * vale" pra um cupom que vale.
 *
 * Só a loja pergunta (assinada com o `REVALIDAR_SEGREDO`), e com limite por
 * quem está do outro lado: a rota não pode virar um jeito de adivinhar
 * código. A resposta só distingue o cupom de frete valendo; qualquer outro
 * caso (não existe, pausado, de produto) é o mesmo `{ frete: false }`.
 *
 * RESPOSTAS: 200 `{ frete, soMaisBarato }`; 403 `so_a_loja`; 429 `limite`.
 */

const MIN = 60 * 1000
const POR_QUEM = { limite: 30, ms: 10 * MIN }
const DA_LOJA = { limite: 3000, ms: 60 * MIN }
const CODIGO = /^[A-Z0-9][A-Z0-9_-]{2,29}$/
const limite = criarLimite()

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (!daLoja(req)) {
    res.status(403).json({ message: "so_a_loja" })
    return
  }
  const quem = quemPede(req)
  if (!limite.cabe(quem.chave, POR_QUEM) || !limite.cabe("loja", DA_LOJA)) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(quem.chave, POR_QUEM)
  limite.contar("loja", DA_LOJA)

  const digitado = typeof req.query.codigo === "string" ? req.query.codigo.trim() : ""
  const codigo = normalizarCodigo(digitado)
  if (!CODIGO.test(codigo)) {
    res.json({ frete: false, soMaisBarato: false })
    return
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "promotion",
    fields: [
      "id",
      "code",
      "status",
      "is_automatic",
      "application_method.target_type",
      "application_method.target_rules.id",
    ],
    filters: { code: [...new Set([digitado, codigo, codigo.toLowerCase()])] },
  })
  const cupom = (
    data as (PromocaoCrua & {
      application_method?: { target_type?: string | null; target_rules?: unknown[] | null } | null
    })[]
  ).find(
    (p) =>
      ehCupomDeCampanha(p) &&
      p.status === PromotionStatus.ACTIVE &&
      p.application_method?.target_type === "shipping_methods"
  )
  res.json({
    frete: Boolean(cupom),
    soMaisBarato: Boolean(cupom?.application_method?.target_rules?.length),
  })
}
