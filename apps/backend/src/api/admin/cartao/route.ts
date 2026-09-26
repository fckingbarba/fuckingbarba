import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { freioLigado, LIMITES } from "../../../lib/cartao/robo"
import { OBSERVABILIDADE } from "../../../modules/observabilidade"
import type ObservabilidadeService from "../../../modules/observabilidade/service"

/**
 * A PROTEÇÃO DO CARTÃO, pelo admin — o socorro manual das travas contra o
 * robô testando cartão (`lib/cartao/`).
 *
 * `GET /admin/cartao`: as últimas 24 horas (tentativas, aprovadas,
 * recusadas, barradas, as sem a assinatura da loja), o freio agora, os
 * limites e as 20 últimas tentativas — cada uma com a sacola, como terminou e
 * por quê. Sem IP e sem dado de quem comprou: o `quem` é um resumo.
 *
 * `POST /admin/cartao` com `{ "acao": "soltar" }`: dali pra frente, as travas
 * e o freio só contam o que vier depois. Pra quando o freio ligou por engano
 * (uma promoção que trouxe muita recusa de gente de verdade) — e pro
 * conferidor de pagamento começar do zero. Fica no registro, com quem
 * soltou.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await estado(req))
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const acao = (req.body as { acao?: unknown } | undefined)?.acao
  if (acao !== "soltar") {
    res.status(400).json({ message: 'acao: só "soltar"' })
    return
  }
  const quem = req.auth_context?.actor_id ?? "?"
  await req.scope.resolve<ObservabilidadeService>(OBSERVABILIDADE).soltarCartao(`admin:${quem}`)
  req.scope
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(`[cartão] o cartão foi solto pelo admin (${quem}): as travas recomeçam do zero`)
  res.json(await estado(req))
}

async function estado(req: AuthenticatedMedusaRequest) {
  const obs = req.scope.resolve<ObservabilidadeService>(OBSERVABILIDADE)
  const [resumo, ultimas] = await Promise.all([
    obs.resumoDoCartao(),
    obs.listTentativas(
      {},
      {
        select: [
          "id",
          "carrinho",
          "quem",
          "assinada",
          "resultado",
          "motivo",
          "valor",
          "created_at",
        ],
        order: { created_at: "DESC" },
        take: 20,
      }
    ),
  ])
  return {
    ...resumo,
    freio: { ...resumo.freio, ligado: freioLigado(resumo.freio) },
    limites: LIMITES,
    ultimas,
  }
}
