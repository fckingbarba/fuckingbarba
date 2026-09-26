/**
 * O GOOGLE FALSO — o que o painel usa do Google Analytics: o token da conta
 * de serviço (`POST /token`, o fluxo JWT) e a API de dados do GA4
 * (`batchRunReports` e `runRealtimeReport`), com os números que o
 * conferidor escolher (`painel.dia`).
 *
 * Confere o que o Google confere: o JWT assinado pela chave da conta (RS256,
 * contra a chave pública que o conferidor passa), o escopo só de leitura, o
 * `aud` e a validade de uma hora; o token em cada pergunta; e a propriedade.
 *
 * As datas "today" e "yesterday" das perguntas valem no fuso da
 * propriedade (`painel.fuso`, Brasília se ninguém mudar), e toda resposta
 * diz qual é (`metadata.timeZone`), como a de verdade.
 *
 * O TOKEN VALE ENTRE RODADAS, como o do Google vale uma hora: ele é assinado
 * aqui (HMAC), sem memória — o Medusa guarda o dele de uma rodada pra outra,
 * e um falso novo não pode recusar o token que o anterior deu. Pra testar o
 * token revogado, `painel.revogar()`.
 */

import { createHash, createHmac, verify } from "node:crypto"
import { createServer } from "node:http"

export const PORTA_PADRAO = 4360
const ESCOPO = "https://www.googleapis.com/auth/analytics.readonly"
const HORA_MS = 60 * 60 * 1000

/**
 * `chavePublica`: a da conta (KeyObject); `email`: o `client_email` dela;
 * `aud`: o `token_uri` que vai na chave (o endereço deste falso).
 */
