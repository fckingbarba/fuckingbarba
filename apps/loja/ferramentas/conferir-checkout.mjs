/**
 * Confere o CHECKOUT comprando de verdade, numa loja de pé, com um Medusa de
 * verdade atrás.
 *
 *   node ferramentas/conferir-checkout.mjs [url-da-loja]
 *
 * O que interessa não é o desenho — é que o pedido que nasce no fim seja o
 * pedido que a tela prometeu no meio. Por isso TODO número conferido é lido
 * do Medusa, e não de outra conta feita neste arquivo: se a tela e o teste
 * fizessem a mesma conta errada, os dois concordariam e o cliente é que
 * descobriria.
 *
 * O QUE ESTE ARQUIVO EXISTE PRA TRAVAR — tudo já quebrou:
 *
 * - `/checkout` responder 404, porque o proxy tem uma lista de páginas de
 *   primeiro nível mantida à mão;
 * - o id do pedido chegar minúsculo na URL (o proxy baixava a caixa, e id de
 *   pedido do Medusa é ULID com maiúscula) e a tela dizer "não achei";
 * - o CPF não chegar no pedido, porque `metadata` de carrinho é descartado
 *   no `complete`;
 * - o passo 2 não avançar, porque o frete marcado por padrão na tela nunca
 *   era gravado no carrinho;
 * - o formulário esvaziar quando um campo dá erro (o React dá reset no
 *   `<form action>`);
 * - o desconto do bump existir só no HTML.
 *
 * Variáveis: MEDUSA_BACKEND_URL, NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, CHROMIUM.
 */

import { readFileSync } from "node:fs"
import { chromium } from "playwright"

/**
 * `localhost`, e NÃO `127.0.0.1`: o `next dev` recusa POST de origem que não
 * esteja em `allowedDevOrigins`, e server action é POST. Pelo IP, cada clique
 * vira um nada silencioso — sem erro na tela, sem linha no log do servidor.
 */
const LOJA = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:3000"
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const CELULAR = { width: 390, height: 844 }
const MESA = { width: 1280, height: 1000 }

const CHAVE =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ??
  (() => {
    try {
      const env = readFileSync(new URL("../.env.development.local", import.meta.url), "utf8")
      return env.match(/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=(.+)$/m)?.[1]?.trim() ?? ""
    } catch {
      return ""
    }
  })()

/** Um CPF que fecha o módulo 11. Não é de ninguém. */
const CPF = "111.444.777-35"
const CPF_TORTO = "111.444.777-36"
const CEP = "01310-100" // Avenida Paulista — CEP que o ViaCEP conhece de cor
const EMAIL = "teste.checkout@fuckingbarba.invalid"
/** O mesmo do `conteudo/checkout.ts` e do `promocoes.ts` do backend. */
const BUMP_DESCONTO = 20
const PISO = 149.9

let falhas = 0
let testes = 0
const ok = (cond, texto, det = "") => {
  testes++
  if (cond) console.log(`  ✓ ${texto}`)
  else {
    falhas++
    console.log(`  ✗ ${texto}${det ? ` — ${det}` : ""}`)
  }
}
const titulo = (t) => console.log(`\n${t}`)
const reais = (n) => `R$ ${Number(n).toFixed(2).replace(".", ",")}`
const numero = (txt) =>
  Number(
    String(txt)
      .replace(/[^\d,]/g, "")
      .replace(",", ".")
  )
const perto = (a, b) => Math.abs(a - b) < 0.02

async function medusa(caminho) {
  const r = await fetch(`${MEDUSA}${caminho}`, { headers: { "x-publishable-api-key": CHAVE } })
  return r.ok ? r.json() : null
}

const navegador = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
)
const contexto = await navegador.newContext({ viewport: MESA })
const pagina = await contexto.newPage()

const errosDeConsole = []
// O websocket de recarga do `next dev` não conecta neste ambiente e enche o
// console de erro que não é da loja. Fora dele, erro no console é erro.
const RUIDO_DE_DEV = /_next\/hmr|websocket/i
pagina.on(
  "console",
  (m) => m.type() === "error" && !RUIDO_DE_DEV.test(m.text()) && errosDeConsole.push(m.text())
)

const fluxo = () => pagina.locator(".fluxo")
const campo = (nome) => fluxo().locator(`[name="${nome}"]`)
const preencher = (nome, valor) => campo(nome).fill(valor)
const idDoCarrinho = async () =>
  (await contexto.cookies()).find((c) => c.name === "carrinho")?.value ?? null

