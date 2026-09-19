/**
 * Constantes do site: identidade, contato e navegação.
 *
 * A regra continua valendo — preço, estoque e promoção vêm do Medusa, nunca
 * de constante aqui. O que mora neste arquivo é o que não é dado de loja: o
 * nome, as URLs públicas, os canais de atendimento e o mapa de links que o
 * cabeçalho, o menu e o rodapé leem. Uma exceção declarada: o piso do frete
 * grátis, que ainda é número fixo até virar regra de promoção no Medusa
 * (fase 5) — está marcado lá embaixo.
 */

/**
 * Destinos que ainda não têm página. Link morto é pior que página honesta:
 * `/em-breve` responde 200 com `noindex` e diz o que está faltando, em vez de
 * jogar o visitante num 404 por algo que a gente ainda não construiu.
 * Conforme cada página nascer, troque o valor aqui — o rodapé se ajusta.
 */
export const EM_BREVE = "/em-breve"

export const site = {
  nome: "FuckingBarba",
  descricao:
    "Cosméticos masculinos pra barba e cabelo: óleo, balm, shampoo, spray matte e kits. Feito pra rotina de verdade.",
  assinatura: "Cosméticos masculinos de alta performance. Ousamos, criamos, cuidamos.",
  /** Domínio final. Em preview/staging a Vercel injeta a própria URL. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  /** Loja atual na Nuvemshop — some na fase 6 (virada). */
  lojaAtualUrl: process.env.NEXT_PUBLIC_LOJA_ATUAL_URL,
  instagram: "https://www.instagram.com/fuckingbarba",
  /** Categorias de topo = URLs de primeiro nível. Mesmos handles do Medusa. */
  categorias: [
    { handle: "barba", nome: "Barba", menu: "Para barba" },
    { handle: "cabelo", nome: "Cabelo", menu: "Para cabelo" },
    { handle: "kits", nome: "Kits", menu: "Kits" },
  ] as const,
} as const

/**
 * PROVISÓRIO — piso do frete grátis, em reais.
 *
 * Aparece na esteira de avisos, no pé do menu e (na fase 3) na barra de
 * progresso da sacola. Hoje é constante porque ainda não existe a promoção no
 * Medusa; na fase 5 vira regra de lá e este valor sai daqui, senão um dia a
 * loja cobra R$ 129,90 e o site continua prometendo R$ 149,90.
 */
export const FRETE_GRATIS_ACIMA_DE = 149.9

/**
 * Atendimento. Os valores abaixo são de exemplo e precisam virar os reais
 * antes da virada (fase 6) — eles aparecem no rodapé de toda página e o
 * Google lê esse bloco como dado de contato do negócio.
 */
export const contato = {
  whatsapp: { numero: "5500000000000", exibicao: "(00) 00000-0000" },
  email: "contato@exemplo.com.br",
  horario: ["Atendimento de segunda a sexta,", "das 09:00 às 18:00."],
  cnpj: "00.000.000/0001-00",
} as const

/**
 * O que o rodapé promete sobre pagamento. Tem que bater com o que o Pagar.me
 * está configurado pra aceitar (fase 4) — promessa de parcelamento no rodapé
 * que o checkout não cumpre é reclamação certa.
 */
export const formasDePagamento = ["Pix", "Boleto"] as const
export const parcelamento = "3x sem juros"

export const redes = [
  { nome: "Instagram", url: site.instagram },
  { nome: "Facebook", url: "https://www.facebook.com/fuckingbarba" },
  { nome: "YouTube", url: "https://www.youtube.com/@fuckingbarba" },
  { nome: "TikTok", url: "https://www.tiktok.com/@fuckingbarba" },
] as const

/** Um lugar só pros links de navegação: cabeçalho, menu lateral e rodapé. */
export const navegacao = {
  /** Barra preta do cabeçalho (some abaixo de 720px, onde entra o menu). */
  topo: site.categorias.map((c) => ({ href: `/${c.handle}` as const, texto: c.menu })),
  /** Menu lateral: as categorias mais o que é da pessoa. */
  menu: [
    ...site.categorias.map((c) => ({ href: `/${c.handle}` as const, texto: c.menu })),
    { href: EM_BREVE, texto: "Minha conta" },
    { href: EM_BREVE, texto: "Carrinho" },
  ],
  uteis: [
    { href: EM_BREVE, texto: "Blog" },
    { href: EM_BREVE, texto: "Sobre nós" },
    { href: EM_BREVE, texto: "Contato" },
    { href: EM_BREVE, texto: "Dúvidas frequentes" },
    { href: EM_BREVE, texto: "Seja um revendedor" },
    { href: EM_BREVE, texto: "Minha conta" },
  ],
  politicas: [
    { href: "/trocas", texto: "Política de entrega, troca e devolução" },
    { href: "/privacidade", texto: "Política de privacidade" },
    { href: EM_BREVE, texto: "Barba garante" },
  ],
} as const

/**
 * Indexar é decisão explícita, não efeito colateral de deployar.
 *
 * A primeira versão disto ligava em `VERCEL_ENV === "production"`, e o erro
 * apareceu no primeiro deploy: a loja ainda em construção, num domínio
 * `.vercel.app`, subiu com `Allow: /` no robots.txt — convidando o Google a
 * indexar uma página vazia associada à marca enquanto a loja real ainda está
 * na Nuvemshop. "Produção", aqui, quer dizer o deploy principal; não quer
 * dizer pronto pro público.
 *
 * Agora só indexa quando alguém escreve SITE_INDEXAVEL=true de propósito —
 * o que acontece uma vez só, na virada (fase 6), junto com o DNS.
 */
export const emProducao = process.env.SITE_INDEXAVEL === "true"

export type HandleCategoria = (typeof site.categorias)[number]["handle"]

export function ehCategoria(handle: string): handle is HandleCategoria {
  return site.categorias.some((c) => c.handle === handle)
}
