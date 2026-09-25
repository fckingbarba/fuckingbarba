/**
 * O QUE O NAVEGADOR CONTA PRA TELA DE OBSERVABILIDADE DO PAINEL — a
 * velocidade de cada visita (as três medidas do Google), a página que não
 * existe e o erro na tela. Vai pra `/api/telemetria` (a rota da própria
 * loja, que assina e repassa ao Medusa): o navegador nunca fala com o Medusa.
 *
 * NADA IDENTIFICA QUEM VISITA: sem cookie, sem id, só o caminho da página
 * (sem a busca) e se é celular ou computador. O Medusa ainda limpa o caminho
 * (`apps/backend/src/lib/observabilidade/telemetria.ts`).
 *
 * As medidas esperam a pessoa sair da página (a aba escondida, o
 * `pagehide`) e vão num envio só, pelo `sendBeacon` — que não atrasa nada e
 * chega mesmo com a aba fechando. A página que não existe e o erro vão na
 * hora. No máximo 40 recados por aba: um laço de erro não vira enxurrada.
 *
 * UMA MEDIDA DE CADA POR ENVIO: o CLS e o INP são contados de novo até a
 * pessoa sair, e a contagem nova troca a velha. (No desenvolvimento, o React
 * liga o medidor duas vezes; guardar pelo nome também junta essas duas.)
 */

export type Evento =
  | { tipo: "vital"; metrica: string; valor: number; aparelho: Aparelho; pagina: string }
  | { tipo: "404"; pagina: string; origem: string }
  | { tipo: "erro"; pagina: string; mensagem: string }

export type Aparelho = "celular" | "computador"

const ENDERECO = "/api/telemetria"
const MAX_POR_ABA = 40

const fila: Evento[] = []
/** As medidas, pelo nome (LCP, INP, CLS): a contagem nova troca a velha. */
const medidas = new Map<string, Evento>()
let jaForam = 0

/** Celular é tela estreita — o mesmo corte do desenho da loja. */
export const aparelho = (): Aparelho =>
  window.matchMedia("(max-width: 767px)").matches ? "celular" : "computador"

/** O caminho da página agora, sem a busca e sem o `#`. */
export const paginaAgora = () => window.location.pathname

/** Guarda a medida pra ir no próximo envio; a mesma medida, contada de novo, troca. */
export function guardarMedida(nome: string, e: Evento) {
  if (medidas.has(nome) || jaForam + fila.length + medidas.size < MAX_POR_ABA) medidas.set(nome, e)
}

/** Manda agora o que estiver guardado — e `e`, se vier (o 404, o erro). */
export function mandar(e?: Evento) {
  if (e && jaForam + fila.length + medidas.size < MAX_POR_ABA) fila.push(e)
  const eventos = [...fila.splice(0), ...medidas.values()]
  medidas.clear()
  if (!eventos.length) return
  jaForam += eventos.length
  const corpo = JSON.stringify({ eventos })
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
