/**
 * CONFERIDOR DO PAGAMENTO — Pix e cartão pelo Pagar.me, comprando de verdade
 * numa loja de pé, com um Pagar.me de mentira atrás.
 *
 *   FRENET_URL=http://127.0.0.1:4310/shipping/quote FRENET_TOKEN=teste \
 *   PAGARME_SECRET_KEY=sk_test_falsa PAGARME_URL=http://127.0.0.1:4320/core/v5 \
 *   MEDUSA_WEBHOOK_SEGREDO=segredo-de-teste \
 *   RESEND_URL=http://127.0.0.1:4330 RESEND_API_KEY=re_teste_falsa npm run backend:dev
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
 * │ • o cartão ser COBRADO antes de a análise de fraude aprovar — foram as │
 * │   três compras de 22/09, cobradas e devolvidas —, ou a reserva que ela │
 * │   reprovou ficar pendurada no limite de quem tentou;                   │
 * │ • Pix pago não virar pedido pago — pelo aviso, e sem ele;              │
 * │ • Pix vencido segurar estoque pra sempre — foi o #7: a conciliação     │
 * │   pedia DELETE na cobrança, tomava 412 ("cannot be canceled because    │
 * │   is pending") e nunca chegava a cancelar o pedido;                    │
 * │ • aviso forjado (sem o segredo) mudar alguma coisa;                    │
 * │ • a resposta perdida no caminho cobrar duas vezes, ou cobrar sem       │
 * │   pedido e ficar por isso mesmo;                                       │
 * │ • um `pagarme.pedido` mandado de fora na sessão ser levado a sério —   │
 * │   isso já aconteceu, e era compra de graça (ver `situacao.ts`);        │
 * │ • a cobrança que perdeu a sessão (tentou de novo) ficar sem estorno;   │
 * │ • o pagamento de um pedido fechado ser reaberto pela API pública;      │
 * │ • o dinheiro que entra pelo QR de um pedido cancelado no admin ficar   │
 * │   lá (o QR continua pagável — o Pagar.me não deixa matá-lo);           │
 * │ • a confirmação perdida no caminho virar "sacola vazia" e compra dupla;│
 * │   e, com o pagamento cancelado depois, um laço sem fim entre o         │
 * │   /checkout e o /checkout/retomar (24/09);                             │
 * │ • pedido pago ficar sem o e-mail "Pedido confirmado" — pelo aviso,     │
 * │   pelo cartão, pela conciliação, pelo "Check status" do admin, com o   │
 * │   Resend fora na hora — ou receber dois; e pedido que não foi pago     │
 * │   receber um;                                                          │
 * │ • o estorno que o Pagar.me não fez (o Pix sem saldo) passar calado,    │
 * │   com o admin dizendo que devolveu — ou ser pedido duas vezes.         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { readFileSync } from "node:fs"
import { subirFrenetFalsa } from "./frenet-falsa.mjs"
import { CARTOES, subirPagarmeFalso } from "./pagarme-falso.mjs"
import { subirResendFalso } from "./resend-falso.mjs"

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

/* ── os três falsos ───────────────────────────────────────────────────────── */

