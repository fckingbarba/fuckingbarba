/**
 * OS PRODUTOS, do lado do painel — o formato das respostas, e o editor de
 * cada seção da página do produto: os campos, os nomes da tela e a medida
 * de cada imagem de fundo.
 *
 * Quem decide o que está no produto e o que se pode gravar é o backend
 * (`apps/backend/src/lib/painel/produtos.ts` e `lib/pdp.ts`); os tipos
 * daqui são cópia dos de lá — quem mudar um, muda o outro. Os NOMES das
 * seções são os do protótipo: servem pra qualquer produto (Benefícios,
 * Linha do tempo…); o título que aparece no site é um campo de cada um.
 * Os campos (o tipo `Campo`, e a ida e volta do formulário) moram em
 * `lib/formulario.ts`, que a home usa também.
 */

import type { Campo } from "@/lib/formulario"

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
  preco: number | null
  /** `null`: não controla estoque. */
  estoque: number | null
}

export const FILTROS_DE_PRODUTO = [
  { id: "todos", nome: "Todos" },
  { id: "publicado", nome: "No site" },
  { id: "rascunho", nome: "Rascunhos" },
  { id: "esgotado", nome: "Esgotados" },
] as const
export type FiltroDeProduto = (typeof FILTROS_DE_PRODUTO)[number]["id"]

export const ehFiltroDeProduto = (v: unknown): v is FiltroDeProduto =>
  typeof v === "string" && FILTROS_DE_PRODUTO.some((f) => f.id === v)

export type ListaDeProdutos = {
  produtos: LinhaDoProduto[]
  contagem: Record<FiltroDeProduto, number>
  filtro: FiltroDeProduto
}

export const NOME_DA_SITUACAO: Record<Situacao, string> = {
  publicado: "No site",
  rascunho: "Rascunho",
  esgotado: "Esgotado",
}

export type Fundo = { imagem: string; imagemCelular?: string; veu?: number }

export type IdDaSecao =
  | "produto.dobra"
  | "produto.promessa"
  | "produto.antes-depois"
  | "produto.tempo"
  | "produto.faixa"
  | "produto.rotina"
  | "produto.funciona"
  | "produto.versus"
  | "produto.quem"
  | "produto.duvidas"
  | "produto.avaliacoes"
  | "produto.relacionados"

export type SecaoDaPagina = {
  id: IdDaSecao
  ligada: boolean
  fixa: boolean
  vazia: boolean
  valores: Record<string, unknown> | null
  fundo: Fundo | null
  aceitaFundo: boolean
}

export type Caixa = { modo: "unidades" | "junto"; nota: string; junto: string[] }

/** Um vídeo da página: o arquivo, a capa (o primeiro quadro), as medidas e a duração (s). */
export type VideoDaPdp = {
  url: string
  poster: string
  largura: number
  altura: number
  duracao: number
  /** O nome do cartão na faixa "Vê na prática" ("Como aplicar"). Opcional. */
  titulo?: string
}

/** O nome de um vídeo do "Vê na prática": até 40 caracteres (o mesmo limite do backend). */
export const LIMITE_DO_TITULO_DO_VIDEO = 40

/**
 * Uma foto da galeria (do Medusa) ou um vídeo da faixa "Vê na prática" (do
 * `fb_pdp`). A lista vem com as fotos primeiro e os vídeos depois.
 */
export type ItemDaGaleria = { tipo: "foto"; url: string } | ({ tipo: "video" } & VideoDaPdp)

export type DetalheDoProduto = LinhaDoProduto & {
  subtitulo: string
  descricao: string
  peso: number | null
  categoriaId: string | null
  fotos: string[]
  /** As fotos da galeria (a primeira é a capa) e depois os vídeos do "Vê na prática". */
  galeria: ItemDaGaleria[]
  degraus: { unidades: number; total: number }[]
  caixa: Caixa
  secoes: SecaoDaPagina[]
  podeEditar: boolean
}

export type NoCatalogo = {
  handle: string
  nome: string
  foto: string | null
  preco: number | null
  esgotado: boolean
}

export type Categoria = { id: string; nome: string }

