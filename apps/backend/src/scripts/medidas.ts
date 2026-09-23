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
 * Vire `true` quando os números abaixo forem os que VOCÊ quer que a loja
 * cobre. Enquanto for `false`, o script se recusa a escrever em banco
 * remoto: medida errada vira preço de frete errado, que vira prejuízo seu
 * ou reclamação do cliente.
 *
 * Note que "autorizado" não é o mesmo que "certo" — medida marcada como
 * `provisoria` continua sendo chute, e o script grita isso em toda rodada.
 */
const AUTORIZADO = true

type Medida = {
  /** Gramas. Sem isto, o script usa o peso que já existe no cadastro. */
  peso?: number
  /** Centímetros, da caixa fechada — não do frasco. */
  comprimento: number
  largura: number
  altura: number
  /**
   * `true` diz que este número é um lugar-reservado, não uma medição.
   *
   * O dado mora na tabela e não numa chave global porque é POR PRODUTO: os
   * primeiros que vierem do Bling perdem a marca, os outros continuam com
   * ela, e o aviso encolhe sozinho até sumir.
   */
  provisoria?: true
}

/**
 * Handle do produto → medida da caixa.
 *
 * Handle que não está aqui aparece no fim como pendente. Produto que sai do
 * catálogo pode ficar sobrando nesta tabela sem quebrar nada — o script
 * avisa e segue.
 *
 * ┌─ HOJE É TUDO PROVISÓRIO, E ISSO TEM PREÇO ─────────────────────────────┐
 * │ 10 × 5 × 8 cm em todo produto é o lugar-reservado até o catálogo vir   │
 * │ do Bling com as medidas de verdade. Duas consequências, pra ficarem    │
 * │ escritas:                                                              │
 * │                                                                        │
 * │ 1. É MENOR que o mínimo dos Correios (16 × 11 × 2), então na prática   │
 * │    toda cotação sai como se a caixa fosse o mínimo. Pros frascos       │
 * │    avulsos isso está perto da verdade.                                 │
 * │                                                                        │
 * │ 2. Pro KIT COMPLETO não está: três produtos numa caixa de 10 × 5 × 8   │
 * │    não cabem. A cotação vai sair mais barata que a etiqueta, e a       │
 * │    diferença sai do bolso da loja em todo pedido de kit.               │
 * │                                                                        │
 * │ O PESO não é provisório: o cadastro já tinha o de cada produto, e o    │
 * │ script usa ele. Os dois kits de quantidade, que não tinham peso        │
 * │ nenhum, ganham unidades × peso do produto base — aritmética em cima    │
 * │ de número que o dono cadastrou, não chute meu.                         │
 * └────────────────────────────────────────────────────────────────────────┘
 */
const CAIXA_PROVISORIA = { comprimento: 10, largura: 5, altura: 8, provisoria: true } as const

const MEDIDAS: Record<string, Medida> = {
  "oleo-para-barba": { ...CAIXA_PROVISORIA },
  "shampoo-para-barba": { ...CAIXA_PROVISORIA },
  "balm-para-barba": { ...CAIXA_PROVISORIA },
  "fator-de-crescimento-para-barba": { ...CAIXA_PROVISORIA },
  "spray-modelador-matte-100ml-fucking-barba": { ...CAIXA_PROVISORIA },
  "kit-completo-para-barba": { ...CAIXA_PROVISORIA },
  "kit-2-fator-de-crescimento-para-barba": { ...CAIXA_PROVISORIA },
  "kit-3-fator-de-crescimento-para-barba": { ...CAIXA_PROVISORIA },
}

