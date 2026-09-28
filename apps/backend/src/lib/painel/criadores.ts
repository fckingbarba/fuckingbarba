import type { Paginacao } from "./paginas"
import { linkDoWhatsapp } from "./carrinhos"
import { quando, type Data } from "./formato"

/**
 * OS CRIADORES NO PAINEL — as inscrições da página escondida `/criadores`,
 * pra aprovar (a loja chama pra fechar) ou recusar. Código puro, com testes;
 * a leitura do banco é `ler-criadores.ts`, e a regra de decidir,
 * `lib/criadores/decidir.ts`.
 *
 * TRÊS FITAS: as novas (a fila, da mais antiga pra mais nova — quem esperou
 * mais é lida primeiro), as aprovadas e as recusadas (as duas da decisão
 * mais recente pra mais antiga).
 *
 * OS NÚMEROS DE CIMA contam as novas e as aprovadas por modelo — quantas
 * pessoas querem o fixo e quantas a comissão é a conta do orçamento.
 */

export type Filtro = "novas" | "aprovadas" | "recusadas"

export const FILTROS: { id: Filtro; nome: string }[] = [
  { id: "novas", nome: "Novas" },
  { id: "aprovadas", nome: "Aprovadas" },
  { id: "recusadas", nome: "Recusadas" },
]

export const ehFiltro = (v: unknown): v is Filtro => FILTROS.some((f) => f.id === v)

export type Situacao = "nova" | "aprovada" | "recusada"

const DO_FILTRO: Record<Filtro, Situacao> = {
  novas: "nova",
  aprovadas: "aprovada",
  recusadas: "recusada",
}

export type Modelo = "fixo" | "comissao" | "conversar"

/** Os nomes da tela — sem os números da oferta, que mudam na página e não aqui. */
export const NOME_DO_MODELO: Record<Modelo, string> = {
  fixo: "Fixo",
  comissao: "Comissão",
  conversar: "Quer conversar",
}

const NOME_DOS_SEGUIDORES: Record<string, string> = {
  "ate-1mil": "menos de 1 mil seguidores",
  "1-10mil": "1 mil a 10 mil seguidores",
  "10-50mil": "10 mil a 50 mil seguidores",
  "50-100mil": "50 mil a 100 mil seguidores",
  "mais-100mil": "mais de 100 mil seguidores",
}

const NOME_DA_BARBA: Record<string, string> = {
  cheia: "Barba cheia",
  media: "Barba média",
  curta: "Barba curta",
  crescendo: "Barba crescendo",
}

const NOME_DA_EXPERIENCIA: Record<string, string> = {
  nunca: "Nunca gravou publi",
  algumas: "Já gravou algumas vezes",
  sempre: "Grava publi sempre",
}

export type InscricaoCrua = {
  id: string
  nome: string
  whatsapp: string
  email: string
  cidade: string
  instagram: string | null
  tiktok: string | null
  seguidores: string | null
  barba: string
  experiencia: string | null
  video: string | null
  parceria: boolean
  modelo: string
  situacao: Situacao
  consentido_em: Data
  decidida_em?: Data | null
  decidida_por?: string | null
}

const hora = (d: Data) => new Date(d).getTime()

const ehModelo = (v: string): v is Modelo => v in NOME_DO_MODELO

/**
 * A fita escolhida, na ordem da tela, e as contas de cima — sobre a lista
 * inteira: a página é só o recorte que viaja (ver `paginas.ts`).
 */
export function listaDasInscricoes(cruas: readonly InscricaoCrua[], filtro: Filtro) {
  const contagem: Record<Filtro, number> = { novas: 0, aprovadas: 0, recusadas: 0 }
  const modelos: Record<Modelo, number> = { fixo: 0, comissao: 0, conversar: 0 }
  for (const c of cruas) {
    const f = FILTROS.find((x) => DO_FILTRO[x.id] === c.situacao)
    if (f) contagem[f.id]++
    if (c.situacao !== "recusada" && ehModelo(c.modelo)) modelos[c.modelo]++
  }
  const lista = cruas
    .filter((c) => c.situacao === DO_FILTRO[filtro])
    .sort((a, b) =>
      filtro === "novas"
        ? hora(a.consentido_em) - hora(b.consentido_em)
        : hora(b.decidida_em ?? b.consentido_em) - hora(a.decidida_em ?? a.consentido_em)
    )
  return { lista, contagem, modelos }
}

