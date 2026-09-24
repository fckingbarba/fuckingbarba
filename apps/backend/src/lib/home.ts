import { lerLayout, type AjusteDeLayout } from "./pdp"

/**
 * A HOME DA LOJA — o texto e a ordem das seções, no `metadata` da loja.
 *
 * Até a fase 4 do painel, a home era código: o texto em
 * `apps/loja/src/conteudo/home.ts` e nos componentes, a ordem no registro de
 * seções. Mudar uma frase do banner era commit e deploy. Agora o painel
 * ("Layout da home") edita, e o que ele grava mora aqui, na chave
 * `fb_home` do metadata da loja.
 *
 * ┌─ RASCUNHO E PUBLICADO ─────────────────────────────────────────────────┐
 * │ Na página do produto, cada "Salvar" vai pro site na hora. Na home, não: │
 * │ ela é a porta da loja, e uma frase pela metade na vitrine de sexta à   │
 * │ noite é o tipo de coisa que ninguém quer ver no ar. Então há DUAS      │
 * │ versões: o `rascunho`, que o painel edita à vontade, e o `publicado`,  │
 * │ que é o que a loja mostra. O "Publicar" copia uma na outra.            │
 * │                                                                         │
 * │ `rascunho: null` quer dizer "igual ao publicado" — não há nada         │
 * │ esperando. É o estado depois de publicar, e depois de desfazer.        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O TEXTO DE FÁBRICA (`SEMENTE_DA_HOME`) ───────────────────────────────┐
 * │ O conteúdo guardado é ESPARSO, como a ordem das seções: só as seções   │
 * │ que alguém salvou. As outras mostram o texto de fábrica, que é o que   │
 * │ estava escrito na loja no dia em que a home saiu do código. Assim a    │
 * │ loja nunca fica sem o título da página (o `<h1>` mora no bloco escuro) │
 * │ e um banco novo já nasce com a home de hoje.                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * GÊMEO NA LOJA: `apps/loja/src/lib/home.ts` tem os mesmos tipos e uma
 * peneira menor (só o que evita quebrar a página). A lista das seções e a
 * ordem padrão são as do registro da loja (`lib/secoes/registro.ts`).
 */

export const CHAVE_NO_METADATA = "fb_home"

/* ── as seções ────────────────────────────────────────────────────────── */

/** As seções da home, na ordem padrão — a do registro da loja. */
export const SECOES_DA_HOME = [
  "home.banner",
  "home.trustbar",
  "home.ofertas",
  "home.colecao",
  "home.hero",
  "home.alta-performance",
  "home.provas",
  "home.amam",
  "home.vitrine",
  "home.sobre",
  "home.fechamento",
] as const
export type IdDaSecaoDaHome = (typeof SECOES_DA_HOME)[number]

export const ehIdDaSecaoDaHome = (v: unknown): v is IdDaSecaoDaHome =>
  typeof v === "string" && (SECOES_DA_HOME as readonly string[]).includes(v)

/** O bloco escuro carrega o `<h1>` da página: não desliga nem sai do lugar. */
export const FIXAS_DA_HOME: readonly IdDaSecaoDaHome[] = ["home.hero"]

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
  /** Os passos do uso, de um a três. */
  passos: string[]
  numero: string
  unidade: string
  legenda: string
  resultado: string
}

