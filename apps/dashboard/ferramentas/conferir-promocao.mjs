/**
 * CONFERIDOR DO PREÇO E DA PROMOÇÃO — os dois campos de cada produto na lista
 * de Produtos do painel, "Preço" e "Promocional", como na Nuvemshop: o valor
 * escrito e salvo com Enter, o desconto enquanto a pessoa digita, o que o
 * Medusa recusa (com o campo que errou), o Esc, o que a loja cobra depois
 * (uma unidade, e 2 e 3 com o desconto por quantidade em cima da promoção), a
 * marca que segura o preço contra a importação do Bling, o histórico, e quem
 * não edita.
 *
 *   (Medusa local; painel e loja no ar)
 *   node apps/dashboard/ferramentas/conferir-promocao.mjs
 *
 * Variáveis: as de `pecas.mjs`, e mais NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 * ADMIN_EMAIL, ADMIN_SENHA e LOJA (a loja local, padrão localhost:3000).
 *
 * O BANCO LOCAL TEM A "PROMOÇÃO DE LANÇAMENTO" antiga (a produção não tem
 * mais: saiu na importação do Bling). O conferidor usa ela pra conferir que
 * o painel manda no de/por — gravar tira o produto dela —, e no fim devolve
 * tudo como estava (o preço, a marca, a promoção antiga) e espera o desconto
 * por quantidade voltar: os outros conferidores contam com esses preços.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o campo coberto pelo link da linha (a linha inteira é um link);      │
 * │ • o promocional maior que o preço, o dedo errado nos dois campos;      │
 * │ • o Esc salvando o que foi digitado;                                   │
 * │ • a loja cobrando outro preço que o painel mostra;                     │
 * │ • "2 unidades" calculado do preço sem a promoção;                      │
 * │ • duas listas com preço pro mesmo produto (a antiga e a do painel);    │
 * │ • o preço do painel sem a marca (a importação do Bling o trocaria);    │
 * │ • a operação mudando preço; rolagem de lado no celular; erro no        │
 * │   console.                                                             │
 * └────────────────────────────────────────────────────────────────────────┘
 */

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
  titulo,
} from "./pecas.mjs"

exigirAmbiente()
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
if (!CHAVE || !process.env.ADMIN_EMAIL || !process.env.ADMIN_SENHA) {
  console.log("  ⚠  faltam NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL e ADMIN_SENHA")
  process.exit(1)
}
const LOJA = (process.env.LOJA ?? "http://localhost:3000").replace(/\/+$/, "")
const HANDLE = "shampoo-para-barba"
const LANCAMENTO = "Promoção de lançamento"
const semEspaco = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()

const resend = await subirResend()
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
async function loja(caminho) {
  const r = await fetch(`${MEDUSA}${caminho}`, { headers: { "x-publishable-api-key": CHAVE } })
  return r.json()
}

/* ── o produto, e como ele estava ─────────────────────────────────────────── */

const { regions } = await loja("/store/regions")
const regiao = regions.find((x) => x.currency_code === "brl")
const { products } = await loja(
  `/store/products?handle=${HANDLE}&region_id=${regiao.id}&fields=id,*variants,*variants.calculated_price`
)
const produtoId = products[0].id
const variante = products[0].variants[0].id
/** O preço de uma unidade na loja, e o riscado. */
async function naLoja() {
  const {
    products: [p],
  } = await loja(
    `/store/products?handle=${HANDLE}&region_id=${regiao.id}&fields=id,*variants.calculated_price`
  )
  const c = p.variants[0].calculated_price
  return { atual: c.calculated_amount, cheio: c.original_amount }
}
/** O que a loja pergunta pra montar "2 unidades" e "3 unidades" (o preço por unidade). */
const porQuantidade = async () =>
  (await loja(`/store/precos-por-quantidade?variante=${variante}`)).precos?.[variante] ?? {}

const { price_lists } = (await adm("/admin/price-lists?fields=id,title&limit=100")).corpo
const lancamento = price_lists.find((l) => l.title === LANCAMENTO) ?? null

let tokenDoDono = ""
/** A linha do produto antes de mexer: é por ela que o fim devolve a promoção antiga. */
let antes = null

