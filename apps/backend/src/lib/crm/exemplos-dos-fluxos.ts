import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { whatsappDaLoja } from "../atendimento"
import { lerConfiguracoes } from "../configuracoes"
import {
  emailDaPrimeiraCompra,
  emailDaTrilha,
  PRODUTOS_DAS_TRILHAS,
  type TrilhaDoEmail,
} from "../emails/boas-vindas"
import { emailDoFluxo, type CompraDoFluxo } from "../emails/fluxos"
import type { EmailDoCrm } from "../emails/crm"
import { emailDaEstreia } from "../emails/estreia"
import { emailDaJornada } from "../emails/jornada"
import { emailDaNavegacao } from "../emails/navegacao"
import { emailDaReposicao } from "../emails/reposicao"
import { emailDoResgate } from "../emails/resgate"
import { urlDaLoja } from "../emails/moldura"
import {
  CURTO_DO_COMPONENTE,
  produtosPorSku,
  SEGMENTOS_COM_CUPOM,
  type SegmentoDaEstreia,
} from "./estreia"
import { produtosDosExemplos } from "./exemplos-dos-emails"
import { indiqueDoCodigo } from "./indicacao"
import {
  FLUXOS,
  IDS_DOS_FLUXOS,
  lerConfigDosFluxos,
  ehToqueDaEstreia,
  ehToqueDaJornada,
  ehToqueDaNavegacao,
  ehToqueDaReposicao,
  ehToqueDoResgate,
  ehToqueDasBoasVindas,
  DESCONTO_DO_RESGATE,
  PREFIXO_DO_CUPOM,
  PREFIXO_DO_CUPOM_DE_BOAS_VINDAS,
  PREFIXO_DO_CUPOM_DO_BROTHER,
  validadeDoCupom,
  type IdDoToque,
  type IdDoToqueDaEstreia,
  type IdDoToqueDaJornada,
  type IdDoToqueDaNavegacao,
  type IdDoToqueDaReposicao,
  type IdDoToqueDoResgate,
} from "./fluxos"
import { linksDoCheckin } from "./checkin"
import { SKU_DA_ROTINA } from "./jornada"
import { sugestoesDaNavegacao } from "./navegacao"
import { SUBIR_PARA } from "./reposicao"
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
 * nunca comprou), com o Fator como a última compra. Os da reposição, com o
 * Fator acabando; o "Refazer o pedido" abre um pedido que não existe (vai
 * pra home). Os da navegação abandonada, de quem olhou o Fator.
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
  if (ehToqueDaReposicao(toque)) return exemplosDaReposicao(container, membro, toque, agora)
  if (ehToqueDaJornada(toque)) return exemplosDaJornada(container, membro, toque)
  if (ehToqueDaNavegacao(toque)) return exemplosDaNavegacao(container, membro, toque)
  if (ehToqueDoResgate(toque)) return exemplosDoResgate(container, membro, toque, agora)
  const exemplo = await exemploDoToque(container, membro, toque, agora)
  return exemplo ? [exemplo] : []
}

/**
 * A navegação de quem olhou o Fator: as avaliações aprovadas dele (sem
 * nenhuma, uma de exemplo, como no carrinho) e as dúvidas da página; no de 24
 * horas, a rotina de quem ainda não tem nada.
 */
