import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createLocationFulfillmentSetWorkflow,
  createServiceZonesWorkflow,
  createShippingOptionsWorkflow,
  updateShippingOptionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { lerConfiguracoes } from "../lib/configuracoes"
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
 * FRETE GRÁTIS É SÓ NA OPÇÃO MAIS BARATA. "Frete grátis" quer dizer que a loja
 * paga o envio comum, não que ela paga a pressa de quem escolhe Sedex — com a
 * regra nas duas, todo pedido acima do piso saía por R$ 39,90 de frete em vez
 * de R$ 24,90, e a diferença é margem que some sem ninguém ver.
 *
 * "A PARTIR DE", NÃO "ACIMA DE": a regra é `gte`, então o piso exato já sai de
 * graça — e o kit de 2 unidades custa exatamente R$ 149,90, ou seja, o carrinho
 * mais provável de encostar no piso encosta nele em cheio. Quem confere isso
 * rodando é `ferramentas/conferir-frete.mjs`, que monta carrinhos de verdade e
 * pergunta o frete como o checkout vai perguntar.
 *
 * O PISO É O MESMO NÚMERO DO SITE — hoje escrito em `apps/loja/src/lib/site.ts`
 * O PISO VEM DAS CONFIGURAÇÕES DA LOJA (admin), não daqui. Antes eram dois
 * números em dois apps, e o dia em que
 * divergirem, a loja promete um piso e o carrinho cobra por outro. Quando o
 * Medusa virar a fonte também desse número (fase 5), a constante da loja sai.
 *
 * FRETE FIXO, E ISSO TEM UM CUSTO: mandar pro Acre custa bem mais que mandar
 * pra São Paulo, e um valor único come a margem do envio longo e encarece o
 * curto. É deliberado como PONTE até o Frenet entrar — aí as opções viram
 * `price_type: "calculated"` e o provedor cota por CEP. A loja não muda: ela
 * lista o que o Medusa devolver.
 *
 * RODA QUANTAS VEZES QUISER, e ele CORRIGE o que já existe em vez de pular.
 * Pular era idempotente e inútil na hora que importa: mudar um valor de frete
 * exigiria apagar a opção no painel primeiro. Este arquivo é a fonte desses
 * números, então ele escreve os números.
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

/**
 * O PISO NÃO É MAIS CONSTANTE — ele é LIDO das configurações da loja.
 *
 * Era um número escrito aqui e outro igual escrito em `apps/loja/src/lib/
 * site.ts`. O daqui virava a regra `item_total >= piso` que de fato zera o
 * frete; o de lá era o que catorze telas exibiam. Nada ligava os dois, e a
 * divergência aconteceu de verdade: o admin foi ajustado pra R$ 139,90 e
 * este script continuaria cadastrando a regra em R$ 149,90 — a loja
 * anunciando um piso e o carrinho cobrando por outro, que no art. 30 do CDC
 * é oferta que vincula sem ser cumprida.
 *
 * Agora a fonte é uma só: o `metadata` da loja, editável no admin. Este
 * script lê de lá e cadastra a regra com o mesmo número que a vitrine
 * anuncia. Sem política de frete configurada, ele NÃO cria regra de
 * gratuidade nenhuma — em vez de inventar um piso.
 *
 * (Quando o provider do Frenet entrar, quem aplica a política é ele, em
 * tempo de cotação, e esta parte do script some.)
 */

type Opcao = {
  nome: string
  /** Em reais. */
  preco: number
  /** Aparece na tela do checkout, ao lado do preço. */
  prazo: string
  /**
   * Esta opção sai de graça acima do piso?
   *
   * SÓ A MAIS BARATA, e isso é margem: "frete grátis" quer dizer que a loja
   * paga o envio comum, não que ela paga a pressa de quem quer Sedex. Com a
   * regra nas duas — como estava — todo pedido acima do piso saía por R$ 39,90
   * de frete em vez de R$ 24,90, e a diferença é sua.
   *
   * Quem quiser Sedex acima do piso continua podendo: paga os R$ 39,90, e a
   * tela mostra o PAC riscado do lado pra escolha ficar visível.
   */
  gratisAcimaDoPiso: boolean
}

const OPCOES: Opcao[] = [
  { nome: "Correios PAC", preco: 24.9, prazo: "5 a 10 dias úteis", gratisAcimaDoPiso: true },
  { nome: "Correios Sedex", preco: 39.9, prazo: "2 a 4 dias úteis", gratisAcimaDoPiso: false },
]

