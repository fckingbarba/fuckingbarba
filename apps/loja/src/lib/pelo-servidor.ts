import { CAMPANHA, sessao } from "./chegada"

/**
 * OS PASSOS DA VISITA PELO SERVIDOR, do lado do navegador (entrega 0231: o
 * dono quer os eventos de quem usa bloqueador também). Baixa junto com as
 * tags (`components/analytics/integracoes.ts`), que dizem pra quais
 * plataformas vale (as que têm o pixel no painel) e registram o envio no
 * `rastrear` — a página inicial não carrega nada disto.
 *
 * - O PRODUTO, A SACOLA, O CHECKOUT E O PAGAMENTO saem daqui pra todo mundo,
 *   com o mesmo id que o `rastrear` pôs no pixel: a Meta e o TikTok juntam
 *   os dois, e quando o pixel foi bloqueado fica o do servidor.
 * - A VISITA À PÁGINA só sai daqui de quem teve o pixel bloqueado
 *   (`pixelBloqueado`): a da chegada na hora, e uma a cada troca de página.
 *
 * Vai pra rota da própria loja (`/api/passos`), que confere a resposta sobre
 * os cookies e repassa pro Medusa. Junta um segundo e meio num envio (até
 * 20), e o que sobrou sai quando a página some (`sendBeacon`).
 */

export type Destino = "meta" | "tiktok"
type Item = { id: string; nome: string; quantidade: number; preco: number }
type Passo = {
  nome: string
  id: string
  pagina: string
  em: number
  para: Destino[]
  valor?: number
  itens?: Item[]
}
type ComItens = {
  value: number
  items: { item_id: string; item_name: string; price: number; quantity?: number }[]
}

const ROTA = "/api/passos"
const JUNTA_MS = 1500
const POR_ENVIO = 20

let destinos: Destino[] = []
const bloqueados = new Set<Destino>()
const fila: Passo[] = []
let relogio: ReturnType<typeof setTimeout> | null = null
let ultimaPagina = ""

const agora = () => Math.floor(Date.now() / 1000)
const novoId = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

/** O clique do anúncio desta página, ou o da chegada guardado na aba (`lib/chegada.ts`). */
function cliqueDoAnuncio(nome: "fbclid" | "ttclid"): string | null {
  const daqui = new URLSearchParams(window.location.search).get(nome)
  if (daqui) return daqui.slice(0, 500)
  try {
    return new URLSearchParams(sessao()?.getItem(CAMPANHA) ?? "").get(nome)?.slice(0, 500) ?? null
  } catch {
    return null
  }
}

function mandar() {
  if (relogio) clearTimeout(relogio)
  relogio = null
  if (!fila.length) return
  const corpo = JSON.stringify({
    passos: fila.splice(0, POR_ENVIO),
    bloqueado: { meta: bloqueados.has("meta"), tiktok: bloqueados.has("tiktok") },
    fbclid: cliqueDoAnuncio("fbclid"),
    ttclid: cliqueDoAnuncio("ttclid"),
  })
  const foi = navigator.sendBeacon?.(ROTA, new Blob([corpo], { type: "application/json" }))
  if (!foi)
    fetch(ROTA, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: corpo,
      keepalive: true,
    }).catch(() => undefined)
  if (fila.length) mandar()
}

function naFila(passo: Passo) {
  fila.push(passo)
  if (fila.length >= POR_ENVIO) mandar()
  else relogio ??= setTimeout(mandar, JUNTA_MS)
}

/** Liga o envio pra estas plataformas (as tags chamam, uma vez por página). */
export function ligarPeloServidor(para: Destino[]) {
  destinos = para
  if (!para.length) return
  addEventListener("pagehide", mandar)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") mandar()
  })
}

/** Um evento padrão da Meta e do TikTok, com o id que foi pro pixel (`lib/rastrear.ts`). */
export function passoPeloServidor(nome: string, id: string, dados: ComItens) {
  if (!destinos.length) return
  naFila({
    nome,
    id,
    pagina: location.href,
    em: agora(),
    para: destinos,
    valor: dados.value,
    itens: dados.items.map((i) => ({
      id: i.item_id,
      nome: i.item_name,
      quantidade: i.quantity ?? 1,
      preco: i.price,
    })),
  })
}

function visitaPeloServidor() {
  const aqui = location.pathname
  if (!bloqueados.size || aqui === ultimaPagina) return
  ultimaPagina = aqui
  naFila({
    nome: "PageView",
    id: novoId(),
    pagina: location.href,
    em: agora(),
    para: [...bloqueados],
  })
}

let ouvindoAsTrocas = false

/**
 * As trocas de página do Next são `history.pushState`: embrulhado aqui (como
 * o próprio pixel faz), e o voltar do navegador pelo `popstate`. O
 * `replaceState` fica de fora — ele muda o endereço sem trocar de página.
 */
function ouvirAsTrocas() {
  if (ouvindoAsTrocas) return
  ouvindoAsTrocas = true
  const original = history.pushState
  history.pushState = function (...args: Parameters<History["pushState"]>) {
    const r = original.apply(this, args)
    setTimeout(visitaPeloServidor, 0)
    return r
  }
  addEventListener("popstate", () => setTimeout(visitaPeloServidor, 0))
}

/** O pixel desta plataforma não carregou (bloqueador): a visita passa a ir pelo servidor. */
export function pixelBloqueado(d: Destino) {
  if (!destinos.includes(d) || bloqueados.has(d)) return
  bloqueados.add(d)
  ouvirAsTrocas()
  // A página de agora, pra esta plataforma (as outras já tiveram a sua).
  const aqui = location.pathname
  if (aqui === ultimaPagina)
    naFila({ nome: "PageView", id: novoId(), pagina: location.href, em: agora(), para: [d] })
  else visitaPeloServidor()
}
