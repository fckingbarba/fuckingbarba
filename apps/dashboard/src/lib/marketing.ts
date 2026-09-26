import "server-only"
import { redirect } from "next/navigation"
import { cache } from "react"
import { medusa } from "@/lib/medusa"

/**
 * O MARKETING, do lado do painel — o formato das respostas de
 * `GET /dashboard/marketing` e `GET /dashboard/marketing/visitas` (cópia dos
 * tipos de `apps/backend/src/lib/painel/marketing.ts`: quem mudar um, muda o
 * outro).
 */

/** Os períodos da tela, na ordem dos botões; sem escolha, 30 dias (o protótipo). */
export const PERIODOS = [
  ["hoje", "Hoje"],
  ["7d", "7 dias"],
  ["30d", "30 dias"],
  ["90d", "90 dias"],
] as const
export type Periodo = (typeof PERIODOS)[number][0]
const PERIODO_PADRAO: Periodo = "30d"

export const lerPeriodo = (v: unknown): Periodo =>
  PERIODOS.some(([p]) => p === v) ? (v as Periodo) : PERIODO_PADRAO

/** Um número do período e o do de antes; `variacao` em %, `null` sem nada antes pra comparar. */
export type Comparado = { valor: number; antes: number; variacao: number | null }

export type Barra = { rotulo: string; nome: string; valor: number; pedidos: number; agora: boolean }

export type ProdutoVendido = {
  nome: string
  imagem: string | null
  unidades: number
  receita: number
}

export type MetaDoMes = {
  mes: string
  nome: string
  valor: number | null
  feito: number
  dia: number
  dias: number
  restam: number
  ritmo: number
  projecao: number
  porDia: number | null
}

export type Resumo = {
  periodo: Periodo
  numeros: { receita: Comparado; pedidos: Comparado; ticket: Comparado }
  serie: { titulo: string; barras: Barra[] }
  maisVendidos: ProdutoVendido[]
  meta: MetaDoMes
  /** Quem pediu pode mudar a meta (o dono). */
  mudaAMeta: boolean
}

export type Conversao = { valor: number | null; antes: number | null; variacao: number | null }

export type VisitasDoPeriodo = {
  visitas: Comparado
  pedidos: Comparado
  conversao: Conversao
  /** As visitas de hoje contam até esta hora (o Google soma com atraso); `null`: nada de hoje ainda. */
  ate: number | null
}

export type RespostaDasVisitas =
  ({ estado: "ok" } & VisitasDoPeriodo) | { estado: "desligado" | "invalida" | "recusado" | "fora" }

export type LeituraDoResumo = { estado: "ok"; resumo: Resumo } | { estado: "sem-acesso" | "fora" }

export async function lerResumo(periodo: Periodo): Promise<LeituraDoResumo> {
  const r = await medusa(`/dashboard/marketing?periodo=${periodo}`, {
    metodo: "GET",
    token: "sessao",
  })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { estado: "sem-acesso" }
  if (r.status !== 200) return { estado: "fora" }
  return { estado: "ok", resumo: r.corpo as unknown as Resumo }
}

/**
 * As visitas e a conversão do período — do Google, numa pergunta à parte:
 * quem chama põe num `<Suspense>`, e o resto do Resumo não espera por ele.
 * Uma pergunta por página (`cache` do React), pros dois números que usam.
 */
export const lerVisitasDoMarketing = cache(
  async (periodo: Periodo): Promise<RespostaDasVisitas> => {
    const r = await medusa(`/dashboard/marketing/visitas?periodo=${periodo}`, {
      metodo: "GET",
      token: "sessao",
    })
    const estado = r.corpo.estado
    if (r.status === 200 && estado === "ok")
      return r.corpo as unknown as { estado: "ok" } & VisitasDoPeriodo
    if (
      r.status === 200 &&
      (estado === "desligado" || estado === "invalida" || estado === "recusado")
    )
      return { estado }
    return { estado: "fora" }
  }
)

/* ── o Funil e os Canais (a parte 2) ──────────────────────────────────────── */

export type Achado = {
  tipo: "bom" | "problema" | "oportunidade" | "info"
  titulo: string
  texto: string
}

/** Por que o Google não respondeu (os mesmos estados das visitas). */
export type SemGoogle = "desligado" | "invalida" | "recusado" | "fora"

