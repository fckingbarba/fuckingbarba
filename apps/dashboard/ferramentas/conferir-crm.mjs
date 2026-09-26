/**
 * CONFERIDOR DO CRM (parte 1) — a loja anota o que cada pessoa faz e liga
 * isso ao e-mail dela: a faixa de cookies, a loja e a rota que repassa, o
 * Medusa que grava, e a tela do CRM no painel.
 *
 *   (o Medusa, a loja e o painel locais no ar)
 *   LOJA=http://localhost:3060 node apps/dashboard/ferramentas/conferir-crm.mjs
 *
 * Variáveis: as de `pecas.mjs`, a NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY e o
 * Medusa mandando os códigos pro Resend falso (`RESEND_URL`). A regra de
 * cada evento tem os testes de unidade do backend
 * (`lib/crm/__tests__/eventos.unit.spec.ts`); aqui é o caminho inteiro, pela
 * tela, e o que o painel mostra.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • anotar sem o "Aceitar" (ou o cookie do visitante nascer sem ele);    │
 * │ • o navegador falando direto com o Medusa, ou lendo o visitante        │
 * │   (o cookie tem que ser `httpOnly`);                                   │
 * │ • a rota aceitando recado sem a assinatura da loja, ou o navegador     │
 * │   conseguindo anotar "assinou a newsletter" sozinho;                   │
 * │ • o e-mail do checkout, da newsletter ou da conta não chegando nas     │
 * │   anotações — inclusive nas de ANTES de a pessoa dizer quem é;         │
 * │ • o "não" depois do sim deixando o que foi anotado no banco;           │
 * │ • a operação vendo o CRM; o e-mail inteiro na tela.                    │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { randomUUID } from "node:crypto"
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
  menu,
  ok,
  PAINEL,
  resumo,
  RODADA,
  semRolagemDeLado,
  subirResend,
  textoDe,
  titulo,
} from "./pecas.mjs"

exigirAmbiente()
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
if (!CHAVE) {
  console.log("  ⚠  falta a NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY (a mesma da loja)")
  process.exit(1)
}
const LOJA = (process.env.LOJA ?? "http://localhost:3000").replace(/\/+$/, "")
const DA_LOJA = { "x-publishable-api-key": CHAVE }
const semEspaco = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()

/**
 * Os e-mails desta rodada: o domínio é da rodada, e é ele que aparece na tela
 * mascarada — com a primeira letra de cada um diferente ("r•••", "n•••", "c•••").
 */
const DOMINIO = `${RODADA}.invalid`
const DO_CHECKOUT = `rafael@${DOMINIO}`
const DA_NEWSLETTER = `news@${DOMINIO}`
const DA_CONTA = `conta@${DOMINIO}`
const CAMPANHA = `crm-${RODADA}`
const mascarado = (email) => `${email[0]}•••@${email.split("@")[1]}`

const resend = await subirResend()
const caixa = caixaDoResend(resend)
const { navegador, novaAba, errosDeConsole } = await abrirNavegador()
console.log(`  ⚙  Resend :${resend.porta} · painel ${PAINEL} · loja ${LOJA}`)

let tokenDoDono = ""
/** A tela do CRM, pela API, como o dono vê. */
const tela = async (periodo = "hoje") =>
  (await medusa(`/dashboard/crm?periodo=${periodo}`, { metodo: "GET", token: tokenDoDono })).corpo
/**
 * Espera a tela do CRM satisfazer `cond` (o recado passa pela loja e pelo
 * `after`). Até 40 s: no `next dev` recém-subido, o envio do CRM (que só baixa
 * depois do sim) compila na primeira vez que alguém aceita.
 */
async function esperarTela(cond, ms = 40000) {
  const fim = Date.now() + ms
  let t = await tela()
  while (!cond(t) && Date.now() < fim) {
    await esperar(500)
    t = await tela()
  }
  return t
}
const linhas = (t) => t?.ultimos ?? []
const vezes = (t, tipo) => t?.tipos?.find((x) => x.tipo === tipo)?.vezes ?? 0
const daCampanha = (t) => linhas(t).find((l) => l.oque.includes(CAMPANHA))

