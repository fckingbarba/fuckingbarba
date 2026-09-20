/**
 * Confere o CHECKOUT comprando de verdade, numa loja de pé, com um Medusa de
 * verdade atrás.
 *
 *   node ferramentas/conferir-checkout.mjs [url-da-loja]
 *
 * O que interessa aqui não é o desenho — é que o pedido que nasce no fim seja
 * o pedido que a tela prometeu no meio. Por isso TODO número conferido é lido
 * do Medusa, e não de outra conta feita neste arquivo: se a tela e o teste
 * fizessem a mesma conta errada, os dois concordariam e o cliente é que
 * descobriria.
 *
 * Também trava três coisas que já quebraram ou quase:
 *
 * - `/checkout` responder 404 porque o proxy tem uma lista de páginas de
 *   primeiro nível mantida à mão (aconteceu);
 * - o CPF não chegar no pedido, porque `metadata` de carrinho é descartado no
 *   `complete` (aconteceu, achado pela API);
 * - a tela de obrigado mostrar endereço pra quem só tem o link.
 *
 * Variáveis: MEDUSA_BACKEND_URL, NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, CHROMIUM.
 */

import { readFileSync } from "node:fs"
import { chromium } from "playwright"

/**
 * `localhost`, e NÃO `127.0.0.1`: o `next dev` recusa POST de origem que não
 * esteja em `allowedDevOrigins`, e server action é POST. Pelo IP, cada clique
 * de "adicionar à sacola" vira um nada silencioso — sem erro na tela, sem
 * linha no log do servidor. Custou uma hora descobrir.
 */
const LOJA = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:3000"
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const CELULAR = { width: 390, height: 844 }

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

async function medusa(caminho) {
  const r = await fetch(`${MEDUSA}${caminho}`, { headers: { "x-publishable-api-key": CHAVE } })
  return r.ok ? r.json() : null
}

const navegador = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
)
const contexto = await navegador.newContext({ viewport: CELULAR })
const pagina = await contexto.newPage()

const errosDeConsole = []
// O websocket de recarga do `next dev` não conecta neste ambiente e enche o
// console de erro que não é da loja. Fora dele, erro no console é erro.
const RUIDO_DE_DEV = /_next\/hmr|websocket/i
pagina.on(
  "console",
  (m) => m.type() === "error" && !RUIDO_DE_DEV.test(m.text()) && errosDeConsole.push(m.text())
)

/**
 * Todo seletor de campo é ANCORADO EM `.checkout__etapas`.
 *
 * O rodapé tem um `input[name=email]` (a caixa de novidades) que aparece em
 * toda página, inclusive nesta. Sem a âncora, o Playwright acha dois e
 * reclama de "strict mode violation" — e, pior, um seletor menos rígido teria
 * preenchido o campo errado calado.
 */
const etapas = () => pagina.locator(".checkout__etapas")
const campo = (nome) => etapas().locator(`[name="${nome}"]`)
const preencher = (nome, valor) => campo(nome).fill(valor)

const idDoCarrinho = async () =>
  (await contexto.cookies()).find((c) => c.name === "carrinho")?.value ?? null

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
// O miolo chega depois da casca (é o que o <Suspense> faz), então esperar o
// elemento é parte do teste, não impaciência.
await pagina.locator(".checkout__vazio").waitFor({ timeout: 15000 })
ok(
  await pagina.locator(".checkout__vazio").isVisible(),
  "sem carrinho, o checkout oferece o caminho de volta em vez de um formulário"
)

/* ── 1. põe alguma coisa na sacola, pela loja mesmo ───────────────────────── */

