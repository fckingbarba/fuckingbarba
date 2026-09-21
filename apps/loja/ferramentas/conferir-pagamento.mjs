/**
 * CONFERIDOR DO PAGAMENTO — Pix e cartão pelo Pagar.me, comprando de verdade
 * numa loja de pé, com um Pagar.me de mentira atrás.
 *
 *   FRENET_URL=http://127.0.0.1:4310/shipping/quote FRENET_TOKEN=teste \
 *   PAGARME_SECRET_KEY=sk_test_falsa PAGARME_URL=http://127.0.0.1:4320/core/v5 \
 *   MEDUSA_WEBHOOK_SEGREDO=segredo-de-teste npm run backend:dev
 *
 *   # na loja, em .env.development.local:
 *   #   NEXT_PUBLIC_PAGARME_PUBLIC_KEY=pk_test_falsa
 *   #   NEXT_PUBLIC_PAGARME_API=http://127.0.0.1:4320/core/v5
 *   npm run loja:dev
 *
 *   ADMIN_EMAIL=… ADMIN_SENHA=… node ferramentas/conferir-pagamento.mjs
 *
 * Variáveis: LOJA (padrão http://localhost:3000), MEDUSA_BACKEND_URL,
 * NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL, ADMIN_SENHA,
 * MEDUSA_WEBHOOK_SEGREDO (o mesmo do backend; padrão "segredo-de-teste") e
 * CHROMIUM.
 *
 * Liga o Pagar.me na região pelo admin e DEVOLVE a região como estava no
 * fim, mesmo se falhar no meio.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o número do cartão chegar no servidor da loja (PCI);                 │
 * │ • o valor cobrado no Pagar.me ser diferente do total do Medusa;        │
 * │ • cartão recusado deixar pedido criado, ou estoque preso;              │
 * │ • Pix pago não virar pedido pago — pelo aviso, e sem ele;              │
 * │ • Pix vencido segurar estoque pra sempre;                              │
 * │ • aviso forjado (sem o segredo) mudar alguma coisa;                    │
 * │ • a resposta perdida no caminho cobrar duas vezes, ou cobrar sem       │
 * │   pedido e ficar por isso mesmo;                                       │
 * │ • um `pagarme.pedido` mandado de fora na sessão ser levado a sério —   │
 * │   isso já aconteceu, e era compra de graça (ver `situacao.ts`);        │
 * │ • a cobrança que perdeu a sessão (tentou de novo) ficar sem estorno;   │
 * │ • o pagamento de um pedido fechado ser reaberto pela API pública;      │
 * │ • o QR de um pedido cancelado no admin continuar pagável;              │
 * │ • a confirmação perdida no caminho virar "sacola vazia" e compra dupla.│
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { readFileSync } from "node:fs"
import { subirFrenetFalsa } from "./frenet-falsa.mjs"
import { CARTOES, subirPagarmeFalso } from "./pagarme-falso.mjs"

const LOJA =
  process.env.LOJA ??
  (process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:3000")
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const SEGREDO = process.env.MEDUSA_WEBHOOK_SEGREDO ?? "segredo-de-teste"
const EMAIL_ADMIN = process.env.ADMIN_EMAIL
const SENHA_ADMIN = process.env.ADMIN_SENHA
const PAGARME = "pp_pagarme_pagarme"

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

/** Um CPF que fecha o módulo 11. Não é de ninguém. */
const CPF = "111.444.777-35"
const CEP = "01310-100"
const CVV = "737"

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
  console.log("  ⚠  sem ADMIN_EMAIL/ADMIN_SENHA — não dá pra ligar o Pagar.me na região")
  process.exit(1)
}

/* ── os dois falsos ───────────────────────────────────────────────────────── */

const frenet = await subirFrenetFalsa()
const pagarme = await subirPagarmeFalso({
  webhook: { url: `${MEDUSA}/hooks/payment/pagarme_pagarme`, segredo: SEGREDO },
})
console.log(`  ⚙  Frenet falsa :${frenet.porta} · Pagar.me falso ${pagarme.url}`)

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
/**
 * Todo pedido que o teste lê fica anotado: no fim, os que sobraram de pé são
 * cancelados, e o estoque volta. Sem isso, cada rodada deixava umas dez
 * unidades de shampoo reservadas pra sempre no banco local — e, algumas
 * rodadas depois, a sacola nascia vazia por falta de estoque, e o teste
 * falhava num lugar que não tem nada a ver com pagamento.
 */
const pedidosDoTeste = new Set()
async function pedidoNoMedusa(id) {
  pedidosDoTeste.add(id)
  const { json } = await loja(
    `/store/orders/${id}?fields=id,display_id,status,payment_status,total,*items,` +
      "*payment_collections,*payment_collections.payment_sessions"
  )
  return json?.order
}

/** O pedido do Pagar.me falso que nasceu da sessão deste pedido do Medusa. */
function noPagarme(pedidoMedusa) {
  const sessao = pedidoMedusa?.payment_collections?.[0]?.payment_sessions?.[0]
  return sessao ? pagarme.pedidoPorCodigo(sessao.id) : null
}

