import { HOME_DE_FABRICA } from "@/conteudo/home"
import type { AjusteDeLayout } from "@/lib/secoes/layout"

/**
 * A HOME, como a loja recebe do Medusa (`GET /store/home`): a ordem das
 * seções e o texto de cada uma — o que alguém publicou no painel ("Layout
 * da home"), ou o de fábrica.
 *
 * Só tipos e a peneira; a BUSCA mora em `lib/medusa.ts` (`home()`), junto
 * das outras, pelo mesmo motivo das configurações: este arquivo não pode
 * puxar o `server-only` de lá pra quem o importar.
 *
 * GÊMEO NO BACKEND: `apps/backend/src/lib/home.ts` tem os mesmos tipos e a
 * validação COMPLETA, que roda na gravação e na leitura. Aqui a peneira é
 * menor de propósito: só o que evita quebrar a página. A seção que não
 * passar vira a de fábrica — nunca um buraco na home.
 */

export type Vantagem = { titulo: string; detalhe: string }
export type LinhaDoComparativo = { rotulo: string; valor: string }
export type NumeroDaMarca = { valor: string; rotulo: string }

/** Um produto no palco da "Alta performance": o que é, como se usa, o que esperar. */
export type ProdutoNoPalco = {
  /** O handle do produto: nome, foto e preço vêm do catálogo. */
  produto: string
  /** O nome no rótulo do palco; sem ele, o nome do produto. */
  nomeCurto?: string
  titulo: string
  texto: string
  usoTitulo: string
  usoTexto: string
  /** De um a três. */
  passos: string[]
  numero: string
  unidade: string
  legenda: string
  resultado: string
}

export type ConteudoDaHome = {
  banner: { chapeu: string; titulo: string; chamada: string; produto: string }
  /** As vantagens escritas no painel. O frete e o parcelamento entram antes, sozinhos. */
  trustbar: { vantagens: Vantagem[] }
  ofertas: { titulo: string }
  colecao: { titulo: string }
  hero: {
    chapeu: string
    titulo: string
    comparativo: LinhaDoComparativo[]
    chamada: string
    garantias: string[]
    aviso?: string
  }
  altaPerformance: { produtos: ProdutoNoPalco[] }
  provas: { tag: string; titulo: string }
  amam: { titulo: string }
  vitrine: { titulo: string }
  sobre: {
    titulo: string
    paragrafos: string[]
    /** A frase em destaque, depois do primeiro parágrafo. */
    grito?: string
    numeros: NumeroDaMarca[]
    /** O handle do produto cuja foto ilustra a seção. */
    fotoDe?: string
  }
  fechamento: { chapeu: string; titulo: string; chamada: string; fotoDe?: string }
}

export type HomeDoSite = { layout: AjusteDeLayout; conteudo: ConteudoDaHome }

export const HOME_DO_SITE_DE_FABRICA: HomeDoSite = { layout: {}, conteudo: HOME_DE_FABRICA }

/* ── a peneira ───────────────────────────────────────────────────────── */

const ehTexto = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Os campos de texto obrigatórios estão lá; os opcionais, se vierem, são texto. */
function temTextos(o: Record<string, unknown>, obrigatorios: string[], opcionais: string[] = []) {
  return (
    obrigatorios.every((k) => ehTexto(o[k])) &&
    opcionais.every((k) => o[k] === undefined || typeof o[k] === "string")
  )
}

/** Lista de itens, cada um com os seus textos obrigatórios. */
function ehListaDe(v: unknown, obrigatorios: string[], opcionais: string[] = []): boolean {
  return (
    Array.isArray(v) &&
    v.every((i) => {
      const o = obj(i)
      return o !== null && temTextos(o, obrigatorios, opcionais)
    })
  )
}

const ehListaDeTextos = (v: unknown) => Array.isArray(v) && v.every(ehTexto)

const PASSA: { [K in keyof ConteudoDaHome]: (o: Record<string, unknown>) => boolean } = {
  banner: (o) => temTextos(o, ["chapeu", "titulo", "chamada", "produto"]),
  trustbar: (o) => ehListaDe(o.vantagens, ["titulo", "detalhe"]),
  ofertas: (o) => temTextos(o, ["titulo"]),
  colecao: (o) => temTextos(o, ["titulo"]),
  hero: (o) =>
    temTextos(o, ["chapeu", "titulo", "chamada"], ["aviso"]) &&
    ehListaDe(o.comparativo, ["rotulo", "valor"]) &&
    ehListaDeTextos(o.garantias),
  altaPerformance: (o) =>
    ehListaDe(
      o.produtos,
      [
        "produto",
        "titulo",
        "texto",
        "usoTitulo",
        "usoTexto",
        "numero",
        "unidade",
        "legenda",
        "resultado",
      ],
      ["nomeCurto"]
    ) && (o.produtos as Record<string, unknown>[]).every((p) => ehListaDeTextos(p.passos)),
  provas: (o) => temTextos(o, ["tag", "titulo"]),
  amam: (o) => temTextos(o, ["titulo"]),
  vitrine: (o) => temTextos(o, ["titulo"]),
  sobre: (o) =>
    temTextos(o, ["titulo"], ["grito", "fotoDe"]) &&
    ehListaDeTextos(o.paragrafos) &&
    (o.paragrafos as unknown[]).length > 0 &&
    ehListaDe(o.numeros, ["valor", "rotulo"]),
  fechamento: (o) => temTextos(o, ["chapeu", "titulo", "chamada"], ["fotoDe"]),
}

/** Uma ordem de seções: ids em texto; a visibilidade, só sim ou não. */
function lerLayout(v: unknown): AjusteDeLayout {
  const o = obj(v)
  if (!o) return {}
  const vis = obj(o.visibilidade)
  const visibilidade = vis
    ? Object.fromEntries(Object.entries(vis).filter(([, x]) => typeof x === "boolean"))
    : {}
  const ordem = Array.isArray(o.ordem) ? o.ordem.filter(ehTexto) : []
  return {
    ...(Object.keys(visibilidade).length
      ? { visibilidade: visibilidade as Record<string, boolean> }
      : {}),
    ...(ordem.length ? { ordem } : {}),
  }
}

/** O que chegou do Medusa, seção por seção: a que não passar fica com o texto de fábrica. */
export function lerHomeDoSite(v: unknown): HomeDoSite {
  const o = obj(v)
  const c = obj(o?.conteudo) ?? {}
  const conteudo = { ...HOME_DE_FABRICA }
  for (const chave of Object.keys(PASSA) as (keyof ConteudoDaHome)[]) {
    const secao = obj(c[chave])
    if (secao && PASSA[chave](secao)) Object.assign(conteudo, { [chave]: secao })
  }
  return { layout: lerLayout(o?.layout), conteudo }
}