titulo("Montando a sacola pela loja")
await pagina.goto(`${LOJA}/`, { waitUntil: "domcontentloaded" })
await pagina.locator(".produto__comprar").first().click()
await pagina.waitForURL(/\/produtos\//)
await pagina.locator(".compra__comprar").click()
await pagina.waitForFunction(
  () => document.querySelector(".sacolinha")?.getAttribute("data-vazio") === null,
  { timeout: 15000 }
)
const carrinhoId = await idDoCarrinho()
ok(Boolean(carrinhoId), "o cookie do carrinho existe", `veio ${carrinhoId}`)

const antes = await medusa(`/store/carts/${carrinhoId}?fields=id,item_total,total,*items`)
ok((antes?.cart?.items ?? []).length > 0, "o Medusa concorda que tem item na sacola")

/* ── 2. contato, com o CPF errado primeiro ────────────────────────────────── */

titulo("Etapa 1 — contato")
await pagina.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
await etapas().locator(".etapa").first().waitFor()

ok(
  await etapas().locator(".etapa").first().locator("form").isVisible(),
  "a primeira etapa abre sozinha"
)
ok(
  (await etapas().locator(".etapa.e-aberta").count()) === 1,
  "só uma etapa aberta por vez",
  `${await etapas().locator(".etapa.e-aberta").count()} abertas`
)

const preencheContato = async (documento) => {
  await preencher("email", EMAIL)
  await preencher("nome", "Matheus")
  await preencher("sobrenome", "da Silva Teste")
  await preencher("telefone", "(11) 99999-9999")
  await preencher("documento", documento)
  await etapas().locator(".etapa.e-aberta button[type=submit]").click()
}

await preencheContato(CPF_TORTO)
const erroDoc = campo("documento").locator("xpath=../p[@class='campo__erro']")
await erroDoc.filter({ hasText: /confere/i }).waitFor({ timeout: 10000 })
ok(true, "CPF com dígito trocado é recusado, e a mensagem fica no campo do CPF")
ok(
  (await campo("documento").getAttribute("aria-invalid")) === "true",
  "o campo fica marcado como inválido pra quem usa leitor de tela"
)
ok(
  (await campo("email").inputValue()) === EMAIL,
  "o que já tinha sido digitado não se perde no erro"
)
const depoisDoErro = await medusa(`/store/carts/${carrinhoId}?fields=id,email`)
ok(!depoisDoErro?.cart?.email, "e nada foi gravado no Medusa", "o e-mail não podia ter entrado")

// Máscara: o campo aceita letra por causa do CNPJ alfanumérico (julho/2026).
await preencher("documento", "12abc34501de35")
ok(
  (await campo("documento").inputValue()) === "12.ABC.345/01DE-35",
  "CNPJ alfanumérico entra e ganha a máscara certa",
  await campo("documento").inputValue()
)

await preencheContato(CPF)
await etapas().locator(".etapa").nth(1).locator("form").waitFor({ timeout: 15000 })
ok(true, "com o CPF certo, a etapa fecha e a de entrega abre")
ok(
  (await etapas().locator(".etapa").first().locator(".etapa__resumo").innerText()).includes(EMAIL),
  "a etapa vencida vira um resumo com o que foi preenchido"
)

const comContato = await medusa(`/store/carts/${carrinhoId}?fields=id,email,*billing_address`)
ok(comContato?.cart?.email === EMAIL, "o e-mail chegou no Medusa")
ok(
  comContato?.cart?.billing_address?.metadata?.documento?.valor === "11144477735",
  "o CPF foi guardado no endereço de COBRANÇA, sem pontuação",
  JSON.stringify(comContato?.cart?.billing_address?.metadata ?? null)
)

/* ── 3. entrega, com o CEP preenchendo o resto ────────────────────────────── */

titulo("Etapa 2 — entrega")
await preencher("cep", CEP)
await pagina.waitForFunction(
  () => document.querySelector('.checkout__etapas [name="rua"]')?.value?.length > 0,
  { timeout: 15000 }
)
ok(true, "o CEP preencheu a rua sozinho")
ok(
  (await campo("cidade").inputValue()) === "São Paulo",
  "e a cidade",
  await campo("cidade").inputValue()
)
ok((await campo("uf").inputValue()) === "SP", "e o estado", await campo("uf").inputValue())
ok(
  await campo("numero").evaluate((el) => el === document.activeElement),
  "o foco pulou pro número, que é o único campo que o CEP nunca sabe"
)
ok(
  await campo("rua").isEditable(),
  "e nada ficou travado — CEP acerta a rua e erra o resto com frequência"
)

await preencher("numero", "1578")
await preencher("complemento", "Apto 42")
await etapas().locator(".etapa.e-aberta button[type=submit]").click()
await etapas().locator(".etapa").nth(2).locator("form, .etapa__recado").waitFor({ timeout: 20000 })
ok(true, "endereço salvo, a etapa de frete abre")

/* ── 4. frete: o preço da tela é o preço do Medusa ────────────────────────── */

titulo("Etapa 3 — frete")
const opcoesApi =
  (await medusa(`/store/shipping-options?cart_id=${carrinhoId}`))?.shipping_options ?? []
const linhas = etapas().locator(".frete")
ok(
  (await linhas.count()) === opcoesApi.length,
  `a tela lista as ${opcoesApi.length} opções que o Medusa oferece`,
  `tela mostra ${await linhas.count()}`
)

for (const opcao of opcoesApi) {
  const linha = pagina.locator(".frete", { hasText: opcao.name }).first()
  const mostrado = await linha.locator(".frete__preco").innerText()
  const bate =
    opcao.amount === 0 ? /gr[áa]tis/i.test(mostrado) : numero(mostrado) === Number(opcao.amount)
  ok(bate, `${opcao.name}: a tela diz o que o Medusa cobra (${reais(opcao.amount)})`, mostrado)
}

const escolhida = opcoesApi[0]
await pagina.locator(".frete", { hasText: escolhida.name }).first().locator("input").check()
await etapas().locator(".etapa.e-aberta button[type=submit]").click()
await etapas().locator(".etapa").nth(3).locator("form").waitFor({ timeout: 20000 })

const comFrete = await medusa(
  `/store/carts/${carrinhoId}?fields=id,item_total,shipping_total,total`
)
const totalNaTela = numero(await pagina.locator(".resumo__total dd").innerText())
ok(
  totalNaTela === Number(comFrete.cart.total),
  "o total do resumo é o total do Medusa, já com frete",
  `tela ${reais(totalNaTela)} vs Medusa ${reais(comFrete.cart.total)}`
)
const freteNaTela = await pagina.locator(".resumo__contas dd").nth(1).innerText()
ok(
  Number(comFrete.cart.shipping_total) === 0
    ? /gr[áa]tis/i.test(freteNaTela)
    : numero(freteNaTela) === Number(comFrete.cart.shipping_total),
  "e o frete do resumo também",
  freteNaTela
)

/* ── 5. o pedido ──────────────────────────────────────────────────────────── */

titulo("Etapa 4 — o pedido")
ok(
  (await etapas().locator(".pagamento__aviso").count()) > 0,
  "a tela avisa, em negrito, que este pedido não é cobrado agora",
  "o único provedor configurado aprova sem cobrar; esconder isso seria mentir"
)
ok(
  (await pagina.locator("text=/cart[ãa]o de cr[ée]dito/i").count()) === 0,
  "e não desenha formulário de cartão que não existe"
)

const totalAntesDeFechar = Number(comFrete.cart.total)
await etapas().locator(".etapa.e-aberta button[type=submit]").click()
await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 30000 })
ok(true, "o pedido fechou e a loja foi pra tela de obrigado")

