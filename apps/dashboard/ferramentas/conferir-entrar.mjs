/**
 * CONFERIDOR DO PAINEL — entrar, os papéis e a equipe, pela tela, com um
 * Resend de mentira atrás.
 *
 *   RESEND_URL=http://127.0.0.1:4330 RESEND_API_KEY=re_teste_falsa \
 *     DASHBOARD_DONO_EMAIL=dono@painel.teste npm run backend:dev
 *   npm run dev -w @fuckingbarba/dashboard
 *   DASHBOARD_DONO_EMAIL=dono@painel.teste REVALIDAR_SEGREDO=… \
 *     node apps/dashboard/ferramentas/conferir-entrar.mjs
 *
 * Variáveis: PAINEL (padrão http://localhost:3100), MEDUSA_BACKEND_URL
 * (padrão http://127.0.0.1:9000), REVALIDAR_SEGREDO (o mesmo do backend e
 * do painel), DASHBOARD_DONO_EMAIL (o mesmo do backend), PORTA_RESEND (4330),
 * NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY (opcional: sem ela, pula a prova de que
 * o código da loja não abre o painel) e CHROMIUM.
 *
 * Cria membros de teste com e-mails que nunca se repetem
 * (`op.<hora>@painel.teste`…) e tira todos da equipe no fim. O dono do
 * `DASHBOARD_DONO_EMAIL` pede um código por rodada: o limite de 5 por hora
 * por e-mail vale pra ele também.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o painel abrindo sem sessão, ou indexável;                           │
 * │ • `/dashboard/*` respondendo sem a assinatura do painel;               │
 * │ • quem não é da equipe recebendo código — ou a tela contando que não é;│
 * │ • código errado entrando, ou o código da loja abrindo o painel;        │
 * │ • o token ao alcance do JavaScript da página;                          │
 * │ • o convite sem e-mail, ou o convidado sem conseguir entrar;           │
 * │ • um papel vendo a área que não é dele — na tela OU na API;            │
 * │ • papel trocado ou pessoa removida seguindo como antes até o token     │
 * │   vencer (30 dias);                                                    │
 * │ • o dono se removendo ou mudando o próprio papel;                      │
 * │ • o token da equipe abrindo o admin do Medusa;                         │
 * │ • a casca do celular (abas, "Mais") quebrada, ou rolagem de lado;      │
 * │ • erro no console.                                                     │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { chromium } from "playwright"
import { subirResendFalso } from "../../loja/ferramentas/resend-falso.mjs"

const PAINEL = process.env.PAINEL ?? "http://localhost:3100"
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const SEGREDO = process.env.REVALIDAR_SEGREDO ?? ""
const DONO = (process.env.DASHBOARD_DONO_EMAIL ?? "").trim().toLowerCase()
const CHAVE_DA_LOJA = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""

if (!SEGREDO || !DONO) {
  console.log("  ⚠  faltam REVALIDAR_SEGREDO e DASHBOARD_DONO_EMAIL (os mesmos do backend)")
  process.exit(1)
}

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

const RODADA = Date.now().toString(36)
/** Um IP inventado por rodada: o limite por IP de uma rodada não pesa na seguinte. */
const IP = `10.${(Date.now() >> 16) % 250}.${(Date.now() >> 8) % 250}.${Date.now() % 250}`
const OPERACAO = `op.${RODADA}@painel.teste`
const MARKETING = `mkt.${RODADA}@painel.teste`
const DE_FORA = `fora.${RODADA}@painel.teste`

/* ── o Resend falso e a API ──────────────────────────────────────────────── */

const resend = await subirResendFalso().catch((e) => {
  console.log(`  ⚠  não consegui subir o Resend falso (${e.message}) — porta ocupada?`)
  process.exit(1)
})
console.log(`  ⚙  Resend falso :${resend.porta} · painel ${PAINEL} · Medusa ${MEDUSA}`)

