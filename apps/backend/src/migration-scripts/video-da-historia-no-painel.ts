import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { lerConfiguracoes } from "../lib/configuracoes"
import { CHAVE_NO_METADATA, comVideoDoAdmin, lerHome } from "../lib/home"
import { mudarMetadataDaLoja } from "../lib/metadata-da-loja"

/**
 * O VÍDEO DA HISTÓRIA DA MARCA VAI DO ADMIN PRO PAINEL — roda UMA vez,
 * sozinho, no `medusa db:migrate` do deploy (scripts desta pasta são
 * registrados como migração).
 *
 * Até a entrega 0080 o vídeo subia em Configurações da loja → Home e morava
 * no `fb_configuracoes`. Agora ele é do "Sobre a marca", no painel: este
 * script copia o que está no ar pra home (o publicado e o rascunho, se
 * houver), com o texto que cada versão já tinha — o site não muda, e o
 * painel abre mostrando o vídeo de hoje. A conta é de `comVideoDoAdmin`
 * (`lib/home.ts`, com testes).
 *
 * Não avisa a loja: o que ela mostra não muda. E o vídeo continua no
 * `fb_configuracoes`: a loja cai nele enquanto a home que ela guardou for a
 * de um Medusa de antes (sem a chave `video` no "Sobre").
 */
export default async function videoDaHistoriaNoPainel({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const feito = await mudarMetadataDaLoja(container, (metadata) => {
    const video = lerConfiguracoes(metadata).home.video
    if (!video) return { resultado: "sem vídeo no admin: nada pra trazer" }
    const home = comVideoDoAdmin(lerHome(metadata), video)
    if (!home) return { resultado: "a home já tem vídeo: nada pra trazer" }
    // A mesma peneira da leitura: o que a loja lê é exatamente o que foi gravado.
    return {
      gravar: { [CHAVE_NO_METADATA]: lerHome({ [CHAVE_NO_METADATA]: home }) },
      resultado: "o vídeo veio do admin pro painel (Sobre a marca)",
    }
  })
  logger.info(`[home] vídeo da história: ${feito ?? "nenhuma loja no Medusa"}`)
}
