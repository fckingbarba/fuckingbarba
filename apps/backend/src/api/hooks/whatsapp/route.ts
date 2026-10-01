import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { assinaturaConfere, desafioDaVerificacao, lerAvisoDaMeta } from "../../../lib/whatsapp/meta"
import { WHATSAPP } from "../../../modules/whatsapp"
import type WhatsappService from "../../../modules/whatsapp/service"

/**
 * GET /hooks/whatsapp — o "Verificar e salvar" da tela do webhook, no app da
 * Meta (developers.facebook.com → o app → WhatsApp → Configuração). A Meta
 * manda a senha que foi digitada lá e um desafio; com a senha certa (a
 * `WHATSAPP_VERIFICACAO` do Railway), o desafio volta e a Meta salva o
 * endereço. Senha errada ou sem a variável: 403, e a Meta não salva.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const senha = process.env.WHATSAPP_VERIFICACAO
  const desafio = desafioDaVerificacao(req.query as Record<string, unknown>, senha)
  if (!desafio) {
    logger.warn(
      senha
        ? "[whatsapp] verificação recusada: a senha não confere com a WHATSAPP_VERIFICACAO"
        : "[whatsapp] verificação recusada: falta a WHATSAPP_VERIFICACAO no Railway"
    )
    res.status(403).json({ message: "nao_autorizado" })
    return
  }
  logger.info("[whatsapp] webhook verificado pela Meta")
  res.setHeader("content-type", "text/plain")
  res.status(200).send(desafio)
}

/**
 * POST /hooks/whatsapp — o aviso da Meta: a mensagem que alguém mandou pro
 * número da loja, e o "entregue", "lida" ou "falhou" das que a loja mandou.
 *
 * ┌─ SÓ COM A ASSINATURA DA META ──────────────────────────────────────────┐
 * │ O endereço é público. A Meta assina cada aviso com a chave secreta do  │
 * │ app (`WHATSAPP_APP_SEGREDO`), e a conta é sobre o corpo CRU, byte por  │
 * │ byte (`preserveRawBody`, no `middlewares.ts`). Sem o segredo, ou sem a │
 * │ assinatura certa, 401 e nada gravado.                                  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * SÓ GUARDA: quem responde é o job `responder-no-whatsapp`, de minuto em
 * minuto (esperar a pessoa terminar de escrever, e a fila no banco). A Meta
 * quer resposta rápida e manda de novo o que não teve 200 — por isso a
 * mesma mensagem duas vezes não entra duas vezes (o `wamid`), e o banco fora
 * devolve 503 pra ela tentar de novo.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const segredo = process.env.WHATSAPP_APP_SEGREDO
  const corpo = req.rawBody ? String(req.rawBody) : ""
  if (!assinaturaConfere({ assinatura: req.headers["x-hub-signature-256"], corpo, segredo })) {
    logger.warn(
      segredo
        ? "[whatsapp] aviso recusado: a assinatura não confere"
        : "[whatsapp] aviso recusado: falta o WHATSAPP_APP_SEGREDO no Railway"
    )
    res.status(401).json({ message: "nao_autorizado" })
    return
  }

  let json: unknown
  try {
    json = JSON.parse(corpo)
  } catch {
    res.status(400).json({ message: "aviso_ilegivel" })
    return
  }
  const aviso = lerAvisoDaMeta(json, process.env.WHATSAPP_NUMERO_ID?.trim())

  try {
    const whatsapp = req.scope.resolve<WhatsappService>(WHATSAPP)
    for (const m of aviso.mensagens) await whatsapp.receber(m)
    for (const s of aviso.situacoes) await whatsapp.anotarSituacao(s)
  } catch (e) {
    logger.warn(`[whatsapp] não guardei o aviso: ${e instanceof Error ? e.message : e}`)
    res.status(503).json({ message: "tente_de_novo" })
    return
  }
  res.json({ ok: true })
}
