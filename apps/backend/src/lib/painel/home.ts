import {
  CHAVE_DA_SECAO_DA_HOME,
  conteudoDaSecao,
  ehIdDaSecaoDaHome,
  FIXAS_DA_HOME,
  lerSecaoDaHome,
  SECOES_COM_FUNDO_DA_HOME,
  SECOES_DA_HOME,
  SEMENTE_DA_HOME,
  type HomeGuardada,
  type IdDaSecaoDaHome,
  type VersaoDaHome,
} from "../home"
import { lerPdp, type AjusteDeLayout, type Fundo } from "../pdp"
import { quando, type Data } from "./formato"
import type { MudancaNaOrdem } from "./produtos"

/**
 * A HOME DO JEITO DO PAINEL — a lista de seções, o que está esperando o
 * "Publicar", e cada mudança no rascunho.
 *
 * Código puro, como o `produtos.ts`: recebe a home como está gravada
 * (`lerHome`, em `lib/home.ts`) e devolve a tela, ou a home mudada. Quem lê e
 * grava são as rotas `/dashboard/home/*`, dentro da trava do metadata da
 * loja.
 *
 * TODA MUDANÇA VAI PRO RASCUNHO. Ligar, desligar, subir, descer e salvar o
 * texto de uma seção mexem só nele; a loja continua mostrando o publicado
 * até alguém apertar "Publicar". Se depois de uma mudança o rascunho ficar
 * igual ao publicado (ligou e desligou de novo), ele some: não há nada
 * esperando, e a tela não diz que há.
 */

/* ── a ordem ─────────────────────────────────────────────────────────────
 *
 * A MESMA CONTA DA LOJA (`aplicarOrdem`, em `apps/loja/src/lib/secoes/
 * layout.ts`): as seções soltas na ordem guardada (a que ela não citar vai
 * pro fim), e a fixa volta pro lugar dela no registro. Na home, a fixa (o
 * bloco escuro) fica no MEIO da página — então quem desce da quarta pra
 * quinta posição passa por cima dela, e o bloco escuro não sai do lugar.
 */

function comAsFixas(soltas: IdDaSecaoDaHome[]): IdDaSecaoDaHome[] {
  const ordem = [...soltas]
  SECOES_DA_HOME.forEach((id, i) => {
    if (FIXAS_DA_HOME.includes(id)) ordem.splice(i, 0, id)
  })
  return ordem
}

export function ordemDaHome(layout: AjusteDeLayout): IdDaSecaoDaHome[] {
  const solta = (id: IdDaSecaoDaHome) => !FIXAS_DA_HOME.includes(id)
  const guardada = (layout.ordem ?? []).filter(ehIdDaSecaoDaHome).filter(solta)
  const resto = SECOES_DA_HOME.filter((id) => solta(id) && !guardada.includes(id))
  return comAsFixas([...new Set([...guardada, ...resto])])
}

/**
 * Liga, desliga, sobe ou desce UMA seção, a partir do rascunho gravado
 * agora. `null` quando não dá: a fixa, subir a primeira, descer a última.
 */
export function mudarNaOrdemDaHome(
  layout: AjusteDeLayout,
  id: IdDaSecaoDaHome,
  mudanca: MudancaNaOrdem
): AjusteDeLayout | null {
  if (FIXAS_DA_HOME.includes(id)) return null
  if (mudanca === "ligar" || mudanca === "desligar") {
    return {
      ...layout,
      visibilidade: { ...(layout.visibilidade ?? {}), [id]: mudanca === "ligar" },
    }
  }
  const soltas = ordemDaHome(layout).filter((x) => !FIXAS_DA_HOME.includes(x))
  const i = soltas.indexOf(id)
  const j = mudanca === "subir" ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= soltas.length) return null
  ;[soltas[i], soltas[j]] = [soltas[j]!, soltas[i]!]
  return { ...layout, ordem: comAsFixas(soltas) }
}

/* ── comparar versões ─────────────────────────────────────────────────── */

