import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { lerConfiguracoes } from "../configuracoes"
import { emCentavos } from "./comum"

/**
 * A PARCELA MÍNIMA DA LOJA — a menor parcela do cartão que ela aceita, das
 * Configurações (`pagamento.parcelaMinima`, 0157). A loja só OFERECE as
 * parcelas que passam dela; aqui o Medusa garante que ninguém ABRE sessão de
 * pagamento com menos — a API é pública, e o que a tela esconde um `curl`
 * manda.
 *
 * Por que aqui, e não no provedor do Pagar.me: o provedor é um módulo isolado
 * e não enxerga as configurações da loja. Ele segue conferindo o PISO DO
 * BANCO (`PARCELA_MINIMA_CENTAVOS`, na entrada), que nenhuma configuração
 * baixa; esta porta confere o que a loja escolheu acima dele.
 *
 * Na dúvida, deixa passar: sem ler a coleção ou a loja (o banco engasgou), a
 * sessão segue — e o piso do banco continua valendo no provedor.
 */

/** Cada parcela de `parcelas` vezes, deste valor (centavos), fica em pé na mínima (reais)? */
export function parcelaCabe(valorCentavos: number, parcelas: number, minimaReais: number): boolean {
  if (!Number.isInteger(parcelas) || parcelas <= 1) return true
  return valorCentavos / parcelas >= Math.round(minimaReais * 100)
}

/** O `message` da recusa — a loja escreve a frase (`finalizar`). */
export const RESPOSTA_DA_PARCELA = "parcela_minima"

export async function parcelaMinimaDaLoja(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const entrada = (req.body as { data?: { entrada?: Record<string, unknown> } } | undefined)?.data
    ?.entrada
  const parcelas = Number(entrada?.parcelas ?? 1)
  if (entrada?.forma !== "cartao" || !Number.isInteger(parcelas) || parcelas <= 1) return next()

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const [{ data: colecoes }, lojas] = await Promise.all([
      query.graph({
        entity: "payment_collection",
        fields: ["id", "amount"],
        filters: { id: req.params.id },
      }),
      req.scope.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
    ])
    const valor = emCentavos((colecoes[0] as { amount?: unknown } | undefined)?.amount)
    const minima = lerConfiguracoes(lojas[0]?.metadata).pagamento.parcelaMinima
    if (Number.isFinite(valor) && !parcelaCabe(valor, parcelas, minima)) {
      res.status(400).json({ type: "invalid_data", message: RESPOSTA_DA_PARCELA })
      return
    }
  } catch (e) {
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        `[pagamento] não conferi a parcela mínima da loja (${e instanceof Error ? e.message : e})` +
          " — seguiu com o piso do banco"
      )
  }
  next()
}
