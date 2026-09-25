/**
 * CONFERIDOR DA PROMOÇÃO — o "de/por" de cada produto, mudado na lista de
 * Produtos do painel: o campo que abre ali mesmo, o desconto enquanto a
 * pessoa digita, o que o Medusa recusa, o que a loja cobra depois (uma
 * unidade, e 2 e 3 com o desconto por quantidade em cima da promoção), o
 * histórico do produto, e quem não edita.
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
 * o preço dela como estava, e espera o desconto por quantidade voltar: os
 * outros conferidores contam com esses preços.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o botão coberto pelo link da linha (a linha inteira é um link);      │
 * │ • o "por" maior que o "de", o dedo errado (93% de desconto), o texto;  │
 * │ • a loja cobrando outro preço que o painel mostra;                     │
 * │ • "2 unidades" calculado do preço sem a promoção;                      │
 * │ • duas listas com preço pro mesmo produto (a antiga e a do painel);    │
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
  antes = await linhaDaApi()
  const de = antes.preco
  ok(
    de > 0 && (!lancamento || antes.promocao?.deOutraLista === true),
    "a lista lê a promoção que já existia (a de lançamento, local) e diz que é de outra lista",
    JSON.stringify(antes.promocao)
  )

  titulo("O campo, na lista")
  const { pagina } = dono
  await pagina.goto(`${PAINEL}/produtos`)
  const linha = pagina.locator(`tr[data-produto="${produtoId}"]`)
  await linha.locator("[data-promocao-abrir]").waitFor()
  await linha.locator("[data-promocao-abrir]").click()
  const campo = linha.locator("[data-promocao-form] input")
  await campo.waitFor()
  await campo.fill("5,00")
  const noventa = semEspaco(await linha.locator(".promo-form__desconto").textContent())
  await linha.locator("button[type=submit]").click()
  const erroDoDedo = linha.locator(".promo-form__erro")
  await erroDoDedo.waitFor()
  ok(
    /^−9\d%$/.test(noventa) && semEspaco(await erroDoDedo.textContent()).includes("80%"),
    "o desconto aparece enquanto digita, e o dedo errado (mais de 80%) é recusado ali mesmo",
    `${noventa} · ${await erroDoDedo.textContent()}`
  )
  await campo.fill(String(de + 10).replace(".", ","))
  const naoE = semEspaco(await linha.locator(".promo-form__desconto").textContent())
  await linha.locator("button[type=submit]").click()
  await pagina.waitForFunction(
    (id) =>
      document
        .querySelector(`tr[data-produto="${id}"] .promo-form__erro`)
        ?.textContent?.includes("abaixo do preço do Bling"),
    produtoId
  )
  ok(naoE === "não é desconto", "o 'por' maior que o 'de' também não passa", naoE)

  const POR = 39.9
  await campo.fill("39,90")
  await linha.locator("button[type=submit]").click()
  await pagina.waitForFunction(
    (id) =>
      document
        .querySelector(`tr[data-produto="${id}"] [data-preco]`)
        ?.textContent?.includes("39,90"),
    produtoId,
    { timeout: 20000 }
  )
  const naTela = semEspaco(await linha.locator("[data-preco]").textContent())
  const depois = await linhaDaApi()
  ok(
    depois.promocao?.por === POR &&
      depois.promocao.deOutraLista === false &&
      naTela.includes(`−${depois.promocao.desconto}%`) &&
      !naTela.includes("lista de preço do admin"),
    "salvo: o de riscado, o por e o desconto, e agora é a promoção do painel",
    naTela
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
    "a loja cobra o 'por' e risca o 'de'",
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

  titulo("O histórico e o detalhe")
  await pagina.goto(`${PAINEL}/produtos/${produtoId}`)
  await pagina.waitForSelector("[data-promocao-no-detalhe]")
  const noDetalhe = semEspaco(await pagina.locator("[data-promocao-no-detalhe]").textContent())
  const historico = semEspaco(await pagina.locator("[data-historico]").textContent())
  ok(
    noDetalhe.includes("39,90") &&
      historico.includes("pôs a promoção") &&
      historico.includes("de R$ 72,40 por R$ 39,90"),
    "o detalhe mostra a promoção, e o histórico diz quem pôs, de quanto por quanto",
    `${noDetalhe} · ${historico.slice(0, 160)}`
  )

  titulo("A operação")
  await op.pagina.goto(`${PAINEL}/produtos`)
  await op.pagina.waitForSelector(`tr[data-produto="${produtoId}"] [data-preco]`)
  const mudarOp = await medusa(`/dashboard/produtos/${produtoId}/promocao`, {
    token: cookieOp.value,
    corpo: { por: "10,00" },
  })
  ok(
    (await op.pagina.locator("[data-promocao-abrir]").count()) === 0 && mudarOp.status === 403,
    "a operação vê o preço, sem o botão, e não muda (403)",
    String(mudarOp.status)
  )

  titulo("O celular")
  const cel = await novaAba({ width: 390, height: 844 })
  await cel.contexto.addCookies(await dono.contexto.cookies())
  await cel.pagina.goto(`${PAINEL}/produtos`)
  const cartao = cel.pagina.locator(`.cartao--produto[data-produto="${produtoId}"]`)
  await cartao.locator("[data-promocao-abrir]").waitFor()
  await cartao.locator("[data-promocao-abrir]").click()
  await cartao.locator("[data-promocao-form] input").waitFor()
  ok(await semRolagemDeLado(cel.pagina), "no celular, o campo abre no cartão, sem rolagem de lado")

  titulo("Tirar")
  await cartao.locator("[data-promocao-tirar]").click()
  await cel.pagina.waitForFunction(
    (id) => {
      const el = document.querySelector(`.cartao--produto[data-produto="${id}"] [data-preco]`)
      return Boolean(el && !el.textContent.includes("39,90"))
    },
    produtoId,
    { timeout: 20000 }
  )
  const semPromocao = await naLoja()
  // Se a de lançamento tivesse ficado, a loja cobraria ela aqui: o painel tirou o produto dela.
  ok(
    (await linhaDaApi()).promocao === null && semPromocao.atual === de,
    "tirada: sem promoção nenhuma (nem a antiga), e a loja volta ao preço do Bling",
    JSON.stringify(semPromocao)
  )

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.join(" | "))
} catch (err) {
  falhou(`o conferidor quebrou: ${err instanceof Error ? err.stack : err}`)
} finally {
  // Sem a promoção do painel (tirar tira de todas as listas), e a de lançamento como estava.
  if (tokenDoDono && antes) {
    await medusa(`/dashboard/produtos/${produtoId}/promocao`, {
      token: tokenDoDono,
      corpo: { por: null },
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
