/**
 * CONFERIDOR DO PRODUTO ESGOTADO E DO AVISE-ME.
 *
 *   node ferramentas/conferir-avise-me.mjs [url-da-loja]
 *
 * Variáveis: LOJA (ou o argumento), MEDUSA_BACKEND_URL,
 *            NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL, ADMIN_SENHA,
 *            PORTA_RESEND (a do `RESEND_URL` do backend, padrão 4330),
 *            REVALIDAR_SEGREDO (o do backend: só pra seção do limite),
 *            ESGOTAR (o handle do produto que ele esgota; padrão, o spray),
 *            CHROMIUM.
 *
 * ┌─ A PERGUNTA QUE ESTE ARQUIVO RESPONDE ─────────────────────────────────┐
 * │ Produto esgotado vira outra página: sem o botão de comprar, o frete,   │
 * │ as unidades e as garantias, e com o "avise-me quando chegar" no lugar  │
 * │ — e o aviso chega. As três partes que só funcionam juntas:             │
 * │                                                                         │
 * │   a loja   → a caixa, o formulário, o selo, o card e a barra fixa;     │
 * │   o Medusa → guarda o pedido (`POST /store/avise-me`) e, na rodada     │
 * │              (`POST /admin/avise-me/rodar`, a mesma do job), avisa a    │
 * │              loja do produto que esgotou ou voltou e manda o e-mail;   │
 * │   o e-mail → um só, com o link certo, e o endereço sai da lista.       │
 * │                                                                         │
 * │ A conferência compara a tela com o que o Medusa responde — o estoque   │
 * │ vem do admin, o preço da API da loja, os pedidos de `GET               │
 * │ /admin/avise-me` e os e-mails do Resend falso.                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ESTOQUE: ele esgota o produto pelo admin (o guardado igual ao reservado) e
 * devolve o número de antes no fim, mesmo se falhar no meio. O backend
 * precisa apontar pro Resend falso (`RESEND_URL=http://127.0.0.1:<PORTA_RESEND>`)
 * e a loja precisa estar no `LOJA_URL` do backend: é por lá que a rodada
 * avisa a loja, e sem isso a página não vira.
 *
 * O LIMITE DO FORMULÁRIO é 10 pedidos por hora por pessoa: a rodada usa um IP
 * inventado (`x-real-ip`, que a loja assina), e o limite de uma rodada não
 * pesa na seguinte.
 */

import { chromium } from "playwright"
import { comAFaixaRespondida } from "./faixa-respondida.mjs"
import { vigiarRecargaDoDev } from "./recarga-do-dev.mjs"
import { subirResendFalso } from "./resend-falso.mjs"

const LOJA = process.argv[2] ?? process.env.LOJA ?? "http://localhost:3000"
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
const CROMO = process.env.CHROMIUM || undefined
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_SENHA = process.env.ADMIN_SENHA
const SEGREDO_LOJA = process.env.REVALIDAR_SEGREDO
const ESGOTAR = process.env.ESGOTAR ?? "spray-modelador-matte-100ml-fucking-barba"

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
let n = 0
const novoEmail = () => `avise.${RODADA}.${++n}@teste.fuckingbarba.dev`
/** Um IP inventado por rodada: o limite por pessoa de uma rodada não pesa na seguinte. */
const IP = `10.${(Date.now() >>> 16) % 250}.${(Date.now() >>> 8) % 250}.${Date.now() % 250}`

/* ── o Medusa ─────────────────────────────────────────────────────────────── */

