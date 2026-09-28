import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { contaDoToken } from "../../../../lib/conta-do-token"
import { produtosPorSku } from "../../../../lib/crm/estreia"
import { avisoDaReposicao, reposicoesDoEmail } from "../../../../lib/crm/reposicao"
import { linkDeVoltar } from "../../../../lib/crm/voltar"
import { criarLimite } from "../../../../lib/limite"
import { normalizarEmail } from "../../../../modules/codigo/regras"

/**
 * GET /store/crm/reposicao — o aviso da reposição de quem está com a conta
 * aberta (entrega 0188): "Seu Fator de Crescimento acaba em 5 dias", com o
 * "Refazer o pedido" (o link de voltar dos e-mails). A loja mostra na visão
 * geral da conta e na home. A conta e a janela são as dos e-mails
 * (`lib/crm/reposicao.ts`), só com os pedidos desta pessoa.
 *
 * Só com token de cliente de verdade: o e-mail é o da conta do token, nunca
 * o do pedido. 60 por hora por conta — a loja guarda a resposta no navegador.
 * O aviso é um extra: qualquer tropeço vira "nada pra repor", e não erro.
 *
 * RESPOSTAS: 200 `{ reposicao }` — `null` sem nada pra repor agora.
 */

const LIMITE = { limite: 60, ms: 60 * 60 * 1000 }
const limite = criarLimite()

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const conta = await contaDoToken(
    req.scope.resolve(Modules.AUTH),
    req.auth_context.auth_identity_id
  )
  const email = normalizarEmail(conta.email)
  const chave = `reposicao:${conta.identidadeId}`
  if (!email || !limite.cabe(chave, LIMITE)) {
    res.json({ reposicao: null })
    return
  }
  limite.contar(chave, LIMITE)
  const agora = new Date()
  try {
    const reposicoes = await reposicoesDoEmail(req.scope, email, agora)
    const porSku = reposicoes.length
      ? await produtosPorSku(req.scope, [...new Set(reposicoes.flatMap((r) => r.skus))])
      : new Map()
    res.json({
      reposicao: avisoDaReposicao(
        reposicoes,
        porSku,
        (pedido) => `/voltar/${linkDeVoltar(`repor-${pedido}`, agora)}`,
        agora
      ),
    })
  } catch (e) {
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`[crm] o aviso da reposição não saiu — ${e instanceof Error ? e.message : String(e)}`)
    res.json({ reposicao: null })
  }
}
