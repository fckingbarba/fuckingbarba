/**
 * Confere o MOTOR DE RECOMENDAÇÃO — o "Leva junto" da sacola e a oferta do
 * checkout — com o catálogo de verdade, sem servidor nenhum.
 *
 *   node ferramentas/conferir-recomendacao.mjs
 *
 * As duas metades de uma vez: o modelo é montado pela conta do BACKEND
 * (`apps/backend/src/lib/recomendacao.ts`) e a escolha é feita pela da LOJA
 * (`src/lib/recomendacao.ts`). Se o contrato entre as duas mudar de um lado
 * só, é aqui que aparece.
 *
 * Os casos são os que a loja vive: o fator puxando a rotina dele, o kit que
 * não pode ganhar outro shampoo, o frete grátis dando peso a quem fecha a
 * conta, e a oferta que aprende com o que os pedidos mostram — nos quatro
 * lugares: a gaveta, os chips do frete grátis, a oferta do checkout e o
 * carrossel da página do produto.
 */

import { montarModelo } from "../../backend/src/lib/recomendacao.ts"
import {
  escolherBump,
  escolherLevaJunto,
  escolherParaOFrete,
  nomeCurto,
  ordenarParaAPagina,
  sacolaDe,
  sorteio,
} from "../src/lib/recomendacao.ts"

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

/* ── o catálogo de 23/09 ──────────────────────────────────────────────────── */

const PRODUTOS = [
  ["oleo-para-barba", "Óleo para Barba FuckingBarba 30ml", 54.9, ["barba"], []],
  ["shampoo-para-barba", "Shampoo para Barba FuckingBarba 120ml", 49.9, ["barba"], []],
  ["balm-para-barba", "Balm Modelador para Barba FuckingBarba 90g", 53.9, ["barba"], []],
  [
    "fator-de-crescimento-para-barba",
    "Fator de Crescimento para Barba 30ml",
    79.9,
    ["barba"],
    // A rotina da PDP do fator, como está no admin.
    ["shampoo-para-barba", "oleo-para-barba"],
  ],
  [
    "spray-modelador-matte-100ml-fucking-barba",
    "Spray Modelador Matte 100ml",
    69.9,
    ["cabelo"],
    [],
  ],
  [
    "kit-completo-para-barba",
    "Kit Completo FuckingBarba — Shampoo, Balm e Óleo",
    99.9,
    ["kits", "barba"],
    [],
  ],
]
const PISO = 139.9

const catalogo = PRODUTOS.map(([handle, titulo, , categorias, combina]) => ({
  handle,
  titulo,
  categorias,
  combina,
}))
const vitrine = PRODUTOS.map(([handle, nome, preco]) => ({
  varianteId: `var_${handle}`,
  handle,
  nome,
  imagem: null,
  preco,
}))
const TODOS = new Set(PRODUTOS.map(([h]) => h))

/** A sacola com estes produtos, uma unidade de cada. */
function sacola(...handles) {
  const itens = handles.map((h) => vitrine.find((v) => v.handle === h))
  return {
    sacola: sacolaDe(itens.map((i) => ({ varianteId: i.varianteId, handle: i.handle }))),
    subtotal: itens.reduce((s, i) => s + i.preco, 0),
  }
}
const falta = (subtotal) => Math.max(0, Math.round((PISO - subtotal) * 100) / 100)
const nomes = (lista) => lista.map((s) => s.handle).join(", ")

const semPedidos = montarModelo(catalogo, [], TODOS)

/* ── o "Leva junto" ───────────────────────────────────────────────────────── */

titulo("Leva junto — com o fator na sacola")
{
  const { sacola: s, subtotal } = sacola("fator-de-crescimento-para-barba")
  const lista = escolherLevaJunto(vitrine, s, falta(subtotal), semPedidos)
  ok(
    lista[0]?.handle === "shampoo-para-barba" && lista[1]?.handle === "oleo-para-barba",
    "a rotina do fator vem primeiro: shampoo e óleo",
    nomes(lista)
  )
  ok(
    lista[2]?.handle === "kit-completo-para-barba" && lista[2].libera,
    "e o kit, que sozinho fecha o frete grátis, leva a etiqueta",
    nomes(lista)
  )
  ok(lista.filter((l) => l.libera).length === 1, "uma etiqueta só")
}

titulo("Leva junto — com o kit na sacola")
{
  const { sacola: s, subtotal } = sacola("kit-completo-para-barba")
  const lista = escolherLevaJunto(vitrine, s, falta(subtotal), semPedidos)
  ok(
    !lista.some((l) =>
      ["shampoo-para-barba", "balm-para-barba", "oleo-para-barba"].includes(l.handle)
    ),
    "nada do que já vem no kit",
    nomes(lista)
  )
  ok(lista[0]?.handle === "fator-de-crescimento-para-barba", "o fator na frente", nomes(lista))
}

