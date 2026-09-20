/**
 * O CONTEÚDO DA PÁGINA DE PRODUTO — o contrato.
 *
 * As seções editoriais da PDP (promessa, linha do tempo, faixa, rotina, como
 * funciona, versus, pra quem é, dúvidas) moravam num arquivo TypeScript da
 * loja. Consequência prática: trocar uma frase de um produto era um deploy, e
 * quem escreve o texto tinha que abrir o repositório.
 *
 * Agora moram no `metadata` do produto, e são editadas na própria página do
 * produto no admin. Duas coisas guardadas juntas porque mudam juntas:
 *
 *   conteudo — o texto de cada seção;
 *   layout   — quais seções aparecem e em que ordem.
 *
 * ┌─ TUDO É OPCIONAL, E ISSO É O DESENHO ──────────────────────────────────┐
 * │ Cada seção pode faltar, e a loja já sabe lidar: o componente faz       │
 * │ `if (!c) return null`. É o que permite um produto ter PDP longa e      │
 * │ outro ter só a dobra, sem código condicional em lugar nenhum.          │
 * │                                                                         │
 * │ Por isso a validação aqui DESCARTA o que estiver torto em vez de       │
 * │ recusar o objeto inteiro: um campo mal preenchido some daquela seção,  │
 * │ e não derruba a página do produto.                                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * GÊMEO NA LOJA: `apps/loja/src/conteudo/produto.ts` tem os mesmos tipos, e
 * `apps/loja/src/lib/secoes/layout.ts` consome o layout. Contrato de rede,
 * conferido pelo `conferir-pdp.mjs`.
 */

export const CHAVE_NO_METADATA = "fb_pdp"

export type PassoDoTempo = { quando: string; titulo: string; texto: string }

export type ItemDaRotina = {
  handle: string
  passo: string
  para: string
}

export type Pergunta = { pergunta: string; resposta: string[] }

export type ConteudoDaPdp = {
  promessa?: { chapeu: string; titulo: string; itens: string[]; rodape?: string }
  tempo?: { titulo: string; passos: PassoDoTempo[]; aviso?: string }
  faixa?: { chapeu: string; titulo: string; texto: string; chamada: string; fotoDe: string }
  rotina?: { titulo: string; itens: ItemDaRotina[] }
  funciona?: {
    comoTitulo: string
    comoFotoDe: string
    comoTexto: string[]
    usoTitulo: string
    usoFotoDe: string
    usoPassos: string[]
    dica?: string
  }
  versus?: {
    titulo: string
    nomeDeles: string
    descricaoDeles: string
    nosso: string[]
    deles: string[]
  }
  quem?: { titulo: string; sim: string[]; nao: string[] }
  duvidas?: { titulo: string; perguntas: Pergunta[] }
}

/**
 * O ajuste é ESPARSO: guarda só o que difere do padrão do registro.
 *
 * Se cada produto guardasse a lista inteira de seções, o dia em que a ordem
 * padrão mudasse ela não alcançaria nenhum produto já salvo — todos ficariam
 * congelados na ordem do dia em que foram editados. (A explicação longa está
 * em `apps/loja/src/lib/secoes/layout.ts`, que é quem consome isto.)
 */
export type AjusteDeLayout = {
  visibilidade?: Record<string, boolean>
  ordem?: string[]
}

export type Pdp = { conteudo: ConteudoDaPdp; layout: AjusteDeLayout }

export const PDP_VAZIA: Pdp = { conteudo: {}, layout: {} }

/* ── leitura defensiva ─────────────────────────────────────────────────── */

const txt = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null

/** Lista de textos, sem os vazios. `null` quando não sobra nada. */
const lista = (v: unknown): string[] | null => {
  if (!Array.isArray(v)) return null
  const l = v.map(txt).filter((s): s is string => s !== null)
  return l.length ? l : null
}

/**
 * Uma seção só existe se os campos OBRIGATÓRIOS dela existirem.
 *
 * Meio preenchida não vale: uma promessa com título e sem itens desenha um
 * cabeçalho solto no meio da página, que parece defeito. Faltou o
 * obrigatório, a seção inteira não entra — e o editor no admin mostra a
 * seção como incompleta em vez de a loja mostrar um buraco.
 */
function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function lerPromessa(v: unknown): ConteudoDaPdp["promessa"] {
  const o = obj(v)
  if (!o) return undefined
  const chapeu = txt(o.chapeu)
  const titulo = txt(o.titulo)
  const itens = lista(o.itens)
  if (!chapeu || !titulo || !itens) return undefined
  return { chapeu, titulo, itens, ...(txt(o.rodape) ? { rodape: txt(o.rodape)! } : {}) }
}

function lerTempo(v: unknown): ConteudoDaPdp["tempo"] {
  const o = obj(v)
  if (!o) return undefined
  const titulo = txt(o.titulo)
  const passos = (Array.isArray(o.passos) ? o.passos : [])
    .map((p) => {
      const q = obj(p)
      const quando = q && txt(q.quando)
      const t = q && txt(q.titulo)
      const texto = q && txt(q.texto)
      return quando && t && texto ? { quando, titulo: t, texto } : null
    })
    .filter((p): p is PassoDoTempo => p !== null)
  if (!titulo || !passos.length) return undefined
  return { titulo, passos, ...(txt(o.aviso) ? { aviso: txt(o.aviso)! } : {}) }
}

