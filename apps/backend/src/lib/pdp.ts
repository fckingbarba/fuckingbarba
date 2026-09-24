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

/** `alvo`: a etapa que a página destaca como o marco — uma só. */
export type PassoDoTempo = { quando: string; titulo: string; texto: string; alvo?: boolean }

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
  /**
   * Os produtos relacionados entram sozinhos (o motor de recomendação); do
   * produto, só o título que aparece no site.
   */
  relacionados?: { titulo: string }
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
  /** URL da imagem do computador. É a única coisa que liga o fundo. */
  imagem: string
  /**
   * A do celular, em pé. Sem ela, o celular usa a do computador cortada no
   * meio — numa tela estreita e alta, uma foto deitada perde as laterais.
   */
  imagemCelular?: string
  /** Opacidade do véu, de 40 a 100. 100 = a tela de hoje, sem foto à vista. */
  veu?: number
}

/**
 * As seções que aceitam foto de fundo — as que têm cor de véu na loja
 * (`apps/loja/src/estilos/fundo.css`). A faixa tem foto própria; as outras
 * não têm conteúdo do produto pra ficar por cima.
 */
export const SECOES_COM_FUNDO = [
  "produto.promessa",
  "produto.tempo",
  "produto.rotina",
  "produto.funciona",
  "produto.versus",
  "produto.quem",
  "produto.duvidas",
] as const

/**
 * A CAIXA DE COMPRA — o que aparece logo abaixo do preço. UMA COISA OU
 * OUTRA, no mesmo lugar (decidido em 23/09: as duas juntas deixam a caixa
 * grande demais):
 *
 *   "unidades" — os cartões "Quantas unidades" (1, 2 ou 3, com o desconto
 *     por quantidade, que vale em todo produto: é o "order bump" da página);
 *   "junto"    — o "Leve junto": até 2 produtos DIFERENTES, escolhidos a
 *     dedo, que a pessoa marca e leva no mesmo clique (o cross-sell).
 *
 * Sem `modo` (o que foi salvo antes dele), vale o de antes: os cartões, a
 * não ser que `kits` seja `false`.
 */
