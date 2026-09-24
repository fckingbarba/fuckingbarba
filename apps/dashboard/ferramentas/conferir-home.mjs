/**
 * CONFERIDOR DO LAYOUT DA HOME — a lista de seções, a gaveta, o rascunho e o
 * "Publicar", pela tela, contra a loja LOCAL: o que se mexe no painel NÃO
 * muda o site até alguém publicar; publicado, muda em segundos.
 *
 *   (Medusa, painel e loja no ar — a loja com o MEDUSA_BACKEND_URL do Medusa
 *   local, a chave publicável e o REVALIDAR_SEGREDO; o Medusa com o
 *   LOJA_URL apontando pra ela, pra avisar)
 *   node apps/dashboard/ferramentas/conferir-home.mjs
 *
 * Variáveis: as de `pecas.mjs`; LOJA (padrão http://localhost:3000),
 * NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL e ADMIN_SENHA (o admin
 * LOCAL: guarda a home do banco no começo e devolve no fim).
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • a operação abrindo ou mexendo na home;                               │
 * │ • o rascunho indo pro site antes do "Publicar" (texto, ordem, chave);  │
 * │ • o "Publicar" que não chega na loja, ou chega pela metade;            │
 * │ • a seção pela metade gravada calada, ou recusada sem dizer o que      │
 * │   falta (o palco com um produto só);                                   │
 * │ • o bloco escuro (o <h1>) saindo do lugar, ou a ordem da loja          │
 * │   diferente da do painel;                                              │
 * │ • a faixa contando errado o que está esperando; o "Desfazer" que não   │
 * │   desfaz; o "Voltar ao texto original" que não volta;                  │
 * │ • a mudança sem linha no histórico; rolagem de lado no celular; erro   │
 * │   no console.                                                          │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import {
  abrirNavegador,
  caixaDoResend,
  DONO,
  entrar as entrarPelaTela,
  esperar,
  exigirAmbiente,
  falhou,
  hidratado,
  medusa,
  MEDUSA,
  menu,
  ok,
  PAINEL,
  resumo,
  RODADA,
  SEGREDO,
  semRolagemDeLado,
  subirResend,
  titulo,
} from "./pecas.mjs"

exigirAmbiente()
const LOJA = (process.env.LOJA ?? "http://localhost:3000").replace(/\/+$/, "")
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
if (!CHAVE || !process.env.ADMIN_EMAIL || !process.env.ADMIN_SENHA) {
  console.log(
    "  ⚠  faltam NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL e ADMIN_SENHA (o admin LOCAL)"
  )
  process.exit(1)
}

const semEspaco = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()

async function esperarQue(condicao, ms = 20000) {
  for (const fim = Date.now() + ms; Date.now() < fim; await esperar(400)) {
    const v = await condicao().catch(() => null)
    if (v) return v
  }
  return await condicao().catch(() => null)
}

/* ── o admin, os falsos e o navegador ─────────────────────────────────────── */

const resend = await subirResend()
const caixa = caixaDoResend(resend)
console.log(`  ⚙  Resend :${resend.porta} · painel ${PAINEL} · loja ${LOJA}`)
const { navegador, novaAba, errosDeConsole } = await abrirNavegador()

const tokenAdmin = (
  await (
    await fetch(`${MEDUSA}/auth/user/emailpass`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_SENHA }),
    })
  ).json()
).token
async function adm(caminho, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${tokenAdmin}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

/** A home como a loja recebe (`/store/home`, com a chave publicável). */
async function homeDaLoja() {
  const r = await fetch(`${MEDUSA}/store/home`, { headers: { "x-publishable-api-key": CHAVE } })
  return (await r.json()).home
}

/** A home da loja, do servidor (sem navegador): o HTML inteiro. */
async function paginaDaLoja(condicao = () => true, ms = 25000) {
  let html = ""
  const achou = await esperarQue(async () => {
    const r = await fetch(`${LOJA}/`, { cache: "no-store" })
    html = r.status === 200 ? await r.text() : ""
    return html && condicao(html) ? html : null
  }, ms)
  return achou ?? html
}

/** A loja derruba o cache da home (o mesmo aviso que o "Publicar" manda). */
async function avisarALoja() {
  await fetch(`${LOJA}/api/revalidar`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-revalidar-segredo": SEGREDO },
    body: JSON.stringify({ tags: ["home", "layout:home"], perfil: "seconds" }),
  }).catch(() => {})
}

