import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { mudarMetadataDaLoja } from "../../../../lib/metadata-da-loja"
import { anotar } from "../../../../lib/painel/anotar"
import { CHAVE_DAS_METAS, lerMetas, lerValorDaMeta, mesDe } from "../../../../lib/painel/marketing"

/**
 * POST /dashboard/marketing/meta — `{ valor }`: a meta de vendas do mês de
 * agora, em reais ("12.000", "12000,00"); vazio tira. Só o dono. As metas
 * dos meses de antes ficam guardadas (`fb_metas`, no metadata da loja).
 *
 * RESPOSTAS: 200 `{ ok, mes, valor }`; 422 `{ erro: "valor_invalido" }`;
 * 404 sem loja.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "metaDoMes")) return

  const valor = lerValorDaMeta((req.body as { valor?: unknown } | undefined)?.valor)
  if (valor === "invalido") {
    res.status(422).json({ erro: "valor_invalido" })
    return
  }
  const mes = mesDe(new Date())
  const r = await mudarMetadataDaLoja(req.scope, (metadata) => {
    const metas = lerMetas(metadata)
    const antes = metas[mes] ?? null
    if (valor === null) delete metas[mes]
    else metas[mes] = valor
    return { gravar: { [CHAVE_DAS_METAS]: metas }, resultado: { antes } }
  })
  if (!r) {
    res.status(404).json({ message: "sem_loja" })
    return
  }
  await anotar(pedido, "mudou-meta", "marketing", { mes, de: r.antes, para: valor })
  res.json({ ok: true, mes, valor })
}
