import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { emailNoLog, enviarEmail } from "../../../lib/email"
import { emailDoConvite } from "../../../lib/emails/convite"
import {
  exigirArea,
  matrizAtual,
  nomesDos,
  papeisCriados,
  TRAVA_DA_EQUIPE,
  type MembroDaEquipe,
  type PedidoDaEquipe,
} from "../../../lib/equipe/acesso"
import {
  AREAS_DO_PAPEL,
  AREAS_FIXAS,
  areasDo,
  DENTRO_DE,
  ehPersonalizado,
  emOrdem,
  lerConvite,
  matrizCom,
  membroPublico,
  nomeDoPapel,
  PAPEIS_NOVOS_NO_MAXIMO,
} from "../../../lib/equipe/regras"
import { EQUIPE } from "../../../modules/equipe"
import type EquipeService from "../../../modules/equipe/service"
import { convidarMembroWorkflow } from "../../../workflows/equipe/convidar"

/**
 * GET /dashboard/equipe — a equipe do painel, pra tela "Equipe e acessos".
 * Só o dono. Quem foi removido não aparece: pra voltar, é convidar de novo.
 *
 * Vai junto a tabela de quem abre o quê: a de agora (`acesso`, com o que o
 * dono mudou), a de quando a loja nasceu (`padrao`, pro "Voltar ao
 * padrão"), as linhas que não mudam (`fixas`), as que seguem o papel nos
 * três de sempre e são caixinha só nos papéis criados (`doPapel`) e o que
 * mora dentro de outra área (`dentroDe`). E os papéis que o dono criou
 * (`papeis`: id, nome e quantas pessoas estão nele), cada um uma coluna. A
 * tela desenha e liga as caixinhas com elas, e não com uma cópia que um dia
 * discordaria. Quem salva é o `POST /dashboard/acessos`; criar, renomear e
 * apagar papel, o `POST /dashboard/papeis`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "equipe")) return

  const equipe = req.scope.resolve<EquipeService>(EQUIPE)
  const [lidos, papeis] = await Promise.all([
    equipe.listMembros({ situacao: ["ativo", "convidado"] }),
    papeisCriados(req.scope),
  ])
  const membros = lidos as MembroDaEquipe[]
  const acesso = await matrizAtual(req.scope, papeis)
  const nomes = nomesDos(papeis)
  res.json({
    membros: emOrdem(membros).map((m) => membroPublico(m, nomes)),
    eu: pedido.membro.id,
    acesso,
    padrao: matrizCom(
      [],
      papeis.map((p) => p.id)
    ),
    fixas: AREAS_FIXAS,
    doPapel: AREAS_DO_PAPEL,
    dentroDe: DENTRO_DE,
    papeis: papeis.map((p) => ({
      ...p,
      pessoas: membros.filter((m) => m.papel === p.id).length,
    })),
    papeisNoMaximo: PAPEIS_NOVOS_NO_MAXIMO,
  })
}

/**
 * POST /dashboard/equipe — convida alguém: `{ nome, email, papel }`. Só o dono.
 *
 * O convite fica gravado mesmo se o e-mail não sair (`email_enviado: false`):
 * a tela avisa, e o "reenviar" da pessoa manda de novo.
 *
 * O papel pode ser um dos criados pelo dono (`papel_…`): conferido no banco
 * dentro da trava, que um papel apagado agora mesmo não recebe ninguém.
 *
 * RESPOSTAS: 200 `{ membro, email_enviado }`; 400 `nome_invalido`,
 * `email_invalido` ou `papel_invalido`; 409 `ja_na_equipe`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "equipe")) return

  const leitura = lerConvite(req.body)
  if (!leitura.ok) {
    res.status(400).json({ message: leitura.motivo })
    return
  }
  const { nome, email, papel } = leitura.convite
  const trava = req.scope.resolve(Modules.LOCKING)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  let feito
  try {
    feito = await trava.execute(
      TRAVA_DA_EQUIPE,
      async () => {
        const papeis = await papeisCriados(req.scope)
        if (ehPersonalizado(papel) && !papeis.some((p) => p.id === papel)) return null
        const { result } = await convidarMembroWorkflow(req.scope).run({
          input: { quemId: pedido.membro.id, nome, email, papel },
        })
        return { membro: result as MembroDaEquipe, papeis }
      },
      { timeout: 5 }
    )
  } catch (e) {
    if ((e as { type?: string })?.type === MedusaError.Types.DUPLICATE_ERROR) {
      res.status(409).json({ message: "ja_na_equipe" })
      return
    }
    throw e
  }
  if (!feito) {
    res.status(400).json({ message: "papel_invalido" })
    return
  }

  const { membro, papeis } = feito
  const nomes = nomesDos(papeis)
  const areas = areasDo(await matrizAtual(req.scope, papeis), papel)
  const enviado = await enviarEmail(
    emailDoConvite({
      para: email,
      nome,
      papelNome: nomeDoPapel(papel, nomes),
      areas,
      quem: pedido.membro.nome,
    }),
    logger
  )
  if (!enviado.ok)
    logger.warn(`[painel] convite de ${emailNoLog(email)} não saiu: ${enviado.motivo}`)

  res.json({ membro: membroPublico(membro, nomes), email_enviado: enviado.ok })
}
