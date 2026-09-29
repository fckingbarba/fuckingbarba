import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { randomInt } from "node:crypto"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import { promocaoDoCupom, type CupomNovo } from "../cupons"
import type { IndiqueDoEmail } from "../emails/indicacao"
import { codigoDoCupom } from "./cupom"
import { PREFIXO_DO_CUPOM_DO_BROTHER, TOQUE_DO_PREMIO } from "./fluxos"

/**
 * O INDIQUE UM BROTHER (entrega 0215, a etapa 4 do "Ciclo da Barba") — cada
 * cliente ganha um link; quem compra pela 1ª vez com ele ganha 15%, e quem
 * indicou ganha um cupom de 15% quando o brother paga. As escolhas do dono
 * (29/09):
 *
 *   - O BROTHER: 15% na 1ª compra, só pra quem nunca comprou na loja nova (a
 *     mesma "primeira compra" dos cupons do painel e do pop-up), uma vez por
 *     pessoa. O link é um cupom do Medusa (`BROTHER-7KQ2MX`, `cupomDoAmigo`),
 *     sem data pra acabar e sem limite de usos: vale pra quantos brothers a
 *     pessoa indicar;
 *   - QUEM INDICA: um cupom de 15% na próxima compra, só dele, que vale 60
 *     dias (`VALEU-7KQ2MX`), até 10 por ano. Sai quando o BROTHER PAGA — o Pix
 *     pago ou o cartão aprovado (`lib/crm/premio-da-indicacao.ts`);
 *   - O CONVITE vai na jornada do resultado, pra quem está gostando: 10 dias
 *     depois que o pedido chega, se a pessoa respondeu "Tá indo bem" no
 *     check-in, deu 4 ou 5 estrelas pro pedido, ou é a 2ª compra dela. Um
 *     lembrete 30 dias depois, se nenhum brother comprou. E o link fica em
 *     Minha conta, pra todo cliente (`indicacaoDaConta`).
 *
 * O link nasce uma vez por e-mail (`garantirIndicador`, na trava do e-mail):
 * no primeiro convite, ou quando a pessoa pede em Minha conta.
 */

const DIA = 24 * 60 * 60 * 1000

/** Quanto o brother ganha na 1ª compra, em %. */
export const PORCENTO_DO_AMIGO = 15
/** Quanto quem indicou ganha, em %, quando o brother paga. */
export const PORCENTO_DO_PREMIO = 15
/** Quanto o cupom de quem indicou vale. */
export const VALIDADE_DO_PREMIO = 60 * DIA
/** Quantos prêmios uma pessoa ganha em 12 meses. */
export const PREMIOS_POR_ANO = 10

/** O nome das promoções no Medusa: o link e o prêmio. */
export const CAMPANHA_DA_INDICACAO = "CRM (indicação)"

/**
 * O CUPOM DO LINK: 15% na loja toda, só na 1ª compra, uma vez por pessoa (pelo
 * e-mail), sem data e sem limite de usos. Soma com o preço promocional, como
 * os cupons dos fluxos.
 */
export function cupomDoAmigo(codigo: string): CupomNovo {
  return {
    codigo,
    tipo: "porcento",
    valor: PORCENTO_DO_AMIGO,
    soMaisBarato: false,
    aplicarA: "loja",
    alvos: [],
    combina: true,
    limite: null,
    porCliente: 1,
    primeiraCompra: true,
    de: null,
    ate: null,
    minimo: null,
  }
}

/** O link que o brother abre: a loja guarda o cupom e ele entra na sacola (`/discount/…`). */
export const linkDoIndique = (loja: string, codigo: string) =>
  `${loja}/discount/${encodeURIComponent(codigo)}`

/** A mensagem pronta do "Mandar no WhatsApp". */
export const mensagemDoWhatsApp = (link: string) =>
  `Brother, usa o meu link na FuckingBarba e ganha ${PORCENTO_DO_AMIGO}% na primeira compra: ${link}`

/** A conversa do WhatsApp com a mensagem pronta: a pessoa escolhe pra quem mandar. */
export const linkDoWhatsApp = (link: string) =>
  `https://wa.me/?text=${encodeURIComponent(mensagemDoWhatsApp(link))}`

/** O link, a mensagem e os % — o que o e-mail e a conta mostram. */
export function indiqueDoCodigo(loja: string, codigo: string): IndiqueDoEmail {
  const link = linkDoIndique(loja, codigo)
  return {
    codigo,
    link,
    whatsapp: linkDoWhatsApp(link),
    porcentoDoAmigo: PORCENTO_DO_AMIGO,
    porcentoDoPremio: PORCENTO_DO_PREMIO,
  }
}

/** O código de brother usado no pedido, se tem (os ajustes dos itens e do frete). */
export function codigoDoBrother(codigos: readonly (string | null | undefined)[]): string | null {
  for (const c of codigos) {
    const codigo = (c ?? "").trim().toUpperCase()
    if (codigo.startsWith(PREFIXO_DO_CUPOM_DO_BROTHER)) return codigo
  }
  return null
}

export type SemPremio = "ele-mesmo" | "teto-do-ano"

/**
 * Por que quem indicou NÃO ganha o prêmio desta compra — ou nulo, se ganha:
 * o brother é ele mesmo, ou ele já ganhou os 10 do ano.
 */
