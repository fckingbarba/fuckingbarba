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
 * │ • a lista contando errado (usos, desconto, vendido — que é o cobrado,  │
 * │   com o desconto do cupom) ou mostrando a oferta do checkout como      │
 * │   cupom; a operação abrindo os cupons;                                 │
 * │ • rolagem de lado no celular; erro no console.                         │
 * │ Do jeito da Nuvemshop (0128):                                          │
 * │ • o frete grátis que não zera o frete, ou que aparece duas vezes no    │
 * │   desconto; o "só na mais barata" que vale na expressa;                │
 * │ • o "só com produtos de" que deixa passar um produto de fora;          │
 * │ • o "não combina" que vale com preço promocional;                      │
 * │ • o "por cliente" que deixa usar de novo; o agendado que já vale;      │
 * │ • dois cupons no mesmo pedido; a pergunta do frete aberta a qualquer   │
 * │   um; o formulário novo e o link do cupom.                             │
 * │ Da 0136:                                                               │
 * │ • o cupom em reais que não combina e não era criado (o Medusa recusava │
 * │   a regra de alvo numa promoção de alvo "order");                      │
 * │ • cupons somados pelo `promo_codes` no corpo do carrinho;              │
 * │ • o uso do cupom que o pedido cancelado não devolvia (o Pix vencido    │
 * │   queimava o cupom de 1 uso).                                          │
 * │ Da 0151:                                                               │
 * │ • o cupom "só com produtos de" que recusa o produto em mais de uma     │
 * │   categoria (o kit em Kits e em Barba) — ou aceita no de uma terceira. │
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
  IP,
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
/* Os do jeito da Nuvemshop: frete (N), frete na mais barata (B), categoria (K),
   produto (D), não combina (S), por cliente (L), agendado (A). */
const [N, B, K, D, S, L, A] = ["N", "B", "K", "D", "S", "L", "A"].map((l) => `${l}${sufixo}`)
/* Os da 0136: em reais sem combinar (V) e o de 1 uso que volta no cancelamento (W). */
const [V, W] = ["V", "W"].map((l) => `${l}${sufixo}`)
/* Os da 0151, com o kit em duas categorias: o da outra categoria dele (G) e o de uma terceira (H). */
const [G, H] = ["G", "H"].map((l) => `${l}${sufixo}`)

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

/** O endereço de teste (o mesmo do `pedido-de-teste.mjs`): a Frenet falsa cota pra ele. */
const ENDERECO = {
  first_name: "Rafael",
  last_name: "Teste",
  phone: "+5511988887777",
  address_1: "Rua Doutor Pedro Zimmermann, 99",
  city: "Blumenau",
  province: "SC",
  postal_code: "89036370",
  country_code: "br",
}

/** Pendura a entrega "economica" ou "expressa" (pelo nome da opção) no carrinho. */
async function comEntrega(id, faixa) {
  await loja(`/store/carts/${id}`, { metodo: "POST", corpo: { shipping_address: ENDERECO } })
  const { corpo } = await loja(`/store/shipping-options?cart_id=${id}`)
  const nome = faixa === "expressa" ? /expressa/i : /econ[ôo]mica/i
  const opcao = (corpo.shipping_options ?? []).find((o) => nome.test(o.name))
  const r = await loja(`/store/carts/${id}/shipping-methods`, {
    metodo: "POST",
    corpo: { option_id: opcao?.id },
  })
  return r.status === 200 && Boolean(opcao)
}

/** O frete do carrinho: o cobrado, o de antes do desconto, e os descontos. */
async function freteDo(id) {
  const { corpo } = await loja(
    `/store/carts/${id}?fields=shipping_total,shipping_subtotal,shipping_discount_total,discount_total,*promotions`
  )
  const c = corpo.cart ?? {}
  return {
    codigos: (c.promotions ?? []).map((p) => p.code),
    frete: centavos(c.shipping_total),
    antes: centavos(c.shipping_subtotal),
    descontoDoFrete: centavos(c.shipping_discount_total),
    desconto: centavos(c.discount_total),
  }
}

/** "2026-10-01T00:00" daqui a `dias`, em Brasília — o campo de data e hora do formulário. */
const diaEHora = (dias, hora = "00:00") => `${diaDaqui(dias)}T${hora}`

