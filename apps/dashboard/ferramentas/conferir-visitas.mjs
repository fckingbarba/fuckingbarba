/**
 * CONFERIDOR DAS VISITAS DO INÍCIO — o que o Google Analytics conta, pela
 * tela e pela API, contra um Google falso (`google-falso.mjs`): as visitas do
 * dia (`GET /dashboard/visitas`, a do painel de antes da 0186) e as do
 * período da barra de cima (`?periodo=`): o número e o gráfico, o que as
 * visitas fizeram, as taxas e de onde vieram.
 *
 *   (o backend com as variáveis do GA4 apontando pro falso — ver AGENTS.md,
 *   "O painel da loja": uma chave gerada na hora, com `token_uri` no falso,
 *   GA4_PROPERTY_ID, GA4_API_URL e GA4_CACHE_SEGUNDOS=0)
 *   node apps/dashboard/ferramentas/conferir-visitas.mjs
 *
 * Variáveis: as de `pecas.mjs`, e as mesmas GA4_PROPERTY_ID, GA4_CREDENCIAIS
 * e GA4_API_URL do backend — o falso sobe na porta do GA4_API_URL e confere
 * a assinatura com a chave pública da GA4_CREDENCIAIS.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o número da tela diferente do que o Google contou, ou a comparação   │
 * │   com ontem em horas que o Google ainda não somou hoje (o atraso dele  │
 * │   deu "−92%" num dia normal, em 24/09), ou fora do fuso da propriedade;│
 * │ • a chave assinando errado, pedindo mais que leitura, ou um token novo │
 * │   a cada pergunta; o token revogado virando erro na tela;              │
 * │ • a operação recebendo o bloco (de onde vieram, os mais vistos) — na   │
 * │   tela OU na resposta; no período, o que as visitas fizeram e as taxas;│
 * │ • o período contando fora do corte de hoje, ou sem o de antes;         │
 * │ • o Google fora, lento ou recusando e o Início esperando por ele, ou   │
 * │   quebrando;                                                           │
 * │ • rolagem de lado no celular; erro no console.                         │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { createPrivateKey, createPublicKey } from "node:crypto"
import { subirGoogleFalso } from "./google-falso.mjs"
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
  semRolagemDeLado,
  subirResend,
  textoDe,
  titulo,
} from "./pecas.mjs"

exigirAmbiente()
const CHAVE_DA_LOJA = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""

/* ── a chave da conta, a mesma do backend ─────────────────────────────────── */

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
if (!conta?.private_key || !PROPRIEDADE || !API || !CHAVE_DA_LOJA) {
  console.log(
    "  ⚠  faltam GA4_CREDENCIAIS, GA4_PROPERTY_ID e GA4_API_URL (as mesmas do backend, apontando " +
      "pro Google falso) e NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY — ver AGENTS.md"
  )
  process.exit(1)
}

const INTEIRO = new Intl.NumberFormat("pt-BR")
const PORCENTO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })
const semEspaco = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
/** O mesmo `nomeCurto` do backend (`lib/painel/pedido.ts`). */
const nomeCurto = (nome) =>
  nome
    .replace(/\s*(—|-)\s*.*$/, "")
    .replace(/\s+(fucking\s*barba)\b/gi, "")
    .replace(/\s+para barba\b/gi, "")
    .trim() || nome

/** Hoje e ontem em Brasília, como o GA4 escreve ("20260924"), e a hora de agora. */
const DIA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
const HORA = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  hourCycle: "h23",
})
const diaDoGa4 = (ms) => DIA.format(ms).replace(/-/g, "")
const HOJE = diaDoGa4(Date.now())
const ONTEM = diaDoGa4(Date.now() - 24 * 60 * 60 * 1000)
const ANTEONTEM = diaDoGa4(Date.now() - 2 * 24 * 60 * 60 * 1000)
const HORA_AGORA = Number(HORA.format(Date.now()))

/* ── os falsos, e o dia que o Google vai contar ───────────────────────────── */

const google = await subirGoogleFalso({
  porta: Number(new URL(API).port),
  propriedade: PROPRIEDADE,
  chavePublica: createPublicKey(createPrivateKey(conta.private_key)),
  email: conta.client_email,
  aud: conta.token_uri,
})
const resend = await subirResend()
const caixa = caixaDoResend(resend)
const { navegador, novaAba, errosDeConsole } = await abrirNavegador()
console.log(`  ⚙  Google falso :${google.porta} · Resend :${resend.porta} · painel ${PAINEL}`)

