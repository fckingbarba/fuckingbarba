import { lerFundo, lerImagem, lerLayout, type AjusteDeLayout, type Fundo } from "./pdp"

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

/**
 * UM SLIDE DO BANNER: SÓ A ARTE (decidido em 24/09). A imagem ocupa o
 * banner inteiro, com o texto dentro dela, como os banners da loja na
 * Nuvemshop — a do computador (`imagem`) e, se tiver, a do celular
 * (`imagemCelular`). O `titulo` é a descrição da arte (pra quem não enxerga
 * e pro Google) — OPCIONAL desde 26/09: sem ela, a loja descreve o slide
 * pelo nome do produto do link. O slide inteiro leva pro `produto` — ou pra
 * vitrine inteira, sem produto.
 *
 * Não há mais o banner montado pela loja, com o painel amarelo, o preço e o
 * botão: sem arte, não há slide — e sem slide nenhum, a home começa na
 * barra de vantagens.
 */
export type SlideDoBanner = {
  titulo?: string
  imagem: string
  imagemCelular?: string
  produto?: string
}

/** De quanto em quanto tempo o banner passa pro próximo slide, em segundos (0: só quando a pessoa troca). */
export const TEMPOS_DO_BANNER = [0, 5, 7, 10] as const
export type TempoDoBanner = (typeof TEMPOS_DO_BANNER)[number]

/**
 * O VÍDEO DA HISTÓRIA DA MARCA — no "Sobre a marca", no lugar da foto. O
 * que sobe pelo painel vem com a capa (um quadro do começo) e a duração; o
 * que veio do admin, de antes do painel (`comVideoDoAdmin`), só com as
 * medidas — e a loja usa a foto do produto de capa. Largura e altura
 * reservam o espaço na página antes de o vídeo chegar.
 */
export type VideoDaHistoria = {
  url: string
  largura: number
  altura: number
  poster?: string
  duracao?: number
}

export type ConteudoDaHome = {
  banner: { slides: SlideDoBanner[]; tempo: TempoDoBanner }
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
    /** Com vídeo, ele entra no lugar da foto. */
    video?: VideoDaHistoria
  }
  fechamento: {
    chapeu: string
    titulo: string
    chamada: string
    /** A foto da faixa (computador; a do celular é extra dela). Sem ela, a do produto. */
    imagem?: string
    imagemCelular?: string
    fotoDe?: string
  }
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
  slides: 5,
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
  // Sem arte, sem banner: ele só aparece quando alguém publicar a primeira.
  banner: { slides: [], tempo: 7 },
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

/**
 * As seções da home que aceitam foto de fundo — as que têm cor de véu na
 * loja (`apps/loja/src/estilos/fundo.css`). O banner e a última chamada têm
 * imagem própria, no texto delas; a prova social e a esteira de avaliações
 * ainda não aparecem na loja (não há caso nem avaliação cadastrada).
 */
export const SECOES_COM_FUNDO_DA_HOME: readonly IdDaSecaoDaHome[] = [
  "home.colecao",
  "home.hero",
  "home.alta-performance",
  "home.vitrine",
  "home.sobre",
]

/** Uma versão da home: o texto (só das seções salvas), a ordem e as fotos de fundo. */
export type VersaoDaHome = {
  conteudo: Partial<ConteudoDaHome>
  layout: AjusteDeLayout
  fundos: Partial<Record<IdDaSecaoDaHome, Fundo>>
}

export type HomeGuardada = {
  /** O que a loja mostra. */
  publicado: VersaoDaHome
  /** O que o painel está editando; `null` = igual ao publicado, nada esperando. */
  rascunho: VersaoDaHome | null
  /** Quando e quem apertou o último "Publicar" (ISO; o nome de quem, na hora). */
  publicadoEm: string | null
  publicadoPor: string | null
}

export const VERSAO_VAZIA: VersaoDaHome = { conteudo: {}, layout: {}, fundos: {} }

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

/**
 * Um slide: a arte (a do computador) e, se tiver, a descrição dela; a do
 * celular só vale junto da do computador. Slide sem arte — como os de texto
 * de antes dela — fica de fora.
 */
