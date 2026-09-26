import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { mudarPdp } from "../lib/painel/gravar-produto"
import {
  comOsTextos,
  HANDLES_COM_TEXTO,
  type FotoDoProduto,
  type PdpComTextos,
} from "../lib/painel/secoes-da-pdp"

/**
 * AS SETE SEÇÕES ENTRAM EM TODOS OS PRODUTOS — roda UMA vez, sozinho, no
 * `medusa db:migrate` do deploy (scripts desta pasta são registrados como
 * migração).
 *
 * Grava, em cada produto de `lib/painel/secoes-da-pdp.ts`, os Benefícios, a
 * Linha do tempo, a Rotina, o Como funciona e modo de uso, a Comparação, o
 * Pra quem é e as Perguntas frequentes (pedido do dono em 26/09, entrega
 * 0105), liga as que estiverem desligadas e grava a descrição do Google.
 * Pelo `mudarPdp`, como o painel: na trava do produto, só o `fb_pdp`, e a
 * loja avisada. O que já estava numa seção trocada fica no log — no ar, em
 * 26/09, só o Fator tinha uma, a Linha do tempo de teste ("Essa é a linha do
 * tempo").
 *
 * Produto que não existe no banco fica de fora, sem erro (o banco local tem
 * os seis da semente; a produção, os 15).
 */
export default async function secoesDaPdp({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const produtos = await container
    .resolve(Modules.PRODUCT)
    .listProducts(
      { handle: HANDLES_COM_TEXTO },
      { select: ["id", "handle"], relations: ["images"] }
    )

  // As fotos na ordem da galeria (a mesma da loja): a foto N é a da posição N.
  const galeria = new Map(
    produtos.map((p) => [
      p.handle,
      [...(p.images ?? [])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).map((i) => i.url),
    ])
  )
  const foto: FotoDoProduto = (handle, n) => galeria.get(handle)?.[n - 1] ?? null

  let gravados = 0
  for (const p of produtos) {
    let feito: PdpComTextos | null = null
    const r = await mudarPdp(container, p.id, (atual) => {
      feito = comOsTextos(atual, p.handle, foto)
      return feito ? { ok: true, pdp: feito.pdp } : { ok: false, motivo: "sem_texto" }
    })
    const f = feito as PdpComTextos | null
    if (!r.ok || !f) {
      logger.warn(`[pdp] ${p.handle}: não gravei (${r.ok ? "sem texto" : r.motivo})`)
      continue
    }
    gravados++
    logger.info(
      `[pdp] ${p.handle}: ${f.trocadas.length ? `seções escritas — ${f.trocadas.join(", ")}` : "já estava com os textos"}${
        f.ligadas.length ? `; ligadas: ${f.ligadas.join(", ")}` : ""
      }`
    )
    for (const [secao, era] of Object.entries(f.antes))
      logger.info(`[pdp] ${p.handle}: a seção ${secao} tinha: ${JSON.stringify(era).slice(0, 400)}`)
  }
  logger.info(`[pdp] seções da página: ${gravados} de ${produtos.length} produto(s) gravado(s)`)
}
