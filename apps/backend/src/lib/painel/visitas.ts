import type { Papel } from "../equipe/regras"
import { chaveDoDia, hora } from "./formato"

/**
 * AS VISITAS DO DIA — o que o Google Analytics (GA4) conta, do jeito do
 * Início: quantas hoje, contra ontem até a mesma hora, hora a hora, quem
 * está no site agora, de onde vieram e os produtos mais vistos.
 *
 * Código puro: monta as perguntas e lê as respostas da API de dados do
 * Google (quem pergunta é o `ga4.ts`, ao lado). Os testes moram em
 * `__tests__/visitas.unit.spec.ts`.
 *
 * ┌─ O NÚMERO É MENOR QUE O DE VERDADE, E A TELA DIZ ──────────────────────┐
 * │ O GA4 da loja roda com o Consent Mode (`apps/loja/src/components/      │
 * │ analytics/tags.tsx`): quem recusa os cookies fica de fora da conta — a │
 * │ loja é pequena pra modelagem do Google preencher o buraco.             │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * VISITA É SESSÃO (`sessions`): quem entra de manhã e volta de noite conta
 * duas. Os produtos contam páginas vistas (`screenPageViews`) de
 * `/produtos/<handle>` — a loja não manda `view_item` (ainda).
 *
 * O FUSO É O DA PROPRIEDADE: o GA4 corta o dia e a hora no fuso escolhido
 * nela (Administrador → Detalhes da propriedade). Aqui, tudo supõe
 * Brasília, o da loja; em outro fuso, a virada do dia desalinha.
 */

/* ── as perguntas ─────────────────────────────────────────────────────────── */

const DIA_MS = 24 * 60 * 60 * 1000

/** Hoje e ontem em Brasília, no formato da API ("2026-09-24"). */
export function diasDaPergunta(agora: Date): { hoje: string; ontem: string } {
  return { hoje: chaveDoDia(agora), ontem: chaveDoDia(agora.getTime() - DIA_MS) }
}

/**
 * As três perguntas do dia, num `batchRunReports` só: as visitas por hora
 * (ontem e hoje), de onde vieram (hoje) e as páginas de produto (hoje).
 */
export function perguntasDoDia(agora: Date) {
  const { hoje, ontem } = diasDaPergunta(agora)
  const soHoje = [{ startDate: hoje, endDate: hoje }]
  return [
    {
      dateRanges: [{ startDate: ontem, endDate: hoje }],
      dimensions: [{ name: "date" }, { name: "hour" }],
      metrics: [{ name: "sessions" }],
      limit: "100",
    },
    {
      dateRanges: soHoje,
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "50",
    },
    {
      dateRanges: soHoje,
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      dimensionFilter: {
        filter: {
          fieldName: "pagePath",
          stringFilter: { matchType: "BEGINS_WITH", value: "/produtos/" },
        },
      },
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: "50",
    },
  ]
}

/** A pergunta do tempo real: quem está no site (os últimos 30 minutos). */
export const PERGUNTA_DO_AGORA = { metrics: [{ name: "activeUsers" }] }

/* ── as respostas ─────────────────────────────────────────────────────────── */

export type LinhaGa4 = {
  dimensionValues?: { value?: string }[] | null
  metricValues?: { value?: string }[] | null
}
export type RelatorioGa4 = { rows?: LinhaGa4[] | null }

/** As quatro respostas, na ordem das perguntas — é o que o `ga4.ts` guarda. */
export type RespostasDoGa4 = {
  horas: RelatorioGa4
  origens: RelatorioGa4
  paginas: RelatorioGa4
  agora: RelatorioGa4
}

export type Barra = { nome: string; visitas: number }

/** O que a operação recebe: só o número do dia. */
export type NumeroDeVisitas = {
  hoje: number
  /** Ontem, da meia-noite até esta mesma hora — a base do "+12% que ontem a esta hora". */
  ontemAteAgora: number
  /** "21:10": até quando o número vale. */
  ate: string
}

/** O que o dono e o marketing recebem: o número e o bloco inteiro. */
export type Visitas = NumeroDeVisitas & {
  /** Hoje, hora a hora, da 0h até a hora de agora (a última está no meio). */
  porHora: number[]
  /** Quem está no site: os últimos 30 minutos, no tempo real do GA4. */
  agora: number
  origens: Barra[]
  maisVistos: Barra[]
}

/** O bloco das visitas é do dono e do marketing; a operação vê o número (o protótipo). */
export const veOBlocoDasVisitas = (papel: Papel) => papel !== "operacao"

const numero = (v: string | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}
const dimensao = (l: LinhaGa4, i: number) => l.dimensionValues?.[i]?.value ?? ""
const metrica = (l: LinhaGa4) => numero(l.metricValues?.[0]?.value)
const linhas = (r: RelatorioGa4 | null | undefined) => r?.rows ?? []

/** As 24 horas de um dia ("2026-09-24"), da resposta por data e hora. */
export function horasDoDia(r: RelatorioGa4, dia: string): number[] {
  const horas = Array<number>(24).fill(0)
  const chave = dia.replace(/-/g, "")
  for (const l of linhas(r)) {
    if (dimensao(l, 0) !== chave) continue
    const h = Number(dimensao(l, 1))
    if (Number.isInteger(h) && h >= 0 && h < 24) horas[h] += metrica(l)
  }
  return horas
}

