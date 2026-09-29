import type { Etiquetas, PedidoDaPessoa, RegrasDasEtiquetas } from "./etiquetas"
import { REGRAS_PADRAO } from "./etiquetas"

/**
 * A PREVISÃO POR CLIENTE (entrega 0220, a etapa 5 do "Ciclo da Barba": "a
 * máquina") — pra cada pessoa que comprou, nas duas lojas:
 *
 *   - A PRÓXIMA COMPRA: com 3 compras ou mais, pelo RITMO dela (a mediana
 *     dos intervalos entre as compras; compras a menos de 7 dias uma da
 *     outra contam como uma); com menos, pela etiqueta — o dia em que o
 *     produto da última compra acaba (os dias dos Ajustes);
 *   - A CHANCE DE SAIR: baixa antes do dia de comprar; média até a
 *     tolerância dos Ajustes (20 dias) depois dele; alta depois disso. Quem
 *     visitou ou clicou há pouco (o engajamento "quente") desce um nível; o
 *     sunset é sempre alta. Sem saber o dia, pelos dias sem comprar (a regra
 *     "sem previsão" dos Ajustes, 60 dias, e o dobro dela);
 *   - O LTV: o que a pessoa já gastou, e o previsto nos próximos 12 meses —
 *     o ticket médio vezes as compras que cabem no ano (pelo ritmo, pelo
 *     tempo do produto ou, sem nenhum, uma a cada 4 meses), vezes a chance
 *     de continuar (0,9 / 0,6 / 0,25, pela chance de sair).
 *
 * Tudo com o porquê em frase: é conta, não adivinhação — com pouco histórico,
 * a loja nova ainda aprende. Código puro, com testes.
 */

const DIA = 24 * 60 * 60 * 1000

/** Compras a menos de tanto uma da outra contam como uma (o item que faltou, o kit que veio depois). */
export const JUNTA_COMPRAS_DIAS = 7
/** Com tantas compras (dois intervalos), a próxima sai pelo ritmo da pessoa. */
export const COMPRAS_PRO_RITMO = 3
/** Sem ritmo e sem o tempo do produto: uma compra a cada tantos dias. */
export const CICLO_SEM_SABER_DIAS = 120
/** A chance de continuar comprando, pela chance de sair. */
export const CONTINUA: Record<Chance, number> = { baixa: 0.9, media: 0.6, alta: 0.25 }

export type Chance = "baixa" | "media" | "alta"
export const NOME_DA_CHANCE: Record<Chance, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
}

/** Um pedido pago, com o total em reais (as duas lojas). */
export type PedidoDaPrevisao = PedidoDaPessoa & { total: number }

export type PrevisaoDaPessoa = {
  /** Quantas compras pagas (as de menos de 7 dias juntas contam uma). */
  compras: number
  /** O intervalo típico entre as compras, em dias — com 3 compras ou mais. */
  ritmo: number | null
  proximaCompra: { em: Date | null; porque: string }
  chance: { valor: Chance; porque: string }
  ltv: {
    /** O que já gastou, em reais. */
    ate: number
    /** O previsto nos próximos 12 meses, em reais. */
    previsto: number
    ticket: number
    porque: string
  }
}

const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}
const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const DIA_MES = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
})
const dias = (n: number) => (n === 1 ? "1 dia" : `${n} dias`)
const MENOS: Record<Chance, Chance> = { alta: "media", media: "baixa", baixa: "baixa" }

/** As datas das compras, com as de menos de 7 dias juntas (fica a primeira de cada grupo). */
export function datasDasCompras(pagos: readonly Date[]): Date[] {
  const ordem = [...pagos].sort((a, b) => a.getTime() - b.getTime())
  const juntas: Date[] = []
  for (const d of ordem)
    if (!juntas.length || d.getTime() - juntas.at(-1)!.getTime() >= JUNTA_COMPRAS_DIAS * DIA)
      juntas.push(d)
  return juntas
}

/**
 * A PREVISÃO DE UMA PESSOA — os pedidos dela (das duas lojas, com o total) e
 * as etiquetas (a próxima compra pelo produto, a etapa, o engajamento). Nula
 * pra quem ainda não comprou.
 */
