import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { CHAVE_NO_METADATA, lerPdp, type ConteudoDaPdp } from "../lib/pdp"
import { ondeEstou } from "./onde-estou"
import SEMENTE from "./dados/pdp-inicial.json"

/**
 * O CONTEÚDO DA PDP — semeadura e conferência.
 *
 *   npm run backend:pdp
 *
 * O `dados/pdp-inicial.json` é o conteúdo que estava escrito em TypeScript
 * na loja (`src/conteudo/produto.ts`), extraído uma vez. Ele existe pra que
 * a mudança de endereço não perca uma vírgula do texto que já estava no ar —
 * e pra que um banco novo nasça com a PDP do Fator montada.
 *
 * Depois disso, quem edita é o admin, na própria página do produto. Este
 * script NÃO SOBRESCREVE o que já existe: um script que passa por cima em
 * silêncio desfaz, sem avisar, o texto que alguém ajustou na tela ontem.
 * Rodando com o conteúdo já gravado, ele só relata o que cada produto tem.
 */

const SOBRESCREVER = false

export default async function pdp({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service = container.resolve(Modules.PRODUCT)

  ondeEstou(logger, "pdp")

  const produtos = await service.listProducts(
    {},
    { select: ["id", "handle", "title", "metadata"], take: 200 }
  )
  if (!produtos.length) {
    logger.error("[pdp] nenhum produto no Medusa — rode o produtos-iniciais antes")
    return
  }

  const sementes = SEMENTE as Record<string, ConteudoDaPdp>
  let escritos = 0

  for (const produto of produtos) {
    const handle = produto.handle ?? ""
    const jaTem = Object.keys(lerPdp(produto.metadata).conteudo).length > 0
    const semente = sementes[handle]

    if (jaTem && !SOBRESCREVER) {
      const secoes = Object.keys(lerPdp(produto.metadata).conteudo)
      logger.info(`[pdp] ${handle}: já tem (${secoes.join(", ")}) — não mexi`)
      continue
    }
    if (!semente) {
      // Não é falta: a maioria dos produtos não tem seção editorial, e a PDP
      // enxuta é uma página válida. Só anota pra quem estiver conferindo.
      logger.info(`[pdp] ${handle}: sem semente — PDP enxuta`)
      continue
    }

    /* Passa pela peneira ANTES de gravar: se a semente tiver uma seção
       incompleta, ela não entra, e o log diz qual — em vez de a loja
       descobrir sozinha meses depois. */
    const limpa = lerPdp({ [CHAVE_NO_METADATA]: { conteudo: semente, layout: {} } })
    const pedidas = Object.keys(semente)
    const aceitas = Object.keys(limpa.conteudo)
    const recusadas = pedidas.filter((s) => !aceitas.includes(s))

    await updateProductsWorkflow(container).run({
      input: {
        selector: { id: produto.id },
        update: {
          metadata: { ...(produto.metadata ?? {}), [CHAVE_NO_METADATA]: limpa },
        },
      },
    })
    escritos++

    logger.info(`[pdp] ${handle}: ${aceitas.length} seção(ões) — ${aceitas.join(", ")}`)
    if (recusadas.length) {
      logger.warn(`[pdp] ${handle}: RECUSADAS por campo obrigatório faltando: ${recusadas.join(", ")}`)
    }
  }

  logger.info(
    escritos
      ? `[pdp] pronto: ${escritos} produto(s) escritos. Daqui pra frente, edite na página do produto no admin.`
      : "[pdp] nada a escrever."
  )
}
