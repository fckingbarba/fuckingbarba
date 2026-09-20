import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, ProductStatus } from "@medusajs/framework/utils"
import { createInventoryLevelsWorkflow, createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { ondeEstou } from "./onde-estou"

/**
 * Os kits de quantidade — "2 frascos", "3 frascos" — como produtos próprios.
 *
 *   npm install && npm run backend:kits
 *
 * ONDE ISSO ESCREVE: no banco do `DATABASE_URL` que estiver valendo — o de
 * `apps/backend/.env` quando roda da sua máquina, o da variável do serviço
 * quando roda no Railway. NÃO É O REPOSITÓRIO: dar push não cria kit nenhum.
 * A primeira linha do log diz em qual banco ele está escrevendo.
 *
 * Pra criar os kits no catálogo que está no ar, as duas opções são: rodar da
 * sua máquina com o DATABASE_URL de produção no `.env`, ou rodar no próprio
 * Railway (Shell do serviço, de `.medusa/server`, com o arquivo já
 * compilado: `npx medusa exec ./src/scripts/kits-de-quantidade.js`).
 *
 * ENQUANTO ELE NÃO RODAR, a PDP mostra um degrau só ("1 frasco") e nenhum
 * preço de kit. Isso é de propósito: a página lê o catálogo, e o que não
 * existe no catálogo ela não promete.
 *
 * POR QUE ISTO EXISTE: a PDP oferece um degrau de quantidade com desconto
 * (1 frasco R$ 79,90, 2 por R$ 149,90, 3 por R$ 222,90). Esses preços não
 * existiam em lugar nenhum — o Medusa cobrava 2 x 79,90 = R$ 159,80. Página
 * prometendo um preço e carrinho cobrando outro é o pior lugar possível pra
 * o cliente descobrir uma diferença.
 *
 * ┌─ O QUE ESTA ESCOLHA CUSTA, e não dá pra contornar depois ──────────────┐
 * │                                                                        │
 * │ SÃO TRÊS ESTOQUES SEPARADOS PARA O MESMO FRASCO.                       │
 * │                                                                        │
 * │ Vender um kit de 3 NÃO baixa o estoque do avulso, e vender o avulso    │
 * │ não baixa o dos kits. Se você tem 60 frascos no galpão e põe 20 em     │
 * │ cada SKU, o site vai deixar vender 20+20+20 = 100 unidades de um       │
 * │ produto que tem 60.                                                    │
 * │                                                                        │
 * │ É exatamente por isso que na Nuvemshop de hoje os kits aparecem        │
 * │ "Esgotado" com o avulso disponível: alguém precisa reequilibrar os     │
 * │ três números na mão, e quando esquece, um deles zera sozinho.          │
 * │                                                                        │
 * │ A alternativa sem esse custo é preço por FAIXA DE QUANTIDADE na mesma  │
 * │ variante (price list com min_quantity/max_quantity): um SKU, um        │
 * │ estoque, e "2 frascos" vira quantidade 2. Se um dia o remanejamento    │
 * │ cansar, é pra lá que dá pra migrar — e aí estes produtos viram         │
 * │ rascunho em vez de serem apagados, pra não quebrar pedido antigo.      │
 * │                                                                        │
 * │ ESTOQUE inicial aqui é 10 de propósito, não 50: número pequeno erra    │
 * │ pequeno enquanto ninguém definiu como dividir o galpão entre os SKUs.  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * SEM LISTA DE PREÇO, de propósito. O kit tem preço cheio e ponto: a
 * vantagem que a página mostra é "R$ 74,95 cada" contra os R$ 79,90 do
 * avulso — comparação com um preço que existe e que o cliente pode conferir
 * na mesma tela. Um "de R$ 255,70" riscado seria um preço que este SKU nunca
 * teve.
 *
 * A LIGAÇÃO COM O PRODUTO BASE é `metadata`, e ela faz três trabalhos:
 *   tipo ...... marca o produto como kit de quantidade, pra sumir da vitrine
 *               (senão a grade mostra "Fator", "Fator 2x" e "Fator 3x" lado
 *               a lado, que é péssima vitrine)
 *   base ...... de qual produto este é o degrau
 *   unidades .. quantos frascos, pra calcular o preço por unidade
 *
 * Com isso a PDP monta o degrau LENDO O CATÁLOGO: criar um kit 4x no admin
 * com essa metadata faz ele aparecer na página sozinho, sem deploy.
 *
 * Roda quantas vezes quiser: handle que já existe é pulado.
 */

type Kit = {
  handle: string
  titulo: string
  subtitulo: string
  sku: string
  /** Handle do produto de uma unidade. A foto e a categoria saem dele. */
  base: string
  unidades: number
  /** Em reais, preço cheio deste SKU. Copiado da loja atual em 20/09/2026. */
  preco: number
}

const ESTOQUE_INICIAL = 10

const KITS: Kit[] = [
  {
    handle: "kit-2-fator-de-crescimento-para-barba",
    titulo: "Kit 2 frascos — Fator de Crescimento para Barba",
    subtitulo: "Dois meses de tratamento, com frete por nossa conta",
    sku: "FBFCB01-K2",
    base: "fator-de-crescimento-para-barba",
    unidades: 2,
    preco: 149.9,
  },
  {
    handle: "kit-3-fator-de-crescimento-para-barba",
    titulo: "Kit 3 frascos — Fator de Crescimento para Barba",
    subtitulo: "O ciclo completo de 90 dias, sem repor no meio",
    sku: "FBFCB01-K3",
    base: "fator-de-crescimento-para-barba",
    unidades: 3,
    preco: 222.9,
  },
  // O 6x da loja atual (R$ 410,90) cabe aqui do mesmo jeito. Ficou de fora
  // porque a dobra da PDP mostra três opções — mais que isso vira catálogo
  // e a escolha trava. Quando quiser, é só acrescentar a linha.
]

export default async function kitsDeQuantidade({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  ondeEstou(logger, "kits")

  const { data: canais } = await query.graph({ entity: "sales_channel", fields: ["id"] })
  const canal = canais[0]
  if (!canal) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Nenhum canal de venda.")
  }

  const { data: locais } = await query.graph({ entity: "stock_location", fields: ["id"] })
  const local = locais[0]
  if (!local) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Nenhum local de estoque.")
  }

  // ── o produto base: foto, categoria e perfil de envio vêm dele ──────────
  // Reusar a foto do avulso é de propósito: o kit é o mesmo frasco, e uma
  // foto genérica é melhor que nenhuma. A foto CERTA mostra dois ou três
  // frascos juntos — quando ela existir, troque no admin.
  //
  // O KIT HERDA TUDO QUE O BASE TIVER, inclusive foto que não devia estar
  // lá. Foi o que aconteceu no primeiro deploy: os dois kits nasceram com o
  // antes/depois do Fator junto. Por isso `fotos-reprovadas` varre o
  // catálogo inteiro, e por isso ele é o ÚLTIMO a rodar depois de criar kit.
  const bases = [...new Set(KITS.map((k) => k.base))]
  const { data: produtosBase } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "thumbnail", "shipping_profile.id", "categories.id", "images.url"],
    filters: { handle: bases },
  })
  const base = new Map(produtosBase.map((p) => [p.handle, p]))

  for (const handle of bases) {
    if (!base.has(handle)) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Produto base "${handle}" não existe. Rode o produtos-iniciais antes.`
      )
    }
  }

  const { data: existentes } = await query.graph({ entity: "product", fields: ["id", "handle"] })
  const jaExiste = new Set(existentes.map((p) => p.handle))
  const aCriar = KITS.filter((k) => !jaExiste.has(k.handle))

  if (!aCriar.length) {
    logger.info("[kits] todos já estão lá, nada a fazer")
    return
  }

  const { result: criados } = await createProductsWorkflow(container).run({
    input: {
      products: aCriar.map((kit) => {
        const pai = base.get(kit.base)!
        return {
          title: kit.titulo,
          subtitle: kit.subtitulo,
          handle: kit.handle,
          description:
            `${kit.unidades} frascos do Fator de Crescimento para Barba FuckingBarba, ` +
            `30 ml cada. Mesmo produto do avulso, com preço por unidade menor.`,
          status: ProductStatus.PUBLISHED,
          thumbnail: pai.thumbnail ?? undefined,
          images: (pai.images ?? []).flatMap((i) => (i?.url ? [{ url: i.url }] : [])),
          shipping_profile_id: pai.shipping_profile?.id ?? undefined,
          category_ids: (pai.categories ?? []).flatMap((c) => (c?.id ? [c.id] : [])),
          sales_channels: [{ id: canal.id }],
          // É isto que a PDP lê pra montar o degrau de quantidade, e é isto
          // que tira o kit da vitrine.
          metadata: {
            tipo: "kit-quantidade",
            base: kit.base,
            unidades: kit.unidades,
          },
          options: [{ title: "Tamanho", values: ["Único"] }],
          variants: [
            {
              title: "Único",
              sku: kit.sku,
              manage_inventory: true,
              options: { Tamanho: "Único" },
              prices: [{ amount: kit.preco, currency_code: "brl" }],
            },
          ],
        }
      }),
    },
  })
  logger.info(`[kits] ${criados.length} kit(s) criado(s)`)

  const { data: variacoes } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "inventory_items.inventory_item_id"],
    filters: { sku: aCriar.map((k) => k.sku) },
  })

  const niveis = variacoes.flatMap((v) =>
    (v.inventory_items ?? [])
      .filter((item) => item?.inventory_item_id)
      .map((item) => ({
        inventory_item_id: item!.inventory_item_id,
        location_id: local.id,
        stocked_quantity: ESTOQUE_INICIAL,
      }))
  )

  if (niveis.length) {
    await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: niveis } })
    logger.info(`[kits] ${ESTOQUE_INICIAL} unidades em ${niveis.length} item(ns) de estoque`)
  }

  for (const kit of aCriar) {
    const porUnidade = (kit.preco / kit.unidades).toFixed(2).replace(".", ",")
    logger.info(`[kits] ${kit.handle}: R$ ${kit.preco} — R$ ${porUnidade} cada`)
  }

  logger.info(
    "[kits] pronto. LEMBRE: o estoque destes SKUs é separado do avulso — " +
      "somados, eles prometem mais frascos do que existem no galpão."
  )
}