function lerSlide(o: Record<string, unknown>): SlideDoBanner | null {
  const imagem = lerImagem(o.imagem)
  if (!imagem) return null
  const imagemCelular = lerImagem(o.imagemCelular)
  return {
    ...opcional("titulo", o.titulo),
    imagem,
    ...(imagemCelular ? { imagemCelular } : {}),
    ...opcional("produto", o.produto),
  }
}

const medida = (v: unknown, maximo: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= maximo ? v : null

/** O vídeo da história: o endereço e as medidas; a capa e a duração, quando vieram. */
export function lerVideoDaHistoria(v: unknown): VideoDaHistoria | null {
  const o = obj(v)
  const url = o && lerImagem(o.url)
  const largura = o && medida(o.largura, 10_000)
  const altura = o && medida(o.altura, 10_000)
  if (!o || !url || !largura || !altura) return null
  const poster = lerImagem(o.poster)
  const duracao = medida(o.duracao, 3600)
  return {
    url,
    largura: Math.round(largura),
    altura: Math.round(altura),
    ...(poster ? { poster } : {}),
    ...(duracao ? { duracao: Math.round(duracao * 10) / 10 } : {}),
  }
}

const ehTempo = (v: unknown): v is TempoDoBanner =>
  (TEMPOS_DO_BANNER as readonly unknown[]).includes(v)

const LEITORES: { [K in ChaveDaHome]: (v: unknown) => ConteudoDaHome[K] | undefined } = {
  banner: (v) => {
    const o = obj(v)
    if (!o) return undefined
    // O banner de antes dos slides (um slide só, os campos soltos) vira o primeiro slide.
    const brutos = Array.isArray(o.slides) ? o.slides : [o]
    const slides = grupo(brutos, LIMITES_DA_HOME.slides, lerSlide)
    if (!slides.length) return undefined
    const tempo = typeof o.tempo === "string" ? Number(o.tempo) : o.tempo
    return { slides, tempo: ehTempo(tempo) ? tempo : SEMENTE_DA_HOME.banner.tempo }
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
    const video = lerVideoDaHistoria(o.video)
    return {
      titulo,
      paragrafos,
      ...opcional("grito", o.grito),
      numeros: grupo(o.numeros, LIMITES_DA_HOME.numeros, (i) =>
        textos(i, ["valor", "rotulo"] as const)
      ),
      ...opcional("fotoDe", o.fotoDe),
      ...(video ? { video } : {}),
    }
  },

  fechamento: (v) => {
    const o = obj(v)
    const t = o && textos(o, ["chapeu", "titulo", "chamada"] as const)
    if (!o || !t) return undefined
    const imagem = lerImagem(o.imagem)
    const imagemCelular = imagem ? lerImagem(o.imagemCelular) : null
    return {
      ...t,
      ...(imagem ? { imagem } : {}),
      ...(imagemCelular ? { imagemCelular } : {}),
      ...opcional("fotoDe", o.fotoDe),
    }
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
  const f = obj(o.fundos) ?? {}
  const fundos: VersaoDaHome["fundos"] = {}
  for (const id of SECOES_COM_FUNDO_DA_HOME) {
    const fundo = lerFundo(f[id])
    if (fundo) fundos[id] = fundo
  }
  return { conteudo, layout: lerLayout(o.layout), fundos }
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

/** O texto que a loja recebe: o do "Sobre a marca" sempre com o `video` — `null` quando não tem. */
export type ConteudoDoSite = Omit<ConteudoDaHome, "sobre"> & {
  sobre: Omit<ConteudoDaHome["sobre"], "video"> & { video: VideoDaHistoria | null }
}

/**
 * O QUE A LOJA RECEBE (`GET /store/home`): a versão publicada, com o texto
 * de TODAS as seções — a salva, ou a de fábrica. O rascunho nunca sai daqui.
 *
 * O vídeo da história vai sempre, nem que seja `null`: é assim que a loja
 * sabe que este Medusa já guarda o vídeo na home. O de antes da entrega
 * 0080 não mandava a chave, e aí a loja usa o vídeo do admin
 * (`fb_configuracoes`).
 */
export function homeDoSite(h: HomeGuardada): {
  layout: AjusteDeLayout
  conteudo: ConteudoDoSite
  fundos: VersaoDaHome["fundos"]
} {
  const conteudo = {} as ConteudoDaHome
  for (const chave of Object.keys(SEMENTE_DA_HOME) as ChaveDaHome[]) {
    Object.assign(conteudo, { [chave]: conteudoDaSecao(h.publicado, chave) })
  }
  return {
    layout: h.publicado.layout,
    conteudo: { ...conteudo, sobre: { ...conteudo.sobre, video: conteudo.sobre.video ?? null } },
    fundos: h.publicado.fundos,
  }
}

/**
 * O VÍDEO DA HISTÓRIA QUE VEIO DO ADMIN. Até a entrega 0080 ele subia em
 * Configurações da loja → Home e morava no `fb_configuracoes`; agora é do
 * painel, no "Sobre a marca". A migração
 * (`migration-scripts/video-da-historia-no-painel.ts`) traz ele UMA vez pras
 * duas versões — o publicado e o rascunho, se houver —, cada uma com o
 * texto que já tinha: o site segue igual, e o painel mostra o vídeo que
 * está no ar. Com vídeo já na home, ou sem vídeo no admin, não há o que
 * trazer (`null`).
 *
 * O do admin fica onde está: a loja de antes da 0080 lê ele, e a de depois
 * só quando o Medusa não manda o vídeo da home (um Medusa de antes).
 */
export function comVideoDoAdmin(
  h: HomeGuardada,
  video: VideoDaHistoria | null
): HomeGuardada | null {
  if (!video) return null
  if ([h.publicado, h.rascunho].some((v) => v?.conteudo.sobre?.video)) return null
  const comVideo = (v: VersaoDaHome): VersaoDaHome => ({
    ...v,
    conteudo: { ...v.conteudo, sobre: { ...conteudoDaSecao(v, "sobre"), video } },
  })
  return {
    ...h,
    publicado: comVideo(h.publicado),
    rascunho: h.rascunho ? comVideo(h.rascunho) : null,
  }
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
  // O banner tem regra própria (`faltandoNoBanner`): a arte de cada slide começado.
  banner: {},
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
  if (chave === "banner") return faltandoNoBanner(o)
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

/**
 * O que falta no banner: pelo menos um slide inteiro; em cada slide
 * começado, a arte (a descrição é opcional). Chaves como as dos grupos:
 * "slides.1.imagem", ou "slides" sem nenhum.
 */
function faltandoNoBanner(o: Record<string, unknown>): string[] {
  const itens = Array.isArray(o.slides) ? o.slides : []
  const faltando: string[] = []
  let inteiros = 0
  itens.forEach((item, i) => {
    const q = obj(item) ?? {}
    if (!Object.values(q).some(temTexto)) return
    const falta = lerImagem(q.imagem) ? [] : ["imagem"]
    for (const c of falta) faltando.push(`slides.${i}.${c}`)
    if (!falta.length) inteiros++
  })
  if (!inteiros && !faltando.length) faltando.push("slides")
  return faltando
}

/**
 * Os endereços de imagem que uma seção salva carrega — as do banner e a da
 * última chamada. A rota confere que cada um mora no armazenamento da loja
 * antes de gravar.
 */
export function urlsDaSecaoDaHome(chave: ChaveDaHome, secao: unknown): string[] {
  const o = obj(secao) ?? {}
  if (chave === "banner") {
    const slides = (Array.isArray(o.slides) ? o.slides : []) as SlideDoBanner[]
    return slides.flatMap((s) => [s.imagem, s.imagemCelular].filter((u): u is string => !!u))
  }
  if (chave === "fechamento")
    return [o.imagem, o.imagemCelular].filter((u): u is string => typeof u === "string" && !!u)
  if (chave === "sobre") {
    const v = obj(o.video) ?? {}
    return [v.url, v.poster].filter((u): u is string => typeof u === "string" && !!u)
  }
  return []
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