export async function subirGoogleFalso({
  porta = PORTA_PADRAO,
  propriedade,
  chavePublica,
  email,
  aud,
}) {
  const segredo = createHash("sha256")
    .update(chavePublica.export({ type: "spki", format: "der" }))
    .digest()
  const painel = {
    porta,
    /** Quantos tokens este falso deu (o Medusa guarda o dele: poucos). */
    tokensDados: 0,
    /** Os JWTs recusados, com o motivo. */
    jwtsRecusados: [],
    /** Cada pergunta de dados: `{ tipo, corpo, tokenOk }`. */
    perguntas: [],
    /** `null`, ou o status que as perguntas de dados devolvem (403, 500…). */
    recusar: null,
    /** Milissegundos antes de responder as perguntas de dados. */
    demora: 0,
    /**
     * O dia, como o GA4 contaria: `horas` ({ dia: "20260924", hora: "08", visitas }),
     * `origens` ({ fonte, meio, visitas }), `paginas` ({ caminho, vistas }) e
     * `agora` (quem está no site).
     */
    dia: { horas: [], origens: [], paginas: [], agora: 0 },
    /**
     * O Marketing (o Funil e os Canais): as sessões do período (`sessoes`),
     * as sessões com cada evento (`eventos`: { view_item: 600, … }), as
     * compras da loja (`compras`), as sessões por aparelho (`aparelhos`:
     * { mobile, desktop, tablet }), as visitas por origem (`origens`:
     * { fonte, meio, campanha, visitas }) e as vendas por origem (`vendas`:
     * { fonte, meio, campanha, pedidos, receita }).
     */
    marketing: { sessoes: 0, eventos: {}, compras: 0, aparelhos: {}, origens: [], vendas: [] },
    /** O fuso da propriedade: resolve "today"/"yesterday" e vai em `metadata.timeZone`. */
    fuso: "America/Sao_Paulo",
    validosDesde: 0,
  }
  painel.revogar = () => {
    painel.validosDesde = Date.now()
  }

  const tokenDe = (emitido) =>
    `ya29.falso.${emitido}.${createHmac("sha256", segredo).update(String(emitido)).digest("base64url")}`
  const tokenOk = (t) => {
    const m = /^ya29\.falso\.(\d+)\./.exec(t ?? "")
    if (!m) return false
    const emitido = Number(m[1])
    return (
      tokenDe(emitido) === t && emitido >= painel.validosDesde && Date.now() - emitido < HORA_MS
    )
  }

  /** O que o Google recusaria no JWT — ou `null`. */
  function motivoDoJwt(assertion) {
    const partes = String(assertion ?? "").split(".")
    if (partes.length !== 3) return "não é JWT"
    const [c, b, s] = partes
    let cabeca, claims
    try {
      cabeca = JSON.parse(Buffer.from(c, "base64url").toString())
      claims = JSON.parse(Buffer.from(b, "base64url").toString())
    } catch {
      return "JWT ilegível"
    }
    if (cabeca.alg !== "RS256") return `alg ${cabeca.alg}`
    if (!verify("RSA-SHA256", Buffer.from(`${c}.${b}`), chavePublica, Buffer.from(s, "base64url")))
      return "a assinatura não é da chave da conta"
    if (claims.iss !== email) return `iss ${claims.iss}`
    if (claims.scope !== ESCOPO) return `escopo ${claims.scope}`
    if (claims.aud !== aud) return `aud ${claims.aud}`
    const agora = Date.now() / 1000
    if (claims.exp - claims.iat > 3600 || claims.exp < agora || claims.iat > agora + 300)
      return `validade ${claims.iat}–${claims.exp}`
    return null
  }

  const linha = (dimensoes, ...valores) => ({
    dimensionValues: dimensoes.map((value) => ({ value })),
    metricValues: valores.map((v) => ({ value: String(v) })),
  })

  /** Os eventos que a pergunta pediu (o filtro sozinho, ou dentro do `andGroup`). */
  const eventosPedidos = (filtro) => {
    const todos = [filtro, ...(filtro?.andGroup?.expressions ?? [])]
    const doEvento = todos.find((f) => f?.filter?.fieldName === "eventName")
    return doEvento?.filter?.inListFilter?.values ?? null
  }

  /** "today", "yesterday", "13daysAgo" ou "2026-09-24" → "20260924", no fuso da propriedade. */
  const dataDaPergunta = (valor) => {
    const dia = (ms) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: painel.fuso }).format(ms).replace(/-/g, "")
    if (valor === "today") return dia(Date.now())
    if (valor === "yesterday") return dia(Date.now() - 24 * 60 * 60 * 1000)
    const atras = /^(\d+)daysAgo$/.exec(String(valor ?? ""))
    if (atras) return dia(Date.now() - Number(atras[1]) * 24 * 60 * 60 * 1000)
    return String(valor ?? "").replace(/-/g, "")
  }

  /** Um relatório, pelas dimensões pedidas — as três que o painel pergunta. */
  function relatorio(pedido) {
    const dims = (pedido.dimensions ?? []).map((d) => d.name).join(",")
    const periodo = pedido.dateRanges?.[0] ?? {}
    const de = dataDaPergunta(periodo.startDate)
    const ate = dataDaPergunta(periodo.endDate)
    const metricas = (pedido.metrics ?? []).map((m) => m.name).join(",")
    const m = painel.marketing
    let rows = []
    if (dims === "" && metricas === "sessions") rows = [linha([], m.sessoes)]
    else if (dims === "" && metricas === "ecommercePurchases") rows = [linha([], m.compras)]
    else if (dims === "eventName") {
      const pedidos = eventosPedidos(pedido.dimensionFilter)
      rows = Object.entries(m.eventos)
        .filter(([e]) => !pedidos || pedidos.includes(e))
        .map(([e, n]) => linha([e], n))
    } else if (dims === "deviceCategory")
      rows = Object.entries(m.aparelhos).map(([a, n]) => linha([a], n))
    else if (dims === "sessionSource,sessionMedium,sessionCampaignName")
      rows =
        metricas === "sessions"
          ? m.origens.map((o) => linha([o.fonte, o.meio, o.campanha], o.visitas))
          : m.vendas.map((v) => linha([v.fonte, v.meio, v.campanha], v.pedidos, v.receita))
    else if (dims === "date,hour")
      rows = painel.dia.horas
        .filter((h) => h.dia >= de && h.dia <= ate)
        .map((h) => linha([h.dia, h.hora], h.visitas))
    else if (dims === "sessionSource,sessionMedium")
      rows = painel.dia.origens.map((o) => linha([o.fonte, o.meio], o.visitas))
    else if (dims === "pagePath") {
      const prefixo = pedido.dimensionFilter?.filter?.stringFilter?.value ?? ""
      rows = painel.dia.paginas
        .filter((p) => p.caminho.startsWith(prefixo))
        .map((p) => linha([p.caminho], p.vistas))
    }
    return {
      rows,
      rowCount: rows.length,
      metadata: { timeZone: painel.fuso, currencyCode: "BRL" },
      kind: "analyticsData#runReport",
    }
  }

  const servidor = createServer((req, res) => {
    let bruto = ""
    req.on("data", (c) => (bruto += c))
    req.on("end", async () => {
      const json = (status, corpo) => {
        res.writeHead(status, { "content-type": "application/json" })
        res.end(JSON.stringify(corpo))
      }
      const erro = (status, mensagem, situacao) =>
        json(status, { error: { code: status, message: mensagem, status: situacao } })

      if (req.method === "POST" && req.url === "/token") {
        const p = new URLSearchParams(bruto)
        if (p.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer")
          return json(400, { error: "unsupported_grant_type" })
        const motivo = motivoDoJwt(p.get("assertion"))
        if (motivo) {
          painel.jwtsRecusados.push(motivo)
          return json(400, { error: "invalid_grant", error_description: motivo })
        }
        painel.tokensDados++
        return json(200, {
          access_token: tokenDe(Date.now()),
          expires_in: 3599,
          token_type: "Bearer",
        })
      }

      const m = /^\/v1beta\/properties\/([^/:]+):(batchRunReports|runRealtimeReport)$/.exec(
        req.url ?? ""
      )
      if (req.method !== "POST" || !m) return erro(404, "falso: rota desconhecida", "NOT_FOUND")
      const token = (req.headers.authorization ?? "").replace(/^Bearer /, "")
      let corpo = {}
      try {
        corpo = JSON.parse(bruto || "{}")
      } catch {
        return erro(400, "corpo ilegível", "INVALID_ARGUMENT")
      }
      painel.perguntas.push({ tipo: m[2], corpo, tokenOk: tokenOk(token) })
      if (!tokenOk(token))
        return erro(401, "Request had invalid authentication credentials.", "UNAUTHENTICATED")
      if (m[1] !== propriedade)
        return erro(
          403,
          "User does not have sufficient permissions for this property.",
          "PERMISSION_DENIED"
        )
      if (painel.demora) await new Promise((r) => setTimeout(r, painel.demora))
      if (painel.recusar)
        return erro(
          painel.recusar,
          painel.recusar === 403
            ? "Google Analytics Data API has not been used in project loja-local before or it is disabled."
            : "Internal error encountered.",
          painel.recusar === 403 ? "PERMISSION_DENIED" : "INTERNAL"
        )

      if (m[2] === "runRealtimeReport")
        return json(200, {
          rows: painel.dia.agora ? [linha([], painel.dia.agora)] : [],
          metadata: { timeZone: painel.fuso },
          kind: "analyticsData#runRealtimeReport",
        })
      return json(200, {
        reports: (corpo.requests ?? []).map(relatorio),
        kind: "analyticsData#batchRunReports",
      })
    })
  })

  await new Promise((ok, falha) => {
    servidor.once("error", falha)
    servidor.listen(porta, "127.0.0.1", ok)
  })
  painel.fechar = () => new Promise((ok) => servidor.close(() => ok()))
  return painel
}
