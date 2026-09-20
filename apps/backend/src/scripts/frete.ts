import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  batchLinksWorkflow,
  createLocationFulfillmentSetWorkflow,
  createServiceZonesWorkflow,
  createShippingOptionsWorkflow,
  deleteShippingOptionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { lerConfiguracoes } from "../lib/configuracoes"
import { ondeEstou } from "./onde-estou"

/**
 * AS OPÇÕES DE FRETE — sem elas NÃO EXISTE PEDIDO.
 *
 *   npm install && npm run backend:frete
 *
 * ONDE ISSO ESCREVE: no banco do `DATABASE_URL` que estiver valendo. A
 * primeira linha do log diz qual é. No Railway:
 *
 *     cd apps/backend/.medusa/server
 *     npx medusa exec ./src/scripts/frete.js
 *
 * ┌─ O QUE MUDOU: O PREÇO SAIU DAQUI ──────────────────────────────────────┐
 * │ Até ontem este arquivo cadastrava duas linhas com valor fixo — PAC     │
 * │ R$ 24,90, Sedex R$ 39,90 — valendo do Oiapoque ao Chuí, e mais uma     │
 * │ regra de preço zero acima do piso pra fazer o frete grátis.            │
 * │                                                                         │
 * │ Agora as opções são `calculated`: elas não têm preço nenhum no banco.  │
 * │ Quem responde "quanto custa" é o provedor da Frenet, no momento em que │
 * │ o cliente digita o CEP, e é ele também quem aplica a política de frete │
 * │ grátis — a MESMA função que a vitrine usa pra escrever a tarja.        │
 * │                                                                         │
 * │ Então este script voltou a ser o que o nome diz: ele cria o conjunto,  │
 * │ a zona e as duas opções. Números, nenhum.                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ANTES DE RODAR, três coisas precisam existir, e o script confere as três:
 *
 *   1. FRENET_TOKEN no ambiente do servidor (não aqui, não em código);
 *   2. CEP no endereço do local de estoque — é o CEP de origem da cotação;
 *   3. peso e medida em toda variante (`npm run backend:medidas`).
 *
 * RODA QUANTAS VEZES QUISER. Ele corrige o que existe e apaga as opções
 * fixas antigas, que senão continuariam aparecendo no checkout ao lado das
 * cotadas — quatro linhas de frete, duas delas com preço que ninguém cotou.
 */

/** As duas faixas. Os `id` precisam bater com os do provedor da Frenet. */
const OPCOES = [
  {
    faixa: "economica",
    nome: "Entrega econômica",
    /*
      A descrição é ESTÁTICA e por isso não promete prazo. O prazo real vem
      da cotação e muda com o CEP; escrever "5 a 10 dias úteis" aqui seria
      um número fixo no lugar de um número que a transportadora acabou de
      dar — exatamente o problema que esta migração veio resolver.
    */
    descricao: "A mais barata para o seu CEP",
  },
  {
    faixa: "expressa",
    nome: "Entrega expressa",
    descricao: "A mais rápida para o seu CEP",
  },
] as const

/** O provedor: identificador da classe + id do registro no medusa-config. */
const PROVEDOR = "frenet_frenet"

/** Nomes que este script já criou e não cria mais. Some com eles ao rodar. */
const APOSENTADAS = ["Correios PAC", "Correios Sedex"]

const NOME_DO_CONJUNTO = "Entrega Brasil"
const NOME_DA_ZONA = "Brasil"

