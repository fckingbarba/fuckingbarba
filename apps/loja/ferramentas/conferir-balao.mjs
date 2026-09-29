/**
 * CONFERIDOR DO BALÃO DO PEDIDO (0203) — comprando com Pix numa loja de pé,
 * com o Pagar.me de mentira atrás, e voltando pra loja depois.
 *
 * A mesma pilha do `conferir-pagamento.mjs` (o backend com os falsos, a loja
 * com as variáveis do Pagar.me falso) e as mesmas variáveis: LOJA,
 * MEDUSA_BACKEND_URL, NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL,
 * ADMIN_SENHA, MEDUSA_WEBHOOK_SEGREDO e CHROMIUM.
 *
 *   ADMIN_EMAIL=… ADMIN_SENHA=… node ferramentas/conferir-balao.mjs
 *
 * Liga o Pagar.me na região pelo admin e DEVOLVE a região como estava no fim.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • quem comprou voltar pra loja e não achar o pedido (o pedido dele);   │
 * │ • o balão aparecer no checkout, ou pra quem não comprou — e quem não   │
 * │   comprou pagar uma requisição por página;                             │
 * │ • o Pix do balão ser outro que não o do pedido;                        │
 * │ • o balão ficar parado em "Falta pagar o Pix" com o Pix já pago;       │
 * │ • o cookie do balão, copiado ou forjado, mostrar o pedido de outro;    │
 * │ • o X não esconder de vez, ou o balão ficar pra sempre;                │
 * │ • o balão tapar o "Comprar" da barra da página de produto;             │
 * │ • o "Refazer" do Pix vencido não pôr os produtos de volta na sacola.   │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { readFileSync } from "node:fs"
import { comAFaixaRespondida } from "./faixa-respondida.mjs"
import { subirFrenetFalsa } from "./frenet-falsa.mjs"
import { subirPagarmeFalso } from "./pagarme-falso.mjs"
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
const CELULAR = { width: 390, height: 844 }

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

/* ── os falsos e o Medusa ─────────────────────────────────────────────────── */

const frenet = await subirFrenetFalsa()
const pagarme = await subirPagarmeFalso({
  webhook: { url: `${MEDUSA}/hooks/payment/pagarme_pagarme`, segredo: SEGREDO },
})
const resend = await subirResendFalso()
console.log(
  `  ⚙  Frenet falsa :${frenet.porta} · Pagar.me falso ${pagarme.url} · Resend :${resend.porta}`
)

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
  const r = await fetch(`${MEDUSA}${caminho}`, { ...opcoes, headers: cabAdmin })
  return r.json().catch(() => null)
}
async function loja(caminho, opcoes = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, { ...opcoes, headers: cabLoja })
  return r.json().catch(() => null)
}

async function pedidoNoMedusa(id) {
  const r = await adm(
    `/admin/orders/${id}?fields=id,display_id,status,payment_status,*items,` +
      "*payment_collections,*payment_collections.payment_sessions"
  )
  return r?.order
}
function noPagarme(pedido) {
  const sessao = pedido?.payment_collections?.[0]?.payment_sessions?.[0]
  return sessao ? pagarme.pedidoPorCodigo(sessao.id) : null
}

/* ── o navegador ──────────────────────────────────────────────────────────── */

const { chromium } = await import("playwright")
const navegador = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
)
comAFaixaRespondida(navegador, LOJA)
const errosDeConsole = []
const naoAchados = []
const RUIDO_DE_DEV = /_next\/hmr|websocket|favicon/i
let pessoaDaAba = 0
const ORIGEM_DA_LOJA = new URL(LOJA).origin

/** Uma aba é uma pessoa: o seu IP (a porta do cartão conta por pessoa) e as perguntas ao balão. */
async function novaAba(viewport = CELULAR) {
  const contexto = await navegador.newContext({ viewport })
  const ip = `198.51.100.${(pessoaDaAba++ % 250) + 1}`
  await contexto.route(
    (url) => url.origin === ORIGEM_DA_LOJA,
    (rota) => rota.continue({ headers: { ...rota.request().headers(), "x-real-ip": ip } })
  )
  await contexto.grantPermissions(["clipboard-read", "clipboard-write"], { origin: LOJA })
  // O "N" do `next dev` mora no mesmo canto do balão e come o clique. Produção não tem.
  await contexto.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const estilo = document.createElement("style")
      estilo.textContent = "nextjs-portal{display:none!important}"
      document.head.append(estilo)
    })
  })
  const pagina = await contexto.newPage()
  pagina.on(
    "console",
    (m) => m.type() === "error" && !RUIDO_DE_DEV.test(m.text()) && errosDeConsole.push(m.text())
  )
  pagina.on("response", (r) => r.status() === 404 && naoAchados.push(r.url()))
  const perguntas = []
  pagina.on("request", (r) => {
    if (r.url().includes("/api/pedido-recente")) perguntas.push(r.url())
  })
  return { contexto, pagina, perguntas }
}

