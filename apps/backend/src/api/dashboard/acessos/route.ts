import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  exigirArea,
  matrizAtual,
  TRAVA_DA_EQUIPE,
  type PedidoDaEquipe,
} from "../../../lib/equipe/acesso"
import { ajustesDa, lerAcessos, mudancasEntre, podeAbrir } from "../../../lib/equipe/regras"
import { EQUIPE } from "../../../modules/equipe"
import type EquipeService from "../../../modules/equipe/service"
import { mudarAcessosWorkflow } from "../../../workflows/equipe/acessos"

/**
 * POST /dashboard/acessos — o dono salva a tabela "O que cada papel abre",
 * da tela Equipe e acessos: `{ acesso: { operacao: Area[], marketing: Area[] } }`,
 * a coluna inteira de cada papel. Só quem abre a `equipe` (o dono).
 *
 * O dono abre tudo e não tem coluna; o Início e a Equipe não mudam; o que
 * mora dentro de uma área (o estorno no pedido, editar nos produtos, a
 * newsletter nos clientes, a meta no Marketing) só abre com ela —
 * `lerAcessos`, em `lib/equipe/regras.ts`. Vale no próximo clique de cada
 * pessoa: toda rota relê a tabela (`membroAtivo`).
 *
 * Na trava da equipe, como convidar e trocar papel: duas abas salvando ao
 * mesmo tempo não se misturam — vale a última, inteira.
 *
 * RESPOSTAS: 200 `{ acesso, mudou }` (a matriz de agora e o que mudou nela,
 * vazio quando a tabela já era essa — e aí nem o registro ganha linha); 400
 * `acessos_invalidos`, `linha_fixa` ou `sem_a_area_de_fora`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "equipe")) return

  const leitura = lerAcessos(req.body)
  if (!leitura.ok) {
    res.status(400).json({ message: leitura.motivo })
    return
  }
  const depois = leitura.matriz
  const equipe = req.scope.resolve<EquipeService>(EQUIPE)
  const trava = req.scope.resolve(Modules.LOCKING)

  const feito = await trava.execute(
    TRAVA_DA_EQUIPE,
    async () => {
      // Quem pede é relido aqui dentro: pode ter perdido o papel na fila.
      const [quem] = await equipe.listMembros({ id: pedido.membro.id })
      if (quem?.situacao !== "ativo")
        return { ok: false as const, status: 401, motivo: "fora_da_equipe" }
      const antes = await matrizAtual(req.scope)
      if (!podeAbrir(antes, quem.papel, "equipe"))
        return { ok: false as const, status: 403, motivo: "sem_acesso" }

      const mudou = mudancasEntre(antes, depois)
      if (mudou.length)
        await mudarAcessosWorkflow(req.scope).run({
          input: { quemId: quem.id, ajustes: ajustesDa(depois), mudou },
        })
      return { ok: true as const, mudou }
    },
    { timeout: 5 }
  )

  if (!feito.ok) {
    res.status(feito.status).json({ message: feito.motivo })
    return
  }
  res.json({ acesso: depois, mudou: feito.mudou })
}