export type VendaCombinada = {
  modo?: "unidades" | "junto"
  /** Antes do `modo`: `false` escondia os cartões. Com `modo`, não vale mais. */
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
  /** Os do "Leve junto", por handle — até 2. */
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
  let marco = false
  const passos = (Array.isArray(o.passos) ? o.passos : [])
    .map((p) => {
      const q = obj(p)
      const quando = q && txt(q.quando)
      const t = q && txt(q.titulo)
      const texto = q && txt(q.texto)
      if (!quando || !t || !texto) return null
      // O marco é UMA etapa: a primeira marcada leva, as outras não.
      const alvo = q!.alvo === true && !marco
      if (alvo) marco = true
      return { quando, titulo: t, texto, ...(alvo ? { alvo: true } : {}) }
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

function lerRelacionados(v: unknown): ConteudoDaPdp["relacionados"] {
  const titulo = txt(obj(v)?.titulo)
  return titulo ? { titulo } : undefined
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

export function lerFundo(v: unknown): Fundo | null {
  const f = obj(v)
  // Sem imagem válida não há fundo: a seção volta à cor que ela já tinha,
  // que é o comportamento certo e o mesmo de nunca ter configurado nada.
  const imagem = f && lerImagem(f.imagem)
  if (!imagem) return null
  const imagemCelular = lerImagem(f!.imagemCelular)
  const bruto = typeof f!.veu === "number" ? Math.round(f!.veu as number) : NaN
  const veu = Number.isFinite(bruto) ? Math.min(100, Math.max(40, bruto)) : undefined
  return {
    imagem,
    ...(imagemCelular ? { imagemCelular } : {}),
    ...(veu !== undefined ? { veu } : {}),
  }
}

function lerFundos(v: unknown): Record<string, Fundo> {
  const o = obj(v)
  if (!o) return {}
  const fundos: Record<string, Fundo> = {}
  for (const [id, valor] of Object.entries(o)) {
    // Só as seções que têm véu na loja: fundo em outra ficaria sem cor por cima.
    if (!(SECOES_COM_FUNDO as readonly string[]).includes(id)) continue
    const fundo = lerFundo(valor)
    if (fundo) fundos[id] = fundo
  }
  return fundos
}

function lerCombinada(v: unknown): VendaCombinada {
  const o = obj(v)
  if (!o) return {}
  const modo = o.modo === "unidades" || o.modo === "junto" ? o.modo : undefined
  const todos = Array.isArray(o.produtos)
    ? [...new Set(o.produtos.map(txt).filter((h): h is string => h !== null))]
    : []
  // Com a escolha feita, o "Leve junto" leva no máximo 2: a caixa é pequena.
  const produtos = modo ? todos.slice(0, LIMITE_DO_LEVE_JUNTO) : todos
  const nota = txt(o.notaDoAvulso)
  return {
    ...(modo ? { modo } : o.kits === false ? { kits: false } : {}),
    /* Cortado no tamanho de uma linha: o cartão tem ~150px e um texto longo
       empurra o preço pra baixo nos três, porque a grade é compartilhada. */
    ...(nota ? { notaDoAvulso: nota.slice(0, LIMITE_DA_NOTA) } : {}),
    ...(produtos.length ? { produtos } : {}),
  }
}

/** Caracteres da linha de apoio do avulso. Duas linhas no cartão, no máximo. */
export const LIMITE_DA_NOTA = 48

/** Produtos no "Leve junto". */
export const LIMITE_DO_LEVE_JUNTO = 2

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
    relacionados: lerRelacionados(c.relacionados),
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

/* ── uma seção de cada vez: o editor do painel ────────────────────────────
 *
 * O `lerPdp` DESCARTA a seção meio preenchida, calado — é o certo pra loja
 * (um cabeçalho solto parece defeito), e o errado pra quem está escrevendo:
 * salvou, a seção sumiu, ninguém disse por quê. O painel pergunta antes o
 * que falta, e mostra.
 */

/** As seções com texto do produto, pela chave em `conteudo`. */
export const SECOES_DE_CONTEUDO = [
  "promessa",
  "tempo",
  "faixa",
  "rotina",
  "funciona",
  "versus",
  "quem",
  "duvidas",
  "relacionados",
] as const
export type ChaveDeConteudo = (typeof SECOES_DE_CONTEUDO)[number]

export const ehChaveDeConteudo = (v: unknown): v is ChaveDeConteudo =>
  typeof v === "string" && (SECOES_DE_CONTEUDO as readonly string[]).includes(v)

const LEITORES: Record<ChaveDeConteudo, (v: unknown) => unknown> = {
  promessa: lerPromessa,
  tempo: lerTempo,
  faixa: lerFaixa,
  rotina: lerRotina,
  funciona: lerFunciona,
  versus: lerVersus,
  quem: lerQuem,
  duvidas: lerDuvidas,
  relacionados: lerRelacionados,
}

/**
 * O que cada seção exige pra existir — o mesmo dos `lerX` lá de cima, em
 * tabela: texto, lista de textos, ou grupo (e os campos de cada item dele).
 */
const EXIGE: Record<
  ChaveDeConteudo,
  { textos?: string[]; listas?: string[]; grupos?: Record<string, string[]> }
> = {
  promessa: { textos: ["chapeu", "titulo"], listas: ["itens"] },
  tempo: { textos: ["titulo"], grupos: { passos: ["quando", "titulo", "texto"] } },
  faixa: { textos: ["chapeu", "titulo", "texto", "chamada", "fotoDe"] },
  rotina: { textos: ["titulo"], grupos: { itens: ["handle", "passo", "para"] } },
  funciona: {
    textos: ["comoTitulo", "comoFotoDe", "usoTitulo", "usoFotoDe"],
    listas: ["comoTexto", "usoPassos"],
  },
  versus: { textos: ["titulo", "nomeDeles", "descricaoDeles"], listas: ["nosso", "deles"] },
  quem: { textos: ["titulo"], listas: ["sim", "nao"] },
  duvidas: { textos: ["titulo"], grupos: { perguntas: ["pergunta", "resposta"] } },
  relacionados: { textos: ["titulo"] },
}

/** Tem texto de verdade: string com letra, ou lista com pelo menos uma. */
const temTexto = (v: unknown): boolean =>
  typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.some(temTexto) : false

/**
 * O que falta pra seção existir. As chaves são as dos campos — "titulo",
 * "itens" — e, nos grupos, grupo.índice.campo ("passos.1.texto"); o painel
 * troca pelos nomes da tela. Seção toda vazia não falta nada: é "sem texto
 * neste produto", e sai da página.
 */
export function faltandoNaSecao(chave: ChaveDeConteudo, valores: unknown): string[] {
  const o = obj(valores) ?? {}
  if (!Object.values(o).some(temTexto)) return []
  const exige = EXIGE[chave]
  const faltando: string[] = []
  for (const campo of exige.textos ?? []) if (!txt(o[campo])) faltando.push(campo)
  for (const campo of exige.listas ?? []) if (!lista(o[campo])) faltando.push(campo)
  for (const [grupo, campos] of Object.entries(exige.grupos ?? {})) {
    const itens = Array.isArray(o[grupo]) ? (o[grupo] as unknown[]) : []
    let inteiros = 0
    itens.forEach((item, i) => {
      const q = obj(item) ?? {}
      // Item todo vazio é linha que sobrou no formulário: fica de fora, sem aviso.
      if (!Object.values(q).some(temTexto)) return
      const falta = campos.filter((c) => !temTexto(q[c]))
      for (const c of falta) faltando.push(`${grupo}.${i}.${c}`)
      if (!falta.length) inteiros++
    })
    if (!inteiros && !faltando.some((f) => f.startsWith(`${grupo}.`))) faltando.push(grupo)
  }
  return faltando
}

/**
 * A seção pronta pra gravar: `null` quando vazia (sai da página), ou o que
 * falta quando está pela metade — aí não grava nada.
 */
export function lerSecao(
  chave: ChaveDeConteudo,
  valores: unknown
): { secao: unknown | null; faltando: string[] } {
  const faltando = faltandoNaSecao(chave, valores)
  if (faltando.length) return { secao: null, faltando }
  return { secao: LEITORES[chave](valores) ?? null, faltando: [] }
}
