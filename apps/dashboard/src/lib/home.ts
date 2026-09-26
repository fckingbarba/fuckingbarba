import type { Campo } from "@/lib/formulario"
import type { Fundo, LinhaDoHistorico, MedidaDoFundo, NoCatalogo } from "@/lib/produtos"

/**
 * A HOME, do lado do painel — o formato da resposta de `GET /dashboard/home`,
 * e o editor de cada seção: os campos e os nomes da tela.
 *
 * Quem decide o que está na home e o que se pode gravar é o backend
 * (`apps/backend/src/lib/home.ts` e `lib/painel/home.ts`); os tipos daqui
 * são cópia dos de lá — quem mudar um, muda o outro. Os nomes e as
 * descrições são os do protótipo.
 *
 * TUDO AQUI VAI PRO RASCUNHO. A loja só muda quando alguém aperta
 * "Publicar": é a diferença entre a home e a página do produto, que muda na
 * hora.
 */

export type IdDaSecaoDaHome =
  | "home.banner"
  | "home.trustbar"
  | "home.ofertas"
  | "home.colecao"
  | "home.hero"
  | "home.alta-performance"
  | "home.provas"
  | "home.amam"
  | "home.vitrine"
  | "home.sobre"
  | "home.fechamento"

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

/** O que está esperando o "Publicar": as seções que mudaram, e se a ordem mudou. */
export type Pendentes = { secoes: IdDaSecaoDaHome[]; ordem: boolean }

export type PaginaDaHome = {
  secoes: SecaoDaHome[]
  pendentes: Pendentes
  /** O último "Publicar" — `null` enquanto a home é a de fábrica. */
  publicacao: { em: string; quando: string; quem: string | null } | null
  catalogo: NoCatalogo[]
  /** Os produtos no site com caso de antes e depois: é deles que a "Prova social" mostra. */
  provas: ProdutoComCasos[]
  /** O endereço da loja, pro "Ver a home" (`null` sem `LOJA_URL` no Medusa). */
  noSite: string | null
  historico: LinhaDoHistorico[]
}

/**
 * Um produto com casos de antes e depois (os autorizados, das páginas dos
 * produtos): o nome, o tempo e a foto do "depois" de cada um. O mesmo de
 * `provasDaHome`, no backend (`lib/painel/home.ts`).
 */
export type ProdutoComCasos = {
  id: string
  nome: string
  casos: { nome: string; tempo: string; foto: string }[]
}

/**
 * Quantos casos a "Prova social" mostra, alternando os produtos — o mesmo
 * número da loja (`apps/loja/src/components/home/provas.tsx`).
 */
export const CASOS_NA_HOME = 8

/** Quantas mudanças: cada seção conta uma, e a ordem, uma. */
export const quantasMudancas = (p: Pendentes) => p.secoes.length + (p.ordem ? 1 : 0)

