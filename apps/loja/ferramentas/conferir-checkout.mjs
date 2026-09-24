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
 * - o desconto do bump existir só no HTML;
 * - a gaveta ficar aberta por cima do checkout, engolindo o primeiro clique;
 * - trocar o frete trocar a página inteira pelo esqueleto;
 * - o bump "marcar e desmarcar" sem a promoção no Medusa, deixando o
 *   produto no carrinho a preço cheio; e sumir da tela depois de marcado;
 * - a oferta do checkout ser fixa — o mesmo óleo pra todo mundo — e o pedido
 *   não guardar o que ela ofereceu, que é de onde o motor aprende;
 * - o segundo clique em pagar (ou toque na barra do celular) mandar outro
 *   pedido, com a tela parada sem dizer que estava trabalhando;
 * - a home aberta pelo logo do checkout (ou da tela de obrigado) vir sem
 *   cabeçalho e sem rodapé — o Next guarda a página escondida, e o
 *   `body:has(.pagina)` seguia casando com ela;
 * - o resumo fechar no desktop, onde ele é a coluna do lado, e a seta dele
 *   cair pra baixo do total;
 * - o celular sem máscara;
 * - o cartão ser autorizado por um total diferente do que o botão dizia, com
 *   a sacola mudada em outra aba (24/09);
 * - o CEP trocado na sacola manter o número da rua antiga e o checkout pular
 *   pro pagamento; o CEP de uma cidade gravado com o endereço de outra;
 * - a "Entrega expressa" cobrada sendo o mesmo serviço da econômica grátis;
 * - cupom cadastrado em minúsculas nunca aplicar;
 * - as 2 e 3 unidades seguirem o preço da promoção depois de ela acabar.
 *
 * Variáveis: MEDUSA_BACKEND_URL, NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, CHROMIUM;
 * ADMIN_EMAIL e ADMIN_SENHA, opcionais, pro bump com a promoção desligada, pra
 * ler no pedido o registro da oferta, pro cupom em minúsculas e pra promoção
 * que acaba (que desliga e religa a promoção do óleo, esperando o job).
 */

import { readFileSync } from "node:fs"
import { chromium } from "playwright"
import { SERVICOS, subirFrenetFalsa } from "./frenet-falsa.mjs"
import { subirPagarmeFalso } from "./pagarme-falso.mjs"
import { vigiarRecargaDoDev } from "./recarga-do-dev.mjs"

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
/** O mesmo do `conteudo/checkout.ts` e do `lib/bumps.ts` do backend. */
const BUMP_DESCONTO = 10

/**
 * O PISO É LIDO DA LOJA, não escrito aqui.
 *
 * Estava `const PISO = 149.9`, e o teste quebrou no dia em que o piso mudou
 * pra 139,90 no admin — acusando a tela de errar por R$ 10 quando a tela
 * estava certa. Teste com número fixo de configuração é o mesmo problema que
 * o código tinha: duas fontes pro mesmo valor, e a que ninguém revisita
 * vence a discussão.
 *
 * Sem promoção configurada, `PISO` é 0 e os testes de "falta X pro frete
 * grátis" são pulados — não há o que faltar.
 */
const PISO = await (async () => {
  const r = await fetch(`${MEDUSA}/store/configuracoes`, {
    headers: { "x-publishable-api-key": CHAVE },
  })
  const { configuracoes } = await r.json()
  return configuracoes?.frete?.modo === "nenhuma" ? 0 : (configuracoes?.frete?.piso ?? 0)
})()

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

async function medusa(caminho, cabecalhos = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    headers: { "x-publishable-api-key": CHAVE, ...cabecalhos },
  })
  return r.ok ? r.json() : null
}

/** A mesma ida, devolvendo o status e o texto cru — pra conferir o que NÃO veio. */
async function medusaCru(caminho, { metodo = "GET", corpo, cabecalhos = {} } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: { "content-type": "application/json", "x-publishable-api-key": CHAVE, ...cabecalhos },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const texto = await r.text()
  let json = null
  try {
    json = JSON.parse(texto)
  } catch {}
  return { status: r.status, texto, json }
}

/**
 * Roda `fn` vigiando o DOM, e devolve, pra cada seletor, se ele APARECEU em
 * algum momento no meio do caminho.
 *
 * É como se afirma coisa que dura meio segundo — a barrinha da troca de
 * frete, a cortina do pagamento, o esqueleto que NÃO pode aparecer — sem
 * depender de fotografar no instante certo: com a Frenet e o Pagar.me
 * falsos respondendo na hora, "esperar 50 ms e olhar" vira sorteio.
 */
async function vigiar(pag, seletores, fn) {
  await pag.evaluate((lista) => {
    const viu = Object.fromEntries(lista.map((s) => [s, false]))
    const olha = () => {
      for (const s of lista) if (!viu[s] && document.querySelector(s)) viu[s] = true
    }
    window.__vigia = { viu, obs: new MutationObserver(olha) }
    window.__vigia.obs.observe(document.body, { childList: true, subtree: true, attributes: true })
    olha()
  }, seletores)
  await fn()
  return pag.evaluate(() => {
    window.__vigia.obs.disconnect()
    return window.__vigia.viu
  })
}

/**
 * Dentro de um `vigiar` que olha `.resumo[data-recalculando]`: espera o
 * recálculo COMEÇAR e ACABAR. Só "acabar" não serve — logo depois do clique
 * ele pode ainda nem ter começado, e aí a espera passaria na hora. Se nunca
 * começar, desiste em 20 s e deixa o `ok` de quem chamou dizer o que faltou.
 */
const esperarRecalculo = (pag) =>
  pag
    .waitForFunction(
      () =>
        window.__vigia.viu[".resumo[data-recalculando]"] &&
        !document.querySelector(".resumo[data-recalculando]"),
      null,
      { timeout: 20000 }
    )
    .catch(() => null)

/*
  Admin, só pra um teste: o bump com a promoção DESLIGADA, que é o caso de
  um Medusa onde o `backend:promocoes` nunca rodou. Sem as credenciais ele é
  pulado, e o resto do arquivo não depende delas.
*/
const EMAIL_ADMIN = process.env.ADMIN_EMAIL
const SENHA_ADMIN = process.env.ADMIN_SENHA
let tokenAdmin = ""
async function adm(caminho, init = {}) {
  if (!tokenAdmin) {
    const r = await fetch(`${MEDUSA}/auth/user/emailpass`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL_ADMIN, password: SENHA_ADMIN }),
    })
    if (!r.ok) throw new Error(`login do admin falhou: ${r.status}`)
    tokenAdmin = (await r.json()).token
  }
  const r = await fetch(`${MEDUSA}${caminho}`, {
    ...init,
    headers: {
      authorization: `Bearer ${tokenAdmin}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`admin ${caminho}: ${r.status}`)
  return r.json()
}

/*
  A FRENET FALSA SOBE JUNTO COM O TESTE.

  O frete virou cotação ao vivo, então sem uma transportadora respondendo
  não existe opção de entrega — e sem opção de entrega o checkout não passa
  do passo 2. Este teste não é sobre a cotação (quem cuida disso é o
  `conferir-frete.mjs`); ele só precisa que exista frete pra poder chegar no
  pagamento.

  O backend precisa estar rodando com FRENET_URL apontando pra cá.
*/
const frenet = await subirFrenetFalsa()

/*
  E O PAGAR.ME FALSO, pelo mesmo motivo: este teste é sobre o checkout, não
  sobre a cobrança (quem cuida dela é o `conferir-pagamento.mjs`). Mas com o
  Pagar.me ligado na região — e com o checkout aberto ele TEM que estar —,
  fechar o pedido cria um Pix, e sem ninguém do outro lado o fechamento
  falharia por um motivo que não é o que este arquivo procura. Com o
  provisório (`pp_system_default`, só com o checkout fechado), ele fica
  aqui parado.
*/
const pagarme = await subirPagarmeFalso()

/*
  O PREÇO DE UMA OPÇÃO CALCULADA NÃO VEM NA LISTAGEM.

  `/store/shipping-options` devolve o preço que está no banco, e opção
  cotada não tem preço no banco: quem sabe é o provedor, e ele só é chamado
  pelo `/calculate`, uma opção por vez. A loja faz as duas chamadas; o teste
  faz as mesmas duas, senão compararia a tela contra `undefined`.
*/
async function fretesCotados(carrinhoId) {
  const { shipping_options: lista } = (await medusa(
    `/store/shipping-options?cart_id=${carrinhoId}`
  )) ?? {
    shipping_options: [],
  }
  const saida = []
  for (const o of lista) {
    if (o.price_type !== "calculated") {
      saida.push(o)
      continue
    }
    const r = await fetch(`${MEDUSA}/store/shipping-options/${o.id}/calculate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-publishable-api-key": CHAVE },
      body: JSON.stringify({ cart_id: carrinhoId, data: {} }),
    })
    if (!r.ok) continue
    const { shipping_option } = await r.json()
    saida.push(shipping_option)
  }
  return saida
}

