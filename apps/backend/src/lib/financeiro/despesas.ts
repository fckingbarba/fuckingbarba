import type { Categoria, DespesaLida } from "./regras"
import { somarMeses } from "./regras"

/**
 * AS DESPESAS NO TEMPO — em que meses cada uma entra, e o que mudar ou
 * apagar num mês faz com a que repete. Código puro, testado em
 * `__tests__/despesas.unit.spec.ts`; quem grava é a rota.
 */

/** A despesa como o banco guarda (`fin_despesa`), só o que as contas usam. */
export type DespesaGravada = {
  id: string
  descricao: string
  categoria: string
  /** Em centavos. */
  valor: number
  mes: string
  repete: boolean
  ate: string | null
}

/** Se a despesa entra no mês: a de um mês só, no dela; a que repete, do primeiro até o `ate`. */
export const entraNoMes = (d: DespesaGravada, mes: string) =>
  d.repete ? d.mes <= mes && (!d.ate || d.ate >= mes) : d.mes === mes

/** As despesas que entram no mês. */
export const despesasDoMes = (despesas: readonly DespesaGravada[], mes: string) =>
  despesas.filter((d) => entraNoMes(d, mes))

/** Uma despesa como ela entra num mês — o que o DRE soma. */
export type DespesaNoMes = {
  mes: string
  categoria: Categoria | string
  descricao: string
  /** Em centavos. */
  valor: number
}

/** Cada despesa em cada mês da lista em que ela entra. */
export function despesasNosMeses(
  despesas: readonly DespesaGravada[],
  meses: readonly string[]
): DespesaNoMes[] {
  return meses.flatMap((mes) =>
    despesasDoMes(despesas, mes).map((d) => ({
      mes,
      categoria: d.categoria,
      descricao: d.descricao,
      valor: Number(d.valor),
    }))
  )
}

export type Plano = {
  /** Campos a mudar numa despesa que já existe. */
  mudar?: { id: string; campos: Partial<Omit<DespesaGravada, "id">> }
  /** A despesa nova a criar. */
  criar?: Omit<DespesaGravada, "id">
  /** A despesa a apagar. */
  apagar?: string
}

/**
 * Mudar a despesa vista no mês `mes`. A de um mês só muda inteira (e pode ir
 * pra outro mês). A que repete: vista no primeiro mês, muda inteira; vista
 * num mês depois, fecha no mês de antes e uma nova começa em `mes`, com o
 * mesmo fim — os meses de antes ficam como estavam. Tirar o "repete" de uma
 * que repete a deixa só no mês em que foi mudada.
 */
export function planoDaMudanca(d: DespesaGravada, mes: string, nova: DespesaLida): Plano {
  const campos = { descricao: nova.descricao, categoria: nova.categoria, valor: nova.valor }
  if (!d.repete) {
    return {
      mudar: {
        id: d.id,
        campos: { ...campos, mes: nova.mes, repete: nova.repete, ate: null },
      },
    }
  }
  const ate = nova.repete ? d.ate : mes
  if (mes <= d.mes) return { mudar: { id: d.id, campos: { ...campos, repete: true, ate } } }
  return {
    mudar: { id: d.id, campos: { ate: somarMeses(mes, -1) } },
    criar: { ...campos, mes, repete: true, ate },
  }
}

/**
 * Apagar a despesa vista no mês `mes`. A de um mês só some. A que repete,
 * vista no primeiro mês, some inteira; vista depois, para no mês de antes
 * ("tirar deste mês em diante").
 */
export function planoDoApagar(d: DespesaGravada, mes: string): Plano {
  if (!d.repete || mes <= d.mes) return { apagar: d.id }
  return { mudar: { id: d.id, campos: { ate: somarMeses(mes, -1) } } }
}
