/**
 * O CRM DA LOJA, DO LADO DO NAVEGADOR — o que a pessoa faz na loja vai pra
 * própria loja (`/api/eventos`), que confere o "sim" dos cookies, põe o
 * visitante (o cookie dela) e repassa ao Medusa, onde a regra do que fica
 * mora (`apps/backend/src/lib/crm/eventos.ts`).
 *
 * QUEM CHAMA É `lib/rastrear.ts`, e só depois do "Aceitar" — a mesma fila
 * das tags: o evento é o mesmo que vai pro Google (a loja tem uma porta de
 * saída só), mais os dois que são só daqui (a chegada e o e-mail no
 * checkout). Sem o sim, nada chega aqui — e este arquivo nem baixa: o
 * `rastrear` o importa na hora (`import()`), e a página inicial, que o
 * Lighthouse do CI mede com orçamento curto, não carrega um byte do CRM.
 * O que precisa existir antes do sim (a chegada) mora em `lib/chegada.ts`.
 *
 * JUNTA E MANDA: o que acontece em 2 segundos vai num envio só (até 20); a
 * pessoa saindo da página (a aba escondida, o `pagehide`) manda na hora,
 * pelo `sendBeacon`, que chega mesmo com a aba fechando. No máximo 200 por
 * aba: um laço não vira enxurrada.
 *
 * O MESMO PRODUTO VISTO DUAS VEZES em 2 segundos é uma vez só: o efeito que
 * roda de novo (o React, no desenvolvimento, liga todo efeito duas vezes)
 * não vira duas visitas ao produto. Na sacola não: dois "+" rápidos são duas
 * unidades de verdade.
 */

import { marcarAVisita, sessao, type Onde } from "./chegada"

const ENDERECO = "/api/eventos"
const ESPERA_MS = 2000
const MAX_POR_ENVIO = 20
const MAX_POR_ABA = 200

/** Os eventos que o CRM anota (o resto do que vai pro Google fica só lá). */
const DO_CRM = new Set([
  "visita",
  "view_item",
  "produto_lido",
  "video_assistido",
  "add_to_cart",
  "remove_from_cart",
  "begin_checkout",
  "contato_informado",
  "add_shipping_info",
  "add_payment_info",
  "pix_copiado",
])

type Guardado = { nome: string; dados: unknown; onde: Onde }

const fila: Guardado[] = []
let enviados = 0
let relogio: ReturnType<typeof setTimeout> | null = null
let ouvindo = false
let ultimoVisto = { chave: "", t: 0 }

export function anotar(nome: string, dados: unknown, onde: Onde) {
  if (typeof window === "undefined" || !DO_CRM.has(nome)) return
  if (enviados + fila.length >= MAX_POR_ABA) return
  if (nome === "view_item") {
    const chave = `${onde.pagina}|${JSON.stringify(dados)}`
    if (chave === ultimoVisto.chave && onde.t - ultimoVisto.t < 2000) return
    ultimoVisto = { chave, t: onde.t }
  }
  if (nome === "visita") marcarAVisita()
  fila.push({ nome, dados, onde })
  ouvirASaida()
  if (fila.length >= MAX_POR_ENVIO) return despachar()
  if (relogio) clearTimeout(relogio)
  relogio = setTimeout(despachar, ESPERA_MS)
}

function despachar() {
  if (relogio) clearTimeout(relogio)
  relogio = null
  while (fila.length) {
    const lote = fila.splice(0, MAX_POR_ENVIO)
    enviados += lote.length
    const agora = Date.now()
    enviar(
      JSON.stringify({
        eventos: lote.map(({ nome, dados, onde }) => ({
          nome,
          dados,
          pagina: onde.pagina,
          ha: agora - onde.t,
        })),
      })
    )
  }
}

function enviar(corpo: string) {
  try {
    if (navigator.sendBeacon?.(ENDERECO, new Blob([corpo], { type: "application/json" }))) return
  } catch {
    // o sendBeacon pode recusar; o fetch abaixo tenta
  }
  fetch(ENDERECO, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: corpo,
    keepalive: true,
  }).catch(() => undefined)
}

function ouvirASaida() {
  if (ouvindo) return
  ouvindo = true
  const sair = () => {
    if (fila.length) despachar()
  }
  window.addEventListener("pagehide", sair)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") sair()
  })
}

/* ── uma vez por sessão ─────────────────────────────────────────────────── */

const UMA_VEZ = "fb_crm_uma_vez"
const feitasNestaPagina = new Set<string>()

/**
 * A primeira vez desta chave na sessão (a aba)? Marca e diz sim; das outras,
 * não. Sem `sessionStorage`, vale a memória da página.
 */
export function primeiraVezNaSessao(chave: string): boolean {
  if (feitasNestaPagina.has(chave)) return false
  feitasNestaPagina.add(chave)
  try {
    const s = sessao()
    const feitas = JSON.parse(s?.getItem(UMA_VEZ) ?? "[]") as string[]
    if (feitas.includes(chave)) return false
    s?.setItem(UMA_VEZ, JSON.stringify([...feitas, chave].slice(-50)))
  } catch {
    // guardada estragada, ou sem sessionStorage: vale a desta página
  }
  return true
}