export type PaginaDoProduto = {
  produto: DetalheDoProduto
  catalogo: NoCatalogo[]
  categorias: Categoria[]
  /** A página na loja, pro "Ver no site" (`null` sem `LOJA_URL` no Medusa). */
  noSite: string | null
  /** O que a equipe mudou por aqui, o mais novo primeiro. */
  historico: LinhaDoHistorico[]
}

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
}

const MUDOU: Record<string, string> = {
  ligar: "ligou",
  desligar: "desligou",
  subir: "subiu",
  descer: "desceu",
}

/** A linha do histórico em frase: "Ana editou Benefícios" · "com imagem de fundo". */
export function fraseDoHistorico(h: LinhaDoHistorico): { titulo: string; detalhe: string } {
  const secao = h.secao && h.secao in SECOES ? SECOES[h.secao as IdDaSecao].nome : "uma seção"
  switch (h.acao) {
    case "editou-secao":
      return {
        titulo: `${h.quem} editou ${secao}`,
        detalhe:
          h.fundo === true ? "com imagem de fundo" : h.fundo === false ? "sem imagem de fundo" : "",
      }
    case "mudou-secao":
      return { titulo: `${h.quem} ${MUDOU[h.mudanca ?? ""] ?? "mexeu em"} ${secao}`, detalhe: "" }
    case "mudou-caixa":
      return {
        titulo: `${h.quem} mudou a caixa de compra`,
        detalhe: h.modo === "junto" ? "Leve junto" : "Quantas unidades",
      }
    case "editou-textos":
      return { titulo: `${h.quem} mudou o subtítulo ou a categoria`, detalhe: "" }
    case "publicou":
      return { titulo: `${h.quem} publicou no site`, detalhe: "" }
    case "mudou-galeria": {
      const video = h.tipo === "video"
      const onde = video ? "do Vê na prática" : "da galeria"
      if (h.galeria === "incluir")
        return {
          titulo: `${h.quem} pôs ${video ? "um vídeo no Vê na prática" : "uma foto na galeria"}`,
          detalhe: "",
        }
      if (h.galeria === "tirar")
        return { titulo: `${h.quem} tirou ${video ? "um vídeo" : "uma foto"} ${onde}`, detalhe: "" }
      if (h.galeria === "titular")
        return { titulo: `${h.quem} mudou o nome de um vídeo do Vê na prática`, detalhe: "" }
      return {
        titulo: `${h.quem} mudou a ordem ${video ? "dos vídeos" : "da galeria"}`,
        detalhe: "",
      }
    }
    default:
      return { titulo: `${h.quem} mudou o produto`, detalhe: "" }
  }
}

/** O que uma ação do produto devolve pra tela. */
export type Resultado = { ok: boolean; texto: string; faltando?: string[] }

/** Um id de produto do Medusa: `prod_` e um ULID. Nada mais vai pra API. */
export const ehIdDeProduto = (v: string) => /^prod_[0-9A-Z]{10,40}$/.test(v)

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
export const reais = (v: number) => REAIS.format(v)

/** A linha embaixo de "1 unidade", no cartão: duas linhas, no máximo (a mesma do backend). */
export const LIMITE_DA_NOTA = 48
/**
 * O piso do frete grátis de hoje — pra prévia da caixa de compra mostrar onde
 * a tarja aparece. A loja lê o dela da política de frete (`frasesDoFrete`, em
 * `apps/loja/src/lib/configuracoes.ts`); mudou lá, a prévia daqui erra a tarja.
 */
export const PISO_DO_FRETE_GRATIS = 149.9

/* ── o editor de seção ─────────────────────────────────────────────────── */

/**
 * A medida ideal da foto de fundo de uma seção, em px — computador e celular.
 *
 * NÃO É UM NÚMERO REDONDO: é a caixa da seção na loja, medida no navegador
 * com o texto de hoje (24/09): o computador numa tela de 1440 com
 * densidade 2x (2880 de largura; de 1280 pra cima a altura da seção não
 * muda mais), o celular numa tela de 390 com densidade 3x (1170). A loja
 * cobre a caixa (`object-fit: cover`, com o ponto de foco a 40% do topo):
 * foto nessa proporção aparece inteira; em outra, as bordas são cortadas.
 * Com mais texto a seção cresce, e o corte come as laterais.
 *
 * A troca pra foto do celular acontece no corte de cada seção, e não num
 * número só (`CELULAR_ATE`, em `apps/loja/src/components/secoes.tsx`).
 */
