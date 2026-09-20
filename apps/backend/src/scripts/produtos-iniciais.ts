import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  PriceListStatus,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createInventoryLevelsWorkflow,
  createPriceListsWorkflow,
  createProductsWorkflow,
  createShippingProfilesWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows"
import { ondeEstou } from "./onde-estou"

/**
 * Seis produtos de verdade, pra loja nova sair do vazio.
 *
 *   npm run backend:produtos          (local)
 *   npx medusa exec ./src/scripts/produtos-iniciais.js   (no Railway, de .medusa/server)
 *
 * Por que existe: a vitrine, a página de produto e a gaveta não dá pra
 * desenhar contra catálogo vazio — placeholder mente sobre como o texto
 * quebra, como a foto enquadra e o que acontece quando o preço tem desconto.
 * Então isto traz um punhado de produtos REAIS da loja atual, com a foto, o
 * preço e o trecho de descrição que já estão publicados lá.
 *
 * NÃO é a migração do catálogo. Aquela é a fase 2: sai da exportação da
 * Nuvemshop, traz os quinze produtos com descrição inteira, todas as fotos,
 * variações, peso conferido e o mapa de 301. Aqui são seis, escolhidos pra
 * cobrir as três categorias, o caso do kit e os produtos que a home cita
 * pelo nome na seção "Alta Performance".
 *
 * Roda quantas vezes quiser: produto cujo handle já existe é pulado.
 *
 * ┌─ O QUE PRECISA DE OLHO HUMANO ────────────────────────────────────────┐
 * │ PESO: estimado por mim pela embalagem, não medido. É o que a Frenet   │
 * │   vai usar pra cotar frete na fase 5 — peso errado é frete errado,    │
 * │   cobrado de você ou do cliente. Confira numa balança antes de vender.│
 * │ PREÇO: copiado da loja atual em 19/09/2026. O "de" vira uma lista de  │
 * │   preço promocional no Medusa, que é como ele representa desconto.    │
 * │ ESTOQUE: 50 unidades, número de teste. Na loja atual está tudo        │
 * │   esgotado — se isso for de propósito, zere aqui antes de rodar.      │
 * └───────────────────────────────────────────────────────────────────────┘
 */

const CDN = "https://acdn-us.mitiendanube.com/stores/006/689/600/products"

type Produto = {
  /** Mesmo handle da loja atual: a URL antiga continua valendo na virada. */
  handle: string
  titulo: string
  subtitulo: string
  /** Trecho publicado hoje na loja atual. A descrição inteira vem na fase 2. */
  descricao: string
  sku: string
  categoria: "barba" | "cabelo" | "kits"
  /** Em reais. O Medusa v2 trabalha com valor decimal, não centavos. */
  preco: number
  precoDe: number
  /** Gramas, com embalagem. ESTIMADO — ver o aviso acima. */
  pesoGramas: number
  fotos: string[]
}

const ESTOQUE_INICIAL = 50

