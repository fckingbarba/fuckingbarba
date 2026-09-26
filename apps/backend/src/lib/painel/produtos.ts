import { nomeNoErp, temNomeDaLoja } from "../erp/marcas"
import {
  lerSecao,
  LIMITE_DA_NOTA,
  LIMITE_DO_LEVE_JUNTO,
  SECOES_COM_FUNDO,
  type AjusteDeLayout,
  type ChaveDeConteudo,
  type Fundo,
  type Pdp,
  type VendaCombinada,
} from "../pdp"
import { FAIXAS, totalDaFaixa } from "../precos-por-quantidade"
import { fotosDoProduto, montarGaleria, type ItemDaGaleria } from "./galeria"
import { quando, type Data } from "./formato"
import { nomeCurto } from "./pedido"
import type { PrecoDoProduto, Promocao } from "./promocao"

/**
 * OS PRODUTOS DO JEITO DO PAINEL — a lista, a página de cada um e as regras
 * de quem mexe no quê.
 *
 * Código puro, como o `pedido.ts`: recebe o produto como o Medusa devolve
 * (com o estoque já somado, que mora no módulo de estoque) e devolve a tela.
 * Quem lê do banco é `ler-produtos.ts`; quem grava são as rotas
 * `/dashboard/produtos/:id/*`, que perguntam aqui antes.
 *
 * ┌─ O QUE É DO BLING E O QUE É DAQUI ─────────────────────────────────────┐
 * │ Nome, descrição, preço, peso e medidas vêm do Bling (a importação do   │
 * │ catálogo); o estoque, de 5 em 5 minutos. O painel MOSTRA e não muda:   │
 * │ mudar aqui criaria dois preços. Daqui são o subtítulo, a categoria, se │
 * │ está no site, a página do produto (`fb_pdp`) e a PROMOÇÃO — o "por" do │
 * │ de/por, numa lista de preço à parte (`promocao.ts`): o "de" continua   │
 * │ sendo o do Bling.                                                      │
 * └────────────────────────────────────────────────────────────────────────┘
 */

/* ── as seções da página ──────────────────────────────────────────────────
 *
 * GÊMEO DO REGISTRO DA LOJA (`apps/loja/src/lib/secoes/registro.ts`): a
 * ordem padrão e os ids são os de lá. Mudou lá, muda aqui — o
 * `conferir-produtos.mjs` confere que a ordem do painel é a da página.
 */
export const SECOES_DA_PAGINA = [
  "produto.dobra",
  "produto.promessa",
  "produto.antes-depois",
  "produto.tempo",
  "produto.faixa",
  "produto.rotina",
  "produto.funciona",
  "produto.versus",
  "produto.quem",
  "produto.duvidas",
  "produto.avaliacoes",
  "produto.relacionados",
] as const
export type IdDaSecao = (typeof SECOES_DA_PAGINA)[number]

export const ehIdDaSecao = (v: unknown): v is IdDaSecao =>
  typeof v === "string" && (SECOES_DA_PAGINA as readonly string[]).includes(v)

/** O topo (fotos, preço e compra) não desliga nem sai do lugar. */
const FIXAS: readonly string[] = ["produto.dobra"]

/** A chave do texto de cada seção em `fb_pdp.conteudo` — `null` nas que não têm texto do produto. */
export const CHAVE_DA_SECAO: Record<IdDaSecao, ChaveDeConteudo | null> = {
  "produto.dobra": null,
  "produto.promessa": "promessa",
  "produto.antes-depois": "antesDepois",
  "produto.tempo": "tempo",
  "produto.faixa": "faixa",
  "produto.rotina": "rotina",
  "produto.funciona": "funciona",
  "produto.versus": "versus",
  "produto.quem": "quem",
  "produto.duvidas": "duvidas",
  "produto.avaliacoes": null,
  "produto.relacionados": "relacionados",
}

export type SecaoDaPagina = {
  id: IdDaSecao
  /** Aparece no site (a fixa, sempre). */
  ligada: boolean
  fixa: boolean
  /** Seção com texto do produto e nenhum escrito: não aparece no site até alguém escrever. */
  vazia: boolean
  /** O texto que está no produto, pro editor abrir com ele. */
  valores: Record<string, unknown> | null
  /** A imagem de fundo, nas seções que aceitam. */
  fundo: Fundo | null
  aceitaFundo: boolean
}

