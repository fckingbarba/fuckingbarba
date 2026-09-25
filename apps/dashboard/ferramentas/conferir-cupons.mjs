/**
 * CONFERIDOR DOS CUPONS DO PAINEL — o cupom criado pelo painel, conferido
 * no CARRINHO DE VERDADE (a API da loja, como o checkout faz), e a tela.
 *
 *   (Medusa apontando pros falsos, como no conferir-pedidos; painel no ar)
 *   node apps/dashboard/ferramentas/conferir-cupons.mjs
 *
 * Variáveis: as de `pecas.mjs`, e mais NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 * ADMIN_EMAIL e ADMIN_SENHA (o admin LOCAL: pagar um pedido e apagar os
 * cupons da rodada no fim), MEDUSA_WEBHOOK_SEGREDO, PORTA_FALSA e
 * PORTA_PAGARME_FALSO.
 *
 * Cria três cupons pela API do painel — P (10%, pedido mínimo, vale até,
 * limite de 2 usos, uma vez por cliente), R (R$ 20, só na primeira compra)
 * e F (5%, sem regra) — e um pela tela, e confere cada regra num carrinho:
 * o Medusa aplica ou recusa. Os pedidos ficam no banco local; os cupons da
 * rodada são apagados e os membros saem da equipe no fim.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o cupom que aplica abaixo do pedido mínimo, ou não aplica acima;     │
 * │ • o "uma vez por cliente" que deixa usar de novo; a "primeira compra"  │
 * │   pra quem já comprou; o limite de usos que passa do limite;           │
 * │ • o carrinho sem e-mail quebrando com o cupom (o Medusa lança erro     │
 * │   com o "uma vez por atributo" dele); o cupom que não sai quando o     │
 * │   e-mail chega;                                                        │
 * │ • o cupom pausado que continua valendo;                                │
 * │ • a lista contando errado (usos, desconto, vendido) ou mostrando a     │
 * │   oferta do checkout como cupom; a operação abrindo os cupons;         │
 * │ • rolagem de lado no celular; erro no console.                         │
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
const centavos = (v) => Math.round(Number(v ?? 0) * 100) / 100
const email = (quem) => `cupons.${RODADA}.${quem}@teste.fuckingbarba.dev`
const sufixo = RODADA.toUpperCase()
const P = `P${sufixo}`
const R = `R${sufixo}`
const F = `F${sufixo}`
const U = `U${sufixo}`

/** "2026-10-01": daqui a `dias`, em Brasília. */
const diaDaqui = (dias) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + dias * 24 * 60 * 60 * 1000)
  )

/* ── os falsos, o admin e a loja ──────────────────────────────────────────── */

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
const fabrica = fabricaDePedidos({ medusa: MEDUSA, chave: CHAVE, tokenAdmin, pagarme })

