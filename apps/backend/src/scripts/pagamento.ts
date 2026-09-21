import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"
import { ondeEstou } from "./onde-estou"

/**
 * O PAGAR.ME NA REGIÃO — o dia em que a loja passa a cobrar.
 *
 *   npm run backend:pagamento              liga o Pagar.me (e tira o provisório)
 *   npm run backend:pagamento -- voltar    volta pro provisório, sem cobrança
 *
 * No Railway, dentro do serviço (a chave precisa estar no ambiente de quem
 * roda — é o provedor carregado NESTE processo que o script confere):
 *
 *     cd apps/backend/.medusa/server
 *     npx medusa exec ./src/scripts/pagamento.js
 *
 * ┌─ POR QUE UM SCRIPT, E NÃO UM CLIQUE NO ADMIN ──────────────────────────┐
 * │ O admin deixa marcar os dois provedores juntos na região. Com os dois, │
 * │ a loja veria o `pp_system_default` — que APROVA SEM COBRAR — como uma  │
 * │ opção de pagamento válida, e um pedido podia fechar sem dinheiro       │
 * │ nenhum. Aqui a troca é inteira: sai um, entra o outro.                 │
 * │                                                                         │
 * │ E, como o `frete.ts`, ele não diz "pronto" por ter escrito: ele        │
 * │ confere o que a loja vai enxergar. Provedor ligado na região mas sem   │
 * │ chave no servidor é checkout que quebra no último clique.              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * DEPOIS DESTE SCRIPT a loja já mostra Pix e cartão no checkout — mas o
 * botão da sacola só leva gente pra lá quando `CHECKOUT_ABERTO` virar `true`
 * (apps/loja/src/lib/site.ts). É essa segunda chave que abre a loja.
 */

const PAGARME = "pp_pagarme_pagarme"
const PROVISORIO = "pp_system_default"

export default async function pagamento({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  ondeEstou(logger, "pagamento")

  const voltar = (args ?? []).includes("voltar")
  const alvo = voltar ? PROVISORIO : PAGARME

  // ── 1. o que precisa existir antes ────────────────────────────────────────
  if (!voltar) {
    const chave = process.env.PAGARME_SECRET_KEY ?? ""
    if (!chave) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "PAGARME_SECRET_KEY não está no ambiente. Sem ela o provedor não cobra — e ligá-lo " +
          "na região seria trocar um checkout que funciona por um que falha no último clique. " +
          "Ponha a chave no Railway (server E worker) e rode de novo."
      )
    }
    logger.info(
      chave.startsWith("sk_test_")
        ? "[pagamento] chave de TESTE (sk_test_): nenhuma cobrança vai ser de verdade"
        : "[pagamento] chave de PRODUÇÃO: a partir daqui, cobra de verdade"
    )
    if (!process.env.MEDUSA_WEBHOOK_SEGREDO) {
      logger.warn(
        "[pagamento] MEDUSA_WEBHOOK_SEGREDO ausente: os avisos do Pagar.me vão ser ignorados e " +
          "Pix pago só vira pedido pago pela conciliação (a cada 5 minutos). Funciona, mas devagar."
      )
    }
  }

  const modulo = container.resolve(Modules.PAYMENT)
  const [provedor] = await modulo.listPaymentProviders({ id: [alvo] })
  if (!provedor?.is_enabled) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `O provedor ${alvo} não está carregado neste processo. Confira o bloco de pagamento ` +
        "do medusa-config.ts e se o build é o atual."
    )
  }

  // ── 2. a região ───────────────────────────────────────────────────────────
  const { data: regioes } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code", "payment_providers.id"],
  })
  const brasileiras = regioes.filter((r) => r.currency_code === "brl")
  if (brasileiras.length !== 1) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Esperava UMA região em reais e achei ${brasileiras.length}. Qual delas vende? ` +
        "Resolva no admin antes — trocar o pagamento da região errada não muda nada na loja."
    )
  }
  const regiao = brasileiras[0]
  const antes = (regiao.payment_providers ?? []).map((p) => p?.id).filter(Boolean)
  logger.info(`[pagamento] região "${regiao.name}": hoje com ${antes.join(", ") || "nenhum"}`)

  await updateRegionsWorkflow(container).run({
    input: { selector: { id: regiao.id }, update: { payment_providers: [alvo] } },
  })

  // ── 3. o que a loja vai enxergar ──────────────────────────────────────────
  /*
    É a mesma pergunta que a loja faz (`GET /store/payment-providers`): os
    provedores LIGADOS À REGIÃO. Um só, e o certo. Dois seria o provisório
    ainda aparecendo; zero seria checkout sem forma de pagamento.
  */
  const { data: depois } = await query.graph({
    entity: "region",
    fields: ["id", "payment_providers.id", "payment_providers.is_enabled"],
    filters: { id: regiao.id },
  })
  const ligados = (depois[0]?.payment_providers ?? []).filter(Boolean)
  const certos = ligados.length === 1 && ligados[0]?.id === alvo && ligados[0]?.is_enabled

  if (!certos) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Gravei ${alvo} na região, mas ela ficou com: ` +
        (ligados.map((p) => `${p?.id}${p?.is_enabled ? "" : " (desligado)"}`).join(", ") ||
          "nenhum") +
        ". O checkout não vai funcionar assim."
    )
  }

  logger.info(
    voltar
      ? `[pagamento] conferido: a região "${regiao.name}" voltou pro provisório (${PROVISORIO}). ` +
          "Pedido fecha SEM cobrança — deixe CHECKOUT_ABERTO em false."
      : `[pagamento] conferido: a região "${regiao.name}" cobra pelo Pagar.me (${PAGARME}). ` +
          "Confira com: node apps/loja/ferramentas/conferir-pagamento.mjs"
  )
}
