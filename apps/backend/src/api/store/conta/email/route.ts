import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { whatsappDaLoja } from "../../../../lib/atendimento"
import { contaDoToken } from "../../../../lib/conta-do-token"
import { emailNoLog, enviarEmail } from "../../../../lib/email"
import { emailDeEmailTrocado } from "../../../../lib/emails/troca-de-email"
import {
  conferir,
  contextoDaTroca,
  TENTATIVAS,
  type MetadadosDoCodigo,
} from "../../../../modules/codigo/regras"
import { guardarCodigoWorkflow } from "../../../../workflows/conta/guardar-codigo"
import { trocarEmailWorkflow } from "../../../../workflows/conta/trocar-email"

/**
 * POST /store/conta/email — `{ codigo }`: confirma a troca de e-mail pedida
 * em `POST /store/conta/email/codigo` e troca.
 *
 * O e-mail novo NÃO vem no pedido: é o que ficou guardado com o código, na
 * identidade da conta. O código só vale pra ele e só pra esta conta (o hash
 * leva os dois — `contextoDaTroca`, em `regras.ts`).
 *
 * CÓDIGO CERTO, E-MAIL OCUPADO: se o endereço novo já é de outra conta — um
 * cliente com conta, ou uma identidade `codigo` ligada a um cliente —, a
 * troca não acontece e a resposta diz (`email_em_uso`). Só aqui, depois do
 * código: quem lê é o dono do endereço. A troca pendente morre do mesmo
 * jeito, o código já foi usado.
 *
 * Deu certo: o e-mail muda na identidade e no cliente (`trocarEmailWorkflow`,
 * com o porquê dos dois) e, depois da resposta, o endereço ANTIGO recebe o
 * aviso (`emailDeEmailTrocado`) — é o que faz o dono saber, se não foi ele.
 * A sessão continua valendo: o token é da identidade e do cliente, que são
 * os mesmos, e não leva o e-mail dentro.
 *
 * RESPOSTAS: 200 `{ email }`; 400 `codigo_errado`, `codigo_vencido`,
 * `codigo_esgotado` ou `sem_troca` (nada esperando código); 409
 * `email_em_uso`. Sem token de cliente, 401 (o `middlewares.ts`).
 */

type Resultado =
  | { ok: true }
  | {
      ok: false
      motivo: "codigo_errado" | "codigo_vencido" | "codigo_esgotado" | "sem_troca" | "email_em_uso"
    }

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const auth = req.scope.resolve(Modules.AUTH)
  const clientes = req.scope.resolve(Modules.CUSTOMER)
  const trava = req.scope.resolve(Modules.LOCKING)

  const bruto = (req.body as { codigo?: unknown } | undefined)?.codigo
  const codigo = typeof bruto === "string" ? bruto.replace(/\D+/g, "") : ""
  if (codigo.length !== 6) {
    res.status(400).json({ message: "codigo_errado" })
    return
  }

  const conta = await contaDoToken(auth, req.auth_context.auth_identity_id)
  const clienteId = req.auth_context.actor_id
  const novo = conta.meta.troca?.email
  if (!novo) {
    res.status(400).json({ message: "sem_troca" })
    return
  }

  /*
    AS DUAS TRAVAS, a do e-mail de agora e a do novo: nada escreve no
    `provider_metadata` da conta enquanto isto roda, e ninguém cria a
    identidade do e-mail novo (pedindo código de entrar com ele) entre a
    conferência de que ele está livre e a troca.
  */
  const resultado = await trava.execute<Resultado>(
    [`conta:codigo:${conta.email}`, `conta:codigo:${novo}`],
    async () => {
      // De novo, dentro da trava: um código de troca pedido no meio do
      // caminho pode ter mudado o que está esperando.
      const [atual] = await auth.listProviderIdentities({
        provider: "codigo",
        entity_id: conta.email,
      })
      const meta = (atual?.provider_metadata ?? {}) as MetadadosDoCodigo
      const troca = meta.troca
      if (atual?.id !== conta.provedorId || troca?.email !== novo) {
        return { ok: false, motivo: "sem_troca" }
      }
      const guardar = (metadados: MetadadosDoCodigo) =>
        guardarCodigoWorkflow(req.scope).run({ input: { email: conta.email, metadados } })

      const veredito = conferir(
        troca.codigo,
        novo,
        codigo,
        Date.now(),
        contextoDaTroca(conta.identidadeId)
      )
      if (veredito === "errado") {
        const tentativas = (troca.codigo.tentativas ?? 0) + 1
        await guardar({ ...meta, troca: { ...troca, codigo: { ...troca.codigo, tentativas } } })
        // Na quinta errada, "esgotado" de uma vez — como no código de entrar.
        return { ok: false, motivo: tentativas >= TENTATIVAS ? "codigo_esgotado" : "codigo_errado" }
      }
      if (veredito === "sem_codigo") return { ok: false, motivo: "sem_troca" }
      if (veredito !== "certo") return { ok: false, motivo: `codigo_${veredito}` }

      /* O código conferiu: o endereço é de quem pediu. Falta estar livre. */
      const semTroca: MetadadosDoCodigo = { ...meta, troca: null }

      const [comConta] = await clientes.listCustomers(
        { email: novo, has_account: true },
        { select: ["id"] }
      )
      let orfa: string | null = null
      let ocupado = Boolean(comConta && comConta.id !== clienteId)
      if (!ocupado) {
        const [outra] = await auth.listProviderIdentities({ provider: "codigo", entity_id: novo })
        if (outra?.auth_identity_id && outra.auth_identity_id !== conta.identidadeId) {
          const dona = await auth.retrieveAuthIdentity(outra.auth_identity_id)
          if (dona.app_metadata?.customer_id) ocupado = true
          else orfa = dona.id
        }
      }
      if (ocupado) {
        await guardar(semTroca)
        return { ok: false, motivo: "email_em_uso" }
      }

      await trocarEmailWorkflow(req.scope).run({
        input: { provedorId: conta.provedorId, clienteId, novo, metadados: semTroca, orfa },
      })
      return { ok: true }
    },
    { timeout: 5 }
  )

  if (!resultado.ok) {
    res.status(resultado.motivo === "email_em_uso" ? 409 : 400).json({ message: resultado.motivo })
    return
  }

  logger.info(`[conta] e-mail trocado: ${emailNoLog(conta.email)} → ${emailNoLog(novo)}`)
  res.json({ email: novo })

  // Depois da resposta: a troca já aconteceu, e um aviso que não saiu não a desfaz.
  const aviso = await enviarEmail(
    emailDeEmailTrocado({ para: conta.email, novo, whatsapp: await whatsappDaLoja(req.scope) }),
    logger
  )
  if (!aviso.ok) {
    logger.warn(`[conta] aviso de troca pra ${emailNoLog(conta.email)} não saiu: ${aviso.motivo}`)
  }
}
