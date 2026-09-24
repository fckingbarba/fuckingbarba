import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { tentarDeNovo } from "../../../../../lib/erp/notas"
import {
  acaoDaNota,
  EMITIU_NOTA,
  fraseDaNota,
  registroDaNota,
} from "../../../../../lib/painel/acoes"
import { lerContexto, notasDos, pedidoPorId } from "../../../../../lib/painel/ler"
import { pagamentoDo, situacaoDo } from "../../../../../lib/painel/pedido"
import { anotarAcaoWorkflow } from "../../../../../workflows/equipe/anotar-acao"

/**
 * POST /dashboard/pedidos/:id/nota — "Emitir a nota agora" (a nota esperando
 * a janela, do pedido que precisa sair antes) e "Tentar a nota de novo" (a
 * que a loja desistiu de emitir, depois que alguém corrigiu o que faltava).
 * Dono e operação.
 *
 * É o `tentarDeNovo` do admin (`lib/erp/notas.ts`), com a pergunta antes: só
 * nos pedidos em que o botão aparece (`acaoDaNota`) — nunca na nota que a
 * loja ainda está tentando sozinha, nem na de pedido cancelado. Feito, fica
 * no registro da equipe: quem apertou, quando e no que deu.
 *
 * RESPOSTAS: 200 `{ ok, texto }` (a frase pra tela, deu ou não deu);
 * 404 `nao_encontrado`; 409 `nada_a_fazer` (o pedido mudou desde que a tela
 * abriu — ela recarrega).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "pedidos")) return

  const id = req.params.id
  const o = /^order_[0-9A-Z]{10,40}$/.test(id) ? await pedidoPorId(req.scope, id) : null
  if (!o) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  const ctx = await lerContexto(req.scope)
  const nota = (await notasDos(req.scope, [id])).get(id) ?? null
  const p = pagamentoDo(o)
  const tipo = acaoDaNota(nota, situacaoDo(o, p, ctx.agora), p.pagoEm, ctx)
  if (!tipo) {
    res.status(409).json({ message: "nada_a_fazer" })
    return
  }

  const resultado = await tentarDeNovo(req.scope, id)
  await anotarAcaoWorkflow(req.scope)
    .run({
      input: {
        membro_id: pedido.membro.id,
        acao: EMITIU_NOTA,
        alvo_id: id,
        detalhe: registroDaNota(resultado, tipo, Number(o.display_id ?? 0)),
      },
    })
    .catch((e: unknown) =>
      req.scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(`[painel] a nota do #${o.display_id} andou, mas o registro não gravou: ${e}`)
    )
  res.json(fraseDaNota(resultado))
}
