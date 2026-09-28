import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { normalizarEmail } from "../../modules/codigo/regras"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import { precosDasVariantes } from "../avise-me"
import type { ProdutoDoCrm } from "../emails/crm"
import { pedidoDaBase, pedidoDaPessoa } from "../painel/crm"
import { pedidosParaAsEtiquetas } from "../painel/ler"
import { lerAjustesGuardados } from "./ajustes"
import {
  componentesDoItem,
  etiquetasDaPessoa,
  quandoAcaba,
  type Componente,
  type Etiquetas,
  type PedidoDaPessoa,
} from "./etiquetas"
import { juntar } from "./nuvemshop"

/**
 * A ESTREIA DA LOJA NOVA (entrega 0181) — a campanha pra base da Nuvemshop:
 * um e-mail pra cada pessoa que aceitou ofertas na loja antiga, e o "vence
 * amanhã" de quem ganhou cupom. Quem manda é o motor (`lib/crm/motor.ts`),
 * como um fluxo que começa DESLIGADO (`FLUXOS.estreia`): o dono liga no
 * painel quando a loja antiga sair do ar.
 *
 * QUEM ENTRA: a base que aceita ofertas (`crm.pessoasDaEstreia`), menos quem
 * já comprou na loja nova — esse já sabe. O motor tira ainda a equipe, quem
 * saiu da lista e o e-mail que voltou, como em todo fluxo, e 5% ficam no
 * grupo de controle.
 *
 * OS 4 JEITOS DO E-MAIL (`segmentoDaEstreia`), pelas etiquetas do CRM com os
 * Ajustes (quanto dura cada produto, a tolerância da reposição):
 *   - "repor": o dia de comprar de novo chega em até 14 dias (ou passou há
 *     pouco, sem ainda estar em risco) — o que acaba e a loja nova;
 *   - "cliente": comprou e está no meio do tratamento — a loja nova;
 *   - "sumido": em risco ou sunset (passou da tolerância) — a loja nova e um
 *     cupom (`VOLTA-`);
 *   - "lead": nunca comprou — a loja nova e o cupom da 1ª compra
 *     (`BEMVINDO-`, só na primeira).
 * O cupom é de quem precisa de empurrão (escolha do dono, 28/09): o % dos
 * fluxos, 3 dias, e no máximo um a cada 60 dias pro mesmo e-mail.
 *
 * OS LOTES: o remetente das ofertas é novo, e mandar tudo num dia só pode
 * jogar a loja no spam. A fila (`filaDaEstreia`) põe primeiro quem está na
 * hora de repor e quem comprou há pouco; os 200 primeiros saem quando o dono
 * liga, os 400 seguintes no outro dia, depois 800, e o resto no 4º dia —
 * sempre às 10h de Brasília (`comecoDoLote`).
 *
 * As partes puras (o jeito, a fila, o lote, a hora) têm testes.
 */

const HORA = 60 * 60 * 1000
const DIA = 24 * HORA

export type SegmentoDaEstreia = "repor" | "cliente" | "sumido" | "lead"

/** Quem ganha cupom: quem nunca comprou e quem sumiu. */
export const SEGMENTOS_COM_CUPOM: readonly SegmentoDaEstreia[] = ["lead", "sumido"]

/** "Na hora de repor": o dia de comprar de novo cai até tantos dias pra frente. */
export const DIAS_PRA_REPOR = 14

/** O nome curto de cada tipo, com o artigo: "Seu Fator de Crescimento deve estar acabando". */
export const CURTO_DO_COMPONENTE: Record<Componente, { curto: string; artigo: "o" | "a" }> = {
  fator: { curto: "Fator de Crescimento", artigo: "o" },
  oleo: { curto: "óleo", artigo: "o" },
  shampoo: { curto: "shampoo", artigo: "o" },
  balm: { curto: "balm", artigo: "o" },
  spray: { curto: "spray modelador", artigo: "o" },
  pasta: { curto: "pasta modeladora", artigo: "a" },
}

/** Quantos em cada lote: o 1º dia, o 2º, o 3º — e o resto no 4º. */
export const LOTES = [200, 400, 800] as const

/** A hora dos lotes do 2º dia em diante, em Brasília. */
export const HORA_DOS_LOTES = 10

/** Brasília não tem mais horário de verão (desde 2019): 3 horas atrás de Greenwich. */
const FUSO = -3 * HORA

