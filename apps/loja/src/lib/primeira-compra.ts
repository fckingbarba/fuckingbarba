/**
 * O POP-UP DA 1ª COMPRA (entrega 0177) — as regras de quando ele aparece,
 * que o navegador (`components/primeira-compra/vigia.tsx`) e o servidor
 * (`app/api/primeira-compra`, `lib/acoes/primeira-compra.ts`) dividem. Sem
 * diretiva: os dois lados importam.
 *
 * QUANDO APARECE: depois de 20 segundos na loja, ou quando a pessoa rola
 * metade da página, ou (no computador) quando o mouse sai pra fechar a aba —
 * o que vier primeiro. Só depois da faixa de cookies respondida, e nunca com
 * a sacola aberta.
 *
 * QUANDO NÃO APARECE:
 *   - no checkout, na conta e nas páginas de passagem (o link do cupom, o de
 *     voltar, o de sair da lista, a avaliação), nas de lei (privacidade,
 *     termos, trocas) e na dos criadores (quem chega lá vem se inscrever pra
 *     gravar, não comprar — o cupom por cima da proposta atrapalharia);
 *   - pra quem entrou na conta, comprou neste navegador (`fb_cliente`), se
 *     cadastrou (no pop-up ou na newsletter do rodapé) ou fechou o pop-up nos
 *     últimos 30 dias (`fb_popup`).
 *
 * Os dois cookies só guardam a escolha da pessoa (não medem nada): podem
 * existir sem o "sim" da faixa.
 */

export const COOKIE_DO_POPUP = "fb_popup"
export const COOKIE_CLIENTE = "fb_cliente"

/** Quanto tempo o pop-up fechado fica sem voltar. */
export const DIAS_FECHADO = 30
/** Quanto tempo na loja antes de ele aparecer sozinho. */
export const ESPERA_MS = 20_000

const ANO = 365 * 24 * 60 * 60

/** O cookie do pop-up e o de quem comprou: um ano, legíveis pelo navegador (ele decide se pergunta). */
export const OPCOES_DOS_COOKIES = {
  path: "/",
  maxAge: ANO,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
}

/** "cadastrado" (nunca mais) ou "fechado.<hora>" (volta depois de 30 dias). */
export function podeMostrarPelaMarca(
  valor: string | null | undefined,
  agora = Date.now()
): boolean {
  if (!valor) return true
  if (valor === "cadastrado") return false
  const m = /^fechado\.(\d{10,14})$/.exec(valor)
  if (!m) return true
  return agora - Number(m[1]) > DIAS_FECHADO * 24 * 60 * 60 * 1000
}

const SEM_POPUP = [
  "/checkout",
  "/conta",
  "/discount",
  "/voltar",
  "/sair",
  "/avaliar",
  "/criadores",
  "/oferta",
  "/privacidade",
  "/termos",
  "/trocas",
]

/** Se o pop-up fica de fora desta página. */
export const semPopupNesta = (caminho: string) =>
  SEM_POPUP.some((c) => caminho === c || caminho.startsWith(`${c}/`))

/** O que o pop-up escreve: o % e os dias do cupom (os do painel: CRM → Fluxos). */
export type ConfigDoPopup = { porcento: number; dias: number }

export type RespostaDoPopup =
  | { tipo: "ok"; codigo: string; porcento: number; nome: string | null }
  /** Já tinha se cadastrado: o mesmo código, se ainda vale. */
  | { tipo: "ja-cadastrado"; codigo: string | null; nome: string | null }
  | { tipo: "ja-cliente"; nome: string | null }
  | { tipo: "erro"; campo: "nome" | "email" | null; texto: string }