/** A ordem da página: a guardada no produto, e o que ela não citar no fim, na ordem do registro. */
export function ordemDaPagina(layout: AjusteDeLayout): IdDaSecao[] {
  const guardada = (layout.ordem ?? []).filter(ehIdDaSecao)
  const resto = SECOES_DA_PAGINA.filter((id) => !guardada.includes(id))
  const ordem = [...new Set([...guardada, ...resto])]
  // A fixa fica onde o registro põe (o topo), mesmo que uma ordem velha a tenha tirado de lá.
  return [
    ...SECOES_DA_PAGINA.filter((id) => FIXAS.includes(id)),
    ...ordem.filter((id) => !FIXAS.includes(id)),
  ]
}

export function secoesDaPagina(pdp: Pdp): SecaoDaPagina[] {
  return ordemDaPagina(pdp.layout).map((id) => {
    const chave = CHAVE_DA_SECAO[id]
    const valores = chave
      ? ((pdp.conteudo as Record<string, unknown>)[chave] as Record<string, unknown> | undefined)
      : undefined
    const fixa = FIXAS.includes(id)
    return {
      id,
      ligada: fixa || pdp.layout.visibilidade?.[id] !== false,
      fixa,
      // O título dos relacionados é opcional: sem ele, a loja usa o de sempre.
      vazia: Boolean(chave) && chave !== "relacionados" && !valores,
      valores: valores ?? null,
      fundo: pdp.fundos[id] ?? null,
      aceitaFundo: (SECOES_COM_FUNDO as readonly string[]).includes(id),
    }
  })
}

export type MudancaNaOrdem = "ligar" | "desligar" | "subir" | "descer"

export const ehMudancaNaOrdem = (v: unknown): v is MudancaNaOrdem =>
  v === "ligar" || v === "desligar" || v === "subir" || v === "descer"

/**
 * Liga, desliga, sobe ou desce UMA seção, a partir do que está gravado
 * AGORA — e não da lista que a tela tinha: duas pessoas mexendo ao mesmo
 * tempo não se atropelam. `null` quando não dá (a fixa; subir a primeira;
 * descer a última). A ordem sai inteira, como a loja quer (`layout.ts`).
 */
export function mudarNaOrdem(
  layout: AjusteDeLayout,
  id: IdDaSecao,
  mudanca: MudancaNaOrdem
): AjusteDeLayout | null {
  if (FIXAS.includes(id)) return null
  if (mudanca === "ligar" || mudanca === "desligar") {
    return {
      ...layout,
      visibilidade: { ...(layout.visibilidade ?? {}), [id]: mudanca === "ligar" },
    }
  }
  const ordem = ordemDaPagina(layout)
  const i = ordem.indexOf(id)
  const j = mudanca === "subir" ? i - 1 : i + 1
  if (j < 0 || j >= ordem.length || FIXAS.includes(ordem[j]!)) return null
  ;[ordem[i], ordem[j]] = [ordem[j]!, ordem[i]!]
  return { ...layout, ordem }
}

/* ── a seção salva no editor ──────────────────────────────────────────── */

export type SecaoSalva =
  { ok: true; pdp: Pdp } | { ok: false; motivo: "sem_texto" | "faltando"; faltando?: string[] }

/**
 * O texto e o fundo de uma seção, gravados juntos (é um "Salvar" só, na
 * gaveta). Texto todo vazio tira a seção da página; pela metade, não grava
 * nada e diz o que falta. O fundo só nas seções que têm véu na loja.
 */
export function salvarSecao(
  pdp: Pdp,
  id: IdDaSecao,
  valores: unknown,
  fundo: Fundo | null | undefined
): SecaoSalva {
  const chave = CHAVE_DA_SECAO[id]
  if (!chave) return { ok: false, motivo: "sem_texto" }
  const { secao, faltando } = lerSecao(chave, valores)
  if (faltando.length) return { ok: false, motivo: "faltando", faltando }
  const conteudo = { ...pdp.conteudo } as Record<string, unknown>
  if (secao) conteudo[chave] = secao
  else delete conteudo[chave]
  const fundos = { ...pdp.fundos }
  if (fundo !== undefined && (SECOES_COM_FUNDO as readonly string[]).includes(id)) {
    if (fundo) fundos[id] = fundo
    else delete fundos[id]
  }
  return { ok: true, pdp: { ...pdp, conteudo: conteudo as Pdp["conteudo"], fundos } }
}

/* ── a caixa de compra ────────────────────────────────────────────────── */