async function loja(caminho, { metodo = "GET", corpo, cabecalhos = {} } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: { "content-type": "application/json", "x-publishable-api-key": CHAVE, ...cabecalhos },
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

/* O produto: a variante, o item de estoque, o nível e a categoria. */
const { corpo: doAdmin } = await admin(
  `/admin/products?handle=${ESGOTAR}&fields=id,title,handle,status,categories.handle,` +
    "variants.id,variants.manage_inventory,variants.inventory_items.inventory_item_id"
)
const produto = doAdmin.products?.[0]
const variante = produto?.variants?.[0]
const item = variante?.inventory_items?.[0]?.inventory_item_id
if (!produto || produto.status !== "published" || !variante?.manage_inventory || !item) {
  console.log(
    `  ⚠  ${ESGOTAR}: precisa estar publicado, com estoque controlado — escolha outro em ESGOTAR`
  )
  process.exit(1)
}
const nivelDe = async () =>
  (await admin(`/admin/inventory-items/${item}/location-levels`)).corpo.inventory_levels?.[0]
const nivelOriginal = await nivelDe()
if (!nivelOriginal) {
  console.log(`  ⚠  ${ESGOTAR} não tem nível de estoque em nenhum local`)
  process.exit(1)
}

/** O guardado no local do produto, direto. */
async function porGuardado(quantidade) {
  const r = await admin(
    `/admin/inventory-items/${item}/location-levels/${nivelOriginal.location_id}`,
    { metodo: "POST", corpo: { stocked_quantity: quantidade } }
  )
  if (r.status !== 200) throw new Error(`não consegui mudar o estoque: ${r.status}`)
}
/** Deixa `vende` unidades pra vender: o guardado vira o reservado + `vende`. */
async function porEstoque(vende) {
  await porGuardado(Number((await nivelDe()).reserved_quantity ?? 0) + vende)
}
const rodar = async () => (await admin("/admin/avise-me/rodar", { metodo: "POST" })).corpo.relatorio
const pedidosDoProduto = async () =>
  (await admin(`/admin/avise-me?produto=${produto.id}`)).corpo.avisos ?? []

/* ── o Resend falso ───────────────────────────────────────────────────────── */

const resend = await subirResendFalso({ porta: Number(process.env.PORTA_RESEND || 4330) }).catch(
  (e) => {
    console.log(`  ⚠  não consegui subir o Resend falso (${e.message}) — outro processo na porta?`)
    process.exit(1)
  }
)
console.log(`  ⚙  Resend falso :${resend.porta} · ${ESGOTAR} · IP ${IP}`)
const emailsPara = (email) => resend.emails.filter((e) => e.to?.includes(email))

/* ── o navegador ──────────────────────────────────────────────────────────── */

const navegador = await chromium.launch(CROMO ? { executablePath: CROMO } : {})
comAFaixaRespondida(navegador, LOJA)
const noConsole = []
const RUIDO_DE_DEV = /_next\/hmr|websocket/i
const abas = []
async function novaAba(viewport) {
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
  pagina.on("pageerror", (e) => noConsole.push(String(e)))
  abas.push(contexto)
  return pagina
}

/** Espera o React assumir o elemento (o clique antes da hidratação se perde). */
async function hidratado(pagina, seletor) {
  await pagina.waitForFunction(
    (s) =>
      [...document.querySelectorAll(s)].some((el) =>
        Object.keys(el).some((k) => k.startsWith("__reactProps"))
      ),
    seletor,
    { timeout: 20000 }
  )
}

/**
 * Abre a PDP até ela mostrar o que a rodada acabou de mudar. A loja refaz a
 * página quando o Medusa avisa, e a PRIMEIRA visita depois do aviso ainda
 * pode vir com a de antes enquanto a nova se monta — como nos outros
 * conferidores, algumas visitas de folga. Devolve em quantas veio.
 */
async function abrirAte(pagina, esgotada, tentativas = 6) {
  for (let i = 1; i <= tentativas; i++) {
    await pagina.goto(`${LOJA}/produtos/${ESGOTAR}`, { waitUntil: "load" })
    await pagina.waitForSelector(".compra", { timeout: 20000 })
    const temAviso = (await pagina.locator(".avise").count()) > 0
    if (temAviso === esgotada) return i
    await esperar(700)
  }
  return 0
}

const emReais = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)
const semEspaco = (s) => (s ?? "").replace(/\s+/g, " ").trim()

