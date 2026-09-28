import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { lerInscricao } from "../../../lib/criadores/regras"
import { criarLimite } from "../../../lib/limite"
import { quemPede } from "../../../lib/quem-pede"
import { inscreverCriadorWorkflow } from "../../../workflows/criadores/inscrever"

/**
 * POST /store/criadores — a inscrição de quem quer gravar os vídeos da loja,
 * da página escondida `/criadores`: nome, WhatsApp, e-mail, cidade, os
 * perfis, a barba, o modelo e a autorização (`lerInscricao`). Entra como
 * `nova`, pro painel decidir (a área "Criadores").
 *
 * ┌─ A RESPOSTA É A MESMA PRA QUALQUER E-MAIL ─────────────────────────────┐
 * │ Quem se inscreveu agora e quem já estava inscrito recebem o mesmo      │
 * │ `{ ok: true }` — a segunda vez atualiza a primeira. "Você já se        │
 * │ inscreveu" transformaria o formulário num jeito de descobrir quem é    │
 * │ criador da loja.                                                       │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * OS LIMITES, na memória, como os da newsletter: por quem pede, 10 por hora
 * com a assinatura da loja e 30 sem; da loja toda, 300 por hora. Uma pessoa
 * se inscreve uma vez — corrigir um campo é a segunda. Mais que isso é robô
 * enchendo a fila do painel.
 *
 * O LOG NÃO LEVA DADO DA PESSOA: só que chegou uma, e o modelo.
 *
 * RESPOSTAS: 200 `{ ok: true }`; 400 `campo_invalido` com o `campo`; 429
 * `limite`.
 */

const HORA = 60 * 60 * 1000
const POR_IP_ASSINADO = { limite: 10, ms: HORA }
const POR_IP_SEM_ASSINATURA = { limite: 30, ms: HORA }
const DA_LOJA = { limite: 300, ms: HORA }
const limite = criarLimite()

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const lida = lerInscricao(req.body)
  if (!lida.ok) {
    res.status(400).json({ message: "campo_invalido", campo: lida.campo })
    return
  }

  const quem = quemPede(req)
  const porIp = quem.assinado ? POR_IP_ASSINADO : POR_IP_SEM_ASSINATURA
  if (!limite.cabe(quem.chave, porIp) || !limite.cabe("loja", DA_LOJA)) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(quem.chave, porIp)
  limite.contar("loja", DA_LOJA)

  const { result } = await inscreverCriadorWorkflow(req.scope).run({ input: lida.inscricao })
  req.scope
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(
      `[criadores] inscrição ${result.nova ? "nova" : "atualizada"} (modelo ${lida.inscricao.modelo})`
    )
  res.json({ ok: true })
}
