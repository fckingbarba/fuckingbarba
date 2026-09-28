import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { mudarPdp } from "../lib/painel/gravar-produto"
import {
  FATOR,
  KITS_DO_FATOR,
  paginaDoFatorNoKit,
  type PaginaDoKit,
} from "../lib/painel/pagina-do-fator-nos-kits"
import { lerPdp, type Pdp } from "../lib/pdp"

/** `{}` e `[]` não vão pro log: não havia nada ali. */
const vazio = (v: unknown) =>
  (Array.isArray(v) && !v.length) || (typeof v === "object" && v !== null && !Object.keys(v).length)

/**
 * A PÁGINA DO FATOR NOS KITS DELE — roda UMA vez, sozinho, no `medusa
 * db:migrate` do deploy (entrega 0200; scripts desta pasta são registrados
 * como migração).
 *
 * Lê a página do Fator como ela está no banco NA HORA — com o que o dono
 * editou no painel: os vídeos do "Vê na prática", os casos de antes e
 * depois, os Benefícios e as Perguntas — e grava nos quatro kits que trazem
 * o frasco (a regra, e o que fica de cada kit, em
 * `lib/painel/pagina-do-fator-nos-kits.ts`). Pelo `mudarPdp`, como o painel:
 * na trava do produto, só o `fb_pdp`, e a loja avisada.
 *
 * O que cada kit tinha nas partes trocadas vai INTEIRO pro log: é o caminho
 * de volta, se um dia precisar. Produto que não existe no banco fica de fora,
 * sem erro (o banco da semente não tem os kits; o do CI não tem nem o Fator).
 */
export default async function paginaDoFatorNosKits({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const produtos = await container
    .resolve(Modules.PRODUCT)
    .listProducts({ handle: [FATOR, ...KITS_DO_FATOR] }, { select: ["id", "handle", "metadata"] })
  const fator = produtos.find((p) => p.handle === FATOR)
  if (!fator) {
    logger.info("[pdp] o Fator não está no banco: os kits ficam como estão")
    return
  }
  const doFator = lerPdp(fator.metadata)
  if (!Object.keys(doFator.conteudo).length) {
    logger.warn("[pdp] a página do Fator está vazia: os kits ficam como estão")
    return
  }

  let gravados = 0
  for (const handle of KITS_DO_FATOR) {
    const kit = produtos.find((p) => p.handle === handle)
    if (!kit) continue
    let antes: Pdp | null = null
    let feito: PaginaDoKit | null = null
    const r = await mudarPdp(container, kit.id, (atual) => {
      antes = atual
      feito = paginaDoFatorNoKit(doFator, atual, handle)
      if (!feito) return { ok: false, motivo: "página do Fator vazia" }
      if (!feito.mudou.length) return { ok: false, motivo: "já é a do Fator" }
      return { ok: true, pdp: feito.pdp }
    })
    const f = feito as PaginaDoKit | null
    const a = antes as Pdp | null
    if (!r.ok || !f || !a) {
      logger.info(`[pdp] ${handle}: não gravei (${r.ok ? "sem página" : r.motivo})`)
      continue
    }
    gravados++
    logger.info(`[pdp] ${handle}: com a página do Fator — ${f.mudou.join(", ")}`)
    for (const parte of f.mudou) {
      const era =
        parte === "layout" || parte === "fundos" || parte === "videos"
          ? a[parte]
          : a.conteudo[parte as keyof Pdp["conteudo"]]
      if (era === undefined || vazio(era)) continue
      logger.info(`[pdp] ${handle}: antes, ${parte} era: ${JSON.stringify(era)}`)
    }
  }
  logger.info(
    `[pdp] a página do Fator nos kits: ${gravados} de ${KITS_DO_FATOR.length} kit(s) gravado(s)`
  )
}
