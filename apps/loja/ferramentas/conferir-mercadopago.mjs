/**
 * CONFERIDOR DO PIX RESERVA — o Mercado Pago (0140), comprando de verdade numa
 * loja de pé, com um Mercado Pago de mentira atrás.
 *
 *   MERCADOPAGO_ACCESS_TOKEN=TEST-token-do-mercadopago-falso \
 *   MERCADOPAGO_URL=http://127.0.0.1:4360 \
 *   MERCADOPAGO_WEBHOOK_SEGREDO=segredo-do-aviso-do-mercadopago \
 *   (e as do conferir-pagamento: Frenet, Pagar.me e Resend falsos) npm run backend:dev
 *
 *   ADMIN_EMAIL=… ADMIN_SENHA=… node ferramentas/conferir-mercadopago.mjs
 *
 * Variáveis: as do `conferir-pagamento.mjs` (LOJA, MEDUSA_BACKEND_URL,
 * NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL, ADMIN_SENHA,
 * DASHBOARD_DONO_EMAIL, CHROMIUM), MERCADOPAGO_WEBHOOK_SEGREDO (o mesmo do
 * backend; padrão o do falso) e PORTA_MERCADOPAGO_FALSO.
 *
 * Liga o Mercado Pago na região pelo admin (junto do Pagar.me) e DEVOLVE a
 * região como estava no fim, mesmo se falhar no meio. As partes 1 a 7 levam a
 * tela ao Mercado Pago trocando o provedor escondido do passo 3; a parte 8
 * (0150) derruba o Pagar.me falso e confere a troca AUTOMÁTICA — o Pix pelo
 * Mercado Pago no mesmo clique, o disjuntor, o cartão fora da tela, os
 * e-mails pro dono e a volta sozinha. Pra ela não esperar 5 minutos a cada
 * volta, o Medusa sobe com `PAGAMENTO_DISJUNTOR_SEGUNDOS=20`.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o Pix do Mercado Pago cobrar diferente do total do Medusa, ou nascer │
 * │   sem a referência da sessão e a origem da loja;                       │
 * │ • a tela de obrigado não mostrar o QR e o copia-e-cola de lá;          │
 * │ • Pix pago não virar pedido pago — pelo aviso e sem ele —, ou sair sem │
 * │   o "Pedido confirmado" e o "Venda nova";                              │
 * │ • aviso sem a assinatura certa mudar alguma coisa;                     │
 * │ • Pix vencido segurar o estoque, ou o QR de pedido cancelado continuar │
 * │   pagável (aqui ele MORRE: o Mercado Pago cancela Pix pendente);       │
 * │ • a resposta perdida gerar dois Pix pra mesma compra (a chave de       │
 * │   idempotência), ou a dúvida "gerou ou não?" ficar sem dono;           │
 * │ • o Mercado Pago fora deixar pedido aberto ou estoque preso;           │
 * │ • o Pix cuja sessão sumiu ficar sem estorno;                           │
 * │ • a conciliação tocar numa venda do MERCADO LIVRE (a conta é a mesma); │
 * │ • um estado forjado na sessão ser levado a sério, ou cartão passar     │
 * │   pelo Mercado Pago (aqui é só Pix);                                   │
 * │ • o pedido pago cancelado no admin não devolver o dinheiro;            │
 * │ • o Pix não sair pelo Mercado Pago no MESMO CLIQUE quando o Pagar.me   │
 * │   não gera (0150), ou esperar o Pagar.me meio minuto pra isso;         │
 * │ • três falhas seguidas não tirarem o Pagar.me do caminho, o cartão     │
 * │   continuar na tela com ele fora, ou o dono não saber da queda e da    │
 * │   volta;                                                               │
 * │ • os dois fora tirarem a loja do ar: ela segue tentando os dois.       │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { readFileSync } from "node:fs"
import { comAFaixaRespondida } from "./faixa-respondida.mjs"
import { subirFrenetFalsa } from "./frenet-falsa.mjs"
import { SEGREDO_DO_AVISO, subirMercadoPagoFalso } from "./mercadopago-falso.mjs"
import { subirPagarmeFalso } from "./pagarme-falso.mjs"
import { ipDeTeste } from "./pedido-de-teste.mjs"
import { subirResendFalso } from "./resend-falso.mjs"

const LOJA =
  process.env.LOJA ??
  (process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:3000")
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const SEGREDO = process.env.MEDUSA_WEBHOOK_SEGREDO ?? "segredo-de-teste"
const SEGREDO_MP = process.env.MERCADOPAGO_WEBHOOK_SEGREDO ?? SEGREDO_DO_AVISO
const EMAIL_ADMIN = process.env.ADMIN_EMAIL
const SENHA_ADMIN = process.env.ADMIN_SENHA
const PAGARME = "pp_pagarme_pagarme"
const MERCADOPAGO = "pp_mercadopago_mercadopago"
const RECUSA_DO_PIX =
  "Não consegui gerar o Pix agora, e nada foi cobrado. Tenta de novo em instantes."

const CHAVE =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ??
  (() => {
    try {
      const env = readFileSync(new URL("../.env.development.local", import.meta.url), "utf8")
      return env.match(/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=(.+)$/m)?.[1]?.trim() ?? ""
    } catch {
      return ""
    }
  })()

const CPF = "111.444.777-35"
const CEP = "01310-100"

let falhas = 0
let testes = 0
const ok = (cond, texto, det = "") => {
  testes++
  if (cond) console.log(`  ✓ ${texto}`)
  else {
    falhas++
    console.log(`  ✗ ${texto}${det ? ` — ${det}` : ""}`)
  }
}
const titulo = (t) => console.log(`\n${t}`)
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

if (!EMAIL_ADMIN || !SENHA_ADMIN) {
  console.log("  ⚠  sem ADMIN_EMAIL/ADMIN_SENHA — não dá pra ligar o Mercado Pago na região")
  process.exit(1)
}

/* ── os falsos ────────────────────────────────────────────────────────────── */

