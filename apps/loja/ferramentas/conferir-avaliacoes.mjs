/**
 * CONFERIDOR DAS AVALIAÇÕES — o e-mail um dia depois da entrega, a página
 * escondida /avaliar e a avaliação aprovada no site.
 *
 *   node ferramentas/conferir-avaliacoes.mjs [url-da-loja]
 *
 * Variáveis: LOJA (ou o argumento), MEDUSA_BACKEND_URL,
 *            NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL, ADMIN_SENHA,
 *            PORTA_RESEND (a do `RESEND_URL` do backend, padrão 4330),
 *            PORTA_FALSA (a Frenet falsa, a do `FRENET_URL`, padrão 4310),
 *            PORTA_PAGARME_FALSO (a do `PAGARME_URL`, padrão 4320),
 *            FRENET_WEBHOOK_TOKEN e MEDUSA_WEBHOOK_SEGREDO (os do backend;
 *            padrão, os de teste do AGENTS.md), REVALIDAR_SEGREDO, CHROMIUM.
 *
 * ┌─ A PERGUNTA QUE ESTE ARQUIVO RESPONDE ─────────────────────────────────┐
 * │ Quem recebeu o pedido consegue avaliar sem conta, e a avaliação chega  │
 * │ no site depois do painel. As partes que só funcionam juntas:           │
 * │                                                                         │
 * │   o Medusa → a entrega do rastreio, a rodada do e-mail                 │
 * │              (`POST /admin/avaliacoes/pedir`, a mesma do job), o link   │
 * │              assinado e a avaliação guardada (`/store/avaliacoes`);    │
 * │   o e-mail → um por pedido, com um botão por produto;                  │
 * │   a loja   → o botão guarda o link num cookie e abre /avaliar limpa,   │
 * │              o formulário, o "valeu", a página sem o link (número e    │
 * │              e-mail), e a aprovada na página do produto.               │
 * │                                                                         │
 * │ A tela é comparada com o que o Medusa guardou (`GET /admin/avaliacoes`)│
 * │ e os e-mails, lidos do Resend falso.                                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * O PEDIDO É DE VERDADE, no banco local: Pix pago (o Pagar.me falso), postado
 * pelo admin e ENTREGUE HÁ DOIS DIAS por um aviso da Frenet com a hora da
 * transportadora — é a hora que a rodada olha. O backend precisa dos falsos
 * (ver AGENTS.md) e da loja no `LOJA_URL` dele (a aprovada avisa a loja).
 * No fim, as avaliações da rodada são recusadas e apagadas: o site volta
 * como estava.
 */

import { chromium } from "playwright"
import { comAFaixaRespondida } from "./faixa-respondida.mjs"
import { subirFrenetFalsa } from "./frenet-falsa.mjs"
import { subirPagarmeFalso } from "./pagarme-falso.mjs"
import { fabricaDePedidos } from "./pedido-de-teste.mjs"
import { vigiarRecargaDoDev } from "./recarga-do-dev.mjs"
import { subirResendFalso } from "./resend-falso.mjs"

const LOJA = process.argv[2] ?? process.env.LOJA ?? "http://localhost:3000"
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
const CROMO = process.env.CHROMIUM || undefined
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_SENHA = process.env.ADMIN_SENHA
const TOKEN_DA_FRENET = process.env.FRENET_WEBHOOK_TOKEN ?? "token-de-teste"

if (!ADMIN_EMAIL || !ADMIN_SENHA || !CHAVE) {
  console.log("  ⚠  faltam ADMIN_EMAIL, ADMIN_SENHA ou a chave publicável — nada a conferir")
  process.exit(1)
}

let passou = 0
let falhou = 0
const ok = (cond, texto, detalhe = "") => {
  console.log(
    `${cond ? "  ok  " : " FALHA"} ${texto}${cond || !detalhe ? "" : `\n         ${detalhe}`}`
  )
  cond ? passou++ : falhou++
}
const titulo = (t) => console.log(`\n${t}`)
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const RODADA = Date.now().toString(36)
const EMAIL = `avaliar.${RODADA}@teste.fuckingbarba.dev`
/** Um IP inventado por rodada: o limite por pessoa de uma rodada não pesa na seguinte. */
const IP = `10.${(Date.now() >>> 16) % 250}.${(Date.now() >>> 8) % 250}.${Date.now() % 250}`
const OLEO = "oleo-para-barba"
const BALM = "balm-para-barba"