const frenet = await subirFrenetFalsa()
const pagarme = await subirPagarmeFalso({
  webhook: { url: `${MEDUSA}/hooks/payment/pagarme_pagarme`, segredo: SEGREDO },
})
const resend = await subirResendFalso()
console.log(
  `  ⚙  Frenet falsa :${frenet.porta} · Pagar.me falso ${pagarme.url} · Resend falso :${resend.porta}`
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
/** A varredura das confirmações (o job de 5 em 5 minutos), agora. */
const confirmarPendentes = async () =>
  (await adm("/admin/pedidos/confirmar", { method: "POST" })).relatorio

/* ── o e-mail de pedido confirmado ────────────────────────────────────────── */

/*
  SEMPRE PELO NÚMERO DO PEDIDO, nunca pelo endereço: os endereços deste
  arquivo se repetem a cada rodada, e a varredura pode confirmar no meio
  dela um pedido pago de uma rodada anterior (o Resend falso não estava de pé
  quando ele foi pago).
*/
const confirmacoesDo = (pedido) =>
  resend.emails.filter((e) => e.subject === `Pedido #${pedido.display_id} confirmado`)

async function esperarConfirmacao(pedido, ms = 20000) {
  for (const fim = Date.now() + ms; Date.now() < fim; await esperar(250)) {
    const achadas = confirmacoesDo(pedido)
    if (achadas.length) return achadas
  }
  return []
}

/** O texto do e-mail com os espaços fixos dos valores trocados por espaço comum. */
const textoDo = (email) => (email?.text ?? "").replace(/\u00a0/g, " ")
const reais = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(Number(v))
    .replace(/\u00a0/g, " ")
/**
 * Todo pedido que o teste lê fica anotado: no fim, os que sobraram de pé são
 * cancelados, e o estoque volta. Sem isso, cada rodada deixava umas dez
 * unidades de shampoo reservadas pra sempre no banco local — e, algumas
 * rodadas depois, a sacola nascia vazia por falta de estoque, e o teste
 * falhava num lugar que não tem nada a ver com pagamento.
 */
const pedidosDoTeste = new Set()
/**
 * Pelo admin: pela loja, o pedido de quem só tem o id vem na versão pública
 * (número e situação — ver `lib/pedido-publico.ts` do backend), e aqui se
 * confere total, itens e a sessão do Pagar.me.
 */
async function pedidoNoMedusa(id) {
  pedidosDoTeste.add(id)
  const r = await fetch(
    `${MEDUSA}/admin/orders/${id}?fields=id,display_id,status,payment_status,total,*items,` +
      "*payment_collections,*payment_collections.payment_sessions",
    { headers: cabAdmin }
  )
  return (await r.json().catch(() => null))?.order
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

/*
  O STREAMING TERMINAR antes de procurar o formulário: enquanto a página
  chega em pedaços, o documento tem a tela DUAS vezes (a do HTML, escondida
  num `<div hidden id="S:…">`, e a da hidratação), e o seletor estrito acusa
  as duas. Ninguém vê a cópia escondida — o mesmo do `conferir-checkout`.
*/
const semStreaming = (pagina) =>
  pagina
    .waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, {
      timeout: 20000,
    })
    .catch(() => null)

/** Passos 1 e 2 do checkout, pela tela. Termina no passo 3 aberto. */
async function ateOPagamento(pagina, email) {
  await pagina.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
  await semStreaming(pagina)
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
  // A forma se escolhe pela LINHA, como a pessoa faz: o rádio está escondido
  // do olho (`opcao--forma`), e um `check()` nele esbarra na linha por cima e
  // espera pra sempre — o mesmo conserto do `conferir-checkout`.
  const linha = pagina.locator("#form-pagamento .opcao", { hasText: "Cartão" })
  await linha.click()
  await linha.locator("input:checked").waitFor({ state: "attached", timeout: 10000 })
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

/**
 * O mesmo, pra conciliação (minutos 0, 5, 10…) E pra varredura das
 * confirmações (2, 7, 12…): o teste do "Check status" precisa de uma janela
 * em que nenhuma das duas resolva o caso por ele.
 */
async function longeDasRodadasAutomaticas(janelaMs) {
  for (;;) {
    const agora = Date.now()
    const proximas = [0, 2].map((minuto) => {
      const desloca = minuto * 60_000
      return Math.ceil((agora - desloca) / 300_000) * 300_000 + desloca
    })
    const proxima = Math.min(...proximas)
    if (proxima - agora >= janelaMs + 5_000) return
    const espera = proxima - agora + 20_000
    console.log(`    (esperando ${Math.round(espera / 1000)} s uma rodada automática passar)`)
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

  titulo("A fila de confirmações começa vazia")
  {
    // Pedido pago de rodadas antigas, sem Resend falso de pé na hora, ainda
    // está na janela da varredura. Aqui ela é esvaziada antes, pra que o
    // pedido de cada cenário não fique atrás de vinte velhos na fila.
    let antigos = 0
    for (let i = 0; i < 20; i++) {
      const rodada = await confirmarPendentes()
      antigos += rodada.mandados.length
      if (!rodada.pendentes || (!rodada.mandados.length && !rodada.dispensados)) break
    }
    const resto = await confirmarPendentes()
    ok(
      resto.pendentes === 0,
      `nenhum pedido pago esperando confirmação${antigos ? ` (${antigos} de rodadas antigas saíram agora)` : ""}`,
      JSON.stringify(resto)
    )
  }

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
    ok(
      /quando o Pix cair, a confirmação vai pra pix@fuckingbarba\.invalid/.test(
        await pagina.locator(".feito").innerText()
      ),
      "e promete o e-mail pra quando o Pix cair — não 'enviamos', porque ainda não foi"
    )
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
    ok(
      /enviamos os detalhes pra pix@fuckingbarba\.invalid/.test(
        await pagina.locator(".feito").innerText()
      ),
      "e só agora a tela diz que mandou os detalhes por e-mail"
    )

    titulo("O e-mail de pedido confirmado")
    const [confirmacao] = await esperarConfirmacao(pago)
    ok(Boolean(confirmacao), `"Pedido #${pago.display_id} confirmado" sai quando o Pix cai`)
    ok(confirmacao?.to?.[0] === "pix@fuckingbarba.invalid", "pra quem comprou")
    const texto = textoDo(confirmacao)
    ok(/Pix recebido/.test(texto), "com a frase do obrigado pro Pix")
    ok(
      texto.includes(`Total: ${reais(pago.total)}`),
      `e o total do Medusa (${reais(pago.total)})`,
      texto.match(/Total: [^\n]*/)?.[0]
    )
    ok(
      (confirmacao?.html ?? "").includes(`/conta/pedidos/${pedidoId}`),
      "o botão leva ao pedido na conta"
    )
    ok(
      confirmacao?.chave === `pedido-confirmado/${pedidoId}`,
      "com a chave de idempotência do pedido — o Resend não manda duas vezes",
      String(confirmacao?.chave)
    )
    await esperar(3000)
    await confirmarPendentes()
    ok(
      confirmacoesDo(pago).length === 1,
      "uma vez só: o aviso do Pagar.me e a varredura passam pelo mesmo registro",
      String(confirmacoesDo(pago).length)
    )
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
    ok(cc?.operation_type === "auth_only", "o cartão vai só pra AUTORIZAR", cc?.operation_type)
    const capturas = pagarme.capturas.filter((c) => c.pedido === registro?.pedido.id)
    ok(
      capturas.filter((c) => !c.recusada).length === 1 &&
        capturas[0]?.valor === registro?.pedido.amount,
      "e é cobrado UMA vez, o valor inteiro",
      JSON.stringify(capturas)
    )
    ok(
      capturas.length > 0 && capturas.every((c) => c.analise === "approved"),
      "só depois de a análise de fraude aprovar",
      JSON.stringify(capturas.map((c) => c.analise))
    )
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
    const [confirmacao] = await esperarConfirmacao(pedido)
    ok(
      Boolean(confirmacao),
      "e o e-mail de confirmação sai na hora, sem esperar aviso nenhum do Pagar.me"
    )
    ok(
      /final 0010, em 3x sem juros/.test(textoDo(confirmacao)),
      "com o final do cartão e as parcelas",
      textoDo(confirmacao).split("\n")[2]
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
    const recusado = doCarrinho.find((r) => r.pedido.status === "failed")
    ok(
      Boolean(recusado) && !pagarme.capturas.some((c) => c.pedido === recusado.pedido.id),
      "o cartão recusado não é cobrado"
    )
    await esperarConfirmacao(pedido)
    await esperar(2000)
    ok(
      confirmacoesDo(pedido).length === 1,
      "UMA confirmação, a do pedido — a tentativa recusada não vira e-mail",
      String(confirmacoesDo(pedido).length)
    )
    await contexto.close()
  }

  /* ── 3b. o cartão só é cobrado depois da análise de fraude ────────────── */

  /*
    AS TRÊS COMPRAS DE 22/09: o banco aprovou, a análise de fraude reprovou
    segundos depois, e com `auth_and_capture` o valor apareceu e sumiu da
    fatura de quem comprou. Agora o cartão só é AUTORIZADO na criação, e a
    cobrança (`POST /charges/:id/capture`) vem com a análise aprovada. O
    cartão 0036 nasce "em análise" no falso; o teste decide o fim.
  */

  /** Checkout com o cartão em análise. Devolve o pedido e o dele no Pagar.me. */
  async function compraEmAnalise(email) {
    const { contexto, pagina } = await novaAba()
    const carrinhoId = await sacolaPronta(contexto, 1)
    await ateOPagamento(pagina, email)
    await preencherCartao(pagina, "4000 0000 0000 0036")
    await pagar(pagina)
    return { contexto, pagina, carrinhoId }
  }
  /** Relê o pedido no Medusa até `cond` valer, ou o tempo acabar. */
  async function esperarPedido(id, cond, ms = 20000) {
    let pedido = null
    for (const fim = Date.now() + ms; Date.now() < fim; await esperar(250)) {
      pedido = await pedidoNoMedusa(id)
      if (cond(pedido)) break
    }
    return pedido
  }
  const cobrancasDo = (la) => pagarme.capturas.filter((c) => c.pedido === la?.pedido.id)
  async function emailComAssunto(assunto, ms = 20000) {
    for (const fim = Date.now() + ms; Date.now() < fim; await esperar(250)) {
      const achado = resend.emails.find((e) => e.subject === assunto)
      if (achado) return achado
    }
    return null
  }

  titulo("Cartão em análise: o valor fica reservado, e só é cobrado quando a análise aprova")
  {
    const { contexto, pagina } = await compraEmAnalise("analise@fuckingbarba.invalid")
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedido = await pedidoNoMedusa(idDaUrl(pagina))
    const la = noPagarme(pedido)
    ok(
      pedido?.payment_status !== "captured" && la?.pedido.status === "pending",
      "o pedido nasce, mas NÃO pago: no Pagar.me, o cartão está só autorizado",
      `${pedido?.payment_status} · ${la?.pedido.status}`
    )
    ok(cobrancasDo(la).length === 0, "e nada foi cobrado")
    ok(
      (await tituloDoFeito(pagina)) === "Pagamento em análise" &&
        /só reservado/.test(await pagina.locator(".feito").innerText()),
      'a tela diz "Pagamento em análise", e que o valor fica só reservado',
      await tituloDoFeito(pagina)
    )
    await esperar(1500)
    ok(confirmacoesDo(pedido).length === 0, "nenhum e-mail de confirmação antes de cobrar")

    const aviso = await pagarme.aprovarAnalise(la.pedido.id)
    ok(aviso?.aviso === 200, "a análise aprova, e o Pagar.me avisa (charge.antifraud_approved)")
    const pago = await esperarPedido(pedido.id, (p) => p?.payment_status === "captured")
    ok(
      pago?.payment_status === "captured",
      "a loja cobra sozinha, e o pedido fica pago",
      pago?.payment_status
    )
    const cobrancas = cobrancasDo(la)
    ok(
      cobrancas.filter((c) => !c.recusada).length === 1 &&
        cobrancas[0].valor === la.pedido.amount &&
        cobrancas.every((c) => c.analise === "approved"),
      "UMA cobrança, o valor inteiro, com a análise aprovada",
      JSON.stringify(cobrancas)
    )
    ok((await esperarConfirmacao(pago)).length === 1, "e o e-mail de confirmação sai")
    await pagina
      .waitForFunction(
        () => document.querySelector(".feito h1")?.textContent?.trim() === "Pedido confirmado",
        null,
        { timeout: 30000 }
      )
      .catch(() => null)
    ok(
      (await tituloDoFeito(pagina)) === "Pedido confirmado",
      "a tela de obrigado vira sozinha",
      await tituloDoFeito(pagina)
    )
    await contexto.close()
  }

  titulo("Cartão aprovado na análise sem aviso nenhum: a conciliação cobra")
  {
    await longeDaConciliacaoAutomatica(90_000)
    const { contexto, pagina } = await compraEmAnalise("analise-quieta@fuckingbarba.invalid")
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedido = await pedidoNoMedusa(idDaUrl(pagina))
    const la = noPagarme(pedido)
    await pagarme.aprovarAnalise(la.pedido.id, { semAviso: true })
    await esperar(2000)
    ok(cobrancasDo(la).length === 0, "sem o aviso, nada acontece sozinho")
    const r = await conciliar()
    ok(
      r.pagas.some((p) => p.includes(`#${pedido.display_id}`)),
      "a conciliação acha o aprovado e cobra",
      JSON.stringify(r)
    )
    const pago = await esperarPedido(pedido.id, (p) => p?.payment_status === "captured")
    ok(pago?.payment_status === "captured", "o pedido fica pago", pago?.payment_status)
    ok(
      cobrancasDo(la).filter((c) => !c.recusada).length === 1,
      "UMA cobrança",
      JSON.stringify(cobrancasDo(la))
    )
    await contexto.close()
  }

  titulo("Cartão reprovado na análise depois: o pedido é cancelado, e nada é cobrado")
  {
    await longeDaConciliacaoAutomatica(90_000)
    const { contexto, pagina, carrinhoId } = await compraEmAnalise(
      "analise-reprovada@fuckingbarba.invalid"
    )
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedido = await pedidoNoMedusa(idDaUrl(pagina))
    const la = noPagarme(pedido)
    // A reserva fica pendurada: o Pagar.me não desfez, e quem desfaz é a loja.
    await pagarme.reprovarAnalise(la.pedido.id, { desfaz: false })
    const r = await conciliar()
    ok(
      r.canceladas.some((c) => c.includes(`#${pedido.display_id}`)),
      "a conciliação cancela o pedido",
      JSON.stringify(r)
    )
    const cancelado = await pedidoNoMedusa(pedido.id)
    ok(cancelado?.status === "canceled", "cancelado, e o estoque volta", cancelado?.status)
    ok(cobrancasDo(la).length === 0, "nada foi cobrado")
    ok(
      pagarme.cancelamentos.some((c) => c.pedido === la.pedido.id && c.status === "pending") &&
        la.pedido.charges[0].last_transaction.status === "voided",
      "e a reserva que o Pagar.me deixou pendurada é desfeita pela loja",
      JSON.stringify(pagarme.cancelamentos.filter((c) => c.pedido === la.pedido.id))
    )
    ok(
      !pagarme.cancelamentos.some((c) => c.pedido === la.pedido.id && c.status === "paid"),
      "sem estorno nenhum: não havia o que devolver"
    )
    const email = await emailComAssunto(`Pedido #${pedido.display_id} cancelado`)
    ok(
      Boolean(email) && /Nada foi cobrado/.test(textoDo(email)),
      'o e-mail diz "nada foi cobrado" — reserva desfeita não é estorno',
      email?.subject ?? "sem e-mail"
    )
    await contexto.close()

    /*
      E SE A RESPOSTA DA COMPRA TIVESSE SE PERDIDO (24/09): o cookie da sacola
      fica, e o carrinho já é pedido. Com o pagamento cancelado, o Medusa não
      devolve mais o pedido pelo `complete` — e o /checkout mandava pro
      /checkout/retomar, que mandava de volta: 71 idas em 8 segundos. Agora a
      loja acha o pedido pela rota `/store/pedido-do-carrinho`.
    */
    const perdida = await navegador.newContext({ viewport: { width: 1280, height: 1000 } })
    await perdida.addCookies([{ name: "carrinho", value: carrinhoId, url: LOJA }])
    const volta = await perdida.newPage()
    const idas = []
    volta.on("request", (r) => {
      if (r.isNavigationRequest() && r.frame() === volta.mainFrame())
        idas.push(new URL(r.url()).pathname)
    })
    await volta.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" }).catch(() => null)
    await volta.waitForURL(/\/checkout\/obrigado\//, { timeout: 20000 }).catch(() => null)
    await esperar(3000)
    ok(
      idDaUrl(volta) === pedido.id && idas.length <= 4,
      "com a resposta perdida e o cartão reprovado depois, o checkout leva pro pedido, sem laço",
      `${idas.length} idas: ${idas.slice(0, 6).join(" → ")}`
    )
    await semStreaming(volta)
    ok(
      /cancelado/i.test((await tituloDoFeito(volta).catch(() => "")) ?? ""),
      "e a tela do pedido diz que ele foi cancelado"
    )
    // A trava do laço, sozinha: com o recado de volta do retomar, o checkout
    // fica na tela — não manda pra lá de novo, ache ou não o pedido.
    await perdida.addCookies([{ name: "carrinho", value: carrinhoId, url: LOJA }])
    idas.length = 0
    await volta
      .goto(`${LOJA}/checkout?retomar=falhou`, { waitUntil: "domcontentloaded" })
      .catch(() => null)
    await semStreaming(volta)
    await esperar(3000)
    const fica = await volta
      .locator("main h1")
      .first()
      .textContent()
      .catch(() => "")
    ok(
      new URL(volta.url()).pathname === "/checkout" && /virou pedido/i.test(fica ?? ""),
      "e, voltando do /checkout/retomar sem pedido, o checkout fica na tela com o recado",
      `${volta.url()} · "${fica}" · ${idas.length} idas`
    )
    await perdida.close()
  }

  titulo("A análise responde enquanto o checkout espera")
  {
    pagarme.decisaoDaAnalise = { depoisDe: 2500, resultado: "aprova" }
    const aprovado = await compraEmAnalise("espera-aprova@fuckingbarba.invalid")
    await aprovado.pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedido = await pedidoNoMedusa(idDaUrl(aprovado.pagina))
    ok(
      pedido?.payment_status === "captured",
      "aprovada em segundos: o checkout espera, cobra, e o pedido nasce PAGO",
      pedido?.payment_status
    )
    ok(
      cobrancasDo(noPagarme(pedido)).every((c) => c.analise === "approved") &&
        cobrancasDo(noPagarme(pedido)).filter((c) => !c.recusada).length === 1,
      "cobrado uma vez, com a análise aprovada",
      JSON.stringify(cobrancasDo(noPagarme(pedido)))
    )
    await aprovado.contexto.close()

    pagarme.decisaoDaAnalise = { depoisDe: 2500, resultado: "reprova" }
    const reprovado = await compraEmAnalise("espera-reprova@fuckingbarba.invalid")
    const recado = reprovado.pagina.locator("#form-pagamento .erros-envio")
    await recado.waitFor({ timeout: 45000 })
    ok(
      /análise de segurança/.test(await recado.innerText()) &&
        /nada foi cobrado/.test(await recado.innerText()),
      "reprovada em segundos: a tela pede outro cartão ou o Pix, e diz que nada foi cobrado",
      await recado.innerText()
    )
    const { json: aberto } = await loja(
      `/store/carts/${reprovado.carrinhoId}?fields=id,completed_at`
    )
    ok(
      aberto?.cart && !aberto.cart.completed_at,
      "o carrinho continua aberto — nenhum pedido nasceu"
    )
    const la = [...pagarme.pedidos.values()].find(
      (r) => r.corpo.customer?.email === "espera-reprova@fuckingbarba.invalid"
    )
    ok(Boolean(la) && cobrancasDo(la).length === 0, "e nada foi cobrado")
    await reprovado.contexto.close()
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
      !pagarme.cancelamentos.some((c) => c.pedido === registro.pedido.id),
      "e NINGUÉM pede DELETE na cobrança do Pix — o Pagar.me responde 412, e foi isso que prendeu o estoque do #7 por um dia",
      JSON.stringify(pagarme.cancelamentos.filter((c) => c.pedido === registro.pedido.id))
    )
    await pagina.reload({ waitUntil: "domcontentloaded" })
    await semStreaming(pagina)
    await pagina.locator(".feito h1").waitFor({ timeout: 20000 })
    ok((await tituloDoFeito(pagina)) === "Pedido cancelado", "e a tela diz isso")
    const segunda = await conciliar()
    ok(
      !segunda.canceladas.length && !segunda.pagas.length,
      "rodar a conciliação de novo não mexe em nada",
      JSON.stringify(segunda)
    )
    ok(
      !/enviamos|confirmação vai/.test(await pagina.locator(".feito").innerText()),
      "a tela do cancelado não promete e-mail nenhum"
    )
    await confirmarPendentes()
    ok(confirmacoesDo(pedido).length === 0, "e nenhum 'Pedido confirmado' sai pro Pix que venceu")
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
    const [confirmacao] = await esperarConfirmacao(await pedidoNoMedusa(pedidoId))
    ok(Boolean(confirmacao), "e o e-mail de confirmação sai do mesmo jeito, sem o aviso")
    await contexto.close()
  }

  /* ── 5b. o Resend fora na hora da confirmação ─────────────────────────── */

  titulo("O Resend fora na hora da confirmação: a varredura manda depois")
  {
    // A varredura automática não pode passar no meio: o teste quer ver a
    // rodada dele mandar.
    await longeDasRodadasAutomaticas(45_000)
    const { contexto, pagina } = await novaAba()
    await sacolaPronta(contexto, 1)
    await ateOPagamento(pagina, "resend@fuckingbarba.invalid")
    await preencherCartao(pagina, "4000 0000 0000 0010")
    resend.roteiro.cair = true
    await pagar(pagina)
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedido = await pedidoNoMedusa(idDaUrl(pagina))
    const assunto = `Pedido #${pedido.display_id} confirmado`
    let tentou = false
    for (let i = 0; i < 80 && !tentou; i++) {
      tentou = resend.recusados.includes(assunto)
      if (!tentou) await esperar(250)
    }
    resend.roteiro.cair = false
    ok(tentou, "o pedido pago tentou mandar a confirmação na hora, e o Resend recusou")
    ok(confirmacoesDo(pedido).length === 0, "nada saiu ainda")
    const rodada = await confirmarPendentes()
    ok(
      rodada.mandados.includes(`#${pedido.display_id}`),
      "a varredura seguinte manda",
      JSON.stringify(rodada)
    )
    const outra = await confirmarPendentes()
    ok(
      confirmacoesDo(pedido).length === 1 && !outra.mandados.includes(`#${pedido.display_id}`),
      "uma vez: a rodada depois dela não manda de novo",
      `${confirmacoesDo(pedido).length} e-mails · ${JSON.stringify(outra)}`
    )
    await contexto.close()
  }

  /* ── 5c. o "Check status" do admin ────────────────────────────────────── */

  titulo('O "Check status" do admin também confirma')
  {
    // Nem a conciliação nem a varredura automática podem resolver isto no
    // meio: o teste é que o botão, sozinho, não avisa — e a varredura, sim.
    await longeDasRodadasAutomaticas(50_000)
    const { contexto, pagina } = await novaAba()
    await sacolaPronta(contexto, 1)
    await ateOPagamento(pagina, "checkstatus@fuckingbarba.invalid")
    await pagar(pagina)
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedidoId = idDaUrl(pagina)
    const pedido = await pedidoNoMedusa(pedidoId)
    const registro = noPagarme(pedido)
    await pagarme.pagar(registro.pedido.id, { semAviso: true })
    const r = await adm(`/admin/orders/${pedidoId}/payment-sessions/authorize`, {
      method: "POST",
      body: JSON.stringify({
        payment_session_id: pedido.payment_collections[0].payment_sessions[0].id,
      }),
    })
    ok(r.is_authorized === true, "o botão pergunta ao Pagar.me e registra o Pix pago")
    const pago = await pedidoNoMedusa(pedidoId)
    ok(pago?.payment_status === "captured", "o pedido fica pago", pago?.payment_status)
    await esperar(3000)
    ok(
      confirmacoesDo(pago).length === 0,
      "e nenhum evento sai dali — é o buraco que a varredura existe pra cobrir"
    )
    const rodada = await confirmarPendentes()
    ok(
      rodada.mandados.includes(`#${pago.display_id}`) && confirmacoesDo(pago).length === 1,
      "a varredura acha o pedido pago sem confirmação e manda, uma vez",
      JSON.stringify(rodada)
    )
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
    ok(
      cobrancasDo(pagarme.pedidoPorCodigo(sessao)).filter((c) => !c.recusada).length === 1,
      "e o cartão, achado pelo código, é cobrado uma vez",
      JSON.stringify(cobrancasDo(pagarme.pedidoPorCodigo(sessao)))
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
    const reservado = [...pagarme.pedidos.values()].find(
      (r) => r.corpo.customer?.email === "incerto@fuckingbarba.invalid"
    )
    /*
      Era o pior caso: o cartão cobrado lá, sem pedido aqui. Com o cartão só
      autorizado, o pior caso encolheu pra uma RESERVA sem pedido — e sessão
      que terminou "incerta" não é cobrada nunca, nem com a análise aprovada.
    */
    ok(
      reservado?.pedido.charges[0].last_transaction.status === "authorized_pending_capture",
      "o cartão foi AUTORIZADO lá, sem pedido aqui",
      reservado?.pedido.charges[0].last_transaction.status
    )
    const relatorio = await conciliar()
    ok(
      relatorio.canceladas.some((e) => e.includes(reservado?.pedido.id)),
      "a conciliação acha e desfaz a reserva",
      JSON.stringify(relatorio)
    )
    ok(
      pagarme.cancelamentos.some(
        (c) =>
          c.pedido === reservado?.pedido.id &&
          c.status === "pending" &&
          c.valor === reservado?.pedido.amount
      ) && cobrancasDo(reservado).length === 0,
      "o valor inteiro, e nada foi cobrado"
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
    ok(
      primeira?.pedido.charges[0].last_transaction.status === "authorized_pending_capture",
      "a primeira tentativa AUTORIZOU o cartão lá, sem resposta",
      primeira?.pedido.charges[0].last_transaction.status
    )

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
      relatorio.canceladas.some((e) => e.includes(primeira.pedido.id)),
      "passados 15 minutos, a conciliação acha a órfã e desfaz a reserva",
      JSON.stringify(relatorio)
    )
    ok(
      pagarme.cancelamentos.some(
        (c) =>
          c.pedido === primeira.pedido.id &&
          c.status === "pending" &&
          c.valor === primeira.pedido.amount
      ) && cobrancasDo(primeira).length === 0,
      "o valor inteiro, sem nunca ter sido cobrado"
    )
    ok(
      !pagarme.cancelamentos.some((c) => c.pedido === segunda?.pedido.id),
      "e a cobrança do pedido de verdade não é tocada"
    )
    const denovo = await conciliar()
    ok(
      !denovo.canceladas.some((e) => e.includes(primeira.pedido.id)) &&
        pagarme.cancelamentos.filter((c) => c.pedido === primeira.pedido.id).length === 1,
      "rodar de novo não desfaz duas vezes, nem repete no relatório",
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

    /*
      O QR NÃO MORRE, E O DINHEIRO VOLTA.

      Cancelar o pedido aqui não cancela o Pix lá: o Pagar.me responde 412 em
      Pix pendente, sempre. Então o combinado é outro — ninguém pede o
      DELETE, a sessão fica VIGIADA, e se a pessoa pagar o QR que está no
      WhatsApp dela desde ontem, a conciliação devolve o dinheiro.
    */
    titulo("Cancelar no admin com o Pix esperando: o QR sobrevive, e o que entrar volta")
    await longeDaConciliacaoAutomatica(90_000)
    await adm(`/admin/orders/${pedido.id}/cancel`, { method: "POST" })
    let cancelado = null
    for (let i = 0; i < 40 && cancelado !== "canceled"; i++) {
      await esperar(250)
      cancelado = (await pedidoNoMedusa(pedido.id))?.status
    }
    ok(cancelado === "canceled", "o pedido fica cancelado no Medusa", cancelado)
    // O subscriber já rodou (o cancelamento acima esperou por ele); o que
    // ele NÃO pode ter feito é pedir o DELETE.
    await esperar(2000)
    ok(
      !pagarme.cancelamentos.some((c) => c.pedido === criado.pedido.id),
      "e ninguém pede DELETE na cobrança do Pix — o Pagar.me responderia 412",
      JSON.stringify(pagarme.cancelamentos.filter((c) => c.pedido === criado.pedido.id))
    )
    const cobranca = criado.pedido.charges[0]
    ok(
      cobranca.status === "pending",
      "a cobrança segue pendente lá — o QR ainda paga",
      cobranca.status
    )
    let vigiada = null
    for (let i = 0; i < 20; i++) {
      vigiada = (await pedidoNoMedusa(pedido.id))?.payment_collections?.[0]?.payment_sessions?.[0]
        ?.status
      if (vigiada !== "pending_authorization") break
      await esperar(250)
    }
    ok(
      vigiada === "pending_authorization",
      "e a sessão continua pendente — vigiada, à espera do que possa entrar",
      vigiada
    )

    // E a pessoa paga o QR velho.
    await pagarme.pagar(criado.pedido.id)
    await esperar(6000)
    const devolveu = await conciliar()
    ok(
      devolveu.estornadas.length >= 1,
      "a conciliação devolve o que entrou num pedido que não existe mais",
      JSON.stringify(devolveu)
    )
    ok(
      (cobranca.refunded_amount ?? 0) >= cobranca.amount || cobranca.status === "refunded",
      "e o dinheiro está de volta no Pagar.me",
      `${cobranca.status} ${cobranca.refunded_amount}/${cobranca.amount}`
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
    await semStreaming(pagina)
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
    await semStreaming(pagina)
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

  /* ── 8b. o estorno que o Pagar.me não fez ─────────────────────────────── */

  /*
    O PRIMEIRO PIX REAL (#6): o admin cancelou, o Medusa marcou "Refunded",
    o Pagar.me aceitou o estorno ("Aguardando cancelamento") e desistiu
    depois — Pix sai do saldo, e o saldo não tinha o valor. A cobrança voltou
    pra "Aprovada", e ninguém soube. Aqui o Pagar.me falso segura o estorno e
    faz ele falhar, duas vezes, antes de deixar sair.
  */
  titulo("O estorno que o Pagar.me não fez: a loja fica sabendo, avisa e pede de novo")
  {
    const email = "estorno@fuckingbarba.invalid"
    const aberto = await fecharPelaApi(await carrinhoPelaApi(email), email)
    const la = noPagarme(aberto)
    await pagarme.pagar(la.pedido.id)
    let pago = null
    for (let i = 0; i < 40 && pago?.payment_status !== "captured"; i++) {
      await esperar(250)
      pago = await pedidoNoMedusa(aberto.id)
    }
    ok(pago?.payment_status === "captured", "um Pix pago, pra cancelar", pago?.payment_status)
    const cobranca = la.pedido.charges[0]
    const pedidosDeEstorno = () => pagarme.cancelamentos.filter((c) => c.cobranca === cobranca.id)
    const avisos = () =>
      resend.emails.filter((e) => e.subject === `O estorno do pedido #${pago.display_id} não saiu`)
    const registro = async () =>
      Object.values(
        (await adm(`/admin/orders/${aberto.id}?fields=id,metadata`)).order?.metadata?.estornos ?? {}
      )[0]

    pagarme.estornos = "segura"
    await adm(`/admin/orders/${aberto.id}/cancel`, { method: "POST" })
    const cancelado = await pedidoNoMedusa(aberto.id)
    ok(
      cancelado?.payment_status === "refunded" && cobranca.pending_cancellation === true,
      'o admin cancela e o Medusa marca estornado; lá, o estorno fica "aguardando cancelamento"',
      `${cancelado?.payment_status} · pendente: ${cobranca.pending_cancellation}`
    )

    let r = await conciliar()
    ok(
      !r.estornos.falharam.length && !(await registro()) && !avisos().length,
      "enquanto o estorno anda, a conciliação espera — sem alarme",
      JSON.stringify(r.estornos)
    )

    pagarme.falharEstorno(la.pedido.id)
    r = await conciliar()
    ok(
      r.estornos.falharam.some((x) => x.startsWith(`#${pago.display_id} `)),
      "o Pagar.me desistiu: a conciliação vê que o dinheiro não voltou",
      JSON.stringify(r.estornos)
    )
    let anotado = await registro()
    ok(
      anotado?.situacao === "falhou" &&
        anotado?.sozinha === true &&
        anotado?.cobranca === cobranca.id,
      "e anota no pedido — é o que a faixa vermelha do admin lê",
      JSON.stringify(anotado)
    )
    ok(
      Date.parse(anotado?.proxima ?? "") - Date.now() > 5.9 * 3600 * 1000,
      "com a próxima tentativa sozinha daqui a 6 horas",
      String(anotado?.proxima)
    )
    // Um pra cada usuário do admin (o banco local tem mais de um) — e um só pra cada.
    const pra = avisos().map((e) => e.to?.[0])
    const aviso = avisos().find((e) => e.to?.[0] === EMAIL_ADMIN)
    ok(
      Boolean(aviso) && new Set(pra).size === pra.length,
      "quem tem acesso ao admin recebe UM e-mail",
      pra.join(", ")
    )
    const quantosAvisos = pra.length
    ok(
      textoDo(aviso).includes(reais(pago.total)) && textoDo(aviso).includes(cobranca.id),
      "com o valor e a cobrança, pra achar no painel do Pagar.me",
      textoDo(aviso).slice(0, 160)
    )
    ok(
      !textoDo(aviso).includes(email) && !/Paulista|11144477735|Fulano/.test(textoDo(aviso)),
      "e sem dado de quem comprou"
    )

    r = await conciliar()
    ok(
      avisos().length === quantosAvisos &&
        !r.estornos.pedidosDeNovo.length &&
        pedidosDeEstorno().length === 1,
      "a rodada seguinte não repete o e-mail nem pede de novo antes da hora",
      `${avisos().length} e-mail(s), ${pedidosDeEstorno().length} pedido(s) de estorno`
    )

    /*
      "Tentar o estorno de novo", ainda sem saldo: o pedido sai, com o valor
      que faltou, e o Pagar.me segura e desiste outra vez. (A hora marcada da
      loja sozinha é a mesma conta, e está no teste de unidade: `ehAVez`.)
    */
    let tentativa = await adm(`/admin/pedidos/${aberto.id}/estorno`, { method: "POST" })
    anotado = await registro()
    ok(
      tentativa?.resultado === "pedido" &&
        pedidosDeEstorno().length === 2 &&
        pedidosDeEstorno()[1].valor === la.pedido.amount &&
        anotado?.tentativas === 1,
      "o botão do admin pede o estorno de novo, com o valor que faltou",
      `${JSON.stringify(tentativa)} · ${JSON.stringify(pedidosDeEstorno())}`
    )
    const andando = await adm(`/admin/pedidos/${aberto.id}/estorno`, { method: "POST" })
    ok(
      andando?.resultado === "andando" && pedidosDeEstorno().length === 2,
      "apertar de novo com o estorno andando não pede outro",
      JSON.stringify(andando)
    )
    pagarme.falharEstorno(la.pedido.id)
    r = await conciliar()
    ok(
      avisos().length === quantosAvisos &&
        !r.estornos.falharam.length &&
        pedidosDeEstorno().length === 2,
      "falhou de novo: nem e-mail novo, nem pedido fora de hora",
      `${avisos().length} · ${JSON.stringify(r.estornos)}`
    )

    // "Tentar o estorno de novo", com saldo: sai na hora.
    pagarme.estornos = "normal"
    tentativa = await adm(`/admin/pedidos/${aberto.id}/estorno`, { method: "POST" })
    anotado = await registro()
    ok(
      tentativa?.resultado === "devolvido" && anotado?.situacao === "devolvido",
      'o botão "Tentar o estorno de novo": o Pagar.me devolve, e a faixa vira a verde',
      `${JSON.stringify(tentativa)} · ${JSON.stringify(anotado)}`
    )
    ok(
      pedidosDeEstorno().length === 3 && cobranca.refunded_amount === la.pedido.amount,
      "três pedidos de estorno, e o dinheiro volta uma vez só",
      `${pedidosDeEstorno().length} · devolvido ${cobranca.refunded_amount} de ${la.pedido.amount}`
    )
    r = await conciliar()
    const deNovo = await adm(`/admin/pedidos/${aberto.id}/estorno`, { method: "POST" })
    ok(
      deNovo?.resultado === "devolvido" && pedidosDeEstorno().length === 3,
      "depois de devolvido, nem a conciliação nem o botão pedem outro",
      `${JSON.stringify(deNovo)} · ${pedidosDeEstorno().length}`
    )
  }

  /* ── 10. os casos raros de 24/09 ──────────────────────────────────────── */

  titulo("O Pix pago com o pedido já cancelado passa pelo Medusa — e o estorno dele é conferido")
  {
    /*
      Até 24/09, a conciliação que achasse o Pix pago antes do aviso estornava
      direto no Pagar.me, sem nada no Medusa: se o estorno falhasse (o Pix
      recém-pago, fora do saldo), o dinheiro ficava com a loja, calado.
    */
    await longeDaConciliacaoAutomatica(60_000)
    const email = "pago-cancelado@fuckingbarba.invalid"
    const aberto = await fecharPelaApi(await carrinhoPelaApi(email), email)
    const la = noPagarme(aberto)
    await adm(`/admin/orders/${aberto.id}/cancel`, { method: "POST" })
    await esperar(1500) // o subscriber do cancelamento: o Pix pendente fica vigiado
    pagarme.estornos = "segura"
    await pagarme.pagar(la.pedido.id, { semAviso: true })
    const r = await conciliar()
    const lido = await adm(
      `/admin/orders/${aberto.id}?fields=id,payment_collections.payments.id,` +
        "payment_collections.payments.captured_at,payment_collections.payments.refunds.amount"
    )
    const pagamentos = (lido.order?.payment_collections ?? []).flatMap((c) => c?.payments ?? [])
    ok(
      pagamentos.some((p) => p.captured_at && (p.refunds ?? []).length > 0),
      "o dinheiro que entrou no pedido cancelado é registrado no Medusa, e devolvido por ele",
      JSON.stringify({ pagamentos, pagas: r.pagas, estornadas: r.estornadas, avisos: r.avisos })
    )
    pagarme.falharEstorno(la.pedido.id)
    const r2 = await conciliar()
    const anotado = Object.values(
      (await adm(`/admin/orders/${aberto.id}?fields=id,metadata`)).order?.metadata?.estornos ?? {}
    )[0]
    ok(
      anotado?.situacao === "falhou" &&
        r2.estornos.falharam.some((x) => x.startsWith(`#${aberto.display_id} `)),
      "e o estorno que falha lá fica anotado no pedido, com o aviso pra equipe",
      JSON.stringify({ anotado, estornos: r2.estornos })
    )
    pagarme.estornos = "normal"
  }

  titulo('O "Check status" do admin junto com a conciliação não estorna o pedido pago')
  {
    /*
      Os dois registravam o mesmo pagamento ao mesmo tempo: o segundo batia no
      índice único, e o Medusa chamava o `cancelPayment` do provedor, que
      estornava a cobrança paga — com o pedido seguindo pago pro envio. O
      Pagar.me lento na busca por código põe os dois juntos no provedor.
    */
    await longeDaConciliacaoAutomatica(60_000)
    const email = "check-junto@fuckingbarba.invalid"
    const aberto = await fecharPelaApi(await carrinhoPelaApi(email), email)
    const la = noPagarme(aberto)
    const sessao = aberto.payment_collections[0].payment_sessions[0].id
    await pagarme.pagar(la.pedido.id, { semAviso: true })
    const antes = pagarme.cancelamentos.length
    pagarme.atrasoNaBusca = 1500
    let doBotao = null
    try {
      ;[doBotao] = await Promise.all([
        fetch(`${MEDUSA}/admin/orders/${aberto.id}/payment-sessions/authorize`, {
          method: "POST",
          headers: cabAdmin,
          body: JSON.stringify({ payment_session_id: sessao }),
        }).then(async (resposta) => `${resposta.status} ${(await resposta.text()).slice(0, 120)}`),
        conciliar().catch((e) => String(e)),
      ])
    } finally {
      pagarme.atrasoNaBusca = 0
    }
    await esperar(1500)
    const estornos = pagarme.cancelamentos.slice(antes).filter((c) => c.pedido === la.pedido.id)
    ok(
      estornos.length === 0 && la.pedido.charges[0].status === "paid",
      "o botão e a conciliação juntos: nenhum estorno lá, e a cobrança continua paga",
      JSON.stringify({ estornos, doBotao })
    )
    const depois = await pedidoNoMedusa(aberto.id)
    ok(depois?.payment_status === "captured", "e o pedido fica pago aqui", depois?.payment_status)
  }

  titulo("O cartão em análise de um pedido cancelado não é cobrado quando a análise aprova")
  {
    /*
      O admin cancela, e o DELETE da reserva não passa na hora (412). A sessão
      ficava pendente sem marca nenhuma, e a análise que aprovasse depois
      cobrava o cartão — o valor aparecia na fatura e sumia no estorno.
    */
    await longeDaConciliacaoAutomatica(90_000)
    const { contexto, pagina } = await compraEmAnalise("cancelado-em-analise@fuckingbarba.invalid")
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedido = await pedidoNoMedusa(idDaUrl(pagina))
    const la = noPagarme(pedido)
    pagarme.proximoCancelamento = "412"
    await adm(`/admin/orders/${pedido.id}/cancel`, { method: "POST" })
    const situacaoDaSessao = async () =>
      (await pedidoNoMedusa(pedido.id))?.payment_collections?.[0]?.payment_sessions?.[0]?.data
        ?.pagarme?.situacao
    let situacao = null
    for (let i = 0; i < 40 && situacao !== "cancelando"; i++) {
      await esperar(250)
      situacao = await situacaoDaSessao()
    }
    ok(
      situacao === "cancelando",
      'o Pagar.me diz "ainda não" ao cancelamento: a sessão fica marcada, à espera',
      String(situacao)
    )
    const capturasAntes = pagarme.capturas.filter((c) => c.pedido === la.pedido.id && !c.recusada)
    await pagarme.aprovarAnalise(la.pedido.id)
    // O Medusa processa o aviso uns 5 s depois de receber: espera a cobrança mudar.
    const c = la.pedido.charges[0]
    for (let i = 0; i < 60 && c.last_transaction.status === "authorized_pending_capture"; i++) {
      await esperar(250)
    }
    await esperar(1000)
    const cobradas = pagarme.capturas.filter((c) => c.pedido === la.pedido.id && !c.recusada)
    ok(
      cobradas.length === capturasAntes.length && c.last_transaction.status === "voided",
      "a análise aprova depois: o cartão NÃO é cobrado, e a reserva é desfeita",
      `${cobradas.length - capturasAntes.length} cobrança(s) · ${c.status}/${c.last_transaction.status}`
    )
    await contexto.close()
  }

  titulo('O "Check status" num cartão reprovado não deixa o pedido preso pra sempre')
  {
    /*
      O botão grava a recusa na sessão na hora, e a rodada de pendentes, que só
      olha sessão pendente, nunca mais passava por ela: o pedido ficava
      "aguardando" pra sempre, com o estoque reservado.
    */
    await longeDaConciliacaoAutomatica(90_000)
    const { contexto, pagina } = await compraEmAnalise("preso@fuckingbarba.invalid")
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
    const pedido = await pedidoNoMedusa(idDaUrl(pagina))
    const la = noPagarme(pedido)
    await pagarme.reprovarAnalise(la.pedido.id, { semAviso: true, desfaz: false })
    const sessao = pedido.payment_collections[0].payment_sessions[0].id
    const botao = await fetch(`${MEDUSA}/admin/orders/${pedido.id}/payment-sessions/authorize`, {
      method: "POST",
      headers: cabAdmin,
      body: JSON.stringify({ payment_session_id: sessao }),
    })
    const aberto = await pedidoNoMedusa(pedido.id)
    const status = aberto?.payment_collections?.[0]?.payment_sessions?.[0]?.status
    ok(
      !botao.ok && aberto?.status === "pending" && status === "error",
      'o "Check status" grava a recusa na sessão, e o pedido fica aberto',
      `${botao.status} · ${aberto?.status} · ${status}`
    )
    const r = await conciliar()
    const depois = await pedidoNoMedusa(pedido.id)
    ok(
      depois?.status === "canceled" &&
        r.canceladas.some((x) => x.startsWith(`#${pedido.display_id} `)),
      "a conciliação solta o pedido: cancelado, e o estoque volta",
      `${depois?.status} · ${JSON.stringify(r.canceladas)}`
    )
    ok(
      la.pedido.charges[0].last_transaction.status === "voided" &&
        !pagarme.capturas.some((c) => c.pedido === la.pedido.id && !c.recusada),
      "e nada foi cobrado: a reserva reprovada foi desfeita",
      la.pedido.charges[0].last_transaction.status
    )
    await contexto.close()
  }
} catch (e) {
  falhas++
  console.log(`\n  ✗ o conferidor quebrou no meio: ${e instanceof Error ? e.stack : e}`)
} finally {
  resend.roteiro.cair = false
  pagarme.estornos = "normal"
  pagarme.atrasoNaBusca = 0
  pagarme.proximoCancelamento = null
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
await resend.fechar()
console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
