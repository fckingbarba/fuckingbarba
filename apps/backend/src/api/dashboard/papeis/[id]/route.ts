import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  exigirArea,
  matrizAtual,
  papeisCriados,
  TRAVA_DA_EQUIPE,
  type MembroDaEquipe,
  type PedidoDaEquipe,
} from "../../../../lib/equipe/acesso"
import { lerMudancaDoPapel, nomeRepetido, podeAbrir } from "../../../../lib/equipe/regras"
import { EQUIPE } from "../../../../modules/equipe"
import type EquipeService from "../../../../modules/equipe/service"
import { apagarPapelWorkflow, renomearPapelWorkflow } from "../../../../workflows/equipe/papeis"

/**
 * POST /dashboard/papeis/:id — o dono muda um papel que ele criou. Só quem
 * abre a `equipe` (o dono).
 *
 *   `{ nome: "Atendimento" }`   renomeia (as pessoas seguem no papel, e o
 *                               que ele abre não muda);
 *   `{ acao: "apagar" }`        apaga — só se ninguém estiver nele, nem
 *                               convidado: o dono muda o papel dessas
 *                               pessoas antes. As caixinhas dele saem junto.
 *
 * Os três de sempre (dono, operação, marketing) não passam por aqui: não
 * têm id, não se renomeiam nem se apagam.
 *
 * RESPOSTAS: 200 `{ papel }` (renomeado) ou `{ apagado: true }`; 400
 * `mudanca_invalida`; 404 `nao_encontrado`; 409 `nome_repetido` ou
 * `papel_com_gente`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "equipe")) return

  const mudanca = lerMudancaDoPapel(req.body)
  if (!mudanca) {
    res.status(400).json({ message: "mudanca_invalida" })
    return
  }
  const equipe = req.scope.resolve<EquipeService>(EQUIPE)
  const trava = req.scope.resolve(Modules.LOCKING)
  const id = req.params.id

  const feito = await trava.execute(
    TRAVA_DA_EQUIPE,
    async () => {
      // Quem pede é relido aqui dentro: pode ter perdido o papel na fila.
      const [quem] = (await equipe.listMembros({ id: pedido.membro.id })) as MembroDaEquipe[]
      if (quem?.situacao !== "ativo")
        return { ok: false as const, status: 401, motivo: "fora_da_equipe" }
      const papeis = await papeisCriados(req.scope)
      if (!podeAbrir(await matrizAtual(req.scope, papeis), quem.papel, "equipe"))
        return { ok: false as const, status: 403, motivo: "sem_acesso" }
      const papel = papeis.find((p) => p.id === id)
      if (!papel) return { ok: false as const, status: 404, motivo: "nao_encontrado" }

      if (mudanca.tipo === "renomear") {
        // O mesmo nome não muda nada — nem ganha linha no registro.
        if (mudanca.nome === papel.nome) return { ok: true as const, corpo: { papel } }
        const outros = papeis.filter((p) => p.id !== id).map((p) => p.nome)
        if (nomeRepetido(mudanca.nome, outros))
          return { ok: false as const, status: 409, motivo: "nome_repetido" }
        await renomearPapelWorkflow(req.scope).run({
          input: { quemId: quem.id, id, nome: mudanca.nome },
        })
        return { ok: true as const, corpo: { papel: { id, nome: mudanca.nome } } }
      }

      const nele = await equipe.listMembros(
        { papel: id, situacao: ["ativo", "convidado"] },
        { select: ["id"], take: 1 }
      )
      if (nele.length) return { ok: false as const, status: 409, motivo: "papel_com_gente" }
      await apagarPapelWorkflow(req.scope).run({ input: { quemId: quem.id, id } })
      return { ok: true as const, corpo: { apagado: true } }
    },
    { timeout: 5 }
  )

  if (!feito.ok) {
    res.status(feito.status).json({ message: feito.motivo })
    return
  }
  res.json(feito.corpo)
}
