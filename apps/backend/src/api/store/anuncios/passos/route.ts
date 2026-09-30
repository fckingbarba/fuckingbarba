import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { mandarPassos } from "../../../../lib/anuncios/enviar"
import { lerPassos, lerQuem } from "../../../../lib/anuncios/passos"
import { criarLimite } from "../../../../lib/limite"
import { dominioDe } from "../../../../lib/observabilidade/telemetria"
import { daLoja, quemPede } from "../../../../lib/quem-pede"

/**
 * POST /store/anuncios/passos — `{ passos, quem }`: a visita à página, o
 * produto, a sacola, o checkout e o pagamento, pra Meta e pro TikTok pelo
 * servidor (`lib/anuncios/passos.ts`, entrega 0231).
 *
 * SÓ A LOJA (`x-loja-segredo`): a rota dela (`apps/loja/src/app/api/passos`)
 * confere a resposta sobre os cookies e lê os cookies da Meta e do TikTok, o
 * IP e o navegador — o navegador nunca fala direto com o Medusa.
 *
 * Responde 204 na hora e manda DEPOIS: quem visitou não espera a Meta. Cada
 * IP manda no máximo 60 lotes por minuto, e a loja inteira 3.000; passou,
 * 429 e nada sai.
 *
 * RESPOSTAS: 204; 401 sem assinatura; 429 `limite`.
 */

const POR_IP = { limite: 60, ms: 60_000 }
const DA_LOJA = { limite: 3000, ms: 60_000 }
const limite = criarLimite()

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!daLoja(req)) {
    res.status(401).json({ message: "sem_assinatura" })
    return
  }
  const ip = quemPede(req).chave
  if (!limite.cabe(ip, POR_IP) || !limite.cabe("loja", DA_LOJA)) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(ip, POR_IP)
  limite.contar("loja", DA_LOJA)

  const corpo = (req.body ?? {}) as { passos?: unknown; quem?: unknown }
  const passos = lerPassos(corpo.passos, dominioDe(process.env.LOJA_URL))
  const quem = lerQuem(corpo.quem)
  res.status(204).send()
  if (!passos.length) return

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  mandarPassos(req.scope, passos, quem)
    .then((r) => {
      for (const [plataforma, como] of Object.entries(r))
        if (como !== "enviada")
          logger.warn(
            `[anuncios] ${passos.length} passos da visita não foram pra ${plataforma} (${como})`
          )
    })
    .catch((e) =>
      logger.warn(`[anuncios] os passos da visita não foram: ${e instanceof Error ? e.message : e}`)
    )
}
