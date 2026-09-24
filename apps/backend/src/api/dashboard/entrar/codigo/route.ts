import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { emailNoLog, enviarEmail } from "../../../../lib/email"
import { emailDoCodigo } from "../../../../lib/emails/codigo"
import { TRAVA_DA_EQUIPE } from "../../../../lib/equipe/acesso"
import { donoDoRailway, nomeDoEmail, podeEntrar } from "../../../../lib/equipe/regras"
import { criarLimite } from "../../../../lib/limite"
import { quemPede } from "../../../../lib/quem-pede"
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
import { EQUIPE } from "../../../../modules/equipe"
import type EquipeService from "../../../../modules/equipe/service"
import { guardarCodigoWorkflow } from "../../../../workflows/conta/guardar-codigo"
import { garantirDonoWorkflow } from "../../../../workflows/equipe/garantir-dono"

/**
 * POST /dashboard/entrar/codigo — manda o código de entrar no painel.
 *
 * A mesma coisa que `POST /store/conta/codigo` faz pro cliente, com duas
 * diferenças: o código vai pra identidade `codigo-equipe` (outra, separada
 * da conta de cliente do mesmo e-mail), e SÓ QUEM É DA EQUIPE recebe — o
 * ativo, e o convidado dentro do prazo (`podeEntrar`). Quem confere é o
 * `POST /auth/equipe/codigo-equipe`, do próprio Medusa.
 *
 * ┌─ QUEM NÃO É DA EQUIPE OUVE A MESMA COISA ──────────────────────────────┐
 * │ "Mandei", o mesmo "espera" e o mesmo "limite" — sem e-mail nenhum. Os  │
 * │ limites de quem é da equipe moram no banco, junto do código; os de     │
 * │ quem não é, na memória (`fantasmas`), com as mesmas regras             │
 * │ (`podeEnviar`). Senão, pedir duas vezes seguidas diria quem é da       │
 * │ equipe: o da equipe ouviria "espera", o de fora, "mandei" de novo.     │
 * │ O painel diz "se esse e-mail for da equipe, o código chega".           │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O PRIMEIRO DONO: enquanto a equipe não tem dono ativo, o e-mail do
 * `DASHBOARD_DONO_EMAIL` (Railway) entra como dono ao pedir o código — ver
 * `workflows/equipe/garantir-dono.ts`.
 *
 * OS LIMITES: por e-mail, os do código da loja (30 s entre um e outro, 5
 * por hora, 10 por dia); por quem pede, 10 por hora; do painel todo, 60
 * códigos de verdade por hora. Só o servidor do painel chama isto
 * (`soDoPainel`, em `api/middlewares.ts`), então o IP é sempre o assinado.
 *
 * RESPOSTAS: 200 `{ enviado, reenviar_em, minutos }`; 400 `email_invalido`;
 * 429 `espera` (com `segundos`) ou `limite`; 503 `sem_email`.
 */

const HORA = 60 * 60 * 1000
const POR_IP = { limite: 10, ms: HORA }
const DO_PAINEL = { limite: 60, ms: HORA }
const limite = criarLimite()

/** Os e-mails de fora da equipe que pediram código — ver a caixa lá em cima. */
const MAX_FANTASMAS = 5_000
const fantasmas = new Map<string, MetadadosDoCodigo>()

