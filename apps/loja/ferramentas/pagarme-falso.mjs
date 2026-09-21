import { randomBytes } from "node:crypto"
import { createServer } from "node:http"

/**
 * UM PAGAR.ME DE MENTIRA, pros testes.
 *
 * Fala o pedaço da API v5 que a loja usa — tokenizar cartão, criar pedido,
 * ler pedido, procurar por código, cancelar cobrança — e deixa o teste
 * mandar no resto: pagar um Pix, recusar um cartão, envelhecer um QR,
 * perder uma resposta no meio do caminho.
 *
 * A listagem (`GET /orders`) filtra por `code` e por `created_since` e pagina
 * com `paging.next`, como a deles — é por ela que a conciliação acha as
 * cobranças órfãs. `envelhecer` põe o pedido uma hora no passado: o QR
 * vence, e o pedido fica velho o bastante pra ser chamado de órfão.
 *
 * ┌─ POR QUE NÃO O SANDBOX DE VERDADE ─────────────────────────────────────┐
 * │ O sandbox do Pagar.me paga sozinho todo Pix até R$ 500, segundos       │
 * │ depois de criado. Isso impede exatamente o que mais importa testar: o  │
 * │ Pix que NÃO foi pago, o que venceu, o aviso que não chegou. E não dá   │
 * │ pra pedir a ele que perca uma resposta — que é o caso "cobrou ou não   │
 * │ cobrou?", o único em que a loja pode ficar com dinheiro sem pedido.    │
 * │                                                                         │
 * │ O sandbox continua sendo o ensaio geral antes da produção (a chave de  │
 * │ teste no Railway). Este arquivo é pra quebrar as coisas de propósito.  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * AS REGRAS DO FALSO são as que a documentação deles publica pro simulador,
 * pra que um teste escrito aqui continue fazendo sentido no sandbox:
 *
 *   cartão 4000000000000010 → aprovado      4000000000000028 → recusado
 *   cartão 4000000000000036 → em análise (o teste decide o fim)
 *   CPF 11111111111         → recusado pela antifraude
 *   Pix acima de R$ 500     → falha na criação
 *
 * E o que a API deles exige e o falso também exige — senão o teste passaria
 * aqui e quebraria lá: token de cartão vale 60 segundos e UMA vez; tokenizar
 * com cabeçalho `Authorization` é recusado; cartão sem endereço de cobrança
 * é recusado; item sem `code` é recusado; o total do pedido é a soma dos
 * itens mais o frete, e o pagamento tem que bater com ele.
 */

export const PORTA_PADRAO = Number(process.env.PORTA_PAGARME_FALSO || 4320)
export const CHAVE_SECRETA = "sk_test_falsa"
export const CHAVE_PUBLICA = "pk_test_falsa"

export const CARTOES = {
  aprovado: "4000000000000010",
  recusado: "4000000000000028",
  analise: "4000000000000036",
}
export const CPF_DA_ANTIFRAUDE = "11111111111"

/** Um PNG 1×1 — o suficiente pro `<img>` do QR ter o que carregar. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
)

const id = (prefixo) => `${prefixo}_${randomBytes(8).toString("hex")}`
const agora = () => new Date().toISOString()

function bandeira(numero) {
  if (/^4/.test(numero)) return "Visa"
  if (/^5[1-5]/.test(numero)) return "Mastercard"
  if (/^3[47]/.test(numero)) return "Amex"
  return "Elo"
}

/**
 * Sobe o falso e devolve o painel.
 *
 * `webhook` é pra onde ele manda o aviso quando um pagamento muda — no teste,
 * direto pro Medusa, com o cabeçalho que a Edge Function poria. `roteiro`
 * troca o comportamento da criação de pedido:
 *
 *   "normal"        cria e responde;
 *   "queda"         500 sem criar nada;
 *   "perde"         cria o pedido e derruba a conexão sem responder;
 *   "perde-atrasa"  derruba a conexão e só cria o pedido 9 segundos depois
 *                   (depois de o backend desistir de procurar) — é o
 *                   "incerto" de verdade, que só a conciliação resolve.
 */
