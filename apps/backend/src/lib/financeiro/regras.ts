import { numeroBrasileiro } from "../cupons"
import { chaveDoDia } from "../painel/formato"
import { meiaNoite, type Janela } from "../painel/periodo"

/**
 * AS REGRAS DO FINANCEIRO — os meses, as categorias das despesas, o que se
 * aceita em cada campo e o valor que vale num dia. Código puro, testado em
 * `__tests__/regras.unit.spec.ts`. A conta do DRE mora em `dre.ts`, ao lado.
 *
 * O DINHEIRO DAQUI É EM CENTAVOS (inteiro), como o banco guarda: R$ 9.800,00
 * é 980000. O DRE soma em reais, arredondando em centavos a cada linha.
 */

/**
 * O PRIMEIRO MÊS DO DRE. As vendas da Nuvemshop (o vendas.csv, no CRM)
 * começam em 30/01/2026: janeiro teria dois dias de venda contra um mês
 * inteiro de despesas. O DRE começa no primeiro mês cheio (escolha do dono,
 * 30/09: "desde janeiro, somando a Nuvemshop" — e janeiro fica de fora).
 */
export const COMECO_DO_DRE = "2026-02"

/**
 * O DIA DA LOJA NOVA — a partir daqui, as vendas vêm do Medusa; antes, da
 * Nuvemshop. Antes dele, a taxa e o frete que a Nuvemshop cobrou só entram
 * lançados, mês a mês (Despesas).
 */
export const DIA_DA_LOJA_NOVA = "2026-09-27"
export const MES_DA_LOJA_NOVA = DIA_DA_LOJA_NOVA.slice(0, 7)

/** Até quantos meses cabem num período (dois anos: o DRE de um ano com o de antes). */
export const MESES_NO_MAXIMO = 24

/* ── os meses ─────────────────────────────────────────────────────────────── */

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/

export const ehMes = (v: unknown): v is string => typeof v === "string" && MES.test(v)

