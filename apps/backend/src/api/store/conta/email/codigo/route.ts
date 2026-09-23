import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { contaDoToken } from "../../../../../lib/conta-do-token"
import { emailNoLog, enviarEmail } from "../../../../../lib/email"
import { emailDaTroca } from "../../../../../lib/emails/troca-de-email"
import { criarLimite } from "../../../../../lib/limite"
import { quemPede } from "../../../../../lib/quem-pede"
import {
  contextoDaTroca,
  gerarCodigo,
  MINUTOS_DE_VALIDADE,
  normalizarEmail,
  novoPendente,
  podeEnviarTroca,
  registrarEnvio,
  SEGUNDOS_ENTRE_ENVIOS,
  type MetadadosDoCodigo,
} from "../../../../../modules/codigo/regras"
import { guardarCodigoWorkflow } from "../../../../../workflows/conta/guardar-codigo"

/**
 * POST /store/conta/email/codigo — `{ email }`: manda um código pro e-mail
 * NOVO da conta do token. É a primeira metade de trocar o e-mail; a segunda
 * é `POST /store/conta/email`, com o código.
 *
 * ┌─ POR QUE CÓDIGO NO E-MAIL NOVO ────────────────────────────────────────┐
 * │ O e-mail é a chave da conta: é pra ele que vai o código de entrar. Um  │
 * │ erro de digitação trocado sem conferência trancaria a pessoa pra fora  │
 * │ — o próximo código iria pra uma caixa que não existe, ou que é de      │
 * │ outra pessoa. O código prova que o endereço novo é de quem pediu, e    │
 * │ até ele voltar certo o e-mail de agora continua valendo.               │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO DIZ SE O E-MAIL NOVO JÁ TEM CONTA. O código sai do mesmo jeito; quem
 * descobre é a confirmação, DEPOIS do código certo — aí quem lê é o dono
 * daquele endereço, e não há o que esconder dele. Responder aqui faria desta
 * rota um jeito de descobrir quem é cliente da loja.
 *
 * OS LIMITES: por conta (no banco, junto da troca), os de `regras.ts` — 30 s
 * pro mesmo e-mail, 5 por hora, 10 por dia —, e na memória, por quem pede e
 * da loja toda, como no código de entrar (`api/store/conta/codigo`), cada
 * rota com a sua conta.
 *
 * RESPOSTAS: 200 `{ enviado, reenviar_em, minutos }`; 400 `email_invalido`
 * ou `mesmo_email`; 429 `espera` (com `segundos`) ou `limite`; 409 `mudou`
 * (o e-mail da conta mudou no meio do pedido); 503 `sem_email`. Sem token de
 * cliente, 401 (o `middlewares.ts`).
 */

const HORA = 60 * 60 * 1000
const POR_IP_ASSINADO = { limite: 10, ms: HORA }
const POR_IP_SEM_ASSINATURA = { limite: 60, ms: HORA }
const DA_LOJA = { limite: 300, ms: HORA }
const limite = criarLimite()

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const auth = req.scope.resolve(Modules.AUTH)
  const trava = req.scope.resolve(Modules.LOCKING)

  const novo = normalizarEmail((req.body as { email?: unknown } | undefined)?.email)
  if (!novo) {
    res.status(400).json({ message: "email_invalido" })
    return
  }

  const conta = await contaDoToken(auth, req.auth_context.auth_identity_id)
  if (novo === conta.email) {
    res.status(400).json({ message: "mesmo_email" })
    return
  }

  const quem = quemPede(req)
  const porIp = quem.assinado ? POR_IP_ASSINADO : POR_IP_SEM_ASSINATURA
  if (!limite.cabe(quem.chave, porIp) || !limite.cabe("loja", DA_LOJA)) {
    logger.warn(
      `[conta] limite de códigos de troca atingido (${quem.assinado ? "IP" : "sem assinatura"} ou loja)`
    )
    res.status(429).json({ message: "limite" })
    return
  }

  /*
    A MESMA TRAVA DO CÓDIGO DE ENTRAR (`conta:codigo:<e-mail>`): as duas
    rotas escrevem no mesmo `provider_metadata`, e sem a trava uma
    escreveria por cima da outra — um código de entrar pedido no mesmo
    instante apagaria a troca pendente, ou o contrário.
  */
  const resultado = await trava.execute(
    `conta:codigo:${conta.email}`,
    async () => {
      const [atual] = await auth.listProviderIdentities({
        provider: "codigo",
        entity_id: conta.email,
      })
      if (atual?.id !== conta.provedorId) return { ok: false as const, motivo: "mudou" as const }
      const meta = (atual.provider_metadata ?? {}) as MetadadosDoCodigo

      const pode = podeEnviarTroca(meta, novo)
      if (!pode.ok) return pode

      const agora = Date.now()
      const codigo = gerarCodigo()
      const metadados: MetadadosDoCodigo = {
        ...meta,
        troca: {
          email: novo,
          codigo: novoPendente(novo, codigo, agora, contextoDaTroca(conta.identidadeId)),
        },
        envios_troca: registrarEnvio(meta.envios_troca, agora),
      }
      await guardarCodigoWorkflow(req.scope).run({ input: { email: conta.email, metadados } })
      return { ok: true as const, codigo }
    },
    { timeout: 5 }
  )

  if (!resultado.ok) {
    if (resultado.motivo === "mudou") res.status(409).json({ message: "mudou" })
    else if (resultado.motivo === "espera")
      res.status(429).json({ message: "espera", segundos: resultado.segundos })
    else res.status(429).json({ message: "limite" })
    return
  }

  limite.contar(quem.chave, porIp)
  limite.contar("loja", DA_LOJA)

  const enviado = await enviarEmail(
    emailDaTroca({ para: novo, codigo: resultado.codigo, minutos: MINUTOS_DE_VALIDADE }),
    logger
  )
  if (!enviado.ok) {
    // Como no código de entrar: a troca ficou gravada e o envio contou, pra
    // cada "tentar de novo" com o Resend fora do ar não furar o limite.
    logger.warn(`[conta] código de troca pra ${emailNoLog(novo)} não saiu: ${enviado.motivo}`)
    res.status(503).json({ message: "sem_email" })
    return
  }

  res.json({ enviado: true, reenviar_em: SEGUNDOS_ENTRE_ENVIOS, minutos: MINUTOS_DE_VALIDADE })
}