export type MedidaDoFundo = {
  /** A cor da seção — o véu que fica por cima da foto. */
  cor: "escuro" | "menta" | "papel" | "amarelo"
  computador: readonly [number, number]
  celular: readonly [number, number]
}

/** A cor do véu, em RGB (a mesma de `apps/loja/src/estilos/fundo.css`). */
export const RGB_DO_VEU: Record<MedidaDoFundo["cor"], string> = {
  escuro: "7 10 9",
  menta: "79 228 182",
  papel: "255 255 255",
  amarelo: "255 216 77",
}

export type DefinicaoDaSecao = {
  nome: string
  descricao: string
  /** Vazio: a seção não se edita aqui (o topo; a que chega noutra entrega). */
  campos: Campo[]
  fundo?: MedidaDoFundo
  /** Por que ela pode não aparecer mesmo ligada. */
  soCom?: string
  /** Onde o *asterisco* vira destaque na loja (o `Realce` de lá) — só nesses campos. */
  realce?: string
}

const TITULO: Campo = { tipo: "texto", c: "titulo", rot: "Título" }

export const SECOES: Record<IdDaSecao, DefinicaoDaSecao> = {
  "produto.dobra": {
    nome: "Topo: fotos, preço e compra",
    descricao: "A primeira tela: galeria, preço e o botão de comprar. Fica sempre no topo.",
    campos: [],
  },
  "produto.promessa": {
    nome: "Benefícios",
    descricao: "O que o produto faz, em lista, com uma ressalva no fim.",
    campos: [
      { tipo: "texto", c: "chapeu", rot: "Chapéu", ajuda: "A linha pequena em cima do título." },
      TITULO,
      { tipo: "lista", c: "itens", rot: "Benefícios", item: "Benefício" },
      {
        tipo: "area",
        c: "rodape",
        rot: "Ressalva (opcional)",
        ajuda: "O que o produto não faz, ou do que o resultado depende.",
      },
    ],
    fundo: { cor: "escuro", computador: [2880, 890], celular: [1170, 1644] },
    realce: "no título",
  },
  "produto.antes-depois": {
    nome: "Antes e depois",
    descricao: "Casos de clientes, com a foto de antes e a de depois. Até 3.",
    campos: [
      {
        tipo: "texto",
        c: "titulo",
        rot: "Título (opcional)",
        exemplo: "Antes e depois, sem truque",
        ajuda: "Vazio, fica o de sempre: “Antes e depois, sem truque”.",
      },
      {
        tipo: "nota",
        atencao: true,
        texto:
          "Foto de rosto só com a autorização POR ESCRITO da pessoa (LGPD) — “mandou no WhatsApp” não é autorização pra publicar. A mesma pessoa nas duas fotos, mesmo ângulo, sem filtro. No site pode; em anúncio (Meta, Google), não.",
      },
      {
        tipo: "grupo",
        c: "casos",
        rot: "Casos",
        item: "Caso",
        rotItem: "nome",
        max: 3,
        campos: [
          { tipo: "texto", c: "nome", rot: "Nome", meia: true, exemplo: "André B." },
          { tipo: "texto", c: "tempo", rot: "Tempo de uso", meia: true, exemplo: "90 dias" },
          { tipo: "foto", c: "antes", rot: "Antes", meia: true },
          { tipo: "foto", c: "depois", rot: "Depois", meia: true },
          { tipo: "area", c: "texto", rot: "O que a pessoa disse (opcional)", linhas: 2 },
          {
            tipo: "marcar",
            c: "autorizou",
            rot: "Tenho a autorização por escrito dessa pessoa pra publicar as fotos",
          },
        ],
      },
    ],
  },
  "produto.tempo": {
    nome: "Linha do tempo",
    descricao: "Em quanto tempo o resultado aparece, etapa por etapa.",
    campos: [
      TITULO,
      {
        tipo: "grupo",
        c: "passos",
        rot: "Etapas",
        item: "Etapa",
        rotItem: "quando",
        campos: [
          { tipo: "texto", c: "quando", rot: "Quando", meia: true, exemplo: "2 semanas" },
          { tipo: "texto", c: "titulo", rot: "Título", meia: true },
          { tipo: "area", c: "texto", rot: "Texto" },
          { tipo: "marcar", c: "alvo", rot: "É o marco da página (uma etapa só)", unico: true },
        ],
      },
      { tipo: "area", c: "aviso", rot: "Aviso embaixo (opcional)" },
    ],
    fundo: { cor: "menta", computador: [2880, 820], celular: [1170, 2448] },
  },
  "produto.faixa": {
    nome: "Faixa com foto",
    descricao: "Faixa larga com a foto de um produto, uma frase e o botão que volta pro topo.",
    campos: [
      { tipo: "texto", c: "chapeu", rot: "Chapéu" },
      TITULO,
      { tipo: "area", c: "texto", rot: "Texto" },
      { tipo: "texto", c: "chamada", rot: "Texto do botão", exemplo: "Quero o meu" },
      { tipo: "produto", c: "fotoDe", rot: "A foto é a do produto", comEste: true },
    ],
    realce: "no título",
  },
  "produto.rotina": {
    nome: "Rotina com outros produtos",
    descricao: "Os produtos que completam este, com o passo de cada um.",
    campos: [
      TITULO,
      { tipo: "nota", texto: "Este produto entra sozinho na rotina — não repita ele aqui." },
      {
        tipo: "grupo",
        c: "itens",
        rot: "Produtos da rotina",
        item: "Produto",
        rotItem: "passo",
        campos: [
          { tipo: "produto", c: "handle", rot: "Produto" },
          { tipo: "texto", c: "passo", rot: "Passo", exemplo: "Passo 1 · limpa" },
          { tipo: "texto", c: "para", rot: "Pra que serve na rotina" },
        ],
      },
    ],
    fundo: { cor: "papel", computador: [2880, 1010], celular: [1170, 2568] },
  },
  "produto.funciona": {
    nome: "Como funciona e modo de uso",
    descricao: "O que o produto faz e como usar, lado a lado.",
    campos: [
      { tipo: "texto", c: "comoTitulo", rot: "Título de “como funciona”" },
      { tipo: "lista", c: "comoTexto", rot: "Parágrafos", item: "Parágrafo", grande: true },
      {
        tipo: "produto",
        c: "comoFotoDe",
        rot: "Foto de “como funciona”: a do produto",
        comEste: true,
      },
      { tipo: "texto", c: "usoTitulo", rot: "Título do modo de uso" },
      { tipo: "lista", c: "usoPassos", rot: "Passos", item: "Passo" },
      { tipo: "produto", c: "usoFotoDe", rot: "Foto do modo de uso: a do produto", comEste: true },
      {
        tipo: "video",
        c: "usoVideo",
        rot: "Vídeo do modo de uso (opcional)",
        ajuda:
          "Com vídeo, ele entra no lugar da foto do modo de uso: mudo, em loop, quando aparece na tela.",
      },
      { tipo: "area", c: "dica", rot: "Dica (opcional)" },
    ],
    fundo: { cor: "menta", computador: [2880, 1542], celular: [1170, 3273] },
    realce: "nos parágrafos, nos passos e na dica",
  },
  "produto.versus": {
    nome: "Comparação",
    descricao: "Este produto ao lado de um genérico sem marca — nunca de concorrente.",
    campos: [
      TITULO,
      { tipo: "texto", c: "nomeDeles", rot: "Com o que compara", meia: true },
      { tipo: "texto", c: "descricaoDeles", rot: "Descrição dele", meia: true },
      { tipo: "lista", c: "nosso", rot: "O nosso", item: "Linha" },
      {
        tipo: "lista",
        c: "deles",
        rot: "O outro",
        item: "Linha",
        ajuda: "Na mesma ordem do nosso: cada linha compara com a do lado.",
      },
    ],
    fundo: { cor: "amarelo", computador: [2880, 796], celular: [1170, 1821] },
  },
  "produto.quem": {
    nome: "Pra quem é",
    descricao: "Duas colunas: pra quem é e pra quem não é.",
    campos: [
      TITULO,
      { tipo: "lista", c: "sim", rot: "É pra você se", item: "Linha" },
      { tipo: "lista", c: "nao", rot: "Não é pra você se", item: "Linha" },
    ],
    fundo: { cor: "papel", computador: [2880, 768], celular: [1170, 1614] },
  },
  "produto.duvidas": {
    nome: "Perguntas frequentes",
    descricao: "As perguntas e respostas; o Google lê a mesma lista.",
    campos: [
      TITULO,
      {
        tipo: "grupo",
        c: "perguntas",
        rot: "Perguntas",
        item: "Pergunta",
        rotItem: "pergunta",
        campos: [
          { tipo: "texto", c: "pergunta", rot: "Pergunta" },
          {
            tipo: "paragrafos",
            c: "resposta",
            rot: "Resposta",
            ajuda: "Uma linha em branco separa os parágrafos.",
          },
        ],
      },
    ],
    fundo: { cor: "menta", computador: [2880, 1342], celular: [1170, 2232] },
  },
  "produto.avaliacoes": {
    nome: "Avaliações",
    descricao: "As avaliações de quem comprou.",
    campos: [],
    soCom: "Só aparece quando o produto tem avaliação de verdade cadastrada.",
  },
  "produto.relacionados": {
    nome: "Produtos relacionados",
    descricao: "O resto do catálogo, começando pela mesma categoria. Os produtos entram sozinhos.",
    campos: [
      {
        tipo: "texto",
        c: "titulo",
        rot: "Título",
        exemplo: "Quem leva este, leva junto",
        ajuda: "Vazio, fica o de sempre: “Quem leva este, leva junto”.",
      },
    ],
  },
}

