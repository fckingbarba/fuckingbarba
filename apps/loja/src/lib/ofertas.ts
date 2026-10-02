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
  /**
   * O tempo do relógio da página, em minutos (entrega 0245), ou `null`
   * (conta até o fim). O backend de antes da 0245 não manda: `undefined`.
   */
  relogioMinutos?: number | null
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

/* ── a oferta na página do produto (entrega 0240) ─────────────────────── */

/**
 * A MARCA NO NAVEGADOR de quem abriu o link de uma oferta: o endereço dela,
 * num cookie que o JavaScript lê (não é segredo — o link é a chave, e a
 * marca só repete o link). Com ela, a página do produto pergunta a oferta e
 * mostra o preço dela (`ProvedorDaOfertaNaPdp`); sem ela, não pergunta
 * nada: a página do produto de todo mundo não ganha uma ida a mais. Vale
 * até o fim da oferta (o `max-age`), e o link de outra oferta troca.
 */
export const COOKIE_DA_OFERTA = "fb_oferta"

/** O endereço da marca, de um `document.cookie`, ou `null`. */
export function enderecoDoCookie(cookies: string): string | null {
  for (const parte of cookies.split(";")) {
    const [nome, ...resto] = parte.trim().split("=")
    if (nome !== COOKIE_DA_OFERTA) continue
    const valor = decodeURIComponent(resto.join("="))
    return ehEnderecoDeOferta(valor) ? valor : null
  }
  return null
}

/** O `document.cookie =` da marca: até o fim da oferta, no site inteiro. */
export function cookieDaOferta(
  endereco: string,
  terminaEm: string,
  agora: number,
  seguro: boolean
) {
  const segundos = Math.max(0, Math.floor((new Date(terminaEm).getTime() - agora) / 1000))
  return `${COOKIE_DA_OFERTA}=${encodeURIComponent(endereco)}; path=/; max-age=${segundos}; samesite=lax${seguro ? "; secure" : ""}`
}

export type Restante = {
  dias: number
  horas: number
  minutos: number
  segundos: number
  ms: number
}

/** Quanto falta até `fim`, em partes inteiras (zero depois do fim). */
export function restanteAte(fim: number, agora: number): Restante {
  const ms = Math.max(0, fim - agora)
  const total = Math.floor(ms / 1000)
  return {
    ms,
    dias: Math.floor(total / 86_400),
    horas: Math.floor((total % 86_400) / 3600),
    minutos: Math.floor((total % 3600) / 60),
    segundos: total % 60,
  }
}

/** "2d 14h" · "14h 33min" · "33min" — o prazo curto da barra fixa. */
export function prazoCurto(r: Restante): string {
  if (r.dias > 0) return `${r.dias}d ${r.horas}h`
  if (r.horas > 0) return `${r.horas}h ${r.minutos}min`
  return `${Math.max(1, r.minutos)}min`
}

/**
 * O QUE O RELÓGIO MOSTRA (entrega 0245). Sem o tempo do relógio, o que falta
 * até o fim de verdade. Com ele (escolha da loja, pra dar urgência), cada
 * pessoa vê esse tempo a partir de quando abriu a oferta (`desde`), e quando
 * zera ele recomeça — o preço vale até o fim da campanha. Nunca mais que o que
 * falta de verdade: na reta final, o relógio é o fim.
 */
export function restanteNoRelogio(
  terminaEm: string,
  relogioMinutos: number | null | undefined,
  desde: number,
  agora: number
): Restante {
  const fim = new Date(terminaEm).getTime()
  if (!relogioMinutos || relogioMinutos <= 0) return restanteAte(fim, agora)
  const ciclo = relogioMinutos * 60_000
  const doCiclo = ciclo - (Math.max(0, agora - desde) % ciclo)
  return restanteAte(agora + Math.min(doCiclo, Math.max(0, fim - agora)), agora)
}

/**
 * Quando esta pessoa abriu a oferta pela primeira vez (o começo do relógio),
 * guardado no navegador. Sem o armazenamento (aba anônima bloqueada), o
 * agora — o relógio começa de novo a cada página, o que não muda o preço.
 */
export function desdeDoRelogio(endereco: string, agora: number): number {
  const chave = `fb_oferta_relogio:${endereco}`
  try {
    const guardado = Number(localStorage.getItem(chave))
    if (Number.isFinite(guardado) && guardado > 0 && guardado <= agora) return guardado
    localStorage.setItem(chave, String(agora))
  } catch {
    // Sem armazenamento: o agora.
  }
  return agora
}
