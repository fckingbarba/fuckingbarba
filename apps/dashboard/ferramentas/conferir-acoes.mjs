/**
 * CONFERIDOR DAS AÇÕES DO PEDIDO — "Emitir a nota agora", "Tentar a nota de
 * novo" e "Tentar o estorno de novo", pela tela, com o registro de quem
 * apertou — contra o Bling e o Pagar.me falsos.
 *
 *   (o backend com o app do Bling apontando pro falso — BLING_CLIENT_ID=cliente-de-teste
 *   BLING_CLIENT_SECRET=segredo-de-teste BLING_URL=http://127.0.0.1:4340/Api/v3
 *   BLING_AUTORIZACAO_URL=http://127.0.0.1:4340/Api/v3/oauth/authorize —, e os falsos
 *   de sempre, como no conferir-pedidos)
 *   node apps/dashboard/ferramentas/conferir-acoes.mjs
 *
 * Variáveis: as de `pecas.mjs`; NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL
 * e ADMIN_SENHA (o admin LOCAL: conectar o Bling, cancelar, conciliar),
 * MEDUSA_WEBHOOK_SEGREDO, PORTA_FALSA e PORTA_PAGARME_FALSO; e o BLING_URL do
 * backend, de onde sai a porta do Bling falso.
 *
 * O Bling falso é novo a cada rodada: a primeira coisa é conectar de novo,
 * pelo admin, como o `conferir-erp.mjs`. Durante a rodada a nota espera 30
 * minutos depois do pagamento (a janela); no fim, a janela e o estoque local
 * voltam ao que eram (conectado, o Bling sincroniza o estoque). O Bling fica
 * conectado no banco local — como depois do `conferir-erp`.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o botão onde não pode (o estorno pra operação, a nota já emitida) ou │
 * │   faltando onde devia (a nota esperando a janela, a que não saiu);     │
 * │ • a rota fazendo o que o papel não pode (operação estornando,          │
 * │   marketing emitindo), ou o que o pedido não pede (409);               │
 * │ • o clique sem linha no histórico, ou a linha sem o nome de quem       │
 * │   apertou;                                                             │
 * │ • o estorno pedido de novo com um andando; a nota saindo duas vezes;   │
 * │ • a frase que não diz no que deu; erro no console.                     │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { subirBlingFalso } from "../../loja/ferramentas/bling-falso.mjs"
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
  medusa,
  MEDUSA,
  ok,
  PAINEL,
  resumo,
  RODADA,
  subirResend,
  titulo,
} from "./pecas.mjs"

exigirAmbiente()
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
const BLING_URL = process.env.BLING_URL ?? ""
if (!CHAVE || !process.env.ADMIN_EMAIL || !process.env.ADMIN_SENHA || !BLING_URL) {
  console.log(
    "  ⚠  faltam NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL e ADMIN_SENHA (o admin LOCAL) e " +
      "o BLING_URL do backend (o app do Bling apontando pro falso)"
  )
  process.exit(1)
}

const CPF = "11144477735"
const email = (quem) => `acoes.${RODADA}.${quem}@teste.fuckingbarba.dev`
const semEspaco = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

async function esperarQue(condicao, ms = 15000) {
  for (const fim = Date.now() + ms; Date.now() < fim; await esperar(250)) {
    const v = await condicao()
    if (v) return v
  }
  return await condicao()
}

/* ── os falsos e o admin ──────────────────────────────────────────────────── */

