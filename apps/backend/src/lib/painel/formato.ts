/**
 * HORA E DINHEIRO NO JEITO DO PAINEL — sempre na hora de Brasília.
 *
 * O servidor roda em UTC (o Railway) e quem lê o painel está no Brasil: um
 * pedido das 22h de ontem não pode aparecer como "hoje, 01:00". Tudo o que
 * vira texto de hora passa por aqui, com o fuso da loja escrito.
 */

const FUSO = "America/Sao_Paulo"

const HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
})
const DIA = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" })
const DIA_DA_SEMANA = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short" })
/** "2026-09-24": pra comparar dias no fuso da loja. */
const CHAVE = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

const DIA_MS = 24 * 60 * 60 * 1000

export type Data = Date | string | number

const data = (d: Data) => (d instanceof Date ? d : new Date(d))

/** "21:13" */
export const hora = (d: Data) => HORA.format(data(d))

/** "24/09" */
export const dia = (d: Data) => DIA.format(data(d))

/** "2026-09-24", o dia em Brasília. */
export const chaveDoDia = (d: Data) => CHAVE.format(data(d))

/** "qua" */
export const diaDaSemana = (d: Data) => DIA_DA_SEMANA.format(data(d)).replace(".", "")

/** "hoje, 20:52" · "ontem, 09:10" · "12/09, 14:32" */
export function quando(d: Data, agora: Data = Date.now()): string {
  const chave = chaveDoDia(d)
  if (chave === chaveDoDia(agora)) return `hoje, ${hora(d)}`
  if (chave === chaveDoDia(data(agora).getTime() - DIA_MS)) return `ontem, ${hora(d)}`
  return `${dia(d)}, ${hora(d)}`
}

/** "o pedido não tem CPF" → "O pedido não tem CPF." — o erro do Bling (ou nosso) virando frase. */
export function emFrase(t: string): string {
  const limpo = t.trim()
  if (!limpo) return ""
  return `${limpo[0].toUpperCase()}${limpo.slice(1)}${/[.!?]$/.test(limpo) ? "" : "."}`
}

/** "R$ 109,80" (com o espaço fixo que o Intl põe). */
export const reais = (valor: number) => REAIS.format(valor)

/** Quantos minutos entre dois momentos, arredondado pra baixo e nunca negativo. */
export const minutosEntre = (de: Data, ate: Data) =>
  Math.max(0, Math.floor((data(ate).getTime() - data(de).getTime()) / 60000))

/** "12 min" · "1 h 05" · "3 h" */
export function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`
}