/** A API da loja, como o checkout chama. */
async function loja(caminho, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: { "content-type": "application/json", "x-publishable-api-key": CHAVE },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

const variantes = new Map()
async function variante(handle) {
  if (!variantes.has(handle)) {
    const { corpo } = await loja(`/store/products?handle=${handle}&fields=variants.id`)
    variantes.set(handle, corpo.products?.[0]?.variants?.[0]?.id)
  }
  return variantes.get(handle)
}

const CAMPOS_DO_CARRINHO = "fields=id,email,discount_total,original_item_total,*promotions"

/** Um carrinho com estes itens (e o e-mail, se vier). Devolve o id. */
async function carrinho(itens, quem = null) {
  const { corpo: regioes } = await loja("/store/regions")
  const { corpo } = await loja("/store/carts", {
    metodo: "POST",
    corpo: { region_id: regioes.regions[0].id, ...(quem ? { email: quem } : {}) },
  })
  for (const [handle, quantidade] of itens)
    await loja(`/store/carts/${corpo.cart.id}/line-items`, {
      metodo: "POST",
      corpo: { variant_id: await variante(handle), quantity: quantidade },
    })
  return corpo.cart.id
}

async function lerCarrinho(id) {
  const { corpo } = await loja(`/store/carts/${id}?${CAMPOS_DO_CARRINHO}`)
  return {
    codigos: (corpo.cart?.promotions ?? []).map((p) => p.code),
    desconto: centavos(corpo.cart?.discount_total),
    produtos: centavos(corpo.cart?.original_item_total),
  }
}

/** Digita o código, como o checkout: o Medusa aplica ou não. Devolve o carrinho e o status. */
async function aplicar(id, codigo) {
  const r = await loja(`/store/carts/${id}/promotions`, {
    metodo: "POST",
    corpo: { promo_codes: [codigo] },
  })
  return { status: r.status, ...(await lerCarrinho(id)) }
}

let tokenDoDono = ""
const criados = []

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
  const mkt = await novaAba()
  const cookieMkt = await entrarPelaTela(mkt, `mkt.${RODADA}@painel.teste`, caixa)
  ok(Boolean(cookieOp && cookieMkt), "operação e marketing entram")
  const tokenOp = cookieOp.value
  const tokenMkt = cookieMkt.value

  const lerOp = await medusa("/dashboard/cupons", { metodo: "GET", token: tokenOp })
  const criarOp = await medusa("/dashboard/cupons", {
    token: tokenOp,
    corpo: { codigo: `X${sufixo}`, tipo: "porcento", valor: "10" },
  })
  ok(
    lerOp.status === 403 && criarOp.status === 403,
    "a operação não abre nem cria cupom",
    `${lerOp.status} ${criarOp.status}`
  )

  /* ── os cupons, pela API do painel ─────────────────────────────────────── */

  titulo("Os cupons da rodada (API)")
  const { corpo: produtos } = await loja("/store/products?fields=handle&limit=50")
  const [a, b] = produtos.products.map((p) => p.handle)
  const pequeno = (await lerCarrinho(await carrinho([[a, 1]]))).produtos
  const grande = (
    await lerCarrinho(
      await carrinho([
        [a, 1],
        [b, 1],
      ])
    )
  ).produtos
  ok(grande > pequeno + 1, "um carrinho pequeno e um grande", `${pequeno} ${grande}`)
  const minimo = pequeno + 1

  const criar = (corpo) => medusa("/dashboard/cupons", { token: tokenMkt, corpo })
  const rp = await criar({
    codigo: P.toLowerCase(),
    tipo: "porcento",
    valor: "10",
    minimo: String(minimo).replace(".", ","),
    ate: diaDaqui(7),
    limite: "2",
    umaVezPorCliente: true,
  })
  const rr = await criar({ codigo: R, tipo: "reais", valor: "20", primeiraCompra: true })
  const rf = await criar({ codigo: F, tipo: "porcento", valor: "5" })
  for (const r of [rp, rr, rf]) if (r.corpo.cupom?.id) criados.push(r.corpo.cupom.id)
  ok(
    rp.corpo.cupom?.codigo === P &&
      rp.corpo.cupom?.situacao === "valendo" &&
      rr.corpo.cupom?.codigo === R &&
      rf.corpo.cupom?.codigo === F,
    "três cupons criados, o código em maiúsculas",
    JSON.stringify([rp.corpo, rr.corpo, rf.corpo]).slice(0, 300)
  )
  const repetido = await criar({ codigo: P.toLowerCase(), tipo: "porcento", valor: "10" })
  const errado = await criar({ codigo: "x", tipo: "porcento", valor: "12,5", ate: "2020-01-01" })
  ok(
    repetido.status === 409 &&
      errado.status === 422 &&
      ["ate", "codigo", "valor"].every((c) => errado.corpo.erros?.[c]),
    "código repetido (em qualquer caixa) e campos errados são recusados, campo a campo",
    `${repetido.status} ${JSON.stringify(errado.corpo)}`
  )

  /* ── no carrinho ───────────────────────────────────────────────────────── */

  titulo("No carrinho: o Medusa aplica ou recusa")
  const [E1, E2, E3, E4] = ["um", "dois", "tres", "quatro"].map(email)
  const abaixo = await aplicar(await carrinho([[a, 1]], E2), P)
  const idAcima = await carrinho(
    [
      [a, 1],
      [b, 1],
    ],
    E2
  )
  const acima = await aplicar(idAcima, P)
  ok(
    !abaixo.codigos.includes(P) &&
      acima.codigos.includes(P) &&
      Math.abs(acima.desconto - centavos(acima.produtos * 0.1)) <= 0.02,
    "pedido mínimo: abaixo não entra; acima entra, com 10% dos produtos",
    JSON.stringify({ abaixo, acima })
  )

  const varianteB = await variante(b)
  const { corpo: comItens } = await loja(`/store/carts/${idAcima}?fields=items.id,items.variant_id`)
  const linhaB = (comItens.cart?.items ?? []).find((i) => i.variant_id === varianteB)
  await loja(`/store/carts/${idAcima}/line-items/${linhaB?.id}`, { metodo: "DELETE" })
  const tirou = await lerCarrinho(idAcima)
  ok(
    Boolean(linhaB) && !tirou.codigos.includes(P) && tirou.desconto < 0.01,
    "tirou um produto e ficou abaixo do mínimo: o cupom sai sozinho",
    JSON.stringify(tirou)
  )

  const pedidoE1 = await fabrica.pedidoPix(
    E1,
    [
      [a, 1],
      [b, 1],
    ],
    { cupom: P }
  )
  await fabrica.pagar(pedidoE1)
  const deNovo = await aplicar(
    await carrinho(
      [
        [a, 1],
        [b, 1],
      ],
      E1
    ),
    P
  )
  ok(
    pedidoE1.id && !deNovo.codigos.includes(P),
    "uma vez por cliente: quem já usou não usa de novo",
    JSON.stringify(deNovo)
  )

  const jaComprou = await aplicar(await carrinho([[a, 1]], E1), R)
  const primeira = await aplicar(await carrinho([[a, 1]], E3), R)
  ok(
    !jaComprou.codigos.includes(R) && primeira.codigos.includes(R) && primeira.desconto === 20,
    "só na primeira compra: quem já comprou não; o novo ganha os R$ 20",
    JSON.stringify({ jaComprou, primeira })
  )

  const semEmail = await carrinho([
    [a, 1],
    [b, 1],
  ])
  const antes = await aplicar(semEmail, P)
  await loja(`/store/carts/${semEmail}`, { metodo: "POST", corpo: { email: E1 } })
  const depois = await lerCarrinho(semEmail)
  ok(
    antes.status === 200 && antes.codigos.includes(P) && !depois.codigos.includes(P),
    "sem e-mail o cupom entra (e o carrinho não quebra); com o e-mail de quem já usou, ele sai",
    JSON.stringify({ antes, depois })
  )

  const idF = rf.corpo.cupom.id
  const pausou = await medusa(`/dashboard/cupons/${idF}`, {
    token: tokenMkt,
    corpo: { acao: "pausar" },
  })
  const pausado = await aplicar(await carrinho([[a, 1]], E4), F)
  await medusa(`/dashboard/cupons/${idF}`, { token: tokenMkt, corpo: { acao: "ligar" } })
  const ligado = await aplicar(await carrinho([[a, 1]], E4), F)
  ok(
    pausou.status === 200 && !pausado.codigos.includes(F) && ligado.codigos.includes(F),
    "pausado não aplica; ligado de novo, aplica",
    JSON.stringify({ pausado, ligado })
  )

  const pedidoE2 = await fabrica.pedidoPix(
    E2,
    [
      [a, 1],
      [b, 1],
    ],
    { cupom: P }
  )
  const esgotado = await aplicar(
    await carrinho(
      [
        [a, 1],
        [b, 1],
      ],
      E4
    ),
    P
  )
  ok(
    pedidoE2.id && !esgotado.codigos.includes(P),
    "o limite de 2 usos: depois do segundo pedido, ninguém mais usa",
    JSON.stringify(esgotado)
  )

  /* ── a lista ───────────────────────────────────────────────────────────── */

  titulo("A lista (API)")
  const lista = (await medusa("/dashboard/cupons", { metodo: "GET", token: tokenMkt })).corpo
  const noP = lista.cupons?.find((c) => c.codigo === P)
  ok(
    noP?.usos === "2 de 2 usos" &&
      noP?.situacao === "esgotado" &&
      noP?.pedidos === 2 &&
      noP?.desconto > 0 &&
      noP?.vendeu > 0,
    "o P: 2 de 2 usos, esgotado, com o desconto dado e o vendido (o pedido pago)",
    JSON.stringify(noP)
  )
  ok(
    /10% em pedidos a partir de R\$/.test(noP?.descricao ?? "") &&
      /^até \d{2}\/\d{2} · 2 usos no total · uma vez por cliente$/.test(noP?.regra ?? ""),
    "em frase: o desconto, o mínimo, a data, o limite e a regra de cliente",
    `${noP?.descricao} | ${noP?.regra}`
  )
  ok(
    !(lista.cupons ?? []).some((c) => c.codigo.startsWith("BUMP-")) &&
      lista.automaticos?.map((d) => d.id).join(",") === "quantidade,oferta,frete",
    "a oferta do checkout não aparece como cupom; os três descontos automáticos, sim"
  )

  /* ── a tela ────────────────────────────────────────────────────────────── */

  titulo("A tela do marketing")
  {
    const { pagina } = mkt
    await pagina.goto(`${PAINEL}/cupons`)
    await pagina.waitForSelector("[data-cupons]")
    await hidratado(pagina, "[data-novo-cupom]")
    const linhaDe = (codigo) => pagina.locator(`[data-cupom="${codigo}"]`)
    ok(
      /Esgotado/.test(await linhaDe(P).textContent()) &&
        (await linhaDe(P).locator(".chave").count()) === 0 &&
        /Valendo/.test(await linhaDe(F).textContent()) &&
        (await pagina.locator("[data-automatico]").count()) === 3,
      "a lista: o esgotado sem chave, o que vale com ela, e os três descontos automáticos"
    )

    await pagina.locator("[data-novo-cupom]").click()
    const form = pagina.locator("[data-form-cupom]")
    await form.waitFor()
    await form.locator('[data-campo="codigo"]').fill(U.toLowerCase())
    await form.locator('[data-tipo="reais"]').check({ force: true })
    await form.locator('[data-campo="valor"]').fill("0")
    await form.locator('button[type="submit"]').click()
    const marcado = await form
      .locator('[data-campo="valor"][aria-invalid="true"]')
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    ok(marcado, "o valor errado volta marcado no campo")
    const ate = diaDaqui(3)
    await form.locator('[data-campo="valor"]').fill("15")
    await form.locator('[data-campo="minimo"]').fill("100,00")
    await form.locator('[data-campo="ate"]').fill(ate)
    await form.locator('[data-campo="limite"]').fill("50")
    await form.locator('[data-campo="primeiraCompra"]').check()
    const previa = semEspaco(await form.locator("[data-previa-cupom]").textContent())
    ok(
      previa ===
        `${U}: R$ 15,00 de desconto em pedidos a partir de R$ 100,00 · até ${ate.slice(8, 10)}/${ate.slice(5, 7)} · 50 usos no total · uma vez por cliente · só na primeira compra`,
      "a prévia diz o cupom inteiro, antes de criar",
      previa
    )
    const aviso = pagina.locator(".aviso")
    const vez = await aviso.getAttribute("data-vez")
    await form.locator('button[type="submit"]').click()
    await pagina.waitForFunction(
      (v) => document.querySelector(".aviso")?.getAttribute("data-vez") !== v,
      vez,
      { timeout: 30000 }
    )
    await linhaDe(U).waitFor({ timeout: 15000 })
    ok(
      /criado/.test(await aviso.textContent()) &&
        (await pagina.locator("[data-form-cupom]").count()) === 0 &&
        /R\$ 15,00 de desconto em pedidos a partir de R\$ 100,00/.test(
          semEspaco(await linhaDe(U).textContent())
        ),
      "criado pela gaveta: o aviso, a gaveta fecha, e o cupom entra na lista"
    )

    const vez2 = await aviso.getAttribute("data-vez")
    await linhaDe(F).locator(".chave").click()
    await pagina.waitForFunction(
      (v) => document.querySelector(".aviso")?.getAttribute("data-vez") !== v,
      vez2,
      { timeout: 30000 }
    )
    const naApi = (await medusa("/dashboard/cupons", { metodo: "GET", token: tokenMkt })).corpo
    ok(
      naApi.cupons?.find((c) => c.codigo === F)?.situacao === "pausado" &&
        /Pausado/.test(await linhaDe(F).textContent()),
      "a chave pausa, na tela e no Medusa"
    )
  }

  titulo("A operação e o celular")
  {
    await op.pagina.goto(`${PAINEL}/cupons`)
    await op.pagina.waitForSelector("h1")
    ok(
      semEspaco(await op.pagina.locator("h1").first().textContent()) ===
        "Essa área não é do seu papel",
      "a operação: 'não é do seu papel'"
    )
    const cel = await novaAba({ width: 390, height: 844 })
    await entrarPelaTela(cel, DONO, caixa)
    await cel.pagina.goto(`${PAINEL}/cupons`)
    await cel.pagina.waitForSelector("[data-cupons]")
    ok(await semRolagemDeLado(cel.pagina), "no celular, sem rolagem de lado")
  }

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.join(" | "))
} catch (e) {
  falhou(`o conferidor quebrou: ${e instanceof Error ? e.stack : e}`)
} finally {
  // Os cupons da rodada saem do Medusa (os pedidos ficam, como nos outros conferidores).
  const { corpo } = await adm(`/admin/promotions?limit=200&fields=id,code`)
  for (const p of corpo.promotions ?? [])
    if (String(p.code).endsWith(sufixo))
      await adm(`/admin/promotions/${p.id}`, { metodo: "DELETE" })
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
