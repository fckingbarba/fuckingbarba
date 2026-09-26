import { PREFIXO_DO_BUMP } from "../bumps"
import { lerPdp } from "../pdp"
import { reais } from "./formato"
import { dentro, type Janela, type Venda } from "./marketing"
import type { Achado } from "./marketing-canais"
import { nomeCurto } from "./pedido"
import { caixaDo, type ProdutoCru } from "./produtos"

/**
 * AS OFERTAS DO MARKETING — o que a caixa de compra e a oferta do checkout
 * somam, e os cupons. A aba "Ofertas" do protótipo. Código puro, com testes
 * (`__tests__/marketing-ofertas.unit.spec.ts`).
 *
 * A CAIXA DE COMPRA de cada produto (abaixo do preço, na página dele) mostra
 * uma coisa ou outra (`caixaDo`, em `produtos.ts`):
 * - QUANTAS UNIDADES (o order bump da página): funcionou quando o pedido
 *   leva 2 ou mais daquele produto;
 * - LEVE JUNTO (o cross-sell, até 2 produtos): funcionou quando o pedido
 *   leva o produto E um dos de junto. A loja não marca no item que ele veio
 *   do "leve junto": é a conta possível sem a marca (a pessoa pode ter posto
 *   os dois na sacola por outro caminho).
 *
 * A OFERTA DO CHECKOUT (a caixinha antes de pagar) entra com o código da
 * promoção daquele produto, "BUMP-…" (`lib/bumps.ts`): o ajuste no item diz
 * quem aceitou, com certeza. OS CUPONS são os outros códigos nos ajustes:
 * quantos pedidos pagos usaram, quanto deram de desconto e quanto somaram.
 */

/** A caixa de compra de um produto publicado, pro que a conta precisa. */
export type CaixaDoProduto = {
  id: string
  handle: string
  nome: string
  imagem: string | null
  modo: "unidades" | "junto"
  /** Os endereços dos produtos do "leve junto". */
  junto: string[]
}

export type ResultadoDaCaixa =
  | { modo: "unidades"; pedidos: number; comMais: number; parte: number | null }
  | { modo: "junto"; pedidos: number; comJunto: number; parte: number | null; somou: number }

export type OfertaDoProduto = {
  id: string
  nome: string
  imagem: string | null
  /** Os nomes dos produtos do "leve junto". */
  junto: string[]
  resultado: ResultadoDaCaixa
}

export type Cupom = { codigo: string; usos: number; desconto: number; vendeu: number }

export type Ofertas = {
  porProduto: OfertaDoProduto[]
  numeros: {
    /** Dos pedidos com um produto de "quantas unidades", quantos levaram 2 ou mais dele. */
    unidades: { pedidos: number; comMais: number; parte: number | null }
    /** Quantas vezes o "leve junto" foi levado, e quanto somou. */
    junto: { vezes: number; somou: number }
    /** Os pedidos que aceitaram a oferta do checkout; "1 em cada `deCada`"; e quanto somou. */
    checkout: { pedidos: number; deCada: number | null; somou: number }
  }
  cupons: Cupom[]
  achados: Achado[]
}

const centavos = (v: number) => Math.round(v * 100) / 100
const parte = (de: number, em: number) => (em ? Math.round((de / em) * 100) : null)
const ehBump = (codigo: string) => codigo.startsWith(PREFIXO_DO_BUMP)

