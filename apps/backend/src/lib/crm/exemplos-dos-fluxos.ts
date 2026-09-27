import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { whatsappDaLoja } from "../atendimento"
import { lerConfiguracoes } from "../configuracoes"
import { emailDoFluxo, type CompraDoFluxo } from "../emails/fluxos"
import type { EmailDoCrm } from "../emails/crm"
import { urlDaLoja } from "../emails/moldura"
import { produtosDosExemplos } from "./exemplos-dos-emails"
import { FLUXOS, IDS_DOS_FLUXOS, lerConfigDosFluxos, type IdDoToque } from "./fluxos"
import { linksDeSair } from "./sair"
import { linkDeVoltar } from "./voltar"

/**
 * O "MANDAR PRA MIM" DOS FLUXOS — cada toque do checkout abandonado e do Pix
 * pendente, montado como sairia (`lib/emails/fluxos.ts`), com um produto de
 * verdade da loja, o desconto que está nos ajustes e o sair da lista de quem
 * pediu. O cupom (`VOLTA-EXEMPLO`), o Pix e o número do pedido são de
 * mentira, e o link de voltar abre um carrinho que não existe (vai pra home).
 */

export const TOQUES_DOS_FLUXOS: readonly IdDoToque[] = IDS_DOS_FLUXOS.flatMap((id) =>
  FLUXOS[id].toques.map((t) => t.id)
)

export async function exemploDoToque(
  container: MedusaContainer,
  membro: { email: string; nome: string },
  toque: IdDoToque,
  agora = new Date()
): Promise<EmailDoCrm | null> {
  const loja = urlDaLoja()
  if (!loja) return null
  const [produtos, whatsapp, lojas] = await Promise.all([
    produtosDosExemplos(container),
    whatsappDaLoja(container),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const metadata = lojas[0]?.metadata
  const { empresa } = lerConfiguracoes(metadata)
  const { desconto } = lerConfigDosFluxos(metadata)
  const fator = produtos.get("fator-de-crescimento-para-barba") ?? [...produtos.values()][0]
  const compra: CompraDoFluxo = {
    toque,
    para: membro.email,
    nome: membro.nome.trim().split(/\s+/)[0] || null,
    itens: fator ? [{ ...fator, quantidade: 1 }] : [],
    numero: toque.startsWith("pix") ? 3312 : null,
    pix:
      toque === "pix-vence"
        ? {
            codigo:
              "00020126580014br.gov.bcb.pix0136exemplo-do-painel-nao-paga5204000053039865802BR",
            imagem: null,
            vence: new Date(agora.getTime() + 15 * 60 * 1000),
          }
        : null,
    cupom:
      toque.endsWith("24h") || toque.endsWith("48h")
        ? {
            codigo: "VOLTA-EXEMPLO",
            porcento: desconto,
            ate: new Date(agora.getTime() + 2 * 24 * 60 * 60 * 1000),
          }
        : null,
    voltar: linkDeVoltar(`cart_${"0".repeat(26)}`, agora),
    sair: linksDeSair(loja, membro.email),
    loja: { url: loja, whatsapp, empresa: empresa.razaoSocial, cnpj: empresa.cnpj },
  }
  return emailDoFluxo(compra)
}