/* ── o Medusa ─────────────────────────────────────────────────────────────── */

async function loja(caminho, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: { "content-type": "application/json", "x-publishable-api-key": CHAVE },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

const entrar = await fetch(`${MEDUSA}/auth/user/emailpass`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_SENHA }),
})
if (!entrar.ok) {
  console.log(`  ⚠  o login do admin falhou (${entrar.status})`)
  process.exit(1)
}
const { token } = await entrar.json()
async function admin(caminho, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

{
  const r = await admin("/admin/avaliacoes?pedido=order_nenhum")
  if (r.status === 404) {
    console.log("  ⚠  o backend não tem a rota /admin/avaliacoes — suba o desta versão")
    process.exit(1)
  }
}

/* ── os falsos ────────────────────────────────────────────────────────────── */

const resend = await subirResendFalso({ porta: Number(process.env.PORTA_RESEND || 4330) }).catch(
  (e) => {
    console.log(`  ⚠  não consegui subir o Resend falso (${e.message}) — outro processo na porta?`)
    process.exit(1)
  }
)
const frenet = await subirFrenetFalsa()
const pagarme = await subirPagarmeFalso({
  webhook: {
    url: `${MEDUSA}/hooks/payment/pagarme_pagarme`,
    segredo: process.env.MEDUSA_WEBHOOK_SEGREDO ?? "segredo-de-teste",
  },
})
const fabrica = fabricaDePedidos({ medusa: MEDUSA, chave: CHAVE, tokenAdmin: token, pagarme })
console.log(`  ⚙  Resend :${resend.porta} · Frenet :${frenet.porta} · Pagar.me :${pagarme.porta}`)

/* ── a Frenet avisando a entrega, com a hora da transportadora ────────────── */

/** "21/09/2026 14:30" — a hora de Brasília, como a Frenet escreve. */
const hora = (minutosAtras) =>
  new Date(Date.now() - minutosAtras * 60_000)
    .toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "")
const evento = (codigo, minutosAtras, descricao) => ({
  EventDateTime: hora(minutosAtras),
  EventDescription: descricao,
  EventLocation: "Blumenau-SC",
  EventType: String(codigo),
})
async function avisoDaFrenet(corpo) {
  const r = await fetch(`${MEDUSA}/hooks/envio/frenet`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-token": TOKEN_DA_FRENET },
    body: JSON.stringify(corpo),
  })
  return r.status
}

/* ── o navegador ──────────────────────────────────────────────────────────── */