function lerFaixa(v: unknown): ConteudoDaPdp["faixa"] {
  const o = obj(v)
  if (!o) return undefined
  const c = { chapeu: txt(o.chapeu), titulo: txt(o.titulo), texto: txt(o.texto), chamada: txt(o.chamada), fotoDe: txt(o.fotoDe) }
  if (Object.values(c).some((x) => x === null)) return undefined
  return c as NonNullable<ConteudoDaPdp["faixa"]>
}

function lerRotina(v: unknown): ConteudoDaPdp["rotina"] {
  const o = obj(v)
  if (!o) return undefined
  const titulo = txt(o.titulo)
  const itens = (Array.isArray(o.itens) ? o.itens : [])
    .map((i) => {
      const q = obj(i)
      const handle = q && txt(q.handle)
      const passo = q && txt(q.passo)
      const para = q && txt(q.para)
      return handle && passo && para ? { handle, passo, para } : null
    })
    .filter((i): i is ItemDaRotina => i !== null)
  if (!titulo || !itens.length) return undefined
  return { titulo, itens }
}

function lerFunciona(v: unknown): ConteudoDaPdp["funciona"] {
  const o = obj(v)
  if (!o) return undefined
  const comoTitulo = txt(o.comoTitulo)
  const comoFotoDe = txt(o.comoFotoDe)
  const comoTexto = lista(o.comoTexto)
  const usoTitulo = txt(o.usoTitulo)
  const usoFotoDe = txt(o.usoFotoDe)
  const usoPassos = lista(o.usoPassos)
  if (!comoTitulo || !comoFotoDe || !comoTexto || !usoTitulo || !usoFotoDe || !usoPassos) {
    return undefined
  }
  return {
    comoTitulo, comoFotoDe, comoTexto, usoTitulo, usoFotoDe, usoPassos,
    ...(txt(o.dica) ? { dica: txt(o.dica)! } : {}),
  }
}

function lerVersus(v: unknown): ConteudoDaPdp["versus"] {
  const o = obj(v)
  if (!o) return undefined
  const titulo = txt(o.titulo)
  const nomeDeles = txt(o.nomeDeles)
  const descricaoDeles = txt(o.descricaoDeles)
  const nosso = lista(o.nosso)
  const deles = lista(o.deles)
  if (!titulo || !nomeDeles || !descricaoDeles || !nosso || !deles) return undefined
  return { titulo, nomeDeles, descricaoDeles, nosso, deles }
}

function lerQuem(v: unknown): ConteudoDaPdp["quem"] {
  const o = obj(v)
  if (!o) return undefined
  const titulo = txt(o.titulo)
  const sim = lista(o.sim)
  const nao = lista(o.nao)
  if (!titulo || !sim || !nao) return undefined
  return { titulo, sim, nao }
}

function lerDuvidas(v: unknown): ConteudoDaPdp["duvidas"] {
  const o = obj(v)
  if (!o) return undefined
  const titulo = txt(o.titulo)
  const perguntas = (Array.isArray(o.perguntas) ? o.perguntas : [])
    .map((p) => {
      const q = obj(p)
      const pergunta = q && txt(q.pergunta)
      const resposta = q && lista(q.resposta)
      return pergunta && resposta ? { pergunta, resposta } : null
    })
    .filter((p): p is Pergunta => p !== null)
  if (!titulo || !perguntas.length) return undefined
  return { titulo, perguntas }
}

function lerLayout(v: unknown): AjusteDeLayout {
  const o = obj(v)
  if (!o) return {}

  const visibilidade: Record<string, boolean> = {}
  const vis = obj(o.visibilidade)
  if (vis) {
    for (const [id, valor] of Object.entries(vis)) {
      if (typeof valor === "boolean") visibilidade[id] = valor
    }
  }

  const ordem = Array.isArray(o.ordem)
    ? o.ordem.filter((x): x is string => typeof x === "string" && x.length > 0)
    : []

  return {
    ...(Object.keys(visibilidade).length ? { visibilidade } : {}),
    ...(ordem.length ? { ordem } : {}),
  }
}

/** Tira do `metadata` do produto a PDP, já peneirada. */
export function lerPdp(metadata: unknown): Pdp {
  const raiz = obj(metadata)?.[CHAVE_NO_METADATA]
  const o = obj(raiz)
  if (!o) return PDP_VAZIA

  const c = obj(o.conteudo) ?? {}
  const conteudo: ConteudoDaPdp = {}

  const secoes = {
    promessa: lerPromessa(c.promessa),
    tempo: lerTempo(c.tempo),
    faixa: lerFaixa(c.faixa),
    rotina: lerRotina(c.rotina),
    funciona: lerFunciona(c.funciona),
    versus: lerVersus(c.versus),
    quem: lerQuem(c.quem),
    duvidas: lerDuvidas(c.duvidas),
  }
  for (const [nome, valor] of Object.entries(secoes)) {
    if (valor) Object.assign(conteudo, { [nome]: valor })
  }

  return { conteudo, layout: lerLayout(o.layout) }
}
