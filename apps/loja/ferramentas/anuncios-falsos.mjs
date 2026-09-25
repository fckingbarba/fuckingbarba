import { createServer } from "node:http"

/**
 * A META, O GA4 E O TIKTOK DE MENTIRA, pros testes da compra pelo servidor
 * (`apps/backend/src/lib/anuncios/`). Um servidor só, com as três rotas:
 *
 * - `POST /v26.0/<pixel>/events?access_token=…` — a API de Conversões da Meta;
 * - `POST /mp/collect?measurement_id=…&api_secret=…` — o Measurement Protocol;
 * - `POST /open_api/v1.3/event/track/` (cabeçalho `Access-Token`) — a Events API.
 *
 * GUARDA o que chega em `recebidos` (`{ plataforma, codigo, chave, corpo }`)
 * e responde como a de verdade. O backend precisa subir apontando pra cá:
 *   META_GRAPH_URL=http://127.0.0.1:4370 GA4_MP_URL=http://127.0.0.1:4370
 *   TIKTOK_EVENTS_URL=http://127.0.0.1:4370 META_CAPI_TOKEN=token-de-teste
 *   GA4_API_SECRET=segredo-de-teste TIKTOK_EVENTS_TOKEN=token-de-teste
 *
 * `roteiro.<plataforma>` muda a resposta: "cair" (500, a próxima rodada tenta
 * de novo) ou "recusar" (a chave errada: a Meta com o erro 190, o TikTok com
 * o código 40001 — a loja desiste e grava a recusa).
 */

export const PORTA_PADRAO = Number(process.env.PORTA_ANUNCIOS || 4370)

export async function subirAnunciosFalsos({ porta = PORTA_PADRAO } = {}) {
  const recebidos = []
  const roteiro = { meta: null, ga4: null, tiktok: null }

  const servidor = createServer((req, res) => {
    let texto = ""
    req.on("data", (c) => (texto += c))
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://falso")
      const responder = (status, corpo) => {
        res.writeHead(status, { "content-type": "application/json" })
        res.end(corpo === undefined ? "" : JSON.stringify(corpo))
      }
      let corpo = null
      try {
        corpo = JSON.parse(texto)
      } catch {
        // o que não é JSON a plataforma recusa
      }

      const meta = /^\/v\d+\.\d+\/(\d+)\/events$/.exec(url.pathname)
      if (req.method === "POST" && meta) {
        if (roteiro.meta === "cair") return responder(500, { error: { code: 2, message: "caiu" } })
        if (roteiro.meta === "recusar" || !url.searchParams.get("access_token"))
          return responder(400, {
            error: { code: 190, message: "Invalid OAuth access token", type: "OAuthException" },
          })
        if (!Array.isArray(corpo?.data))
          return responder(400, { error: { code: 100, message: "data é obrigatório" } })
        recebidos.push({
          plataforma: "meta",
          codigo: meta[1],
          chave: url.searchParams.get("access_token"),
          corpo,
        })
        return responder(200, { events_received: corpo.data.length, messages: [], fbtrace_id: "x" })
      }

      if (req.method === "POST" && url.pathname === "/mp/collect") {
        if (roteiro.ga4 === "cair") return responder(500, {})
        // Como o de verdade: 2xx até pro que está errado (quem valida é o /debug).
        recebidos.push({
          plataforma: "ga4",
          codigo: url.searchParams.get("measurement_id"),
          chave: url.searchParams.get("api_secret"),
          corpo,
        })
        return responder(204)
      }

      if (req.method === "POST" && url.pathname === "/open_api/v1.3/event/track/") {
        if (roteiro.tiktok === "cair") return responder(500, { code: 50000, message: "caiu" })
        const chave = req.headers["access-token"] ?? ""
        if (!chave) return responder(200, { code: 40104, message: "Access token is empty" })
        if (roteiro.tiktok === "recusar")
          return responder(200, { code: 40001, message: "No permission to operate" })
        if (!Array.isArray(corpo?.data))
          return responder(200, { code: 40002, message: "data é obrigatório" })
        recebidos.push({ plataforma: "tiktok", codigo: corpo.event_source_id, chave, corpo })
        return responder(200, { code: 0, message: "OK", request_id: "x", data: {} })
      }

      responder(404, { message: "rota que o falso dos anúncios não conhece" })
    })
  })

  await new Promise((ok, falha) => {
    servidor.once("error", falha)
    servidor.listen(porta, "127.0.0.1", ok)
  })

  return {
    porta,
    recebidos,
    roteiro,
    /** O que chegou pra este pedido, por plataforma (o id do pedido vai em cada evento). */
    doPedido: (pedidoId) =>
      recebidos.filter((r) => JSON.stringify(r.corpo ?? {}).includes(`"${pedidoId}"`)),
    fechar: () => new Promise((ok) => servidor.close(ok)),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const falso = await subirAnunciosFalsos()
  console.log(`Anúncios falsos ouvindo em http://127.0.0.1:${falso.porta} — Ctrl+C pra parar`)
}
