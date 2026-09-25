import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { areasDo, membroPublico, podeAbrir } from "../../../lib/equipe/regras"
import { gravesAbertos } from "../../../lib/observabilidade/tela"
import { tocarAcessoWorkflow } from "../../../workflows/equipe/tocar-acesso"

const HORA = 60 * 60 * 1000

/**
 * GET /dashboard/eu — quem está usando o painel e o que o papel abre.
 *
 * O painel pergunta isto em toda página, e monta o menu com `areas`. O
 * menu é só conforto: quem barra é cada rota (`exigirArea`). Aproveita a
 * visita pra anotar a hora do último acesso, no máximo uma vez por hora.
 *
 * O membro já vem lido do banco pelo `membroAtivo` — removido não chega aqui.
 *
 * `avisos`: o número vermelho de uma área no menu — por enquanto, os
 * problemas graves abertos da Observabilidade, pra quem abre ela.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { membro } = req as PedidoDaEquipe

  const ultimo = membro.ultimo_acesso ? new Date(membro.ultimo_acesso).getTime() : 0
  if (Date.now() - ultimo > HORA) {
    await tocarAcessoWorkflow(req.scope).run({ input: { id: membro.id } })
    membro.ultimo_acesso = new Date()
  }

  const avisos = podeAbrir(membro.papel, "observabilidade")
    ? { observabilidade: await gravesAbertos(req.scope, membro.papel).catch(() => 0) }
    : {}
  res.json({ membro: membroPublico(membro), areas: areasDo(membro.papel), avisos })
}