const navegador = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
)
const contexto = await navegador.newContext({ viewport: MESA })
const pagina = await contexto.newPage()

const errosDeConsole = []
// O websocket de recarga do `next dev` não conecta neste ambiente e enche o
// console de erro que não é da loja; e a recarga que ele manda quando um
// produto é publicado ou apagado pode cair no meio da hidratação e fazer o
// React avisar (ver `recarga-do-dev.mjs`). Fora isso, erro no console é erro.
const RUIDO_DE_DEV = /_next\/hmr|websocket/i
const recargaDoDev = vigiarRecargaDoDev(contexto)
pagina.on(
  "console",
  (m) =>
    m.type() === "error" &&
    !RUIDO_DE_DEV.test(m.text()) &&
    !recargaDoDev(m) &&
    errosDeConsole.push(m.text())
)

// Cada ENVIO DE FORMULÁRIO que sai da página do checkout: server action é um
// POST com o cabeçalho `next-action` pra própria rota, e a de formulário vai
// em multipart (leva o FormData). As outras — a gaveta sincronizando, o bump
// — vão em texto, e não entram na conta. É como se conta quantos pedidos um
// clique, ou três, mandou.
const acoesDoCheckout = []
const contaAcoes = (pag, lista) =>
  pag.on("request", (r) => {
    const h = r.headers()
    if (
      r.method() === "POST" &&
      h["next-action"] &&
      h["content-type"]?.startsWith("multipart/form-data") &&
      new URL(r.url()).pathname === "/checkout"
    )
      lista.push(r.url())
  })
contaAcoes(pagina, acoesDoCheckout)

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

/*
  O STREAMING TERMINAR, antes de procurar qualquer coisa na página.

  A página chega em pedaços: o que depende do carrinho vem depois, escondido
  num `<div hidden id="S:…">` até o React encaixar no lugar. Nesse meio
  tempo o documento chega a ter a tela DUAS vezes — a do HTML, esperando a
  vez, e a da hidratação —, e um seletor estrito acusa as duas ("strict
  mode violation"). Não é defeito da loja: ninguém vê a cópia escondida.
  Esperar ela sumir deixa o teste sobre o que a pessoa vê.
*/
const semStreaming = (pag) =>
  pag
    .waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, {
      timeout: 20000,
    })
    .catch(() => null)

/* ── 0. a rota existe mesmo ───────────────────────────────────────────────── */

titulo("A rota")
const resposta = await pagina.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
await semStreaming(pagina)
ok(resposta?.status() === 200, "/checkout responde 200", `veio ${resposta?.status()}`)
ok(
  !(await pagina.locator("text=/não encontrei|não encontrada/i").count()),
  "não caiu no 404 do proxy",
  "a lista PAGINAS_RAIZ em src/proxy.ts precisa conter 'checkout'"
)

titulo("Sacola vazia")
// `:visible` além do `semStreaming`: o que importa é o bloco que aparece.
const vazio = pagina.locator(".checkout__vazio:visible")
await vazio.waitFor({ timeout: 15000 })
ok(
  await vazio.isVisible(),
  "sem carrinho, o checkout oferece o caminho de volta em vez de um formulário"
)

/* ── 1. monta a sacola pela loja ──────────────────────────────────────────── */

titulo("Montando a sacola pela loja")
// O shampoo. A oferta do checkout lá embaixo sai do motor — numa loja sem
// pedido, é o óleo (a rotina do fator junta os dois); com pedidos, o que eles
// mostrarem —, e o teste dela lê o produto que a tela oferecer.
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

/*
  CHECKOUT ABERTO SÓ OFERECE O QUE COBRA (`CHECKOUT_ABERTO`, em
  `lib/site.ts`): o provisório, que fecha pedido sem cobrar, some do passo 3.
  Então, aberto, este teste precisa do Pagar.me — o falso, lá em cima — ligado
  na região; senão o passo 3 não tem forma de pagamento e o teste morreria num
  tempo esgotado que não diz nada. Quem diz se está aberto é o botão da
  gaveta, que acabou de abrir com o produto.
*/
const destinoDaGaveta = await pagina
  .locator("a.sacolinha__finalizar")
  .first()
  .getAttribute("href", { timeout: 5000 })
  .catch(() => null)
if (destinoDaGaveta === "/checkout") {
  const regiao = (await medusa(`/store/carts/${carrinhoId}?fields=region_id`))?.cart?.region_id
  const { payment_providers: daRegiao = [] } =
    (await medusa(`/store/payment-providers?region_id=${regiao}`)) ?? {}
  if (!daRegiao.some((p) => p.id === "pp_pagarme_pagarme")) {
    console.log(
      "\n  ✗ o checkout está aberto e a região local não tem o Pagar.me — o passo 3 ficaria\n" +
        "    sem forma de pagamento. Ligue o falso na região e rode de novo:\n" +
        "    PAGARME_SECRET_KEY=sk_test_falsa npm run backend:pagamento"
    )
    await navegador.close()
    frenet.fechar()
    pagarme.fechar()
    process.exit(1)
  }

  /*
    A GAVETA FECHA NO CAMINHO. Ela mora no layout, que não desmonta entre
    uma página e outra: "Finalizar compra" abria o checkout com a gaveta
    ainda por cima, e o véu dela engolia o primeiro clique no formulário.
  */
  titulo("A gaveta")
  const finalizar = pagina.locator("a.sacolinha__finalizar").first()
  if (!(await finalizar.isVisible())) {
    await pagina.locator('[aria-controls="carrinho-gaveta"]').first().click()
  }
  await finalizar.click()
  await pagina.waitForURL(/\/checkout$/, { timeout: 20000 })
  await semStreaming(pagina)
  await pagina.locator("#form-contato").waitFor({ timeout: 20000 })
  ok(
    (await pagina.locator(".sacolinha").first().getAttribute("inert")) !== null,
    '"Finalizar compra" fecha a gaveta no caminho pro checkout'
  )
  // Com a gaveta aberta por cima, o véu recebe o clique e o Playwright
  // desiste — é o próprio defeito, então vira ✗, não exceção.
  await campo("email")
    .click({ timeout: 5000 })
    .catch(() => null)
  ok(
    await campo("email").evaluate((el) => el === document.activeElement),
    "e o primeiro clique no formulário pega"
  )

  /*
    NO DESKTOP O RESUMO NÃO FECHA. Ele é a coluna do lado — fechar não
    liberava espaço nenhum, só escondia o total —, e o Next guarda a página
    com o `<details>` do jeito que ficou: quem fechava voltava pro checkout
    e achava o resumo fechado.
  */
  titulo("O resumo, no desktop")
  const detalhes = pagina.locator(".resumo details")
  ok(await detalhes.evaluate((d) => d.open), "abre aberto")
  await pagina.locator(".resumo summary").click()
  ok(await detalhes.evaluate((d) => d.open), "e clicar no cabeçalho não fecha")

  /*
    O LOGO DO CHECKOUT LEVA PRA LOJA INTEIRA. A regra que tira cabeçalho e
    rodapé era um `body:has(.pagina)` global, e o Next guarda a página que
    ficou pra trás escondida no documento: a home chegava sem os dois.
  */
  titulo("Saindo pelo logo")
  await pagina.locator(".topo__logo").click()
  await pagina.waitForURL(`${LOJA}/`, { timeout: 20000 })
  await pagina.locator("main").filter({ visible: true }).first().waitFor({ timeout: 20000 })
  ok(await pagina.locator(".cabecalho").isVisible(), "a home volta com o cabeçalho")
  ok(await pagina.locator(".rodape").isVisible(), "e com o rodapé")
}