/**
 * Põe um produto na sacola pela PDP e só volta quando o Medusa confirma a
 * linha.
 *
 * Espera o carrinho TER ITEM, e não a gaveta abrir nem o cookie existir: o
 * cookie nasce antes da linha — a ação cria o carrinho, grava o cookie e só
 * então adiciona o produto. Esperar o cookie deixa passar o instante em que
 * o carrinho existe e está vazio, e aí o checkout mostra "sacola vazia" e o
 * teste falha por um motivo que não é o bug que ele procura.
 *
 * No celular a PDP tem uma barra de compra grudada no rodapé, e é ela que
 * fica na frente; por isso o clique escolhe o botão que estiver visível.
 */
async function poeNaSacola(pag, ctx, handle) {
  await pag.goto(`${LOJA}/produtos/${handle}`, { waitUntil: "domcontentloaded" })
  const principal = pag.locator(".compra__comprar")
  const grudado = pag.locator(".barra-compra button, .barra-compra a").first()

  /**
   * Espera o botão principal ficar VISÍVEL antes de decidir qual clicar.
   *
   * Decidir na hora em que ele só está "attached" era o erro: a PDP chega em
   * pedaços e o bloco de compra entra por `IntersectionObserver` (as classes
   * `.js-revela` do base.css), então naquele instante `isVisible()` responde
   * `false` — e o teste ia clicar na barra grudada, que no desktop nunca
   * aparece. Ficava 30s tentando clicar num elemento que não existe pra
   * aquela largura.
   */
  let botao = principal
  try {
    await principal.scrollIntoViewIfNeeded({ timeout: 15000 })
    await principal.waitFor({ state: "visible", timeout: 15000 })
  } catch {
    botao = grudado
    await grudado.waitFor({ state: "visible", timeout: 15000 })
  }

  // Duas tentativas. Clique que chega enquanto a ilha de compra ainda hidrata
  // não dispara nada, e o teste morreria num "carrinho nulo" que não diz o
  // que houve. Não é esconder bug do checkout: quem testa o botão de comprar
  // é o conferidor da PDP; aqui ele é só o caminho até a tela que interessa.
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    await botao.click()
    for (let i = 0; i < 30; i++) {
      await pag.waitForTimeout(500)
      const id = (await ctx.cookies()).find((c) => c.name === "carrinho")?.value
      if (!id) continue
      const carrinho = (await medusa(`/store/carts/${id}?fields=id,*items`))?.cart
      if (carrinho?.items?.length) return id
    }
    console.log(`    (tentativa ${tentativa} de pôr ${handle} na sacola não pegou)`)
  }

  console.log(
    `    recado da PDP: "${await pag
      .locator(".compra__recado")
      .innerText()
      .catch(() => "—")}"`
  )
  return null
}

/* ── 0. a rota existe mesmo ───────────────────────────────────────────────── */

titulo("A rota")
const resposta = await pagina.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
ok(resposta?.status() === 200, "/checkout responde 200", `veio ${resposta?.status()}`)
ok(
  !(await pagina.locator("text=/não encontrei|não encontrada/i").count()),
  "não caiu no 404 do proxy",
  "a lista PAGINAS_RAIZ em src/proxy.ts precisa conter 'checkout'"
)

titulo("Sacola vazia")
await pagina.locator(".checkout__vazio").waitFor({ timeout: 15000 })
ok(
  await pagina.locator(".checkout__vazio").isVisible(),
  "sem carrinho, o checkout oferece o caminho de volta em vez de um formulário"
)

/* ── 1. monta a sacola pela loja ──────────────────────────────────────────── */

titulo("Montando a sacola pela loja")
// O shampoo, e NÃO o óleo: o óleo é o produto do order bump, e ter ele no
// carrinho faz o bump sumir — que é o comportamento certo, e esconderia o
// teste do bump lá embaixo.
const carrinhoId = await poeNaSacola(pagina, contexto, "shampoo-para-barba")
ok(Boolean(carrinhoId), "o carrinho existe e tem o produto", `veio ${carrinhoId}`)