titulo("Leva junto — com o shampoo na sacola")
{
  const { sacola: s, subtotal } = sacola("shampoo-para-barba")
  const lista = escolherLevaJunto(vitrine, s, falta(subtotal), semPedidos)
  ok(
    !lista.some((l) => l.handle === "kit-completo-para-barba"),
    "o kit sai: quem já pôs o shampoo levaria dois",
    nomes(lista)
  )
  ok(
    lista[0]?.handle === "oleo-para-barba",
    "o óleo, que divide a rotina do fator com o shampoo",
    nomes(lista)
  )
  ok(!lista.some((l) => l.libera), "nada fecha R$ 90 sozinho: nenhuma etiqueta", nomes(lista))
}

titulo("Leva junto — sem o modelo (Medusa fora do ar)")
{
  const { sacola: s, subtotal } = sacola("fator-de-crescimento-para-barba")
  const lista = escolherLevaJunto(vitrine, s, falta(subtotal), null)
  ok(
    lista[0]?.handle === "spray-modelador-matte-100ml-fucking-barba" && lista[0].libera,
    "vale a regra de antes: o mais barato que fecha o frete, com a etiqueta",
    nomes(lista)
  )
  ok(lista.length === 3, "e a gaveta continua com três")
}

titulo("Leva junto — os pedidos mandam")
{
  const pedidos = Array.from({ length: 12 }, () => ({
    handles: ["fator-de-crescimento-para-barba", "balm-para-barba"],
    bump: null,
  }))
  const modelo = montarModelo(catalogo, pedidos, TODOS)
  const { sacola: s, subtotal } = sacola("fator-de-crescimento-para-barba")
  const lista = escolherLevaJunto(vitrine, s, falta(subtotal), modelo)
  ok(
    lista[0]?.handle === "balm-para-barba",
    "doze pedidos de fator com balm passam a frente da rotina",
    nomes(lista)
  )
}

/* ── a oferta do checkout ─────────────────────────────────────────────────── */

const paraBump = (m, handles, semente = "cart_fixo") => {
  const { sacola: s, subtotal } = sacola(...handles)
  return escolherBump(vitrine, s, subtotal, m, semente)
}

titulo("Oferta do checkout — com dois shampoos (o carrinho do conferir-checkout)")
{
  const { sacola: s } = sacola("shampoo-para-barba")
  const escolha = escolherBump(vitrine, s, 99.8, semPedidos, "cart_fixo")
  ok(escolha?.item.handle === "oleo-para-barba", "o óleo", escolha?.item.handle)
  ok(
    escolha?.motivo.tipo === "combina" && escolha.motivo.com === "shampoo-para-barba",
    "porque combina com o shampoo (a rotina do fator)",
    JSON.stringify(escolha?.motivo)
  )
}

titulo("Oferta do checkout — nunca o que já está no pedido")
{
  const escolha = paraBump(semPedidos, ["oleo-para-barba"])
  ok(
    escolha && escolha.item.handle !== "oleo-para-barba",
    "com o óleo na sacola, oferece outro (antes: oferta nenhuma)",
    escolha?.item.handle
  )
  ok(escolha?.item.handle !== "kit-completo-para-barba", "e não o kit, que já traz um óleo")
}

titulo("Oferta do checkout — só produto com a promoção ligada")
{
  const soBalm = montarModelo(catalogo, [], new Set(["balm-para-barba"]))
  const escolha = paraBump(soBalm, ["fator-de-crescimento-para-barba"])
  ok(escolha?.item.handle === "balm-para-barba", "o único com promoção", escolha?.item.handle)
  ok(
    paraBump(montarModelo(catalogo, [], new Set()), ["fator-de-crescimento-para-barba"]) === null,
    "sem promoção nenhuma, sem oferta"
  )
  ok(paraBump(null, ["fator-de-crescimento-para-barba"]) === null, "sem modelo, sem oferta")
}

titulo("Oferta do checkout — o preço perto do pedido")
{
  const escolha = paraBump(semPedidos, ["spray-modelador-matte-100ml-fucking-barba"])
  ok(
    escolha?.item.handle !== "kit-completo-para-barba",
    "o kit de R$ 99,90 não vira compra por impulso num pedido de R$ 69,90",
    escolha?.item.handle
  )
}

titulo("Oferta do checkout — aprende com os pedidos e com o aceite")
{
  const juntos = Array.from({ length: 12 }, () => ({
    handles: ["oleo-para-barba", "balm-para-barba"],
    bump: null,
  }))
  const modelo = montarModelo(catalogo, juntos, TODOS)
  const escolha = paraBump(modelo, ["oleo-para-barba"])
  ok(
    escolha?.item.handle === "balm-para-barba",
    "óleo com balm, doze vezes: o balm",
    escolha?.item.handle
  )
  ok(
    escolha?.motivo.tipo === "juntos" && escolha.motivo.com === "oleo-para-barba",
    "e a frase pode dizer que quem compra óleo também leva",
    JSON.stringify(escolha?.motivo)
  )

  const recusado = montarModelo(
    catalogo,
    Array.from({ length: 40 }, () => ({
      handles: ["shampoo-para-barba"],
      bump: { produto: "oleo-para-barba", aceito: false },
    })),
    TODOS
  )
  ok(recusado.bump["oleo-para-barba"] < 1, "oferta recusada quarenta vezes perde peso")
}