const { products } = await (
  await fetch(`${MEDUSA}/store/products?fields=handle,title&limit=50`, {
    headers: { "x-publishable-api-key": CHAVE_DA_LOJA },
  })
).json()
const [p1, p2, p3] = products

// O dia do protótipo, cortado na hora de agora; ontem inteiro, um pouco mais fraco.
const PROTOTIPO = [
  6, 4, 2, 1, 1, 2, 5, 9, 14, 17, 19, 21, 33, 29, 20, 19, 21, 28, 33, 46, 66, 16, 12, 8,
]
const hora = (h) => String(h).padStart(2, "0")
google.dia = {
  horas: [],
  origens: [
    { fonte: "l.instagram.com", meio: "referral", visitas: 100 },
    { fonte: "instagram", meio: "social", visitas: 88 },
    { fonte: "google", meio: "organic", visitas: 60 },
    { fonte: "google", meio: "cpc", visitas: 55 },
    { fonte: "(direct)", meio: "(none)", visitas: 70 },
    { fonte: "resend", meio: "email", visitas: 21 },
    { fonte: "bing", meio: "organic", visitas: 10 },
    { fonte: "chatgpt.com", meio: "referral", visitas: 8 },
  ],
  paginas: [
    { caminho: `/produtos/${p1.handle}`, vistas: 120 },
    { caminho: `/produtos/${p1.handle}/`, vistas: 11 },
    { caminho: `/produtos/${p2.handle}`, vistas: 74 },
    { caminho: `/produtos/${p3.handle}`, vistas: 52 },
    { caminho: "/produtos/produto-que-saiu", vistas: 5 },
    { caminho: "/produtos/ordem/preco", vistas: 500 },
  ],
  agora: 9,
}
const HOJE_TOTAL = PROTOTIPO.slice(0, HORA_AGORA + 1).reduce((s, v) => s + v, 0)
const ONTEM_POR_HORA = PROTOTIPO.map((v) => Math.max(1, v - 2))
const ORIGENS = [
  ["Instagram", 188],
  ["Google", 115],
  ["Direto", 70],
  ["E-mail", 21],
  ["Outros", 18],
]
const MAIS_VISTOS = [
  [nomeCurto(p1.title), 131],
  [nomeCurto(p2.title), 74],
  [nomeCurto(p3.title), 52],
  ["Produto que saiu", 5],
]

const ONTEM_TOTAL = ONTEM_POR_HORA.reduce((s, v) => s + v, 0)
const somar = (horas, ate) => horas.slice(0, ate).reduce((s, v) => s + v, 0)
/** As 24 horas de hoje que o Google falso vai contar (as de `ate` pra frente, zero). */
const horasDeHoje = (ate) => PROTOTIPO.map((v, h) => (h <= ate ? v : 0))
/**
 * A comparação que o backend tem que devolver, pela hora em que ele respondeu
 * (a regra de `comparacaoComOntem`, que tem os testes de unidade — aqui é o
 * caminho até a tela que se confere).
 */
function comparacaoEsperada(hoje, horaAgora) {
  let ultima = -1
  for (let h = 0; h <= horaAgora; h++) if (hoje[h] > 0) ultima = h
  const ate = ultima >= horaAgora - 1 ? horaAgora : ultima
  return ate < 1 ? null : { ate, hoje: somar(hoje, ate), ontem: somar(ONTEM_POR_HORA, ate) }
}
/** A frase do número — a mesma do painel (`components/visitas.tsx`). */
function frase(hoje, c) {
  if (!c) return hoje ? "o Google ainda está somando as de hoje" : "nenhuma somada ainda hoje"
  if (!c.ontem) return c.hoje ? `ontem até as ${c.ate}h: nenhuma` : `nenhuma até as ${c.ate}h`
  const d = Math.round((c.hoje / c.ontem - 1) * 100)
  return `${d >= 0 ? "+" : "−"}${Math.abs(d)}% que ontem até as ${c.ate}h`
}
const linhasDeHoje = (ate) =>
  PROTOTIPO.slice(0, ate + 1).map((v, h) => ({ dia: HOJE, hora: hora(h), visitas: v }))