/** O jeito do e-mail de cada pessoa, pelas etiquetas (sem compra: nunca comprou). */
export function segmentoDaEstreia(e: Etiquetas | null, agora: Date): SegmentoDaEstreia {
  if (!e || e.etapa.valor === "lead") return "lead"
  if (e.etapa.valor === "em-risco" || e.etapa.valor === "sunset") return "sumido"
  const quando = e.proximaCompra.em
  if (quando && quando.getTime() <= agora.getTime() + DIAS_PRA_REPOR * DIA) return "repor"
  return "cliente"
}

const ORDEM: Record<SegmentoDaEstreia, number> = { repor: 0, cliente: 1, sumido: 2, lead: 3 }

/**
 * A fila: na hora de repor, quem está no tratamento, quem sumiu, quem nunca
 * comprou — e, em cada um, o mais recente antes (a última compra, ou o
 * cadastro). Quem comprou recebe antes de quem nunca comprou: o e-mail dele
 * já recebeu pedido da loja, e é o que menos volta.
 */
export function filaDaEstreia<
  T extends { email: string; segmento: SegmentoDaEstreia; recente: Date | null },
>(pessoas: readonly T[]): T[] {
  return [...pessoas].sort(
    (a, b) =>
      ORDEM[a.segmento] - ORDEM[b.segmento] ||
      (b.recente?.getTime() ?? 0) - (a.recente?.getTime() ?? 0) ||
      (a.email < b.email ? -1 : a.email > b.email ? 1 : 0)
  )
}

/** O lote da posição na fila (a partir de 0): 0, 1, 2 — e 3 pro resto. */
export function loteDaPosicao(posicao: number): number {
  let ate = 0
  for (let lote = 0; lote < LOTES.length; lote++) {
    ate += LOTES[lote]
    if (posicao < ate) return lote
  }
  return LOTES.length
}

/**
 * Quando o lote começa. O 1º, na hora em que o dono ligou (de madrugada, o
 * motor espera as 8h); os outros, às 10h de Brasília dos dias seguintes —
 * contados do dia em que o 1º sai.
 */
export function comecoDoLote(desde: Date, lote: number): Date {
  if (lote <= 0) return desde
  const local = new Date(desde.getTime() + FUSO)
  // Ligado de madrugada (22h às 8h), o 1º lote sai às 8h: é desse dia que se conta.
  const primeiroDia = local.getUTCHours() >= 22 ? 1 : 0
  return new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + primeiroDia + lote,
      HORA_DOS_LOTES
    ) - FUSO
  )
}

/** Até quando a estreia ainda tem e-mail por sair: o último lote, os 2 dias do lembrete e mais um. */
export function fimDaEstreia(desde: Date): Date {
  return new Date(comecoDoLote(desde, LOTES.length).getTime() + 4 * DIA)
}

/* ── quem é quem na base ─────────────────────────────────────────────────── */

export type PessoaDaEstreia = {
  email: string
  nome: string | null
  segmento: SegmentoDaEstreia
  /** A compra paga mais recente, ou o cadastro de quem nunca comprou: a ordem da fila. */
  recente: Date | null
  /** Os SKUs da última compra, na ordem do pedido: os produtos do e-mail. */
  skus: string[]
  /** O que acaba primeiro, da última compra — só de quem está na hora de repor. */
  acabando: { componente: Componente; sku: string | null } | null
  /** O lote (0 a 3), pela posição na fila. */
  lote: number
}

export type PublicoDaEstreia = {
  /** Na ordem da fila. */
  fila: PessoaDaEstreia[]
  segmentos: Record<SegmentoDaEstreia, number>
  /** Quem aceita ofertas e ficou de fora por já ter comprado na loja nova. */
  jaCompraram: number
}

const pago = (p: PedidoDaPessoa) => Boolean(p.pagoEm) && !p.cancelado

/** O que acaba primeiro no pedido, e o SKU do item que traz (o botão "Repor" leva pra ele). */
function oQueAcaba(p: PedidoDaPessoa, dias: Record<Componente, number>) {
  const acaba = quandoAcaba(p, p.pagoEm ?? new Date(0), dias)
  if (!acaba) return null
  const item = p.itens.find((i) =>
    componentesDoItem(i).some((c) => c.componente === acaba.componente)
  )
  return { componente: acaba.componente, sku: item?.sku?.trim().toUpperCase() || null }
}

