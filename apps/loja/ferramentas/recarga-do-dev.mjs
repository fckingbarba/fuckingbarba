/**
 * O AVISO DO REACT QUE O `next dev` CAUSA SOZINHO — e só ele.
 *
 *   const recargaDoDev = vigiarRecargaDoDev(contexto)
 *   contexto.on("console", (m) => m.type() === "error" && !recargaDoDev(m) && erros.push(m.text()))
 *
 * ┌─ O QUE ACONTECE ────────────────────────────────────────────────────────────┐
 * │ Com `cacheComponents`, o `next dev` roda de novo o `generateStaticParams`   │
 * │ da PDP, em segundo plano, a cada pedido de /produtos/<handle>. Quando a     │
 * │ QUANTIDADE de produtos muda — um produto publicado ou apagado; o            │
 * │ conferir-produtos do painel faz os dois —, ele manda "staticParamsChanged"  │
 * │ pelo websocket pra toda aba aberta, e a aba faz um `hmrRefresh()`.          │
 * │                                                                              │
 * │ Se a mensagem chega no meio da hidratação, quem ainda não montou é o        │
 * │ roteador do PRÓPRIO Next (`Router`, em next/dist/client/components/         │
 * │ app-router.js): o `dispatch` dele vai pra uma variável de módulo DURANTE o  │
 * │ render (`use-action-queue.js`), e o `startTransition` do indicador de       │
 * │ render do dev cai numa fibra que o React ainda não montou. Sai no console:  │
 * │ "Can't perform a React state update on a component that hasn't mounted      │
 * │ yet". A pilha, capturada em 24/09 (Next 16.3.5): WebSocket.handleMessage →  │
 * │ processMessage → hmrRefresh → dispatchAppRouterAction → nextDispatch →      │
 * │ startTransition → dispatchOptimisticSetState. Nenhum componente da loja no  │
 * │ caminho — e em produção não existe: sem websocket não há `hmrRefresh`, e o  │
 * │ aviso é só de desenvolvimento.                                              │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * Por isso a exceção é ESTREITA: só esse aviso, só na aba que acabou de receber
 * uma mensagem de recarga do `next dev`, e um por mensagem. O aviso sai no MESMO
 * passo em que a aba trata a mensagem (a pilha vai do `WebSocket.handleMessage`
 * ao `console.error`), então a janela de `JANELA_MS` sobra. O mesmo aviso sem a
 * mensagem — um efeito colateral no render de um componente da loja — continua
 * sendo erro.
 *
 * O que foi descontado fica em `recargaDoDev.descontados`, pro conferidor dizer.
 */

const AVISO = /Can't perform a React state update on a component that hasn't mounted yet/

/** As mensagens do `next dev` que fazem a aba chamar o `hmrRefresh()` (hot-reloader-app.js). */
const RECARGA = /"type":"(staticParamsChanged|serverComponentChanges|addedPage|removedPage)"/

const JANELA_MS = 2000

export function vigiarRecargaDoDev(contexto) {
  /** Aba → quando chegou a última mensagem de recarga que ainda não descontou nada. */
  const recargas = new WeakMap()
  const vigiar = (pagina) =>
    pagina.on("websocket", (ws) => {
      if (!ws.url().includes("/_next/hmr")) return
      ws.on("framereceived", ({ payload }) => {
        if (typeof payload === "string" && RECARGA.test(payload)) recargas.set(pagina, Date.now())
      })
    })
  contexto.pages().forEach(vigiar)
  contexto.on("page", vigiar)

  const descontados = []
  const ehRecargaDoDev = (mensagem) => {
    const pagina = mensagem.page()
    const quando = pagina ? recargas.get(pagina) : undefined
    if (!quando || Date.now() - quando > JANELA_MS || !AVISO.test(mensagem.text())) return false
    recargas.delete(pagina)
    descontados.push(mensagem.text())
    return true
  }
  ehRecargaDoDev.descontados = descontados
  return ehRecargaDoDev
}
