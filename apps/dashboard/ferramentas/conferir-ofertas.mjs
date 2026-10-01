/**
 * CONFERIDOR DAS OFERTAS OCULTAS (entrega 0238): a oferta criada pelo painel,
 * conferida no CARRINHO DE VERDADE (a API da loja, como a sacola faz), na
 * tela do painel e — com a loja no ar (`LOJA`) — na página `/oferta/<endereço>`,
 * na sacola, na página do produto e no checkout.
 *
 *   (Medusa apontando pros falsos e com o LOJA_URL da loja conferida; painel no ar)
 *   node apps/dashboard/ferramentas/conferir-ofertas.mjs
 *
 * Variáveis: as de `pecas.mjs`, e mais NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 * ADMIN_EMAIL e ADMIN_SENHA (o admin LOCAL: a lista de preço de teste e o
 * pedido), MEDUSA_WEBHOOK_SEGREDO, PORTA_FALSA e PORTA_PAGARME_FALSO; LOJA
 * (opcional: sem ela, a parte da loja não roda).
 *
 * As ofertas da rodada são encerradas no fim (ficam no banco local, como as
 * de qualquer loja); o pedido Pix fica, como nos outros conferidores; os
 * membros saem da equipe.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o preço da oferta vazando pra vitrine, pra página do produto ou pra  │
 * │   quem não passou pelo link;                                           │
 * │ • o carrinho marcado sem o preço (o gancho do preço), ou o produto que │
 * │   já estava na sacola ficando com o preço velho;                       │
 * │ • quem tem o link pagando MAIS que a vitrine: a faixa de quantidade    │
 * │   ou uma promoção da vitrine abaixo do "por";                          │
 * │ • a marca sem a assinatura da loja; a pausada, a agendada e a          │
 * │   encerrada vendendo; o checkout que não devolve o preço de sempre     │
 * │   quando a oferta acaba;                                               │
 * │ • o pedido sem a marca, e a lista sem contar a venda;                  │
 * │ • o formulário: campo errado sem voltar marcado, endereço repetido, o  │
 * │   "por" acima do preço de hoje;                                        │
 * │ • a página: o noindex, o contador, o selo, o "Comprar" que não marca a │
 * │   sacola, a oferta pausada que segue mostrando o preço;                │
 * │ • rolagem de lado no celular; erro no console.                         │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { comAFaixaRespondida } from "../../loja/ferramentas/faixa-respondida.mjs"
import { fabricaDePedidos } from "../../loja/ferramentas/pedido-de-teste.mjs"
import { subirFrenetFalsa } from "../../loja/ferramentas/frenet-falsa.mjs"
import { subirPagarmeFalso } from "../../loja/ferramentas/pagarme-falso.mjs"
import {
  abrirNavegador,
  avisoDoClique,
  caixaDoResend,
  DONO,
  entrar as entrarPelaTela,
  esperar,
  exigirAmbiente,
  falhou,
  hidratado,
  medusa,
  MEDUSA,
  ok,
  PAINEL,
  resumo,
  RODADA,
  SEGREDO,
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
const LOJA = (process.env.LOJA ?? "").replace(/\/+$/, "")

const semEspaco = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
const centavos = (v) => Math.round(Number(v ?? 0) * 100) / 100
const reais = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(v)
    .replace(/\s/g, " ")
/** "59,90" — como o painel digita. */
const virgula = (v) => v.toFixed(2).replace(".", ",")
/** "2026-10-04T23:59": daqui a `dias`, em Brasília, no `datetime-local` do painel. */
const daqui = (dias, hora = "23:59") =>
  `${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + dias * 86_400_000)
  )}T${hora}`

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
  `  ⚙  Resend :${resend.porta} · Frenet :${frenet.porta ?? "?"} · Pagar.me :${pagarme.porta} · painel ${PAINEL} · Medusa ${MEDUSA}${LOJA ? ` · loja ${LOJA}` : ""}`
)
const caixa = caixaDoResend(resend)
const { navegador, novaAba, errosDeConsole } = await abrirNavegador()
// A faixa de cookies da loja já respondida (o "não"): ela cobriria o "Comprar" dos cards.
if (LOJA) comAFaixaRespondida(navegador, LOJA)

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

