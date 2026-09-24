import type { Campo } from "@/lib/formulario"
import type { LinhaDoHistorico, NoCatalogo } from "@/lib/produtos"

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
}

/** O que está esperando o "Publicar": as seções que mudaram, e se a ordem mudou. */
export type Pendentes = { secoes: IdDaSecaoDaHome[]; ordem: boolean }

export type PaginaDaHome = {
  secoes: SecaoDaHome[]
  pendentes: Pendentes
  /** O último "Publicar" — `null` enquanto a home é a de fábrica. */
  publicacao: { em: string; quando: string; quem: string | null } | null
  catalogo: NoCatalogo[]
  /** O endereço da loja, pro "Ver a home" (`null` sem `LOJA_URL` no Medusa). */
  noSite: string | null
  historico: LinhaDoHistorico[]
}

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

export const SECOES_DA_HOME: Record<IdDaSecaoDaHome, DefinicaoDaSecaoDaHome> = {
  "home.banner": {
    nome: "Banner principal",
    descricao: "A peça grande do topo: a campanha da vez, com o preço e a foto do produto.",
    campos: [
      {
        tipo: "nota",
        texto:
          "É a primeira coisa que aparece, e o que o Google mede primeiro. O preço e a foto saem do produto escolhido: mudou o preço, o banner muda junto. Produto sem foto, sem preço ou fora do site tira o banner da página.",
      },
      {
        tipo: "texto",
        c: "chapeu",
        rot: "Chapéu",
        exemplo: "Semana do Cliente",
        ajuda: "A linha pequena em cima do título.",
      },
      TITULO,
      { tipo: "texto", c: "chamada", rot: "Texto do botão", meia: true, exemplo: "Comprar agora" },
      {
        tipo: "produto",
        c: "produto",
        rot: "Produto da campanha",
        meia: true,
        ajuda: "O botão põe ele na sacola.",
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
    descricao: "Só aparece quando existe promoção com data de fim no catálogo.",
    campos: [
      TITULO,
      { tipo: "nota", texto: "Os produtos entram sozinhos: os que têm promoção com data de fim." },
    ],
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
    descricao: "Casos de antes e depois de clientes. Só aparece quando existe caso cadastrado.",
    campos: [
      { tipo: "texto", c: "tag", rot: "Chapéu", exemplo: "Resultados reais" },
      TITULO,
      {
        tipo: "nota",
        texto:
          "Os casos vão ser os mesmos do “Antes e depois” das páginas dos produtos — chega na próxima entrega.",
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
    descricao: "A história, com foto — ou o vídeo, quando tem — e números.",
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
        tipo: "produto",
        c: "fotoDe",
        rot: "Foto da seção: a do produto",
        vazio: "Sem foto",
        ajuda:
          "Com o vídeo da história (sobe no admin, em Configurações da loja → Home), a foto vira a capa dele.",
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
        tipo: "produto",
        c: "fotoDe",
        rot: "A foto do fundo: a do produto",
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
      return { titulo: `${h.quem} editou ${secao}`, detalhe: "no rascunho" }
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
