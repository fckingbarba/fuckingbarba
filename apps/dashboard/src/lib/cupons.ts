/**
 * OS CUPONS DO PAINEL — os tipos, como o backend devolve
 * (`apps/backend/src/lib/cupons.ts` e `lib/painel/cupons.ts`, pela rota
 * `/dashboard/cupons`), e a prévia do formulário.
 *
 * O formulário é o "Criar cupom" da Nuvemshop (entrega 0128): código e o
 * link do cupom, tipo de desconto, a quem vale e os limites de uso.
 *
 * Quem valida é o Medusa: a prévia é só pra quem preenche ver a frase antes
 * de criar. O cupom criado volta do backend já em frase.
 */

export type Situacao = "valendo" | "agendado" | "pausado" | "vencido" | "esgotado"

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

export type Alvo = { id: string; nome: string }
/** As categorias e os produtos que o "Aplicar a" escolhe. */
export type Catalogo = { categorias: Alvo[]; produtos: Alvo[] }

export type PaginaDeCupons = {
  cupons: CupomNaLista[]
  automaticos: DescontoAutomatico[]
  catalogo?: Catalogo
  /** O endereço da loja, pro link do cupom; `null` sem o `LOJA_URL` no backend. */
  loja?: string | null
}

export const NOME_DA_SITUACAO: Record<Situacao, string> = {
  valendo: "Valendo",
  agendado: "Agendado",
  pausado: "Pausado",
  vencido: "Vencido",
  esgotado: "Esgotado",
}

/** A cor do selo (`.status[data-s]`, em `pecas.css`). */
export const COR_DA_SITUACAO: Record<Situacao, string> = {
  valendo: "ativo",
  agendado: "esperando",
  pausado: "pausado",
  vencido: "cancelado",
  esgotado: "esgotado",
}

/** O link que aplica o cupom sozinho, como o da Nuvemshop: `<loja>/discount/<CÓDIGO>`. */
export const linkDoCupom = (loja: string, codigo: string) =>
  `${loja.replace(/\/+$/, "")}/discount/${encodeURIComponent(codigo)}`

/** O código como o Medusa guarda: sem espaço, em maiúsculas. */
export const codigoLimpo = (v: string) => v.replace(/\s+/g, "").toUpperCase()

/** O formulário do cupom novo, como a tela guarda (texto, como foi digitado). */
export type FormularioDoCupom = {
  codigo: string
  tipo: "porcento" | "reais" | "frete"
  valor: string
  /** Frete grátis só na opção de envio de menor custo. */
  soMaisBarato: boolean
  aplicarA: "loja" | "categorias" | "produtos"
  /** Os ids das categorias ou dos produtos escolhidos. */
  alvos: string[]
  combina: boolean
  porCupom: "ilimitado" | "limitado"
  limite: string
  porCliente: "ilimitado" | "limitado" | "primeira"
  usosPorCliente: string
  data: "ilimitado" | "periodo"
  /** "2026-10-01T00:00", em Brasília (o campo de data e hora). */
  de: string
  ate: string
  minimo: string
}

/** Como o "Criar cupom" da Nuvemshop abre: porcentagem, a loja toda, tudo ilimitado. */
export const CUPOM_VAZIO: FormularioDoCupom = {
  codigo: "",
  tipo: "porcento",
  valor: "",
  soMaisBarato: false,
  aplicarA: "loja",
  alvos: [],
  combina: true,
  porCupom: "ilimitado",
  limite: "",
  porCliente: "ilimitado",
  usosPorCliente: "",
  data: "ilimitado",
  de: "",
  ate: "",
  minimo: "",
}

/** "2026-09-26T00:00": hoje à meia-noite, em Brasília — o começo que o "Período" sugere. */
export function hojeAMeiaNoite(agora = new Date()): string {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora)
  return `${dia}T00:00`
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
const quando = (d: string) =>
  d.length >= 16 ? `${d.slice(8, 10)}/${d.slice(5, 7)} às ${d.slice(11, 16)}` : "…"
/** "Óleo" · "Óleo ou Balm" · "Óleo, Balm ou Shampoo" · "Óleo, Balm e mais 3". */
function emLista(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? ""
  if (nomes.length <= 3) return `${nomes.slice(0, -1).join(", ")} ou ${nomes[nomes.length - 1]}`
  return `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}`
}

/**
 * "BARBA20: 20% em pedidos a partir de R$ 99,90 · de 01/10 às 00:00 até
 * 15/10 às 23:59 · 200 usos no total · uma vez por cliente" — a mesma frase
 * que a lista vai mostrar (`descricaoDoCupom` e `regraDoCupom`, no backend).
 */
export function previaDoCupom(
  f: FormularioDoCupom,
  catalogo: Catalogo = { categorias: [], produtos: [] }
): string {
  const codigo = codigoLimpo(f.codigo) || "CÓDIGO"
  const valor = numero(f.valor)
  const minimo = numero(f.minimo)
  const quanto =
    f.tipo === "frete"
      ? f.soMaisBarato
        ? "Frete grátis na opção mais barata"
        : "Frete grátis"
      : valor === null
        ? f.tipo === "porcento"
          ? "…%"
          : "R$ … de desconto"
        : f.tipo === "porcento"
          ? `${valor}%`
          : `${reais(valor)} de desconto`
  const opcoes = f.aplicarA === "categorias" ? catalogo.categorias : catalogo.produtos
  const nomes =
    f.aplicarA === "loja" ? [] : opcoes.filter((a) => f.alvos.includes(a.id)).map((a) => a.nome)
  const onde =
    f.aplicarA === "categorias"
      ? `só com produtos de ${nomes.length ? emLista(nomes) : "…"}`
      : f.aplicarA === "produtos"
        ? `só com ${nomes.length ? emLista(nomes) : "…"}`
        : null
  const aPartir = minimo && minimo > 0 ? `em pedidos a partir de ${reais(minimo)}` : null
  const descricao = onde
    ? aPartir
      ? `${quanto} ${onde}, ${aPartir}`
      : `${quanto} ${onde}`
    : `${quanto} ${aPartir ?? "em qualquer pedido"}`

  const limite = f.porCupom === "limitado" ? numero(f.limite) : null
  const porCliente = f.porCliente === "limitado" ? numero(f.usosPorCliente) : null
  const regra = [
    f.data === "periodo" ? `de ${quando(f.de)} até ${quando(f.ate)}` : "sem data de fim",
    ...(limite && limite > 0 ? [`${limite} ${limite === 1 ? "uso" : "usos"} no total`] : []),
    ...(porCliente && porCliente > 0
      ? [porCliente === 1 ? "uma vez por cliente" : `${porCliente} vezes por cliente`]
      : []),
    ...(f.porCliente === "primeira" ? ["só na primeira compra"] : []),
    ...(!f.combina ? ["não combina com outras promoções"] : []),
  ].join(" · ")
  return `${codigo}: ${descricao} · ${regra}`
}
