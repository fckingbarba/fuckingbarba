/**
 * O que a tela do sair da lista mostra depois do clique — fora do arquivo
 * da ação, porque `"use server"` só exporta função assíncrona.
 */
export type EstadoDoSair =
  | { tipo: "pergunta" }
  | { tipo: "saiu" }
  /** O link não vale (cortado, de outra loja) ou o cookie sumiu no caminho. */
  | { tipo: "invalido" }
  | { tipo: "erro"; texto: string }

export const PERGUNTA: EstadoDoSair = { tipo: "pergunta" }
