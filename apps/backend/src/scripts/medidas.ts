import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows"
import { ondeEstou } from "./onde-estou"

/**
 * PESO E MEDIDA DE CAIXA, NA VARIANTE.
 *
 *   npm run backend:medidas
 *
 * ┌─ A DESCOBERTA QUE ATRASOU O FRETE ─────────────────────────────────────┐
 * │ O Medusa entrega ao provedor de frete o peso e as medidas da           │
 * │ VARIANTE. O catálogo tinha peso cadastrado — 80 g, 140 g, 95 g — mas   │
 * │ no PRODUTO, que é outro campo e nunca chega na cotação. Medidas não    │
 * │ existiam em lugar nenhum, e os dois kits de quantidade não tinham nem  │
 * │ peso: um carrinho com kit cotaria como se fosse ar.                    │
 * │                                                                         │
 * │ Ninguém percebe isso olhando o admin: os dois campos se chamam igual,  │
 * │ em telas diferentes, e o de cima é o que aparece primeiro.             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTE SCRIPT FAZ, em ordem:
 *
 *   1. PESO: copia o do produto pra variante quando a variante não tem. Não
 *      é número inventado — é o número que já estava cadastrado, no lugar
 *      onde a cotação consegue ler.
 *   2. MEDIDA: escreve a da tabela abaixo. Esta ninguém tem como adivinhar,
 *      e por isso é digitada à mão.
 *   3. LISTA o que ficou faltando, com nome e handle, e termina em erro se
 *      faltar alguma coisa — pra não passar num CI dizendo que está tudo bem.
 *
 * UNIDADES: peso em GRAMAS, medidas em CENTÍMETROS. O cliente da Frenet
 * converte grama pra quilo na hora de cotar (`modules/frenet/client.ts`), e
 * é o único lugar que converte. Digitar quilo aqui multiplica todo frete por
 * mil — o cliente da Frenet recusa cotação acima de 30 kg justamente pra que
 * esse erro apareça como erro e não como preço absurdo.
 *
 * A MEDIDA É DA CAIXA FECHADA, como ela vai pro balcão — não do frasco. A
 * transportadora cobra pelo que ela mede, e mede a caixa.
 */

/* ─────────────────────────────────────────────────────────────────────────
   AS MEDIDAS. Preencher antes de rodar em produção.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Vire `true` quando as medidas abaixo forem as SUAS, conferidas com régua
 * numa caixa montada de verdade. Enquanto for `false`, o script se recusa a
 * escrever em banco remoto — mesma trava do `frete.ts`, e pelo mesmo motivo:
 * medida errada vira preço de frete errado, que vira prejuízo ou reclamação.
 */
const CONFERIDO = false

type Medida = {
  /** Gramas. Sem isto, usa o peso do produto — se ele existir. */
  peso?: number
  /** Centímetros, da caixa fechada. */
  comprimento: number
  largura: number
  altura: number
}

/**
 * Handle do produto → medida da caixa.
 *
 * Handle que não está aqui aparece no fim como pendente. Produto que sai do
 * catálogo pode ficar sobrando nesta tabela sem quebrar nada — o script
 * avisa e segue.
 */
const MEDIDAS: Record<string, Medida> = {
  // "oleo-para-barba": { comprimento: 16, largura: 11, altura: 6 },
  // "shampoo-para-barba": { comprimento: 18, largura: 11, altura: 7 },
  // "balm-para-barba": { comprimento: 16, largura: 11, altura: 7 },
  // "fator-de-crescimento-para-barba": { comprimento: 16, largura: 11, altura: 6 },
  // "spray-modelador-matte-100ml-fucking-barba": { comprimento: 20, largura: 11, altura: 7 },
  // "kit-completo-para-barba": { comprimento: 25, largura: 18, altura: 10 },
  // "kit-2-fator-de-crescimento-para-barba": { peso: 190, comprimento: 18, largura: 12, altura: 8 },
  // "kit-3-fator-de-crescimento-para-barba": { peso: 285, comprimento: 20, largura: 14, altura: 9 },
}

/* ───────────────────────────────────────────────────────────────────────── */

