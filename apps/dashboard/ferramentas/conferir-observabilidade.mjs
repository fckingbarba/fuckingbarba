/**
 * CONFERIDOR DA OBSERVABILIDADE DO PAINEL — a saúde da loja, com os
 * problemas criados DE VERDADE pelos falsos: o e-mail que o Resend recusa,
 * a cotação que a Frenet derruba e o estorno que o Pagar.me não faz.
 *
 *   (Medusa apontando pros falsos, como no conferir-pedidos; painel no ar)
 *   node apps/dashboard/ferramentas/conferir-observabilidade.mjs
 *
 * Variáveis: as de `pecas.mjs`, e mais NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 * ADMIN_EMAIL e ADMIN_SENHA (o admin LOCAL: cancelar e conciliar),
 * MEDUSA_WEBHOOK_SEGREDO, PORTA_FALSA e PORTA_PAGARME_FALSO.
 *
 * O pedido do estorno fica no banco local, como nos outros conferidores; o
 * problema dele sai sozinho quando o estorno sai, no fim. Os membros da
 * rodada saem da equipe.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • a falha que não vira problema (o e-mail, a cotação, o estorno), e o  │
 * │   problema de estado que não sai sozinho quando o estado muda;         │
 * │ • o estorno aparecendo pra operação; o "marcar como resolvido" num     │
 * │   problema que sai sozinho, ou num que o papel não vê;                 │
 * │ • o código de acesso do e-mail guardado no problema;                   │
 * │ • as rotinas sem a rodada anotada; o número vermelho do menu;          │
 * │ • a operação sem a tela, o marketing com ela; rolagem de lado no       │
 * │   celular; erro no console.                                            │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { fabricaDePedidos } from "../../loja/ferramentas/pedido-de-teste.mjs"
import { subirFrenetFalsa } from "../../loja/ferramentas/frenet-falsa.mjs"
import { subirPagarmeFalso } from "../../loja/ferramentas/pagarme-falso.mjs"
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
  ok,
  PAINEL,
  resumo,
  RODADA,
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
const email = (quem) => `obs.${RODADA}.${quem}@teste.fuckingbarba.dev`
const OP = `op.${RODADA}@painel.teste`
const MKT = `mkt.${RODADA}@painel.teste`

/* ── os falsos e o admin ──────────────────────────────────────────────────── */

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
const conciliar = async () => (await adm("/admin/pagamentos/conciliar", { metodo: "POST" })).corpo
const fabrica = fabricaDePedidos({ medusa: MEDUSA, chave: CHAVE, tokenAdmin, pagarme })

const tela = (token) => medusa("/dashboard/observabilidade", { metodo: "GET", token })

/**
 * A tela até `quer` dar certo. Na tela, o vigia roda no máximo a cada 30
 * segundos — o problema recém-criado pode levar esse tempo pra aparecer.
 */
async function telaAte(token, quer, ms = 45_000) {
  let r = await tela(token)
  for (const fim = Date.now() + ms; Date.now() < fim && !(r.status === 200 && quer(r.corpo));) {
    await esperar(2500)
    r = await tela(token)
  }
  return r.corpo
}
const problema = (t, filtro) => (t?.problemas ?? []).find(filtro)

let tokenDoDono = ""