titulo("Oferta do checkout — a mesma pra mesma pessoa")
{
  const primeira = paraBump(semPedidos, ["shampoo-para-barba"], "cart_01ABC")
  const segunda = paraBump(semPedidos, ["shampoo-para-barba"], "cart_01ABC")
  ok(primeira?.item.handle === segunda?.item.handle, "recarregar a página não troca o produto")

  let exploram = 0
  for (let i = 0; i < 2000; i++) {
    const e = paraBump(semPedidos, ["shampoo-para-barba"], `cart_${i}`)
    if (e?.item.handle !== "oleo-para-barba") exploram++
  }
  ok(
    exploram > 120 && exploram < 280,
    "um carrinho em dez vê o segundo colocado",
    `${exploram} de 2000`
  )
  ok(sorteio("x") === sorteio("x") && sorteio("x") !== sorteio("y"), "o sorteio é pelo id")
}

/* ── os chips do frete grátis, no passo da entrega ───────────────────────── */

titulo("Chips do frete grátis — balm e fator na sacola, faltando R$ 6,10")
{
  const { sacola: s, subtotal } = sacola("balm-para-barba", "fator-de-crescimento-para-barba")
  const chips = escolherParaOFrete(vitrine, s, 6.1, subtotal, semPedidos)
  ok(
    !chips.some((c) => c.handle === "kit-completo-para-barba"),
    "sem o kit: quem já tem o balm levaria dois (antes, o kit de R$ 99,90 aparecia)",
    nomes(chips)
  )
  ok(
    chips[0]?.handle === "shampoo-para-barba" && chips[1]?.handle === "oleo-para-barba",
    "a rotina do fator na frente: shampoo e óleo",
    nomes(chips)
  )
  ok(chips.length === 3, "três chips", nomes(chips))
}

titulo("Chips do frete grátis — só quem fecha a conta sozinho")
{
  const { sacola: s, subtotal } = sacola("fator-de-crescimento-para-barba")
  const chips = escolherParaOFrete(vitrine, s, 60, subtotal, semPedidos)
  ok(
    chips.length > 0 && chips.every((c) => c.preco >= 60),
    "faltando R$ 60, nenhum chip de menos que isso",
    chips.map((c) => `${c.handle} ${c.preco}`).join(", ")
  )
  ok(escolherParaOFrete(vitrine, s, 0, subtotal, semPedidos).length === 0, "já grátis, sem chip")
}

/* ── o carrossel da página do produto ─────────────────────────────────────── */

titulo('Carrossel "Quem leva este, leva junto"')
{
  const semEle = (h) => vitrine.filter((v) => v.handle !== h)
  const doFator = ordenarParaAPagina(
    semEle("fator-de-crescimento-para-barba"),
    "fator-de-crescimento-para-barba",
    semPedidos
  )
  ok(
    ["oleo-para-barba", "shampoo-para-barba"].includes(doFator[0]?.handle) &&
      ["oleo-para-barba", "shampoo-para-barba"].includes(doFator[1]?.handle),
    "na página do fator, a rotina dele primeiro",
    nomes(doFator)
  )
  ok(doFator.at(-1)?.handle === "spray-modelador-matte-100ml-fucking-barba", "e o spray por último")

  const doKit = ordenarParaAPagina(
    semEle("kit-completo-para-barba"),
    "kit-completo-para-barba",
    semPedidos
  )
  ok(
    doKit.length === 5 &&
      doKit
        .slice(2)
        .every((p) =>
          ["shampoo-para-barba", "balm-para-barba", "oleo-para-barba"].includes(p.handle)
        ),
    "na página do kit, as peças dele vão pro fim — e não somem",
    nomes(doKit)
  )
}

/* ── a frase ──────────────────────────────────────────────────────────────── */

titulo("O nome curto, pra frase da oferta")
for (const [nome, curto] of [
  ["Óleo para Barba FuckingBarba 30ml", "Óleo para Barba"],
  ["Balm Modelador para Barba FuckingBarba 90g", "Balm Modelador para Barba"],
  ["Fator de Crescimento para Barba 30ml", "Fator de Crescimento para Barba"],
  ["Spray Modelador Matte 100ml Fucking Barba", "Spray Modelador Matte"],
  ["Kit Completo FuckingBarba — Shampoo, Balm e Óleo", "Kit Completo"],
  ["FuckingBarba", "FuckingBarba"],
]) {
  const veio = nomeCurto(nome)
  ok(veio === curto, `"${nome}" → "${curto}"`, `veio "${veio}"`)
}

console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