/**
 * O MÍNIMO DOS CORREIOS — 16 × 11 × 2 cm.
 *
 * Não é validação nossa: encomenda menor que isso é cobrada como se tivesse
 * esse tamanho. Medida abaixo do mínimo não é erro, é só desperdício de
 * digitação — a cotação vai sair igual. O aviso existe pra ninguém achar
 * que reduzir a caixa no papel reduz o frete.
 */
const MINIMO = { comprimento: 16, largura: 11, altura: 2 }

type Pendencia = { handle: string; nome: string; falta: string }

export default async function medidas({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  ondeEstou(logger, "medidas")

  const remoto = !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")
  if (remoto && !CONFERIDO) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "As medidas ainda não foram conferidas. Preencha a tabela em " +
        "src/scripts/medidas.ts, meça uma caixa de verdade, vire CONFERIDO " +
        "para true, e rode de novo."
    )
  }

  const { data: produtos } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "title", "weight", "variants.id", "variants.title", "variants.weight"],
  })

  const pendencias: Pendencia[] = []
  /*
    Uma chamada só, com todas as variantes: o workflow aceita `selector` +
    `update` (uma regra pra muitas) ou `product_variants` (cada uma com o
    seu id). Aqui cada variante tem medida própria, então é a segunda forma
    — e uma ida ao banco em vez de oito.
  */
  const aEscrever: {
    id: string
    weight: number
    length: number
    width: number
    height: number
  }[] = []

  for (const produto of produtos) {
    const handle = produto.handle ?? ""
    const medida = MEDIDAS[handle]

    for (const variante of produto.variants ?? []) {
      if (!variante?.id) continue

      /*
        O peso da variante ganha do peso do produto: quem já ajustou a
        variante à mão sabe de algo que esta tabela não sabe. O do produto é
        o fallback, e a tabela só entra quando nenhum dos dois existe — é o
        caso dos kits, que nasceram sem peso nenhum.
      */
      const peso = variante.weight ?? produto.weight ?? medida?.peso ?? null

      const faltando: string[] = []
      if (peso === null) faltando.push("peso")
      if (!medida) faltando.push("medidas da caixa")

      if (faltando.length) {
        pendencias.push({
          handle,
          nome: produto.title ?? handle,
          falta: faltando.join(" e "),
        })
        continue
      }

      if (medida) {
        const pequenas = (["comprimento", "largura", "altura"] as const).filter(
          (d) => medida[d] < MINIMO[d]
        )
        if (pequenas.length) {
          logger.warn(
            `[medidas] ${handle}: ${pequenas.join(", ")} abaixo do mínimo dos Correios ` +
              `(${MINIMO.comprimento}×${MINIMO.largura}×${MINIMO.altura} cm). A cotação vai sair ` +
              "como se fosse o mínimo de qualquer jeito."
          )
        }
      }

      aEscrever.push({
        id: variante.id,
        weight: peso!,
        length: medida!.comprimento,
        width: medida!.largura,
        height: medida!.altura,
      })
    }
  }

  const doCatalogo = new Set(produtos.map((p) => p.handle ?? ""))
  for (const handle of Object.keys(MEDIDAS)) {
    if (!doCatalogo.has(handle)) {
      logger.warn(`[medidas] "${handle}" está na tabela e não existe mais no catálogo — ignorado`)
    }
  }

  if (aEscrever.length) {
    await updateProductVariantsWorkflow(container).run({
      input: { product_variants: aEscrever },
    })
    logger.info(`[medidas] ${aEscrever.length} variante(s) com peso e medida gravados`)
  }

  if (pendencias.length) {
    logger.warn(`\n[medidas] FALTA MEDIR ${pendencias.length} variante(s):`)
    for (const p of pendencias) {
      logger.warn(`  · ${p.nome}  (${p.handle}) — falta ${p.falta}`)
    }
    /*
      Termina em ERRO, e não só com aviso. Variante sem medida cota como a
      menor caixa possível: a loja anuncia um frete barato e paga a etiqueta
      cara, em silêncio, em todo pedido que levar aquele item. Erro é o que
      faz alguém olhar.
    */
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${pendencias.length} variante(s) sem peso ou medida. Preencha a tabela MEDIDAS em ` +
        "src/scripts/medidas.ts e rode de novo — frete cotado sem medida sai errado."
    )
  }

  logger.info("[medidas] todas as variantes têm peso e medida")
}
