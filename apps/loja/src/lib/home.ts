import { HOME_DE_FABRICA } from "@/conteudo/home"
import { ehDoArmazenamento } from "@/lib/armazenamento"
import type { FundoDaSecao } from "@/lib/pdp"
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

/**
 * O vídeo da história da marca, no "Sobre a marca" (no lugar da foto). O do
 * painel vem com a capa; o de antes dele (do admin), só com as medidas.
 */
export type VideoDaHistoria = { url: string; largura: number; altura: number; poster?: string }

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

/**
 * Um slide do banner: SÓ A ARTE (decidido em 24/09). A imagem ocupa o banner
 * inteiro, com o texto dentro dela; o `titulo` é a descrição da arte. Sem
 * arte, não há slide.
 */
export type SlideDoBanner = {
  titulo: string
  imagem: string
  imagemCelular?: string
  /** Pra onde o slide leva. Sem ele, a vitrine inteira. */
  produto?: string
}

/** De quantos em quantos segundos o banner passa sozinho (0: só quando a pessoa troca). */
export const TEMPOS_DO_BANNER = [0, 5, 7, 10] as const
export type TempoDoBanner = (typeof TEMPOS_DO_BANNER)[number]

export type ConteudoDaHome = {
  banner: { slides: SlideDoBanner[]; tempo: TempoDoBanner }
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
    /**
     * O vídeo, ou `null` (sem vídeo). SEM A CHAVE, o Medusa é de antes da
     * entrega 0080, que guardava o vídeo nas configurações: aí vale o
     * `configuracoes().home.video` (ver `components/home/sobre.tsx`).
     */
    video?: VideoDaHistoria | null
  }
  fechamento: {
    chapeu: string
    titulo: string
    chamada: string
    /** A foto da faixa (e a do celular); sem ela, a do produto de `fotoDe`. */
    imagem?: string
    imagemCelular?: string
    fotoDe?: string
  }
}

export type HomeDoSite = {
  layout: AjusteDeLayout
  conteudo: ConteudoDaHome
  /** A foto de fundo de cada seção que tem uma (pelo id do registro). */
  fundos: Record<string, FundoDaSecao>
}

export const HOME_DO_SITE_DE_FABRICA: HomeDoSite = {
  layout: {},
  conteudo: HOME_DE_FABRICA,
  fundos: {},
}

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

/** Endereço de imagem que o otimizador da loja abre (`lib/armazenamento.ts`). */
const imagem = (v: unknown) => (typeof v === "string" && ehDoArmazenamento(v) ? v : null)

/**
 * O banner: fica cada slide com a arte no armazenamento e a descrição.
 * Nenhum sobrando, vale o de fábrica — que é banner nenhum.
 */
function lerBanner(o: Record<string, unknown>): ConteudoDaHome["banner"] | null {
  const slides = (Array.isArray(o.slides) ? o.slides : []).flatMap((bruto): SlideDoBanner[] => {
    const s = obj(bruto)
    const pc = s && imagem(s.imagem)
    if (!s || !pc || !ehTexto(s.titulo)) return []
    const cel = imagem(s.imagemCelular)
    return [
      {
        titulo: s.titulo,
        imagem: pc,
        ...(cel ? { imagemCelular: cel } : {}),
        ...(ehTexto(s.produto) ? { produto: s.produto } : {}),
      },
    ]
  })
  if (!slides.length) return null
  const tempo = (TEMPOS_DO_BANNER as readonly unknown[]).includes(o.tempo)
    ? (o.tempo as TempoDoBanner)
    : HOME_DE_FABRICA.banner.tempo
  return { slides, tempo }
}

/** A última chamada: a foto própria só se morar no armazenamento (sem ela, a do produto). */
function lerFechamento(o: Record<string, unknown>): ConteudoDaHome["fechamento"] | null {
  if (!temTextos(o, ["chapeu", "titulo", "chamada"], ["fotoDe"])) return null
  const pc = imagem(o.imagem)
  const cel = pc ? imagem(o.imagemCelular) : null
  return {
    chapeu: o.chapeu as string,
    titulo: o.titulo as string,
    chamada: o.chamada as string,
    ...(pc ? { imagem: pc } : {}),
    ...(cel ? { imagemCelular: cel } : {}),
    ...(ehTexto(o.fotoDe) ? { fotoDe: o.fotoDe } : {}),
  }
}

/** O vídeo: só com o arquivo no armazenamento e as medidas; a capa, se também morar lá. */
function lerVideoDaHistoria(v: unknown): VideoDaHistoria | null {
  const o = obj(v)
  const url = o && imagem(o.url)
  const medida = (n: unknown) => (typeof n === "number" && n > 0 ? n : null)
  const largura = o && medida(o.largura)
  const altura = o && medida(o.altura)
  if (!o || !url || !largura || !altura) return null
  const poster = imagem(o.poster)
  return { url, largura, altura, ...(poster ? { poster } : {}) }
}

/** O "Sobre a marca": o texto como veio, e o vídeo peneirado — sem a chave, continua sem ela. */
function lerSobre(o: Record<string, unknown>): ConteudoDaHome["sobre"] | null {
  if (!PASSA.sobre(o)) return null
  const { video, ...texto } = o
  const sobre = texto as ConteudoDaHome["sobre"]
  return "video" in o ? { ...sobre, video: lerVideoDaHistoria(video) } : sobre
}

const LEITURAS: {
  [K in keyof ConteudoDaHome]?: (o: Record<string, unknown>) => ConteudoDaHome[K] | null
} = { banner: lerBanner, fechamento: lerFechamento, sobre: lerSobre }

const PASSA: { [K in keyof ConteudoDaHome]: (o: Record<string, unknown>) => boolean } = {
  banner: () => false,
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
  fechamento: () => false,
}

/**
 * As fotos de fundo: só com a do computador morando no armazenamento (sem
 * ela, o embrulho escureceria a seção por nada); a do celular, se também
 * morar lá; o véu, se for número.
 */
function lerFundos(v: unknown): Record<string, FundoDaSecao> {
  const fundos: Record<string, FundoDaSecao> = {}
  for (const [id, valor] of Object.entries(obj(v) ?? {})) {
    const f = obj(valor)
    const pc = f && imagem(f.imagem)
    if (!f || !pc) continue
    const cel = imagem(f.imagemCelular)
    fundos[id] = {
      imagem: pc,
      ...(cel ? { imagemCelular: cel } : {}),
      ...(typeof f.veu === "number" ? { veu: f.veu } : {}),
    }
  }
  return fundos
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
    if (!secao) continue
    const ler = LEITURAS[chave]
    const lida = ler ? ler(secao) : PASSA[chave](secao) ? secao : null
    if (lida) Object.assign(conteudo, { [chave]: lida })
  }
  return { layout: lerLayout(o?.layout), conteudo, fundos: lerFundos(o?.fundos) }
}