async function medusa(
  caminho,
  { metodo = "POST", corpo, token, assinado = true, extras = {} } = {}
) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(assinado ? { "x-loja-segredo": SEGREDO, "x-cliente-ip": IP } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extras,
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

const doPainel = (e) => /^\d{6} é o seu código do painel/.test(e.subject ?? "")
const doConvite = (e) => e.subject === "Seu convite pro painel da FuckingBarba"
const quantos = (email, filtro) =>
  resend.emails.filter((e) => e.to?.includes(email) && filtro(e)).length

async function esperarEmail(email, filtro, antes, ms = 8000) {
  const fim = Date.now() + ms
  while (Date.now() < fim) {
    const deste = resend.emails.filter((e) => e.to?.includes(email) && filtro(e))
    if (deste.length > antes) return deste.at(-1)
    await esperar(150)
  }
  return undefined
}
const codigoDe = (email) => email?.subject?.match(/^(\d{6})/)?.[1]

/* ── o navegador ──────────────────────────────────────────────────────────── */

const navegador = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
)
const errosDeConsole = []
async function novaAba(viewport = { width: 1280, height: 900 }) {
  const contexto = await navegador.newContext({ viewport, extraHTTPHeaders: { "x-real-ip": IP } })
  const pagina = await contexto.newPage()
  pagina.on("pageerror", (e) => errosDeConsole.push(`${pagina.url()}: ${e.message}`))
  pagina.on("console", (m) => {
    if (m.type() === "error") errosDeConsole.push(`${pagina.url()}: ${m.text()}`)
  })
  return { contexto, pagina }
}

/** Espera o React assumir o elemento — digitado antes, o valor some na hidratação. */
async function hidratado(pagina, seletor) {
  await pagina.waitForFunction(
    (s) => {
      const el = document.querySelector(s)
      return Boolean(el && Object.keys(el).some((k) => k.startsWith("__reactProps$")))
    },
    seletor,
    { timeout: 15000 }
  )
}

const caminho = (pagina) => new URL(pagina.url()).pathname
const textoDe = async (pagina, seletor) =>
  (
    (await pagina
      .locator(seletor)
      .first()
      .textContent()
      .catch(() => "")) ?? ""
  ).trim()

/** Pede o código pela tela e espera chegar na tela do código. */
async function pedirCodigo(pagina, email) {
  await pagina.goto(`${PAINEL}/entrar`)
  await hidratado(pagina, "input[name=email]")
  await pagina.fill("input[name=email]", email)
  await pagina.click("button[type=submit]")
  await pagina.waitForURL(/\/entrar\/codigo$/, { timeout: 15000 })
  await hidratado(pagina, "input[name=codigo]")
}

async function digitarCodigo(pagina, codigo) {
  await pagina.fill("input[name=codigo]", "")
  await pagina.locator("input[name=codigo]").pressSequentially(codigo, { delay: 20 })
}

/** Entra pela tela, do e-mail ao Início. Devolve o token do cookie (pra testar a API com ele). */
async function entrar(pagina, contexto, email) {
  const antes = quantos(email, doPainel)
  await pedirCodigo(pagina, email)
  const codigo = codigoDe(await esperarEmail(email, doPainel, antes))
  if (!codigo) return null
  await digitarCodigo(pagina, codigo)
  await pagina.waitForURL((u) => u.pathname === "/", { timeout: 15000 }).catch(() => {})
  const cookie = (await contexto.cookies()).find((c) => c.name === "painel_sessao")
  return cookie ?? null
}

const menu = async (pagina) =>
  (await pagina.locator(".lateral .nav a").allTextContents()).map((t) => t.trim())

