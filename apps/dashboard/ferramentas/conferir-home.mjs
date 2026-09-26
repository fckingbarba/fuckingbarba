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
 * │   falta (o palco com um produto só); a barrinha do palco chegando      │
 * │   cheia, ou o produto trocando debaixo do mouse;                       │
 * │ • o bloco escuro (o <h1>) saindo do lugar, ou a ordem da loja          │
 * │   diferente da do painel;                                              │
 * │ • a faixa contando errado o que está esperando; o "Desfazer" que não   │
 * │   desfaz; o "Voltar ao texto original" que não volta;                  │
 * │ • a foto de fundo, a arte do banner e a foto da última chamada que     │
 * │   não chegam na loja, ou chegam antes do "Publicar"; a do celular      │
 * │   que não chega no celular; o carrossel que baixa a arte do segundo    │
 * │   slide antes de ele aparecer; o slide sem descrição caindo; o banner  │
 * │   com faixa branca ou na altura antiga; a barrinha do carrossel cheia  │
 * │   com o slide parado, ou enchendo com o mouse em cima; as bolinhas     │
 * │   fora do canto de baixo à esquerda da arte (no meio, cobriam o botão  │
 * │   desenhado nela; numa faixa embaixo, abriam um vão até a seção        │
 * │   seguinte);                                                           │
 * │ • a imagem arrastada do computador que não sobe, ou o quadro que não   │
 * │   acende (ou não apaga) com o arquivo em cima;                         │
 * │ • o vídeo da história que não sobe pro painel, não chega na loja (ou   │
 * │   chega antes do "Publicar"), ou o vídeo do admin de antes voltando;   │
 * │ • a prova social sem os casos dos produtos, sem a ressalva, sem o      │
 * │   link pro produto; o caso que sai do produto e fica na home;          │
 * │ • a mudança sem linha no histórico; rolagem de lado no celular; erro   │
 * │   no console.                                                          │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { createRequire } from "node:module"
import {
  abrirNavegador,
  arrastarArquivos,
  caixaDoResend,
  DONO,
  entrar as entrarPelaTela,
  esperar,
  exigirAmbiente,
  falhou,
  gravarVideo,
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

const sharp = createRequire(new URL("../../backend/package.json", import.meta.url))("sharp")

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

/** Uma imagem de teste: listras, pra ter conteúdo. */
async function foto(largura, altura, formato) {
  const listras = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}"><rect width="100%" height="100%" fill="#2a6f5a"/><rect width="50%" height="100%" fill="#ffd84d"/></svg>`
  )
  const s = sharp(listras)
  return (formato === "jpeg" ? s.jpeg({ quality: 90 }) : s.png()).toBuffer()
}

/** Sobe um lado de um quadro de imagem (fundo ou campo de imagens) e espera a prévia. */
async function subir(quadro, lado, buffer, nome) {
  await quadro.locator(`input[data-subir="${lado}"]`).setInputFiles({
    name: nome,
    mimeType: nome.endsWith(".png") ? "image/png" : "image/jpeg",
    buffer,
  })
  await quadro.locator(`.slot--${lado} .slot__previa img`).waitFor({ timeout: 60000 })
}

/** Aperta e devolve a frase do aviso de baixo — o novo, deste clique. */
/** A caixa do slide `n` do banner na loja: a proporção (altura ÷ largura) e como a arte ocupa ela. */
async function caixaDoBanner(pagina, n) {
  return pagina.evaluate((i) => {
    const caixa = document.querySelectorAll(".banner-arte")[i]
    const img = caixa?.querySelector("img")
    const r = caixa?.getBoundingClientRect()
    return {
      razao: r && r.width ? r.height / r.width : 0,
      preenche: img ? getComputedStyle(img).objectFit : null,
      semCelular: Boolean(caixa?.classList.contains("banner-arte--sem-celular")),
    }
  }, n)
}

/**
 * Onde as bolinhas do banner ficam, em px: POR CIMA da arte, no canto de baixo à esquerda (26/09).
 * No meio, cobriam o botão desenhado na arte do celular; numa faixa embaixo dela, abriam um vão
 * entre o banner e a seção de baixo (`vao`: o que o banner tem além da arte).
 */