export async function subirPagarmeFalso({ porta = PORTA_PADRAO, webhook = null } = {}) {
  const painel = {
    roteiro: "normal",
    webhook,
    /** token → { numero, cvv, nome, criado, usado } */
    tokens: new Map(),
    /** id do pedido → { corpo, pedido } */
    pedidos: new Map(),
    /** Toda chamada que chegou, pra conferir quem falou o quê. */
    chamadas: [],
    cancelamentos: [],
    webhooksEnviados: [],
  }

  const cobrancaDo = (pedido) => pedido.charges[0]

  function mudar(pedido, status, transacao) {
    const c = cobrancaDo(pedido)
    pedido.status =
      status === "paid"
        ? "paid"
        : status === "canceled"
          ? "canceled"
          : status === "failed"
            ? "failed"
            : "pending"
    c.status = status
    if (status === "paid") {
      c.paid_amount = c.amount
      c.paid_at = agora()
    }
    Object.assign(c.last_transaction, transacao)
    pedido.updated_at = agora()
  }

  async function avisar(pedido, tipo) {
    if (!painel.webhook?.url) return null
    const corpo = {
      id: id("hook"),
      account: { id: "acc_falsa", name: "FuckingBarba (falso)" },
      type: tipo,
      created_at: agora(),
      data: pedido,
    }
    const cabecalhos = { "content-type": "application/json" }
    if (painel.webhook.segredo !== undefined)
      cabecalhos["x-webhook-segredo"] = painel.webhook.segredo
    const r = await fetch(painel.webhook.url, {
      method: "POST",
      headers: cabecalhos,
      body: JSON.stringify(corpo),
    }).catch((e) => ({ status: 0, erro: String(e) }))
    painel.webhooksEnviados.push({ tipo, pedido: pedido.id, status: r.status })
    return r.status
  }

  function criarPedido(corpo) {
    const erros = {}
    const itens = Array.isArray(corpo.items) ? corpo.items : []
    if (!itens.length) erros["order.items"] = ["obrigatório"]
    itens.forEach((it, i) => {
      if (!Number.isInteger(it.amount) || it.amount <= 0)
        erros[`order.items[${i}].amount`] = ["> 0"]
      if (!Number.isInteger(it.quantity) || it.quantity <= 0)
        erros[`order.items[${i}].quantity`] = ["> 0"]
      if (typeof it.code !== "string" || !it.code) erros[`order.items[${i}].code`] = ["obrigatório"]
    })
    const cli = corpo.customer ?? {}
    for (const campo of ["name", "email", "document", "type", "document_type"]) {
      if (!cli[campo]) erros[`order.customer.${campo}`] = ["obrigatório"]
    }
    if (!cli.phones?.mobile_phone && !cli.phones?.home_phone)
      erros["order.customer.phones"] = ["obrigatório"]
    if (!cli.address?.line_1 || !cli.address?.zip_code)
      erros["order.customer.address"] = ["obrigatório"]
    if (String(cli.name ?? "").length > 64) erros["order.customer.name"] = ["máx. 64"]
    if (String(cli.email ?? "").length > 64) erros["order.customer.email"] = ["máx. 64"]

    const pagamento = Array.isArray(corpo.payments) ? corpo.payments[0] : null
    if (!pagamento) erros["order.payments"] = ["obrigatório"]

    const total =
      itens.reduce((s, it) => s + (it.amount ?? 0) * (it.quantity ?? 0), 0) +
      (corpo.shipping?.amount ?? 0)
    if (pagamento?.amount !== undefined && pagamento.amount !== total) {
      erros["order.payments[0].amount"] = [`${pagamento.amount} ≠ total ${total}`]
    }

    let cartao = null
    if (pagamento?.payment_method === "credit_card") {
      const cc = pagamento.credit_card ?? {}
      if (!cc.card?.billing_address?.line_1) {
        erros["order.payments[0].credit_card.card.billing_address"] = ["obrigatório com token"]
      }
      if (String(cc.statement_descriptor ?? "").length > 13) {
        erros["order.payments[0].credit_card.statement_descriptor"] = ["máx. 13 no PSP"]
      }
      const t = painel.tokens.get(cc.card_token)
      if (!t) erros["order.payments[0].credit_card.card_token"] = ["token inválido"]
      else if (t.usado) erros["order.payments[0].credit_card.card_token"] = ["token já usado"]
      else if (Date.now() - t.criado > 60_000)
        erros["order.payments[0].credit_card.card_token"] = ["token vencido"]
      else cartao = t
    } else if (pagamento && pagamento.payment_method !== "pix") {
      erros["order.payments[0].payment_method"] = ["desconhecido"]
    }

    if (Object.keys(erros).length)
      return { erro: { message: "The request is invalid.", errors: erros } }
    if (cartao) cartao.usado = true

    const pedidoId = id("or")
    const cobranca = {
      id: id("ch"),
      code: corpo.code,
      amount: total,
      status: "pending",
      currency: "BRL",
      payment_method: pagamento.payment_method,
      created_at: agora(),
      order: { id: pedidoId, code: corpo.code },
      last_transaction: { id: id("tran"), transaction_type: pagamento.payment_method },
    }
    const pedido = {
      id: pedidoId,
      code: corpo.code,
      amount: total,
      currency: "BRL",
      closed: true,
      status: "pending",
      created_at: agora(),
      updated_at: agora(),
      customer: { id: id("cus"), name: cli.name, email: cli.email },
      metadata: corpo.metadata ?? null,
      charges: [cobranca],
    }
    const t = cobranca.last_transaction

    if (pagamento.payment_method === "pix") {
      if (total > 50_000) {
        mudar(pedido, "failed", { status: "failed", success: false })
      } else {
        Object.assign(t, {
          status: "waiting_payment",
          qr_code: `00020101021226840014br.gov.bcb.pix2562pix-falso.invalid/${pedidoId}5204000053039865406${(total / 100).toFixed(2)}5802BR`,
          qr_code_url: `http://127.0.0.1:${painel.porta}/qr/${t.id}.png`,
          expires_at: new Date(
            Date.now() + (pagamento.pix?.expires_in ?? 3600) * 1000
          ).toISOString(),
        })
      }
    } else {
      Object.assign(t, {
        installments: pagamento.credit_card.installments ?? 1,
        statement_descriptor: pagamento.credit_card.statement_descriptor,
        card: {
          brand: bandeira(cartao.numero),
          last_four_digits: cartao.numero.slice(-4),
          first_six_digits: cartao.numero.slice(0, 6),
        },
      })
      if (cli.document === CPF_DA_ANTIFRAUDE) {
        mudar(pedido, "failed", {
          status: "failed",
          antifraud_response: { status: "reproved", return_message: "reprovado" },
        })
      } else if (cartao.numero === CARTOES.recusado || cartao.cvv?.startsWith("6")) {
        mudar(pedido, "failed", {
          status: "not_authorized",
          acquirer_message: "Transação não autorizada",
          acquirer_return_code: "51",
        })
      } else if (cartao.numero === CARTOES.analise) {
        mudar(pedido, "pending", { status: "authorized_pending_capture" })
        cobranca.status = "processing"
      } else {
        mudar(pedido, "paid", {
          status: "captured",
          acquirer_message: "Transação capturada com sucesso",
        })
      }
    }

    painel.pedidos.set(pedidoId, { corpo, pedido })
    return { pedido }
  }

  const servidor = createServer((req, res) => {
    let bruto = ""
    req.on("data", (p) => (bruto += p))
    req.on("end", async () => {
      const url = new URL(req.url, "http://falso")
      const caminho = url.pathname
      let corpo = null
      try {
        corpo = bruto ? JSON.parse(bruto) : null
      } catch {
        corpo = null
      }
      painel.chamadas.push({
        metodo: req.method,
        caminho,
        autorizacao: req.headers.authorization ?? null,
      })

      const cors = {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
      }
      const json = (status, dados, extra = {}) => {
        res.writeHead(status, { "content-type": "application/json", ...extra })
        res.end(JSON.stringify(dados))
      }

      /* ── o que o navegador chama ─────────────────────────────────────── */

      if (req.method === "OPTIONS") {
        res.writeHead(204, cors).end()
        return
      }

      if (caminho.startsWith("/qr/")) {
        res.writeHead(200, { "content-type": "image/png" }).end(PNG)
        return
      }

      if (req.method === "POST" && caminho === "/core/v5/tokens") {
        // As duas regras que o Pagar.me aplica e que protegem a chave
        // secreta: só a PÚBLICA, e só na query string.
        if (req.headers.authorization) {
          json(401, { message: "Authorization header is not allowed" }, cors)
          return
        }
        if (!String(url.searchParams.get("appId") ?? "").startsWith("pk_")) {
          json(401, { message: "appId inválido" }, cors)
          return
        }
        const c = corpo?.card ?? {}
        const numero = String(c.number ?? "").replace(/\D/g, "")
        if (numero.length < 13 || numero.length > 19 || !c.exp_month || !c.exp_year) {
          json(
            422,
            { message: "The request is invalid.", errors: { "request.card": ["inválido"] } },
            cors
          )
          return
        }
        const token = id("token")
        painel.tokens.set(token, {
          numero,
          cvv: String(c.cvv ?? ""),
          nome: c.holder_name,
          criado: Date.now(),
          usado: false,
        })
        json(
          200,
          {
            id: token,
            type: "card",
            created_at: agora(),
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            card: {
              last_four_digits: numero.slice(-4),
              holder_name: c.holder_name,
              exp_month: Number(c.exp_month),
              exp_year: Number(c.exp_year),
              brand: bandeira(numero),
            },
          },
          cors
        )
        return
      }

      /* ── o controle do teste ─────────────────────────────────────────── */

      if (caminho.startsWith("/__falso/")) {
        const [, , acao, alvo] = caminho.split("/")
        const registro = alvo ? painel.pedidos.get(alvo) : null
        if (acao === "roteiro") {
          painel.roteiro = corpo?.roteiro ?? "normal"
          json(200, { roteiro: painel.roteiro })
          return
        }
        if (!registro) {
          json(404, { erro: "pedido desconhecido" })
          return
        }
        const { pedido } = registro
        if (acao === "pagar") {
          mudar(pedido, "paid", {
            status: pedido.charges[0].payment_method === "pix" ? "paid" : "captured",
          })
          const status = corpo?.semAviso ? null : await avisar(pedido, "order.paid")
          json(200, { pedido, aviso: status })
          return
        }
        if (acao === "recusar") {
          mudar(pedido, "failed", { status: "not_authorized" })
          const status = corpo?.semAviso ? null : await avisar(pedido, "order.payment_failed")
          json(200, { pedido, aviso: status })
          return
        }
        if (acao === "envelhecer") {
          // Uma hora atrás: o QR venceu, e o pedido passou da idade em que a
          // conciliação já pode chamá-lo de órfão.
          const antes = new Date(Date.now() - 60 * 60 * 1000).toISOString()
          pedido.charges[0].last_transaction.expires_at = antes
          pedido.created_at = antes
          pedido.charges[0].created_at = antes
          json(200, { pedido })
          return
        }
        json(404, { erro: "ação desconhecida" })
        return
      }

      /* ── o que o backend chama, com a chave secreta ──────────────────── */

      const esperado = `Basic ${Buffer.from(`${CHAVE_SECRETA}:`).toString("base64")}`
      if (req.headers.authorization !== esperado) {
        json(401, { message: "Authorization has been denied for this request." })
        return
      }

      if (req.method === "POST" && caminho === "/core/v5/orders") {
        if (painel.roteiro === "queda") {
          json(500, { message: "An error has occurred." })
          return
        }
        if (painel.roteiro === "perde-atrasa") {
          setTimeout(() => criarPedido(corpo), 9_000)
          req.socket.destroy()
          return
        }
        const { pedido, erro } = criarPedido(corpo)
        if (erro) {
          json(422, erro)
          return
        }
        if (painel.roteiro === "perde") {
          req.socket.destroy()
          return
        }
        json(200, pedido)
        return
      }

      if (req.method === "GET" && caminho === "/core/v5/orders") {
        // Como a listagem deles: filtros por código e por data de criação,
        // mais novos primeiro, em páginas, com `paging.next` quando há mais.
        const codigo = url.searchParams.get("code")
        const desde = Date.parse(url.searchParams.get("created_since") ?? "")
        const pagina = Math.max(1, Number(url.searchParams.get("page")) || 1)
        const tamanho = Math.min(30, Math.max(1, Number(url.searchParams.get("size")) || 10))
        const achados = [...painel.pedidos.values()]
          .map((r) => r.pedido)
          .filter((p) => !codigo || p.code === codigo)
          .filter((p) => !Number.isFinite(desde) || Date.parse(p.created_at) >= desde)
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        const fatia = achados.slice((pagina - 1) * tamanho, pagina * tamanho)
        const mais = pagina * tamanho < achados.length
        json(200, {
          data: fatia,
          paging: {
            total: achados.length,
            ...(mais ? { next: `${painel.url}/orders?page=${pagina + 1}&size=${tamanho}` } : {}),
          },
        })
        return
      }

      const lendo = caminho.match(/^\/core\/v5\/orders\/([^/]+)$/)
      if (req.method === "GET" && lendo) {
        const registro = painel.pedidos.get(lendo[1])
        if (!registro) json(404, { message: "Order not found" })
        else json(200, registro.pedido)
        return
      }

      const cancelando = caminho.match(/^\/core\/v5\/charges\/([^/]+)$/)
      if (req.method === "DELETE" && cancelando) {
        const registro = [...painel.pedidos.values()].find(
          (r) => cobrancaDo(r.pedido).id === cancelando[1]
        )
        if (!registro) {
          json(404, { message: "Charge not found" })
          return
        }
        const c = cobrancaDo(registro.pedido)
        const valor = corpo?.amount ?? c.amount
        painel.cancelamentos.push({
          cobranca: c.id,
          pedido: registro.pedido.id,
          status: c.status,
          valor,
        })
        if (c.status === "paid") {
          c.refunded_amount = (c.refunded_amount ?? 0) + valor
          if (c.refunded_amount >= c.amount) {
            c.status = "refunded"
            c.last_transaction.status = "refunded"
          }
        } else {
          c.status = "canceled"
          registro.pedido.status = "canceled"
          c.last_transaction.status = "canceled"
        }
        json(200, c)
        return
      }

      json(404, { message: "falso: rota desconhecida", caminho })
    })
  })

  await new Promise((r) => servidor.listen(porta, "127.0.0.1", r))
  painel.porta = porta
  painel.url = `http://127.0.0.1:${porta}/core/v5`
  painel.fechar = () => servidor.close()

  /** Atalhos pro teste, sem passar por HTTP. */
  painel.pedidoPorCodigo = (codigo) =>
    [...painel.pedidos.values()].find((r) => r.pedido.code === codigo) ?? null
  painel.pagar = async (pedidoId, { semAviso = false } = {}) => {
    const r = await fetch(`http://127.0.0.1:${porta}/__falso/pagar/${pedidoId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ semAviso }),
    })
    return r.json()
  }
  painel.envelhecer = async (pedidoId) =>
    (
      await fetch(`http://127.0.0.1:${porta}/__falso/envelhecer/${pedidoId}`, { method: "POST" })
    ).json()

  return painel
}

/* `node ferramentas/pagarme-falso.mjs` sobe sozinho, pra testar à mão. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const painel = await subirPagarmeFalso({
    webhook: process.env.WEBHOOK_URL
      ? { url: process.env.WEBHOOK_URL, segredo: process.env.MEDUSA_WEBHOOK_SEGREDO ?? "" }
      : null,
  })
  console.log(`Pagar.me falso em ${painel.url} (chave ${CHAVE_SECRETA} / ${CHAVE_PUBLICA})`)
}