export function semPremio(p: {
  indicador: string
  amigo: string
  premiosNoAno: number
}): SemPremio | null {
  if (p.indicador.trim().toLowerCase() === p.amigo.trim().toLowerCase()) return "ele-mesmo"
  if (p.premiosNoAno >= PREMIOS_POR_ANO) return "teto-do-ano"
  return null
}

/* ── o banco ──────────────────────────────────────────────────────────────── */

type IndicadorDoBanco = { id: string; email: string; codigo: string; promocao_id: string }

/** O link desta pessoa, se ela já tem. */
export async function indicadorDoEmail(
  container: MedusaContainer,
  email: string
): Promise<IndicadorDoBanco | null> {
  const crm = container.resolve<CrmService>(CRM)
  const [achado] = (await crm.listIndicadores({ email }, { take: 1 })) as IndicadorDoBanco[]
  return achado ?? null
}

/** Quem é dono deste código de brother. */
export async function indicadorDoCodigo(
  container: MedusaContainer,
  codigo: string
): Promise<IndicadorDoBanco | null> {
  const crm = container.resolve<CrmService>(CRM)
  const [achado] = (await crm.listIndicadores(
    { codigo: codigo.trim().toUpperCase() },
    { take: 1 }
  )) as IndicadorDoBanco[]
  return achado ?? null
}

/**
 * O LINK DESTA PESSOA — o de sempre, ou um novo: o cupom no Medusa e a linha
 * de quem indica. Na trava do e-mail: o convite e o "Pegar meu link" juntos
 * não criam dois. Código repetido (1 em 800 milhões): tenta outro.
 */
export async function garantirIndicador(
  container: MedusaContainer,
  email: string,
  agora: Date = new Date()
): Promise<IndicadorDoBanco> {
  const antes = await indicadorDoEmail(container, email)
  if (antes) return antes
  return container.resolve(Modules.LOCKING).execute(
    `indicador:${email}`,
    async () => {
      const deNovo = await indicadorDoEmail(container, email)
      if (deNovo) return deNovo
      let erro: unknown = null
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        const codigo = codigoDoCupom(randomInt, PREFIXO_DO_CUPOM_DO_BROTHER)
        try {
          const { result } = await createPromotionsWorkflow(container).run({
            input: {
              promotionsData: [
                promocaoDoCupom(cupomDoAmigo(codigo), CAMPANHA_DA_INDICACAO, agora),
              ] as never,
            },
          })
          const promocao = (result as { id: string }[])[0].id
          const crm = container.resolve<CrmService>(CRM)
          return (await crm.createIndicadores({
            email,
            codigo,
            promocao_id: promocao,
          })) as IndicadorDoBanco
        } catch (e) {
          erro = e
        }
      }
      throw erro
    },
    { timeout: 20 }
  )
}

export type IndicacaoDaConta = {
  /** O link, se a pessoa já tem (sem ele, a conta mostra o "Pegar meu link"). */
  indique: IndiqueDoEmail | null
  porcentoDoAmigo: number
  porcentoDoPremio: number
  /** Quantos brothers já pagaram a 1ª compra com o link. */
  amigos: number
  /** Os cupons que a pessoa ganhou, do mais novo pro mais velho. */
  cupons: { codigo: string; ate: string; usado: boolean }[]
}

/**
 * O QUE MINHA CONTA MOSTRA (`GET /store/crm/indicacao`): o link, quantos
 * brothers compraram com ele e os cupons que a pessoa ganhou — o brother não
 * aparece. `criar`: o "Pegar meu link" (`POST`).
 */
export async function indicacaoDaConta(
  container: MedusaContainer,
  email: string,
  { loja, criar = false, agora = new Date() }: { loja: string; criar?: boolean; agora?: Date }
): Promise<IndicacaoDaConta> {
  const indicador = criar
    ? await garantirIndicador(container, email, agora)
    : await indicadorDoEmail(container, email)
  const crm = container.resolve<CrmService>(CRM)
  const premios = indicador
    ? (await crm.registrosDosFluxos(new Date(0), [email])).filter(
        (r) => r.fluxo === "indicacao" && r.toque === TOQUE_DO_PREMIO
      )
    : []
  const comCupom = premios
    .filter((r): r is typeof r & { cupom: string } => Boolean(r.cupom))
    .sort((a, b) => new Date(b.em).getTime() - new Date(a.em).getTime())
  const usados = comCupom.length
    ? ((await container
        .resolve(Modules.PROMOTION)
        .listPromotions(
          { code: comCupom.map((r) => r.cupom) },
          { select: ["code", "used"], take: comCupom.length }
        )) as { code?: string | null; used?: number | null }[])
    : []
  const usado = new Set(usados.filter((p) => Number(p.used) > 0).map((p) => p.code))
  return {
    indique: indicador ? indiqueDoCodigo(loja, indicador.codigo) : null,
    porcentoDoAmigo: PORCENTO_DO_AMIGO,
    porcentoDoPremio: PORCENTO_DO_PREMIO,
    amigos: premios.length,
    cupons: comCupom.map((r) => ({
      codigo: r.cupom,
      ate: new Date(r.cupom_ate ?? r.em).toISOString(),
      usado: usado.has(r.cupom),
    })),
  }
}
