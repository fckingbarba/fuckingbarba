import { randomBytes } from "node:crypto"
import { createServer } from "node:http"

/**
 * UM PAGAR.ME DE MENTIRA, pros testes.
 *
 * Fala o pedaço da API v5 que a loja usa — tokenizar cartão, criar pedido,
 * ler pedido, procurar por código, ler e cancelar cobrança — e deixa o teste
 * mandar no resto: pagar um Pix, recusar um cartão, envelhecer um QR,
 * perder uma resposta no meio do caminho, segurar um estorno e fazer ele
 * falhar (o Pix sem saldo).
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
 *   DELETE em Pix pendente  → 412, sempre (nem vencido cancela)
 *
 * O CARTÃO SÓ AUTORIZADO (`auth_only`, que é o que a loja manda): "aprovado"
 * nasce autorizado e com a análise de fraude aprovada, esperando a cobrança
 * — `POST /charges/:id/capture`, que o backend faz, e que fica anotada em
 * `capturas` (com o que a análise dizia na hora). "Em análise" nasce
 * autorizado com a análise pendente: o teste decide com `aprovarAnalise` e
 * `reprovarAnalise` (que avisam como o Pagar.me avisa, `charge.antifraud_*`),
 * ou deixa o falso decidir sozinho uns segundos depois, com
 * `decisaoDaAnalise` — é assim que se testa a espera do checkout. Reprovada,
 * a reserva é desfeita (`voided`, com o `canceled_amount` do valor inteiro:
 * reserva desfeita não é estorno, e o backend não pode confundir). Com
 * `auth_and_capture`, o falso segue cobrando na criação, como antes.
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
    /** Toda cobrança de cartão autorizado: { cobranca, pedido, valor, analise, recusada }. */
    capturas: [],
    /**
     * A ANÁLISE QUE SE DECIDE SOZINHA, pro próximo cartão "em análise":
     * `{ depoisDe: ms, resultado: "aprova" | "reprova" }`. `null` é o teste
     * decidir. Vale pra um pedido só: o falso zera depois de usar.
     */
    decisaoDaAnalise: null,
    webhooksEnviados: [],
    /**
     * "normal": o estorno sai na hora. "segura": o estorno fica "aguardando
     * cancelamento" (`pending_cancellation`) até o teste mandar falhar ou
     * concluir — é o Pix sem saldo do primeiro pedido real.
     */
    estornos: "normal",
    /** cobrança → centavos pedidos, enquanto o estorno está segurado. */
    estornosSegurados: new Map(),
    /**
     * A VALIDADE DO PIX, EM SEGUNDOS, por cima do `expires_in` que o backend
     * pede. `null` é não mandar nada. Serve pro teste fazer um Pix que vence
     * em segundos — o `envelhecer` empurra o pedido inteiro pro passado, e
     * às vezes o que o teste quer é só o QR vencendo com a tela aberta, com
     * o pedido recém-nascido.
     */
    validadeDoPix: null,
    /**
     * A BUSCA POR CÓDIGO LENTA (`GET /orders?code=`), em ms — é a pergunta que
     * o provedor faz a cada autorização. Com ela, dois caminhos autorizando a
     * mesma sessão chegam juntos no provedor: é assim que o conferidor
     * reproduz a corrida do "Check status" com o aviso (24/09). `0` é normal.
     */
    atrasoNaBusca: 0,
    /**
     * O PRÓXIMO CANCELAMENTO QUE NÃO PASSA: `"412"` (o Pagar.me dizendo "ainda
     * não") ou `"queda"` (500). Vale pra um `DELETE` só — o falso zera depois
     * de usar. É o cancelamento do cartão em análise que falha na hora do
     * pedido cancelado.
     */
    proximoCancelamento: null,
  }

  const cobrancaDo = (pedido) => pedido.charges[0]

  /** O estorno acontecendo de fato: o dinheiro volta e a cobrança conta. */
  function devolver(c, valor) {
    c.refunded_amount = (c.refunded_amount ?? 0) + valor
    c.pending_cancellation = false
    if (c.refunded_amount >= c.amount) {
      c.status = "refunded"
      c.last_transaction.status = "refunded"
    }
    c.updated_at = agora()
  }

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
    c.updated_at = agora()
    pedido.updated_at = agora()
  }

  async function avisar(pedido, tipo) {
    if (!painel.webhook?.url) return null
    const corpo = {
      id: id("hook"),
      account: { id: "acc_falsa", name: "FuckingBarba (falso)" },
      type: tipo,
      created_at: agora(),
      // Como o de verdade: aviso de pedido leva o pedido; o de cobrança leva
      // a cobrança, com o pedido dentro (`data.order.id`).
      data: tipo.startsWith("charge.") ? cobrancaDo(pedido) : pedido,
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

  /**
   * A análise de fraude decide um cartão autorizado. Aprovada, ele continua
   * AUTORIZADO, esperando a cobrança; reprovada, a reserva é desfeita — ou,
   * com `desfaz: false`, fica pendurada, pro teste ver o backend desfazer.
   */
  async function decidirAnalise(pedido, resultado, { semAviso = false, desfaz = true } = {}) {
    const c = cobrancaDo(pedido)
    const t = c.last_transaction
    if (resultado === "aprova") {
      t.antifraud_response = { status: "approved", return_message: "aprovado" }
    } else {
      t.antifraud_response = { status: "reproved", return_message: "reprovado" }
      if (desfaz && t.status === "authorized_pending_capture") {
        mudar(pedido, "failed", { status: "voided" })
        c.canceled_amount = c.amount
      }
    }
    c.updated_at = agora()
    return semAviso
      ? null
      : avisar(
          pedido,
          resultado === "aprova" ? "charge.antifraud_approved" : "charge.antifraud_reproved"
        )
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
      updated_at: agora(),
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
            Date.now() + (painel.validadeDoPix ?? pagamento.pix?.expires_in ?? 3600) * 1000
          ).toISOString(),
        })
      }
    } else {
      const soAutoriza = pagamento.credit_card.operation_type === "auth_only"
      Object.assign(t, {
        installments: pagamento.credit_card.installments ?? 1,
        statement_descriptor: pagamento.credit_card.statement_descriptor,
        operation_type: pagamento.credit_card.operation_type ?? "auth_and_capture",
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
        mudar(pedido, "pending", {
          status: "authorized_pending_capture",
          ...(soAutoriza ? { antifraud_response: { status: "pending" } } : {}),
        })
        cobranca.status = soAutoriza ? "pending" : "processing"
        const decisao = soAutoriza ? painel.decisaoDaAnalise : null
        if (decisao) {
          painel.decisaoDaAnalise = null
          setTimeout(() => void decidirAnalise(pedido, decisao.resultado), decisao.depoisDe)
        }
      } else if (soAutoriza) {
        // Autorizado, e a análise aprovou na hora: falta só a cobrança.
        mudar(pedido, "pending", {
          status: "authorized_pending_capture",
          acquirer_message: "Transação autorizada com sucesso",
          antifraud_response: { status: "approved", return_message: "aprovado" },
        })
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
        if (acao === "aprovar" || acao === "reprovar") {
          const status = await decidirAnalise(pedido, acao === "aprovar" ? "aprova" : "reprova", {
            semAviso: Boolean(corpo?.semAviso),
            desfaz: corpo?.desfaz !== false,
          })
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
        if (codigo && painel.atrasoNaBusca > 0) {
          await new Promise((pronto) => setTimeout(pronto, painel.atrasoNaBusca))
        }
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

      const cobrancaLida = caminho.match(/^\/core\/v5\/charges\/([^/]+)$/)
      if (req.method === "GET" && cobrancaLida) {
        const registro = [...painel.pedidos.values()].find(
          (r) => cobrancaDo(r.pedido).id === cobrancaLida[1]
        )
        if (!registro) json(404, { message: "Charge not found" })
        else json(200, cobrancaDo(registro.pedido))
        return
      }

      /*
        A COBRANÇA DO CARTÃO AUTORIZADO. Só o que está autorizado e não foi
        cobrado se cobra; o resto é recusado, como lá. Cada pedido fica
        anotado com o que a análise dizia NA HORA — é essa anotação que prova
        que a loja não cobrou antes da análise aprovar.
      */
      const capturando = caminho.match(/^\/core\/v5\/charges\/([^/]+)\/capture$/)
      if (req.method === "POST" && capturando) {
        const registro = [...painel.pedidos.values()].find(
          (r) => cobrancaDo(r.pedido).id === capturando[1]
        )
        if (!registro) {
          json(404, { message: "Charge not found" })
          return
        }
        const c = cobrancaDo(registro.pedido)
        const t = c.last_transaction
        const podia = c.status === "pending" && t.status === "authorized_pending_capture"
        painel.capturas.push({
          cobranca: c.id,
          pedido: registro.pedido.id,
          valor: corpo?.amount ?? c.amount,
          analise: t.antifraud_response?.status ?? null,
          recusada: !podia,
        })
        if (!podia) {
          json(412, { message: "This charge can not be captured." })
          return
        }
        mudar(registro.pedido, "paid", {
          status: "captured",
          acquirer_message: "Transação capturada com sucesso",
        })
        json(200, c)
        // Como o de verdade: o aviso de pago vem depois, por fora da resposta.
        setTimeout(() => void avisar(registro.pedido, "order.paid"), 200)
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
        if (painel.proximoCancelamento) {
          const como = painel.proximoCancelamento
          painel.proximoCancelamento = null
          painel.cancelamentos.push({
            cobranca: c.id,
            pedido: registro.pedido.id,
            status: c.status,
            valor,
            recusado: true,
          })
          if (como === "412") json(412, { message: "This charge can not be canceled." })
          else json(500, { message: "An error has occurred." })
          return
        }
        /*
          O PAGAR.ME NÃO CANCELA PIX ESPERANDO PAGAMENTO — e nem Pix vencido,
          que continua `pending` lá. Responde 412, com esta frase, pra
          sempre. Foi o que prendeu o estoque do pedido #7 por um dia: a
          conciliação pedia o DELETE antes de cancelar o pedido, tomava o
          412, e nunca chegava a cancelar.

          O pedido recusado entra em `cancelamentos` do mesmo jeito, marcado:
          quem conferir vê que o DELETE CHEGOU, e é isso que o conferidor
          proíbe.
        */
        if (c.payment_method === "pix" && c.status === "pending") {
          painel.cancelamentos.push({
            cobranca: c.id,
            pedido: registro.pedido.id,
            status: c.status,
            valor,
            recusado: true,
          })
          json(412, { message: "This charge cannot be canceled because is pending." })
          return
        }
        painel.cancelamentos.push({
          cobranca: c.id,
          pedido: registro.pedido.id,
          status: c.status,
          valor,
        })
        if (c.status === "paid") {
          if (painel.estornos === "segura") {
            // Aceito e andando: a cobrança continua paga, com o aviso de
            // cancelamento pendente — como o painel mostrou no pedido #6.
            c.pending_cancellation = true
            c.updated_at = agora()
            painel.estornosSegurados.set(c.id, valor)
          } else {
            devolver(c, valor)
          }
        } else if (c.last_transaction.status === "authorized_pending_capture") {
          // A reserva desfeita: nada foi cobrado, e o `canceled_amount` vem
          // com o valor inteiro mesmo assim — não é estorno.
          c.status = "canceled"
          registro.pedido.status = "canceled"
          c.last_transaction.status = "voided"
          c.canceled_amount = c.amount
          c.updated_at = agora()
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
  /**
   * O fim de um estorno segurado. `falharEstorno` é o Pix sem saldo: o
   * aviso de pendente some, a cobrança continua paga e nada volta.
   * `concluirEstorno` é o estorno que saiu.
   */
  const seguradoDo = (pedidoId) => {
    const registro = painel.pedidos.get(pedidoId)
    const c = registro ? cobrancaDo(registro.pedido) : null
    return c && painel.estornosSegurados.has(c.id) ? c : null
  }
  painel.falharEstorno = (pedidoId) => {
    const c = seguradoDo(pedidoId)
    if (!c) return false
    painel.estornosSegurados.delete(c.id)
    c.pending_cancellation = false
    c.updated_at = agora()
    return true
  }
  painel.concluirEstorno = (pedidoId) => {
    const c = seguradoDo(pedidoId)
    if (!c) return false
    devolver(c, painel.estornosSegurados.get(c.id))
    painel.estornosSegurados.delete(c.id)
    return true
  }
  painel.envelhecer = async (pedidoId) =>
    (
      await fetch(`http://127.0.0.1:${porta}/__falso/envelhecer/${pedidoId}`, { method: "POST" })
    ).json()
  /**
   * A análise de fraude decide o cartão "em análise". `semAviso`: o
   * Pagar.me não avisa (quem descobre é a conciliação). `desfaz: false`, na
   * reprovação: a reserva fica pendurada, pro teste ver o backend desfazer.
   */
  const decidir =
    (acao) =>
    async (pedidoId, opcoes = {}) =>
      (
        await fetch(`http://127.0.0.1:${porta}/__falso/${acao}/${pedidoId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(opcoes),
        })
      ).json()
  painel.aprovarAnalise = decidir("aprovar")
  painel.reprovarAnalise = decidir("reprovar")

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
