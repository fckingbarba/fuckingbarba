import { reais } from "./formato"
import { datasDo, dentro, type Janela, type Periodo, type Venda } from "./marketing"
import type { Achado } from "./marketing-canais"
import { nomeCurto } from "./pedido"
import type { ProdutoCru } from "./produtos"
import type { LinhaGa4, RelatorioGa4 } from "./visitas"

/**
 * OS PRODUTOS DO MARKETING — o que cada produto atrai, põe na sacola e vende.
 * A aba "Produtos" do protótipo. Código puro, com testes
 * (`__tests__/marketing-produtos.unit.spec.ts`).
 *
 * AS VISITAS E A SACOLA são do GA4, pelos eventos que a loja manda com o item
 * (`view_item` e `add_to_cart`, com o id da variante no Medusa): as métricas
 * de item (`itemsViewed`, `itemsAddedToCart`), só das variantes da loja nova
 * — "variant_…"; as do site antigo são números (`SO_AS_VARIANTES_DA_LOJA`).
 * Contam vezes, e não pessoas: quem abre a página duas vezes conta duas.
 * O VENDIDO E A RECEITA são os pedidos pagos da loja; O ESTOQUE, o que dá pra
 * vender (`estoquesDos`).
 */

export const SO_AS_VARIANTES_DA_LOJA = {
  filter: { fieldName: "itemId", stringFilter: { matchType: "BEGINS_WITH", value: "variant_" } },
}

/** A pergunta ao GA4: quantas vezes cada variante foi vista e posta na sacola. */
export function perguntaDosProdutos(periodo: Periodo) {
  return {
    dateRanges: datasDo(periodo),
    dimensions: [{ name: "itemId" }],
    metrics: [{ name: "itemsViewed" }, { name: "itemsAddedToCart" }],
    dimensionFilter: SO_AS_VARIANTES_DA_LOJA,
    limit: "1000",
  }
}

/** Um produto do catálogo, como a conta usa: as variantes (os ids do GA4) e o estoque. */
export type ProdutoDoCatalogo = {
  id: string
  handle: string
  nome: string
  imagem: string | null
  publicado: boolean
  variantes: string[]
  /** O que dá pra vender; `null`: o produto não controla estoque. */
  estoque: number | null
}

export type Sinal = "esgotado" | "acabando" | "pouca-sacola" | "vendendo" | "sem-venda"

export type ProdutoNoMarketing = {
  id: string
  nome: string
  imagem: string | null
  /** Quantas vezes a página foi vista; `null` sem o Google. */
  visitas: number | null
  /** De cada 100 vezes que a página foi vista, quantas viraram sacola; `null` sem visita. */
  sacola: number | null
  vendidos: number
  receita: number
  estoque: number | null
  sinais: Sinal[]
}

/** Menos que isso pra vender: acabando. */
export const ACABANDO = 10
/** Com menos visita que isso, a sacola de um produto pode ser acaso. */
export const MINIMO_DE_VISITAS = 30

const numero = (v: string | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}
const dimensao = (l: LinhaGa4, i: number) => l.dimensionValues?.[i]?.value ?? ""
const metrica = (l: LinhaGa4, i: number) => numero(l.metricValues?.[i]?.value ?? undefined)
const centavos = (v: number) => Math.round(v * 100) / 100
const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null)

/**
 * A lista: os produtos publicados (e o que vendeu no período, mesmo tirado do
 * site), do que mais vendeu pro que menos, com os sinais. `ga`: a resposta
 * do GA4, ou `null` sem o Google (as visitas e a sacola ficam em branco).
 */
