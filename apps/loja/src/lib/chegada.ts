/**
 * A CHEGADA DA VISITA E O "ONDE" DE CADA EVENTO — a parte do CRM da loja que
 * precisa existir desde a primeira página, antes do "Aceitar": guardar de
 * onde a pessoa chegou (a campanha some da barra na primeira troca de
 * página) e a página e a hora de cada evento. Nada daqui sai do navegador.
 *
 * O resto — juntar e mandar — mora em `lib/anotar.ts`, que só baixa depois
 * do sim (`lib/rastrear.ts`): sem ele, o CRM não pesa na página.
 */

/** Onde e quando aconteceu — guardado na hora, e não quando a fila do "Aceitar" sai. */
export type Onde = { pagina: string; t: number }

export const ondeAgora = (): Onde => ({ pagina: window.location.pathname, t: Date.now() })

const CHEGADA = "fb_chegada"
const VISITA_ANOTADA = "fb_visita_anotada"
/** A chegada desta página já foi pra fila (o efeito que roda duas vezes pede uma vez só). */
let chegadaNaFila = false

export type Chegada = { dados: Record<string, string>; onde: Onde }

export function sessao(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** A visita desta sessão foi anotada (quem marca é o envio, depois do sim). */
export function marcarAVisita() {
  try {
    sessao()?.setItem(VISITA_ANOTADA, "1")
  } catch {
    // sem sessionStorage (aba anônima travada): a próxima página anota de novo
  }
}

/**
 * A CHEGADA DESTA VISITA, se ainda não foi anotada: a primeira página da
 * sessão, a campanha do link (`?utm_…`) e o endereço de onde veio. Fica
 * guardada na aba (`sessionStorage`) desde a primeira página — sem sair do
 * navegador —, pra quem aceita os cookies três páginas depois não perder de
 * onde chegou. Nulo: a visita desta sessão já foi anotada.
 */
export function chegadaDaVisita(): Chegada | null {
  if (typeof window === "undefined" || chegadaNaFila) return null
  chegadaNaFila = true
  const s = sessao()
  try {
    if (s?.getItem(VISITA_ANOTADA)) return null
    const guardada = s?.getItem(CHEGADA)
    if (guardada) return JSON.parse(guardada) as Chegada
  } catch {
    // guardada estragada: mede de novo
  }
  const busca = new URLSearchParams(window.location.search)
  const dados: Record<string, string> = {}
  for (const campo of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const v = busca.get(campo)
    if (v) dados[campo] = v.slice(0, 80)
  }
  if (document.referrer) dados.de = document.referrer.slice(0, 300)
  const chegada: Chegada = { dados, onde: ondeAgora() }
  try {
    s?.setItem(CHEGADA, JSON.stringify(chegada))
  } catch {
    // sem sessionStorage: a chegada vale só nesta página
  }
  return chegada
}
