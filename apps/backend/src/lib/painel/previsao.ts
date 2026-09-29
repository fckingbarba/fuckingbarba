import { emailNoLog } from "../email"
import { NOME_DA_CHANCE, type Chance, type PrevisaoDaPessoa } from "../crm/previsao"
import { dia } from "./formato"

/**
 * A ABA PREVISÃO DO CRM (entrega 0220, `lib/crm/previsao.ts`) — os números
 * da base inteira e as duas listas de quem agir: quem deve comprar nos
 * próximos 7 dias (pelo ticket) e os que mais gastaram entre os de chance
 * alta de sair. O e-mail sai mascarado, como no resto do CRM; o nome e o
 * link da ficha (quem tem cadastro na loja nova) ficam. Código puro, com
 * testes; quem lê o banco é `previsoesDeTodos` (`lib/crm/previsoes.ts`).
 */

const DIA = 24 * 60 * 60 * 1000
/** Quantas pessoas cada lista mostra. */
export const NA_LISTA = 20

export type PessoaDaPrevisao = {
  email: string
  nome: string | null
  /** O cliente da loja nova (`cus_…`), pro link da ficha; nulo pra quem só comprou na Nuvemshop. */
  clienteId: string | null
  previsao: PrevisaoDaPessoa
}

export type LinhaDaPrevisao = {
  /** "Rafael · r•••@exemplo.com". */
  quem: string
  clienteId: string | null
  /** "20/10", ou "—". */
  proximaCompra: string
  chance: Chance
  nomeDaChance: string
  porque: string
  ticket: number
  ate: number
  previsto: number
  ritmo: number | null
}

export type TelaDaPrevisao = {
  numeros: {
    /** Quem comprou alguma vez (as duas lojas, sem a equipe). */
    clientes: number
    /** A próxima compra de hoje a 7 dias, e o ticket médio somado. */
    semana: { pessoas: number; valor: number }
    /** De hoje a 30 dias. */
    mes: { pessoas: number; valor: number }
    chance: Record<Chance, number>
    /** O que os de chance alta já gastaram: o que está em jogo. */
    emJogo: number
    /** A média do que cada cliente já gastou. */
    ltvMedio: number
    /** O previsto pros próximos 12 meses, somado. */
    previsto: number
  }
  semana: LinhaDaPrevisao[]
  emRisco: LinhaDaPrevisao[]
  /** A pessoa buscada pelo e-mail (`?email=`), se comprou. */
  busca: { email: string; linha: LinhaDaPrevisao | null } | null
}

const centavos = (v: number) => Math.round(v * 100) / 100

function linhaDa(p: PessoaDaPrevisao, mostrarEmail = false): LinhaDaPrevisao {
  const email = mostrarEmail ? p.email : emailNoLog(p.email)
  const v = p.previsao
  return {
    quem: p.nome ? `${p.nome} · ${email}` : email,
    clienteId: p.clienteId,
    proximaCompra: v.proximaCompra.em ? dia(v.proximaCompra.em) : "—",
    chance: v.chance.valor,
    nomeDaChance: NOME_DA_CHANCE[v.chance.valor],
    porque: v.chance.porque,
    ticket: v.ltv.ticket,
    ate: v.ltv.ate,
    previsto: v.ltv.previsto,
    ritmo: v.ritmo,
  }
}

export function montarTelaDaPrevisao({
  pessoas,
  agora,
  busca = null,
}: {
  pessoas: readonly PessoaDaPrevisao[]
  agora: Date
  /** O e-mail buscado, já em minúsculas. */
  busca?: string | null
}): TelaDaPrevisao {
  const hoje = agora.getTime()
  const ate = (dias: number) =>
    pessoas.filter((p) => {
      const em = p.previsao.proximaCompra.em?.getTime()
      return em !== undefined && em >= hoje - DIA && em <= hoje + dias * DIA
    })
  const semana = ate(7)
  const mes = ate(30)
  const soma = (xs: readonly PessoaDaPrevisao[], f: (p: PessoaDaPrevisao) => number) =>
    centavos(xs.reduce((s, p) => s + f(p), 0))
  const alta = pessoas.filter((p) => p.previsao.chance.valor === "alta")
  const buscada = busca ? pessoas.find((p) => p.email === busca) : undefined
  return {
    numeros: {
      clientes: pessoas.length,
      semana: { pessoas: semana.length, valor: soma(semana, (p) => p.previsao.ltv.ticket) },
      mes: { pessoas: mes.length, valor: soma(mes, (p) => p.previsao.ltv.ticket) },
      chance: {
        baixa: pessoas.filter((p) => p.previsao.chance.valor === "baixa").length,
        media: pessoas.filter((p) => p.previsao.chance.valor === "media").length,
        alta: alta.length,
      },
      emJogo: soma(alta, (p) => p.previsao.ltv.ate),
      ltvMedio: pessoas.length
        ? centavos(soma(pessoas, (p) => p.previsao.ltv.ate) / pessoas.length)
        : 0,
      previsto: soma(pessoas, (p) => p.previsao.ltv.previsto),
    },
    // Os de chance alta ficam na outra lista: aqui, quem vale ligar a reposição ou uma campanha.
    semana: semana
      .filter((p) => p.previsao.chance.valor !== "alta")
      .sort((a, b) => b.previsao.ltv.ticket - a.previsao.ltv.ticket)
      .slice(0, NA_LISTA)
      .map((p) => linhaDa(p)),
    emRisco: [...alta]
      .sort((a, b) => b.previsao.ltv.ate - a.previsao.ltv.ate)
      .slice(0, NA_LISTA)
      .map((p) => linhaDa(p)),
    busca: busca ? { email: busca, linha: buscada ? linhaDa(buscada, true) : null } : null,
  }
}