const CATALOGO: Produto[] = [
  {
    handle: "oleo-para-barba",
    titulo: "Óleo para Barba FuckingBarba 30ml",
    subtitulo: "Nutrição, brilho e maciez premium",
    descricao:
      "BRILHO NA MEDIDA. ZERO FRESCURA. MÁXIMO RESPEITO. O Óleo de Barba FuckingBarba foi feito " +
      "pra quem quer presença de verdade: barba alinhada, hidratada e com aparência foda, sem " +
      "toque grudento ou pesado.",
    sku: "FBOL01",
    categoria: "barba",
    preco: 54.9,
    precoDe: 79.9,
    pesoGramas: 90,
    fotos: [
      `${CDN}/fuckingbarba-product-oil-1-f1a9344cbc509d4d1a17662574545066-1024-1024.webp`,
      `${CDN}/fb-13-1-079b7e32be43ca050717691998644096-1024-1024.webp`,
    ],
  },
  {
    handle: "balm-para-barba",
    titulo: "Balm Modelador para Barba FuckingBarba 90g",
    subtitulo: "Controle, volume e estilo premium",
    descricao:
      "CONTROLE, HIDRATAÇÃO E ATITUDE PELA SUA BARBA. Seu ritual diário para dominar a barba " +
      "começa aqui. O Balm Modelador FuckingBarba foi feito para quem leva barba a sério: " +
      "hidrata, nutre, alinha e dá aquele toque de maciez e sustentação que transforma qualquer " +
      "visual em presença.",
    sku: "FBBM01",
    categoria: "barba",
    preco: 53.9,
    precoDe: 78.9,
    pesoGramas: 150,
    fotos: [
      `${CDN}/fuckingbarba-product-balm-1-67a0565676b42952e017662573181802-1024-1024.webp`,
      `${CDN}/fb-31-1-bbed17dac0c3e2a7c017691998393487-1024-1024.webp`,
    ],
  },
  {
    handle: "shampoo-para-barba",
    titulo: "Shampoo para Barba FuckingBarba 120ml",
    subtitulo: "Limpeza profunda e hidratação total",
    descricao:
      "O Shampoo para Barba FuckingBarba foi feito pra quem entende que cuidar da barba também " +
      "é questão de estilo. Ele limpa de verdade, removendo impurezas, suor e oleosidade sem " +
      "agredir a pele e sem tirar a essência dos fios.",
    sku: "FBSH01",
    categoria: "barba",
    preco: 49.9,
    precoDe: 72.4,
    pesoGramas: 170,
    fotos: [
      `${CDN}/fuckingbarba-product-shampoo-1-05b06665e46dfb530417662571787890-1024-1024.webp`,
      `${CDN}/fb-6-1-ce1836cfe274a759d617691997839145-1024-1024.webp`,
    ],
  },
  {
    handle: "fator-de-crescimento-para-barba",
    titulo: "Fator de Crescimento para Barba 30ml",
    subtitulo: "Crescimento, densidade e preenchimento",
    descricao:
      "MAIS CRESCIMENTO. MAIS VOLUME. MAIS PRESENÇA. Se a sua barba falha, cresce irregular ou " +
      "simplesmente não evolui, o Fator de Crescimento da FuckingBarba foi feito para mudar " +
      "isso. É um tratamento de uso diário que atua direto na pele, estimulando o crescimento " +
      "dos fios e criando o ambiente ideal para uma barba mais cheia e uniforme.",
    sku: "FBFCB01",
    categoria: "barba",
    preco: 79.9,
    precoDe: 133.2,
    pesoGramas: 95,
    fotos: [
      `${CDN}/produto-1cf784554239cc00b617755907983101-1024-1024.webp`,
      `${CDN}/pdp-1000x1000-22670c28eafa37f5ea17755696867196-1024-1024.webp`,
    ],
  },
  {
    handle: "spray-modelador-matte-100ml-fucking-barba",
    titulo: "Spray Modelador Matte Dry Touch 100ml",
    subtitulo: "Textura seca, alta fixação, acabamento natural",
    descricao:
      "Desenvolvido para homens que procuram volume, textura e acabamento natural, o Spray " +
      "Modelador Matte Dry Touch FuckingBarba proporciona efeito seco instantâneo, alta fixação " +
      "e muito mais controle para o penteado. Sua fórmula leve cria textura sem pesar os fios, " +
      "garantindo um visual moderno e duradouro.",
    sku: "FBMSP01",
    categoria: "cabelo",
    preco: 49.9,
    precoDe: 119.9,
    pesoGramas: 140,
    fotos: [
      `${CDN}/projeto-redimensionar-imagem-15-de-julho-de-2026-as-12-53-39-1-787bd32b468ba5a78317841309579463-1024-1024.webp`,
      `${CDN}/projeto-redimensionar-imagem-15-de-julho-de-2026-as-13-06-09-6afd47af5e234736e317841316272052-1024-1024.webp`,
    ],
  },
  {
    handle: "kit-completo-para-barba",
    titulo: "Kit Completo FuckingBarba — Shampoo, Balm e Óleo",
    subtitulo: "A rotina inteira numa caixa só",
    descricao:
      "KIT COMPLETO FUCKINGBARBA — A ROTINA DO HOMEM QUE IMPÕE PRESENÇA. Shampoo 120ml, Balm " +
      "Modelador 90g e Óleo para Barba 30ml: limpeza, hidratação, modelagem e brilho, com " +
      "fragrância amadeirada.",
    sku: "FBKIT01",
    categoria: "kits",
    preco: 99.9,
    precoDe: 189.9,
    pesoGramas: 450,
    fotos: [
      `${CDN}/f-9-5419ba5582dbe4048f17662577954296-1024-1024.webp`,
      `${CDN}/projeto-redimensionar-imagem-5-1-93f93f38c7b3cae04917692000860208-1024-1024.webp`,
    ],
  },
]

