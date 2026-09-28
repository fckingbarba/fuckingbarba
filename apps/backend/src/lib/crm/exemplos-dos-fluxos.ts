import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { whatsappDaLoja } from "../atendimento"
import { lerConfiguracoes } from "../configuracoes"
import { emailDaPrimeiraCompra, emailDaTrilha } from "../emails/boas-vindas"
import { emailDoFluxo, type CompraDoFluxo } from "../emails/fluxos"
import type { EmailDoCrm } from "../emails/crm"
import { emailDaEstreia } from "../emails/estreia"
import { urlDaLoja } from "../emails/moldura"
import { CURTO_DO_COMPONENTE, SEGMENTOS_COM_CUPOM, type SegmentoDaEstreia } from "./estreia"
import { produtosDosExemplos } from "./exemplos-dos-emails"
import {
  FLUXOS,
  IDS_DOS_FLUXOS,
  lerConfigDosFluxos,
  ehToqueDaEstreia,
  ehToqueDasBoasVindas,
  PREFIXO_DO_CUPOM,
  PREFIXO_DO_CUPOM_DE_BOAS_VINDAS,
  validadeDoCupom,
  type IdDoToque,
  type IdDoToqueDaEstreia,
} from "./fluxos"
import { conteudosDasTrilhas } from "./boas-vindas"
import { produtosDoEmail, TITULO_DA_TRILHA } from "./primeira-compra"
import { linksDeSair } from "./sair"
import { linkDeVoltar } from "./voltar"

/**
 * O "MANDAR PRA MIM" DOS FLUXOS — cada toque do Pix pendente, do checkout
 * abandonado e do carrinho abandonado, montado como sairia
 * (`lib/emails/fluxos.ts`), com um produto de verdade da loja, o desconto que
 * está nos ajustes e o sair da lista de quem pediu. O cupom (`VOLTA-EXEMPLO`),
 * o Pix, o número do pedido e a avaliação são de mentira, e o link de voltar
 * abre um carrinho que não existe (vai pra home). O das boas-vindas é o
 * e-mail do cupom da 1ª compra (`lib/emails/boas-vindas.ts`), com os mais
 * pedidos e o cupom `BEMVINDO-EXEMPLO`, que não existe. Os da estreia vêm
 * nos 4 jeitos (quem está na hora de repor, no tratamento, quem sumiu, quem
 * nunca comprou), com o Fator como a última compra.
 */

export const TOQUES_DOS_FLUXOS: readonly IdDoToque[] = IDS_DOS_FLUXOS.flatMap((id) =>
  FLUXOS[id].toques.map((t) => t.id)
)

/** Os e-mails do "Mandar pra mim" deste toque: um, ou os jeitos da estreia. Vazio sem a loja. */
export async function exemplosDoToque(
  container: MedusaContainer,
  membro: { email: string; nome: string },
  toque: IdDoToque,
  agora = new Date()
): Promise<EmailDoCrm[]> {
  if (ehToqueDaEstreia(toque)) return exemplosDaEstreia(container, membro, toque, agora)
  const exemplo = await exemploDoToque(container, membro, toque, agora)
  return exemplo ? [exemplo] : []
}

