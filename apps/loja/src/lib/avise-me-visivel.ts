/**
 * O que o "avise-me" da página esgotada mostra depois de enviar — tipo e
 * estado inicial, num arquivo sem nada de servidor, porque quem lê é o
 * navegador (`components/produto/avise-me.tsx`) e quem escreve é a ação
 * (`lib/acoes/avise-me.ts`). O mesmo molde da newsletter.
 */
export type EstadoDoAviso =
  | { tipo: "inicio" }
  /** `email`: o endereço que vai receber, escrito de volta na frase. */
  | { tipo: "ok"; email: string }
  /** O produto voltou entre a página abrir e o clique: a página estava velha. */
  | { tipo: "voltou" }
  /** `email` volta pro campo: errar e ter que digitar tudo de novo é pior que o erro. */
  | { tipo: "erro"; texto: string; email: string }

export const AVISO_INICIO: EstadoDoAviso = { tipo: "inicio" }
