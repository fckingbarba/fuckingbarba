import type { MedusaContainer } from "@medusajs/framework/types"
import { updateCustomersWorkflow } from "@medusajs/medusa/core-flows"
import { CRM } from "../modules/crm"
import type CrmService from "../modules/crm/service"
import { removerDaNewsletterWorkflow } from "../workflows/newsletter/remover"
import { tirarDoAviseMe } from "./avise-me"
import { inscricoesDaNewsletter, lerClientes } from "./painel/ler"

/**
 * TIRAR ALGUÉM DAS OFERTAS POR E-MAIL — de verdade, em todos os lugares onde
 * o "sim" mora. É o "pode sair quando quiser" da Política de Privacidade:
 *
 *   - a inscrição da newsletter é APAGADA (como no admin: sem marca de
 *     cancelado);
 *   - a caixa de ofertas por e-mail da conta desmarca (a do WhatsApp fica
 *     como está);
 *   - os pedidos de aviso de produto esgotado que ela ainda espera (o
 *     avise-me, `lib/avise-me.ts`) são apagados: quem pede pra sair não
 *     recebe o "voltou" depois;
 *   - na base da Nuvemshop (o CRM), o "Aceita" vira "não aceita", com a data;
 *   - e a pessoa entra na lista de quem saiu (`crm_saiu`): os e-mails dos
 *     fluxos de compra (checkout abandonado, Pix pendente) vão até pra quem
 *     não aceitou ofertas, e pra essa pessoa é a única marca de que ela pediu
 *     pra parar.
 *
 * Se a pessoa quiser de novo depois, é um "sim" novo, com data nova. Quem
 * chama: o painel ("Tirar", na newsletter) e o link de sair da lista dos
 * e-mails do CRM (`POST /crm/sair`).
 */
export async function tirarDasOfertas(
  container: MedusaContainer,
  email: string
): Promise<{ newsletter: boolean; contas: number; avisos: number; base: boolean }> {
  const [inscricoes, clientes] = await Promise.all([
    inscricoesDaNewsletter(container, { email }),
    lerClientes(container, { email }),
  ])
  const comCaixa = clientes.filter((c) => {
    const ofertas = (c.metadata?.ofertas ?? null) as Record<string, unknown> | null
    return Boolean(ofertas?.email)
  })
  const avisos = await tirarDoAviseMe(container, email)
  for (const i of inscricoes) await removerDaNewsletterWorkflow(container).run({ input: i.id })
  for (const c of comCaixa) {
    const ofertas = (c.metadata?.ofertas ?? {}) as Record<string, unknown>
    // O Medusa junta o metadata no primeiro nível: só as `ofertas` mudam.
    await updateCustomersWorkflow(container).run({
      input: {
        selector: { id: c.id },
        update: { metadata: { ofertas: { ...ofertas, email: null } } },
      },
    })
  }
  const crm = container.resolve<CrmService>(CRM)
  const base = await crm.tirarDaBaseDasOfertas(email)
  await crm.saiuDaLista(email)
  return { newsletter: inscricoes.length > 0, contas: comCaixa.length, avisos, base }
}