/** A API da loja, como a sacola e o checkout chamam (`assinado`: como o servidor da loja). */
async function loja(caminho, { metodo = "GET", corpo, assinado = false } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": CHAVE,
      ...(assinado ? { "x-loja-segredo": SEGREDO } : {}),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

let regiao = ""
/** Um carrinho vazio. Devolve o id. */
async function carrinhoVazio() {
  if (!regiao) regiao = (await loja("/store/regions")).corpo.regions[0].id
  const { corpo } = await loja("/store/carts", { metodo: "POST", corpo: { region_id: regiao } })
  return corpo.cart.id
}
const colocar = (carrinho, variante, quantidade = 1) =>
  loja(`/store/carts/${carrinho}/line-items`, {
    metodo: "POST",
    corpo: { variant_id: variante, quantity: quantidade },
  })
const marcar = (endereco, carrinho, assinado = true) =>
  loja(`/store/oferta/${endereco}/carrinho`, { metodo: "POST", corpo: { carrinho }, assinado })
const conferir = (carrinho) =>
  loja("/store/ofertas/conferir", { metodo: "POST", corpo: { carrinho }, assinado: true })

/** O carrinho: a marca e o preço de uma unidade de cada linha, por variação. */
async function lerCarrinho(id) {
  const { corpo } = await loja(`/store/carts/${id}?fields=id,metadata,*items`)
  const c = corpo.cart ?? {}
  const linhas = (c.items ?? []).map((i) => ({
    id: i.id,
    variante: i.variant_id,
    quantidade: i.quantity,
    unitario: centavos(i.unit_price),
    riscado: i.compare_at_unit_price == null ? null : centavos(i.compare_at_unit_price),
  }))
  return {
    marca: c.metadata?.fb_oferta ?? null,
    linhas,
    linha: (variante) => linhas.find((l) => l.variante === variante),
  }
}

let tokenDoDono = ""
let tokenMkt = ""
const ofertasDaRodada = new Set()
let listaDeTeste = null

/** Cria pela API do painel (marketing). Guarda o id pra encerrar no fim. */
async function criarOferta(corpo, token = tokenMkt) {
  const r = await medusa("/dashboard/ofertas", { token, corpo })
  if (r.corpo.oferta?.id) ofertasDaRodada.add(r.corpo.oferta.id)
  return r
}
const mudar = (id, acao, token = tokenMkt) =>
  medusa(`/dashboard/ofertas/${id}`, { token, corpo: { acao } })

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
  tokenMkt = cookieMkt.value
  const lerOp = await medusa("/dashboard/ofertas", { metodo: "GET", token: cookieOp.value })
  const criarOp = await criarOferta({ nome: "x" }, cookieOp.value)
  ok(
    lerOp.status === 403 && criarOp.status === 403,
    "a operação não vê nem cria oferta",
    `${lerOp.status} ${criarOp.status}`
  )

  /* ── os produtos da rodada ─────────────────────────────────────────────── */

  regiao = (await loja("/store/regions")).corpo.regions[0].id
  const { corpo: catalogo } = await loja(
    `/store/products?fields=id,handle,title,*variants,*variants.calculated_price,+variants.inventory_quantity,+variants.manage_inventory&limit=50&region_id=${regiao}`
  )
  const vendaveis = (catalogo.products ?? [])
    .filter(
      (p) =>
        p.variants?.length === 1 &&
        (p.variants[0].manage_inventory === false || p.variants[0].inventory_quantity >= 8) &&
        Number(p.variants[0].calculated_price?.calculated_amount) > 20
    )
    .map((p) => ({
      id: p.id,
      handle: p.handle,
      titulo: p.title,
      variante: p.variants[0].id,
      hoje: centavos(p.variants[0].calculated_price.calculated_amount),
    }))
  if (vendaveis.length < 3) throw new Error("preciso de 3 produtos com estoque e preço")
  const faixas = async (variante) =>
    (await loja(`/store/precos-por-quantidade?variante=${variante}`)).corpo.precos?.[variante] ?? {}
  // A: desconto grande (a oferta vence as faixas). B: desconto pequeno (a faixa de 3 vence a oferta).
  const [A, B, C] = vendaveis
  const porA = centavos(Math.floor(A.hoje * 0.75) + 0.9)
  const porB = centavos(B.hoje - 1)
  const fB = await faixas(B.variante)
  console.log(
    `  ·  A ${A.handle} ${A.hoje} → ${porA} · B ${B.handle} ${B.hoje} → ${porB} (faixas ${JSON.stringify(fB)}) · C ${C.handle} fora`
  )

  titulo("O formulário (API do painel)")
  const vazio = await criarOferta({})
  ok(
    vazio.status === 422 &&
      ["nome", "produtos", "ate"].every((c) => vazio.corpo.erros?.[c]) &&
      !vazio.corpo.erros?.endereco,
    "vazio: nome, produtos e o fim voltam marcados (o endereço sai sugerido)",
    JSON.stringify(vazio.corpo)
  )
  const caro = await criarOferta({
    nome: `Cara ${RODADA}`,
    titulo: "x",
    ate: daqui(3),
    produtos: [{ produto: A.id, por: virgula(A.hoje) }],
  })
  ok(
    caro.status === 422 && /menos que o preço de hoje/.test(caro.corpo.erros?.[`por:${A.id}`]),
    "o por igual ao preço de hoje é recusado, no campo do produto",
    JSON.stringify(caro.corpo)
  )
  const endereco = `vip-${RODADA}`
  const criada = await criarOferta({
    nome: `VIP ${RODADA}`,
    titulo: "Só pra quem tem o link",
    chamada: "Preço de amigo até domingo.",
    endereco,
    de: "",
    ate: daqui(3),
    produtos: [
      { produto: A.id, por: virgula(porA) },
      { produto: B.id, por: virgula(porB) },
    ],
  })
  const O = criada.corpo.oferta ?? {}
  ok(
    criada.status === 200 &&
      O.situacao === "no-ar" &&
      O.endereco === endereco &&
      String(O.link).endsWith(`/oferta/${endereco}`) &&
      O.produtos?.length === 2,
    "a oferta nasce no ar, com o link",
    JSON.stringify(criada.corpo)
  )
  const repetida = await criarOferta({
    nome: `Outra ${RODADA}`,
    titulo: "x",
    endereco,
    ate: daqui(3),
    produtos: [{ produto: A.id, por: virgula(porA) }],
  })
  ok(
    repetida.status === 422 && /outra oferta/.test(repetida.corpo.erros?.endereco),
    "o mesmo endereço não serve pra duas",
    JSON.stringify(repetida.corpo)
  )
  const lista = (await medusa("/dashboard/ofertas", { metodo: "GET", token: tokenMkt })).corpo
  const naLista = (lista.ofertas ?? []).find((o) => o.id === O.id)
  ok(
    naLista?.produtos?.find((p) => p.id === A.id)?.hoje === A.hoje &&
      (lista.produtos ?? []).some((p) => p.id === C.id && p.preco === C.hoje) &&
      /^[0-9a-f]{4}$/.test(lista.sorteio ?? ""),
    "a lista: a oferta com o preço de hoje de cada produto, e os produtos do formulário",
    JSON.stringify(naLista)
  )

  titulo("Só quem tem o link")
  const vitrine = await loja(
    `/store/products?id=${A.id}&fields=id,*variants.calculated_price&region_id=${regiao}`
  )
  ok(
    centavos(vitrine.corpo.products?.[0]?.variants?.[0]?.calculated_price?.calculated_amount) ===
      A.hoje,
    "a vitrine segue com o preço de sempre"
  )
  const pagina = await loja(`/store/oferta/${endereco}`)
  ok(
    pagina.status === 200 &&
      pagina.corpo.oferta?.situacao === "no-ar" &&
      pagina.corpo.oferta?.produtos?.find((p) => p.id === A.id)?.por === porA,
    "a rota da página traz os produtos com o por"
  )
  ok((await loja("/store/oferta/nao-existe-mesmo")).status === 404, "endereço que não existe: 404")
  const c1 = await carrinhoVazio()
  await colocar(c1, A.variante)
  const antes = await lerCarrinho(c1)
  ok(antes.linha(A.variante)?.unitario === A.hoje, "sem a marca, o carrinho cobra o de sempre")
  ok(
    (await marcar(endereco, c1, false)).status === 401,
    "a marca sem a assinatura da loja é recusada"
  )
  const m1 = await marcar(endereco, c1)
  const marcado = await lerCarrinho(c1)
  ok(
    m1.corpo.marcado === true &&
      marcado.marca === O.id &&
      marcado.linha(A.variante)?.unitario === porA &&
      (marcado.linha(A.variante)?.riscado ?? 0) > porA,
    "marcado, o produto que já estava na sacola passa pro por (com o riscado)",
    JSON.stringify(marcado.linhas)
  )
  ok((await marcar(endereco, c1)).corpo.marcado === false, "marcar de novo não muda nada")
  await colocar(c1, B.variante, 3)
  await colocar(c1, C.variante)
  let c = await lerCarrinho(c1)
  ok(
    c.linha(B.variante)?.unitario === centavos(Math.min(porB, fB[3] ?? porB)) &&
      c.linha(C.variante)?.unitario === C.hoje,
    "3 de B: o menor entre a oferta e a faixa de 3; C, fora da oferta, o de sempre",
    JSON.stringify(c.linhas)
  )
  await loja(`/store/carts/${c1}/line-items/${c.linha(B.variante).id}`, {
    metodo: "POST",
    corpo: { quantity: 1 },
  })
  c = await lerCarrinho(c1)
  ok(c.linha(B.variante)?.unitario === porB, "voltando pra 1 de B, o por", JSON.stringify(c.linhas))
  ok((await conferir(c1)).corpo.acabou === null, "o checkout confere: a oferta vale")
  // O "Pagar" da loja refaz a conta mandando a mesma região (`force_refresh`, entrega 0136).
  const refazer = (carrinho) =>
    loja(`/store/carts/${carrinho}`, { metodo: "POST", corpo: { region_id: regiao } })
  await refazer(c1)
  c = await lerCarrinho(c1)
  ok(
    c.linha(A.variante)?.unitario === porA && c.linha(B.variante)?.unitario === porB,
    "o Pagar refaz a conta e a oferta que vale continua",
    JSON.stringify(c.linhas)
  )

  titulo("Quem tem o link nunca paga mais que a vitrine")
  {
    // Uma promoção da vitrine abaixo do por de A (outra lista, como a de lançamento).
    const abaixo = centavos(porA - 5)
    const r = await adm("/admin/price-lists", {
      metodo: "POST",
      corpo: {
        title: `Teste vitrine ${RODADA}`,
        description: "conferir-ofertas",
        status: "active",
        prices: [{ amount: abaixo, currency_code: "brl", variant_id: A.variante }],
      },
    })
    listaDeTeste = r.corpo.price_list?.id ?? null
    ok(Boolean(listaDeTeste), "a promoção de teste nasce", JSON.stringify(r.corpo).slice(0, 200))
    // A rodada do minuto acerta a lista da oferta: espera até ela passar.
    let unitario = null
    for (let i = 0; i < 40 && unitario !== abaixo; i++) {
      await esperar(2500)
      const cx = await carrinhoVazio()
      await marcar(endereco, cx)
      await colocar(cx, A.variante)
      unitario = (await lerCarrinho(cx)).linha(A.variante)?.unitario ?? null
    }
    ok(
      unitario === abaixo,
      `com a vitrine em ${reais(abaixo)}, o carrinho da oferta também (a rodada do minuto)`,
      String(unitario)
    )
    if (listaDeTeste) await adm(`/admin/price-lists/${listaDeTeste}`, { metodo: "DELETE" })
    listaDeTeste = null
  }

  titulo("Pausada, ligada, agendada e encerrada")
  ok((await mudar(O.id, "pausar", cookieOp.value)).status === 403, "a operação não pausa")
  const pausada = await mudar(O.id, "pausar")
  const paginaPausada = await loja(`/store/oferta/${endereco}`)
  ok(
    pausada.corpo.oferta?.situacao === "pausada" &&
      paginaPausada.corpo.oferta?.situacao === "pausada" &&
      paginaPausada.corpo.oferta?.produtos?.length === 0,
    "pausada: a página vem sem os produtos"
  )
  const c2 = await carrinhoVazio()
  ok((await marcar(endereco, c2)).status === 409, "pausada, a marca é recusada")
  // Quem estava no checkout na hora da pausa: o "Pagar" refaz a conta antes de cobrar.
  await refazer(c1)
  const noPagar = await lerCarrinho(c1)
  ok(
    noPagar.marca === O.id && noPagar.linha(A.variante)?.unitario === A.hoje,
    "pausada, o Pagar já cobra o preço de sempre (com a marca, a lista não acha preço)",
    JSON.stringify(noPagar)
  )
  const conferido = await conferir(c1)
  c = await lerCarrinho(c1)
  ok(
    conferido.corpo.acabou === "Só pra quem tem o link" &&
      c.marca === null &&
      c.linha(A.variante)?.unitario === A.hoje &&
      c.linha(B.variante)?.unitario === B.hoje,
    "o checkout da sacola marcada: diz que acabou, tira a marca e volta o preço de sempre",
    `${JSON.stringify(conferido.corpo)} ${JSON.stringify(c)}`
  )
  ok((await conferir(c1)).corpo.acabou === null, "e na próxima abertura não diz de novo")
  const ligada = await mudar(O.id, "ligar")
  const m2 = await marcar(endereco, c1)
  ok(
    ligada.corpo.oferta?.situacao === "no-ar" &&
      m2.corpo.marcado === true &&
      (await lerCarrinho(c1)).linha(A.variante)?.unitario === porA,
    "ligada de novo: vende outra vez"
  )
  const enderecoAgendada = `agendada-${RODADA}`
  const agendada = await criarOferta({
    nome: `Agendada ${RODADA}`,
    titulo: "Começa depois",
    endereco: enderecoAgendada,
    de: daqui(2, "10:00"),
    ate: daqui(5),
    produtos: [{ produto: C.id, por: virgula(centavos(C.hoje - 10)) }],
  })
  const G = agendada.corpo.oferta ?? {}
  const c3 = await carrinhoVazio()
  ok(
    G.situacao === "agendada" &&
      (await marcar(enderecoAgendada, c3)).status === 409 &&
      (await loja(`/store/oferta/${enderecoAgendada}`)).corpo.oferta?.situacao === "agendada",
    "agendada: a página diz quando começa, e a marca é recusada"
  )
  const encerrada = await mudar(G.id, "encerrar")
  ok(
    encerrada.corpo.oferta?.situacao === "encerrada" &&
      (await mudar(G.id, "ligar")).status === 409 &&
      (await loja(`/store/oferta/${enderecoAgendada}`)).corpo.oferta?.produtos?.length === 0,
    "encerrada: não liga mais, e a página vem sem os produtos"
  )

  titulo("O pedido e a lista")
  {
    const pedido = await fabrica.pedidoPix(`oferta.${RODADA}@teste.com`, [[A.handle, 1]], {
      aoCriar: async (carrinho) => {
        const r = await marcar(endereco, carrinho)
        if (r.status !== 200) throw new Error(`a marca no carrinho do pedido: ${r.status}`)
      },
    })
    const { corpo } = await adm(`/admin/orders/${pedido.id}?fields=id,metadata,*items`)
    ok(
      corpo.order?.metadata?.fb_oferta === O.id &&
        centavos(corpo.order?.items?.[0]?.unit_price) === porA,
      "o pedido leva a marca da oferta, e o produto pelo por",
      JSON.stringify(corpo.order?.metadata)
    )
    const depois = (await medusa("/dashboard/ofertas", { metodo: "GET", token: tokenMkt })).corpo
    ok(
      (depois.ofertas ?? []).find((o) => o.id === O.id)?.vendas?.pedidos === 1,
      "a lista conta o pedido",
      JSON.stringify((depois.ofertas ?? []).find((o) => o.id === O.id)?.vendas)
    )
  }

  titulo("A tela do marketing")
  {
    const { pagina: p } = mkt
    await p.goto(`${PAINEL}/cupons`)
    await p.waitForSelector("[data-ofertas]")
    await hidratado(p, "[data-nova-oferta]")
    const linhaDe = (e) => p.locator(`[data-oferta="${e}"]`)
    await linhaDe(endereco).waitFor()
    const texto = semEspaco(await linhaDe(endereco).textContent())
    ok(
      /No ar/.test(texto) &&
        texto.includes(`/oferta/${endereco}`) &&
        texto.includes("1 pedido") &&
        (await linhaDe(endereco).locator(`[data-copiar-oferta="${endereco}"]`).count()) === 1 &&
        /Encerrada/.test(semEspaco(await linhaDe(enderecoAgendada).textContent())),
      "a lista: no ar com o link pra copiar e o pedido; a encerrada, sem chave",
      texto
    )
    await p.locator("[data-nova-oferta]").click()
    const form = p.locator("[data-form-oferta]")
    await form.waitFor()
    await form.locator('button[type="submit"]').click()
    const marcadoNome = await form
      .locator('[data-campo-oferta="nome"][aria-invalid="true"]')
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    ok(marcadoNome, "sem nome, o campo volta marcado")
    const nomeT = `Tela ${RODADA}`
    await form.locator('[data-campo-oferta="nome"]').fill(nomeT)
    const enderecoT = await form.locator('[data-campo-oferta="endereco"]').inputValue()
    ok(
      enderecoT.startsWith(`tela-${RODADA}-`) && /-[0-9a-f]{4}$/.test(enderecoT),
      "o endereço sai do nome, com 4 letras no fim",
      enderecoT
    )
    await form.locator(`[data-marcar-produto="${C.titulo}"]`).check()
    const porC = centavos(C.hoje - 10)
    await form.locator(`[data-por-produto="${C.titulo}"]`).fill(virgula(porC))
    const previa = semEspaco(await form.locator("[data-previa-oferta]").textContent())
    ok(
      previa.includes(`${C.titulo} por ${reais(porC)}`) && previa.includes(reais(C.hoje)),
      "a prévia diz o preço na oferta e o da loja",
      previa
    )
    const aviso = await avisoDoClique(p, () => form.locator('button[type="submit"]').click())
    await linhaDe(enderecoT).waitFor({ timeout: 15000 })
    const T = (
      (await medusa("/dashboard/ofertas", { metodo: "GET", token: tokenMkt })).corpo.ofertas ?? []
    ).find((o) => o.endereco === enderecoT)
    if (T?.id) ofertasDaRodada.add(T.id)
    ok(
      /criada/.test(aviso) && (await p.locator("[data-form-oferta]").count()) === 0 && T,
      "criada pela gaveta: o aviso, a gaveta fecha, e a oferta entra na lista",
      aviso
    )
    await avisoDoClique(p, () => linhaDe(enderecoT).locator("[data-chave-oferta]").click())
    await p.waitForFunction(
      (e) => /Pausada/.test(document.querySelector(`[data-oferta="${e}"]`)?.textContent ?? ""),
      enderecoT,
      { timeout: 15000 }
    )
    ok(
      (await loja(`/store/oferta/${enderecoT}`)).corpo.oferta?.situacao === "pausada",
      "a chave pausa, na tela e na loja"
    )
    await linhaDe(enderecoT).locator(`[data-encerrar-oferta="${enderecoT}"]`).click()
    const fim = await avisoDoClique(p, () =>
      linhaDe(enderecoT).locator(`[data-encerrar-oferta-sim="${enderecoT}"]`).click()
    )
    await p.waitForFunction(
      (e) => /Encerrada/.test(document.querySelector(`[data-oferta="${e}"]`)?.textContent ?? ""),
      enderecoT,
      { timeout: 15000 }
    )
    ok(/encerrada/i.test(fim), "o Encerrar pede confirmação e encerra", fim)

    const cel = await novaAba({ width: 390, height: 844 })
    await entrarPelaTela(cel, DONO, caixa)
    await cel.pagina.goto(`${PAINEL}/cupons`)
    await cel.pagina.waitForSelector("[data-ofertas]")
    const semRolagem = await semRolagemDeLado(cel.pagina)
    await hidratado(cel.pagina, "[data-nova-oferta]")
    await cel.pagina.locator("[data-nova-oferta]").click()
    await cel.pagina.locator("[data-form-oferta]").waitFor()
    await cel.pagina.locator(`[data-marcar-produto="${A.titulo}"]`).check()
    ok(
      semRolagem && (await semRolagemDeLado(cel.pagina)),
      "no celular, sem rolagem de lado (a lista e a gaveta)"
    )
  }

  /* ── a loja ────────────────────────────────────────────────────────────── */

  if (LOJA) {
    titulo("Na loja")
    const { pagina: p, contexto } = await novaAba()
    await p.goto(`${LOJA}/oferta/${endereco}`, { waitUntil: "load" })
    // O streaming deixa uma cópia escondida até o React trocar: só a que aparece conta.
    await p.waitForSelector(".oferta__titulo:visible")
    ok(
      semEspaco(await p.locator(".oferta__titulo:visible").textContent()) ===
        "Só pra quem tem o link" &&
        semEspaco(await p.locator(".oferta__chamada:visible").textContent()) ===
          "Preço de amigo até domingo.",
      "o título e a frase do painel"
    )
    const robots = await p.locator('meta[name="robots"]').getAttribute("content")
    ok(/noindex/.test(robots ?? ""), "a página não vai pro Google (noindex)", robots ?? "")
    await p.waitForFunction(
      () =>
        /\d/.test(document.querySelector("[data-prazo-oferta] .offers__num")?.textContent ?? ""),
      undefined,
      { timeout: 15000 }
    )
    ok(true, "o contador conta até o fim")
    const cardA = p.locator("article.produto:visible", { hasText: A.titulo })
    const cardB = p.locator("article.produto:visible", { hasText: B.titulo })
    ok(
      semEspaco(await cardA.locator(".produto__por").textContent()) === reais(porA) &&
        semEspaco(await cardB.locator(".produto__por").textContent()) === reais(porB) &&
        semEspaco(await cardA.locator(".produto__selo[data-promocao]").textContent()) ===
          "Oferta" &&
        (await p.locator("article.produto:visible").count()) === 2,
      "os dois cards, com o por e o selo da oferta"
    )
    ok(
      (await cardA.locator(`a[href="/produtos/${A.handle}"]`).count()) === 0,
      "o card da oferta não leva pra página do produto (lá o preço é o de sempre)"
    )
    await hidratado(p, "article.produto .produto__comprar")
    await cardA.locator(".produto__comprar").click()
    const gaveta = p.locator("#carrinho-gaveta")
    await gaveta.locator(".sacolinha__item").first().waitFor({ timeout: 30000 })
    await p.waitForFunction(
      () => !document.querySelector("#carrinho-gaveta .sacolinha__item[data-mexendo]"),
      undefined,
      { timeout: 30000 }
    )
    await esperar(800)
    const parcial = semEspaco(await gaveta.locator(".sacolinha__parcial").first().textContent())
    const cookieDoCarrinho = (await contexto.cookies()).find((k) => k.name === "carrinho")?.value
    const daSacola = cookieDoCarrinho ? await lerCarrinho(cookieDoCarrinho) : null
    ok(
      parcial === reais(porA) && daSacola?.marca === O.id,
      "o Comprar põe na sacola pelo por, com o carrinho marcado",
      `${parcial} ${JSON.stringify(daSacola)}`
    )
    await p.goto(`${LOJA}/produtos/${A.handle}`, { waitUntil: "load" })
    await p.waitForSelector(".compra__por")
    ok(
      semEspaco(await p.locator(".compra__por").first().textContent()) === reais(A.hoje),
      "a página do produto mostra o preço de sempre"
    )
    await p.goto(`${LOJA}/oferta/nao-existe-mesmo`, { waitUntil: "load" })
    ok(
      /Essa página não existe/.test(semEspaco(await p.locator("h1").first().textContent())),
      "endereço que não existe: a página de não encontrado"
    )
    // Pausada pelo painel: a página refeita na hora diz que acabou.
    await mudar(O.id, "pausar")
    let acabou = false
    for (let i = 0; i < 15 && !acabou; i++) {
      await p.goto(`${LOJA}/oferta/${endereco}`, { waitUntil: "load" })
      acabou = await p
        .locator('[data-oferta-situacao="pausada"]')
        .waitFor({ timeout: 3000 })
        .then(() => true)
        .catch(() => false)
    }
    ok(
      acabou && (await p.locator("article.produto:visible").count()) === 0,
      "pausada: a página diz que acabou, sem os produtos"
    )
    await p.goto(`${LOJA}/checkout`, { waitUntil: "load" })
    const avisoDoCheckout = await p
      .locator("[data-oferta-acabou]")
      .textContent({ timeout: 30000 })
      .catch(() => "")
    const voltou = cookieDoCarrinho ? await lerCarrinho(cookieDoCarrinho) : null
    ok(
      /acabou/.test(avisoDoCheckout) &&
        voltou?.marca === null &&
        voltou?.linha(A.variante)?.unitario === A.hoje,
      "o checkout avisa que a oferta acabou, e o produto volta pro preço de sempre",
      `${semEspaco(avisoDoCheckout)} ${JSON.stringify(voltou)}`
    )
    await mudar(O.id, "ligar")
    const cel = await novaAba({ width: 390, height: 844 })
    await cel.pagina.goto(`${LOJA}/oferta/${endereco}`, { waitUntil: "load" })
    await cel.pagina.waitForSelector("article.produto", { timeout: 30000 })
    ok(await semRolagemDeLado(cel.pagina), "no celular, a página da oferta sem rolagem de lado")
  }

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.join(" | "))
} catch (e) {
  falhou(`o conferidor quebrou: ${e instanceof Error ? e.stack : e}`)
} finally {
  if (listaDeTeste) await adm(`/admin/price-lists/${listaDeTeste}`, { metodo: "DELETE" })
  // As ofertas da rodada, encerradas pelo painel (ficam no banco, como as de qualquer loja).
  for (const id of ofertasDaRodada) if (tokenMkt) await mudar(id, "encerrar")
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
  await frenet.fechar?.()
  await pagarme.fechar?.()
}

process.exit(resumo())