async function semRolagemDeLado(pagina) {
  return pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

/* ════════════════════════════════════════════════════════════════════════ */

let tokenDoDono = ""

try {
  titulo("Sem sessão")
  {
    const { contexto, pagina } = await novaAba()
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    ok(caminho(pagina) === "/entrar", "o painel vira o “entrar”", pagina.url())
    const r = await fetch(`${PAINEL}/entrar`)
    ok(/noindex/.test(r.headers.get("x-robots-tag") ?? ""), "X-Robots-Tag: noindex")
    const robots = await (await fetch(`${PAINEL}/robots.txt`)).text()
    ok(/Disallow: \//.test(robots), "robots.txt fecha tudo", robots)
    await contexto.close()
  }

  titulo("A API do painel")
  {
    let r = await medusa("/dashboard/entrar/codigo", { corpo: { email: DONO }, assinado: false })
    ok(
      r.status === 403 && r.corpo.message === "sem_assinatura",
      "sem a assinatura: 403",
      JSON.stringify(r)
    )
    r = await medusa("/dashboard/eu", { metodo: "GET" })
    ok(r.status === 401, "assinado, mas sem token: 401", JSON.stringify(r))
    r = await medusa("/dashboard/qualquer-coisa-nova", { metodo: "GET" })
    ok(r.status === 401, "rota nova já nasce trancada", JSON.stringify(r))
  }

  titulo("De fora da equipe")
  {
    const { contexto, pagina } = await novaAba()
    const antes = resend.emails.length
    await pedirCodigo(pagina, DE_FORA)
    const frase = await textoDe(pagina, ".entrar__txt")
    ok(frase.includes(`Se ${DE_FORA} for da equipe`), "a tela não conta quem é da equipe", frase)
    await esperar(1500)
    ok(resend.emails.length === antes, "nenhum e-mail sai")
    await digitarCodigo(pagina, "123456")
    await pagina.waitForSelector(".campo__erro:not(:empty)", { timeout: 10000 })
    ok(
      (await textoDe(pagina, ".campo__erro")).startsWith("Código errado"),
      "qualquer código: “Código errado”"
    )
    await contexto.close()
  }

  titulo("O dono entra")
  const dono = await novaAba()
  {
    const { contexto, pagina } = dono
    const antes = quantos(DONO, doPainel)
    await pedirCodigo(pagina, DONO)
    const email = await esperarEmail(DONO, doPainel, antes)
    if (!email) {
      console.log(
        `  ⚠  o código do dono não chegou no Resend falso. Suba o Medusa com\n` +
          `     RESEND_URL=http://127.0.0.1:${resend.porta} RESEND_API_KEY=re_teste_falsa DASHBOARD_DONO_EMAIL=${DONO}`
      )
      throw new Error("sem o código do dono")
    }
    ok(
      email.subject.endsWith("é o seu código do painel da FuckingBarba"),
      "o assunto diz que é do painel"
    )
    ok(!/<a[\s>]/.test(email.html ?? ""), "o e-mail do código não tem link")

    await digitarCodigo(pagina, codigoDe(email) === "000000" ? "111111" : "000000")
    await pagina.waitForSelector(".campo__erro:not(:empty)", { timeout: 10000 })
    ok(
      (await textoDe(pagina, ".campo__erro")).startsWith("Código errado"),
      "código errado não entra"
    )

    await hidratado(pagina, "input[name=codigo]")
    await digitarCodigo(pagina, codigoDe(email))
    await pagina.waitForURL((u) => u.pathname === "/", { timeout: 15000 }).catch(() => {})
    ok(caminho(pagina) === "/", "o código certo entra", pagina.url())
    ok((await textoDe(pagina, "h1")).startsWith("Oi, "), "o Início cumprimenta")

    const cookie = (await contexto.cookies()).find((c) => c.name === "painel_sessao")
    ok(Boolean(cookie?.httpOnly), "o token mora num cookie httpOnly")
    tokenDoDono = cookie?.value ?? ""
    ok(
      !(await pagina.evaluate(() => document.cookie.includes("painel_sessao"))),
      "o JavaScript da página não lê o token"
    )
    const itens = await menu(pagina)
    ok(
      ["Início", "Pedidos", "Configurações", "Layout da home", "Observabilidade"].every((i) =>
        itens.includes(i)
      ),
      "o menu do dono tem tudo",
      itens.join(", ")
    )
    await pagina.goto(`${PAINEL}/entrar`)
    ok(caminho(pagina) === "/", "com sessão, o “entrar” vira o Início")

    let r = await medusa("/admin/orders", { metodo: "GET", token: tokenDoDono, assinado: false })
    ok(r.status === 401, "o token da equipe não abre o admin do Medusa", String(r.status))
    r = await medusa("/dashboard/eu", { metodo: "GET", token: tokenDoDono, assinado: false })
    ok(r.status === 403, "o token sem a assinatura não abre o painel", String(r.status))
  }

  if (CHAVE_DA_LOJA) {
    titulo("O código da loja não abre o painel")
    const daConta = (e) => /^\d{6} é o seu código da FuckingBarba$/.test(e.subject ?? "")
    const antes = quantos(DONO, daConta)
    const pedirDaLoja = () =>
      medusa("/store/conta/codigo", {
        corpo: { email: DONO },
        assinado: false,
        extras: { "x-publishable-api-key": CHAVE_DA_LOJA },
      })
    // Rodada logo depois de outra: a loja pede os 30 segundos entre um código e outro.
    const pedido = await pedirDaLoja()
    if (pedido.status === 429 && pedido.corpo.message === "espera") {
      await esperar((Number(pedido.corpo.segundos) + 1) * 1000)
      await pedirDaLoja()
    }
    const daLoja = await esperarEmail(DONO, daConta, antes)
    const r = await medusa("/auth/equipe/codigo-equipe", {
      corpo: { email: DONO, codigo: codigoDe(daLoja) },
      assinado: false,
    })
    ok(
      Boolean(daLoja) && r.status === 401,
      "o código de cliente é recusado no painel",
      String(r.status)
    )
  } else {
    console.log("\n  (sem NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: pulei o código da loja)")
  }

  titulo("O dono convida")
  {
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    await hidratado(pagina, ".bloco__cabeca .btn")
    ok(
      (await pagina.locator(".linha", { hasText: DONO }).locator("text=Mudar").count()) === 0,
      "o dono não tem “Mudar” na própria linha"
    )

    async function convidar({ nome, email, papel }) {
      await pagina.click("text=Convidar pessoa")
      await pagina.waitForSelector(".gaveta #c-nome")
      await pagina.fill("#c-nome", nome)
      await pagina.fill("#c-email", email)
      await pagina.selectOption("#c-papel", papel)
      await pagina.click(".gaveta button[type=submit]")
    }

    await convidar({ nome: "Teste", email: "torto@", papel: "operacao" })
    await pagina.waitForSelector(".gaveta .campo__erro:not(:empty)", { timeout: 10000 })
    ok(
      (await textoDe(pagina, ".gaveta .campo__erro:not(:empty)")) === "Confere o e-mail.",
      "e-mail torto: o erro fica no campo"
    )
    await pagina.click(".gaveta .folha__fechar")

    await convidar({ nome: "Dono de Novo", email: DONO, papel: "marketing" })
    await pagina.waitForSelector(".gaveta .campo__erro:not(:empty)", { timeout: 10000 })
    ok(
      (await textoDe(pagina, ".gaveta .campo__erro:not(:empty)")) ===
        "Esse e-mail já está na equipe.",
      "quem já é da equipe não é convidado de novo"
    )
    await pagina.keyboard.press("Escape")
    ok((await pagina.locator(".gaveta").count()) === 0, "a gaveta fecha no Esc")

    const antes = quantos(OPERACAO, doConvite)
    await convidar({ nome: "Operação Teste", email: OPERACAO, papel: "operacao" })
    await pagina.waitForSelector(".gaveta", { state: "detached", timeout: 10000 })
    await pagina.waitForSelector(`.aviso:not([data-fora])`, { timeout: 10000 })
    ok(
      (await textoDe(pagina, ".aviso")).includes(`Convite mandado pra ${OPERACAO}`),
      "o aviso confirma o convite"
    )
    const convite = await esperarEmail(OPERACAO, doConvite, antes)
    ok(Boolean(convite), "o convite chega por e-mail")
    ok(
      /papel Operação/.test(convite?.text ?? "") && /Pedidos/.test(convite?.text ?? ""),
      "o convite diz o papel e o que ele abre"
    )
    const linha = pagina.locator(".linha", { hasText: OPERACAO })
    ok(
      (await linha.locator(".status", { hasText: "Convite" }).count()) === 1,
      "a lista mostra o convite"
    )

    await convidar({ nome: "Marketing Teste", email: MARKETING, papel: "marketing" })
    await pagina.waitForSelector(".gaveta", { state: "detached", timeout: 10000 })
    await esperarEmail(MARKETING, doConvite, 0)
    const antesDoReenvio = quantos(MARKETING, doConvite)
    const doMkt = pagina.locator(".linha", { hasText: MARKETING })
    await doMkt.locator("button", { hasText: "Mudar" }).click()
    await doMkt.locator("button", { hasText: "Reenviar convite" }).click()
    ok(
      Boolean(await esperarEmail(MARKETING, doConvite, antesDoReenvio)),
      "“Reenviar convite” manda de novo"
    )
  }

  titulo("A operação entra, e só vê o que é dela")
  const op = await novaAba()
  let tokenDaOperacao = ""
  {
    const { contexto, pagina } = op
    const cookie = await entrar(pagina, contexto, OPERACAO)
    ok(caminho(pagina) === "/" && Boolean(cookie), "o convidado entra com o código", pagina.url())
    tokenDaOperacao = cookie?.value ?? ""
    const itens = await menu(pagina)
    ok(
      itens.includes("Pedidos") && itens.includes("Observabilidade"),
      "o menu tem pedidos e observabilidade",
      itens.join(", ")
    )
    ok(
      !itens.includes("Configurações") &&
        !itens.includes("Cupons e descontos") &&
        !itens.includes("Layout da home"),
      "o menu não tem o que não é do papel",
      itens.join(", ")
    )
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    ok(
      (await textoDe(pagina, "h1")) === "Essa área não é do seu papel",
      "o endereço na mão mostra “sem acesso”"
    )
    await pagina.goto(`${PAINEL}/cupons`)
    ok((await textoDe(pagina, "h1")) === "Essa área não é do seu papel", "cupons também")

    let r = await medusa("/dashboard/equipe", { metodo: "GET", token: tokenDaOperacao })
    ok(
      r.status === 403 && r.corpo.message === "sem_acesso",
      "a API da equipe responde 403 pra operação",
      JSON.stringify(r)
    )
    r = await medusa("/dashboard/equipe", {
      token: tokenDaOperacao,
      corpo: { nome: "X Y", email: `x.${RODADA}@painel.teste`, papel: "dono" },
    })
    ok(r.status === 403, "a operação não convida", JSON.stringify(r))
  }

  titulo("O dono muda o papel, e vale no próximo clique")
  {
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    await hidratado(pagina, ".bloco__cabeca .btn")
    const linha = pagina.locator(".linha", { hasText: OPERACAO })
    ok(
      (await linha.textContent())?.includes("último acesso hoje"),
      "a lista mostra o último acesso",
      await linha.textContent()
    )
    await linha.locator("button", { hasText: "Mudar" }).click()
    await linha.locator("label", { hasText: "Marketing" }).locator("input").check()
    await linha.locator("button", { hasText: "Salvar papel" }).click()
    await pagina.waitForSelector(`.aviso:not([data-fora])`, { timeout: 10000 })
    ok(
      (await textoDe(pagina, ".aviso")).includes("agora é Marketing"),
      "o aviso confirma o papel novo"
    )

    const { pagina: pOp } = op
    await pOp.goto(`${PAINEL}/`)
    const itens = await menu(pOp)
    ok(
      itens.includes("Cupons e descontos") && !itens.includes("Pedidos"),
      "o menu da pessoa já é o do marketing",
      itens.join(", ")
    )
    await pOp.goto(`${PAINEL}/pedidos`)
    ok(
      (await textoDe(pOp, "h1")) === "Essa área não é do seu papel",
      "pedidos fechou pra ela na hora"
    )

    const r = await medusa("/dashboard/eu", { metodo: "GET", token: tokenDoDono })
    const eu = r.corpo.membro?.id
    const s = await medusa(`/dashboard/equipe/${eu}`, {
      token: tokenDoDono,
      corpo: { acao: "remover" },
    })
    ok(
      s.status === 409 && s.corpo.message === "a_si_mesmo",
      "o dono não se remove",
      JSON.stringify(s)
    )
    const p = await medusa(`/dashboard/equipe/${eu}`, {
      token: tokenDoDono,
      corpo: { papel: "operacao" },
    })
    ok(
      p.status === 409 && p.corpo.message === "a_si_mesmo",
      "nem muda o próprio papel",
      JSON.stringify(p)
    )
  }

  titulo("O dono tira da equipe, e o acesso cai na hora")
  {
    const { pagina } = dono
    const linha = pagina.locator(".linha", { hasText: OPERACAO })
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    await hidratado(pagina, ".bloco__cabeca .btn")
    await linha.locator("button", { hasText: "Mudar" }).click()
    await linha.locator("button", { hasText: "Tirar da equipe" }).click()
    await linha.locator(".confirma button", { hasText: "Tirar da equipe" }).click()
    await pagina.waitForSelector(`.aviso:not([data-fora])`, { timeout: 10000 })
    ok((await textoDe(pagina, ".aviso")).includes("saiu da equipe"), "o aviso confirma")
    ok(
      (await pagina.locator(".linha", { hasText: OPERACAO }).count()) === 0,
      "a pessoa sai da lista"
    )

    const { pagina: pOp } = op
    await pOp.goto(`${PAINEL}/`)
    await pOp.waitForURL(/\/entrar/, { timeout: 15000 }).catch(() => {})
    ok(caminho(pOp) === "/entrar", "no próximo clique, volta pro “entrar”", pOp.url())
    ok(
      (await textoDe(pOp, ".entrar__recado")).includes("acesso ao painel foi encerrado"),
      "com o recado de que o acesso acabou"
    )
    const r = await medusa("/dashboard/eu", { metodo: "GET", token: tokenDaOperacao })
    ok(
      r.status === 401 && r.corpo.message === "fora_da_equipe",
      "o token de 30 dias não abre mais nada",
      JSON.stringify(r)
    )
    const antes = quantos(OPERACAO, doPainel)
    await pedirCodigo(pOp, OPERACAO)
    await esperar(1500)
    ok(quantos(OPERACAO, doPainel) === antes, "e não recebe mais código")
  }

  titulo("No celular")
  {
    const { contexto, pagina } = await novaAba({ width: 390, height: 844 })
    await contexto.addCookies([
      { name: "painel_sessao", value: tokenDoDono, url: PAINEL, httpOnly: true, sameSite: "Lax" },
    ])
    await pagina.goto(`${PAINEL}/`)
    await hidratado(pagina, ".abas-cel button")
    ok(await pagina.locator(".abas-cel").isVisible(), "as abas de baixo aparecem")
    ok(!(await pagina.locator(".lateral").isVisible()), "o menu lateral some")
    const abas = (await pagina.locator(".abas-cel a, .abas-cel button").allTextContents()).map(
      (t) => t.trim()
    )
    ok(
      abas.join("|") === "Início|Pedidos|Produtos|Clientes|Mais",
      "as abas do dono",
      abas.join("|")
    )
    ok(await semRolagemDeLado(pagina), "sem rolagem de lado no Início")
    await pagina.click(".abas-cel button")
    await pagina.waitForSelector(".folha[role=dialog]")
    ok(
      (await pagina.locator(".folha .nav a", { hasText: "Configurações" }).count()) === 1,
      "o “Mais” tem o menu inteiro"
    )
    await pagina.keyboard.press("Escape")
    ok((await pagina.locator(".folha").count()) === 0, "o “Mais” fecha no Esc")
    await pagina.click(".topo-cel .avatar")
    await pagina.click(".folha .nav a:has-text('Configurações')")
    await pagina.waitForURL(/\/configuracoes\/equipe$/, { timeout: 15000 })
    ok((await pagina.locator(".folha").count()) === 0, "escolher pra onde ir fecha o “Mais”")
    ok(await semRolagemDeLado(pagina), "sem rolagem de lado na equipe")
    await contexto.close()
  }

  titulo("Sair")
  {
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/`)
    await hidratado(pagina, ".lateral .quem__sair")
    await pagina.click(".lateral .quem__sair")
    await pagina.waitForURL(/\/entrar\?saiu=1$/, { timeout: 15000 }).catch(() => {})
    ok(
      (await textoDe(pagina, ".entrar__recado")) === "Você saiu do painel.",
      "sai, com o recado",
      pagina.url()
    )
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    ok(caminho(pagina) === "/entrar", "e o painel fecha")
  }

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.slice(0, 5).join(" | "))
} catch (e) {
  falhas++
  console.log(`\n  ✗ parou no meio: ${e instanceof Error ? e.message : String(e)}`)
} finally {
  // Arruma a casa: quem esta rodada convidou sai da equipe. O token do dono
  // ainda vale no Medusa depois do "Sair" — ele só existia no cookie.
  if (tokenDoDono) {
    const r = await medusa("/dashboard/equipe", { metodo: "GET", token: tokenDoDono })
    for (const m of r.corpo.membros ?? [])
      if (m.email.includes(RODADA))
        await medusa(`/dashboard/equipe/${m.id}`, {
          token: tokenDoDono,
          corpo: { acao: "remover" },
        })
  }
  await navegador.close()
  await resend.fechar()
}

console.log(`\n${testes - falhas}/${testes} conferidos${falhas ? ` — ${falhas} falharam` : ""}`)
process.exit(falhas ? 1 : 0)