const frenet = await subirFrenetFalsa()
const pagarme = await subirPagarmeFalso({
  webhook: { url: `${MEDUSA}/hooks/payment/pagarme_pagarme`, segredo: SEGREDO },
})
const mp = await subirMercadoPagoFalso({
  aviso: { url: `${MEDUSA}/hooks/payment/mercadopago_mercadopago`, segredo: SEGREDO_MP },
})
const resend = await subirResendFalso()
console.log(
  `  ⚙  Frenet :${frenet.porta} · Pagar.me :${pagarme.porta} · Mercado Pago ${mp.url} · Resend :${resend.porta}`
)

/* ── o Medusa ─────────────────────────────────────────────────────────────── */

const entrar = await fetch(`${MEDUSA}/auth/user/emailpass`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL_ADMIN, password: SENHA_ADMIN }),
})
if (!entrar.ok) throw new Error(`login do admin falhou: ${entrar.status}`)
const { token } = await entrar.json()
const cabAdmin = { "content-type": "application/json", authorization: `Bearer ${token}` }
const cabLoja = { "content-type": "application/json", "x-publishable-api-key": CHAVE }

async function adm(caminho, opcoes = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, { headers: cabAdmin, ...opcoes })
  if (!r.ok) throw new Error(`${opcoes.method ?? "GET"} ${caminho} → ${r.status} ${await r.text()}`)
  return r.json()
}
async function loja(caminho, opcoes = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, { headers: cabLoja, ...opcoes })
  const j = await r.json().catch(() => null)
  return { status: r.status, ok: r.ok, json: j }
}
const conciliar = async () =>
  (await adm("/admin/pagamentos/conciliar", { method: "POST" })).relatorio

/*
  AS TRAVAS SOLTAS (`POST /admin/cartao`, "soltar") no começo e antes de cada
  pagamento pela tela: o Pix que este teste gera pelo navegador sai sempre do
  IP local, e a porta deixa 3 por pessoa em 40 minutos (0163) — este arquivo
  sozinho passa disso. O "soltar" recomeça a conta do cartão e a do Pix; o
  disjuntor dos parceiros não olha pra ele.
*/
const soltarAsTravas = () =>
  adm("/admin/cartao", { method: "POST", body: JSON.stringify({ acao: "soltar" }) })
await soltarAsTravas()

/** Os pedidos que o teste criou: os que sobrarem de pé são cancelados no fim. */
const pedidosDoTeste = new Set()
async function pedidoNoMedusa(id) {
  pedidosDoTeste.add(id)
  const r = await fetch(
    `${MEDUSA}/admin/orders/${id}?fields=id,display_id,status,payment_status,total,metadata,*items,` +
      "*payment_collections,*payment_collections.payment_sessions,*payment_collections.payments",
    { headers: cabAdmin }
  )
  return (await r.json().catch(() => null))?.order
}
const sessaoDo = (pedido) => pedido?.payment_collections?.[0]?.payment_sessions?.[0]
/** O Pix do Mercado Pago falso que nasceu da sessão deste pedido do Medusa. */
const noMercadoPago = (pedido) => (sessaoDo(pedido) ? mp.daSessao(sessaoDo(pedido).id) : null)

async function emailComAssunto(assunto, ms = 20000) {
  for (const fim = Date.now() + ms; Date.now() < fim; await esperar(250)) {
    const achado = resend.emails.find((e) => e.subject === assunto)
    if (achado) return achado
  }
  return null
}
const confirmacoesDo = (pedido) =>
  resend.emails.filter((e) => e.subject === `Pedido #${pedido.display_id} confirmado`)
const vendasDo = (pedido) =>
  resend.emails.filter((e) =>
    (e.subject ?? "").startsWith(`Venda nova: pedido #${pedido.display_id},`)
  )
async function esperarAte(teste, ms = 20000) {
  for (const fim = Date.now() + ms; Date.now() < fim; await esperar(250)) {
    const r = await teste()
    if (r) return r
  }
  return null
}

/**
 * A conciliação automática roda a cada 5 minutos dentro do `medusa develop`:
 * o teste que diz "sem aviso, nada muda" espera ela passar (o mesmo do
 * `conferir-pagamento`).
 */
async function longeDaConciliacaoAutomatica(janelaMs) {
  const agora = Date.now()
  const proxima = Math.ceil(agora / 300_000) * 300_000
  if (proxima - agora < janelaMs + 5_000) {
    const espera = proxima - agora + 20_000
    console.log(`    (esperando ${Math.round(espera / 1000)} s a conciliação automática passar)`)
    await esperar(espera)
  }
}

/* ── o pedido pela API, como a loja faria ─────────────────────────────────── */

const ENDERECO_DA_API = {
  first_name: "Fulano",
  last_name: "Reserva",
  phone: "+5511988887777",
  address_1: "Avenida Paulista, 1578",
  city: "São Paulo",
  province: "SP",
  postal_code: "01310100",
  country_code: "br",
  metadata: { rua: "Avenida Paulista", numero: "1578", complemento: "", bairro: "Bela Vista" },
}

const entradaDoPix = (email, forma = "pix") => ({
  forma,
  parcelas: 1,
  token: forma === "cartao" ? "token_abcdef123456" : null,
  comprador: {
    nome: "Fulano Reserva",
    email,
    documento: "11144477735",
    tipoDocumento: "cpf",
    telefone: "+5511988887777",
  },
  endereco: {
    rua: "Avenida Paulista",
    numero: "1578",
    complemento: "",
    bairro: "Bela Vista",
    cidade: "São Paulo",
    uf: "SP",
    cep: "01310100",
  },
  itens: [{ codigo: "x", descricao: "x", quantidade: 1, total: 1 }],
  frete: { total: 0, descricao: "" },
  ip: null,
})