/** "2026-09" mais `n` meses: "2026-10", "2026-08"… */
export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number)
  const total = a * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`
}

/** Os meses de `de` a `ate`, os dois dentro. */
export function mesesEntre(de: string, ate: string): string[] {
  const meses: string[] = []
  for (let m = de; m <= ate && meses.length <= MESES_NO_MAXIMO * 2; m = somarMeses(m, 1))
    meses.push(m)
  return meses
}

/** O mês de agora, em Brasília ("2026-09"). */
export const mesDeAgora = (agora: Date) => chaveDoDia(agora).slice(0, 7)

/** O mês inteiro, do dia 1 à meia-noite do dia 1 do seguinte, em Brasília. */
export const janelaDoMes = (mes: string): Janela => ({
  de: meiaNoite(`${mes}-01`),
  ate: meiaNoite(`${somarMeses(mes, 1)}-01`),
})

const NOMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
]

/** "setembro" */
export const nomeDoMes = (mes: string) => NOMES[Number(mes.slice(5, 7)) - 1] ?? mes

/** "Set" */
export const mesCurto = (mes: string) => {
  const n = nomeDoMes(mes)
  return n[0].toUpperCase() + n.slice(1, 3)
}

/** "setembro de 2026" */
export const mesEAno = (mes: string) => `${nomeDoMes(mes)} de ${mes.slice(0, 4)}`

/** "setembro de 2026" · "fevereiro a setembro de 2026" · "novembro de 2026 a janeiro de 2027" */
export function nomeDosMeses(de: string, ate: string): string {
  if (de === ate) return mesEAno(de)
  if (de.slice(0, 4) === ate.slice(0, 4)) return `${nomeDoMes(de)} a ${mesEAno(ate)}`
  return `${mesEAno(de)} a ${mesEAno(ate)}`
}

/* ── o período da tela ────────────────────────────────────────────────────── */

export const ATALHOS_DO_FINANCEIRO = ["mes", "mes-passado", "ano"] as const
export type AtalhoDoFinanceiro = (typeof ATALHOS_DO_FINANCEIRO)[number]

export type Meses = { de: string; ate: string; meses: string[]; nome: string }

export type PeriodoDoFinanceiro = {
  /** O botão apertado, ou `null` quando os meses foram escolhidos. */
  atalho: AtalhoDoFinanceiro | null
  atual: Meses
  /** Os meses logo antes, do mesmo tamanho — `null` sem comparar, ou antes do começo do DRE. */
  antes: Meses | null
  comparar: boolean
  /** O pedido que não valia e virou outro ("mostrando este mês"), ou nada. */
  aviso: string | null
}

export type BuscaDoFinanceiro = {
  periodo?: unknown
  de?: unknown
  ate?: unknown
  comparar?: unknown
}

const meses = (de: string, ate: string): Meses => ({
  de,
  ate,
  meses: mesesEntre(de, ate),
  nome: nomeDosMeses(de, ate),
})

/**
 * O período que o endereço pede: um botão (`?periodo=mes|mes-passado|ano`)
 * ou os meses escolhidos (`?de=2026-06&ate=2026-09`), e `?comparar=nenhum`.
 * Nada, ou o que não vale, vira este mês. Nada antes do começo do DRE, nada
 * depois do mês de agora; o de antes só quando cabe inteiro depois do começo.
 */
export function lerPeriodoDoFinanceiro(q: BuscaDoFinanceiro, agora: Date): PeriodoDoFinanceiro {
  const hoje = mesDeAgora(agora)
  const comparar = q.comparar !== "nenhum"
  const limitar = (m: string) => (m < COMECO_DO_DRE ? COMECO_DO_DRE : m > hoje ? hoje : m)
  let atalho: AtalhoDoFinanceiro | null = null
  let de = hoje
  let ate = hoje
  let aviso: string | null = null

  if (ehMes(q.de) || ehMes(q.ate)) {
    const pediuDe = ehMes(q.de) ? q.de : ehMes(q.ate) ? q.ate : hoje
    const pediuAte = ehMes(q.ate) ? q.ate : pediuDe
    const [a, b] = pediuDe <= pediuAte ? [pediuDe, pediuAte] : [pediuAte, pediuDe]
    de = limitar(a)
    ate = limitar(b)
    if (mesesEntre(de, ate).length > MESES_NO_MAXIMO) de = somarMeses(ate, 1 - MESES_NO_MAXIMO)
    if (de !== a || ate !== b)
      aviso = `O DRE vai de ${mesEAno(COMECO_DO_DRE)} até este mês: mostrando ${nomeDosMeses(de, ate)}.`
  } else {
    atalho = (ATALHOS_DO_FINANCEIRO as readonly unknown[]).includes(q.periodo)
      ? (q.periodo as AtalhoDoFinanceiro)
      : "mes"
    if (q.periodo !== undefined && atalho !== q.periodo) aviso = "Mostrando este mês."
    if (atalho === "mes-passado") de = ate = limitar(somarMeses(hoje, -1))
    if (atalho === "ano") {
      de = limitar(`${hoje.slice(0, 4)}-01`)
      ate = hoje
    }
  }

  const tamanho = mesesEntre(de, ate).length
  const antesDe = somarMeses(de, -tamanho)
  const antes = comparar && antesDe >= COMECO_DO_DRE ? meses(antesDe, somarMeses(de, -1)) : null
  return { atalho, atual: meses(de, ate), antes, comparar, aviso }
}

/* ── as categorias das despesas ───────────────────────────────────────────── */

/** A linha do DRE em que a despesa cai. */
export type LinhaDaDespesa = "variaveis" | "fixas" | "financeiro"

export const CATEGORIAS = [
  { id: "marketing", nome: "Marketing e anúncios", linha: "fixas" },
  { id: "plataforma", nome: "Plataforma e sistemas", linha: "fixas" },
  { id: "pessoal", nome: "Pessoal e pró-labore", linha: "fixas" },
  { id: "contador", nome: "Contador", linha: "fixas" },
  { id: "outras", nome: "Outras despesas", linha: "fixas" },
  { id: "taxas", nome: "Taxas de pagamento", linha: "variaveis" },
  { id: "frete", nome: "Frete pago pela loja", linha: "variaveis" },
  { id: "comissoes", nome: "Comissões de criadores", linha: "variaveis" },
  { id: "tarifas", nome: "Tarifas, juros e IOF", linha: "financeiro" },
] as const satisfies readonly { id: string; nome: string; linha: LinhaDaDespesa }[]

export type Categoria = (typeof CATEGORIAS)[number]["id"]

export const ehCategoria = (v: unknown): v is Categoria =>
  typeof v === "string" && CATEGORIAS.some((c) => c.id === v)

export const categoriaDe = (id: Categoria) => CATEGORIAS.find((c) => c.id === id)!

/** O nome da linha do DRE, pra frase "vai pra linha …". */
export const NOME_DA_LINHA: Record<LinhaDaDespesa, string> = {
  variaveis: "Despesas variáveis",
  fixas: "Despesas fixas",
  financeiro: "Resultado financeiro",
}

/* ── os campos ────────────────────────────────────────────────────────────── */

/** O maior valor que se aceita num campo: dez milhões de reais. */
const MAXIMO_EM_REAIS = 10_000_000

/** "R$ 9.800,00", "9800" ou 9800 → 980000 (centavos); vazio → `null`; o resto, `"invalido"`. */
export function lerCentavos(v: unknown): number | null | "invalido" {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return null
  const n = numeroBrasileiro(v)
  if (n === null || !(n >= 0) || n > MAXIMO_EM_REAIS) return "invalido"
  return Math.round(n * 100)
}

/** A maior alíquota que se aceita: 33% (o Simples mais alto, no Anexo V, é 30,5%). */
const ALIQUOTA_MAXIMA = 3300

/** "6,54", "6,54%" ou 6.54 → 654 (centésimos de ponto); vazio → `null`; o resto, `"invalido"`. */
export function lerAliquota(v: unknown): number | null | "invalido" {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return null
  const n = numeroBrasileiro(v)
  if (n === null || !(n > 0)) return "invalido"
  const c = Math.round(n * 100)
  return c > ALIQUOTA_MAXIMA ? "invalido" : c
}

const DIA = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/** "2026-02-01", um dia que existe. */
export function ehDia(v: unknown): v is string {
  if (typeof v !== "string" || !DIA.test(v)) return false
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export type DespesaLida = {
  descricao: string
  categoria: Categoria
  valor: number
  mes: string
  repete: boolean
}

export type ErroDaDespesa = "descricao" | "categoria" | "valor" | "mes"

/** Até 80 letras, sem quebra de linha nem espaço sobrando. */
const lerDescricao = (v: unknown) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 80) : ""

/**
 * O que chega do formulário "Lançar despesa", conferido campo a campo na
 * ordem da tela. O mês vai do começo do DRE até um ano depois de agora (quem
 * já sabe a fatura de dezembro lança).
 */
export function lerDespesa(
  corpo: unknown,
  agora: Date
): { ok: true; despesa: DespesaLida } | { ok: false; campo: ErroDaDespesa } {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>
  const descricao = lerDescricao(c.descricao)
  if (!descricao) return { ok: false, campo: "descricao" }
  if (!ehCategoria(c.categoria)) return { ok: false, campo: "categoria" }
  const valor = lerCentavos(c.valor)
  if (valor === null || valor === "invalido" || valor === 0) return { ok: false, campo: "valor" }
  const ultimo = somarMeses(mesDeAgora(agora), 12)
  if (!ehMes(c.mes) || c.mes < COMECO_DO_DRE || c.mes > ultimo) return { ok: false, campo: "mes" }
  return {
    ok: true,
    despesa: { descricao, categoria: c.categoria, valor, mes: c.mes, repete: c.repete === true },
  }
}

/* ── o valor que vale num dia ─────────────────────────────────────────────── */

export type Vigencia = { desde: string; valor: number }

/** O valor que vale no dia (o de `desde` mais recente até ele), ou `null`. */
export function vigente(valores: readonly Vigencia[], dia: string): Vigencia | null {
  let achou: Vigencia | null = null
  for (const v of valores) if (v.desde <= dia && (!achou || v.desde > achou.desde)) achou = v
  return achou
}

/** A chave do custo de um produto em `fin_valor`. */
export const chaveDoCusto = (produto: string) => `custo:${produto}`
export const CHAVE_DA_EMBALAGEM = "embalagem"
export const CHAVE_DO_SIMPLES = "simples"

/** As linhas de `fin_valor` agrupadas pela chave. */
export function porChave(
  linhas: readonly { chave: string; desde: string; valor: number }[]
): Map<string, Vigencia[]> {
  const mapa = new Map<string, Vigencia[]>()
  for (const l of linhas) {
    const lista = mapa.get(l.chave) ?? []
    lista.push({ desde: l.desde, valor: Number(l.valor) })
    mapa.set(l.chave, lista)
  }
  return mapa
}

/**
 * A alíquota do Simples num mês: a do mês (`certa`), a do último mês que tem
 * (`estimada`, com o mês de onde veio), ou nenhuma.
 */
export function aliquotaDoMes(
  simples: readonly Vigencia[],
  mes: string
): { valor: number; certa: boolean; de: string } | null {
  const v = vigente(simples, `${mes}-31`)
  if (!v) return null
  const de = v.desde.slice(0, 7)
  return { valor: v.valor, certa: de === mes, de }
}

/** 654 → "6,54%" */
export const emPorcento = (centesimos: number) =>
  `${(centesimos / 100).toFixed(2).replace(".", ",")}%`
