import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { whatsappDaLoja } from "../atendimento"
import { lerConfiguracoes } from "../configuracoes"
import { remetenteDoEstilo } from "../email"
import { emailDoCrm, NOME_DO_REMETENTE_PESSOAL, type EmailDoCrm } from "../emails/crm"

/**
 * O QUE TODO E-MAIL DO CRM PRECISA PRA SAIR — o pé da loja (`dadosDaLoja`) e
 * quem manda e pra onde vai a resposta (`comQuemManda`). O motor dos fluxos, a
 * rota do pop-up da 1ª compra e o "Mandar pra mim" usam os dois; morar aqui, e
 * não no motor, é o que evita o motor e o pop-up importarem um ao outro.
 */

/** O que o pé do e-mail mostra da loja: o endereço, o WhatsApp e a empresa (e o do pop-up). */
export async function dadosDaLoja(
  container: MedusaContainer,
  url: string
): Promise<EmailDoCrm["loja"]> {
  const [whatsapp, lojas] = await Promise.all([
    whatsappDaLoja(container),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const { empresa, atendimento } = lerConfiguracoes(lojas[0]?.metadata)
  return {
    url,
    whatsapp,
    empresa: empresa.razaoSocial,
    cnpj: empresa.cnpj,
    atendimento: atendimento.email,
  }
}

/**
 * O e-mail pronto pro envio, com quem manda e pra onde vai a resposta — do
 * estilo dele (`EmailDoCrm.estilo`): o de pedido sai como os pedidos, sem
 * resposta; o lembrete (e o pessoal) sai com o nome de quem assina; os do CRM
 * mandam a resposta pro atendimento. Também é o do "Mandar pra mim" dos fluxos.
 */
export function comQuemManda(e: EmailDoCrm) {
  return {
    ...emailDoCrm(e),
    remetente: remetenteDoEstilo(e.estilo, NOME_DO_REMETENTE_PESSOAL),
    responderPara: e.estilo === "pedido" ? null : (e.loja.atendimento ?? null),
  }
}
