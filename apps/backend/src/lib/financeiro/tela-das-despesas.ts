import { despesasDoMes, type DespesaGravada } from "./despesas"
import {
  CATEGORIAS,
  COMECO_DO_DRE,
  ehMes,
  MES_DA_LOJA_NOVA,
  mesCurto,
  mesDeAgora,
  mesEAno,
  mesesEntre,
  NOME_DA_LINHA,
  somarMeses,
} from "./regras"

/**
 * O QUE A TELA DE DESPESAS RECEBE (`GET /dashboard/financeiro/despesas?mes=`):
 * as despesas do mês por categoria, os meses pra ir e voltar, as categorias
 * do formulário e, antes da loja nova, que mês já tem a taxa e o frete da
 * Nuvemshop lançados. Puro, testado em `__tests__/despesas.unit.spec.ts`.
 */

export type DespesaNaTela = {
  id: string
  descricao: string
  categoria: string
  /** Em reais. */
  valor: number
  repete: boolean
  /** O primeiro mês e o último (na que repete, `null` = até parar). */
  desde: string
  ate: string | null
}

export type TelaDasDespesas = {
  mes: string
  /** "setembro de 2026" */
  nome: string
  anterior: string | null
  proximo: string | null
  /** Em reais. */
  total: number
  grupos: {
    categoria: string
    nome: string
    linha: string
    total: number
    itens: DespesaNaTela[]
  }[]
  categorias: { id: string; nome: string; linha: string }[]
  /** Os meses em que dá pra lançar, do mais novo pro mais velho. */
  meses: { mes: string; nome: string }[]
  /** Fevereiro até o mês da loja nova: se vendeu na Nuvemshop, e se a taxa e o frete foram lançados. */
  antesDaLojaNova: { mes: string; curto: string; vendeu: boolean; taxas: boolean; frete: boolean }[]
}

const arred = (v: number) => Math.round(v * 100) / 100

/** O mês que o endereço pede, entre o começo do DRE e um ano depois de agora; senão, este mês. */
export function mesDasDespesas(v: unknown, agora: Date): string {
  const hoje = mesDeAgora(agora)
  return ehMes(v) && v >= COMECO_DO_DRE && v <= somarMeses(hoje, 12) ? v : hoje
}

export function telaDasDespesas(
  todas: readonly DespesaGravada[],
  mes: string,
  agora: Date,
  mesesComVenda: readonly string[]
): TelaDasDespesas {
  const ultimo = somarMeses(mesDeAgora(agora), 12)
  const doMes = despesasDoMes(todas, mes)
  const grupos = CATEGORIAS.flatMap((c) => {
    const itens = doMes.filter((d) => d.categoria === c.id)
    if (!itens.length) return []
    return [
      {
        categoria: c.id,
        nome: c.nome,
        linha: NOME_DA_LINHA[c.linha],
        total: arred(itens.reduce((s, d) => s + Number(d.valor), 0) / 100),
        itens: itens.map((d) => ({
          id: d.id,
          descricao: d.descricao,
          categoria: d.categoria,
          valor: arred(Number(d.valor) / 100),
          repete: d.repete,
          desde: d.mes,
          ate: d.repete ? d.ate : d.mes,
        })),
      },
    ]
  })
  const lancou = (m: string, categoria: string) =>
    despesasDoMes(todas, m).some((d) => d.categoria === categoria)
  return {
    mes,
    nome: mesEAno(mes),
    anterior: mes > COMECO_DO_DRE ? somarMeses(mes, -1) : null,
    proximo: mes < ultimo ? somarMeses(mes, 1) : null,
    total: arred(grupos.reduce((s, g) => s + g.total, 0)),
    grupos,
    categorias: CATEGORIAS.map((c) => ({ id: c.id, nome: c.nome, linha: NOME_DA_LINHA[c.linha] })),
    meses: mesesEntre(COMECO_DO_DRE, ultimo)
      .reverse()
      .map((m) => ({ mes: m, nome: mesEAno(m) })),
    antesDaLojaNova: mesesEntre(COMECO_DO_DRE, MES_DA_LOJA_NOVA).map((m) => ({
      mes: m,
      curto: mesCurto(m),
      vendeu: mesesComVenda.includes(m),
      taxas: lancou(m, "taxas"),
      frete: lancou(m, "frete"),
    })),
  }
}
