import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { criarLimite } from "../../../../lib/limite"
import { lerFalas, testarOAtendente } from "../../../../lib/whatsapp/testar"

/** Cada teste é uma chamada de verdade à IA (custa): 30 por hora por pessoa da equipe. */
const LIMITE = { limite: 30, ms: 60 * 60 * 1000 }
const limite = criarLimite()

/**
 * POST /dashboard/whatsapp/testar — `{ falas: [{ de, texto }], telefone?,
 * regras? }`: o que o atendente responderia (`lib/whatsapp/testar.ts`). Nada
 * sai pelo WhatsApp e nada fica nas conversas.
 *
 * RESPOSTAS: 200 `{ texto, extras, ferramentas, equipe, ms, custo, sabia }`;
 * 400 `conversa`; 403 `sem_acesso`; 422 `regras`; 429 `limite`; 502
 * `ia_fora`; 503 `sem_chave` (falta a ANTHROPIC_API_KEY) ou `sem_loja`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "whatsapp")) return
  const corpo = (req.body ?? {}) as { falas?: unknown; telefone?: unknown; regras?: unknown }
  const falas = lerFalas(corpo.falas)
  if (!falas) {
    res.status(400).json({ message: "conversa" })
    return
  }
  const chave = `teste:${pedido.membro.id}`
  if (!limite.cabe(chave, LIMITE)) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(chave, LIMITE)
  const r = await testarOAtendente(req.scope, {
    falas,
    telefone: typeof corpo.telefone === "string" ? corpo.telefone : null,
    regras: typeof corpo.regras === "string" ? corpo.regras : undefined,
  })
  if (!r.ok) {
    const status = { sem_chave: 503, sem_loja: 503, conversa: 400, regras: 422, ia_fora: 502 }
    res.status(status[r.motivo]).json({ message: r.motivo })
    return
  }
  res.json(r)
}
