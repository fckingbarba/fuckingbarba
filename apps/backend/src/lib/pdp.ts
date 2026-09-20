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

/* ── a imagem de fundo de uma seção ──────────────────────────────────────
 *
 * SÓ IMAGEM. Não há paleta de cores: sem imagem, a seção fica com a cor que
 * ela já tem, que é o desenho aprovado. O que se acrescenta é uma FOTO
 * ATRÁS, e a cor original vem por cima como véu translúcido.
 *
 * O porquê do véu (e não da foto crua) está em `apps/loja/src/estilos/
 * fundo.css`, com o resultado do teste que levou a ele: seis das oito
 * seções são cartões escuros sobre fundo claro, e foto crua no lugar do
 * fundo claro faz o cartão sumir e o texto solto virar escuro sobre escuro.
 */
export type Fundo = {
  /** URL da imagem. É a única coisa que liga o fundo. */
  imagem: string
  /** Opacidade do véu, de 40 a 100. 100 = a tela de hoje, sem foto à vista. */
  veu?: number
}

/**
 * QUEM APARECE DEPOIS DO PREÇO.
 *
 * Duas coisas diferentes que costumam ser confundidas:
 *
 *   KITS (upsell) — mais unidades do MESMO produto. Já é automático: sai
 *     do catálogo, pela metadata `kit-quantidade`, e aparece sozinho em
 *     quem tem kit cadastrado. A chavinha aqui só DESLIGA, porque ligar
 *     não é decisão de tela: ou existe kit, ou não existe;
 *   PRODUTOS QUE COMBINAM (cross-sell) — produtos DIFERENTES. Hoje a
 *     escolha é "o resto do catálogo, mesma categoria primeiro", o que com
 *     seis produtos é honesto e com sessenta deixa de ser.
 *
 * ESCOLHA VAZIA CAI NO AUTOMÁTICO, e não em seção vazia. Se a lista vazia
 * significasse "não mostre nada", ligar este campo esvaziaria a seção no
 * catálogo inteiro de uma vez — em todo produto que ninguém curou ainda.
 */
export type VendaCombinada = {
  /** `false` esconde os kits de quantidade neste produto. */
  kits?: boolean
  /**
   * A linha embaixo de "1 frasco" no cartão de quantidade.
   *
   * Os kits pegam a deles do `subtitle` do próprio kit ("Dois meses de
   * tratamento…"), porque um kit só existe como quantidade. O avulso não
   * pode: o `subtitle` dele é o que o PRODUTO é ("Crescimento, densidade e
   * preenchimento"), e isso embaixo de "1 frasco" responde a pergunta
   * errada — e em três linhas.
   *
   * Sem esta linha o primeiro cartão fica com um buraco do tamanho da
   * descrição dos outros dois. O texto é curto de propósito: "1 mês de
   * uso", "Pra experimentar".
   */
  notaDoAvulso?: string
  /** Handles escolhidos a dedo. Vazio = automático. */
  produtos?: string[]
}

export type Pdp = {
  conteudo: ConteudoDaPdp
  layout: AjusteDeLayout
  /** Por id de seção do registro: "produto.promessa", "produto.quem"… */
  fundos: Record<string, Fundo>
  combinada: VendaCombinada
}

export const PDP_VAZIA: Pdp = { conteudo: {}, layout: {}, fundos: {}, combinada: {} }

/* ── leitura defensiva ─────────────────────────────────────────────────── */

const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)

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
  const c = {
    chapeu: txt(o.chapeu),
    titulo: txt(o.titulo),
    texto: txt(o.texto),
    chamada: txt(o.chamada),
    fotoDe: txt(o.fotoDe),
  }
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
    comoTitulo,
    comoFotoDe,
    comoTexto,
    usoTitulo,
    usoFotoDe,
    usoPassos,
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

/**
 * A URL da imagem é conferida ANTES de virar `background-image` numa página
 * pública. `javascript:` e `data:` numa url() de CSS são vetores conhecidos,
 * e este campo vem do formulário — ou seja, de fora.
 */
function lerImagem(v: unknown): string | null {
  const u = txt(v)
  if (!u) return null
  try {
    const url = new URL(u, "https://x.invalid")
    return url.protocol === "http:" || url.protocol === "https:" ? u : null
  } catch {
    // Caminho relativo ("/uploads/foto.jpg") é o que o Medusa devolve quando
    // o arquivo fica em disco, e é seguro.
    return u.startsWith("/") ? u : null
  }
}

function lerFundos(v: unknown): Record<string, Fundo> {
  const o = obj(v)
  if (!o) return {}
  const fundos: Record<string, Fundo> = {}

  for (const [id, valor] of Object.entries(o)) {
    const f = obj(valor)
    // Sem imagem válida não há fundo: a seção volta à cor que ela já tinha,
    // que é o comportamento certo e o mesmo de nunca ter configurado nada.
    const imagem = f && lerImagem(f.imagem)
    if (!imagem) continue

    const bruto = typeof f!.veu === "number" ? Math.round(f!.veu as number) : NaN
    const veu = Number.isFinite(bruto) ? Math.min(100, Math.max(40, bruto)) : undefined
    fundos[id] = { imagem, ...(veu !== undefined ? { veu } : {}) }
  }

  return fundos
}

function lerCombinada(v: unknown): VendaCombinada {
  const o = obj(v)
  if (!o) return {}
  const produtos = Array.isArray(o.produtos)
    ? [...new Set(o.produtos.map(txt).filter((h): h is string => h !== null))]
    : []
  const nota = txt(o.notaDoAvulso)
  return {
    ...(o.kits === false ? { kits: false } : {}),
    /* Cortado no tamanho de uma linha: o cartão tem ~150px e um texto longo
       empurra o preço pra baixo nos três, porque a grade é compartilhada. */
    ...(nota ? { notaDoAvulso: nota.slice(0, LIMITE_DA_NOTA) } : {}),
    ...(produtos.length ? { produtos } : {}),
  }
}

/** Caracteres da linha de apoio do avulso. Duas linhas no cartão, no máximo. */
export const LIMITE_DA_NOTA = 48

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

  return {
    conteudo,
    layout: lerLayout(o.layout),
    fundos: lerFundos(o.fundos),
    combinada: lerCombinada(o.combinada),
  }
}
