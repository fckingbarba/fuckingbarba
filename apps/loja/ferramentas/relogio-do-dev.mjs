/**
 * A MEDIDA DO REACT QUE O RELÓGIO DO `next dev` QUEBRA — e só ela.
 *
 *   const relogioDoDev = vigiarRelogioDoDev(contexto)
 *   pagina.on("pageerror", (e) => relogioDoDev(e, pagina) || erros.push(e.message))
 *
 * ┌─ O QUE ACONTECE ─────────────────────────────────────────────────────────────┐
 * │ Em desenvolvimento, o React desenha os componentes do servidor no painel     │
 * │ de desempenho do navegador (a trilha "Server Components"). O servidor        │
 * │ manda, pelo canal de depuração do `next dev` (o websocket do HMR), a hora    │
 * │ em que começou a página — a linha ":N", no relógio DELE:                     │
 * │ performance.timeOrigin + performance.now() do processo Node —, e o tempo     │
 * │ de cada componente contado dali. O navegador soma um no outro e desconta o   │
 * │ performance.timeOrigin da página.                                            │
 * │                                                                              │
 * │ O processo Node conta o tempo pelo relógio monotônico desde que subiu, e o   │
 * │ relógio do sistema vai sendo acertado (NTP): um `next dev` no ar há horas    │
 * │ fica atrás do navegador que o conferidor acabou de abrir. Medido em 25/09:   │
 * │ um processo novo se afasta perto de 1 ms por minuto, e dois `next dev` de    │
 * │ três horas estavam 300 a 380 ms atrás. Atrás o bastante, o fim de um         │
 * │ componente cai ANTES do começo da página: tempo negativo.                    │
 * │                                                                              │
 * │ O componente que terminou bem, o React pula (`childrenEndTime >= 0`). O que  │
 * │ deu erro — o `notFound()` da ficha que o marketing não abre — ou foi         │
 * │ abortado não tem essa trava no React 19.2.8: o `performance.measure` leva    │
 * │ o fim negativo e lança "Failed to execute 'measure' on 'Performance':        │
 * │ '<componente>' cannot have a negative time stamp." (react/react#37561, com   │
 * │ as PRs #37563 e #37572 abertas; vercel/next.js#99032). Lança num             │
 * │ setTimeout, então sai como erro não tratado da página. A pilha, capturada    │
 * │ em 25/09 (Next 16.3.5): flushInitialRenderPerformance →                      │
 * │ flushComponentPerformance → flushComponentPerformance, todas no cliente de   │
 * │ RSC do React compilado no Next (react-server-dom-turbopack). Nenhum código   │
 * │ do painel ou da loja no caminho — e em produção não existe: o cliente de     │
 * │ produção do React nem tem esse código, e o painel em `next build` +          │
 * │ `next start`, com o relógio do servidor 3 s atrás, passou no                 │
 * │ conferir-clientes (37/37).                                                   │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * Por isso a exceção é ESTREITA: só essa frase, com o nome que o React dá
 * ao componente do servidor (começa com um espaço de largura zero); só com
 * a pilha inteira no cliente de RSC do React, a partir do
 * `flushInitialRenderPerformance`; só na página cujo servidor disse, pelo
 * canal de depuração, ter começado ANTES de a página começar (o ":N"
 * menor que o timeOrigin dela — com os dois relógios certos, impossível);
 * e uma por página carregada. A mesma frase sem isso continua sendo erro.
 *
 * Pra ver o erro de propósito: suba o `next dev` com um `--require` no
 * `NODE_OPTIONS` que troque o `performance.timeOrigin` do processo por um
 * 3 s menor — a ficha que dá 404 pro marketing dá o erro em toda carga.
 *
 * O que foi descontado vai pra `descontados` (a lista do segundo
 * argumento, se vier), pro conferidor dizer.
 */

const MEDIDA_NEGATIVA =
  /^Failed to execute 'measure' on 'Performance': '\u200b[^']+' cannot have a negative time stamp\.$/

/** O cliente de RSC do React, compilado dentro do Next (o `next dev` do repo é Turbopack). */
const DO_REACT = /\/_next\/static\/chunks\/[^)]*react-server-dom-turbopack/

/** Mensagem binária do HMR do Next com um pedaço do canal de depuração (hot-reloader-types.js). */
const PEDACO_DE_DEPURACAO = 0

export function vigiarRelogioDoDev(contexto, descontados = []) {
  /** Página → a carga atual: o id do pedido, o timeOrigin dela e o ":N" do servidor. */
  const cargas = new WeakMap()
  const novaCarga = (pagina, id) => {
    const carga = { id, origem: undefined, servidor: undefined, descontou: false }
    cargas.set(pagina, carga)
    pagina
      .evaluate(() => performance.timeOrigin)
      .then((origem) => (carga.origem = origem))
      .catch(() => {}) // a página já saiu: sem a origem, nada se desconta
    return carga
  }
  const vigiar = (pagina) =>
    pagina.on("websocket", (ws) => {
      const url = new URL(ws.url())
      const id = url.searchParams.get("id")
      if (url.pathname !== "/_next/hmr" || !id) return
      // Cada página carregada abre o websocket com o id do pedido que a desenhou (e, se ele
      // cair, reabre com o mesmo id).
      const carga = cargas.get(pagina)?.id === id ? cargas.get(pagina) : novaCarga(pagina, id)
      ws.on("framereceived", ({ payload }) => {
        if (carga.servidor !== undefined || typeof payload === "string") return
        if (payload[0] !== PEDACO_DE_DEPURACAO) return
        const tamanho = payload[1]
        if (payload.subarray(2, 2 + tamanho).toString() !== id) return
        const linha = /(?:^|\n):N(\d+(?:\.\d+)?)\n/.exec(payload.subarray(2 + tamanho).toString())
        if (linha) carga.servidor = Number(linha[1])
      })
    })
  contexto.pages().forEach(vigiar)
  contexto.on("page", vigiar)

  const ehRelogioDoDev = (erro, pagina) => {
    const carga = cargas.get(pagina)
    if (!carga || carga.descontou || !MEDIDA_NEGATIVA.test(erro?.message ?? "")) return false
    // O servidor diz que começou a página antes de ela começar: o relógio dele está atrás.
    if (!(carga.servidor < carga.origem)) return false
    const quadros = String(erro.stack ?? "")
      .split("\n")
      .slice(1)
      .map((q) => q.trim())
      .filter((q) => q.startsWith("at "))
    if (!quadros.length || !quadros.every((q) => DO_REACT.test(q))) return false
    if (!quadros.at(-1).startsWith("at flushInitialRenderPerformance ")) return false
    carga.descontou = true
    const atras = Math.round(carga.origem - carga.servidor)
    descontados.push(`${erro.message} (o relógio do next dev pelo menos ${atras} ms atrás)`)
    return true
  }
  ehRelogioDoDev.descontados = descontados
  return ehRelogioDoDev
}
