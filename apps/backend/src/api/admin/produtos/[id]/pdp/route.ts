import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { CHAVE_NO_METADATA, lerPdp, type Pdp } from "../../../../../lib/pdp"
import { avisarALoja } from "../../../../../lib/revalidar"

/**
 * GET/POST /admin/produtos/:id/pdp — o conteúdo editorial da página do produto.
 *
 * O editor vive DENTRO da página do produto no admin (um widget em
 * `product.details.after`), e não numa tela separada, por um motivo prático:
 * preço, foto, estoque e texto da PDP são a mesma tarefa — publicar um
 * produto. Separar em duas telas obriga a pessoa a lembrar da segunda.
 *
 * GRAVA O QUE PASSOU PELA MESMA PENEIRA DA LEITURA. `lerPdp` é reaproveitada
 * inteira: uma seção com campo obrigatório faltando não entra, em vez de
 * entrar pela metade e desenhar um cabeçalho solto no meio da página. Assim
 * o que a loja lê é exatamente o que foi gravado, sem uma segunda validação
 * que pode divergir da primeira.
 *
 * DERRUBA DUAS ETIQUETAS: a do produto (o texto mudou) e a do layout daquele
 * produto (as seções podem ter mudado de ordem). São etiquetas diferentes
 * porque os dois dados têm cadências diferentes, e derrubar só uma deixaria
 * a página com o texto novo na ordem velha.
 */

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const produto = await buscar(req)
  res.json({ pdp: lerPdp(produto.metadata) })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const produto = await buscar(req)

  const limpa: Pdp = lerPdp({ [CHAVE_NO_METADATA]: req.body })

  await updateProductsWorkflow(req.scope).run({
    input: {
      selector: { id: produto.id },
      update: {
        // Espalha o metadata existente: os kits de quantidade guardam a
        // própria marcação aí (`tipo: "kit-quantidade"`), e sobrescrever a
        // chave inteira apagaria isso — o kit sumiria da PDP do avulso.
        metadata: { ...(produto.metadata ?? {}), [CHAVE_NO_METADATA]: limpa },
      },
    },
  })

  const aviso = await avisarALoja(
    [`produto:${produto.handle}`, `layout:produto:${produto.handle}`, "produtos"],
    logger,
    "seconds"
  )

  const secoes = Object.keys(limpa.conteudo)
  logger.info(`[pdp] ${produto.handle}: ${secoes.length ? secoes.join(", ") : "sem seções"}`)

  res.json({ pdp: limpa, loja_avisada: aviso.avisou })
}

async function buscar(req: MedusaRequest) {
  const id = req.params.id
  const service = req.scope.resolve(Modules.PRODUCT)
  const [produto] = await service.listProducts(
    { id },
    { select: ["id", "handle", "title", "metadata"], take: 1 }
  )
  if (!produto) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Produto ${id} não existe`)
  }
  return produto
}
