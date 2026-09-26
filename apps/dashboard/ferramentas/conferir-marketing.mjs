/**
 * CONFERIDOR DO MARKETING — o Resumo (os cinco números do período, a meta
 * do mês, a receita no tempo e os mais vendidos), pela tela e pela API,
 * com as visitas de um Google falso (`google-falso.mjs`).
 *
 *   (o backend com as variáveis do GA4 apontando pro falso — as mesmas do
 *   `conferir-visitas.mjs`, com GA4_CACHE_SEGUNDOS=0)
 *   node apps/dashboard/ferramentas/conferir-marketing.mjs
 *
 * Variáveis: as de `pecas.mjs`, e GA4_PROPERTY_ID, GA4_CREDENCIAIS e
 * GA4_API_URL do backend. Os pedidos são os do banco local: o conferidor
 * confere a conta por dentro (o gráfico soma o número de cima, o ticket é
 * a receita ÷ os pedidos, a conversão é pedidos ÷ visitas) — a regra de
 * cada número tem os testes de unidade do backend
 * (`lib/painel/__tests__/marketing.unit.spec.ts`).
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • a operação abrindo o Marketing (tela, menu ou API), ou o marketing   │
 * │   mudando a meta;                                                      │
 * │ • o número de cima diferente do gráfico, ou o período errado (7 barras │
 * │   no "7 dias", 13 semanas nos 90);                                     │
 * │ • as visitas do período fora do que o Google contou, ou comparadas em  │
 * │   horas que ele ainda não somou; a pergunta sem o filtro do endereço   │
 * │   da loja (o Analytics é o mesmo do site antigo);                      │
 * │ • a meta que não salva, não volta, ou aceita "abc";                    │
 * │ • o funil sem a maior perda, fora de ordem, ou contando o page_view;   │
 * │ • o produto sem as visitas das variantes dele, ou fora de ordem; a     │
 * │   oferta do checkout sem o código BUMP-, o cupom contando ela;         │
 * │ • o canal que soma errado, o anúncio junto da busca, as compras do     │
 * │   site antigo entrando (o filtro é o id do pedido), o link de campanha │
 * │   com acento ou sem a página;                                          │
 * │ • a primeira compra e a volta fora dos pedidos do Resumo (ou passando  │
 * │   de 100%), o estado que não soma a receita, a newsletter diferente;   │
 * │ • o Pix ou o cartão fora da conta (a tentativa sem motivo, os pagos    │
 * │   fora dos pedidos do Resumo), o atalho do frete pra quem não é dono;  │
 * │ • o Google fora quebrando a tela; dado de cliente na resposta;         │
 * │ • rolagem de lado no celular; erro no console.                         │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { createPrivateKey, createPublicKey } from "node:crypto"
import { subirGoogleFalso } from "./google-falso.mjs"
import {
  abrirNavegador,
  caixaDoResend,
  caminho,
  DONO,
  doConvite,
  entrar as entrarPelaTela,
  esperar,
  exigirAmbiente,
  falhou,
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

function lerChave(bruto) {
  let texto = String(bruto ?? "").trim()
  if (!texto) return null
  if (!texto.startsWith("{")) texto = Buffer.from(texto, "base64").toString("utf8")
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}
const conta = lerChave(process.env.GA4_CREDENCIAIS)
const PROPRIEDADE = (process.env.GA4_PROPERTY_ID ?? "").trim()
const API = process.env.GA4_API_URL ?? ""
if (!conta?.private_key || !PROPRIEDADE || !API) {
  console.log(
    "  ⚠  faltam GA4_CREDENCIAIS, GA4_PROPERTY_ID e GA4_API_URL (as mesmas do backend, apontando " +
      "pro Google falso) — ver AGENTS.md"
  )
  process.exit(1)
}

const semEspaco = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
const INTEIRO = new Intl.NumberFormat("pt-BR")
const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const reais = (v) => REAIS.format(v).replace(/\s/g, " ")
const centavos = (v) => Math.round(v * 100) / 100
const perto = (a, b) => Math.abs(a - b) < 0.011
/** A aba acesa inteira à vista na fileira (no celular a fileira rola de lado). */
const abaAcesaAVista = () => {
  const n = document.querySelector(".abas")?.getBoundingClientRect()
  const a = document.querySelector('.abas [aria-current="page"]')?.getBoundingClientRect()
  return Boolean(n && a && a.left >= n.left - 1 && a.right <= n.right + 1)
}

/* ── o Google falso: 14 dias inteiros e o hoje até agora ─────────────────── */

const DIA_MS = 24 * 60 * 60 * 1000
const DIA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
const HORA = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  hourCycle: "h23",
})
const diaDoGa4 = (atras) => DIA.format(Date.now() - atras * DIA_MS).replace(/-/g, "")
const HORA_AGORA = Number(HORA.format(Date.now()))
/** Quantas visitas por hora o dia de `atras` dias atrás tem (hoje: 5). */
const porHora = (atras) => (atras === 0 ? 5 : 10 + atras)

const google = await subirGoogleFalso({
  porta: Number(new URL(API).port),
  propriedade: PROPRIEDADE,
  chavePublica: createPublicKey(createPrivateKey(conta.private_key)),
  email: conta.client_email,
  aud: conta.token_uri,
})
google.dia = {
  horas: Array.from({ length: 14 }, (_, atras) =>
    Array.from({ length: atras === 0 ? HORA_AGORA + 1 : 24 }, (_, h) => ({
      dia: diaDoGa4(atras),
      hora: String(h).padStart(2, "0"),
      visitas: porHora(atras),
    }))
  ).flat(),
  origens: [],
  paginas: [],
  agora: 0,
}
/**
 * As visitas de 7 dias que o backend tem que contar: os 6 dias inteiros de
 * antes e o hoje até a hora de agora (sem ela — o Google em dia); o de antes,
 * os 6 dias inteiros antes dele e o dia de 7 atrás até a mesma hora.
 */
const ATE = HORA_AGORA
const SETE_DIAS = porHora(0) * ATE + [1, 2, 3, 4, 5, 6].reduce((s, a) => s + porHora(a) * 24, 0)
const SETE_ANTES =
  porHora(7) * ATE + [8, 9, 10, 11, 12, 13].reduce((s, a) => s + porHora(a) * 24, 0)