/**
 * Sobe pra duas unidades, PELA API, porque isto é preparação e não o que o
 * teste afirma.
 *
 * O ponto é o tamanho do buraco pro frete grátis: com uma unidade faltam
 * R$ 100 e quase nada do catálogo fecha a conta sozinho — sobra um chip só, e
 * o teste passa a depender de um produto específico existir e ter estoque.
 * Com duas, faltam R$ 50 e vários produtos qualificam, que é também o
 * carrinho mais parecido com o de quem está perto do piso.
 */
{
  const c = (await medusa(`/store/carts/${carrinhoId}?fields=id,*items`))?.cart
  const linha = c?.items?.[0]
  if (linha) {
    await fetch(`${MEDUSA}/store/carts/${carrinhoId}/line-items/${linha.id}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-publishable-api-key": CHAVE },
      body: JSON.stringify({ quantity: 2 }),
    })
  }
}

/* ── 2. passo 1: contato, com o CPF errado primeiro ───────────────────────── */

titulo("Passo 1 — contato")
await pagina.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
await pagina.locator("#form-contato").waitFor({ timeout: 20000 })

ok((await pagina.locator(".painel[data-ativo]").count()) === 1, "só um passo aberto por vez")
ok(
  // Por posição, e não por texto: abaixo de 560px o CSS zera a fonte dos
  // rótulos (sobra só o número), e um teste que lê o texto passaria no
  // desktop e falharia no celular por um motivo que não é bug.
  (await pagina.locator(".passos li").first().getAttribute("aria-current")) === "step",
  "o stepper marca o passo 1"
)

const preencheContato = async (documento) => {
  await preencher("email", EMAIL)
  await preencher("nome", "Matheus")
  await preencher("sobrenome", "da Silva Teste")
  await preencher("telefone", "(11) 99999-9999")
  await preencher("documento", documento)
  await pagina.locator("#form-contato button[type=submit]").click()
}

await preencheContato(CPF_TORTO)
await pagina
  .locator("#form-contato .campo__erro", { hasText: /confere/i })
  .first()
  .waitFor({ timeout: 10000 })
ok(true, "CPF com dígito trocado é recusado, e a mensagem fica no campo do CPF")
ok(
  (await campo("documento").getAttribute("aria-invalid")) === "true",
  "o campo fica marcado como inválido pra quem usa leitor de tela"
)
ok(
  (await campo("email").inputValue()) === EMAIL,
  "o que já tinha sido digitado não se perde no erro",
  "o React dá reset no <form action>; a ação devolve os valores"
)
const depoisDoErro = await medusa(`/store/carts/${carrinhoId}?fields=id,email`)
ok(!depoisDoErro?.cart?.email, "e nada foi gravado no Medusa")

// A máscara aceita letra por causa do CNPJ alfanumérico (julho/2026).
await preencher("documento", "12abc34501de35")
ok(
  (await campo("documento").inputValue()) === "12.ABC.345/01DE-35",
  "CNPJ alfanumérico entra e ganha a máscara certa",
  await campo("documento").inputValue()
)

await preencheContato(CPF)
await pagina.locator("#form-entrega").waitFor({ timeout: 20000 })
ok(true, "com o CPF certo, o passo fecha e o de entrega abre")
ok(
  (await pagina.locator(".feito-passo__txt").first().innerText()).includes(EMAIL),
  "o passo vencido vira uma linha com o que foi preenchido"
)
ok(
  (await pagina.locator(".passos li[data-feito]").count()) === 1,
  "e o stepper marca o passo 1 como feito"
)

const comContato = await medusa(`/store/carts/${carrinhoId}?fields=id,email,*billing_address`)
ok(comContato?.cart?.email === EMAIL, "o e-mail chegou no Medusa")
ok(
  comContato?.cart?.billing_address?.metadata?.documento?.valor === "11144477735",
  "o CPF foi guardado no endereço de COBRANÇA, sem pontuação",
  JSON.stringify(comContato?.cart?.billing_address?.metadata ?? null)
)

/* ── 3. passo 2: CEP, endereço, frete e o chip ────────────────────────────── */

titulo("Passo 2 — entrega")
ok(
  await pagina.locator("#form-entrega [data-endereco]").isHidden(),
  "o endereço começa escondido: só o CEP à vista"
)

await preencher("cep", CEP)
await pagina.waitForFunction(
  () => document.querySelector('.fluxo [name="rua"]')?.value?.length > 0,
  { timeout: 20000 }
)
ok(true, "o CEP preencheu a rua sozinho")
ok((await campo("cidade").inputValue()) === "São Paulo", "e a cidade")
ok((await campo("uf").inputValue()) === "SP", "e o estado")
ok(
  await campo("numero").evaluate((el) => el === document.activeElement),
  "o foco pulou pro número, que é o único campo que o CEP nunca sabe"
)
ok(await campo("rua").isEditable(), "e nada ficou travado")

titulo("As opções de frete")
const opcoesApi =
  (await medusa(`/store/shipping-options?cart_id=${carrinhoId}`))?.shipping_options ?? []
await pagina.locator("#form-entrega .opcao").first().waitFor({ timeout: 15000 })
ok(
  (await pagina.locator("#form-entrega .opcao").count()) === opcoesApi.length,
  `a tela lista as ${opcoesApi.length} opções que o Medusa oferece`,
  `tela mostra ${await pagina.locator("#form-entrega .opcao").count()}`
)
for (const opcao of opcoesApi) {
  const linha = pagina.locator("#form-entrega .opcao", { hasText: opcao.name }).first()
  const mostrado = await linha.locator(".opcao__valor").innerText()
  const bate =
    opcao.amount === 0 ? /gr[áa]tis/i.test(mostrado) : numero(mostrado) === Number(opcao.amount)
  ok(bate, `${opcao.name}: a tela diz o que o Medusa cobra (${reais(opcao.amount)})`, mostrado)
}

titulo("Completa o frete grátis")
const faixa = pagina.locator(".completa")
ok(await faixa.isVisible(), "a faixa aparece quando falta pouco")

const carrinhoAntes = (await medusa(`/store/carts/${carrinhoId}?fields=item_total`))?.cart
const faltaNaTela = numero(await faixa.locator(".completa__txt b").first().innerText())
ok(
  perto(faltaNaTela, PISO - Number(carrinhoAntes.item_total)),
  `o que falta bate com o carrinho (${reais(PISO - Number(carrinhoAntes.item_total))})`,
  `tela diz ${reais(faltaNaTela)}`
)

const chips = pagina.locator(".completa__chip")
const quantosChips = await chips.count()
ok(quantosChips > 0, "tem pelo menos um produto sugerido")

// A regra que torna a oferta honesta: só entra na lista quem SOZINHO fecha a
// conta. Chip que não libera o frete transforma a promessa em mentira.
let todosFecham = true
for (let i = 0; i < quantosChips; i++) {
  const preco = numero(await chips.nth(i).locator("small").innerText())
  if (preco < faltaNaTela) todosFecham = false
}
ok(todosFecham, "e todo chip sugerido fecha a conta sozinho")

/**
 * Tenta os chips em ordem até um pegar.
 *
 * Não é tolerância a bug: é que o catálogo local muda de estoque a cada
 * rodada, e um chip cujo produto acabou entre a página montar e o clique
 * chegar é EXATAMENTE o caso que a faixa passou a tratar — ela mostra o
 * recado vermelho e a pessoa escolhe outro. O que o teste afirma é a
 * promessa: ALGUM chip libera o frete.
 */
const gratisNaTela = pagina.locator("#form-entrega .opcao__valor[data-gratis]")
let liberou = false
for (let i = 0; i < quantosChips && !liberou; i++) {
  const restantes = pagina.locator(".completa__chip")
  if ((await restantes.count()) <= i) break
  // Pelo índice, e não sempre o primeiro: um chip que falhou continua na
  // lista (de propósito — a pessoa pode tentar outro), e reclicar nele seria
  // repetir a mesma falha até o teste desistir.
  await restantes.nth(i).click()
  try {
    await gratisNaTela.waitFor({ timeout: 20000 })
    liberou = true
  } catch {
    const recado = await pagina
      .locator(".completa__falhou")
      .innerText()
      .catch(() => "(sem recado)")
    console.log(`    (chip ${i + 1} não pegou — a tela disse: "${recado}")`)
  }
}
ok(liberou, "clicar num chip libera o frete grátis")
const comChip = (await medusa(`/store/carts/${carrinhoId}?fields=item_total,*items`))?.cart
ok(comChip.items.length === 2, "o produto entrou no carrinho")
ok(Number(comChip.item_total) >= PISO, "e o carrinho passou do piso", reais(comChip.item_total))

ok((await gratisNaTela.count()) === 1, "e só UMA opção — a mais barata — diz Grátis")
ok(
  (await pagina.locator("#form-entrega .opcao__valor").last().innerText()).includes("R$"),
  "e a outra continua cobrando: frete grátis não paga pressa"
)

await preencher("numero", "1578")
await preencher("complemento", "Apto 42")
await pagina.locator("#form-entrega button[type=submit]").click()
await pagina.locator("#form-pagamento").waitFor({ timeout: 25000 })
ok(true, "endereço e frete salvos de uma vez, e o passo 3 abre")

/* ── 4. passo 3: as formas, o bump e o pedido ─────────────────────────────── */

titulo("Passo 3 — pagamento")
ok(
  (await pagina.locator("#form-pagamento .opcao").count()) === 3,
  "as três formas aparecem: Pix, cartão e boleto"
)
ok(
  (await pagina.locator(".pagamento__aviso").count()) > 0,
  "e a tela avisa, em negrito, que este pedido não é cobrado agora"
)

await pagina.locator("#form-pagamento .opcao", { hasText: "Cartão" }).locator("input").check()
const cartao = pagina.locator(".pagamento__painel[data-ativo] input").first()
await cartao.fill("4111 1111 1111 1111")
ok(
  (await pagina.locator(".campo__icone").first().innerText()).toLowerCase() === "visa",
  "o número do cartão revela a bandeira enquanto digita"
)
await cartao.fill("4111 1111 1111 1112")
await cartao.blur()
await pagina.waitForTimeout(400)
ok(
  (
    await pagina.locator(".pagamento__painel[data-ativo] .campo__erro").first().innerText()
  ).includes("inválido"),
  "e um dígito trocado é recusado pelo Luhn, antes de qualquer clique"
)
ok(
  (await pagina.locator(".pagamento__painel[data-ativo] input[name]").count()) === 0,
  "NENHUM campo de cartão tem `name`",
  "campo sem nome não entra no FormData, então o número não chega ao servidor"
)

titulo("Order bump")
const bump = pagina.locator(".bump")
ok(await bump.isVisible(), "a caixinha aparece")

const precoDe = numero(await bump.locator(".bump__preco s").innerText())
const precoPor = numero(await bump.locator(".bump__preco span").innerText())
ok(
  perto(precoPor, precoDe * (1 - BUMP_DESCONTO / 100)),
  `o "por" da tela é ${BUMP_DESCONTO}% abaixo do "de" (${reais(precoDe)} → ${reais(precoPor)})`,
  `tela diz ${reais(precoPor)}`
)

const totalAntesDoBump = await pagina.locator(".totais__total dd").innerText()
await bump.locator("input[type=checkbox]").check()
await pagina.waitForFunction(
  (antes) => document.querySelector(".totais__total dd")?.textContent !== antes,
  totalAntesDoBump,
  { timeout: 25000 }
)

const comBump = (
  await medusa(
    `/store/carts/${carrinhoId}?fields=item_total,discount_total,total,*items,*promotions`
  )
)?.cart
ok(comBump.items.length === 3, "o produto do bump entrou no pedido")
ok(
  perto(Number(comBump.discount_total), precoDe - precoPor),
  `e o Medusa DESCONTOU os ${reais(precoDe - precoPor)} que a tela prometeu`,
  `desconto do Medusa: ${reais(comBump.discount_total)}`
)
console.log("    → o desconto existe no backend; a tela não inventa preço")

const totalNaTela = numero(await pagina.locator(".totais__total dd").innerText())
ok(
  perto(totalNaTela, Number(comBump.total)),
  "o total do resumo é o total do Medusa",
  `tela ${reais(totalNaTela)} vs Medusa ${reais(comBump.total)}`
)

titulo("Cupom")
await pagina.locator(".cupom__abre").first().click()
await pagina.locator("#cupom").fill("NAO-EXISTE-ISSO")
await pagina.locator("#cupom-form button[type=submit]").click()
await pagina.locator(".cupom__msg[data-tipo=erro]").waitFor({ timeout: 15000 })
ok(true, "código inventado é recusado, com a resposta do Medusa")
const semCupomFalso = (await medusa(`/store/carts/${carrinhoId}?fields=*promotions`))?.cart
ok(
  !(semCupomFalso.promotions ?? []).some((p) => p.code === "NAO-EXISTE-ISSO"),
  "e não fica pendurado no carrinho"
)

titulo("O pedido")
const totalAntesDeFechar = Number(comBump.total)
await pagina.locator("#form-pagamento button[type=submit]").click()
await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 30000 })

const pedidoId = pagina.url().split("/").pop()
ok(
  pedidoId === pedidoId.toUpperCase().replace("ORDER_", "order_"),
  "o id do pedido chegou na URL com as maiúsculas intactas",
  `o proxy não pode baixar a caixa daqui — veio ${pedidoId}`
)

const { order } =
  (await medusa(
    `/store/orders/${pedidoId}?fields=id,display_id,email,total,discount_total,` +
      `*billing_address,*shipping_address,*items`
  )) ?? {}
ok(Boolean(order), "o pedido existe no Medusa", pedidoId)
ok(order?.email === EMAIL, "com o e-mail que foi digitado")
ok(
  perto(Number(order?.total), totalAntesDeFechar),
  "e com o total que a tela prometeu",
  `pedido ${reais(order?.total)} vs tela ${reais(totalAntesDeFechar)}`
)
ok(
  perto(Number(order?.discount_total), precoDe - precoPor),
  "o desconto do bump sobreviveu até o pedido",
  `veio ${reais(order?.discount_total)}`
)
ok(
  order?.billing_address?.metadata?.documento?.valor === "11144477735",
  "o CPF sobreviveu até o pedido",
  "sem ele não sai nota fiscal"
)
ok(
  order?.shipping_address?.address_1 === "Avenida Paulista, 1578",
  "com rua e número juntos, do jeito que a etiqueta precisa",
  order?.shipping_address?.address_1
)
ok(!(await idDoCarrinho()), "a sacola foi esvaziada")

titulo("A tela de obrigado")
await pagina.locator(".feito").waitFor({ timeout: 15000 })
const corpo = await pagina.locator("main.obrigado").innerText()
ok(corpo.includes(`#${order.display_id}`), "mostra o número curto do pedido")
ok(corpo.includes("Avenida Paulista"), "mostra pra onde vai")
ok(/rastreio/i.test(corpo), "e diz o que acontece agora, incluindo o rastreio")
ok(
  !/chega em \d+ dias|entrega garantida/i.test(corpo),
  "sem prometer prazo que ninguém pode cumprir ainda"
)

titulo("O mesmo link, em outro navegador")
const estranho = await navegador.newContext({ viewport: MESA })
const outraPagina = await estranho.newPage()
await outraPagina.goto(pagina.url(), { waitUntil: "domcontentloaded" })
await outraPagina.locator(".feito").waitFor({ timeout: 15000 })
const visto = await outraPagina.locator("main.obrigado").innerText()
ok(visto.includes(`#${order.display_id}`), "quem tem o link confirma que o pedido existe")
ok(!visto.includes("Avenida Paulista"), "mas NÃO vê o endereço de quem comprou")
ok(!visto.includes(EMAIL), "nem o e-mail")
await estranho.close()

/* ── 5. o celular ─────────────────────────────────────────────────────────── */

titulo("No celular")
const celular = await navegador.newContext({ viewport: CELULAR })
const noCelular = await celular.newPage()
const noCarrinhoDoCelular = await poeNaSacola(noCelular, celular, "shampoo-para-barba")
ok(Boolean(noCarrinhoDoCelular), "a sacola do celular tem item antes de abrir o checkout")
await noCelular.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
await noCelular.locator("#form-contato").waitFor({ timeout: 20000 })

ok(
  await noCelular.locator(".barra__btn").isVisible(),
  "a barra fixa aparece, porque é ela que manda no celular"
)
ok(
  await noCelular.locator("#form-contato button[type=submit]").isHidden(),
  "e o botão de dentro do passo some, pra não haver dois"
)
ok(
  (await noCelular.locator(".resumo").boundingBox()).y <
    (await noCelular.locator(".fluxo").boundingBox()).y,
  "o resumo sobe pro topo: 'quanto vou pagar?' não pode estar a três rolagens"
)
const totalDaBarra = numero(await noCelular.locator(".barra__total b").innerText())
const totalDoResumo = numero(await noCelular.locator(".totais__total dd").innerText())
ok(perto(totalDaBarra, totalDoResumo), "e a barra mostra o mesmo total do resumo")
await celular.close()

/* ── 6. higiene ───────────────────────────────────────────────────────────── */

titulo("Higiene")
ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.slice(0, 3).join(" | "))

await navegador.close()
console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
