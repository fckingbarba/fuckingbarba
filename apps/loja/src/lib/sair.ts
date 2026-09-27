import "server-only"
import { cookies } from "next/headers"

/**
 * O LINK DE SAIR DA LISTA — o `t` que o Medusa põe no rodapé de todo e-mail
 * de oferta do CRM (`apps/backend/src/lib/crm/sair.ts`): o e-mail da pessoa,
 * cifrado com uma chave que só o Medusa tem. É ele quem diz se vale.
 *
 * MORA NUM COOKIE, NÃO NO ENDEREÇO — o mesmo caminho do link da avaliação
 * (`lib/avaliar.ts`). O link do e-mail leva a `/sair/<t>`
 * (`app/sair/[t]/route.ts`), que guarda o `t` aqui e manda pra `/sair`
 * limpa: o endereço que fica na barra, no histórico e no Google Analytics
 * não carrega o link.
 *
 * `httpOnly` e só no caminho `/sair`. Sete dias: quem abre o e-mail e não
 * decide na hora pode voltar pelo mesmo link — que, de todo jeito, abre a
 * página de novo. Quem saiu fica com ele (ver `lib/acoes/sair.ts`); o link
 * que o Medusa recusa sai na hora.
 */

export const COOKIE_DO_SAIR = "sair"

const OPCOES = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/sair",
  maxAge: 60 * 60 * 24 * 7,
} as const

/** O formato do link (base64url, do tamanho de um e-mail cifrado) — quem diz se ele vale é o Medusa. */
const LINK = /^[A-Za-z0-9_-]{40,600}$/

/** O link como o endereço e o cookie trazem, ou null se nem tem a forma. */
export function linkDeSair(v: unknown): string | null {
  return typeof v === "string" && LINK.test(v) ? v : null
}

export async function lerLinkDeSair(): Promise<string | null> {
  return linkDeSair((await cookies()).get(COOKIE_DO_SAIR)?.value)
}

/** Só em ação ou rota: a página não pode escrever cookie. */
export async function guardarLinkDeSair(link: string) {
  ;(await cookies()).set(COOKIE_DO_SAIR, link, OPCOES)
}

/** Só em ação ou rota. */
export async function esquecerLinkDeSair() {
  const jar = await cookies()
  if (jar.get(COOKIE_DO_SAIR)) jar.delete({ name: COOKIE_DO_SAIR, path: OPCOES.path })
}
