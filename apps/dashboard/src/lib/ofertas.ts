/**
 * AS OFERTAS OCULTAS NO PAINEL — o contrato com `GET /dashboard/ofertas` e
 * o formulário da oferta nova (Cupons e descontos → Ofertas ocultas). A regra
 * mora no backend (`apps/backend/src/lib/ofertas/regras.ts`): aqui é o que a
 * tela mostra e o que ela manda.
 *
 * Uma oferta oculta é um preço só pra quem abre o link `/oferta/<endereço>`
 * da loja, até a data de fim. Quem não tem o link vê o preço de sempre.
 */

export type SituacaoDaOferta = "agendada" | "no-ar" | "pausada" | "encerrada"

export type ProdutoDaOfertaNaLista = {
  id: string
  nome: string
  por: number
  /** O preço da vitrine hoje, ou `null`. */
  hoje: number | null
}

export type OfertaNaLista = {
  id: string
  nome: string
  titulo: string
  chamada: string | null
  endereco: string
  link: string | null
  comecaEm: string
  terminaEm: string
  situacao: SituacaoDaOferta
  produtos: ProdutoDaOfertaNaLista[]
  vendas: { pedidos: number; vendeu: number }
}

export type ProdutoDoFormulario = {
  id: string
  nome: string
  imagem: string | null
  preco: number | null
  cheio: number | null
}

export type PaginaDeOfertas = {
  ofertas: OfertaNaLista[]
  produtos: ProdutoDoFormulario[]
  /** Quatro letras pro endereço sugerido. */
  sorteio: string
}

export const NOME_DA_SITUACAO: Record<SituacaoDaOferta, string> = {
  agendada: "Agendada",
  "no-ar": "No ar",
  pausada: "Pausada",
  encerrada: "Encerrada",
}

export const COR_DA_SITUACAO: Record<SituacaoDaOferta, string> = {
  agendada: "esperando",
  "no-ar": "ativo",
  pausada: "pausado",
  encerrada: "cancelado",
}

export type FormularioDaOferta = {
  nome: string
  titulo: string
  chamada: string
  endereco: string
  /** "agora" ou "data" (aí vale o `de`). */
  comeco: "agora" | "data"
  de: string
  ate: string
  /** produto → o "por" digitado ("59,90"). Só os marcados. */
  precos: Record<string, string>
}

export const TITULO_PADRAO = "Oferta só pra quem tem o link"

/** "2026-10-08T23:59": daqui a `dias`, às 23:59, em Brasília. */
export function diaAs2359(dias: number, agora = new Date()): string {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(agora.getTime() + dias * 86_400_000)
  )
  return `${dia}T23:59`
}

export function ofertaVazia(agora = new Date()): FormularioDaOferta {
  return {
    nome: "",
    titulo: TITULO_PADRAO,
    chamada: "",
    endereco: "",
    comeco: "agora",
    de: "",
    ate: diaAs2359(7, agora),
    precos: {},
  }
}

/** "Lista VIP — Outubro!" → "lista-vip-outubro" (a mesma conta do backend). */
export function enderecoDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "")
}

export const enderecoSugerido = (nome: string, sorteio: string) =>
  `${enderecoDoNome(nome) || "oferta"}-${sorteio}`

/** "59,90" → 59.9; vazio ou lixo → null. */
export function numero(v: string): number | null {
  const limpo = v
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
  if (!/\d/.test(limpo)) return null
  const n = Number(limpo)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

/** O desconto do "por" sobre o preço de hoje, em %, ou null. */
export function descontoDe(hoje: number | null, por: number | null): number | null {
  if (hoje === null || por === null || por >= hoje) return null
  return Math.round((1 - por / hoje) * 100)
}

/** O que vai pro backend (`POST /dashboard/ofertas`). */
export function corpoDaOferta(f: FormularioDaOferta) {
  return {
    nome: f.nome,
    titulo: f.titulo,
    chamada: f.chamada,
    endereco: f.endereco,
    de: f.comeco === "data" ? f.de : "",
    ate: f.ate,
    produtos: Object.entries(f.precos).map(([produto, por]) => ({ produto, por })),
  }
}

const QUANDO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})
/** "05/10 às 23:59" (Brasília). */
export const quando = (iso: string) => QUANDO.format(new Date(iso)).replace(", ", " às ")

/** "de 01/10 às 14:00 até 08/10 às 23:59". */
export const prazoEmFrase = (o: Pick<OfertaNaLista, "comecaEm" | "terminaEm">) =>
  `de ${quando(o.comecaEm)} até ${quando(o.terminaEm)}`