/* ── a imagem de fundo ─────────────────────────────────────────────────── */

export type Lado = "computador" | "celular"

/** Pra que serve a imagem que sobe: o fundo (um lado), a galeria, a capa de um vídeo, um caso. */
export type UsoDaImagem = Lado | "galeria" | "poster" | "caso"

/**
 * A medida máxima que sobe, por uso — a mesma do backend (`MEDIDA_MAXIMA`,
 * em `apps/backend/src/lib/imagens.ts`): o navegador já encolhe até aqui
 * antes de mandar, e o servidor confere de novo.
 */
export const MEDIDA_MAXIMA: Record<UsoDaImagem, { largura: number; altura: number }> = {
  computador: { largura: 2880, altura: 2400 },
  celular: { largura: 1290, altura: 4000 },
  galeria: { largura: 2000, altura: 2000 },
  poster: { largura: 1920, altura: 1920 },
  caso: { largura: 1200, altura: 1400 },
}

/** Abaixo disso, a foto estica na tela e fica borrada (1920: tela de 1280 a 1,5x; 828: celular de 414 a 2x). */
const MINIMO: Record<Lado, number> = { computador: 1920, celular: 828 }

/** Uma imagem num lado do fundo: a que está gravada, ou a que acabou de subir. */
export type ImagemDoFundo = {
  url: string
  largura?: number
  altura?: number
  bytes?: number
}

