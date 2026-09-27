import {
  COMPONENTES,
  componentesDoProduto,
  DIAS_PADRAO,
  NOME_DO_TIPO,
  REGRAS_PADRAO,
  type Componente,
  type RegrasDasEtiquetas,
} from "./etiquetas"

/**
 * OS AJUSTES DO CRM — quanto dura cada produto e as regras das etiquetas
 * (`lib/crm/etiquetas.ts`), que quem abre o CRM muda no painel (CRM →
 * Ajustes). Moram no metadata da loja (`fb_crm`), como a meta do mês.
 *
 * SÓ O QUE MUDOU FICA GUARDADO: o número igual ao padrão não vai pro
 * metadata. Quando o padrão mudar (o histórico da Nuvemshop vai acertar os
 * dias de verdade), o número que ninguém mexeu acompanha.
 *
 * Código puro, com testes: ler o guardado (tolerante — o que não serve
 * volta pro padrão) e conferir o que o painel manda (estrito — cada campo
 * errado volta com a frase, e nada grava).
 */

export const CHAVE_DOS_AJUSTES = "fb_crm"

export type AjustesDoCrm = { dias: Record<Componente, number>; regras: RegrasDasEtiquetas }

export const AJUSTES_PADRAO: AjustesDoCrm = { dias: DIAS_PADRAO, regras: REGRAS_PADRAO }

type Regra = keyof RegrasDasEtiquetas

/** As regras, na ordem da tela. */
export const REGRAS: readonly Regra[] = [
  "toleranciaDaReposicao",
  "semPrevisao",
  "sunset",
  "quente",
  "morno",
  "comprasDoCupom",
]

/** Quantos dias um frasco pode durar — fora disso, é engano de digitação. */
export const LIMITE_DOS_DIAS: readonly [number, number] = [1, 365]

/** Os limites de cada regra. */
export const LIMITES_DAS_REGRAS: Record<Regra, readonly [number, number]> = {
  toleranciaDaReposicao: [0, 180],
  semPrevisao: [15, 365],
  sunset: [7, 365],
  quente: [1, 180],
  morno: [2, 365],
  comprasDoCupom: [1, 10],
}

/** Um inteiro: o número, ou o texto do campo ("45"). Nulo pro resto. */
function inteiro(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) ? v : null
  if (typeof v === "string" && /^\s*\d{1,4}\s*$/.test(v)) return Number(v)
  return null
}

const dentro = (n: number | null, [min, max]: readonly [number, number]): n is number =>
  n !== null && n >= min && n <= max

const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/**
 * Os ajustes que valem: o guardado por cima do padrão. O que não serve
 * (apagado, fora do limite, o morno antes do quente) volta pro padrão.
 */
export function lerAjustesGuardados(metadata: unknown): AjustesDoCrm {
  const guardado = objeto(objeto(metadata)[CHAVE_DOS_AJUSTES])
  const dias = objeto(guardado.dias)
  const regras = objeto(guardado.regras)
  const lido: AjustesDoCrm = { dias: { ...DIAS_PADRAO }, regras: { ...REGRAS_PADRAO } }
  for (const c of COMPONENTES) {
    const n = inteiro(dias[c])
    if (dentro(n, LIMITE_DOS_DIAS)) lido.dias[c] = n
  }
  for (const r of REGRAS) {
    const n = inteiro(regras[r])
    if (dentro(n, LIMITES_DAS_REGRAS[r])) lido.regras[r] = n
  }
  if (lido.regras.morno <= lido.regras.quente) {
    lido.regras.quente = REGRAS_PADRAO.quente
    lido.regras.morno = REGRAS_PADRAO.morno
  }
  return lido
}

/** Os erros do formulário, pelo campo: `dias.fator`, `regras.morno`. */
export type ErrosDosAjustes = Record<string, string>

/**
 * O que o painel mandou (`{ dias: { fator: "40", … }, regras: { … } }`),
 * conferido campo a campo. Todos os campos vêm: a tela manda o formulário
 * inteiro.
 */
