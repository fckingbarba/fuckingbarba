import {
  colunaDoMes,
  deCada100,
  dreDoMes,
  dreDoPeriodo,
  linhasNaTela,
  type ColunaDoMes,
  type DadosDoDre,
  type LinhaNaTela,
  type PedacoDos100,
  type Pendencia,
} from "./dre"
import {
  COMECO_DO_DRE,
  mesDeAgora,
  type AtalhoDoFinanceiro,
  type PeriodoDoFinanceiro,
} from "./regras"

/**
 * O QUE A TELA DO DRE RECEBE (`GET /dashboard/financeiro`): o período, as
 * linhas somadas com o % e a comparação, o "de cada R$ 100", o que falta e
 * cada mês numa coluna (o "Mês a mês"). Puro: a rota lê e chama.
 */
export type TelaDoFinanceiro = {
  periodo: {
    atalho: AtalhoDoFinanceiro | null
    de: string
    ate: string
    /** "setembro de 2026" */
    nome: string
    antes: { de: string; ate: string; nome: string } | null
    comparar: boolean
    aviso: string | null
    /** O primeiro mês do DRE e o de agora — os limites do "Escolher meses". */
    comeco: string
    hoje: string
  }
  pedidos: { atual: number; antes: number | null }
  linhas: LinhaNaTela[]
  deCada100: PedacoDos100[]
  pendencias: Pendencia[]
  meses: ColunaDoMes[]
}

export function montarTela(
  p: PeriodoDoFinanceiro,
  dados: DadosDoDre,
  agora: Date
): TelaDoFinanceiro {
  const dresAtuais = p.atual.meses.map((m) => dreDoMes(m, dados))
  const atual = dreDoPeriodo(dresAtuais)
  const antes = p.antes ? dreDoPeriodo(p.antes.meses.map((m) => dreDoMes(m, dados))) : null
  return {
    periodo: {
      atalho: p.atalho,
      de: p.atual.de,
      ate: p.atual.ate,
      nome: p.atual.nome,
      antes: p.antes ? { de: p.antes.de, ate: p.antes.ate, nome: p.antes.nome } : null,
      comparar: p.comparar,
      aviso: p.aviso,
      comeco: COMECO_DO_DRE,
      hoje: mesDeAgora(agora),
    },
    pedidos: { atual: atual.pedidos, antes: antes ? antes.pedidos : null },
    linhas: linhasNaTela(atual, antes),
    deCada100: deCada100(atual),
    pendencias: atual.pendencias,
    meses: dresAtuais.map(colunaDoMes),
  }
}
