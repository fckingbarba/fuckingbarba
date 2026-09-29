import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { CRM } from "../../../../modules/crm"
import type CrmService from "../../../../modules/crm/service"
import {
  resultadoGuardado,
  type CampanhaDoBanco,
  type RegistroDaCampanha,
} from "../../../../lib/crm/campanhas"
import {
  pedidosEntre,
  produtosDaLoja,
  quantosEmCadaPublico,
} from "../../../../lib/crm/enviar-campanhas"
import { mudarCampanha, type AcaoNaCampanha } from "../../../../lib/crm/mudar-campanha"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"
import { montarTelaDasCampanhas } from "../../../../lib/painel/campanhas"
import type { PedidoDaTela } from "../../../../lib/painel/fluxos"

/**
 * GET /dashboard/crm/campanhas — a aba Campanhas do CRM (entrega 0206,
 * `lib/painel/campanhas.ts`): as campanhas, o resultado das que saíram, e o
 * que o formulário precisa (os públicos, com quantas pessoas, e os produtos).
 *
 * POST /dashboard/crm/campanhas — `{ acao, id?, campanha?, agenda? }`:
 *   - "salvar": cria (sem `id`) ou muda o rascunho ou a agendada;
 *   - "agendar": salva e marca pra sair na `agenda` (ISO);
 *   - "desmarcar": a agendada volta a rascunho;
 *   - "parar": a que está saindo para (quem não recebeu, não recebe mais);
 *   - "apagar": só o rascunho.
 * Fica no registro da equipe.
 *
 * Quem abre o CRM. RESPOSTAS: 200 `{ ok, id }` (o GET, a tela); 400 `acao`;
 * 404 `campanha`; 409 `situacao`; 422 `{ erros }` (por campo).
 */

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "crm")) return
  res.json(await tela(req.scope, new Date()))
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "crm")) return
  const corpo = (req.body ?? {}) as Record<string, unknown>
  const r = await mudarCampanha(req.scope, {
    acao: corpo.acao,
    id: corpo.id,
    campanha: corpo.campanha,
    agenda: corpo.agenda,
    por: pedido.membro.email,
    agora: new Date(),
  })
  if (!r.ok) {
    res.status(r.status).json(r.corpo)
    return
  }
  const oQue: Record<AcaoNaCampanha, string> = {
    salvar: "salvou-campanha",
    agendar: "agendou-campanha",
    desmarcar: "desmarcou-campanha",
    parar: "parou-campanha",
    apagar: "apagou-campanha",
  }
  await anotar(pedido, oQue[corpo.acao as AcaoNaCampanha], "crm", {
    id: r.id,
    nome: r.nome,
    ...(r.agenda ? { agenda: r.agenda.toISOString() } : {}),
  })
  res.json({ ok: true, id: r.id })
}

async function tela(container: MedusaContainer, agora: Date) {
  const crm = container.resolve<CrmService>(CRM)
  const campanhas = (await crm.listCampanhas(
    {},
    { take: 200, order: { created_at: "DESC" } }
  )) as unknown as (CampanhaDoBanco & { updated_at: Date | string })[]
  // Só as que saíram e ainda não têm o resultado guardado são contadas agora (a rotina guarda
  // 7 dias depois do fim do envio): a tela não relê o registro das antigas.
  const vivas = campanhas.filter((c) => c.comecou_em && !resultadoGuardado(c.resultado))
  const registros = new Map<string, RegistroDaCampanha[]>()
  for (const c of vivas) registros.set(c.id, await crm.registrosDaCampanha(c.id))
  // Os pedidos desde a mais velha delas: é deles que sai o "comprou em 7 dias".
  const desde = vivas.length
    ? new Date(Math.min(...vivas.map((c) => new Date(c.comecou_em!).getTime())))
    : null
  const [pedidos, publicos, produtos] = await Promise.all([
    desde ? pedidosEntre(container, desde, agora) : Promise.resolve([] as PedidoDaTela[]),
    quantosEmCadaPublico(container, agora),
    produtosDaLoja(container),
  ])
  return montarTelaDasCampanhas({ campanhas, registros, pedidos, publicos, produtos })
}
