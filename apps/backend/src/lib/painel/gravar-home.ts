import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CHAVE_NO_METADATA, lerHome, type HomeGuardada } from "../home"
import { mudarMetadataDaLoja } from "../metadata-da-loja"
import { avisarALoja } from "../revalidar"

/**
 * A HOME GRAVADA PELO PAINEL — uma mudança de cada vez, sobre a home gravada
 * AGORA, dentro da trava do metadata da loja (`lib/metadata-da-loja.ts`).
 *
 * Duas pessoas editando seções diferentes não se atropelam: cada rota diz O
 * QUE muda (uma seção, a ordem, publicar), e a mudança é aplicada sobre a
 * leitura que acabou de ser feita — não sobre a tela que cada um tinha.
 */

/** As etiquetas da loja que a home publicada derruba: o texto e a ordem. */
export const TAGS_DA_HOME = ["home", "layout:home"]

type Recusa<M extends string> = { ok: false; motivo: M; faltando?: string[] }
type Mudou<M extends string> = { ok: true; home: HomeGuardada } | Recusa<M>

export async function mudarHome<M extends string>(
  container: MedusaContainer,
  mudar: (home: HomeGuardada) => Mudou<M>
): Promise<Mudou<M | "sem_loja">> {
  const r = await mudarMetadataDaLoja<Mudou<M>>(container, (metadata) => {
    const feito = mudar(lerHome(metadata))
    if (!feito.ok) return { resultado: feito }
    // A mesma peneira da leitura: o que a loja lê é exatamente o que foi gravado.
    const limpa = lerHome({ [CHAVE_NO_METADATA]: feito.home })
    return { gravar: { [CHAVE_NO_METADATA]: limpa }, resultado: { ok: true as const, home: limpa } }
  })
  return r ?? { ok: false, motivo: "sem_loja" }
}

/**
 * Avisa a loja depois do "Publicar" — e só dele: o rascunho não aparece no
 * site, então mexer nele não tem o que derrubar.
 */
export async function avisarDaHome(container: MedusaContainer): Promise<boolean> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const aviso = await avisarALoja(TAGS_DA_HOME, logger, "seconds")
  return aviso.avisou
}