/** "Banner principal, Vitrine e a ordem das seções" — o que a faixa diz que vai pro site. */
export function oQueMudou(p: Pendentes): string {
  const nomes = [
    ...p.secoes.map((id) => SECOES_DA_HOME[id].nome),
    ...(p.ordem ? ["a ordem das seções"] : []),
  ]
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}` : (nomes[0] ?? "")
}

/* ── o editor de cada seção ─────────────────────────────────────────── */

export type DefinicaoDaSecaoDaHome = {
  nome: string
  descricao: string
  campos: Campo[]
}

const TITULO: Campo = { tipo: "texto", c: "titulo", rot: "Título" }

/**
 * A ARTE DE UM SLIDE DO BANNER — a caixa do banner na loja
 * (`apps/loja/src/components/home/slides-do-banner.tsx`): 1920 × 630 no
 * computador e 1080 × 1275 no celular, mais baixa desde 26/09 (era 1920 ×
 * 700 e 4 × 5). A loja PREENCHE a caixa com a arte, cortando pelo centro o
 * que sobra: o painel avisa quanto sai de cada borda.
 */
const MEDIDA_DA_ARTE: MedidaDoFundo = {
  cor: "papel",
  computador: [1920, 630],
  celular: [1080, 1275],
  // A arte de celular da Nuvemshop tem 800 de largura: serve (é a de um celular de 390 a 2x).
  minimo: { celular: 780 },
  mostra: "centro",
}

/**
 * AS FOTOS DE FUNDO DAS SEÇÕES DA HOME, e a foto da última chamada — a caixa
 * de cada seção na loja, medida no navegador com o texto e o catálogo de
 * hoje (24/09): o computador numa tela de 1440 a 2x, o celular numa de 390 a
 * 3x (a mesma conta das seções da página do produto, em `lib/produtos.ts`).
 * A vitrine cresce com o catálogo, e o corte dela muda junto.
 */
export const FUNDOS_DA_HOME: Partial<Record<IdDaSecaoDaHome, MedidaDoFundo>> = {
  "home.colecao": { cor: "papel", computador: [2880, 1503], celular: [1170, 2136] },
  "home.hero": { cor: "escuro", computador: [2880, 996], celular: [1170, 1743] },
  "home.alta-performance": { cor: "menta", computador: [2880, 939], celular: [1170, 2867] },
  "home.vitrine": { cor: "papel", computador: [2880, 2462], celular: [1170, 4108] },
  "home.sobre": { cor: "menta", computador: [2880, 1049], celular: [1170, 2710] },
}

const FOTO_DA_ULTIMA_CHAMADA: MedidaDoFundo = {
  cor: "escuro",
  computador: [2880, 984],
  celular: [1170, 1184],
}

export const SECOES_DA_HOME: Record<IdDaSecaoDaHome, DefinicaoDaSecaoDaHome> = {
  "home.banner": {
    nome: "Banner principal",
    descricao:
      "As artes do topo, até 5, que passam sozinhas. Sem arte, a home começa na barra de vantagens.",
    campos: [
      {
        tipo: "nota",
        texto:
          "Só imagem: a arte ocupa o banner inteiro, com o texto dentro dela — as mesmas da Nuvemshop servem. O primeiro slide é o que aparece primeiro, e o que o Google mede. Com mais de um, a loja mostra as bolinhas e as setas pra trocar, e para de passar sozinho quando a pessoa mexe.",
      },
      {
        tipo: "grupo",
        c: "slides",
        rot: "Slides, nesta ordem",
        item: "Slide",
        rotItem: "titulo",
        max: 5,
        campos: [
          {
            tipo: "imagens",
            c: "imagem",
            rot: "Arte",
            medida: MEDIDA_DA_ARTE,
            ajuda: "A do computador, deitada, e a do celular, em pé.",
            rodape:
              "JPG, PNG ou WebP. A arte preenche o banner: se vier noutra medida, a loja corta um pouco das bordas — deixe o texto longe delas. Sem a do celular, ele mostra a do computador, pequena.",
          },
          {
            tipo: "texto",
            c: "titulo",
            rot: "Descrição da arte (opcional)",
            exemplo: "Semana do Cliente: todo site por R$ 79",
            ajuda:
              "Pra quem não enxerga e pro Google: o que a arte diz. Não aparece na tela. Em branco, vale o nome do produto pra onde o slide leva.",
          },
          {
            tipo: "produto",
            c: "produto",
            rot: "Quem clica vai pra",
            vazio: "Todos os produtos",
          },
        ],
      },
      {
        tipo: "opcoes",
        c: "tempo",
        rot: "Passa pro próximo sozinho",
        opcoes: [
          ["0", "Não — só quando a pessoa troca"],
          ["5", "A cada 5 segundos"],
          ["7", "A cada 7 segundos"],
          ["10", "A cada 10 segundos"],
        ],
      },
    ],
  },
  "home.trustbar": {
    nome: "Barra de vantagens",
    descricao: "Frete, parcelamento e segurança, em uma linha.",
    campos: [
      {
        tipo: "nota",
        texto:
          "O frete e o parcelamento entram sozinhos, das configurações da loja — mudam lá. Aqui ficam as outras duas.",
      },
      {
        tipo: "grupo",
        c: "vantagens",
        rot: "As outras vantagens",
        item: "Vantagem",
        rotItem: "titulo",
        max: 2,
        campos: [
          { tipo: "texto", c: "titulo", rot: "Título", meia: true, exemplo: "Loja Segura" },
          { tipo: "texto", c: "detalhe", rot: "Detalhe", meia: true, exemplo: "Para suas compras" },
        ],
      },
    ],
  },
  "home.ofertas": {
    nome: "Ofertas relâmpago",
    descricao: "Contador que zera todo dia à meia-noite (horário de Brasília).",
    campos: [TITULO, { tipo: "nota", texto: "O botão leva pra todos os produtos." }],
  },
  "home.colecao": {
    nome: "Carrossel de coleção",
    descricao: "Faixa de produtos que rola de lado.",
    campos: [TITULO, { tipo: "nota", texto: "Os produtos vêm do catálogo." }],
  },
  "home.hero": {
    nome: "Bloco escuro de marca",
    descricao: "O título principal da página. Não desliga: é o título da home pro Google.",
    campos: [
      { tipo: "texto", c: "chapeu", rot: "Chapéu" },
      {
        tipo: "area",
        c: "titulo",
        rot: "Título",
        linhas: 2,
        ajuda: "É o título da home pro Google: diga o que a loja vende.",
      },
      {
        tipo: "grupo",
        c: "comparativo",
        rot: "Comparativo (opcional)",
        item: "Linha",
        rotItem: "rotulo",
        max: 3,
        minimo: 0,
        campos: [
          { tipo: "texto", c: "rotulo", rot: "Rótulo", meia: true, exemplo: "Ativos" },
          { tipo: "texto", c: "valor", rot: "Valor", meia: true, exemplo: "Alta concentração" },
        ],
      },
      { tipo: "texto", c: "chamada", rot: "Texto do botão", exemplo: "Ver produtos" },
      { tipo: "lista", c: "garantias", rot: "Garantias (opcional)", item: "Garantia", max: 4 },
      { tipo: "texto", c: "aviso", rot: "Aviso embaixo (opcional)" },
      {
        tipo: "nota",
        atencao: true,
        texto:
          "A conferir antes de publicar: o “+1.000.000 clientes satisfeitos” e o “Aprovado em estudo interno” vieram do protótipo, e ninguém confirmou. Alegação de cosmético tem regra (Anvisa); número do negócio, o concorrente aponta.",
      },
    ],
  },
  "home.alta-performance": {
    nome: "Alta performance",
    descricao: "Palco com um produto por vez e o texto editorial dele.",
    campos: [
      {
        tipo: "nota",
        texto:
          "Pelo menos 2 produtos diferentes: com um só, a seção sai da página. Nome, foto e preço vêm do catálogo.",
      },
      {
        tipo: "grupo",
        c: "produtos",
        rot: "Produtos no palco, nesta ordem",
        item: "Produto",
        rotItem: "nomeCurto",
        max: 5,
        minimo: 2,
        campos: [
          { tipo: "produto", c: "produto", rot: "Produto" },
          {
            tipo: "texto",
            c: "nomeCurto",
            rot: "Nome no palco (opcional)",
            ajuda: "Vazio, fica o nome do produto.",
          },
          { tipo: "texto", c: "titulo", rot: "O produto: título" },
          { tipo: "area", c: "texto", rot: "O produto: texto", linhas: 2 },
          {
            tipo: "texto",
            c: "usoTitulo",
            rot: "Modo de uso: título",
            exemplo: "3 passos · 2 minutos",
          },
          { tipo: "area", c: "usoTexto", rot: "Modo de uso: texto", linhas: 2 },
          { tipo: "lista", c: "passos", rot: "Os passos", item: "Passo", max: 3 },
          { tipo: "texto", c: "numero", rot: "Número em destaque", meia: true, exemplo: "90" },
          { tipo: "texto", c: "unidade", rot: "Unidade", meia: true, exemplo: "dias" },
          { tipo: "texto", c: "legenda", rot: "Legenda do número" },
          { tipo: "area", c: "resultado", rot: "O resultado", linhas: 2 },
        ],
      },
      {
        tipo: "nota",
        atencao: true,
        texto:
          "“90 dias”, “12 h” e afins são afirmações sobre o produto: fale de uso e de acabamento, não de eficácia clínica (Anvisa).",
      },
    ],
  },
  "home.provas": {
    nome: "Prova social",
    descricao:
      "Os casos de antes e depois das páginas dos produtos. Sem caso nenhum, a seção não aparece.",
    campos: [
      { tipo: "texto", c: "tag", rot: "Chapéu", exemplo: "Resultados reais" },
      TITULO,
      {
        tipo: "nota",
        texto: `Os casos são os mesmos do “Antes e depois” das páginas dos produtos: um caso vale na página dele e aqui. A home mostra até ${CASOS_NA_HOME}, alternando os produtos, e cada um leva pro produto que a pessoa usou. Caso novo entra pela página do produto (Produtos → o produto → Antes e depois), com a autorização por escrito.`,
      },
    ],
  },
  "home.amam": {
    nome: "Esteira de avaliações",
    descricao: "Avaliações passando de lado. Só aparece com avaliação de verdade cadastrada.",
    campos: [TITULO],
  },
  "home.vitrine": {
    nome: "Vitrine",
    descricao: "Grade com o catálogo inteiro.",
    campos: [
      {
        tipo: "texto",
        c: "titulo",
        rot: "Título",
        ajuda:
          "“Os mais pedidos” só é verdade quando a grade estiver na ordem de venda — hoje não está.",
      },
      { tipo: "nota", texto: "Todo produto publicado entra sozinho." },
    ],
  },
  "home.sobre": {
    nome: "Sobre a marca",
    descricao: "A história, com o vídeo (ou a foto de um produto) e números.",
    campos: [
      TITULO,
      {
        tipo: "lista",
        c: "paragrafos",
        rot: "Parágrafos",
        item: "Parágrafo",
        grande: true,
        max: 4,
      },
      {
        tipo: "texto",
        c: "grito",
        rot: "Frase em destaque (opcional)",
        ajuda: "Entra depois do primeiro parágrafo.",
      },
      {
        tipo: "grupo",
        c: "numeros",
        rot: "Números (opcional)",
        item: "Número",
        rotItem: "rotulo",
        max: 4,
        minimo: 0,
        campos: [
          { tipo: "texto", c: "valor", rot: "Número", meia: true, exemplo: "2016" },
          { tipo: "texto", c: "rotulo", rot: "Legenda", meia: true, exemplo: "Ano de fundação" },
        ],
      },
      {
        tipo: "nota",
        atencao: true,
        texto:
          "A conferir antes de publicar: o ano de fundação e o “+1M clientes impactados” vieram do protótipo, e ninguém confirmou.",
      },
      {
        tipo: "video",
        c: "video",
        rot: "Vídeo da história (opcional)",
        uso: "historia",
        ajuda:
          "Entra no lugar da foto. Toca sozinho, sem som, quando a pessoa chega na seção; se o vídeo tiver som, aparece um botão pra ligar. Em pé ou deitado: a seção se ajeita a ele.",
      },
      {
        tipo: "produto",
        c: "fotoDe",
        rot: "Foto da seção: a do produto",
        vazio: "Sem foto",
        ajuda: "Aparece quando não tem vídeo.",
      },
    ],
  },
  "home.fechamento": {
    nome: "Última chamada",
    descricao: "Faixa de foto com a chamada final e as garantias.",
    campos: [
      { tipo: "texto", c: "chapeu", rot: "Chapéu" },
      { tipo: "area", c: "titulo", rot: "Título", linhas: 2 },
      { tipo: "texto", c: "chamada", rot: "Texto do botão", exemplo: "Ver todos os produtos" },
      {
        tipo: "imagens",
        c: "imagem",
        rot: "Foto da faixa (opcional)",
        medida: FOTO_DA_ULTIMA_CHAMADA,
        ajuda:
          "A foto fica atrás do texto, com o degradê escuro por cima — é ele que garante a leitura. O assunto da foto vai na direita: a esquerda fica quase preta.",
      },
      {
        tipo: "produto",
        c: "fotoDe",
        rot: "Sem foto própria, a do produto",
        vazio: "Sem foto (fica no escuro)",
      },
      {
        tipo: "nota",
        texto: "As garantias (frete e parcelamento) entram sozinhas, das configurações da loja.",
      },
    ],
  },
}

/* ── o que a equipe mudou ─────────────────────────────────────────────── */

const MUDOU: Record<string, string> = {
  ligar: "ligou",
  desligar: "desligou",
  subir: "subiu",
  descer: "desceu",
}

/** A linha do histórico em frase: "Ana editou Vitrine" · "no rascunho". */
export function fraseDoHistoricoDaHome(h: LinhaDoHistorico): { titulo: string; detalhe: string } {
  const secao =
    h.secao && h.secao in SECOES_DA_HOME
      ? SECOES_DA_HOME[h.secao as IdDaSecaoDaHome].nome
      : "uma seção"
  switch (h.acao) {
    case "editou-secao-da-home":
      return {
        titulo: `${h.quem} editou ${secao}`,
        detalhe:
          h.fundo === true
            ? "no rascunho, com imagem de fundo"
            : h.fundo === false
              ? "no rascunho, sem imagem de fundo"
              : "no rascunho",
      }
    case "mudou-secao-da-home":
      return {
        titulo: `${h.quem} ${MUDOU[h.mudanca ?? ""] ?? "mexeu em"} ${secao}`,
        detalhe: "no rascunho",
      }
    case "publicou-home":
      return { titulo: `${h.quem} publicou a home`, detalhe: "foi pro site" }
    case "desfez-home":
      return { titulo: `${h.quem} desfez o rascunho`, detalhe: "voltou ao que está no site" }
    default:
      return { titulo: `${h.quem} mudou a home`, detalhe: "" }
  }
}