export function lerMudancaDosAjustes(
  corpo: unknown
): { ajustes: AjustesDoCrm } | { erros: ErrosDosAjustes } {
  const c = objeto(corpo)
  const dias = objeto(c.dias)
  const regras = objeto(c.regras)
  const erros: ErrosDosAjustes = {}
  const ajustes: AjustesDoCrm = { dias: { ...DIAS_PADRAO }, regras: { ...REGRAS_PADRAO } }
  for (const comp of COMPONENTES) {
    const n = inteiro(dias[comp])
    if (dentro(n, LIMITE_DOS_DIAS)) ajustes.dias[comp] = n
    else erros[`dias.${comp}`] = `Um número de ${LIMITE_DOS_DIAS[0]} a ${LIMITE_DOS_DIAS[1]}.`
  }
  for (const r of REGRAS) {
    const n = inteiro(regras[r])
    const [min, max] = LIMITES_DAS_REGRAS[r]
    if (dentro(n, LIMITES_DAS_REGRAS[r])) ajustes.regras[r] = n
    else erros[`regras.${r}`] = `Um número de ${min} a ${max}.`
  }
  if (
    !erros["regras.quente"] &&
    !erros["regras.morno"] &&
    ajustes.regras.morno <= ajustes.regras.quente
  )
    erros["regras.morno"] = `Maior que o do quente (${ajustes.regras.quente}).`
  return Object.keys(erros).length ? { erros } : { ajustes }
}

export type AjustesGuardados = {
  dias?: Partial<Record<Componente, number>>
  regras?: Partial<RegrasDasEtiquetas>
}

/** Só o que é diferente do padrão — o que vai pro metadata. Nada mudou: `null`. */
export function soOQueMudou(a: AjustesDoCrm): AjustesGuardados | null {
  const dias: Partial<Record<Componente, number>> = {}
  for (const c of COMPONENTES) if (a.dias[c] !== DIAS_PADRAO[c]) dias[c] = a.dias[c]
  const regras: Partial<RegrasDasEtiquetas> = {}
  for (const r of REGRAS) if (a.regras[r] !== REGRAS_PADRAO[r]) regras[r] = a.regras[r]
  const guardar: AjustesGuardados = {}
  if (Object.keys(dias).length) guardar.dias = dias
  if (Object.keys(regras).length) guardar.regras = regras
  return Object.keys(guardar).length ? guardar : null
}

export type ProdutoDaLoja = { titulo: string; handle: string | null }

export type TelaDosAjustes = {
  ajustes: AjustesDoCrm
  padrao: AjustesDoCrm
  /** Cada tipo, com os produtos da loja que contam como ele ("Kit 3 Fator (3 unidades)"). */
  tipos: { tipo: Componente; nome: string; produtos: string[] }[]
  /** Os produtos que não entram na conta da próxima compra (o nome não diz o que vem). */
  foraDaConta: string[]
}

/** A tela dos Ajustes: os números de agora, os do padrão, e o que conta como cada tipo. */
export function montarTelaDosAjustes(
  ajustes: AjustesDoCrm,
  produtos: ProdutoDaLoja[]
): TelaDosAjustes {
  const porTipo = new Map<Componente, string[]>(COMPONENTES.map((c) => [c, []]))
  const foraDaConta: string[] = []
  const emOrdem = [...produtos].sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"))
  for (const p of emOrdem) {
    const partes = componentesDoProduto(p.handle)
    if (!partes.length) foraDaConta.push(p.titulo)
    for (const { componente, unidades } of partes)
      porTipo.get(componente)?.push(unidades > 1 ? `${p.titulo} (${unidades} unidades)` : p.titulo)
  }
  return {
    ajustes,
    padrao: AJUSTES_PADRAO,
    tipos: COMPONENTES.map((tipo) => ({
      tipo,
      nome: NOME_DO_TIPO[tipo],
      produtos: porTipo.get(tipo) ?? [],
    })),
    foraDaConta,
  }
}
