/**
 * CONFERIDOR DE CLIENTES E DA NEWSLETTER DO PAINEL — pela tela, contra a API.
 *
 *   (Medusa apontando pros falsos, como no conferir-pedidos; painel no ar)
 *   node apps/dashboard/ferramentas/conferir-clientes.mjs
 *
 * Variáveis: as de `pecas.mjs`, e mais NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY (os
 * pedidos e a newsletter nascem pela API da loja), ADMIN_EMAIL e ADMIN_SENHA
 * (o admin LOCAL: pagar os pedidos e marcar a caixa de ofertas de um
 * cliente), MEDUSA_WEBHOOK_SEGREDO, PORTA_FALSA e PORTA_PAGARME_FALSO.
 *
 * Monta quatro pessoas com e-mails que nunca se repetem: a Ana (dois
 * pedidos, um pago, com CPF; não aceita ofertas), o Bruno (um pedido pago e
 * a newsletter do rodapé), o Caio (um Pix esperando e a caixa de ofertas da
 * conta, por e-mail e WhatsApp) e o Leo (só a newsletter, sem pedido). Os
 * pedidos ficam no banco local; os membros da rodada saem da equipe e os
 * e-mails da rodada saem da newsletter no fim.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o gasto contando pedido não pago; a lista na ordem errada;           │
 * │ • o CPF inteiro chegando pra operação (na tela OU na resposta);        │
 * │ • o marketing vendo quem não aceitou ofertas, a cidade, o celular, o   │
 * │   CPF, o endereço ou os pedidos — ou abrindo a ficha pelo endereço;    │
 * │ • a operação abrindo a newsletter;                                     │
 * │ • a newsletter e a caixa da conta como listas separadas (o e-mail      │
 * │   repetido, o cliente sem o link pra ficha);                           │
 * │ • o "Tirar" que não tira dos dois lugares, ou que leva o WhatsApp      │
 * │   junto; o CSV sem a lista;                                            │
 * │ • rolagem de lado no celular; erro no console.                         │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { readFileSync } from "node:fs"
import { fabricaDePedidos } from "../../loja/ferramentas/pedido-de-teste.mjs"
import { subirFrenetFalsa } from "../../loja/ferramentas/frenet-falsa.mjs"
import { subirPagarmeFalso } from "../../loja/ferramentas/pagarme-falso.mjs"
import {
  abrirNavegador,
  caixaDoResend,
  DONO,
  entrar as entrarPelaTela,
  exigirAmbiente,
  falhou,
  hidratado,
  IP,
  medusa,
  MEDUSA,
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
const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const reais = (v) => semEspaco(REAIS.format(v))

const CPF = "11144477735"
const CPF_PONTUADO = "111.444.777-35"
const email = (quem) => `clientes.${RODADA}.${quem}@teste.fuckingbarba.dev`
const ANA = email("ana")
const BRUNO = email("bruno")
const CAIO = email("caio")
const LEO = email("leo")

/* ── os falsos, o admin e as pessoas ──────────────────────────────────────── */

const resend = await subirResend()
const frenet = await subirFrenetFalsa()
const pagarme = await subirPagarmeFalso({
  webhook: {
    url: `${MEDUSA}/hooks/payment/pagarme_pagarme`,
    segredo: process.env.MEDUSA_WEBHOOK_SEGREDO ?? "",
  },
})
console.log(
  `  ⚙  Resend :${resend.porta} · Frenet :${frenet.porta ?? "?"} · Pagar.me :${pagarme.porta} · painel ${PAINEL} · Medusa ${MEDUSA}`
)
const caixa = caixaDoResend(resend)
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
const fabrica = fabricaDePedidos({ medusa: MEDUSA, chave: CHAVE, tokenAdmin, pagarme })

/** Inscreve na newsletter pela API da loja, assinada como a loja faz (limite por quem pede). */
async function inscrever(quem) {
  const r = await fetch(`${MEDUSA}/store/newsletter`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": CHAVE,
      "x-loja-segredo": SEGREDO,
      "x-cliente-ip": IP,
    },
    body: JSON.stringify({ email: quem, origem: "rodape" }),
  })
  return r.status
}

