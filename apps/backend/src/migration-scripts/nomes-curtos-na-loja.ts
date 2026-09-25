import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { MARCA_DO_NOME } from "../lib/erp/marcas"
import { tagsDoProduto } from "../lib/painel/gravar-produto"
import { NOMES_CURTOS, nomesPraTrocar } from "../lib/painel/nomes-curtos"
import { avisarALoja } from "../lib/revalidar"

/**
 * OS NOMES CURTOS ENTRAM NA LOJA — roda UMA vez, sozinho, no `medusa
 * db:migrate` do deploy (scripts desta pasta são registrados como migração).
 *
 * Troca o nome dos 7 produtos pelos que o dono aprovou em 25/09
 * (`lib/painel/nomes-curtos.ts`) e põe a marca `fb_nome` em cada um: a
 * importação do Bling não troca mais esses nomes, e o painel muda quando
 * quiser. Produto que não existe ou que já tem nome dado no painel fica como
 * está; o que já está com o nome novo ganha só a marca.
 *
 * Avisa a loja: o título da página, a vitrine e a home mudam. Se a loja
 * ainda estiver subindo o deploy dela, o aviso cai na anterior — e a nova já
 * nasce lendo os nomes novos.
 */
export default async function nomesCurtosNaLoja({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const produtos = await container
    .resolve(Modules.PRODUCT)
    .listProducts(
      { handle: Object.keys(NOMES_CURTOS) },
      { select: ["id", "handle", "title", "metadata"] }
    )
  const trocas = nomesPraTrocar(produtos)
  const em = new Date().toISOString()
  for (const t of trocas) {
    await updateProductsWorkflow(container).run({
      input: {
        selector: { id: t.id },
        update: {
          title: t.para,
          metadata: { [MARCA_DO_NOME]: { em, por: "entrega 0099 (nomes aprovados em 25/09)" } },
        },
      },
    })
    logger.info(
      t.de === t.para
        ? `[nomes] ${t.handle}: já era “${t.para}” — agora com a marca da loja`
        : `[nomes] ${t.handle}: “${t.de}” → “${t.para}”`
    )
  }
  if (trocas.length)
    await avisarALoja(
      [...new Set(trocas.flatMap((t) => tagsDoProduto(t.handle)))],
      logger,
      "seconds"
    )
  logger.info(`[nomes] nomes curtos na loja: ${trocas.length} de ${produtos.length} marcados`)
}
