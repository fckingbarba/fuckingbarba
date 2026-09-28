import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CRM } from "../../../modules/crm"
import type CrmService from "../../../modules/crm/service"
import { DESTINO_DA_ESCOLHA, escolhaDoToken } from "../../../lib/crm/escolha"
import { urlDaLoja } from "../../../lib/emails/moldura"
import { criarLimite } from "../../../lib/limite"
import { quemPede } from "../../../lib/quem-pede"

/**
 * O BOTÃO DO "BARBA OU CABELO?" — `GET /crm/escolha?t=…` (`lib/crm/escolha.ts`).
 * Anota a trilha que a pessoa escolheu e manda pra loja, na página dela, com
 * a campanha das boas-vindas. Fora do `/store`, como o sair da lista: quem
 * chama é o e-mail, sem a chave publicável.
 *
 * Link torto, ou limite estourado: vai pra home da loja, sem anotar nada.
 * RESPOSTA: 303 pra loja.
 */

const HORA = 60 * 60 * 1000
const POR_IP = { limite: 60, ms: HORA }
const limite = criarLimite()

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const loja = urlDaLoja() ?? ""
  const campanha = "utm_source=loja&utm_medium=email&utm_campaign=crm-boas-vindas"
  const escolha = escolhaDoToken((req.query as { t?: unknown }).t)
  const quem = quemPede(req)
  if (!escolha || !limite.cabe(quem.chave, POR_IP)) {
    res.redirect(303, `${loja}/?${campanha}`)
    return
  }
  limite.contar(quem.chave, POR_IP)
  await req.scope.resolve<CrmService>(CRM).anotarEscolha(escolha.email, escolha.trilha)
  res.redirect(303, `${loja}${DESTINO_DA_ESCOLHA[escolha.trilha]}?${campanha}`)
}
