/**
 * A SESSÃO DO PAINEL — o que dá pra saber do cookie sem perguntar a ninguém.
 *
 * O cookie `painel_sessao` guarda o token que o Medusa deu quando o código
 * do e-mail conferiu. Quem VALIDA é o Medusa, a cada pedido (e ele ainda
 * relê o membro no banco — tirado da equipe, o token não abre mais nada).
 * Aqui só se lê o que vem escrito dentro: o prazo e se já é de um membro.
 *
 * Serve pro `proxy.ts`, que decide em milissegundos se manda a pessoa pro
 * "entrar". É a checagem OTIMISTA do guia de autenticação do Next — token
 * forjado passa daqui e cai na primeira pergunta ao Medusa.
 *
 * Sem `server-only` de propósito: o proxy importa daqui.
 */

export const COOKIE_SESSAO = "painel_sessao"

/** O e-mail e a hora do envio, entre a tela do e-mail e a do código. */
export const COOKIE_ENTRANDO = "painel_entrando"

type Conteudo = { actor_id?: unknown; actor_type?: unknown; exp?: unknown }

/** O que vem escrito no token, ou null se não parecer um. */
export function lerToken(token: string | undefined | null): Conteudo | null {
  if (!token) return null
  const partes = token.split(".")
  if (partes.length !== 3) return null
  try {
    const json = atob(partes[1].replace(/-/g, "+").replace(/_/g, "/"))
    const conteudo = JSON.parse(json) as unknown
    return conteudo && typeof conteudo === "object" ? (conteudo as Conteudo) : null
  } catch {
    return null
  }
}

/**
 * Parece uma sessão da equipe que ainda vale? Membro ligado e prazo no
 * futuro, com um minuto de folga.
 */
export function sessaoParece(token: string | undefined | null, agora = Date.now()): boolean {
  const t = lerToken(token)
  if (!t || t.actor_type !== "equipe") return false
  if (typeof t.actor_id !== "string" || !t.actor_id) return false
  return typeof t.exp === "number" && t.exp * 1000 > agora + 60_000
}
