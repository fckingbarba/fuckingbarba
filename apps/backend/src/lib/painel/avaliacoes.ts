import { quando, type Data } from "./formato"

/**
 * AS AVALIAÇÕES NO PAINEL — as que chegaram pela página `/avaliar`, pra
 * aprovar (vão pro site) ou recusar. Código puro, com testes; a leitura do
 * banco é `ler-avaliacoes.ts`, e a regra de aprovar é
 * `lib/avaliacoes/moderar.ts`.
 *
 * TRÊS FITAS: as novas (a fila, da mais antiga pra mais nova — quem
 * esperou mais é lida primeiro), as que estão no site e as recusadas (as
 * duas da mais recente pra mais antiga).
 *
 * O NÚMERO DO PEDIDO só vai pra quem abre os pedidos (`verPedido`): o
 * marketing aprova avaliação sem ver de quem é a compra — a mesma régua da
 * ficha do CRM.
 */

export type Filtro = "novas" | "no-site" | "recusadas"

export const FILTROS: { id: Filtro; nome: string }[] = [
  { id: "novas", nome: "Novas" },
  { id: "no-site", nome: "No site" },
  { id: "recusadas", nome: "Recusadas" },
]

export const ehFiltro = (v: unknown): v is Filtro => FILTROS.some((f) => f.id === v)

export type Situacao = "nova" | "aprovada" | "recusada"

const DO_FILTRO: Record<Filtro, Situacao> = {
  novas: "nova",
  "no-site": "aprovada",
  recusadas: "recusada",
}

export type AvaliacaoCrua = {
  id: string
  pedido_id: string
  numero: number
  produto_id: string
  produto_nome: string
  nome: string
  nota: number
  texto: string
  situacao: Situacao
  moderada_em?: Data | null
  moderada_por?: string | null
  created_at: Data
}

const hora = (d: Data) => new Date(d).getTime()

/**
 * A fita escolhida, na ordem da tela, e as contas de cima — sobre a lista
 * inteira: a página é só o recorte que viaja (ver `paginas.ts`).
 */
export function listaDasAvaliacoes(cruas: readonly AvaliacaoCrua[], filtro: Filtro) {
  const contagem: Record<Filtro, number> = { novas: 0, "no-site": 0, recusadas: 0 }
  for (const a of cruas) {
    const f = FILTROS.find((x) => DO_FILTRO[x.id] === a.situacao)
    if (f) contagem[f.id]++
  }
  const noSite = cruas.filter((a) => a.situacao === "aprovada")
  const media = noSite.length
    ? Math.round((noSite.reduce((s, a) => s + Number(a.nota), 0) / noSite.length) * 10) / 10
    : null
  const lista = cruas
    .filter((a) => a.situacao === DO_FILTRO[filtro])
    .sort((a, b) =>
      filtro === "novas"
        ? hora(a.created_at) - hora(b.created_at)
        : hora(b.moderada_em ?? b.created_at) - hora(a.moderada_em ?? a.created_at)
    )
  return { lista, contagem, noSite: { media, total: noSite.length } }
}

export type ProdutoDaLinha = { nome: string; handle: string | null; foto: string | null }

export type LinhaDaAvaliacao = {
  id: string
  nome: string
  nota: number
  texto: string
  situacao: Situacao
  produto: ProdutoDaLinha
  /** "hoje, 14:32" — quando a pessoa mandou. */
  quando: string
  /**
   * Só pra quem abre os pedidos. `nuvemshop`: o pedido é da loja antiga (a
   * base que o CRM guardou) — não tem página no painel.
   */
  pedido: { id: string; numero: number; nuvemshop: boolean } | null
  /** "Aprovada por Ana · ontem, 10:02" — nada enquanto é nova. */
  moderacao: string | null
}

export function emLinha(
  a: AvaliacaoCrua,
  {
    produto,
    quem,
    verPedido,
    agora,
  }: {
    /** O produto no catálogo agora; sem ele (saiu do catálogo), o nome da hora da avaliação. */
    produto?: { handle: string | null; foto: string | null } | null
    /** O nome de quem moderou (`moderada_por`), se é da equipe. */
    quem?: string | null
    verPedido: boolean
    agora: Data
  }
): LinhaDaAvaliacao {
  const feito =
    a.situacao === "nova" || !a.moderada_em
      ? null
      : `${a.situacao === "aprovada" ? "Aprovada" : "Recusada"} ${
          quem ? `por ${quem}` : a.moderada_por ? "por alguém da equipe" : "pelo admin"
        } · ${quando(a.moderada_em, agora)}`
  return {
    id: a.id,
    nome: a.nome,
    nota: Number(a.nota),
    texto: a.texto,
    situacao: a.situacao,
    produto: {
      nome: a.produto_nome,
      handle: produto?.handle ?? null,
      foto: produto?.foto ?? null,
    },
    quando: quando(a.created_at, agora),
    pedido: verPedido
      ? { id: a.pedido_id, numero: Number(a.numero), nuvemshop: a.pedido_id.startsWith("nso_") }
      : null,
    moderacao: feito,
  }
}

export type TelaDasAvaliacoes = {
  filtro: Filtro
  contagem: Record<Filtro, number>
  /** O que o site mostra: a média das aprovadas (uma casa) e quantas são. */
  noSite: { media: number | null; total: number }
  avaliacoes: LinhaDaAvaliacao[]
}