async function carrinhoPelaApi(email) {
  const { json: rg } = await loja("/store/regions")
  const reg = rg.regions.find((x) => x.currency_code === "brl")
  const { json: pr } = await loja(
    `/store/products?handle=shampoo-para-barba&region_id=${reg.id}&fields=*variants`
  )
  const { json: cc } = await loja("/store/carts", {
    method: "POST",
    body: JSON.stringify({ region_id: reg.id }),
  })
  const id = cc.cart.id
  await loja(`/store/carts/${id}/line-items`, {
    method: "POST",
    body: JSON.stringify({ variant_id: pr.products[0].variants[0].id, quantity: 1 }),
  })
  await loja(`/store/carts/${id}`, {
    method: "POST",
    body: JSON.stringify({
      email,
      shipping_address: ENDERECO_DA_API,
      billing_address: ENDERECO_DA_API,
    }),
  })
  const { json: op } = await loja(`/store/shipping-options?cart_id=${id}`)
  await loja(`/store/carts/${id}/shipping-methods`, {
    method: "POST",
    body: JSON.stringify({ option_id: op.shipping_options[0].id }),
  })
  const { json: col } = await loja("/store/payment-collections", {
    method: "POST",
    body: JSON.stringify({ cart_id: id }),
  })
  const colecao =
    col?.payment_collection?.id ??
    (await loja(`/store/carts/${id}?fields=*payment_collection`)).json?.cart?.payment_collection?.id
  return { id, colecao }
}

/** Abre a sessão do parceiro e fecha o carrinho pela API. Devolve o pedido (ou a resposta). */
async function fecharPelo(provedor, carrinho, email, data = { entrada: entradaDoPix(email) }) {
  const sessao = await loja(`/store/payment-collections/${carrinho.colecao}/payment-sessions`, {
    method: "POST",
    body: JSON.stringify({ provider_id: provedor, data }),
  })
  if (!sessao.ok) return { sessao, pedido: null, fim: null }
  // Assinado como a loja manda, cada um com um IP sorteado: a porta conta os Pix por pessoa (0163).
  const fim = await loja(`/store/carts/${carrinho.id}/complete`, {
    method: "POST",
    headers: {
      ...cabLoja,
      ...(process.env.REVALIDAR_SEGREDO
        ? { "x-loja-segredo": process.env.REVALIDAR_SEGREDO, "x-cliente-ip": ipDeTeste() }
        : {}),
    },
  })
  const pedido = fim.json?.type === "order" ? await pedidoNoMedusa(fim.json.order.id) : null
  return { sessao, pedido, fim }
}
const fecharPeloMercadoPago = (carrinho, email, data) =>
  fecharPelo(MERCADOPAGO, carrinho, email, data)

/** A sessão de pagamento do carrinho que não fechou — pra ler a frase da recusa. */
async function sessaoDoCarrinho(carrinhoId) {
  const { json } = await loja(
    `/store/carts/${carrinhoId}?fields=id,completed_at,*payment_collection,*payment_collection.payment_sessions`
  )
  return {
    fechado: Boolean(json?.cart?.completed_at),
    sessao: json?.cart?.payment_collection?.payment_sessions?.find(
      (s) => s.provider_id === MERCADOPAGO
    ),
  }
}

/* ── o navegador ──────────────────────────────────────────────────────────── */

const { chromium } = await import("playwright")
const navegador = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
)
comAFaixaRespondida(navegador, LOJA)
const errosDeConsole = []
const RUIDO_DE_DEV = /_next\/hmr|websocket|favicon/i
const ORIGEM_DA_LOJA = new URL(LOJA).origin

async function novaAba() {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1000 } })
  await contexto.route(
    (url) => url.origin === ORIGEM_DA_LOJA,
    (rota) =>
      rota.continue({ headers: { ...rota.request().headers(), "x-real-ip": "198.51.100.140" } })
  )
  const pagina = await contexto.newPage()
  pagina.on(
    "console",
    (m) => m.type() === "error" && !RUIDO_DE_DEV.test(m.text()) && errosDeConsole.push(m.text())
  )
  return { contexto, pagina }
}

async function sacolaPronta(contexto) {
  const { json: r } = await loja("/store/regions")
  const regiao = r.regions.find((x) => x.currency_code === "brl")
  const { json: p } = await loja(
    `/store/products?handle=shampoo-para-barba&region_id=${regiao.id}&fields=*variants`
  )
  const { json: c } = await loja("/store/carts", {
    method: "POST",
    body: JSON.stringify({ region_id: regiao.id }),
  })
  await loja(`/store/carts/${c.cart.id}/line-items`, {
    method: "POST",
    body: JSON.stringify({ variant_id: p.products[0].variants[0].id, quantity: 1 }),
  })
  await contexto.addCookies([{ name: "carrinho", value: c.cart.id, url: LOJA }])
  return c.cart.id
}

const semStreaming = (pagina) =>
  pagina
    .waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, {
      timeout: 20000,
    })
    .catch(() => null)

async function ateOPagamento(pagina, email) {
  await pagina.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
  await semStreaming(pagina)
  await pagina.locator("#form-contato").waitFor({ timeout: 25000 })
  const campo = (n) => pagina.locator(`.fluxo [name="${n}"]`)
  await campo("email").fill(email)
  await campo("nome").fill("Matheus")
  await campo("sobrenome").fill("Teste Reserva")
  await campo("telefone").fill("(11) 99999-9999")
  await campo("documento").fill(CPF)
  await pagina.locator("#form-contato button[type=submit]").click()
  await pagina.locator("#form-entrega").waitFor({ timeout: 25000 })
  await campo("cep").fill(CEP)
  await pagina.waitForFunction(
    () => document.querySelector('.fluxo [name="rua"]')?.value?.length > 0,
    { timeout: 25000 }
  )
  await pagina.locator("#form-entrega .opcao").first().waitFor({ timeout: 25000 })
  await campo("numero").fill("1578")
  await pagina.locator("#form-entrega button[type=submit]").click()
  await pagina.locator("#form-pagamento").waitFor({ timeout: 25000 })
  // O passo 3 abre no clique e a loja grava a entrega por trás (0201): o
  // botão de pagar só solta com ela no carrinho.
  await pagina
    .locator("#form-pagamento button[type=submit]:not([disabled])")
    .waitFor({ state: "attached", timeout: 25000 })
    .catch(() => null)
}

const idDaUrl = (pagina) => pagina.url().split("/").pop()
const tituloDoFeito = async (pagina) => (await pagina.locator(".feito h1").textContent())?.trim()

/* ── a região com os dois parceiros, e de volta no fim ────────────────────── */

const { regions } = await adm("/admin/regions?fields=id,currency_code,*payment_providers")
const regiao = regions.find((r) => r.currency_code === "brl")
const provedoresDeAntes = (regiao.payment_providers ?? []).map((p) => p.id)