try {
  titulo("Quem entra")
  const dono = await novaAba()
  const cookieDono = await entrarPelaTela(dono, DONO, caixa)
  if (!cookieDono) throw new Error("o dono não entrou (o código não chegou no Resend falso?)")
  tokenDoDono = cookieDono.value
  for (const [papel, quem, nome] of [
    ["operacao", OP, "Operação Teste"],
    ["marketing", MKT, "Marketing Teste"],
  ]) {
    const r = await medusa("/dashboard/equipe", {
      token: tokenDoDono,
      corpo: { nome, email: quem, papel },
    })
    ok(r.status === 200, `convite de ${papel}`, JSON.stringify(r.corpo))
  }
  const op = await novaAba()
  const cookieOp = await entrarPelaTela(op, OP, caixa)
  const mkt = await novaAba()
  const cookieMkt = await entrarPelaTela(mkt, MKT, caixa)
  ok(Boolean(cookieOp && cookieMkt), "operação e marketing entram")
  const tokenOp = cookieOp.value
  const tokenMkt = cookieMkt.value
  const [lerMkt, lerOp] = await Promise.all([tela(tokenMkt), tela(tokenOp)])
  ok(
    lerMkt.status === 403 && lerOp.status === 200,
    "o marketing não abre a Observabilidade; a operação abre",
    `${lerMkt.status} ${lerOp.status}`
  )

  /* ── as falhas, de verdade, pelos falsos ───────────────────────────────── */

  titulo("As falhas da rodada")
  // 1. O e-mail que o Resend recusa: o código de acesso da operação.
  resend.roteiro.cair = true
  const pedido = await medusa("/dashboard/entrar/codigo", { corpo: { email: OP } })
  resend.roteiro.cair = false
  const codigosRecusados = resend.recusados.map((s) => String(s ?? "").match(/^(\d{6})/)?.[1])
  ok(
    codigosRecusados.length > 0,
    "o Resend recusou o e-mail do código",
    `${pedido.status} ${JSON.stringify(resend.recusados)}`
  )

  // 2. A cotação que a Frenet derruba (a calculadora da sacola).
  const { corpo: produtos } = await fetch(
    `${MEDUSA}/store/products?fields=handle,variants.id&limit=5`,
    { headers: { "x-publishable-api-key": CHAVE } }
  ).then(async (r) => ({ corpo: await r.json() }))
  const variante = produtos.products?.[0]?.variants?.[0]?.id
  const antes = frenet.roteiro
  frenet.roteiro = "queda"
  const cotacao = await fetch(`${MEDUSA}/store/frete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-publishable-api-key": CHAVE },
    body: JSON.stringify({
      cep: `0${String(Date.now()).slice(-7)}`,
      itens: [{ variante_id: variante, quantidade: 1 }],
    }),
  })
  frenet.roteiro = antes
  ok(
    // 200 com o preço de emergência; 503 sem ele (a sacola diz que não calculou).
    Boolean(variante) && [200, 503].includes(cotacao.status) && frenet.chamadas > 0,
    "a Frenet caiu no meio de uma cotação (a loja respondeu, com a emergência ou sem opção)",
    `${cotacao.status} chamadas=${frenet.chamadas}`
  )

  // 3. O estorno que o Pagar.me não faz: Pix pago, pedido cancelado.
  const E = await fabrica.pedidoPix(email("estorno"), [["oleo-para-barba", 1]])
  await fabrica.pagar(E)
  pagarme.estornos = "segura"
  await fabrica.cancelar(E)
  await conciliar()
  pagarme.falharEstorno(E.noPagarme)
  const r1 = await conciliar()
  ok(
    r1.relatorio?.estornos?.falharam?.some((x) => x.startsWith(`#${E.numero} `)),
    `o estorno do #${E.numero} falhou no Pagar.me`,
    JSON.stringify(r1.relatorio?.estornos)
  )

  /* ── os problemas na API ─────────────────────────────────────────────── */

  titulo("Os problemas (API)")
  const doEstorno = (p) => p.titulo === `O estorno do #${E.numero} não saiu`
  const doEmail = (p) => p.area === "E-mail" && p.situacao === "aberto"
  const doFrete = (p) => p.area === "Frete" && /^A cotação do frete falhou/.test(p.titulo)
  const t1 = await telaAte(
    tokenDoDono,
    (t) =>
      problema(t, doEstorno) &&
      problema(t, doEmail) &&
      problema(t, (p) => doFrete(p) && p.situacao === "aberto")
  )
  const estorno = problema(t1, doEstorno)
  const mail = problema(t1, doEmail)
  const frete = problema(t1, (p) => doFrete(p) && p.situacao === "aberto")
  ok(
    estorno?.nivel === "grave" &&
      estorno.sozinho &&
      !estorno.podeMarcar &&
      estorno.acao?.href === `/pedidos/${E.id}` &&
      /^\[estorno\] #\d+/.test(estorno.detalhe ?? ""),
    "o estorno que não saiu: grave, sai sozinho, com o pedido e a linha técnica",
    JSON.stringify(estorno)
  )
  ok(
    mail?.podeMarcar &&
      !mail.sozinho &&
      semEspaco(mail.texto).includes("pra o•••@painel.teste") &&
      !codigosRecusados.some((c) => c && JSON.stringify(mail).includes(c)),
    "o e-mail que não saiu: de evento, com o endereço mascarado e SEM o código de acesso",
    JSON.stringify(mail)
  )
  ok(
    frete?.podeMarcar &&
      ["atencao", "info"].includes(frete.nivel) &&
      /A Frenet não respondeu hoje/.test(frete.texto),
    "a cotação que falhou: de evento, em frase",
    JSON.stringify(frete)
  )
  const integ = (t, id) => (t?.integracoes ?? []).find((i) => i.id === id)
  ok(
    ["atencao", "erro"].includes(integ(t1, "resend")?.s) &&
      /não sa/.test(integ(t1, "resend")?.texto ?? "") &&
      /falh/.test(integ(t1, "frenet")?.texto ?? "") &&
      integ(t1, "medusa")?.s === "ok",
    "as integrações: o Resend e a Frenet com a falha do dia, o Medusa no ar",
    JSON.stringify(t1?.integracoes)
  )

  const tOp = (await tela(tokenOp)).corpo
  ok(
    !problema(tOp, doEstorno) && problema(tOp, (p) => p.id === mail.id),
    "a operação não vê o estorno (é dinheiro de cliente: só o dono); vê o e-mail",
    JSON.stringify(tOp?.problemas?.map((p) => p.titulo))
  )
  const [euDono, euOp] = await Promise.all([
    medusa("/dashboard/eu", { metodo: "GET", token: tokenDoDono }),
    medusa("/dashboard/eu", { metodo: "GET", token: tokenOp }),
  ])
  const nDono = euDono.corpo.avisos?.observabilidade ?? 0
  const nOp = euOp.corpo.avisos?.observabilidade ?? 0
  ok(
    nDono >= nOp + 1 && nDono === t1.numeros.problemas.graves,
    "o número vermelho do menu: os graves do papel (o dono conta o estorno)",
    `dono ${nDono} · op ${nOp} · tela ${t1.numeros.problemas.graves}`
  )

  titulo("Marcar como resolvido")
  const [soDono, sozinho] = await Promise.all([
    medusa(`/dashboard/observabilidade/problemas/${estorno.id}`, {
      token: tokenOp,
      corpo: { acao: "resolver" },
    }),
    medusa(`/dashboard/observabilidade/problemas/${estorno.id}`, {
      token: tokenDoDono,
      corpo: { acao: "resolver" },
    }),
  ])
  ok(
    soDono.status === 404 && sozinho.status === 409 && sozinho.corpo.message === "sai_sozinho",
    "o estorno não se marca: a operação nem acha (404), o dono ouve que ele sai sozinho (409)",
    `${soDono.status} ${sozinho.status} ${JSON.stringify(sozinho.corpo)}`
  )
  const marcado = await medusa(`/dashboard/observabilidade/problemas/${mail.id}`, {
    token: tokenOp,
    corpo: { acao: "resolver" },
  })
  const deNovo = await medusa(`/dashboard/observabilidade/problemas/${mail.id}`, {
    token: tokenOp,
    corpo: { acao: "resolver" },
  })
  ok(
    marcado.status === 200 &&
      marcado.corpo.problema?.situacao === "resolvido" &&
      /^Resolvido por Operação Teste, hoje, \d\d:\d\d$/.test(
        marcado.corpo.problema?.resolvido ?? ""
      ) &&
      deNovo.status === 409,
    "a operação marca o e-mail como resolvido, com o nome dela; marcar de novo é 409",
    `${JSON.stringify(marcado.corpo)} ${deNovo.status}`
  )

  /* ── a tela ───────────────────────────────────────────────────────────── */

  titulo("A tela do dono")
  const pagina = dono.pagina
  await pagina.goto(`${PAINEL}/observabilidade`)
  await hidratado(pagina, "[data-problemas]")
  const cartaoDoEstorno = pagina.locator(`[data-problema="${estorno.id}"]`)
  ok(
    (await pagina.locator("[data-geral]").count()) === 1 &&
      (await cartaoDoEstorno.count()) === 1 &&
      semEspaco(await cartaoDoEstorno.textContent()).includes(
        "Sai daqui sozinho quando for resolvido."
      ) &&
      (await cartaoDoEstorno.locator("[data-resolver]").count()) === 0,
    "o estorno na tela, sem botão: sai sozinho"
  )
  await cartaoDoEstorno.locator("details summary").click()
  ok(
    semEspaco(await cartaoDoEstorno.locator("details pre").textContent()).startsWith(
      `[estorno] #${E.numero}:`
    ),
    "o detalhe técnico abre embaixo do cartão"
  )
  const agoraNoMenu = (await medusa("/dashboard/eu", { metodo: "GET", token: tokenDoDono })).corpo
    .avisos?.observabilidade
  ok(
    (await pagina.locator(`[data-aviso="observabilidade"]`).textContent())?.trim() ===
      String(agoraNoMenu),
    "o número vermelho no menu do dono",
    `${await pagina.locator(`[data-aviso="observabilidade"]`).textContent()} · ${agoraNoMenu}`
  )
  ok(
    (await pagina.locator("[data-rotina]").count()) === 9 &&
      (await pagina.locator("[data-integracao]").count()) === 7,
    "as 9 rotinas e as 7 integrações"
  )

  // A cotação que falhou, marcada pela tela.
  const cartaoDoFrete = pagina.locator(`[data-problema="${frete.id}"]`)
  const vez = await pagina.locator(".aviso").getAttribute("data-vez")
  await cartaoDoFrete.locator("[data-resolver]").click()
  await pagina.waitForSelector(`[data-problema="${frete.id}"]`, {
    state: "detached",
    timeout: 8000,
  })
  await pagina.waitForFunction(
    (v) => document.querySelector(".aviso")?.getAttribute("data-vez") !== v,
    vez,
    { timeout: 30000 }
  )
  const aviso = await pagina.locator(".aviso").textContent()
  ok(
    semEspaco(aviso).includes("Marcado. Se acontecer de novo, ele volta."),
    "o clique marca a cotação como vista: ela sai dos abertos, e o aviso diz que volta se repetir",
    aviso
  )
  await pagina.locator('[data-filtro-problemas="resolvidos"]').click()
  const resolvidoNaTela = pagina.locator(`[data-problema="${frete.id}"]`)
  await resolvidoNaTela.waitFor({ timeout: 8000 })
  ok(
    /Resolvido( por [^,]+)?, hoje, \d\d:\d\d|Resolvido agora/.test(
      semEspaco(await resolvidoNaTela.textContent())
    ),
    "nos Resolvidos, com quem marcou",
    semEspaco(await resolvidoNaTela.textContent())
  )

  titulo("As rotinas")
  const tRotinas = await telaAte(
    tokenDoDono,
    (t) =>
      (t.rotinas ?? []).some((r) => r.nome === "precos-por-quantidade" && r.s === "ok" && r.ultima),
    75_000
  )
  const precos = (tRotinas.rotinas ?? []).find((r) => r.nome === "precos-por-quantidade")
  ok(
    tRotinas.rotinas?.length === 9 &&
      precos?.s === "ok" &&
      /^hoje, \d\d:\d\d$/.test(precos.ultima ?? "") &&
      /^\d+,\d s$/.test(precos.duracao ?? "") &&
      /^\d\d:\d\d$/.test(precos.proxima),
    "a rotina de minuto em minuto anotada: quando, quanto levou e a próxima",
    JSON.stringify(precos)
  )

  /* ── o estorno sai, e o problema some sozinho ────────────────────────── */

  titulo("O que sai sozinho")
  pagarme.estornos = "normal"
  const pediu = await medusa(`/dashboard/pedidos/${E.id}/estorno`, { token: tokenDoDono })
  await conciliar()
  const t2 = await telaAte(tokenDoDono, (t) => problema(t, doEstorno)?.situacao === "resolvido")
  const saiu = problema(t2, doEstorno)
  ok(
    pediu.status === 200 &&
      saiu?.situacao === "resolvido" &&
      /^Saiu sozinho hoje, \d\d:\d\d$/.test(saiu.resolvido ?? ""),
    "o estorno saiu: o problema vai pros resolvidos, 'saiu sozinho'",
    `${pediu.status} ${JSON.stringify(saiu)}`
  )

  titulo("A operação e o celular")
  await op.pagina.goto(`${PAINEL}/observabilidade`)
  await hidratado(op.pagina, "[data-problemas]")
  ok(
    (await op.pagina.locator(`[data-problema="${estorno.id}"]`).count()) === 0,
    "a tela da operação não tem o estorno"
  )
  await mkt.pagina.goto(`${PAINEL}/observabilidade`)
  ok(
    semEspaco(await mkt.pagina.locator("main").textContent()).includes(
      "Essa área não é do seu papel"
    ),
    "o marketing: 'não é do seu papel'"
  )
  const cel = await novaAba({ width: 390, height: 844 })
  await entrarPelaTela(cel, DONO, caixa)
  await cel.pagina.goto(`${PAINEL}/observabilidade`)
  await cel.pagina.waitForSelector("[data-problemas]")
  ok(await semRolagemDeLado(cel.pagina), "no celular, sem rolagem de lado")

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.join(" | "))
} catch (e) {
  falhou(`o conferidor quebrou: ${e instanceof Error ? e.stack : e}`)
} finally {
  pagarme.estornos = "normal"
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
  frenet.fechar?.()
  await pagarme.fechar?.()
}

process.exit(resumo())
