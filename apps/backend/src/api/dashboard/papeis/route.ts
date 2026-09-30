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
import {
  areasDoPapelNovo,
  lerPapelNovo,
  nomeRepetido,
  PAPEIS_NOVOS_NO_MAXIMO,
  podeAbrir,
} from "../../../lib/equipe/regras"
import { EQUIPE } from "../../../modules/equipe"
import type EquipeService from "../../../modules/equipe/service"
import { criarPapelWorkflow } from "../../../workflows/equipe/papeis"

/**
 * POST /dashboard/papeis — o dono cria um papel: `{ nome, igualA? }`. Só quem
 * abre a `equipe` (o dono).
 *
 * O papel nasce abrindo só o Início — ou, com `igualA` (`operacao` ou
 * `marketing`), o mesmo que esse papel abre agora, pro dono tirar o que não
 * quer. Depois, é uma coluna a mais na tabela "O que cada papel abre", que
 * salva pelo `POST /dashboard/acessos`, e uma opção a mais no convite e no
 * "Mudar" de cada pessoa.
 *
 * Na trava da equipe: dois papéis com o mesmo nome criados juntos não passam
 * os dois, e o 11º não passa.
 *
 * RESPOSTAS: 200 `{ papel: { id, nome, pessoas } }`; 400 `nome_invalido` ou
 * `igual_a_invalido`; 409 `nome_repetido` ou `muitos_papeis`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "equipe")) return

  const leitura = lerPapelNovo(req.body)
  if (!leitura.ok) {
    res.status(400).json({ message: leitura.motivo })
    return
  }
  const { nome, igualA } = leitura.papel
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
      const matriz = await matrizAtual(req.scope, papeis)
      if (!podeAbrir(matriz, quem.papel, "equipe"))
        return { ok: false as const, status: 403, motivo: "sem_acesso" }
      if (papeis.length >= PAPEIS_NOVOS_NO_MAXIMO)
        return { ok: false as const, status: 409, motivo: "muitos_papeis" }
      if (
        nomeRepetido(
          nome,
          papeis.map((p) => p.nome)
        )
      )
        return { ok: false as const, status: 409, motivo: "nome_repetido" }

      const { result } = await criarPapelWorkflow(req.scope).run({
        input: { quemId: quem.id, nome, igualA, areas: areasDoPapelNovo(matriz, igualA) },
      })
      return { ok: true as const, papel: { id: result.id, nome: result.nome, pessoas: 0 } }
    },
    { timeout: 5 }
  )

  if (!feito.ok) {
    res.status(feito.status).json({ message: feito.motivo })
    return
  }
  res.json({ papel: feito.papel })
}