const pedidoId = pagina.url().split("/").pop()
ok(
  pedidoId === pedidoId.toUpperCase().replace("ORDER_", "order_"),
  "o id do pedido chegou na URL com as maiúsculas intactas",
  `o proxy não pode baixar a caixa daqui — veio ${pedidoId}`
)
const { order } =
  (await medusa(
    `/store/orders/${pedidoId}?fields=id,display_id,email,total,shipping_total,*billing_address,*shipping_address`
  )) ?? {}
ok(Boolean(order), "o pedido existe no Medusa", pedidoId)
ok(order?.email === EMAIL, "com o e-mail que foi digitado")
ok(
  Number(order?.total) === totalAntesDeFechar,
  "e com o total que a tela prometeu",
  `pedido ${reais(order?.total)} vs tela ${reais(totalAntesDeFechar)}`
)
ok(
  order?.billing_address?.metadata?.documento?.valor === "11144477735",
  "o CPF sobreviveu até o pedido",
  "sem ele não sai nota fiscal"
)
ok(
  order?.shipping_address?.metadata?.bairro === "Bela Vista",
  "e o bairro também",
  order?.shipping_address?.metadata?.bairro
)
ok(
  order?.shipping_address?.address_1 === "Avenida Paulista, 1578",
  "com rua e número juntos, do jeito que a etiqueta precisa",
  order?.shipping_address?.address_1
)