const resend = await subirResend()
const caixa = caixaDoResend(resend)
const { navegador, novaAba, errosDeConsole } = await abrirNavegador()
console.log(`  ⚙  Google falso :${google.porta} · Resend :${resend.porta} · painel ${PAINEL}`)

let tokenDoDono = ""
let metaDeAntes = null
let mexeuNaMeta = false

try {
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
  const convite = await caixa.esperarEmail(`mkt.${RODADA}@painel.teste`, doConvite, 0)
  ok(
    /Marketing/.test(
      semEspaco(`${convite?.text ?? ""} ${convite?.html ?? ""}`.replace(/<[^>]+>/g, " "))
    ),
    "o convite do marketing já lista a área Marketing"
  )
  const op = await novaAba()
  const cookieOp = await entrarPelaTela(op, `op.${RODADA}@painel.teste`, caixa)
  const mkt = await novaAba({ width: 375, height: 812 })
  const cookieMkt = await entrarPelaTela(mkt, `mkt.${RODADA}@painel.teste`, caixa)
  ok(Boolean(cookieOp && cookieMkt), "operação e marketing entram")

  titulo("Quem abre o Marketing")
  ok((await menu(dono.pagina)).includes("Marketing"), "o menu do dono tem o Marketing")
  ok(!(await menu(op.pagina)).includes("Marketing"), "o da operação, não")
  await op.pagina.goto(`${PAINEL}/marketing`)
  ok(
    (await textoDe(op.pagina, "h1")) === "Essa área não é do seu papel",
    "a operação, pelo endereço na mão, vê “sem acesso”"
  )
  for (const rota of ["/dashboard/marketing", "/dashboard/marketing/visitas"]) {
    const r = await medusa(rota, { metodo: "GET", token: cookieOp.value })
    ok(r.status === 403, `a API responde 403 pra operação (${rota})`, String(r.status))
  }

  titulo("O Resumo, pela API")
  const ler = async (periodo, token = tokenDoDono) =>
    await medusa(`/dashboard/marketing${periodo ? `?periodo=${periodo}` : ""}`, {
      metodo: "GET",
      token,
    })
  const r30 = await ler("30d")
  const t = r30.corpo
  metaDeAntes = t.meta?.valor ?? null
  ok(
    r30.status === 200 && t.periodo === "30d" && t.mudaAMeta === true,
    "o dono recebe o Resumo, e pode mudar a meta",
    JSON.stringify(t).slice(0, 200)
  )
  ok((await ler()).corpo.periodo === "30d", "sem período, 30 dias (o protótipo)")
  ok((await ler("1ano")).corpo.periodo === "30d", "período que não existe, 30 dias")
  const barras = t.serie?.barras ?? []
  ok(
    barras.length === 30 && barras.at(-1)?.rotulo === "hoje",
    "30 dias: 30 barras, a última é hoje",
    String(barras.length)
  )
  ok(
    perto(
      barras.reduce((s, b) => s + b.valor, 0),
      t.numeros.receita.valor
    ) && barras.reduce((s, b) => s + b.pedidos, 0) === t.numeros.pedidos.valor,
    "o gráfico soma o número de cima (a receita e os pedidos)",
    `${t.numeros.receita.valor} · ${t.numeros.pedidos.valor}`
  )
  ok(
    t.numeros.pedidos.valor
      ? perto(t.numeros.ticket.valor, centavos(t.numeros.receita.valor / t.numeros.pedidos.valor))
      : t.numeros.ticket.valor === 0,
    "o ticket é a receita ÷ os pedidos",
    JSON.stringify(t.numeros.ticket)
  )
  ok(
    t.numeros.receita.antes > 0
      ? t.numeros.receita.variacao ===
          Math.round(
            ((t.numeros.receita.valor - t.numeros.receita.antes) / t.numeros.receita.antes) * 100
          )
      : t.numeros.receita.variacao === null,
    "a comparação com o período de antes (e nenhuma, sem nada antes)",
    JSON.stringify(t.numeros.receita)
  )
  ok(
    (t.maisVendidos ?? []).length <= 5 &&
      (t.maisVendidos ?? []).every((p, i, l) => i === 0 || l[i - 1].receita >= p.receita),
    "os mais vendidos: até 5, do que mais vendeu pro que menos",
    JSON.stringify(t.maisVendidos).slice(0, 200)
  )
  ok(!JSON.stringify(t).includes("@"), "nenhum e-mail de cliente na resposta")
  const r7 = (await ler("7d")).corpo
  const r90 = (await ler("90d")).corpo
  const rHoje = (await ler("hoje")).corpo
  ok(
    r7.serie.barras.length === 7 &&
      r90.serie.barras.length === 13 &&
      r90.serie.barras.at(-1).rotulo === "esta" &&
      rHoje.serie.barras.length >= HORA_AGORA + 1 &&
      rHoje.serie.barras.length <= HORA_AGORA + 2,
    "7 dias: 7 barras; 90: 13 semanas; hoje: hora a hora até agora",
    [r7.serie.barras.length, r90.serie.barras.length, rHoje.serie.barras.length].join(" · ")
  )
  const doMkt = await ler("30d", cookieMkt.value)
  ok(
    doMkt.status === 200 && doMkt.corpo.mudaAMeta === false,
    "o marketing recebe o Resumo, mas não muda a meta",
    String(doMkt.status)
  )

  titulo("As visitas e a conversão, do Google")
  {
    const r = await medusa("/dashboard/marketing/visitas?periodo=7d", {
      metodo: "GET",
      token: tokenDoDono,
    })
    const v = r.corpo
    ok(
      v.estado === "ok" && v.visitas.valor === SETE_DIAS && v.visitas.antes === SETE_ANTES,
      `7 dias: ${SETE_DIAS} visitas, contra ${SETE_ANTES} — o hoje até a hora que o Google somou, nos dois`,
      JSON.stringify(v).slice(0, 220)
    )
    ok(
      v.visitas.valor
        ? v.conversao.valor === Math.round((v.pedidos.valor / v.visitas.valor) * 10_000) / 100
        : v.conversao.valor === null,
      "a conversão é pedidos pagos ÷ visitas, no mesmo corte",
      JSON.stringify(v.conversao)
    )
    ok(
      v.pedidos.valor <= r7.numeros.pedidos.valor,
      "os pedidos da conversão param na hora das visitas (nunca mais que os do período)",
      `${v.pedidos.valor} · ${r7.numeros.pedidos.valor}`
    )
    const pergunta = google.perguntas.filter((p) => p.tipo === "batchRunReports").at(-1)?.corpo
      ?.requests?.[0]
    ok(
      pergunta?.dateRanges?.[0]?.startDate === "13daysAgo" &&
        pergunta?.dateRanges?.[0]?.endDate === "today" &&
        pergunta?.dimensionFilter?.filter?.fieldName === "hostName" &&
        (pergunta?.dimensionFilter?.filter?.inListFilter?.values ?? []).length > 0,
      "a pergunta: os 14 dias numa chamada, só do endereço da loja",
      JSON.stringify(pergunta).slice(0, 220)
    )
    const hoje = (
      await medusa("/dashboard/marketing/visitas?periodo=hoje", {
        metodo: "GET",
        token: tokenDoDono,
      })
    ).corpo
    ok(
      hoje.estado === "ok" &&
        hoje.visitas.valor === porHora(0) * ATE &&
        hoje.visitas.antes === porHora(1) * ATE &&
        hoje.ate === ATE,
      "hoje: contra ontem até a mesma hora",
      JSON.stringify(hoje).slice(0, 200)
    )
  }

  titulo("A tela do dono")
  {
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/marketing`)
    await pagina.waitForSelector('[data-kpi="visitas"] .kpi__valor')
    await pagina.waitForFunction(
      () => document.querySelector('[data-kpi="visitas"] .kpi__valor')?.textContent !== "…",
      null,
      { timeout: 15000 }
    )
    ok((await textoDe(pagina, "h1")) === "Marketing", "a tela abre")
    ok(
      semEspaco(await textoDe(pagina, '[data-kpi="receita"] .kpi__valor')) ===
        reais(t.numeros.receita.valor),
      "a receita da tela é a da API",
      await textoDe(pagina, '[data-kpi="receita"]')
    )
    ok(
      (await pagina.locator('.filtro[aria-current="page"]').getAttribute("data-periodo")) === "30d",
      "abre nos 30 dias"
    )
    await pagina.locator('.filtro[data-periodo="7d"]').click()
    await pagina.waitForURL(/periodo=7d/)
    await pagina.waitForSelector('.barras-v[data-barras="7"]')
    await pagina.waitForFunction(
      () => document.querySelector('[data-kpi="visitas"] .kpi__valor')?.textContent !== "…",
      null,
      { timeout: 15000 }
    )
    ok(
      semEspaco(await textoDe(pagina, '[data-kpi="visitas"] .kpi__valor')) ===
        INTEIRO.format(SETE_DIAS),
      "no “7 dias”: o gráfico de 7 barras e as visitas do Google",
      await textoDe(pagina, '[data-kpi="visitas"]')
    )
    ok(
      /%|—/.test(await textoDe(pagina, '[data-kpi="conversao"] .kpi__valor')),
      "a conversão aparece",
      await textoDe(pagina, '[data-kpi="conversao"]')
    )
  }

  titulo("A meta do mês")
  {
    let r = await medusa("/dashboard/marketing/meta", {
      token: cookieMkt.value,
      corpo: { valor: "1000" },
    })
    ok(r.status === 403, "o marketing não muda a meta (403)", String(r.status))
    r = await medusa("/dashboard/marketing/meta", { token: tokenDoDono, corpo: { valor: "abc" } })
    ok(r.status === 422 && r.corpo.erro === "valor_invalido", "“abc” é recusado", String(r.status))
    mexeuNaMeta = true
    r = await medusa("/dashboard/marketing/meta", {
      token: tokenDoDono,
      corpo: { valor: "12.345,67" },
    })
    ok(
      r.status === 200 && r.corpo.valor === 12345.67,
      "o dono salva “12.345,67”",
      JSON.stringify(r.corpo)
    )
    const m = (await ler("30d")).corpo.meta
    ok(
      m.valor === 12345.67 &&
        (m.feito >= m.valor
          ? m.porDia === null
          : perto(m.porDia, centavos((m.valor - m.feito) / m.restam))),
      "a meta volta no Resumo, com quanto falta por dia (contando hoje)",
      JSON.stringify(m)
    )

    const { pagina } = dono
    await pagina.goto(`${PAINEL}/marketing`)
    await pagina.locator("[data-mudar-meta]").click()
    const campo = pagina.locator(".meta-form input")
    await campo.fill("15.000")
    await campo.press("Enter")
    await pagina.waitForFunction(
      () =>
        /R\$\s?15\.000,00/.test(
          document.querySelector('[data-meta="com"] .bloco__sub')?.textContent ?? ""
        ),
      null,
      { timeout: 15000 }
    )
    ok(
      /Meta do mês salva/.test(semEspaco(await textoDe(pagina, ".aviso"))),
      "pela tela: “Mudar a meta”, 15.000 e Enter — o aviso e o bloco novo",
      await textoDe(pagina, '[data-meta="com"]')
    )
    await pagina.locator("[data-mudar-meta]").click()
    await pagina.locator(".meta-form input").press("Escape")
    ok((await pagina.locator(".meta-form").count()) === 0, "Esc desiste do campo")

    const { pagina: celular } = mkt
    await celular.goto(`${PAINEL}/marketing`)
    await celular.waitForSelector('[data-meta="com"]')
    ok(
      (await celular.locator("[data-mudar-meta]").count()) === 0,
      "o marketing vê a meta, sem o botão de mudar"
    )
    ok(await semRolagemDeLado(celular), "no celular, sem rolar de lado")
    ok(
      caminho(celular) === "/marketing" && (await menu(celular)).includes("Marketing"),
      "o menu do marketing tem o Marketing"
    )
  }

  titulo("O Funil")
  google.marketing = {
    sessoes: 1000,
    // O page_view não é passo: a pergunta pede só os cinco eventos do funil.
    eventos: {
      page_view: 5000,
      view_item: 600,
      add_to_cart: 120,
      begin_checkout: 50,
      add_shipping_info: 40,
      add_payment_info: 30,
    },
    compras: 10,
    aparelhos: { mobile: 700, tablet: 50, desktop: 250 },
    origens: [
      { fonte: "instagram", meio: "social", campanha: "stories-setembro", visitas: 100 },
      { fonte: "l.instagram.com", meio: "referral", campanha: "(referral)", visitas: 50 },
      { fonte: "google", meio: "organic", campanha: "(organic)", visitas: 80 },
      { fonte: "google", meio: "cpc", campanha: "black-friday", visitas: 20 },
      { fonte: "(direct)", meio: "(none)", campanha: "(direct)", visitas: 30 },
    ],
    vendas: [
      {
        fonte: "instagram",
        meio: "social",
        campanha: "stories-setembro",
        pedidos: 3,
        receita: 300,
      },
      { fonte: "google", meio: "organic", campanha: "(organic)", pedidos: 2, receita: 200 },
      { fonte: "google", meio: "cpc", campanha: "black-friday", pedidos: 1, receita: 150 },
    ],
  }
  {
    const r = await medusa("/dashboard/marketing/funil?periodo=30d", {
      metodo: "GET",
      token: tokenDoDono,
    })
    const f = r.corpo
    ok(
      r.status === 200 &&
        f.estado === "ok" &&
        JSON.stringify(f.site?.map((p) => p.n)) ===
          JSON.stringify([1000, 600, 120, 50, 40, 30, 10]),
      "do site até o pagamento: as sessões de cada passo, e as compras da loja no fim",
      JSON.stringify(f.site?.map((p) => p.n))
    )
    ok(
      f.site?.findIndex((p) => p.pior) === 2 &&
        f.achados?.[0]?.titulo === "8 em cada 10 que veem um produto não põem na sacola",
      "a maior perda, marcada e em frase",
      JSON.stringify(f.achados)
    )
    const passos = (f.checkout ?? []).map((p) => p.n)
    ok(
      passos.length === 6 && passos.every((n, i) => i === 0 || n <= passos[i - 1]),
      "da sacola ao pagamento: 6 passos, cada um cabe no anterior (os carrinhos do banco)",
      JSON.stringify(passos)
    )
    ok(
      f.aparelhos?.[0]?.nome === "Celular" &&
        f.aparelhos[0].visitas === 750 &&
        f.aparelhos[0].parte === 75 &&
        f.aparelhos[1].visitas === 250 &&
        f.aparelhos.every(
          (a) => a.conversao === Math.round((a.pedidos / a.visitas) * 10_000) / 100
        ),
      "celular e computador: o tablet é celular, e a conversão é pedidos ÷ visitas",
      JSON.stringify(f.aparelhos)
    )
    const lote = google.perguntas
      .filter((p) => p.tipo === "batchRunReports")
      .map((p) => p.corpo.requests)
      .find((rs) => rs?.length === 4)
    ok(
      lote?.[0]?.dateRanges?.[0]?.startDate === "29daysAgo" &&
        lote?.[1]?.dimensionFilter?.andGroup?.expressions?.length === 2 &&
        lote?.[2]?.dimensionFilter?.filter?.fieldName === "transactionId",
      "as quatro perguntas numa chamada: os eventos só do endereço da loja, as compras pelo id do pedido",
      JSON.stringify(lote?.[1]?.dimensionFilter).slice(0, 200)
    )
    const daOperacao = await medusa("/dashboard/marketing/funil", {
      metodo: "GET",
      token: cookieOp.value,
    })
    ok(daOperacao.status === 403, "a operação não abre o funil (403)", String(daOperacao.status))

    const { pagina } = dono
    await pagina.goto(`${PAINEL}/marketing/funil?periodo=30d`)
    await pagina.waitForSelector('[data-funil="site"]', { timeout: 20000 })
    ok(
      (await pagina.locator('[data-funil="site"] .funil__passo').count()) === 7 &&
        /a maior perda: 80% saem aqui/.test(
          await textoDe(pagina, '[data-funil="site"] .funil__passo[data-pior]')
        ),
      "a tela: os 7 passos, e a maior perda em vermelho",
      await textoDe(pagina, '[data-funil="site"] .funil__passo[data-pior]')
    )
    ok(
      /75%/.test(await textoDe(pagina, '[data-aparelho="Celular"]')) &&
        (await pagina.locator('.abas a[aria-current="page"]').getAttribute("data-aba")) === "funil",
      "o celular com 75% das visitas, e a aba do funil acesa"
    )
    await pagina.locator('.filtro[data-periodo="7d"]').click()
    await pagina.waitForURL(/\/marketing\/funil\?periodo=7d/)
    await pagina.locator('.abas a[data-aba="canais"]').click()
    await pagina.waitForURL(/\/marketing\/canais\?periodo=7d/)
    ok(
      caminho(pagina) === "/marketing/canais" &&
        new URL(pagina.url()).searchParams.get("periodo") === "7d",
      "o período troca sem sair da aba, e a aba nova leva o período junto",
      pagina.url()
    )
  }

  titulo("Os Canais")
  {
    const r = await medusa("/dashboard/marketing/canais?periodo=30d", {
      metodo: "GET",
      token: tokenDoDono,
    })
    const c = r.corpo
    ok(
      r.status === 200 &&
        c.estado === "ok" &&
        JSON.stringify(
          c.canais.map((l) => [l.nome, l.visitas, l.pedidos, l.receita, l.conversao])
        ) ===
          JSON.stringify([
            ["Instagram", 150, 3, 300, 2],
            ["Google (busca)", 80, 2, 200, 2.5],
            ["Google (anúncio)", 20, 1, 150, 5],
            ["Direto", 30, 0, 0, 0],
          ]),
      "os canais: somados pelo nome, com o anúncio separado da busca",
      JSON.stringify(c.canais)
    )
    ok(
      JSON.stringify(c.campanhas?.map((x) => [x.nome, x.canal])) ===
        JSON.stringify([
          ["stories-setembro", "Instagram"],
          ["black-friday", "Google (anúncio)"],
        ]),
      "as campanhas: só as do link com UTM, com o canal",
      JSON.stringify(c.campanhas)
    )
    ok(
      c.semOrigem?.pedidos === Math.max(0, c.pagos.pedidos - 6) &&
        perto(c.semOrigem.receita, Math.max(0, centavos(c.pagos.receita - 650))),
      "o que a loja vendeu e o Google não viu fica sem origem",
      JSON.stringify([c.pagos, c.semOrigem])
    )
    ok(
      typeof c.loja === "string" &&
        c.paginas?.[0]?.caminho === "/" &&
        c.paginas.some((p) => p.caminho.startsWith("/produtos/")),
      "o endereço da loja e as páginas, pro montador de link",
      JSON.stringify(c.paginas?.slice(0, 3))
    )
    const lote = google.perguntas
      .filter((p) => p.tipo === "batchRunReports")
      .map((p) => p.corpo.requests)
      .find((rs) => rs?.length === 2)
    ok(
      lote?.[0]?.dimensionFilter?.filter?.fieldName === "hostName" &&
        lote?.[1]?.dimensionFilter?.filter?.fieldName === "transactionId",
      "as visitas só do endereço da loja; as vendas, pelo id do pedido",
      JSON.stringify(lote).slice(0, 200)
    )

    const { pagina, contexto } = dono
    await contexto.grantPermissions(["clipboard-read", "clipboard-write"], { origin: PAINEL })
    await pagina.goto(`${PAINEL}/marketing/canais?periodo=30d`)
    await pagina.waitForSelector('[data-bloco="canais"] tbody tr[data-canal]', { timeout: 20000 })
    ok(
      (await pagina.locator('[data-bloco="canais"] tbody tr[data-canal]').count()) ===
        4 + (c.semOrigem.pedidos ? 1 : 0) &&
        (await pagina.locator('[data-bloco="campanhas"] tbody tr').count()) === 2,
      "as tabelas: os canais (e a linha sem origem, quando houver) e as campanhas"
    )
    ok(
      (await textoDe(pagina, "[data-achados] .achado__titulo")) ===
        "Google (busca) vende mais por visita; Instagram traz mais gente",
      "o achado dos canais",
      await textoDe(pagina, "[data-achados]")
    )
    const montador = pagina.locator("[data-montar-link]")
    await montador.locator("input").fill("Stories de Outubro!")
    await montador.locator("select").first().selectOption("influenciador|social")
    const produto = c.paginas.find((p) => p.caminho.startsWith("/produtos/"))
    await montador.locator("select").nth(1).selectOption(produto.caminho)
    const montado = await montador.locator("code").getAttribute("data-link")
    ok(
      montado ===
        `${c.loja}${produto.caminho}?utm_source=influenciador&utm_medium=social&utm_campaign=stories-de-outubro`,
      "o montador de link: o nome sem acento, a origem e a página",
      montado
    )
    await montador.locator("button").click()
    await pagina.waitForFunction(
      () => /Link copiado/.test(document.querySelector(".aviso")?.textContent ?? ""),
      null,
      { timeout: 5000 }
    )
    ok(
      (await pagina.evaluate(() => navigator.clipboard.readText())) === montado,
      "o Copiar põe o link na área de transferência"
    )

    await pagina.goto(`${PAINEL}/marketing?periodo=30d`)
    await pagina.waitForSelector("[data-canais-do-resumo] .topo3 li", { timeout: 20000 })
    ok(
      /^1\s*Instagram/.test(semEspaco(await textoDe(pagina, "[data-canais-do-resumo] .topo3 li"))),
      "no Resumo, os canais que mais venderam",
      await textoDe(pagina, "[data-canais-do-resumo]")
    )

    const { pagina: celular } = mkt
    await celular.goto(`${PAINEL}/marketing/canais?periodo=30d`)
    await celular.waitForSelector('.cartoes [data-canal="Instagram"]', { timeout: 20000 })
    ok(await semRolagemDeLado(celular), "no celular: os canais em cartões, sem rolar de lado")
    await celular.goto(`${PAINEL}/marketing/funil?periodo=30d`)
    await celular.waitForSelector('[data-funil="site"]', { timeout: 20000 })
    ok(await semRolagemDeLado(celular), "e o funil também")
  }

  titulo("Os Produtos")
  {
    const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
    const { products } = await (
      await fetch(`${MEDUSA}/store/products?fields=id,handle,title,*variants&limit=50`, {
        headers: { "x-publishable-api-key": CHAVE },
      })
    ).json()
    const [p1, p2] = products.filter((p) => p.variants?.length)
    google.marketing.itens = {
      [p1.variants[0].id]: [300, 15],
      [p2.variants[0].id]: [100, 20],
    }
    const r = await medusa("/dashboard/marketing/produtos?periodo=30d", {
      metodo: "GET",
      token: tokenDoDono,
    })
    const lista = r.corpo.produtos ?? []
    const um = lista.find((p) => p.id === p1.id)
    const dois = lista.find((p) => p.id === p2.id)
    ok(
      r.status === 200 &&
        r.corpo.estado === "ok" &&
        um?.visitas === 300 &&
        um?.sacola === 5 &&
        dois?.visitas === 100 &&
        dois?.sacola === 20,
      "as visitas e a sacola de cada produto, pelas variantes",
      JSON.stringify([um, dois])
    )
    ok(
      lista.length > 0 &&
        lista.every((p, i) => i === 0 || lista[i - 1].receita >= p.receita) &&
        lista.every((p) => p.sinais?.length),
      "do que mais vendeu pro que menos, cada um com o sinal",
      JSON.stringify(lista.map((p) => [p.nome, p.receita, p.sinais])).slice(0, 300)
    )
    const resumo30 = (
      await medusa("/dashboard/marketing?periodo=30d", { metodo: "GET", token: tokenDoDono })
    ).corpo
    ok(
      resumo30.maisVendidos.every((m) => lista.some((p) => perto(p.receita, m.receita))),
      "a receita de cada produto bate com os mais vendidos do Resumo",
      JSON.stringify(resumo30.maisVendidos.map((m) => [m.nome, m.receita]))
    )
    const pergunta = google.perguntas
      .filter((p) => p.tipo === "batchRunReports")
      .map((p) => p.corpo.requests?.[0])
      .find((q) => q?.dimensions?.[0]?.name === "itemId")
    ok(
      pergunta?.dimensionFilter?.filter?.fieldName === "itemId" &&
        pergunta?.dimensionFilter?.filter?.stringFilter?.value === "variant_" &&
        JSON.stringify(pergunta?.metrics?.map((m) => m.name)) ===
          JSON.stringify(["itemsViewed", "itemsAddedToCart"]),
      "a pergunta: as vezes vista e posta na sacola, só das variantes da loja",
      JSON.stringify(pergunta).slice(0, 200)
    )
    const daOperacao = await medusa("/dashboard/marketing/produtos", {
      metodo: "GET",
      token: cookieOp.value,
    })
    ok(
      daOperacao.status === 403,
      "a operação não abre os produtos (403)",
      String(daOperacao.status)
    )

    const { pagina } = dono
    await pagina.goto(`${PAINEL}/marketing/produtos?periodo=30d`)
    await pagina.waitForSelector('[data-bloco="produtos"] tbody tr[data-produto]', {
      timeout: 20000,
    })
    ok(
      (await pagina.locator('[data-bloco="produtos"] tbody tr[data-produto]').count()) ===
        lista.length && (await textoDe(pagina, `tr[data-produto="${p1.id}"]`)).includes("300"),
      "a tela: um produto por linha, com as visitas",
      await textoDe(pagina, `tr[data-produto="${p1.id}"]`)
    )
    await pagina.locator(`tr[data-produto="${p1.id}"] a`).click()
    await pagina.waitForURL((u) => u.pathname === `/produtos/${p1.id}`, { timeout: 20000 })
    ok(caminho(pagina) === `/produtos/${p1.id}`, "tocar no produto abre a página dele no painel")

    const { pagina: celular } = mkt
    await celular.goto(`${PAINEL}/marketing/produtos?periodo=30d`)
    await celular.waitForSelector(`.cartoes [data-produto="${p1.id}"]`, { timeout: 20000 })
    ok(await semRolagemDeLado(celular), "no celular: os produtos em cartões, sem rolar de lado")
  }

  titulo("As Ofertas")
  {
    const r = await medusa("/dashboard/marketing/ofertas?periodo=30d", {
      metodo: "GET",
      token: tokenDoDono,
    })
    const o = r.corpo
    const resumo30 = (
      await medusa("/dashboard/marketing?periodo=30d", { metodo: "GET", token: tokenDoDono })
    ).corpo
    const { unidades, checkout } = o.numeros ?? {}
    ok(
      r.status === 200 &&
        o.porProduto?.length > 0 &&
        o.porProduto.every(
          (p) => p.resultado.modo === "unidades" || p.resultado.modo === "junto"
        ) &&
        unidades.parte ===
          (unidades.pedidos ? Math.round((unidades.comMais / unidades.pedidos) * 100) : null),
      "a caixa de cada produto publicado, e a conta dos cartões de quantidade",
      JSON.stringify(o.numeros)
    )
    ok(
      checkout.pedidos <= resumo30.numeros.pedidos.valor &&
        checkout.deCada ===
          (checkout.pedidos ? Math.round(resumo30.numeros.pedidos.valor / checkout.pedidos) : null),
      "a oferta do checkout: 1 em cada N dos pedidos pagos do período",
      JSON.stringify([checkout, resumo30.numeros.pedidos])
    )
    ok(
      (o.cupons ?? []).every((c) => c.usos >= 1 && !c.codigo.startsWith("BUMP-")),
      "os cupons: os códigos usados, sem os da oferta do checkout",
      JSON.stringify(o.cupons).slice(0, 200)
    )
    const daOperacao = await medusa("/dashboard/marketing/ofertas", {
      metodo: "GET",
      token: cookieOp.value,
    })
    ok(daOperacao.status === 403, "a operação não abre as ofertas (403)", String(daOperacao.status))

    const { pagina } = dono
    await pagina.goto(`${PAINEL}/marketing/ofertas?periodo=30d`)
    await pagina.waitForSelector('[data-bloco="caixas"] tbody tr[data-oferta]', { timeout: 20000 })
    ok(
      (await pagina.locator('[data-bloco="caixas"] tbody tr[data-oferta]').count()) ===
        o.porProduto.length &&
        (await pagina.locator("[data-numeros-das-ofertas] .numero").count()) === 4 &&
        (await pagina
          .locator('[data-bloco="cupons"] tbody tr[data-cupom], [data-bloco="cupons"] .sem-dados')
          .count()) >= 1,
      "a tela: a caixa de cada produto, os quatro números e os cupons"
    )
    ok(
      (await pagina.locator(".abas a[data-aba]").count()) === 7 &&
        (await pagina.locator('.abas a[aria-current="page"]').getAttribute("data-aba")) ===
          "ofertas",
      "as sete abas, com a das ofertas acesa"
    )
  }

  titulo("Os Clientes")
  {
    const r = await medusa("/dashboard/marketing/clientes?periodo=30d", {
      metodo: "GET",
      token: tokenDoDono,
    })
    const c = r.corpo
    const resumo30 = (
      await medusa("/dashboard/marketing?periodo=30d", { metodo: "GET", token: tokenDoDono })
    ).corpo
    const pedidos = resumo30.numeros.pedidos.valor
    ok(
      r.status === 200 &&
        c.periodo === "30d" &&
        c.primeira.pedidos + c.voltaram.pedidos === pedidos &&
        (pedidos
          ? c.primeira.parte + c.voltaram.parte === 100
          : c.primeira.parte === null && c.voltaram.parte === null),
      "a primeira compra e a volta: os pedidos do Resumo, em partes que somam 100%",
      JSON.stringify([c.primeira, c.voltaram, pedidos])
    )
    ok(
      c.primeira.pedidos <= c.compraram && c.compraram <= pedidos,
      "quem comprou: uma pessoa por primeira compra, no máximo uma por pedido",
      JSON.stringify([c.compraram, c.primeira.pedidos, pedidos])
    )
    ok(
      c.estados.reduce((s, e) => s + e.pedidos, 0) === pedidos &&
        perto(
          c.estados.reduce((s, e) => s + e.receita, 0),
          resumo30.numeros.receita.valor
        ) &&
        c.estados.length <= 9 &&
        c.estados
          .filter((e) => !e.uf.startsWith("Outros"))
          .every((e, i, l) => i === 0 || l[i - 1].receita >= e.receita),
      "por estado: somam os pedidos e a receita do Resumo, do que mais vendeu pro que menos",
      JSON.stringify(c.estados).slice(0, 300)
    )
    ok(
      c.segunda === null || (c.segunda.dias >= 0 && c.segunda.pessoas >= 1),
      "a 2ª compra: em dias, de quem voltou",
      JSON.stringify(c.segunda)
    )
    const newsletter = (
      await medusa("/dashboard/newsletter", { metodo: "GET", token: tokenDoDono })
    ).corpo
    ok(
      c.newsletter.total === newsletter.numeros?.total &&
        c.newsletter.semana === newsletter.numeros?.semana,
      "a newsletter: os números da tela dela",
      JSON.stringify([c.newsletter, newsletter.numeros])
    )
    ok(!JSON.stringify(c).includes("@"), "nenhum e-mail de cliente na resposta")
    const daOperacao = await medusa("/dashboard/marketing/clientes", {
      metodo: "GET",
      token: cookieOp.value,
    })
    const doMkt = await medusa("/dashboard/marketing/clientes", {
      metodo: "GET",
      token: cookieMkt.value,
    })
    ok(
      daOperacao.status === 403 && doMkt.status === 200,
      "a operação não abre os clientes do Marketing (403); o marketing abre",
      `${daOperacao.status} · ${doMkt.status}`
    )

    const { pagina } = dono
    await pagina.goto(`${PAINEL}/marketing/clientes?periodo=30d`)
    await pagina.waitForSelector("[data-numeros-dos-clientes]", { timeout: 20000 })
    const parte = (v) => (v === null ? "—" : `${v}%`)
    ok(
      semEspaco(await textoDe(pagina, '[data-numero="compraram"] .numero__valor')) ===
        INTEIRO.format(c.compraram) &&
        semEspaco(await textoDe(pagina, '[data-numero="primeira"] .numero__valor')) ===
          parte(c.primeira.parte) &&
        semEspaco(await textoDe(pagina, '[data-numero="voltaram"] .numero__valor')) ===
          parte(c.voltaram.parte) &&
        (await pagina.locator('[data-bloco="estados"] tbody tr[data-estado]').count()) ===
          c.estados.length,
      "a tela: os números da API e um estado por linha",
      await textoDe(pagina, "[data-numeros-dos-clientes]")
    )
    await pagina.locator('[data-bloco="newsletter"] a').click()
    await pagina.waitForURL((u) => u.pathname === "/clientes/newsletter", { timeout: 20000 })
    ok(caminho(pagina) === "/clientes/newsletter", "o Abrir da newsletter leva pra lista dela")

    const { pagina: celular } = mkt
    await celular.goto(`${PAINEL}/marketing/clientes?periodo=30d`)
    await celular.waitForSelector("[data-numeros-dos-clientes]", { timeout: 20000 })
    ok(await semRolagemDeLado(celular), "no celular: os clientes, sem rolar de lado")
    await celular.waitForFunction(abaAcesaAVista, null, { timeout: 10000 }).catch(() => {})
    ok(
      await celular.evaluate(abaAcesaAVista),
      "no celular, a fileira de abas rola até a acesa (a sexta)"
    )
  }

  titulo("O Pagamento e o frete")
  {
    const r = await medusa("/dashboard/marketing/pagamento?periodo=30d", {
      metodo: "GET",
      token: tokenDoDono,
    })
    const p = r.corpo
    const resumo30 = (
      await medusa("/dashboard/marketing?periodo=30d", { metodo: "GET", token: tokenDoDono })
    ).corpo
    const pedidos = resumo30.numeros.pedidos.valor
    ok(
      r.status === 200 &&
        p.periodo === "30d" &&
        p.comoPagaram.pix + p.comoPagaram.cartao === pedidos &&
        p.frete.pedidos === pedidos,
      "como pagaram: os pedidos pagos do Resumo, cada um no Pix ou no cartão",
      JSON.stringify([p.comoPagaram, p.frete.pedidos, pedidos])
    )
    ok(
      p.pix.pagos + p.pix.venceram + p.pix.esperando === p.pix.gerados && p.pix.esperando >= 0,
      "o Pix: pago, vencido ou esperando — nada fora, nada duas vezes",
      JSON.stringify(p.pix)
    )
    const { total: tentativas, ...motivos } = p.cartao
    ok(
      Object.values(motivos).reduce((s, n) => s + n, 0) === tentativas,
      "o cartão: cada tentativa num motivo só",
      JSON.stringify(p.cartao)
    )
    ok(
      p.parcelas.reduce((s, x) => s + x.pedidos, 0) === p.comoPagaram.cartao &&
        p.parcelas.every(
          (x, i, l) => x.parcelas >= 1 && (i === 0 || l[i - 1].parcelas < x.parcelas)
        ),
      "as parcelas: os pedidos pagos no cartão, de 1x pra cima",
      JSON.stringify(p.parcelas)
    )
    // A tela das Configurações dá o piso escrito ("149,90").
    const politica = (
      await medusa("/dashboard/configuracoes", { metodo: "GET", token: tokenDoDono })
    ).corpo.frete
    const piso =
      politica?.modo === "gratis"
        ? Number(String(politica.piso).replace(/\./g, "").replace(",", "."))
        : null
    ok(
      p.frete.gratis <= p.frete.pedidos &&
        p.frete.parteGratis ===
          (p.frete.pedidos ? Math.round((p.frete.gratis / p.frete.pedidos) * 100) : null) &&
        p.frete.piso === piso,
      "o frete: a parte grátis, e o piso é o das Configurações",
      JSON.stringify([p.frete, politica?.modo, politica?.piso])
    )
    const recusados = p.cartao.antifraude + p.cartao.banco + p.cartao.dados + p.cartao.outros
    ok(
      p.achados.every((a) => {
        const t = semEspaco(a.titulo)
        const [, x, y] = t.match(/^(\d+) de (\d+) /) ?? []
        if (/tentativas no cartão/.test(t)) return +x === recusados && +y === tentativas
        if (/Pix gerados/.test(t)) return +x === p.pix.venceram && +y === p.pix.gerados
        if (/pagaram frete/.test(t)) return t.startsWith(`${p.frete.quaseLa} pedidos`)
        return a.tipo === "info"
      }),
      "os achados batem com os números",
      JSON.stringify(p.achados.map((a) => a.titulo))
    )
    const daOperacao = await medusa("/dashboard/marketing/pagamento", {
      metodo: "GET",
      token: cookieOp.value,
    })
    ok(
      daOperacao.status === 403,
      "a operação não abre o pagamento do Marketing (403)",
      String(daOperacao.status)
    )

    const { pagina } = dono
    await pagina.goto(`${PAINEL}/marketing/pagamento?periodo=30d`)
    await pagina.waitForSelector('[data-bloco="frete"] [data-numero="gratis"]', {
      timeout: 20000,
    })
    ok(
      semEspaco(await textoDe(pagina, '[data-numero="gratis"] .numero__valor')) ===
        (p.frete.parteGratis === null ? "—" : `${p.frete.parteGratis}%`) &&
        (await pagina.locator('[data-barras="forma"] li').count()) === 2 &&
        (await pagina.locator('[data-barras="cartao"] li').count()) ===
          (tentativas ? 4 + (p.cartao.emAnalise ? 1 : 0) + (p.cartao.outros ? 1 : 0) : 0),
      "a tela: como pagaram, o cartão por motivo e o frete da API",
      await textoDe(pagina, '[data-bloco="cartao"]')
    )
    ok(
      (await pagina.locator('[data-bloco="frete"] a[href="/configuracoes/frete"]').count()) === 1 &&
        (await pagina.locator('.abas a[aria-current="page"]').getAttribute("data-aba")) ===
          "pagamento",
      "o dono tem o atalho pro frete grátis; a aba acesa é a do pagamento"
    )

    const { pagina: celular } = mkt
    await celular.goto(`${PAINEL}/marketing/pagamento?periodo=30d`)
    await celular.waitForSelector('[data-bloco="frete"] [data-numero="gratis"]', {
      timeout: 20000,
    })
    ok(
      (await celular.locator('[data-bloco="frete"] a').count()) === 0,
      "o marketing não tem o atalho (as Configurações são do dono)"
    )
    ok(await semRolagemDeLado(celular), "no celular: o pagamento, sem rolar de lado")
    await celular.waitForFunction(abaAcesaAVista, null, { timeout: 10000 }).catch(() => {})
    ok(await celular.evaluate(abaAcesaAVista), "e a sétima aba, a última, também aparece")
  }

  titulo("O Google fora")
  {
    google.recusar = 500
    const r = await medusa("/dashboard/marketing/visitas?periodo=30d", {
      metodo: "GET",
      token: tokenDoDono,
    })
    ok(r.corpo.estado === "fora", "a API diz “fora”", JSON.stringify(r.corpo))
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/marketing?periodo=90d`)
    await pagina.waitForFunction(
      () => document.querySelector('[data-kpi="visitas"] .kpi__valor')?.textContent === "—",
      null,
      { timeout: 15000 }
    )
    ok(
      /o Google não respondeu agora/.test(await textoDe(pagina, '[data-kpi="visitas"]')) &&
        (await pagina.locator('.barras-v[data-barras="13"]').count()) === 1,
      "a tela segue inteira, e a visita diz que o Google não respondeu",
      await textoDe(pagina, '[data-kpi="visitas"]')
    )
    await pagina.goto(`${PAINEL}/marketing/funil?periodo=7d`)
    await pagina.waitForSelector('[data-bloco="site"] [data-sem-google]', { timeout: 20000 })
    ok(
      (await pagina
        .locator('[data-bloco="checkout"] .funil, [data-bloco="checkout"] .sem-dados')
        .count()) === 1,
      "no funil: o do site diz que o Google não respondeu, e o da sacola (a loja) segue"
    )
    await pagina.goto(`${PAINEL}/marketing/produtos?periodo=7d`)
    await pagina.waitForSelector("[data-sem-google]", { timeout: 20000 })
    ok(
      (await pagina.locator('[data-bloco="produtos"] tbody tr[data-produto]').count()) > 0,
      "nos produtos: diz que o Google não respondeu, e a lista (o vendido, o estoque) segue"
    )
    await pagina.goto(`${PAINEL}/marketing/canais?periodo=7d`)
    await pagina.waitForSelector('[data-bloco="canais"] [data-sem-google]', { timeout: 20000 })
    ok(
      (await pagina.locator("[data-montar-link] input").count()) === 1 &&
        (await pagina.locator("[data-total-da-loja]").count()) === 1,
      "nos canais: diz que o Google não respondeu, e o total da loja e o montador seguem"
    )
    await pagina.goto(`${PAINEL}/marketing/clientes?periodo=7d`)
    await pagina.waitForSelector("[data-numeros-dos-clientes]", { timeout: 20000 })
    const semGoogleNosClientes = await pagina.locator("[data-sem-google]").count()
    await pagina.goto(`${PAINEL}/marketing/pagamento?periodo=7d`)
    await pagina.waitForSelector('[data-bloco="frete"] [data-numero="gratis"]', {
      timeout: 20000,
    })
    ok(
      semGoogleNosClientes === 0 && (await pagina.locator("[data-sem-google]").count()) === 0,
      "nos clientes e no pagamento, nada muda: não perguntam ao Google"
    )
    google.recusar = null
  }

  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.slice(0, 5).join(" | "))
} catch (e) {
  falhou(e instanceof Error ? e.message : String(e))
} finally {
  if (tokenDoDono) {
    // A meta volta a ser a de antes (ou nenhuma).
    if (mexeuNaMeta)
      await medusa("/dashboard/marketing/meta", {
        token: tokenDoDono,
        corpo: { valor: metaDeAntes === null ? "" : String(metaDeAntes) },
      })
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
  await google.fechar()
  await esperar(50)
}

process.exit(resumo())
