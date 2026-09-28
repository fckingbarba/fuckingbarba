/**
 * O MINUTO NA PÁGINA — pra navegação abandonada do CRM (entrega 0198): chama
 * `fn` quando a pessoa completa 1 minuto com a aba na frente. É a soma dos
 * pedaços: trocar de aba pausa a conta, e voltar continua de onde parou.
 * Devolve o "desligar" (a página que sai antes do minuto não anota nada).
 *
 * Fica fora do `rastrear.ts` de propósito: só a página do produto usa, e o
 * resto da loja não baixa isto.
 */
export function depoisDeUmMinutoNaFrente(fn: () => void, ms = 60_000): () => void {
  let restante = ms
  let desde: number | null = null
  let relogio: ReturnType<typeof setTimeout> | null = null
  const parar = () => {
    if (relogio) clearTimeout(relogio)
    relogio = null
    if (desde !== null) restante -= Date.now() - desde
    desde = null
  }
  const seguir = () => {
    if (restante <= 0 || relogio) return
    desde = Date.now()
    relogio = setTimeout(() => {
      relogio = null
      desde = null
      restante = 0
      document.removeEventListener("visibilitychange", aoMudar)
      fn()
    }, restante)
  }
  const aoMudar = () => (document.visibilityState === "visible" ? seguir() : parar())
  document.addEventListener("visibilitychange", aoMudar)
  if (document.visibilityState === "visible") seguir()
  return () => {
    parar()
    document.removeEventListener("visibilitychange", aoMudar)
  }
}