/** Sacola com o shampoo, pela API — preparação. O cookie vai pra aba, como a loja faria. */
async function sacolaPronta(contexto, quantidade = 2) {
  const r = await loja("/store/regions")
  const regiao = r.regions.find((x) => x.currency_code === "brl")
  const p = await loja(
    `/store/products?handle=shampoo-para-barba&region_id=${regiao.id}&fields=*variants`
  )
  const c = await loja("/store/carts", {
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

const semStreaming = (pagina) =>
  pagina
    .waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, {
      timeout: 20000,
    })
    .catch(() => null)

/** O checkout inteiro, pela tela, pagando no Pix. Termina no obrigado; devolve o pedido. */
async function comprarNoPix(pagina, email) {
  // O checkout pelo computador, como o conferir-pagamento; a volta pra loja, no tamanho da aba.
  const tamanho = pagina.viewportSize()
  await pagina.setViewportSize({ width: 1280, height: 1000 })
  await pagina.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
  await semStreaming(pagina)
  await pagina.locator("#form-contato").waitFor({ timeout: 25000 })
  const campo = (n) => pagina.locator(`.fluxo [name="${n}"]`)
  await campo("email").fill(email)
  await campo("nome").fill("Matheus")
  await campo("sobrenome").fill("Teste Balão")
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
  await pagina
    .locator("#form-pagamento button[type=submit]:not([disabled])")
    .waitFor({ state: "attached", timeout: 25000 })
    .catch(() => null)
  await pagina.locator("#form-pagamento button[type=submit]").click()
  await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 45000 })
  const id = pagina.url().split("/").pop()
  await pagina.setViewportSize(tamanho)
  return pedidoNoMedusa(id)
}

const balao = (pagina) => pagina.locator(".bp-balao")
const folha = (pagina) => pagina.locator(".bp-folha")

/* ── a região com o Pagar.me, e devolvida no fim ─────────────────────────── */

const { regions } = await adm("/admin/regions?fields=id,currency_code,*payment_providers")
const regiao = regions.find((r) => r.currency_code === "brl")
const provedoresDeAntes = (regiao.payment_providers ?? []).map((p) => p.id)

