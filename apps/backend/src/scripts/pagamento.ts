import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"
import { MERCADOPAGO, PAGARME, PROVISORIO } from "../lib/pagamento/parceiros"
import { clienteDoMercadoPago, ENDERECO_PADRAO } from "../modules/mercadopago/client"
import { ondeEstou } from "./onde-estou"

/**
 * O PAGAR.ME NA REGIÃO — o dia em que a loja passa a cobrar.
 *
 *   npm run backend:pagamento              liga o Pagar.me (e tira o provisório);
 *                                          com o MERCADOPAGO_ACCESS_TOKEN, liga
 *                                          também o Mercado Pago (o Pix reserva)
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

export default async function pagamento({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  ondeEstou(logger, "pagamento")

  const voltar = (args ?? []).includes("voltar")
  /*
    O MERCADO PAGO ENTRA JUNTO quando o token dele estiver no ambiente — o
    Pix reserva (0140). Na região ele não aparece pra quem compra: o passo 3
    usa o Pagar.me, e quem escolhe o Mercado Pago é a loja.
  */
  const comMercadoPago = !voltar && Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN)
  const alvos = voltar ? [PROVISORIO] : [PAGARME.id, ...(comMercadoPago ? [MERCADOPAGO.id] : [])]

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
    if (comMercadoPago && !process.env.MERCADOPAGO_WEBHOOK_SEGREDO) {
      logger.warn(
        "[pagamento] MERCADOPAGO_WEBHOOK_SEGREDO ausente: os avisos do Mercado Pago vão ser " +
          "ignorados e o Pix dele só vira pedido pago pela conciliação (a cada 5 minutos)."
      )
    }
    if (!comMercadoPago) {
      logger.info("[pagamento] sem MERCADOPAGO_ACCESS_TOKEN: o Pix reserva fica desligado")
    } else {
      /*
        O TOKEN VALE? Uma leitura só (a lista dos pagamentos de hoje), sem
        criar nada: o Pix reserva só é usado no dia em que o Pagar.me falha, e
        um token errado descoberto nesse dia é o pior jeito de descobrir.
      */
      try {
        await clienteDoMercadoPago(
          process.env.MERCADOPAGO_ACCESS_TOKEN ?? "",
          process.env.MERCADOPAGO_URL || ENDERECO_PADRAO
        ).listarRecentes(1, 0)
      } catch (e) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "O Mercado Pago recusou o MERCADOPAGO_ACCESS_TOKEN " +
            `(${e instanceof Error ? e.message : String(e)}). Confira no painel de lá ` +
            "(Suas integrações → a aplicação → Credenciais de produção) e rode de novo."
        )
      }
      logger.info(
        (process.env.MERCADOPAGO_ACCESS_TOKEN ?? "").startsWith("TEST-")
          ? "[pagamento] Mercado Pago: token de TESTE aceito — nenhum Pix vai ser de verdade"
          : "[pagamento] Mercado Pago: token de PRODUÇÃO aceito"
      )
    }
  }

  const modulo = container.resolve(Modules.PAYMENT)
  const carregados = await modulo.listPaymentProviders({ id: alvos })
  for (const alvo of alvos) {
    if (!carregados.find((p) => p.id === alvo)?.is_enabled) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `O provedor ${alvo} não está carregado neste processo. Confira o bloco de pagamento ` +
          "do medusa-config.ts e se o build é o atual."
      )
    }
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
    input: { selector: { id: regiao.id }, update: { payment_providers: alvos } },
  })

  // ── 3. o que a loja vai enxergar ──────────────────────────────────────────
  /*
    É a mesma pergunta que a loja faz (`GET /store/payment-providers`): os
    provedores LIGADOS À REGIÃO. Exatamente os pedidos, e ligados. O
    provisório sobrando seria pedido fechando de graça; nenhum, checkout sem
    forma de pagamento.
  */
  const { data: depois } = await query.graph({
    entity: "region",
    fields: ["id", "payment_providers.id", "payment_providers.is_enabled"],
    filters: { id: regiao.id },
  })
  const ligados = (depois[0]?.payment_providers ?? []).filter(Boolean)
  const certos =
    ligados.length === alvos.length &&
    alvos.every((alvo) => ligados.some((p) => p?.id === alvo && p?.is_enabled))

  if (!certos) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Gravei ${alvos.join(", ")} na região, mas ela ficou com: ` +
        (ligados.map((p) => `${p?.id}${p?.is_enabled ? "" : " (desligado)"}`).join(", ") ||
          "nenhum") +
        ". O checkout não vai funcionar assim."
    )
  }

  logger.info(
    voltar
      ? `[pagamento] conferido: a região "${regiao.name}" voltou pro provisório (${PROVISORIO}). ` +
          "Pedido fecha SEM cobrança — deixe CHECKOUT_ABERTO em false."
      : `[pagamento] conferido: a região "${regiao.name}" cobra pelo Pagar.me (${PAGARME.id})` +
          (comMercadoPago ? `, com o Pix reserva pelo Mercado Pago (${MERCADOPAGO.id})` : "") +
          ". Confira com: node apps/loja/ferramentas/conferir-pagamento.mjs"
  )
}