export function montarProdutos(
  catalogo: ProdutoDoCatalogo[],
  vendas: Venda[],
  j: Janela,
  ga: RelatorioGa4 | null
): { produtos: ProdutoNoMarketing[]; achado: Achado | null } {
  const doProduto = new Map<string, string>()
  for (const p of catalogo) for (const v of p.variantes) doProduto.set(v, p.id)
  const vistas = new Map<string, { vistas: number; sacola: number }>()
  for (const l of ga?.rows ?? []) {
    const id = doProduto.get(dimensao(l, 0))
    if (!id) continue
    const atual = vistas.get(id) ?? { vistas: 0, sacola: 0 }
    atual.vistas += metrica(l, 0)
    atual.sacola += metrica(l, 1)
    vistas.set(id, atual)
  }
  const vendido = new Map<string, { unidades: number; receita: number }>()
  for (const v of vendas) {
    if (!dentro(v.pagoEm, j)) continue
    for (const i of v.itens) {
      const atual = vendido.get(i.produto) ?? { unidades: 0, receita: 0 }
      atual.unidades += i.unidades
      atual.receita = centavos(atual.receita + i.receita)
      vendido.set(i.produto, atual)
    }
  }

  const produtos: ProdutoNoMarketing[] = catalogo
    .filter((p) => p.publicado || vendido.has(p.id))
    .map((p) => {
      const g = vistas.get(p.id)
      const s = vendido.get(p.id)
      return {
        id: p.id,
        nome: p.nome,
        imagem: p.imagem,
        visitas: ga ? (g?.vistas ?? 0) : null,
        sacola: ga && g?.vistas ? Math.round((g.sacola / g.vistas) * 100) : null,
        vendidos: s?.unidades ?? 0,
        receita: s?.receita ?? 0,
        estoque: p.estoque,
        sinais: [],
      }
    })

  const comVisita = produtos.filter(
    (p) => (p.visitas ?? 0) >= MINIMO_DE_VISITAS && p.sacola !== null
  )
  const mediaDaSacola = media(comVisita.map((p) => p.sacola!))
  for (const p of produtos) {
    if (p.estoque === 0) p.sinais.push("esgotado")
    else if (p.estoque !== null && p.estoque < ACABANDO) p.sinais.push("acabando")
    if (
      mediaDaSacola !== null &&
      comVisita.length > 1 &&
      (p.visitas ?? 0) >= MINIMO_DE_VISITAS &&
      p.sacola !== null &&
      p.sacola < mediaDaSacola * 0.6
    )
      p.sinais.push("pouca-sacola")
    if (!p.sinais.length) p.sinais.push(p.vendidos ? "vendendo" : "sem-venda")
  }
  produtos.sort(
    (a, b) =>
      b.receita - a.receita || (b.visitas ?? 0) - (a.visitas ?? 0) || a.nome.localeCompare(b.nome)
  )
  return { produtos, achado: ga ? achadoDosProdutos(produtos, comVisita) : null }
}

/** Abaixo disso de visitas nos produtos, qualquer diferença entre eles pode ser acaso. */
export const MINIMO_PRA_COMPARAR = 200

/**
 * O que a lista quer dizer, numa frase: o produto muito visto que pouca
 * gente põe na sacola; ou o esgotado que ainda recebe visita; ou o que mais
 * vende. Com pouca visita, que ainda é cedo.
 */
export function achadoDosProdutos(
  produtos: ProdutoNoMarketing[],
  comVisita: ProdutoNoMarketing[]
): Achado | null {
  const total = produtos.reduce((s, p) => s + (p.visitas ?? 0), 0)
  if (total < MINIMO_PRA_COMPARAR)
    return {
      tipo: "info",
      titulo: "Ainda é pouco pra comparar os produtos",
      texto:
        `As páginas dos produtos foram vistas ${total} ${total === 1 ? "vez" : "vezes"} no período: ` +
        "qualquer diferença entre eles pode ser acaso. Com mais gente (depois da virada), aqui aparece " +
        "o produto que mais perde gente.",
    }
  const [pouca] = produtos
    .filter((p) => p.sinais.includes("pouca-sacola"))
    .sort((a, b) => (b.visitas ?? 0) - (a.visitas ?? 0))
  if (pouca) {
    const outros = media(comVisita.filter((p) => p.id !== pouca.id).map((p) => p.sacola!)) ?? 0
    const aMais = Math.round(((pouca.visitas ?? 0) * (outros - pouca.sacola!)) / 100)
    return {
      tipo: "oportunidade",
      titulo: `${pouca.nome}: muita visita, pouca sacola`,
      texto:
        `A página foi vista ${pouca.visitas} vezes e só ${pouca.sacola}% virou sacola — a média dos ` +
        `outros é ${Math.round(outros)}%. Se chegasse nela, seriam uns ${aMais} a mais na sacola no ` +
        "período. Vale revisar a página: as fotos, o texto e o que aparece abaixo do preço.",
    }
  }
  const esgotado = produtos.find(
    (p) => p.sinais.includes("esgotado") && (p.visitas ?? 0) >= MINIMO_DE_VISITAS
  )
  if (esgotado)
    return {
      tipo: "problema",
      titulo: `${esgotado.nome} está esgotado e ainda recebe visita`,
      texto: `A página foi vista ${esgotado.visitas} vezes no período, e ninguém consegue comprar. Vale repor, ou tirar o destaque dele.`,
    }
  const [primeiro] = produtos
  return primeiro?.receita
    ? {
        tipo: "bom",
        titulo: `${primeiro.nome} é o que mais vende`,
        texto: `${reais(primeiro.receita)} em ${primeiro.vendidos} ${primeiro.vendidos === 1 ? "unidade" : "unidades"} no período.`,
      }
    : null
}

/** O catálogo como a conta usa: os produtos do Medusa e o estoque de cada um (`estoquesDos`). */
export function catalogoDos(
  produtos: ProdutoCru[],
  estoques: ReadonlyMap<string, number | null>
): ProdutoDoCatalogo[] {
  return produtos
    .filter((p) => p.handle)
    .map((p) => ({
      id: p.id,
      handle: p.handle!,
      nome: nomeCurto(p.title ?? p.handle!),
      imagem: p.thumbnail ?? p.images?.[0]?.url ?? null,
      publicado: p.status === "published",
      variantes: (p.variants ?? []).map((v) => v.id),
      estoque: estoques.get(p.id) ?? null,
    }))
}