export default async function frete({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  ondeEstou(logger, "frete")

  // ── 1. o que precisa existir antes ──────────────────────────────────────
  if (!process.env.FRENET_TOKEN) {
    logger.warn(
      "[frete] FRENET_TOKEN não está no ambiente. As opções vão ser criadas do mesmo jeito, " +
        "mas toda cotação vai falhar e cair no preço de emergência das configurações — " +
        "e se ele estiver vazio, a loja não vende."
    )
  }

  const loja = container.resolve(Modules.STORE)
  const [dadosDaLoja] = await loja.listStores({}, { select: ["id", "metadata"], take: 1 })
  const { frete: politica, cotacao } = lerConfiguracoes(dadosDaLoja?.metadata)

  logger.info(
    politica.modo === "nenhuma"
      ? "[frete] sem política de frete: o cliente paga o que a transportadora cobrar"
      : politica.modo === "gratis"
        ? `[frete] frete grátis a partir de R$ ${politica.piso.toFixed(2)} (${politica.alvo})`
        : `[frete] frete fixo de R$ ${politica.preco.toFixed(2)} a partir de R$ ${politica.piso.toFixed(2)}`
  )
  if (cotacao.precoDeEmergencia === null) {
    logger.info(
      "[frete] sem preço de emergência: se a Frenet cair, a loja para de vender. " +
        "Pra mudar isso, Configurações da loja → Quando a cotação falhar."
    )
  }

  const { data: locais } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name", "address.postal_code"],
  })
  const local = locais[0]
  if (!local) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Nenhum local de estoque.")
  }
  if (!local.address?.postal_code) {
    /*
      Sem CEP de origem não existe cotação — a Frenet cota de um CEP para
      outro. Isto é erro e não aviso porque criar as opções assim deixaria a
      loja com duas entregas que falham em toda tentativa, o que é pior do
      que não ter opção nenhuma: dá a impressão de que está funcionando.
    */
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `O local de estoque "${local.name}" está sem CEP. Cadastre o endereço em ` +
        "Configurações → Localizações no admin: é dele que sai o CEP de origem da cotação."
    )
  }

  const { data: variantes } = await query.graph({
    entity: "product_variant",
    fields: ["id", "title", "weight", "length", "width", "height", "product.title"],
  })
  const semMedida = variantes.filter((v) => !v.weight || !v.length || !v.width || !v.height)
  if (semMedida.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${semMedida.length} variante(s) sem peso ou medida — a cotação sairia errada. ` +
        `Rode "npm run backend:medidas" primeiro. Faltam: ` +
        semMedida
          .slice(0, 5)
          .map((v) => `${v.product?.title ?? "?"} / ${v.title ?? v.id}`)
          .join(", ")
    )
  }

  const { data: perfis } = await query.graph({ entity: "shipping_profile", fields: ["id", "name"] })
  const perfil = perfis[0]
  if (!perfil) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Nenhum perfil de envio. Rode o produtos-iniciais antes."
    )
  }

  /*
    ┌─ PRODUTO SEM PERFIL DE ENVIO É PRODUTO QUE NINGUÉM CONSEGUE COMPRAR ──┐
    │ O Medusa casa opção de frete com produto pelo PERFIL DE ENVIO: ele    │
    │ filtra os itens do carrinho pelo perfil da opção antes de calcular.   │
    │ Item cujo produto não tem perfil nenhum não casa com opção nenhuma —  │
    │ e o carrinho fica sem entrega, sem erro em lugar nenhum.              │
    │                                                                       │
    │ Foi assim que o "Óleo para Barba" estava: publicado, à venda na       │
    │ vitrine, oferecido no "leve junto" da PDP — e impossível de comprar.  │
    │ Quem achou foi o `conferir-frete.mjs`, porque ele monta um carrinho   │
    │ de verdade com o primeiro produto do catálogo, que era justamente ele.│
    │                                                                       │
    │ Com UM perfil só, ligar é óbvio e o script liga. Com mais de um, a    │
    │ escolha é de negócio (produto grande vai por outro perfil), então ele │
    │ recusa e lista quem está solto.                                       │
    └───────────────────────────────────────────────────────────────────────┘
  */
  const { data: produtos } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "status", "shipping_profile.id"],
  })
  const soltos = produtos.filter((p) => p.status === "published" && !p.shipping_profile?.id)

  if (soltos.length && perfis.length > 1) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${soltos.length} produto(s) publicados sem perfil de envio, e existe mais de um perfil — ` +
        "escolha o perfil de cada um no admin. Sem perfil, o produto não recebe opção de " +
        `entrega nenhuma e não pode ser comprado. São: ${soltos.map((p) => p.handle).join(", ")}`
    )
  }

  if (soltos.length) {
    await batchLinksWorkflow(container).run({
      input: {
        create: soltos.map((p) => ({
          [Modules.PRODUCT]: { product_id: p.id },
          [Modules.FULFILLMENT]: { shipping_profile_id: perfil.id },
        })),
      },
    })
    logger.warn(
      `[frete] ${soltos.length} produto(s) estavam SEM perfil de envio e não podiam ser ` +
        `comprados. Ligados em "${perfil.name}": ${soltos.map((p) => p.handle).join(", ")}`
    )
  }

  // ── 2. o conjunto de entrega, pendurado no local de estoque ─────────────
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

  // ── 3. a zona: o Brasil inteiro, um país só ─────────────────────────────
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

  // ── 4. o provedor precisa estar LIGADO neste local ──────────────────────
  /*
    Sem este vínculo o Medusa recusa criar a opção com uma frase que não
    diz o que fazer: "Providers (frenet_frenet) are not enabled for the
    service location". Não é sobre o provedor existir — ele existe e está
    ativo —, é sobre ELE e ESTE ARMAZÉM: o Medusa assume que uma loja com
    dois depósitos pode despachar de um pela Frenet e do outro na mão.

    No admin isso é um interruptor em Configurações → Localizações. Aqui é
    um vínculo, e criar um que já existe não dá erro — então roda sempre,
    em vez de conferir antes.
  */
  await batchLinksWorkflow(container).run({
    input: {
      create: [
        {
          [Modules.STOCK_LOCATION]: { stock_location_id: local.id },
          [Modules.FULFILLMENT]: { fulfillment_provider_id: PROVEDOR },
        },
      ],
    },
  })
  logger.info(`[frete] provedor ${PROVEDOR} ligado em "${local.name}"`)

  // ── 5. fora as fixas de antes ───────────────────────────────────────────
  const { data: existentes } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "price_type", "provider_id"],
  })

  const velhas = existentes.filter((o) => APOSENTADAS.includes(o.name ?? ""))
  if (velhas.length) {
    await deleteShippingOptionsWorkflow(container).run({
      input: { ids: velhas.map((o) => o.id) },
    })
    logger.info(`[frete] apagadas as fixas antigas: ${velhas.map((o) => o.name).join(", ")}`)
  }

  // ── 6. as duas faixas ───────────────────────────────────────────────────
  const porNome = new Map(existentes.map((o) => [o.name, o]))
  const aCriar = OPCOES.filter((o) => !porNome.has(o.nome))

  for (const opcao of OPCOES) {
    const ja = porNome.get(opcao.nome)
    if (!ja) continue
    /*
      Opção que já existe com o provedor errado é do tempo das fixas, e
      `updateShippingOptions` não muda `provider_id` nem `price_type` — são
      decididos na criação. Apagar e recriar é o caminho.
    */
    if (ja.provider_id !== PROVEDOR || ja.price_type !== "calculated") {
      await deleteShippingOptionsWorkflow(container).run({ input: { ids: [ja.id] } })
      aCriar.push(opcao)
      logger.info(`[frete] "${opcao.nome}" recriada: era ${ja.provider_id}/${ja.price_type}`)
    } else {
      logger.info(`[frete] "${opcao.nome}" já está cotada pela Frenet`)
    }
  }

  if (!aCriar.length) {
    logger.info("[frete] nada a criar")
    return
  }

  await createShippingOptionsWorkflow(container).run({
    input: aCriar.map((opcao) => ({
      name: opcao.nome,
      /*
        `calculated` é o que faz o Medusa perguntar o preço ao provedor em
        vez de ler do banco. Opção calculada NÃO leva `prices` — o Medusa
        cria um conjunto de preços vazio pra ela.
      */
      price_type: "calculated" as const,
      service_zone_id: zonaId,
      shipping_profile_id: perfil.id,
      provider_id: PROVEDOR,
      /* Vira `optionData` no `calculatePrice`: é por aqui que o provedor
         sabe se está respondendo pela econômica ou pela expressa. */
      data: { faixa: opcao.faixa },
      type: {
        label: opcao.nome,
        description: opcao.descricao,
        code: opcao.faixa,
      },
      rules: [
        // Sem estas duas a opção existe no admin e não aparece na loja.
        { attribute: "enabled_in_store", operator: "eq", value: "true" },
        { attribute: "is_return", operator: "eq", value: "false" },
      ],
    })),
  })

  for (const o of aCriar) {
    logger.info(`[frete] ${o.nome} — cotada pela Frenet, saindo de ${local.address.postal_code}`)
  }
  logger.info("[frete] pronto. Confira com: node apps/loja/ferramentas/conferir-frete.mjs")
}