/** Aperta e devolve a frase do aviso de baixo — o novo, deste clique. */
async function apertar(pagina, alvo) {
  const aviso = pagina.locator(".aviso")
  const antes = await aviso.getAttribute("data-vez")
  await (typeof alvo === "string" ? pagina.locator(alvo) : alvo).click()
  await pagina.waitForFunction(
    (vez) => {
      const a = document.querySelector(".aviso")
      return a && !a.hasAttribute("data-fora") && a.getAttribute("data-vez") !== vez
    },
    antes,
    { timeout: 30000 }
  )
  return {
    texto: semEspaco(await aviso.textContent()),
    erro: (await aviso.getAttribute("data-erro")) !== null,
  }
}

/* ── a home do banco, guardada no começo e devolvida no fim ───────────────── */

let loja = null
let homeDeAntes
let tokenDoDono = ""

async function guardarAHome() {
  const r = await adm("/admin/stores?fields=id,metadata")
  loja = r.corpo.stores?.[0] ?? null
  if (!loja) throw new Error("nenhuma loja no Medusa local")
  homeDeAntes = loja.metadata?.fb_home
}

async function devolver() {
  if (loja) {
    const agora = (await adm(`/admin/stores/${loja.id}?fields=id,metadata`)).corpo.store
    const metadata = { ...(agora?.metadata ?? {}) }
    if (homeDeAntes === undefined) delete metadata.fb_home
    else metadata.fb_home = homeDeAntes
    await adm(`/admin/stores/${loja.id}`, { metodo: "POST", corpo: { metadata } })
    await avisarALoja()
  }
  if (tokenDoDono) {
    const r = await medusa("/dashboard/equipe", { metodo: "GET", token: tokenDoDono })
    for (const m of r.corpo.membros ?? [])
      if (m.email.includes(RODADA))
        await medusa(`/dashboard/equipe/${m.id}`, {
          token: tokenDoDono,
          corpo: { acao: "remover" },
        })
  }
}

/* ── a rodada ─────────────────────────────────────────────────────────────── */

const VITRINE = `Os favoritos ${RODADA}`
const ORDEM_DO_REGISTRO = [
  "home.banner",
  "home.trustbar",
  "home.ofertas",
  "home.colecao",
  "home.hero",
  "home.alta-performance",
  "home.provas",
  "home.amam",
  "home.vitrine",
  "home.sobre",
  "home.fechamento",
]

