import type { MedusaContainer } from "@medusajs/framework/types"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import { bancoDoTexto, lerCampanha, type CampanhaDoBanco } from "./campanhas"
import { produtosDaLoja } from "./enviar-campanhas"

/**
 * O QUE A EQUIPE FAZ COM UMA CAMPANHA (entrega 0206, `POST
 * /dashboard/crm/campanhas`): salvar, agendar, desmarcar, parar e apagar —
 * com a situação de cada uma (só o rascunho e a agendada se mudam; só a que
 * está saindo para; só o rascunho se apaga).
 */

export const ACOES = ["salvar", "agendar", "desmarcar", "parar", "apagar"] as const
export type AcaoNaCampanha = (typeof ACOES)[number]

export type MudouACampanha =
  | { ok: true; id: string; nome: string; agenda: Date | null }
  | { ok: false; status: 400 | 404 | 409 | 422; corpo: Record<string, unknown> }

export async function mudarCampanha(
  container: MedusaContainer,
  {
    acao,
    id,
    campanha,
    agenda: agendaPedida,
    por,
    agora,
  }: {
    acao: unknown
    id: unknown
    campanha: unknown
    agenda: unknown
    por: string
    agora: Date
  }
): Promise<MudouACampanha> {
  const qual = ACOES.find((a) => a === acao)
  if (!qual) return { ok: false, status: 400, corpo: { message: "acao" } }
  const crm = container.resolve<CrmService>(CRM)
  const idDela = typeof id === "string" ? id : null
  const antes = idDela
    ? ((await crm.listCampanhas({ id: idDela }, { take: 1 }))[0] as unknown as
        CampanhaDoBanco | undefined)
    : undefined
  const naoTem = { ok: false as const, status: 404 as const, corpo: { message: "campanha" } }
  const situacaoErrada = {
    ok: false as const,
    status: 409 as const,
    corpo: { message: "situacao" },
  }
  if (idDela && !antes) return naoTem

  if (qual === "salvar" || qual === "agendar") {
    if (antes && antes.situacao !== "rascunho" && antes.situacao !== "agendada")
      return situacaoErrada
    const publicados = new Set((await produtosDaLoja(container)).map((p) => p.handle))
    const lida = lerCampanha(
      { ...((campanha ?? {}) as object), agenda: agendaPedida },
      { publicados, agora, agendar: qual === "agendar" }
    )
    if (!lida.ok) return { ok: false, status: 422, corpo: { erros: lida.erros } }
    // Salvar a agendada mantém a hora; agendar marca a nova.
    const situacao = qual === "agendar" ? "agendada" : (antes?.situacao ?? "rascunho")
    const agenda = qual === "agendar" ? lida.agenda : antes?.agenda ? new Date(antes.agenda) : null
    const texto = bancoDoTexto(lida.campanha)
    // Os produtos são uma lista (o JSON do modelo se declara objeto).
    const campos = {
      ...texto,
      produtos: texto.produtos as unknown as Record<string, unknown>,
      situacao,
      agenda,
      por,
    }
    const salva = antes
      ? await crm.updateCampanhas({ id: antes.id, ...campos })
      : await crm.createCampanhas(campos)
    return { ok: true, id: (salva as { id: string }).id, nome: lida.campanha.nome, agenda }
  }

  if (!antes) return naoTem
  if (qual === "desmarcar") {
    if (antes.situacao !== "agendada") return situacaoErrada
    await crm.updateCampanhas({ id: antes.id, situacao: "rascunho", agenda: null, por })
  } else if (qual === "parar") {
    if (antes.situacao !== "enviando") return situacaoErrada
    await crm.updateCampanhas({ id: antes.id, situacao: "parada", acabou_em: agora, por })
  } else {
    if (antes.situacao !== "rascunho") return situacaoErrada
    await crm.softDeleteCampanhas([antes.id])
  }
  return { ok: true, id: antes.id, nome: antes.nome, agenda: null }
}