async function ondeFicamAsBolinhas(pagina) {
  return pagina.evaluate(() => {
    const banner = document.querySelector(".banner-carrossel")?.getBoundingClientRect()
    const arte = document.querySelector(".banner-carrossel__trilho")?.getBoundingClientRect()
    const pontos = document.querySelector(".banner-carrossel__pontos")?.getBoundingClientRect()
    return banner && arte && pontos
      ? {
          vao: Math.round(banner.bottom - arte.bottom),
          daEsquerda: Math.round(pontos.left - arte.left),
          deBaixo: Math.round(arte.bottom - pontos.bottom),
          ateOMeio: Math.round(arte.left + arte.width / 2 - pontos.right),
        }
      : null
  })
}

function bolinhasNoLugar(b) {
  return (
    b !== null &&
    Math.abs(b.vao) <= 1 &&
    b.daEsquerda >= 0 &&
    b.daEsquerda <= 24 &&
    b.deBaixo >= 0 &&
    b.deBaixo <= 24 &&
    b.ateOMeio > 0
  )
}

/**
 * A bolinha da vez num carrossel da home — o banner (`banner-carrossel`) ou o palco da Alta
 * Performance (`benefits`) — e quanto a barrinha dela já encheu (0 a 1).
 */
async function barraDaVez(pagina, carrossel = "banner-carrossel") {
  return pagina.evaluate((c) => {
    const pontos = [...document.querySelectorAll(`.${c}__ponto`)]
    const i = pontos.findIndex((b) => b.getAttribute("aria-current") === "true")
    const t = pontos[i] && getComputedStyle(pontos[i].querySelector(`.${c}__ponto-cheia`)).transform
    return {
      slide: i + 1,
      barra: t && t !== "none" ? Number(t.match(/matrix\(([^,]+)/)?.[1] ?? 0) : 0,
    }
  }, carrossel)
}

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
/** As configurações do admin (o vídeo de antes do painel mora nelas) e a página do óleo: voltam no fim. */
let configuracoesDeAntes = null
let pdpDeAntes = null

async function guardarAHome() {
  const r = await adm("/admin/stores?fields=id,metadata")
  loja = r.corpo.stores?.[0] ?? null
  if (!loja) throw new Error("nenhuma loja no Medusa local")
  homeDeAntes = loja.metadata?.fb_home
}

async function devolver() {
  if (configuracoesDeAntes)
    await adm("/admin/configuracoes", { metodo: "POST", corpo: configuracoesDeAntes })
  if (pdpDeAntes)
    await adm(`/admin/produtos/${pdpDeAntes.id}/pdp`, { metodo: "POST", corpo: pdpDeAntes.pdp })
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
    // O banner de fábrica não tem arte: a gaveta abre com um slide vazio.
    await form.locator('[data-campo="slides.0.titulo"]').fill("Sem a arte")
    await form.locator('button[type="submit"]').click()
    await form.locator(".gaveta__erro").waitFor()
    ok(
      /Falta preencher: Slide 1: Arte\./.test(
        semEspaco(await form.locator(".gaveta__erro").textContent())
      ),
      "slide sem arte: diz que falta a arte (o banner é só imagem)",
      semEspaco(await form.locator(".gaveta__erro").textContent())
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

  /* ── as imagens ───────────────────────────────────────────────────────── */

  titulo("As imagens: o fundo, o carrossel e a última chamada")
  {
    const ARTE = `Semana do Cliente ${RODADA}: todo site por R$ 79`
    await abrirHome()

    await pagina.locator('[data-editar="home.hero"]').click()
    const hero = pagina.locator('form[data-editor="home.hero"]')
    await hero.waitFor()
    const fundo = hero.locator(".fundo-form").last()
    ok(
      semEspaco(await fundo.locator('[data-ideal="computador"]').textContent()) ===
        "2880 × 996 px" &&
        semEspaco(await fundo.locator('[data-ideal="celular"]').textContent()) === "1170 × 1743 px",
      "o fundo do bloco escuro: a medida ideal, a da seção na loja"
    )
    await subir(fundo, "computador", await foto(2880, 996, "png"), "fundo.png")
    await subir(fundo, "celular", await foto(1170, 1743, "jpeg"), "celular.jpg")
    const r1 = await apertar(pagina, hero.locator('button[type="submit"]'))
    ok(!r1.erro && /No rascunho/.test(r1.texto), "o fundo, salvo no rascunho", r1.texto)

    await pagina.locator('[data-editar="home.banner"]').click()
    const banner = pagina.locator('form[data-editor="home.banner"]')
    await banner.waitFor()
    const primeira = banner.locator('[data-imagens="slides.0.imagem"]')
    await primeira.waitFor()
    ok(
      semEspaco(await primeira.locator('[data-ideal="computador"]').textContent()) ===
        "1920 × 630 px" &&
        semEspaco(await primeira.locator('[data-ideal="celular"]').textContent()) ===
          "1080 × 1275 px",
      "a arte do slide: as medidas do banner na loja (mais baixo desde 26/09)"
    )
    /*
      A primeira arte vem ARRASTADA do computador: o quadro acende com o
      arquivo em cima, apaga quando ele sai, e o arquivo solto sobe como o
      escolhido. Com dois arquivos, sobe o primeiro e o quadro avisa.
    */
    const vazio = primeira.locator(".slot--computador .slot__vazio")
    const arte1 = {
      name: "arte-1.png",
      mimeType: "image/png",
      buffer: await foto(1920, 630, "png"),
    }
    const emCima = await arrastarArquivos(vazio, [arte1], { soltar: false })
    const aceso = primeira.locator(".slot--computador[data-arrastando]")
    await aceso.waitFor({ timeout: 5000 }).catch(() => {})
    const noAr = {
      aceso: await aceso.count(),
      texto: semEspaco(await vazio.locator("span").first().textContent()),
    }
    await vazio.dispatchEvent("dragleave", { dataTransfer: emCima })
    await aceso.waitFor({ state: "detached", timeout: 5000 }).catch(() => {})
    const apagou = (await aceso.count()) === 0
    ok(
      noAr.aceso === 1 && noAr.texto === "Solte aqui" && apagou,
      "arrastando uma arte do computador: o quadro acende em cima e apaga quando ela sai",
      JSON.stringify({ ...noAr, apagou })
    )
    await arrastarArquivos(vazio, [
      arte1,
      { name: "sobra.png", mimeType: "image/png", buffer: await foto(800, 800, "png") },
    ])
    await primeira.locator(".slot--computador .slot__previa img").waitFor({ timeout: 60000 })
    const subiu = semEspaco(
      await primeira.locator(".slot--computador .slot__info").first().textContent()
    )
    ok(
      /^1920 × 630 px/.test(subiu) && (await primeira.locator("[data-um-por-vez]").count()) === 1,
      "solta, a arte sobe como a escolhida; com dois arquivos, sobe o primeiro e o quadro avisa",
      subiu
    )
    await banner.locator('[data-campo="slides.0.titulo"]').fill(`Primeira arte ${RODADA}`)
    await banner.locator('[data-mais="slides"]').click()
    const arte = banner.locator('[data-imagens="slides.1.imagem"]')
    await arte.waitFor()
    await subir(arte, "computador", await foto(1920, 630, "jpeg"), "arte-2.jpg")
    await subir(arte, "celular", await foto(1080, 1275, "jpeg"), "arte-2-celular.jpg")
    // A descrição é opcional (26/09): o slide 2 vai sem ela, e a loja o descreve pelo link.
    await banner.locator('[data-campo="tempo"]').selectOption("5")
    const r2 = await apertar(pagina, banner.locator('button[type="submit"]'))
    ok(
      !r2.erro,
      "o carrossel, salvo no rascunho — o slide 2 sem a descrição, que é opcional",
      r2.texto
    )
    await pagina.waitForFunction(() =>
      /2 slides/.test(
        document.querySelector('.secao:has([data-editar="home.banner"])')?.textContent ?? ""
      )
    )
    ok(
      /com imagem/.test(semEspaco(await seloDe("home.banner").textContent())) &&
        /com imagem/.test(semEspaco(await seloDe("home.hero").textContent())),
      "a lista diz: 2 slides, com imagem"
    )

    await pagina.locator('[data-editar="home.fechamento"]').click()
    const fech = pagina.locator('form[data-editor="home.fechamento"]')
    await fech.waitFor()
    const foto3 = fech.locator('[data-imagens="imagem"]')
    ok(
      semEspaco(await foto3.locator('[data-ideal="computador"]').textContent()) === "2880 × 984 px",
      "a foto da última chamada: a medida da faixa na loja"
    )
    await subir(foto3, "computador", await foto(2880, 984, "png"), "faixa.png")
    const r3 = await apertar(pagina, fech.locator('button[type="submit"]'))
    ok(!r3.erro, "a foto da última chamada, salva no rascunho", r3.texto)

    await esperar(2500)
    html = await paginaDaLoja()
    ok(
      !html.includes("fundo--imagem") &&
        !html.includes("banner-carrossel") &&
        !html.includes('<picture class="fechamento__foto"'),
      "a loja ainda não mudou: as imagens estão no rascunho"
    )

    const p = await apertar(pagina, "[data-faixa-home] [data-publicar-home]")
    ok(!p.erro && /Publicada/.test(p.texto), "publicada", p.texto)
    html = await paginaDaLoja(
      (h) =>
        h.includes("banner-carrossel") &&
        h.includes("fundo--imagem") &&
        h.includes('<picture class="fechamento__foto"')
    )
    ok(
      /<div class="fundo fundo--imagem"[^>]*>\s*<picture class="fundo__imagem">\s*<source media="\(max-width: 767px\)" srcSet="[^"]*home-fundo-celular[^"]*"[^>]*>\s*<img[^>]*home-fundo-computador[\s\S]*?<\/picture>\s*<section class="hero/i.test(
        html
      ),
      "na loja: o bloco escuro com a foto de fundo, e a do celular abaixo de 768 px"
    )
    const slides = html.split('class="banner-carrossel__slide"').slice(1)
    ok(
      slides.length === 2 &&
        /class="banner-arte/.test(slides[0]) &&
        /<img[^>]*fetchpriority="high"/i.test(slides[0]) &&
        slides[0].includes(`alt="Primeira arte ${RODADA}"`) &&
        /class="banner-arte"/.test(slides[1]) &&
        !/<img/.test(slides[1].split("banner-carrossel__seta")[0]) &&
        !/banner__preco|Comprar agora/.test(html),
      "na loja: o carrossel só de arte — a do primeiro slide na frente da fila, a do segundo ainda sem baixar"
    )
    ok(
      html.includes('<picture class="fechamento__foto"'),
      "na loja: a foto própria da última chamada"
    )

    const vitrine = await novaAba({ width: 1280, height: 900 })
    await vitrine.pagina.goto(`${LOJA}/`)
    await hidratado(vitrine.pagina, ".banner-carrossel__ponto")
    await vitrine.pagina.locator(".banner-carrossel__ponto").nth(1).click()
    const segundo = vitrine.pagina.locator(".banner-carrossel__slide").nth(1)
    await segundo.locator(".banner-arte img").waitFor({ timeout: 20000 })
    await vitrine.pagina.waitForFunction(
      () =>
        (document.querySelectorAll(".banner-carrossel__slide")[1]?.querySelector("img")
          ?.naturalWidth ?? 0) > 0,
      null,
      { timeout: 20000 }
    )
    // A rolagem é suave: a bolinha marca quando o slide encaixa, meio segundo depois.
    await vitrine.pagina
      .waitForFunction(
        () =>
          document.querySelectorAll(".banner-carrossel__ponto")[1]?.getAttribute("aria-current") ===
          "true",
        null,
        { timeout: 5000 }
      )
      .catch(() => {})
    const doCarrossel = {
      atual: await vitrine.pagina
        .locator(".banner-carrossel__ponto")
        .nth(1)
        .getAttribute("aria-current"),
      alt: await segundo.locator(".banner-arte img").getAttribute("alt"),
      celular: await segundo.locator('source[media="(max-width: 767px)"]').count(),
      link: await segundo.locator("a").getAttribute("href"),
    }
    ok(
      doCarrossel.atual === "true" &&
        // Sem a descrição e sem produto: o slide se descreve pelo link (a vitrine).
        doCarrossel.alt === "Ver todos os produtos" &&
        doCarrossel.celular === 1 &&
        doCarrossel.link === "/produtos",
      "no navegador: a bolinha leva pro slide, a arte baixa aí, com a do celular, o link pra vitrine e, sem descrição, o texto do link",
      JSON.stringify(doCarrossel)
    )
    // O fundo fica DENTRO da seção: sem o CSS dos fundos na home, a foto vazava pra página inteira.
    const caixas = await vitrine.pagina.evaluate(() => {
      const f = document.querySelector(".fundo--imagem:has(> .hero)")
      const foto = f?.querySelector(".fundo__imagem img")?.getBoundingClientRect()
      const secao = f?.querySelector(".hero")?.getBoundingClientRect()
      return foto && secao
        ? { foto: [foto.top, foto.height], secao: [secao.top, secao.height] }
        : null
    })
    ok(
      caixas !== null &&
        Math.abs(caixas.foto[0] - caixas.secao[0]) < 2 &&
        Math.abs(caixas.foto[1] - caixas.secao[1]) < 2,
      "no navegador: a foto de fundo fica dentro do bloco escuro, do tamanho dele",
      JSON.stringify(caixas)
    )
    // O banner: a altura nova (1920 × 630) e a arte PREENCHENDO a caixa — sem faixa branca.
    const bannerNoComputador = await caixaDoBanner(vitrine.pagina, 0)
    ok(
      Math.abs(bannerNoComputador.razao - 630 / 1920) < 0.005 &&
        bannerNoComputador.preenche === "cover",
      "no computador: o banner na altura nova, com a arte preenchendo (sem faixa branca)",
      JSON.stringify(bannerNoComputador)
    )
    const bolinhasNoComputador = await ondeFicamAsBolinhas(vitrine.pagina)
    ok(
      bolinhasNoLugar(bolinhasNoComputador),
      "no computador: as bolinhas por cima da arte, no canto de baixo à esquerda, e nenhum vão embaixo do banner",
      JSON.stringify(bolinhasNoComputador)
    )
    await vitrine.contexto.close()

    // No celular: o slide com a arte do celular na caixa nova (1080 × 1275), preenchendo; o sem
    // ela mostra a do computador inteira (no carrossel, esticada, cortaria o texto dos lados).
    const cel = await novaAba({ width: 390, height: 844 })
    await cel.pagina.goto(`${LOJA}/`)
    await hidratado(cel.pagina, ".banner-carrossel__ponto")
    // A arte do segundo slide só baixa quando ele vai aparecer: a bolinha leva até ele.
    await cel.pagina.locator(".banner-carrossel__ponto").nth(1).click()
    await cel.pagina
      .locator(".banner-carrossel__slide")
      .nth(1)
      .locator(".banner-arte img")
      .waitFor({ timeout: 20000 })
    const comArteDoCelular = await caixaDoBanner(cel.pagina, 1)
    const semArteDoCelular = await caixaDoBanner(cel.pagina, 0)
    ok(
      Math.abs(comArteDoCelular.razao - 1275 / 1080) < 0.01 &&
        comArteDoCelular.preenche === "cover" &&
        semArteDoCelular.semCelular &&
        semArteDoCelular.preenche === "contain" &&
        (await semRolagemDeLado(cel.pagina)),
      "no celular: a arte do celular preenche a caixa nova; sem ela, a do computador aparece inteira",
      JSON.stringify({ comArteDoCelular, semArteDoCelular })
    )
    const bolinhasNoCelular = await ondeFicamAsBolinhas(cel.pagina)
    ok(
      bolinhasNoLugar(bolinhasNoCelular),
      "no celular: as bolinhas por cima da arte, no canto de baixo à esquerda, e nenhum vão entre o banner e a seção de baixo",
      JSON.stringify(bolinhasNoCelular)
    )
    await cel.contexto.close()

    // A barrinha é o relógio da troca: o mouse em cima segura a barra (e o slide); saindo, ela
    // continua, e o slide passa quando ela enche — não segundos depois.
    const relogio = await novaAba({ width: 1280, height: 900 })
    await relogio.pagina.goto(`${LOJA}/`)
    await hidratado(relogio.pagina, ".banner-carrossel__ponto")
    await relogio.pagina.mouse.move(2, 2)
    await relogio.pagina.waitForFunction(
      () => {
        const el = document.querySelector(
          '.banner-carrossel__ponto[aria-current="true"] .banner-carrossel__ponto-cheia'
        )
        const t = el && getComputedStyle(el).transform
        return Boolean(t && t !== "none" && Number(t.match(/matrix\(([^,]+)/)?.[1] ?? 0) > 0.05)
      },
      null,
      { timeout: 10000 }
    )
    const doBanner = await relogio.pagina.locator(".banner-carrossel").boundingBox()
    await relogio.pagina.mouse.move(
      doBanner.x + doBanner.width / 2,
      doBanner.y + doBanner.height / 3
    )
    await esperar(300)
    const segura = await barraDaVez(relogio.pagina)
    await esperar(2500)
    const seguraDepois = await barraDaVez(relogio.pagina)
    ok(
      segura.slide === seguraDepois.slide && Math.abs(segura.barra - seguraDepois.barra) < 0.01,
      "na loja: o mouse em cima do banner segura a barrinha e o slide",
      JSON.stringify({ segura, seguraDepois })
    )
    await relogio.pagina.mouse.move(2, 2)
    const troca = await relogio.pagina.evaluate(
      () =>
        new Promise((pronto) => {
          const trilho = document.querySelector(".banner-carrossel__trilho")
          const inicio = trilho.scrollLeft
          let encheuEm = null
          const passo = (agora) => {
            const el = document.querySelector(
              '.banner-carrossel__ponto[aria-current="true"] .banner-carrossel__ponto-cheia'
            )
            const t = el && getComputedStyle(el).transform
            const barra = t && t !== "none" ? Number(t.match(/matrix\(([^,]+)/)?.[1] ?? 0) : 0
            if (encheuEm === null && barra >= 0.999) encheuEm = agora
            if (trilho.scrollLeft !== inicio) return pronto({ encheuEm, andouEm: agora })
            requestAnimationFrame(passo)
          }
          requestAnimationFrame(passo)
          setTimeout(() => pronto({ encheuEm, andouEm: null }), 10000)
        })
    )
    ok(
      troca.encheuEm !== null && troca.andouEm !== null && troca.andouEm - troca.encheuEm < 250,
      "na loja: o slide passa quando a barrinha enche",
      JSON.stringify({
        atraso: troca.andouEm && troca.encheuEm && Math.round(troca.andouEm - troca.encheuEm),
      })
    )
    await relogio.contexto.close()

    // O palco da Alta Performance no mesmo relógio. Ele fica lá embaixo: a barrinha começa quando
    // a pessoa chega nele (antes, era do CSS e já chegava cheia), o produto troca quando ela
    // enche, e o mouse em cima segura. Aba nova, sem mexer o mouse até a hora — e BAIXA, pro palco
    // começar fora da tela: nesta home de teste (o banner e as ofertas em cima dele), numa aba de
    // 900 px ele já aparece 22% ao abrir, e aí a barrinha começa na hora, como deve.
    const abaDoPalco = await novaAba({ width: 1280, height: 600 })
    await abaDoPalco.pagina.goto(`${LOJA}/`)
    await hidratado(abaDoPalco.pagina, ".benefits__ponto")
    const palcoForaDaTela = await abaDoPalco.pagina.evaluate(
      () => document.querySelector(".benefits").getBoundingClientRect().top > innerHeight
    )
    await esperar(3000)
    await abaDoPalco.pagina
      .locator(".benefits")
      .evaluate((el) => el.scrollIntoView({ block: "center" }))
    await esperar(400)
    const chegando = await barraDaVez(abaDoPalco.pagina, "benefits")
    const trocaNoPalco = await abaDoPalco.pagina.evaluate(
      () =>
        new Promise((pronto) => {
          const vez = () =>
            [...document.querySelectorAll(".benefits__ponto")].findIndex(
              (b) => b.getAttribute("aria-current") === "true"
            )
          const antes = vez()
          let encheuEm = null
          const passo = (agora) => {
            const el = document.querySelectorAll(".benefits__ponto-cheia")[antes]
            const t = el && getComputedStyle(el).transform
            const barra = t && t !== "none" ? Number(t.match(/matrix\(([^,]+)/)?.[1] ?? 0) : 0
            if (encheuEm === null && barra >= 0.999) encheuEm = agora
            if (vez() !== antes) return pronto({ encheuEm, trocouEm: agora })
            requestAnimationFrame(passo)
          }
          requestAnimationFrame(passo)
          setTimeout(() => pronto({ encheuEm, trocouEm: null }), 12000)
        })
    )
    ok(
      palcoForaDaTela &&
        chegando.barra < 0.2 &&
        trocaNoPalco.encheuEm !== null &&
        trocaNoPalco.trocouEm !== null &&
        trocaNoPalco.trocouEm - trocaNoPalco.encheuEm < 250,
      "na loja: o palco começa a barrinha quando a pessoa chega nele, e troca quando ela enche",
      JSON.stringify({
        palcoForaDaTela,
        chegando,
        atraso:
          trocaNoPalco.trocouEm &&
          trocaNoPalco.encheuEm &&
          Math.round(trocaNoPalco.trocouEm - trocaNoPalco.encheuEm),
      })
    )
    const doPalco = await abaDoPalco.pagina.locator(".benefits").boundingBox()
    await abaDoPalco.pagina.mouse.move(
      doPalco.x + doPalco.width / 2,
      doPalco.y + doPalco.height / 2
    )
    await esperar(300)
    const noPalco = await barraDaVez(abaDoPalco.pagina, "benefits")
    await esperar(2500)
    const noPalcoDepois = await barraDaVez(abaDoPalco.pagina, "benefits")
    ok(
      noPalco.slide === noPalcoDepois.slide && Math.abs(noPalco.barra - noPalcoDepois.barra) < 0.01,
      "na loja: o mouse em cima do palco segura a barrinha e o produto",
      JSON.stringify({ noPalco, noPalcoDepois })
    )
    await abaDoPalco.contexto.close()
  }

  /* ── o vídeo da história ─────────────────────────────────────────────── */

  titulo("O vídeo da história da marca")
  {
    /*
      O vídeo que o admin subia antes do painel fica nas configurações. A
      home de agora diz sempre se tem vídeo (nem que seja `null`): o do admin
      não volta pro site por baixo — nem antes do vídeo novo, nem depois de
      ele sair.
    */
    configuracoesDeAntes = (await adm("/admin/configuracoes")).corpo.configuracoes
    const LEGADO = `legado-${RODADA}.mp4`
    const legado = await adm("/admin/configuracoes", {
      metodo: "POST",
      corpo: {
        ...configuracoesDeAntes,
        home: { video: { url: `${MEDUSA}/static/${LEGADO}`, largura: 720, altura: 1280 } },
      },
    })
    ok(legado.status === 200, "um vídeo antigo nas configurações do admin", String(legado.status))

    await abrirHome()
    await pagina.locator('[data-editar="home.sobre"]').click()
    const sobre = pagina.locator('form[data-editor="home.sobre"]')
    await sobre.waitFor()
    const campo = sobre.locator('.slot--uso[data-video="historia"]')
    ok(
      semEspaco(await campo.locator(".slot__medida").textContent()) ===
        "Ideal: 1080 × 1920 px em pé, ou 1920 × 1080 px deitado, até 30 segundos",
      "o campo do vídeo no Sobre a marca: em pé ou deitado"
    )
    await sobre.locator('input[data-campo="video"]').setInputFiles({
      name: "historia.webm",
      mimeType: "video/webm",
      buffer: await gravarVideo(pagina, 360, 640),
    })
    await campo.locator(".slot__previa video").waitFor({ timeout: 90000 })
    ok(
      !/Não é deitado/.test(await campo.textContent()),
      "em pé não ganha aviso: a seção se ajeita ao vídeo"
    )
    const salvo = await apertar(pagina, sobre.locator('button[type="submit"]'))
    ok(!salvo.erro && /No rascunho/.test(salvo.texto), "o vídeo, salvo no rascunho", salvo.texto)
    const noRascunho = (
      await medusa("/dashboard/home", { metodo: "GET", token: tokenMkt })
    ).corpo.secoes?.find((x) => x.id === "home.sobre")?.valores?.video
    ok(
      /\/static\/.+home-video.*\.webm$/.test(noRascunho?.url ?? "") &&
        /\/static\/.+home-poster.*\.webp$/.test(noRascunho?.poster ?? "") &&
        noRascunho?.largura === 360 &&
        noRascunho?.altura === 640,
      "no rascunho: o vídeo no armazenamento, com a capa e as medidas",
      JSON.stringify(noRascunho)
    )
    const comVideo = await pagina
      .waitForFunction(() =>
        /com vídeo/.test(
          document.querySelector('.secao:has([data-editar="home.sobre"])')?.textContent ?? ""
        )
      )
      .then(() => true)
      .catch(() => false)
    ok(comVideo, "a lista diz: com vídeo")
    let html = await paginaDaLoja()
    ok(
      !html.includes("home-video") && !html.includes(LEGADO),
      "o site ainda não mudou — e o vídeo do admin não aparece: a home diz que não tem vídeo"
    )
    const p = await apertar(pagina, "[data-faixa-home] [data-publicar-home]")
    ok(!p.erro && /Publicada/.test(p.texto), "publicada", p.texto)
    html = await paginaDaLoja((h) => h.includes("sobre__midia--video"))
    ok(
      html.includes(`src="${noRascunho?.url}"`) &&
        html.includes(`poster="${noRascunho?.poster}"`) &&
        html.includes("sobre__midia--em-pe"),
      "na loja: o vídeo no lugar da foto, em pé, com a capa dele"
    )

    await pagina.locator('[data-editar="home.sobre"]').click()
    await sobre.waitFor()
    await campo.locator("button", { hasText: "Tirar" }).click()
    const tirou = await apertar(pagina, sobre.locator('button[type="submit"]'))
    const p2 = await apertar(pagina, "[data-faixa-home] [data-publicar-home]")
    html = await paginaDaLoja((h) => !h.includes("sobre__midia--video"))
    ok(
      !tirou.erro &&
        !p2.erro &&
        !html.includes("sobre__midia--video") &&
        html.includes("sobre__midia") &&
        !html.includes(LEGADO),
      "sem o vídeo, a seção volta pra foto — e não cai no do admin"
    )
  }

  /* ── a prova social ──────────────────────────────────────────────────── */

  titulo("A prova social: os casos dos produtos")
  {
    // Um caso de antes e depois no óleo, pelo admin local (como o conferir-produtos monta uma página).
    const { corpo: busca } = await adm(
      "/admin/products?handle=oleo-para-barba&fields=id,handle,thumbnail"
    )
    const oleo = busca.products?.[0]
    const pdp = (await adm(`/admin/produtos/${oleo.id}/pdp`)).corpo.pdp
    pdpDeAntes = { id: oleo.id, pdp }
    const CASO = `Caso ${RODADA}`
    const gravou = await adm(`/admin/produtos/${oleo.id}/pdp`, {
      metodo: "POST",
      corpo: {
        ...pdp,
        conteudo: {
          ...pdp.conteudo,
          antesDepois: {
            casos: [
              {
                nome: CASO,
                tempo: "60 dias",
                antes: oleo.thumbnail,
                depois: oleo.thumbnail,
                texto: "A barba fechou.",
                autorizou: true,
              },
            ],
          },
        },
      },
    })
    ok(
      gravou.corpo.pdp?.conteudo?.antesDepois?.casos?.length === 1,
      "um caso no óleo, com a autorização",
      JSON.stringify(gravou.corpo).slice(0, 200)
    )

    const html = await paginaDaLoja((h) => h.includes(CASO))
    const secao = html.split('<section class="provas"')[1]?.split("</section>")[0] ?? ""
    ok(
      secao.includes(`${CASO}, antes`) &&
        secao.includes(`${CASO}, depois de 60 dias de uso`) &&
        secao.includes("60 dias de uso") &&
        secao.includes("A barba fechou.") &&
        secao.includes(`href="/produtos/${oleo.handle}"`) &&
        secao.includes("O resultado varia de pessoa pra pessoa"),
      "na loja: a prova social com o caso do óleo, o link pra ele e a ressalva"
    )

    const provas = (await medusa("/dashboard/home", { metodo: "GET", token: tokenMkt })).corpo
      .provas
    const total = (provas ?? []).reduce((n, x) => n + x.casos.length, 0)
    ok(
      (provas ?? []).some((x) => x.id === oleo.id && x.casos.some((c) => c.nome === CASO)),
      "a rota do painel diz de onde vêm os casos",
      JSON.stringify(provas).slice(0, 200)
    )
    await abrirHome()
    ok(
      semEspaco(await seloDe("home.provas").textContent()).includes(
        total === 1 ? "1 caso" : `${total} casos`
      ),
      "a lista diz quantos casos a prova social tem"
    )
    await pagina.locator('[data-editar="home.provas"]').click()
    const lista = pagina.locator("[data-casos-da-home]")
    await lista.waitFor()
    ok(
      semEspaco(await lista.textContent()).includes(CASO) &&
        (await lista.locator(`a[href="/produtos/${oleo.id}"]`).count()) === 1,
      "a gaveta mostra o caso, com o link pra página do produto"
    )
    await pagina.locator("button", { hasText: "Cancelar" }).click()

    await adm(`/admin/produtos/${oleo.id}/pdp`, { metodo: "POST", corpo: pdp })
    pdpDeAntes = null
    const semCaso = await paginaDaLoja((h) => !h.includes(CASO))
    ok(!semCaso.includes(CASO), "o caso sai do produto, e sai da home junto")
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
        tem("Marketing Teste desfez o rascunho") &&
        linhas.some(
          (l) =>
            l.includes("Marketing Teste editou Bloco escuro de marca") &&
            l.includes("com imagem de fundo")
        ),
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