/**
 * O que dizer da foto escolhida, antes de salvar: deitada ou em pé no lado
 * errado, pequena demais, e quanto dela fica de fora da seção. O corte é o
 * da loja: `cover`, com o foco a 40% do topo — o mesmo que o quadro da
 * prévia mostra.
 */
export function avisosDaImagem(
  lado: Lado,
  medida: MedidaDoFundo,
  largura: number,
  altura: number
): string[] {
  const avisos: string[] = []
  const [idealL, idealA] = medida[lado]
  if (lado === "computador" && altura > largura)
    avisos.push("Essa é em pé. Pro computador, use uma deitada: a seção é larga e baixa.")
  if (lado === "celular" && largura > altura)
    avisos.push("Essa é deitada. Pro celular, use uma em pé: deitada, ela perde os lados.")
  if (largura < MINIMO[lado])
    avisos.push(
      `Pequena (${largura} × ${altura}): fica borrada na tela. O ideal é ${idealL} × ${idealA}.`
    )
  const daFoto = largura / altura
  const daSecao = idealL / idealA
  if (daFoto < daSecao * 0.85) {
    const parte = Math.round((daFoto / daSecao) * 100)
    avisos.push(
      `Mais alta que a seção: aparece uma faixa de ${parte}% da altura — a do quadro acima.`
    )
  } else if (daFoto > daSecao / 0.85) {
    const parte = Math.round((daSecao / daFoto) * 100)
    avisos.push(`Mais larga que a seção: aparece ${parte}% da largura, sem as laterais.`)
  }
  return avisos
}