try {
  await guardarAHome()

  titulo("Quem entra")
  const dono = await novaAba()
  const cookieDono = await entrarPelaTela(dono, DONO, caixa)
  if (!cookieDono) throw new Error("o dono não entrou (o código não chegou no Resend falso?)")
  const tokenDono = cookieDono.value
  tokenDoDono = tokenDono
  for (const [papel, quem, nome] of [
    ["operacao", `op.${RODADA}@painel.teste`, "Operação Teste"],
    ["marketing", `mkt.${RODADA}@painel.teste`, "Marketing Teste"],
  ]) {
    const r = await medusa("/dashboard/equipe", {
      token: tokenDono,
      corpo: { nome, email: quem, papel },
    })
    ok(r.status === 200, `convite de ${papel}`, JSON.stringify(r.corpo))
  }
  const op = await novaAba()
  const cookieOp = await entrarPelaTela(op, `op.${RODADA}@painel.teste`, caixa)
  const mkt = await novaAba()
  const cookieMkt = await entrarPelaTela(mkt, `mkt.${RODADA}@painel.teste`, caixa)
  ok(Boolean(cookieOp && cookieMkt), "operação e marketing entram")
  const tokenOp = cookieOp.value
  const tokenMkt = cookieMkt.value

  // A rodada começa sem rascunho nenhum (o de antes volta no fim, com a home inteira).
  await medusa("/dashboard/home/desfazer", { token: tokenMkt, corpo: {} })

  /* ── a operação não abre ──────────────────────────────────────────────── */

  titulo("A home é do marketing e do dono")
  {
    const { pagina } = op
    await pagina.goto(`${PAINEL}/home`)
    await pagina.waitForSelector("h1")
    ok(
      semEspaco(await pagina.locator("h1").first().textContent()) ===
        "Essa área não é do seu papel" && !(await menu(pagina)).includes("Layout da home"),
      "a operação vê 'não é do seu papel', e o menu dela não tem a home"
    )
    const ler = await medusa("/dashboard/home", { metodo: "GET", token: tokenOp })
    const mexer = await medusa("/dashboard/home/ordem", {
      token: tokenOp,
      corpo: { secao: "home.vitrine", mudanca: "desligar" },
    })
    const publicar = await medusa("/dashboard/home/publicar", { token: tokenOp, corpo: {} })
    ok(
      ler.status === 403 && mexer.status === 403 && publicar.status === 403,
      "a rota recusa a operação (ler, mexer e publicar)",
      `${ler.status} ${mexer.status} ${publicar.status}`
    )
  }

  /* ── a tela ───────────────────────────────────────────────────────────── */

  const { pagina } = mkt
  const abrirHome = async () => {
    await pagina.goto(`${PAINEL}/home`)
    await pagina.waitForSelector(".secoes .secao")
    await hidratado(pagina, '[data-editar="home.vitrine"]')
  }
  const ordemNaTela = async () =>
    pagina
      .locator(".secoes .secao [data-editar]")
      .evaluateAll((bs) => bs.map((b) => b.getAttribute("data-editar")))
  const faixa = async () => semEspaco(await pagina.locator("[data-faixa-home]").textContent())
  const seloDe = (id) =>
    pagina.locator(".secoes .secao", { has: pagina.locator(`[data-editar="${id}"]`) })

  titulo("A tela")
  const antes = await homeDaLoja()
  let html = await paginaDaLoja((h) => h.includes('id="hero-heading"'))
  {
    await abrirHome()
    ok(
      JSON.stringify(await ordemNaTela()) === JSON.stringify(ORDEM_DO_REGISTRO),
      "as 11 seções, na ordem do registro da loja",
      (await ordemNaTela()).join(", ")
    )
    const hero = seloDe("home.hero")
    ok(
      (await hero.locator(".secao__fixa").count()) === 1 &&
        (await hero.locator('[role="switch"]').count()) === 0 &&
        (await hero.locator("[data-mover]").count()) === 0,
      "o bloco escuro é fixo: sem chave e sem setas"
    )
    ok(
      (await pagina.locator("[data-faixa-home]").getAttribute("data-faixa-home")) === "em-dia" &&
        /Nada vai pro site sem querer/.test(await faixa()),
      "sem nada esperando, a faixa diz que nada vai pro site sem querer"
    )
    ok(
      await pagina.locator("[data-publicar-home]").first().isDisabled(),
      "o 'Publicar' fica apagado sem nada esperando"
    )
    const ver = await pagina.locator("a", { hasText: "Ver a home" }).getAttribute("href")
    ok(ver === LOJA || ver === `${LOJA}/`, "'Ver a home' leva pra loja", String(ver))
    ok(
      html.includes(antes.conteudo.hero.titulo) &&
        html.includes(antes.conteudo.vitrine.titulo) &&
        html.includes('class="trustbar"'),
      "a loja mostra a home que o Medusa manda (o título, a vitrine, a barra)"
    )
  }

  /* ── a gaveta ─────────────────────────────────────────────────────────── */

  titulo("A gaveta vai pro rascunho, e o site não muda")
  {
    await pagina.locator('[data-editar="home.vitrine"]').click()
    const form = pagina.locator('form[data-editor="home.vitrine"]')
    await form.waitFor()
    ok(
      (await form.locator('[data-campo="titulo"]').inputValue()) === antes.conteudo.vitrine.titulo,
      "a gaveta abre com o texto que está no site"
    )
    await form.locator('[data-campo="titulo"]').fill(VITRINE)
    const r = await apertar(pagina, form.locator('button[type="submit"]'))
    ok(!r.erro && /No rascunho/.test(r.texto), "salvo no rascunho", r.texto)
    await pagina.locator("[data-faixa-home=esperando]").waitFor()
    ok(
      /1 mudança esperando/.test(await faixa()) && /Vitrine/.test(await faixa()),
      "a faixa conta 1 mudança, e diz qual",
      await faixa()
    )
    ok(
      (await seloDe("home.vitrine").locator("[data-pendente]").count()) === 1,
      "a seção mexida ganha o selo 'não publicado'"
    )
    await esperar(2500)
    html = await paginaDaLoja()
    const agora = await homeDaLoja()
    ok(
      !html.includes(VITRINE) && agora.conteudo.vitrine.titulo === antes.conteudo.vitrine.titulo,
      "a loja NÃO mudou: o rascunho não sai do painel"
    )
  }

  titulo("Seção pela metade não grava")
  {
    await pagina.locator('[data-editar="home.banner"]').click()
    const form = pagina.locator('form[data-editor="home.banner"]')
    await form.waitFor()
    await form.locator('[data-campo="titulo"]').fill("")
    await form.locator('button[type="submit"]').click()
    await form.locator(".gaveta__erro").waitFor()
    ok(
      /Falta preencher: Título/.test(
        semEspaco(await form.locator(".gaveta__erro").textContent())
      ) && (await form.locator('[data-campo="titulo"]').getAttribute("aria-invalid")) === "true",
      "diz o que falta, e marca o campo"
    )
    await form.locator("button", { hasText: "Cancelar" }).click()
    const um = { ...antes.conteudo.altaPerformance.produtos[0] }
    const palco = await medusa("/dashboard/home/secao", {
      token: tokenMkt,
      corpo: { secao: "home.alta-performance", valores: { produtos: [um] } },
    })
    const repetido = await medusa("/dashboard/home/secao", {
      token: tokenMkt,
      corpo: { secao: "home.alta-performance", valores: { produtos: [um, { ...um }] } },
    })
    ok(
      palco.status === 422 &&
        JSON.stringify(palco.corpo.faltando) === '["produtos"]' &&
        repetido.status === 422 &&
        JSON.stringify(repetido.corpo.faltando) === '["produtos"]',
      "o palco com um produto só é recusado (pede dois diferentes)",
      JSON.stringify([palco.corpo, repetido.corpo])
    )
    const fixa = await medusa("/dashboard/home/ordem", {
      token: tokenMkt,
      corpo: { secao: "home.hero", mudanca: "descer" },
    })
    ok(fixa.status === 409, "o bloco escuro não sai do lugar, nem pela rota", String(fixa.status))
  }

  titulo("A ordem e a chave, no rascunho")
  {
    const r = await apertar(pagina, seloDe("home.colecao").locator('[data-mover="descer"]'))
    ok(!r.erro, "desceu", r.texto)
    const ordem = await ordemNaTela()
    ok(
      ordem.indexOf("home.alta-performance") === 3 &&
        ordem.indexOf("home.hero") === 4 &&
        ordem.indexOf("home.colecao") === 5,
      "descer da quarta passa por cima do bloco escuro, que não sai do lugar",
      ordem.join(", ")
    )
    const chave = seloDe("home.trustbar").locator('[role="switch"]')
    const d = await apertar(pagina, chave)
    ok(
      !d.erro && (await chave.getAttribute("aria-checked")) === "false",
      "desligou a barra",
      d.texto
    )
    await pagina.waitForFunction(() =>
      /3 mudanças esperando/.test(document.querySelector("[data-faixa-home]")?.textContent ?? "")
    )
    ok(
      /Vitrine/.test(await faixa()) &&
        /Barra de vantagens/.test(await faixa()) &&
        /a ordem das seções/.test(await faixa()),
      "a faixa: 3 mudanças (duas seções e a ordem)",
      await faixa()
    )
    await abrirHome()
    ok(
      (await ordemNaTela()).indexOf("home.colecao") === 5 &&
        (await seloDe("home.trustbar").locator('[role="switch"]').getAttribute("aria-checked")) ===
          "false",
      "recarregada, a tela mostra o rascunho gravado"
    )
    html = await paginaDaLoja()
    ok(
      html.includes('class="trustbar"') &&
        html.indexOf('class="colecao"') < html.indexOf('id="hero-heading"'),
      "a loja ainda não mudou (a barra está lá, a coleção antes do título)"
    )
  }

  /* ── publicar ─────────────────────────────────────────────────────────── */

  titulo("Publicar")
  {
    const r = await apertar(pagina, "[data-faixa-home] [data-publicar-home]")
    ok(!r.erro && /Publicada/.test(r.texto), "publicada", r.texto)
    await pagina.locator("[data-faixa-home=em-dia]").waitFor()
    ok(
      /Publicada por último hoje, .*por Marketing Teste/.test(await faixa()),
      "a faixa volta ao normal, com quando e quem publicou",
      await faixa()
    )
    html = await paginaDaLoja((h) => h.includes(VITRINE) && !h.includes('class="trustbar"'))
    ok(html.includes(VITRINE), "na loja: o título novo da vitrine")
    ok(!html.includes('class="trustbar"'), "na loja: a barra desligada saiu")
    const heroEm = html.indexOf('id="hero-heading"')
    ok(
      html.indexOf('class="benefits"') < heroEm && heroEm < html.indexOf('class="colecao"'),
      "na loja: a ordem do painel — o palco antes do título, a coleção depois"
    )
    const publicada = await homeDaLoja()
    ok(
      publicada.conteudo.vitrine.titulo === VITRINE &&
        publicada.layout.visibilidade?.["home.trustbar"] === false,
      "a rota da loja devolve a home publicada"
    )
    ok(html.includes(antes.conteudo.hero.titulo), "o título da página (o <h1>) continua o mesmo")
  }

  /* ── voltar ao original e desfazer ────────────────────────────────────── */

  titulo("Voltar ao texto original, e desfazer")
  {
    await pagina.locator('[data-editar="home.vitrine"]').click()
    const form = pagina.locator('form[data-editor="home.vitrine"]')
    await form.waitFor()
    await form.locator("[data-voltar-ao-original]").click()
    ok(
      (await form.locator('[data-campo="titulo"]').inputValue()) === "Todos os produtos",
      "'Voltar ao texto original' põe o texto de fábrica no formulário"
    )
    const r = await apertar(pagina, form.locator('button[type="submit"]'))
    ok(!r.erro, "salvo", r.texto)
    await pagina.locator("[data-faixa-home=esperando]").waitFor()
    ok(/1 mudança esperando/.test(await faixa()), "1 mudança esperando", await faixa())
    await pagina.locator("[data-pergunta-desfazer]").click()
    ok(
      /Jogar fora a mudança\? O site não muda/.test(
        semEspaco(await pagina.locator(".publicar-pergunta").textContent())
      ),
      "desfazer pergunta antes"
    )
    const d = await apertar(pagina, "[data-desfazer-home]")
    ok(!d.erro && /voltou a mostrar/.test(d.texto), "desfeito", d.texto)
    await pagina.locator("[data-faixa-home=em-dia]").waitFor()
    await pagina.locator('[data-editar="home.vitrine"]').click()
    const de_novo = pagina.locator('form[data-editor="home.vitrine"]')
    await de_novo.waitFor()
    ok(
      (await de_novo.locator('[data-campo="titulo"]').inputValue()) === VITRINE,
      "o painel volta a mostrar o que está no site"
    )
    await de_novo.locator("button", { hasText: "Cancelar" }).click()
    html = await paginaDaLoja()
    ok(html.includes(VITRINE), "e o site não mudou")
  }

  /* ── o histórico e o celular ──────────────────────────────────────────── */

  titulo("O que a equipe mudou")
  {
    await abrirHome()
    const linhas = (
      await pagina.locator("[data-historico] .historico li span").allTextContents()
    ).map(semEspaco)
    const tem = (t) => linhas.some((l) => l.includes(t))
    ok(
      tem("Marketing Teste editou Vitrine") &&
        tem("Marketing Teste desceu Carrossel de coleção") &&
        tem("Marketing Teste desligou Barra de vantagens") &&
        tem("Marketing Teste publicou a home") &&
        tem("Marketing Teste desfez o rascunho"),
      "cada mudança numa linha, com o nome de quem fez",
      linhas.slice(0, 6).join(" | ")
    )
  }

  titulo("No celular")
  {
    const celular = await novaAba({ width: 390, height: 844 })
    await celular.contexto.addCookies([{ ...cookieMkt }])
    await celular.pagina.goto(`${PAINEL}/home`)
    await celular.pagina.waitForSelector(".secoes .secao")
    ok(await semRolagemDeLado(celular.pagina), "a lista, sem rolar de lado")
    await hidratado(celular.pagina, '[data-editar="home.alta-performance"]')
    await celular.pagina.locator('[data-editar="home.alta-performance"]').click()
    await celular.pagina.locator('form[data-editor="home.alta-performance"]').waitFor()
    ok(await semRolagemDeLado(celular.pagina), "a gaveta do palco, sem rolar de lado")
    await celular.contexto.close()
  }

  titulo("Console")
  ok(!errosDeConsole.length, "nenhum erro no console", errosDeConsole.slice(0, 3).join(" | "))
} catch (e) {
  falhou(e instanceof Error ? e.message : String(e))
} finally {
  await devolver().catch(() => {})
  await navegador.close()
  await resend.fechar?.()
}

process.exit(resumo())
