/**
 * OS CUPONS DO PAINEL — os tipos, como o backend devolve
 * (`apps/backend/src/lib/cupons.ts` e `lib/painel/cupons.ts`, pela rota
 * `/dashboard/cupons`), e a prévia do formulário.
 *
 * Quem valida é o Medusa: a prévia é só pra quem preenche ver a frase antes
 * de criar. O cupom criado volta do backend já em frase.
 */

export type Situacao = "valendo" | "pausado" | "vencido" | "esgotado"

export type CupomNaLista = {
  id: string
  codigo: string
  /** "15% em pedidos a partir de R$ 99,90" */
  descricao: string
  /** "até 30/09 · 100 usos no total · uma vez por cliente" */
  regra: string
  /** "23 de 100 usos" */
  usos: string
  situacao: Situacao
  /** A chave: o vencido e o esgotado não voltam por ela. */
  ligado: boolean
  pedidos: number
  desconto: number
  vendeu: number
}

export type DescontoAutomatico = {
  id: "quantidade" | "oferta" | "frete"
  titulo: string
  texto: string
  valendo: boolean
}

export type PaginaDeCupons = { cupons: CupomNaLista[]; automaticos: DescontoAutomatico[] }

export const NOME_DA_SITUACAO: Record<Situacao, string> = {
  valendo: "Valendo",
  pausado: "Pausado",
  vencido: "Vencido",
  esgotado: "Esgotado",
}

/** A cor do selo (`.status[data-s]`, em `pecas.css`). */
export const COR_DA_SITUACAO: Record<Situacao, string> = {
  valendo: "ativo",
  pausado: "pausado",
  vencido: "cancelado",
  esgotado: "esgotado",
}

/** O formulário do cupom novo, como a tela guarda (texto, como foi digitado). */
export type FormularioDoCupom = {
  codigo: string
  tipo: "porcento" | "reais"
  valor: string
  minimo: string
  ate: string
  limite: string
  umaVezPorCliente: boolean
  primeiraCompra: boolean
}

export const CUPOM_VAZIO: FormularioDoCupom = {
  codigo: "",
  tipo: "porcento",
  valor: "",
  minimo: "",
  ate: "",
  limite: "",
  umaVezPorCliente: true,
  primeiraCompra: false,
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const reais = (v: number) => REAIS.format(v).replace(/\s/g, " ")
/** "99,90" ou "R$ 1.234,56" → número; vazio ou lixo → null. */
const numero = (v: string): number | null => {
  const limpo = v
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
  const n = limpo ? Number(limpo) : NaN
  return Number.isFinite(n) ? n : null
}

/**
 * "BARBA20: 20% em pedidos a partir de R$ 99,90 · até 15/10 · 200 usos no
 * total · uma vez por cliente" — a mesma frase que a lista vai mostrar
 * (`descricaoDoCupom` e `regraDoCupom`, no backend).
 */
export function previaDoCupom(f: FormularioDoCupom): string {
  const codigo = f.codigo.replace(/\s+/g, "").toUpperCase() || "CÓDIGO"
  const valor = numero(f.valor)
  const minimo = numero(f.minimo)
  const limite = numero(f.limite)
  const quanto =
    valor === null
      ? f.tipo === "porcento"
        ? "…%"
        : "R$ … de desconto"
      : f.tipo === "porcento"
        ? `${valor}%`
        : `${reais(valor)} de desconto`
  const descricao =
    minimo && minimo > 0
      ? `${quanto} em pedidos a partir de ${reais(minimo)}`
      : `${quanto} em qualquer pedido`
  const regra = [
    f.ate ? `até ${f.ate.slice(8, 10)}/${f.ate.slice(5, 7)}` : "sem data de fim",
    ...(limite && limite > 0 ? [`${limite} ${limite === 1 ? "uso" : "usos"} no total`] : []),
    ...(f.umaVezPorCliente ? ["uma vez por cliente"] : []),
    ...(f.primeiraCompra ? ["só na primeira compra"] : []),
  ].join(" · ")
  return `${codigo}: ${descricao} · ${regra}`
}
