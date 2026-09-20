import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  createLocationFulfillmentSetWorkflow,
  createServiceZonesWorkflow,
  createShippingOptionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { ondeEstou } from "./onde-estou"

/**
 * As opções de frete — sem elas NÃO EXISTE PEDIDO.
 *
 *   npm install && npm run backend:frete
 *
 * ONDE ISSO ESCREVE: no banco do `DATABASE_URL` que estiver valendo. A
 * primeira linha do log diz qual é. No Railway:
 *
 *     cd apps/backend/.medusa/server
 *     npx medusa exec ./src/scripts/frete.js
 *
 * ┌─ POR QUE ISTO VEM ANTES DO CHECKOUT ───────────────────────────────────┐
 * │                                                                        │
 * │ O Medusa não fecha carrinho sem MÉTODO DE ENVIO escolhido. Hoje a loja │
 * │ tem zero opções cadastradas: `GET /store/shipping-options` devolve     │
 * │ lista vazia, e nenhum pedido pode ser concluído, com ou sem checkout   │
 * │ pronto. Isso inverte a ordem do plano — frete era fase 5, depois do    │
 * │ checkout, e na prática é pré-requisito dele.                           │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * FRETE GRÁTIS É PREÇO DA OPÇÃO, NÃO PROMOÇÃO. O Medusa deixa cada preço de
 * opção ter regra em `item_total` — e só nesse atributo — então a mesma opção
 * custa R$ 24,90 até o piso e R$ 0 a partir dele. Fazer isso como promoção
 * automática funcionaria também, e seria pior: promoção aparece como desconto
 * numa linha separada, e o cliente que só quer saber quanto vai pagar de frete
 * teria que fazer a conta. Aqui ele lê "Frete grátis" no lugar do valor, que é
 * o que a esteira, a gaveta e a dobra prometem.
 *
 * "A PARTIR DE", NÃO "ACIMA DE": a regra é `gte`, então o piso exato já sai de
 * graça — e o kit de 2 unidades custa exatamente R$ 149,90, ou seja, o carrinho
 * mais provável de encostar no piso encosta nele em cheio. Quem confere isso
 * rodando é `ferramentas/conferir-frete.mjs`, que monta carrinhos de verdade e
 * pergunta o frete como o checkout vai perguntar.
 *
 * O PISO É O MESMO NÚMERO DO SITE — hoje escrito em `apps/loja/src/lib/site.ts`
 * como `FRETE_GRATIS_A_PARTIR_DE`. Os dois precisam bater: o dia em que
 * divergirem, a loja promete um piso e o carrinho cobra por outro. Quando o
 * Medusa virar a fonte também desse número (fase 5), a constante da loja sai.
 *
 * FRETE FIXO, E ISSO TEM UM CUSTO: mandar pro Acre custa bem mais que mandar
 * pra São Paulo, e um valor único come a margem do envio longo e encarece o
 * curto. É deliberado como PONTE até o Frenet entrar — aí as opções viram
 * `price_type: "calculated"` e o provedor cota por CEP. A loja não muda: ela
 * lista o que o Medusa devolver.
 *
 * Roda quantas vezes quiser: o que já existe é pulado.
 */

/* ─────────────────────────────────────────────────────────────────────────
   OS NÚMEROS. Trocar antes de rodar em produção.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Vire `true` quando os valores abaixo forem os SEUS, conferidos com a
 * tabela dos Correios pro peso médio de uma encomenda daqui.
 *
 * Enquanto for `false`, o script se recusa a rodar em banco remoto. Não é
 * zelo excessivo: preço de frete é a última coisa que o cliente vê antes de
 * pagar, e chute publicado ali vira ou prejuízo seu ou reclamação dele.
 */
const CONFERIDO = false

const FRETE_GRATIS_A_PARTIR_DE = 149.9

type Opcao = {
  nome: string
  /** Em reais. */
  preco: number
  /** Aparece na tela do checkout, ao lado do preço. */
  prazo: string
}

const OPCOES: Opcao[] = [
  { nome: "Correios PAC", preco: 24.9, prazo: "5 a 10 dias úteis" },
  { nome: "Correios Sedex", preco: 39.9, prazo: "2 a 4 dias úteis" },
]

/* ───────────────────────────────────────────────────────────────────────── */

const NOME_DO_CONJUNTO = "Entrega Brasil"
const NOME_DA_ZONA = "Brasil"

