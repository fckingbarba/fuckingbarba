import { createHmac, randomBytes, randomUUID } from "node:crypto"
import { createServer } from "node:http"

/**
 * UM MERCADO PAGO DE MENTIRA, pros testes do Pix reserva (0140).
 *
 * Fala o pedaço da API de pagamentos que o backend usa — criar Pix, ler,
 * procurar (pela referência e por data), cancelar e estornar — e deixa o
 * teste mandar no resto: pagar o Pix, avisar (com a assinatura de verdade,
 * ou forjada), envelhecer o QR, derrubar a criação, perder a resposta no
 * meio do caminho, atrasar a busca (a indexação de lá) e segurar um estorno
 * "em processamento".
 *
 * AS REGRAS DELES que o falso também cobra — senão o teste passaria aqui e
 * quebraria lá: token no `Authorization: Bearer`; `X-Idempotency-Key` em
 * todo POST, e a mesma chave devolve o MESMO pagamento (ou estorno); só
 * Pix; validade de 30 minutos a 30 dias; valor com no máximo 2 casas; CPF
 * ou CNPJ do pagador; Pix pago não se cancela; estorno até o que falta.
 *
 * O AVISO vai como o de lá: POST no endereço cadastrado, com
 * `?data.id=<id>&type=payment`, corpo `{ type: "payment", action,
 * data: { id } }` e a assinatura `x-signature: ts=…,v1=<HMAC>` sobre
 * `id:<id>;request-id:<x-request-id>;ts:<ts>;` — ver
 * `apps/backend/src/modules/mercadopago/aviso.ts`.
 *
 * E A CONTA DIVIDIDA COM O MERCADO LIVRE: `semearDoMercadoLivre` põe na
 * conta um pagamento que não é da loja (sem referência de sessão, sem a
 * origem). A listagem traz ele junto — e o teste confere que ninguém mexeu.
 */

export const PORTA_PADRAO = Number(process.env.PORTA_MERCADOPAGO_FALSO || 4360)
export const TOKEN = "TEST-token-do-mercadopago-falso"
export const SEGREDO_DO_AVISO = "segredo-do-aviso-do-mercadopago"

/** Um PNG 1×1 — o `qr_code_base64` que a tela desenha. */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

/** Como a API escreve data: com o fuso de lá (-04:00). */
function dataDeLa(ms = Date.now()) {
  return new Date(ms - 4 * 60 * 60 * 1000).toISOString().replace(/Z$/, "-04:00")
}

/**
 * Sobe o falso e devolve o painel.
 *
 * `aviso`: `{ url, segredo }` — pra onde o aviso vai (no teste, direto no
 * Medusa, `/hooks/payment/mercadopago_mercadopago`) e com que segredo ele é
 * assinado (o `MERCADOPAGO_WEBHOOK_SEGREDO` do backend). `roteiro` troca o
 * comportamento da CRIAÇÃO:
 *
 *   "normal"        cria e responde;
 *   "queda"         500 sem criar nada (o Mercado Pago fora do ar);
 *   "perde"         cria e derruba a conexão sem responder — UMA vez; a
 *                   tentativa seguinte, com a mesma chave, recebe o mesmo;
 *   "perde-sempre"  cria e derruba em toda tentativa: o "incerto".
 */