try {
  await adm(`/admin/regions/${regiao.id}`, {
    method: "POST",
    body: JSON.stringify({ payment_providers: [PAGARME] }),
  })
  // A porta do Pix e do cartão começa solta: as travas contra o robô contam a
  // última hora, e as compras das rodadas anteriores não podem barrar esta.
  await adm("/admin/cartao", { method: "POST", body: JSON.stringify({ acao: "soltar" }) })

  /* ── 1. quem não comprou ─────────────────────────────────────────────── */

  titulo("Quem não comprou")
  {
    const { contexto, pagina, perguntas } = await novaAba()
    await pagina.goto(`${LOJA}/`, { waitUntil: "load" })
    await esperar(1500)
    ok((await balao(pagina).count()) === 0, "não vê balão nenhum")
    ok(perguntas.length === 0, "e o navegador não pergunta nada ao servidor", perguntas.join(" "))
    await contexto.close()
  }

  /* ── 2. o Pix, do obrigado de volta pra loja ──────────────────────────── */

  let pedidoDoPix = null
  titulo("Pix gerado, e a pessoa volta pra loja")
  {
    const { contexto, pagina, perguntas } = await novaAba()
    await sacolaPronta(contexto)
    const pedido = await comprarNoPix(pagina, "balao@fuckingbarba.invalid")
    pedidoDoPix = pedido
    const registro = noPagarme(pedido)
    const codigo = registro?.pedido.charges[0].last_transaction.qr_code
    ok(Boolean(codigo), "o pedido nasceu com um Pix no Pagar.me")

    await esperar(1500)
    ok((await balao(pagina).count()) === 0, "na tela de obrigado não há balão — ela já é o pedido")

    await pagina.goto(`${LOJA}/`, { waitUntil: "load" })
    await balao(pagina).waitFor({ timeout: 20000 })
    const texto = await balao(pagina).textContent()
    ok(
      texto.includes(`Pedido #${pedido.display_id}`),
      "na home, o balão com o número do pedido",
      texto
    )
    ok(/Falta pagar o Pix/.test(texto), "diz que falta pagar o Pix", texto)
    ok(/Vale por mais (29|30) minutos/.test(texto), "e quanto tempo o Pix ainda vale", texto)
    ok(perguntas.length >= 1, "quem comprou pergunta ao servidor")

    {
      const caixa = await balao(pagina).boundingBox()
      ok(
        Boolean(caixa) && caixa.y + caixa.height <= CELULAR.height && caixa.y > CELULAR.height / 2,
        "no celular, o balão fica embaixo, inteiro na tela",
        JSON.stringify(caixa)
      )
    }

    // Aberto: o resumo, com o Pix pra copiar.
    await pagina.locator(".bp-balao__abrir").click()
    await folha(pagina).waitFor({ timeout: 5000 })
    ok(
      (await pagina.getByRole("dialog", { name: /Falta pagar o Pix/ }).count()) === 1,
      "tocar no balão abre o resumo, como diálogo com título"
    )
    ok(
      (await pagina.locator(".bp-itens li").count()) === pedido.items.length,
      "com os itens do pedido"
    )
    await pagina.locator(".bp-pix__copiar").click()
    await pagina.locator(".bp-pix__copiar", { hasText: "Copiado!" }).waitFor({ timeout: 5000 })
    ok(
      (await pagina.evaluate(() => navigator.clipboard.readText())) === codigo,
      "copiar põe na área de transferência o Pix DESTE pedido"
    )
    ok(
      (await pagina.locator(".bp-acoes__ver").getAttribute("href")) ===
        `/checkout/obrigado/${pedido.id}`,
      "e 'Ver pedido completo' leva pro obrigado dele"
    )
    await pagina.keyboard.press("Escape")
    await folha(pagina).waitFor({ state: "detached", timeout: 5000 })
    ok(true, "o Esc fecha o resumo")
    ok(
      await pagina.evaluate(() => document.activeElement?.classList.contains("bp-balao__abrir")),
      "e o foco volta pro balão"
    )

    // Na página de produto, por cima da barra de compra.
    await pagina.goto(`${LOJA}/produtos/shampoo-para-barba`, { waitUntil: "load" })
    await balao(pagina).waitFor({ timeout: 20000 })
    ok(true, "o balão segue na página de produto")
    await pagina.mouse.wheel(0, 2500)
    await pagina.locator(".barra-compra.e-visivel").waitFor({ timeout: 10000 })
    await esperar(600)
    {
      const [b, barra] = [
        await balao(pagina).boundingBox(),
        await pagina.locator(".barra-compra").boundingBox(),
      ]
      ok(
        Boolean(b && barra) && b.y + b.height <= barra.y,
        "com a barra de compra na tela, o balão sobe e não tapa o Comprar",
        JSON.stringify({ balao: b, barra })
      )
    }

    // No checkout, não.
    await pagina.goto(`${LOJA}/checkout`, { waitUntil: "load" })
    await esperar(1500)
    ok((await balao(pagina).count()) === 0, "no checkout, o balão não aparece")

    // O Pix cai com a pessoa navegando.
    await pagina.goto(`${LOJA}/`, { waitUntil: "load" })
    await balao(pagina).waitFor({ timeout: 20000 })
    await pagarme.pagar(registro.pedido.id)
    await pagina
      .locator(".bp-balao__titulo", { hasText: "Pedido confirmado" })
      .waitFor({ timeout: 45000 })
    ok(true, "o Pix caiu: o balão muda sozinho pra 'Pedido confirmado'")
    ok(
      (await pagina.locator(".bp[data-estado=pago]").count()) === 1 &&
        (await pagina.locator(".bp-balao__faixa").count()) === 0,
      "fica verde, e a faixa do tempo do Pix some"
    )

    // O X esconde de vez.
    await pagina.locator(".bp-balao__x").click()
    await balao(pagina).waitFor({ state: "detached", timeout: 5000 })
    ok(true, "o X esconde o balão")
    const antes = perguntas.length
    await pagina.goto(`${LOJA}/produtos/shampoo-para-barba`, { waitUntil: "load" })
    await esperar(2000)
    ok((await balao(pagina).count()) === 0, "e ele não volta na página seguinte")
    ok(perguntas.length === antes, "nem pergunta de novo ao servidor")
    await contexto.close()
  }

  /* ── 3. o cookie do balão sem o crachá ────────────────────────────────── */

  titulo("O cookie do balão, sem o crachá de quem comprou")
  {
    const { contexto, pagina, perguntas } = await novaAba()
    await contexto.addCookies([{ name: "pedido_recente", value: pedidoDoPix.id, url: LOJA }])
    await pagina.goto(`${LOJA}/`, { waitUntil: "load" })
    await pagina.waitForResponse((r) => r.url().includes("/api/pedido-recente"), { timeout: 15000 })
    await esperar(1000)
    ok((await balao(pagina).count()) === 0, "o servidor não mostra o pedido de outra pessoa")
    // Recusado uma vez, o navegador não pergunta de novo a cada página.
    const antes = perguntas.length
    await pagina.goto(`${LOJA}/produtos/shampoo-para-barba`, { waitUntil: "load" })
    await esperar(2000)
    ok(perguntas.length === antes, "e, recusado, não pergunta de novo na página seguinte")
    const r = await pagina.evaluate(() =>
      fetch("/api/pedido-recente", { cache: "no-store" }).then((x) => x.json())
    )
    ok(r?.mostrar === false && !r.pedido, "a resposta não traz nada do pedido", JSON.stringify(r))
    await contexto.close()
  }

  /* ── 4. o Pix vence ───────────────────────────────────────────────────── */

  titulo("O Pix vence, e o Refazer")
  {
    pagarme.validadeDoPix = 6
    const { contexto, pagina } = await novaAba({ width: 1280, height: 900 })
    await sacolaPronta(contexto, 1)
    const pedido = await comprarNoPix(pagina, "balao-vence@fuckingbarba.invalid")
    pagarme.validadeDoPix = null
    await pagina.goto(`${LOJA}/`, { waitUntil: "load" })
    await balao(pagina).waitFor({ timeout: 20000 })
    {
      const caixa = await balao(pagina).boundingBox()
      ok(
        Boolean(caixa) && caixa.x <= 40 && caixa.width <= 400,
        "no computador, o balão fica no canto de baixo, à esquerda",
        JSON.stringify(caixa)
      )
    }
    await pagina
      .locator(".bp-balao__titulo", { hasText: "O Pix venceu" })
      .waitFor({ timeout: 30000 })
    ok(true, "vencido o código, o balão diz que o Pix venceu")
    await pagina.locator(".bp-balao__botao", { hasText: "Refazer" }).click()
    await pagina.waitForFunction(
      () => document.documentElement.classList.contains("carrinho-aberto"),
      null,
      { timeout: 20000 }
    )
    ok(true, "'Refazer' abre a sacola")
    await pagina.locator(".sacolinha .linha, .sacolinha li").first().waitFor({ timeout: 10000 })
    ok(
      /Shampoo/i.test(await pagina.locator(".sacolinha").innerText()),
      "com os produtos do pedido de volta"
    )
    ok((await balao(pagina).count()) === 0, "e o balão do pedido vencido sai")
    void pedido
    await contexto.close()
  }

  /* ── 5. o prazo ───────────────────────────────────────────────────────── */

  titulo("Meia hora depois")
  {
    const { contexto, pagina } = await novaAba()
    await pagina.clock.install()
    await sacolaPronta(contexto, 1)
    const pedido = await comprarNoPix(pagina, "balao-prazo@fuckingbarba.invalid")
    await pagarme.pagar(noPagarme(pedido).pedido.id)
    await pagina.goto(`${LOJA}/`, { waitUntil: "load" })
    await pagina
      .locator(".bp-balao__titulo", { hasText: "Pedido confirmado" })
      .waitFor({ timeout: 30000 })
    await pagina.clock.fastForward("29:00")
    await esperar(500)
    ok((await balao(pagina).count()) === 1, "aos 29 minutos, o balão ainda está lá")
    await pagina.clock.fastForward("02:00")
    await balao(pagina)
      .waitFor({ state: "detached", timeout: 10000 })
      .catch(() => null)
    ok((await balao(pagina).count()) === 0, "passada a meia hora, some sozinho")
    await contexto.close()
  }

  titulo("Console")
  ok(
    errosDeConsole.length === 0,
    "nenhum erro no console",
    [...errosDeConsole.slice(0, 3), ...naoAchados.slice(0, 5)].join(" | ")
  )
} finally {
  await adm(`/admin/regions/${regiao.id}`, {
    method: "POST",
    body: JSON.stringify({ payment_providers: provedoresDeAntes }),
  }).catch(() => null)
  await navegador.close()
  frenet.fechar?.()
  pagarme.fechar?.()
  resend.fechar?.()
}

console.log(`\n${testes - falhas}/${testes} ${falhas ? "— FALHOU" : "ok"}`)
process.exit(falhas ? 1 : 0)