/** Uma visita à loja. Devolve a aba e os pedidos que ela fez (`metodo url`). */
async function naLoja(caminho, { viewport } = {}) {
  const aba = await novaAba(viewport)
  const pedidos = []
  aba.pagina.on("request", (r) => pedidos.push(`${r.method()} ${r.url()}`))
  await aba.pagina.goto(`${LOJA}${caminho}`, { waitUntil: "domcontentloaded" })
  return { ...aba, pedidos }
}
async function responderAFaixa(pagina, botao) {
  const faixa = pagina.locator("[data-faixa-de-cookies]")
  await faixa.waitFor({ timeout: 20000 })
  await hidratado(pagina, "[data-faixa-de-cookies] button")
  await faixa.getByRole("button", { name: botao }).click()
  await faixa.waitFor({ state: "detached", timeout: 10000 })
}
const cookieDe = async (contexto, nome) =>
  (await contexto.cookies(LOJA)).find((c) => c.name === nome) ?? null

try {
  /* ── quem entra no painel ───────────────────────────────────────────────── */

  titulo("Quem entra")
  const dono = await novaAba()
  const cookieDono = await entrarPelaTela(dono, DONO, caixa)
  if (!cookieDono) throw new Error("o dono não entrou (o código não chegou no Resend falso?)")
  tokenDoDono = cookieDono.value
  for (const [papel, quem] of [
    ["operacao", `op.${RODADA}@painel.teste`],
    ["marketing", `mkt.${RODADA}@painel.teste`],
  ]) {
    const r = await medusa("/dashboard/equipe", {
      token: tokenDoDono,
      corpo: {
        nome: papel === "operacao" ? "Operação Teste" : "Marketing Teste",
        email: quem,
        papel,
      },
    })
    ok(r.status === 200, `convite de ${papel}`, JSON.stringify(r.corpo))
  }
  const op = await novaAba()
  const cookieOp = await entrarPelaTela(op, `op.${RODADA}@painel.teste`, caixa)
  const mkt = await novaAba({ width: 375, height: 812 })
  const cookieMkt = await entrarPelaTela(mkt, `mkt.${RODADA}@painel.teste`, caixa)
  ok(Boolean(cookieOp && cookieMkt), "operação e marketing entram")

  /* ── a rota do Medusa ───────────────────────────────────────────────────── */

  titulo("A rota do Medusa (POST /store/crm/eventos)")
  const vis = randomUUID()
  const visita = (extra = {}) => ({
    nome: "visita",
    pagina: "/",
    dados: { utm_source: "google", utm_campaign: `api-${RODADA}` },
    ...extra,
  })
  const semAssinatura = await medusa("/store/crm/eventos", {
    assinado: false,
    extras: DA_LOJA,
    corpo: { visitante: vis, eventos: [visita()] },
  })
  ok(semAssinatura.status === 401, "sem a assinatura da loja: 401", String(semAssinatura.status))
  const ruim = await medusa("/store/crm/eventos", {
    extras: DA_LOJA,
    corpo: { visitante: "eu-mesmo", eventos: [visita()] },
  })
  ok(ruim.status === 400, "visitante que não é o cookie da loja: 400", String(ruim.status))
  const antes = await tela()
  const doNavegador = await medusa("/store/crm/eventos", {
    extras: DA_LOJA,
    corpo: {
      visitante: vis,
      eventos: [
        visita(),
        { nome: "newsletter", pagina: "/" },
        { nome: "purchase", pagina: "/obrigado" },
      ],
    },
  })
  ok(doNavegador.status === 204, "com a assinatura: 204", String(doNavegador.status))
  const depois = await esperarTela((t) => linhas(t).some((l) => l.oque.includes(`api-${RODADA}`)))
  ok(
    linhas(depois).some(
      (l) => l.oque === `chegou na loja · Google (api-${RODADA})` && l.quem === null
    ),
    "a visita entra, anônima, com a origem em frase",
    JSON.stringify(linhas(depois).slice(0, 3))
  )
  ok(
    vezes(depois, "newsletter") === vezes(antes, "newsletter"),
    "“assinou a newsletter” sem a identificação do servidor da loja não entra"
  )
  const esquecida = await medusa("/store/crm/esquecer", {
    extras: DA_LOJA,
    corpo: { visitante: vis },
  })
  ok(esquecida.status === 204, "esquecer: 204")
  const semAVisita = await esperarTela(
    (t) => !linhas(t).some((l) => l.oque.includes(`api-${RODADA}`))
  )
  ok(
    !linhas(semAVisita).some((l) => l.oque.includes(`api-${RODADA}`)),
    "e o que o visitante fez sai do banco"
  )

  /* ── a loja, sem o sim ──────────────────────────────────────────────────── */

  titulo("A loja, com “Só o necessário”")
  {
    const antesDoNao = await tela()
    const { contexto, pagina, pedidos } = await naLoja(
      `/?utm_source=instagram&utm_campaign=nao-${RODADA}`
    )
    const faixa = semEspaco(await pagina.locator("[data-faixa-de-cookies] p").textContent())
    ok(
      faixa.startsWith("Usamos cookies da própria loja"),
      "a faixa diz que a própria loja anota (mesmo sem parceiro ligado)",
      faixa
    )
    await responderAFaixa(pagina, "Só o necessário")
    ok(
      (await cookieDe(contexto, "fb_consentimento"))?.value === "nao.3.",
      "a resposta fica, na versão 3",
      (await cookieDe(contexto, "fb_consentimento"))?.value ?? "sem cookie"
    )
    await pagina.goto(`${LOJA}/produtos/oleo-para-barba`, { waitUntil: "domcontentloaded" })
    await esperar(4000)
    ok(
      !pedidos.some((p) => p.startsWith("POST ") && p.includes("/api/eventos")),
      "nada sai pro CRM",
      pedidos.filter((p) => p.includes("/api/eventos")).join(", ")
    )
    // Quem tenta mandar na mão, sem o sim: nada entra, e nenhum cookie nasce.
    const status = await pagina.evaluate(async () => {
      const r = await fetch("/api/eventos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventos: [{ nome: "visita", pagina: "/", dados: {} }] }),
      })
      return r.status
    })
    ok(status === 204, "o recado na mão responde 204…")
    ok(!(await cookieDe(contexto, "fb_visitante")), "…e o cookie do visitante não nasce")
    const t = await tela()
    ok(vezes(t, "visita") === vezes(antesDoNao, "visita"), "e nenhuma visita foi anotada")
    await contexto.close()
  }

  /* ── a loja, com o sim: do anônimo ao e-mail do checkout ────────────────── */

  titulo("A loja, com “Aceitar”: a visita, o produto, a sacola e o checkout")
  const comSim = await naLoja(`/?utm_source=instagram&utm_medium=bio&utm_campaign=${CAMPANHA}`)
  {
    const { contexto, pagina, pedidos } = comSim
    await responderAFaixa(pagina, "Aceitar")
    ok(
      (await cookieDe(contexto, "fb_consentimento"))?.value === "sim.3.",
      "o sim fica, na versão 3",
      (await cookieDe(contexto, "fb_consentimento"))?.value ?? "sem cookie"
    )
    const chegou = await esperarTela((t) => Boolean(daCampanha(t)))
    ok(
      daCampanha(chegou)?.oque === `chegou na loja · Instagram (${CAMPANHA})` &&
        daCampanha(chegou)?.quem === null,
      "a chegada, com a campanha do link, anônima",
      JSON.stringify(daCampanha(chegou))
    )
    const visitante = await cookieDe(contexto, "fb_visitante")
    ok(
      Boolean(visitante?.httpOnly) && /^[0-9a-f-]{36}$/.test(visitante?.value ?? ""),
      "o visitante é um cookie httpOnly, com um código aleatório",
      JSON.stringify({ httpOnly: visitante?.httpOnly })
    )
    ok(
      !(await pagina.evaluate(() => document.cookie)).includes("fb_visitante"),
      "o JavaScript da página não lê o visitante"
    )

    await pagina.goto(`${LOJA}/produtos/oleo-para-barba`, { waitUntil: "domcontentloaded" })
    const comprar = pagina.locator(".compra__comprar")
    await comprar.scrollIntoViewIfNeeded({ timeout: 20000 })
    await hidratado(pagina, ".compra__comprar")
    const viu = await esperarTela((t) =>
      linhas(t).some((l) => l.tipo === "produto_visto" && l.oque.startsWith("viu "))
    )
    ok(
      linhas(viu).some((l) => l.tipo === "produto_visto" && l.quem === null),
      "o produto visto, anônimo",
      JSON.stringify(linhas(viu).slice(0, 3))
    )
    const sacolaAntes = vezes(viu, "sacola_entrou")
    await comprar.click()
    const naSacola = await esperarTela((t) => vezes(t, "sacola_entrou") > sacolaAntes)
    ok(vezes(naSacola, "sacola_entrou") > sacolaAntes, "pôs na sacola: anotado")
    ok(
      linhas(naSacola).some((l) => l.tipo === "sacola_entrou" && / na sacola$/.test(l.oque)),
      "em frase: “pôs … na sacola”",
      JSON.stringify(linhas(naSacola).slice(0, 2))
    )

    // O checkout: o e-mail do passo 1 liga o navegador a ele — e o que veio antes também.
    const c = (n) => pagina.locator(`.fluxo [name="${n}"]`)
    await pagina.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
    // O checkout chega em pedaços: espera o pedaço escondido do streaming trocar de lugar.
    await pagina
      .waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, {
        timeout: 25000,
      })
      .catch(() => null)
    await pagina.locator("#form-contato").waitFor({ timeout: 25000 })
    await hidratado(pagina, '.fluxo [name="email"]')
    await c("email").fill(DO_CHECKOUT)
    await c("nome").fill("Rafael")
    await c("sobrenome").fill("Teste do CRM")
    await c("telefone").fill("(11) 99999-9999")
    await c("documento").fill("529.982.247-25")
    await pagina.locator("#form-contato button[type=submit]").click()
    await pagina.locator("#form-entrega").waitFor({ timeout: 25000 })
    const quem = mascarado(DO_CHECKOUT)
    const ligado = await esperarTela((t) => daCampanha(t)?.quem === quem)
    ok(
      daCampanha(ligado)?.quem === quem,
      "o e-mail do checkout chega na chegada, anotada antes de a pessoa dizer quem é",
      JSON.stringify(daCampanha(ligado))
    )
    ok(
      linhas(ligado).some((l) => l.tipo === "contato_informado" && l.quem === quem),
      "“deixou o e-mail no checkout”, com o e-mail mascarado",
      JSON.stringify(linhas(ligado).slice(0, 3))
    )
    ok(
      !JSON.stringify(ligado).includes(DO_CHECKOUT),
      "o e-mail inteiro não sai na resposta do painel"
    )
    ok(
      pedidos.some((p) => p.startsWith("POST ") && p.includes("/api/eventos")) &&
        !pedidos.some((p) => p.includes("/store/crm")),
      "o navegador fala com /api/eventos da loja, e nunca com o Medusa"
    )
  }

  /* ── a newsletter e a conta ─────────────────────────────────────────────── */

  titulo("A newsletter e a conta, com o sim")
  {
    const { contexto, pagina } = await naLoja("/")
    await responderAFaixa(pagina, "Aceitar")
    const campo = pagina.locator("#news-email")
    await campo.scrollIntoViewIfNeeded()
    await hidratado(pagina, "#news-email")
    await campo.fill(DA_NEWSLETTER)
    await pagina.locator(".rodape__form button[type=submit]").click()
    await pagina.locator("#news-resposta", { hasText: "Pronto" }).waitFor({ timeout: 15000 })
    const quem = mascarado(DA_NEWSLETTER)
    const assinou = await esperarTela((t) =>
      linhas(t).some((l) => l.tipo === "newsletter" && l.quem === quem)
    )
    ok(
      linhas(assinou).some(
        (l) => l.tipo === "newsletter" && l.quem === quem && l.oque === "assinou a newsletter"
      ),
      "“assinou a newsletter”, com o e-mail dela",
      JSON.stringify(linhas(assinou).slice(0, 2))
    )
    ok(Boolean(await cookieDe(contexto, "fb_visitante")), "com o visitante deste navegador")
    await contexto.close()
  }
  {
    const { contexto, pagina } = await naLoja("/conta")
    await responderAFaixa(pagina, "Aceitar")
    await pagina.waitForURL("**/conta/entrar", { timeout: 15000 })
    const bloco = (s) => pagina.locator(`.entrar ${s}`).filter({ visible: true })
    await hidratado(pagina, ".entrar input[name=email]")
    const antesDoCodigo = resend.emails.length
    await bloco("input[name=email]").fill(DA_CONTA)
    await bloco("form button[type=submit]").click()
    await pagina.waitForURL("**/conta/entrar/codigo", { timeout: 20000 })
    let codigo = ""
    for (let i = 0; i < 60 && !codigo; i++) {
      const email = resend.emails
        .slice(antesDoCodigo)
        .find((e) => e.to?.includes(DA_CONTA) && /^\d{6} é o seu código/.test(e.subject ?? ""))
      codigo = email?.subject?.match(/^(\d{6})/)?.[1] ?? ""
      if (!codigo) await esperar(200)
    }
    ok(Boolean(codigo), "o código da conta chegou no Resend falso")
    await hidratado(pagina, ".entrar input[name=codigo]")
    await bloco("input[name=codigo]").pressSequentially(codigo, { delay: 30 })
    await pagina.waitForURL((u) => !u.pathname.startsWith("/conta/entrar"), { timeout: 20000 })
    const quem = mascarado(DA_CONTA)
    const entrou = await esperarTela((t) =>
      linhas(t).some((l) => l.tipo === "conta_entrou" && l.quem === quem)
    )
    ok(
      linhas(entrou).some((l) => l.tipo === "conta_entrou" && l.oque === "entrou na conta"),
      "“entrou na conta”, com o e-mail da conta",
      JSON.stringify(linhas(entrou).slice(0, 2))
    )
    // O token do cliente: com a sessão, o recado seguinte já é da conta.
    await pagina.goto(`${LOJA}/produtos/oleo-para-barba`, { waitUntil: "domcontentloaded" })
    const logado = await esperarTela((t) =>
      linhas(t).some((l) => l.tipo === "produto_visto" && l.quem === quem)
    )
    ok(
      linhas(logado).some((l) => l.tipo === "produto_visto" && l.quem === quem),
      "logado, o produto visto já é da conta (o token vai junto)"
    )
    await contexto.close()
  }

  /* ── o painel ───────────────────────────────────────────────────────────── */

  titulo("A tela do CRM")
  ok((await menu(dono.pagina)).includes("CRM"), "o menu do dono tem o CRM")
  ok((await menu(mkt.pagina)).includes("CRM"), "o do marketing também")
  ok(!(await menu(op.pagina)).includes("CRM"), "o da operação, não")
  await op.pagina.goto(`${PAINEL}/crm`)
  ok(
    (await textoDe(op.pagina, "h1")) === "Essa área não é do seu papel",
    "a operação, pelo endereço na mão, vê “sem acesso”"
  )
  const daOperacao = await medusa("/dashboard/crm", { metodo: "GET", token: cookieOp.value })
  ok(daOperacao.status === 403, "e a API responde 403 pra ela", String(daOperacao.status))

  await dono.pagina.goto(`${PAINEL}/crm?periodo=hoje`)
  await dono.pagina.locator("[data-crm]").waitFor({ timeout: 20000 })
  const api = await tela("hoje")
  const naTela = async (s) => semEspaco(await dono.pagina.locator(s).first().textContent())
  ok(
    (await naTela('[data-numero="visitantes"]')) === String(api.numeros.visitantes) &&
      (await naTela('[data-numero="identificados"]')) === String(api.numeros.identificados),
    "os números da tela são os da API",
    `${await naTela('[data-numero="visitantes"]')} / ${api.numeros.visitantes}`
  )
  ok(
    api.numeros.pessoas >= 3,
    "3 pessoas pelo menos: checkout, newsletter e conta",
    String(api.numeros.pessoas)
  )
  ok(
    (await dono.pagina.locator(".trilha__item").count()) === 11,
    "o caminho mostra os 11 tipos de anotação"
  )
  ok(
    (await dono.pagina.locator('[data-periodo="hoje"][aria-current="page"]').count()) === 1,
    "o período de hoje aceso"
  )
  const primeira = semEspaco(await dono.pagina.locator(".anotacao").first().textContent())
  ok(
    primeira.includes(api.ultimos[0].oque) && primeira.includes(api.ultimos[0].quando),
    "as últimas, na ordem da API, com a hora",
    primeira
  )
  ok(
    !(await dono.pagina.locator("[data-crm]").textContent()).includes(`@${DOMINIO}`) ||
      (await dono.pagina.locator("[data-crm]").textContent()).includes(`•••@${DOMINIO}`),
    "na tela, o e-mail só mascarado"
  )
  await mkt.pagina.goto(`${PAINEL}/crm`)
  await mkt.pagina.locator("[data-crm]").waitFor({ timeout: 20000 })
  ok(
    (await mkt.pagina.locator('[data-periodo="7d"][aria-current="page"]').count()) === 1,
    "o marketing abre, com 7 dias de padrão"
  )
  ok(await semRolagemDeLado(mkt.pagina), "no celular, sem rolar de lado")

  /* ── mudar de ideia ─────────────────────────────────────────────────────── */

  titulo("Mudar a resposta pra não apaga o que a loja anotou")
  {
    const { contexto, pagina } = comSim
    // Pelas contas, e não pela lista: as 30 últimas já nem mostram a chegada lá do começo.
    const { numeros: antesDoNao } = await tela()
    await pagina.goto(`${LOJA}/privacidade`, { waitUntil: "domcontentloaded" })
    await hidratado(pagina, "[data-mudar-resposta]")
    await pagina.locator("[data-mudar-resposta]").click()
    await responderAFaixa(pagina, "Só o necessário").catch(() => null)
    await pagina.waitForLoadState("domcontentloaded")
    const sumiu = await esperarTela((t) => t.numeros.pessoas === antesDoNao.pessoas - 1)
    ok(
      sumiu.numeros.pessoas === antesDoNao.pessoas - 1 &&
        sumiu.numeros.visitantes === antesDoNao.visitantes - 1,
      "o navegador do checkout e o e-mail dele saem das contas",
      `${JSON.stringify(antesDoNao)} → ${JSON.stringify(sumiu.numeros)}`
    )
    ok(
      !linhas(sumiu).some((l) => l.quem === mascarado(DO_CHECKOUT)),
      "e nenhuma anotação com o e-mail dele sobra"
    )
    ok(!(await cookieDe(contexto, "fb_visitante")), "o cookie do visitante saiu")
    ok(
      (await cookieDe(contexto, "fb_consentimento"))?.value === "nao.3.",
      "e a resposta agora é não",
      (await cookieDe(contexto, "fb_consentimento"))?.value ?? "sem cookie"
    )
    await contexto.close()
  }

  const erros = errosDeConsole.filter((e) => !/favicon|Failed to load resource.*404/.test(e))
  ok(erros.length === 0, "nenhum erro no console", erros.slice(0, 3).join(" | "))
} catch (e) {
  falhou(e?.stack ?? String(e))
} finally {
  await navegador.close()
  await resend.fechar()
}

process.exit(resumo())
