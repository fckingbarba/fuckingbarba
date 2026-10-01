import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { mudarMetadataDaLoja } from "../../../../lib/metadata-da-loja"
import { anotar } from "../../../../lib/painel/anotar"
import { faltaPraResponder } from "../../../../lib/painel/ler-whatsapp"
import {
  ajustesDoWhatsapp,
  CHAVE_NO_METADATA,
  LIMITE_DAS_REGRAS,
  lerAjustesDoWhatsapp,
} from "../../../../lib/whatsapp/ajustes"

/**
 * GET /dashboard/whatsapp/ajustes — o atendente ligado ou não, as regras do
 * dono e o que falta no Railway pro atendente responder.
 *
 * RESPOSTAS: 200 `{ ligado, regras, limite, falta }`; 403 `sem_acesso`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "whatsapp")) return
  const a = await ajustesDoWhatsapp(req.scope)
  res.json({ ...a, limite: LIMITE_DAS_REGRAS, falta: faltaPraResponder() })
}

/**
 * POST /dashboard/whatsapp/ajustes — `{ ligado?, regras? }`: liga ou desliga
 * o atendente, e grava as regras (no `metadata` da loja, `fb_whatsapp`; vale
 * na próxima resposta). O que não vem fica como está.
 *
 * RESPOSTAS: 200 `{ ligado, regras }`; 403 `sem_acesso`; 422 `{ erro:
 * "regras" }` (passou de `LIMITE_DAS_REGRAS`); 400 `nada`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "whatsapp")) return
  const corpo = (req.body ?? {}) as { ligado?: unknown; regras?: unknown }
  const ligado = typeof corpo.ligado === "boolean" ? corpo.ligado : undefined
  const regras = typeof corpo.regras === "string" ? corpo.regras.trim() : undefined
  if (ligado === undefined && regras === undefined) {
    res.status(400).json({ message: "nada" })
    return
  }
  if (regras !== undefined && regras.length > LIMITE_DAS_REGRAS) {
    res.status(422).json({ erro: "regras" })
    return
  }
  const novos = await mudarMetadataDaLoja(req.scope, (metadata) => {
    const atual = lerAjustesDoWhatsapp(metadata)
    const proximo = {
      ligado: ligado ?? atual.ligado,
      regras: regras === undefined ? atual.regras : regras || null,
    }
    return { gravar: { [CHAVE_NO_METADATA]: proximo }, resultado: proximo }
  })
  if (!novos) {
    res.status(503).json({ message: "sem_loja" })
    return
  }
  await anotar(pedido, "mudou-o-whatsapp", "loja", {
    ...(ligado !== undefined ? { ligado } : {}),
    ...(regras !== undefined ? { regras: regras.length } : {}),
  })
  res.json(novos)
}
