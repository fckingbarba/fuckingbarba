/**
 * O FINANCEIRO, do lado do painel — os tipos do que o Medusa responde
 * (`apps/backend/src/lib/financeiro/`) e os endereços das telas. A conta do
 * DRE é toda do backend: aqui só se desenha.
 */

export type AtalhoDoFinanceiro = "mes" | "mes-passado" | "ano"

export const ATALHOS_DO_FINANCEIRO: [AtalhoDoFinanceiro, string][] = [
  ["mes", "Este mês"],
  ["mes-passado", "Mês passado"],
  ["ano", "Este ano"],
]

export type PeriodoDoFinanceiro = {
  atalho: AtalhoDoFinanceiro | null
  de: string
  ate: string
  nome: string
  antes: { de: string; ate: string; nome: string } | null
  comparar: boolean
  aviso: string | null
  comeco: string
  hoje: string
}

export type IdDaLinha =
  | "bruta"
  | "vendas"
  | "freteCobrado"
  | "deducoes"
  | "descontos"
  | "cancelamentos"
  | "simples"
  | "liquida"
  | "custoDosProdutos"
  | "custo"
  | "embalagem"
  | "lucroBruto"
  | "variaveis"
  | "taxas"
  | "fretePago"
  | "comissoes"
  | "margem"
  | "fixas"
  | "marketing"
  | "plataforma"
  | "pessoal"
  | "contador"
  | "outras"
  | "operacional"
  | "financeiro"
  | "lucro"

export type LinhaDoDre = {
  id: IdDaLinha
  nome: string
  tipo: "grupo" | "item" | "total" | "final"
  valor: number
  fonte: "auto" | "lancado" | "misto" | null
  falta: string | null
  detalhe: { nome: string; valor: number | null }[]
  pct: number | null
  antes: number | null
  pctAntes: number | null
  variacao: number | null
}

export type Pendencia = {
  id: string
  texto: string
  onde: "custos" | "despesas" | null
}

export type ColunaDoMes = {
  mes: string
  curto: string
  origem: string
  valores: Record<IdDaLinha, number>
  margemLiquida: number | null
  incompletas: IdDaLinha[]
}

export type TelaDoFinanceiro = {
  periodo: PeriodoDoFinanceiro
  pedidos: { atual: number; antes: number | null }
  linhas: LinhaDoDre[]
  deCada100: { nome: string; valor: number; sobra: boolean }[]
  pendencias: Pendencia[]
  meses: ColunaDoMes[]
}

export type DespesaNaTela = {
  id: string
  descricao: string
  categoria: string
  valor: number
  repete: boolean
  desde: string
  ate: string | null
}

export type TelaDasDespesas = {
  mes: string
  nome: string
  anterior: string | null
  proximo: string | null
  total: number
  grupos: {
    categoria: string
    nome: string
    linha: string
    total: number
    itens: DespesaNaTela[]
  }[]
  categorias: { id: string; nome: string; linha: string }[]
  meses: { mes: string; nome: string }[]
  antesDaLojaNova: { mes: string; curto: string; vendeu: boolean; taxas: boolean; frete: boolean }[]
}

export type ProdutoNosCustos = {
  id: string
  nome: string
  foto: string | null
  publicado: boolean
  preco: number | null
  custo: number | null
  desde: string | null
  antes: { valor: number; desde: string }[]
  sobra: number | null
  sobraPct: number | null
}

export type TelaDosCustos = {
  hoje: string
  comeco: string
  produtos: ProdutoNosCustos[]
  semCusto: number
  embalagem: { valor: number; desde: string } | null
  /** A % do Pix no Pagar.me que vale hoje (0.99), e desde quando. */
  taxaDoPix: { valor: number; desde: string } | null
  simples: { mes: string; nome: string; valor: number | null; usa: string | null }[]
}

/* ── os endereços ─────────────────────────────────────────────────────────── */

export type Vista = "periodo" | "meses"

export type BuscaDoFinanceiro = {
  periodo?: string
  de?: string
  ate?: string
  comparar?: string
  ver?: string
}

const MES = /^\d{4}-(0[1-9]|1[0-2])$/

/** O que a tela manda pro Medusa: só o que ele entende (o `ver` é da tela). */
export function consultaDoFinanceiro(b: BuscaDoFinanceiro): string {
  const q = new URLSearchParams()
  if (b.de && MES.test(b.de)) q.set("de", b.de)
  if (b.ate && MES.test(b.ate)) q.set("ate", b.ate)
  if (!q.size && b.periodo) q.set("periodo", b.periodo)
  if (b.comparar === "nenhum") q.set("comparar", "nenhum")
  return q.toString()
}

/** O endereço da tela do DRE com o período, o comparar e a vista. */
export function enderecoDoDre(
  p: Pick<PeriodoDoFinanceiro, "atalho" | "de" | "ate" | "comparar">,
  vista: Vista
): string {
  const q = new URLSearchParams()
  if (p.atalho) {
    if (p.atalho !== "mes") q.set("periodo", p.atalho)
  } else {
    q.set("de", p.de)
    q.set("ate", p.ate)
  }
  if (!p.comparar) q.set("comparar", "nenhum")
  if (vista === "meses") q.set("ver", "meses")
  const s = q.toString()
  return s ? `/financeiro?${s}` : "/financeiro"
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const NUMERO = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })

/** "R$ 10.017,38" (com o sinal de menos quando tira). */
export const reais = (v: number) => REAIS.format(v).replace("-", "−")

/** "10.017,38" · "−9.152,85" — as colunas do DRE, sem o "R$". */
export const valorDaTabela = (v: number) => (v === 0 ? "—" : NUMERO.format(v).replace("-", "−"))

/** "10.017" — o mês a mês, sem os centavos. */
export const valorInteiro = (v: number) => {
  const n = Math.round(v)
  return n === 0 ? "—" : INTEIRO.format(n).replace("-", "−")
}

/** 15.7 → "15,7%" (sem o sinal: o da linha já diz se tira). */
export const porcento = (v: number | null) =>
  v === null ? "—" : `${Math.abs(v).toFixed(1).replace(".", ",")}%`

/** −40.7 → "−40,7%" · 12 → "+12,0%" */
export const variacaoEmTexto = (v: number | null) =>
  v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1).replace(".", ",")}%`

/** "2026-09-30" → "30/09/2026" */
export const diaEmTexto = (dia: string) => dia.split("-").reverse().join("/")

/** Um número em reais que a pessoa edita: 11.4 → "11,40". */
export const emCampo = (v: number | null) => (v === null ? "" : NUMERO.format(v).replace(/\./g, ""))
