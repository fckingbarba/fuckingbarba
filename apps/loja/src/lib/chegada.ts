/**
 * A CHEGADA DA VISITA E O "ONDE" DE CADA EVENTO — a parte do CRM da loja que
 * precisa existir desde a primeira página, antes do "Aceitar": guardar de
 * onde a pessoa chegou (a campanha some da barra na primeira troca de
 * página) e a página e a hora de cada evento. E a campanha do link, que volta
 * pro endereço quando as tags ligam (`devolverACampanha`). Nada daqui sai do
 * navegador.
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

/*
  A CAMPANHA DO LINK, PROS PARCEIROS. A Clarity, o GA4, o Google Ads, a Meta e
  o TikTok leem a campanha no ENDEREÇO da página em que ligam — o `?utm_…` e o
  clique do anúncio (`gclid`, `fbclid`…) —, e aqui eles só ligam no "Aceitar"
  (menos o GA4, que desde a 0166 liga na chegada e lê a campanha ali).
  Quem aceita depois de trocar de página já não tem nada disso na barra, e
  cada parceiro via só o site (27/09: a Clarity parou de mostrar as UTMs que
  mostrava na Nuvemshop, onde carregava sem perguntar). Então a campanha da
  página de chegada fica guardada na aba e volta pro endereço logo antes das
  tags ligarem, uma vez por campanha: pros parceiros, é como se a pessoa
  tivesse aceitado na página em que chegou.
*/
const CAMPANHA = "fb_campanha"
const CAMPANHA_DEVOLVIDA = "fb_campanha_devolvida"

/** O que os parceiros leem no endereço: as UTMs e o clique de cada anúncio. */
const DA_CAMPANHA =
  /^(utm_[a-z_]+|gclid|gbraid|wbraid|gad_source|gad_campaignid|dclid|srsltid|fbclid|ttclid|msclkid)$/

/** Só a campanha de uma busca (`?q=oleo&utm_source=ig` → `utm_source=ig`); vazia se não tiver. */
function campanhaDa(busca: string): string {
  const campanha = new URLSearchParams()
  for (const [nome, valor] of new URLSearchParams(busca)) {
    // Comprido demais não é clique de anúncio; e cortado seria o clique de outro.
    if (DA_CAMPANHA.test(nome) && valor && valor.length <= 500) campanha.append(nome, valor)
  }
  return campanha.toString()
}

/** Guarda a campanha do endereço de agora — quem chega por outro link, na mesma aba, troca a guardada. */
export function guardarACampanha() {
  const daqui = campanhaDa(window.location.search)
  try {
    if (daqui) sessao()?.setItem(CAMPANHA, daqui)
  } catch {
    // sem sessionStorage: os parceiros veem a campanha só se a pessoa aceitar aqui
  }
}

/**
 * Logo antes das tags ligarem: se o endereço de agora não tem campanha, a da
 * chegada volta pra ele. O `replaceState` com `null` é o do guia do Next — o
 * roteador fica com o endereço novo (`useSearchParams`) e não o desfaz; ele
 * some da barra na próxima troca de página, como o do link. Uma vez por
 * campanha: quem já ligou as tags com ela (em outra página da aba, ou numa
 * recarga) não a vê voltar.
 */
export function devolverACampanha() {
  guardarACampanha()
  const s = sessao()
  try {
    const campanha = s?.getItem(CAMPANHA)
    if (!campanha || s?.getItem(CAMPANHA_DEVOLVIDA) === campanha) return
    s?.setItem(CAMPANHA_DEVOLVIDA, campanha)
    if (campanhaDa(window.location.search)) return
    const url = new URL(window.location.href)
    url.search = url.search ? `${url.search}&${campanha}` : campanha
    window.history.replaceState(null, "", url)
  } catch {
    // sem sessionStorage, ou o navegador recusou: as tags ligam com o endereço como está
  }
}
