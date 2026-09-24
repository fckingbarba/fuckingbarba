/**
 * CONFERIDOR DAS VISITAS DO INÍCIO — o número e o bloco do Google Analytics,
 * pela tela e pela API, contra um Google falso (`google-falso.mjs`).
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
 * │   tela OU na resposta;                                                 │
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
google.dia.horas = [...linhasDeHoje(HORA_AGORA), ...linhasDeOntem]

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
  const lote = google.perguntas.find((p) => p.tipo === "batchRunReports")
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
    const { pagina } = op
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector('[data-visitas="ok"]')
    ok(
      semEspaco(await textoDe(pagina, '[data-visitas="ok"] .numero__valor')) ===
        INTEIRO.format(HOJE_TOTAL),
      "o número de visitas aparece",
      await textoDe(pagina, '[data-visitas="ok"]')
    )
    ok(
      (await pagina.locator("a.numero--botao").count()) === 0 &&
        (await pagina.locator("#visitas").count()) === 0,
      "sem o bloco e sem o link pra ele"
    )
  }

  titulo("O dono: o número e o bloco")
  {
    const { pagina } = dono
    const inicio = await medusa("/dashboard/inicio", { metodo: "GET", token: tokenDoDono })
    const semana = inicio.corpo.grafico ?? []
    const pagosOntem = semana[semana.findIndex((d) => d.hoje) - 1]?.pedidos ?? 0
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector("#visitas")
    const agora = await medusa("/dashboard/visitas", { metodo: "GET", token: tokenDoDono })
    const vv = agora.corpo.visitas
    const numero = pagina.locator('a.numero--botao[href="#visitas"]')
    ok(
      (await numero.count()) === 1 &&
        semEspaco(await numero.locator(".numero__valor").textContent()) ===
          INTEIRO.format(HOJE_TOTAL),
      "o número leva pro bloco"
    )
    ok(
      semEspaco(await numero.locator(".numero__sub").textContent()) ===
        frase(vv.hoje, vv.comparacao),
      `a comparação com ontem: “${frase(vv.hoje, vv.comparacao)}”`,
      await numero.locator(".numero__sub").textContent()
    )
    const bloco = pagina.locator("#visitas")
    const sub = semEspaco(await bloco.locator(".bloco__sub").first().textContent())
    const ontem = semEspaco(await bloco.locator("[data-ontem]").textContent())
    ok(
      sub === `${INTEIRO.format(HOJE_TOTAL)} somadas pelo Google até agora` &&
        ontem ===
          `Ontem: ${INTEIRO.format(ONTEM_TOTAL)} visitas · ${PORCENTO.format((pagosOntem / ONTEM_TOTAL) * 100)}% viraram pedido pago`,
      "o bloco diz o que o Google já somou, e a conta do pedido pago é a de ontem (que fechou)",
      `${sub} | ${ontem}`
    )
    ok(
      semEspaco(await bloco.locator(".agora").textContent()) === "9 no site agora",
      "quem está no site agora"
    )
    const colunas = bloco.locator(".barras-v__col")
    const rotulos = (await colunas.locator(".barras-v__rot").allTextContents()).map(semEspaco)
    // "agora" na hora de agora; 0h, 6h, 12h e 18h só longe dela (no celular, encavalariam).
    const outros = rotulos.map((r, h) => [r, h]).filter(([r, h]) => r && h !== horaDaResposta)
    ok(
      (await colunas.count()) === 24 &&
        rotulos[horaDaResposta] === "agora" &&
        outros.every(([r, h]) => r === `${h}h` && h % 6 === 0 && Math.abs(h - horaDaResposta) > 3),
      "o dia inteiro no eixo, com a hora de agora marcada",
      rotulos.join(",")
    )
    const nomes = (lista) =>
      bloco.locator(`h3:has-text("${lista}") + ul .barras-h__nome`).allTextContents()
    ok(
      JSON.stringify(await nomes("De onde vieram")) === JSON.stringify(ORIGENS.map((o) => o[0])),
      "de onde vieram, na tela"
    )
    ok(
      JSON.stringify(await nomes("Produtos mais vistos")) ===
        JSON.stringify(MAIS_VISTOS.map((o) => o[0])),
      "os mais vistos, na tela"
    )
    ok(
      /algumas horas de atraso/.test(await bloco.textContent()) &&
        /Quem recusa os cookies fica de fora/.test(await bloco.textContent()),
      "o bloco avisa do atraso do Google e de quem recusa os cookies"
    )
    const lado = await pagina
      .locator(".grade-inicio > div:nth-child(2) > section .bloco__titulo")
      .allTextContents()
    ok(
      lado.map(semEspaco).join(" · ").startsWith("Pedidos de hoje · Visitas de hoje"),
      "pro dono, o bloco vem depois dos pedidos de hoje",
      lado.join(" · ")
    )
    await numero.click()
    await pagina.waitForFunction(() => location.hash === "#visitas")
    ok(new URL(pagina.url()).hash === "#visitas", "tocar no número desce até o bloco")
  }

  titulo("O marketing, no celular")
  {
    const { pagina } = mkt
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector("#visitas")
    const lado = await pagina
      .locator(".grade-inicio > div:nth-child(2) > section .bloco__titulo")
      .allTextContents()
    ok(
      semEspaco(lado[0]) === "Visitas de hoje",
      "pro marketing, o bloco vem primeiro",
      lado.join(" · ")
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
    google.dia.horas = [...linhasDeHoje(ultima), ...linhasDeOntem]
    const r = await medusa("/dashboard/visitas", { metodo: "GET", token: tokenDoDono })
    const v = r.corpo.visitas ?? {}
    const h = (v.porHora?.length ?? 0) - 1
    const esperada = comparacaoEsperada(horasDeHoje(ultima), h)
    ok(
      JSON.stringify(v.comparacao) === JSON.stringify(esperada),
      "a comparação para na última hora que o Google somou — nada de −92% num dia normal",
      `${JSON.stringify(v.comparacao)} (esperada ${JSON.stringify(esperada)})`
    )
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector("#visitas")
    ok(
      semEspaco(await pagina.locator('[data-visitas="ok"] .numero__sub').textContent()) ===
        frase(v.hoje, esperada),
      `a tela diz até que hora compara: “${frase(v.hoje, esperada)}”`
    )
    const titulos = await pagina
      .locator("#visitas .barras-v__col")
      .evaluateAll((cs) => cs.map((c) => c.getAttribute("title") ?? ""))
    ok(
      titulos.slice(ultima + 1, h + 1).every((t) => t.endsWith("o Google ainda está somando")),
      "as horas que ele ainda não somou dizem isso, em vez de parecer que ninguém entrou",
      titulos.slice(ultima, h + 1).join(" | ")
    )

    // A propriedade em outro fuso: o "hoje" e a hora são os dela, não os de Brasília.
    google.dia.horas = [...linhasDeHoje(HORA_AGORA), ...linhasDeOntem]
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

  titulo("Quando o Google falha, o Início não")
  {
    const { pagina } = dono
    // Pelo atributo, e não pela posição: enquanto o Google não responde, o
    // segundo filho de `.numeros` é o <template> do streaming, não o número.
    const numeroDoGoogle = () => textoDe(pagina, "[data-visitas]")
    for (const [status, frase] of [
      [403, "o Google recusou a leitura"],
      [500, "o Google não respondeu agora"],
    ]) {
      google.recusar = status
      await pagina.goto(`${PAINEL}/`)
      await pagina.waitForSelector(".numero--destaque")
      await pagina.waitForSelector("[data-visitas]:not([data-visitas=carregando])")
      const texto = semEspaco(await numeroDoGoogle())
      ok(
        texto.includes(frase) && texto.includes("—"),
        `Google ${status}: o número diz “${frase}”`,
        texto
      )
      ok(
        (await pagina.locator("#visitas").count()) === 0 &&
          (await pagina.locator(".bloco__titulo", { hasText: "Precisa de você" }).count()) === 1,
        `Google ${status}: sem o bloco, e o resto do Início no lugar`
      )
    }
    google.recusar = null

    // Lento: o Início chega antes, com o número "perguntando", e as visitas depois.
    google.demora = 2500
    const inicio = Date.now()
    await pagina.goto(`${PAINEL}/`, { waitUntil: "commit" })
    await pagina.waitForSelector(".numero--destaque")
    const antesDasVisitas = Date.now() - inicio
    const esperando = semEspaco(await numeroDoGoogle())
    await pagina.waitForSelector('[data-visitas="ok"]', { timeout: 15000 })
    ok(
      /perguntando ao Google/.test(esperando) && antesDasVisitas < 2500,
      "Google lento: o Início aparece sem esperar, e o número chega depois",
      `${esperando} · ${antesDasVisitas} ms`
    )
    google.demora = 6500
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector("[data-visitas]:not([data-visitas=carregando])", {
      timeout: 20000,
    })
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
