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

/**
 * A CHAVE DO CHECKOUT.
 *
 * O `/checkout` existe, funciona ponta a ponta e fecha pedido de verdade. O
 * que ele ainda NÃO tem é cobrança: o único meio de pagamento configurado no
 * Medusa é o `pp_system_default`, que aprova sem cobrar nada. Mandar gente
 * pra lá hoje seria receber pedido que ninguém pagou e ter que correr atrás
 * de cada um por WhatsApp.
 *
 * Enquanto isto for `false`, o botão da sacola continua indo pro `/em-breve`
 * e a página de checkout só é alcançada por quem digita a URL — que é como
 * ela é testada.
 *
 * VIRE PRA `true` QUANDO o Pagar.me estiver integrado e aparecendo em
 * `GET /store/payment-providers`. É a única linha que precisa mudar; nenhuma
 * tela depende deste valor além do botão.
 */
export const CHECKOUT_ABERTO = false

/** Pra onde o botão "Finalizar compra" aponta hoje. */
export const DESTINO_DO_CHECKOUT = CHECKOUT_ABERTO ? "/checkout" : EM_BREVE

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
 * Aparece na esteira de avisos, no pé do menu, na barra de progresso da sacola
 * e na dobra da PDP. Hoje é constante porque a loja precisa mostrar o piso em
 * páginas que nem têm carrinho ainda; quem realmente zera o frete é o Medusa,
 * na regra `item_total >= piso` que o `apps/backend/src/scripts/frete.ts`
 * cadastra em cada opção de entrega. Os dois números PRECISAM ser o mesmo: no
 * dia em que divergirem, a loja promete um piso e o checkout cobra por outro.
 *
 * "A PARTIR DE", NÃO "ACIMA DE" — e a diferença não é firula. O kit de 2
 * unidades custa exatamente R$ 149,90: o carrinho mais provável de encostar
 * nesse número encosta nele em cheio. A regra do Medusa é `gte`, conferida
 * rodando (`apps/backend/ferramentas/conferir-frete.mjs`), então o piso exato
 * JÁ é grátis. "Acima de" descreveria errado justamente o caso mais comum.
 */
export const FRETE_GRATIS_A_PARTIR_DE = 149.9

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
export const PARCELAS_SEM_JUROS = 3
export const parcelamento = `${PARCELAS_SEM_JUROS}x sem juros`

/**
 * Menor parcela que faz sentido oferecer, em reais. Abaixo disso o card do
 * produto mostra só o preço à vista — parcelar R$ 3,30 não ajuda ninguém e
 * as operadoras costumam recusar.
 */
export const PARCELA_MINIMA = 5

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
    { href: "/produtos", texto: "Todos os produtos" },
    /*
      "Sobre nós" não tem tela própria: o texto já está na home, na seção
      `#sobre`. Uma página separada seria uma segunda versão da mesma
      história pra manter em dia — e quando duas versões divergem, é sempre
      a que ninguém revisita que o cliente lê.
    */
    { href: "/#sobre", texto: "Sobre nós" },
    { href: EM_BREVE, texto: "Blog" },
    { href: EM_BREVE, texto: "Contato" },
    { href: EM_BREVE, texto: "Dúvidas frequentes" },
    { href: EM_BREVE, texto: "Minha conta" },
  ],
  politicas: [
    { href: "/trocas", texto: "Política de entrega, troca e devolução" },
    { href: "/privacidade", texto: "Política de privacidade" },
    { href: "/termos", texto: "Termos de uso" },
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
