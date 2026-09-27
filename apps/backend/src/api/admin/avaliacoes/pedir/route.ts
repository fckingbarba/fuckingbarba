import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { pedirAvaliacoes } from "../../../../lib/avaliacoes/pedir"

/**
 * POST /admin/avaliacoes/pedir — a rodada do "o que você achou?" agora, sem
 * esperar o job `pedir-avaliacoes` e SEM OLHAR O RELÓGIO (fora das 9h–21h
 * também manda: quem aperta é uma pessoa). Devolve o relatório.
 *
 * Pro conferidor (`apps/loja/ferramentas/conferir-avaliacoes.mjs`). É
 * idempotente: o pedido que recebeu fica registrado, e a segunda rodada não
 * manda de novo.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.json({ relatorio: await pedirAvaliacoes(req.scope, { qualquerHora: true }) })
}