try {
  await adm(`/admin/regions/${regiao.id}`, {
    method: "POST",
    body: JSON.stringify({ payment_providers: [PAGARME, MERCADOPAGO] }),
  })

  titulo("A região")
  {
    const { json: prov } = await loja(`/store/payment-providers?region_id=${regiao.id}`)
    const ids = (prov?.payment_providers ?? []).map((p) => p.id).sort()
    ok(
      ids.join(",") === [MERCADOPAGO, PAGARME].sort().join(","),
      "a região cobra pelos dois parceiros — e nenhum provedor que aprova sem cobrar",
      ids.join(", ")
    )
  }

  /* ── 1. Pix pelo Mercado Pago, pela tela ──────────────────────────────── */

  titulo("Pix pelo Mercado Pago, pela tela")
  let pedidoDaTela = null
  {
    const { contexto, pagina } = await novaAba()
    const carrinhoId = await sacolaPronta(contexto)
    await ateOPagamento(pagina, "reserva@fuckingbarba.invalid")
    const linhaDoPix = pagina.locator("#form-pagamento .opcao", { hasText: "Pix" })
    await linhaDoPix.click()
    // A parte 3 escolhe o parceiro sozinha; aqui a tela é levada ao Mercado Pago à mão.
    await pagina.evaluate((id) => {
      const campo = document.querySelector('#form-pagamento input[name="provedor"]')
      if (campo) campo.value = id
    }, MERCADOPAGO)
    const { json: antes } = await loja(`/store/carts/${carrinhoId}?fields=total`)
    await soltarAsTravas()
    await pagina.locator("#form-pagamento button[type=submit]").click()
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedido = await pedidoNoMedusa(pagina.url().split("/").pop())
    pedidoDaTela = pedido
    const sessao = sessaoDo(pedido)
    ok(
      sessao?.provider_id === MERCADOPAGO,
      "o pedido nasce com a sessão do Mercado Pago",
      sessao?.provider_id
    )
    ok(pedido?.payment_status === "awaiting", "e AGUARDANDO o Pix", pedido?.payment_status)

    const pix = noMercadoPago(pedido)
    ok(Boolean(pix), "o Mercado Pago recebeu um Pix com a referência da sessão")
    const total = Math.round(Number(antes.cart.total) * 100)
    ok(
      Math.round((pix?.transaction_amount ?? 0) * 100) === total &&
        total === Math.round(Number(pedido.total) * 100),
      `e cobra exatamente o total do Medusa (${total} centavos)`,
      `Mercado Pago ${pix?.transaction_amount} · carrinho ${antes.cart.total} · pedido ${pedido?.total}`
    )
    ok(
      Boolean(pix?.metadata?.origem) && pix?.metadata?.sessao === sessao?.id,
      "com a origem da loja e a sessão no metadata"
    )
    const criacao = mp.chamadas.find(
      (c) =>
        c.metodo === "POST" &&
        c.caminho === "/v1/payments" &&
        c.corpo?.external_reference === sessao?.id
    )
    ok(criacao?.chave === sessao?.id, "a chave de idempotência é o id da sessão", criacao?.chave)
    ok(
      criacao?.corpo?.payer?.identification?.number === "11144477735" &&
        criacao?.corpo?.payer?.identification?.type === "CPF",
      "com o CPF de quem compra, sem pontuação"
    )
    const minutos = (Date.parse(criacao?.corpo?.date_of_expiration ?? "") - Date.now()) / 60_000
    ok(minutos > 29 && minutos <= 31.5, `o Pix vale uns 30 minutos (${minutos.toFixed(1)})`)
    ok(sessao?.data?.entrada === null, "e o CPF, o telefone e o endereço saíram da sessão")
    ok(sessao?.data?.mercadopago?.situacao === "aguardando", "o estado mora em data.mercadopago")

    titulo("A tela do Pix")
    ok((await tituloDoFeito(pagina)) === "Falta só o Pix", "o título pede o Pix")
    const codigo = await pagina.locator(".feito__pix code").innerText()
    ok(
      codigo === pix?.point_of_interaction?.transaction_data?.qr_code,
      "o copia-e-cola é o que o Mercado Pago gerou"
    )
    ok(
      (await pagina.locator("img.feito__qr").getAttribute("src")) ===
        `data:image/png;base64,${pix?.point_of_interaction?.transaction_data?.qr_code_base64}`,
      "e o QR é a imagem dele"
    )
    ok(confirmacoesDo(pedido).length === 0, "nenhum e-mail de confirmação antes do Pix cair")

    titulo("O Pix cai, e o Mercado Pago avisa")
    await mp.pagar(pix.id)
    await pagina.locator(".feito h1", { hasText: "Pedido confirmado" }).waitFor({ timeout: 40000 })
    ok(true, "a tela muda sozinha pra 'Pedido confirmado'")
    const pago = await pedidoNoMedusa(pedido.id)
    ok(pago?.payment_status === "captured", "o Medusa registrou o pagamento", pago?.payment_status)
    ok(
      mp.avisosEnviados.some((a) => a.id === pix.id && a.status === 200 && !a.forjado),
      "o aviso assinado chegou no Medusa"
    )
    const confirmacao = await esperarAte(
      () => confirmacoesDo(pedido).length > 0 && confirmacoesDo(pedido)
    )
    ok(
      confirmacao?.length === 1,
      "o e-mail 'Pedido confirmado' sai, uma vez",
      `${confirmacao?.length ?? 0}`
    )
    const venda = await esperarAte(() => vendasDo(pedido).length > 0 && vendasDo(pedido))
    ok(Boolean(venda?.length), "e o 'Venda nova' pro dono também")
    await contexto.close()
  }

  /* ── 2. o aviso forjado, e o aviso que não chegou ─────────────────────── */

  titulo("Aviso sem a assinatura certa não vale; o que não chegou, a conciliação acha")
  {
    await longeDaConciliacaoAutomatica(30_000)
    const carrinho = await carrinhoPelaApi("forjado@fuckingbarba.invalid")
    const { pedido } = await fecharPeloMercadoPago(carrinho, "forjado@fuckingbarba.invalid")
    const pix = noMercadoPago(pedido)
    ok(Boolean(pedido && pix), "o pedido nasce, com o Pix lá")
    await mp.pagar(pix.id, { semAviso: true })
    await mp.avisar(pix.id, { forjado: true })
    await esperar(9000) // o Medusa processa o aviso 5 s depois, e tenta 3 vezes
    const depoisDoForjado = await pedidoNoMedusa(pedido.id)
    ok(
      depoisDoForjado?.payment_status === "awaiting",
      "o aviso forjado chega, e nada muda",
      depoisDoForjado?.payment_status
    )
    const relatorio = await conciliar()
    const conciliado = await pedidoNoMedusa(pedido.id)
    ok(
      conciliado?.payment_status === "captured" &&
        relatorio?.pagas?.some((p) => p.includes(`#${pedido.display_id}`)),
      "a conciliação pergunta ao Mercado Pago e registra o pagamento",
      `${conciliado?.payment_status} · ${JSON.stringify(relatorio?.pagas)}`
    )
  }

  /* ── 3. o Pix vencido ─────────────────────────────────────────────────── */

  titulo("Pix vencido: o pedido é cancelado, o QR morre lá e o estoque volta")
  {
    const carrinho = await carrinhoPelaApi("vencido@fuckingbarba.invalid")
    const { pedido } = await fecharPeloMercadoPago(carrinho, "vencido@fuckingbarba.invalid")
    const pix = noMercadoPago(pedido)
    await mp.envelhecer(pix.id)
    const relatorio = await conciliar()
    const depois = await pedidoNoMedusa(pedido.id)
    ok(
      depois?.status === "canceled" &&
        relatorio?.canceladas?.some(
          (c) => c.includes(`#${pedido.display_id}`) && /vencido/.test(c)
        ),
      "a conciliação cancela o pedido (Pix vencido)",
      `${depois?.status} · ${JSON.stringify(relatorio?.canceladas)}`
    )
    ok(
      mp.pagamentos.get(pix.id)?.status === "cancelled",
      "e cancela o Pix lá: ninguém paga um QR vencido"
    )

    const carrinho2 = await carrinhoPelaApi("vencido2@fuckingbarba.invalid")
    const { pedido: pedido2 } = await fecharPeloMercadoPago(
      carrinho2,
      "vencido2@fuckingbarba.invalid"
    )
    await mp.vencer(noMercadoPago(pedido2).id)
    await conciliar()
    ok(
      (await pedidoNoMedusa(pedido2.id))?.status === "canceled",
      "o Pix que o Mercado Pago deu por vencido também cancela o pedido"
    )
  }

  /* ── 4. cancelar no admin ─────────────────────────────────────────────── */

  titulo("Cancelar no admin com o Pix esperando: o QR morre na hora")
  {
    const carrinho = await carrinhoPelaApi("cancelado@fuckingbarba.invalid")
    const { pedido } = await fecharPeloMercadoPago(carrinho, "cancelado@fuckingbarba.invalid")
    const pix = noMercadoPago(pedido)
    await adm(`/admin/orders/${pedido.id}/cancel`, { method: "POST" })
    const cancelado = await esperarAte(
      () => mp.pagamentos.get(pix.id)?.status === "cancelled",
      15000
    )
    ok(Boolean(cancelado), "o pedido cancelado cancela o Pix no Mercado Pago (o subscriber)")
    const aviso = await emailComAssunto(`Pedido #${pedido.display_id} cancelado`, 15000)
    ok(Boolean(aviso), "e quem comprou recebe o 'Pedido cancelado' (sem estorno: nada foi pago)")
  }

  titulo("Cancelar no admin um pedido pago: o Mercado Pago devolve o dinheiro")
  {
    const carrinho = await carrinhoPelaApi("estorno@fuckingbarba.invalid")
    const { pedido } = await fecharPeloMercadoPago(carrinho, "estorno@fuckingbarba.invalid")
    const pix = noMercadoPago(pedido)
    await mp.pagar(pix.id)
    await esperarAte(
      async () => (await pedidoNoMedusa(pedido.id))?.payment_status === "captured",
      30000
    )
    await adm(`/admin/orders/${pedido.id}/cancel`, { method: "POST" })
    const estorno = mp.estornos.find((e) => e.pagamento === pix.id)
    ok(
      estorno && Math.round(estorno.valor * 100) === Math.round(pix.transaction_amount * 100),
      "o Medusa pede o estorno do valor inteiro, e o Mercado Pago devolve",
      JSON.stringify(estorno)
    )
    ok(
      Boolean(estorno?.chave),
      "com uma chave de idempotência (o mesmo estorno não sai duas vezes)"
    )
    const cancelado = await pedidoNoMedusa(pedido.id)
    ok(
      cancelado?.status === "canceled" && cancelado?.payment_status === "refunded",
      "e o pedido fica cancelado e estornado",
      `${cancelado?.status} ${cancelado?.payment_status}`
    )
    ok(mp.pagamentos.get(pix.id)?.status === "refunded", "e lá o Pix fica estornado")
    const aviso = await emailComAssunto(`Pedido #${pedido.display_id} cancelado e estornado`, 15000)
    ok(Boolean(aviso), "e o e-mail diz que foi estornado")
  }

  /* ── 5. a resposta perdida, e o Mercado Pago fora ─────────────────────── */

  titulo("A resposta perdida: a mesma chave devolve o mesmo Pix")
  {
    mp.roteiro = "perde"
    const carrinho = await carrinhoPelaApi("perdida@fuckingbarba.invalid")
    const { pedido } = await fecharPeloMercadoPago(carrinho, "perdida@fuckingbarba.invalid")
    mp.roteiro = "normal"
    const sessao = sessaoDo(pedido)
    const doMesmo = [...mp.pagamentos.values()].filter((p) => p.external_reference === sessao?.id)
    ok(Boolean(pedido), "o pedido nasce mesmo com a primeira resposta perdida")
    ok(doMesmo.length === 1, "e existe UM Pix pra essa compra lá", `${doMesmo.length}`)
  }

  titulo("O Mercado Pago fora: nada fica aberto, e a frase diz o que fazer")
  {
    mp.roteiro = "queda"
    const carrinho = await carrinhoPelaApi("fora@fuckingbarba.invalid")
    const { pedido, fim } = await fecharPeloMercadoPago(carrinho, "fora@fuckingbarba.invalid")
    mp.roteiro = "normal"
    const lido = await sessaoDoCarrinho(carrinho.id)
    ok(
      !pedido && !lido.fechado,
      "nenhum pedido: o carrinho continua aberto",
      JSON.stringify(fim?.json)?.slice(0, 120)
    )
    ok(
      lido.sessao?.data?.mercadopago?.recusa === RECUSA_DO_PIX,
      "e a sessão guarda a frase do Pix, pra tela",
      lido.sessao?.data?.mercadopago?.recusa
    )
  }

  titulo("A dúvida 'gerou ou não?': a conciliação procura e cancela")
  {
    mp.roteiro = "perde-sempre"
    const carrinho = await carrinhoPelaApi("incerto@fuckingbarba.invalid")
    const { pedido } = await fecharPeloMercadoPago(carrinho, "incerto@fuckingbarba.invalid")
    mp.roteiro = "normal"
    const lido = await sessaoDoCarrinho(carrinho.id)
    ok(!pedido, "sem resposta nenhuma, nenhum pedido")
    ok(
      lido.sessao?.data?.mercadopago?.situacao === "incerto" &&
        lido.sessao?.data?.mercadopago?.recusa === RECUSA_DO_PIX,
      "a sessão fica 'incerto' pra conciliação, e a tela diz a frase do Pix (QR que ninguém viu não cobra ninguém)",
      JSON.stringify(lido.sessao?.data?.mercadopago)?.slice(0, 160)
    )
    const pix = lido.sessao ? mp.daSessao(lido.sessao.id) : null
    ok(pix?.status === "pending", "e lá o Pix nasceu, sem ninguém saber")
    await conciliar()
    ok(
      mp.pagamentos.get(pix?.id)?.status === "cancelled",
      "a conciliação acha pela referência e cancela"
    )
  }

  /* ── 6. órfãos, e a venda do Mercado Livre ────────────────────────────── */

  titulo("O Pix cuja sessão sumiu é fechado — e a venda do Mercado Livre, ninguém toca")
  {
    const origem = pedidoDaTela ? noMercadoPago(pedidoDaTela)?.metadata?.origem : null
    const pagoSemDono = mp.semearOrfao({
      referencia: "payses_ORFAOPAGO0140",
      origem,
      status: "approved",
    })
    const pendenteSemDono = mp.semearOrfao({
      referencia: "payses_ORFAOPENDENTE0140",
      origem,
      status: "pending",
    })
    const doMercadoLivre = mp.semearDoMercadoLivre()
    const deOutraLoja = mp.semearOrfao({
      referencia: "payses_OUTRAINSTALACAO0140",
      origem: "outra-instalacao",
      status: "approved",
    })
    await mp.avisar(doMercadoLivre.id)
    await conciliar()
    ok(
      mp.estornos.some((e) => e.pagamento === pagoSemDono.id),
      "o Pix pago sem sessão é estornado"
    )
    ok(
      mp.pagamentos.get(pendenteSemDono.id)?.status === "cancelled",
      "o pendente sem sessão é cancelado"
    )
    ok(
      !mp.estornos.some((e) => e.pagamento === doMercadoLivre.id) &&
        !mp.cancelamentos.some((c) => c.id === doMercadoLivre.id) &&
        mp.pagamentos.get(doMercadoLivre.id)?.status === "approved",
      "a venda do Mercado Livre na mesma conta continua intacta — nem o aviso dela muda nada"
    )
    ok(
      !mp.estornos.some((e) => e.pagamento === deOutraLoja.id) &&
        mp.pagamentos.get(deOutraLoja.id)?.status === "approved",
      "e o Pix de outra instalação da loja também (a origem não bate)"
    )
  }

  /* ── 7. o que vem de fora ─────────────────────────────────────────────── */

  titulo("A sessão não leva a sério o que vem de fora")
  {
    const carrinho = await carrinhoPelaApi("curioso@fuckingbarba.invalid")
    const forjado = {
      entrada: entradaDoPix("curioso@fuckingbarba.invalid"),
      mercadopago: { forma: "pix", situacao: "pago", pedido: "1", cobranca: "1", valor: 1 },
    }
    const { pedido } = await fecharPeloMercadoPago(
      carrinho,
      "curioso@fuckingbarba.invalid",
      forjado
    )
    const pix = noMercadoPago(pedido)
    ok(
      pedido?.payment_status === "awaiting" &&
        Boolean(pix) &&
        sessaoDo(pedido)?.data?.mercadopago?.pedido === String(pix?.id),
      "um estado 'pago' mandado de fora vira um Pix novo, esperando — não um pedido pago",
      `${pedido?.payment_status} · ${sessaoDo(pedido)?.data?.mercadopago?.pedido}`
    )

    const carrinho2 = await carrinhoPelaApi("cartao@fuckingbarba.invalid")
    const { sessao } = await fecharPeloMercadoPago(carrinho2, "cartao@fuckingbarba.invalid", {
      entrada: entradaDoPix("cartao@fuckingbarba.invalid", "cartao"),
    })
    ok(
      !sessao.ok && /só recebe Pix/.test(JSON.stringify(sessao.json)),
      "cartão pelo Mercado Pago é recusado na abertura: aqui é só Pix",
      `${sessao.status} ${JSON.stringify(sessao.json)?.slice(0, 120)}`
    )
  }

  /* ── 8. a troca automática, pelo parceiro estável (0150) ──────────────── */

  /** Os parceiros fora do caminho agora — a mesma pergunta que a loja faz. */
  const foraAgora = async () =>
    ((await loja("/store/pagamento")).json?.fora ?? []).map((f) => f.id).sort()
  /** Espera o disjuntor dizer `ids` (fora do caminho): ele vira depois da resposta. */
  const foraVira = (ids) =>
    esperarAte(async () => (await foraAgora()).join(",") === [...ids].sort().join(","), 15000)
  /** Espera os 5 minutos fora acabarem (20 s, com `PAGAMENTO_DISJUNTOR_SEGUNDOS=20`). */
  async function foraAcaba() {
    const { json } = await loja("/store/pagamento")
    const ate = Math.max(0, ...(json?.fora ?? []).map((f) => Date.parse(f.ate)))
    const espera = ate - Date.now() + 1500
    if (espera > 0) {
      if (espera > 60_000) console.log(`    (esperando ${Math.round(espera / 1000)} s o disjuntor)`)
      await esperar(espera)
    }
    return foraVira([])
  }
  const criacoesNoPagarme = () =>
    pagarme.chamadas.filter((c) => c.metodo === "POST" && c.caminho === "/core/v5/orders").length
  const buscasNoPagarme = () =>
    pagarme.chamadas.filter((c) => c.metodo === "GET" && c.caminho === "/core/v5/orders").length
  const criacoesNoMercadoPago = () =>
    mp.chamadas.filter((c) => c.metodo === "POST" && c.caminho === "/v1/payments").length
  const fecharPeloPagarme = (carrinho, email) =>
    fecharPelo(PAGARME, carrinho, email, { entrada: { ...entradaDoPix(email), reserva: true } })
  const cartaoNaTela = (pagina) =>
    pagina.locator('#form-pagamento label[data-forma="cartao"] input[type="radio"]')
  async function preencherCartao(pagina) {
    const linha = pagina.locator("#form-pagamento .opcao", { hasText: "Cartão" })
    await linha.click()
    await linha.locator("input:checked").waitFor({ state: "attached", timeout: 10000 })
    const campos = pagina.locator(".pagamento__painel[data-ativo] input")
    await campos.nth(0).fill("4000 0000 0000 0010")
    await campos.nth(1).fill("Matheus Teste")
    await campos.nth(2).fill("12/30")
    await campos.nth(3).fill("737")
  }

  // Sem a conciliação no meio (ela também busca no Pagar.me), e os dois parceiros
  // começando de pé: uma compra que dá certo em cada um zera as falhas de antes.
  await longeDaConciliacaoAutomatica(150_000)
  await fecharPeloPagarme(
    await carrinhoPelaApi("zera1@fuckingbarba.invalid"),
    "zera1@fuckingbarba.invalid"
  )
  await fecharPeloMercadoPago(
    await carrinhoPelaApi("zera2@fuckingbarba.invalid"),
    "zera2@fuckingbarba.invalid"
  )
  await foraVira([])

  titulo("O Pagar.me não gera o Pix: sai pelo Mercado Pago, no mesmo clique")
  let abaVelha = null
  {
    pagarme.roteiro = "queda"
    const { contexto, pagina } = await novaAba()
    await sacolaPronta(contexto)
    await ateOPagamento(pagina, "troca@fuckingbarba.invalid")
    const [criacoes, buscas] = [criacoesNoPagarme(), buscasNoPagarme()]
    const comeco = Date.now()
    await soltarAsTravas()
    await pagina.locator("#form-pagamento button[type=submit]").click()
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const segundos = (Date.now() - comeco) / 1000
    const pedido = await pedidoNoMedusa(idDaUrl(pagina))
    ok(
      sessaoDo(pedido)?.provider_id === MERCADOPAGO && pedido?.payment_status === "awaiting",
      "quem clicou em pagar no Pix sai com o pedido, aguardando o Pix do Mercado Pago",
      `${sessaoDo(pedido)?.provider_id} ${pedido?.payment_status}`
    )
    ok(
      criacoesNoPagarme() - criacoes === 1,
      "o Pagar.me foi tentado uma vez, e só",
      `${criacoesNoPagarme() - criacoes}`
    )
    ok(
      buscasNoPagarme() - buscas === 1,
      "com a reserva esperando, o provedor não pergunta de novo se o Pix nasceu lá",
      `${buscasNoPagarme() - buscas} buscas`
    )
    ok(segundos < 20, `e a troca não segurou quem compra (${segundos.toFixed(1)} s)`)
    const pix = noMercadoPago(pedido)
    const codigo = await pagina.locator(".feito__pix code").innerText()
    ok(
      Boolean(pix) && codigo === pix.point_of_interaction.transaction_data.qr_code,
      "a tela de obrigado mostra o copia-e-cola do Mercado Pago"
    )
    await contexto.close()

    // Uma aba que chegou no pagamento com o Pagar.me ainda de pé — o cartão está nela.
    const velha = await novaAba()
    await sacolaPronta(velha.contexto)
    await ateOPagamento(velha.pagina, "aba-velha@fuckingbarba.invalid")
    abaVelha = velha
    ok(
      !(await cartaoNaTela(velha.pagina).isDisabled()),
      "(com o Pagar.me de pé, o cartão está na tela)"
    )
  }

  titulo("Três seguidas tiram o Pagar.me do caminho — e o dono fica sabendo")
  {
    for (const n of [2, 3]) {
      const email = `queda${n}@fuckingbarba.invalid`
      const { pedido } = await fecharPeloPagarme(await carrinhoPelaApi(email), email)
      ok(!pedido, `a ${n}ª tentativa no Pagar.me também falha`)
    }
    ok(
      (await foraVira([PAGARME])) !== null,
      "o Pagar.me sai do caminho (GET /store/pagamento)",
      (await foraAgora()).join(", ")
    )
    const aviso = await emailComAssunto(
      "O Pagar.me parou de responder: o Pix está saindo pelo Mercado Pago"
    )
    ok(Boolean(aviso), "o dono recebe o e-mail: o Pix está saindo pelo Mercado Pago")
    ok(
      /o cartão fica fora da tela/.test(aviso?.text ?? ""),
      "e o e-mail diz que o cartão sai da tela até ele voltar"
    )

    // A aba de antes ainda mostra o cartão: o clique é que descobre.
    const { contexto, pagina } = abaVelha
    const criacoes = criacoesNoPagarme()
    await preencherCartao(pagina)
    await soltarAsTravas()
    await pagina.locator("#form-pagamento button[type=submit]").click()
    const recado = pagina.locator("#form-pagamento .erros-envio")
    await recado.waitFor({ timeout: 30000 })
    ok(
      /cartão está fora do ar agora\. Paga no Pix/.test(await recado.innerText()),
      "o cartão da aba antiga para no clique, com a frase que manda pro Pix",
      await recado.innerText()
    )
    ok(criacoesNoPagarme() === criacoes, "e nada chega no Pagar.me")
    ok(
      (await esperarAte(() => cartaoNaTela(pagina).isDisabled(), 15000)) !== null,
      "e a tela se refaz com o cartão fora"
    )
    await contexto.close()
  }

  titulo("Com o Pagar.me fora: o cartão fora da tela, e o Pix direto no Mercado Pago")
  {
    const { contexto, pagina } = await novaAba()
    await sacolaPronta(contexto)
    await ateOPagamento(pagina, "direto@fuckingbarba.invalid")
    const linha = pagina.locator('#form-pagamento label[data-forma="cartao"]')
    ok(
      (await cartaoNaTela(pagina).isDisabled()) &&
        /Fora do ar agora\. Paga no Pix/.test(await linha.innerText()),
      "a linha do cartão fica apagada, dizendo pra pagar no Pix",
      await linha.innerText()
    )
    const criacoes = criacoesNoPagarme()
    await soltarAsTravas()
    await pagina.locator("#form-pagamento button[type=submit]").click()
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedido = await pedidoNoMedusa(idDaUrl(pagina))
    ok(sessaoDo(pedido)?.provider_id === MERCADOPAGO, "o Pix sai pelo Mercado Pago")
    ok(criacoesNoPagarme() === criacoes, "sem nem tentar o Pagar.me")
    await contexto.close()
  }

  titulo("O Pagar.me volta sozinho — e o dono fica sabendo")
  {
    pagarme.roteiro = "normal"
    ok((await foraAcaba()) !== null, "passado o tempo fora, ele volta pro caminho")
    const { contexto, pagina } = await novaAba()
    await sacolaPronta(contexto)
    await ateOPagamento(pagina, "volta@fuckingbarba.invalid")
    ok(!(await cartaoNaTela(pagina).isDisabled()), "o cartão volta pra tela")
    await soltarAsTravas()
    await pagina.locator("#form-pagamento button[type=submit]").click()
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedido = await pedidoNoMedusa(idDaUrl(pagina))
    ok(sessaoDo(pedido)?.provider_id === PAGARME, "e o Pix volta a sair pelo Pagar.me")
    const aviso = await emailComAssunto("O Pagar.me voltou")
    ok(Boolean(aviso), "o dono recebe o e-mail de que ele voltou")
    ok(/depois de \d+ min fora/.test(aviso?.text ?? ""), "com quanto tempo ficou fora")
    await contexto.close()
  }

  titulo("Os dois fora: a loja segue tentando os dois, e a frase diz o que fazer")
  {
    pagarme.roteiro = "queda"
    mp.roteiro = "queda"
    const { contexto, pagina } = await novaAba()
    await sacolaPronta(contexto)
    await ateOPagamento(pagina, "os-dois@fuckingbarba.invalid")
    const recado = pagina.locator("#form-pagamento .erros-envio")
    for (const n of [1, 2, 3]) {
      const [noPagarme, noMp] = [criacoesNoPagarme(), criacoesNoMercadoPago()]
      await soltarAsTravas()
      await pagina.locator("#form-pagamento button[type=submit]").click()
      await recado.waitFor({ timeout: 45000 })
      await pagina
        .locator("#form-pagamento button[type=submit]:not([disabled])")
        .waitFor({ timeout: 45000 })
      if (n === 1) {
        ok(
          (await recado.innerText()).trim() === RECUSA_DO_PIX,
          "a tela diz a frase do Pix: nada foi cobrado, tenta de novo em instantes",
          await recado.innerText()
        )
        ok(
          criacoesNoPagarme() - noPagarme === 1 && criacoesNoMercadoPago() - noMp >= 1,
          "o mesmo clique tentou os dois"
        )
      }
    }
    ok(
      (await foraVira([MERCADOPAGO, PAGARME])) !== null,
      "três cliques depois, os dois estão em queda",
      (await foraAgora()).join(", ")
    )
    ok(
      Boolean(await emailComAssunto("Os parceiros de pagamento pararam de responder")),
      "e o dono recebe o e-mail de que ninguém consegue pagar agora"
    )
    await pagina.reload({ waitUntil: "domcontentloaded" })
    await semStreaming(pagina)
    await pagina.locator("#form-pagamento").waitFor({ timeout: 25000 })
    ok(
      !(await cartaoNaTela(pagina).isDisabled()),
      "com os dois fora, ninguém sai da tela: a loja segue tentando"
    )
    await contexto.close()

    // De pé de novo, cada um com uma compra que dá certo.
    pagarme.roteiro = "normal"
    mp.roteiro = "normal"
    await foraAcaba()
    await fecharPeloPagarme(
      await carrinhoPelaApi("zera3@fuckingbarba.invalid"),
      "zera3@fuckingbarba.invalid"
    )
    const { pedido } = await fecharPeloMercadoPago(
      await carrinhoPelaApi("zera4@fuckingbarba.invalid"),
      "zera4@fuckingbarba.invalid"
    )
    ok(Boolean(pedido), "o Mercado Pago volta a gerar o Pix")
    ok(
      Boolean(await emailComAssunto("O Mercado Pago voltou")),
      "e o dono recebe o e-mail de que a reserva voltou"
    )
  }
} finally {
  mp.roteiro = "normal"
  pagarme.roteiro = "normal"
  for (const id of pedidosDoTeste) {
    const o = (await loja(`/store/orders/${id}?fields=id,status`)).json?.order
    if (o && o.status !== "canceled") {
      await adm(`/admin/orders/${id}/cancel`, { method: "POST" }).catch(() => null)
    }
  }
  await adm(`/admin/regions/${regiao.id}`, {
    method: "POST",
    body: JSON.stringify({ payment_providers: provedoresDeAntes }),
  }).catch((e) => console.log(`  ⚠  não consegui devolver a região: ${e}`))
  console.log(`\n  ⚙  região devolvida: ${provedoresDeAntes.join(", ")}`)
}

titulo("Higiene")
ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.slice(0, 3).join(" | "))

await navegador.close()
frenet.fechar()
pagarme.fechar()
mp.fechar()
await resend.fechar()
console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