const navegador = await chromium.launch(CROMO ? { executablePath: CROMO } : {})
comAFaixaRespondida(navegador, LOJA)
const noConsole = []
const RUIDO_DE_DEV = /_next\/hmr|websocket/i
const abas = []
async function novaAba(viewport = { width: 1280, height: 900 }) {
  const contexto = await navegador.newContext({
    viewport,
    extraHTTPHeaders: { "x-real-ip": IP },
    ...(viewport.width < 600 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  })
  const recarga = vigiarRecargaDoDev(contexto)
  contexto.on(
    "console",
    (m) =>
      m.type() === "error" &&
      !RUIDO_DE_DEV.test(m.text()) &&
      !recarga(m) &&
      noConsole.push(m.text())
  )
  const pagina = await contexto.newPage()
  pagina.setDefaultTimeout(60_000)
  pagina.setDefaultNavigationTimeout(120_000)
  pagina.on("pageerror", (e) => noConsole.push(String(e)))
  abas.push(contexto)
  return { contexto, pagina }
}

/** Espera o React assumir o elemento (o clique antes da hidratação se perde). */
async function hidratado(pagina, seletor) {
  await pagina.waitForFunction(
    (s) =>
      [...document.querySelectorAll(s)].some((el) =>
        Object.keys(el).some((k) => k.startsWith("__reactProps"))
      ),
    seletor,
    { timeout: 60_000 }
  )
}

const texto = async (pagina, seletor) =>
  ((await pagina.locator(seletor).first().textContent()) ?? "").replace(/\s+/g, " ").trim()

/**
 * Abre a página do produto até ela mostrar o que o painel acabou de mudar:
 * a loja refaz a página quando o Medusa avisa, e a primeira visita depois do
 * aviso ainda pode vir com a de antes enquanto a nova se monta.
 */
async function pdpAte(pagina, handle, condicao, tentativas = 8) {
  for (let i = 1; i <= tentativas; i++) {
    await pagina.goto(`${LOJA}/produtos/${handle}`, { waitUntil: "load" })
    await pagina.waitForSelector("section.pdp")
    if (await condicao()) return i
    await esperar(1500)
  }
  return 0
}

/* ── a rodada ─────────────────────────────────────────────────────────────── */

let pedido = null
const criadas = []

try {
  titulo("1. Um pedido pago, com dois produtos, entregue há dois dias")
  pedido = await fabrica.pedidoPix(EMAIL, [
    [OLEO, 1],
    [BALM, 1],
  ])
  await fabrica.pagar(pedido)
  const codigo = `AV${String(Date.now()).slice(-9)}BR`
  await fabrica.enviar(pedido, { codigo, avisar: false })
  const status = await avisoDaFrenet({
    OrderId: String(pedido.numero),
    TrackingNumber: codigo,
    ServiceDescrition: "PAC",
    TrackingEvents: [
      evento(18, 3 * 24 * 60, "Objeto postado"),
      evento(9, 2 * 24 * 60, "Objeto entregue ao destinatário"),
    ],
  })
  ok(status === 200, `a Frenet avisou a entrega do #${pedido.numero}`, `HTTP ${status}`)

  titulo("2. O e-mail, um dia depois da entrega")
  const antes = await loja(`/store/avaliacoes/pedido?p=order_${"0".repeat(26)}.${"a".repeat(22)}`)
  ok(antes.status === 404, "link que a loja não fez não abre pedido", `HTTP ${antes.status}`)
  const rodada1 = (await admin("/admin/avaliacoes/pedir", { metodo: "POST" })).corpo.relatorio
  ok(rodada1?.foraDoHorario === false, "o botão do admin roda fora do horário também")
  let email = null
  for (let i = 0; i < 20 && !email; i++) {
    email = resend.emails.find(
      (e) => e.to?.includes(EMAIL) && /o que você achou\?$/.test(e.subject ?? "")
    )
    if (!email) await esperar(500)
  }
  ok(Boolean(email), "o e-mail chegou pra quem comprou")
  ok(
    email?.subject === `Pedido #${pedido.numero}: o que você achou?`,
    "o assunto diz o pedido",
    email?.subject
  )
  ok(
    email?.tags?.some((t) => t.name === "tipo" && t.value === "pedir-avaliacao"),
    "leva a etiqueta tipo do CRM (pedir-avaliacao)",
    JSON.stringify(email?.tags)
  )
  const links = [...(email?.html ?? "").matchAll(/href="([^"]*\/avaliar\/[^"]*)"/g)].map((m) =>
    m[1].replace(/&amp;/g, "&")
  )
  ok(links.length === 2, "um botão por produto", String(links.length))
  const primeiro = links[0] ? new URL(links[0]) : null
  ok(
    primeiro?.searchParams.get("utm_campaign") === "avaliacao" &&
      /^\/avaliar\/order_[0-9A-Z]{26}\.[A-Za-z0-9_-]{22}$/.test(primeiro.pathname),
    "o botão leva o link assinado do pedido e a campanha",
    links[0]
  )
  ok(
    /instagram\.com\/fuckingbarba/.test(email?.html ?? "") &&
      /tiktok\.com\/@fuckingbarba/.test(email?.html ?? ""),
    "o rodapé tem o Instagram e o TikTok"
  )
  const quantos = resend.emails.filter((e) => e.to?.includes(EMAIL)).length
  await admin("/admin/avaliacoes/pedir", { metodo: "POST" })
  await esperar(800)
  ok(
    resend.emails.filter((e) => e.to?.includes(EMAIL)).length === quantos,
    "a segunda rodada não manda de novo (um e-mail por pedido)"
  )

  titulo("3. A página pelo botão do e-mail")
  const { pagina } = await novaAba()
  const produtoDoBotao = primeiro?.searchParams.get("produto")
  await pagina.goto(links[0], { waitUntil: "load" })
  await pagina.waitForSelector("[data-avaliar]")
  const url = new URL(pagina.url())
  ok(url.pathname === "/avaliar", "o botão guarda o link e abre a /avaliar", url.pathname)
  ok(!/order_/.test(pagina.url()), "o link não fica no endereço", pagina.url())
  ok(url.searchParams.get("utm_campaign") === "avaliacao", "a campanha vai junto (Marketing)")
  const robots = await pagina.locator('meta[name="robots"]').getAttribute("content")
  ok(/noindex/.test(robots ?? ""), "a página fica fora do Google (noindex)", robots)
  ok(
    (await texto(pagina, ".avaliar__pedido")) === `Pedido #${pedido.numero}`,
    "o número do pedido vem do link",
    await texto(pagina, ".avaliar__pedido")
  )
  ok(
    (await pagina.inputValue('input[name="nome"]')) === "Rafael T.",
    "o nome vem sugerido do pedido (primeiro nome e a inicial)",
    await pagina.inputValue('input[name="nome"]')
  )
  const marcado = await pagina.locator('input[name="produto"]:checked').getAttribute("value")
  ok(marcado === produtoDoBotao, "o produto do botão vem marcado", `${marcado} ≠ ${produtoDoBotao}`)
  ok((await pagina.locator('input[name="produto"]').count()) === 2, "os dois produtos do pedido")

  await hidratado(pagina, "[data-avaliar] button[type=submit]")
  await pagina.click("[data-avaliar] button[type=submit]")
  await pagina.waitForSelector(".campo__erro:not(:empty)")
  ok(
    /estrelas/.test(await texto(pagina, ".campo__erro:not(:empty)")),
    "sem as estrelas, o erro aparece embaixo delas",
    await texto(pagina, ".campo__erro:not(:empty)")
  )
  const TEXTO_1 = `Teste ${RODADA}: segurou o dia todo.\n\nRecomendo pra quem tem barba rebelde.`
  await pagina.click(".avaliar__estrela:nth-child(4)")
  await pagina.fill('input[name="nome"]', "Rafael Teste")
  await pagina.fill('textarea[name="texto"]', TEXTO_1)
  await pagina.click("[data-avaliar] button[type=submit]")
  await pagina.waitForSelector("[data-avaliacao-enviada]")
  ok(
    /^Valeu, Rafael!/.test(await texto(pagina, "[data-avaliacao-enviada] h1")),
    "o valeu, com o primeiro nome",
    await texto(pagina, "[data-avaliacao-enviada] h1")
  )
  const outro = pagina.locator("[data-avaliar-outro]")
  ok((await outro.count()) === 1, "e oferece o outro produto do pedido")
  const idDoOutro = await outro.first().getAttribute("data-avaliar-outro")
  await outro.first().click()
  await pagina.waitForSelector("[data-avaliar]")
  await pagina.waitForFunction(
    (id) => document.querySelector(`input[name="produto"][value="${id}"]`)?.checked,
    idDoOutro
  )
  ok(true, "avaliar o outro abre o formulário com ele marcado")
  await pagina.waitForFunction(
    () => document.querySelectorAll(".avaliar__produto[data-avaliado] input[disabled]").length === 1
  )
  ok(true, "o já avaliado fica marcado como tal, e não dá pra escolher de novo")
  await hidratado(pagina, "[data-avaliar] button[type=submit]")
  await pagina.click(".avaliar__estrela:nth-child(2)")
  await pagina.fill('textarea[name="texto"]', `Teste ${RODADA}: não gostei do cheiro.`)
  await pagina.click("[data-avaliar] button[type=submit]")
  await pagina.waitForSelector("[data-avaliacao-enviada]")
  ok(
    (await pagina.locator("[data-avaliar-outro]").count()) === 0 &&
      (await pagina.locator('[data-avaliacao-enviada] a[href="/"]').count()) === 1,
    "com os dois avaliados, o valeu leva de volta pra loja"
  )

  titulo("4. O que o Medusa guardou")
  const guardadas = (await admin(`/admin/avaliacoes?pedido=${pedido.id}`)).corpo.avaliacoes ?? []
  criadas.push(...guardadas.map((a) => a.id))
  ok(guardadas.length === 2, "as duas avaliações, do pedido", String(guardadas.length))
  const doBotao = guardadas.find((a) => a.produto_id === produtoDoBotao)
  ok(
    doBotao?.nota === 4 &&
      doBotao?.nome === "Rafael Teste" &&
      doBotao?.texto === TEXTO_1 &&
      doBotao?.situacao === "nova",
    "a nota, o nome e o texto como a pessoa escreveu, esperando o painel",
    JSON.stringify(doBotao)
  )
  const outroGuardado = guardadas.find((a) => a.produto_id === idDoOutro)
  ok(outroGuardado?.nota === 2, "a nota baixa também entra, igual", JSON.stringify(outroGuardado))
  const p = new URL(links[0]).pathname.split("/").pop()
  const denovo = await loja("/store/avaliacoes", {
    metodo: "POST",
    corpo: { p, produto: produtoDoBotao, nome: "Rafael", nota: 5, texto: "De novo" },
  })
  ok(
    denovo.status === 409 && denovo.corpo.message === "ja_avaliou",
    "o mesmo produto do mesmo pedido não vale duas notas",
    `HTTP ${denovo.status} ${denovo.corpo.message}`
  )
  const adulterado = await loja("/store/avaliacoes", {
    metodo: "POST",
    corpo: {
      p: `${p.slice(0, -1)}${p.endsWith("A") ? "B" : "A"}`,
      produto: produtoDoBotao,
      nome: "Rafael",
      nota: 5,
      texto: "Link mexido",
    },
  })
  ok(
    adulterado.status === 404,
    "link com a assinatura mexida é recusado",
    `HTTP ${adulterado.status}`
  )

  titulo("5. A página sem o link: o número e o e-mail da compra")
  const semLink = (await novaAba({ width: 390, height: 844 })).pagina
  await semLink.goto(`${LOJA}/avaliar`, { waitUntil: "load" })
  await semLink.waitForSelector("[data-encontrar]")
  await hidratado(semLink, "[data-encontrar] button[type=submit]")
  await semLink.fill('input[name="numero"]', `#${pedido.numero}`)
  await semLink.fill('input[name="email"]', "outra.pessoa@teste.fuckingbarba.dev")
  await semLink.click("[data-encontrar] button[type=submit]")
  await semLink.waitForSelector(".avaliar__recado[role=alert]")
  ok(
    /Não achei/.test(await texto(semLink, ".avaliar__recado[role=alert]")),
    "com o e-mail de outra pessoa, não acha (e não diz qual dos dois errou)",
    await texto(semLink, ".avaliar__recado[role=alert]")
  )
  await semLink.fill('input[name="numero"]', `#${pedido.numero}`)
  await semLink.fill('input[name="email"]', EMAIL.toUpperCase())
  await semLink.click("[data-encontrar] button[type=submit]")
  await semLink.waitForSelector("#t-avaliar:has-text('Pedido avaliado')")
  ok(true, "com o número e o e-mail certos, abre o pedido (já avaliado inteiro)")
  ok(!/order_/.test(semLink.url()), "e o link também não vai pro endereço", semLink.url())

  titulo("6. Aprovada no painel, a avaliação vai pro site")
  const handleDoBotao = produtoDoBotao === (await produtoPorHandle(OLEO)) ? OLEO : BALM
  const handleDoOutro = handleDoBotao === OLEO ? BALM : OLEO
  const aprovada = await admin(`/admin/avaliacoes/${doBotao.id}`, {
    metodo: "POST",
    corpo: { acao: "aprovar" },
  })
  ok(aprovada.corpo.situacao === "aprovada", "o admin aprova", JSON.stringify(aprovada.corpo))
  const publicas = (await loja("/store/avaliacoes")).corpo.avaliacoes ?? []
  const publica = publicas.find((a) => a.id === doBotao.id)
  ok(
    publica?.produto === handleDoBotao && !("pedido_id" in (publica ?? {})),
    "a lista do site tem a aprovada, pelo handle, sem nada do pedido",
    JSON.stringify(publica)
  )
  ok(!publicas.some((a) => a.id === outroGuardado?.id), "a que não foi aprovada não sai")
  const { pagina: pdp } = await novaAba()
  const vezes = await pdpAte(pdp, handleDoBotao, async () =>
    (await pdp.locator("#avaliacoes .avaliacao__texto").allTextContents()).some((t) =>
      t.includes(`Teste ${RODADA}`)
    )
  )
  ok(vezes > 0, "a página do produto mostra a aprovada (avaliação antes dos trechos)", `${vezes}`)
  const nome = await pdp
    .locator("#avaliacoes .avaliacao", { hasText: `Teste ${RODADA}` })
    .locator(".avaliacao__nome")
    .textContent()
    .catch(() => "")
  ok(nome === "Rafael Teste", "com o nome que a pessoa escolheu", nome)
  const rotulo = await pdp
    .locator("#avaliacoes .avaliacao", { hasText: `Teste ${RODADA}` })
    .locator(".sr-only")
    .first()
    .textContent()
    .catch(() => "")
  ok(/compra verificada/.test(rotulo ?? ""), "e o selo de compra verificada", rotulo)
  const microdado = await pdp.evaluate(() => ({
    itemref: document.querySelector("section.pdp")?.getAttribute("itemref"),
    contagem: document.querySelector('#avaliacoes-nota meta[itemprop="reviewCount"]')?.content,
  }))
  ok(
    microdado.itemref === "avaliacoes-nota" && Number(microdado.contagem) >= 1,
    "a nota entra no Product (itemref), com a contagem",
    JSON.stringify(microdado)
  )
  await pdpAte(pdp, handleDoOutro, async () => true, 1)
  ok(
    !(
      await pdp
        .locator("#avaliacoes")
        .textContent()
        .catch(() => "")
    ).includes(`Teste ${RODADA}`),
    "a outra, ainda nova, não aparece na página do produto dela"
  )

  titulo("7. Tirar do site e apagar (o pedido de exclusão)")
  const recusada = await admin(`/admin/avaliacoes/${doBotao.id}`, {
    metodo: "POST",
    corpo: { acao: "recusar" },
  })
  ok(recusada.corpo.situacao === "recusada", "recusar tira do site")
  const apagarNova = await admin(`/admin/avaliacoes/${outroGuardado.id}`, {
    metodo: "POST",
    corpo: { acao: "apagar" },
  })
  ok(
    apagarNova.status === 409,
    "apagar de vez só a recusada (dois passos, pra boa não sumir num clique)",
    `HTTP ${apagarNova.status}`
  )
  const sumiu = await pdpAte(
    pdp,
    handleDoBotao,
    async () =>
      !(
        await pdp
          .locator("#avaliacoes")
          .textContent()
          .catch(() => "")
      ).includes(`Teste ${RODADA}`)
  )
  ok(sumiu > 0, "recusada, some da página do produto", `${sumiu}`)
} catch (e) {
  ok(false, "o conferidor quebrou", e instanceof Error ? e.stack : String(e))
} finally {
  // O site volta como estava: as avaliações da rodada saem do banco.
  for (const id of criadas) {
    await admin(`/admin/avaliacoes/${id}`, { metodo: "POST", corpo: { acao: "recusar" } })
    await admin(`/admin/avaliacoes/${id}`, { metodo: "POST", corpo: { acao: "apagar" } })
  }
  titulo("Console")
  ok(noConsole.length === 0, "nenhum erro no console", noConsole.join("\n         "))
  for (const c of abas) await c.close().catch(() => {})
  await navegador.close()
  await resend.fechar()
  await frenet.fechar?.()
  await pagarme.fechar?.()
}

/** O id do produto pelo handle, pela API da loja. */
async function produtoPorHandle(handle) {
  const { corpo } = await loja(`/store/products?handle=${handle}&fields=id`)
  return corpo.products?.[0]?.id
}

console.log(`\n${passou} ok · ${falhou} falha(s)`)
process.exit(falhou ? 1 : 0)