export async function subirMercadoPagoFalso({ porta = PORTA_PADRAO, aviso = null } = {}) {
  const painel = {
    roteiro: "normal",
    aviso,
    /** id → pagamento */
    pagamentos: new Map(),
    /** chave de idempotência → id do pagamento (ou do estorno) */
    idempotencia: new Map(),
    chamadas: [],
    cancelamentos: [],
    estornos: [],
    avisosEnviados: [],
    /** "normal": o estorno sai na hora; "processando": fica `in_process`; "recusa": 400. */
    modoDosEstornos: "normal",
    /** A busca (`/search`) não enxerga o que nasceu há menos que isto, em ms. */
    atrasoDaBusca: 0,
  }

  let proximoId = 1_700_000_000 + Math.floor(Math.random() * 1_000_000)
  let proximoEstorno = 9_000_000
  const perdidas = new Set()

  const pagamentosEmOrdem = () =>
    [...painel.pagamentos.values()].sort(
      (a, b) => Date.parse(b.date_created) - Date.parse(a.date_created)
    )

  function criar(corpo) {
    const erros = []
    if (corpo?.payment_method_id !== "pix") erros.push("payment_method_id must be pix")
    const valor = corpo?.transaction_amount
    if (typeof valor !== "number" || !(valor > 0) || Math.abs(Math.round(valor * 100) - valor * 100) > 1e-6)
      erros.push("transaction_amount invalid")
    if (!corpo?.payer?.email) erros.push("payer.email is required")
    const doc = corpo?.payer?.identification
    if (!doc || !["CPF", "CNPJ"].includes(doc.type) || !doc.number)
      erros.push("payer.identification invalid")
    const expira = Date.parse(corpo?.date_of_expiration ?? "")
    const minutos = (expira - Date.now()) / 60_000
    if (!Number.isFinite(expira) || minutos < 30 || minutos > 30 * 24 * 60)
      erros.push("date_of_expiration must be between 30 minutes and 30 days")
    if (erros.length)
      return { erro: { message: erros.join("; "), status: 400, error: "bad_request" } }

    const id = proximoId++
    const pagamento = {
      id,
      status: "pending",
      status_detail: "pending_waiting_transfer",
      external_reference: corpo.external_reference ?? null,
      description: corpo.description ?? "",
      transaction_amount: valor,
      transaction_amount_refunded: 0,
      payment_method_id: "pix",
      payment_type_id: "bank_transfer",
      date_created: dataDeLa(),
      date_approved: null,
      date_of_expiration: dataDeLa(expira),
      metadata: corpo.metadata ?? {},
      payer: corpo.payer,
      point_of_interaction: {
        type: "PIX",
        transaction_data: {
          qr_code: `00020126580014br.gov.bcb.pix0136falso-${id}5204000053039865802BR6304ABCD`,
          qr_code_base64: PNG_BASE64,
          ticket_url: `https://www.mercadopago.com.br/payments/${id}/ticket`,
        },
      },
      refunds: [],
    }
    painel.pagamentos.set(id, pagamento)
    return { pagamento }
  }

  async function avisar(id, { forjado = false } = {}) {
    if (!painel.aviso?.url) return null
    const pagamento = painel.pagamentos.get(Number(id))
    const corpo = {
      action: "payment.updated",
      api_version: "v1",
      data: { id: String(id) },
      date_created: dataDeLa(),
      id: Math.floor(Math.random() * 1e12),
      live_mode: false,
      type: "payment",
      user_id: "123456789",
    }
    const requisicao = randomUUID()
    const ts = String(Date.now())
    const manifesto = `id:${String(id).toLowerCase()};request-id:${requisicao};ts:${ts};`
    const segredo = forjado ? "segredo-errado" : (painel.aviso.segredo ?? "")
    const v1 = createHmac("sha256", segredo).update(manifesto).digest("hex")
    const r = await fetch(`${painel.aviso.url}?data.id=${id}&type=payment`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature": `ts=${ts},v1=${v1}`,
        "x-request-id": requisicao,
      },
      body: JSON.stringify(corpo),
    }).catch((e) => ({ status: 0, erro: String(e) }))
    painel.avisosEnviados.push({ id, status: r.status, forjado, situacao: pagamento?.status })
    return r.status
  }

  const servidor = createServer((req, res) => {
    let bruto = ""
    req.on("data", (c) => (bruto += c))
    req.on("end", async () => {
      const url = new URL(req.url, `http://127.0.0.1:${porta}`)
      const caminho = url.pathname
      let corpo = null
      try {
        corpo = bruto ? JSON.parse(bruto) : null
      } catch {
        corpo = null
      }
      const json = (status, dado) => {
        res.writeHead(status, { "content-type": "application/json" })
        res.end(JSON.stringify(dado))
      }
      const chave = req.headers["x-idempotency-key"]
      painel.chamadas.push({ metodo: req.method, caminho, corpo, chave: chave ?? null })

      /* ── os atalhos do teste ──────────────────────────────────────────── */
      const atalho = caminho.match(/^\/__falso\/([a-z-]+)\/(\d+)$/)
      if (atalho && req.method === "POST") {
        const [, acao, id] = atalho
        const p = painel.pagamentos.get(Number(id))
        if (!p) return json(404, { erro: "não existe" })
        if (acao === "pagar") {
          p.status = "approved"
          p.status_detail = "accredited"
          p.date_approved = dataDeLa()
          if (!corpo?.semAviso) setTimeout(() => void avisar(p.id), 100)
        } else if (acao === "vencer") {
          p.status = "cancelled"
          p.status_detail = "expired"
        } else if (acao === "envelhecer") {
          // O QR que passou da validade e que o Mercado Pago ainda não
          // deu por vencido: continua `pending`, com as datas no passado.
          const horaAtras = Date.now() - 60 * 60 * 1000
          p.date_created = dataDeLa(horaAtras - 31 * 60 * 1000)
          p.date_of_expiration = dataDeLa(horaAtras)
        }
        return json(200, p)
      }

      /* ── a API ────────────────────────────────────────────────────────── */
      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        return json(401, { message: "invalid access token", status: 401, error: "unauthorized" })
      }

      if (req.method === "POST" && caminho === "/v1/payments") {
        if (!chave) {
          return json(400, { message: "X-Idempotency-Key header is required", status: 400 })
        }
        const jaVisto = painel.idempotencia.get(`pagamento:${chave}`)
        if (jaVisto && painel.pagamentos.has(jaVisto)) {
          if (painel.roteiro === "perde-sempre") return res.destroy()
          return json(201, painel.pagamentos.get(jaVisto))
        }
        if (painel.roteiro === "queda") {
          return json(500, { message: "internal_error", status: 500 })
        }
        const r = criar(corpo)
        if (r.erro) return json(400, r.erro)
        painel.idempotencia.set(`pagamento:${chave}`, r.pagamento.id)
        if (
          painel.roteiro === "perde-sempre" ||
          (painel.roteiro === "perde" && !perdidas.has(chave))
        ) {
          perdidas.add(chave)
          return res.destroy()
        }
        return json(201, r.pagamento)
      }

      if (req.method === "GET" && caminho === "/v1/payments/search") {
        const q = url.searchParams
        let lista = pagamentosEmOrdem().filter(
          (p) => Date.now() - Date.parse(p.date_created) >= painel.atrasoDaBusca
        )
        const ref = q.get("external_reference")
        if (ref !== null) lista = lista.filter((p) => p.external_reference === ref)
        const desde = q.get("begin_date")
        const relativo = desde?.match(/^NOW-(\d+)DAYS$/)
        if (relativo) {
          const limite = Date.now() - Number(relativo[1]) * 24 * 60 * 60 * 1000
          lista = lista.filter((p) => Date.parse(p.date_created) >= limite)
        } else if (desde) {
          lista = lista.filter((p) => Date.parse(p.date_created) >= Date.parse(desde))
        }
        const limite = Math.min(Number(q.get("limit") ?? 30), 100)
        const offset = Number(q.get("offset") ?? 0)
        return json(200, {
          paging: { total: lista.length, limit: limite, offset },
          results: lista.slice(offset, offset + limite),
        })
      }

      const doPagamento = caminho.match(/^\/v1\/payments\/(\d+)$/)
      if (doPagamento) {
        const p = painel.pagamentos.get(Number(doPagamento[1]))
        if (!p) return json(404, { message: "Payment not found", status: 404, error: "not_found" })
        if (req.method === "GET") return json(200, p)
        if (req.method === "PUT") {
          painel.cancelamentos.push({ id: p.id, status: p.status, pedido: corpo?.status })
          if (corpo?.status !== "cancelled")
            return json(400, { message: "invalid status", status: 400 })
          if (p.status !== "pending" && p.status !== "in_process") {
            return json(400, {
              message: `Payment status ${p.status} can not be cancelled`,
              status: 400,
            })
          }
          p.status = "cancelled"
          p.status_detail = "by_collector"
          return json(200, p)
        }
      }

      const estornando = caminho.match(/^\/v1\/payments\/(\d+)\/refunds\/?$/)
      if (estornando) {
        const p = painel.pagamentos.get(Number(estornando[1]))
        if (!p) return json(404, { message: "Payment not found", status: 404 })
        if (req.method === "GET") return json(200, p.refunds)
        if (req.method === "POST") {
          if (!chave) {
            return json(400, { message: "X-Idempotency-Key header is required", status: 400 })
          }
          const jaVisto = painel.idempotencia.get(`estorno:${chave}`)
          const repetido = jaVisto ? p.refunds.find((r) => r.id === jaVisto) : null
          if (repetido) return json(201, repetido)
          if (p.status !== "approved") {
            return json(400, {
              message: `Payment status ${p.status} can not be refunded`,
              status: 400,
            })
          }
          if (painel.modoDosEstornos === "recusa") {
            return json(400, { message: "insufficient_amount", status: 400 })
          }
          const resta =
            Math.round((p.transaction_amount - p.transaction_amount_refunded) * 100) / 100
          const valor = corpo?.amount ?? resta
          if (!(valor > 0) || valor > resta + 0.001) {
            return json(400, { message: "amount exceeds available", status: 400 })
          }
          const estorno = {
            id: proximoEstorno++,
            payment_id: p.id,
            amount: valor,
            status: painel.modoDosEstornos === "processando" ? "in_process" : "approved",
            date_created: dataDeLa(),
          }
          p.refunds.push(estorno)
          painel.idempotencia.set(`estorno:${chave}`, estorno.id)
          painel.estornos.push({ pagamento: p.id, valor, chave, status: estorno.status })
          if (estorno.status === "approved") {
            p.transaction_amount_refunded =
              Math.round((p.transaction_amount_refunded + valor) * 100) / 100
            if (p.transaction_amount_refunded >= p.transaction_amount) {
              p.status = "refunded"
              p.status_detail = "refunded"
            }
          }
          return json(201, estorno)
        }
      }

      json(404, { message: "falso: rota desconhecida", caminho })
    })
  })

  await new Promise((r) => servidor.listen(porta, "127.0.0.1", r))
  painel.porta = porta
  painel.url = `http://127.0.0.1:${porta}`
  painel.fechar = () => servidor.close()

  const atalho =
    (acao) =>
    async (id, opcoes = {}) =>
      (
        await fetch(`http://127.0.0.1:${porta}/__falso/${acao}/${id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(opcoes),
        })
      ).json()
  /** O Pix pago — com o aviso, ou `{ semAviso: true }` (quem descobre é a conciliação). */
  painel.pagar = atalho("pagar")
  /** O Mercado Pago dá o Pix por vencido (`cancelled`, `expired`). */
  painel.vencer = atalho("vencer")
  /** O QR passou da validade e continua `pending` lá. */
  painel.envelhecer = atalho("envelhecer")
  /** Manda de novo o aviso de um pagamento — ou forjado, com outro segredo. */
  painel.avisar = (id, opcoes) => avisar(id, opcoes)
  /** O pagamento que nasceu da sessão `payses_…`. */
  painel.daSessao = (codigo) =>
    pagamentosEmOrdem().find((p) => p.external_reference === codigo) ?? null
  /**
   * Um pagamento de OUTRO canal na mesma conta — uma venda do Mercado Livre,
   * já paga (ou do jeito que o teste pedir). Ninguém da loja pode tocar nele.
   */
  painel.semearDoMercadoLivre = (extra = {}) => {
    const id = proximoId++
    const pagamento = {
      id,
      status: "approved",
      status_detail: "accredited",
      external_reference: `2000${randomBytes(4).readUInt32BE(0)}`,
      transaction_amount: 89.9,
      transaction_amount_refunded: 0,
      payment_method_id: "pix",
      date_created: dataDeLa(Date.now() - 60 * 60 * 1000),
      date_approved: dataDeLa(Date.now() - 50 * 60 * 1000),
      date_of_expiration: null,
      metadata: {},
      refunds: [],
      ...extra,
    }
    painel.pagamentos.set(id, pagamento)
    return pagamento
  }
  /** Um Pix DA LOJA cuja sessão sumiu: a referência e a origem, sem sessão no banco. */
  painel.semearOrfao = ({ referencia, origem, status = "approved", valor = 50 }) => {
    const id = proximoId++
    const pagamento = {
      id,
      status,
      status_detail: status === "approved" ? "accredited" : "pending_waiting_transfer",
      external_reference: referencia,
      transaction_amount: valor,
      transaction_amount_refunded: 0,
      payment_method_id: "pix",
      date_created: dataDeLa(Date.now() - 40 * 60 * 1000),
      date_approved: status === "approved" ? dataDeLa(Date.now() - 35 * 60 * 1000) : null,
      date_of_expiration: dataDeLa(Date.now() + 60 * 60 * 1000),
      metadata: { origem, sessao: referencia },
      point_of_interaction: {
        transaction_data: { qr_code: `orfao-${id}`, qr_code_base64: PNG_BASE64 },
      },
      refunds: [],
    }
    painel.pagamentos.set(id, pagamento)
    return pagamento
  }

  return painel
}

/* `node ferramentas/mercadopago-falso.mjs` sobe sozinho, pra testar à mão. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const painel = await subirMercadoPagoFalso({
    aviso: process.env.WEBHOOK_URL
      ? {
          url: process.env.WEBHOOK_URL,
          segredo: process.env.MERCADOPAGO_WEBHOOK_SEGREDO ?? SEGREDO_DO_AVISO,
        }
      : null,
  })
  console.log(`Mercado Pago falso em ${painel.url} (token ${TOKEN})`)
}