/**
 * O PÚBLICO DA ESTREIA, agora: cada pessoa da base que aceita ofertas (menos
 * quem já comprou na loja nova), o jeito do e-mail dela e o lote.
 */
export async function publicoDaEstreia(
  container: MedusaContainer,
  agora: Date = new Date()
): Promise<PublicoDaEstreia> {
  const crm = container.resolve<CrmService>(CRM)
  const [pessoas, daBase, daLoja, sinais, lojas] = await Promise.all([
    crm.pessoasDaEstreia(),
    crm.pedidosDaBase(),
    pedidosParaAsEtiquetas(container),
    crm.sinaisDeTodos(),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const { dias, regras } = lerAjustesGuardados(lojas[0]?.metadata)
  const compraramNaLoja = new Set(
    daLoja.flatMap((o) => {
      const email = normalizarEmail(o.email)
      return email && pago(pedidoDaPessoa(o)) ? [email] : []
    })
  )
  const pedidos = new Map<string, PedidoDaPessoa[]>()
  for (const p of daBase) juntar(pedidos, p.email, pedidoDaBase(p))

  let jaCompraram = 0
  const semLote: Omit<PessoaDaEstreia, "lote">[] = []
  for (const pessoa of pessoas) {
    if (compraramNaLoja.has(pessoa.email)) {
      jaCompraram++
      continue
    }
    const dela = pedidos.get(pessoa.email) ?? []
    const pagos = dela.filter(pago).sort((a, b) => a.pagoEm!.getTime() - b.pagoEm!.getTime())
    const ultimo = pagos.at(-1) ?? null
    const s = sinais.get(pessoa.email)
    const etiquetas = ultimo
      ? etiquetasDaPessoa({
          pedidos: dela,
          sinais: {
            ultimoClique: s?.ultimoClique ?? null,
            ultimaVisita: s?.ultimaVisita ?? null,
            newsletterDesde: null,
          },
          agora,
          dias,
          regras,
        })
      : null
    const segmento = segmentoDaEstreia(etiquetas, agora)
    semLote.push({
      email: pessoa.email,
      nome: pessoa.nome,
      segmento,
      recente: ultimo?.pagoEm ?? (pessoa.desde ? new Date(pessoa.desde) : null),
      skus: [
        ...new Set(
          (ultimo?.itens ?? []).flatMap((i) => (i.sku ? [i.sku.trim().toUpperCase()] : []))
        ),
      ],
      acabando: segmento === "repor" && ultimo ? oQueAcaba(ultimo, dias) : null,
    })
  }
  const fila = filaDaEstreia(semLote).map((p, i) => ({ ...p, lote: loteDaPosicao(i) }))
  const segmentos: Record<SegmentoDaEstreia, number> = { repor: 0, cliente: 0, sumido: 0, lead: 0 }
  for (const p of fila) segmentos[p.segmento]++
  return { fila, segmentos, jaCompraram }
}

/**
 * Os produtos da loja nova destes SKUs (o código do Bling, o mesmo da
 * Nuvemshop): o do produto publicado que tem a variante, com o preço dela.
 */
export async function produtosPorSku(
  container: MedusaContainer,
  skus: readonly string[]
): Promise<Map<string, ProdutoDoCrm>> {
  if (!skus.length) return new Map()
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product_variant",
    fields: ["id", "sku", "product.title", "product.handle", "product.thumbnail", "product.status"],
    filters: { sku: [...skus] },
  })
  const variantes = (
    data as {
      id: string
      sku?: string | null
      product?: {
        title?: string | null
        handle?: string | null
        thumbnail?: string | null
        status?: string | null
      } | null
    }[]
  ).filter((v) => v.sku && v.product?.handle && v.product.status === "published")
  const precos = await precosDasVariantes(
    container,
    variantes.map((v) => v.id)
  )
  return new Map(
    variantes.map((v) => {
      const preco = precos.get(v.id)
      return [
        v.sku!.trim().toUpperCase(),
        {
          nome: (v.product!.title ?? "").trim() || v.product!.handle!,
          handle: v.product!.handle!,
          imagem: v.product!.thumbnail ?? null,
          preco: preco?.preco ?? null,
          precoCheio: preco?.precoCheio ?? null,
        },
      ]
    })
  )
}
