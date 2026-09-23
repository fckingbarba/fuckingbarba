import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { criarLimite } from "../../../lib/limite"
import { quemPede } from "../../../lib/quem-pede"
import { normalizarEmail } from "../../../modules/codigo/regras"
import { inscreverNaNewsletterWorkflow } from "../../../workflows/newsletter/inscrever"

/**
 * POST /store/newsletter — `{ email, origem? }` entra na lista.
 *
 * ┌─ A RESPOSTA É A MESMA PRA QUALQUER E-MAIL ─────────────────────────────┐
 * │ Quem já estava na lista e quem acabou de entrar recebem o mesmo        │
 * │ `{ inscrito: true }`. "Você já está inscrito" transformaria o          │
 * │ formulário num jeito de descobrir quem é cliente da loja.              │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * OS LIMITES, na memória, como em `conta/codigo`: por quem pede, 10 por hora
 * com a assinatura da loja e 60 sem (sem assinatura, todo mundo cai no IP da
 * Vercel); da loja toda, 500 por hora. Formulário de newsletter é o alvo
 * preferido de robô que testa e-mail — sem teto a lista vira lixo, e o
 * domínio vira remetente de spam no dia em que a loja mandar a primeira.
 *
 * RESPOSTAS: 200 `{ inscrito: true }`; 400 `email_invalido`; 429 `limite`.
 */

const HORA = 60 * 60 * 1000
const POR_IP_ASSINADO = { limite: 10, ms: HORA }
const POR_IP_SEM_ASSINATURA = { limite: 60, ms: HORA }
const DA_LOJA = { limite: 500, ms: HORA }
/** De onde a inscrição pode vir. Texto livre aqui seria campo pra lixo. */
const ORIGENS = new Set(["rodape"])
const limite = criarLimite()

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const corpo = (req.body ?? {}) as { email?: unknown; origem?: unknown }
  const email = normalizarEmail(corpo.email)
  if (!email) {
    res.status(400).json({ message: "email_invalido" })
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

  await inscreverNaNewsletterWorkflow(req.scope).run({
    input: {
      email,
      origem: typeof corpo.origem === "string" && ORIGENS.has(corpo.origem) ? corpo.origem : null,
    },
  })

  res.json({ inscrito: true })
}
