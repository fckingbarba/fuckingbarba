import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { lerConfigDosFluxos, validadeDoCupom } from "../../../../lib/crm/fluxos"
import { cadastrarNaPrimeiraCompra, lerCadastro } from "../../../../lib/crm/primeira-compra"
import { criarLimite } from "../../../../lib/limite"
import { quemPede } from "../../../../lib/quem-pede"

/**
 * O POP-UP DA 1ª COMPRA (entrega 0177) — `lib/crm/primeira-compra.ts`.
 *
 * GET: se o pop-up aparece (o fluxo Boas-vindas ligado no painel), o % do
 * cupom e quantos dias ele vale — o que o pop-up escreve.
 *
 * POST `{ nome, email, pagina }`: o cadastro. Responde o código do cupom pra
 * ele aparecer na tela, além de ir por e-mail.
 *
 * OS LIMITES, na memória, como os da newsletter: por quem pede, 10 por hora
 * com a assinatura da loja e 60 sem; da loja toda, 300 por hora. Cada
 * cadastro cria um cupom — sem teto, um robô enchia o Medusa de promoções.
 *
 * RESPOSTAS DO POST: 200 `{ tipo: "ok", codigo, ate, porcento, nome }`,
 * `{ tipo: "ja-cadastrado", codigo, ate, nome }` ou `{ tipo: "ja-cliente",
 * nome }`; 400 `nome_invalido` ou `email_invalido`; 409 `desligado`; 429
 * `limite`; 503 `falhou`.
 */

const HORA = 60 * 60 * 1000
const DIA = 24 * HORA
const POR_IP_ASSINADO = { limite: 10, ms: HORA }
const POR_IP_SEM_ASSINATURA = { limite: 60, ms: HORA }
const DA_LOJA = { limite: 300, ms: HORA }
const limite = criarLimite()

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const lojas = await req.scope
    .resolve(Modules.STORE)
    .listStores({}, { select: ["metadata"], take: 1 })
  const config = lerConfigDosFluxos(lojas[0]?.metadata)
  res.json({
    ligado: config.fluxos["boas-vindas"].ligado,
    porcento: config.desconto,
    dias: Math.round(validadeDoCupom("boas-vindas") / DIA),
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const lido = lerCadastro(req.body)
  if (!lido.ok) {
    res.status(400).json({ message: lido.erro })
    return
  }

  const quem = quemPede(req)
  const porIp = quem.assinado ? POR_IP_ASSINADO : POR_IP_SEM_ASSINATURA
  if (!limite.cabe(quem.chave, porIp) || !limite.cabe("loja", DA_LOJA)) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(quem.chave, porIp)
  limite.contar("loja", DA_LOJA)

  try {
    const r = await cadastrarNaPrimeiraCompra(req.scope, lido.cadastro)
    if (r.tipo === "desligado") {
      res.status(409).json({ message: "desligado" })
      return
    }
    res.json(r)
  } catch (e) {
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(`[crm] o cadastro da 1ª compra falhou: ${(e as Error).message}`)
    res.status(503).json({ message: "falhou" })
  }
}