export function montarOfertas(caixas: CaixaDoProduto[], vendas: Venda[], j: Janela): Ofertas {
  const pagas = vendas.filter((v) => dentro(v.pagoEm, j))
  const nomes = new Map(caixas.map((c) => [c.handle, c.nome]))

  const porProduto: OfertaDoProduto[] = caixas.map((c) => {
    const comEle = pagas.filter((v) => v.itens.some((i) => i.produto === c.id))
    const base = { id: c.id, nome: c.nome, imagem: c.imagem }
    if (c.modo === "unidades") {
      const comMais = comEle.filter(
        (v) => v.itens.filter((i) => i.produto === c.id).reduce((s, i) => s + i.unidades, 0) >= 2
      ).length
      return {
        ...base,
        junto: [],
        resultado: {
          modo: "unidades",
          pedidos: comEle.length,
          comMais,
          parte: parte(comMais, comEle.length),
        },
      }
    }
    const deJunto = new Set(c.junto)
    const levou = (v: Venda) => v.itens.filter((i) => i.handle && deJunto.has(i.handle))
    const comJunto = comEle.filter((v) => levou(v).length)
    return {
      ...base,
      junto: c.junto.map((h) => nomes.get(h) ?? h),
      resultado: {
        modo: "junto",
        pedidos: comEle.length,
        comJunto: comJunto.length,
        parte: parte(comJunto.length, comEle.length),
        somou: centavos(
          comJunto.reduce((s, v) => s + levou(v).reduce((t, i) => t + i.receita, 0), 0)
        ),
      },
    }
  })

  const unidades = porProduto.flatMap((p) => (p.resultado.modo === "unidades" ? [p.resultado] : []))
  const junto = porProduto.flatMap((p) => (p.resultado.modo === "junto" ? [p.resultado] : []))
  const comBump = pagas.filter((v) => v.itens.some((i) => i.ajustes.some((a) => ehBump(a.codigo))))
  const numeros: Ofertas["numeros"] = {
    unidades: {
      pedidos: unidades.reduce((s, r) => s + r.pedidos, 0),
      comMais: unidades.reduce((s, r) => s + r.comMais, 0),
      parte: parte(
        unidades.reduce((s, r) => s + r.comMais, 0),
        unidades.reduce((s, r) => s + r.pedidos, 0)
      ),
    },
    junto: {
      vezes: junto.reduce((s, r) => s + r.comJunto, 0),
      somou: centavos(junto.reduce((s, r) => s + r.somou, 0)),
    },
    checkout: {
      pedidos: comBump.length,
      deCada: comBump.length ? Math.round(pagas.length / comBump.length) : null,
      somou: centavos(
        comBump.reduce(
          (s, v) =>
            s +
            v.itens
              .filter((i) => i.ajustes.some((a) => ehBump(a.codigo)))
              .reduce((t, i) => t + i.receita, 0),
          0
        )
      ),
    },
  }

  const cupons = new Map<string, Cupom>()
  for (const v of pagas) {
    const usados = new Set<string>()
    for (const i of v.itens)
      for (const a of i.ajustes) {
        if (ehBump(a.codigo)) continue
        const c = cupons.get(a.codigo) ?? { codigo: a.codigo, usos: 0, desconto: 0, vendeu: 0 }
        c.desconto = centavos(c.desconto + a.valor)
        cupons.set(a.codigo, c)
        usados.add(a.codigo)
      }
    for (const codigo of usados) {
      const c = cupons.get(codigo)!
      c.usos++
      c.vendeu = centavos(c.vendeu + v.total)
    }
  }

  const semAchados: Omit<Ofertas, "achados"> = {
    porProduto,
    numeros,
    cupons: [...cupons.values()].sort((a, b) => b.usos - a.usos || b.vendeu - a.vendeu),
  }
  return { ...semAchados, achados: achadosDasOfertas(semAchados, pagas.length) }
}

/** Abaixo disso de pedidos pagos, qualquer diferença entre as ofertas pode ser acaso. */
export const MINIMO_DE_PEDIDOS = 10

/**
 * O que as ofertas querem dizer: onde os cartões de quantidade funcionam, e
 * quanto a oferta do checkout pega — ou que ainda é pouco pra dizer.
 */
export function achadosDasOfertas(o: Omit<Ofertas, "achados">, pedidos: number): Achado[] {
  if (pedidos < MINIMO_DE_PEDIDOS)
    return [
      {
        tipo: "info",
        titulo: "Ainda é pouco pra comparar as ofertas",
        texto:
          `${pedidos} ${pedidos === 1 ? "pedido pago" : "pedidos pagos"} no período: qualquer ` +
          "diferença pode ser acaso. Com mais pedidos (depois da virada), aqui aparece o que cada " +
          "oferta soma.",
      },
    ]
  const achados: Achado[] = []
  const [melhor] = o.porProduto
    .flatMap((p) =>
      p.resultado.modo === "unidades" && p.resultado.pedidos >= MINIMO_DE_PEDIDOS
        ? [{ nome: p.nome, parte: p.resultado.parte ?? 0 }]
        : []
    )
    .sort((a, b) => b.parte - a.parte)
  if (melhor && melhor.parte >= 25)
    achados.push({
      tipo: "bom",
      titulo: `${melhor.nome}: os cartões de quantidade funcionam`,
      texto:
        `${melhor.parte}% das compras dele levam 2 ou mais. Pra testar o leve junto num produto, ` +
        "troque a caixa por duas semanas e compare aqui — uma mudança por vez.",
    })
  const { checkout } = o.numeros
  if (checkout.pedidos && checkout.deCada)
    achados.push({
      tipo: "bom",
      titulo: `A oferta do checkout entrou em 1 de cada ${checkout.deCada} pedidos`,
      texto: `${checkout.pedidos} ${checkout.pedidos === 1 ? "pedido aceitou" : "pedidos aceitaram"} a caixinha antes de pagar, somando ${reais(checkout.somou)} no período.`,
    })
  return achados
}

/** As caixas de compra dos produtos publicados, pelo `fb_pdp` de cada um (`metadata`: id → metadata). */
export function caixasDos(
  produtos: ProdutoCru[],
  metadata: ReadonlyMap<string, unknown>
): CaixaDoProduto[] {
  return produtos
    .filter((p) => p.status === "published" && p.handle)
    .map((p) => {
      const caixa = caixaDo(lerPdp(metadata.get(p.id)).combinada)
      return {
        id: p.id,
        handle: p.handle!,
        nome: nomeCurto(p.title ?? p.handle!),
        imagem: p.thumbnail ?? p.images?.[0]?.url ?? null,
        modo: caixa.modo,
        junto: caixa.modo === "junto" ? caixa.junto : [],
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome))
}
