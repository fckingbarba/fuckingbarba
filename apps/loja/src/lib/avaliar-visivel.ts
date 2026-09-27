/**
 * A PÁGINA DA AVALIAÇÃO (`/avaliar`) — o que a tela e as ações dividem:
 * os tipos, os tamanhos dos campos e as frases. Sem nada de servidor: o
 * arquivo das ações (`lib/acoes/avaliar.ts`, `"use server"`) só pode
 * exportar funções.
 *
 * Os tamanhos são os do backend (`LIMITES`, em
 * `apps/backend/src/lib/avaliacoes/regras.ts`): o navegador corta no mesmo
 * ponto em que o Medusa recusaria.
 */

export const LIMITES = {
  nome: { min: 2, max: 40 },
  texto: { min: 3, max: 1000 },
} as const

export const NOTAS = [1, 2, 3, 4, 5] as const

/** O que cada nota quer dizer — a frase embaixo das estrelas. */
export const FRASE_DA_NOTA: Record<number, string> = {
  1: "Não gostei",
  2: "Podia ser melhor",
  3: "É bom",
  4: "Gostei muito",
  5: "Amei",
}

export type ProdutoParaAvaliar = {
  id: string
  nome: string
  handle: string | null
  imagem: string | null
  /** Já tem avaliação deste pedido. */
  avaliado: boolean
}

export type PedidoParaAvaliar = {
  numero: number
  /** A sugestão do campo de nome ("Rafael S."), ou vazio. */
  nome: string
  produtos: ProdutoParaAvaliar[]
}

export type CampoDaAvaliacao = "produto" | "nota" | "nome" | "texto"

export type EstadoDaAvaliacao =
  | { tipo: "inicio" }
  | {
      tipo: "erro"
      /** O campo que a frase aponta; sem ele, a frase vai em cima do botão. */
      campo?: CampoDaAvaliacao
      texto: string
      /** O que estava digitado — o formulário volta com isso. */
      valores: { produto: string; nota: string; nome: string; texto: string }
      rodada: number
    }
  | {
      tipo: "enviada"
      /** O primeiro nome que a pessoa escreveu, pro "valeu". */
      nome: string
      /** O nome do produto avaliado. */
      produto: string
      /** Os ids dos produtos do pedido que ainda não têm nota. */
      faltam: string[]
    }

export const AVALIACAO_INICIO: EstadoDaAvaliacao = { tipo: "inicio" }

export type CampoDoEncontrar = "numero" | "email"

export type EstadoDoEncontrar =
  | { tipo: "inicio" }
  | {
      tipo: "erro"
      campo?: CampoDoEncontrar
      texto: string
      numero: string
      email: string
      rodada: number
    }

export const ENCONTRAR_INICIO: EstadoDoEncontrar = { tipo: "inicio" }

/** A frase de cada campo que o Medusa (ou a própria ação) recusou. */
export const ERRO_DO_CAMPO: Record<CampoDaAvaliacao, string> = {
  produto: "Escolha o produto que você vai avaliar.",
  nota: "Escolha de 1 a 5 estrelas.",
  nome: `Escreva como você quer aparecer (de ${LIMITES.nome.min} a ${LIMITES.nome.max} letras).`,
  texto: `Conte como foi, em até ${LIMITES.texto.max} caracteres.`,
}
