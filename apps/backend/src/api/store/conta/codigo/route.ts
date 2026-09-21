import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { enviarEmail, emailNoLog } from "../../../../lib/email"
import { emailDoCodigo } from "../../../../lib/emails/codigo"
import { criarLimite } from "../../../../lib/limite"
import { quemPede } from "../../../../lib/quem-pede"
import { guardarCodigoWorkflow } from "../../../../workflows/conta/guardar-codigo"
import {
  gerarCodigo,
  MINUTOS_DE_VALIDADE,
  normalizarEmail,
  novoPendente,
  podeEnviar,
  registrarEnvio,
  SEGUNDOS_ENTRE_ENVIOS,
  type MetadadosDoCodigo,
} from "../../../../modules/codigo/regras"

/**
 * POST /store/conta/codigo — manda um código de acesso pro e-mail.
 *
 * É a primeira metade do "entrar sem senha"; a segunda é o provedor `codigo`
 * (`modules/codigo/service.ts`), na rota `POST /auth/customer/codigo`.
 *
 * ┌─ A RESPOSTA É A MESMA PRA QUALQUER E-MAIL ─────────────────────────────┐
 * │ Com conta ou sem, comprou ou nunca viu a loja: "mandei". O primeiro    │
 * │ código confirmado CRIA a conta, então não existe "e-mail não           │
 * │ cadastrado" pra dizer — e se existisse, esta rota viraria um jeito de  │
 * │ descobrir quem é cliente da loja.                                      │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * OS LIMITES, do mais estreito pro mais largo:
 *   - por e-mail (no banco, junto do código): 30 s entre um e outro, 5 por
 *     hora, 10 por dia — `regras.ts`;
 *   - por quem pede (IP, na memória): 10 códigos por hora, pra e-mails
 *     quaisquer — é o que impede alguém de mandar código pra mil caixas.
 *     O IP vem da loja, assinado (`lib/quem-pede.ts`). Pedido SEM a
 *     assinatura conta pelo IP da conexão, com folga maior (60): se a
 *     assinatura faltar por configuração errada, todo mundo cai no mesmo IP
 *     da Vercel, e 10 por hora pra loja inteira seria a loja fechada — com
 *     60 ela segue de pé enquanto o aviso no log aponta o erro;
 *   - da loja toda (memória): 300 por hora. É o teto do estrago se tudo o
 *     mais falhar, e fica bem acima de qualquer dia bom de venda.
 *
 * RESPOSTAS: 200 `{ enviado, reenviar_em, minutos }`; 400 `email_invalido`;
 * 429 `espera` (com `segundos`) ou `limite`; 503 `sem_email`. Sempre em
 * `message`, que é onde o Medusa põe o motivo de todo erro dele.
 */

const HORA = 60 * 60 * 1000
const POR_IP_ASSINADO = { limite: 10, ms: HORA }
const POR_IP_SEM_ASSINATURA = { limite: 60, ms: HORA }
const DA_LOJA = { limite: 300, ms: HORA }
const limite = criarLimite()

/** Um aviso por hora, no máximo: o log não pode virar só isto. */
let ultimoAvisoSemAssinatura = 0

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const auth = req.scope.resolve(Modules.AUTH)
  const trava = req.scope.resolve(Modules.LOCKING)

  const email = normalizarEmail((req.body as { email?: unknown } | undefined)?.email)
  if (!email) {
    res.status(400).json({ message: "email_invalido" })
    return
  }

  const quem = quemPede(req)
  const porIp = quem.assinado ? POR_IP_ASSINADO : POR_IP_SEM_ASSINATURA
  if (!quem.assinado && Date.now() - ultimoAvisoSemAssinatura > HORA) {
    ultimoAvisoSemAssinatura = Date.now()
    logger.warn(
      "[conta] pedido de código sem a assinatura da loja (x-loja-segredo). Se vier da loja, o REVALIDAR_SEGREDO não bate entre Railway e Vercel."
    )
  }
  if (!limite.cabe(quem.chave, porIp) || !limite.cabe("loja", DA_LOJA)) {
    logger.warn(
      `[conta] limite de códigos atingido (${quem.assinado ? "IP" : "sem assinatura"} ou loja)`
    )
    res.status(429).json({ message: "limite" })
    return
  }

  /*
    UM PEDIDO POR VEZ PRO MESMO E-MAIL. Sem a trava, dois cliques rápidos
    passariam os dois pela conferência dos 30 segundos antes de qualquer um
    gravar, e sairiam dois e-mails com dois códigos — e o primeiro a chegar
    seria justamente o que o segundo já tinha matado.
  */
  const resultado = await trava.execute(
    `conta:codigo:${email}`,
    async () => {
      const [existente] = await auth.listProviderIdentities({
        provider: "codigo",
        entity_id: email,
      })
      const meta = (existente?.provider_metadata ?? {}) as MetadadosDoCodigo

      const pode = podeEnviar(meta)
      if (!pode.ok) return pode

      const agora = Date.now()
      const codigo = gerarCodigo()
      const novo: MetadadosDoCodigo = {
        ...meta,
        codigo: novoPendente(email, codigo, agora),
        envios: registrarEnvio(meta.envios, agora),
      }

      /*
        Na primeira vez a identidade nasce aqui, antes de o e-mail ser
        confirmado — é nela que o código fica guardado. Ela não é conta: não
        tem cliente ligado até o código voltar certo (`/store/conta/vincular`),
        e sem isso não abre nada. Os limites acima são o que impede de encher
        o banco.
      */
      await guardarCodigoWorkflow(req.scope).run({ input: { email, metadados: novo } })

      return { ok: true as const, codigo }
    },
    { timeout: 5 }
  )

  if (!resultado.ok) {
    res
      .status(429)
      .json(
        resultado.motivo === "espera"
          ? { message: "espera", segundos: resultado.segundos }
          : { message: "limite" }
      )
    return
  }

  limite.contar(quem.chave, porIp)
  limite.contar("loja", DA_LOJA)

  const enviado = await enviarEmail(
    emailDoCodigo({ para: email, codigo: resultado.codigo, minutos: MINUTOS_DE_VALIDADE }),
    logger
  )
  if (!enviado.ok) {
    // O código ficou gravado e o envio contou — de propósito: senão, com o
    // Resend fora do ar, cada clique em "tentar de novo" furaria o limite.
    logger.warn(`[conta] código de ${emailNoLog(email)} não saiu: ${enviado.motivo}`)
    res.status(503).json({ message: "sem_email" })
    return
  }

  res.json({ enviado: true, reenviar_em: SEGUNDOS_ENTRE_ENVIOS, minutos: MINUTOS_DE_VALIDADE })
}