/* ── o navegador ──────────────────────────────────────────────────────────── */

const { chromium } = await import("playwright")
const navegador = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
)
const errosDeConsole = []
const RUIDO_DE_DEV = /_next\/hmr|websocket|favicon/i

async function novaAba() {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1000 } })
  await contexto.grantPermissions(["clipboard-read", "clipboard-write"], { origin: LOJA })
  const pagina = await contexto.newPage()
  pagina.on(
    "console",
    (m) => m.type() === "error" && !RUIDO_DE_DEV.test(m.text()) && errosDeConsole.push(m.text())
  )
  /*
    TUDO QUE A PÁGINA MANDA PRA LOJA, guardado. É daqui que sai a prova de
    que o número do cartão não passou pelo servidor: server action é um POST
    pra própria página, e o corpo dela é o que o servidor recebe.
  */
  const corposPraLoja = []
  pagina.on("request", (r) => {
    if (r.method() === "POST" && r.url().startsWith(LOJA)) corposPraLoja.push(r.postData() ?? "")
  })
  return { contexto, pagina, corposPraLoja }
}

/**
 * Sacola com o shampoo, pela API — preparação, não o que se confere aqui.
 * O carrinho é criado e o cookie posto na aba, como a loja faria.
 */
async function sacolaPronta(contexto, quantidade = 2) {
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
    body: JSON.stringify({ variant_id: p.products[0].variants[0].id, quantity: quantidade }),
  })
  await contexto.addCookies([{ name: "carrinho", value: c.cart.id, url: LOJA }])
  return c.cart.id
}

const ENDERECO_DA_API = {
  first_name: "Fulano",
  last_name: "Esperto",
  phone: "+5511988887777",
  address_1: "Avenida Paulista, 1578",
  city: "São Paulo",
  province: "SP",
  postal_code: "01310100",
  country_code: "br",
  metadata: { rua: "Avenida Paulista", numero: "1578", complemento: "", bairro: "Bela Vista" },
}

