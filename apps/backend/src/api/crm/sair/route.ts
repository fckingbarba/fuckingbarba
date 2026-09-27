import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { emailDoTokenDeSair } from "../../../lib/crm/sair"
import { emailNoLog } from "../../../lib/email"
import { urlDaLoja } from "../../../lib/emails/moldura"
import { criarLimite } from "../../../lib/limite"
import { tirarDasOfertas } from "../../../lib/ofertas"
import { quemPede } from "../../../lib/quem-pede"

/**
 * SAIR DA LISTA — o link de todo e-mail de oferta do CRM (`lib/crm/sair.ts`).
 *
 * POST /crm/sair?t=… — o "cancelar inscrição" de um clique: o Gmail e o Mail
 * do iPhone chamam direto, pelo cabeçalho `List-Unsubscribe` (RFC 8058),
 * sem abrir página nenhuma. A página `/sair` da loja chama igual, com o `t`
 * no corpo. Fora do `/store` de propósito: quem chama não tem a chave
 * publicável da loja.
 *
 * GET /crm/sair?t=… — quem abriu o endereço do cabeçalho no navegador vai
 * pra página da loja, que pergunta antes (`/sair/<t>`).
 *
 * Tira a pessoa das ofertas em todos os lugares (`tirarDasOfertas`). Sempre
 * a mesma resposta pra quem estava e pra quem não estava na lista: o link
 * não diz se um e-mail é cliente.
 *
 * RESPOSTAS: POST 200 `{ ok }`; 400 `link_invalido`; 429 `limite`. GET 303
 * pra loja.
 */

const HORA = 60 * 60 * 1000
const POR_IP = { limite: 30, ms: HORA }
const DA_LOJA = { limite: 2000, ms: HORA }
const limite = criarLimite()

const tokenDo = (req: MedusaRequest): unknown =>
  (req.query as { t?: unknown }).t ?? (req.body as { t?: unknown } | undefined)?.t

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const email = emailDoTokenDeSair(tokenDo(req))
  if (!email) {
    res.status(400).json({ message: "link_invalido" })
    return
  }
  const quem = quemPede(req)
  if (!limite.cabe(quem.chave, POR_IP) || !limite.cabe("loja", DA_LOJA)) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(quem.chave, POR_IP)
  limite.contar("loja", DA_LOJA)
  const saiu = await tirarDasOfertas(req.scope, email)
  req.scope
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(
      `[crm] ${emailNoLog(email)} saiu da lista de ofertas (newsletter ${saiu.newsletter ? "sim" : "não"}, ` +
        `contas ${saiu.contas}, base ${saiu.base ? "sim" : "não"})`
    )
  res.json({ ok: true })
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const loja = urlDaLoja()
  const t = tokenDo(req)
  if (!loja || typeof t !== "string") {
    res.status(400).json({ message: "link_invalido" })
    return
  }
  res.redirect(303, `${loja}/sair/${encodeURIComponent(t)}`)
}
