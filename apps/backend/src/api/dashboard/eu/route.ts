import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { abre, nomesDos, papeisCriados, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { ehPersonalizado, membroPublico } from "../../../lib/equipe/regras"
import { gravesAbertos } from "../../../lib/observabilidade/tela"
import { WHATSAPP } from "../../../modules/whatsapp"
import type WhatsappService from "../../../modules/whatsapp/service"
import { tocarAcessoWorkflow } from "../../../workflows/equipe/tocar-acesso"

const HORA = 60 * 60 * 1000

/**
 * GET /dashboard/eu — quem está usando o painel e o que o papel abre agora
 * (o padrão com o que o dono mudou na tela da equipe, lido pelo
 * `membroAtivo`).
 *
 * O painel pergunta isto em toda página, e monta o menu com `areas`. O
 * menu é só conforto: quem barra é cada rota (`exigirArea`). Aproveita a
 * visita pra anotar a hora do último acesso, no máximo uma vez por hora.
 *
 * O membro já vem lido do banco pelo `membroAtivo` — removido não chega aqui.
 * No papel criado pelo dono, o nome dele (`papel_nome`) sai de `equipe_papel`.
 *
 * `avisos`: o número de uma área no menu — os problemas graves abertos da
 * Observabilidade (vermelho), e as conversas do WhatsApp esperando a equipe
 * (amarelo), pra quem abre cada uma.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  const { membro } = pedido

  const ultimo = membro.ultimo_acesso ? new Date(membro.ultimo_acesso).getTime() : 0
  if (Date.now() - ultimo > HORA) {
    await tocarAcessoWorkflow(req.scope).run({ input: { id: membro.id } })
    membro.ultimo_acesso = new Date()
  }

  const [graves, whatsapp, nomes] = await Promise.all([
    abre(pedido, "observabilidade")
      ? gravesAbertos(req.scope, membro.papel)
          .catch(() => 0)
          .then((n) => ({ observabilidade: n }))
      : {},
    abre(pedido, "whatsapp")
      ? req.scope
          .resolve<WhatsappService>(WHATSAPP)
          .contagensDoPainel()
          .then((c) => ({ whatsapp: c.esperando }))
          .catch(() => ({}))
      : {},
    ehPersonalizado(membro.papel) ? papeisCriados(req.scope).then(nomesDos) : undefined,
  ])
  const avisos = { ...graves, ...whatsapp }
  res.json({ membro: membroPublico(membro, nomes), areas: pedido.areas, avisos })
}
