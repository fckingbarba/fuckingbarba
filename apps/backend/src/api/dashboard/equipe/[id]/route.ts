import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { emailNoLog, enviarEmail } from "../../../../lib/email"
import { emailDoConvite } from "../../../../lib/emails/convite"
import { exigirArea, TRAVA_DA_EQUIPE, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { lerMudanca, membroPublico, podeMudar } from "../../../../lib/equipe/regras"
import { EQUIPE } from "../../../../modules/equipe"
import type EquipeService from "../../../../modules/equipe/service"
import { mudarMembroWorkflow } from "../../../../workflows/equipe/mudar"

/**
 * POST /dashboard/equipe/:id — muda alguém da equipe. Só o dono.
 *
 *   `{ papel: "operacao" }`   troca o papel (vale no próximo clique da pessoa);
 *   `{ acao: "remover" }`     tira da equipe (o acesso cai no próximo clique);
 *   `{ acao: "reenviar" }`    manda o convite de novo, com mais 7 dias.
 *
 * O que não pode — mexer em si mesmo, deixar a loja sem dono — está em
 * `podeMudar` (`lib/equipe/regras.ts`), conferido DENTRO da trava da equipe:
 * dois donos se removendo ao mesmo tempo não passam os dois.
 *
 * RESPOSTAS: 200 `{ membro, email_enviado? }`; 400 `mudanca_invalida`;
 * 404 `nao_encontrado`; 409 com o motivo de `podeMudar`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "equipe")) return

  const mudanca = lerMudanca(req.body)
  if (!mudanca) {
    res.status(400).json({ message: "mudanca_invalida" })
    return
  }

  const equipe = req.scope.resolve<EquipeService>(EQUIPE)
  const trava = req.scope.resolve(Modules.LOCKING)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const id = req.params.id

  const feito = await trava.execute(
    TRAVA_DA_EQUIPE,
    async () => {
      const [alvo] = await equipe.listMembros({ id })
      if (!alvo) return { ok: false as const, status: 404, motivo: "nao_encontrado" }

      // Quem pede é relido aqui dentro: pode ter perdido o papel na fila.
      const [quem] = await equipe.listMembros({ id: pedido.membro.id })
      if (quem?.situacao !== "ativo")
        return { ok: false as const, status: 401, motivo: "fora_da_equipe" }
      const donosAtivos = await equipe.listMembros({ papel: "dono", situacao: "ativo" })
      const pode = podeMudar({
        quem,
        alvo,
        mudanca,
        donosAtivos: donosAtivos.length,
      })
      if (!pode.ok) return { ok: false as const, status: 409, motivo: pode.motivo }

      // Trocar pro papel que já tem não muda nada — nem ganha linha no registro.
      if (mudanca.tipo === "papel" && alvo.papel === mudanca.papel)
        return { ok: true as const, membro: alvo }

      const { result } = await mudarMembroWorkflow(req.scope).run({
        input: { quemId: pedido.membro.id, id, mudanca },
      })
      return { ok: true as const, membro: result }
    },
    { timeout: 5 }
  )

  if (!feito.ok) {
    res.status(feito.status).json({ message: feito.motivo })
    return
  }

  if (mudanca.tipo !== "reenviar") {
    res.json({ membro: membroPublico(feito.membro) })
    return
  }

  const { membro } = feito
  const enviado = await enviarEmail(
    emailDoConvite({
      para: membro.email,
      nome: membro.nome,
      papel: membro.papel,
      quem: pedido.membro.nome,
    }),
    logger
  )
  if (!enviado.ok)
    logger.warn(`[painel] convite de ${emailNoLog(membro.email)} não saiu: ${enviado.motivo}`)
  res.json({ membro: membroPublico(membro), email_enviado: enviado.ok })
}
