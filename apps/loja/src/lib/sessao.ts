/**
 * A SESSÃO DA MINHA CONTA — o que dá pra saber do cookie sem perguntar a
 * ninguém.
 *
 * O cookie `sessao` guarda o token que o Medusa deu quando o código do
 * e-mail conferiu. Quem VALIDA o token é o Medusa, a cada pedido — a
 * assinatura só ele sabe conferir. Aqui só se lê o que vem escrito dentro
 * (o token não é secreto, é assinado): o prazo e se já tem cliente ligado.
 *
 * Serve pro `proxy.ts`, que decide em milissegundos se manda a pessoa pro
 * "entrar" antes de a página renderizar. É a checagem OTIMISTA que o guia de
 * autenticação do Next recomenda — token forjado passa daqui e cai na
 * primeira pergunta ao Medusa, que responde 401.
 *
 * Sem `server-only` de propósito: o proxy importa daqui.
 */

export const COOKIE_SESSAO = "sessao"

/** O e-mail (e pra onde voltar) entre a tela do e-mail e a do código. */
export const COOKIE_ENTRANDO = "entrando"

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
 * Parece uma sessão de cliente que ainda vale? Cliente ligado e prazo no
 * futuro — com um minuto de folga, pra não mandar pra página um token que
 * vence no caminho.
 */
export function sessaoParece(token: string | undefined | null, agora = Date.now()): boolean {
  const t = lerToken(token)
  if (!t || t.actor_type !== "customer") return false
  if (typeof t.actor_id !== "string" || !t.actor_id) return false
  return typeof t.exp === "number" && t.exp * 1000 > agora + 60_000
}

/**
 * Pra onde mandar depois de entrar. Só as telas da conta, e só as que
 * existem: aceitar qualquer `?para=` faria do "entrar" um trampolim — um
 * link da loja que, depois do código, leva a pessoa pra um site qualquer.
 *
 * UMA LISTA, E NÃO UMA REGEX, por causa do `typedRoutes`: o `redirect` só
 * aceita caminho que o compilador sabe que existe. A lista cresce junto com
 * as telas (pedidos, endereços, dados); o que não estiver nela volta pra
 * /conta, que existe sempre.
 */
const DESTINOS = ["/conta"] as const

export type Destino = (typeof DESTINOS)[number]

export function destinoSeguro(valor: unknown): Destino {
  return (DESTINOS as readonly unknown[]).includes(valor) ? (valor as Destino) : "/conta"
}
