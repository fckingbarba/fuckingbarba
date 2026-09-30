import {
  aliquotaDoMes,
  CHAVE_DA_EMBALAGEM,
  CHAVE_DA_TAXA_DO_PIX,
  chaveDoCusto,
  COMECO_DO_DRE,
  ehDia,
  lerAliquota,
  lerCentavos,
  mesDeAgora,
  mesEAno,
  mesesEntre,
  nomeDoMes,
  vigente,
  type Vigencia,
} from "./regras"
import { chaveDoDia } from "../painel/formato"

/**
 * CUSTOS E IMPOSTO (`GET /dashboard/financeiro/custos`): o custo de cada
 * produto que vale hoje (e desde quando), a embalagem por pedido e a
 * alíquota do Simples de cada mês. E o que o formulário manda, conferido
 * (`lerCustos`). Puro, testado em `__tests__/custos.unit.spec.ts`.
 */

export type ProdutoNosCustos = {
  id: string
  nome: string
  foto: string | null
  publicado: boolean
  /** O que a loja cobra por uma unidade hoje (com a promoção valendo). */
  preco: number | null
  /** O custo que vale hoje, em reais, e desde quando. */
  custo: number | null
  desde: string | null
  /** Os custos de antes, do mais novo pro mais velho. */
  antes: { valor: number; desde: string }[]
  /** O que sobra de uma unidade: o preço menos o custo (antes de imposto, taxa e frete). */
  sobra: number | null
  sobraPct: number | null
}

export type TelaDosCustos = {
  /** Hoje, em Brasília ("2026-09-30") — o "vale desde" de quem muda um custo. */
  hoje: string
  /** O primeiro dia do DRE ("2026-02-01") — o "vale desde" do primeiro custo de um produto. */
  comeco: string
  produtos: ProdutoNosCustos[]
  semCusto: number
  embalagem: { valor: number; desde: string } | null
  /** A % do Pix no Pagar.me que vale hoje (6,54 → 6.54), e desde quando. */
  taxaDoPix: { valor: number; desde: string } | null
  /** Do mês de agora pro começo do DRE: a alíquota digitada (em %), ou a que o DRE usa no lugar. */
  simples: { mes: string; nome: string; valor: number | null; usa: string | null }[]
}

export type ProdutoLido = {
  id: string
  nome: string
  foto: string | null
  publicado: boolean
  preco: number | null
}

const arred = (v: number) => Math.round(v * 100) / 100

export function telaDosCustos(
  produtos: readonly ProdutoLido[],
  valores: ReadonlyMap<string, readonly Vigencia[]>,
  agora: Date
): TelaDosCustos {
  const hoje = chaveDoDia(agora)
  const linhas = produtos.map((p): ProdutoNosCustos => {
    const lista = [...(valores.get(chaveDoCusto(p.id)) ?? [])].sort((a, b) =>
      b.desde.localeCompare(a.desde)
    )
    const agoraVale = vigente(lista, hoje)
    const custo = agoraVale ? arred(agoraVale.valor / 100) : null
    const sobra = custo !== null && p.preco !== null ? arred(p.preco - custo) : null
    return {
      ...p,
      custo,
      desde: agoraVale?.desde ?? null,
      antes: lista
        .filter((v) => v !== agoraVale && (!agoraVale || v.desde < agoraVale.desde))
        .map((v) => ({ valor: arred(v.valor / 100), desde: v.desde })),
      sobra,
      sobraPct: sobra !== null && p.preco ? Math.round((sobra / p.preco) * 1000) / 10 : null,
    }
  })
  linhas.sort((a, b) =>
    a.publicado === b.publicado ? a.nome.localeCompare(b.nome, "pt-BR") : a.publicado ? -1 : 1
  )
  const embalagem = vigente(valores.get(CHAVE_DA_EMBALAGEM) ?? [], hoje)
  const taxaDoPix = vigente(valores.get(CHAVE_DA_TAXA_DO_PIX) ?? [], hoje)
  const simples = valores.get("simples") ?? []
  return {
    hoje,
    comeco: `${COMECO_DO_DRE}-01`,
    produtos: linhas,
    semCusto: linhas.filter((l) => l.publicado && l.custo === null).length,
    embalagem: embalagem ? { valor: arred(embalagem.valor / 100), desde: embalagem.desde } : null,
    taxaDoPix: taxaDoPix ? { valor: taxaDoPix.valor / 100, desde: taxaDoPix.desde } : null,
    simples: mesesEntre(COMECO_DO_DRE, mesDeAgora(agora))
      .reverse()
      .map((mes) => {
        const a = aliquotaDoMes(simples, mes)
        return {
          mes,
          nome: mesEAno(mes),
          valor: a?.certa ? a.valor / 100 : null,
          usa:
            a && !a.certa
              ? `${(a.valor / 100).toFixed(2).replace(".", ",")}% (a de ${nomeDoMes(a.de)})`
              : null,
        }
      }),
  }
}

export type ValorPraGravar = { chave: string; desde: string; valor: number | null }

/**
 * O que o formulário de custos manda: `{ custos: [{ produto, valor, desde }],
 * embalagem: { valor, desde }, taxaDoPix: { valor, desde } }`. Cada produto
 * tem que existir; o valor em reais (a taxa do Pix, em %; vazio tira o
 * daquele dia); o dia de 2020 até um ano depois de hoje.
 */
export function lerCustos(
  corpo: unknown,
  produtos: ReadonlySet<string>,
  agora: Date
):
  | { ok: true; valores: ValorPraGravar[] }
  | { ok: false; campo: "produto" | "valor" | "aliquota" | "desde"; produto: string | null } {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>
  const ultimo = chaveDoDia(new Date(agora.getTime() + 365 * 24 * 60 * 60 * 1000))
  const lerUm = (
    item: unknown,
    chave: (id: string) => string | null,
    ler: (v: unknown) => number | null | "invalido" = lerCentavos
  ):
    | { ok: true; valor: ValorPraGravar }
    | { ok: false; campo: "produto" | "valor" | "aliquota" | "desde"; produto: string | null } => {
    const i = (item && typeof item === "object" ? item : {}) as Record<string, unknown>
    const id = typeof i.produto === "string" ? i.produto : null
    const k = chave(id ?? "")
    if (!k) return { ok: false, campo: "produto", produto: id }
    const valor = ler(i.valor)
    if (valor === "invalido")
      return { ok: false, campo: ler === lerAliquota ? "aliquota" : "valor", produto: id }
    if (!ehDia(i.desde) || i.desde < "2020-01-01" || i.desde > ultimo)
      return { ok: false, campo: "desde", produto: id }
    return { ok: true, valor: { chave: k, desde: i.desde, valor } }
  }
  const valores: ValorPraGravar[] = []
  const custos = Array.isArray(c.custos) ? c.custos.slice(0, 500) : []
  for (const item of custos) {
    const r = lerUm(item, (id) => (produtos.has(id) ? chaveDoCusto(id) : null))
    if (!r.ok) return r
    valores.push(r.valor)
  }
  if (c.embalagem !== undefined && c.embalagem !== null) {
    const r = lerUm(c.embalagem, () => CHAVE_DA_EMBALAGEM)
    if (!r.ok) return r
    valores.push(r.valor)
  }
  if (c.taxaDoPix !== undefined && c.taxaDoPix !== null) {
    const r = lerUm(c.taxaDoPix, () => CHAVE_DA_TAXA_DO_PIX, lerAliquota)
    if (!r.ok) return r
    valores.push(r.valor)
  }
  return { ok: true, valores }
}