export type ConteudoDaHome = {
  banner: { chapeu: string; titulo: string; chamada: string; produto: string }
  /** As vantagens escritas à mão. O frete e o parcelamento entram sozinhos, antes delas. */
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
export type ChaveDaHome = keyof ConteudoDaHome

/** A chave do texto de cada seção em `conteudo`. */
export const CHAVE_DA_SECAO_DA_HOME: Record<IdDaSecaoDaHome, ChaveDaHome> = {
  "home.banner": "banner",
  "home.trustbar": "trustbar",
  "home.ofertas": "ofertas",
  "home.colecao": "colecao",
  "home.hero": "hero",
  "home.alta-performance": "altaPerformance",
  "home.provas": "provas",
  "home.amam": "amam",
  "home.vitrine": "vitrine",
  "home.sobre": "sobre",
  "home.fechamento": "fechamento",
}

/** Quantos cabem: a barra tem quatro lugares (frete e parcelamento são dois). */
export const LIMITES_DA_HOME = {
  vantagens: 2,
  comparativo: 3,
  garantias: 4,
  produtosNoPalco: 5,
  passos: 3,
  paragrafos: 4,
  numeros: 4,
} as const

/* ── o texto de fábrica ────────────────────────────────────────────────── */

/**
 * O que a loja mostrava quando a home saiu do código (24/09) — copiado de
 * `conteudo/home.ts`, `conteudo/alta-performance.ts` e dos componentes.
 *
 * ┌─ AFIRMAÇÕES: CONFERIR ANTES DE IR PRO AR ─────────────────────────────┐
 * │ "Aprovado em estudo interno", "+1.000.000 clientes satisfeitos", o    │
 * │ ano de fundação e o "+1M clientes impactados" vieram do protótipo e   │
 * │ ninguém confirmou. Cosmético no Brasil tem regra pra alegação (RDC da │
 * │ Anvisa), e número sobre o negócio é o que o concorrente aponta. O     │
 * │ painel mostra o aviso em cima de cada um.                             │
 * └───────────────────────────────────────────────────────────────────────┘
 */
export const SEMENTE_DA_HOME: ConteudoDaHome = {
  banner: {
    chapeu: "Semana do Cliente",
    titulo: "Nosso kit best seller",
    chamada: "Comprar agora",
    produto: "kit-completo-para-barba",
  },
  trustbar: {
    vantagens: [
      { titulo: "Loja Segura", detalhe: "Para suas compras" },
      { titulo: "Compra Garantida", detalhe: "Satisfação garantida" },
    ],
  },
  ofertas: { titulo: "Ofertas Relâmpago" },
  colecao: { titulo: "Alta Performance: Barba e Cabelo" },
  hero: {
    chapeu: "Alta Performance",
    titulo: "Fórmulas de alta performance, resultado que você sente.",
    comparativo: [
      { rotulo: "Ativos", valor: "Alta concentração" },
      { rotulo: "Testado", valor: "Aprovado em estudo interno" },
    ],
    chamada: "Ver produtos",
    garantias: ["+1.000.000 clientes satisfeitos", "Loja oficial da marca", "Cosméticos premium"],
    aviso: "*Resultados podem variar conforme uso individual.",
  },
  altaPerformance: {
    produtos: [
      {
        produto: "kit-completo-para-barba",
        nomeCurto: "Kit Completo FuckingBarba",
        titulo: "A rotina inteira numa caixa só",
        texto:
          "Shampoo, óleo e balm juntos — você não precisa montar combinação nem descobrir sozinho a ordem certa.",
        usoTitulo: "3 passos · 2 minutos",
        usoTexto:
          "No banho, shampoo. Barba ainda úmida, óleo. Pra fechar, balm modelando no sentido do fio.",
        passos: ["Lavar", "Nutrir", "Finalizar"],
        numero: "3",
        unidade: "em 1",
        legenda: "Rotina completa numa caixa",
        resultado:
          "Barba macia, alinhada e com cheiro que dura — sem pesar e sem deixar aspecto oleoso.",
      },
      {
        produto: "fator-de-crescimento-para-barba",
        nomeCurto: "Fator de Crescimento FuckingBarba",
        titulo: "Uso diário, ativos concentrados",
        texto:
          "Loção leve que seca rápido, formulada pra quem busca uma barba de aspecto mais cheio e preenchido.",
        usoTitulo: "2x ao dia · 30 segundos",
        usoTexto:
          "Manhã e noite, na pele limpa e seca. Espalhe nas falhas e massageie até secar. Não precisa enxaguar.",
        passos: ["Limpar", "Aplicar", "Massagear"],
        numero: "90",
        unidade: "dias",
        legenda: "Ciclo de uso recomendado",
        resultado:
          "Constância é o que conta: o ciclo do fio é lento, e por isso o frasco é pensado pra acompanhar 90 dias de rotina.",
      },
      {
        produto: "spray-modelador-matte-100ml-fucking-barba",
        nomeCurto: "Spray Matte Modelador para Cabelo",
        titulo: "Textura sem o brilho de pomada",
        texto:
          "Fixação média com acabamento seco. Dá corpo e movimento sem deixar aquele aspecto engomado.",
        usoTitulo: "Cabelo seco · 20 cm",
        usoTexto:
          "Borrife a 20 cm de distância, mecha por mecha, e modele com a mão. Quer mais firmeza? Uma segunda camada.",
        passos: ["Borrifar", "Modelar", "Ajustar"],
        numero: "12",
        unidade: "h",
        legenda: "Fixação que atravessa o dia",
        resultado:
          "Efeito matte de verdade: segura o penteado, não craquela e sai no banho com água e shampoo.",
      },
    ],
  },
  provas: {
    tag: "Resultados reais",
    titulo: "Antes e depois de quem levou a rotina a sério",
  },
  amam: { titulo: "Nossos clientes nos amam" },
  vitrine: { titulo: "Todos os produtos" },
  sobre: {
    titulo: "O cuidado que impõe presença",
    paragrafos: [
      "A FuckingBarba nasceu da revolta com produtos genéricos e marcas que tratam o cuidado pessoal como detalhe. Aqui, cuidar de si é ritual: presença, identidade e respeito com quem você é.",
      "Fórmulas de alta performance e ingredientes de qualidade, pra quem sabe que a aparência fala antes mesmo de você abrir a boca.",
    ],
    grito: "Somos mais do que cosméticos. Somos atitude.",
    numeros: [
      { valor: "2016", rotulo: "Ano de fundação" },
      { valor: "+1M", rotulo: "Clientes impactados" },
      { valor: "BR", rotulo: "Presença nacional" },
    ],
    fotoDe: "oleo-para-barba",
  },
  fechamento: {
    chapeu: "Última chamada",
    titulo: "Cosméticos premium pra elevar sua presença — da barba ao cabelo.",
    chamada: "Ver todos os produtos",
    fotoDe: "kit-completo-para-barba",
  },
}

/* ── o que fica guardado ──────────────────────────────────────────────── */

/** Uma versão da home: o texto (só das seções salvas) e a ordem. */
export type VersaoDaHome = { conteudo: Partial<ConteudoDaHome>; layout: AjusteDeLayout }

export type HomeGuardada = {
  /** O que a loja mostra. */
  publicado: VersaoDaHome
  /** O que o painel está editando; `null` = igual ao publicado, nada esperando. */
  rascunho: VersaoDaHome | null
  /** Quando e quem apertou o último "Publicar" (ISO; o nome de quem, na hora). */
  publicadoEm: string | null
  publicadoPor: string | null
}

export const VERSAO_VAZIA: VersaoDaHome = { conteudo: {}, layout: {} }

export const HOME_VAZIA: HomeGuardada = {
  publicado: VERSAO_VAZIA,
  rascunho: null,
  publicadoEm: null,
  publicadoPor: null,
}

/* ── leitura defensiva ─────────────────────────────────────────────────
 *
 * O metadata é JSON livre, e o admin do Medusa deixa qualquer um escrever
 * nele. Nada aqui confia no que leu: cada seção passa pelo leitor dela, e
 * a que não passar some — e aí vale o texto de fábrica.
 */

const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Lista de textos, sem os vazios, até `max`. `null` quando não sobra nada. */
function lista(v: unknown, max: number): string[] | null {
  if (!Array.isArray(v)) return null
  const l = v
    .map(txt)
    .filter((s): s is string => s !== null)
    .slice(0, max)
  return l.length ? l : null
}

/** Os itens inteiros de um grupo, até `max`: item com campo obrigatório vazio fica de fora. */
function grupo<T>(v: unknown, max: number, ler: (o: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(v)) return []
  return v
    .map((i) => {
      const o = obj(i)
      return o ? ler(o) : null
    })
    .filter((i): i is T => i !== null)
    .slice(0, max)
}

/** Os campos de texto obrigatórios, todos — ou `null`. */
function textos<K extends string>(o: Record<string, unknown>, chaves: readonly K[]) {
  const r = {} as Record<K, string>
  for (const k of chaves) {
    const t = txt(o[k])
    if (!t) return null
    r[k] = t
  }
  return r
}

/** Um campo opcional: entra só se tiver texto. */
const opcional = <K extends string>(k: K, v: unknown): Partial<Record<K, string>> =>
  txt(v) ? ({ [k]: txt(v)! } as Record<K, string>) : {}

/** Com menos de dois produtos, o palco sai da página (ver `components/home/alta-performance.tsx`). */
export const MINIMO_NO_PALCO = 2

const LEITORES: { [K in ChaveDaHome]: (v: unknown) => ConteudoDaHome[K] | undefined } = {
  banner: (v) => {
    const o = obj(v)
    return (o && textos(o, ["chapeu", "titulo", "chamada", "produto"] as const)) ?? undefined
  },

  trustbar: (v) => {
    const o = obj(v)
    if (!o) return undefined
    const vantagens = grupo(o.vantagens, LIMITES_DA_HOME.vantagens, (i) =>
      textos(i, ["titulo", "detalhe"] as const)
    )
    return vantagens.length ? { vantagens } : undefined
  },

  ofertas: (v) => {
    const o = obj(v)
    return (o && textos(o, ["titulo"] as const)) ?? undefined
  },

  colecao: (v) => {
    const o = obj(v)
    return (o && textos(o, ["titulo"] as const)) ?? undefined
  },

  hero: (v) => {
    const o = obj(v)
    const t = o && textos(o, ["chapeu", "titulo", "chamada"] as const)
    if (!o || !t) return undefined
    return {
      ...t,
      comparativo: grupo(o.comparativo, LIMITES_DA_HOME.comparativo, (i) =>
        textos(i, ["rotulo", "valor"] as const)
      ),
      garantias: lista(o.garantias, LIMITES_DA_HOME.garantias) ?? [],
      ...opcional("aviso", o.aviso),
    }
  },

  altaPerformance: (v) => {
    const o = obj(v)
    if (!o) return undefined
    const produtos = grupo(o.produtos, LIMITES_DA_HOME.produtosNoPalco, (i) => {
      const t = textos(i, [
        "produto",
        "titulo",
        "texto",
        "usoTitulo",
        "usoTexto",
        "numero",
        "unidade",
        "legenda",
        "resultado",
      ] as const)
      const passos = lista(i.passos, LIMITES_DA_HOME.passos)
      if (!t || !passos) return null
      return { ...t, passos, ...opcional("nomeCurto", i.nomeCurto) }
    }).filter((p, i, todos) => todos.findIndex((q) => q.produto === p.produto) === i)
    // Palco de um produto só é um bloco com bolinha inútil embaixo: a loja tira a seção.
    return produtos.length >= MINIMO_NO_PALCO ? { produtos } : undefined
  },

  provas: (v) => {
    const o = obj(v)
    return (o && textos(o, ["tag", "titulo"] as const)) ?? undefined
  },

  amam: (v) => {
    const o = obj(v)
    return (o && textos(o, ["titulo"] as const)) ?? undefined
  },

  vitrine: (v) => {
    const o = obj(v)
    return (o && textos(o, ["titulo"] as const)) ?? undefined
  },

  sobre: (v) => {
    const o = obj(v)
    const titulo = o && txt(o.titulo)
    const paragrafos = o && lista(o.paragrafos, LIMITES_DA_HOME.paragrafos)
    if (!o || !titulo || !paragrafos) return undefined
    return {
      titulo,
      paragrafos,
      ...opcional("grito", o.grito),
      numeros: grupo(o.numeros, LIMITES_DA_HOME.numeros, (i) =>
        textos(i, ["valor", "rotulo"] as const)
      ),
      ...opcional("fotoDe", o.fotoDe),
    }
  },

  fechamento: (v) => {
    const o = obj(v)
    const t = o && textos(o, ["chapeu", "titulo", "chamada"] as const)
    return o && t ? { ...t, ...opcional("fotoDe", o.fotoDe) } : undefined
  },
}

export function lerVersao(v: unknown): VersaoDaHome {
  const o = obj(v)
  if (!o) return VERSAO_VAZIA
  const c = obj(o.conteudo) ?? {}
  const conteudo: Partial<ConteudoDaHome> = {}
  for (const chave of Object.keys(LEITORES) as ChaveDaHome[]) {
    const lido = LEITORES[chave](c[chave])
    if (lido) Object.assign(conteudo, { [chave]: lido })
  }
  return { conteudo, layout: lerLayout(o.layout) }
}

/** Tira do `metadata` da loja a home, já peneirada. */
export function lerHome(metadata: unknown): HomeGuardada {
  const o = obj(obj(metadata)?.[CHAVE_NO_METADATA])
  if (!o) return HOME_VAZIA
  const data = txt(o.publicadoEm)
  return {
    publicado: lerVersao(o.publicado),
    rascunho: obj(o.rascunho) ? lerVersao(o.rascunho) : null,
    publicadoEm: data && !Number.isNaN(Date.parse(data)) ? data : null,
    publicadoPor: txt(o.publicadoPor),
  }
}

/** O texto de uma seção numa versão: o salvo, ou o de fábrica. */
export function conteudoDaSecao<K extends ChaveDaHome>(
  versao: VersaoDaHome,
  chave: K
): ConteudoDaHome[K] {
  return (versao.conteudo[chave] as ConteudoDaHome[K] | undefined) ?? SEMENTE_DA_HOME[chave]
}

/**
 * O QUE A LOJA RECEBE (`GET /store/home`): a versão publicada, com o texto
 * de TODAS as seções — a salva, ou a de fábrica. O rascunho nunca sai daqui.
 */
export function homeDoSite(h: HomeGuardada): { layout: AjusteDeLayout; conteudo: ConteudoDaHome } {
  const conteudo = {} as ConteudoDaHome
  for (const chave of Object.keys(SEMENTE_DA_HOME) as ChaveDaHome[]) {
    Object.assign(conteudo, { [chave]: conteudoDaSecao(h.publicado, chave) })
  }
  return { layout: h.publicado.layout, conteudo }
}

/* ── uma seção de cada vez: o editor do painel ────────────────────────── */

/** `unico`: o campo que não se repete entre os itens (o produto do palco); o repetido não conta. */
type Grupo = { campos: string[]; minimo?: number; unico?: string }

/**
 * O que cada seção exige — o mesmo dos leitores lá de cima, em tabela:
 * texto, lista de textos, e grupo (os campos de cada item e quantos, no
 * mínimo). Grupo com `minimo: 0` pode ficar vazio; o item começado, não.
 */
const EXIGE: Record<
  ChaveDaHome,
  { textos?: string[]; listas?: string[]; grupos?: Record<string, Grupo> }
> = {
  banner: { textos: ["chapeu", "titulo", "chamada", "produto"] },
  trustbar: { grupos: { vantagens: { campos: ["titulo", "detalhe"] } } },
  ofertas: { textos: ["titulo"] },
  colecao: { textos: ["titulo"] },
  hero: {
    textos: ["chapeu", "titulo", "chamada"],
    grupos: { comparativo: { campos: ["rotulo", "valor"], minimo: 0 } },
  },
  altaPerformance: {
    grupos: {
      produtos: {
        campos: [
          "produto",
          "titulo",
          "texto",
          "usoTitulo",
          "usoTexto",
          "passos",
          "numero",
          "unidade",
          "legenda",
          "resultado",
        ],
        minimo: MINIMO_NO_PALCO,
        unico: "produto",
      },
    },
  },
  provas: { textos: ["tag", "titulo"] },
  amam: { textos: ["titulo"] },
  vitrine: { textos: ["titulo"] },
  sobre: {
    textos: ["titulo"],
    listas: ["paragrafos"],
    grupos: { numeros: { campos: ["valor", "rotulo"], minimo: 0 } },
  },
  fechamento: { textos: ["chapeu", "titulo", "chamada"] },
}

/** Tem valor de verdade: string com letra, caixinha marcada, ou lista/objeto com pelo menos um. */
const temTexto = (v: unknown): boolean =>
  typeof v === "string"
    ? v.trim().length > 0
    : v === true
      ? true
      : Array.isArray(v)
        ? v.some(temTexto)
        : v !== null && typeof v === "object"
          ? Object.values(v).some(temTexto)
          : false

/**
 * O que falta pra seção valer. As chaves são as dos campos ("titulo") e, nos
 * grupos, grupo.índice.campo ("produtos.1.texto"); o grupo sem itens
 * inteiros suficientes entra pelo nome ("produtos"). Na home não existe
 * "seção sem texto": toda seção tem o de fábrica, e apagar tudo é o que
 * falta — pra voltar ao de fábrica, o painel tem o botão.
 */
export function faltandoNaSecaoDaHome(chave: ChaveDaHome, valores: unknown): string[] {
  const o = obj(valores) ?? {}
  const exige = EXIGE[chave]
  const faltando: string[] = []
  for (const campo of exige.textos ?? []) if (!txt(o[campo])) faltando.push(campo)
  for (const campo of exige.listas ?? []) if (!lista(o[campo], 99)) faltando.push(campo)
  for (const [nome, { campos, minimo = 1, unico }] of Object.entries(exige.grupos ?? {})) {
    const itens = Array.isArray(o[nome]) ? (o[nome] as unknown[]) : []
    const vistos = new Set<string>()
    let inteiros = 0
    itens.forEach((item, i) => {
      const q = obj(item) ?? {}
      // Item todo vazio é linha que sobrou no formulário: fica de fora, sem aviso.
      if (!Object.values(q).some(temTexto)) return
      const falta = campos.filter((c) => !temTexto(q[c]))
      for (const c of falta) faltando.push(`${nome}.${i}.${c}`)
      if (falta.length) return
      // O repetido sai na gravação (fica o primeiro): não conta pro mínimo.
      const chave = unico ? txt(q[unico]) : null
      if (chave && vistos.has(chave)) return
      if (chave) vistos.add(chave)
      inteiros++
    })
    if (inteiros < minimo && !faltando.some((f) => f.startsWith(`${nome}.`))) faltando.push(nome)
  }
  return faltando
}

/** A seção pronta pra gravar, ou o que falta — aí não grava nada. */
export function lerSecaoDaHome<K extends ChaveDaHome>(
  chave: K,
  valores: unknown
): { secao: ConteudoDaHome[K]; faltando: [] } | { secao: null; faltando: string[] } {
  const faltando = faltandoNaSecaoDaHome(chave, valores)
  if (faltando.length) return { secao: null, faltando }
  const secao = LEITORES[chave](valores) as ConteudoDaHome[K] | undefined
  // Passou na tabela e não no leitor: é a regra que as duas não escrevem igual.
  return secao ? { secao, faltando: [] } : { secao: null, faltando: [chave] }
}
