/**
 * CONFERIDOR DO CRM (parte 1) — a loja anota o que cada pessoa faz e liga
 * isso ao e-mail dela: a faixa de cookies, a loja e a rota que repassa, o
 * Medusa que grava, e a tela do CRM no painel.
 *
 *   (o Medusa, a loja e o painel locais no ar)
 *   LOJA=http://localhost:3060 node apps/dashboard/ferramentas/conferir-crm.mjs
 *
 * Variáveis: as de `pecas.mjs`, a NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, o
 * Medusa mandando os códigos pro Resend falso (`RESEND_URL`) e o segredo dos
 * avisos do Resend (`RESEND_WEBHOOK_SEGREDO`, o mesmo do Medusa: o
 * conferidor assina os avisos como o Resend). Pros Ajustes (parte 4), o
 * pedido de Fator entregue nasce como no `conferir-clientes`: ADMIN_EMAIL e
 * ADMIN_SENHA (o admin LOCAL), MEDUSA_WEBHOOK_SEGREDO, PORTA_FALSA (a Frenet
 * falsa) e PORTA_PAGARME_FALSO. Pro sair da lista (parte 6), o JWT_SECRET
 * do Medusa: o conferidor faz o link de uma pessoa da base como o e-mail
 * faria. A regra de
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
 * │ • a operação vendo o CRM; o e-mail inteiro na tela;                    │
 * │ • (parte 2) o e-mail saindo sem a etiqueta do tipo; o aviso do Resend  │
 * │   sem a assinatura dele entrando; o aviso repetido contando duas vezes;│
 * │   o IP do clique ou o id do pedido guardados; o e-mail da equipe nas   │
 * │   contas do CRM;                                                       │
 * │ • (parte 3) a ficha do cliente sem as etiquetas, sem de onde ele       │
 * │   chegou, ou com um caminho que não junta o site e os e-mails; a       │
 * │   operação recebendo a parte do CRM. (Os pedidos na ficha: o           │
 * │   conferir-clientes.)                                                  │
 * │ • (parte 4) os Ajustes que não valem na ficha (o Fator com outros      │
 * │   dias e a próxima compra parada); número errado gravando; a operação  │
 * │   abrindo os Ajustes; o "Voltar ao padrão" que não volta.              │
 * │ • (parte 5) a base da Nuvemshop que não entra, duplica ao mandar de    │
 * │   novo, guarda CPF ou telefone, ou não conta na ficha (o pedido da     │
 * │   loja antiga); o arquivo errado entrando; a operação importando; o    │
 * │   histórico que não chega nos Ajustes.                                 │
 * │ • (parte 6) o e-mail de oferta sem o sair da lista, sem o TikTok, ou   │
 * │   com link pra loja sem a campanha; o teste saindo pra outro e-mail    │
 * │   ou sem a etiqueta; o link de sair que não tira (da newsletter e da   │
 * │   base), que tira só de abrir, ou que fica na barra; o link mexido     │
 * │   tirando alguém; a base mandada de novo pondo de volta quem saiu.     │
 * │ • (parte 7) os fluxos: o toque saindo antes da hora, duas vezes, pra   │
 * │   quem comprou, saiu ou está no controle, ou com o fluxo desligado;    │
 * │   o cupom que não nasce, não vale no link, ou nasce de novo no mesmo   │
 * │   carrinho; o link de voltar que não põe o carrinho de volta (ou não   │
 * │   refaz o Pix vencido); a operação ligando fluxo.                      │
 * │ • (parte 8) o carrinho: a sacola de quem a loja conhece sem os cinco   │
 * │   toques, o cupom que não vale 3 dias, ou o carrinho que continua      │
 * │   depois de a pessoa abrir o checkout.                                 │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto"
import { gzipSync } from "node:zlib"
import { subirFrenetFalsa } from "../../loja/ferramentas/frenet-falsa.mjs"
import { subirPagarmeFalso } from "../../loja/ferramentas/pagarme-falso.mjs"
import { fabricaDePedidos } from "../../loja/ferramentas/pedido-de-teste.mjs"
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
// A Frenet e o Pagar.me falsos: o pedido de Fator entregue dos Ajustes (parte 4).
const frenet = await subirFrenetFalsa()
const pagarme = await subirPagarmeFalso({
  webhook: {
    url: `${MEDUSA}/hooks/payment/pagarme_pagarme`,
    segredo: process.env.MEDUSA_WEBHOOK_SEGREDO ?? "",
  },
})
const { navegador, novaAba, errosDeConsole } = await abrirNavegador()
console.log(
  `  ⚙  Resend :${resend.porta} · Frenet :${frenet.porta ?? "?"} · Pagar.me :${pagarme.porta} · painel ${PAINEL} · loja ${LOJA}`
)

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
/** Os Ajustes do CRM, como o formulário da tela manda: o texto de cada campo. */
const formularioDe = (a) => ({
  dias: Object.fromEntries(Object.entries(a.dias).map(([k, v]) => [k, String(v)])),
  regras: Object.fromEntries(Object.entries(a.regras).map(([k, v]) => [k, String(v)])),
})
/** Os Ajustes do padrão, pra voltar a eles no fim (o banco local é de todos os conferidores). */
let padraoDosAjustes = null
/** "27/10": o dia em Brasília, como o painel escreve. */
const DIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
})
const daquiA = (dias) => DIA.format(new Date(Date.now() + dias * 24 * 60 * 60 * 1000))
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
/** Entra na conta da loja pela tela, com o código que chega no Resend falso. Devolve se entrou. */
async function entrarNaLoja(pagina, email) {
  await pagina.goto(`${LOJA}/conta/entrar`, { waitUntil: "domcontentloaded" })
  const bloco = (s) => pagina.locator(`.entrar ${s}`).filter({ visible: true })
  await hidratado(pagina, ".entrar input[name=email]")
  const antes = resend.emails.length
  await bloco("input[name=email]").fill(email)
  await bloco("form button[type=submit]").click()
  await pagina.waitForURL("**/conta/entrar/codigo", { timeout: 20000 })
  let codigo = ""
  for (let i = 0; i < 60 && !codigo; i++) {
    const e = resend.emails
      .slice(antes)
      .find((x) => x.to?.includes(email) && /^\d{6} é o seu código/.test(x.subject ?? ""))
    codigo = e?.subject?.match(/^(\d{6})/)?.[1] ?? ""
    if (!codigo) await esperar(200)
  }
  if (!codigo) return false
  await hidratado(pagina, ".entrar input[name=codigo]")
  await bloco("input[name=codigo]").pressSequentially(codigo, { delay: 30 })
  await pagina.waitForURL((u) => !u.pathname.startsWith("/conta/entrar"), { timeout: 20000 })
  return true
}

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
      faixa.startsWith("Ao navegar por este site você aceita o uso de cookies"),
      "a faixa aparece mesmo sem parceiro ligado, com o texto da Nuvemshop (0172)",
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

    // Pela contagem, e não pela lista: a lista do dia pode ter o produto visto de outra rodada.
    const vistosAntes = vezes(await tela(), "produto_visto")
    await pagina.goto(`${LOJA}/produtos/oleo-para-barba`, { waitUntil: "domcontentloaded" })
    const comprar = pagina.locator(".compra__comprar")
    await comprar.scrollIntoViewIfNeeded({ timeout: 20000 })
    await hidratado(pagina, ".compra__comprar")
    const viu = await esperarTela((t) => vezes(t, "produto_visto") > vistosAntes)
    const oVisto = linhas(viu).find((l) => l.tipo === "produto_visto")
    ok(
      vezes(viu, "produto_visto") > vistosAntes && oVisto?.quem === null,
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
    // A identificação pode chegar por outro recado do checkout, segundos antes do
    // "deixou o e-mail" (cada um sai no seu envio): espera os dois.
    const ligado = await esperarTela(
      (t) =>
        daCampanha(t)?.quem === quem &&
        linhas(t).some((l) => l.tipo === "contato_informado" && l.quem === quem)
    )
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

  /* ── os avisos do Resend (parte 2) ──────────────────────────────────────── */

  titulo("Os avisos do Resend (POST /hooks/resend)")
  const SEGREDO_RESEND = process.env.RESEND_WEBHOOK_SEGREDO ?? ""
  if (!SEGREDO_RESEND) throw new Error("falta o RESEND_WEBHOOK_SEGREDO (o mesmo do Medusa)")
  /** Um aviso como o Resend manda: assinado no padrão Svix, com a hora de agora. */
  async function avisar(evento, { assinatura, ts = String(Math.floor(Date.now() / 1000)) } = {}) {
    const corpo = JSON.stringify(evento)
    const id = `msg_${randomUUID()}`
    const chave = Buffer.from(SEGREDO_RESEND.replace(/^whsec_/, ""), "base64")
    const certa = `v1,${createHmac("sha256", chave).update(`${id}.${ts}.${corpo}`).digest("base64")}`
    const r = await fetch(`${MEDUSA}/hooks/resend`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": id,
        "svix-timestamp": ts,
        "svix-signature": assinatura ?? certa,
      },
      body: corpo,
    })
    return r.status
  }
  const doCodigo = resend.emails
    .filter((e) => e.to?.includes(DA_CONTA) && /é o seu código/.test(e.subject ?? ""))
    .at(-1)
  ok(
    doCodigo?.tags?.some((t) => t.name === "tipo" && t.value === "codigo-de-entrar"),
    "o e-mail do código sai com a etiqueta do tipo (codigo-de-entrar)",
    JSON.stringify(doCodigo?.tags)
  )
  // O id do Resend falso recomeça a cada rodada: com a rodada na frente, é único no banco.
  const doEmail = (type, email_id, para, tipo, extra = {}) => ({
    type,
    created_at: new Date().toISOString(),
    data: {
      email_id,
      to: [para],
      created_at: new Date(Date.now() - 60_000).toISOString(),
      subject: "123456 é o seu código",
      tags: tipo ? { tipo } : {},
      ...extra,
    },
  })
  const idDoCodigo = `${RODADA}-${doCodigo?.id}`
  const doCodigoComo = (type, extra) =>
    doEmail(type, idDoCodigo, DA_CONTA, "codigo-de-entrar", extra)
  ok(
    (await avisar(doCodigoComo("email.delivered"), { assinatura: "v1,errada" })) === 401,
    "sem a assinatura do Resend: 401"
  )
  ok(
    (await avisar(doCodigoComo("email.delivered"), {
      ts: String(Math.floor(Date.now() / 1000) - 600),
    })) === 401,
    "aviso de 10 minutos atrás (a repetição de alguém): 401"
  )
  const antesDosEmails = (await tela()).emails.numeros
  const status = [
    await avisar(doCodigoComo("email.delivered")),
    await avisar(doCodigoComo("email.opened")),
    await avisar(
      doCodigoComo("email.clicked", {
        click: {
          link: `${LOJA}/conta/pedidos/order_01K5ZB0W6Y7Q8R9S0T1V2W3X4Y?origem=email`,
          timestamp: new Date().toISOString(),
          ipAddress: "200.1.2.3",
          userAgent: "Safari",
        },
      })
    ),
    await avisar(doCodigoComo("email.opened")),
  ]
  ok(
    status.every((s) => s === 200),
    "chegou, abriu, clicou e abriu de novo: 200",
    status.join(",")
  )
  const comAvisos = await esperarTela((t) =>
    t.emails.ultimos.some((l) => l.quem === mascarado(DA_CONTA) && l.oque.startsWith("clicou"))
  )
  const linhaDoCodigo = comAvisos.emails.ultimos.find((l) => l.quem === mascarado(DA_CONTA))
  ok(
    linhaDoCodigo?.oque.startsWith("clicou em “Código de entrar”") &&
      linhaDoCodigo?.oque.endsWith("/conta/pedidos/:id") &&
      linhaDoCodigo?.nivel === "bom",
    "em frase: clicou, com a página da loja sem o id do pedido",
    JSON.stringify(linhaDoCodigo)
  )
  const n = comAvisos.emails.numeros
  ok(
    n.enviados === antesDosEmails.enviados + 1 &&
      n.entregues === antesDosEmails.entregues + 1 &&
      n.abertos === antesDosEmails.abertos + 1 &&
      n.clicados === antesDosEmails.clicados + 1,
    "um e-mail a mais: saiu, chegou, abriu e clicou — a abertura repetida não conta duas vezes",
    JSON.stringify({ antes: antesDosEmails, depois: n })
  )
  ok(!JSON.stringify(comAvisos).includes("200.1.2.3"), "o IP do clique não fica")
  ok(
    comAvisos.emails.porTipo.some(
      (t) => t.tipo === "codigo-de-entrar" && t.nome === "Código de entrar"
    ),
    "na tabela por tipo, com o nome"
  )

  const SUMIU = `sumiu@${DOMINIO}`
  ok(
    (await avisar(
      doEmail("email.bounced", `${RODADA}-devolvido`, SUMIU, "pedido-confirmado", {
        bounce: {
          type: "Permanent",
          subType: "General",
          message: `550 5.1.1 <${SUMIU}>: Recipient address rejected`,
        },
      })
    )) === 200,
    "o que voltou: 200"
  )
  const devolvido = await esperarTela((t) => t.emails.numeros.naoChegaram > n.naoChegaram)
  ok(
    devolvido.emails.ultimos.some(
      (l) =>
        l.quem === mascarado(SUMIU) &&
        l.oque === "“Pedido confirmado” não chegou · o endereço não aceita e-mail" &&
        l.nivel === "ruim"
    ),
    "o que não chegou, com o porquê",
    JSON.stringify(devolvido.emails.ultimos.slice(0, 2))
  )

  ok(
    (await avisar(doEmail("email.delivered", `${RODADA}-do-dono`, DONO, null))) === 200,
    "o aviso de um e-mail da equipe (o dono): 200"
  )
  await esperar(1500)
  const semEquipe = await tela()
  ok(
    semEquipe.emails.numeros.enviados === devolvido.emails.numeros.enviados &&
      !semEquipe.emails.ultimos.some((l) => l.quem === mascarado(DONO)),
    "e fica fora das contas do CRM, que são de cliente"
  )

  /* ── a ficha da pessoa (parte 3) ────────────────────────────────────────── */

  titulo("A ficha do cliente, com o CRM")
  const clienteDaConta = (
    await medusa(`/dashboard/clientes?busca=${encodeURIComponent(DA_CONTA)}`, {
      metodo: "GET",
      token: tokenDoDono,
    })
  ).corpo.clientes?.find((c) => c.email === DA_CONTA)
  ok(Boolean(clienteDaConta?.id), "a conta da rodada está nos clientes")
  const fichaDaConta = await medusa(`/dashboard/clientes/${clienteDaConta?.id}`, {
    metodo: "GET",
    token: tokenDoDono,
  })
  const crmDaConta = fichaDaConta.corpo.cliente?.crm
  const etiquetaDaConta = (chave) => crmDaConta?.etiquetas?.find((e) => e.chave === chave)
  ok(
    etiquetaDaConta("etapa")?.valor === "Lead" &&
      etiquetaDaConta("engajamento")?.valor === "Quente" &&
      etiquetaDaConta("engajamento")?.porque === "clicou num e-mail da loja hoje" &&
      etiquetaDaConta("proxima")?.valor === "—",
    "sem compra: lead; clicou no e-mail hoje: quente",
    JSON.stringify(crmDaConta?.etiquetas)
  )
  ok(
    /^Direto · primeira visita em \d\d\/\d\d$/.test(crmDaConta?.origem ?? ""),
    "de onde chegou: direto, e o dia da primeira visita",
    crmDaConta?.origem ?? "sem origem"
  )
  const passos = crmDaConta?.caminho ?? []
  ok(
    passos[0]?.tipo === "email" &&
      passos[0]?.oque.startsWith("clicou em “Código de entrar”") &&
      passos[0]?.nivel === "bom" &&
      passos.some((p) => p.tipo === "conta_entrou" && p.oque === "entrou na conta") &&
      passos.some((p) => p.tipo === "produto_visto"),
    "o caminho junta o e-mail clicado e o que ela fez no site, do mais novo pro mais velho",
    JSON.stringify(passos.slice(0, 4))
  )
  const fichaDaOp = await medusa(`/dashboard/clientes/${clienteDaConta?.id}`, {
    metodo: "GET",
    token: cookieOp.value,
  })
  ok(
    fichaDaOp.status === 200 && !("crm" in (fichaDaOp.corpo.cliente ?? {})),
    "a operação abre a ficha, sem a parte do CRM"
  )
  await dono.pagina.goto(`${PAINEL}/clientes/${clienteDaConta?.id}`)
  await dono.pagina.locator("[data-etiquetas-crm]").waitFor({ timeout: 20000 })
  ok(
    (await dono.pagina.locator("[data-etiquetas-crm] .etiqueta").count()) === 5 &&
      semEspaco(await dono.pagina.locator("[data-origem-crm]").textContent()) ===
        `De onde chegou: ${crmDaConta?.origem}.`,
    "na tela: as cinco etiquetas e de onde chegou"
  )
  const primeiroPasso = semEspaco(
    await dono.pagina.locator("[data-caminho-crm] .anotacao").first().textContent()
  )
  ok(
    (await dono.pagina.locator("[data-caminho-crm] .anotacao").count()) === passos.length &&
      primeiroPasso.startsWith("Clicou em “Código de entrar”") &&
      primeiroPasso.endsWith(passos[0]?.quando ?? "?"),
    "e o caminho, como na API, com a hora",
    primeiroPasso
  )

  /* ── os Ajustes (parte 4) ────────────────────────────────────────────────── */

  titulo("Os Ajustes do CRM")
  const ajustes = (token) => medusa("/dashboard/crm/ajustes", { metodo: "GET", token })
  const salvarAjustes = (token, corpo) => medusa("/dashboard/crm/ajustes", { token, corpo })
  const noComeco = (await ajustes(tokenDoDono)).corpo
  padraoDosAjustes = noComeco.padrao
  // Começa do padrão: uma rodada que caiu no meio pode ter deixado o Fator com outros dias.
  ok(
    (await salvarAjustes(tokenDoDono, formularioDe(padraoDosAjustes))).status === 200,
    "o dono salva os Ajustes (começando do padrão)"
  )
  const telaDosAjustes = (await ajustes(tokenDoDono)).corpo
  ok(
    telaDosAjustes.ajustes?.dias?.fator === 30 &&
      telaDosAjustes.ajustes?.regras?.toleranciaDaReposicao === 20 &&
      telaDosAjustes.tipos
        ?.find((t) => t.tipo === "fator")
        ?.produtos.includes("Fator de Crescimento para Barba 30ml"),
    "os números do padrão, e o Fator da loja contando como Fator",
    JSON.stringify(telaDosAjustes.tipos?.slice(0, 2))
  )
  ok(
    (await ajustes(cookieOp.value)).status === 403 &&
      (await salvarAjustes(cookieOp.value, formularioDe(padraoDosAjustes))).status === 403,
    "a operação não abre nem salva os Ajustes"
  )
  const errado = await salvarAjustes(tokenDoDono, {
    dias: { ...formularioDe(padraoDosAjustes).dias, fator: "0" },
    regras: { ...formularioDe(padraoDosAjustes).regras, quente: "60", morno: "60" },
  })
  ok(
    errado.status === 422 &&
      errado.corpo.erros?.["dias.fator"] === "Um número de 1 a 365." &&
      errado.corpo.erros?.["regras.morno"] === "Maior que o do quente (60)." &&
      (await ajustes(tokenDoDono)).corpo.ajustes.dias.fator === 30,
    "número errado: 422, com a frase de cada campo, e nada grava",
    JSON.stringify(errado.corpo)
  )

  // Um pedido de Fator, entregue hoje: a próxima compra é a entrega + o que o Fator dura.
  const DO_FATOR = `fator@${DOMINIO}`
  const fabrica = fabricaDePedidos({
    medusa: MEDUSA,
    chave: CHAVE,
    tokenAdmin: (
      await (
        await fetch(`${MEDUSA}/auth/user/emailpass`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: process.env.ADMIN_EMAIL,
            password: process.env.ADMIN_SENHA,
          }),
        })
      ).json()
    ).token,
    pagarme,
  })
  const doFator = await fabrica.pedidoPix(DO_FATOR, [["fator-de-crescimento-para-barba", 1]])
  await fabrica.pagar(doFator)
  await fabrica.entregar(
    doFator,
    await fabrica.enviar(doFator, { codigo: `QS${Date.now() % 1e9}BR`, avisar: false })
  )
  const clienteDoFator = (
    await medusa(`/dashboard/clientes?busca=${encodeURIComponent(DO_FATOR)}`, {
      metodo: "GET",
      token: tokenDoDono,
    })
  ).corpo.clientes?.find((c) => c.email === DO_FATOR)
  const proximaDoFator = async () =>
    (
      await medusa(`/dashboard/clientes/${clienteDoFator?.id}`, {
        metodo: "GET",
        token: tokenDoDono,
      })
    ).corpo.cliente?.crm?.etiquetas?.find((e) => e.chave === "proxima")
  const antesDoAjuste = await proximaDoFator()
  ok(
    antesDoAjuste?.valor === daquiA(30),
    "a ficha de quem recebeu 1 Fator hoje: a próxima compra daqui a 30 dias",
    JSON.stringify(antesDoAjuste)
  )

  // O marketing muda o Fator pra 40 dias, pela tela do celular.
  await mkt.pagina.goto(`${PAINEL}/crm/ajustes`)
  await mkt.pagina.locator("[data-ajustes-crm]").waitFor({ timeout: 20000 })
  await hidratado(mkt.pagina, '[data-dias="fator"]')
  ok(
    (await mkt.pagina.locator('.abas [data-aba="ajustes"][aria-current="page"]').count()) === 1 &&
      (await mkt.pagina.locator("[data-salvar-ajustes]").isDisabled()),
    "a aba Ajustes acesa, e o Salvar parado sem mudança"
  )
  await mkt.pagina.locator('[data-dias="fator"]').fill("40")
  ok(
    semEspaco(await mkt.pagina.locator("[data-pendentes]").textContent()) ===
      "1 mudança sem salvar" &&
      (await mkt.pagina.locator('.ajuste__numero[data-mudado] [data-dias="fator"]').count()) ===
        1 &&
      /acaba 120 dias depois da entrega/.test(
        await mkt.pagina.locator("[data-exemplo-do-fator]").textContent()
      ),
    "mudou: em amarelo, “1 mudança sem salvar”, e o exemplo do kit de 3 refeito"
  )
  const vezAntes = await mkt.pagina.locator(".aviso").getAttribute("data-vez")
  await mkt.pagina.locator("[data-salvar-ajustes]").click()
  await mkt.pagina.waitForFunction(
    (v) => document.querySelector(".aviso")?.getAttribute("data-vez") !== v,
    vezAntes,
    { timeout: 20000 }
  )
  ok(
    /^Ajustes salvos/.test(semEspaco(await mkt.pagina.locator(".aviso").textContent())),
    "o marketing salva: “Ajustes salvos”",
    semEspaco(await mkt.pagina.locator(".aviso").textContent())
  )
  ok((await ajustes(tokenDoDono)).corpo.ajustes?.dias?.fator === 40, "o Fator agora dura 40 dias")
  ok(await semRolagemDeLado(mkt.pagina), "os Ajustes no celular, sem rolar de lado")
  const depoisDoAjuste = await proximaDoFator()
  ok(
    depoisDoAjuste?.valor === daquiA(40),
    "e a próxima compra da ficha anda junto: daqui a 40 dias",
    JSON.stringify(depoisDoAjuste)
  )

  // O dono volta ao padrão, pela tela.
  await dono.pagina.goto(`${PAINEL}/crm/ajustes`)
  await dono.pagina.locator("[data-ajustes-crm]").waitFor({ timeout: 20000 })
  await hidratado(dono.pagina, "[data-voltar-ao-padrao]")
  await dono.pagina.locator("[data-voltar-ao-padrao]").click()
  const vezDoDono = await dono.pagina.locator(".aviso").getAttribute("data-vez")
  await dono.pagina.locator("[data-salvar-ajustes]").click()
  await dono.pagina.waitForFunction(
    (v) => document.querySelector(".aviso")?.getAttribute("data-vez") !== v,
    vezDoDono,
    { timeout: 20000 }
  )
  ok(
    (await ajustes(tokenDoDono)).corpo.ajustes?.dias?.fator === 30 &&
      (await proximaDoFator())?.valor === daquiA(30),
    "“Voltar ao padrão” e salvar: o Fator volta aos 30 dias, e a ficha também"
  )

  /* ── a base da Nuvemshop (parte 5) ──────────────────────────────────────── */

  titulo("A base da Nuvemshop")
  const DIA_MS = 24 * 60 * 60 * 1000
  const agora = Date.now()
  /** A data como a Nuvemshop escreve ("27/09/2026 11:00:58"), em Brasília. */
  const dataBR = (ms, hora = true) => {
    const d = new Date(ms - 3 * 60 * 60 * 1000)
    const p = (n) => String(n).padStart(2, "0")
    return (
      `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` +
      (hora ? ` ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}` : "")
    )
  }
  const latin1 = (linhas) => Buffer.from(linhas.join("\r\n"), "latin1")
  const VELHO = `velho@${DOMINIO}`
  const VELHA = `velha@${DOMINIO}`
  const CPF_FALSO = "52998224725"
  const TELEFONE_FALSO = "11911112222"
  const cadastro = dataBR(agora - 400 * DIA_MS, false)
  const clientesDaBase = latin1([
    "Nome completo;CPF/CNPJ;E-mail;Telefone de Contato;Endereço;Cidade;Data;Cadastrado;Inscrição para newsletter;Marketing;Marketing (atualização)",
    `FATOR TESTE;${CPF_FALSO};${DO_FATOR};+55${TELEFONE_FALSO};Rua da Rodada, 99;Blumenau;${cadastro};NÃO;NÃO;Aceita;${cadastro}`,
    `JOÃO VELHO;${CPF_FALSO};${VELHO};+55${TELEFONE_FALSO};Rua da Rodada, 99;Blumenau;${cadastro};SIM;NÃO;Aceita;${cadastro}`,
    `ANA VELHA;${CPF_FALSO};${VELHA};+55${TELEFONE_FALSO};Rua da Rodada, 99;Blumenau;${cadastro};NÃO;NÃO;Não aceita;${cadastro}`,
    `SEM E-MAIL;;não é e-mail;;;;${cadastro};NÃO;NÃO;Aceita;${cadastro}`,
  ])
  const cabecalhoDasVendas =
    "Número do Pedido;E-mail;Data;Status do Pedido;Status do Pagamento;Status do Envio;Subtotal;Desconto;Valor do Frete;Total;Nome do comprador;CPF / CNPJ;Telefone;Endereço;Cupom de Desconto;Data de pagamento;Data de envío;Nome do Produto;Valor do Produto;Quantidade Comprada;SKU;Meio de pagamento"
  const venda = (numero, email, ms, sku, nome) =>
    `${numero};${email};${dataBR(ms)};Aberto;Confirmado;Entregue;79.90;0.00;15.00;94.90;Teste;${CPF_FALSO};+55${TELEFONE_FALSO};Rua da Rodada, 99;;${dataBR(ms, false)};${dataBR(ms + 2 * DIA_MS, false)};${nome};79.90;1;${sku};Pix`
  const NUMERO_DO_FATOR = `N${RODADA}-0`
  const vendasDaBase = latin1([
    cabecalhoDasVendas,
    // O do Fator: uma compra na loja antiga, 60 dias antes da de hoje na loja nova.
    venda(
      NUMERO_DO_FATOR,
      DO_FATOR,
      agora - 60 * DIA_MS,
      "FBFCB01",
      "Fator de Crescimento para Barba 30ml"
    ),
    // O velho: 12 Fatores, um a cada 45 dias — 11 recompras pro histórico dos Ajustes.
    ...Array.from({ length: 12 }, (_, i) =>
      venda(
        `N${RODADA}-${i + 1}`,
        VELHO,
        agora - (12 - i) * 45 * DIA_MS,
        "FBFCB01",
        "Fator de Crescimento para Barba 30ml"
      )
    ),
    // Um item a mais no primeiro pedido dele, na linha de baixo (como a Nuvemshop manda).
    `N${RODADA}-1;${VELHO};;;;;;;;;;;;;;;;Shampoo para Barba FuckingBarba 120ml;49.90;1;FBSH01;`,
  ])
  const carrinhosDaBase = latin1([
    "ID do carrinho;Data de criação;Tipo de abandono;Total do carrinho;Nome;E-mail;Telefone;CPF / CNPJ;Endereço;Nome do produto;Variante / SKU;Quantidade;Preço unitário",
    `C${RODADA};${dataBR(agora - 5 * DIA_MS)};Tentou pagar mas falhou;R$179,80;Ana;${VELHA};+55${TELEFONE_FALSO};${CPF_FALSO};Rua;Kit Completo FuckingBarba;FBKIT01;1;99.90`,
    `C${RODADA};;;;;${VELHA};;;;Fator de Crescimento para Barba 30ml;FBFCB01;1;79.90`,
  ])
  const base = (token) => medusa("/dashboard/crm/base", { metodo: "GET", token })
  const doArquivo = (buffer) => ({
    nome: "x.csv",
    gzip: gzipSync(buffer).toString("base64"),
  })
  ok(
    (await base(cookieOp.value)).status === 403 &&
      (
        await medusa("/dashboard/crm/base", {
          token: cookieOp.value,
          corpo: doArquivo(clientesDaBase),
        })
      ).status === 403,
    "a operação não abre nem manda a base"
  )
  const naoENuvemshop = await medusa("/dashboard/crm/base", {
    token: tokenDoDono,
    corpo: doArquivo(latin1(["nome;idade", "ana;30"])),
  })
  const naoEGzip = await medusa("/dashboard/crm/base", {
    token: tokenDoDono,
    corpo: { nome: "x.csv", gzip: Buffer.from("isso não é gzip").toString("base64") },
  })
  ok(
    naoENuvemshop.status === 422 &&
      naoENuvemshop.corpo.erro === "desconhecido" &&
      naoEGzip.status === 422 &&
      naoEGzip.corpo.erro === "arquivo_invalido",
    "o arquivo que não é da Nuvemshop, e o que nem abre: 422, com o porquê"
  )

  const antesDaBase = (await base(tokenDoDono)).corpo.numeros
  await dono.pagina.goto(`${PAINEL}/crm/base`)
  await dono.pagina.locator("[data-base-crm]").waitFor({ timeout: 20000 })
  await hidratado(dono.pagina, "[data-arquivos-da-base]")
  const mandarBase = async () => {
    // O aviso de baixo entra quando o último arquivo volta: é por ele que se sabe que acabou.
    const vez = await dono.pagina.locator(".aviso").getAttribute("data-vez")
    await dono.pagina.locator("[data-arquivos-da-base]").setInputFiles([
      { name: "clientes.csv", mimeType: "text/csv", buffer: clientesDaBase },
      { name: "vendas.csv", mimeType: "text/csv", buffer: vendasDaBase },
      { name: "carrinho_abandonado.csv", mimeType: "text/csv", buffer: carrinhosDaBase },
    ])
    await dono.pagina.waitForFunction(
      (v) => document.querySelector(".aviso")?.getAttribute("data-vez") !== v,
      vez,
      { timeout: 60000 }
    )
    await dono.pagina.locator("[data-resultados-da-base] li").nth(2).waitFor({ timeout: 20000 })
    return (await dono.pagina.locator("[data-resultados-da-base] li").allTextContents()).map(
      semEspaco
    )
  }
  const primeiraVez = await mandarBase()
  ok(
    JSON.stringify(primeiraVez) ===
      JSON.stringify([
        "Clientes: 3 pessoas · 1 linha sem e-mail ficou de fora.",
        "Vendas: 13 pedidos.",
        "Carrinhos: 1 carrinho.",
      ]),
    "os três arquivos pela tela: o que entrou de cada um, e a linha sem e-mail de fora",
    JSON.stringify(primeiraVez)
  )
  const depoisDaBase = (await base(tokenDoDono)).corpo
  ok(
    depoisDaBase.numeros.pessoas === antesDaBase.pessoas + 3 &&
      depoisDaBase.numeros.aceitam === antesDaBase.aceitam + 2 &&
      depoisDaBase.numeros.pagos === antesDaBase.pagos + 13 &&
      depoisDaBase.numeros.carrinhos === antesDaBase.carrinhos + 1,
    "os números da base: 3 pessoas (2 aceitam ofertas), 13 pedidos pagos e 1 carrinho a mais",
    JSON.stringify({ antes: antesDaBase, depois: depoisDaBase.numeros })
  )
  const segundaVez = await mandarBase()
  const deNovo = (await base(tokenDoDono)).corpo.numeros
  ok(
    segundaVez[0] ===
      "Clientes: 3 pessoas · 3 já estavam e foram atualizados · 1 linha sem e-mail ficou de fora." &&
      segundaVez[1] === "Vendas: 13 pedidos · 13 já estavam e foram atualizados." &&
      deNovo.pessoas === depoisDaBase.numeros.pessoas &&
      deNovo.pagos === depoisDaBase.numeros.pagos &&
      deNovo.carrinhos === depoisDaBase.numeros.carrinhos,
    "mandar de novo atualiza: nada duplica",
    JSON.stringify(segundaVez)
  )
  await dono.pagina.locator("[data-numeros-base]").waitFor({ timeout: 20000 })
  // A tela se refaz depois do aviso de baixo: espera o número da API chegar nela.
  await dono.pagina
    .waitForFunction(
      (n) => document.querySelector('[data-base="pessoas"]')?.textContent?.trim() === n,
      new Intl.NumberFormat("pt-BR").format(deNovo.pessoas),
      { timeout: 20000 }
    )
    .catch(() => null)
  ok(
    semEspaco(await dono.pagina.locator('[data-base="pessoas"]').textContent()) ===
      new Intl.NumberFormat("pt-BR").format(deNovo.pessoas) &&
      (await dono.pagina.locator("[data-quem-e-quem] [data-linha-da-base]").count()) === 9,
    "a tela: os números da API, e as 6 etapas e os 3 engajamentos",
    `${semEspaco(await dono.pagina.locator('[data-base="pessoas"]').textContent())} / ${deNovo.pessoas}; ` +
      `${await dono.pagina.locator("[data-quem-e-quem] [data-linha-da-base]").count()} linhas`
  )

  // A ficha de quem comprou nas duas lojas: recorrente, e a compra da loja antiga no caminho.
  const fichaDoFator = (
    await medusa(`/dashboard/clientes/${clienteDoFator?.id}`, { metodo: "GET", token: tokenDoDono })
  ).corpo.cliente
  ok(
    fichaDoFator?.crm?.etiquetas?.[0]?.valor === "Recorrente" &&
      fichaDoFator?.crm?.etiquetas?.[0]?.porque === "2 pedidos pagos" &&
      fichaDoFator?.crm?.caminho?.some((p) =>
        semEspaco(p.oque).startsWith(`pagou o pedido #${NUMERO_DO_FATOR} na Nuvemshop`)
      ),
    "a ficha: a compra da loja antiga conta (recorrente) e aparece no caminho",
    JSON.stringify(fichaDoFator?.crm?.etiquetas?.[0])
  )
  const tudoQueSaiu = JSON.stringify([depoisDaBase, fichaDoFator])
  ok(
    !tudoQueSaiu.includes(CPF_FALSO) &&
      !tudoQueSaiu.includes(TELEFONE_FALSO) &&
      !tudoQueSaiu.includes("Rua da Rodada"),
    "nem o CPF, nem o telefone, nem o endereço dos arquivos aparecem"
  )

  // O histórico chega nos Ajustes: a linha do Fator e o botão que usa o número.
  await mkt.pagina.goto(`${PAINEL}/crm/ajustes`)
  await mkt.pagina.locator("[data-ajustes-crm]").waitFor({ timeout: 20000 })
  await hidratado(mkt.pagina, "[data-usar-historico]")
  const linhaDoFator = semEspaco(
    await mkt.pagina.locator('[data-historico-do-tipo="fator"]').textContent()
  )
  const diasDoHistorico = linhaDoFator.match(
    /^Na Nuvemshop: (\d+) dias até comprar de novo \((\d+) recompras\)$/
  )
  ok(
    Boolean(diasDoHistorico) && Number(diasDoHistorico?.[2]) >= 11,
    "os Ajustes mostram o que a Nuvemshop diz do Fator",
    linhaDoFator
  )
  await mkt.pagina.locator("[data-usar-historico]").click()
  ok(
    (await mkt.pagina.locator('[data-dias="fator"]').inputValue()) === diasDoHistorico?.[1] &&
      (await mkt.pagina.locator("[data-pendentes]").count()) === 1,
    "“Usar os números da Nuvemshop” põe o número no campo, esperando o Salvar"
  )
  await mkt.pagina.locator("[data-desfazer]").click()
  ok(
    (await mkt.pagina.locator('[data-dias="fator"]').inputValue()) === "30",
    "e o Desfazer volta (nada foi salvo)"
  )
  await mkt.pagina.goto(`${PAINEL}/crm/base`)
  await mkt.pagina.locator("[data-numeros-base]").waitFor({ timeout: 20000 })
  ok(await semRolagemDeLado(mkt.pagina), "a base no celular, sem rolar de lado")

  /* ── o modelo dos e-mails e o sair da lista (parte 6) ───────────────────── */

  titulo("O modelo dos e-mails")
  /** O seletor aparece em até 20 s? (Não aparecer é falha deste teste, não parada da rodada.) */
  const apareceu = (pagina, seletor) =>
    pagina
      .locator(seletor)
      .waitFor({ timeout: 20000 })
      .then(
        () => true,
        () => false
      )
  const modelo = (token) => medusa("/dashboard/crm/emails", { metodo: "GET", token })
  const testeDo = (token, exemplo) =>
    medusa("/dashboard/crm/emails/teste", { token, corpo: { exemplo } })
  ok(
    (await modelo(cookieOp.value)).status === 403 &&
      (await testeDo(cookieOp.value, "reposicao")).status === 403,
    "a operação não abre o modelo nem manda teste"
  )
  const doModelo = await modelo(tokenDoDono)
  const exemplos = doModelo.corpo.exemplos ?? []
  ok(
    doModelo.status === 200 &&
      exemplos.map((x) => x.id).join(",") === "boas-vindas,reposicao,carrinho" &&
      doModelo.corpo.para === DONO,
    "os três exemplos, e o teste vai pro e-mail de quem pede",
    JSON.stringify({ status: doModelo.status, ids: exemplos.map((x) => x.id) })
  )
  ok(
    exemplos.length === 3 &&
      exemplos.every(
        (x) =>
          x.html.includes("Sair da lista em 1 clique") &&
          x.html.includes(`href="${LOJA}/sair/`) &&
          x.html.includes("https://www.instagram.com/fuckingbarba") &&
          x.html.includes("https://www.tiktok.com/@fuckingbarba")
      ),
    "todo exemplo tem no pé o sair da lista, o Instagram e o TikTok"
  )
  const linksDaLoja = (html) =>
    [...html.matchAll(/href="([^"]+)"/g)]
      .map((m) => m[1].replaceAll("&amp;", "&"))
      .filter((u) => u.startsWith(LOJA) && !u.startsWith(`${LOJA}/sair/`))
  ok(
    exemplos.length === 3 &&
      exemplos.every((x) => {
        const links = linksDaLoja(x.html)
        return (
          links.length > 0 &&
          links.every(
            (u) => u.includes("utm_medium=email") && u.includes(`utm_campaign=crm-${x.id}`)
          )
        )
      }),
    "todo link pra loja leva a campanha do CRM (Marketing → Canais: E-mail)"
  )

  /*
    O navegador do conferidor manda `x-real-ip` em todo pedido (`pecas.mjs`, pro limite do painel
    contar por pessoa). A fonte do Google que o e-mail carrega, dentro da prévia (origem `null`),
    vira então um pedido que precisa de licença (CORS), e o Google recusa o cabeçalho — um erro no
    console que navegador de gente não tem. Pras fontes, o cabeçalho sai.
  */
  const semIpNasFontes = (contexto) =>
    contexto.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => {
      const cabecalhos = { ...r.request().headers() }
      delete cabecalhos["x-real-ip"]
      return r.continue({ headers: cabecalhos })
    })
  await semIpNasFontes(dono.contexto)
  await semIpNasFontes(mkt.contexto)
  await dono.pagina.goto(`${PAINEL}/crm/emails`)
  await dono.pagina.locator("[data-modelo-dos-emails]").waitFor({ timeout: 20000 })
  ok(
    (await dono.pagina.locator("[data-exemplo]").count()) === 3 &&
      (await dono.pagina.locator('.abas [data-aba="emails"][aria-current="page"]').count()) === 1 &&
      (await textoDe(dono.pagina, "[data-para]")) === DONO,
    "a aba E-mails: acesa, os três exemplos, e pra quem vai o teste"
  )
  const quadro = dono.pagina.locator('[data-exemplo="reposicao"] iframe')
  await quadro.scrollIntoViewIfNeeded()
  const naPrevia = semEspaco(
    await dono.pagina
      .frameLocator('[data-exemplo="reposicao"] iframe')
      .locator("body")
      .textContent({ timeout: 15000 })
  )
  ok(
    naPrevia.includes("Sair da lista em 1 clique") && naPrevia.includes("Hora de repor"),
    "a prévia é o e-mail que sai (o HTML do Medusa)",
    naPrevia.slice(0, 120)
  )
  ok(
    !(await quadro.getAttribute("sandbox"))?.includes("allow-scripts") &&
      (await quadro.getAttribute("sandbox"))?.includes("allow-popups"),
    "a prévia sem script (sandbox sem allow-scripts)"
  )

  const ehTeste = (e) => e.subject?.startsWith("[Teste] ")
  const antesDoTeste = caixa.quantos(DONO, ehTeste)
  await hidratado(dono.pagina, '[data-exemplo="reposicao"] [data-mandar-pra-mim]')
  const vezDoTeste = await dono.pagina.locator(".aviso").getAttribute("data-vez")
  await dono.pagina.locator('[data-exemplo="reposicao"] [data-mandar-pra-mim]').click()
  await dono.pagina.waitForFunction(
    (v) => document.querySelector(".aviso")?.getAttribute("data-vez") !== v,
    vezDoTeste,
    { timeout: 20000 }
  )
  const avisoDoTeste = semEspaco(await dono.pagina.locator(".aviso").textContent())
  ok(
    avisoDoTeste.startsWith(`Mandei “Hora de repor” pra ${DONO}.`),
    "“Mandar pra mim”: o aviso diz pra quem foi",
    avisoDoTeste
  )
  const teste = await caixa.esperarEmail(DONO, ehTeste, antesDoTeste)
  const cabecalhos = teste?.headers ?? {}
  const comUmClique = MEDUSA.startsWith("https://")
  ok(
    teste?.subject === `[Teste] ${exemplos[1]?.assunto}` &&
      teste?.from === doModelo.corpo.remetente &&
      teste?.tags?.some((t) => t.name === "tipo" && t.value === "crm-teste"),
    "o teste chega: [Teste] no assunto, o remetente do CRM e a etiqueta crm-teste",
    JSON.stringify({ assunto: teste?.subject, de: teste?.from, tags: teste?.tags })
  )
  ok(
    comUmClique
      ? /^<https:\/\/[^>]+\/crm\/sair\?t=[\w-]+>$/.test(cabecalhos["List-Unsubscribe"] ?? "") &&
          cabecalhos["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click"
      : cabecalhos["List-Unsubscribe"] ===
          `<${teste?.html?.match(/href="([^"]+\/sair\/[\w-]+)"/)?.[1]}>` &&
          !cabecalhos["List-Unsubscribe-Post"],
    comUmClique
      ? "o cabeçalho do “cancelar inscrição” de um clique (Gmail, iPhone)"
      : "o cabeçalho do “cancelar inscrição”: a página de sair (sem https no Medusa, sem o clique único)",
    JSON.stringify(cabecalhos)
  )

  titulo("O sair da lista")
  // O marketing, no celular: manda o teste pra ele e sai da lista pelo link do e-mail.
  const MKT = `mkt.${RODADA}@painel.teste`
  const inscrever = async (email) =>
    (
      await fetch(`${MEDUSA}/store/newsletter`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...DA_LOJA,
          "x-loja-segredo": process.env.REVALIDAR_SEGREDO ?? "",
          "x-cliente-ip": `10.9.${Date.now() % 250}.1`,
        },
        body: JSON.stringify({ email, origem: "rodape" }),
      })
    ).status
  const naNewsletter = async (email) =>
    (
      await medusa("/dashboard/newsletter?todos=1", { metodo: "GET", token: tokenDoDono })
    ).corpo.inscritos?.some((i) => i.email === email)
  ok(
    (await inscrever(MKT)) === 200 && (await naNewsletter(MKT)),
    "o e-mail do marketing na newsletter"
  )
  await mkt.pagina.goto(`${PAINEL}/crm/emails`)
  await mkt.pagina.locator("[data-modelo-dos-emails]").waitFor({ timeout: 20000 })
  ok(await semRolagemDeLado(mkt.pagina), "a aba E-mails no celular, sem rolar de lado")
  const antesDoMkt = caixa.quantos(MKT, ehTeste)
  await hidratado(mkt.pagina, '[data-exemplo="boas-vindas"] [data-mandar-pra-mim]')
  await mkt.pagina.locator('[data-exemplo="boas-vindas"] [data-mandar-pra-mim]').click()
  const doMkt = await caixa.esperarEmail(MKT, ehTeste, antesDoMkt, 20000)
  const linkDeSair = doMkt?.html?.match(/href="([^"]+\/sair\/([\w-]+))"/)
  ok(
    Boolean(linkDeSair) && linkDeSair[1].startsWith(`${LOJA}/sair/`),
    "o teste do marketing chega, com o link de sair",
    doMkt?.subject ?? "não chegou"
  )

  const pessoa = await novaAba({ width: 375, height: 812 })
  await pessoa.pagina.goto(linkDeSair?.[1] ?? `${LOJA}/sair`, { waitUntil: "domcontentloaded" })
  await responderAFaixa(pessoa.pagina, "Só o necessário").catch(() => null)
  // `main [data-sair]`: no `next dev`, o pedaço que chega por streaming pode ficar com uma cópia
  // escondida no fim do <body>, e o botão que a pessoa vê é o de dentro do <main>.
  const botaoDeSair = pessoa.pagina.locator("main [data-sair]")
  await botaoDeSair.waitFor({ timeout: 30000 })
  // O cookie mora só no caminho /sair: pedido pela raiz, o navegador nem mostra.
  const cookieDoSair = async () =>
    (await pessoa.contexto.cookies(`${LOJA}/sair`)).find((c) => c.name === "sair") ?? null
  const guardado = await cookieDoSair()
  ok(
    new URL(pessoa.pagina.url()).pathname === "/sair" &&
      !pessoa.pagina.url().includes(linkDeSair?.[2] ?? "?") &&
      guardado?.httpOnly === true &&
      guardado?.path === "/sair",
    "o link abre /sair limpa: o link fica num cookie httpOnly, só do /sair",
    pessoa.pagina.url()
  )
  ok(await naNewsletter(MKT), "abrir o link não tira ninguém: a página pergunta antes")
  ok(await semRolagemDeLado(pessoa.pagina), "a página de sair no celular, sem rolar de lado")
  await hidratado(pessoa.pagina, "main [data-sair]")
  await botaoDeSair.click()
  ok(
    (await apareceu(pessoa.pagina, "main [data-saiu]")) && !(await naNewsletter(MKT)),
    "“Sair da lista”: “Pronto, você saiu”, e o e-mail sai da newsletter"
  )
  await pessoa.pagina.waitForTimeout(1500)
  ok(
    (await pessoa.pagina.locator("main [data-saiu]").count()) === 1,
    "e o “Pronto” fica na tela (a página não se refaz por baixo dele)"
  )
  await pessoa.contexto.clearCookies()
  await pessoa.pagina.goto(`${LOJA}/sair`, { waitUntil: "domcontentloaded" })
  ok(
    await apareceu(pessoa.pagina, "main [data-link-invalido]"),
    "/sair sem o link: a página explica como sair"
  )
  await pessoa.pagina.goto(`${LOJA}/sair/${"A".repeat(60)}`, { waitUntil: "domcontentloaded" })
  await hidratado(pessoa.pagina, "main [data-sair]")
  await botaoDeSair.click()
  ok(
    (await apareceu(pessoa.pagina, "main [data-link-invalido]")) && !(await cookieDoSair()),
    "o link com cara de link, mas que o Medusa não fez: “Esse link não vale”, e o cookie sai"
  )
  await pessoa.contexto.close()

  // O clique único, como o Gmail chama: POST no endereço do cabeçalho, sem a chave da loja.
  const segredoDoJwt = process.env.JWT_SECRET ?? ""
  if (!segredoDoJwt) throw new Error("falta o JWT_SECRET (o mesmo do Medusa) pra fazer o link")
  const linkPara = (email) => {
    const chave = createHmac("sha256", segredoDoJwt).update("fb-crm-sair-da-lista").digest()
    const iv = randomBytes(12)
    const cifra = createCipheriv("aes-256-gcm", chave, iv)
    const texto = Buffer.concat([cifra.update(email, "utf8"), cifra.final()])
    return Buffer.concat([iv, texto, cifra.getAuthTag()]).toString("base64url")
  }
  const tDoVelho = linkPara(VELHO)
  const aceitamAntes = (await base(tokenDoDono)).corpo.numeros.aceitam
  const umClique = await fetch(`${MEDUSA}/crm/sair?t=${tDoVelho}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  })
  const aceitamDepois = (await base(tokenDoDono)).corpo.numeros.aceitam
  ok(
    umClique.status === 200 && aceitamDepois === aceitamAntes - 1,
    "o clique único (POST do Gmail, sem a chave da loja) tira da base da Nuvemshop",
    `${umClique.status}: ${aceitamAntes} → ${aceitamDepois}`
  )
  await medusa("/dashboard/crm/base", { token: tokenDoDono, corpo: doArquivo(clientesDaBase) })
  ok(
    (await base(tokenDoDono)).corpo.numeros.aceitam === aceitamDepois,
    "mandar a base de novo não põe de volta quem saiu depois"
  )
  const pelaBarra = await fetch(`${MEDUSA}/crm/sair?t=${tDoVelho}`, { redirect: "manual" })
  ok(
    pelaBarra.status === 303 && pelaBarra.headers.get("location") === `${LOJA}/sair/${tDoVelho}`,
    "o endereço do cabeçalho aberto no navegador vai pra página da loja",
    `${pelaBarra.status} ${pelaBarra.headers.get("location")}`
  )
  const mexido = `${tDoVelho.slice(0, 20)}${tDoVelho[20] === "A" ? "B" : "A"}${tDoVelho.slice(21)}`
  const tortos = await Promise.all(
    [mexido, "lixo"].map(
      async (t) => (await fetch(`${MEDUSA}/crm/sair?t=${t}`, { method: "POST" })).status
    )
  )
  ok(
    tortos.every((s) => s === 400),
    "o link mexido ou torto não tira ninguém (400)",
    tortos.join(",")
  )

  /* ── os fluxos (parte 7) ─────────────────────────────────────────────────── */
  {
    titulo("Os fluxos: a tela e as chaves")
    const MIN = 60 * 1000
    const HORA = 60 * MIN
    const DIA_MS = 24 * HORA
    const fluxos = (token) => medusa("/dashboard/crm/fluxos", { metodo: "GET", token })
    const mudarFluxos = (corpo, token = tokenDoDono) =>
      medusa("/dashboard/crm/fluxos", { token, corpo })
    const rodar = (corpo = {}) =>
      medusa("/dashboard/crm/fluxos/rodar", { token: tokenDoDono, corpo })
    ok(
      (await fluxos(cookieOp.value)).status === 403 &&
        (await mudarFluxos({ desconto: 15 }, cookieOp.value)).status === 403 &&
        (await medusa("/dashboard/crm/fluxos/rodar", { token: cookieOp.value, corpo: {} }))
          .status === 403 &&
        (
          await medusa("/dashboard/crm/fluxos/teste", {
            token: cookieOp.value,
            corpo: { toque: "checkout-30min" },
          })
        ).status === 403,
      "a operação não abre, não liga, não roda e não manda teste"
    )
    // O banco local é de todos os conferidores: os quatro ligados, a estreia desligada (ela só
    // liga pelo dono), e a primeira rodada guarda a hora.
    for (const id of ["pix", "checkout", "carrinho", "boas-vindas"])
      await mudarFluxos({ fluxo: id, ligado: true })
    await mudarFluxos({ fluxo: "estreia", ligado: false })
    await mudarFluxos({ fluxo: "reposicao", ligado: false })
    await mudarFluxos({ fluxo: "jornada", ligado: false })
    await mudarFluxos({ fluxo: "resgate", ligado: false })
    await rodar()
    const tela0 = (await fluxos(tokenDoDono)).corpo
    const esperaODono = (id) => ["estreia", "reposicao", "jornada", "resgate"].includes(id)
    ok(
      tela0.fluxos?.map((f) => f.id).join() ===
        "pix,checkout,carrinho,reposicao,jornada,boas-vindas,estreia,resgate" &&
        tela0.fluxos.find((f) => f.id === "resgate")?.toques.length === 4 &&
        tela0.fluxos.find((f) => f.id === "jornada")?.toques.length === 5 &&
        tela0.fluxos.every((f) => (esperaODono(f.id) ? !f.ligado : f.ligado && f.desde)) &&
        tela0.fluxos.find((f) => f.id === "estreia")?.toques.length === 2 &&
        tela0.fluxos.find((f) => f.id === "reposicao")?.toques.length === 4 &&
        tela0.fluxos.find((f) => f.id === "checkout")?.toques.length === 4 &&
        tela0.fluxos.find((f) => f.id === "pix")?.toques.length === 3 &&
        tela0.fluxos.find((f) => f.id === "carrinho")?.toques.length === 5 &&
        tela0.fluxos.find((f) => f.id === "boas-vindas")?.toques.length === 6,
      "os oito fluxos, com os toques de cada um: quatro ligados, e a estreia, a reposição, a jornada e o resgate esperando o dono",
      JSON.stringify(tela0.fluxos?.map((f) => [f.id, f.ligado, f.desde, f.toques?.length]))
    )
    const errados = await Promise.all([
      mudarFluxos({ desconto: 50 }),
      mudarFluxos({ fluxo: "sms", ligado: true }),
      rodar({ agora: "ontem" }),
    ])
    ok(
      errados[0].status === 422 && errados[1].status === 422 && errados[2].status === 400,
      "o desconto fora de 5% a 30%, o fluxo que não existe e a hora torta: recusados",
      errados.map((e) => e.status).join(",")
    )

    // Os e-mails de teste ficam fora do grupo de controle (5%, sorteado pelo e-mail, como no motor).
    const controle = (email, fluxo) =>
      createHash("sha256").update(`${email}|${fluxo}`).digest().readUInt32BE(0) % 100 < 5
    const foraDoControle = (nome, fluxo) => {
      for (let i = 0; ; i++) {
        const e = `${nome}${i}@${DOMINIO}`
        if (!controle(e, fluxo)) return e
      }
    }
    const noControleDo = (nome, fluxo) => {
      for (let i = 0; ; i++) {
        const e = `${nome}${i}@${DOMINIO}`
        if (controle(e, fluxo)) return e
      }
    }
    const { regions } = await (await fetch(`${MEDUSA}/store/regions`, { headers: DA_LOJA })).json()
    const regiao = regions.find((r) => r.currency_code === "brl")
    const { products: doShampoo } = await (
      await fetch(
        `${MEDUSA}/store/products?handle=shampoo-para-barba&region_id=${regiao.id}&fields=*variants`,
        { headers: DA_LOJA }
      )
    ).json()
    const criarCarrinho = async (email) =>
      (
        await (
          await fetch(`${MEDUSA}/store/carts`, {
            method: "POST",
            headers: { "content-type": "application/json", ...DA_LOJA },
            body: JSON.stringify({
              region_id: regiao.id,
              email,
              items: [{ variant_id: doShampoo[0].variants[0].id, quantity: 1 }],
            }),
          })
        ).json()
      ).cart
    /**
     * De madrugada (22h às 8h em Brasília) só o urgente sai: o toque que cairia lá vai pras 8h05.
     * Direto pras 8h05, e não em degraus de 15 minutos até as 9h: rodando perto das 21h, o degrau
     * passava das 12 horas da sacola, e o motor pulava o de 1 hora. Brasília é UTC−3, sem horário
     * de verão.
     */
    const HORA_BR = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hourCycle: "h23",
    })
    const diurno = (ms) => {
      const h = Number(HORA_BR.format(new Date(ms)))
      if (h >= 8 && h < 22) return ms
      const b = new Date(ms - 3 * HORA)
      const dia = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + (h >= 22 ? 1 : 0))
      return dia + 3 * HORA + 8 * HORA + 5 * MIN
    }
    const deFluxo = (e) => !/^\[Teste\]/.test(e.subject ?? "")

    titulo("O checkout abandonado")
    const NO_CHECKOUT = foraDoControle("checkout", "checkout")
    const carrinho = await criarCarrinho(NO_CHECKOUT)
    const comeco = new Date(carrinho.updated_at).getTime()
    const aos = (ms, urgente = false) =>
      new Date(urgente ? comeco + ms : diurno(comeco + ms)).toISOString()
    const antes30 = await rodar({ agora: aos(29 * MIN, true), email: NO_CHECKOUT })
    ok(
      antes30.status === 200 && antes30.corpo.enviados === 0,
      "antes dos 30 minutos, nada",
      JSON.stringify(antes30.corpo)
    )
    const r30 = await rodar({ agora: aos(31 * MIN, true), email: NO_CHECKOUT })
    const e30 = await caixa.esperarEmail(
      NO_CHECKOUT,
      (e) => e.subject === "Faltou só o pagamento",
      0
    )
    ok(
      r30.corpo.enviados === 1 &&
        Boolean(e30) &&
        e30.tags?.some((t) => t.name === "tipo" && t.value === "crm-checkout") &&
        e30.html.includes(`${LOJA}/voltar/${carrinho.id}.`) &&
        e30.html.includes("utm_campaign=crm-checkout") &&
        e30.html.includes("Você recebeu porque começou uma compra na FuckingBarba.") &&
        // O lembrete sem desconto tem a cara da marca, sai com o nome de quem assina e não
        // leva o cabeçalho de oferta; o sair da lista fica no pé.
        !e30.headers?.["List-Unsubscribe"] &&
        /^Matheus, da FuckingBarba </.test(e30.from ?? "") &&
        e30.html.includes("Ousamos, criamos, cuidamos.") &&
        e30.html.includes("Sair da lista em 1 clique") &&
        (e30.text ?? "").includes("Sair da lista:"),
      "30 minutos: “Faltou só o pagamento”, lembrete — a cara da marca, assinado, sem o cabeçalho de oferta, com o link, a campanha e o sair da lista",
      JSON.stringify({ r: r30.corpo, assunto: e30?.subject })
    )
    const de30 = await rodar({ agora: aos(35 * MIN, true), email: NO_CHECKOUT })
    ok(de30.corpo.enviados === 0, "a rodada seguinte não manda o mesmo de novo")
    const r4h = await rodar({ agora: aos(4 * HORA + MIN), email: NO_CHECKOUT })
    const e4h = await caixa.esperarEmail(
      NO_CHECKOUT,
      (e) => e.subject === "Ficou alguma dúvida?",
      0
    )
    ok(
      r4h.corpo.enviados === 1 && Boolean(e4h),
      "4 horas: “Ficou alguma dúvida?”",
      JSON.stringify(r4h.corpo)
    )
    const r24 = await rodar({ agora: aos(DIA_MS + MIN), email: NO_CHECKOUT })
    const e24 = await caixa.esperarEmail(
      NO_CHECKOUT,
      (e) => /^\d+% pra você fechar o pedido$/.test(e.subject ?? ""),
      0
    )
    const cupom = e24?.html.match(/VOLTA-[2-9A-HJ-NP-Z]{6}/)?.[0] ?? null
    ok(
      r24.corpo.enviados === 1 &&
        r24.corpo.cupons === 1 &&
        Boolean(cupom) &&
        // O de desconto é oferta: o modelo da marca, com o cancelar inscrição no cabeçalho.
        Boolean(e24?.headers?.["List-Unsubscribe"]),
      "1 dia: o desconto, com um cupom só da pessoa",
      JSON.stringify({ r: r24.corpo, assunto: e24?.subject })
    )
    const linkDoCupom = e24?.html
      .match(/href="([^"]+\/voltar\/[^"]+)"/)?.[1]
      ?.replaceAll("&amp;", "&")
    ok(
      Boolean(linkDoCupom) && linkDoCupom.includes(`cupom=${cupom}`),
      "o botão leva o cupom junto",
      linkDoCupom ?? "sem link"
    )
    const pessoa2 = await novaAba({ width: 375, height: 812 })
    await pessoa2.pagina.goto(linkDoCupom ?? `${LOJA}/`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    })
    await pessoa2.pagina
      .waitForURL((u) => u.pathname === "/checkout", { timeout: 60000 })
      .catch(() => null)
    const cookieDoCarrinho = (await pessoa2.contexto.cookies(LOJA)).find(
      (c) => c.name === "carrinho"
    )
    ok(
      new URL(pessoa2.pagina.url()).pathname === "/checkout" &&
        cookieDoCarrinho?.value === carrinho.id &&
        new URL(pessoa2.pagina.url()).searchParams.get("utm_campaign") === "crm-checkout",
      "o link põe o carrinho de volta e cai no checkout, com a campanha",
      `${pessoa2.pagina.url()} · ${cookieDoCarrinho?.value}`
    )
    const cupomNoCarrinho = async (id, codigo = cupom) => {
      for (let i = 0; i < 40; i++) {
        const r = await fetch(`${MEDUSA}/store/carts/${id}?fields=*promotions`, {
          headers: DA_LOJA,
        })
        const codigos = ((await r.json()).cart?.promotions ?? []).map((p) => p.code)
        if (codigos.includes(codigo)) return true
        await esperar(500)
      }
      return false
    }
    ok(await cupomNoCarrinho(carrinho.id), "e o checkout aplica o cupom sozinho")
    await pessoa2.contexto.close()
    const r48 = await rodar({ agora: aos(2 * DIA_MS + MIN), email: NO_CHECKOUT })
    const e48 = await caixa.esperarEmail(
      NO_CHECKOUT,
      (e) => /vence em breve$/.test(e.subject ?? ""),
      0
    )
    ok(
      r48.corpo.enviados === 1 &&
        r48.corpo.cupons === 0 &&
        Boolean(cupom) &&
        e48?.html.includes(cupom),
      "2 dias: a última chamada, com o mesmo cupom (nenhum novo)",
      JSON.stringify({ r: r48.corpo, assunto: e48?.subject })
    )
    const r3d = await rodar({ agora: aos(3 * DIA_MS), email: NO_CHECKOUT })
    ok(
      r3d.corpo.enviados === 0 && caixa.quantos(NO_CHECKOUT, deFluxo) === 4,
      "depois do último, silêncio: 4 e-mails no total",
      String(caixa.quantos(NO_CHECKOUT, deFluxo))
    )

    titulo("Quem não recebe")
    const COMPROU = foraDoControle("comprou", "checkout")
    await criarCarrinho(COMPROU)
    await fabrica.pagar(await fabrica.pedidoPix(COMPROU, [["shampoo-para-barba", 1]]))
    const rComprou = await rodar({
      agora: new Date(Date.now() + 31 * MIN).toISOString(),
      email: COMPROU,
    })
    ok(
      rComprou.corpo.enviados === 0 &&
        caixa.quantos(COMPROU, (e) => /Faltou|Pix vence/.test(e.subject ?? "")) === 0,
      "quem comprou depois não recebe nada",
      JSON.stringify(rComprou.corpo)
    )
    const SAIU = foraDoControle("saiu", "checkout")
    await criarCarrinho(SAIU)
    await fetch(`${MEDUSA}/crm/sair?t=${linkPara(SAIU)}`, { method: "POST" })
    const rSaiu = await rodar({ agora: new Date(Date.now() + 31 * MIN).toISOString(), email: SAIU })
    ok(
      rSaiu.corpo.enviados === 0 && rSaiu.corpo.fora === 1,
      "quem saiu da lista (mesmo sem ter aceitado ofertas) não recebe",
      JSON.stringify(rSaiu.corpo)
    )
    const CONTROLE = noControleDo("controle", "checkout")
    await criarCarrinho(CONTROLE)
    const rControle = await rodar({
      agora: new Date(Date.now() + 31 * MIN).toISOString(),
      email: CONTROLE,
    })
    ok(
      rControle.corpo.enviados === 0 && rControle.corpo.controle === 1,
      "o grupo de controle fica anotado, sem receber",
      JSON.stringify(rControle.corpo)
    )
    await mudarFluxos({ fluxo: "checkout", ligado: false })
    const DESLIGADO = foraDoControle("desligado", "checkout")
    await criarCarrinho(DESLIGADO)
    const rDesligado = await rodar({
      agora: new Date(Date.now() + 31 * MIN).toISOString(),
      email: DESLIGADO,
    })
    await mudarFluxos({ fluxo: "checkout", ligado: true })
    const rReligado = await rodar({
      agora: new Date(Date.now() + 31 * MIN).toISOString(),
      email: DESLIGADO,
    })
    ok(
      rDesligado.corpo.enviados === 0 && rReligado.corpo.enviados === 0,
      "desligado não manda; ligar de novo não manda pro que começou antes",
      JSON.stringify([rDesligado.corpo, rReligado.corpo])
    )

    titulo("O Pix pendente")
    const tokenDoAdmin = (
      await (
        await fetch(`${MEDUSA}/auth/user/emailpass`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: process.env.ADMIN_EMAIL,
            password: process.env.ADMIN_SENHA,
          }),
        })
      ).json()
    ).token
    const pixDo = async (pedidoId) => {
      const { order } = await (
        await fetch(
          `${MEDUSA}/admin/orders/${pedidoId}?fields=payment_collections.payment_sessions.data`,
          { headers: { authorization: `Bearer ${tokenDoAdmin}` } }
        )
      ).json()
      return (order?.payment_collections ?? [])
        .flatMap((c) => c.payment_sessions ?? [])
        .map((s) => s.data?.pagarme?.pix)
        .find(Boolean)
    }
    const NO_PIX = foraDoControle("pix", "pix")
    const pedidoDoPix = await fabrica.pedidoPix(NO_PIX, [["shampoo-para-barba", 1]])
    const pix = await pixDo(pedidoDoPix.id)
    const vence = new Date(pix?.expiraEm ?? Date.now()).getTime()
    const rPix = await rodar({ agora: new Date(vence - 10 * MIN).toISOString(), email: NO_PIX })
    const ePix = await caixa.esperarEmail(
      NO_PIX,
      (e) => /^Seu Pix vence às \d\d:\d\d$/.test(e.subject ?? ""),
      0
    )
    ok(
      rPix.corpo.enviados === 1 &&
        Boolean(ePix) &&
        Boolean(pix?.copiaECola) &&
        ePix.html.includes(pix.copiaECola) &&
        ePix.html.includes(`#${pedidoDoPix.numero}`) &&
        ePix.tags?.some((t) => t.name === "tipo" && t.value === "crm-pix") &&
        // O aviso é de pedido: sem o pé de oferta nem o cabeçalho do cancelar inscrição.
        !ePix.html.includes("Sair da lista") &&
        !ePix.headers?.["List-Unsubscribe"] &&
        ePix.html.includes(
          `Você recebeu porque fez o pedido #${pedidoDoPix.numero} na FuckingBarba.`
        ),
      "15 minutos antes de vencer: o aviso, com o copia e cola e o número do pedido",
      JSON.stringify({ r: rPix.corpo, assunto: ePix?.subject })
    )
    const rDepoisDeVencer = await rodar({
      agora: new Date(vence + MIN).toISOString(),
      email: NO_PIX,
    })
    ok(rDepoisDeVencer.corpo.enviados === 0, "vencido, o aviso não sai mais")

    const VENCIDO = foraDoControle("vencido", "pix")
    const pedidoVencido = await fabrica.pedidoPix(VENCIDO, [["shampoo-para-barba", 2]], {
      validadeSegundos: -60,
    })
    await fabrica.cancelar(pedidoVencido)
    const eCancelado = await caixa.esperarEmail(
      VENCIDO,
      (e) => /cancelado/.test(e.subject ?? ""),
      0,
      30000
    )
    ok(
      Boolean(eCancelado) &&
        eCancelado.html.includes("Refazer o pedido") &&
        eCancelado.html.includes(`${LOJA}/voltar/${pedidoVencido.id}.`),
      "o e-mail do Pix que venceu: “Refazer o pedido”, em 1 clique",
      eCancelado?.subject ?? "não chegou"
    )
    const pixVencido = await pixDo(pedidoVencido.id)
    const comecoDoVencido = new Date(pixVencido?.expiraEm ?? Date.now()).getTime() - 15 * MIN
    const rPix24 = await rodar({
      agora: new Date(diurno(comecoDoVencido + DIA_MS + MIN)).toISOString(),
      email: VENCIDO,
    })
    const ePix24 = await caixa.esperarEmail(
      VENCIDO,
      (e) => /^\d+% pra você refazer o pedido$/.test(e.subject ?? ""),
      0
    )
    const cupomDoPix = ePix24?.html.match(/VOLTA-[2-9A-HJ-NP-Z]{6}/)?.[0] ?? null
    const linkDoPix = ePix24?.html
      .match(/href="([^"]+\/voltar\/order_[^"]+)"/)?.[1]
      ?.replaceAll("&amp;", "&")
    ok(
      rPix24.corpo.enviados === 1 && Boolean(cupomDoPix) && Boolean(linkDoPix),
      "1 dia depois do Pix vencido: o desconto, e o botão que refaz o pedido",
      JSON.stringify({ r: rPix24.corpo, assunto: ePix24?.subject })
    )
    const pessoa3 = await novaAba()
    await pessoa3.pagina.goto(linkDoPix ?? `${LOJA}/`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    })
    await pessoa3.pagina
      .waitForURL((u) => u.pathname === "/checkout", { timeout: 60000 })
      .catch(() => null)
    const refeito = (await pessoa3.contexto.cookies(LOJA)).find((c) => c.name === "carrinho")?.value
    const doRefeito = refeito
      ? (
          await (
            await fetch(`${MEDUSA}/store/carts/${refeito}?fields=email,*items`, {
              headers: DA_LOJA,
            })
          ).json()
        ).cart
      : null
    ok(
      Boolean(refeito) &&
        refeito !== pedidoVencido.carrinho &&
        doRefeito?.email === VENCIDO &&
        doRefeito?.items?.[0]?.quantity === 2,
      "o link monta um carrinho novo, com os mesmos produtos e o mesmo e-mail",
      JSON.stringify({ refeito, email: doRefeito?.email, itens: doRefeito?.items?.length })
    )
    ok(Boolean(refeito) && (await cupomNoCarrinho(refeito, cupomDoPix)), "com o desconto aplicado")
    await pessoa3.pagina.goto(linkDoPix ?? `${LOJA}/`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    })
    await pessoa3.pagina
      .waitForURL((u) => u.pathname === "/checkout", { timeout: 60000 })
      .catch(() => null)
    ok(
      (await pessoa3.contexto.cookies(LOJA)).find((c) => c.name === "carrinho")?.value === refeito,
      "clicar de novo abre o mesmo carrinho, sem refazer outro"
    )
    await pessoa3.contexto.close()
    const torto = await fetch(
      `${LOJA}/voltar/cart_01K6ABCDEFGHJKMNPQRSTVWXYZ.zz.AAAAAAAAAAAAAAAAAAAAAA`,
      {
        redirect: "manual",
      }
    )
    ok(
      torto.status === 302 && new URL(torto.headers.get("location") ?? "", LOJA).pathname === "/",
      "o link que não vale vai pra home, sem abrir nada",
      `${torto.status} ${torto.headers.get("location")}`
    )

    titulo("O carrinho abandonado")
    {
      /** Uma sacola sem e-mail, e o CRM dizendo de quem é: a loja manda o evento com a newsletter. */
      const sacolaDe = async (email) => {
        const { cart } = await (
          await fetch(`${MEDUSA}/store/carts`, {
            method: "POST",
            headers: { "content-type": "application/json", ...DA_LOJA },
            body: JSON.stringify({
              region_id: regiao.id,
              items: [{ variant_id: doShampoo[0].variants[0].id, quantity: 1 }],
            }),
          })
        ).json()
        const lote = await medusa("/store/crm/eventos", {
          extras: DA_LOJA,
          corpo: {
            visitante: randomUUID(),
            carrinho: cart.id,
            identificacao: { como: "newsletter", email },
            eventos: [
              {
                nome: "add_to_cart",
                pagina: "/produtos/shampoo-para-barba",
                dados: {
                  items: [
                    {
                      item_id: doShampoo[0].variants[0].id,
                      item_name: "Shampoo para Barba",
                      price: 49.9,
                      quantity: 1,
                    },
                  ],
                  value: 49.9,
                },
              },
            ],
          },
        })
        return { cart, anotado: lote.status === 204 }
      }
      const foraDosDois = (nome) => {
        for (let i = 0; ; i++) {
          const e = `${nome}${i}@${DOMINIO}`
          if (!controle(e, "carrinho") && !controle(e, "checkout")) return e
        }
      }
      const NA_SACOLA = foraDosDois("sacola")
      const { cart: sacola, anotado } = await sacolaDe(NA_SACOLA)
      ok(anotado && !sacola.email, "a sacola sem e-mail, e o CRM sabendo de quem é")
      const comecoDaSacola = new Date(sacola.updated_at).getTime()
      const naSacola = (ms) => new Date(diurno(comecoDaSacola + ms)).toISOString()
      const doCarrinho = (e) => e.tags?.some((t) => t.name === "tipo" && t.value === "crm-carrinho")
      // O "antes" vai na hora de verdade: empurrado pra manhã (perto das 22h), ele passaria da
      // 1 hora. De madrugada o motor também não manda nada, então a conta segue valendo.
      const antes1h = await rodar({
        agora: new Date(comecoDaSacola + 59 * MIN).toISOString(),
        email: NA_SACOLA,
      })
      const r1h = await rodar({ agora: naSacola(61 * MIN), email: NA_SACOLA })
      const e1h = await caixa.esperarEmail(
        NA_SACOLA,
        (e) => e.subject === "Sua compra ficou pela metade",
        0
      )
      ok(
        antes1h.corpo.enviados === 0 &&
          r1h.corpo.enviados === 1 &&
          Boolean(e1h) &&
          doCarrinho(e1h) &&
          e1h.html.includes(`${LOJA}/voltar/${sacola.id}.`) &&
          e1h.html.includes("utm_campaign=crm-carrinho") &&
          e1h.html.includes("Terminar a compra"),
        "1 hora: “Sua compra ficou pela metade”, com o link que volta pra sacola",
        JSON.stringify({ antes: antes1h.corpo, r: r1h.corpo, assunto: e1h?.subject })
      )
      const r12 = await rodar({ agora: naSacola(12 * HORA + MIN), email: NA_SACOLA })
      const e12 = await caixa.esperarEmail(
        NA_SACOLA,
        (e) => /^Sobre o .* que você escolheu$/.test(e.subject ?? ""),
        0
      )
      ok(
        r12.corpo.enviados === 1 && Boolean(e12),
        "12 horas: “Sobre o … que você escolheu”, com o que os clientes acharam",
        e12?.subject ?? JSON.stringify(r12.corpo)
      )
      const agora24 = naSacola(DIA_MS + MIN)
      const r24 = await rodar({ agora: agora24, email: NA_SACOLA })
      const e24c = await caixa.esperarEmail(
        NA_SACOLA,
        (e) => /^\d+% pra você decidir$/.test(e.subject ?? ""),
        0
      )
      const cupomDaSacola = e24c?.html.match(/VOLTA-[2-9A-HJ-NP-Z]{6}/)?.[0] ?? null
      // O cupom do carrinho vale 3 dias (o de 3 dias diz que ele vence amanhã).
      const vence3 = new Date(new Date(agora24).getTime() + 3 * DIA_MS)
      const naHoraDeBrasilia = (d, o) =>
        new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...o }).format(d)
      const venceEm = `${naHoraDeBrasilia(vence3, { day: "2-digit", month: "2-digit" })}, ${naHoraDeBrasilia(vence3, { hour: "2-digit", minute: "2-digit" })}`
      ok(
        r24.corpo.enviados === 1 &&
          r24.corpo.cupons === 1 &&
          Boolean(cupomDaSacola) &&
          e24c.html.includes(`Vale até ${venceEm}`),
        "1 dia: o desconto, com um cupom que vale 3 dias",
        JSON.stringify({ r: r24.corpo, assunto: e24c?.subject, venceEm })
      )
      const pessoa4 = await novaAba({ width: 375, height: 812 })
      const linkDaSacola = e24c?.html
        .match(/href="([^"]+\/voltar\/cart_[^"]+)"/)?.[1]
        ?.replaceAll("&amp;", "&")
      await pessoa4.pagina.goto(linkDaSacola ?? `${LOJA}/`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      })
      await pessoa4.pagina
        .waitForURL((u) => u.pathname === "/checkout", { timeout: 60000 })
        .catch(() => null)
      ok(
        (await pessoa4.contexto.cookies(LOJA)).find((c) => c.name === "carrinho")?.value ===
          sacola.id && (await cupomNoCarrinho(sacola.id, cupomDaSacola)),
        "o link devolve a sacola, com o desconto aplicado"
      )
      await pessoa4.contexto.close()
      const r3d = await rodar({ agora: naSacola(3 * DIA_MS + MIN), email: NA_SACOLA })
      const e3d = await caixa.esperarEmail(
        NA_SACOLA,
        (e) => /vence amanhã$/.test(e.subject ?? ""),
        0
      )
      const r5d = await rodar({ agora: naSacola(5 * DIA_MS + MIN), email: NA_SACOLA })
      const e5d = await caixa.esperarEmail(
        NA_SACOLA,
        (e) => e.subject === "O último lembrete da sua compra",
        0
      )
      ok(
        r3d.corpo.enviados === 1 &&
          Boolean(cupomDaSacola) &&
          Boolean(e3d?.html.includes(cupomDaSacola)) &&
          r5d.corpo.enviados === 1 &&
          Boolean(e5d) &&
          !e5d.html.includes("VOLTA-") &&
          caixa.quantos(NA_SACOLA, doCarrinho) === 5,
        "3 dias: o desconto vence amanhã; 5 dias: a última, sem cupom — 5 e-mails no total",
        JSON.stringify({
          r3d: r3d.corpo,
          r5d: r5d.corpo,
          total: caixa.quantos(NA_SACOLA, doCarrinho),
        })
      )
      const PAROU = foraDosDois("parou")
      await sacolaDe(PAROU)
      await criarCarrinho(PAROU)
      const rParou = await rodar({
        agora: new Date(Date.now() + 61 * MIN).toISOString(),
        email: PAROU,
      })
      await caixa.esperarEmail(PAROU, (e) => e.subject === "Faltou só o pagamento", 0)
      ok(
        caixa.quantos(PAROU, doCarrinho) === 0 &&
          caixa.quantos(PAROU, (e) => e.subject === "Faltou só o pagamento") === 1,
        "abriu o checkout depois: a sacola para, e quem cuida é o fluxo do checkout",
        JSON.stringify(rParou.corpo)
      )
    }

    {
      titulo("As boas-vindas do pop-up: a trilha de cada um")
      // Sem controle nas boas-vindas: qualquer e-mail da rodada serve.
      const doPopup = (e) =>
        e.tags?.some((t) => t.name === "tipo" && t.value === "crm-boas-vindas") &&
        !/^\[Teste\]/.test(e.subject ?? "")
      const cadastrar = (email, pagina) =>
        medusa("/store/crm/primeira-compra", {
          corpo: { nome: "Rafael Teste", email, ...(pagina ? { pagina } : {}) },
          extras: DA_LOJA,
        })
      const CUIDA = `cuida.bv@${DOMINIO}`
      const GERAL = `geral.bv@${DOMINIO}`
      const cad1 = await cadastrar(CUIDA, "/produtos/oleo-para-barba")
      const cad2 = await cadastrar(GERAL, null)
      const comecoBv = Date.now()
      const naBv = (ms) => new Date(diurno(comecoBv + ms)).toISOString()
      const cupomDoPopup = cad1.corpo.codigo
      // O "antes" na hora de verdade: empurrado pra manhã, ele passaria de 1 dia (a lição da 0176).
      const antes1 = await rodar({
        agora: new Date(comecoBv + 23 * HORA).toISOString(),
        email: CUIDA,
      })
      const r1 = await rodar({ agora: naBv(DIA_MS + MIN), email: CUIDA })
      const e1 = await caixa.esperarEmail(
        CUIDA,
        (e) => doPopup(e) && e.subject === "A rotina da barba em 3 passos",
        0
      )
      ok(
        cad1.corpo.tipo === "ok" &&
          cad2.corpo.tipo === "ok" &&
          antes1.corpo.enviados === 0 &&
          r1.corpo.enviados === 1 &&
          Boolean(e1) &&
          /^Matheus, da FuckingBarba </.test(e1.from ?? "") &&
          !e1.headers?.["List-Unsubscribe"],
        "1 dia: quem se cadastrou no óleo recebe a rotina da barba, como lembrete",
        JSON.stringify({ cad1: cad1.corpo.tipo, antes: antes1.corpo, r: r1.corpo })
      )
      await rodar({ agora: naBv(2 * DIA_MS + MIN), email: CUIDA })
      const e2 = await caixa.esperarEmail(
        CUIDA,
        (e) => doPopup(e) && /vence amanhã$/.test(e.subject ?? ""),
        0
      )
      ok(
        Boolean(e2?.html.includes(cupomDoPopup)) && Boolean(e2?.headers?.["List-Unsubscribe"]),
        "2 dias: o cupom do pop-up vence amanhã, como oferta",
        e2?.subject ?? "não chegou"
      )
      await rodar({ agora: naBv(5 * DIA_MS + MIN), email: CUIDA })
      await rodar({ agora: naBv(7 * DIA_MS + MIN), email: CUIDA })
      await rodar({ agora: naBv(10 * DIA_MS + MIN), email: CUIDA })
      await caixa.esperarEmail(
        CUIDA,
        (e) => doPopup(e) && e.subject === "A rotina completa num kit só",
        0
      )
      const assuntos = resend.emails
        .filter((e) => e.to?.includes(CUIDA) && doPopup(e))
        .map((e) => e.subject)
      ok(
        assuntos.some((a) => /^(Óleo ou balm|Como usar o óleo)/.test(a)) &&
          assuntos.includes("As perguntas que todo mundo faz sobre o óleo") &&
          assuntos.includes("A rotina completa num kit só") &&
          caixa.quantos(CUIDA, doPopup) === 6,
        "5, 7 e 10 dias: o óleo ou o balm, as dúvidas do óleo e o kit — 6 e-mails com o do cupom",
        JSON.stringify(assuntos)
      )

      // Quem não viu produto: o "Barba ou cabelo?", e a escolha muda a trilha.
      await rodar({ agora: naBv(DIA_MS + MIN), email: GERAL })
      const eg = await caixa.esperarEmail(
        GERAL,
        (e) => doPopup(e) && e.subject === "Barba ou cabelo?",
        0
      )
      const links = [...(eg?.html ?? "").matchAll(/href="([^"]+\/crm\/escolha\?t=[^"]+)"/g)].map(
        (m) => m[1].replaceAll("&amp;", "&")
      )
      const clique = links[1]
        ? await fetch(links[1], { redirect: "manual" }).catch(() => null)
        : null
      await rodar({ agora: naBv(5 * DIA_MS + MIN), email: GERAL })
      const eg5 = await caixa.esperarEmail(
        GERAL,
        (e) => doPopup(e) && /^(Óleo ou balm|Como usar)/.test(e.subject ?? ""),
        0
      )
      ok(
        links.length === 3 &&
          clique?.status === 303 &&
          (clique.headers.get("location") ?? "").includes("/para-barba?utm_source=loja") &&
          Boolean(eg5),
        "sem produto: “Barba ou cabelo?” com 3 botões; “Cuidar da barba” leva pra loja e a trilha vira a do cuidado",
        JSON.stringify({ links: links.length, clique: clique?.status, cinco: eg5?.subject })
      )
    }

    {
      titulo("A estreia: a loja nova pra base da Nuvemshop")
      const daEstreia = (e) =>
        e.tags?.some((t) => t.name === "tipo" && t.value === "crm-estreia") && deFluxo(e)
      // Um de cada jeito, fora do grupo de controle da estreia (ela tem controle).
      const REPOR = foraDoControle("repor.es", "estreia")
      const KIT = foraDoControle("kit.es", "estreia")
      const TRATA = foraDoControle("trata.es", "estreia")
      const SUMIU = foraDoControle("sumiu.es", "estreia")
      const NUNCA = foraDoControle("nunca.es", "estreia")
      const NAO_ACEITA = `naoaceita.es@${DOMINIO}`
      const publico = async () =>
        (await fluxos(tokenDoDono)).corpo.fluxos?.find((f) => f.id === "estreia")
      const antes = await publico()
      const pessoa = (nome, email, aceita) =>
        `${nome};${CPF_FALSO};${email};+55${TELEFONE_FALSO};Rua da Rodada, 99;Blumenau;${cadastro};NÃO;NÃO;${aceita ? "Aceita" : "Não aceita"};${cadastro}`
      const importou = await Promise.all([
        medusa("/dashboard/crm/base", {
          token: tokenDoDono,
          corpo: doArquivo(
            latin1([
              "Nome completo;CPF/CNPJ;E-mail;Telefone de Contato;Endereço;Cidade;Data;Cadastrado;Inscrição para newsletter;Marketing;Marketing (atualização)",
              pessoa("REPOR TESTE", REPOR, true),
              pessoa("KIT TESTE", KIT, true),
              pessoa("TRATA TESTE", TRATA, true),
              pessoa("SUMIU TESTE", SUMIU, true),
              pessoa("NUNCA TESTE", NUNCA, true),
              pessoa("NAO TESTE", NAO_ACEITA, false),
            ])
          ),
        }),
        medusa("/dashboard/crm/base", {
          token: tokenDoDono,
          corpo: doArquivo(
            latin1([
              cabecalhoDasVendas,
              // O Fator pago há 30 dias: entregue no 7º, acaba daqui a uma semana.
              venda(
                `E${RODADA}-1`,
                REPOR,
                agora - 30 * DIA_MS,
                "FBFCB01",
                "Fator de Crescimento para Barba 30ml"
              ),
              // O Kit Completo pago há 40 dias: o shampoo (45 dias no padrão) acaba em 12.
              venda(
                `E${RODADA}-5`,
                KIT,
                agora - 40 * DIA_MS,
                "FBKIT01",
                "Kit Completo FuckingBarba"
              ),
              // O óleo pago há 5 dias: no meio do tratamento.
              venda(`E${RODADA}-2`, TRATA, agora - 5 * DIA_MS, "FBOL01", "Óleo para Barba 30ml"),
              // O balm pago há 200 dias: sumiu.
              venda(`E${RODADA}-3`, SUMIU, agora - 200 * DIA_MS, "FBBM01", "Balm para Barba"),
              venda(
                `E${RODADA}-4`,
                NAO_ACEITA,
                agora - 30 * DIA_MS,
                "FBFCB01",
                "Fator de Crescimento para Barba 30ml"
              ),
            ])
          ),
        }),
      ])
      const depois = await publico()
      const rDesligada = await rodar({
        agora: new Date(Date.now() + MIN).toISOString(),
        email: REPOR,
      })
      const cresceu = (k) => depois?.publico?.[k] - antes?.publico?.[k]
      ok(
        importou.every((r) => r.status === 200) &&
          depois?.ligado === false &&
          depois.toques.map((t) => t.id).join() === "estreia-agora,estreia-2d" &&
          cresceu("repor") === 2 &&
          ["cliente", "sumido", "lead"].every((k) => cresceu(k) === 1) &&
          cresceu("pessoas") === 5 &&
          depois.publico.jaCompraram >= 1 &&
          rDesligada.corpo.enviados === 0 &&
          caixa.quantos(REPOR, daEstreia) === 0,
        "a estreia começa desligada: um a mais em cada jeito (quem não aceita e quem já comprou na loja nova, fora), e nada sai",
        JSON.stringify({ antes: antes?.publico, depois: depois?.publico, r: rDesligada.corpo })
      )

      await mudarFluxos({ fluxo: "estreia", ligado: true })
      const ligou = Date.now()
      try {
        /** O começo do lote, como `comecoDoLote` do backend: o 1º na hora, os outros às 10h de Brasília. */
        const comecoDoLote = (lote) => {
          if (lote <= 0) return ligou
          const b = new Date(ligou - 3 * HORA)
          const primeiroDia = b.getUTCHours() >= 22 ? 1 : 0
          return (
            Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + primeiroDia + lote, 10) +
            3 * HORA
          )
        }
        /** Roda o motor nos 4 lotes até o e-mail chegar: a pessoa só recebe no lote dela. */
        const noLote = async (email, filtro, depoisDoLote = 0) => {
          for (let lote = 0; lote < 4; lote++) {
            const quando = diurno(comecoDoLote(lote) + depoisDoLote + 2 * MIN)
            await rodar({ agora: new Date(quando).toISOString(), email })
            if (caixa.quantos(email, filtro) > 0) return lote
          }
          return null
        }
        const lotes = {}
        const primeiro = {}
        for (const email of [REPOR, KIT, TRATA, SUMIU, NUNCA, NAO_ACEITA]) {
          lotes[email] = await noLote(email, daEstreia)
          primeiro[email] = resend.emails.find((e) => e.to?.includes(email) && daEstreia(e))
        }
        const codigo = (e) => e?.html.match(/(VOLTA|BEMVINDO)-[2-9A-HJ-NP-Z]{6}/)?.[0] ?? null
        ok(
          primeiro[REPOR]?.subject === "Seu Fator de Crescimento deve estar acabando" &&
            primeiro[REPOR].html.includes("/produtos/fator-de-crescimento-para-barba?") &&
            !codigo(primeiro[REPOR]) &&
            // Sem desconto: a cara do lembrete, assinado, sem o "cancelar inscrição" do cabeçalho.
            /^Matheus, da FuckingBarba </.test(primeiro[REPOR].from ?? "") &&
            !primeiro[REPOR].headers?.["List-Unsubscribe"] &&
            !primeiro[REPOR].html.includes("Frete grátis"),
          "na hora de repor: o Fator está acabando, como lembrete, sem cupom, e o botão leva pra ele",
          `${primeiro[REPOR]?.subject ?? "não chegou"} · ${primeiro[REPOR]?.from ?? ""}`
        )
        ok(
          primeiro[KIT]?.subject === "Seu shampoo deve estar acabando" &&
            primeiro[KIT].html.includes("/produtos/shampoo-para-barba?") &&
            primeiro[KIT].html.includes("Ver o shampoo") &&
            primeiro[KIT].html.includes("Kit Completo"),
          "quem comprou o Kit Completo: o que acaba primeiro no assunto, o botão no avulso dele e o kit na lista",
          primeiro[KIT]?.subject ?? "não chegou"
        )
        ok(
          primeiro[TRATA]?.subject === "A FuckingBarba tem loja nova" &&
            primeiro[TRATA].html.includes("O que tem na loja nova") &&
            !codigo(primeiro[TRATA]),
          "no meio do tratamento: a loja nova, sem cupom",
          primeiro[TRATA]?.subject ?? "não chegou"
        )
        ok(
          primeiro[SUMIU]?.subject === "Loja nova, e 10% pra você voltar" &&
            /^VOLTA-/.test(codigo(primeiro[SUMIU]) ?? "") &&
            Boolean(primeiro[SUMIU].headers?.["List-Unsubscribe"]),
          "quem sumiu: a loja nova e um cupom VOLTA- de 10%, como oferta",
          primeiro[SUMIU]?.subject ?? "não chegou"
        )
        ok(
          primeiro[NUNCA]?.subject === "Loja nova, e 10% na sua primeira compra" &&
            /^BEMVINDO-/.test(codigo(primeiro[NUNCA]) ?? "") &&
            primeiro[NUNCA].html.includes("Os mais pedidos"),
          "quem nunca comprou: o cupom da 1ª compra e os mais pedidos",
          primeiro[NUNCA]?.subject ?? "não chegou"
        )
        ok(
          lotes[NAO_ACEITA] === null &&
            caixa.quantos(NAO_ACEITA, daEstreia) === 0 &&
            lotes[REPOR] <= lotes[TRATA] &&
            lotes[TRATA] <= lotes[SUMIU] &&
            lotes[SUMIU] <= lotes[NUNCA],
          "quem não aceitou ofertas não recebe; e a fila põe quem vai repor antes de quem nunca comprou",
          JSON.stringify(lotes)
        )
        // Os cupons valem de verdade: cada um entra numa sacola nova. A sacola é de OUTRO e-mail:
        // com o da pessoa, ela viraria checkout abandonado, e esse fluxo passa na frente da estreia.
        const aplica = async (cupom) => {
          if (!cupom) return false
          const sacola = await criarCarrinho(`sacola.es@${DOMINIO}`)
          const r = await fetch(`${MEDUSA}/store/carts/${sacola.id}/promotions`, {
            method: "POST",
            headers: { "content-type": "application/json", ...DA_LOJA },
            body: JSON.stringify({ promo_codes: [cupom] }),
          })
          return ((await r.json()).cart?.promotions ?? []).some((p) => p.code === cupom)
        }
        const aplicou = [
          await aplica(codigo(primeiro[SUMIU])),
          await aplica(codigo(primeiro[NUNCA])),
        ]
        ok(aplicou.every(Boolean), "os dois cupons entram na sacola", JSON.stringify(aplicou))

        // 2 dias depois do lote de cada um: o "vence amanhã", só de quem ganhou cupom.
        const venceAmanha = (e) => daEstreia(e) && /vence amanhã$/.test(e.subject ?? "")
        for (const email of [REPOR, TRATA, SUMIU, NUNCA])
          await noLote(email, venceAmanha, 2 * DIA_MS)
        const doSumiu = resend.emails.find((e) => e.to?.includes(SUMIU) && venceAmanha(e))
        ok(
          Boolean(doSumiu?.html.includes(codigo(primeiro[SUMIU]))) &&
            caixa.quantos(NUNCA, venceAmanha) === 1 &&
            caixa.quantos(REPOR, venceAmanha) === 0 &&
            caixa.quantos(TRATA, venceAmanha) === 0 &&
            [REPOR, TRATA, SUMIU, NUNCA].every(
              (e) => caixa.quantos(e, daEstreia) === (e === REPOR || e === TRATA ? 1 : 2)
            ),
          "2 dias depois: o cupom vence amanhã, pra quem sumiu e quem nunca comprou — e nada mais",
          JSON.stringify(
            [REPOR, TRATA, SUMIU, NUNCA].map((e) =>
              resend.emails.filter((x) => x.to?.includes(e) && daEstreia(x)).map((x) => x.subject)
            )
          )
        )
      } finally {
        // O banco local é de todos: a estreia volta a desligada, mesmo se algo acima caiu.
        await mudarFluxos({ fluxo: "estreia", ligado: false })
      }
    }

    {
      titulo("A reposição: o aviso de quando o produto acaba")
      const daReposicao = (e) =>
        e.tags?.some((t) => t.name === "tipo" && t.value === "crm-reposicao") && deFluxo(e)
      const linkDeRepor = (e) =>
        (e?.html.match(/href="([^"]+\/voltar\/repor-[^"]+)"/)?.[1] ?? "").replaceAll("&amp;", "&")
      /** Clica no "Refazer o pedido": o redirecionamento, e a sacola que o cookie aponta. */
      const refazer = async (e) => {
        const r = await fetch(linkDeRepor(e), { redirect: "manual" })
        const id = (r.headers.get("set-cookie") ?? "").match(/carrinho=(cart_[0-9A-Z]{26})/)?.[1]
        const sacola = id
          ? (
              await (
                await fetch(`${MEDUSA}/store/carts/${id}?fields=email,*items,*shipping_address`, {
                  headers: DA_LOJA,
                })
              ).json()
            ).cart
          : null
        return {
          status: r.status,
          para: new URL(r.headers.get("location") ?? "/", LOJA).pathname,
          sacola,
        }
      }
      // Da loja antiga, e SEM ter aceitado ofertas lá: a reposição vai pra todo cliente.
      const DA_NUVEM = foraDoControle("repoe.nuvem", "reposicao")
      const DA_LOJA_NOVA = foraDoControle("repoe.loja", "reposicao")
      const importou = await Promise.all([
        medusa("/dashboard/crm/base", {
          token: tokenDoDono,
          corpo: doArquivo(
            latin1([
              "Nome completo;CPF/CNPJ;E-mail;Telefone de Contato;Endereço;Cidade;Data;Cadastrado;Inscrição para newsletter;Marketing;Marketing (atualização)",
              `REPOE TESTE;${CPF_FALSO};${DA_NUVEM};+55${TELEFONE_FALSO};Rua da Rodada, 99;Blumenau;${cadastro};NÃO;NÃO;Não aceita;${cadastro}`,
            ])
          ),
        }),
        medusa("/dashboard/crm/base", {
          token: tokenDoDono,
          corpo: doArquivo(
            latin1([
              cabecalhoDasVendas,
              // O Fator pago há 20 dias: entregue no 7º, dura 30 — acaba daqui a 17.
              venda(
                `R${RODADA}-1`,
                DA_NUVEM,
                agora - 20 * DIA_MS,
                "FBFCB01",
                "Fator de Crescimento para Barba 30ml"
              ),
            ])
          ),
        }),
      ])
      // Da loja nova: um shampoo pago agora (entregue no 7º, dura 45 — acaba em 52 dias).
      const daLojaNova = await fabrica.pedidoPix(DA_LOJA_NOVA, [["shampoo-para-barba", 1]])
      await fabrica.pagar(daLojaNova)
      const pagouEm = Date.now()
      await mudarFluxos({ fluxo: "reposicao", ligado: true })
      try {
        // A data de pagamento da Nuvemshop vem sem hora: vale o meio-dia de Brasília daquele dia
        // (`dataDeBrasilia`, em `lib/crm/nuvemshop.ts`).
        const b = new Date(agora - 20 * DIA_MS - 3 * HORA)
        const pagoNaNuvem =
          Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) + 15 * HORA
        const acaba = pagoNaNuvem + 37 * DIA_MS
        const aos = (ms) => new Date(diurno(ms)).toISOString()
        const antes = await rodar({ agora: aos(acaba - 8 * DIA_MS), email: DA_NUVEM })
        await rodar({ agora: aos(acaba - 7 * DIA_MS + 2 * MIN), email: DA_NUVEM })
        const e7 = resend.emails.find((e) => e.to?.includes(DA_NUVEM) && daReposicao(e))
        ok(
          importou.every((r) => r.status === 200) &&
            antes.corpo.enviados === 0 &&
            e7?.subject === "Seu Fator de Crescimento acaba em uma semana" &&
            /^Matheus, da FuckingBarba </.test(e7.from ?? "") &&
            !e7.headers?.["List-Unsubscribe"] &&
            linkDeRepor(e7).includes("/voltar/repor-nso_"),
          "7 dias antes: o Fator da loja antiga acaba em uma semana, como lembrete — e vai mesmo sem o sim às ofertas",
          e7?.subject ?? "não chegou"
        )
        const nuvem = await refazer(e7)
        ok(
          nuvem.status === 302 &&
            nuvem.para === "/checkout" &&
            nuvem.sacola?.email === DA_NUVEM &&
            nuvem.sacola.items?.some((i) => i.variant_sku === "FBFCB01"),
          "o Refazer o pedido da loja antiga monta a sacola com o Fator, pelo SKU, e cai no checkout",
          JSON.stringify({ ...nuvem, sacola: nuvem.sacola?.items?.map((i) => i.variant_sku) })
        )
        for (const d of [-2, 3, 10])
          await rodar({ agora: aos(acaba + d * DIA_MS + 2 * MIN), email: DA_NUVEM })
        const assuntos = resend.emails
          .filter((e) => e.to?.includes(DA_NUVEM) && daReposicao(e))
          .map((e) => e.subject)
        ok(
          JSON.stringify(assuntos) ===
            JSON.stringify([
              "Seu Fator de Crescimento acaba em uma semana",
              "Não deixa o Fator de Crescimento acabar",
              "Acabou o Fator de Crescimento?",
              "O último lembrete do Fator de Crescimento",
            ]),
          "2 dias antes, 3 e 10 dias depois: os 4 lembretes, e nada mais",
          JSON.stringify(assuntos)
        )
        await rodar({ agora: aos(pagouEm + 45 * DIA_MS + 30 * MIN), email: DA_LOJA_NOVA })
        const eLoja = resend.emails.find((e) => e.to?.includes(DA_LOJA_NOVA) && daReposicao(e))
        const loja = await refazer(eLoja)
        ok(
          eLoja?.subject === "Seu shampoo acaba em uma semana" &&
            linkDeRepor(eLoja).includes("/voltar/repor-order_") &&
            loja.para === "/checkout" &&
            loja.sacola?.items?.some((i) => i.variant_sku === "FBSH01") &&
            Boolean(loja.sacola?.shipping_address?.address_1),
          "da loja nova: o shampoo acaba em uma semana, e a sacola vem com o endereço da última compra",
          JSON.stringify({
            assunto: eLoja?.subject ?? "não chegou",
            para: loja.para,
            itens: loja.sacola?.items?.map((i) => i.variant_sku),
          })
        )
      } finally {
        // O banco local é de todos: a reposição volta a desligada, mesmo se algo acima caiu.
        await mudarFluxos({ fluxo: "reposicao", ligado: false })
      }

      titulo("A ficha no site: na conta, na home e na página do produto (0188 e 0190)")
      // O Fator da loja antiga pago há 32 dias: entregue no 7º, dura 30 — acaba daqui a 5 dias, e
      // hoje é o dia 26 do tratamento (no calendário de Brasília: a data sem hora da Nuvemshop
      // vale o meio-dia). O fluxo segue DESLIGADO: a ficha do site não é e-mail, e não depende dele.
      const NO_SITE = foraDoControle("repoe.site", "reposicao")
      const vendaEm = Date.now() - 32 * DIA_MS
      /** O dia em Brasília (UTC−3, sem horário de verão), pra contar como a loja conta. */
      const diaBR = (ms) => Math.floor((ms - 3 * HORA) / DIA_MS)
      const comprouHa = diaBR(Date.now()) - diaBR(vendaEm)
      const TITULO = `Seu Fator de Crescimento acaba em ${diaBR(vendaEm) + 37 - diaBR(Date.now())} dias`
      const DIA_DO_TRATAMENTO = comprouHa - 7 + 1
      const subiu = await medusa("/dashboard/crm/base", {
        token: tokenDoDono,
        corpo: doArquivo(
          latin1([
            cabecalhoDasVendas,
            venda(
              `R${RODADA}-S`,
              NO_SITE,
              vendaEm,
              "FBFCB01",
              "Fator de Crescimento para Barba 30ml"
            ),
          ])
        ),
      })
      const semToken = await fetch(`${MEDUSA}/store/crm/ficha`, { headers: DA_LOJA })
      ok(
        subiu.status === 200 && semToken.status === 401,
        "a ficha é só de quem está na conta: sem o token do cliente, o Medusa responde 401",
        `${subiu.status} · ${semToken.status}`
      )
      const forjado = await fetch(`${LOJA}/api/ficha`, {
        headers: { cookie: "fb_conta=0123456789abcdef" },
      })
      ok(
        forjado.status === 200 &&
          (await forjado.json()).ficha === null &&
          /(^|, )fb_conta=;/.test(forjado.headers.get("set-cookie") ?? ""),
        "o fb_conta sem sessão (inventado, ou de quem a sessão venceu): nada, e a loja apaga ele",
        forjado.headers.get("set-cookie") ?? "sem set-cookie"
      )

      const { contexto, pagina, pedidos } = await naLoja("/")
      try {
        await responderAFaixa(pagina, "Só o necessário")
        await esperar(2500)
        const semAvisoNaHome = (await pagina.locator("[data-aviso-reposicao]").count()) === 0
        await pagina.goto(`${LOJA}/produtos/fator-de-crescimento-para-barba`, {
          waitUntil: "domcontentloaded",
        })
        await esperar(2500)
        ok(
          !pedidos.some((p) => p.includes("/api/ficha")) &&
            semAvisoNaHome &&
            (await pagina.locator("[data-ficha-na-foto]").count()) === 0,
          "sem a conta aberta, a home e a página do produto não perguntam nada nem mostram nada",
          pedidos.filter((p) => p.includes("/api/")).join(" · ")
        )

        const entrou = await entrarNaLoja(pagina, NO_SITE)
        const marca = await cookieDe(contexto, "fb_conta")
        ok(
          entrou && /^[0-9a-f]{16}$/.test(marca?.value ?? "") && marca?.httpOnly === false,
          "entrou na conta: o fb_conta, que o navegador lê, só com um sorteio (nada de quem é)",
          JSON.stringify(marca)
        )

        await pagina.goto(`${LOJA}/conta`, { waitUntil: "domcontentloaded" })
        // A página ainda chegando tem o bloco duas vezes (a parte escondida do streaming): a visível.
        const naConta = pagina.locator("[data-bloco-reposicao]").filter({ visible: true })
        await naConta.waitFor({ timeout: 20000 }).catch(() => null)
        const textoDaConta = (await naConta.textContent().catch(() => "")) ?? ""
        const hrefDaConta =
          (await naConta
            .locator("a", { hasText: "Refazer o pedido" })
            .getAttribute("href")
            .catch(() => null)) ?? ""
        ok(
          textoDaConta.includes("Pra repor") &&
            textoDaConta.includes(TITULO) &&
            textoDaConta.includes("Pelas nossas contas") &&
            /^\/voltar\/repor-nso_/.test(hrefDaConta),
          "na conta: “Pra repor” — o Fator da loja antiga acaba em 5 dias, com o Refazer o pedido",
          textoDaConta.slice(0, 200) ||
            `${pagina.url()} · a loja diz: ${await pagina
              .evaluate(async () => JSON.stringify(await (await fetch("/api/ficha")).json()))
              .catch((e) => e.message)}`
        )
        const doTratamento = pagina.locator("[data-bloco-tratamento]").filter({ visible: true })
        await doTratamento.waitFor({ timeout: 20000 }).catch(() => null)
        const textoDoTratamento = (
          (await doTratamento.textContent().catch(() => "")) ?? ""
        ).replace(/\s+/g, " ")
        const linhaDoTempo = await doTratamento
          .locator("a")
          .getAttribute("href")
          .catch(() => null)
        ok(
          textoDoTratamento.includes(`Dia ${DIA_DO_TRATAMENTO} do seu tratamento`) &&
            textoDoTratamento.includes(`${DIA_DO_TRATAMENTO} de 90 dias`) &&
            /^\/produtos\/fator-de-crescimento-para-barba(#tempo-titulo)?$/.test(
              linhaDoTempo ?? ""
            ),
          `na conta: “Seu tratamento” — dia ${DIA_DO_TRATAMENTO} de 90, com o link da linha do tempo do Fator`,
          `${textoDoTratamento.slice(0, 200)} · ${linhaDoTempo}`
        )
        const refeito = hrefDaConta
          ? await refazer({ html: `href="${LOJA}${hrefDaConta}"` })
          : { status: 0, para: "", sacola: null }
        ok(
          refeito.status === 302 &&
            refeito.para === "/checkout" &&
            refeito.sacola?.email === NO_SITE &&
            refeito.sacola.items?.some((i) => i.variant_sku === "FBFCB01"),
          "o Refazer o pedido do site é o dos e-mails: a sacola com o Fator, no checkout",
          JSON.stringify({ ...refeito, sacola: refeito.sacola?.items?.map((i) => i.variant_sku) })
        )

        await pagina.goto(`${LOJA}/`, { waitUntil: "domcontentloaded" })
        const naHome = pagina.locator("[data-aviso-reposicao]").filter({ visible: true })
        await naHome.waitFor({ timeout: 20000 }).catch(() => null)
        const textoDaHome = (await naHome.textContent().catch(() => "")) ?? ""
        const hrefDaHome =
          (await naHome
            .locator("a", { hasText: "Refazer o pedido" })
            .getAttribute("href")
            .catch(() => null)) ?? ""
        const fixo = await naHome.evaluate((el) => getComputedStyle(el).position).catch(() => "")
        ok(
          textoDaHome.includes(TITULO) &&
            /^\/voltar\/repor-nso_/.test(hrefDaHome) &&
            fixo === "fixed" &&
            pedidos.filter((p) => p.includes("/api/ficha")).length === 1,
          "na home: o aviso sobe num canto (fixo, não empurra a página), com o Refazer o pedido",
          `${textoDaHome} · ${fixo}`
        )

        // A resposta fica na aba: voltar à home não pergunta de novo.
        await pagina.reload({ waitUntil: "domcontentloaded" })
        await naHome.waitFor({ timeout: 20000 }).catch(() => null)
        ok(
          (await naHome.count()) === 1 &&
            pedidos.filter((p) => p.includes("/api/ficha")).length === 1,
          "a resposta fica na aba: voltando à home, o aviso vem sem perguntar de novo",
          String(pedidos.filter((p) => p.includes("/api/ficha")).length)
        )

        await hidratado(pagina, "[data-aviso-reposicao] .rp-fechar")
        await naHome.locator(".rp-fechar").click()
        await naHome.waitFor({ state: "detached", timeout: 5000 }).catch(() => null)
        const fechou = (await naHome.count()) === 0
        await pagina.reload({ waitUntil: "domcontentloaded" })
        await esperar(3000)
        ok(
          fechou && (await naHome.count()) === 0,
          "o X fecha o aviso, e ele não volta na próxima visita (até a próxima reposição)"
        )

        // Na página de cada produto, em cima da foto: o que ela comprou, e o que combina com isso.
        const naFoto = pagina.locator("[data-ficha-na-foto]").filter({ visible: true })
        const daFoto = async (handle) => {
          await pagina.goto(`${LOJA}/produtos/${handle}`, { waitUntil: "domcontentloaded" })
          await naFoto.waitFor({ timeout: 20000 }).catch(() => null)
          return {
            texto: ((await naFoto.textContent().catch(() => "")) ?? "").trim(),
            tipo: await naFoto.getAttribute("data-ficha-na-foto").catch(() => null),
            posicao: await naFoto.evaluate((el) => getComputedStyle(el).position).catch(() => ""),
          }
        }
        const noFator = await daFoto("fator-de-crescimento-para-barba")
        ok(
          noFator.texto === `Você comprou há ${comprouHa} dias` &&
            noFator.tipo === "comprou" &&
            noFator.posicao === "absolute",
          `na página do Fator: “Você comprou há ${comprouHa} dias”, em cima da foto (não empurra nada)`,
          JSON.stringify(noFator)
        )
        const noOleo = await daFoto("oleo-para-barba")
        ok(
          noOleo.texto === "Combina com o Fator que você já tem" &&
            noOleo.tipo === "combina" &&
            pedidos.filter((p) => p.includes("/api/ficha")).length === 1,
          "na página do óleo: “Combina com o Fator que você já tem” — e sem perguntar de novo",
          `${JSON.stringify(noOleo)} · ${pedidos.filter((p) => p.includes("/api/ficha")).length}`
        )

        // Quem entrou antes do fb_conta existir ganha ele na primeira visita à conta.
        await contexto.clearCookies({ name: "fb_conta" })
        await pagina.goto(`${LOJA}/conta`, { waitUntil: "domcontentloaded" })
        ok(
          /^[0-9a-f]{16}$/.test((await cookieDe(contexto, "fb_conta"))?.value ?? ""),
          "sessão sem o fb_conta (de antes dele): a conta grava um novo na primeira visita"
        )

        await hidratado(pagina, "button")
        await pagina.locator("button", { hasText: "Sair" }).filter({ visible: true }).click()
        await pagina.waitForURL("**/conta/entrar?saiu=1", { timeout: 15000 })
        const antesDeSair = pedidos.filter((p) => p.includes("/api/ficha")).length
        await pagina.goto(`${LOJA}/`, { waitUntil: "domcontentloaded" })
        await esperar(3000)
        const semAvisoDepois = (await pagina.locator("[data-aviso-reposicao]").count()) === 0
        await pagina.goto(`${LOJA}/produtos/fator-de-crescimento-para-barba`, {
          waitUntil: "domcontentloaded",
        })
        await esperar(2500)
        ok(
          !(await cookieDe(contexto, "fb_conta")) &&
            pedidos.filter((p) => p.includes("/api/ficha")).length === antesDeSair &&
            semAvisoDepois &&
            (await pagina.locator("[data-ficha-na-foto]").count()) === 0,
          "saiu da conta: o fb_conta vai junto, e a home e a página do produto não mostram mais nada"
        )
      } finally {
        await contexto.close()
      }
    }

    {
      titulo("A jornada do resultado: depois que o pedido chega")
      const daJornada = (e) =>
        e.tags?.some((t) => t.name === "tipo" && t.value === "crm-jornada") && deFluxo(e)
      const COMPROU_O_FATOR = foraDoControle("jornada.fator", "jornada")
      // Ligada ANTES da entrega: a jornada só vale pro que chega depois de ligar.
      await mudarFluxos({ fluxo: "jornada", ligado: true })
      try {
        const doPedido = await fabrica.pedidoPix(COMPROU_O_FATOR, [
          ["fator-de-crescimento-para-barba", 1],
        ])
        await fabrica.pagar(doPedido)
        await fabrica.entregar(
          doPedido,
          await fabrica.enviar(doPedido, { codigo: `QJ${Date.now() % 1e9}BR`, avisar: false })
        )
        const chegou = Date.now()
        const aos = (dias) => new Date(diurno(chegou + dias * DIA_MS + 5 * MIN)).toISOString()
        const assuntos = () =>
          resend.emails
            .filter((e) => e.to?.includes(COMPROU_O_FATOR) && daJornada(e))
            .map((e) => e.subject)
        await rodar({ agora: aos(0), email: COMPROU_O_FATOR })
        await rodar({ agora: aos(3), email: COMPROU_O_FATOR })
        const primeiro = resend.emails.find((e) => e.to?.includes(COMPROU_O_FATOR) && daJornada(e))
        ok(
          JSON.stringify(assuntos()) ===
            JSON.stringify([
              "Chegou! Veja como usar o Fator de Crescimento",
              "O segredo é não pular dia",
            ]) &&
            /^Matheus, da FuckingBarba </.test(primeiro?.from ?? "") &&
            !primeiro?.headers?.["List-Unsubscribe"],
          "quando chega, o modo de uso; em 3 dias, não pular dia — como lembrete",
          JSON.stringify(assuntos())
        )
        await rodar({ agora: aos(7), email: COMPROU_O_FATOR })
        const e7 = resend.emails.find(
          (e) => e.to?.includes(COMPROU_O_FATOR) && e.subject === "Uma semana. Como tá indo?"
        )
        const botoes = [...(e7?.html ?? "").matchAll(/href="([^"]+\/crm\/checkin\?t=[^"]+)"/g)].map(
          (m) => m[1].replaceAll("&amp;", "&")
        )
        const [bem, duvida] = await Promise.all(
          botoes.slice(0, 2).map((b) => fetch(b, { redirect: "manual" }).catch(() => null))
        )
        const paraOnde = (r) => r?.headers.get("location") ?? ""
        ok(
          botoes.length === 2 &&
            !/não gostei/i.test(e7?.html ?? "") &&
            !/\p{Extended_Pictographic}/u.test(e7?.html ?? "") &&
            bem?.status === 303 &&
            paraOnde(bem).includes("/avaliar/") &&
            duvida?.status === 303 &&
            (paraOnde(duvida).startsWith("https://wa.me/") ||
              paraOnde(duvida).includes("/contato")),
          "7 dias: “Como tá indo?” com dois botões sem emoji — “Tá indo bem” leva pra avaliar, “Tenho uma dúvida” pro WhatsApp da loja",
          JSON.stringify({ botoes: botoes.length, bem: paraOnde(bem), duvida: paraOnde(duvida) })
        )
        await rodar({ agora: aos(21), email: COMPROU_O_FATOR })
        await rodar({ agora: aos(60), email: COMPROU_O_FATOR })
        const rotina = resend.emails.find(
          (e) => e.to?.includes(COMPROU_O_FATOR) && e.subject === "Agora completa a rotina"
        )
        ok(
          assuntos().length === 5 &&
            assuntos().at(-1) === "Dia 60: é aqui que muita gente desiste" &&
            Boolean(rotina?.html.includes("/produtos/oleo-para-barba?")),
          "21 dias: a rotina completa (quem tem o Fator ganha o óleo); 60 dias: o dia 60 do Fator",
          JSON.stringify(assuntos())
        )
      } finally {
        // O banco local é de todos: a jornada volta a desligada, mesmo se algo acima caiu.
        await mudarFluxos({ fluxo: "jornada", ligado: false })
      }
    }

    {
      titulo("O resgate e o sunset: quem passou do dia de comprar de novo (0192)")
      const doResgate = (e) =>
        e.tags?.some((t) => t.name === "tipo" && t.value === "crm-resgate") && deFluxo(e)
      const daReposicao = (e) =>
        e.tags?.some((t) => t.name === "tipo" && t.value === "crm-reposicao") && deFluxo(e)
      /** Fora do controle dos dois fluxos: o resgate e a reposição (o balm do fim). */
      const foraDosDois = (nome) => {
        for (let i = 0; ; i++) {
          const e = `${nome}${i}@${DOMINIO}`
          if (!controle(e, "resgate") && !controle(e, "reposicao")) return e
        }
      }
      const RESPONDE = foraDosDois("resgate.responde")
      const SOME = foraDosDois("resgate.some")
      // A última compra, na loja antiga, há 56 dias: o Fator (entregue no 7º, dura 30) acabou há
      // 19, e a tolerância de 20 dias dos Ajustes põe a pessoa em risco amanhã, ao meio-dia de
      // Brasília (a data sem hora da Nuvemshop). Junto, 3 balms (180 dias): a reposição dele, lá
      // na frente, é o e-mail que o sunset tem que calar.
      const vendaEm = Date.now() - 56 * DIA_MS
      const b = new Date(vendaEm - 3 * HORA)
      const pagoNaNuvem = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) + 15 * HORA
      const emRisco = pagoNaNuvem + 57 * DIA_MS
      const aos = (ms) => new Date(diurno(ms + 5 * MIN)).toISOString()
      // Como no arquivo da Nuvemshop: a linha com a data é o pedido; a sem data, mais um item dele.
      const soOItem = (linha) =>
        linha
          .split(";")
          .map((c, i) => (i === 2 ? "" : c))
          .join(";")
      const compra = (numero, email) => [
        venda(numero, email, vendaEm, "FBFCB01", "Fator de Crescimento para Barba 30ml"),
        soOItem(
          venda(numero, email, vendaEm, "FBBM01", "Balm para Barba").replace(
            ";79.90;1;FBBM01;",
            ";79.90;3;FBBM01;"
          )
        ),
      ]
      const [pessoas, vendas] = await Promise.all([
        medusa("/dashboard/crm/base", {
          token: tokenDoDono,
          corpo: doArquivo(
            latin1([
              "Nome completo;CPF/CNPJ;E-mail;Telefone de Contato;Endereço;Cidade;Data;Cadastrado;Inscrição para newsletter;Marketing;Marketing (atualização)",
              `RESGATE RESPONDE;${CPF_FALSO};${RESPONDE};+55${TELEFONE_FALSO};Rua da Rodada, 99;Blumenau;${cadastro};NÃO;NÃO;Aceita;${cadastro}`,
              `RESGATE SOME;${CPF_FALSO};${SOME};+55${TELEFONE_FALSO};Rua da Rodada, 99;Blumenau;${cadastro};NÃO;NÃO;Aceita;${cadastro}`,
            ])
          ),
        }),
        medusa("/dashboard/crm/base", {
          token: tokenDoDono,
          corpo: doArquivo(
            latin1([
              cabecalhoDasVendas,
              ...compra(`R${RODADA}-RR`, RESPONDE),
              ...compra(`R${RODADA}-RS`, SOME),
            ])
          ),
        }),
      ])
      const deQuem = (email, filtro) =>
        resend.emails.filter((e) => e.to?.includes(email) && filtro(e))
      const botoes = (e) =>
        [...(e?.html ?? "").matchAll(/href="([^"]*\/crm\/resgate\?t=[^"]+)"/g)].map((m) =>
          m[1].replaceAll("&amp;", "&")
        )
      const clicar = async (link) => {
        const r = await fetch(link, { redirect: "manual" })
        return { status: r.status, para: r.headers.get("location") ?? "" }
      }
      await mudarFluxos({ fluxo: "resgate", ligado: true })
      await mudarFluxos({ fluxo: "reposicao", ligado: true })
      try {
        const antes = await rodar({ agora: aos(emRisco - 2 * DIA_MS), email: RESPONDE })
        await rodar({ agora: aos(emRisco), email: RESPONDE })
        const pergunta = deQuem(RESPONDE, doResgate)[0]
        const links = botoes(pergunta)
        ok(
          pessoas.status === 200 &&
            vendas.status === 200 &&
            antes.corpo.enviados === 0 &&
            pergunta?.subject === "Tá tudo bem com a barba?" &&
            /^Matheus, da FuckingBarba </.test(pergunta.from ?? "") &&
            !pergunta.headers?.["List-Unsubscribe"] &&
            !/\p{Extended_Pictographic}/u.test(pergunta.html) &&
            pergunta.html.includes("o Fator de Crescimento da sua última compra acabou") &&
            ["Tá caro", "Esqueci de repor", "Não vi resultado", "Comprei em outro lugar"].every(
              (t) => pergunta.html.includes(t)
            ) &&
            links.length === 4,
          "no dia em que fica em risco: “Tá tudo bem com a barba?”, como lembrete, com os 4 botões sem emoji",
          pergunta?.subject ?? "não chegou"
        )

        const caro = await clicar(links[0])
        const caroDeNovo = await clicar(links[0])
        const codigo = caro.para.match(/\/discount\/(VOLTA-[0-9A-Z]{6})\?/)?.[1]
        const esqueci = await clicar(links[1])
        const resultado = await clicar(links[2])
        const outro = await clicar(links[3])
        ok(
          caro.status === 303 &&
            Boolean(codigo) &&
            caroDeNovo.para === caro.para &&
            esqueci.status === 303 &&
            new URL(esqueci.para).pathname.startsWith("/voltar/repor-nso_") &&
            resultado.status === 303 &&
            (resultado.para.startsWith("https://wa.me/") ||
              resultado.para.startsWith(`${LOJA}/contato`)) &&
            outro.status === 303 &&
            outro.para === `${LOJA}/?utm_source=loja&utm_medium=email&utm_campaign=crm-resgate`,
          "os botões: “Tá caro” dá o cupom na hora (e o mesmo no 2º clique), “Esqueci” refaz o pedido, “Não vi resultado” abre o WhatsApp (ou o contato), e “Comprei em outro lugar” vai pra loja",
          JSON.stringify({ caro, caroDeNovo, esqueci, resultado, outro })
        )
        const naSemana = await rodar({ agora: aos(emRisco + 7 * DIA_MS), email: RESPONDE })
        ok(
          naSemana.corpo.enviados === 0 && deQuem(RESPONDE, doResgate).length === 1,
          "quem respondeu não recebe o cupom de 7 dias",
          JSON.stringify(naSemana.corpo)
        )

        for (const d of [0, 7, 9]) await rodar({ agora: aos(emRisco + d * DIA_MS), email: SOME })
        const [, sete, nove] = deQuem(SOME, doResgate)
        const codigoDoSete = sete?.html.match(/VOLTA-[0-9A-Z]{6}/)?.[0]
        ok(
          sete?.subject === "15% pra voltar pra rotina" &&
            Boolean(sete?.headers?.["List-Unsubscribe"]) &&
            Boolean(codigoDoSete) &&
            sete.html.includes(`?cupom=${codigoDoSete}`) &&
            sete.html.includes("/voltar/repor-nso_") &&
            nove?.subject === "Seu cupom de 15% vence amanhã" &&
            nove.html.includes(codigoDoSete),
          "quem não respondeu: 15% em 7 dias, como oferta, com o pedido de sempre já com o desconto — e o “vence amanhã” em 9",
          JSON.stringify(deQuem(SOME, doResgate).map((e) => e.subject))
        )
        await rodar({ agora: aos(emRisco + 45 * DIA_MS), email: SOME })
        await rodar({ agora: aos(emRisco + 45 * DIA_MS), email: RESPONDE })
        const sunset = deQuem(SOME, doResgate)[3]
        ok(
          sunset?.subject === "Posso continuar te escrevendo?" &&
            /^Matheus, da FuckingBarba </.test(sunset.from ?? "") &&
            !sunset.headers?.["List-Unsubscribe"] &&
            sunset.html.includes("Sim, quero continuar") &&
            botoes(sunset).length === 1 &&
            deQuem(RESPONDE, doResgate).length === 1,
          "45 dias sem sinal nenhum: “Posso continuar te escrevendo?”, como lembrete, com o Sim — quem respondeu não recebe",
          JSON.stringify(deQuem(SOME, doResgate).map((e) => e.subject))
        )

        // Lá na frente, os 3 balms estão pra acabar: quem respondeu recebe a reposição; quem
        // recebeu o sunset e não voltou, não recebe nada — está adormecido.
        const noBalm = aos(pagoNaNuvem + 180 * DIA_MS)
        await rodar({ agora: noBalm, email: RESPONDE })
        const calado = await rodar({ agora: noBalm, email: SOME })
        ok(
          deQuem(RESPONDE, daReposicao).length === 1 &&
            calado.corpo.adormecidos === 1 &&
            calado.corpo.enviados === 0 &&
            deQuem(SOME, daReposicao).length === 0,
          "o sunset: sem o Sim, a pessoa fica adormecida — a reposição do balm sai pra quem respondeu, e não pra ela",
          JSON.stringify({
            responde: deQuem(RESPONDE, daReposicao).map((e) => e.subject),
            some: calado.corpo,
          })
        )
        const sim = await clicar(botoes(sunset)[0])
        ok(
          sim.status === 303 &&
            sim.para === `${LOJA}/?utm_source=loja&utm_medium=email&utm_campaign=crm-resgate`,
          "o Sim, quero continuar: anota e vai pra loja",
          JSON.stringify(sim)
        )
      } finally {
        // O banco local é de todos: o resgate e a reposição voltam a desligados.
        await mudarFluxos({ fluxo: "resgate", ligado: false })
        await mudarFluxos({ fluxo: "reposicao", ligado: false })
      }
    }

    titulo("A aba Fluxos")
    await semIpNasFontes(dono.contexto)
    await dono.pagina.goto(`${PAINEL}/crm/fluxos`)
    await dono.pagina.locator("[data-fluxos-crm]").waitFor({ timeout: 20000 })
    const jeitosNaTela = await dono.pagina
      .locator('[data-fluxo="estreia"] [data-publico-da-estreia] [data-jeito]')
      .allTextContents()
    ok(
      (await dono.pagina.locator("[data-fluxo]").count()) === 8 &&
        (await dono.pagina.locator('.abas [data-aba="fluxos"][aria-current="page"]').count()) ===
          1 &&
        (await dono.pagina.locator('[data-ligar][aria-checked="true"]').count()) === 4 &&
        (await dono.pagina.locator('[data-ligar="estreia"][aria-checked="false"]').count()) === 1 &&
        (await dono.pagina.locator('[data-ligar="reposicao"][aria-checked="false"]').count()) ===
          1 &&
        (await dono.pagina.locator('[data-ligar="jornada"][aria-checked="false"]').count()) === 1 &&
        (await dono.pagina.locator('[data-ligar="resgate"][aria-checked="false"]').count()) === 1 &&
        // As boas-vindas não têm controle: o cupom foi a pessoa que pediu. A estreia tem.
        (await dono.pagina.locator('[data-fluxo="boas-vindas"] .numero--controle').count()) === 0 &&
        (await dono.pagina.locator('[data-fluxo="estreia"] .numero--controle').count()) === 1 &&
        jeitosNaTela.length === 4 &&
        jeitosNaTela.filter((t) => t.includes("cupom")).length === 2,
      "a aba: os oito fluxos, quatro ligados; a estreia, a reposição, a jornada e o resgate desligados, a estreia com o controle e os 4 jeitos (2 com cupom)",
      JSON.stringify(jeitosNaTela.map(semEspaco))
    )
    const telaAgora = (await fluxos(tokenDoDono)).corpo
    const doCheckout = telaAgora.fluxos.find((f) => f.id === "checkout")
    ok(
      doCheckout.toques.every((t) => t.enviados >= 1) && doCheckout.numeros.cupons >= 1,
      "os números da tela contam os e-mails e o cupom",
      JSON.stringify(doCheckout.numeros)
    )
    await hidratado(dono.pagina, '[data-ligar="pix"]')
    const vezDaChave = await dono.pagina.locator(".aviso").getAttribute("data-vez")
    await dono.pagina.locator('[data-ligar="pix"]').click()
    await dono.pagina.waitForFunction(
      (v) => document.querySelector(".aviso")?.getAttribute("data-vez") !== v,
      vezDaChave,
      { timeout: 20000 }
    )
    const pixDesligado = (await fluxos(tokenDoDono)).corpo.fluxos.find((f) => f.id === "pix")
    ok(
      pixDesligado?.ligado === false &&
        semEspaco(await dono.pagina.locator(".aviso").textContent()).startsWith("Desligado."),
      "a chave desliga o Pix, e o aviso diz",
      semEspaco(await dono.pagina.locator(".aviso").textContent())
    )
    await mudarFluxos({ fluxo: "pix", ligado: true })
    const antesDoTesteDoFluxo = caixa.quantos(DONO, (e) => e.subject?.startsWith("[Teste] "))
    await hidratado(dono.pagina, '[data-toque="checkout-24h"] [data-mandar-pra-mim]')
    await dono.pagina.locator('[data-toque="checkout-24h"] [data-mandar-pra-mim]').click()
    const testeDoFluxo = await caixa.esperarEmail(
      DONO,
      (e) => e.subject?.startsWith("[Teste] "),
      antesDoTesteDoFluxo,
      20000
    )
    ok(
      /^\[Teste\] \d+% pra você fechar o pedido$/.test(testeDoFluxo?.subject ?? "") &&
        testeDoFluxo?.html.includes("VOLTA-EXEMPLO"),
      "“Mandar pra mim” do toque de 1 dia: o e-mail com o cupom de exemplo",
      testeDoFluxo?.subject ?? "não chegou"
    )
    // O das boas-vindas: o e-mail do cupom da 1ª compra, com o cupom de exemplo.
    const antesDoTesteDaPrimeira = caixa.quantos(DONO, (e) => e.subject?.startsWith("[Teste] "))
    await hidratado(dono.pagina, '[data-toque="boas-vindas-agora"] [data-mandar-pra-mim]')
    await dono.pagina.locator('[data-toque="boas-vindas-agora"] [data-mandar-pra-mim]').click()
    const testeDaPrimeira = await caixa.esperarEmail(
      DONO,
      (e) => e.subject?.startsWith("[Teste] "),
      antesDoTesteDaPrimeira,
      20000
    )
    ok(
      /^\[Teste\] Seu cupom de \d+% chegou$/.test(testeDaPrimeira?.subject ?? "") &&
        testeDaPrimeira?.html.includes("BEMVINDO-EXEMPLO") &&
        testeDaPrimeira?.html.includes("/discount/BEMVINDO-EXEMPLO?") &&
        Boolean(testeDaPrimeira?.headers?.["List-Unsubscribe"]),
      "“Mandar pra mim” das boas-vindas: o cupom da 1ª compra, com o link que já aplica, como oferta",
      testeDaPrimeira?.subject ?? "não chegou"
    )
    // O da estreia: os 4 jeitos do e-mail da loja nova, um e-mail por jeito.
    const antesDoTesteDaEstreia = caixa.quantos(DONO, (e) => e.subject?.startsWith("[Teste] "))
    await hidratado(dono.pagina, '[data-toque="estreia-agora"] [data-mandar-pra-mim]')
    const vezDaEstreia = await dono.pagina.locator(".aviso").getAttribute("data-vez")
    await dono.pagina.locator('[data-toque="estreia-agora"] [data-mandar-pra-mim]').click()
    await dono.pagina.waitForFunction(
      (v) => document.querySelector(".aviso")?.getAttribute("data-vez") !== v,
      vezDaEstreia,
      { timeout: 30000 }
    )
    // A rota manda os 4 antes de responder: com o aviso na tela, eles já estão na caixa.
    await caixa.esperarEmail(
      DONO,
      (e) => e.subject?.startsWith("[Teste] "),
      antesDoTesteDaEstreia + 3,
      20000
    )
    const testesDaEstreia = resend.emails
      .filter((e) => e.to?.includes(DONO) && e.subject?.startsWith("[Teste] "))
      .slice(antesDoTesteDaEstreia)
      .map((e) => e.subject)
    ok(
      JSON.stringify(testesDaEstreia) ===
        JSON.stringify([
          "[Teste] Seu Fator de Crescimento deve estar acabando",
          "[Teste] A FuckingBarba tem loja nova",
          "[Teste] Loja nova, e 10% pra você voltar",
          "[Teste] Loja nova, e 10% na sua primeira compra",
        ]) &&
        semEspaco(await dono.pagina.locator(".aviso").textContent()).startsWith(
          "Mandei os 4 jeitos de “A loja nova chegou”"
        ),
      "“Mandar pra mim” da estreia: os 4 jeitos do e-mail da loja nova, e o aviso conta",
      JSON.stringify(testesDaEstreia)
    )
    // O da reposição: o Fator acabando, como lembrete, com o Refazer o pedido.
    const antesDoTesteDaReposicao = caixa.quantos(DONO, (e) => e.subject?.startsWith("[Teste] "))
    await hidratado(dono.pagina, '[data-toque="reposicao-antes-7d"] [data-mandar-pra-mim]')
    await dono.pagina.locator('[data-toque="reposicao-antes-7d"] [data-mandar-pra-mim]').click()
    const testeDaReposicao = await caixa.esperarEmail(
      DONO,
      (e) => e.subject?.startsWith("[Teste] "),
      antesDoTesteDaReposicao,
      20000
    )
    ok(
      testeDaReposicao?.subject === "[Teste] Seu Fator de Crescimento acaba em uma semana" &&
        /^Matheus, da FuckingBarba </.test(testeDaReposicao?.from ?? "") &&
        testeDaReposicao?.html.includes("/voltar/repor-order_"),
      "“Mandar pra mim” da reposição: o Fator acabando, como lembrete, com o Refazer o pedido",
      testeDaReposicao?.subject ?? "não chegou"
    )
    // O do resgate: a pergunta com os 4 botões — de mentira, vão pra loja sem anotar nada.
    const antesDoTesteDoResgate = caixa.quantos(DONO, (e) => e.subject?.startsWith("[Teste] "))
    await hidratado(dono.pagina, '[data-toque="resgate-agora"] [data-mandar-pra-mim]')
    await dono.pagina.locator('[data-toque="resgate-agora"] [data-mandar-pra-mim]').click()
    const testeDoResgate = await caixa.esperarEmail(
      DONO,
      (e) => e.subject?.startsWith("[Teste] "),
      antesDoTesteDoResgate,
      20000
    )
    ok(
      testeDoResgate?.subject === "[Teste] Tá tudo bem com a barba?" &&
        /^Matheus, da FuckingBarba </.test(testeDoResgate?.from ?? "") &&
        ["Tá caro", "Esqueci de repor", "Não vi resultado", "Comprei em outro lugar"].every((t) =>
          testeDoResgate?.html.includes(t)
        ) &&
        !testeDoResgate?.html.includes("/crm/resgate?t="),
      "“Mandar pra mim” do resgate: a pergunta com os 4 botões, como lembrete — e os botões de mentira não anotam nada",
      testeDoResgate?.subject ?? "não chegou"
    )
    // A chave das boas-vindas é a do pop-up da loja: desligada, a loja fica sabendo.
    const popupDaLoja = async () =>
      (await medusa("/store/crm/primeira-compra", { metodo: "GET", extras: DA_LOJA })).corpo
    await mudarFluxos({ fluxo: "boas-vindas", ligado: false })
    const popupDesligado = await popupDaLoja()
    await mudarFluxos({ fluxo: "boas-vindas", ligado: true })
    const popupLigado = await popupDaLoja()
    ok(
      popupDesligado.ligado === false &&
        popupLigado.ligado === true &&
        popupLigado.porcento === 10 &&
        popupLigado.dias === 3,
      "a chave das boas-vindas liga e desliga o pop-up da loja (10%, 3 dias)",
      JSON.stringify({ popupDesligado, popupLigado })
    )
    await dono.pagina.goto(`${PAINEL}/crm/fluxos`)
    await hidratado(dono.pagina, "[data-desconto]")
    const vezDoDesconto = await dono.pagina.locator(".aviso").getAttribute("data-vez")
    await dono.pagina.locator("[data-desconto]").fill("15")
    await dono.pagina.locator("[data-salvar-desconto]").click()
    await dono.pagina.waitForFunction(
      (v) => document.querySelector(".aviso")?.getAttribute("data-vez") !== v,
      vezDoDesconto,
      { timeout: 20000 }
    )
    ok(
      (await fluxos(tokenDoDono)).corpo.desconto === 15 &&
        semEspaco(await dono.pagina.locator(".aviso").textContent()) === "Desconto salvo: 15%.",
      "o desconto muda pela tela",
      semEspaco(await dono.pagina.locator(".aviso").textContent())
    )
    await mudarFluxos({ desconto: 10 })
    await semIpNasFontes(mkt.contexto)
    await mkt.pagina.goto(`${PAINEL}/crm/fluxos`)
    await mkt.pagina.locator("[data-fluxos-crm]").waitFor({ timeout: 20000 })
    ok(await semRolagemDeLado(mkt.pagina), "a aba Fluxos no celular, sem rolar de lado")
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
  ok(
    (await dono.pagina.locator('.abas [data-aba="resumo"][aria-current="page"]').count()) === 1 &&
      (await dono.pagina.locator('.abas [data-aba="ajustes"]').getAttribute("href")) ===
        "/crm/ajustes",
    "as abas do CRM: o Resumo aceso, e os Ajustes do lado"
  )
  const primeira = semEspaco(
    await dono.pagina.locator("[data-ultimas-crm] .anotacao").first().textContent()
  )
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

  titulo("Os e-mails da loja, na tela")
  await dono.pagina.goto(`${PAINEL}/crm?periodo=hoje`)
  await dono.pagina.locator("[data-emails-crm]").waitFor({ timeout: 20000 })
  const apiDosEmails = (await tela("hoje")).emails
  ok(
    (await naTela('[data-email="enviados"]')) === String(apiDosEmails.numeros.enviados) &&
      (await naTela('[data-email="naoChegaram"]')) === String(apiDosEmails.numeros.naoChegaram),
    "os números dos e-mails são os da API",
    `${await naTela('[data-email="enviados"]')} / ${apiDosEmails.numeros.enviados}`
  )
  ok(
    /o último chegou hoje, \d\d:\d\d/.test(await naTela("[data-emails-situacao]")),
    "a hora do último aviso do Resend",
    await naTela("[data-emails-situacao]")
  )
  ok(
    (await dono.pagina.locator('[data-tipo-de-email="codigo-de-entrar"]').count()) === 1 &&
      (await dono.pagina.locator('[data-ultimos-emails] .anotacao[data-nivel="ruim"]').count()) >=
        1,
    "a tabela por tipo e o que não chegou, em vermelho"
  )

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
  // Os fluxos voltam ao padrão (ligados, 10%): o banco local é de todos os conferidores.
  if (tokenDoDono)
    for (const corpo of [
      { fluxo: "pix", ligado: true },
      { fluxo: "checkout", ligado: true },
      { fluxo: "carrinho", ligado: true },
      { fluxo: "boas-vindas", ligado: true },
      { desconto: 10 },
    ])
      await medusa("/dashboard/crm/fluxos", { token: tokenDoDono, corpo }).catch(() => null)
  // Os Ajustes voltam ao padrão: o banco local é de todos os conferidores.
  if (tokenDoDono && padraoDosAjustes)
    await medusa("/dashboard/crm/ajustes", {
      token: tokenDoDono,
      corpo: formularioDe(padraoDosAjustes),
    }).catch(() => null)
  await navegador.close()
  await resend.fechar()
}

process.exit(resumo())
