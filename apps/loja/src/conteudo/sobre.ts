/**
 * A história da marca, como ela aparece na home.
 *
 * ┌─ NÚMEROS: CONFERIR ANTES DE IR PRO AR ────────────────────────────────┐
 * │ Os três números abaixo vieram do protótipo e ninguém confirmou que    │
 * │ são verdade. Ano de fundação e quantidade de clientes são afirmações  │
 * │ sobre o negócio: se estiverem errados, é o tipo de coisa que um       │
 * │ concorrente aponta e que o consumidor cobra. Confira e corrija aqui.  │
 * └───────────────────────────────────────────────────────────────────────┘
 */

export const SOBRE = {
  titulo: "O cuidado que impõe presença",

  /** O handle do produto cuja foto ilustra a seção. */
  fotoDe: "oleo-para-barba",

  paragrafos: [
    "A FuckingBarba nasceu da revolta com produtos genéricos e marcas que tratam o cuidado pessoal como um detalhe qualquer. A gente acredita que cuidar de si é um ritual, um ato de presença, de identidade e de respeito com quem você é.",
    "Nossa missão é clara: oferecer os melhores cosméticos masculinos do mercado para quem não aceita qualquer coisa no rosto ou no cabelo. Cada óleo, balm ou sabonete é pensado para realçar o melhor de você — seja no toque, no cheiro ou no visual.",
    { grito: "Somos mais do que cosméticos. Somos atitude." },
    "A FuckingBarba é pra quem não tem medo de se impor. Pra quem quer ser lembrado. Pra quem sabe que a aparência fala antes mesmo de você abrir a boca.",
    "Trabalhamos com fórmulas de alta performance, ingredientes de qualidade e uma identidade que carrega autenticidade em cada gota.",
    { grito: "Ousamos. Criamos. Cuidamos." },
  ] satisfies (string | { grito: string })[],

  /** CONFERIR — ver o aviso no topo do arquivo. */
  numeros: [
    { rotulo: "Ano de fundação", valor: "2016", ano: "2016" },
    { rotulo: "Clientes impactados", valor: "+1M" },
    { rotulo: "Presença nacional", valor: "BR", areaServed: true },
  ],
} as const

export const FECHAMENTO = {
  chapeu: "Última chamada",
  titulo: "Cosméticos premium pra elevar sua presença — da barba ao cabelo.",
  chamada: "Ver todos os produtos",
  /** O handle do produto cuja foto vira o fundo. */
  fotoDe: "kit-completo-para-barba",
} as const