/** O campo de um produto, na tabela ou no cartão. */
const campo = (escopo, qual) => escopo.locator(`[data-campo-preco="${qual}"]`)

try {
  titulo("Quem entra")
  const dono = await novaAba()
  const cookieDono = await entrarPelaTela(dono, DONO, caixa)
  if (!cookieDono) throw new Error("o dono não entrou (o código não chegou no Resend falso?)")
  tokenDoDono = cookieDono.value
  const OP = `op.${RODADA}@painel.teste`
  await medusa("/dashboard/equipe", {
    token: tokenDoDono,
    corpo: { nome: "Operação Teste", email: OP, papel: "operacao" },
  })
  const op = await novaAba()
  const cookieOp = await entrarPelaTela(op, OP, caixa)
  ok(Boolean(cookieOp), "o dono e a operação entram")

  const linhaDaApi = async () =>
    (
      await medusa("/dashboard/produtos", { metodo: "GET", token: tokenDoDono })
    ).corpo.produtos.find((p) => p.id === produtoId)
  const detalheDaApi = async () =>
    (await medusa(`/dashboard/produtos/${produtoId}`, { metodo: "GET", token: tokenDoDono })).corpo
      .produto
  antes = await linhaDaApi()
  const de = antes.preco
  ok(
    de > 0 && (!lancamento || antes.promocao?.deOutraLista === true),
    "a lista lê a promoção que já existia (a de lançamento, local) e diz que é de outra lista",
    JSON.stringify(antes.promocao)
  )

  titulo("O promocional, na lista")
  const { pagina } = dono
  await pagina.goto(`${PAINEL}/produtos`)
  const linha = pagina.locator(`tr[data-produto="${produtoId}"]`)
  const promocional = campo(linha, "promocional")
  const preco = campo(linha, "preco")
  await promocional.locator("input").waitFor()
  const erroDo = (c) => c.locator(".campo-preco__erro")
  await promocional.locator("input").fill("5,00")
  const noventa = semEspaco(await promocional.locator(".campo-preco__desconto").textContent())
  await promocional.locator("input").press("Enter")
  await erroDo(promocional).waitFor()
  ok(
    /^−9\d%$/.test(noventa) && semEspaco(await erroDo(promocional).textContent()).includes("80%"),
    "o desconto aparece enquanto digita, e o dedo errado (mais de 80%) é recusado ali mesmo",
    `${noventa} · ${await erroDo(promocional).textContent()}`
  )
  await promocional.locator("input").fill(String(de + 10).replace(".", ","))
  await promocional.locator("input").press("Enter")
  await pagina.waitForFunction(
    (id) =>
      document
        .querySelector(
          `tr[data-produto="${id}"] [data-campo-preco="promocional"] .campo-preco__erro`
        )
        ?.textContent?.includes("abaixo do preço"),
    produtoId
  )
  ok(true, "o promocional maior que o preço também não passa")

  // O Esc volta o que estava, e não salva nada — nem saindo do campo.
  const valorAntes = await promocional.locator("input").inputValue()
  // Um valor que o Medusa aceitaria: se o Esc salvasse, a promoção mudaria de verdade.
  await promocional.locator("input").fill("44,40")
  await promocional.locator("input").press("Escape")
  await esperar(1500)
  const depoisDoEsc = await linhaDaApi()
  ok(
    (await promocional.locator("input").inputValue()) !== "44,40" &&
      depoisDoEsc.promocao?.por === antes.promocao?.por,
    "o Esc volta o valor de antes e não salva",
    `${valorAntes} → ${await promocional.locator("input").inputValue()}`
  )

  const POR = 39.9
  await promocional.locator("input").fill("39,90")
  await promocional.locator("input").press("Enter")
  // Pela API: o desconto já aparece enquanto se digita, então a tela sozinha não diz que gravou.
  let depois = await linhaDaApi()
  for (let i = 0; i < 20 && depois.promocao?.deOutraLista !== false; i++) {
    await esperar(500)
    depois = await linhaDaApi()
  }
  await pagina.waitForFunction(
    (id) =>
      !document.querySelector(
        `tr[data-produto="${id}"] [data-campo-preco="promocional"] .campo-preco__nota`
      ),
    produtoId,
    { timeout: 20000 }
  )
  ok(
    depois.promocao?.por === POR &&
      depois.promocao.deOutraLista === false &&
      (await preco.getAttribute("data-riscado")) !== null &&
      semEspaco(await promocional.textContent()).includes("−45%"),
    "salvo com Enter: o preço fica riscado, o promocional com o desconto, e agora é do painel",
    JSON.stringify(depois.promocao)
  )

  titulo("O que a loja cobra")
  const umaUnidade = await naLoja()
  // 2 unidades: R$ 79,80 − 4% → R$ 75,90 (R$ 37,95 cada); 3: R$ 119,70 − 6% → R$ 111,90 (R$ 37,30).
  let faixas = await porQuantidade()
  for (let i = 0; i < 10 && Number(faixas[2]) !== 37.95; i++) {
    await esperar(1000)
    faixas = await porQuantidade()
  }
  ok(
    umaUnidade.atual === POR && umaUnidade.cheio === de,
    "a loja cobra o promocional e risca o preço",
    JSON.stringify(umaUnidade)
  )
  ok(
    Number(faixas[2]) === 37.95 && Number(faixas[3]) === 37.3,
    "2 e 3 unidades saem do preço da promoção, na hora",
    JSON.stringify(faixas)
  )
  let pagDaLoja = ""
  for (let i = 0; i < 20 && !(pagDaLoja.includes("39,90") && pagDaLoja.includes("72,40")); i++) {
    await esperar(1000)
    pagDaLoja = await (await fetch(`${LOJA}/produtos/${HANDLE}`)).text()
  }
  ok(
    pagDaLoja.includes("39,90") && pagDaLoja.includes("72,40"),
    "a página do produto na loja mostra o de/por em segundos (o Medusa avisa a loja)"
  )

  titulo("O preço, na lista")
  await preco.locator("input").fill("5,00")
  await preco.locator("input").press("Enter")
  await erroDo(preco).waitFor()
  const muitoDeUmaVez = semEspaco(await erroDo(preco).textContent())
  await preco.locator("input").fill("30,00")
  await preco.locator("input").press("Enter")
  await pagina.waitForFunction(
    (id) =>
      document
        .querySelector(`tr[data-produto="${id}"] [data-campo-preco="preco"] .campo-preco__erro`)
        ?.textContent?.includes("abaixo do promocional"),
    produtoId
  )
  ok(
    muitoDeUmaVez.includes("demais"),
    "o preço que muda demais de uma vez, e o que passa por baixo do promocional, são recusados",
    muitoDeUmaVez
  )
  const NOVO = 79.9
  await preco.locator("input").fill("79,90")
  await preco.locator("input").press("Enter")
  let comPrecoNovo = await linhaDaApi()
  for (let i = 0; i < 20 && comPrecoNovo.preco !== NOVO; i++) {
    await esperar(500)
    comPrecoNovo = await linhaDaApi()
  }
  const noCaixa = await naLoja()
  ok(
    comPrecoNovo.preco === NOVO &&
      comPrecoNovo.promocao?.por === POR &&
      noCaixa.cheio === NOVO &&
      noCaixa.atual === POR,
    "o preço novo vale na loja, e a promoção continua (a loja risca o preço novo)",
    JSON.stringify({ painel: comPrecoNovo.preco, loja: noCaixa })
  )
  ok(
    (await detalheDaApi()).precoDoPainel === true,
    "o produto ganhou a marca: a importação do Bling não troca mais esse preço"
  )

  titulo("O histórico e o detalhe")
  await pagina.goto(`${PAINEL}/produtos/${produtoId}`)
  await pagina.waitForSelector("[data-promocao-no-detalhe]")
  const precoNoDetalhe = semEspaco(await pagina.locator("[data-preco-no-detalhe]").textContent())
  const noDetalhe = semEspaco(await pagina.locator("[data-promocao-no-detalhe]").textContent())
  const historico = semEspaco(await pagina.locator("[data-historico]").textContent())
  ok(
    precoNoDetalhe.includes("mudado no painel") &&
      precoNoDetalhe.includes("79,90") &&
      noDetalhe.includes("39,90") &&
      historico.includes("mudou o preço") &&
      historico.includes("de R$ 72,40 pra R$ 79,90") &&
      historico.includes("pôs a promoção") &&
      historico.includes("por R$ 39,90"),
    "o detalhe diz de onde vem o preço, e o histórico diz quem mudou o quê, de quanto pra quanto",
    `${precoNoDetalhe} · ${noDetalhe} · ${historico.slice(0, 200)}`
  )

  titulo("A operação")
  await op.pagina.goto(`${PAINEL}/produtos`)
  await op.pagina.waitForSelector(`tr[data-produto="${produtoId}"] [data-campo-preco="preco"]`)
  const mudarOp = await medusa(`/dashboard/produtos/${produtoId}/preco`, {
    token: cookieOp.value,
    corpo: { promocional: "10,00" },
  })
  ok(
    (await op.pagina.locator("[data-campo-preco] input").count()) === 0 &&
      semEspaco(
        await op.pagina
          .locator(`tr[data-produto="${produtoId}"] [data-campo-preco="promocional"]`)
          .textContent()
      ).includes("39,90") &&
      mudarOp.status === 403,
    "a operação vê os dois valores, sem campo, e não muda (403)",
    String(mudarOp.status)
  )

  titulo("O celular")
  const cel = await novaAba({ width: 390, height: 844 })
  await cel.contexto.addCookies(await dono.contexto.cookies())
  await cel.pagina.goto(`${PAINEL}/produtos`)
  const cartao = cel.pagina.locator(`.cartao--produto[data-produto="${produtoId}"]`)
  await campo(cartao, "promocional").locator("input").waitFor()
  ok(
    (await campo(cartao, "preco").locator("input").inputValue()) === "79,90" &&
      (await semRolagemDeLado(cel.pagina)),
    "no celular, os dois campos no cartão, sem rolagem de lado"
  )

  titulo("Tirar")
  await campo(cartao, "promocional").locator("input").fill("")
  await campo(cartao, "promocional").locator("input").press("Enter")
  let semPromocaoNoPainel = await linhaDaApi()
  for (let i = 0; i < 20 && semPromocaoNoPainel.promocao !== null; i++) {
    await esperar(500)
    semPromocaoNoPainel = await linhaDaApi()
  }
  const semPromocao = await naLoja()
  // Se a de lançamento tivesse ficado, a loja cobraria ela aqui: o painel tirou o produto dela.
  ok(
    semPromocaoNoPainel.promocao === null && semPromocao.atual === NOVO,
    "promocional apagado: sem promoção nenhuma (nem a antiga), e a loja cobra o preço",
    JSON.stringify(semPromocao)
  )

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.join(" | "))
} catch (err) {
  falhou(`o conferidor quebrou: ${err instanceof Error ? err.stack : err}`)
} finally {
  // Tudo como estava: o preço (e sem a marca), sem a promoção do painel, e a de lançamento.
  if (tokenDoDono && antes) {
    await medusa(`/dashboard/produtos/${produtoId}/preco`, {
      token: tokenDoDono,
      corpo: { preco: String(antes.preco).replace(".", ","), promocional: "" },
    })
    await adm(`/admin/products/${produtoId}`, {
      metodo: "POST",
      corpo: { metadata: { fb_preco: "" } },
    })
  }
  if (lancamento && antes?.promocao?.deOutraLista) {
    await adm(`/admin/price-lists/${lancamento.id}/prices/batch`, {
      metodo: "POST",
      corpo: {
        create: [{ variant_id: variante, amount: antes.promocao.por, currency_code: "brl" }],
      },
    })
    // O job do minuto refaz "2 unidades" com o preço devolvido: os próximos conferidores contam com ele.
    const esperado = await naLoja()
    for (let i = 0; i < 75; i++) {
      const f = await porQuantidade()
      if (Number(f[2]) > 0 && Number(f[2]) < esperado.atual) break
      await esperar(1000)
    }
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
  await navegador.close()
  await resend.fechar()
}

process.exit(resumo())
