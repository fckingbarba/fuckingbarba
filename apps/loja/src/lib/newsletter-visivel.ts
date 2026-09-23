/**
 * O que o formulário da newsletter mostra depois de enviar — tipo e estado
 * inicial, num arquivo sem nada de servidor, porque quem lê é o navegador
 * (`components/layout/newsletter.tsx`) e quem escreve é a ação
 * (`lib/acoes/newsletter.ts`).
 */
export type EstadoDaNewsletter =
  | { tipo: "inicio" }
  | { tipo: "ok" }
  /** `email` volta pro campo: errar e ter que digitar tudo de novo é pior que o erro. */
  | { tipo: "erro"; texto: string; email: string }

export const NEWSLETTER_INICIO: EstadoDaNewsletter = { tipo: "inicio" }
