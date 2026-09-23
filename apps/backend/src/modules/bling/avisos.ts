import { createHmac, timingSafeEqual } from "node:crypto"
import type { ChegadaDoErp, LeituraDoAvisoDoErp } from "../../lib/erp/contrato"

/**
 * O AVISO DO BLING (webhook) — `POST /hooks/erp/bling`.
 *
 * Cadastrado no app, aba Webhooks, com os recursos de estoque (`stock` e
 * `virtual_stock`, que vem junto) e de nota (`invoice`). O Bling assina o
 * corpo com o CLIENT SECRET do app: `X-Bling-Signature-256: sha256=<hex>`,
 * um HMAC-SHA256 do corpo cru. Sem a assinatura certa, não entra — sem o
 * segredo no ambiente, nada entra (a porta falha fechada).
 *
 * O aviso só diz QUE mudou (o id do produto, o id da nota); o que mudou, a
 * loja pergunta. O de estoque nem traz o SKU. Então aviso de estoque vira
 * "sincronize" e aviso de nota vira "consulte esta nota" — e aviso
 * repetido, ou fora de ordem, não faz mal nenhum.
 *
 * RESPONDER EM 5 SEGUNDOS: o Bling tenta de novo por 3 dias e DESLIGA o
 * webhook se continuar falhando. A rota responde antes de trabalhar.
 */

export const CABECALHO_DA_ASSINATURA = "x-bling-signature-256"

export const assinaturaDoCorpo = (bruto: string, segredo: string) =>
  `sha256=${createHmac("sha256", segredo).update(bruto, "utf8").digest("hex")}`

function cabecalho(chegada: ChegadaDoErp, nome: string): string {
  for (const [k, v] of Object.entries(chegada.cabecalhos)) {
    if (k.toLowerCase() !== nome) continue
    const valor = Array.isArray(v) ? v[0] : v
    return typeof valor === "string" ? valor.trim() : ""
  }
  return ""
}

export function lerAviso(chegada: ChegadaDoErp): LeituraDoAvisoDoErp {
  const segredo = process.env.BLING_CLIENT_SECRET ?? ""
  if (!segredo) {
    return {
      ok: false,
      motivo: "sem-configuracao",
      detalhe: "BLING_CLIENT_SECRET não configurado — nenhum aviso do Bling é aceito",
    }
  }
  const recebida = cabecalho(chegada, CABECALHO_DA_ASSINATURA)
  if (!chegada.bruto) return { ok: false, motivo: "ilegivel", detalhe: "aviso sem corpo" }
  const esperada = assinaturaDoCorpo(chegada.bruto, segredo)
  const a = Buffer.from(recebida)
  const b = Buffer.from(esperada)
  if (!recebida || a.length !== b.length || !timingSafeEqual(a, b)) {
    return {
      ok: false,
      motivo: "nao-autorizado",
      detalhe: recebida ? "assinatura errada" : `sem o cabeçalho ${CABECALHO_DA_ASSINATURA}`,
    }
  }

  const corpo = (chegada.corpo ?? {}) as { event?: unknown; data?: { id?: unknown } | null }
  const [recurso] = String(corpo.event ?? "").split(".")
  if (recurso === "stock" || recurso === "virtual_stock" || recurso === "product") {
    return { ok: true, estoque: true, notas: [] }
  }
  if (recurso === "invoice") {
    const id = corpo.data?.id
    return { ok: true, estoque: false, notas: id === undefined || id === null ? [] : [String(id)] }
  }
  if (!recurso) return { ok: false, motivo: "ilegivel", detalhe: "não parece um aviso do Bling" }
  return { ok: true, estoque: false, notas: [] }
}