/** "2880 × 890 px" */
export const medidaEmPx = ([l, a]: readonly [number, number]) => `${l} × ${a} px`

export const tamanhoDoArquivo = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

/** O véu: de 40 a 100 (100 = a cor da seção inteira, sem foto à vista). O padrão da loja é 85. */
export const VEU = { minimo: 40, maximo: 100, passo: 5, padrao: 85 } as const

/* ── as fotos e os vídeos da galeria, e as fotos dos casos ─────────────── */

/**
 * A foto da galeria: o palco da dobra é QUADRADO (620 de largura no
 * computador, a 2x) e mostra a foto inteira, com faixa branca se ela não
 * for quadrada.
 */
export const MEDIDA_DA_GALERIA = [1200, 1200] as const
/** A foto de um caso de antes e depois: o quadro é 6 × 7, em pé, e corta o que sobra. */
export const MEDIDA_DO_CASO = [900, 1050] as const
/**
 * O vídeo do "Vê na prática": o cartão e a janela que abre são EM PÉ (9:16),
 * como o vídeo de celular. Em pé ocupa tudo; quadrado ou deitado toca inteiro
 * na janela, com faixa escura em cima e embaixo, e o cartão mostra o meio.
 */
export const MEDIDA_DO_VIDEO_DA_GALERIA = [1080, 1920] as const
/** O vídeo do modo de uso: a caixa é 16:9, deitada, e corta o que sobra. */
export const MEDIDA_DO_VIDEO_DO_USO = [1920, 1080] as const

/** Até 50 MB (o mesmo limite do vídeo da home, no admin); acima de 20, pesa no celular. */
export const VIDEO = { maximoMB: 50, pesadoMB: 20, idealSegundos: 30 } as const

/** Fotos na galeria e vídeos no "Vê na prática" (os mesmos limites do backend). */
export const LIMITES_DA_GALERIA = { fotos: 12, videos: 4 } as const

/** O que dizer da foto da galeria ou do caso, antes de salvar. */
export function avisosDaFoto(uso: "galeria" | "caso", largura: number, altura: number): string[] {
  const avisos: string[] = []
  const [l, a] = uso === "galeria" ? MEDIDA_DA_GALERIA : MEDIDA_DO_CASO
  if (largura < l * 0.66)
    avisos.push(`Pequena (${largura} × ${altura}): fica borrada na tela. O ideal é ${l} × ${a}.`)
  const daFoto = largura / altura
  const doQuadro = l / a
  if (uso === "galeria" && Math.abs(daFoto - 1) > 0.05)
    avisos.push("Não é quadrada: na página ela aparece inteira, com faixa branca dos lados.")
  if (uso === "caso" && daFoto > doQuadro / 0.85)
    avisos.push("Mais larga que o quadro (6 × 7, em pé): as laterais saem.")
  if (uso === "caso" && daFoto < doQuadro * 0.85)
    avisos.push("Mais alta que o quadro (6 × 7): aparece a faixa do meio.")
  return avisos
}

/** O que dizer do vídeo, antes de ele entrar: o peso, a duração e o formato pro lugar dele. */
export function avisosDoVideo(
  onde: "galeria" | "uso",
  v: { largura: number; altura: number; duracao: number; bytes?: number }
): string[] {
  const avisos: string[] = []
  if (v.bytes && v.bytes > VIDEO.pesadoMB * 1024 * 1024)
    avisos.push(
      `Pesado (${tamanhoDoArquivo(v.bytes)}): quem abre no celular espera ele carregar. Se der, comprima.`
    )
  if (v.duracao > VIDEO.idealSegundos)
    avisos.push(
      `Tem ${Math.round(v.duracao)} segundos. Na página, até ${VIDEO.idealSegundos} funciona melhor.`
    )
  const proporcao = v.largura / v.altura
  if (onde === "galeria" && proporcao > 0.7)
    avisos.push(
      "Não é em pé (9:16): na janela do Vê na prática ele toca inteiro, com faixa escura em cima e embaixo, e o cartão mostra só o meio."
    )
  if (onde === "uso" && proporcao < 1.5)
    avisos.push("Não é deitado (16:9): na caixa do modo de uso aparece só a faixa do meio.")
  return avisos
}

/** "0:12" */
export const duracaoCurta = (segundos: number) => {
  const s = Math.max(1, Math.round(segundos))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
