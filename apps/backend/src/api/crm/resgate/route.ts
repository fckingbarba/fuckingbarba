import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CRM } from "../../../modules/crm"
import type CrmService from "../../../modules/crm/service"
import { whatsappDaLoja } from "../../../lib/atendimento"
import { criarCupomDoFluxo } from "../../../lib/crm/cupom"
import { CURTO_DO_COMPONENTE } from "../../../lib/crm/estreia"
import { DESCONTO_DO_RESGATE, DIAS_ENTRE_CUPONS, validadeDoCupom } from "../../../lib/crm/fluxos"
import { emailDaChave, resgateDoToken, whatsappDoResultado } from "../../../lib/crm/resgate"
import { linkDeVoltar } from "../../../lib/crm/voltar"
import { urlDaLoja } from "../../../lib/emails/moldura"
import { criarLimite } from "../../../lib/limite"
import { quemPede } from "../../../lib/quem-pede"

/**
 * OS BOTÕES DO RESGATE — `GET /crm/resgate?t=…` (`lib/crm/resgate.ts`), a
 * pergunta de 1 clique do "Tá tudo bem com a barba?" e o "Sim" do sunset
 * (entrega 0192). Anota a resposta e manda pra onde ela leva:
 *
 *   - "Tá caro": um cupom de 15% na hora, guardado na loja (`/discount/<código>`).
 *     Um só por resgate (o clique repetido leva o mesmo), e quem já tem um
 *     cupom do CRM valendo leva esse — a regra de um a cada 60 dias;
 *   - "Esqueci de repor": o pedido de sempre, num carrinho novo (o link de voltar);
 *   - "Não vi resultado": o WhatsApp da loja, com a mensagem pronta (sem o
 *     número nas Configurações, a página de contato);
 *   - "Comprei em outro lugar" e o "Sim, quero continuar": a loja.
 *
 * Fora do `/store`, como o check-in: quem chama é o e-mail. Link torto, ou
 * limite estourado: vai pra home da loja, sem anotar nada. RESPOSTA: 303.
 */

const HORA = 60 * 60 * 1000
const DIA = 24 * HORA
const POR_IP = { limite: 60, ms: HORA }
const limite = criarLimite()
const CAMPANHA = "utm_source=loja&utm_medium=email&utm_campaign=crm-resgate"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const loja = urlDaLoja() ?? ""
  const home = `${loja}/?${CAMPANHA}`
  const r = resgateDoToken((req.query as { t?: unknown }).t)
  const quem = quemPede(req)
  if (!r || !limite.cabe(quem.chave, POR_IP)) {
    res.redirect(303, home)
    return
  }
  limite.contar(quem.chave, POR_IP)
  const email = emailDaChave(r.chave)
  const crm = req.scope.resolve<CrmService>(CRM)
  const agora = new Date()

  if (r.resposta === "caro") {
    const cupom = (await cupomQueJaVale(crm, r.chave, email, agora)) ?? {
      ...(await criarCupomDoFluxo(req.scope, {
        porcento: DESCONTO_DO_RESGATE,
        agora,
        validade: validadeDoCupom("resgate"),
        campanha: "CRM (resgate)",
      })),
    }
    await crm.anotarRespostaDoResgate({
      email,
      chave: r.chave,
      resposta: "caro",
      cupom: cupom.codigo,
      cupomAte: cupom.ate,
    })
    res.redirect(303, `${loja}/discount/${encodeURIComponent(cupom.codigo)}?${CAMPANHA}`)
    return
  }

  await crm.anotarRespostaDoResgate({ email, chave: r.chave, resposta: r.resposta })
  if (r.resposta === "esqueci" && r.pedido) {
    res.redirect(303, `${loja}/voltar/${linkDeVoltar(`repor-${r.pedido}`, agora)}?${CAMPANHA}`)
    return
  }
  if (r.resposta === "resultado") {
    const whatsapp = whatsappDoResultado(
      await whatsappDaLoja(req.scope),
      r.componente ? CURTO_DO_COMPONENTE[r.componente] : null
    )
    res.redirect(303, whatsapp ?? `${loja}/contato?${CAMPANHA}`)
    return
  }
  res.redirect(303, home)
}

/**
 * O cupom que a pessoa já tem: o desta resposta (o clique repetido), ou outro
 * do CRM que ainda vale — um a cada 60 dias, sem somar dois.
 */
async function cupomQueJaVale(
  crm: CrmService,
  chave: string,
  email: string,
  agora: Date
): Promise<{ codigo: string; ate: Date } | null> {
  const daResposta = await crm.cupomDaRespostaDoResgate(chave)
  if (daResposta && daResposta.ate > agora) return daResposta
  const valendo = (
    await crm.registrosDosFluxos(new Date(agora.getTime() - DIAS_ENTRE_CUPONS * DIA), [email])
  )
    .filter((x) => x.cupom && x.cupom_ate && new Date(x.cupom_ate) > agora)
    .sort((a, b) => new Date(b.cupom_ate!).getTime() - new Date(a.cupom_ate!).getTime())[0]
  return valendo?.cupom && valendo.cupom_ate
    ? { codigo: valendo.cupom, ate: new Date(valendo.cupom_ate) }
    : null
}