/** "47999990000" → "(47) 99999-0000"; o fixo, "(47) 3333-0000". */
export function whatsappNaTela(digitos: string): string {
  const d = digitos.replace(/\D/g, "")
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return digitos
}

/** O texto que abre no WhatsApp — quem é da equipe muda o que quiser antes de mandar. */
export function mensagemPraCriador(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0]
  return (
    `Oi${primeiro ? `, ${primeiro}` : ""}! Aqui é da FuckingBarba, sobre a sua inscrição ` +
    "pra gravar os vídeos da loja."
  )
}

export type PerfilDoCriador = { rede: "Instagram" | "TikTok"; arroba: string; link: string }

export type LinhaDoCriador = {
  id: string
  nome: string
  /** "(47) 99999-0000" e o link do WhatsApp com a mensagem pronta. */
  whatsapp: { texto: string; link: string }
  email: string
  cidade: string
  perfis: PerfilDoCriador[]
  /** "1 mil a 10 mil seguidores", ou nada. */
  seguidores: string | null
  barba: string
  experiencia: string | null
  video: string | null
  parceria: boolean
  modelo: { id: string; nome: string }
  situacao: Situacao
  /** "hoje, 14:32" — quando a pessoa mandou (a última vez). */
  quando: string
  /** "Aprovada por Ana · ontem, 10:02" — nada enquanto é nova. */
  decisao: string | null
}

export function emLinha(
  c: InscricaoCrua,
  {
    quem,
    agora,
  }: {
    /** O nome de quem decidiu (`decidida_por`), se é da equipe. */
    quem?: string | null
    agora: Data
  }
): LinhaDoCriador {
  const perfis: PerfilDoCriador[] = []
  if (c.instagram) {
    perfis.push({
      rede: "Instagram",
      arroba: c.instagram,
      link: `https://www.instagram.com/${encodeURIComponent(c.instagram)}/`,
    })
  }
  if (c.tiktok) {
    perfis.push({
      rede: "TikTok",
      arroba: c.tiktok,
      link: `https://www.tiktok.com/@${encodeURIComponent(c.tiktok)}`,
    })
  }
  const decisao =
    c.situacao === "nova" || !c.decidida_em
      ? null
      : `${c.situacao === "aprovada" ? "Aprovada" : "Recusada"} ${
          quem ? `por ${quem}` : c.decidida_por ? "por alguém da equipe" : "pelo admin"
        } · ${quando(c.decidida_em, agora)}`
  return {
    id: c.id,
    nome: c.nome,
    whatsapp: {
      texto: whatsappNaTela(c.whatsapp),
      link: linkDoWhatsapp(`55${c.whatsapp}`, mensagemPraCriador(c.nome)),
    },
    email: c.email,
    cidade: c.cidade,
    perfis,
    seguidores: c.seguidores ? (NOME_DOS_SEGUIDORES[c.seguidores] ?? null) : null,
    barba: NOME_DA_BARBA[c.barba] ?? c.barba,
    experiencia: c.experiencia ? (NOME_DA_EXPERIENCIA[c.experiencia] ?? null) : null,
    video: c.video,
    parceria: Boolean(c.parceria),
    modelo: { id: c.modelo, nome: ehModelo(c.modelo) ? NOME_DO_MODELO[c.modelo] : c.modelo },
    situacao: c.situacao,
    quando: quando(c.consentido_em, agora),
    decisao,
  }
}

/** O endereço da página pra mandar aos criadores (o `LOJA_URL`), ou `null` sem ele. */
export function paginaDosCriadores(lojaUrl: string | undefined): string | null {
  try {
    return `${new URL(lojaUrl ?? "").origin}/criadores`
  } catch {
    return null
  }
}

export type TelaDosCriadores = {
  filtro: Filtro
  contagem: Record<Filtro, number>
  /** Das novas e das aprovadas: quantas querem cada modelo. */
  modelos: Record<Modelo, number>
  /** O link da página `/criadores`, pro "Copiar o link" (`null` sem `LOJA_URL`). */
  pagina: string | null
  inscricoes: LinhaDoCriador[]
  paginacao?: Paginacao
}