let ultimoAvisoSemDono = 0

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const auth = req.scope.resolve(Modules.AUTH)
  const trava = req.scope.resolve(Modules.LOCKING)
  const equipe = req.scope.resolve<EquipeService>(EQUIPE)

  const email = normalizarEmail((req.body as { email?: unknown } | undefined)?.email)
  if (!email) {
    res.status(400).json({ message: "email_invalido" })
    return
  }

  const quem = quemPede(req)
  if (!limite.cabe(quem.chave, POR_IP)) {
    logger.warn("[painel] limite de códigos por IP atingido")
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(quem.chave, POR_IP)

  const resultado = await trava.execute(
    TRAVA_DA_EQUIPE,
    async () => {
      const agora = Date.now()
      await primeiroDono(req, email)

      const [membro] = await equipe.listMembros({ email })
      if (!podeEntrar(membro, agora)) {
        const meta = fantasmas.get(email) ?? {}
        const pode = podeEnviar(meta, agora)
        if (!pode.ok) return pode
        guardarFantasma(email, {
          codigo: novoPendente(email, gerarCodigo(), agora),
          envios: registrarEnvio(meta.envios, agora),
        })
        return { ok: true as const, codigo: null }
      }

      const [existente] = await auth.listProviderIdentities({
        provider: "codigo-equipe",
        entity_id: email,
      })
      const meta = (existente?.provider_metadata ?? {}) as MetadadosDoCodigo
      const pode = podeEnviar(meta, agora)
      if (!pode.ok) return pode
      if (!limite.cabe("painel", DO_PAINEL)) {
        logger.warn("[painel] limite de códigos do painel todo atingido")
        return { ok: false as const, motivo: "limite" as const }
      }

      const codigo = gerarCodigo()
      await guardarCodigoWorkflow(req.scope).run({
        input: {
          email,
          provedor: "codigo-equipe",
          metadados: {
            ...meta,
            codigo: novoPendente(email, codigo, agora),
            envios: registrarEnvio(meta.envios, agora),
          },
        },
      })
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

  const pronto = { enviado: true, reenviar_em: SEGUNDOS_ENTRE_ENVIOS, minutos: MINUTOS_DE_VALIDADE }

  if (!resultado.codigo) {
    // O de verdade espera o Resend responder; o de fora espera parecido,
    // pra demora da resposta também não contar quem é da equipe.
    await new Promise((pronto) => setTimeout(pronto, 150 + Math.random() * 350))
    res.json(pronto)
    return
  }

  limite.contar("painel", DO_PAINEL)
  const enviado = await enviarEmail(
    emailDoCodigo({
      para: email,
      codigo: resultado.codigo,
      minutos: MINUTOS_DE_VALIDADE,
      onde: "painel",
    }),
    logger
  )
  if (!enviado.ok) {
    logger.warn(`[painel] código de ${emailNoLog(email)} não saiu: ${enviado.motivo}`)
    res.status(503).json({ message: "sem_email" })
    return
  }
  res.json(pronto)
}

/**
 * Sem dono ativo na equipe, o e-mail do Railway vira o dono (convidado, até
 * confirmar o código). Roda dentro da trava da equipe.
 */
async function primeiroDono(req: MedusaRequest, email: string) {
  const equipe = req.scope.resolve<EquipeService>(EQUIPE)
  const dono = donoDoRailway()
  if (!dono) {
    if (Date.now() - ultimoAvisoSemDono > HORA) {
      const [algum] = await equipe.listMembros({ situacao: "ativo" }, { take: 1 })
      if (!algum) {
        ultimoAvisoSemDono = Date.now()
        req.scope
          .resolve(ContainerRegistrationKeys.LOGGER)
          .warn(
            "[painel] ninguém na equipe ainda e o DASHBOARD_DONO_EMAIL está vazio no Railway: ninguém consegue entrar."
          )
      }
    }
    return
  }
  if (email !== dono) return

  const donosAtivos = await equipe.listMembros({ papel: "dono", situacao: "ativo" }, { take: 1 })
  if (donosAtivos.length) return
  const [atual] = await equipe.listMembros({ email })
  if (atual && atual.papel === "dono" && podeEntrar(atual)) return

  await garantirDonoWorkflow(req.scope).run({ input: { email, nome: nomeDoEmail(email) } })
}

function guardarFantasma(email: string, meta: MetadadosDoCodigo) {
  fantasmas.delete(email)
  fantasmas.set(email, meta)
  if (fantasmas.size > MAX_FANTASMAS) {
    const primeiro = fantasmas.keys().next().value
    if (primeiro !== undefined) fantasmas.delete(primeiro)
  }
}