export type Caixa = { modo: "unidades" | "junto"; nota: string; junto: string[] }

/** O que a tela mostra da caixa — o `modo` de antes dele entra como o que a loja mostrava. */
export function caixaDo(c: VendaCombinada): Caixa {
  const modo = c.modo ?? (c.kits === false && c.produtos?.length ? "junto" : "unidades")
  return {
    modo,
    nota: c.notaDoAvulso ?? "",
    junto: (c.produtos ?? []).slice(0, LIMITE_DO_LEVE_JUNTO),
  }
}

export type CaixaSalva =
  | { ok: true; combinada: VendaCombinada }
  | { ok: false; motivo: "junto_vazio" | "junto_invalido" | "nota_longa" }

/**
 * A caixa nova. `podem`: os handles que podem ir no "Leve junto" — os
 * produtos no site, menos o próprio (a rota sabe quais são).
 */
export function salvarCaixa(
  pedido: { modo: unknown; nota: unknown; junto: unknown },
  podem: ReadonlySet<string>
): CaixaSalva {
  const modo = pedido.modo === "junto" ? "junto" : "unidades"
  const nota = typeof pedido.nota === "string" ? pedido.nota.trim() : ""
  if (nota.length > LIMITE_DA_NOTA) return { ok: false, motivo: "nota_longa" }
  const junto = Array.isArray(pedido.junto)
    ? [...new Set(pedido.junto.filter((h): h is string => typeof h === "string" && h.length > 0))]
    : []
  if (modo === "junto") {
    if (!junto.length) return { ok: false, motivo: "junto_vazio" }
    if (junto.length > LIMITE_DO_LEVE_JUNTO || junto.some((h) => !podem.has(h)))
      return { ok: false, motivo: "junto_invalido" }
  }
  return {
    ok: true,
    combinada: {
      modo,
      ...(nota ? { notaDoAvulso: nota } : {}),
      ...(modo === "junto" ? { produtos: junto } : {}),
    },
  }
}

/* ── a lista e a página do produto ────────────────────────────────────── */

export type ProdutoCru = {
  id: string
  handle?: string | null
  title?: string | null
  subtitle?: string | null
  description?: string | null
  status?: string | null
  thumbnail?: string | null
  weight?: number | string | null
  images?: { url?: string | null; rank?: number | null }[] | null
  categories?: { id: string; name?: string | null; handle?: string | null }[] | null
  variants?:
    | {
        id: string
        sku?: string | null
        manage_inventory?: boolean | null
        price_set?: { id?: string | null } | null
        prices?: { amount?: unknown; currency_code?: string | null }[] | null
        inventory_items?:
          { inventory_item_id?: string | null; required_quantity?: number | null }[] | null
      }[]
    | null
  metadata?: Record<string, unknown> | null
}

export type Situacao = "publicado" | "rascunho" | "esgotado"

export type LinhaDoProduto = {
  id: string
  handle: string
  nome: string
  sku: string | null
  foto: string | null
  situacao: Situacao
  publicado: boolean
  categoria: string | null
  /** O do Bling: o "de", quando há promoção. */
  preco: number | null
  /** A promoção valendo hoje (o "por"), do painel ou de outra lista de preço. */
  promocao: Promocao | null
  /** A promoção do painel que não vale: o preço do Bling já está igual ou menor. */
  promocaoSemEfeito: number | null
  /** `null` quando o produto não controla estoque. */
  estoque: number | null
}

const primeiraFoto = (p: ProdutoCru) => p.thumbnail ?? p.images?.find((i) => i?.url)?.url ?? null

