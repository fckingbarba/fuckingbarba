/**
 * O AVISO DA REPOSIÇÃO NO SITE (entrega 0188) — "Seu Fator de Crescimento
 * acaba em 5 dias", com o "Refazer o pedido", pra quem está com a conta
 * aberta: na visão geral da conta e na home. Quem faz a conta é o Medusa
 * (`GET /store/crm/reposicao`, a mesma dos e-mails da reposição); a loja só
 * confere a forma e mostra.
 *
 * NA HOME o aviso sobe num canto (`components/reposicao/`), mas a página é a
 * mesma pra todo mundo (vem pronta do cache) e o cookie da sessão é só do
 * servidor. Por isso o `fb_conta`: um cookie que o navegador lê, gravado
 * quando a pessoa entra e apagado quando sai, com um sorteio dentro — nada
 * de quem é. Só com ele a home pergunta (`/api/reposicao`). A resposta fica
 * na aba por meia hora, presa ao sorteio: outra pessoa que entre no mesmo
 * navegador não vê a de quem saiu. O "fechar" vale até a próxima reposição
 * (pela `chave`: o tipo e o dia de acabar).
 *
 * Sem diretiva: o servidor e o navegador importam daqui.
 */

export const COOKIE_CONTA_ABERTA = "fb_conta"

/** O `fb_conta`: o navegador lê (sem `httpOnly`). Quem grava põe o prazo, o da sessão. */
export const OPCOES_DA_CONTA_ABERTA = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
}

/** O sorteio do `fb_conta`: 16 letras, sem nada da pessoa. */
export function sorteioDaConta(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export const ehSorteioDaConta = (valor: string | null | undefined): valor is string =>
  typeof valor === "string" && /^[0-9a-f]{16}$/.test(valor)

export type AvisoDaReposicao = {
  /** "Seu Fator de Crescimento acaba em 5 dias", "Acabou o óleo?". */
  titulo: string
  /** A conta por trás do aviso e o que o botão faz (a conta mostra; a home, não). */
  texto: string
  /** Dias até acabar, no calendário de Brasília; negativo, já acabou. */
  dias: number
  /** O pedido da última compra desse tipo: `order_…` (loja nova) ou `nso_…` (a antiga). */
  pedido: string
  produto: { nome: string; handle: string; imagem: string | null }
  /** O "Refazer o pedido": `/voltar/<t>`, o mesmo link dos e-mails. */
  voltar: string
  /** Pro "fechar" da home valer só pra este aviso. */
  chave: string
}

const VOLTAR = /^\/voltar\/repor-(order|nso)_[0-9A-Z]{26}\.[0-9a-z]{1,10}\.[A-Za-z0-9_-]{22}$/
const PEDIDO = /^(order|nso)_[0-9A-Z]{26}$/
const CHAVE = /^[a-z]{2,12}\.\d{4}-\d{2}-\d{2}$/
const texto = (x: unknown, max: number) =>
  typeof x === "string" && x.trim() && x.length <= max ? x : null

/** O aviso que veio do Medusa (ou da aba), se tiver a forma certa; senão, nenhum. */
export function avisoValido(x: unknown): AvisoDaReposicao | null {
  if (!x || typeof x !== "object") return null
  const a = x as Record<string, unknown>
  const p = (a.produto ?? {}) as Record<string, unknown>
  const titulo = texto(a.titulo, 120)
  const explicacao = texto(a.texto, 300)
  const nome = texto(p.nome, 200)
  const handle = texto(p.handle, 200)
  const foto = texto(p.imagem, 2000)
  const imagem = foto && /^https?:\/\//.test(foto) ? foto : null
  if (!titulo || !explicacao || !nome || !handle) return null
  if (typeof a.dias !== "number" || !Number.isInteger(a.dias) || Math.abs(a.dias) > 60) return null
  if (typeof a.pedido !== "string" || !PEDIDO.test(a.pedido)) return null
  if (typeof a.voltar !== "string" || !VOLTAR.test(a.voltar)) return null
  if (typeof a.chave !== "string" || !CHAVE.test(a.chave)) return null
  return {
    titulo,
    texto: explicacao,
    dias: a.dias,
    pedido: a.pedido,
    produto: { nome, handle, imagem },
    voltar: a.voltar,
    chave: a.chave,
  }
}