export default async function frete({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  ondeEstou(logger, "frete")

  const remoto = !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")
  if (remoto && !CONFERIDO) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Os valores de frete ainda são os de exemplo. Confira os preços no topo " +
        "de src/scripts/frete.ts, vire CONFERIDO para true, e rode de novo. " +
        "Preço de frete chutado em produção é prejuízo seu ou reclamação do cliente."
    )
  }

  const { data: locais } = await query.graph({ entity: "stock_location", fields: ["id", "name"] })
  const local = locais[0]
  if (!local) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Nenhum local de estoque.")
  }

  const { data: perfis } = await query.graph({ entity: "shipping_profile", fields: ["id", "name"] })
  const perfil = perfis[0]
  if (!perfil) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Nenhum perfil de envio. Rode o produtos-iniciais antes."
    )
  }

  // ── o conjunto de entrega, pendurado no local de estoque ────────────────
  const { data: conjuntos } = await query.graph({
    entity: "fulfillment_set",
    fields: ["id", "name", "service_zones.id", "service_zones.name"],
  })
  let conjunto = conjuntos.find((c) => c.name === NOME_DO_CONJUNTO)

  if (!conjunto) {
    await createLocationFulfillmentSetWorkflow(container).run({
      input: {
        location_id: local.id,
        fulfillment_set_data: { name: NOME_DO_CONJUNTO, type: "shipping" },
      },
    })
    const { data: novos } = await query.graph({
      entity: "fulfillment_set",
      fields: ["id", "name", "service_zones.id", "service_zones.name"],
    })
    conjunto = novos.find((c) => c.name === NOME_DO_CONJUNTO)
    logger.info(`[frete] conjunto "${NOME_DO_CONJUNTO}" criado em ${local.name}`)
  } else {
    logger.info(`[frete] conjunto "${NOME_DO_CONJUNTO}" já existe`)
  }

  if (!conjunto) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Não consegui criar o conjunto.")
  }

  // ── a zona: o Brasil inteiro, um país só ────────────────────────────────
  // Guardo só o id. A zona vem de duas origens — do `query.graph` quando já
  // existe, do workflow quando acabou de nascer — e os dois tipos não são o
  // mesmo objeto. O id é o que as opções precisam, e é igual nos dois.
  let zonaId = (conjunto.service_zones ?? []).find((z) => z?.name === NOME_DA_ZONA)?.id

  if (!zonaId) {
    const { result } = await createServiceZonesWorkflow(container).run({
      input: {
        data: [
          {
            name: NOME_DA_ZONA,
            fulfillment_set_id: conjunto.id,
            geo_zones: [{ type: "country", country_code: "br" }],
          },
        ],
      },
    })
    zonaId = result[0]?.id
    logger.info(`[frete] zona "${NOME_DA_ZONA}" criada (país: br)`)
  } else {
    logger.info(`[frete] zona "${NOME_DA_ZONA}" já existe`)
  }

  if (!zonaId) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Não consegui criar a zona.")
  }

  // ── as opções ───────────────────────────────────────────────────────────
  const { data: existentes } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
  })
  const jaTem = new Set(existentes.map((o) => o.name))
  const aCriar = OPCOES.filter((o) => !jaTem.has(o.nome))

  if (!aCriar.length) {
    logger.info("[frete] todas as opções já estão lá, nada a fazer")
    return
  }

  await createShippingOptionsWorkflow(container).run({
    input: aCriar.map((opcao) => ({
      name: opcao.nome,
      price_type: "flat" as const,
      service_zone_id: zonaId,
      shipping_profile_id: perfil.id,
      // O provedor embutido do Medusa: quem despacha é gente, não API. Quando
      // o Frenet entrar, é aqui que o provider dele assume.
      provider_id: "manual_manual",
      type: {
        label: opcao.nome,
        description: opcao.prazo,
        code: opcao.nome.toLowerCase().replace(/[^a-z]+/g, "-"),
      },
      prices: [
        { currency_code: "brl", amount: opcao.preco },
        // A MESMA opção, zerada a partir do piso. É isto que faz o checkout
        // escrever "Frete grátis" em vez de cobrar — sem promoção, sem linha
        // de desconto, sem o cliente ter que fazer conta. `gte`: o piso exato
        // conta, e o kit de 2 custa exatamente o piso.
        {
          currency_code: "brl",
          amount: 0,
          rules: [{ attribute: "item_total", operator: "gte", value: FRETE_GRATIS_A_PARTIR_DE }],
        },
      ],
      rules: [
        // Sem estas duas a opção existe no admin e não aparece na loja.
        { attribute: "enabled_in_store", operator: "eq", value: "true" },
        { attribute: "is_return", operator: "eq", value: "false" },
      ],
    })),
  })

  for (const o of aCriar) {
    logger.info(`[frete] ${o.nome}: R$ ${o.preco.toFixed(2)} · ${o.prazo}`)
  }
  logger.info(`[frete] grátis a partir de R$ ${FRETE_GRATIS_A_PARTIR_DE.toFixed(2)}`)
  logger.info(
    "[frete] LEMBRE: valor fixo pro Brasil inteiro. Enviar pro Norte custa " +
      "mais que pro Sudeste, e um número só come a margem de um e encarece o outro."
  )
}
