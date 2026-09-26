import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { CUPONS_DA_NUVEMSHOP, planoDosCupons } from "../lib/cupons-da-nuvemshop"

/**
 * OS CUPONS DA NUVEMSHOP ENTRAM NA LOJA NOVA — roda UMA vez, sozinho, no
 * `medusa db:migrate` do deploy (scripts desta pasta são registrados como
 * migração).
 *
 * Cria, um por um, os cupons de `lib/cupons-da-nuvemshop.ts` (a lista que o
 * dono mandou em 26/09), do jeito que o painel cria: aparecem em Cupons e
 * descontos, com a chave de pausar. O que fica de fora, e por quê, sai no
 * log; o código que já existe no Medusa é pulado.
 *
 * Um cupom que o Medusa recusa não para o deploy: fica no log, e os outros
 * entram. Rodar de novo (apagando a linha em `script_migrations`) não
 * duplica nada.
 */
export default async function cuponsDaNuvemshop({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: existentes } = await query.graph({ entity: "promotion", fields: ["code"] })
  const plano = planoDosCupons(
    CUPONS_DA_NUVEMSHOP,
    existentes.map((p) => p.code),
    new Date()
  )

  for (const f of plano.deFora) logger.info(`[cupons] ${f.codigo} fica de fora: ${f.motivo}`)
  const falharam: string[] = []
  for (const { codigo, promocao } of plano.criar) {
    try {
      await createPromotionsWorkflow(container).run({
        input: { promotionsData: [promocao] as never },
      })
    } catch (e) {
      falharam.push(codigo)
      logger.warn(`[cupons] ${codigo}: o Medusa recusou (${e instanceof Error ? e.message : e})`)
    }
  }
  logger.info(
    `[cupons] da Nuvemshop: ${plano.criar.length - falharam.length} criados, ` +
      `${plano.jaExistem.length} já existiam, ${plano.deFora.length} de fora` +
      (falharam.length ? `, ${falharam.length} recusados (${falharam.join(", ")})` : "")
  )
}