async function exemplosDaNavegacao(
  container: MedusaContainer,
  membro: { email: string; nome: string },
  toque: IdDoToqueDaNavegacao
): Promise<EmailDoCrm[]> {
  const loja = urlDaLoja()
  if (!loja) return []
  const sugestoes = sugestoesDaNavegacao(PRODUTOS_DAS_TRILHAS.fator, new Set())
  const [{ conteudos, depoimentos }, porSku, whatsapp, lojas] = await Promise.all([
    conteudosDasTrilhas(container, []),
    produtosPorSku(container, sugestoes),
    whatsappDaLoja(container),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const { empresa, atendimento } = lerConfiguracoes(lojas[0]?.metadata)
  const email = emailDaNavegacao({
    toque,
    para: membro.email,
    nome: membro.nome,
    produto: conteudos.get(PRODUTOS_DAS_TRILHAS.fator) ?? null,
    depoimentos: depoimentos.length
      ? depoimentos
      : [
          {
            texto: "Exemplo de avaliação: no e-mail de verdade entram as aprovadas no painel.",
            quem: "Cliente de exemplo",
            estrelas: 5,
          },
        ],
    sugestoes: sugestoes.flatMap((s) => porSku.get(s) ?? []),
    sair: linksDeSair(loja, membro.email),
    loja: {
      url: loja,
      whatsapp,
      empresa: empresa.razaoSocial,
      cnpj: empresa.cnpj,
      atendimento: atendimento.email,
    },
  })
  return email ? [email] : []
}

async function exemplosDaJornada(
  container: MedusaContainer,
  membro: { email: string; nome: string },
  toque: IdDoToqueDaJornada
): Promise<EmailDoCrm[]> {
  const loja = urlDaLoja()
  if (!loja) return []
  const [{ conteudos }, porSku, whatsapp, lojas] = await Promise.all([
    conteudosDasTrilhas(container, []),
    produtosPorSku(container, [SKU_DA_ROTINA.oleo, SKU_DA_ROTINA.tresFatores]),
    whatsappDaLoja(container),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const { empresa, atendimento } = lerConfiguracoes(lojas[0]?.metadata)
  const fator = conteudos.get(PRODUTOS_DAS_TRILHAS.fator) ?? null
  const nomeDe = (handle: string) => {
    const c = conteudos.get(handle)
    return c ? `${c.artigo} ${c.curto}` : null
  }
  // O convite do indique vai em três jeitos, um por linha do pedido (0217): o Fator, o óleo
  // (a barba) e a pasta (o cabelo). Os outros dias, um e-mail só.
  const linhas: { trilha?: TrilhaDoEmail; produto?: string | null }[] =
    toque === "jornada-indique"
      ? [
          { trilha: "crescimento", produto: nomeDe(PRODUTOS_DAS_TRILHAS.fator) },
          { trilha: "cuidado", produto: nomeDe(PRODUTOS_DAS_TRILHAS.oleo) },
          { trilha: "cabelo", produto: nomeDe(PRODUTOS_DAS_TRILHAS.matte) },
        ]
      : [{}]
  return linhas.flatMap(({ trilha, produto }) => {
    const email = emailDaJornada({
      toque,
      trilha,
      produtoDoIndique: produto ?? null,
      para: membro.email,
      nome: membro.nome,
      numero: 3312,
      principal: fator,
      fator,
      sugestoes: [SKU_DA_ROTINA.oleo, SKU_DA_ROTINA.tresFatores].flatMap(
        (s) => porSku.get(s) ?? []
      ),
      // Um pedido que não existe: o clique anota nada e cai na home.
      checkin: toque === "jornada-7d" ? linksDoCheckin(`order_${"0".repeat(26)}`) : null,
      // O link de mentira: o cupom `BROTHER-EXEMPLO` não existe, e o link cai na home sem nada.
      indique:
        toque === "jornada-indique" || toque === "jornada-indique-30d"
          ? indiqueDoCodigo(loja, `${PREFIXO_DO_CUPOM_DO_BROTHER}EXEMPLO`)
          : null,
      sair: linksDeSair(loja, membro.email),
      loja: {
        url: loja,
        whatsapp,
        empresa: empresa.razaoSocial,
        cnpj: empresa.cnpj,
        atendimento: atendimento.email,
      },
    })
    return email ? [email] : []
  })
}

/**
 * O resgate com o Fator como a última compra. Os botões (a pergunta e o
 * "Sim") vão pra loja, sem anotar nada — um "Tá caro" de mentira criaria um
 * cupom de verdade —, e o cupom `VOLTA-EXEMPLO` não existe.
 */
async function exemplosDoResgate(
  container: MedusaContainer,
  membro: { email: string; nome: string },
  toque: IdDoToqueDoResgate,
  agora: Date
): Promise<EmailDoCrm[]> {
  const loja = urlDaLoja()
  if (!loja) return []
  const [produtos, whatsapp, lojas] = await Promise.all([
    produtosDosExemplos(container),
    whatsappDaLoja(container),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const { empresa, atendimento } = lerConfiguracoes(lojas[0]?.metadata)
  const fator = produtos.get("fator-de-crescimento-para-barba") ?? null
  const naLoja = `${loja}/`
  const email = emailDoResgate({
    toque,
    para: membro.email,
    nome: membro.nome,
    acabou: CURTO_DO_COMPONENTE.fator,
    produtos: fator ? [fator] : [],
    botoes: { caro: naLoja, esqueci: naLoja, resultado: naLoja, outro: naLoja },
    sim: naLoja,
    cupom: {
      codigo: `${PREFIXO_DO_CUPOM}EXEMPLO`,
      porcento: DESCONTO_DO_RESGATE,
      ate: new Date(agora.getTime() + (toque === "resgate-9d" ? 1 : 3) * 24 * 60 * 60 * 1000),
    },
    voltar: `/voltar/${linkDeVoltar(`repor-order_${"0".repeat(26)}`, agora)}`,
    sair: linksDeSair(loja, membro.email),
    loja: {
      url: loja,
      whatsapp,
      empresa: empresa.razaoSocial,
      cnpj: empresa.cnpj,
      atendimento: atendimento.email,
    },
  })
  return email ? [email] : []
}

async function exemplosDaReposicao(
  container: MedusaContainer,
  membro: { email: string; nome: string },
  toque: IdDoToqueDaReposicao,
  agora: Date
): Promise<EmailDoCrm[]> {
  const loja = urlDaLoja()
  if (!loja) return []
  const [produtos, subir, whatsapp, lojas] = await Promise.all([
    produtosDosExemplos(container),
    produtosPorSku(container, [SUBIR_PARA.fator ?? ""]),
    whatsappDaLoja(container),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const { empresa, atendimento } = lerConfiguracoes(lojas[0]?.metadata)
  const fator = produtos.get("fator-de-crescimento-para-barba") ?? null
  return [
    emailDaReposicao({
      toque,
      para: membro.email,
      nome: membro.nome,
      acabando: CURTO_DO_COMPONENTE.fator,
      produtos: fator ? [fator] : [],
      subirPara: subir.get(SUBIR_PARA.fator ?? "") ?? null,
      voltar: `/voltar/${linkDeVoltar(`repor-order_${"0".repeat(26)}`, agora)}`,
      sair: linksDeSair(loja, membro.email),
      loja: {
        url: loja,
        whatsapp,
        empresa: empresa.razaoSocial,
        cnpj: empresa.cnpj,
        atendimento: atendimento.email,
      },
    }),
  ]
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
  toque: Exclude<
    IdDoToque,
    | IdDoToqueDaEstreia
    | IdDoToqueDaReposicao
    | IdDoToqueDaJornada
    | IdDoToqueDoResgate
    | IdDoToqueDaNavegacao
  >,
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
