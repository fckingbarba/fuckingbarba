import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  exigirArea,
  matrizAtual,
  papeisCriados,
  TRAVA_DA_EQUIPE,
  type MembroDaEquipe,
  type PedidoDaEquipe,
} from "../../../lib/equipe/acesso"
import { ajustesDa, lerAcessos, mudancasEntre, podeAbrir } from "../../../lib/equipe/regras"
import { EQUIPE } from "../../../modules/equipe"
import type EquipeService from "../../../modules/equipe/service"
import { mudarAcessosWorkflow } from "../../../workflows/equipe/acessos"

/**
 * POST /dashboard/acessos — o dono salva a tabela "O que cada papel abre",
 * da tela Equipe e acessos: `{ acesso: { operacao: Area[], marketing: Area[],
 * papel_…: Area[] } }`, a coluna inteira de cada papel — com uma pra cada
 * papel que o dono criou, nem mais nem menos. Só quem abre a `equipe` (o
 * dono).
 *
 * O dono abre tudo e não tem coluna; o Início e a Equipe não mudam; os
 * contatos dos clientes, na operação e no marketing, seguem o papel (no
 * papel criado, são caixinha); o que mora dentro de uma área (o estorno no
 * pedido, editar nos produtos, a newsletter nos clientes, a meta no
 * Marketing) só abre com ela — `lerAcessos`, em `lib/equipe/regras.ts`.
 * Vale no próximo clique de cada pessoa: toda rota relê a tabela
 * (`membroAtivo`).
 *
 * Na trava da equipe, como convidar e trocar papel: duas abas salvando ao
 * mesmo tempo não se misturam — vale a última, inteira. A tabela é lida lá
 * dentro, com os papéis criados de agora: um papel apagado no meio do
 * caminho não ganha linha, e um criado não fica sem coluna.
 *
 * RESPOSTAS: 200 `{ acesso, mudou }` (a matriz de agora e o que mudou nela,
 * vazio quando a tabela já era essa — e aí nem o registro ganha linha); 400
 * `acessos_invalidos`, `linha_fixa` ou `sem_a_area_de_fora`; 409
 * `papeis_mudaram` (um papel foi criado ou apagado depois que a tela abriu).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "equipe")) return

  const equipe = req.scope.resolve<EquipeService>(EQUIPE)
  const trava = req.scope.resolve(Modules.LOCKING)

  const feito = await trava.execute(
    TRAVA_DA_EQUIPE,
    async () => {
      // Quem pede é relido aqui dentro: pode ter perdido o papel na fila.
      const [quem] = (await equipe.listMembros({ id: pedido.membro.id })) as MembroDaEquipe[]
      if (quem?.situacao !== "ativo")
        return { ok: false as const, status: 401, motivo: "fora_da_equipe" }
      const papeis = await papeisCriados(req.scope)
      const antes = await matrizAtual(req.scope, papeis)
      if (!podeAbrir(antes, quem.papel, "equipe"))
        return { ok: false as const, status: 403, motivo: "sem_acesso" }

      const criados = papeis.map((p) => p.id)
      const leitura = lerAcessos(req.body, criados)
      if (!leitura.ok)
        return {
          ok: false as const,
          status: leitura.motivo === "papeis_mudaram" ? 409 : 400,
          motivo: leitura.motivo,
        }
      const depois = leitura.matriz
      const mudou = mudancasEntre(antes, depois, criados)
      if (mudou.length)
        await mudarAcessosWorkflow(req.scope).run({
          input: { quemId: quem.id, ajustes: ajustesDa(depois, criados), mudou },
        })
      return { ok: true as const, mudou, depois }
    },
    { timeout: 5 }
  )

  if (!feito.ok) {
    res.status(feito.status).json({ message: feito.motivo })
    return
  }
  res.json({ acesso: feito.depois, mudou: feito.mudou })
}
