/**
 * A PÁGINA DOS CRIADORES (`/criadores`) — o que a tela, a calculadora e a
 * ação dividem: a oferta, as opções do formulário, os tamanhos dos campos,
 * os tipos e as frases. Sem nada de servidor: o arquivo da ação
 * (`lib/acoes/criadores.ts`, `"use server"`) só pode exportar funções.
 *
 * As opções e os tamanhos são os do backend (`apps/backend/src/lib/criadores/regras.ts`):
 * o navegador recusa no mesmo ponto em que o Medusa recusaria.
 */

/**
 * A OFERTA — os números que a página promete, num lugar só: o texto, a
 * calculadora e as dúvidas leem daqui. Mudou a proposta, muda aqui.
 */
export const OFERTA = {
  /** O fixo, em reais, pelos criativos. */
  fixo: 1000,
  criativos: 20,
  /** A duração de cada criativo, em segundos. */
  segundos: { min: 25, max: 40 },
  /**
   * A comissão: a porcentagem de cada venda feita com o vídeo, SEM PRAZO — enquanto o anúncio
   * com ele vender, paga (decisão do dono, 28/09: "o que vender, vamos pagar").
   */
  porcento: 3,
  /** O pedido médio da loja, em reais — a conta da calculadora. */
  pedidoMedio: 125,
  /** Dias pra gravar, depois que o kit chega. */
  prazoDias: 15,
  respostaDiasUteis: 3,
  ajustesPorVideo: 2,
} as const

/** A comissão de uma venda, em reais: 3% de R$ 125 = R$ 3,75. */
export const comissaoPorVenda = (pedido: number = OFERTA.pedidoMedio) =>
  Math.round(pedido * OFERTA.porcento) / 100

/**
 * Em que mês a comissão somada passa do fixo, com tantas vendas por mês: 30 vendas (R$ 112,50 por
 * mês) passam de R$ 1.000 no 9º. `null` sem venda. A conta é em centavos, sem erro de
 * arredondamento.
 */
export function mesesPraPassarDoFixo(vendasPorMes: number): number | null {
  const porMes = vendasPorMes * Math.round(OFERTA.pedidoMedio * OFERTA.porcento)
  if (porMes <= 0) return null
  return Math.floor((OFERTA.fixo * 100) / porMes) + 1
}

/** 1000 → "R$ 1.000"; 112.5 → "R$ 112,50". O espaço é o fixo (U+00A0), do Intl. */
export function reais(valor: number): string {
  const inteiro = Number.isInteger(valor)
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: inteiro ? 0 : 2,
    maximumFractionDigits: inteiro ? 0 : 2,
  })
}

/* ── o formulário ─────────────────────────────────────────────────────────── */

export const LIMITES = {
  nome: { min: 5, max: 80 },
  cidade: { min: 3, max: 80 },
  instagram: 30,
  tiktok: 24,
  video: 300,
} as const

export const SEGUIDORES = [
  { id: "ate-1mil", nome: "Menos de 1 mil" },
  { id: "1-10mil", nome: "1 mil a 10 mil" },
  { id: "10-50mil", nome: "10 mil a 50 mil" },
  { id: "50-100mil", nome: "50 mil a 100 mil" },
  { id: "mais-100mil", nome: "Mais de 100 mil" },
] as const

export const BARBAS = [
  { id: "cheia", nome: "Cheia" },
  { id: "media", nome: "Média" },
  { id: "curta", nome: "Curta" },
  { id: "crescendo", nome: "Crescendo" },
] as const

export const EXPERIENCIAS = [
  { id: "nunca", nome: "Nunca" },
  { id: "algumas", nome: "Algumas vezes" },
  { id: "sempre", nome: "Faço sempre" },
] as const

export type Modelo = "fixo" | "comissao" | "conversar"

export const MODELOS: { id: Modelo; rotulo: string; valor: string; detalhe: string }[] = [
  {
    id: "fixo",
    rotulo: "Fixo",
    valor: reais(OFERTA.fixo),
    detalhe: `${reais(OFERTA.fixo / OFERTA.criativos)} por criativo`,
  },
  {
    id: "comissao",
    rotulo: "Comissão",
    valor: `${OFERTA.porcento}%`,
    detalhe: "de cada venda, enquanto vender",
  },
  {
    id: "conversar",
    rotulo: "Ainda não sei",
    valor: "Conversar",
    detalhe: "a gente explica no WhatsApp",
  },
]

export const NOME_DO_MODELO: Record<Modelo, string> = {
  fixo: `Fixo, ${reais(OFERTA.fixo)}`,
  comissao: `Comissão, ${OFERTA.porcento}% de cada venda`,
  conversar: "Ainda não sei, quero conversar",
}

/** O evento que os botões das propostas mandam pro formulário marcar o modelo. */
export const EVENTO_DO_MODELO = "criadores:modelo"

export type CampoDaInscricao =
  | "nome"
  | "whatsapp"
  | "email"
  | "cidade"
  | "redes"
  | "seguidores"
  | "barba"
  | "experiencia"
  | "video"
  | "modelo"
  | "aceite"

/** O que estava digitado — o formulário volta com isso depois de um erro. */
export type ValoresDaInscricao = {
  nome: string
  whatsapp: string
  email: string
  cidade: string
  instagram: string
  tiktok: string
  seguidores: string
  barba: string
  experiencia: string
  video: string
  parceria: boolean
  modelo: string
  aceite: boolean
}

export type EstadoDaInscricao =
  | { tipo: "inicio" }
  | {
      tipo: "erro"
      /** O campo que a frase aponta; sem ele, a frase vai em cima do botão. */
      campo?: CampoDaInscricao
      texto: string
      valores: ValoresDaInscricao
      rodada: number
    }
  | {
      tipo: "enviada"
      /** O primeiro nome, pro "valeu". */
      nome: string
      /** O WhatsApp como a loja vai chamar: "(47) 99999-0000". */
      whatsapp: string
      modelo: Modelo
    }

export const INSCRICAO_INICIO: EstadoDaInscricao = { tipo: "inicio" }

/** A frase de cada campo que o Medusa (ou a própria ação) recusou. */
export const ERRO_DO_CAMPO: Record<CampoDaInscricao, string> = {
  nome: "Coloca nome e sobrenome.",
  whatsapp: "Coloca o WhatsApp com DDD, tipo (47) 99999-0000.",
  email: "Esse e-mail parece incompleto. Confere o @ e o ponto.",
  cidade: "Coloca sua cidade e o estado.",
  redes: "Coloca pelo menos um: Instagram ou TikTok (só o @, sem espaço nem acento).",
  seguidores: "Escolhe uma das faixas de seguidores.",
  barba: "Escolhe como tá sua barba hoje.",
  experiencia: "Escolhe uma das opções.",
  video: "Esse link não abriu. Cola o endereço do vídeo, tipo instagram.com/reel/…",
  modelo: "Escolhe um jeito de ganhar. Se ainda não sabe, marca “Ainda não sei”.",
  aceite: "Pra enviar, marca a autorização.",
}

/** "47999990000" → "(47) 99999-0000". */
export function whatsappNaTela(digitos: string): string {
  const d = digitos.replace(/\D/g, "")
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return digitos
}