export function previsaoDaPessoa({
  pedidos,
  etiquetas,
  agora,
  regras = REGRAS_PADRAO,
}: {
  pedidos: readonly PedidoDaPrevisao[]
  etiquetas: Pick<Etiquetas, "proximaCompra" | "etapa" | "engajamento">
  agora: Date
  regras?: Pick<RegrasDasEtiquetas, "toleranciaDaReposicao" | "semPrevisao">
}): PrevisaoDaPessoa | null {
  const pagos = pedidos.filter((p) => p.pagoEm && !p.cancelado)
  if (!pagos.length) return null
  const datas = datasDasCompras(pagos.map((p) => p.pagoEm!))
  const ultima = datas.at(-1)!
  const intervalos = datas
    .slice(1)
    .map((d, i) => Math.round((d.getTime() - datas[i].getTime()) / DIA))
  const ritmo = datas.length >= COMPRAS_PRO_RITMO ? Math.round(mediana(intervalos)) : null

  /* ── a próxima compra ── */
  let proximaCompra: PrevisaoDaPessoa["proximaCompra"]
  if (ritmo)
    proximaCompra = {
      em: new Date(ultima.getTime() + ritmo * DIA),
      porque: `pelo ritmo: compra a cada ${dias(ritmo)} (${datas.length} compras)`,
    }
  else proximaCompra = { em: etiquetas.proximaCompra.em, porque: etiquetas.proximaCompra.porque }

  /* ── a chance de sair ── */
  let chance: PrevisaoDaPessoa["chance"]
  if (etiquetas.etapa.valor === "sunset")
    chance = { valor: "alta", porque: "parou de abrir, clicar e visitar a loja (o sunset)" }
  else {
    if (proximaCompra.em) {
      const atraso = Math.floor((agora.getTime() - proximaCompra.em.getTime()) / DIA)
      chance =
        atraso <= 0
          ? {
              valor: "baixa",
              porque: `o dia de comprar de novo ainda não chegou (${DIA_MES.format(proximaCompra.em)})`,
            }
          : {
              valor: atraso <= regras.toleranciaDaReposicao ? "media" : "alta",
              porque: `passou ${dias(atraso)} do dia de comprar de novo (${DIA_MES.format(proximaCompra.em)})`,
            }
    } else {
      const sem = Math.floor((agora.getTime() - ultima.getTime()) / DIA)
      chance = {
        valor: sem < regras.semPrevisao ? "baixa" : sem < 2 * regras.semPrevisao ? "media" : "alta",
        porque: `${dias(sem)} sem comprar`,
      }
    }
    if (etiquetas.engajamento.valor === "quente" && chance.valor !== "baixa")
      chance = {
        valor: MENOS[chance.valor],
        porque: `${chance.porque}, mas ${etiquetas.engajamento.porque}`,
      }
  }

  /* ── o LTV ── */
  const ate = Math.round(pagos.reduce((s, p) => s + (Number(p.total) || 0), 0) * 100) / 100
  const ticket = Math.round((ate / datas.length) * 100) / 100
  const doProduto = etiquetas.proximaCompra.em
    ? Math.round((etiquetas.proximaCompra.em.getTime() - ultima.getTime()) / DIA)
    : null
  const ciclo = ritmo ?? (doProduto && doProduto >= 15 ? doProduto : CICLO_SEM_SABER_DIAS)
  const noAno = Math.min(12, 365 / ciclo)
  const previsto = Math.round(ticket * noAno * CONTINUA[chance.valor])
  const deOnde = ritmo
    ? `a cada ${dias(ritmo)}`
    : doProduto && doProduto >= 15
      ? `o produto dura uns ${dias(doProduto)}`
      : "uma compra a cada 4 meses, sem saber mais"
  return {
    compras: datas.length,
    ritmo,
    proximaCompra,
    chance,
    ltv: {
      ate,
      previsto,
      ticket,
      porque: `ticket médio de ${reais(ticket)}, ${deOnde}, e a chance de sair ${NOME_DA_CHANCE[chance.valor].toLowerCase()}`,
    },
  }
}