/* ── 2. passo 1: contato, com o CPF errado primeiro ───────────────────────── */

titulo("Passo 1 — contato")
await pagina.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
await semStreaming(pagina)
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

// O celular também tem máscara — digitado tecla a tecla, como uma pessoa, e
// colado do jeito que o preenchimento automático costuma trazer.
await campo("telefone").fill("")
await campo("telefone").pressSequentially("11987654321")
ok(
  (await campo("telefone").inputValue()) === "(11) 98765-4321",
  "o celular ganha a máscara enquanto é digitado",
  await campo("telefone").inputValue()
)
await campo("telefone").fill("+55 11 3456-7890")
ok(
  (await campo("telefone").inputValue()) === "(11) 3456-7890",
  "e colado com o +55, o país sai e o fixo fica 4-4",
  await campo("telefone").inputValue()
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
const opcoesApi = await fretesCotados(carrinhoId)
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

/*
  TROCAR A ENTREGA NÃO PODE PISCAR A PÁGINA. A troca chamava a ação fora de
  uma transição, e o <Suspense> do checkout trocava a tela INTEIRA pelo
  esqueleto até o servidor responder. A espera certa é pequena: a barrinha
  na opção escolhida e o dinheiro do resumo esmaecido.
*/
titulo("Trocar a entrega")
if (opcoesApi.length > 1) {
  const opcoes = pagina.locator("#form-entrega .opcao")
  const trocarPara = async (i) => {
    const id = await opcoes.nth(i).locator("input").getAttribute("value")
    const viu = await vigiar(
      pagina,
      [".esqueleto", "#form-entrega .opcao[data-mexendo]", ".resumo[data-recalculando]"],
      async () => {
        await opcoes.nth(i).click()
        await esperarRecalculo(pagina)
      }
    )
    const gravado = (await medusa(`/store/carts/${carrinhoId}?fields=*shipping_methods`))?.cart
    return { viu, certo: gravado?.shipping_methods?.[0]?.shipping_option_id === id }
  }

  const ida = await trocarPara(1)
  ok(!ida.viu[".esqueleto"], "trocar a entrega NÃO troca a página pelo esqueleto")
  ok(
    ida.viu["#form-entrega .opcao[data-mexendo]"],
    "a opção escolhida ganha a barrinha enquanto grava"
  )
  ok(ida.viu[".resumo[data-recalculando]"], "e o dinheiro do resumo esmaece até o Medusa responder")
  ok(ida.certo, "o Medusa gravou a troca")
  ok(await opcoes.nth(1).locator("input").isChecked(), "e a tela ficou com ela marcada")

  // E de volta pra primeira: o resto do arquivo segue com a mais barata.
  const volta = await trocarPara(0)
  ok(volta.certo && !volta.viu[".esqueleto"], "trocar de volta também grava, sem piscar")
} else {
  console.log("    (uma opção só de entrega — nada pra trocar)")
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
const regiaoId = (await medusa(`/store/carts/${carrinhoId}?fields=region_id`))?.cart?.region_id
const { payment_providers: provedores = [] } =
  (await medusa(`/store/payment-providers?region_id=${regiaoId}`)) ?? {}
const cobra = provedores.some((p) => p.id === "pp_pagarme_pagarme")
console.log(`    (região com ${provedores.map((p) => p.id).join(", ") || "nenhum provedor"})`)
ok(
  (await pagina.locator("#form-pagamento .opcao").count()) === 2,
  "as duas formas aparecem: Pix e cartão — boleto não entrou no lançamento"
)
ok(
  cobra
    ? (await pagina.locator(".pagamento__aviso").count()) === 0
    : (await pagina.locator(".pagamento__aviso").count()) > 0,
  cobra
    ? "com o Pagar.me, sem aviso de 'não é cobrado' — é"
    : "e, com o provisório, a tela avisa em negrito que o pedido não é cobrado agora"
)

/*
  A FORMA SE ESCOLHE PELA LINHA INTEIRA, como a pessoa faz. O rádio está no
  HTML, mas escondido do olho (`opcao--forma`, em `checkout-loja.css`) — um
  `check()` nele esbarra na linha por cima e espera pra sempre.
*/
async function escolherForma(nome) {
  const linha = pagina.locator("#form-pagamento .opcao", { hasText: nome })
  await linha.click()
  await linha.locator("input:checked").waitFor({ state: "attached", timeout: 10000 })
}

await escolherForma("Cartão")
const cartao = pagina.locator(".pagamento__painel[data-ativo] input").first()
/* DIGITADO, e não colado de uma vez: o bug era o primeiro dígito que
   revelava a bandeira tirar o foco do campo (o espaço do logo aparecia e o
   React montava outro input). Com `fill` o número entra inteiro e o bug
   passava batido. */
await cartao.click()
await cartao.pressSequentially("4111", { delay: 30 })
ok(
  (await cartao.evaluate((el) => el === document.activeElement)) &&
    (await cartao.inputValue()) === "4111",
  "o campo do número não perde o foco quando a bandeira aparece",
  `valor na tela: "${await cartao.inputValue()}"`
)
await cartao.fill("4111 1111 1111 1111")
ok(
  (await pagina.locator('.campo__icone[data-bandeira="visa"] img[alt="Cartão Visa"]').count()) ===
    1,
  "o número do cartão revela a bandeira enquanto digita — o logo da Visa no fim do campo"
)
ok(
  (await pagina.locator(".pagamento__painel[data-ativo] .bandeiras").count()) === 0 &&
    !/Estes campos não passam/.test(await pagina.locator("#form-pagamento").innerText()),
  "sem a lista de bandeiras nem a explicação do caminho do cartão (saíram por escolha da loja)"
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

titulo("Oferta do checkout (order bump)")
const bump = pagina.locator(".bump")
ok(await bump.isVisible(), "a caixinha aparece")

/*
  O PRODUTO É DO MOTOR, não deste arquivo: com o shampoo na sacola, numa
  loja sem pedido, ele é o óleo (a rotina do fator junta os dois) — mas os
  pedidos mudam a resposta, e um carrinho em dez vê o segundo colocado
  (`AJUSTES.exploracao`, em `src/lib/recomendacao.ts`). O teste lê o que a
  tela ofereceu e confere ESSE.
*/
const produtoDaOferta = (await bump.getAttribute("data-produto")) ?? ""
const noPedido = (
  (await medusa(`/store/carts/${carrinhoId}?fields=id,*items`))?.cart?.items ?? []
).map((i) => i.product_handle)
ok(Boolean(produtoDaOferta), "a caixinha diz de que produto é", produtoDaOferta)
ok(
  !noPedido.includes(produtoDaOferta),
  "e não é nenhum que já está no pedido",
  `${produtoDaOferta} · pedido: ${noPedido.join(", ")}`
)

const precoDe = numero(await bump.locator(".bump__preco s").innerText())
const precoPor = numero(await bump.locator(".bump__preco span").innerText())
ok(
  perto(precoPor, precoDe * (1 - BUMP_DESCONTO / 100)),
  `o "por" da tela é ${BUMP_DESCONTO}% abaixo do "de" (${reais(precoDe)} → ${reais(precoPor)})`,
  `tela diz ${reais(precoPor)}`
)
const frase = await bump.locator(".bump__txt").innerText()
ok(frase.includes(`${BUMP_DESCONTO}% de desconto`), "a frase diz o desconto", frase)
console.log(`    → "${frase}"`)

const caixinha = bump.locator("input[type=checkbox]")
const totalAntesDoBump = await pagina.locator(".totais__total dd").innerText()
const linhasAntesDoBump = noPedido.length
const codigosDeOferta = (c) =>
  (c?.promotions ?? []).map((p) => p.code).filter((codigo) => codigo?.startsWith("BUMP-"))

await caixinha.check()
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
ok(comBump.items.length === linhasAntesDoBump + 1, "o produto da oferta entrou no pedido")
ok(
  perto(Number(comBump.discount_total), precoDe - precoPor),
  `e o Medusa DESCONTOU os ${reais(precoDe - precoPor)} que a tela prometeu`,
  `desconto do Medusa: ${reais(comBump.discount_total)}`
)
console.log("    → o desconto existe no backend; a tela não inventa preço")

/*
  O CÓDIGO É DAQUELE PRODUTO, e assinado: "BUMP-<HANDLE>-" e oito letras
  que só a loja e o Medusa sabem montar (`src/lib/bump.ts`). Um código
  adivinhável seria 10% em tudo, aplicado direto na API.
*/
const [codigoDaOferta = ""] = codigosDeOferta(comBump)
ok(
  new RegExp(`^BUMP-${produtoDaOferta.toUpperCase()}-[0-9A-F]{8}$`).test(codigoDaOferta),
  "com o código DAQUELE produto, assinado",
  codigoDaOferta || "nenhum código de oferta no carrinho"
)

const totalNaTela = numero(await pagina.locator(".totais__total dd").innerText())
ok(
  perto(totalNaTela, Number(comBump.total)),
  "o total do resumo é o total do Medusa",
  `tela ${reais(totalNaTela)} vs Medusa ${reais(comBump.total)}`
)

/*
  MARCADA, ELA FICA — com o mesmo produto e a mesma frase. A caixinha sumia
  no instante em que o produto entrava (ele já estava no pedido), e parecia
  que o clique tinha dado errado — sem ter por onde desmarcar.
*/
await pagina.waitForFunction(() => !document.querySelector(".resumo[data-recalculando]"), null, {
  timeout: 20000,
})
ok(await bump.isVisible(), "marcada, a caixinha continua na tela")
ok(await caixinha.isChecked(), "e continua marcada")
ok(
  (await bump.getAttribute("data-produto")) === produtoDaOferta &&
    (await bump.locator(".bump__txt").innerText()) === frase,
  "com o mesmo produto e a mesma frase"
)

await caixinha.uncheck()
await pagina.waitForFunction(
  (antes) => document.querySelector(".totais__total dd")?.textContent === antes,
  totalAntesDoBump,
  { timeout: 25000 }
)
const desmarcado = (await medusa(`/store/carts/${carrinhoId}?fields=id,*items,*promotions`))?.cart
ok(
  desmarcado?.items?.length === linhasAntesDoBump && !codigosDeOferta(desmarcado).length,
  "desmarcar tira o produto e o código, e o total volta"
)

/*
  SEM A PROMOÇÃO NO MEDUSA — o que acontecia em produção, onde o
  `backend:promocoes` não tinha rodado. A caixinha "marcava e desmarcava", e
  a ação, que já tinha posto a linha, voltava sem desfazer nada: o produto
  ficava no carrinho a PREÇO CHEIO, fora da tela até o próximo recálculo.
  Promoção desligada é o mesmo caso por outro caminho (o Medusa aceita o
  código e não desconta nada — nem erro dá).
*/
if (EMAIL_ADMIN && SENHA_ADMIN && codigoDaOferta) {
  const { promotions = [] } = await adm(
    `/admin/promotions?code=${encodeURIComponent(codigoDaOferta)}&fields=id,status`
  )
  const promo = promotions[0]
  if (promo) {
    await adm(`/admin/promotions/${promo.id}`, {
      method: "POST",
      body: JSON.stringify({ status: "inactive" }),
    })
    try {
      // Sem `check()`: ele confere que a caixa ficou marcada, e aqui o
      // certo é ela VOLTAR desmarcada. Falhas viram ✗ lá embaixo, não exceção.
      await caixinha.click()
      const recado = await pagina
        .locator(".bump__erro")
        .waitFor({ timeout: 25000 })
        .then(
          () => pagina.locator(".bump__erro").innerText(),
          () => ""
        )
      await pagina
        .waitForFunction(() => !document.querySelector(".resumo[data-recalculando]"), null, {
          timeout: 20000,
        })
        .catch(() => null)
      const semDesconto = (await medusa(`/store/carts/${carrinhoId}?fields=id,*items,*promotions`))
        ?.cart
      ok(
        semDesconto?.items?.length === linhasAntesDoBump,
        "sem a promoção, o produto NÃO fica no carrinho a preço cheio",
        `${semDesconto?.items?.length} linha(s)`
      )
      ok(!codigosDeOferta(semDesconto).length, "nem o código pendurado")
      ok(!(await caixinha.isChecked()), "a caixinha volta desmarcada")
      ok(/segue sem ela/i.test(recado), "e o recado diz que o pedido segue sem a oferta", recado)
      ok(
        (await pagina.locator(".totais__total dd").innerText()) === totalAntesDoBump,
        "e o total não mudou"
      )
    } finally {
      await adm(`/admin/promotions/${promo.id}`, {
        method: "POST",
        body: JSON.stringify({ status: promo.status }),
      })
    }
  } else {
    console.log("    (a promoção da oferta não apareceu no admin — pulei a promoção desligada)")
  }
} else {
  console.log("    (sem ADMIN_EMAIL/ADMIN_SENHA: pulei o bump com a promoção desligada)")
}

// Marca de novo: o pedido lá embaixo confere o desconto da oferta.
await caixinha.check()
await pagina.waitForFunction(
  (antes) => document.querySelector(".totais__total dd")?.textContent !== antes,
  totalAntesDoBump,
  { timeout: 25000 }
)
await pagina.waitForFunction(() => !document.querySelector(".resumo[data-recalculando]"), null, {
  timeout: 20000,
})
ok(await caixinha.isChecked(), "e marcar de novo volta a marcar")

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

/*
  CÓDIGO CADASTRADO EM MINÚSCULAS VALE (24/09). A loja punha o que se
  digitava em maiúsculas, e o Medusa procura o código exatamente como foi
  cadastrado: um "bemvindo10" nunca aplicava. Cria um de 1% só pra isto,
  aplica, tira pela tela e apaga — o resto do arquivo confere o total com o
  bump, sem cupom nenhum.
*/
if (EMAIL_ADMIN && SENHA_ADMIN) {
  const minusculo = `conf${Date.now().toString(36).slice(-5)}`
  const { promotion: promocao } = await adm("/admin/promotions", {
    method: "POST",
    body: JSON.stringify({
      code: minusculo,
      type: "standard",
      status: "active",
      is_automatic: false,
      application_method: {
        type: "percentage",
        target_type: "order",
        value: 1,
        allocation: "across",
        currency_code: "brl",
      },
    }),
  })
  try {
    await pagina.locator("#cupom").fill(minusculo)
    await pagina.locator("#cupom-form button[type=submit]").click()
    const aplicado = pagina.locator(".cupom__msg[data-tipo=ok]", { hasText: minusculo })
    await aplicado.waitFor({ timeout: 15000 }).catch(() => null)
    const comCupom = (await medusa(`/store/carts/${carrinhoId}?fields=*promotions`))?.cart
    ok(
      (comCupom?.promotions ?? []).some((p) => p.code === minusculo),
      "cupom cadastrado em minúsculas aplica",
      minusculo
    )
    // Sem o cupom na tela (o código de antes), não há o que tirar — e o
    // `ok` de cima já falhou.
    await aplicado
      .locator("button")
      .click({ timeout: 5000 })
      .catch(() => null)
    await aplicado.waitFor({ state: "detached", timeout: 15000 }).catch(() => null)
    const semCupom = (await medusa(`/store/carts/${carrinhoId}?fields=*promotions`))?.cart
    ok(
      !(semCupom?.promotions ?? []).some((p) => p.code === minusculo),
      "e sai pela tela, como entrou"
    )
  } finally {
    await adm(`/admin/promotions/${promocao.id}`, { method: "DELETE" }).catch(() => null)
  }
} else {
  console.log("    (sem ADMIN_EMAIL/ADMIN_SENHA: pulei o cupom em minúsculas)")
}

titulo("O total mudou por fora")
/*
  O TOTAL DO BOTÃO É O QUE SE COBRA (24/09). Com o passo 3 aberto, um item
  entra no carrinho por fora — outra aba, a seta de voltar do navegador — e a
  pessoa clica em pagar com o total velho na tela. Antes o cartão era
  autorizado pelo total novo sem ninguém ver (R$ 128,50 com o botão dizendo
  R$ 73,60); agora nada é cobrado, e a tela redesenha com o total de agora.
  O item sai do mesmo jeito que entrou, e a página volta a ser o que era.
*/
{
  await escolherForma("Pix")
  const botao = pagina.locator("#form-pagamento button[type=submit]")
  const noBotao = numero(await botao.innerText())
  const varianteExtra = (await medusa("/store/products?handle=balm-para-barba&fields=*variants"))
    ?.products?.[0]?.variants?.[0]?.id
  const { json: comExtra } = await medusaCru(`/store/carts/${carrinhoId}/line-items`, {
    metodo: "POST",
    corpo: { variant_id: varianteExtra, quantity: 1 },
  })
  const totalNovo = Number(comExtra?.cart?.total)
  const linhaExtra = (comExtra?.cart?.items ?? []).find((i) => i.variant_id === varianteExtra)
  const cobrancasAntes = pagarme.pedidos.size
  await botao.click()
  const recado = pagina.locator("#form-pagamento [role=alert]", {
    hasText: "total do pedido mudou",
  })
  await recado.waitFor({ timeout: 20000 }).catch(() => null)
  ok(
    !pagina.url().includes("/obrigado/") && pagarme.pedidos.size === cobrancasAntes,
    "pagar com o total velho na tela não cobra nada",
    `botão ${reais(noBotao)}, carrinho ${reais(totalNovo)}, ${pagarme.pedidos.size - cobrancasAntes} cobrança(s)`
  )
  const textoDoRecado = (await recado.innerText().catch(() => "")).replace(/ /g, " ")
  ok(textoDoRecado.includes(reais(totalNovo)), "e diz o total novo", textoDoRecado || "sem recado")
  await pagina
    .waitForFunction(
      (esperado) =>
        document
          .querySelector("#form-pagamento button[type=submit]")
          ?.textContent?.includes(esperado),
      reais(totalNovo).slice(3),
      { timeout: 15000 }
    )
    .catch(() => null)
  ok(
    perto(numero(await botao.innerText()), totalNovo),
    "e o botão já mostra o total de agora",
    await botao.innerText()
  )
  if (linhaExtra) {
    await medusaCru(`/store/carts/${carrinhoId}/line-items/${linhaExtra.id}`, { metodo: "DELETE" })
  }
  await pagina.reload({ waitUntil: "domcontentloaded" })
  await semStreaming(pagina)
  await pagina.locator("#form-pagamento").waitFor({ timeout: 25000 })
}

titulo("O pedido")
const totalAntesDeFechar = Number(comBump.total)
// De volta pro Pix: o cartão lá em cima ficou com um número recusado pelo
// Luhn de propósito, e com o Pagar.me ligado o envio pararia nele.
await escolherForma("Pix")

/*
  UM PEDIDO POR CLIQUE — ou por três. A tela parecia parada enquanto o Pix
  era gerado (só o texto do botão mudava), a pessoa clicava de novo, e cada
  clique a mais enfileirava outro `finalizar`. Agora a cortina cobre a
  página e o botão trava; os dois cliques extras são `force` justamente pra
  passar por cima da trava e provar que o envio também recusa.
*/
const acoesAntesDePagar = acoesDoCheckout.length
const pagar = pagina.locator("#form-pagamento button[type=submit]")
const naEspera = await vigiar(
  pagina,
  [".cortina", "#form-pagamento button[aria-busy]"],
  async () => {
    await pagar.click()
    await pagar.click({ force: true, timeout: 2000 }).catch(() => null)
    await pagar.click({ force: true, timeout: 2000 }).catch(() => null)
    await pagina.waitForURL(/\/checkout\/obrigado\//, { timeout: 30000 })
  }
)
ok(naEspera[".cortina"], "pagando, a cortina cobre a página até a tela de obrigado")
ok(naEspera["#form-pagamento button[aria-busy]"], "e o botão mostra que está trabalhando")
ok(
  acoesDoCheckout.length - acoesAntesDePagar === 1,
  "três cliques em pagar mandam UM pedido",
  `${acoesDoCheckout.length - acoesAntesDePagar} envios`
)

const pedidoId = pagina.url().split("/").pop()
ok(
  pedidoId === pedidoId.toUpperCase().replace("ORDER_", "order_"),
  "o id do pedido chegou na URL com as maiúsculas intactas",
  `o proxy não pode baixar a caixa daqui — veio ${pedidoId}`
)

// Com o carrinho de onde ele nasceu no `x-carrinho`: é a prova de dono. Sem
// ela, o Medusa só devolve número e situação (ver "O pedido pela API", abaixo).
const { order } =
  (await medusa(
    `/store/orders/${pedidoId}?fields=id,display_id,email,total,discount_total,` +
      `*billing_address,*shipping_address,*items`,
    { "x-carrinho": carrinhoId }
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

/*
  O PEDIDO GUARDA O QUE A OFERTA MOSTROU — é de onde o motor aprende quem
  aceita o quê (`fb_bump`, gravado pela loja DEPOIS da resposta; daí a
  espera). O metadata do pedido só o admin lê.
*/
if (EMAIL_ADMIN && SENHA_ADMIN) {
  let registro = null
  for (let i = 0; i < 20 && !registro; i++) {
    const { order: doAdmin } = await adm(`/admin/orders/${pedidoId}?fields=id,metadata`)
    registro = doAdmin?.metadata?.fb_bump ?? null
    if (!registro) await new Promise((pronto) => setTimeout(pronto, 500))
  }
  ok(
    registro?.produto === produtoDaOferta && registro?.aceito === true,
    "o pedido guardou a oferta, e que ela foi aceita",
    JSON.stringify(registro)
  )
} else {
  console.log("    (sem ADMIN_EMAIL/ADMIN_SENHA: pulei o registro da oferta no pedido)")
}
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
const cracha = (await contexto.cookies()).find((c) => c.name === "pedido")?.value
ok(
  cracha === `${pedidoId}.${carrinhoId}`,
  "e o crachá de quem comprou leva o carrinho, que é a prova de dono pro Medusa",
  cracha
)

titulo("O pedido pela API, pra quem só tem o id")
/*
  O id do pedido está na URL da tela de obrigado — no histórico, no print, no
  GA4 — e a chave publicável é pública. Com os dois, a API do Medusa
  devolvia e-mail, endereço, telefone e CPF. Agora, só número e situação; o
  pedido inteiro, só com o carrinho de onde ele nasceu.
*/
const PESSOAIS = [EMAIL, "11144477735", "Paulista", "+5511", carrinhoId]
const vazou = (texto) => PESSOAIS.filter((p) => texto.includes(p)).join(", ")
const semProva = await medusaCru(`/store/orders/${pedidoId}`)
ok(
  semProva.status === 200 && semProva.json?.order?.display_id === order?.display_id,
  "sem prova nenhuma, o pedido responde com o número e a situação",
  `${semProva.status} ${semProva.texto.slice(0, 120)}`
)
ok(
  !vazou(semProva.texto),
  "sem e-mail, endereço, telefone, CPF nem o carrinho",
  vazou(semProva.texto)
)
const pedindoTudo = await medusaCru(
  `/store/orders/${pedidoId}?fields=email,*shipping_address,*billing_address,cart.id,` +
    "customer.email,*customer,*items,total,*payment_collections.payment_sessions"
)
ok(
  pedindoTudo.status === 200 && !vazou(pedindoTudo.texto),
  "e pedir os campos pelo nome não muda nada",
  vazou(pedindoTudo.texto) || pedindoTudo.texto.slice(0, 120)
)
ok(
  !pedindoTudo.texto.includes("copiaECola") && pedindoTudo.texto.includes('"forma":"pix"'),
  "do pagamento, só a forma: o QR do Pix fica pra quem comprou",
  pedindoTudo.texto.slice(0, 200)
)
const outroCarrinho = await medusaCru(`/store/orders/${pedidoId}`, {
  cabecalhos: { "x-carrinho": "cart_01ZZZZZZZZZZZZZZZZZZZZZZZZ" },
})
ok(
  outroCarrinho.status === 403 && !vazou(outroCarrinho.texto),
  "com o carrinho de outra compra, 403 — e não a versão pública",
  `${outroCarrinho.status} ${outroCarrinho.texto.slice(0, 120)}`
)
const devolucao = await medusaCru("/store/returns", {
  metodo: "POST",
  corpo: {
    order_id: pedidoId,
    items: [{ id: order?.items?.[0]?.id ?? "x", quantity: 1 }],
    return_shipping: { option_id: "so_qualquer" },
  },
})
ok(
  devolucao.status === 400 && devolucao.json?.message === "Esta loja não usa esta rota.",
  "e ninguém abre devolução no pedido pelo id: a rota está fechada",
  `${devolucao.status} ${devolucao.texto.slice(0, 120)}`
)

titulo("A tela de obrigado")
await pagina.locator(".feito:visible").waitFor({ timeout: 15000 })
const corpo = await pagina.locator("main.obrigado").innerText()
ok(corpo.includes(`#${order.display_id}`), "mostra o número curto do pedido")
ok(corpo.includes("Avenida Paulista"), "mostra pra onde vai")
ok(/rastreio/i.test(corpo), "e diz o que acontece agora, incluindo o rastreio")
ok(
  !/chega em \d+ dias|entrega garantida/i.test(corpo),
  "sem prometer prazo que ninguém pode cumprir ainda"
)
ok(
  !(await pagina.locator(".cabecalho").isVisible()),
  "e sem o cabeçalho da loja — o checkout, guardado escondido, não manda mais nela"
)

titulo("O mesmo link, em outro navegador")
const estranho = await navegador.newContext({ viewport: MESA })
const outraPagina = await estranho.newPage()
await outraPagina.goto(pagina.url(), { waitUntil: "domcontentloaded" })
await semStreaming(outraPagina)
await outraPagina.locator(".feito:visible").waitFor({ timeout: 15000 })
const visto = await outraPagina.locator("main.obrigado").innerText()
ok(visto.includes(`#${order.display_id}`), "quem tem o link confirma que o pedido existe")
ok(!visto.includes("Avenida Paulista"), "mas NÃO vê o endereço de quem comprou")
ok(!visto.includes(EMAIL), "nem o e-mail")
await estranho.close()

/*
  O CRACHÁ FORJADO. Até aqui o crachá era o id do pedido — o mesmo texto da
  URL —, e bastava pôr um cookie `pedido=<id>` no navegador pra ver o
  endereço de quem comprou. O de hoje leva o carrinho, e quem confere é o
  Medusa.
*/
for (const [como, valor] of [
  ["só com o id do pedido, como o de antes", pedidoId],
  ["com um carrinho inventado", `${pedidoId}.cart_01ZZZZZZZZZZZZZZZZZZZZZZZZ`],
]) {
  const forjado = await navegador.newContext({ viewport: MESA })
  await forjado.addCookies([{ name: "pedido", value: valor, url: LOJA }])
  const noForjado = await forjado.newPage()
  await noForjado.goto(pagina.url(), { waitUntil: "domcontentloaded" })
  await semStreaming(noForjado)
  await noForjado.locator(".feito:visible").waitFor({ timeout: 15000 })
  // O texto, pro que aparece; o HTML inteiro (com os dados que o React manda
  // junto), pro que não pode estar nem escondido.
  const texto = await noForjado.locator("main.obrigado").innerText()
  const html = await noForjado.content()
  const vazouNoHtml = ["Avenida Paulista", EMAIL, "11144477735", "copiaECola"].filter((p) =>
    html.includes(p)
  )
  ok(
    texto.includes(`#${order.display_id}`) && !vazouNoHtml.length,
    `crachá forjado ${como}: o número aparece, o endereço e o e-mail não`,
    vazouNoHtml.join(", ") || texto.slice(0, 120)
  )
  await forjado.close()
}

// Da tela de obrigado, o logo volta pra loja INTEIRA. Aqui há duas páginas
// guardadas escondidas (o checkout e o obrigado) — o caso em que a regra
// antiga mais escondia coisa. `visible`, porque o `.topo__logo` do checkout
// escondido também está no documento.
await pagina.locator(".topo__logo").filter({ visible: true }).click()
await pagina.waitForURL(`${LOJA}/`, { timeout: 20000 })
await pagina.locator("main").filter({ visible: true }).first().waitFor({ timeout: 20000 })
ok(
  (await pagina.locator(".cabecalho").isVisible()) && (await pagina.locator(".rodape").isVisible()),
  "e o logo de lá leva pra loja com cabeçalho e rodapé"
)

/* ── 5. o celular ─────────────────────────────────────────────────────────── */

titulo("No celular")
const celular = await navegador.newContext({ viewport: CELULAR })
const noCelular = await celular.newPage()
const noCarrinhoDoCelular = await poeNaSacola(noCelular, celular, "shampoo-para-barba")
ok(Boolean(noCarrinhoDoCelular), "a sacola do celular tem item antes de abrir o checkout")
await noCelular.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
await semStreaming(noCelular)
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
// `textContent`, e não `innerText`: no celular o resumo nasce fechado (logo
// abaixo), e texto dentro de `<details>` fechado não tem `innerText`.
const totalDaBarra = numero(await noCelular.locator(".barra__total b").innerText())
const totalDoResumo = numero(await noCelular.locator(".totais__total dd").textContent())
ok(
  perto(totalDaBarra, totalDoResumo),
  "e a barra mostra o mesmo total do resumo",
  `barra ${reais(totalDaBarra)} vs resumo ${reais(totalDoResumo)}`
)

// A seta do resumo caía pra baixo do total (o preflight do Tailwind põe
// `display: block` em todo `svg`). Ela é o abre/fecha: fica AO LADO dele.
const noTotal = await noCelular.locator(".resumo summary b").boundingBox()
const naSeta = await noCelular.locator(".resumo summary svg").boundingBox()
const meio = (c) => c.y + c.height / 2
ok(
  Boolean(noTotal && naSeta) &&
    Math.abs(meio(naSeta) - meio(noTotal)) < 4 &&
    naSeta.x >= noTotal.x + noTotal.width,
  "a seta do resumo fica ao lado do total, na mesma linha",
  JSON.stringify({ noTotal, naSeta })
)
/*
  NO CELULAR ELE NASCE FECHADO: aberto, o resumo mora no topo e empurra o
  primeiro campo do formulário pra fora da tela de quem acabou de clicar em
  "finalizar compra" (116e0cd). Tocar no cabeçalho abre, e tocar de novo
  fecha.
*/
const resumoAberto = () => noCelular.locator(".resumo details").evaluate((d) => d.open)
ok(!(await resumoAberto()), "no celular, o resumo nasce fechado: o formulário fica na dobra")
await noCelular.locator(".resumo summary").click()
const abriu = await resumoAberto()
await noCelular.locator(".resumo summary").click()
ok(abriu && !(await resumoAberto()), "e o cabeçalho do resumo abre e fecha")

/*
  A BARRA ESPERA JUNTO. Ela não sabia que o passo estava enviando: o toque
  não mudava nada na tela, e o segundo toque mandava de novo. Aqui, dois
  toques em "Continuar" — o segundo com `force`, por cima da trava.
*/
const acoesDoCelular = []
contaAcoes(noCelular, acoesDoCelular)
const noCampo = (nome, valor) => noCelular.locator(`.fluxo [name="${nome}"]`).fill(valor)
await noCampo("email", EMAIL)
await noCampo("nome", "Matheus")
await noCampo("sobrenome", "da Silva Teste")
await noCampo("telefone", "(11) 99999-9999")
await noCampo("documento", CPF)
const barra = noCelular.locator(".barra__btn")
const naBarra = await vigiar(noCelular, [".barra__btn[aria-busy]"], async () => {
  await barra.click()
  await barra.click({ force: true, timeout: 2000 }).catch(() => null)
  await noCelular.locator(".painel[data-ativo] #form-entrega").waitFor({ timeout: 20000 })
})
ok(naBarra[".barra__btn[aria-busy]"], "tocar na barra mostra que está salvando, e trava")
ok(acoesDoCelular.length === 1, "dois toques, um envio", `${acoesDoCelular.length} envios`)
await celular.close()

/* ── 6. os consertos de 24/09: o CEP, a mesma entrega e a promoção que acaba ── */

/** Um carrinho novo, montado pela API, com o cookie posto na aba — preparação. */
async function carrinhoNovo(ctx, itens) {
  const { regions = [] } = (await medusa("/store/regions")) ?? {}
  const regiao = regions.find((r) => r.currency_code === "brl")
  const { json } = await medusaCru("/store/carts", {
    metodo: "POST",
    corpo: { region_id: regiao.id },
  })
  const id = json.cart.id
  for (const [handle, quantidade] of itens) await porNoCarrinho(id, handle, quantidade)
  await ctx.addCookies([{ name: "carrinho", value: id, url: LOJA }])
  return id
}
async function porNoCarrinho(id, handle, quantidade = 1) {
  const variante = (await medusa(`/store/products?handle=${handle}&fields=*variants`))
    ?.products?.[0]?.variants?.[0]?.id
  return medusaCru(`/store/carts/${id}/line-items`, {
    metodo: "POST",
    corpo: { variant_id: variante, quantity: quantidade },
  })
}

/** Os passos 1 e 2 pela tela, numa aba à parte. Para no 2 com `ate: "entrega"`. */
async function contatoEEntrega(pag, email, { numero = "1578", complemento = "", ate = "" } = {}) {
  const c = (n) => pag.locator(`.fluxo [name="${n}"]`)
  await pag.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
  await semStreaming(pag)
  await pag.locator("#form-contato").waitFor({ timeout: 25000 })
  await c("email").fill(email)
  await c("nome").fill("Matheus")
  await c("sobrenome").fill("da Silva Teste")
  await c("telefone").fill("(11) 99999-9999")
  await c("documento").fill(CPF)
  await pag.locator("#form-contato button[type=submit]").click()
  await pag.locator("#form-entrega").waitFor({ timeout: 25000 })
  await c("cep").fill(CEP)
  await pag.waitForFunction(
    () => document.querySelector('.fluxo [name="rua"]')?.value?.length > 0,
    null,
    { timeout: 25000 }
  )
  await pag.locator("#form-entrega .opcao").first().waitFor({ timeout: 25000 })
  if (ate === "entrega") return
  await c("numero").fill(numero)
  if (complemento) await c("complemento").fill(complemento)
  await pag.locator("#form-entrega button[type=submit]").click()
  await pag.locator("#form-pagamento").waitFor({ timeout: 25000 })
}
const passoAberto = (pag) =>
  pag.evaluate(
    () =>
      [...document.querySelectorAll(".passos li")].findIndex(
        (li) => li.getAttribute("aria-current") === "step"
      ) + 1
  )

titulo("Trocar o CEP depois do passo 2")
/*
  O NÚMERO É DA RUA (24/09). Com o passo 2 feito na Paulista, trocar o CEP na
  SACOLA pro Rio gravava "Praça Pio X, 1578 — apto 12": a rua nova com o
  número e o complemento da antiga, e o checkout pulava pro pagamento com um
  endereço que não existe. Agora o CEP novo leva os dois embora e o checkout
  volta pro passo 2. E o endereço com a cidade de outro CEP é recusado — o
  que sobrava de quem confirmava o passo com o CEP ainda sendo buscado (o
  botão agora trava enquanto busca).
*/
{
  const ctx = await navegador.newContext({ viewport: MESA })
  const pag = await ctx.newPage()
  const c = (n) => pag.locator(`.fluxo [name="${n}"]`)
  const endereco = async (id) =>
    (await medusa(`/store/carts/${id}?fields=*shipping_address`))?.cart?.shipping_address
  try {
    const id = await carrinhoNovo(ctx, [["shampoo-para-barba", 1]])
    await contatoEEntrega(pag, "troca.cep@fuckingbarba.invalid", { complemento: "apto 12" })

    await pag.goto(`${LOJA}/produtos/oleo-para-barba`, { waitUntil: "domcontentloaded" })
    await pag
      .waitForFunction(() => document.documentElement.dataset.hidratado !== undefined, null, {
        timeout: 20000,
      })
      .catch(() => null)
    await pag.locator('button[aria-controls="carrinho-gaveta"]').first().click()
    const gaveta = pag.locator("#carrinho-gaveta")
    await gaveta.waitFor({ state: "visible", timeout: 10000 })
    // A gaveta abre cotando o CEP que o carrinho já tem; "alterar" mostra o campo.
    const alterar = gaveta.locator(".sacolinha__cep-ok button", { hasText: "alterar" })
    await alterar.waitFor({ timeout: 20000 }).catch(() => null)
    if (await alterar.isVisible().catch(() => false)) await alterar.click()
    await pag.locator("#carrinho-cep").fill("20040-020")
    await gaveta.locator(".sacolinha__cep-botao:not([disabled])").click()
    await gaveta
      .locator(".sacolinha__cep-ok", { hasText: "20040-020" })
      .waitFor({ timeout: 25000 })
      .catch(() => null)
    const a = await endereco(id)
    ok(
      a?.postal_code === "20040020" && !a?.metadata?.numero && !a?.metadata?.complemento,
      "CEP trocado na sacola: o número e o complemento da rua antiga saem",
      `${a?.address_1} · nº "${a?.metadata?.numero}" · "${a?.metadata?.complemento}" · ` +
        `${a?.city}/${a?.province} · ${a?.postal_code}`
    )

    await pag.goto(`${LOJA}/checkout`, { waitUntil: "domcontentloaded" })
    await semStreaming(pag)
    await pag
      .locator("#form-entrega")
      .waitFor({ state: "visible", timeout: 25000 })
      .catch(() => null)
    const passo = await passoAberto(pag)
    ok(
      passo === 2,
      "e o checkout volta pro passo 2, em vez de pular pro pagamento",
      `passo ${passo}`
    )
    ok((await c("numero").inputValue()) === "", "com o número vazio, pra digitar o da rua nova")
    // Se pulou pro pagamento (o defeito de antes), abre a entrega pra seguir conferindo.
    if (passo !== 2) {
      await pag
        .locator("button", { hasText: /editar entrega/i })
        .first()
        .click()
      await pag.locator("#form-entrega").waitFor({ state: "visible", timeout: 15000 })
    }

    await c("numero").fill("100")
    await c("cidade").fill("São Paulo")
    await c("uf").selectOption("SP")
    await pag.locator("#form-entrega button[type=submit]").click()
    const erroDoCep = pag.locator("#form-entrega .campo__erro", { hasText: "Rio de Janeiro" })
    await erroDoCep.waitFor({ timeout: 15000 }).catch(() => null)
    ok(
      await erroDoCep.isVisible().catch(() => false),
      "CEP do Rio com a cidade de São Paulo é recusado, e o recado diz de onde é o CEP",
      (
        await pag
          .locator("#form-entrega .campo__erro")
          .allInnerTexts()
          .catch(() => [])
      ).join(" | ")
    )
    const b = await endereco(id)
    ok(
      b?.city !== "São Paulo",
      "e o endereço misturado não foi gravado",
      `${b?.city}/${b?.province}`
    )

    // Aceito o endereço misturado (o defeito de antes), o passo fechou: abre de novo.
    if (
      !(await pag
        .locator("#form-entrega")
        .isVisible()
        .catch(() => false))
    ) {
      await pag
        .locator("button", { hasText: /editar entrega/i })
        .first()
        .click()
      await pag.locator("#form-entrega").waitFor({ state: "visible", timeout: 15000 })
    }
    /*
      Um CEP que ESTE carrinho nunca cotou: a cotação de um CEP já perguntado
      volta da memória do backend em ~300 ms, e aí a busca acaba antes de
      alguém olhar. Com a Frenet demorando, a busca dura segundos — e a
      conferência é a de verdade: enquanto "Procurando o endereço…" está na
      tela, o botão não pode estar solto.
    */
    frenet.roteiro = "demora"
    await c("cep").fill("70040-010")
    let buscou = false
    let travou = true
    for (const fim = Date.now() + 3000; Date.now() < fim; await pag.waitForTimeout(100)) {
      const procurando = await pag
        .locator("#form-entrega .aviso-frete", { hasText: "Procurando" })
        .isVisible()
        .catch(() => false)
      if (!procurando) continue
      buscou = true
      if (!(await pag.locator("#form-entrega button[type=submit]").isDisabled())) travou = false
    }
    ok(
      buscou && travou,
      "com o CEP novo sendo buscado, confirmar o passo fica travado",
      buscou ? "o botão ficou solto durante a busca" : "a busca nem apareceu na tela"
    )
    frenet.roteiro = "normal"
    await pag
      .locator("#form-entrega button[type=submit]:not([disabled])")
      .waitFor({ timeout: 30000 })
      .catch(() => null)
  } finally {
    frenet.roteiro = "normal"
    await ctx.close()
  }
}

titulo("Um serviço só, com frete grátis")
/*
  A MESMA ENTREGA NÃO SE COBRA DUAS VEZES (24/09). Quando a transportadora
  responde um serviço só — ou a mais barata é também a mais rápida —, as duas
  faixas são o mesmo PAC. Acima do piso só a econômica ficava grátis, e a
  tela oferecia "Entrega expressa — R$ 23,70" pelo mesmo prazo: pagar por nada.
*/
if (PISO > 0) {
  const guardados = SERVICOS.splice(1)
  const ctx = await navegador.newContext({ viewport: MESA })
  const pag = await ctx.newPage()
  try {
    const id = await carrinhoNovo(ctx, [
      ["oleo-para-barba", 1],
      ["balm-para-barba", 1],
      ["shampoo-para-barba", 1],
    ])
    for (let i = 0; i < 6; i++) {
      const doCarrinho = (await medusa(`/store/carts/${id}?fields=item_subtotal`))?.cart
      if (Number(doCarrinho?.item_subtotal) > PISO) break
      await porNoCarrinho(id, "fator-de-crescimento-para-barba", 1)
    }
    await contatoEEntrega(pag, "servico.unico@fuckingbarba.invalid", { ate: "entrega" })
    const linhas = (await pag.locator("#form-entrega .opcao").allInnerTexts()).map((t) =>
      t.replace(/\s+/g, " ")
    )
    ok(
      linhas.length === 1 && /gr[áa]tis/i.test(linhas[0] ?? ""),
      "o mesmo serviço aparece uma vez só, e grátis",
      JSON.stringify(linhas)
    )
    const cotadas = await fretesCotados(id)
    ok(
      cotadas.length > 0 && cotadas.every((o) => Number(o.amount) === 0),
      "e o Medusa cobra zero nas duas faixas",
      cotadas.map((o) => `${o.name} ${reais(o.amount)}`).join(", ")
    )
  } finally {
    SERVICOS.push(...guardados)
    await ctx.close()
  }
} else {
  console.log("    (sem promoção de frete: pulei o serviço único)")
}

titulo("A promoção que acaba")
/*
  A FAIXA DE QUANTIDADE ACOMPANHA A PROMOÇÃO (24/09). Com a promoção
  desligada, 1 óleo voltava a R$ 79,90 e 2 continuavam saindo por R$ 104,90,
  calculados sobre o preço dela — até o job, que rodava de 15 em 15 minutos.
  Agora ele roda de minuto em minuto e avisa a loja. Desliga a promoção,
  espera a faixa acompanhar (até 90 s), confere a página do produto, e religa
  — esperando a faixa voltar, pra não deixar o banco no meio do caminho.
*/
if (EMAIL_ADMIN && SENHA_ADMIN) {
  const { price_lists: listas = [] } = await adm(
    "/admin/price-lists?fields=id,title,status,type&limit=100"
  )
  const promocao = listas.find(
    (l) => l.status === "active" && l.type === "sale" && l.title !== "Desconto por quantidade"
  )
  const { regions = [] } = (await medusa("/store/regions")) ?? {}
  const regiao = regions.find((r) => r.currency_code === "brl")
  const variante = (await medusa("/store/products?handle=oleo-para-barba&fields=*variants"))
    ?.products?.[0]?.variants?.[0]?.id
  const unitario = async (quantidade) => {
    const { json } = await medusaCru("/store/carts", {
      metodo: "POST",
      corpo: { region_id: regiao.id },
    })
    const { json: comItem } = await medusaCru(`/store/carts/${json.cart.id}/line-items`, {
      metodo: "POST",
      corpo: { variant_id: variante, quantity: quantidade },
    })
    return Number(comItem?.cart?.items?.[0]?.unit_price)
  }
  const esperar = (ms) => new Promise((pronto) => setTimeout(pronto, ms))
  if (!promocao || !variante) {
    console.log("    (sem promoção ativa no óleo: pulei a promoção que acaba)")
  } else {
    const antes1 = await unitario(1)
    const antes2 = await unitario(2)
    await adm(`/admin/price-lists/${promocao.id}`, {
      method: "POST",
      body: JSON.stringify({ status: "draft" }),
    })
    try {
      const depois1 = await unitario(1)
      let depois2 = await unitario(2)
      for (const fim = Date.now() + 90000; Date.now() < fim && depois2 <= antes1;) {
        await esperar(5000)
        depois2 = await unitario(2)
      }
      ok(
        depois1 > antes1,
        "desligada a promoção, 1 unidade volta ao preço cheio na hora",
        reais(depois1)
      )
      ok(
        depois2 > antes1 && depois2 < depois1,
        "e em até um minuto e meio as 2 unidades acompanham: acima da promoção, abaixo do cheio",
        `2 un.: ${reais(antes2)} → ${reais(depois2)} cada (1 un. ${reais(depois1)})`
      )
      let naPagina = ""
      for (let i = 0; i < 8 && !naPagina.includes(reais(depois1)); i++) {
        const html = await (await fetch(`${LOJA}/produtos/oleo-para-barba?_=${Date.now()}`)).text()
        naPagina = (html.match(/compra__por[^>]*>([^<]*)</)?.[1] ?? "").replace(/ /g, " ")
        if (!naPagina.includes(reais(depois1))) await esperar(2000)
      }
      ok(
        naPagina.includes(reais(depois1)),
        "e a loja foi avisada: a página do produto mostra o preço de agora",
        naPagina || "sem preço na página"
      )
    } finally {
      await adm(`/admin/price-lists/${promocao.id}`, {
        method: "POST",
        body: JSON.stringify({ status: "active" }),
      })
      let volta = await unitario(2)
      for (const fim = Date.now() + 90000; Date.now() < fim && !perto(volta, antes2);) {
        await esperar(5000)
        volta = await unitario(2)
      }
      ok(
        perto(volta, antes2),
        "religada a promoção, a faixa volta",
        `${reais(volta)} × ${reais(antes2)}`
      )
    }
  }
} else {
  console.log("    (sem ADMIN_EMAIL/ADMIN_SENHA: pulei a promoção que acaba)")
}

/* ── 7. higiene ───────────────────────────────────────────────────────────── */

titulo("Higiene")
ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.slice(0, 3).join(" | "))
if (recargaDoDev.descontados.length)
  console.log("  · descontado: o aviso do React da recarga do next dev (recarga-do-dev.mjs)")

await navegador.close()
frenet.fechar()
pagarme.fechar()
console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