/** Ontem até esta hora: as horas inteiras antes, e o pedaço da hora de agora. */
export function ateEstaHora(horas: number[], h: number, minuto: number): number {
  let soma = 0
  for (let i = 0; i < h; i++) soma += horas[i] ?? 0
  return Math.round(soma + (horas[h] ?? 0) * (minuto / 60))
}

/** Os nomes que o dono reconhece, pelo endereço de onde a pessoa veio. */
const ORIGENS: [RegExp, string][] = [
  [/(^|\.)instagram\.com$|^instagram$|^ig$/, "Instagram"],
  [/(^|\.)facebook\.com$|^facebook$|^fb$/, "Facebook"],
  [/tiktok/, "TikTok"],
  [/youtube|youtu\.be/, "YouTube"],
  [/whatsapp|^wa\.me$/, "WhatsApp"],
  [/chatgpt|openai|perplexity|gemini\.google|copilot|claude\.ai/, "Assistentes de IA"],
  [/(^|\.)google\.|^google$/, "Google"],
  [/bing|duckduckgo|yahoo|ecosia|yandex/, "Outras buscas"],
]

export function nomeDaOrigem(fonte: string, meio: string): string {
  const f = fonte
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
  const m = meio.trim().toLowerCase()
  if (!f || f === "(not set)") return "Sem origem"
  if (f === "(direct)") return "Direto"
  if (m === "email" || m === "e-mail" || /newsletter|(^|\.)mail\./.test(f)) return "E-mail"
  for (const [padrao, nome] of ORIGENS) if (padrao.test(f)) return nome
  // O site que mandou gente, pelo endereço: diz mais que "outros sites".
  return f.slice(0, 40)
}

/** De onde vieram: as maiores, e o resto junto em "Outros" (5 linhas no máximo). */
export function origensDe(r: RelatorioGa4, maximo = 5): Barra[] {
  const soma = new Map<string, number>()
  for (const l of linhas(r)) {
    const nome = nomeDaOrigem(dimensao(l, 0), dimensao(l, 1))
    soma.set(nome, (soma.get(nome) ?? 0) + metrica(l))
  }
  const ordem = emOrdem(soma)
  if (ordem.length <= maximo) return ordem
  const resto = ordem.slice(maximo - 1).reduce((s, b) => s + b.visitas, 0)
  return [...ordem.slice(0, maximo - 1), { nome: "Outros", visitas: resto }]
}

const emOrdem = (soma: Map<string, number>): Barra[] =>
  [...soma.entries()]
    .map(([nome, visitas]) => ({ nome, visitas }))
    .filter((b) => b.visitas > 0)
    .sort((a, b) => b.visitas - a.visitas || a.nome.localeCompare(b.nome))

/** "/produtos/oleo-para-barba/" → "oleo-para-barba". A lista (`/produtos/ordem/…`) fica de fora. */
export function handleDaPagina(caminho: string): string | null {
  const m = /^\/produtos\/([a-z0-9][a-z0-9-]*)\/?$/i.exec(caminho.split(/[?#]/)[0])
  if (!m || m[1].toLowerCase() === "ordem") return null
  return m[1].toLowerCase()
}

/** Os handles que apareceram nas páginas — pra buscar o nome de cada um no Medusa. */
export const handlesDe = (r: RelatorioGa4): string[] => [
  ...new Set(
    linhas(r)
      .map((l) => handleDaPagina(dimensao(l, 0)))
      .filter((h): h is string => h !== null)
  ),
]

/** "kit-barba-completa" → "Kit barba completa": o produto que o Medusa não conhece (apagado, ou do site antigo). */
const nomeDoEndereco = (handle: string) => {
  const t = handle.replace(/-+/g, " ").trim()
  return `${t[0]?.toUpperCase() ?? ""}${t.slice(1)}`
}

/** Os produtos mais vistos hoje, com o nome do Medusa (`nomes`: handle → nome). */
export function maisVistosDe(r: RelatorioGa4, nomes: Map<string, string>, maximo = 5): Barra[] {
  const soma = new Map<string, number>()
  for (const l of linhas(r)) {
    const handle = handleDaPagina(dimensao(l, 0))
    if (handle) soma.set(handle, (soma.get(handle) ?? 0) + metrica(l))
  }
  return emOrdem(soma)
    .slice(0, maximo)
    .map((b) => ({ nome: nomes.get(b.nome) ?? nomeDoEndereco(b.nome), visitas: b.visitas }))
}

/** Quem está no site agora, pelo tempo real. */
export const noSiteAgora = (r: RelatorioGa4) => linhas(r).reduce((s, l) => s + metrica(l), 0)

export function montarVisitas(
  g: RespostasDoGa4,
  { agora, nomes }: { agora: Date; nomes: Map<string, string> }
): Visitas {
  const { hoje, ontem } = diasDaPergunta(agora)
  const [h, minuto] = hora(agora).split(":").map(Number)
  const horasDeHoje = horasDoDia(g.horas, hoje)
  return {
    hoje: horasDeHoje.reduce((s, v) => s + v, 0),
    ontemAteAgora: ateEstaHora(horasDoDia(g.horas, ontem), h, minuto),
    ate: hora(agora),
    porHora: horasDeHoje.slice(0, h + 1),
    agora: noSiteAgora(g.agora),
    origens: origensDe(g.origens),
    maisVistos: maisVistosDe(g.paginas, nomes),
  }
}

export const soONumero = ({ hoje, ontemAteAgora, ate }: NumeroDeVisitas): NumeroDeVisitas => ({
  hoje,
  ontemAteAgora,
  ate,
})