const linhasDeOntem = PROTOTIPO.map((v, h) => ({
  dia: ONTEM,
  hora: hora(h),
  visitas: Math.max(1, v - 2),
}))
const ANTEONTEM_POR_HORA = PROTOTIPO.map((v) => Math.max(1, v - 4))
const ANTEONTEM_TOTAL = ANTEONTEM_POR_HORA.reduce((s, v) => s + v, 0)
const linhasDeAnteontem = ANTEONTEM_POR_HORA.map((v, h) => ({
  dia: ANTEONTEM,
  hora: hora(h),
  visitas: v,
}))
google.dia.horas = [...linhasDeHoje(HORA_AGORA), ...linhasDeOntem, ...linhasDeAnteontem]
const SACOLAS_DE_ONTEM = Array.from({ length: 24 }, (_, h) => (h >= 8 && h <= 22 ? 2 : 0))
// O Início no período (0186): as visitas com cada evento e as que viram uma categoria, por dia.
google.inicio = {
  eventos: [
    { dia: HOJE, evento: "view_item", sessoes: 300 },
    { dia: HOJE, evento: "add_to_cart", sessoes: 40 },
    { dia: ONTEM, evento: "view_item", sessoes: 250 },
    { dia: ONTEM, evento: "add_to_cart", sessoes: 30 },
  ],
  categorias: [
    { dia: HOJE, sessoes: 120 },
    { dia: ONTEM, sessoes: 90 },
  ],
  // As 30 sacolas de ontem por hora (0212): 2 em cada hora das 8h às 22h.
  sacolasPorHora: SACOLAS_DE_ONTEM.flatMap((n, h) =>
    n ? [{ dia: ONTEM, hora: hora(h), sessoes: n }] : []
  ),
}

