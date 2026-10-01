/**
 * AS OFERTAS OCULTAS NA LOJA — um preço só pra quem abre o link
 * `/oferta/<endereço>`, até a data de fim (a regra mora no backend:
 * `apps/backend/src/lib/ofertas/regras.ts`). Fora do menu, do sitemap e do
 * Google (`robots.ts` e a própria página); o pop-up da 1ª compra não abre
 * nela.
 *
 * COMO O PREÇO CHEGA NA SACOLA: o "Comprar" da página (`adicionarDaOferta`)
 * marca o carrinho com a oferta antes de pôr o produto — com a marca, o
 * Medusa cobra o preço da oferta; sem, o de sempre. A vitrine e a página do
 * produto nunca leem a marca: lá o preço é o de todo mundo.
 *
 * Código de cliente e de servidor: só tipo e conta, nada de rede.
 */

export type SituacaoDaOferta = "agendada" | "no-ar" | "pausada" | "encerrada"

/** O que `GET /store/oferta/:endereco` devolve. */
export type OfertaDaPagina = {
  id: string
  endereco: string
  titulo: string
  chamada: string | null
  comecaEm: string
  terminaEm: string
  situacao: SituacaoDaOferta
  /** Pausada ou encerrada, vazio. */
  produtos: { id: string; por: number }[]
}

export const ehEnderecoDeOferta = (v: string) => /^[a-z0-9-]{3,40}$/.test(v)

/**
 * A oferta AGORA: a pausa e o "encerrar" vêm do painel (a página é refeita
 * na hora); o começo e o fim, do relógio — a página guardada não sabe que
 * a hora passou.
 */
export function situacaoAgora(
  o: Pick<OfertaDaPagina, "situacao" | "comecaEm" | "terminaEm">,
  agora: number
): SituacaoDaOferta {
  if (o.situacao === "pausada" || o.situacao === "encerrada") return o.situacao
  if (new Date(o.terminaEm).getTime() <= agora) return "encerrada"
  if (new Date(o.comecaEm).getTime() > agora) return "agendada"
  return "no-ar"
}

/**
 * O preço que a página mostra: o menor entre o "por" e o de hoje na vitrine
 * — é o que o carrinho cobra (a lista da oferta guarda os dois). O riscado
 * é o cheio, ou o da vitrine quando ela não tem promoção.
 */
export function precoNaOferta(
  por: number,
  vitrine: { atual: number; cheio: number | null } | null
): { atual: number; cheio: number | null } {
  if (!vitrine) return { atual: por, cheio: null }
  const atual = Math.min(por, vitrine.atual)
  const cheio = vitrine.cheio ?? vitrine.atual
  return { atual, cheio: cheio > atual ? cheio : null }
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]
const BRASILIA_MS = 3 * 60 * 60 * 1000
const dois = (n: number) => String(n).padStart(2, "0")
/**
 * "dom, 05/10, às 23:59" — em Brasília (UTC−3 o ano todo). À mão, e não com
 * o `Intl`: o texto sai no servidor e de novo na hidratação, e o `Intl` do
 * Node e o do navegador não escrevem igual (vírgula, ponto do dia da semana).
 */
export function quandoAcaba(iso: string): string {
  const d = new Date(new Date(iso).getTime() - BRASILIA_MS)
  return `${DIAS[d.getUTCDay()]}, ${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}, às ${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}`
}