try {
  const { corpo: daLoja } = await loja(
    `/store/products?handle=${ESGOTAR}&fields=*variants.calculated_price` +
      `&region_id=${(await loja("/store/regions")).corpo.regions?.[0]?.id ?? ""}`
  )
  const precoNaApi = daLoja.products?.[0]?.variants?.[0]?.calculated_price?.calculated_amount

  /* ── 1. a página esgotada ──────────────────────────────────────────────── */
  titulo("1. A página do produto esgotado")
  // Um ponto de partida conhecido: a rodada vê o produto vendendo, e depois esgotado.
  await porEstoque(3)
  await rodar()
  await porEstoque(0)
  const r1 = await rodar()
  ok(
    r1?.lojaAvisada?.includes(ESGOTAR),
    "a rodada avisa a loja do produto que esgotou",
    JSON.stringify(r1)
  )

  const celular = await novaAba({ width: 390, height: 844 })
  const visitas = await abrirAte(celular, true)
  ok(visitas === 1, "a página vira esgotada na primeira visita", `em ${visitas} visita(s)`)
  ok(
    (await celular.locator(".compra__comprar, .compra__acao").count()) === 0 &&
      (await celular.locator(".cep").count()) === 0 &&
      (await celular.locator(".compra__kits, .junto, .compra__garantias").count()) === 0,
    "sem botão de comprar, sem frete, sem unidades, leve junto nem garantias"
  )
  ok(
    /esgotado/i.test(await celular.locator(".compra__esgotado").innerText()) &&
      (await celular.locator(".galeria__selo", { hasText: "Esgotado" }).count()) === 1,
    'a faixa "Esgotado" embaixo do preço e o selo na foto'
  )
  const disponibilidade = await celular
    .locator('link[itemprop="availability"]')
    .first()
    .getAttribute("href")
  ok(
    disponibilidade === "https://schema.org/OutOfStock",
    "o Google lê OutOfStock",
    String(disponibilidade)
  )
  const precoNaTela = semEspaco(await celular.locator(".compra__por").first().innerText())
  ok(
    typeof precoNaApi === "number" && precoNaTela === semEspaco(emReais(precoNaApi)),
    "o preço é o da API (uma unidade)",
    `${precoNaTela} × ${precoNaApi}`
  )
  const categoria = produto.categories?.[0]?.handle
  const outros = await celular.locator(".compra__outros a").getAttribute("href")
  ok(
    outros === (["barba", "cabelo", "kits"].includes(categoria) ? `/${categoria}` : "/produtos"),
    'o "enquanto isso" leva pra categoria dele',
    String(outros)
  )

  // A barra fixa: rolando pra baixo ela aparece, com "Avise-me", e leva pro campo.
  await hidratado(celular, ".avise__campo")
  await celular.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6))
  const barra = celular.locator(".barra-compra.e-visivel")
  await barra.waitFor({ timeout: 8000 }).catch(() => {})
  ok(
    (await barra.count()) === 1 && /avise-me/i.test(await barra.locator("button").innerText()),
    'a barra fixa aparece com "Avise-me"'
  )
  await barra.locator("button").click()
  // A rolagem é suave: espera o campo parar à vista, com o cursor nele.
  const noCampo = await celular
    .waitForFunction(
      () => {
        const campo = document.activeElement
        if (!campo?.classList.contains("avise__campo")) return false
        const r = campo.getBoundingClientRect()
        return r.top >= 0 && r.bottom <= window.innerHeight
      },
      null,
      { timeout: 5000 }
    )
    .then(() => true)
    .catch(() => false)
  ok(noCampo, 'o "Avise-me" da barra leva pro campo, à vista e com o cursor nele')

  /* ── 2. o pedido de aviso ──────────────────────────────────────────────── */
  titulo("2. O pedido de aviso")
  // "a@b" passa no campo do navegador e não no servidor: é o erro que a tela escreve.
  await celular.locator(".avise__campo").fill("a@b")
  await celular.locator(".avise__botao").click()
  await celular
    .locator('.avise__nota[data-nota="erro"]')
    .waitFor({ timeout: 10000 })
    .catch(() => {})
  ok(
    /não parece certo/.test(await celular.locator(".avise__nota").innerText()) &&
      (await celular.locator(".avise__campo").inputValue()) === "a@b",
    "e-mail errado: a frase do erro, e o que foi digitado continua no campo"
  )

  const PRIMEIRO = novoEmail()
  await celular.locator(".avise__campo").fill(PRIMEIRO)
  await celular.locator(".avise__botao").click()
  await celular
    .locator('.avise__nota[data-nota="ok"]')
    .waitFor({ timeout: 10000 })
    .catch(() => {})
  ok(
    (await celular.locator(".avise__nota").innerText()).includes(PRIMEIRO) &&
      (await celular.locator(".avise__campo").count()) === 0,
    "pedido guardado: a caixa diz pra onde vai o aviso, e o campo sai"
  )
  const doPrimeiro = (await pedidosDoProduto()).filter((a) => a.email === PRIMEIRO)
  ok(
    doPrimeiro.length === 1 &&
      doPrimeiro[0].variante_id === variante.id &&
      !doPrimeiro[0].avisado_em,
    "o Medusa guardou o e-mail e a variante, esperando",
    JSON.stringify(doPrimeiro)
  )

  // O mesmo e-mail de novo (outra visita): a mesma resposta, e um pedido só.
  const deNovo = await loja("/store/avise-me", {
    metodo: "POST",
    corpo: { email: PRIMEIRO, variante: variante.id },
  })
  ok(
    deNovo.status === 200 &&
      (await pedidosDoProduto()).filter((a) => a.email === PRIMEIRO).length === 1,
    "pedir de novo com o mesmo e-mail responde igual e não duplica",
    String(deNovo.status)
  )
  const SEGUNDO = novoEmail()
  const maiusculo = await loja("/store/avise-me", {
    metodo: "POST",
    corpo: { email: `  ${SEGUNDO.toUpperCase()} `, variante: variante.id },
  })
  ok(
    maiusculo.status === 200 &&
      (await pedidosDoProduto()).some((a) => a.email === SEGUNDO && !a.avisado_em),
    "o e-mail entra em minúsculas e sem espaço",
    String(maiusculo.status)
  )
  const lixo = await loja("/store/avise-me", {
    metodo: "POST",
    corpo: { email: novoEmail(), variante: "variant_NAOEXISTE00000000" },
  })
  ok(
    lixo.status === 400 && lixo.corpo.message === "variante_invalida",
    "variante que não existe é recusada",
    `${lixo.status} ${JSON.stringify(lixo.corpo)}`
  )

  /* ── 3. enquanto esgotado, nada sai ─────────────────────────────────────── */
  titulo("3. Enquanto está esgotado")
  const r3 = await rodar()
  ok(
    r3?.avisados === 0 && !emailsPara(PRIMEIRO).length && !emailsPara(SEGUNDO).length,
    "a rodada não manda nada",
    JSON.stringify(r3)
  )

  /* ── 4. o card e o carrossel ───────────────────────────────────────────── */
  titulo('4. O card e o "Quem leva este, leva junto"')
  const computador = await novaAba({ width: 1440, height: 900 })
  if (categoria && ["barba", "cabelo", "kits"].includes(categoria)) {
    await computador.goto(`${LOJA}/${categoria}`, { waitUntil: "load" })
    const card = computador.locator(".produto", {
      has: computador.locator(`a[href="/produtos/${ESGOTAR}"]`),
    })
    await card
      .first()
      .waitFor({ timeout: 15000 })
      .catch(() => {})
    ok(
      (await card.count()) >= 1 &&
        semEspaco(await card.first().locator(".produto__selo").innerText()) === "Esgotado" &&
        /avise-me/i.test(await card.first().locator(".produto__comprar").innerText()),
      `no card de /${categoria}: o selo "Esgotado" e o botão "Avise-me"`
    )
  }
  // Na página de outro produto, o esgotado vai pro fim do carrossel.
  const { corpo: catalogo } = await loja("/store/products?fields=handle&limit=50")
  const outro = catalogo.products?.map((p) => p.handle).find((h) => h && h !== ESGOTAR)
  if (outro) {
    await computador.goto(`${LOJA}/produtos/${outro}`, { waitUntil: "load" })
    await computador
      .locator(".colecao--relacionados")
      .waitFor({ timeout: 15000 })
      .catch(() => {})
    const ordem = await computador
      .locator(".colecao--relacionados .produto__nome a")
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")))
    const onde = ordem.indexOf(`/produtos/${ESGOTAR}`)
    ok(
      onde === -1 || onde === ordem.length - 1 || ordem.length < 2,
      `no carrossel da página de ${outro}, o esgotado vem por último`,
      ordem.join(" ")
    )
  }

  /* ── 5. voltou ─────────────────────────────────────────────────────────── */
  titulo("5. O produto volta")
  await porEstoque(3)
  const r5 = await rodar()
  ok(
    r5?.avisados >= 2 && r5?.lojaAvisada?.includes(ESGOTAR),
    "a rodada avisa a loja e manda os e-mails",
    JSON.stringify(r5)
  )
  const [email1] = emailsPara(PRIMEIRO)
  const [email2] = emailsPara(SEGUNDO)
  const link = email1?.html?.match(/href="([^"]*\/produtos\/[^"]*)"/)?.[1]?.replace(/&amp;/g, "&")
  ok(
    emailsPara(PRIMEIRO).length === 1 &&
      emailsPara(SEGUNDO).length === 1 &&
      email1.subject === `Voltou: ${produto.title}` &&
      email2.subject === email1.subject,
    "um e-mail pra cada um, com o nome do produto no assunto",
    `${emailsPara(PRIMEIRO).length} ${emailsPara(SEGUNDO).length} "${email1?.subject}"`
  )
  ok(
    Boolean(link) &&
      new URL(link).pathname === `/produtos/${ESGOTAR}` &&
      new URL(link).searchParams.get("utm_campaign") === "avise-me" &&
      new URL(link).searchParams.get("utm_medium") === "email",
    "o botão leva pra página do produto, com a campanha avise-me",
    String(link)
  )
  ok(
    /tiktok\.com\/@fuckingbarba/.test(email1?.html ?? "") &&
      /instagram\.com\/fuckingbarba/.test(email1?.html ?? "") &&
      email1?.text?.includes(produto.title) &&
      email1?.chave?.startsWith("avise-me/"),
    "Instagram e TikTok no rodapé, a versão em texto e a chave de idempotência"
  )
  const depois = await pedidosDoProduto()
  ok(
    !depois.some((a) => a.email === PRIMEIRO || a.email === SEGUNDO) &&
      depois.filter((a) => a.avisado_em && a.email === null).length >= 2,
    "o endereço sai da lista: a linha fica só com a data do aviso"
  )
  const r5b = await rodar()
  ok(
    r5b?.avisados === 0 && emailsPara(PRIMEIRO).length === 1,
    "rodar de novo não manda outra vez",
    JSON.stringify(r5b)
  )
  const voltouEm = await abrirAte(celular, false)
  const botoes = await celular.locator(".compra__comprar").count()
  const disponivelDeNovo = await celular
    .locator('link[itemprop="availability"]')
    .first()
    .getAttribute("href")
  ok(
    voltouEm === 1 && botoes === 1 && disponivelDeNovo === "https://schema.org/InStock",
    "e a página volta a vender na primeira visita",
    `visitas ${voltouEm}, botões ${botoes}, ${disponivelDeNovo}`
  )

  /* ── 6. a página velha ─────────────────────────────────────────────────── */
  titulo("6. A página velha: o produto voltou sem ninguém avisar")
  await porEstoque(0)
  await rodar()
  const velha = await novaAba({ width: 1440, height: 900 })
  ok((await abrirAte(velha, true)) > 0, "a página esgota de novo")
  await hidratado(velha, ".avise__campo")
  await porEstoque(3) // sem rodar: a loja não sabe
  const TERCEIRO = novoEmail()
  await velha.locator(".avise__campo").fill(TERCEIRO)
  await velha.locator(".avise__botao").click()
  const refez = await velha
    .locator(".compra__comprar")
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  ok(
    refez && !(await pedidosDoProduto()).some((a) => a.email === TERCEIRO),
    'o pedido vira "voltou", a página se refaz com o botão de comprar, e nada é guardado'
  )

  /* ── 7. o Resend fora ──────────────────────────────────────────────────── */
  titulo("7. O Resend fora do ar")
  await porEstoque(0)
  await rodar()
  const QUARTO = novoEmail()
  const pedido4 = await loja("/store/avise-me", {
    metodo: "POST",
    corpo: { email: QUARTO, variante: variante.id },
  })
  await porEstoque(3)
  resend.roteiro.cair = true
  const r7 = await rodar()
  const esperando = (await pedidosDoProduto()).find((a) => a.email === QUARTO)
  ok(
    pedido4.status === 200 &&
      r7?.falharam === 1 &&
      esperando?.falhas === 1 &&
      !esperando.avisado_em,
    "o e-mail que não saiu fica esperando, com a falha contada",
    JSON.stringify({ r7, esperando })
  )
  resend.roteiro.cair = false
  const r7b = await rodar()
  ok(
    r7b?.avisados === 1 && emailsPara(QUARTO).length === 1,
    "e sai na rodada seguinte",
    JSON.stringify(r7b)
  )

  /* ── 8. o limite ───────────────────────────────────────────────────────── */
  titulo("8. O limite por pessoa")
  if (!SEGREDO_LOJA) {
    console.log("  ·    sem REVALIDAR_SEGREDO — não dá pra assinar o IP; pulando")
  } else {
    // Um IP só pra isto, assinado como a loja assina: a variante que não
    // existe conta no limite (a leitura custa) e não guarda nada.
    const ipDoLimite = `10.250.${Date.now() % 250}.${(Date.now() >> 8) % 250}`
    const assinado = { "x-cliente-ip": ipDoLimite, "x-loja-segredo": SEGREDO_LOJA }
    const vezes = []
    for (let i = 0; i < 11; i++) {
      const r = await loja("/store/avise-me", {
        metodo: "POST",
        corpo: { email: novoEmail(), variante: "variant_NAOEXISTE00000000" },
        cabecalhos: assinado,
      })
      vezes.push(r.status)
    }
    ok(
      vezes.slice(0, 10).every((s) => s === 400) && vezes[10] === 429,
      "dez pedidos por hora do mesmo IP; o 11º é recusado",
      vezes.join(" ")
    )
  }
} finally {
  await porGuardado(Number(nivelOriginal.stocked_quantity)).catch((e) =>
    console.log(`  ⚠  não consegui devolver o estoque: ${e.message}`)
  )
  resend.roteiro.cair = false
  await rodar().catch(() => {})
  for (const c of abas) await c.close().catch(() => {})
  await navegador.close()
  await resend.fechar()
}

const nivelFinal = await nivelDe()
ok(
  Number(nivelFinal?.stocked_quantity) === Number(nivelOriginal.stocked_quantity),
  "o estoque voltou ao que era",
  `${nivelOriginal.stocked_quantity} → ${nivelFinal?.stocked_quantity}`
)
ok(
  noConsole.length === 0,
  "nenhum erro no console",
  [...new Set(noConsole.map((t) => t.split("\n")[0].slice(0, 160)))].slice(0, 3).join(" | ")
)

console.log(`\n${passou} passou, ${falhou} falhou\n`)
process.exit(falhou ? 1 : 0)