export type Passo = {
  nome: string
  n: number
  /** Quanto passou do passo anterior, em %; `null` no primeiro. */
  taxa: number | null
  /** A maior perda do funil. */
  pior: boolean
}

export type Aparelho = {
  nome: "Celular" | "Computador"
  visitas: number
  pedidos: number
  parte: number
  conversao: number | null
}

export type Funil = { periodo: Periodo; checkout: Passo[]; achados: Achado[] } & (
  { estado: "ok"; site: Passo[]; aparelhos: Aparelho[] | null } | { estado: SemGoogle }
)

export type LinhaDoCanal = {
  nome: string
  visitas: number
  pedidos: number
  receita: number
  conversao: number | null
}

export type Campanha = {
  nome: string
  canal: string
  visitas: number
  pedidos: number
  receita: number
}

export type Pagina = { nome: string; caminho: string }

export type Canais = {
  periodo: Periodo
  /** Os pedidos pagos da loja no período (o Medusa). */
  pagos: { receita: number; pedidos: number }
  /** O endereço da loja, pros links de campanha; `null` sem o `LOJA_URL` no backend. */
  loja: string | null
  paginas: Pagina[]
} & (
  | {
      estado: "ok"
      canais: LinhaDoCanal[]
      campanhas: Campanha[]
      totais: { visitas: number; pedidos: number; receita: number }
      semOrigem: { pedidos: number; receita: number }
      achado: Achado | null
    }
  | { estado: SemGoogle }
)

/** Uma aba do Marketing: a resposta, ou `null` se a loja não respondeu. */
async function lerAba<T>(aba: string, periodo: Periodo): Promise<T | null> {
  const r = await medusa(`/dashboard/marketing/${aba}?periodo=${periodo}`, {
    metodo: "GET",
    token: "sessao",
  })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  return r.status === 200 ? (r.corpo as unknown as T) : null
}

/** O funil do período (os carrinhos da loja vêm sempre; o site, se o Google responder). */
export const lerFunil = cache((periodo: Periodo) => lerAba<Funil>("funil", periodo))

/** Os canais do período — o Resumo usa os três que mais venderam. */
export const lerCanais = cache((periodo: Periodo) => lerAba<Canais>("canais", periodo))

/* ── os Produtos e as Ofertas (a parte 3) ─────────────────────────────────── */

export type Sinal = "esgotado" | "acabando" | "pouca-sacola" | "vendendo" | "sem-venda"

export type ProdutoNoMarketing = {
  id: string
  nome: string
  imagem: string | null
  /** Quantas vezes a página foi vista; `null` sem o Google. */
  visitas: number | null
  /** De cada 100 vezes que a página foi vista, quantas viraram sacola. */
  sacola: number | null
  vendidos: number
  receita: number
  estoque: number | null
  sinais: Sinal[]
}

export type ProdutosDoMarketing = {
  periodo: Periodo
  estado: "ok" | SemGoogle
  produtos: ProdutoNoMarketing[]
  achado: Achado | null
}

export type ResultadoDaCaixa =
  | { modo: "unidades"; pedidos: number; comMais: number; parte: number | null }
  | { modo: "junto"; pedidos: number; comJunto: number; parte: number | null; somou: number }

export type OfertaDoProduto = {
  id: string
  nome: string
  imagem: string | null
  junto: string[]
  resultado: ResultadoDaCaixa
}

export type Cupom = { codigo: string; usos: number; desconto: number; vendeu: number }

export type Ofertas = {
  periodo: Periodo
  porProduto: OfertaDoProduto[]
  numeros: {
    unidades: { pedidos: number; comMais: number; parte: number | null }
    junto: { vezes: number; somou: number }
    checkout: { pedidos: number; deCada: number | null; somou: number }
  }
  cupons: Cupom[]
  achados: Achado[]
}

/** Os produtos do período (o vendido e o estoque vêm sempre; as visitas, se o Google responder). */
export const lerProdutosDoMarketing = cache((periodo: Periodo) =>
  lerAba<ProdutosDoMarketing>("produtos", periodo)
)

/** As ofertas do período — tudo da loja. */
export const lerOfertas = cache((periodo: Periodo) => lerAba<Ofertas>("ofertas", periodo))