/* ───────────────────────────────────────────────────────────────────────── */

const NOME_DO_CONJUNTO = "Entrega Brasil"
const NOME_DA_ZONA = "Brasil"

/**
 * Os preços de uma opção: o valor cheio, e — só pra quem tem frete grátis —
 * um SEGUNDO preço zerado com regra em `item_total`.
 *
 * Este segundo preço é o mecanismo inteiro do frete grátis. Não é promoção:
 * é a mesma opção custando outra coisa acima do piso, então o checkout
 * escreve "Grátis" no lugar do valor em vez de abrir uma linha de desconto
 * que obriga o cliente a fazer a conta.
 *
 * `item_total` é o ÚNICO atributo que o Medusa aceita numa regra de preço de
 * frete, e `gte` inclui o piso exato — o kit de 2 custa exatamente ele.
 */
function precosDe(opcao: Opcao, piso: number | null) {
  return [
    { currency_code: "brl", amount: opcao.preco },
    ...(opcao.gratisAcimaDoPiso && piso !== null
      ? [
          {
            currency_code: "brl",
            amount: 0,
            rules: [
              {
                attribute: "item_total",
                operator: "gte" as const,
                value: piso,
              },
            ],
          },
        ]
      : []),
  ]
}

export default async function frete({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  ondeEstou(logger, "frete")

  const loja = container.resolve(Modules.STORE)
  const [dadosDaLoja] = await loja.listStores({}, { select: ["id", "metadata"], take: 1 })
  const politica = lerConfiguracoes(dadosDaLoja?.metadata).frete

  if (politica.modo === "nenhuma") {
    logger.info(
      "[frete] sem política de frete nas configurações — as opções são criadas SEM regra de " +
        "gratuidade. Pra ter frete grátis, configure em Configurações da loja, no admin."
    )
  } else if (politica.modo === "fixo") {
    logger.warn(
      `[frete] a política configurada é FRETE FIXO de R$ ${politica.preco.toFixed(2)}, e este ` +
        "script só sabe cadastrar gratuidade. O fixo depende do provider do Frenet — até lá, " +
        "as opções são criadas sem regra."
    )
  }

  const FRETE_GRATIS_A_PARTIR_DE = politica.modo === "gratis" ? politica.piso : null

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
  const porNome = new Map(existentes.map((o) => [o.name, o.id]))

  /**
   * Os preços de uma opção que JÁ EXISTE também são corrigidos.
   *
   * "Pula o que já existe" era idempotente e inútil na hora que importa:
   * mudar um valor de frete, ou tirar o frete grátis de uma opção, exigiria
   * apagar a opção no painel e rodar de novo. Este script é a fonte da
   * verdade desses números — então ele escreve os números, sempre.
   *
   * Mandar `prices` SUBSTITUI a lista inteira, que é justamente o que faz o
   * preço zerado sumir de quem deixou de ter frete grátis.
   */
  const aAtualizar = OPCOES.filter((o) => porNome.has(o.nome))
  if (aAtualizar.length) {
    await updateShippingOptionsWorkflow(container).run({
      input: aAtualizar.map((opcao) => ({
        id: porNome.get(opcao.nome)!,
        prices: precosDe(opcao, FRETE_GRATIS_A_PARTIR_DE),
      })),
    })
    for (const o of aAtualizar) {
      logger.info(
        `[frete] ${o.nome} atualizado: R$ ${o.preco.toFixed(2)}` +
          `${o.gratisAcimaDoPiso ? " · grátis acima do piso" : " · sem frete grátis"}`
      )
    }
  }

  const aCriar = OPCOES.filter((o) => !porNome.has(o.nome))

  if (!aCriar.length) {
    logger.info("[frete] nenhuma opção nova a criar")
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
      prices: precosDe(opcao, FRETE_GRATIS_A_PARTIR_DE),
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
  logger.info(
    FRETE_GRATIS_A_PARTIR_DE === null
      ? "[frete] sem regra de gratuidade — nenhuma opção sai de graça"
      : `[frete] grátis a partir de R$ ${FRETE_GRATIS_A_PARTIR_DE.toFixed(2)}, lido das configurações da loja`
  )
  logger.info(
    "[frete] LEMBRE: valor fixo pro Brasil inteiro. Enviar pro Norte custa " +
      "mais que pro Sudeste, e um número só come a margem de um e encarece o outro."
  )
}
