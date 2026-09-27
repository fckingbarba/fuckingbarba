import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  CHAVE_DOS_AJUSTES,
  lerAjustesGuardados,
  lerMudancaDosAjustes,
  montarTelaDosAjustes,
  soOQueMudou,
} from "../../../../lib/crm/ajustes"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { mudarMetadataDaLoja } from "../../../../lib/metadata-da-loja"
import { anotar } from "../../../../lib/painel/anotar"
import { recomprasDaBase } from "../../../../lib/painel/crm"
import { lerNomesDosProdutos } from "../../../../lib/painel/ler-produtos"
import { CRM } from "../../../../modules/crm"
import type CrmService from "../../../../modules/crm/service"

/**
 * GET /dashboard/crm/ajustes — os Ajustes do CRM (`lib/crm/ajustes.ts`):
 * quanto dura cada tipo de produto e as regras das etiquetas, os números do
 * padrão, os produtos da loja que contam como cada tipo, e o que o
 * histórico da Nuvemshop diz de cada um (com a base importada).
 *
 * POST /dashboard/crm/ajustes — `{ dias, regras }`, o formulário inteiro.
 * Grava no metadata da loja (`fb_crm`) só o que é diferente do padrão, e
 * anota no registro da equipe. Vale na próxima ficha aberta.
 *
 * Quem abre o CRM (no padrão, o dono e o marketing).
 *
 * RESPOSTAS: GET 200 a tela; POST 200 `{ ok, ajustes }`, 422 `{ erros }`
 * (pelo campo: `dias.fator`, `regras.morno`), 404 sem loja.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!exigirArea(req as PedidoDaEquipe, res, "crm")) return
  const [lojas, produtos, daBase] = await Promise.all([
    req.scope.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
    lerNomesDosProdutos(req.scope),
    req.scope.resolve<CrmService>(CRM).pedidosDaBase(),
  ])
  res.json(
    montarTelaDosAjustes(lerAjustesGuardados(lojas[0]?.metadata), produtos, recomprasDaBase(daBase))
  )
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "crm")) return
  const lido = lerMudancaDosAjustes(req.body)
  if ("erros" in lido) {
    res.status(422).json({ erros: lido.erros })
    return
  }
  const r = await mudarMetadataDaLoja(req.scope, (metadata) => ({
    gravar: { [CHAVE_DOS_AJUSTES]: soOQueMudou(lido.ajustes) },
    resultado: { antes: lerAjustesGuardados(metadata) },
  }))
  if (!r) {
    res.status(404).json({ message: "sem_loja" })
    return
  }
  await anotar(pedido, "mudou-ajustes-do-crm", "crm", { de: r.antes, para: lido.ajustes })
  res.json({ ok: true, ajustes: lido.ajustes })
}
