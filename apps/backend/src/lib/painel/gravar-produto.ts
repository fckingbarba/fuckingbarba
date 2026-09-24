import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { MARCA_DAS_FOTOS } from "../erp/catalogo"
import { CHAVE_NO_METADATA, LIMITE_DE_VIDEOS, lerPdp, type Pdp } from "../pdp"
import { avisarALoja } from "../revalidar"
import {
  desmontarGaleria,
  fotosDoProduto,
  montarGaleria,
  mudarGaleria,
  type ItemDaGaleria,
  type PedidoNaGaleria,
} from "./galeria"

/**
 * O PRODUTO GRAVADO PELO PAINEL — uma mudança de cada vez, sobre o que está
 * gravado AGORA.
 *
 * ┌─ POR QUE UMA MUDANÇA, E NÃO A PÁGINA INTEIRA ──────────────────────────┐
 * │ O widget do admin mandava a página inteira (`fb_pdp`) a cada "Salvar": │
 * │ duas pessoas editando seções diferentes, a segunda apagava o que a     │
 * │ primeira salvou. Aqui cada rota diz O QUE muda (uma seção, uma chave,  │
 * │ a caixa de compra), e a mudança é aplicada dentro da trava do produto, │
 * │ sobre a leitura que acabou de ser feita.                               │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * GRAVA SÓ A CHAVE `fb_pdp` do metadata: o Medusa junta o metadata raso
 * (`mergeMetadata`), então as outras chaves — a marca do ERP, a das fotos —
 * ficam como estão, mesmo que alguém as tenha mudado no meio. Espalhar o
 * metadata lido antes poderia desfazer essa mudança.
 *
 * Depois, avisa a loja (as etiquetas do produto, da ordem dele e da
 * vitrine): a página muda em segundos.
 */

export const tagsDoProduto = (handle: string) => [
  `produto:${handle}`,
  `layout:produto:${handle}`,
  "produtos",
]

type Recusa = { ok: false; motivo: string; faltando?: string[] }
type Feito = { ok: true; handle: string; lojaAvisada: boolean }

const TRAVA = (id: string) => `pdp:${id}`

export async function mudarPdp(
  container: MedusaContainer,
  id: string,
  mudar: (pdp: Pdp) => { ok: true; pdp: Pdp } | Recusa
): Promise<(Feito & { pdp: Pdp }) | Recusa> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const r = await container.resolve(Modules.LOCKING).execute(
    TRAVA(id),
    async (): Promise<{ ok: true; pdp: Pdp; handle: string } | Recusa> => {
      const [produto] = await container
        .resolve(Modules.PRODUCT)
        .listProducts({ id }, { select: ["id", "handle", "metadata"], take: 1 })
      if (!produto) return { ok: false, motivo: "nao_encontrado" }
      const feito = mudar(lerPdp(produto.metadata))
      if (!feito.ok) return feito
      // A mesma peneira da leitura: o que a loja lê é exatamente o que foi gravado.
      const limpa = lerPdp({ [CHAVE_NO_METADATA]: feito.pdp })
      await updateProductsWorkflow(container).run({
        input: { selector: { id }, update: { metadata: { [CHAVE_NO_METADATA]: limpa } } },
      })
      return { ok: true, pdp: limpa, handle: produto.handle }
    },
    { timeout: 30 }
  )
  if (!r.ok) return r
  const aviso = await avisarALoja(tagsDoProduto(r.handle), logger, "seconds")
  return { ...r, lojaAvisada: aviso.avisou }
}

/** Subtítulo, categoria e se está no site — campos do produto, não da página. */
export async function mudarProduto(
  container: MedusaContainer,
  id: string,
  update: { subtitle?: string | null; category_ids?: string[]; status?: ProductStatus }
): Promise<Feito | Recusa> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const r = await container.resolve(Modules.LOCKING).execute(
    TRAVA(id),
    async (): Promise<{ ok: true; handle: string } | Recusa> => {
      const [produto] = await container
        .resolve(Modules.PRODUCT)
        .listProducts({ id }, { select: ["id", "handle"], take: 1 })
      if (!produto) return { ok: false, motivo: "nao_encontrado" }
      await updateProductsWorkflow(container).run({
        input: { selector: { id }, update },
      })
      return { ok: true, handle: produto.handle }
    },
    { timeout: 30 }
  )
  if (!r.ok) return r
  const aviso = await avisarALoja(tagsDoProduto(r.handle), logger, "seconds")
  return { ...r, lojaAvisada: aviso.avisou }
}

/**
 * UMA mudança na galeria (incluir, mover, tirar), dentro da trava do
 * produto. Grava as fotos no Medusa — na ordem (`rank`), com a primeira como
 * `thumbnail` — e os vídeos no `fb_pdp`, num update só. Marca as fotos como
 * escolhidas (`fb_fotos`, origem "painel"): a importação do ERP e a da
 * Nuvemshop não trocam mais as fotos deste produto.
 */
export async function mudarGaleriaDoProduto(
  container: MedusaContainer,
  id: string,
  pedido: PedidoNaGaleria
): Promise<(Feito & { galeria: ItemDaGaleria[] }) | Recusa> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const r = await container.resolve(Modules.LOCKING).execute(
    TRAVA(id),
    async (): Promise<{ ok: true; handle: string; galeria: ItemDaGaleria[] } | Recusa> => {
      const [produto] = await container
        .resolve(Modules.PRODUCT)
        .listProducts(
          { id },
          { select: ["id", "handle", "thumbnail", "metadata"], relations: ["images"], take: 1 }
        )
      if (!produto) return { ok: false, motivo: "nao_encontrado" }
      const pdp = lerPdp(produto.metadata)
      const mudou = mudarGaleria(
        montarGaleria(fotosDoProduto(produto), pdp.videos),
        pedido,
        LIMITE_DE_VIDEOS
      )
      if (!mudou.ok) return mudou
      const { fotos, videos } = desmontarGaleria(mudou.itens)
      await updateProductsWorkflow(container).run({
        input: {
          selector: { id },
          update: {
            images: fotos.map((url, rank) => ({ url, rank })),
            thumbnail: fotos[0] ?? null,
            metadata: {
              [MARCA_DAS_FOTOS]: {
                origem: "painel",
                fotos: fotos.map((url) => ({ chave: `painel:${url}`, url })),
              },
              [CHAVE_NO_METADATA]: lerPdp({ [CHAVE_NO_METADATA]: { ...pdp, videos } }),
            },
          },
        },
      })
      return { ok: true, handle: produto.handle, galeria: mudou.itens }
    },
    { timeout: 30 }
  )
  if (!r.ok) return r
  const aviso = await avisarALoja(tagsDoProduto(r.handle), logger, "seconds")
  return { ...r, lojaAvisada: aviso.avisou }
}