let tokenDoDono = ""

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
  const op = await novaAba()
  const cookieOp = await entrarPelaTela(op, `op.${RODADA}@painel.teste`, caixa)
  const mkt = await novaAba({ width: 375, height: 812 })
  const cookieMkt = await entrarPelaTela(mkt, `mkt.${RODADA}@painel.teste`, caixa)
  ok(Boolean(cookieOp && cookieMkt), "operação e marketing entram")

  titulo("O que o Google contou, pela API")
  const doDono = await medusa("/dashboard/visitas", { metodo: "GET", token: tokenDoDono })
  const v = doDono.corpo.visitas ?? {}
  ok(
    doDono.status === 200 && doDono.corpo.estado === "ok",
    "o dono recebe as visitas",
    JSON.stringify(doDono.corpo).slice(0, 200)
  )
  ok(v.hoje === HOJE_TOTAL, `hoje: ${HOJE_TOTAL} visitas, a soma das horas`, String(v.hoje))
  const horaDaResposta = (v.porHora?.length ?? 0) - 1
  ok(
    horaDaResposta >= HORA_AGORA &&
      horaDaResposta <= HORA_AGORA + 1 &&
      v.porHora?.[0] === PROTOTIPO[0],
    "hora a hora, da meia-noite até agora",
    JSON.stringify(v.porHora)
  )
  ok(
    JSON.stringify(v.comparacao) ===
      JSON.stringify(comparacaoEsperada(horasDeHoje(HORA_AGORA), horaDaResposta)),
    "em dia, a comparação com ontem vai até a hora de agora (sem ela, que está pela metade)",
    JSON.stringify(v.comparacao)
  )
  ok(v.ontem === ONTEM_TOTAL, `ontem inteiro: ${ONTEM_TOTAL}`, String(v.ontem))
  ok(v.agora === 9, "9 no site agora (o tempo real)", String(v.agora))
  ok(
    JSON.stringify((v.origens ?? []).map((o) => [o.nome, o.visitas])) === JSON.stringify(ORIGENS),
    "de onde vieram: somadas pelo nome que o dono conhece, e o resto em “Outros”",
    JSON.stringify(v.origens)
  )
  ok(
    JSON.stringify((v.maisVistos ?? []).map((o) => [o.nome, o.visitas])) ===
      JSON.stringify(MAIS_VISTOS),
    "os mais vistos: com o nome do Medusa, sem a página da lista",
    JSON.stringify(v.maisVistos)
  )
  // O lote do dia (três perguntas, "yesterday" a "today"): o Início novo pergunta o do período também.
  const lote = google.perguntas.find(
    (p) =>
      p.tipo === "batchRunReports" &&
      p.corpo.requests?.[0]?.dateRanges?.[0]?.startDate === "yesterday"
  )
  const [pHoras, pOrigens, pPaginas] = lote?.corpo.requests ?? []
  ok(
    pHoras?.dateRanges?.[0]?.startDate === "yesterday" &&
      pHoras?.dateRanges?.[0]?.endDate === "today" &&
      pOrigens?.dateRanges?.[0]?.startDate === "today" &&
      pPaginas?.dimensionFilter?.filter?.stringFilter?.value === "/produtos/",
    "três relatórios numa chamada só, com o hoje e o ontem da propriedade (o Google resolve)",
    JSON.stringify(lote?.corpo).slice(0, 200)
  )
  ok(
    google.jwtsRecusados.length === 0 && google.perguntas.every((p) => p.tokenOk),
    "a chave assina certo, pede só leitura, e toda pergunta vai com o token",
    google.jwtsRecusados.join(" | ")
  )

  titulo("O Início no período, pela API (0186)")
  // As visitas do período vêm por dia e hora, do começo do de antes ao fim do período;
  // o corte de hoje é a última hora que o Google somou (em dia: a hora de agora, sem ela).
  const doPeriodo = async (consulta, token = tokenDoDono) =>
    medusa(`/dashboard/visitas?${consulta}`, { metodo: "GET", token })
  {
    const antesDasPerguntas = google.perguntas.length
    const r = await doPeriodo("periodo=hoje")
    const p = r.corpo.periodo ?? {}
    ok(
      r.status === 200 && r.corpo.estado === "ok" && Boolean(r.corpo.periodo),
      "com o período no endereço, a resposta é a do período",
      JSON.stringify(r.corpo).slice(0, 200)
    )
    const ate = p.ate
    ok(
      ate >= HORA_AGORA && ate <= HORA_AGORA + 1,
      "em dia, hoje conta até a hora de agora (sem ela, que está pela metade)",
      String(ate)
    )
    ok(
      p.visitas?.valor === somar(PROTOTIPO, ate) &&
        p.visitas?.antes === somar(ONTEM_POR_HORA, ate) &&
        p.visitas?.variacao ===
          Math.round(
            ((somar(PROTOTIPO, ate) - somar(ONTEM_POR_HORA, ate)) / somar(ONTEM_POR_HORA, ate)) *
              100
          ),
      "as visitas de hoje contra as de ontem, nas mesmas horas",
      JSON.stringify(p.visitas)
    )
    ok(
      p.barras?.length === 24 &&
        p.barras.every(
          (b, h) =>
            b.visitas === (h <= HORA_AGORA ? PROTOTIPO[h] : 0) && b.antes === ONTEM_POR_HORA[h]
        ),
      "o gráfico hora a hora, com ontem inteiro no tracejado",
      JSON.stringify(p.barras?.slice(0, 3))
    )
    ok(
      JSON.stringify(p.comportamento) ===
        JSON.stringify({ visitas: HOJE_TOTAL, categoria: 120, produto: 300, sacola: 40 }),
      "o que as visitas fizeram: as visitas de hoje, as da categoria, as do produto e as da sacola",
      JSON.stringify(p.comportamento)
    )
    const sacola = p.taxas?.sacola ?? {}
    ok(
      sacola.valor === Math.round((40 / HOJE_TOTAL) * 10_000) / 100 &&
        sacola.antes ===
          (somar(ONTEM_POR_HORA, ate)
            ? Math.round((somar(SACOLAS_DE_ONTEM, ate) / somar(ONTEM_POR_HORA, ate)) * 10_000) / 100
            : null) &&
        sacola.de === 40 &&
        sacola.em === HOJE_TOTAL,
      "a taxa da sacola: as duas contas do Google, e a de ontem só até a mesma hora (0212)",
      JSON.stringify(sacola)
    )
    const compraram = p.taxas?.compraram ?? {}
    ok(
      Number.isInteger(compraram.de) &&
        compraram.em === p.visitas?.valor &&
        compraram.valor ===
          (compraram.em ? Math.round((compraram.de / compraram.em) * 10_000) / 100 : null) &&
        Number.isInteger(compraram.noPeriodo) &&
        compraram.noPeriodo >= compraram.de,
      "a taxa das compras divide as vendas pelas visitas, no mesmo corte",
      JSON.stringify(compraram)
    )
    ok(
      JSON.stringify((p.origens ?? []).map((o) => [o.nome, o.visitas])) ===
        JSON.stringify(ORIGENS) && p.agora === 9,
      "de onde vieram e quem está no site agora",
      JSON.stringify({ origens: p.origens, agora: p.agora })
    )
    // Duas chamadas ao mesmo tempo (0216): as quatro de sempre e as "até agora".
    const lotes = google.perguntas
      .slice(antesDasPerguntas)
      .filter((x) => x.tipo === "batchRunReports")
      .map((x) => x.corpo.requests ?? [])
    const lote = lotes.find((l) => l.length === 4)
    const loteDoAgora = lotes.find((l) => l.length === 2)
    const ontemComTraco = `${ONTEM.slice(0, 4)}-${ONTEM.slice(4, 6)}-${ONTEM.slice(6)}`
    const hojeComTraco = `${HOJE.slice(0, 4)}-${HOJE.slice(4, 6)}-${HOJE.slice(6)}`
    const temOEndereco = (q) =>
      JSON.stringify(q?.dimensionFilter ?? {}).includes('"fieldName":"hostName"')
    ok(
      lote &&
        lote[0].dateRanges?.[0]?.startDate === ontemComTraco &&
        lote[0].dateRanges?.[0]?.endDate === hojeComTraco &&
        lote[2].dateRanges?.[0]?.startDate === hojeComTraco &&
        lote.every(temOEndereco) &&
        loteDoAgora &&
        loteDoAgora[0].dateRanges?.[0]?.startDate === hojeComTraco &&
        JSON.stringify(loteDoAgora[0].dimensions) === JSON.stringify([{ name: "date" }]) &&
        loteDoAgora[1].dateRanges?.[0]?.startDate === ontemComTraco &&
        loteDoAgora[1].dateRanges?.[0]?.endDate === ontemComTraco &&
        loteDoAgora.every(temOEndereco),
      "quatro perguntas numa chamada e, noutra, as de até agora (as visitas por dia e as sacolas de ontem por hora), só do endereço da loja",
      JSON.stringify(
        lotes.map((l) => l.map((q) => [q.dateRanges, (q.dimensions ?? []).map((d) => d.name)]))
      )
    )

    const ontem = (await doPeriodo("periodo=ontem")).corpo.periodo ?? {}
    ok(
      ontem.ate === null &&
        ontem.visitas?.valor === ONTEM_TOTAL &&
        ontem.visitas?.antes === ANTEONTEM_TOTAL,
      "ontem: o dia inteiro contra anteontem inteiro, sem corte",
      JSON.stringify(ontem.visitas)
    )
    const semComparar = (await doPeriodo("periodo=ontem&comparar=nenhum")).corpo.periodo ?? {}
    ok(
      semComparar.visitas?.antes === null && semComparar.barras?.every((b) => b.antes === null),
      "sem comparar, nada do de antes",
      JSON.stringify(semComparar.visitas)
    )
  }

  titulo("A operação: só o número")
  {
    const r = await medusa("/dashboard/visitas", { metodo: "GET", token: cookieOp.value })
    ok(
      r.corpo.estado === "ok" &&
        JSON.stringify(Object.keys(r.corpo.visitas ?? {}).sort()) ===
          JSON.stringify(["comparacao", "hoje"]),
      "a resposta da operação nem traz de onde vieram, os mais vistos ou a hora a hora",
      JSON.stringify(r.corpo)
    )
    const doPeriodoOp = await doPeriodo("periodo=hoje", cookieOp.value)
    ok(
      doPeriodoOp.corpo.estado === "ok" &&
        JSON.stringify(Object.keys(doPeriodoOp.corpo.periodo ?? {}).sort()) ===
          JSON.stringify(["ate", "barras", "visitas"]),
      "no período, também: só as visitas e o gráfico delas",
      JSON.stringify(Object.keys(doPeriodoOp.corpo.periodo ?? {}))
    )
    const { pagina } = op
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector('[data-numero="visitas"] .barrinhas')
    ok(
      semEspaco(await textoDe(pagina, '[data-numero="visitas"] .numero__valor')) ===
        INTEIRO.format(doPeriodoOp.corpo.periodo.visitas.valor),
      "o número de visitas aparece",
      await textoDe(pagina, '[data-numero="visitas"]')
    )
    ok(
      (await pagina
        .locator('[data-bloco="visitas-fizeram"], [data-bloco="origens"], [data-taxa]')
        .count()) === 0,
      "sem o que as visitas fizeram, as taxas e de onde vieram"
    )
  }

  titulo("O dono: o número e os blocos")
  {
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector('[data-bloco="origens"] .barras-h')
    const p = (await doPeriodo("periodo=hoje")).corpo.periodo
    const cartao = pagina.locator('[data-numero="visitas"]')
    const nota = semEspaco(
      await cartao
        .locator(".numero__antes")
        .allTextContents()
        .then((t) => t.join(" | "))
    )
    ok(
      semEspaco(await cartao.locator(".numero__valor").textContent()) ===
        INTEIRO.format(p.visitas.valor),
      "o número de visitas é o da API",
      await cartao.textContent()
    )
    ok(
      nota === `${INTEIRO.format(p.visitas.antes)} ontem até esta hora | hoje, até as ${p.ate}h`,
      "o de antes e até que hora o Google somou hoje",
      nota
    )
    const d = p.visitas.variacao
    ok(
      semEspaco(await cartao.locator(".variacao").textContent()) ===
        `${d >= 0 ? "+" : "−"}${Math.abs(d)}%`,
      "a variação, com a seta",
      await cartao.locator(".variacao").textContent()
    )
    ok(
      (await cartao.locator(".barrinhas rect").count()) ===
        p.barras.filter((b) => b.visitas > 0).length &&
        (await cartao.locator(".barrinhas polyline").count()) === 1,
      "o gráfico: uma barra por hora com visita, e o tracejado de ontem"
    )
    const degraus = await pagina
      .locator('[data-bloco="visitas-fizeram"] .degrau')
      .evaluateAll((ls) =>
        ls.map((l) => [
          l.querySelector(".degrau__nome")?.textContent,
          l.querySelector(".degrau__n b")?.textContent,
        ])
      )
    ok(
      JSON.stringify(degraus) ===
        JSON.stringify([
          ["Visitas", INTEIRO.format(HOJE_TOTAL)],
          ["Viram uma categoria", "120"],
          ["Viram um produto", "300"],
          ["Puseram na sacola", "40"],
        ]),
      "o que as visitas fizeram, na tela",
      JSON.stringify(degraus)
    )
    const porcento = (v) => `${v.toFixed(2).replace(".", ",")}%`
    const taxa = (dado) => textoDe(pagina, `[data-taxa="${dado}"] .taxa__valor b`).then(semEspaco)
    ok(
      (await taxa("sacola")) === porcento(p.taxas.sacola.valor) &&
        (await taxa("compraram")) ===
          (p.taxas.compraram.valor === null ? "—" : porcento(p.taxas.compraram.valor)),
      "as taxas do Google, na tela",
      `${await taxa("sacola")} · ${await taxa("compraram")}`
    )
    const nomes = await pagina.locator('[data-bloco="origens"] .barras-h__nome').allTextContents()
    ok(
      JSON.stringify(nomes) === JSON.stringify(ORIGENS.map((o) => o[0])) &&
        semEspaco(await textoDe(pagina, '[data-bloco="origens"] .agora')) === "9 no site agora",
      "de onde vieram e quem está no site agora, na tela"
    )

    await pagina.goto(`${PAINEL}/?periodo=ontem`)
    await pagina.waitForSelector('[data-atalho="ontem"][aria-current]')
    await pagina.waitForSelector('[data-numero="visitas"] .barrinhas')
    ok(
      semEspaco(await textoDe(pagina, '[data-numero="visitas"] .numero__valor')) ===
        INTEIRO.format(ONTEM_TOTAL),
      "ontem, na tela: o dia inteiro",
      await textoDe(pagina, '[data-numero="visitas"]')
    )
  }

  titulo("O marketing, no celular")
  {
    const { pagina } = mkt
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector('[data-bloco="origens"] .barras-h')
    ok(
      (await pagina.locator('[data-bloco="visitas-fizeram"] .degrau').count()) === 4 &&
        (await pagina.locator("[data-taxa]").count()) === 3,
      "o marketing vê o que as visitas fizeram e as três taxas"
    )
    ok(await semRolagemDeLado(pagina), "sem rolagem de lado no celular")
  }

  titulo("O token")
  {
    const antes = google.tokensDados
    for (let i = 0; i < 3; i++)
      await medusa("/dashboard/visitas", { metodo: "GET", token: tokenDoDono })
    ok(
      google.tokensDados === antes && antes <= 1,
      "um token pra todas as perguntas",
      String(google.tokensDados)
    )
    google.revogar()
    const r = await medusa("/dashboard/visitas", { metodo: "GET", token: tokenDoDono })
    ok(
      r.corpo.estado === "ok" && google.tokensDados === antes + 1,
      "token revogado: o backend pede outro e pergunta de novo — a tela nem percebe",
      `${r.corpo.estado} · tokens ${google.tokensDados}`
    )
  }

  titulo("O Google atrasado: a comparação só nas horas que ele já somou")
  {
    // Como em 24/09: o Google só somou até 3 horas atrás (o resto chega depois).
    const ultima = Math.max(0, HORA_AGORA - 3)
    google.dia.horas = [...linhasDeHoje(ultima), ...linhasDeOntem, ...linhasDeAnteontem]
    const r = await medusa("/dashboard/visitas", { metodo: "GET", token: tokenDoDono })
    const v = r.corpo.visitas ?? {}
    const h = (v.porHora?.length ?? 0) - 1
    const esperada = comparacaoEsperada(horasDeHoje(ultima), h)
    ok(
      JSON.stringify(v.comparacao) === JSON.stringify(esperada),
      "a comparação para na última hora que o Google somou — nada de −92% num dia normal",
      `${JSON.stringify(v.comparacao)} (esperada ${JSON.stringify(esperada)})`
    )
    const p = (await doPeriodo("periodo=hoje")).corpo.periodo ?? {}
    const corte = ultima >= HORA_AGORA - 1 ? HORA_AGORA : ultima
    ok(
      p.ate === corte &&
        p.visitas?.valor === somar(PROTOTIPO, corte) &&
        p.visitas?.antes === somar(ONTEM_POR_HORA, corte),
      "no período, também: hoje e ontem até a última hora que o Google somou",
      JSON.stringify({ ate: p.ate, visitas: p.visitas })
    )
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector('[data-numero="visitas"] .barrinhas')
    const notas = (
      await pagina.locator('[data-numero="visitas"] .numero__antes').allTextContents()
    ).map(semEspaco)
    ok(
      notas.includes(corte ? `hoje, até as ${corte}h` : "o Google ainda está somando as de hoje"),
      "a tela diz até que hora o Google somou",
      notas.join(" | ")
    )

    // A propriedade em outro fuso: o "hoje" e a hora são os dela, não os de Brasília.
    google.dia.horas = [...linhasDeHoje(HORA_AGORA), ...linhasDeOntem, ...linhasDeAnteontem]
    google.fuso = "America/Manaus"
    const horaEm = () =>
      Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "America/Manaus",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(Date.now())
      )
    const antes = horaEm()
    const emManaus = (await medusa("/dashboard/visitas", { metodo: "GET", token: tokenDoDono }))
      .corpo.visitas
    const horaDela = (emManaus?.porHora?.length ?? 0) - 1
    ok(
      horaDela === antes || horaDela === horaEm(),
      "no fuso que a propriedade disser: a hora de agora é a de lá",
      `${horaDela} (em Manaus: ${antes})`
    )
    google.fuso = "America/Sao_Paulo"
  }

  titulo("O total do dia (0216): todas as visitas e todas as vendas até agora")
  {
    // Como em 29/09: por hora o Google só somou até 3 horas atrás, mas o total do dia já está em dia.
    const ultima = Math.max(0, HORA_AGORA - 3)
    google.dia.horas = [...linhasDeHoje(ultima), ...linhasDeOntem, ...linhasDeAnteontem]
    google.inicio.totalDoDia = { [HOJE]: HOJE_TOTAL }
    const p = (await doPeriodo("periodo=hoje")).corpo.periodo ?? {}
    // O de antes vai até a hora de agora (a do backend; a virada da hora no meio vale as duas).
    const bate = (h) =>
      p.visitas?.antes === somar(ONTEM_POR_HORA, h) &&
      p.taxas?.sacola?.antes ===
        (somar(ONTEM_POR_HORA, h)
          ? Math.round((somar(SACOLAS_DE_ONTEM, h) / somar(ONTEM_POR_HORA, h)) * 10_000) / 100
          : null)
    ok(
      p.ate === null &&
        p.visitas?.valor === HOJE_TOTAL &&
        (bate(HORA_AGORA) || bate(HORA_AGORA + 1)),
      "hoje: o total do dia (não o das horas atrasadas); ontem até a hora de agora",
      JSON.stringify({ ate: p.ate, visitas: p.visitas, sacola: p.taxas?.sacola })
    )
    const c = p.taxas?.compraram ?? {}
    ok(
      p.comportamento?.visitas === HOJE_TOTAL &&
        c.em === HOJE_TOTAL &&
        Number.isInteger(c.de) &&
        c.noPeriodo === undefined &&
        p.taxas?.sacola?.em === HOJE_TOTAL,
      "o bloco e as duas taxas com o mesmo número de visitas; a das compras com todas as vendas",
      JSON.stringify({ comportamento: p.comportamento, compraram: c })
    )
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector('[data-taxa="compraram"]:not([data-carregando])')
    const tela = semEspaco(await pagina.locator("main").innerText())
    ok(
      !/até as \d+h/.test(tela) && tela.includes(INTEIRO.format(HOJE_TOTAL)),
      'a tela sem o "até as Nh", com o total do dia',
      tela.slice(0, 200)
    )
    delete google.inicio.totalDoDia
    google.dia.horas = [...linhasDeHoje(HORA_AGORA), ...linhasDeOntem, ...linhasDeAnteontem]
  }

  titulo("Quando o Google falha, o Início não")
  {
    const { pagina } = dono
    const numeroDoGoogle = () => textoDe(pagina, '[data-numero="visitas"]')
    for (const [status, frase] of [
      [403, "o Google recusou a leitura"],
      [500, "o Google não respondeu agora"],
    ]) {
      google.recusar = status
      await pagina.goto(`${PAINEL}/`)
      await pagina.waitForSelector('[data-numero="receita"]')
      await pagina.waitForFunction(() => {
        const cartao = document.querySelector('[data-numero="visitas"]')
        return Boolean(cartao) && !cartao.textContent.includes("perguntando")
      })
      const texto = semEspaco(await numeroDoGoogle())
      ok(
        texto.includes(frase) && texto.includes("—"),
        `Google ${status}: o número diz “${frase}”`,
        texto
      )
      ok(
        semEspaco(await textoDe(pagina, '[data-bloco="visitas-fizeram"] .sem-dados')) ===
          `${frase}.` &&
          (await pagina.locator(".bloco__titulo", { hasText: "Precisa de você" }).count()) === 1 &&
          (await pagina.locator('[data-bloco="checkout"]').count()) === 1,
        `Google ${status}: os blocos do Google dizem o porquê, e o resto do Início no lugar`
      )
    }
    google.recusar = null

    // Lento: o Início chega antes, com o número "perguntando", e as visitas depois.
    google.demora = 2500
    const inicio = Date.now()
    await pagina.goto(`${PAINEL}/`, { waitUntil: "commit" })
    await pagina.waitForSelector('[data-numero="receita"]')
    const antesDasVisitas = Date.now() - inicio
    const esperando = semEspaco(await numeroDoGoogle())
    await pagina.waitForSelector('[data-numero="visitas"] .barrinhas', { timeout: 15000 })
    ok(
      /perguntando ao Google/.test(esperando) && antesDasVisitas < 2500,
      "Google lento: o Início aparece sem esperar, e o número chega depois",
      `${esperando} · ${antesDasVisitas} ms`
    )
    google.demora = 6500
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForFunction(
      () => {
        const cartao = document.querySelector('[data-numero="visitas"]')
        return Boolean(cartao) && !cartao.textContent.includes("perguntando")
      },
      null,
      { timeout: 20000 }
    )
    ok(
      semEspaco(await numeroDoGoogle()).includes("o Google não respondeu agora"),
      "Google parado: depois de 5 segundos, o número desiste e diz"
    )
    google.demora = 0
  }

  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.slice(0, 5).join(" | "))
} catch (e) {
  falhou(e instanceof Error ? e.message : String(e))
} finally {
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
  await google.fechar()
  await esperar(50)
}

process.exit(resumo())
