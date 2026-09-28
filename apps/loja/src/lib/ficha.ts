/**
 * A FICHA DO SITE (entregas 0188 e 0190) — o que a loja sabe de quem está com
 * a conta aberta, pelas compras dele: o que está acabando (a reposição, com
 * o "Refazer o pedido"), o dia do tratamento com o Fator, o que ele comprou
 * e o que combina com isso. Quem faz as contas é o Medusa
 * (`GET /store/crm/ficha`, as mesmas dos e-mails do CRM); a loja só confere
 * a forma e mostra:
 *
 *   - na conta: "Pra repor" e "Seu tratamento" (`lib/ficha-da-conta.ts`);
 *   - na home: o aviso da reposição num canto (`components/reposicao/`);
 *   - na página do produto: "Você comprou há 25 dias" ou "Combina com o Fator
 *     que você já tem", em cima da foto (`components/ficha/`).
 *
 * A HOME E A PÁGINA DO PRODUTO são as mesmas pra todo mundo (vêm prontas do
 * cache), e o cookie da sessão é só do servidor. Por isso o `fb_conta`: um
 * cookie que o navegador lê, gravado quando a pessoa entra e apagado quando
 * sai, com um sorteio dentro — nada de quem é. Só com ele o navegador
 * pergunta (`/api/ficha`). A resposta fica na aba por meia hora, presa ao
 * sorteio: outra pessoa que entre no mesmo navegador não vê a de quem saiu.
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

export type TratamentoDoSite = {
  /** "Dia 23": o dia da chegada do Fator é o dia 1. */
  dia: number
  /** Onde a barra termina: o marco com "alvo" da linha do tempo do Fator (o dia 90). */
  alvo: number
  /** O próximo marco da linha do tempo da página do Fator. */
  marco: { quando: string; titulo: string; texto: string } | null
  /** A página do Fator… */
  handle: string
  /** …e se a linha do tempo está ligada nela: o link desce até a seção. */
  linhaDoTempo: boolean
}

export type FichaDoSite = {
  reposicao: AvisoDaReposicao | null
  tratamento: TratamentoDoSite | null
  /** Há quantos dias foi a última compra de cada produto. */
  compras: { handle: string; dias: number }[]
  /** O que completa a rotina, com o porquê ("Combina com o Fator que você já tem"). */
  combina: { handle: string; porque: string }[]
}

const HANDLE = /^[a-z0-9][a-z0-9-]{0,199}$/
const inteiro = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= min && x <= max
const lista = (x: unknown) =>
  Array.isArray(x)
    ? x.filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
    : []

function tratamentoValido(x: unknown): TratamentoDoSite | null {
  if (!x || typeof x !== "object") return null
  const t = x as Record<string, unknown>
  if (!inteiro(t.dia, 1, 2000) || !inteiro(t.alvo, 1, 2000)) return null
  if (typeof t.handle !== "string" || !HANDLE.test(t.handle)) return null
  const m = (t.marco ?? null) as Record<string, unknown> | null
  const quando = m && texto(m.quando, 60)
  const titulo = m && texto(m.titulo, 120)
  const explicacao = m && texto(m.texto, 400)
  return {
    dia: t.dia,
    alvo: t.alvo,
    marco: quando && titulo && explicacao ? { quando, titulo, texto: explicacao } : null,
    handle: t.handle,
    linhaDoTempo: t.linhaDoTempo === true,
  }
}

/** A ficha que veio do Medusa (ou da aba), com cada parte conferida; sem forma, nenhuma. */
export function fichaValida(x: unknown): FichaDoSite | null {
  if (!x || typeof x !== "object") return null
  const f = x as Record<string, unknown>
  return {
    reposicao: avisoValido(f.reposicao),
    tratamento: tratamentoValido(f.tratamento),
    compras: lista(f.compras)
      .flatMap((c) =>
        typeof c.handle === "string" && HANDLE.test(c.handle) && inteiro(c.dias, 0, 9999)
          ? [{ handle: c.handle, dias: c.dias }]
          : []
      )
      .slice(0, 60),
    combina: lista(f.combina)
      .flatMap((c) => {
        const porque = texto(c.porque, 120)
        return typeof c.handle === "string" && HANDLE.test(c.handle) && porque
          ? [{ handle: c.handle, porque }]
          : []
      })
      .slice(0, 4),
  }
}

/** "Você comprou hoje", "ontem", "há 25 dias", "há 3 meses". */
export function quandoComprou(dias: number): string {
  if (dias <= 0) return "Você comprou hoje"
  if (dias === 1) return "Você comprou ontem"
  if (dias < 60) return `Você comprou há ${dias} dias`
  return `Você comprou há ${Math.round(dias / 30)} meses`
}
