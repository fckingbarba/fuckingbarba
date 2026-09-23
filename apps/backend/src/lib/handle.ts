/**
 * O HANDLE — o pedaço da URL (`/produtos/<handle>`, `/<categoria>`).
 *
 * Só `a-z`, `0-9` e hífen: sem acento, sem maiúscula, sem espaço. Quem
 * garante na entrada do admin é `api/middlewares.ts`; a importação do ERP
 * (`lib/erp/catalogo.ts`) gera pelo mesmo caminho.
 */
export const HANDLE_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** "Óleo para Barba" → "oleo-para-barba". */
export function gerarHandle(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
