import type { MedusaContainer } from "@medusajs/framework/types"
import { FINANCEIRO } from "../../modules/financeiro"
import type FinanceiroService from "../../modules/financeiro/service"
import { entraNoMes, type DespesaGravada, type Plano } from "./despesas"
import { ehMes } from "./regras"

/**
 * O QUE MUDA NO BANCO DO FINANCEIRO — a despesa que a pessoa viu num mês, e o
 * plano (`despesas.ts`) aplicado; os valores que valem desde um dia.
 */

const servico = (container: MedusaContainer) => container.resolve<FinanceiroService>(FINANCEIRO)

/** A despesa pelo id, se ela entra no mês que a pessoa estava vendo. */
export async function despesaVista(
  container: MedusaContainer,
  id: string,
  visto: unknown
): Promise<{ despesa: DespesaGravada; mes: string } | "nao-achou" | "mes"> {
  if (!ehMes(visto)) return "mes"
  const [d] = await servico(container).listDespesas({ id }, { take: 1 })
  if (!d) return "nao-achou"
  const despesa: DespesaGravada = {
    id: d.id,
    descricao: d.descricao,
    categoria: d.categoria,
    valor: Number(d.valor),
    mes: d.mes,
    repete: Boolean(d.repete),
    ate: d.ate ?? null,
  }
  return entraNoMes(despesa, visto) ? { despesa, mes: visto } : "nao-achou"
}

export async function aplicar(
  container: MedusaContainer,
  plano: Plano,
  lancadaPor: string
): Promise<void> {
  const fin = servico(container)
  if (plano.mudar) await fin.updateDespesas({ id: plano.mudar.id, ...plano.mudar.campos })
  if (plano.criar) await fin.createDespesas([{ ...plano.criar, lancada_por: lancadaPor }])
  if (plano.apagar) await fin.deleteDespesas(plano.apagar)
}

/**
 * Grava o valor que vale desde um dia: muda o daquele dia, se já existe, ou
 * cria. `null` tira o daquele dia (e o de antes volta a valer).
 */
export async function gravarValor(
  container: MedusaContainer,
  chave: string,
  desde: string,
  valor: number | null
): Promise<"criou" | "mudou" | "tirou" | "nada"> {
  const fin = servico(container)
  const [existe] = await fin.listValores({ chave, desde }, { take: 1 })
  if (valor === null) {
    if (!existe) return "nada"
    await fin.deleteValores(existe.id)
    return "tirou"
  }
  if (existe) {
    if (Number(existe.valor) === valor) return "nada"
    await fin.updateValores({ id: existe.id, valor })
    return "mudou"
  }
  await fin.createValores([{ chave, desde, valor }])
  return "criou"
}