async function exemplosDaEstreia(
  container: MedusaContainer,
  membro: { email: string; nome: string },
  toque: IdDoToqueDaEstreia,
  agora: Date
): Promise<EmailDoCrm[]> {
  const loja = urlDaLoja()
  if (!loja) return []
  const [produtos, whatsapp, lojas] = await Promise.all([
    produtosDosExemplos(container),
    whatsappDaLoja(container),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const metadata = lojas[0]?.metadata
  const { empresa, atendimento, frete } = lerConfiguracoes(metadata)
  const { desconto } = lerConfigDosFluxos(metadata)
  const fator = produtos.get("fator-de-crescimento-para-barba") ?? null
  // O de 2 dias lembra o cupom: só de quem sumiu e de quem nunca comprou.
  const jeitos: readonly SegmentoDaEstreia[] =
    toque === "estreia-2d" ? SEGMENTOS_COM_CUPOM : ["repor", "cliente", "sumido", "lead"]
  return jeitos.flatMap((segmento) => {
    const lead = segmento === "lead"
    const e = emailDaEstreia({
      toque,
      segmento,
      para: membro.email,
      nome: membro.nome,
      cupom: SEGMENTOS_COM_CUPOM.includes(segmento)
        ? {
            codigo: `${lead ? PREFIXO_DO_CUPOM_DE_BOAS_VINDAS : PREFIXO_DO_CUPOM}EXEMPLO`,
            porcento: desconto,
            ate: new Date(agora.getTime() + (toque === "estreia-2d" ? 1 : 3) * 24 * 60 * 60 * 1000),
          }
        : null,
      produtos: lead ? [...produtos.values()] : fator ? [fator] : [],
      acabando: segmento === "repor" ? { ...CURTO_DO_COMPONENTE.fator, produto: fator } : null,
      daLoja: {
        prazoDePostagem: atendimento.prazoDePostagem,
        freteGratisAcima: frete.modo === "gratis" ? frete.piso : null,
      },
      sair: linksDeSair(loja, membro.email),
      loja: {
        url: loja,
        whatsapp,
        empresa: empresa.razaoSocial,
        cnpj: empresa.cnpj,
        atendimento: atendimento.email,
      },
    })
    return e ? [e] : []
  })
}

export async function exemploDoToque(
  container: MedusaContainer,
  membro: { email: string; nome: string },
  toque: Exclude<IdDoToque, IdDoToqueDaEstreia>,
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
  const { empresa, atendimento, frete } = lerConfiguracoes(metadata)
  const { desconto } = lerConfigDosFluxos(metadata)
  const infoDaLoja = {
    url: loja,
    whatsapp,
    empresa: empresa.razaoSocial,
    cnpj: empresa.cnpj,
    atendimento: atendimento.email,
  }
  if (toque === "boas-vindas-agora")
    return emailDaPrimeiraCompra({
      para: membro.email,
      nome: membro.nome,
      cupom: {
        codigo: `${PREFIXO_DO_CUPOM_DE_BOAS_VINDAS}EXEMPLO`,
        porcento: desconto,
        ate: new Date(agora.getTime() + validadeDoCupom("boas-vindas")),
      },
      tituloDosProdutos: TITULO_DA_TRILHA.geral,
      produtos: [...produtos.values()],
      sair: linksDeSair(loja, membro.email),
      loja: infoDaLoja,
    })
  // A sequência das boas-vindas: o exemplo é a trilha de quem quer a barba crescendo.
  if (ehToqueDasBoasVindas(toque)) {
    const { conteudos, depoimentos } = await conteudosDasTrilhas(container, [])
    return emailDaTrilha({
      toque,
      trilha: "crescimento",
      para: membro.email,
      nome: membro.nome,
      cupom: {
        codigo: `${PREFIXO_DO_CUPOM_DE_BOAS_VINDAS}EXEMPLO`,
        porcento: desconto,
        ate: new Date(agora.getTime() + 24 * 60 * 60 * 1000),
      },
      conteudos,
      visto: null,
      produtos: produtosDoEmail("crescimento", null).flatMap((h) => {
        const c = conteudos.get(h)
        return c ? [c.produto] : []
      }),
      depoimentos,
      escolhas: null,
      daLoja: {
        prazoDePostagem: atendimento.prazoDePostagem,
        freteGratisAcima: frete.modo === "gratis" ? frete.piso : null,
      },
      sair: linksDeSair(loja, membro.email),
      loja: infoDaLoja,
    })
  }
  const fator = produtos.get("fator-de-crescimento-para-barba") ?? [...produtos.values()][0]
  const compra: CompraDoFluxo = {
    toque,
    para: membro.email,
    nome: membro.nome.trim().split(/\s+/)[0] || null,
    itens: fator ? [{ ...fator, quantidade: 1 }] : [],
    numero: toque.startsWith("pix") ? 3312 : null,
    depoimentos:
      toque === "carrinho-12h"
        ? [
            {
              texto: "Exemplo de avaliação: no e-mail de verdade entram as aprovadas no painel.",
              quem: "Cliente de exemplo",
              estrelas: 5,
            },
          ]
        : [],
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
      toque.endsWith("24h") ||
      toque === "checkout-48h" ||
      toque === "pix-48h" ||
      toque === "carrinho-3d"
        ? {
            codigo: "VOLTA-EXEMPLO",
            porcento: desconto,
            ate: new Date(
              agora.getTime() + (toque.startsWith("carrinho") ? 3 : 2) * 24 * 60 * 60 * 1000
            ),
          }
        : null,
    voltar: linkDeVoltar(`cart_${"0".repeat(26)}`, agora),
    sair: linksDeSair(loja, membro.email),
    loja: infoDaLoja,
  }
  return emailDoFluxo(compra)
}