ok(!(await idDoCarrinho()), "a sacola foi esvaziada", "senão a compra fica parada na gaveta")
// O contador do cabeçalho vive num provedor que NUNCA remonta: sem uma
// releitura por navegação, ele continua marcando os itens da compra que
// acabou de ser feita, e só um F5 corrige.
await pagina
  .locator(".cabecalho__contador")
  .filter({ hasText: /^0$/ })
  .waitFor({ timeout: 10000 })
  .catch(() => {})
ok(
  (await pagina
    .locator(".cabecalho__contador")
    .innerText()
    .catch(() => "?")) === "0",
  "e o contador do cabeçalho zerou sem precisar recarregar",
  await pagina
    .locator(".cabecalho__contador")
    .innerText()
    .catch(() => "?")
)

/* ── 6. a tela de obrigado ────────────────────────────────────────────────── */

titulo("A tela de obrigado")
await pagina.locator(".obrigado__cabeca, .obrigado__nada").waitFor({ timeout: 15000 })
const corpo = await pagina.locator(".obrigado__wrap").innerText()
ok(corpo.includes(`#${order.display_id}`), "mostra o número curto do pedido")
ok(corpo.includes("Avenida Paulista"), "mostra pra onde vai")
ok(corpo.includes(CEP), `com o CEP formatado (${CEP}), não 8 dígitos colados`)
ok(/rastreio/i.test(corpo), "e diz o que acontece agora, incluindo o rastreio")
ok(
  !/chega em \d+ dias|entrega garantida/i.test(corpo),
  "sem prometer prazo que ninguém pode cumprir ainda"
)

// Recarregar não pode inventar outro pedido nem perder o que tem.
await pagina.reload({ waitUntil: "domcontentloaded" })
await pagina.locator(".obrigado__cabeca").waitFor({ timeout: 15000 })
ok(
  (await pagina.locator(".obrigado__wrap").innerText()).includes(`#${order.display_id}`),
  "recarregar mantém o pedido na tela"
)

titulo("O mesmo link, em outro navegador")
const estranho = await navegador.newContext({ viewport: CELULAR })
const outraPagina = await estranho.newPage()
await outraPagina.goto(pagina.url(), { waitUntil: "domcontentloaded" })
await outraPagina.locator(".obrigado__cabeca").waitFor({ timeout: 15000 })
const visto = await outraPagina.locator(".obrigado__wrap").innerText()
ok(visto.includes(`#${order.display_id}`), "quem tem o link confirma que o pedido existe")
ok(!visto.includes("Avenida Paulista"), "mas NÃO vê o endereço de quem comprou")
ok(!visto.includes(EMAIL), "nem o e-mail")
await estranho.close()

/* ── 7. o que quebra sem barulho ──────────────────────────────────────────── */

titulo("Higiene")
ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.slice(0, 3).join(" | "))

await pagina.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
await pagina.locator(".checkout__vazio").waitFor({ timeout: 15000 })
ok(
  await pagina.locator(".checkout__vazio").isVisible(),
  "depois de comprar, o checkout volta a oferecer o caminho de volta"
)

await navegador.close()
console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