let tokenDoDono = ""
const criados = []
/** O preço da "Promoção de lançamento" que o teste do "não combina" tirou, pra devolver no fim. */
let devolverPromocao = null
/** As categorias do kit antes de ele ganhar a segunda (0151), pra devolver se a rodada cair no meio. */
let devolverCategorias = null

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

  /* ── do jeito da Nuvemshop ─────────────────────────────────────────────── */

  titulo("Do jeito da Nuvemshop (API): frete, a quem vale, combinar, por cliente, período")
  const catalogo = (await medusa("/dashboard/cupons", { metodo: "GET", token: tokenMkt })).corpo
    .catalogo
  const { corpo: comCategorias } = await loja("/store/products?fields=handle,*categories&limit=50")
  const categoriaDe = (h) =>
    comCategorias.products.find((p) => p.handle === h)?.categories?.[0]?.id ?? null
  // Dois produtos de categorias diferentes: o do kit (K) e um de fora dela.
  const doKit =
    comCategorias.products.find((p) => /kit/i.test(p.handle) && p.categories?.length)?.handle ?? a
  const deFora =
    comCategorias.products.find(
      (p) => categoriaDe(p.handle) && categoriaDe(p.handle) !== categoriaDe(doKit)
    )?.handle ?? b
  const idDoProduto = async (h) =>
    (await loja(`/store/products?handle=${h}&fields=id`)).corpo.products?.[0]?.id
  const NOVO = {
    tipo: "porcento",
    valor: "10",
    soMaisBarato: false,
    aplicarA: "loja",
    alvos: [],
    combina: true,
    porCupom: "ilimitado",
    limite: "",
    porCliente: "ilimitado",
    usosPorCliente: "",
    data: "ilimitado",
    de: "",
    ate: "",
    minimo: "",
  }
  const novos = await Promise.all([
    criar({ ...NOVO, codigo: N, tipo: "frete", valor: "" }),
    criar({ ...NOVO, codigo: B, tipo: "frete", valor: "", soMaisBarato: true }),
    criar({ ...NOVO, codigo: K, aplicarA: "categorias", alvos: [categoriaDe(doKit)] }),
    criar({ ...NOVO, codigo: D, aplicarA: "produtos", alvos: [await idDoProduto(deFora)] }),
    criar({ ...NOVO, codigo: S, combina: false }),
    criar({ ...NOVO, codigo: L, porCliente: "limitado", usosPorCliente: "1" }),
    criar({ ...NOVO, codigo: A, data: "periodo", de: diaEHora(1), ate: diaEHora(8, "23:59") }),
  ])
  for (const r of novos) if (r.corpo.cupom?.id) criados.push(r.corpo.cupom.id)
  ok(
    novos.every((r) => r.status === 200) &&
      novos.map((r) => r.corpo.cupom?.codigo).join() === [N, B, K, D, S, L, A].join(),
    "sete cupons pelo formulário novo: frete, frete na mais barata, categoria, produto, não combina, por cliente, agendado",
    JSON.stringify(novos.map((r) => [r.status, r.corpo.erros ?? r.corpo.cupom?.codigo]))
  )

  // Frete grátis: sem entrega escolhida o Medusa não tem o que descontar (por
  // isso a loja guarda o cupom); com ela, o frete zera — uma vez só.
  const idN = await carrinho([[a, 1]], email("frete"))
  const semEntrega = await aplicar(idN, N)
  await comEntrega(idN, "expressa")
  await aplicar(idN, N)
  const comN = await freteDo(idN)
  ok(
    !semEntrega.codigos.includes(N) &&
      comN.codigos.includes(N) &&
      comN.antes > 0 &&
      comN.frete === 0 &&
      comN.descontoDoFrete === comN.antes &&
      comN.desconto === comN.antes,
    "frete grátis: sem entrega não entra; com ela, o frete zera e o desconto é só o do frete",
    JSON.stringify({ semEntrega, comN })
  )

  const idB = await carrinho([[a, 1]], email("barata"))
  await comEntrega(idB, "expressa")
  const naExpressa = await aplicar(idB, B)
  await comEntrega(idB, "economica")
  await aplicar(idB, B)
  const naEconomica = await freteDo(idB)
  ok(
    !naExpressa.codigos.includes(B) &&
      naEconomica.codigos.includes(B) &&
      naEconomica.frete === 0 &&
      naEconomica.antes > 0,
    "frete grátis só na mais barata: na expressa não entra; na econômica, zera",
    JSON.stringify({ naExpressa, naEconomica })
  )

  // A loja pergunta se o código é de frete (pra guardar o cupom até a entrega).
  const perguntar = (codigo, assinada) =>
    fetch(`${MEDUSA}/store/cupons/frete?codigo=${encodeURIComponent(codigo)}`, {
      headers: {
        "x-publishable-api-key": CHAVE,
        ...(assinada
          ? { "x-loja-segredo": process.env.REVALIDAR_SEGREDO ?? "", "x-cliente-ip": IP }
          : {}),
      },
    }).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => ({})) }))
  const [ehN, ehB, ehF, semAssinatura] = await Promise.all([
    perguntar(N.toLowerCase(), true),
    perguntar(B, true),
    perguntar(F, true),
    perguntar(N, false),
  ])
  ok(
    ehN.corpo.frete === true &&
      ehN.corpo.soMaisBarato === false &&
      ehB.corpo.soMaisBarato === true &&
      ehF.corpo.frete === false &&
      semAssinatura.status === 403,
    "a pergunta do frete: diz o de frete (e o da mais barata), não o de produto; sem a assinatura da loja, 403",
    JSON.stringify({ ehN, ehB, ehF, semAssinatura })
  )

  const soKit = await aplicar(await carrinho([[doKit, 1]], email("kit")), K)
  const kitEFora = await aplicar(
    await carrinho(
      [
        [doKit, 1],
        [deFora, 1],
      ],
      email("kit2")
    ),
    K
  )
  ok(
    doKit !== deFora && soKit.codigos.includes(K) && !kitEFora.codigos.includes(K),
    `só com produtos da categoria: o carrinho só com ${doKit} entra; com ${deFora} junto, não`,
    JSON.stringify({ soKit, kitEFora })
  )

  // O produto em mais de uma categoria (0151): o kit ganha a do produto de fora (Barba, no
  // banco local). Pra Nuvemshop ele é das duas: o cupom de cada uma aceita, e o de uma terceira
  // não. Até a 0151, o de Kits (K) passava a recusar o kit no dia em que ele ganhava Barba.
  const idDoKit = await idDoProduto(doKit)
  const daOutra = categoriaDe(deFora)
  const terceira = catalogo.categorias.find(
    (c) => c.id !== categoriaDe(doKit) && c.id !== daOutra
  )?.id
  const kitAntes = (await adm(`/admin/products/${idDoKit}?fields=*categories`)).corpo.product
  devolverCategorias = {
    id: idDoKit,
    categorias: (kitAntes?.categories ?? []).map((c) => ({ id: c.id })),
  }
  const duas = await adm(`/admin/products/${idDoKit}`, {
    metodo: "POST",
    corpo: { categories: [...devolverCategorias.categorias, { id: daOutra }] },
  })
  const novosDaDupla = await Promise.all([
    criar({ ...NOVO, codigo: G, aplicarA: "categorias", alvos: [daOutra] }),
    ...(terceira ? [criar({ ...NOVO, codigo: H, aplicarA: "categorias", alvos: [terceira] })] : []),
  ])
  for (const r of novosDaDupla) if (r.corpo.cupom?.id) criados.push(r.corpo.cupom.id)
  const kitNoK = await aplicar(await carrinho([[doKit, 1]], email("dupla1")), K)
  const kitNoG = await aplicar(await carrinho([[doKit, 1]], email("dupla2")), G)
  const kitEForaNoG = await aplicar(
    await carrinho(
      [
        [doKit, 1],
        [deFora, 1],
      ],
      email("dupla3")
    ),
    G
  )
  const kitEForaNoK = await aplicar(
    await carrinho(
      [
        [doKit, 1],
        [deFora, 1],
      ],
      email("dupla4")
    ),
    K
  )
  const kitNoH = terceira ? await aplicar(await carrinho([[doKit, 1]], email("dupla5")), H) : null
  ok(
    duas.status === 200 &&
      novosDaDupla.every((r) => r.status === 200) &&
      kitNoK.codigos.includes(K) &&
      kitNoG.codigos.includes(G) &&
      kitEForaNoG.codigos.includes(G) &&
      !kitEForaNoK.codigos.includes(K) &&
      Boolean(kitNoH) &&
      !kitNoH.codigos.includes(H),
    `o kit em duas categorias: o cupom de cada uma aceita (o da outra também com o ${deFora} junto; o de Kits, não), e o de uma terceira recusa`,
    JSON.stringify({ duas: duas.status, kitNoK, kitNoG, kitEForaNoG, kitEForaNoK, kitNoH })
  )
  const devolvidas = await adm(`/admin/products/${idDoKit}`, {
    metodo: "POST",
    corpo: { categories: devolverCategorias.categorias },
  })
  if (devolvidas.status === 200) devolverCategorias = null

  const soProduto = await aplicar(await carrinho([[deFora, 1]], email("prod")), D)
  const produtoEOutro = await aplicar(
    await carrinho(
      [
        [deFora, 1],
        [doKit, 1],
      ],
      email("prod2")
    ),
    D
  )
  ok(
    soProduto.codigos.includes(D) && !produtoEOutro.codigos.includes(D),
    "só com o produto: sozinho entra; com outro produto junto, não",
    JSON.stringify({ soProduto, produtoEOutro })
  )

  // Não combina (como na Nuvemshop): não desconta o produto em promoção, e não
  // vale no pedido que já ganhou o frete grátis da loja. O banco local tem
  // todos na "Promoção de lançamento": um produto sai dela durante o teste (e
  // volta no fim), pra ter um de preço cheio. Os dois juntos ficam abaixo do
  // piso do frete grátis; com o kit, passam dele.
  const handles = comCategorias.products.map((p) => p.handle)
  const cheio = handles.includes("shampoo-para-barba") ? "shampoo-para-barba" : deFora
  const emPromo =
    ["oleo-para-barba", "balm-para-barba"].find((h) => handles.includes(h) && h !== cheio) ?? doKit
  const lancamento = (
    await adm("/admin/price-lists?limit=50&fields=id,title")
  ).corpo.price_lists?.find((l) => /lançamento/i.test(l.title))
  if (lancamento) {
    const { corpo: lista } = await adm(
      `/admin/price-lists/${lancamento.id}?fields=prices.id,prices.amount,prices.currency_code,prices.price_set.variant.id`
    )
    const vCheio = await variante(cheio)
    const preco = (lista.price_list?.prices ?? []).find((x) => x.variant_id === vCheio)
    if (preco) {
      const r = await adm(`/admin/price-lists/${lancamento.id}/prices/batch`, {
        metodo: "POST",
        corpo: { delete: [preco.id] },
      })
      if (r.status === 200)
        devolverPromocao = {
          lista: lancamento.id,
          variant_id: vCheio,
          amount: preco.amount,
          currency_code: preco.currency_code ?? "brl",
        }
    }
  }
  const linhasDo = async (id) =>
    (
      await loja(
        `/store/carts/${id}?fields=items.unit_price,items.compare_at_unit_price,items.variant_id`
      )
    ).corpo.cart?.items ?? []
  const idMisto = await carrinho(
    [
      [cheio, 1],
      [emPromo, 1],
    ],
    email("s1")
  )
  const vCheio = await variante(cheio)
  const ls = await linhasDo(idMisto)
  const linhaCheia = ls.find((l) => l.variant_id === vCheio)
  const linhaPromo = ls.find((l) => l.variant_id !== vCheio)
  const misto = await aplicar(idMisto, S)
  const soPromocao = await aplicar(await carrinho([[emPromo, 1]], email("s2")), S)
  const controle = await aplicar(await carrinho([[emPromo, 1]], email("s3")), F)
  ok(
    Boolean(linhaCheia) &&
      !(Number(linhaCheia?.compare_at_unit_price) > Number(linhaCheia?.unit_price)) &&
      Number(linhaPromo?.compare_at_unit_price) > Number(linhaPromo?.unit_price) &&
      misto.produtos < 149.9 &&
      misto.codigos.includes(S) &&
      Math.abs(misto.desconto - centavos(Number(linhaCheia?.unit_price) * 0.1)) <= 0.02 &&
      !soPromocao.codigos.includes(S) &&
      controle.codigos.includes(F),
    "não combina: desconta só o produto de preço cheio; carrinho só com promoção, não entra (o que combina, entra)",
    JSON.stringify({ linhaCheia, linhaPromo, misto, soPromocao, controle })
  )
  const comFreteDaLoja = await aplicar(
    await carrinho(
      [
        [cheio, 1],
        [doKit, 1],
      ],
      email("s4")
    ),
    S
  )
  ok(
    comFreteDaLoja.produtos >= 149.9 && !comFreteDaLoja.codigos.includes(S),
    "não combina: no pedido que já ganhou o frete grátis da loja, não entra",
    JSON.stringify(comFreteDaLoja)
  )

  const E5 = email("cinco")
  const pedidoE5 = await fabrica.pedidoPix(E5, [[a, 1]], { cupom: L })
  const deNovoL = await aplicar(await carrinho([[a, 1]], E5), L)
  const outroL = await aplicar(await carrinho([[a, 1]], email("seis")), L)
  ok(
    pedidoE5.id && !deNovoL.codigos.includes(L) && outroL.codigos.includes(L),
    "por cliente, limitado a 1: quem já usou não usa de novo; outro cliente usa",
    JSON.stringify({ deNovoL, outroL })
  )

  const agendado = await aplicar(await carrinho([[a, 1]], email("agenda")), A)
  ok(!agendado.codigos.includes(A), "agendado: antes do começo não vale", JSON.stringify(agendado))

  // Um cupom por pedido: o segundo, pela API da loja, é recusado; o primeiro fica.
  const idUm = await carrinho([[a, 1]], email("um-so"))
  await aplicar(idUm, F)
  const segundo = await aplicar(idUm, S)
  ok(
    segundo.status === 400 && segundo.codigos.includes(F) && !segundo.codigos.includes(S),
    "um cupom por pedido: o segundo é recusado, e o primeiro continua",
    JSON.stringify(segundo)
  )

  /* ── os consertos da 0136 ──────────────────────────────────────────────── */

  titulo("Os consertos da 0136: em reais sem combinar, o corpo do carrinho, o uso que volta")
  // Em reais e sem combinar: o Medusa recusava a promoção (regra de alvo numa
  // promoção de alvo "order"), e o painel dizia "Não consegui falar com a
  // loja". Agora o desconto mira os produtos: o de preço cheio, e não o em
  // promoção — o mesmo carrinho do "não combina" de porcentagem, lá em cima.
  const rv = await criar({ ...NOVO, codigo: V, tipo: "reais", valor: "10", combina: false })
  if (rv.corpo.cupom?.id) criados.push(rv.corpo.cupom.id)
  const mistoV = await aplicar(
    await carrinho(
      [
        [cheio, 1],
        [emPromo, 1],
      ],
      email("v1")
    ),
    V
  )
  const soPromoV = await aplicar(await carrinho([[emPromo, 1]], email("v2")), V)
  ok(
    rv.status === 200 &&
      mistoV.codigos.includes(V) &&
      Math.abs(mistoV.desconto - 10) <= 0.01 &&
      !soPromoV.codigos.includes(V),
    "em reais e sem combinar: o painel cria; desconta R$ 10 com um produto de preço cheio, e só com promoção não entra",
    JSON.stringify({
      status: rv.status,
      erro: rv.corpo.erros ?? rv.corpo.message,
      mistoV,
      soPromoV,
    })
  )

  // Um cupom por pedido também no corpo do carrinho: o Medusa aceita
  // `promo_codes` ao criar e ao atualizar o carrinho, e ali a lista
  // substituía a de antes — cinco cupons somavam.
  const idCorpo = await carrinho([[a, 1]], email("corpo"))
  const noCorpo = await loja(`/store/carts/${idCorpo}`, {
    metodo: "POST",
    corpo: { promo_codes: [F, V] },
  })
  const { corpo: regioesV } = await loja("/store/regions")
  const aoCriar = await loja("/store/carts", {
    metodo: "POST",
    corpo: { region_id: regioesV.regions[0].id, promo_codes: [F] },
  })
  const depoisDoCorpo = await lerCarrinho(idCorpo)
  ok(
    noCorpo.status === 400 && aoCriar.status === 400 && depoisDoCorpo.codigos.length === 0,
    "cupom no corpo do carrinho, ao criar ou ao atualizar, é recusado: só entra pela porta dos cupons",
    JSON.stringify({ noCorpo: noCorpo.status, aoCriar: aoCriar.status, depoisDoCorpo })
  )

  // O uso volta quando o pedido é cancelado: o Pix gerado conta o uso, e o
  // que vencia sem ser pago queimava o cupom de 1 uso pra sempre.
  const rw = await criar({ ...NOVO, codigo: W, porCupom: "limitado", limite: "1" })
  if (rw.corpo.cupom?.id) criados.push(rw.corpo.cupom.id)
  const usosDeW = async () =>
    (await adm(`/admin/promotions?limit=200&fields=id,code,used`)).corpo.promotions?.find(
      (p) => p.code === W
    )?.used
  const pedidoW = await fabrica.pedidoPix(email("w1"), [[a, 1]], { cupom: W })
  const usadoAntes = await usosDeW()
  const esgotadoW = await aplicar(await carrinho([[a, 1]], email("w2")), W)
  const cancelouW = await adm(`/admin/orders/${pedidoW.id}/cancel`, { metodo: "POST" })
  let usadoDepois = usadoAntes
  for (let i = 0; i < 30 && usadoDepois !== 0; i++) {
    await new Promise((pronto) => setTimeout(pronto, 1000))
    usadoDepois = await usosDeW()
  }
  const deNovoW = await aplicar(await carrinho([[a, 1]], email("w3")), W)
  const registroW = (await adm(`/admin/orders/${pedidoW.id}?fields=metadata`)).corpo.order?.metadata
    ?.fb_cupons?.uso_devolvido
  ok(
    Boolean(pedidoW.id) &&
      usadoAntes === 1 &&
      !esgotadoW.codigos.includes(W) &&
      cancelouW.status === 200 &&
      usadoDepois === 0 &&
      deNovoW.codigos.includes(W) &&
      (registroW?.codigos ?? []).includes(W),
    "cupom de 1 uso: o Pix gerado gasta o uso; o pedido cancelado devolve, e o cupom vale de novo",
    JSON.stringify({
      pedido: pedidoW.id,
      usadoAntes,
      esgotadoW,
      cancelou: cancelouW.status,
      usadoDepois,
      deNovoW,
      registroW,
    })
  )

  /* ── a lista ───────────────────────────────────────────────────────────── */

  titulo("A lista (API)")
  const lista = (await medusa("/dashboard/cupons", { metodo: "GET", token: tokenMkt })).corpo
  const noP = lista.cupons?.find((c) => c.codigo === P)
  // O vendido é o que o Pagar.me cobrou no pedido pago: com o desconto do próprio cupom.
  const cobradoE1 = await fabrica.cobrado(pedidoE1)
  ok(
    noP?.usos === "2 de 2 usos" &&
      noP?.situacao === "esgotado" &&
      noP?.pedidos === 2 &&
      noP?.desconto > 0 &&
      noP?.vendeu === cobradoE1,
    `o P: 2 de 2 usos, esgotado, com o desconto dado e o vendido (o cobrado no pedido pago, ${cobradoE1})`,
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
  const naLista = (codigo) => lista.cupons?.find((c) => c.codigo === codigo) ?? {}
  const nomeDaCategoria = catalogo?.categorias?.find((c) => c.id === categoriaDe(doKit))?.nome
  ok(
    naLista(N).descricao === "Frete grátis em qualquer pedido" &&
      naLista(B).descricao === "Frete grátis na opção mais barata em qualquer pedido" &&
      naLista(K).descricao === `10% só com produtos de ${nomeDaCategoria}` &&
      /^10% só com /.test(naLista(D).descricao ?? "") &&
      naLista(S).regra === "sem data de fim · não combina com outras promoções" &&
      naLista(L).regra === "sem data de fim · uma vez por cliente" &&
      naLista(A).situacao === "agendado" &&
      naLista(A).regra ===
        `de ${diaDaqui(1).slice(8, 10)}/${diaDaqui(1).slice(5, 7)} às 00:00 até ${diaDaqui(8).slice(8, 10)}/${diaDaqui(8).slice(5, 7)} às 23:59`,
    "os do jeito da Nuvemshop, em frase: frete, mais barata, categoria, produto, combinar, por cliente e o agendado",
    JSON.stringify(
      [N, B, K, D, S, L, A].map((c) => [
        naLista(c).descricao,
        naLista(c).regra,
        naLista(c).situacao,
      ])
    )
  )
  ok(
    typeof lista.loja === "string" &&
      (lista.catalogo?.categorias ?? []).length > 0 &&
      (lista.catalogo?.produtos ?? []).length > 0,
    'a página traz o endereço da loja (o link do cupom) e o que o "Aplicar a" escolhe',
    JSON.stringify({ loja: lista.loja, categorias: lista.catalogo?.categorias?.length })
  )

  // De 20 em 20, com a busca pelo código (entrega 0146): os 104 da Nuvemshop enchiam a tela.
  const achados = (
    await medusa(`/dashboard/cupons?busca=${P.toLowerCase()}`, { metodo: "GET", token: tokenMkt })
  ).corpo
  ok(
    lista.paginacao?.porPagina === 20 &&
      (lista.cupons ?? []).length <= 20 &&
      achados.cupons?.length >= 1 &&
      achados.cupons.every((c) => c.codigo.includes(P)) &&
      achados.paginacao?.itens === achados.cupons.length,
    "os cupons vêm de 20 em 20, e a busca acha pelo código, sem diferença de maiúscula",
    JSON.stringify({ paginacao: lista.paginacao, achados: achados.cupons?.map((c) => c.codigo) })
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
    await form.locator('[data-escolha="data:periodo"]').check({ force: true })
    await form.locator('[data-campo="de"]').fill(`${diaDaqui(0)}T00:00`)
    await form.locator('[data-campo="ate"]').fill(`${ate}T23:59`)
    await form.locator('[data-escolha="porCupom:limitado"]').check({ force: true })
    await form.locator('[data-campo="limite"]').fill("50")
    await form.locator('[data-escolha="porCliente:primeira"]').check({ force: true })
    // A quem vale: escolhe a categoria, vê a frase, e volta pra loja toda.
    await form.locator('[data-escolha="aplicarA:categorias"]').check({ force: true })
    const nomeCat = catalogo?.categorias?.[0]?.nome ?? ""
    await form.locator(`[data-alvo="${nomeCat}"]`).check()
    const comCategoria = semEspaco(await form.locator("[data-previa-cupom]").textContent())
    await form.locator('[data-escolha="aplicarA:loja"]').check({ force: true })
    ok(
      comCategoria.includes(`só com produtos de ${nomeCat}`),
      "aplicar a categorias: a lista pra marcar, e a prévia diz a categoria",
      comCategoria
    )
    const link = semEspaco(await form.locator("[data-link-cupom] code").textContent())
    ok(
      link === `${lista.loja}/discount/${U}`,
      "o link do cupom, como o da Nuvemshop: <loja>/discount/<CÓDIGO>",
      link
    )
    const previa = semEspaco(await form.locator("[data-previa-cupom]").textContent())
    ok(
      previa ===
        `${U}: R$ 15,00 de desconto em pedidos a partir de R$ 100,00 · de ${diaDaqui(0).slice(8, 10)}/${diaDaqui(0).slice(5, 7)} às 00:00 até ${ate.slice(8, 10)}/${ate.slice(5, 7)} às 23:59 · 50 usos no total · só na primeira compra`,
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
    ok(
      (await linhaDe(U).locator(`[data-copiar-link="${U}"]`).count()) === 1,
      "na lista, cada cupom tem o botão do link"
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

  titulo("A busca pelo código, na tela")
  {
    const { pagina } = mkt
    await pagina.goto(`${PAINEL}/cupons?busca=${P}`)
    await pagina.waitForSelector("[data-cupons]")
    const codigos = await pagina
      .locator("[data-cupons] [data-cupom]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-cupom")))
    ok(
      codigos.length === achados.cupons.length &&
        codigos.every((c) => c.includes(P)) &&
        (await pagina.locator("#busca-cupons").inputValue()) === P,
      "a tela mostra só os cupons com o código buscado, e a busca fica na caixa",
      codigos.join(",")
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
  if (devolverCategorias) {
    const r = await adm(`/admin/products/${devolverCategorias.id}`, {
      metodo: "POST",
      corpo: { categories: devolverCategorias.categorias },
    })
    if (r.status !== 200)
      console.log(
        `  ⚠  não devolvi as categorias do kit (${r.status}): ${JSON.stringify(devolverCategorias)}`
      )
  }
  if (devolverPromocao) {
    const { lista, ...preco } = devolverPromocao
    const r = await adm(`/admin/price-lists/${lista}/prices/batch`, {
      metodo: "POST",
      corpo: { create: [preco] },
    })
    if (r.status !== 200)
      console.log(
        `  ⚠  não devolvi a "Promoção de lançamento" (${r.status}): ${JSON.stringify(preco)}`
      )
  }
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