const resend = await subirResend()
const frenet = await subirFrenetFalsa()
const pagarme = await subirPagarmeFalso({
  webhook: {
    url: `${MEDUSA}/hooks/payment/pagarme_pagarme`,
    segredo: process.env.MEDUSA_WEBHOOK_SEGREDO ?? "",
  },
})
const bling = await subirBlingFalso({
  porta: Number(new URL(BLING_URL).port),
  volta: `${MEDUSA}/hooks/erp/bling/autorizado`,
})
console.log(
  `  ⚙  Resend :${resend.porta} · Pagar.me :${pagarme.porta} · Bling :${bling.porta ?? new URL(BLING_URL).port} · painel ${PAINEL}`
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
async function adm(caminho, opcoes = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    ...opcoes,
    headers: { "content-type": "application/json", authorization: `Bearer ${tokenAdmin}` },
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}
const fabrica = fabricaDePedidos({ medusa: MEDUSA, chave: CHAVE, tokenAdmin, pagarme })
const conciliar = async () => (await adm("/admin/pagamentos/conciliar", { method: "POST" })).corpo

/* ── o que volta ao que era no fim ────────────────────────────────────────── */

async function niveisDeEstoque() {
  const { corpo } = await adm(
    "/admin/inventory-items?limit=200&fields=id,location_levels.location_id,location_levels.stocked_quantity"
  )
  return (corpo.inventory_items ?? []).flatMap((i) =>
    (i.location_levels ?? []).map((n) => ({
      item: i.id,
      local: n.location_id,
      guardado: n.stocked_quantity,
    }))
  )
}
const estoqueDeAntes = await niveisDeEstoque()
let janelaDeAntes = null

/* ── a tela ───────────────────────────────────────────────────────────────── */

const detalhe = async (token, id) =>
  (await medusa(`/dashboard/pedidos/${id}`, { metodo: "GET", token })).corpo.pedido ?? null

/** Aperta o botão e devolve a frase do aviso que aparece embaixo — o novo, deste clique. */
async function apertar(pagina, seletor) {
  const aviso = pagina.locator(".aviso")
  const antes = await aviso.getAttribute("data-vez")
  await pagina.locator(seletor).click()
  await pagina.waitForFunction(
    (vez) => {
      const a = document.querySelector(".aviso")
      return a && !a.hasAttribute("data-fora") && a.getAttribute("data-vez") !== vez
    },
    antes,
    { timeout: 60000 }
  )
  return {
    texto: semEspaco(await aviso.textContent()),
    erro: (await aviso.getAttribute("data-erro")) !== null,
  }
}
const linhasDoHistorico = async (pagina) =>
  (await pagina.locator(".historico li span").allTextContents()).map(semEspaco)

let tokenDoDono = ""

try {
  titulo("O Bling falso, conectado pelo admin")
  {
    const { corpo } = await adm("/admin/erp/conectar", { method: "POST" })
    const tela = await fetch(corpo.url, { redirect: "manual" })
    const fim = await fetch(tela.headers.get("location") ?? "", { redirect: "manual" })
    ok(
      fim.headers.get("location") === "/app/erp?conectado=1",
      "conectado, como alguém faria no admin",
      fim.headers.get("location")
    )
    janelaDeAntes = (await adm("/admin/erp")).corpo.janelaDaNota ?? null
    const { status } = await adm("/admin/erp/notas/janela", {
      method: "POST",
      body: JSON.stringify({ minutos: 30 }),
    })
    ok(status === 200, "a nota espera 30 minutos depois do pagamento (a janela)")
    const { corpo: catalogo } = await adm("/admin/products?fields=variants.sku&limit=100")
    for (const p of catalogo.products ?? [])
      for (const v of p.variants ?? []) if (v.sku) bling.produto(v.sku, 400)
  }

  titulo("Quem entra")
  const dono = await novaAba()
  const cookieDono = await entrarPelaTela(dono, DONO, caixa)
  if (!cookieDono) throw new Error("o dono não entrou (o código não chegou no Resend falso?)")
  tokenDoDono = cookieDono.value
  const nomeDoDono = (await medusa("/dashboard/eu", { metodo: "GET", token: tokenDoDono })).corpo
    .membro?.nome
  for (const [papel, quem, nome] of [
    ["operacao", `op.${RODADA}@painel.teste`, "Operação Teste"],
    ["marketing", `mkt.${RODADA}@painel.teste`, "Marketing Teste"],
  ]) {
    const r = await medusa("/dashboard/equipe", {
      token: tokenDoDono,
      corpo: { nome, email: quem, papel },
    })
    ok(r.status === 200, `convite de ${papel}`, JSON.stringify(r.corpo))
  }
  const op = await novaAba()
  const cookieOp = await entrarPelaTela(op, `op.${RODADA}@painel.teste`, caixa)
  const mkt = await novaAba()
  const cookieMkt = await entrarPelaTela(mkt, `mkt.${RODADA}@painel.teste`, caixa)
  ok(Boolean(nomeDoDono && cookieOp && cookieMkt), "operação e marketing entram")
  const tokenOp = cookieOp.value
  const tokenMkt = cookieMkt.value

  /* ── o estorno ──────────────────────────────────────────────────────────── */

  titulo("O estorno que falhou: o botão é do dono")
  const E = await fabrica.pedidoPix(email("estorno"), [["oleo-para-barba", 1]], { documento: CPF })
  await fabrica.pagar(E)
  pagarme.estornos = "segura"
  await fabrica.cancelar(E)
  const cobranca = pagarme.pedidos.get(E.noPagarme)?.pedido?.charges?.[0]
  const pedidosDeEstorno = () => pagarme.cancelamentos.filter((c) => c.cobranca === cobranca?.id)
  await conciliar()
  pagarme.falharEstorno(E.noPagarme)
  const r1 = await conciliar()
  ok(
    r1.relatorio?.estornos?.falharam?.some((x) => x.startsWith(`#${E.numero} `)),
    `o #${E.numero}: cancelado, o Pagar.me desistiu do estorno, e a conciliação viu`,
    JSON.stringify(r1.relatorio?.estornos)
  )
  // O que foi cobrado (e não voltou): o valor da cobrança no Pagar.me, em centavos.
  const valor = semEspaco(REAIS.format((cobranca?.amount ?? 0) / 100))
  {
    const d = await detalhe(tokenOp, E.id)
    const faixa = d?.faixas?.find((f) => /não saiu/.test(f.titulo))
    ok(
      d?.acoes?.estorno === false &&
        faixa &&
        !faixa.botao &&
        faixa.rodape === "Estorno é com o dono.",
      "pra operação, a faixa sem o botão, dizendo de quem é",
      JSON.stringify(faixa)
    )
    const { pagina } = op
    await pagina.goto(`${PAINEL}/pedidos/${E.id}`)
    await pagina.waitForSelector(".faixa[data-nivel=grave]")
    ok(
      (await pagina.locator('button[data-acao="estorno"]').count()) === 0 &&
        /Estorno é com o dono\./.test(await pagina.locator(".faixa").first().textContent()),
      "na tela da operação também"
    )
    const r = await medusa(`/dashboard/pedidos/${E.id}/estorno`, { token: tokenOp })
    ok(
      r.status === 403 && r.corpo.message === "sem_acesso" && pedidosDeEstorno().length === 1,
      "e a rota recusa a operação (403), sem pedir nada ao Pagar.me",
      `${r.status} ${JSON.stringify(r.corpo)}`
    )
    const m = await medusa(`/dashboard/pedidos/${E.id}/estorno`, { token: tokenMkt })
    ok(m.status === 403, "o marketing também não", String(m.status))
  }
  {
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/pedidos/${E.id}`)
    const botao = 'button[data-acao="estorno"]'
    await pagina.waitForSelector(botao)
    ok(
      semEspaco(await pagina.locator(botao).textContent()) === "Tentar o estorno de novo" &&
        semEspaco(await pagina.locator(".faixa__titulo").first().textContent()) ===
          `O estorno de ${valor} não saiu`,
      "pro dono, o botão dentro da faixa vermelha"
    )
    const primeiro = await apertar(pagina, botao)
    ok(
      !primeiro.erro &&
        primeiro.texto.startsWith(`Pedi de novo o estorno de ${valor}.`) &&
        pedidosDeEstorno().length === 2,
      "o clique pede o estorno de novo, e o aviso diz que o Pagar.me confirma em minutos",
      `${primeiro.texto} · pedidos de estorno: ${pedidosDeEstorno().length}`
    )
    await pagina.waitForFunction(
      (quem) =>
        [...document.querySelectorAll(".historico li")].some((li) =>
          li.textContent.includes(`${quem} pediu o estorno de novo`)
        ),
      nomeDoDono,
      { timeout: 15000 }
    )
    const hist = await linhasDoHistorico(pagina)
    ok(
      hist.some(
        (l) =>
          l.includes(`${nomeDoDono} pediu o estorno de novo`) &&
          l.includes("o Pagar.me aceitou — confirma em minutos")
      ),
      "o histórico ganha a linha, com o nome de quem apertou",
      hist.slice(-3).join(" | ")
    )
    const segundo = await apertar(pagina, botao)
    ok(
      segundo.texto === "O estorno está andando no Pagar.me: espere ele terminar." &&
        pedidosDeEstorno().length === 2,
      "apertar de novo com o estorno andando não pede outro",
      `${segundo.texto} · ${pedidosDeEstorno().length}`
    )

    pagarme.concluirEstorno(E.noPagarme)
    await conciliar()
    await pagina.goto(`${PAINEL}/pedidos/${E.id}`)
    await pagina.waitForSelector(".historico")
    const titulos = (await pagina.locator(".faixa__titulo").allTextContents()).map(semEspaco)
    ok(
      titulos.includes("O estorno saiu") &&
        !titulos.some((t) => /não saiu/.test(t)) &&
        (await pagina.locator(botao).count()) === 0,
      "o Pagar.me devolveu: a faixa vira a verde, sem botão",
      titulos.join(" · ")
    )
    const linhas = (await linhasDoHistorico(pagina)).filter((l) =>
      l.includes(`${nomeDoDono} pediu o estorno de novo`)
    )
    ok(
      linhas.length === 2 && linhas[1].includes("já estava andando no Pagar.me"),
      "os dois cliques ficam no histórico, cada um com no que deu",
      linhas.join(" | ")
    )
    const depois = await medusa(`/dashboard/pedidos/${E.id}/estorno`, { token: tokenDoDono })
    ok(
      depois.status === 409 && depois.corpo.message === "nada_a_fazer",
      "sem estorno pra pedir, a rota responde 409",
      String(depois.status)
    )
    const nota = await medusa(`/dashboard/pedidos/${E.id}/nota`, { token: tokenDoDono })
    ok(nota.status === 409, "e a nota de pedido cancelado não se emite (409)", String(nota.status))
  }
  pagarme.estornos = "normal"

  /* ── a nota esperando a janela ─────────────────────────────────────────── */

  titulo("A nota esperando a janela: “Emitir a nota agora”")
  const N = await fabrica.pedidoPix(email("janela"), [["balm-para-barba", 1]], { documento: CPF })
  await fabrica.pagar(N)
  const refN = `FB-${N.numero}`
  await esperarQue(() => bling.pedidoDeVenda(refN))
  {
    const d = await esperarQue(async () => {
      const x = await detalhe(tokenOp, N.id)
      return x?.acoes?.nota === "agora" ? x : null
    })
    ok(
      Boolean(d) &&
        /^Ela sai sozinha às \d\d:\d\d\. Precisa despachar antes\?/.test(d?.acoes?.dica ?? ""),
      `pago, o #${N.numero} vai pro Bling e a nota espera: o botão aparece, com a hora dela`,
      JSON.stringify(d?.acoes)
    )
    const m = await medusa(`/dashboard/pedidos/${N.id}/nota`, { token: tokenMkt })
    ok(
      m.status === 403 && !bling.notaDoPedidoDeVenda(refN),
      "o marketing não emite (403)",
      String(m.status)
    )

    const { pagina } = op
    await pagina.goto(`${PAINEL}/pedidos/${N.id}`)
    const botao = '[data-acoes] button[data-acao="nota"]'
    await pagina.waitForSelector(botao)
    ok(
      semEspaco(await pagina.locator("[data-acoes]").textContent()).includes("Emitir a nota agora"),
      "“O que fazer”, com o botão, na tela da operação"
    )
    const aviso = await apertar(pagina, botao)
    const nf = bling.notaDoPedidoDeVenda(refN)
    ok(
      !aviso.erro &&
        nf?.situacao === 5 &&
        aviso.texto === `Nota autorizada — NF-e ${nf.numero}. O pedido segue pro despacho.`,
      "o clique emite na hora, e o aviso diz o número da nota",
      `${aviso.texto} · Bling: ${nf?.situacao}/${nf?.numero}`
    )
    await pagina.waitForFunction(() => !document.querySelector("[data-acoes]"), null, {
      timeout: 15000,
    })
    const passo = semEspaco(await pagina.locator(".caminho li").nth(2).textContent())
    ok(
      (await pagina.locator(".caminho li").nth(2).getAttribute("data-feito")) !== null &&
        passo.includes(`NF-e ${nf?.numero}`),
      "a página se refaz: o passo da nota feito, e o botão some",
      passo
    )
    const hist = await linhasDoHistorico(pagina)
    ok(
      hist.some(
        (l) =>
          l.includes("Operação Teste mandou emitir a nota antes da janela") &&
          l.includes(`autorizada na hora — NF-e ${nf?.numero}`)
      ),
      "o histórico diz quem mandou emitir, e no que deu",
      hist.slice(-3).join(" | ")
    )
    const deNovo = await medusa(`/dashboard/pedidos/${N.id}/nota`, { token: tokenOp })
    ok(
      deNovo.status === 409 &&
        [...bling.notas.values()].filter((n) => n.pedido === bling.pedidoDeVenda(refN)?.id)
          .length === 1,
      "de novo, pela rota: 409, e nota nenhuma a mais no Bling",
      String(deNovo.status)
    )
  }

  /* ── a nota que a loja desistiu de emitir ───────────────────────────────── */

  titulo("A nota que não sai sozinha: “Tentar a nota de novo”")
  const F = await fabrica.pedidoPix(email("semcpf"), [["shampoo-para-barba", 1]])
  await fabrica.pagar(F)
  {
    const d = await esperarQue(async () => {
      const x = await detalhe(tokenDoDono, F.id)
      return x?.acoes?.nota === "de-novo" ? x : null
    })
    const faixa = d?.faixas?.find((f) => f.titulo === "A nota não sai sozinha")
    ok(
      faixa?.botao === "nota" && /CPF\/CNPJ/.test(faixa?.texto ?? ""),
      `pago sem CPF, o #${F.numero}: a faixa diz por quê, com o botão`,
      JSON.stringify(faixa)
    )
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/pedidos/${F.id}`)
    const botao = '.faixa button[data-acao="nota"]'
    await pagina.waitForSelector(botao)
    ok(
      semEspaco(await pagina.locator(botao).textContent()) === "Tentar a nota de novo",
      "na tela: “Tentar a nota de novo”, dentro da faixa"
    )
    const sem = await apertar(pagina, botao)
    ok(
      sem.erro &&
        sem.texto ===
          "A nota não saiu: o pedido não tem CPF/CNPJ, e a nota precisa. Corrija o que falta e tente de novo.",
      "ainda sem CPF: o aviso diz que não saiu, e o que fazer",
      sem.texto
    )
    await pagina.waitForFunction(
      (quem) =>
        [...document.querySelectorAll(".historico li")].some((li) =>
          li.textContent.includes(`${quem} mandou tentar a nota de novo`)
        ),
      nomeDoDono,
      { timeout: 15000 }
    )
    ok(
      (await linhasDoHistorico(pagina)).some(
        (l) => l.includes(`${nomeDoDono} mandou tentar a nota de novo`) && l.includes("não saiu: ")
      ),
      "e o histórico guarda a tentativa"
    )

    // A equipe põe o CPF no pedido (no admin, como no conferir-erp) e tenta de novo.
    const { corpo: lido } = await adm(`/admin/orders/${F.id}?fields=*billing_address`)
    const end = lido.order?.billing_address ?? {}
    const CAMPOS = ["first_name", "last_name", "phone", "company", "address_1", "address_2"]
    CAMPOS.push("city", "country_code", "province", "postal_code")
    await adm(`/admin/orders/${F.id}`, {
      method: "POST",
      body: JSON.stringify({
        billing_address: {
          ...Object.fromEntries(CAMPOS.filter((k) => end[k] != null).map((k) => [k, end[k]])),
          metadata: { ...(end.metadata ?? {}), documento: { tipo: "cpf", valor: CPF } },
        },
      }),
    })
    await pagina.goto(`${PAINEL}/pedidos/${F.id}`)
    await pagina.waitForSelector(botao)
    const com = await apertar(pagina, botao)
    const nf = bling.notaDoPedidoDeVenda(`FB-${F.numero}`)
    ok(
      !com.erro &&
        nf?.situacao === 5 &&
        com.texto.startsWith(`Nota autorizada — NF-e ${nf.numero}.`),
      "com o CPF posto, o mesmo botão emite a nota",
      com.texto
    )
    await pagina.waitForFunction(
      () =>
        ![...document.querySelectorAll(".faixa__titulo")].some((t) =>
          t.textContent.includes("A nota não sai sozinha")
        ),
      null,
      { timeout: 15000 }
    )
    ok(true, "e a faixa some")
  }

  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.slice(0, 5).join(" | "))
} catch (e) {
  falhou(e instanceof Error ? e.message : String(e))
} finally {
  pagarme.estornos = "normal"
  if (janelaDeAntes !== null)
    await adm("/admin/erp/notas/janela", {
      method: "POST",
      body: JSON.stringify({ minutos: janelaDeAntes }),
    }).catch(() => {})
  for (const n of estoqueDeAntes)
    await adm(`/admin/inventory-items/${n.item}/location-levels/${n.local}`, {
      method: "POST",
      body: JSON.stringify({ stocked_quantity: n.guardado }),
    }).catch(() => {})
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
  await frenet.fechar?.()
  pagarme.fechar?.()
  bling.fechar()
}

process.exit(resumo())