export default async function produtosIniciais({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  ondeEstou(logger, "produtos")

  // Sem S3 o Medusa grava a foto no disco do container. Local, tudo bem. No
  // Railway isso é uma armadilha silenciosa: funciona hoje, e no próximo
  // deploy o container é outro e as cinco fotos somem — com os produtos
  // ainda apontando pra elas. Melhor parar aqui e mandar configurar.
  if (process.env.NODE_ENV === "production" && !process.env.S3_BUCKET) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "S3_BUCKET não está definido: as fotos iriam pro disco do container e sumiriam no " +
        "próximo deploy. Configure as variáveis S3_* (Supabase Storage) antes de rodar."
    )
  }

  // ── o que já existe: canal, categorias, estoque, perfil de envio ────────
  const { data: canais } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  })
  const canal = canais[0]
  if (!canal) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Nenhum canal de venda. Rode `medusa db:migrate` antes."
    )
  }

  const { data: categorias } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  })
  const idDaCategoria = new Map(categorias.map((c) => [c.handle, c.id]))

  const { data: locais } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })
  const local = locais[0]
  if (!local) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Nenhum local de estoque. Rode `medusa db:migrate` antes."
    )
  }

  // O Medusa exige perfil de envio em todo produto. O seed não cria nenhum
  // porque frete é fase 5 — então o primeiro produto traz o perfil junto.
  const { data: perfis } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  let perfilId = perfis[0]?.id
  if (!perfilId) {
    logger.info("[produtos] criando o perfil de envio padrão")
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Padrão", type: "default" }] },
    })
    perfilId = result[0].id
  }

  // ── o que já foi criado numa rodada anterior ────────────────────────────
  const { data: existentes } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
  })
  const jaExiste = new Set(existentes.map((p) => p.handle))
  const aCriar = CATALOGO.filter((p) => !jaExiste.has(p.handle))

  if (!aCriar.length) {
    logger.info("[produtos] todos já estão lá, nada a fazer")
    return
  }

  // ── fotos: baixa da loja atual, sobe pro Storage da loja nova ───────────
  // Apontar direto pro CDN da Nuvemshop seria mais rápido e errado: na virada
  // aquela loja sai do ar e a vitrine nova ficaria sem foto nenhuma.
  const fotosDe = new Map<string, string[]>()
  for (const produto of aCriar) {
    const urls: string[] = []
    for (const [i, origem] of produto.fotos.entries()) {
      const resposta = await fetch(origem)
      if (!resposta.ok) {
        logger.warn(`[produtos] foto ${i + 1} de ${produto.handle}: HTTP ${resposta.status}, pulei`)
        continue
      }
      const bytes = Buffer.from(await resposta.arrayBuffer())
      const {
        result: [arquivo],
      } = await uploadFilesWorkflow(container).run({
        input: {
          files: [
            {
              filename: `${produto.handle}-${i + 1}.webp`,
              mimeType: "image/webp",
              content: bytes.toString("base64"),
              access: "public",
            },
          ],
        },
      })
      urls.push(arquivo.url)
    }
    if (!urls.length) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Nenhuma foto subiu pra ${produto.handle}; abortei antes de criar produto sem imagem.`
      )
    }
    fotosDe.set(produto.handle, urls)
    logger.info(`[produtos] ${produto.handle}: ${urls.length} foto(s) no Storage`)
  }

  // ── os produtos ─────────────────────────────────────────────────────────
  // Preço base é o cheio; o desconto vem logo abaixo como lista de preço.
  // É assim que o Medusa devolve `original_price` e `calculated_price` pra
  // loja, que é o que a vitrine precisa pra riscar o "de".
  const { result: criados } = await createProductsWorkflow(container).run({
    input: {
      products: aCriar.map((p) => ({
        title: p.titulo,
        subtitle: p.subtitulo,
        handle: p.handle,
        description: p.descricao,
        status: ProductStatus.PUBLISHED,
        weight: p.pesoGramas,
        thumbnail: fotosDe.get(p.handle)![0],
        images: fotosDe.get(p.handle)!.map((url) => ({ url })),
        shipping_profile_id: perfilId,
        category_ids: [idDaCategoria.get(p.categoria)!],
        sales_channels: [{ id: canal.id }],
        options: [{ title: "Tamanho", values: ["Único"] }],
        variants: [
          {
            title: "Único",
            sku: p.sku,
            manage_inventory: true,
            options: { Tamanho: "Único" },
            prices: [{ amount: p.precoDe, currency_code: "brl" }],
          },
        ],
      })),
    },
  })
  logger.info(`[produtos] ${criados.length} produto(s) criado(s)`)

  // ── a promoção (o preço que o cliente paga hoje) ────────────────────────
  const precoPromocional = criados.flatMap((produto) => {
    const dados = aCriar.find((p) => p.handle === produto.handle)!
    return produto.variants.map((v) => ({
      variant_id: v.id,
      currency_code: "brl",
      amount: dados.preco,
    }))
  })

  await createPriceListsWorkflow(container).run({
    input: {
      price_lists_data: [
        {
          title: "Promoção de lançamento",
          description: "Preço promocional que estava valendo na loja atual em 19/09/2026.",
          // Sem `type`: o padrão do Medusa já é "sale", que é o que faz a loja
          // receber `original_price` (o cheio) junto de `calculated_price`.
          status: PriceListStatus.ACTIVE,
          prices: precoPromocional,
        },
      ],
    },
  })
  logger.info(`[produtos] promoção aplicada em ${precoPromocional.length} variação(ões)`)

  // ── estoque ─────────────────────────────────────────────────────────────
  const { data: variacoes } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "inventory_items.inventory_item_id"],
    filters: { sku: aCriar.map((p) => p.sku) },
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
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: niveis },
    })
    logger.info(`[produtos] ${ESTOQUE_INICIAL} unidades em ${niveis.length} item(ns) de estoque`)
  }

  logger.info("[produtos] pronto. Confira no admin, em Products.")
}
