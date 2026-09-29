import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { CRM } from "../../../../modules/crm"
import type CrmService from "../../../../modules/crm/service"
import {
  CHAVE_DOS_FLUXOS,
  guardarConfigDosFluxos,
  lerConfigDosFluxos,
  ehCupomDoCrm,
  type ConfigDosFluxos,
} from "../../../../lib/crm/fluxos"
import { publicoDaEstreia } from "../../../../lib/crm/estreia"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { mudarMetadataDaLoja } from "../../../../lib/metadata-da-loja"
import { anotar } from "../../../../lib/painel/anotar"
import {
  DIAS_DA_TELA,
  montarTelaDosFluxos,
  mudarConfigDosFluxos,
  publicoNaTela,
  type PedidoDaTela,
} from "../../../../lib/painel/fluxos"

/**
 * GET /dashboard/crm/fluxos — a aba Fluxos do CRM (`lib/painel/fluxos.ts`):
 * cada fluxo, se está ligado, os toques e o que vendeu nos últimos 30 dias,
 * contra o grupo de controle; e o indique um brother (0215): quantos têm o
 * link, os brothers que compraram e os cupons de quem indicou.
 *
 * POST /dashboard/crm/fluxos — `{ fluxo, ligado }` ou `{ desconto }`: liga,
 * desliga, ou muda o desconto do cupom. Fica no registro da equipe.
 *
 * Quem abre o CRM. RESPOSTAS: 200 a tela; 422 `{ erro }`.
 */

const DIA = 24 * 60 * 60 * 1000

async function tela(container: MedusaContainer, config: ConfigDosFluxos, agora: Date) {
  const desde = new Date(agora.getTime() - DIAS_DA_TELA * DIA)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const crm = container.resolve<CrmService>(CRM)
  const [registros, pedidos, estreia, [, links]] = await Promise.all([
    crm.registrosDosFluxos(desde),
    query
      .graph({
        entity: "order",
        // O id: o pedido do brother, no indique (0215).
        fields: ["id", "email", "created_at", "total", "status"],
        filters: { created_at: { $gte: desde } },
        pagination: { take: 5000 },
      })
      .then((r) => r.data as unknown as PedidoDaTela[]),
    // Quem entra na estreia: a base da Nuvemshop, agora.
    publicoDaEstreia(container, agora),
    // Quantas pessoas têm o link do indique um brother.
    crm.listAndCountIndicadores({}, { select: ["id"], take: 1 }),
  ])
  const codigos = registros.flatMap((r) => (r.cupom && ehCupomDoCrm(r.cupom) ? [r.cupom] : []))
  const usados = codigos.length
    ? await container
        .resolve(Modules.PROMOTION)
        .listPromotions({ code: codigos }, { select: ["code", "used"], take: codigos.length })
    : []
  return montarTelaDosFluxos({
    config,
    registros,
    pedidos: pedidos.map((p) => ({ ...p, total: Number(p.total) || 0 })),
    cuponsUsados: new Set(
      (usados as { code?: string | null; used?: number | null }[])
        .filter((p) => p.code && Number(p.used) > 0)
        .map((p) => p.code as string)
    ),
    publico: publicoNaTela(estreia),
    links,
  })
}

async function configAtual(container: MedusaContainer): Promise<ConfigDosFluxos> {
  const [loja] = await container
    .resolve(Modules.STORE)
    .listStores({}, { select: ["metadata"], take: 1 })
  return lerConfigDosFluxos(loja?.metadata)
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "crm")) return
  const agora = new Date()
  res.json(await tela(req.scope, await configAtual(req.scope), agora))
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "crm")) return
  const agora = new Date()
  type Mudou = ({ ok: true; config: ConfigDosFluxos } | { ok: false; erro: string }) & {
    antes: ConfigDosFluxos
  }
  const r = await mudarMetadataDaLoja<Mudou>(req.scope, (metadata) => {
    const antes = lerConfigDosFluxos(metadata)
    const mudou = mudarConfigDosFluxos(antes, req.body, agora)
    if (!mudou.ok) return { resultado: { ...mudou, antes } }
    return {
      gravar: { [CHAVE_DOS_FLUXOS]: guardarConfigDosFluxos(mudou.config) },
      resultado: { ...mudou, antes },
    }
  })
  if (!r) {
    res.status(500).json({ message: "sem_loja" })
    return
  }
  if (!r.ok) {
    res.status(422).json({ erro: r.erro })
    return
  }
  await anotar(pedido, "mudou-os-fluxos-do-crm", "crm", {
    de: guardarConfigDosFluxos(r.antes),
    para: guardarConfigDosFluxos(r.config),
  })
  res.json(await tela(req.scope, r.config, agora))
}
