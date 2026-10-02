import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createCartWorkflow, updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows"
import { ondeEstou } from "./onde-estou"

/**
 * QUANTO CADA CLIQUE DA SACOLA ESPERA O BANCO (entrega 0251). Só mede — rode
 * uma vez no shell do Railway e cole o resultado:
 *
 *   cd apps/backend/.medusa/server && npx medusa exec ./src/scripts/medir-banco.js
 *
 * ┌─ POR QUE ─────────────────────────────────────────────────────────────┐
 * │ Cada "Adicionar" ou "+" da sacola é um workflow do Medusa com umas 76  │
 * │ consultas ao banco, quase todas uma depois da outra (contado no banco  │
 * │ local, 02/10). No banco local o clique leva ~0,1 s; na loja no ar,     │
 * │ ~1,3 s. A diferença é o que cada ida custa lá — e é isto que se mede:  │
 * │ uma ida vazia ao banco, uma ao Redis (a trava do carrinho), a leitura  │
 * │ da sacola e a escrita de verdade.                                      │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO MUDA A LOJA: o carrinho de teste não tem e-mail nem cliente (não entra
 * em fluxo nenhum do CRM nem nos Carrinhos do painel) e é apagado no fim,
 * mesmo se algo falhar no meio.
 */

const CAMPOS_DA_GAVETA = [
  "id",
  "total",
  "subtotal",
  "item_total",
  "items.*",
  "items.adjustments.code",
  "shipping_methods.*",
  "promotions.code",
]

const ms = (inicio: number) => performance.now() - inicio
const mediana = (l: number[]) => [...l].sort((a, b) => a - b)[Math.floor(l.length / 2)] ?? 0
const p90 = (l: number[]) => [...l].sort((a, b) => a - b)[Math.floor(l.length * 0.9)] ?? 0
const fmt = (n: number) => `${n < 10 ? n.toFixed(1).replace(".", ",") : Math.round(n)} ms`

type Banco = { raw: (sql: string) => Promise<unknown> }
type SacolaDeTeste = { id: string }

export default async function medirBanco({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const banco = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Banco
  ondeEstou(logger, "medir-banco")
  const linhas: string[] = []
  const anotar = (s: string) => {
    linhas.push(s)
    logger.info(`[medir-banco] ${s}`)
  }
  const regiao = process.env.RAILWAY_REPLICA_REGION
  if (regiao) anotar(`região do Railway: ${regiao}`)

  // ── 1. uma ida vazia ao banco ─────────────────────────────────────────────
  await banco.raw("select 1") // a primeira abre a conexão: não conta
  const idas: number[] = []
  for (let i = 0; i < 30; i++) {
    const t = performance.now()
    await banco.raw("select 1")
    idas.push(ms(t))
  }
  anotar(
    `banco, uma ida vazia (select 1, 30x): mediana ${fmt(mediana(idas))}, p90 ${fmt(p90(idas))}`
  )

  // ── 2. uma ida ao Redis: a trava que o Medusa põe no carrinho a cada escrita
  try {
    const trava = container.resolve(Modules.LOCKING)
    const travas: number[] = []
    for (let i = 0; i < 10; i++) {
      const chave = `medir-banco-${Date.now()}-${i}`
      const t = performance.now()
      await trava.acquire(chave, { ownerId: "medir-banco", expire: 5 })
      await trava.release(chave, { ownerId: "medir-banco" })
      travas.push(ms(t))
    }
    anotar(`trava (Redis, pôr e tirar, 10x): mediana ${fmt(mediana(travas))}`)
  } catch (e) {
    anotar(`trava: não deu pra medir (${e instanceof Error ? e.message : String(e)})`)
  }

  // ── 3 e 4. a sacola de teste: criar, ler, mudar a quantidade ──────────────
  const { data: regioes } = await query.graph({ entity: "region", fields: ["id"] })
  const { data: variantes } = await query.graph({
    entity: "product_variant",
    fields: ["id", "product.status"],
    pagination: { take: 30 },
  })
  const candidatas = (variantes as { id: string; product?: { status?: string } | null }[])
    .filter((v) => v.product?.status === "published")
    .map((v) => v.id)

  let carrinho: SacolaDeTeste | null = null
  try {
    for (const variante of candidatas.slice(0, 5)) {
      try {
        const t = performance.now()
        const { result } = await createCartWorkflow(container).run({
          input: { region_id: regioes[0]?.id, items: [{ variant_id: variante, quantity: 1 }] },
        })
        anotar(`criar a sacola com 1 produto (o 1º "Adicionar"): ${fmt(ms(t))}`)
        carrinho = result as unknown as SacolaDeTeste
        break
      } catch {
        // Sem estoque ou sem preço: tenta a próxima.
      }
    }
    if (!carrinho) {
      anotar("a sacola de teste não nasceu (nenhuma das 5 primeiras variantes aceitou)")
      return
    }

    const leituras: number[] = []
    for (let i = 0; i < 5; i++) {
      const t = performance.now()
      await query.graph({ entity: "cart", fields: CAMPOS_DA_GAVETA, filters: { id: carrinho.id } })
      leituras.push(ms(t))
    }
    anotar(`ler a sacola (5x): mediana ${fmt(mediana(leituras))}`)

    const { data: lidos } = await query.graph({
      entity: "cart",
      fields: ["id", "items.id"],
      filters: { id: carrinho.id },
    })
    const linha = (lidos[0] as { items?: { id: string }[] | null } | undefined)?.items?.[0]?.id
    if (!linha) {
      anotar("a sacola de teste veio sem a linha do produto")
      return
    }
    const escritas: number[] = []
    for (const quantidade of [2, 1, 2, 1, 2]) {
      const t = performance.now()
      await updateLineItemInCartWorkflow(container).run({
        input: { cart_id: carrinho.id, item_id: linha, update: { quantity: quantidade } },
      })
      escritas.push(ms(t))
    }
    anotar(
      `mudar a quantidade (o "+", 5x): mediana ${fmt(mediana(escritas))} ` +
        `(${escritas.map((n) => Math.round(n)).join(", ")})`
    )
  } finally {
    if (carrinho) {
      try {
        await container.resolve(Modules.CART).deleteCarts([carrinho.id])
        anotar("sacola de teste apagada")
      } catch (e) {
        anotar(
          `a sacola de teste ${carrinho.id} NÃO foi apagada: ${e instanceof Error ? e.message : String(e)}`
        )
      }
    }
    logger.info(`[medir-banco] resumo pra colar na conversa:\n${linhas.join("\n")}`)
  }
}