/** A `entrada` que a loja mandaria pra um Pix — montada à mão, como faria um curioso. */
const entradaDoPix = (email) => ({
  forma: "pix",
  parcelas: 1,
  token: null,
  comprador: {
    nome: "Fulano Esperto",
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

/**
 * Um carrinho pronto pra pagar, montado pela API — pros casos em que o teste
 * age por fora da tela: o que um curioso faria, ou o pedido que fecha sem a
 * resposta chegar ao navegador. Com `carrinhoId`, usa um que a tela já
 * preencheu e só garante a coleção de pagamento.
 */
async function carrinhoPelaApi(email, carrinhoId = null) {
  let id = carrinhoId
  if (!id) {
    const { json: rg } = await loja("/store/regions")
    const reg = rg.regions.find((x) => x.currency_code === "brl")
    const { json: pr } = await loja(
      `/store/products?handle=shampoo-para-barba&region_id=${reg.id}&fields=*variants`
    )
    const { json: cc } = await loja("/store/carts", {
      method: "POST",
      body: JSON.stringify({ region_id: reg.id }),
    })
    id = cc.cart.id
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
  }
  const { json: col } = await loja("/store/payment-collections", {
    method: "POST",
    body: JSON.stringify({ cart_id: id }),
  })
  const colecao =
    col?.payment_collection?.id ??
    (await loja(`/store/carts/${id}?fields=*payment_collection`)).json?.cart?.payment_collection?.id
  return { id, colecao }
}

/** Abre a sessão do Pix e fecha o carrinho, tudo pela API. Devolve o pedido. */
async function fecharPelaApi(carrinho, email) {
  await loja(`/store/payment-collections/${carrinho.colecao}/payment-sessions`, {
    method: "POST",
    body: JSON.stringify({ provider_id: PAGARME, data: { entrada: entradaDoPix(email) } }),
  })
  const fim = await loja(`/store/carts/${carrinho.id}/complete`, { method: "POST" })
  return fim.json?.type === "order" ? pedidoNoMedusa(fim.json.order.id) : null
}

/** Passos 1 e 2 do checkout, pela tela. Termina no passo 3 aberto. */
async function ateOPagamento(pagina, email) {
  await pagina.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
  await pagina.locator("#form-contato").waitFor({ timeout: 25000 })
  const campo = (n) => pagina.locator(`.fluxo [name="${n}"]`)
  await campo("email").fill(email)
  await campo("nome").fill("Matheus")
  await campo("sobrenome").fill("Teste Pagamento")
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
}

async function preencherCartao(pagina, numero, { parcelas = "1", cvv = CVV } = {}) {
  await pagina.locator("#form-pagamento .opcao", { hasText: "Cartão" }).locator("input").check()
  const painel = pagina.locator(".pagamento__painel[data-ativo]")
  const campos = painel.locator("input")
  await campos.nth(0).fill(numero)
  await campos.nth(1).fill("Matheus Teste")
  await campos.nth(2).fill("12/30")
  await campos.nth(3).fill(cvv)
  await pagina.locator("#parcelas").selectOption(parcelas)
}

const pagar = (pagina) => pagina.locator("#form-pagamento button[type=submit]").click()
const idDaUrl = (pagina) => pagina.url().split("/").pop()

/**
 * O título da tela de obrigado, como está no HTML. `textContent`, e não
 * `innerText`: o CSS põe o `h1` em caixa alta, e `innerText` devolve o que o
 * CSS desenha ("PEDIDO CANCELADO"), não o que a página escreveu.
 */
const tituloDoFeito = async (pagina) => (await pagina.locator(".feito h1").textContent())?.trim()

/**
 * A CONCILIAÇÃO AUTOMÁTICA roda no worker a cada 5 minutos — e, no
 * `medusa develop`, o worker é o mesmo processo. Um teste que diz "sem
 * aviso, nada muda" precisa de uma janela em que ela não vá rodar; senão
 * ela resolve o caso no meio do teste e ele acusa um bug que não existe
 * (aconteceu na primeira rodada). Se a próxima virada de 5 minutos cair
 * dentro da janela pedida, espera ela passar.
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

/* ── a região com o Pagar.me, e de volta no fim ───────────────────────────── */

const { regions } = await adm("/admin/regions?fields=id,currency_code,*payment_providers")
const regiao = regions.find((r) => r.currency_code === "brl")
const provedoresDeAntes = (regiao.payment_providers ?? []).map((p) => p.id)

try {
  await adm(`/admin/regions/${regiao.id}`, {
    method: "POST",
    body: JSON.stringify({ payment_providers: [PAGARME] }),
  })

  titulo("A região")
  const { json: prov } = await loja(`/store/payment-providers?region_id=${regiao.id}`)
  ok(
    prov?.payment_providers?.length === 1 && prov.payment_providers[0].id === PAGARME,
    "a loja enxerga só o Pagar.me — nenhum provedor que aprova sem cobrar",
    JSON.stringify(prov?.payment_providers?.map((p) => p.id))
  )

  /* ── 1. Pix, do começo ao fim ─────────────────────────────────────────── */

  titulo("Pix — do QR ao pedido pago")
  {
    const { contexto, pagina } = await novaAba()
    const carrinhoId = await sacolaPronta(contexto)
    await ateOPagamento(pagina, "pix@fuckingbarba.invalid")

    const formas = await pagina.locator("#form-pagamento .opcao").allInnerTexts()
    ok(formas.length === 2, "duas formas: Pix e cartão", formas.join(" | "))
    ok(!formas.some((f) => /boleto/i.test(f)), "sem boleto")
    ok(
      (await pagina.locator(".pagamento__aviso").count()) === 0,
      "e sem o aviso de 'não é cobrado agora' — agora é"
    )
    ok(
      /no Pix/.test(await pagina.locator("#form-pagamento button[type=submit]").textContent()),
      "o botão diz que é Pix"
    )

    const { json: antes } = await loja(`/store/carts/${carrinhoId}?fields=total`)
    await pagar(pagina)
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedidoId = idDaUrl(pagina)
    const pedido = await pedidoNoMedusa(pedidoId)
    ok(
      pedido?.payment_status === "awaiting",
      "o pedido nasce AGUARDANDO pagamento",
      pedido?.payment_status
    )

    const registro = noPagarme(pedido)
    ok(Boolean(registro), "e o Pagar.me recebeu um pedido com o código da sessão")
    const cobrado = registro?.pedido.amount
    ok(
      cobrado === Math.round(Number(antes.cart.total) * 100) &&
        cobrado === Math.round(Number(pedido.total) * 100),
      `o Pagar.me cobra exatamente o total do Medusa (${cobrado} centavos)`,
      `Pagar.me ${cobrado} · carrinho ${antes.cart.total} · pedido ${pedido?.total}`
    )
    const corpo = registro?.corpo
    const somaItens =
      (corpo?.items ?? []).reduce((s, i) => s + i.amount * i.quantity, 0) +
      (corpo?.shipping?.amount ?? 0)
    ok(somaItens === cobrado, "itens + frete somam o total, centavo por centavo")
    ok(corpo?.customer?.document === "11144477735", "com o CPF do comprador, sem pontuação")
    ok(
      corpo?.customer?.phones?.mobile_phone?.area_code === "11",
      "e o celular separado em DDD e número, como o Pagar.me quer"
    )
    ok(
      corpo?.customer?.address?.line_1?.startsWith("1578, "),
      "endereço na ordem deles: número, rua, bairro",
      corpo?.customer?.address?.line_1
    )
    ok(corpo?.payments?.[0]?.pix?.expires_in === 1800, "o Pix vale 30 minutos")

    const sessao = pedido.payment_collections[0].payment_sessions[0]
    ok(
      sessao.data?.entrada === null,
      "e o CPF, o telefone e o endereço saíram da sessão",
      JSON.stringify(sessao.data?.entrada)?.slice(0, 80)
    )

    titulo("A tela do Pix")
    ok((await tituloDoFeito(pagina)) === "Falta só o Pix", "o título pede o Pix")
    const codigo = await pagina.locator(".feito__pix code").innerText()
    ok(
      codigo === registro?.pedido.charges[0].last_transaction.qr_code,
      "o copia-e-cola é o que o Pagar.me gerou"
    )
    ok(
      (await pagina.locator("img.feito__qr").getAttribute("src")) ===
        registro?.pedido.charges[0].last_transaction.qr_code_url,
      "e o QR é a imagem dele"
    )
    await pagina
      .locator(".feito__validade")
      .filter({ hasText: /Vale por mais/ })
      .waitFor({ timeout: 10000 })
    ok(
      /Vale por mais (29|30) minutos/.test(await pagina.locator(".feito__validade").innerText()),
      "e diz quanto tempo ainda vale"
    )

    await pagina.locator(".feito__copiar").click()
    await pagina.locator(".feito__copiar", { hasText: "Copiado!" }).waitFor({ timeout: 5000 })
    ok(
      (await pagina.evaluate(() => navigator.clipboard.readText())) === codigo,
      "copiar põe o código inteiro na área de transferência"
    )

    titulo("O Pix cai")
    await pagarme.pagar(registro.pedido.id)
    await pagina.locator(".feito h1", { hasText: "Pedido confirmado" }).waitFor({ timeout: 40000 })
    ok(true, "a tela muda sozinha pra 'Pedido confirmado'")
    ok(
      /Pix recebido/.test(await pagina.locator(".feito").innerText()),
      "e diz que o Pix foi recebido"
    )
    const pago = await pedidoNoMedusa(pedidoId)
    ok(pago?.payment_status === "captured", "o Medusa registrou o pagamento", pago?.payment_status)
    ok((await pagina.locator(".feito__pix").count()) === 0, "e o QR sumiu — não se paga duas vezes")
    await contexto.close()
  }

  /* ── 2. cartão aprovado em 3x ─────────────────────────────────────────── */

  titulo("Cartão aprovado, em 3x")
  let pedidoDoCartao = null
  {
    const { contexto, pagina, corposPraLoja } = await novaAba()
    await sacolaPronta(contexto)
    await ateOPagamento(pagina, "cartao@fuckingbarba.invalid")
    await preencherCartao(pagina, "4000 0000 0000 0010", { parcelas: "3" })

    ok(
      (await pagina.locator(".pagamento__painel[data-ativo] input[name]").count()) === 0,
      "NENHUM campo de cartão tem `name`"
    )
    ok(
      (await pagina.locator("#parcelas").getAttribute("name")) === "parcelas",
      "só as parcelas têm — não é dado de cartão"
    )

    const tokensAntes = pagarme.tokens.size
    await pagar(pagina)
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedido = await pedidoNoMedusa(idDaUrl(pagina))
    ok(pedido?.payment_status === "captured", "o pedido nasce PAGO", pedido?.payment_status)

    const tudo = corposPraLoja.join("\n")
    ok(
      !tudo.includes(CARTOES.aprovado) && !tudo.includes("4000 0000 0000 0010"),
      "o número do cartão NÃO chegou no servidor da loja"
    )
    ok(!tudo.includes(CVV), "nem o CVV")
    ok(/token_[0-9a-f]+/.test(tudo), "o que chegou foi um token")
    ok(pagarme.tokens.size === tokensAntes + 1, "que o navegador pediu direto ao Pagar.me")
    ok(
      pagarme.chamadas
        .filter((c) => c.caminho === "/core/v5/tokens")
        .every((c) => c.autorizacao === null),
      "sem cabeçalho de autorização — só a chave pública, na URL"
    )

    const registro = noPagarme(pedido)
    pedidoDoCartao = { id: pedido?.id, pagarme: registro?.pedido }
    const cc = registro?.corpo?.payments?.[0]?.credit_card
    ok(cc?.installments === 3, "em 3 parcelas", String(cc?.installments))
    ok(cc?.statement_descriptor === "FUCKINGBARBA", "com o nome da loja na fatura")
    ok(Boolean(cc?.card?.billing_address?.line_1), "e o endereço de cobrança junto do token")
    ok(
      registro?.pedido.amount === Math.round(Number(pedido.total) * 100),
      "cobrado exatamente o total do Medusa"
    )

    const frase = await pagina.locator(".feito").innerText()
    ok(
      /final 0010/.test(frase) && /3x/.test(frase),
      "a tela diz o final do cartão e as parcelas",
      frase.slice(0, 160)
    )
    await contexto.close()
  }

  /* ── 3. cartão recusado, e a segunda tentativa ────────────────────────── */

  titulo("Cartão recusado, e depois aprovado")
  {
    const { contexto, pagina } = await novaAba()
    const carrinhoId = await sacolaPronta(contexto)
    await ateOPagamento(pagina, "recusado@fuckingbarba.invalid")
    await preencherCartao(pagina, "4000 0000 0000 0028")
    await pagar(pagina)
    const recado = pagina.locator("#form-pagamento .erros-envio")
    await recado.waitFor({ timeout: 45000 })
    ok(
      /banco do cartão não autorizou/i.test(await recado.innerText()),
      "a recusa diz o que fazer",
      await recado.innerText()
    )
    ok(pagina.url().endsWith("/checkout"), "e a pessoa continua no checkout")
    const { json: aberto } = await loja(`/store/carts/${carrinhoId}?fields=id,completed_at`)
    ok(
      aberto?.cart && !aberto.cart.completed_at,
      "o carrinho continua aberto — nenhum pedido nasceu"
    )
    ok(
      (await pagina.locator(".pagamento__painel[data-ativo] input").nth(3).inputValue()) === "",
      "o CVV foi apagado; o resto do cartão ficou"
    )

    await pagina.locator(".pagamento__painel[data-ativo] input").nth(0).fill("4000 0000 0000 0010")
    await pagina.locator(".pagamento__painel[data-ativo] input").nth(3).fill(CVV)
    await pagar(pagina)
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedido = await pedidoNoMedusa(idDaUrl(pagina))
    ok(pedido?.payment_status === "captured", "a segunda tentativa, com outro cartão, fecha paga")
    const doCarrinho = [...pagarme.pedidos.values()].filter(
      (r) => r.corpo.customer?.email === "recusado@fuckingbarba.invalid"
    )
    ok(
      doCarrinho.length === 2 && doCarrinho[0].corpo.code !== doCarrinho[1].corpo.code,
      "duas tentativas, duas sessões — o token de uma não serve pra outra",
      String(doCarrinho.length)
    )
    await contexto.close()
  }

  /* ── 4. Pix que venceu ────────────────────────────────────────────────── */

  titulo("Pix vencido devolve o estoque")
  {
    const { contexto, pagina } = await novaAba()
    await sacolaPronta(contexto, 1)
    await ateOPagamento(pagina, "vencido@fuckingbarba.invalid")
    await pagar(pagina)
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedidoId = idDaUrl(pagina)
    const pedido = await pedidoNoMedusa(pedidoId)
    const linha = pedido.items[0].id
    const reservasAntes = (await adm(`/admin/reservations?line_item_id=${linha}`)).reservations
    ok(reservasAntes.length === 1, "enquanto o Pix espera, a unidade fica reservada")

    const registro = noPagarme(pedido)
    await pagarme.envelhecer(registro.pedido.id)
    const relatorio = await conciliar()
    ok(
      relatorio.canceladas.some((c) => c.includes(`#${pedido.display_id}`)),
      "a conciliação cancela o pedido do Pix vencido",
      JSON.stringify(relatorio)
    )
    const depois = await pedidoNoMedusa(pedidoId)
    ok(depois?.status === "canceled", "o pedido fica cancelado no Medusa", depois?.status)
    const reservasDepois = (await adm(`/admin/reservations?line_item_id=${linha}`)).reservations
    ok(reservasDepois.length === 0, "e a reserva é desfeita — o estoque volta")
    ok(
      pagarme.cancelamentos.some((c) => c.pedido === registro.pedido.id && c.status === "pending"),
      "o Pix é cancelado LÁ também, antes — o QR morre"
    )
    await pagina.reload({ waitUntil: "domcontentloaded" })
    await pagina.locator(".feito h1").waitFor({ timeout: 20000 })
    ok((await tituloDoFeito(pagina)) === "Pedido cancelado", "e a tela diz isso")
    const segunda = await conciliar()
    ok(
      !segunda.canceladas.length && !segunda.pagas.length,
      "rodar a conciliação de novo não mexe em nada",
      JSON.stringify(segunda)
    )
    await contexto.close()
  }

  /* ── 5. o aviso forjado, e o aviso que não chegou ─────────────────────── */

  titulo("Aviso sem segredo não vale; aviso perdido, a conciliação acha")
  {
    const { contexto, pagina } = await novaAba()
    await sacolaPronta(contexto, 1)
    await ateOPagamento(pagina, "aviso@fuckingbarba.invalid")
    await pagar(pagina)
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedidoId = idDaUrl(pagina)
    const registro = noPagarme(await pedidoNoMedusa(pedidoId))

    // Pago no Pagar.me, mas SEM aviso — e um aviso forjado, sem o segredo.
    await longeDaConciliacaoAutomatica(20_000)
    await pagarme.pagar(registro.pedido.id, { semAviso: true })
    const forjado = await fetch(`${MEDUSA}/hooks/payment/pagarme_pagarme`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-segredo": "chute" },
      body: JSON.stringify({ type: "order.paid", data: { id: registro.pedido.id } }),
    })
    ok(forjado.status === 200, "a rota de aviso responde 200 (não dá pista a quem chuta)")
    await esperar(8000)
    ok(
      (await pedidoNoMedusa(pedidoId))?.payment_status === "awaiting",
      "o aviso sem o segredo certo não muda nada"
    )

    const relatorio = await conciliar()
    ok(
      relatorio.pagas.length >= 1,
      "a conciliação encontra o Pix pago que ninguém avisou",
      JSON.stringify(relatorio)
    )
    ok((await pedidoNoMedusa(pedidoId))?.payment_status === "captured", "e registra o pagamento")
    await contexto.close()
  }

  /* ── 6. a resposta que se perdeu ──────────────────────────────────────── */

  titulo("A resposta perdida no caminho")
  {
    const { contexto, pagina } = await novaAba()
    await sacolaPronta(contexto, 1)
    await ateOPagamento(pagina, "perde@fuckingbarba.invalid")
    pagarme.roteiro = "perde"
    await preencherCartao(pagina, "4000 0000 0000 0010")
    await pagar(pagina)
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 60000 })
    pagarme.roteiro = "normal"
    const pedido = await pedidoNoMedusa(idDaUrl(pagina))
    ok(
      pedido?.payment_status === "captured",
      "o backend pergunta pelo código, acha o pedido, e fecha pago"
    )
    const sessao = pedido.payment_collections[0].payment_sessions[0].id
    ok(
      [...pagarme.pedidos.values()].filter((r) => r.corpo.code === sessao).length === 1,
      "UM pedido no Pagar.me — perder a resposta não cobra duas vezes"
    )
    await contexto.close()
  }
  {
    const { contexto, pagina } = await novaAba()
    const carrinhoId = await sacolaPronta(contexto, 1)
    await ateOPagamento(pagina, "incerto@fuckingbarba.invalid")
    pagarme.roteiro = "perde-atrasa"
    await preencherCartao(pagina, "4000 0000 0000 0010")
    await pagar(pagina)
    const recado = pagina.locator("#form-pagamento .erros-envio")
    await recado.waitFor({ timeout: 60000 })
    pagarme.roteiro = "normal"
    ok(
      /estornada sozinha/.test(await recado.innerText()),
      "sem resposta, a tela promete estorno se houver cobrança",
      await recado.innerText()
    )
    const { json: aberto } = await loja(`/store/carts/${carrinhoId}?fields=id,completed_at`)
    ok(!aberto?.cart?.completed_at, "e o carrinho continua aberto")

    await esperar(10000) // o falso cria o pedido 9 s depois de derrubar a conexão
    const cobrado = [...pagarme.pedidos.values()].find(
      (r) => r.corpo.customer?.email === "incerto@fuckingbarba.invalid"
    )
    ok(cobrado?.pedido.status === "paid", "o cartão FOI cobrado lá, sem pedido aqui — o pior caso")
    const relatorio = await conciliar()
    ok(
      relatorio.estornadas.some((e) => e.includes(cobrado?.pedido.id)),
      "a conciliação acha e estorna",
      JSON.stringify(relatorio)
    )
    ok(
      pagarme.cancelamentos.some(
        (c) =>
          c.pedido === cobrado?.pedido.id &&
          c.status === "paid" &&
          c.valor === cobrado?.pedido.amount
      ),
      "o estorno é do valor inteiro"
    )
    await contexto.close()
  }

  /* ── 6b. a cobrança órfã ──────────────────────────────────────────────── */

  titulo("A cobrança órfã: tentou de novo antes da conciliação")
  {
    // A primeira tentativa some no caminho, e a pessoa tenta de novo antes
    // da conciliação passar: a sessão da primeira é APAGADA pelo Medusa ao
    // abrir a segunda, e a cobrança dela fica sem dono. Nada na loja aponta
    // pra ela — só a listagem do Pagar.me.
    await longeDaConciliacaoAutomatica(90_000)
    const { contexto, pagina } = await novaAba()
    await sacolaPronta(contexto, 1)
    const email = "orfao@fuckingbarba.invalid"
    await ateOPagamento(pagina, email)
    pagarme.roteiro = "perde-atrasa"
    await preencherCartao(pagina, "4000 0000 0000 0010")
    await pagar(pagina)
    await pagina.locator("#form-pagamento .erros-envio").waitFor({ timeout: 60000 })
    pagarme.roteiro = "normal"
    await esperar(10000) // o falso cria o pedido 9 s depois de derrubar a conexão
    const primeira = [...pagarme.pedidos.values()].find((r) => r.corpo.customer?.email === email)
    ok(primeira?.pedido.status === "paid", "a primeira tentativa cobrou lá, sem resposta")

    await pagina.locator(".pagamento__painel[data-ativo] input").nth(0).fill("4000 0000 0000 0010")
    await pagina.locator(".pagamento__painel[data-ativo] input").nth(3).fill(CVV)
    await pagar(pagina)
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedido = await pedidoNoMedusa(idDaUrl(pagina))
    ok(pedido?.payment_status === "captured", "a segunda tentativa fecha o pedido, pago")
    const segunda = noPagarme(pedido)
    ok(
      !pedido.payment_collections[0].payment_sessions.some((x) => x.id === primeira?.corpo.code),
      "a sessão da primeira sumiu do Medusa — a cobrança dela ficou sem dono"
    )

    const cedo = await conciliar()
    ok(
      !pagarme.cancelamentos.some((c) => c.pedido === primeira?.pedido.id),
      "com menos de 15 minutos, a conciliação ainda não mexe nela",
      JSON.stringify(cedo)
    )

    await pagarme.envelhecer(primeira.pedido.id)
    const relatorio = await conciliar()
    ok(
      relatorio.estornadas.some((e) => e.includes(primeira.pedido.id)),
      "passados 15 minutos, a conciliação acha a órfã e estorna",
      JSON.stringify(relatorio)
    )
    ok(
      pagarme.cancelamentos.some(
        (c) =>
          c.pedido === primeira.pedido.id &&
          c.status === "paid" &&
          c.valor === primeira.pedido.amount
      ),
      "o valor inteiro"
    )
    ok(
      !pagarme.cancelamentos.some((c) => c.pedido === segunda?.pedido.id),
      "e a cobrança do pedido de verdade não é tocada"
    )
    const denovo = await conciliar()
    ok(
      !denovo.estornadas.some((e) => e.includes(primeira.pedido.id)) &&
        pagarme.cancelamentos.filter((c) => c.pedido === primeira.pedido.id).length === 1,
      "rodar de novo não estorna duas vezes, nem repete no relatório",
      JSON.stringify(denovo)
    )
    await contexto.close()
  }

  /* ── 7. o que vem de fora na sessão ───────────────────────────────────── */

  titulo("A sessão não leva a sério o que vem de fora")
  let pixEsperando = null
  {
    // Um pedido PAGO de outra pessoa, que alguém tentaria usar.
    const pagoDeOutro = [...pagarme.pedidos.values()].find((r) => r.pedido.status === "paid")

    const email = "esperto@fuckingbarba.invalid"
    const carrinho = await carrinhoPelaApi(email)
    const entrada = entradaDoPix(email)

    const cincoVezes = await loja(
      `/store/payment-collections/${carrinho.colecao}/payment-sessions`,
      {
        method: "POST",
        body: JSON.stringify({
          provider_id: PAGARME,
          data: { entrada: { ...entrada, forma: "cartao", token: "token_abcdefgh", parcelas: 5 } },
        }),
      }
    )
    ok(
      !cincoVezes.ok,
      "5 parcelas é recusado no backend, mesmo sem passar pela tela",
      String(cincoVezes.status)
    )

    const sessao = await loja(
      `/store/payment-collections/${carrinho.colecao}/payment-sessions?fields=*payment_sessions`,
      {
        method: "POST",
        body: JSON.stringify({
          provider_id: PAGARME,
          data: {
            entrada,
            pagarme: {
              forma: "pix",
              situacao: "pago",
              pedido: pagoDeOutro?.pedido.id,
              cobranca: pagoDeOutro?.pedido.charges[0].id,
              valor: 1,
            },
          },
        }),
      }
    )
    const gravado = sessao.json?.payment_collection?.payment_sessions?.[0]?.data?.pagarme
    ok(
      gravado?.pedido === null && gravado?.cobranca === null,
      "o `pedido` injetado é apagado na abertura",
      JSON.stringify(gravado)
    )
    ok(gravado?.situacao === "nova" && gravado?.valor > 1, "e o valor é o do Medusa, não o mandado")

    const fim = await loja(`/store/carts/${carrinho.id}/complete`, { method: "POST" })
    const pedido = fim.json?.order ? await pedidoNoMedusa(fim.json.order.id) : null
    ok(
      fim.json?.type === "order" && pedido?.payment_status === "awaiting",
      "fechar NÃO dá o pedido como pago — ele espera o Pix de verdade",
      `${fim.json?.type} ${pedido?.payment_status}`
    )
    const criado = noPagarme(pedido)
    ok(
      Boolean(criado) && criado.pedido.id !== pagoDeOutro?.pedido.id,
      "nasceu um Pix novo, desta sessão, pra ser pago de verdade"
    )
    pixEsperando = { pedido, colecao: carrinho.colecao, criado, entrada }
  }

  /* ── 7b. o pagamento de um pedido fechado não se reabre ───────────────── */

  titulo("O pagamento de um pedido fechado não se reabre")
  if (pixEsperando?.criado) {
    const { pedido, colecao, criado, entrada } = pixEsperando
    // Abrir sessão nova APAGA as velhas. Num pedido com o Pix esperando, isso
    // mataria a sessão que o aviso do Pagar.me vai procurar.
    const reabrir = await loja(`/store/payment-collections/${colecao}/payment-sessions`, {
      method: "POST",
      body: JSON.stringify({ provider_id: PAGARME, data: { entrada } }),
    })
    ok(
      reabrir.status === 400,
      "abrir sessão nova no pagamento de um pedido fechado é recusado",
      `${reabrir.status} ${JSON.stringify(reabrir.json)?.slice(0, 140)}`
    )
    const intacto = await pedidoNoMedusa(pedido.id)
    const sessoes = intacto?.payment_collections?.[0]?.payment_sessions ?? []
    ok(
      sessoes.length === 1 &&
        sessoes[0].id === criado.corpo.code &&
        sessoes[0].status === "pending_authorization",
      "e a sessão do Pix continua lá, esperando o pagamento",
      JSON.stringify(sessoes.map((x) => [x.id, x.status]))
    )

    /* ── 7c. cancelado no admin, com o Pix esperando ─────────────────────── */

    titulo("Cancelar no admin um pedido com o Pix esperando mata o QR na hora")
    await longeDaConciliacaoAutomatica(30_000)
    await adm(`/admin/orders/${pedido.id}/cancel`, { method: "POST" })
    let fechado = false
    for (let i = 0; i < 40 && !fechado; i++) {
      await esperar(250)
      fechado = pagarme.cancelamentos.some(
        (c) => c.pedido === criado.pedido.id && c.status === "pending"
      )
    }
    ok(fechado, "o Pix é cancelado no Pagar.me em segundos — sem esperar a conciliação")
    let anotada = null
    for (let i = 0; i < 20 && anotada !== "canceled"; i++) {
      anotada = (await pedidoNoMedusa(pedido.id))?.payment_collections?.[0]?.payment_sessions?.[0]
        ?.status
      if (anotada !== "canceled") await esperar(250)
    }
    ok(anotada === "canceled", "e a sessão fica anotada como cancelada", anotada)
    const depois = await conciliar()
    ok(
      !pagarme.cancelamentos.some((c) => c.pedido === criado.pedido.id && c.status !== "pending"),
      "a conciliação seguinte não mexe de novo nele",
      JSON.stringify(depois)
    )
  }

  /* ── 7d. a confirmação que se perdeu no caminho ───────────────────────── */

  titulo("A confirmação que se perdeu no caminho")
  {
    // O pedido fecha no Medusa, mas a resposta não chega ao navegador: o
    // cookie da sacola continua lá, e o crachá do pedido nunca chegou.
    const { contexto, pagina } = await novaAba()
    const carrinhoId = await sacolaPronta(contexto, 1)
    const email = "perdida@fuckingbarba.invalid"
    await ateOPagamento(pagina, email)
    const fechado = await fecharPelaApi(await carrinhoPelaApi(email, carrinhoId), email)
    ok(fechado?.payment_status === "awaiting", "o pedido existe, esperando o Pix")

    // A pessoa clica em pagar de novo, na tela que ficou parada.
    await pagar(pagina)
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    ok(idDaUrl(pagina) === fechado?.id, "o segundo clique leva pro MESMO pedido")
    await pagina.locator(".feito__pix code").waitFor({ timeout: 15000 })
    ok(true, "com o QR do Pix — o crachá do pedido chegou")
    const doEmail = [...pagarme.pedidos.values()].filter((r) => r.corpo.customer?.email === email)
    ok(
      doEmail.length === 1,
      "e UM pedido no Pagar.me — nada foi cobrado duas vezes",
      String(doEmail.length)
    )
    await contexto.close()
  }
  {
    // A mesma coisa, mas a pessoa RECARREGA o checkout em vez de clicar.
    const { contexto, pagina } = await novaAba()
    const email = "recarregou@fuckingbarba.invalid"
    const carrinho = await carrinhoPelaApi(email)
    await contexto.addCookies([{ name: "carrinho", value: carrinho.id, url: LOJA }])
    const fechado = await fecharPelaApi(carrinho, email)
    await pagina.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 30000 })
    ok(
      idDaUrl(pagina) === fechado?.id,
      "recarregar o checkout leva pro pedido, em vez de 'sacola vazia'"
    )
    await pagina.locator(".feito__pix code").waitFor({ timeout: 15000 })
    ok(true, "com o QR do Pix")
    const cookies = await contexto.cookies(LOJA)
    ok(
      !cookies.some((c) => c.name === "carrinho"),
      "e a sacola do cookie foi embora — quem volta pro site não encontra a compra parada nela"
    )
    await contexto.close()
  }

  /* ── 8. cancelar um pedido pago ───────────────────────────────────────── */

  titulo("Cancelar no admin um pedido pago devolve o dinheiro")
  if (pedidoDoCartao?.id) {
    await adm(`/admin/orders/${pedidoDoCartao.id}/cancel`, { method: "POST" })
    ok(
      pagarme.cancelamentos.some(
        (c) =>
          c.pedido === pedidoDoCartao.pagarme?.id &&
          c.status === "paid" &&
          c.valor === pedidoDoCartao.pagarme?.amount
      ),
      "o Medusa pede o estorno, e o Pagar.me recebe o valor inteiro"
    )
    const cancelado = await pedidoNoMedusa(pedidoDoCartao.id)
    ok(
      cancelado?.status === "canceled" && cancelado?.payment_status === "refunded",
      "e o pedido fica cancelado e estornado",
      `${cancelado?.status} ${cancelado?.payment_status}`
    )
  }
} catch (e) {
  falhas++
  console.log(`\n  ✗ o conferidor quebrou no meio: ${e instanceof Error ? e.stack : e}`)
} finally {
  // Os pedidos que o teste criou e ficaram de pé: cancelados, estoque de volta.
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
console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