const clienteDoEmail = async (quem) =>
  (await adm(`/admin/customers?email=${encodeURIComponent(quem)}&fields=id,email,metadata`)).corpo
    .customers?.[0] ?? null

let tokenDoDono = ""

try {
  titulo("As pessoas da rodada")
  const { products } = await (
    await fetch(`${MEDUSA}/store/products?fields=handle`, {
      headers: { "x-publishable-api-key": CHAVE },
    })
  ).json()
  const [a, b] = products.map((p) => p.handle)
  const anaPaga = await fabrica.pedidoPix(ANA, [[a, 1]], { documento: CPF })
  await fabrica.pagar(anaPaga)
  const anaPix = await fabrica.pedidoPix(ANA, [[b, 1]], { documento: CPF })
  const brunoPago = await fabrica.pedidoPix(BRUNO, [[a, 2]])
  await fabrica.pagar(brunoPago)
  const caioPix = await fabrica.pedidoPix(CAIO, [[b, 1]])
  ok(
    [anaPaga, anaPix, brunoPago, caioPix].every((p) => p.id),
    "quatro pedidos feitos pela API da loja"
  )
  const inscricoes = [await inscrever(BRUNO), await inscrever(LEO)]
  ok(
    inscricoes.every((s) => s === 200),
    "o Bruno e o Leo na newsletter do rodapé",
    inscricoes.join(" ")
  )
  const caio = await clienteDoEmail(CAIO)
  const agora = new Date().toISOString()
  const marcou = await adm(`/admin/customers/${caio?.id}`, {
    metodo: "POST",
    corpo: { metadata: { ofertas: { email: agora, whatsapp: agora } } },
  })
  ok(marcou.status === 200, "o Caio com a caixa de ofertas da conta (e-mail e WhatsApp)")
  const pedidoDaAna = await adm(`/admin/orders/${anaPaga.id}?fields=total`)
  const gastoDaAna = Number(pedidoDaAna.corpo.order?.total ?? 0)

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
  const mkt = await novaAba()
  const cookieMkt = await entrarPelaTela(mkt, `mkt.${RODADA}@painel.teste`, caixa)
  ok(Boolean(cookieOp && cookieMkt), "operação e marketing entram")
  const tokenOp = cookieOp.value
  const tokenMkt = cookieMkt.value

  /* ── a lista, pela API ─────────────────────────────────────────────────── */

  titulo("A lista (API)")
  const lista = async (token) =>
    (await medusa(`/dashboard/clientes?busca=${RODADA}`, { metodo: "GET", token })).corpo
  const doDono = await lista(tokenDoDono)
  const linha = (l, quem) => l.clientes?.find((c) => c.email === quem)
  const ana = linha(doDono, ANA)
  ok(
    doDono.clientes?.map((c) => c.email).join(",") === [CAIO, BRUNO, ANA].join(","),
    "a lista do dono: os três clientes, do que comprou por último pro mais antigo",
    JSON.stringify(doDono.clientes?.map((c) => c.email))
  )
  ok(
    ana?.pedidos === 2 &&
      Math.abs(ana.gastou - gastoDaAna) < 0.01 &&
      ana.cidade === "Blumenau/SC" &&
      ana.ofertas === null,
    "a Ana: dois pedidos, o gasto só do pago, a cidade, e não aceita ofertas",
    JSON.stringify(ana)
  )
  ok(
    linha(doDono, BRUNO)?.ofertas === "e-mail · desde hoje" &&
      linha(doDono, CAIO)?.ofertas === "e-mail e WhatsApp · desde hoje" &&
      linha(doDono, CAIO)?.gastou === 0,
    "as ofertas: a newsletter do Bruno e a caixa da conta do Caio; o Pix esperando não conta no gasto",
    JSON.stringify([linha(doDono, BRUNO), linha(doDono, CAIO)])
  )
  const doMkt = await lista(tokenMkt)
  ok(
    doMkt.clientes?.map((c) => c.email).join(",") === [CAIO, BRUNO].join(",") &&
      doMkt.clientes.every((c) => c.cidade === null),
    "o marketing: só quem aceitou ofertas, e sem a cidade",
    JSON.stringify(doMkt.clientes)
  )

  /* ── a ficha, pela API ─────────────────────────────────────────────────── */

  titulo("A ficha (API)")
  const ficha = (token, id) => medusa(`/dashboard/clientes/${id}`, { metodo: "GET", token })
  const fDono = await ficha(tokenDoDono, ana.id)
  const fOp = await ficha(tokenOp, ana.id)
  const fMktAna = await ficha(tokenMkt, ana.id)
  ok(
    fDono.corpo.cliente?.dados?.documento?.inteiro === CPF_PONTUADO &&
      fDono.corpo.cliente?.pedidos?.length === 2,
    "o dono: o CPF inteiro e os dois pedidos",
    JSON.stringify(fDono.corpo.cliente?.dados)
  )
  const semCpf = JSON.stringify(fOp.corpo)
  ok(
    fOp.corpo.cliente?.dados?.documento?.mascarado === "•••.444.777-••" &&
      !semCpf.includes(CPF) &&
      !semCpf.includes(CPF_PONTUADO),
    "a operação: o CPF mascarado — o inteiro nem vem na resposta"
  )
  ok(
    fMktAna.status === 404,
    "o marketing não abre a ficha de quem não aceitou ofertas",
    String(fMktAna.status)
  )
  const bruno = linha(doDono, BRUNO)
  const fMktBruno = await ficha(tokenMkt, bruno.id)
  const doMktTexto = JSON.stringify(fMktBruno.corpo)
  ok(
    fMktBruno.status === 200 &&
      fMktBruno.corpo.cliente?.dados === null &&
      fMktBruno.corpo.cliente?.pedidos === null &&
      fMktBruno.corpo.cliente?.resumo?.pedidos === 1 &&
      !doMktTexto.includes("988887777") &&
      !doMktTexto.includes("Blumenau"),
    "o marketing: a ficha de quem aceitou, sem celular, endereço e pedidos — só o resumo",
    doMktTexto.slice(0, 300)
  )
  ok(
    JSON.stringify(fMktBruno.corpo.cliente?.ofertas) ===
      JSON.stringify([{ canal: "E-mail", onde: "no rodapé", desde: "hoje" }]),
    "a ficha diz onde e desde quando ele aceitou",
    JSON.stringify(fMktBruno.corpo.cliente?.ofertas)
  )

  /* ── a newsletter, pela API ────────────────────────────────────────────── */

  titulo("A newsletter (API)")
  const newsOp = await medusa("/dashboard/newsletter", { metodo: "GET", token: tokenOp })
  ok(newsOp.status === 403, "a operação não abre a newsletter", String(newsOp.status))
  const news = (await medusa("/dashboard/newsletter", { metodo: "GET", token: tokenMkt })).corpo
  const inscrito = (quem) => news.inscritos?.find((i) => i.email === quem)
  const caioNaLista = linha(doDono, CAIO)
  ok(
    inscrito(BRUNO)?.origem === "rodapé" &&
      inscrito(BRUNO)?.clienteId === bruno.id &&
      inscrito(CAIO)?.origem === "conta" &&
      inscrito(CAIO)?.clienteId === caioNaLista?.id &&
      inscrito(LEO)?.origem === "rodapé" &&
      inscrito(LEO)?.clienteId === null &&
      !inscrito(ANA),
    "uma lista só: o rodapé e a conta, cada cliente com o link pra ficha",
    JSON.stringify(news.inscritos?.filter((i) => i.email.includes(RODADA)))
  )
  const tirouCaio = await medusa("/dashboard/newsletter/tirar", {
    token: tokenMkt,
    corpo: { email: CAIO },
  })
  const caioDepois = await clienteDoEmail(CAIO)
  ok(
    tirouCaio.status === 200 &&
      caioDepois?.metadata?.ofertas?.email === null &&
      caioDepois?.metadata?.ofertas?.whatsapp === agora,
    "tirar o Caio: a caixa de e-mail da conta desmarca, e o WhatsApp fica",
    JSON.stringify(caioDepois?.metadata?.ofertas)
  )
  ok(
    linha(await lista(tokenDoDono), CAIO)?.ofertas === "WhatsApp · desde hoje",
    "e na lista ele segue com o WhatsApp"
  )
  const deNovo = await medusa("/dashboard/newsletter/tirar", {
    token: tokenMkt,
    corpo: { email: CAIO },
  })
  const opTira = await medusa("/dashboard/newsletter/tirar", {
    token: tokenOp,
    corpo: { email: BRUNO },
  })
  ok(
    deNovo.status === 404 && opTira.status === 403,
    "tirar de novo não acha nada; a operação não tira",
    `${deNovo.status} ${opTira.status}`
  )

  /* ── as telas ──────────────────────────────────────────────────────────── */

  titulo("As telas do dono")
  {
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/clientes?busca=${RODADA}`)
    await pagina.waitForSelector("[data-tela] .tabela")
    const naTela = await pagina
      .locator(".tabela tbody tr")
      .evaluateAll((trs) => trs.map((tr) => tr.getAttribute("data-cliente")))
    ok(
      naTela.join(",") === doDono.clientes.map((c) => c.id).join(","),
      "a tabela é a da API, na mesma ordem"
    )
    ok(
      (await pagina.locator("nav.abas a").allTextContents()).map(semEspaco).join("|") ===
        "Clientes|Newsletter",
      "as abas: Clientes e Newsletter"
    )
    const linhaDaAna = semEspaco(
      await pagina.locator(`.tabela tr[data-cliente="${ana.id}"]`).textContent()
    )
    ok(
      linhaDaAna.includes("Blumenau/SC") &&
        linhaDaAna.includes(reais(gastoDaAna)) &&
        linhaDaAna.includes("não aceita"),
      "a linha da Ana: a cidade, o gasto e as ofertas",
      linhaDaAna
    )
    await pagina.locator(`.tabela tr[data-cliente="${ana.id}"] a`).click()
    await pagina.waitForSelector(`[data-ficha="${ana.id}"]`)
    await hidratado(pagina, "[data-dados] .cpf button")
    const antes = semEspaco(await pagina.locator("[data-dados]").textContent())
    await pagina.locator("[data-dados] .cpf button").click()
    const depois = semEspaco(await pagina.locator("[data-dados]").textContent())
    ok(
      antes.includes("•••.444.777-••") &&
        !antes.includes(CPF_PONTUADO) &&
        depois.includes(CPF_PONTUADO),
      "a ficha abre com o CPF mascarado, e o dono mostra no clique"
    )
    ok(
      antes.includes("(11) 98888-7777") &&
        antes.includes(
          "Rua Doutor Pedro Zimmermann, 99 — Casa 2 — Itoupava Central — Blumenau/SC — 89036-370"
        ) &&
        (await pagina
          .locator("[data-dados] button[disabled]", { hasText: "Excluir dados" })
          .count()) === 1,
      "o celular, o endereço, e a exclusão (LGPD) esperando a revisão jurídica",
      antes
    )
    ok(
      (await pagina.locator("[data-pedidos-do-cliente] .mini a").count()) === 2 &&
        /Não aceita receber ofertas/.test(await pagina.locator("[data-ofertas]").textContent()),
      "os dois pedidos, e as ofertas: não aceita"
    )
  }

  titulo("As telas da operação")
  {
    const { pagina } = op
    await pagina.goto(`${PAINEL}/clientes?busca=${RODADA}`)
    await pagina.waitForSelector("[data-tela] .tabela")
    ok((await pagina.locator("nav.abas").count()) === 0, "sem a aba da newsletter")
    await pagina.goto(`${PAINEL}/clientes/${ana.id}`)
    await pagina.waitForSelector(`[data-ficha="${ana.id}"]`)
    const dados = semEspaco(await pagina.locator("[data-dados]").textContent())
    ok(
      dados.includes("•••.444.777-••") &&
        !dados.includes(CPF_PONTUADO) &&
        (await pagina.locator("[data-dados] .cpf button").count()) === 0 &&
        dados.includes("O documento inteiro só o dono vê"),
      "a ficha: o CPF mascarado, sem o 'Mostrar'",
      dados
    )
    await pagina.goto(`${PAINEL}/clientes/newsletter`)
    await pagina.waitForSelector("h1")
    ok(
      semEspaco(await pagina.locator("h1").first().textContent()) ===
        "Essa área não é do seu papel",
      "a newsletter pelo endereço: 'não é do seu papel'"
    )
  }

  titulo("As telas do marketing")
  {
    const { pagina } = mkt
    await pagina.goto(`${PAINEL}/clientes?busca=${RODADA}`)
    await pagina.waitForSelector("[data-tela] .tabela")
    const cabecalho = (await pagina.locator(".tabela thead th").allTextContents()).map(semEspaco)
    ok(
      (await pagina.locator("[data-visao-marketing]").count()) === 1 &&
        !cabecalho.includes("Cidade") &&
        (await pagina.locator(".tabela tbody tr").count()) === 2,
      "a faixa da visão do marketing, sem a coluna da cidade, só os dois que aceitaram",
      cabecalho.join("|")
    )
    await pagina.goto(`${PAINEL}/clientes/${ana.id}`)
    await pagina.waitForSelector("h1")
    ok(
      !(await pagina.content()).includes(ANA),
      "a ficha de quem não aceitou, pelo endereço: não abre"
    )
    // O 404 desta visita é o esperado (o navegador anota no console): sai da conta.
    for (let i = errosDeConsole.length - 1; i >= 0; i--)
      if (errosDeConsole[i].includes(`/clientes/${ana.id}`) && errosDeConsole[i].includes("404"))
        errosDeConsole.splice(i, 1)
    await pagina.goto(`${PAINEL}/clientes/newsletter`)
    await pagina.waitForSelector("[data-newsletter]")
    await hidratado(pagina, "[data-baixar-csv]")
    ok(
      (await pagina.locator(`[data-inscrito="${BRUNO}"] a`).getAttribute("href")) ===
        `/clientes/${bruno.id}` &&
        (await pagina.locator(`[data-inscrito="${LEO}"] a`).count()) === 0,
      "na lista, o e-mail de cliente leva pra ficha; o do Leo, que não é cliente, não"
    )
    const [download] = await Promise.all([
      pagina.waitForEvent("download"),
      pagina.locator("[data-baixar-csv]").click(),
    ])
    const csv = readFileSync(await download.path(), "utf8")
    ok(
      csv.startsWith("\uFEFFemail,desde,origem") && csv.includes(BRUNO) && csv.includes(LEO),
      "o CSV: a lista inteira, com o cabeçalho",
      csv.split("\n")[0]
    )
    await pagina.locator(`[data-tirar="${LEO}"]`).click()
    const aviso = pagina.locator(".aviso")
    const vez = await aviso.getAttribute("data-vez")
    await pagina.locator(`[data-inscrito="${LEO}"] [data-confirmar-tirar]`).click()
    await pagina.waitForFunction(
      (v) => document.querySelector(".aviso")?.getAttribute("data-vez") !== v,
      vez,
      { timeout: 20000 }
    )
    await pagina
      .locator(`[data-inscrito="${LEO}"]`)
      .waitFor({ state: "detached", timeout: 10000 })
      .catch(() => {})
    ok(
      (await pagina.locator(`[data-inscrito="${LEO}"]`).count()) === 0 &&
        /saiu da lista/.test(await aviso.textContent()),
      "tirar pela tela, com a confirmação: o Leo sai da lista"
    )
  }

  titulo("No celular")
  {
    const cel = await novaAba({ width: 390, height: 844 })
    await entrarPelaTela(cel, DONO, caixa)
    await cel.pagina.goto(`${PAINEL}/clientes?busca=${RODADA}`)
    await cel.pagina.waitForSelector("[data-tela] .cartoes")
    ok(await semRolagemDeLado(cel.pagina), "a lista, sem rolagem de lado")
    await cel.pagina.goto(`${PAINEL}/clientes/${ana.id}`)
    await cel.pagina.waitForSelector(`[data-ficha="${ana.id}"]`)
    ok(await semRolagemDeLado(cel.pagina), "a ficha, sem rolagem de lado")
  }

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.join(" | "))
} catch (e) {
  falhou(`o conferidor quebrou: ${e instanceof Error ? e.stack : e}`)
} finally {
  // Os e-mails da rodada saem da newsletter (os pedidos ficam, como nos outros conferidores).
  const { corpo } = await adm("/admin/newsletter")
  for (const i of corpo.inscricoes ?? [])
    if (i.email.includes(`.${RODADA}.`))
      await adm(`/admin/newsletter/${i.id}`, { metodo: "DELETE" })
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

process.exit(resumo())