/** O último recurso, quando nem o cadastro nem a conta dos kits sabem. */
const PESO_PROVISORIO = 100

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
  if (remoto && !AUTORIZADO) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "As medidas ainda não foram autorizadas. Preencha a tabela em " +
        "src/scripts/medidas.ts, confira os números, vire AUTORIZADO " +
        "para true, e rode de novo."
    )
  }

  const { data: produtos } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "title",
      "weight",
      "status",
      "metadata",
      "variants.id",
      "variants.title",
      "variants.weight",
    ],
  })

  /*
    O PESO DOS KITS DE QUANTIDADE SAI DE CONTA, NÃO DE CHUTE.

    Kit de 2 e kit de 3 nasceram sem peso — eles são produtos próprios no
    Medusa, criados pelo antigo `kits-de-quantidade.ts`, e ninguém digitou o peso
    deles. Mas o `metadata` diz de qual produto eles são kit e de quantas
    unidades, e o produto base TEM peso cadastrado. Então dois frascos de
    95 g pesam 190 g, e isso é aritmética em cima de um número que o dono
    já tinha escrito.

    Fica abaixo do real pela embalagem do kit, que ninguém pesou. É o erro
    menos ruim disponível — e some quando as medidas vierem do Bling.
  */
  const pesoPorHandle = new Map(
    produtos.flatMap((p) => (p.handle && p.weight ? [[p.handle, p.weight] as const] : []))
  )
  const pesoDeKit = (metadata: unknown): number | null => {
    const m = (metadata ?? {}) as Record<string, unknown>
    const base = typeof m.base === "string" ? pesoPorHandle.get(m.base) : undefined
    const unidades = Number(m.unidades)
    if (!base || !Number.isInteger(unidades) || unidades < 2) return null
    return base * unidades
  }

  const pendencias: Pendencia[] = []
  /*
    Os avisos são JUNTADOS e impressos UMA VEZ no fim, em vez de sair um por
    variante dentro do laço. Com dez variantes, o aviso por variante vira
    dez linhas quase iguais — e aviso repetido é aviso que se aprende a
    pular. Uma linha dizendo "seis produtos estão com caixa provisória" é
    uma linha que alguém lê.
  */
  let rascunhos = 0
  const provisorias = new Set<string>()
  const abaixoDoMinimo = new Set<string>()
  /** Quem nem peso tinha: nem cadastrado, nem calculável pelos kits. */
  const semPeso: string[] = []
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

    /*
      RASCUNHO NÃO PRECISA DE MEDIDA.

      Produto que não está publicado não entra em carrinho nenhum, então não
      existe cotação pra ele errar. Exigir medida de rascunho fazia este
      script parar em dois "Óleo para Barba Ação Nº1/Nº2" que sobraram de uma
      semeadura que deu errado — e uma trava que trava pelo motivo errado é
      uma trava que alguém desliga.

      No dia em que o rascunho for publicado, ele aparece aqui como pendente,
      que é exatamente quando a medida passa a importar.
    */
    if (produto.status !== "published") {
      rascunhos++
      continue
    }

    for (const variante of produto.variants ?? []) {
      if (!variante?.id) continue

      /*
        A ORDEM DO PESO, do mais explícito pro mais chutado:

          1. o `peso` da tabela aqui do lado — alguém escreveu de propósito;
          2. o peso da VARIANTE, se já estiver preenchido;
          3. o peso do PRODUTO, que é onde o catálogo antigo guardava;
          4. unidades × peso da base, pros kits de quantidade;
          5. o provisório, que é o último recurso e sai avisado.

        A tabela vem em primeiro, e não em terceiro, porque senão ela não
        CONSERTA nada: um peso errado escrito na variante ficaria pra sempre,
        e a única saída seria mexer no banco à mão. Script que não consegue
        corrigir o que ele mesmo escreveu é script que se usa uma vez só.
      */
      const peso = medida?.peso ?? variante.weight ?? produto.weight ?? pesoDeKit(produto.metadata)

      /*
        Sem medida na tabela, o produto vira pendência e o script termina em
        erro. Sem PESO, porém, o último recurso é o provisório: é melhor uma
        cotação com peso de lugar-reservado do que nenhuma opção de entrega,
        que é o que acontece quando este script se recusa a terminar.
      */
      if (!medida) {
        pendencias.push({
          handle,
          nome: produto.title ?? handle,
          falta: "medidas da caixa",
        })
        continue
      }
      if (peso === null) {
        semPeso.push(`${produto.title ?? handle} (${handle})`)
      }

      const pequenas = (["comprimento", "largura", "altura"] as const).filter(
        (d) => medida[d] < MINIMO[d]
      )
      if (pequenas.length) abaixoDoMinimo.add(handle)

      if (medida.provisoria) provisorias.add(handle)

      aEscrever.push({
        id: variante.id,
        weight: peso ?? PESO_PROVISORIO,
        length: medida.comprimento,
        width: medida.largura,
        height: medida.altura,
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

  if (rascunhos) {
    logger.info(`[medidas] ${rascunhos} produto(s) em rascunho ficaram de fora — não são vendidos`)
  }

  if (semPeso.length) {
    logger.warn(
      `[medidas] ${semPeso.length} variante(s) sem peso em lugar nenhum — ficaram com ` +
        `${PESO_PROVISORIO} g de lugar-reservado: ${semPeso.join(", ")}`
    )
  }

  if (abaixoDoMinimo.size) {
    logger.info(
      `[medidas] ${abaixoDoMinimo.size} produto(s) com caixa menor que o mínimo dos Correios ` +
        `(${MINIMO.comprimento}×${MINIMO.largura}×${MINIMO.altura} cm) — a cotação sai como se ` +
        "fosse o mínimo de qualquer jeito. Não é erro, é só medida que não muda nada."
    )
  }

  if (provisorias.size) {
    /*
      ESTE AVISO É O PONTO DO CAMPO `provisoria`.

      Ele sai em TODA rodada, com nome e tudo, porque medida de
      lugar-reservado não dá erro em lugar nenhum: a loja cota, vende,
      despacha, e a conta só aparece no extrato do fim do mês. Enquanto
      alguém estiver lendo este log, a dívida continua visível.
    */
    logger.warn(
      `\n[medidas] ⚠  ${provisorias.size} produto(s) estão com MEDIDA PROVISÓRIA:\n` +
        [...provisorias].map((h) => `  · ${h}`).join("\n") +
        "\n     A cotação desses sai pelo tamanho errado — pra caixa grande, mais barata " +
        "\n     que a etiqueta, e a diferença é sua. Troque na tabela MEDIDAS assim que as " +
        "\n     medidas de verdade existirem, e apague o `provisoria: true` de cada uma."
    )
    return
  }

  logger.info("[medidas] todas as variantes têm peso e medida conferidos")
}