/** O preço em reais da primeira variante — o do Bling, sem o desconto por quantidade. */
export function precoDo(p: ProdutoCru): number | null {
  const preco = p.variants?.[0]?.prices?.find((x) => x.currency_code?.toLowerCase() === "brl")
  const n = Number(preco?.amount)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function linhaDoProduto(
  p: ProdutoCru,
  estoque: number | null,
  preco?: PrecoDoProduto
): LinhaDoProduto {
  const publicado = p.status === "published"
  return {
    id: p.id,
    handle: p.handle ?? "",
    nome: (p.title ?? "").trim() || "Produto sem nome",
    sku: p.variants?.[0]?.sku ?? null,
    foto: primeiraFoto(p),
    situacao: !publicado ? "rascunho" : estoque === 0 ? "esgotado" : "publicado",
    publicado,
    categoria: p.categories?.[0]?.name ?? null,
    preco: precoDo(p),
    promocao: preco?.promocao ?? null,
    promocaoSemEfeito: preco?.semEfeito ?? null,
    estoque,
  }
}

export const FILTROS_DE_PRODUTO = ["todos", "publicado", "rascunho", "esgotado"] as const
export type FiltroDeProduto = (typeof FILTROS_DE_PRODUTO)[number]

export const ehFiltroDeProduto = (v: unknown): v is FiltroDeProduto =>
  typeof v === "string" && (FILTROS_DE_PRODUTO as readonly string[]).includes(v)

/** "No site" conta também o esgotado: ele está no site, só não vende. */
export function passaNoFiltroDeProduto(l: LinhaDoProduto, f: FiltroDeProduto): boolean {
  if (f === "todos") return true
  if (f === "publicado") return l.publicado
  if (f === "rascunho") return !l.publicado
  return l.publicado && l.estoque === 0
}

/** Um produto que pode ir no "Leve junto", no seletor de produto e na prévia. */
export type NoCatalogo = {
  handle: string
  nome: string
  foto: string | null
  preco: number | null
  esgotado: boolean
}

export type DetalheDoProduto = LinhaDoProduto & {
  /**
   * O nome foi dado no painel (a marca `fb_nome`): a importação do Bling não
   * troca mais. Sem ela, o nome é o do Bling e muda quando o catálogo vem.
   */
  nomeDaLoja: boolean
  /** O nome no Bling, da última importação (produto que nunca veio dele: null). */
  nomeNoBling: string | null
  subtitulo: string
  descricao: string
  /** O que o Google mostra embaixo do nome (`fb_pdp.seo`); vazio: o começo da descrição. */
  descricaoGoogle: string
  peso: number | null
  categoriaId: string | null
  fotos: string[]
  /** As fotos e os vídeos da dobra, na ordem da página (a primeira foto é a capa). */
  galeria: ItemDaGaleria[]
  /** "1 unidade", "2 unidades", "3 unidades" — os totais do desconto por quantidade. */
  degraus: { unidades: number; total: number }[]
  caixa: Caixa
  secoes: SecaoDaPagina[]
  /** Dono e marketing; a operação vê. */
  podeEditar: boolean
  /** O preço foi mudado no painel (`fb_preco`): a importação do Bling não troca mais. */
  precoDoPainel: boolean
}

export function detalheDoProduto(
  p: ProdutoCru,
  pdp: Pdp,
  estoque: number | null,
  podeEditar: boolean,
  {
    preco: precoDeHoje,
    precoDoPainel = false,
  }: { preco?: PrecoDoProduto; precoDoPainel?: boolean } = {}
): DetalheDoProduto {
  const linha = linhaDoProduto(p, estoque, precoDeHoje)
  // As faixas saem do preço de hoje, com a promoção — como o job as calcula.
  const preco = precoDeHoje?.hoje ?? linha.preco
  const peso = Number(p.weight)
  const fotos = [
    ...new Set(
      [p.thumbnail, ...(p.images ?? []).map((i) => i?.url)].filter((u): u is string => Boolean(u))
    ),
  ]
  return {
    ...linha,
    nomeDaLoja: temNomeDaLoja(p.metadata),
    nomeNoBling: nomeNoErp(p.metadata),
    subtitulo: (p.subtitle ?? "").trim(),
    descricao: (p.description ?? "").trim(),
    descricaoGoogle: pdp.seo?.descricao ?? "",
    peso: Number.isFinite(peso) && peso > 0 ? peso : null,
    categoriaId: p.categories?.[0]?.id ?? null,
    fotos,
    galeria: montarGaleria(fotosDoProduto(p), pdp.videos),
    degraus: preco
      ? [
          { unidades: 1, total: preco },
          ...FAIXAS.flatMap((f) => {
            const total = totalDaFaixa(preco, f.unidades, f.desconto)
            return total ? [{ unidades: f.unidades, total: total / 100 }] : []
          }),
        ]
      : [],
    caixa: caixaDo(pdp.combinada),
    secoes: secoesDaPagina(pdp),
    podeEditar,
    precoDoPainel,
  }
}

/* ── o nome da loja ───────────────────────────────────────────────────── */

/**
 * O nome tem até 80 letras — o painel avisa bem antes: passando de uns 36, ele
 * já não cabe em duas linhas no título da página (medido em 25/09, do celular
 * de 360 px ao computador).
 */
export const LIMITE_DO_NOME = 80

export function lerNome(
  v: unknown
): { ok: true; nome: string } | { ok: false; motivo: "nome_vazio" | "nome_longo" } {
  const nome = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""
  if (nome.length < 2) return { ok: false, motivo: "nome_vazio" }
  if (nome.length > LIMITE_DO_NOME) return { ok: false, motivo: "nome_longo" }
  return { ok: true, nome }
}

/**
 * O que gravar no produto quando o painel manda um nome. Nome novo põe a
 * marca `fb_nome` (a importação do Bling não troca mais); o nome igual ao do
 * Bling TIRA a marca — é o jeito de devolver o nome pro Bling. O mesmo nome
 * de hoje não muda nada (salvar o subtítulo não prende o nome).
 */
export function mudancaDoNome(
  novo: string,
  atual: { titulo: string; nomeDaLoja: boolean; nomeNoBling: string | null }
): { titulo: string; marca: boolean } | null {
  if (atual.nomeNoBling && novo === atual.nomeNoBling)
    return novo === atual.titulo && !atual.nomeDaLoja ? null : { titulo: novo, marca: false }
  if (novo === atual.titulo) return null
  return { titulo: novo, marca: true }
}

/** `hoje`: o que a loja cobra por uma unidade, com a promoção (sem ele, o do Bling). */
export function noCatalogo(
  p: ProdutoCru,
  estoque: number | null,
  hoje?: number | null
): NoCatalogo {
  return {
    handle: p.handle ?? "",
    nome: nomeCurto(p.title ?? ""),
    foto: primeiraFoto(p),
    preco: hoje ?? precoDo(p),
    esgotado: estoque === 0,
  }
}

/* ── o histórico do produto ───────────────────────────────────────────── */

/** Os códigos das ações no produto, no registro da equipe (`equipe_registro.acao`). */
export const ACOES_NO_PRODUTO = [
  "editou-secao",
  "mudou-secao",
  "mudou-caixa",
  "editou-textos",
  "publicou",
  "mudou-galeria",
  "mudou-preco",
  "mudou-promocao",
] as const

/** Uma ação da equipe no produto, lida do registro. */
export type FeitoNoProduto = {
  em: Data
  acao: string
  /** O nome de quem fez — o do membro, mesmo que ele tenha saído da equipe depois. */
  quem: string
  detalhe: Record<string, unknown> | null
}

/**
 * Uma linha do "O que a equipe mudou". Vai o que o painel precisa pra
 * escrever a frase (a seção, a mudança, o modo da caixa) — o nome de cada
 * seção mora no painel (`apps/dashboard/src/lib/produtos.ts`).
 */
export type LinhaDoHistorico = {
  em: string
  quando: string
  quem: string
  acao: string
  secao?: string
  mudanca?: string
  fundo?: boolean
  modo?: string
  /** Na galeria: "incluir", "mover" ou "tirar", e se foi foto ou vídeo. */
  galeria?: string
  tipo?: string
  /** No preço: o de antes (`de`) e o novo (`para`). Na promoção: o "de" e o "por" (`null` = tirou). */
  de?: number
  para?: number
  por?: number | null
  /** Nos textos: o nome novo, quando o nome mudou. */
  nome?: string
}

export function linhaDoHistorico(f: FeitoNoProduto, agora: Data): LinhaDoHistorico {
  const d = f.detalhe ?? {}
  const texto = (v: unknown) => (typeof v === "string" ? v : undefined)
  return {
    em: new Date(f.em).toISOString(),
    quando: quando(f.em, agora),
    quem: f.quem,
    acao: f.acao,
    ...(texto(d.secao) ? { secao: texto(d.secao) } : {}),
    ...(texto(d.mudanca) ? { mudanca: texto(d.mudanca) } : {}),
    ...(typeof d.fundo === "boolean" ? { fundo: d.fundo } : {}),
    ...(texto(d.modo) ? { modo: texto(d.modo) } : {}),
    ...(texto(d.galeria) ? { galeria: texto(d.galeria) } : {}),
    ...(texto(d.tipo) ? { tipo: texto(d.tipo) } : {}),
    ...(typeof d.por === "number" || d.por === null ? { por: d.por as number | null } : {}),
    ...(typeof d.de === "number" ? { de: d.de } : {}),
    ...(typeof d.para === "number" ? { para: d.para } : {}),
    ...(texto(d.nome) ? { nome: texto(d.nome) } : {}),
  }
}