/** JSON com as chaves em ordem: o mesmo texto, montado em ordens diferentes, sai igual. */
function estavel(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(estavel).join(",")}]`
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${estavel(o[k])}`)
      .join(",")}}`
  }
  return JSON.stringify(v)
}

const igual = (a: unknown, b: unknown) => estavel(a) === estavel(b)

const ligadaEm = (v: VersaoDaHome, id: IdDaSecaoDaHome) =>
  FIXAS_DA_HOME.includes(id) || v.layout.visibilidade?.[id] !== false

/** A seção mudou entre o rascunho e o publicado: o texto, a foto de fundo, ou se aparece. */
function secaoMudou(h: HomeGuardada, id: IdDaSecaoDaHome): boolean {
  if (!h.rascunho) return false
  const chave = CHAVE_DA_SECAO_DA_HOME[id]
  return (
    ligadaEm(h.rascunho, id) !== ligadaEm(h.publicado, id) ||
    !igual(conteudoDaSecao(h.rascunho, chave), conteudoDaSecao(h.publicado, chave)) ||
    !igual(h.rascunho.fundos[id] ?? null, h.publicado.fundos[id] ?? null)
  )
}

/**
 * O QUE ESTÁ ESPERANDO O "PUBLICAR": as seções que mudaram (o texto, ou
 * se aparecem) e se a ordem mudou. É o que a faixa amarela conta e lista.
 */
export function pendentesDaHome(h: HomeGuardada): { secoes: IdDaSecaoDaHome[]; ordem: boolean } {
  if (!h.rascunho) return { secoes: [], ordem: false }
  return {
    secoes: SECOES_DA_HOME.filter((id) => secaoMudou(h, id)),
    ordem: !igual(ordemDaHome(h.rascunho.layout), ordemDaHome(h.publicado.layout)),
  }
}

/** O rascunho na mão; se ele não mudou nada em relação ao publicado, some. */
function comRascunho(h: HomeGuardada, rascunho: VersaoDaHome): HomeGuardada {
  const provisoria = { ...h, rascunho }
  const { secoes, ordem } = pendentesDaHome(provisoria)
  return secoes.length || ordem ? provisoria : { ...h, rascunho: null }
}

export const rascunhoDa = (h: HomeGuardada): VersaoDaHome => h.rascunho ?? h.publicado

/* ── a tela ───────────────────────────────────────────────────────────── */

export type SecaoDaHome = {
  id: IdDaSecaoDaHome
  /** Aparece no site, no rascunho (a fixa, sempre). */
  ligada: boolean
  fixa: boolean
  /** O texto no rascunho: o salvo, ou o de fábrica. É com ele que a gaveta abre. */
  valores: Record<string, unknown>
  /** O texto de fábrica, pro "Voltar ao texto original". */
  padrao: Record<string, unknown>
  /** O texto não é mais o de fábrica. */
  propria: boolean
  /** Mudou no rascunho e ainda não foi pro site. */
  mudou: boolean
  /** A foto de fundo, no rascunho, nas seções que aceitam. */
  fundo: Fundo | null
  aceitaFundo: boolean
}

/** As seções, na ordem do rascunho. */
export function secoesDaHome(h: HomeGuardada): SecaoDaHome[] {
  const r = rascunhoDa(h)
  return ordemDaHome(r.layout).map((id) => {
    const chave = CHAVE_DA_SECAO_DA_HOME[id]
    const valores = conteudoDaSecao(r, chave) as Record<string, unknown>
    const padrao = SEMENTE_DA_HOME[chave] as Record<string, unknown>
    return {
      id,
      ligada: ligadaEm(r, id),
      fixa: FIXAS_DA_HOME.includes(id),
      valores,
      padrao,
      propria: !igual(valores, padrao),
      mudou: secaoMudou(h, id),
      fundo: r.fundos[id] ?? null,
      aceitaFundo: SECOES_COM_FUNDO_DA_HOME.includes(id),
    }
  })
}

export type Publicacao = { em: string; quando: string; quem: string | null } | null

/** O último "Publicar": quando, e quem. `null` enquanto a home é a de fábrica. */
export function ultimaPublicacao(h: HomeGuardada, agora: Data): Publicacao {
  if (!h.publicadoEm) return null
  return { em: h.publicadoEm, quando: quando(h.publicadoEm, agora), quem: h.publicadoPor }
}

/**
 * OS CASOS DA "PROVA SOCIAL" — os de antes e depois das páginas dos
 * produtos no site (Produtos → a página → "Antes e depois"). A home não tem
 * lista própria: um caso vale na página do produto e na home. Quem monta o
 * carrossel é a loja (`apps/loja/src/components/home/provas.tsx`: até 8,
 * alternando os produtos); o painel mostra de onde os casos vêm, com a
 * foto do "depois" de cada um.
 */
export type ProdutoComCasos = {
  id: string
  nome: string
  casos: { nome: string; tempo: string; foto: string }[]
}

export function provasDaHome(
  produtos: { id: string; nome: string; metadata: unknown }[]
): ProdutoComCasos[] {
  return produtos.flatMap((p) => {
    const casos = lerPdp(p.metadata).conteudo.antesDepois?.casos ?? []
    return casos.length
      ? [
          {
            id: p.id,
            nome: p.nome,
            casos: casos.map((c) => ({ nome: c.nome, tempo: c.tempo, foto: c.depois })),
          },
        ]
      : []
  })
}

/* ── as mudanças ──────────────────────────────────────────────────────── */

type Recusa<M extends string> = { ok: false; motivo: M; faltando?: string[] }
type Feito = { ok: true; home: HomeGuardada }

export function mudarOrdemNaHome(
  h: HomeGuardada,
  id: IdDaSecaoDaHome,
  mudanca: MudancaNaOrdem
): Feito | Recusa<"nao_da"> {
  const r = rascunhoDa(h)
  const layout = mudarNaOrdemDaHome(r.layout, id, mudanca)
  if (!layout) return { ok: false, motivo: "nao_da" }
  return { ok: true, home: comRascunho(h, { ...r, layout }) }
}

/**
 * O texto de uma seção, e a foto de fundo dela, no rascunho — um "Salvar"
 * só, na gaveta. Pela metade, não grava nada e diz o que falta. Igual ao de
 * fábrica, guarda SEM a seção: o de fábrica continua valendo — e acompanha
 * o código, se um dia ele mudar. `fundo` ausente não mexe no fundo; `null`
 * tira; e só vale nas seções que têm véu na loja.
 */
export function salvarSecaoDaHome(
  h: HomeGuardada,
  id: IdDaSecaoDaHome,
  valores: unknown,
  fundo?: Fundo | null
): Feito | Recusa<"faltando"> {
  const chave = CHAVE_DA_SECAO_DA_HOME[id]
  const lida = lerSecaoDaHome(chave, valores)
  if (!lida.secao) return { ok: false, motivo: "faltando", faltando: lida.faltando }
  const r = rascunhoDa(h)
  const conteudo = { ...r.conteudo, [chave]: lida.secao }
  if (igual(lida.secao, SEMENTE_DA_HOME[chave])) delete conteudo[chave]
  const fundos = { ...r.fundos }
  if (fundo !== undefined && SECOES_COM_FUNDO_DA_HOME.includes(id)) {
    if (fundo) fundos[id] = fundo
    else delete fundos[id]
  }
  return { ok: true, home: comRascunho(h, { ...r, conteudo, fundos }) }
}

/** O rascunho vai pro site. Sem rascunho, não há o que publicar. */
export function publicarHome(
  h: HomeGuardada,
  agora: Date,
  quem: string
): Feito | Recusa<"nada_pra_publicar"> {
  if (!h.rascunho) return { ok: false, motivo: "nada_pra_publicar" }
  return {
    ok: true,
    home: {
      publicado: h.rascunho,
      rascunho: null,
      publicadoEm: agora.toISOString(),
      publicadoPor: quem,
    },
  }
}

/** Joga o rascunho fora: o painel volta a mostrar o que está no site. */
export function desfazerRascunho(h: HomeGuardada): Feito | Recusa<"nada_pra_desfazer"> {
  if (!h.rascunho) return { ok: false, motivo: "nada_pra_desfazer" }
  return { ok: true, home: { ...h, rascunho: null } }
}

/* ── o registro ───────────────────────────────────────────────────────── */

/** O alvo das linhas da home no registro da equipe (lá, é um id de produto ou de pedido). */
export const ALVO_DA_HOME = "home"

export const ACOES_NA_HOME = [
  "editou-secao-da-home",
  "mudou-secao-da-home",
  "publicou-home",
  "desfez-home",
] as const
