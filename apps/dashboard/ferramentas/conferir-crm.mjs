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
    // O banco local é de todos os conferidores: os dois ligados, e a primeira rodada guarda a hora.
    for (const id of ["pix", "checkout"]) await mudarFluxos({ fluxo: id, ligado: true })
    await rodar()
    const tela0 = (await fluxos(tokenDoDono)).corpo
    ok(
      tela0.fluxos?.map((f) => f.id).join() === "pix,checkout" &&
        tela0.fluxos.every((f) => f.ligado && f.desde) &&
        tela0.fluxos.find((f) => f.id === "checkout")?.toques.length === 4 &&
        tela0.fluxos.find((f) => f.id === "pix")?.toques.length === 3,
      "os dois fluxos, ligados, com os toques de cada um",
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
    /** De madrugada (22h às 8h em Brasília) só o urgente sai: o toque que cairia lá vai pras 9h. */
    const HORA_BR = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hourCycle: "h23",
    })
    const diurno = (ms) => {
      let t = ms
      while (Number(HORA_BR.format(new Date(t))) >= 22 || Number(HORA_BR.format(new Date(t))) < 9)
        t += 15 * MIN
      return t
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
        /^<[^>]+>$/.test(e30.headers?.["List-Unsubscribe"] ?? ""),
      "30 minutos: “Faltou só o pagamento”, com o link de voltar, a campanha e o sair da lista",
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
      r24.corpo.enviados === 1 && r24.corpo.cupons === 1 && Boolean(cupom),
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
    await pessoa2.pagina.goto(linkDoCupom ?? `${LOJA}/`, { waitUntil: "domcontentloaded" })
    await pessoa2.pagina
      .waitForURL((u) => u.pathname === "/checkout", { timeout: 30000 })
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
        ePix.tags?.some((t) => t.name === "tipo" && t.value === "crm-pix"),
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
    await pessoa3.pagina.goto(linkDoPix ?? `${LOJA}/`, { waitUntil: "domcontentloaded" })
    await pessoa3.pagina
      .waitForURL((u) => u.pathname === "/checkout", { timeout: 30000 })
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
    await pessoa3.pagina.goto(linkDoPix ?? `${LOJA}/`, { waitUntil: "domcontentloaded" })
    await pessoa3.pagina
      .waitForURL((u) => u.pathname === "/checkout", { timeout: 30000 })
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

    titulo("A aba Fluxos")
    await semIpNasFontes(dono.contexto)
    await dono.pagina.goto(`${PAINEL}/crm/fluxos`)
    await dono.pagina.locator("[data-fluxos-crm]").waitFor({ timeout: 20000 })
    ok(
      (await dono.pagina.locator("[data-fluxo]").count()) === 2 &&
        (await dono.pagina.locator('.abas [data-aba="fluxos"][aria-current="page"]').count()) ===
          1 &&
        (await dono.pagina.locator('[data-ligar][aria-checked="true"]').count()) === 2,
      "a aba: os dois fluxos, ligados"
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
