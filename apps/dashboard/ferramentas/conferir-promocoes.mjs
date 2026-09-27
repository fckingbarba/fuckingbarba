/**
 * CONFERIDOR DAS PROMOÇÕES DO PAINEL — o "Leve X, pague Y" (entrega 0133):
 * a promoção criada pelo painel, conferida no CARRINHO DE VERDADE (a API da
 * loja, como a sacola faz), no desconto por quantidade, na tela do painel e —
 * com a loja no ar (`LOJA`) — no card, na página do produto e na sacola.
 *
 *   (Medusa apontando pros falsos e com o LOJA_URL da loja conferida; painel no ar)
 *   node apps/dashboard/ferramentas/conferir-promocoes.mjs
 *
 * Variáveis: as de `pecas.mjs`, e mais NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 * ADMIN_EMAIL e ADMIN_SENHA (o admin LOCAL: apagar as promoções e os cupons
 * da rodada no fim), MEDUSA_WEBHOOK_SEGREDO, PORTA_FALSA e
 * PORTA_PAGARME_FALSO; LOJA (opcional: sem ela, a parte da loja não roda).
 *
 * As promoções e os cupons da rodada saem no fim (pausadas antes, pelo
 * painel: é a pausa que devolve os produtos às faixas de quantidade na hora);
 * o pedido Pix fica no banco local, como nos outros conferidores; os membros
 * saem da equipe.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • a promoção que não dá de graça com 3, ou dá com 2; que para na       │
 * │   primeira (6 unidades, uma só de graça — o `max_quantity` do Medusa); │
 * │   que desconta produto de fora dela;                                   │
 * │ • o desconto por quantidade SOMANDO com ela (a loja decidiu que não);  │
 * │   a faixa de 2 sumindo num "leve 3" (o cartão de 2 da PDP é dela —     │
 * │   entrega 0142); o produto que não volta pras faixas quando ela pausa; │
 * │ • o cupom que não combina descontando o item da promoção; o "um cupom  │
 * │   por pedido" recusando cupom por causa do código da promoção;         │
 * │ • a pausada ou a agendada que dá desconto; a agendada na loja;         │
 * │ • a lista contando errado (pedidos, desconto); o código da promoção    │
 * │   aparecendo como cupom (no painel e no Marketing);                    │
 * │ • o formulário: campo errado sem voltar marcado, a prévia mentindo;    │
 * │ • a loja: o selo que não aparece (ou fica depois da pausa), o "-X%"    │
 * │   que some do card com ele (entrega 0142), o cartão de 2 que some, o   │
 * │   de 3 com preço errado, a sacola sem o recado ou com o total errado,  │
 * │   ou dizendo "sai de graça" pra terceira que custa a diferença da      │
 * │   faixa de 2;                                                          │
 * │ • rolagem de lado no celular; erro no console.                         │
 * └────────────────────────────────────────────────────────────────────────┘
 */

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
const sufixo = RODADA.toUpperCase()
const nomeDa = (letra) => `${letra} ${RODADA}`
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
  `  ⚙  Resend :${resend.porta} · Frenet :${frenet.porta ?? "?"} · Pagar.me :${pagarme.porta} · painel ${PAINEL} · Medusa ${MEDUSA}${LOJA ? ` · loja ${LOJA}` : ""}`
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

/** A API da loja, como a sacola e o checkout chamam. */
async function loja(caminho, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: { "content-type": "application/json", "x-publishable-api-key": CHAVE },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

let regiao = ""
/** Um carrinho com estes itens (`[variante, quantidade]`). Devolve o id. */
async function carrinho(itens) {
  if (!regiao) regiao = (await loja("/store/regions")).corpo.regions[0].id
  const { corpo } = await loja("/store/carts", { metodo: "POST", corpo: { region_id: regiao } })
  for (const [variante, quantidade] of itens)
    await loja(`/store/carts/${corpo.cart.id}/line-items`, {
      metodo: "POST",
      corpo: { variant_id: variante, quantity: quantidade },
    })
  return corpo.cart.id
}

const CAMPOS =
  "fields=id,discount_total,*promotions,*items,items.adjustments.code,items.adjustments.amount"

/** O que o Medusa fez no carrinho: os códigos, o desconto e o de cada linha, por código. */
async function lerCarrinho(id) {
  const { corpo } = await loja(`/store/carts/${id}?${CAMPOS}`)
  const c = corpo.cart ?? {}
  const linhas = (c.items ?? []).map((i) => ({
    id: i.id,
    variante: i.variant_id,
    quantidade: i.quantity,
    unitario: centavos(i.unit_price),
    ajustes: Object.fromEntries(
      Object.entries(
        (i.adjustments ?? []).reduce((m, a) => {
          m[a.code] = (m[a.code] ?? 0) + Number(a.amount ?? 0)
          return m
        }, {})
      ).map(([k, v]) => [k, centavos(v)])
    ),
  }))
  return {
    codigos: (c.promotions ?? []).map((p) => p.code),
    desconto: centavos(c.discount_total),
    linhas,
    linha: (variante) => linhas.find((l) => l.variante === variante),
  }
}

/** Quanto a promoção deu de graça no carrinho (a soma dos ajustes do código dela). */
const gratisNo = (carrinhoLido, codigo) =>
  centavos(carrinhoLido.linhas.reduce((s, l) => s + (l.ajustes[codigo] ?? 0), 0))

/** O preço de UMA unidade levando 1, 2 e 3 (a mesma pergunta da página do produto). */
async function faixas(variante) {
  const { corpo } = await loja(`/store/precos-por-quantidade?variante=${variante}`)
  return corpo.precos?.[variante] ?? {}
}

let tokenDoDono = ""
let tokenMkt = ""
const promocoesDaRodada = new Set()
/** O preço da "Promoção de lançamento" que o teste do "não combina" tirou, pra devolver no fim. */
let devolverPromocao = null

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
  const criarOp = await medusa("/dashboard/promocoes", {
    token: cookieOp.value,
    corpo: { nome: "x", comprando: "3", pague: "2", aplicarA: "loja" },
  })
  ok(criarOp.status === 403, "a operação não cria promoção", String(criarOp.status))

  /* ── os produtos da rodada ─────────────────────────────────────────────── */

  const { corpo: catalogo } = await loja(
    "/store/products?fields=id,handle,title,*variants,+variants.inventory_quantity,+variants.manage_inventory&limit=50"
  )
  /**
   * Dois produtos de uma variação só, com estoque pra 6 (a sacola do teste
   * leva 6) — os mais baratos: 3 do primeiro precisam caber abaixo do piso do
   * frete grátis, onde o cupom que não combina ainda vale.
   */
  const { corpo: regioes } = await loja("/store/regions")
  regiao = regioes.regions[0].id
  const { corpo: comPreco } = await loja(
    `/store/products?fields=id,*variants.calculated_price&limit=50&region_id=${regiao}`
  )
  const precoDe = new Map(
    (comPreco.products ?? []).map((p) => [
      p.id,
      Number(p.variants?.[0]?.calculated_price?.calculated_amount ?? Infinity),
    ])
  )
  /** O "-X%" que o card mostra (o de/por), ou null — a conta do `CartaoProduto`. */
  const descontoDo = (id) => {
    const preco = (comPreco.products ?? []).find((p) => p.id === id)?.variants?.[0]
      ?.calculated_price
    const atual = Number(preco?.calculated_amount)
    const cheio = Number(preco?.original_amount)
    return cheio > atual ? Math.round((1 - atual / cheio) * 100) : null
  }
  const vendaveis = (catalogo.products ?? [])
    .filter(
      (p) =>
        p.variants?.length === 1 &&
        (!p.variants[0].manage_inventory || (p.variants[0].inventory_quantity ?? 0) >= 6)
    )
    .sort((a, b) => (precoDe.get(a.id) ?? Infinity) - (precoDe.get(b.id) ?? Infinity))
  const [A, B] = vendaveis
  if (!A || !B) throw new Error("o banco local precisa de 2 produtos com estoque pra 6")
  const vA = A.variants[0].id
  const vB = B.variants[0].id

  /* ── a promoção, pela API do painel ─────────────────────────────────────── */

  titulo("A promoção (API do painel)")
  const criar = (corpo, token = tokenMkt) => medusa("/dashboard/promocoes", { token, corpo })
  const errada = await criar({
    nome: "  ",
    comprando: "3",
    pague: "3",
    aplicarA: "produtos",
    alvos: [],
    data: "periodo",
    de: `${diaDaqui(2)}T00:00`,
    ate: `${diaDaqui(1)}T00:00`,
  })
  ok(
    errada.status === 422 &&
      ["nome", "pague", "alvos", "ate"].every((c) => errada.corpo.erros?.[c]),
    "campo a campo: sem nome, pagando o que leva, sem produto, fim antes do começo",
    `${errada.status} ${JSON.stringify(errada.corpo)}`
  )
  const r1 = await criar({
    nome: nomeDa("P"),
    comprando: "3",
    pague: "2",
    aplicarA: "produtos",
    alvos: [A.id],
    data: "ilimitado",
    etiqueta: "",
  })
  const P = r1.corpo.promocao ?? {}
  if (P.id) promocoesDaRodada.add(P.id)
  ok(
    r1.status === 200 &&
      /^PROMO-[0-9A-F]{8}$/.test(P.codigo ?? "") &&
      P.etiqueta === "Leve 3, pague 2" &&
      P.situacao === "valendo" &&
      P.descricao === `Leve 3, pague 2 em ${A.title}` &&
      P.regra === "sem data de fim",
    "criada: código PROMO- sorteado, a etiqueta padrão, valendo, em frase",
    JSON.stringify(r1.corpo)
  )

  /* ── no carrinho ───────────────────────────────────────────────────────── */

  titulo("No carrinho: o Medusa dá de graça")
  const fA = await faixas(vA)
  const umaDeA = fA[1]
  const c2 = await lerCarrinho(await carrinho([[vA, 2]]))
  const c3 = await lerCarrinho(await carrinho([[vA, 3]]))
  const c5 = await lerCarrinho(await carrinho([[vA, 5]]))
  const c6 = await lerCarrinho(await carrinho([[vA, 6]]))
  ok(
    !c2.codigos.includes(P.codigo) &&
      gratisNo(c2, P.codigo) === 0 &&
      c2.linha(vA)?.unitario === centavos(fA[2]),
    "2 unidades: nada de graça, e a faixa de 2 continua",
    `${JSON.stringify(c2)} faixa=${fA[2]}`
  )
  ok(
    c3.codigos.includes(P.codigo) &&
      gratisNo(c3, P.codigo) === centavos(umaDeA) &&
      c3.linha(vA)?.unitario === centavos(umaDeA),
    "3 unidades: uma de graça, pelo preço de UMA (fora das faixas)",
    `${JSON.stringify(c3.linhas)} uma=${umaDeA}`
  )
  ok(
    gratisNo(c5, P.codigo) === centavos(umaDeA) && gratisNo(c6, P.codigo) === centavos(2 * umaDeA),
    "5 unidades: uma; 6: duas (não para na primeira)",
    `${gratisNo(c5, P.codigo)} ${gratisNo(c6, P.codigo)}`
  )
  const cMisto = await lerCarrinho(
    await carrinho([
      [vA, 3],
      [vB, 3],
    ])
  )
  ok(
    gratisNo(cMisto, P.codigo) === centavos(umaDeA) &&
      Object.keys(cMisto.linha(vB)?.ajustes ?? {}).length === 0,
    "só o produto da promoção: as 3 do outro não ganham nada",
    JSON.stringify(cMisto.linhas)
  )

  titulo("Não soma com o desconto por quantidade")
  const fB = await faixas(vB)
  ok(
    fA[2] < fA[1] && fA[3] === fA[1],
    "o produto da promoção sai da faixa de 3 ou mais, e fica na de 2 (acaba antes do 3)",
    JSON.stringify(fA)
  )
  ok(fB[2] < fB[1] && fB[3] < fB[2], "o de fora continua nas faixas", JSON.stringify(fB))
  const doCatalogo = (await loja("/store/promocoes")).corpo.promocoes ?? []
  const naLoja = doCatalogo.find((p) => p.codigo === P.codigo)
  ok(
    naLoja?.etiqueta === "Leve 3, pague 2" &&
      naLoja.comprando === 3 &&
      naLoja.pague === 2 &&
      JSON.stringify(naLoja.produtos) === JSON.stringify([A.id]) &&
      naLoja.ate === null,
    "a loja sabe: GET /store/promocoes traz a promoção com o produto",
    JSON.stringify(doCatalogo)
  )

  /* ── os cupons junto ───────────────────────────────────────────────────── */

  titulo("Cupom junto com a promoção")
  const S = `S${sufixo}`
  const C = `C${sufixo}`
  for (const [codigo, combina] of [
    [S, false],
    [C, true],
  ]) {
    const r = await medusa("/dashboard/cupons", {
      token: tokenMkt,
      corpo: { codigo, tipo: "porcento", valor: "10", combina },
    })
    ok(r.status === 200, `cupom ${combina ? "que combina" : "que não combina"} criado`)
  }
  const aplicar = async (codigo) => {
    const id = await carrinho([
      [vA, 3],
      [vB, 1],
    ])
    const r = await loja(`/store/carts/${id}/promotions`, {
      metodo: "POST",
      corpo: { promo_codes: [codigo] },
    })
    return { status: r.status, ...(await lerCarrinho(id)) }
  }
  const comC = await aplicar(C)
  ok(
    comC.status === 200 && comC.codigos.includes(C) && comC.codigos.includes(P.codigo),
    '"um cupom por pedido" não confunde o código da promoção com outro cupom',
    `${comC.status} ${JSON.stringify(comC.codigos)}`
  )
  ok(
    comC.linha(vA)?.ajustes[C] === centavos(2 * umaDeA * 0.1) &&
      comC.linha(vA)?.ajustes[P.codigo] === centavos(umaDeA),
    "o que combina desconta o que sobrou: 10% das duas pagas",
    JSON.stringify(comC.linhas)
  )
  /*
    O QUE NÃO COMBINA não desconta produto com preço promocional (o de/por) e
    não vale no pedido que já ganhou o frete grátis da loja (0128) — e agora
    também não desconta o item de uma promoção que disparou. Pra ver só isso:
    um produto X de preço cheio (sai da "Promoção de lançamento" do banco
    local durante o teste, e volta no fim), um "leve 2, pague 1" nele, e
    tudo abaixo do piso: com 1 o cupom desconta; com 2 (disparou), não tem o
    que descontar, e não entra.
  */
  const { corpo: cfg } = await loja("/store/configuracoes")
  const piso = Number(cfg.configuracoes?.frete?.piso ?? 0)
  const X = vendaveis.find((p) => p.handle === "shampoo-para-barba") ?? vendaveis[2]
  const lancamento = X
    ? (await adm("/admin/price-lists?limit=50&fields=id,title")).corpo.price_lists?.find((l) =>
        /lançamento/i.test(l.title)
      )
    : null
  if (lancamento) {
    const { corpo: lista } = await adm(
      `/admin/price-lists/${lancamento.id}?fields=prices.id,prices.amount,prices.currency_code,prices.price_set.variant.id`
    )
    const preco = (lista.price_list?.prices ?? []).find((x) => x.variant_id === X.variants[0].id)
    if (preco) {
      const r = await adm(`/admin/price-lists/${lancamento.id}/prices/batch`, {
        metodo: "POST",
        corpo: { delete: [preco.id] },
      })
      if (r.status === 200)
        devolverPromocao = {
          lista: lancamento.id,
          variant_id: X.variants[0].id,
          amount: preco.amount,
          currency_code: preco.currency_code ?? "brl",
        }
    }
  }
  const vX = X?.variants?.[0]?.id
  const cheioDeX = vX ? (await faixas(vX))[1] : Infinity
  if (!X || (cfg.configuracoes?.frete?.modo === "gratis" && 2 * cheioDeX >= piso)) {
    console.log(`  ⚠  sem produto de preço cheio abaixo do piso: o "não combina" fica de fora`)
  } else {
    const rX = await criar({
      nome: nomeDa("X"),
      comprando: "2",
      pague: "1",
      aplicarA: "produtos",
      alvos: [X.id],
    })
    const PX = rX.corpo.promocao ?? {}
    if (PX.id) promocoesDaRodada.add(PX.id)
    const comS = async (quantidade) => {
      const id = await carrinho([[vX, quantidade]])
      const r = await loja(`/store/carts/${id}/promotions`, {
        metodo: "POST",
        corpo: { promo_codes: [S] },
      })
      return { status: r.status, ...(await lerCarrinho(id)) }
    }
    const com1 = await comS(1)
    const com2 = await comS(2)
    ok(
      com1.linha(vX)?.ajustes[S] === centavos(cheioDeX * 0.1) &&
        !com2.codigos.includes(S) &&
        !com2.linha(vX)?.ajustes[S] &&
        com2.linha(vX)?.ajustes[PX.codigo] === centavos(cheioDeX),
      "o cupom que não combina desconta 1 (a promoção não disparou), e não o item dela com 2",
      JSON.stringify({ com1: com1.linhas, com2: [com2.codigos, com2.linhas] })
    )
  }

  titulo("O pedido e a lista")
  const pedido = await fabrica.pedidoPix(`promo.${RODADA}@teste.fuckingbarba.dev`, [[A.handle, 3]])
  ok(Boolean(pedido?.id), "um pedido Pix com 3 unidades", JSON.stringify(pedido))
  const lista = (await medusa("/dashboard/cupons", { metodo: "GET", token: tokenMkt })).corpo
  const naLista = (lista.promocoes ?? []).find((p) => p.codigo === P.codigo)
  ok(
    naLista?.pedidos === 1 && naLista.desconto === centavos(umaDeA),
    "a lista conta o pedido e o desconto da promoção",
    JSON.stringify(naLista)
  )
  ok(
    !(lista.cupons ?? []).some((c) => c.codigo.startsWith("PROMO-")) &&
      /Leve X, pague Y/.test(
        (lista.automaticos ?? []).find((d) => d.id === "quantidade")?.texto ?? ""
      ),
    "a promoção não aparece como cupom; o desconto por quantidade avisa que não soma",
    JSON.stringify(lista.automaticos)
  )

  /* ── a chave e a data ───────────────────────────────────────────────────── */

  titulo("Pausada, agendada e ligada de novo")
  const pausa = await medusa(`/dashboard/promocoes/${P.id}`, {
    token: tokenMkt,
    corpo: { acao: "pausar" },
  })
  const cPausa = await lerCarrinho(await carrinho([[vA, 3]]))
  const fPausa = await faixas(vA)
  ok(
    pausa.status === 200 &&
      gratisNo(cPausa, P.codigo) === 0 &&
      fPausa[2] < fPausa[1] &&
      fPausa[3] < fPausa[2],
    "pausada: nada de graça, e o produto volta pra faixa de 3 na hora",
    `${pausa.status} ${JSON.stringify(cPausa.linhas)} ${JSON.stringify(fPausa)}`
  )
  const semNaLoja = ((await loja("/store/promocoes")).corpo.promocoes ?? []).some(
    (p) => p.codigo === P.codigo
  )
  ok(!semNaLoja, "pausada, some da lista da loja")
  const ligar = await medusa(`/dashboard/promocoes/${P.id}`, {
    token: tokenMkt,
    corpo: { acao: "ligar" },
  })
  const cVolta = await lerCarrinho(await carrinho([[vA, 3]]))
  ok(
    ligar.status === 200 && gratisNo(cVolta, P.codigo) === centavos(umaDeA),
    "ligada de novo, vale de novo",
    JSON.stringify(cVolta.linhas)
  )
  const r2 = await criar({
    nome: nomeDa("A"),
    comprando: "2",
    pague: "1",
    aplicarA: "produtos",
    alvos: [B.id],
    data: "periodo",
    de: `${diaDaqui(1)}T00:00`,
    ate: `${diaDaqui(8)}T23:59`,
  })
  const Agendada = r2.corpo.promocao ?? {}
  if (Agendada.id) promocoesDaRodada.add(Agendada.id)
  const cAgendada = await lerCarrinho(await carrinho([[vB, 2]]))
  ok(
    Agendada.situacao === "agendado" &&
      gratisNo(cAgendada, Agendada.codigo) === 0 &&
      !((await loja("/store/promocoes")).corpo.promocoes ?? []).some(
        (p) => p.codigo === Agendada.codigo
      ),
    "a agendada não vale antes do começo, nem aparece na loja",
    JSON.stringify({ r2: r2.corpo, c: cAgendada.linhas })
  )
  const pausarDeOutro = await medusa(`/dashboard/promocoes/promo_01XXXXXXXXXXXXXXXXXXXXXX`, {
    token: tokenMkt,
    corpo: { acao: "pausar" },
  })
  ok(pausarDeOutro.status === 404, "a chave não mexe no que não é promoção do painel")

  /* ── a tela ────────────────────────────────────────────────────────────── */

  titulo("A tela do marketing")
  {
    const { pagina } = mkt
    await pagina.goto(`${PAINEL}/cupons`)
    await pagina.waitForSelector("[data-promocoes]")
    await hidratado(pagina, "[data-nova-promocao]")
    const linhaDe = (codigo) => pagina.locator(`[data-promocao="${codigo}"]`)
    ok(
      /Valendo/.test(await linhaDe(P.codigo).textContent()) &&
        /Agendada/.test(await linhaDe(Agendada.codigo).textContent()) &&
        (await linhaDe(P.codigo).locator(".chave").count()) === 1,
      "a lista: a que vale e a agendada, com a chave"
    )
    await pagina.locator("[data-nova-promocao]").click()
    const form = pagina.locator("[data-form-promocao]")
    await form.waitFor()
    await form.locator('button[type="submit"]').click()
    const marcado = await form
      .locator('[data-campo="nome"][aria-invalid="true"]')
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    ok(marcado, "sem nome, o campo volta marcado")
    await form.locator('[data-campo="nome"]').fill(nomeDa("T"))
    await form.locator('[data-campo="comprando"]').fill("4")
    await form.locator('[data-campo="pague"]').fill("2")
    ok(
      semEspaco(await form.locator("[data-conta]").textContent()).startsWith(
        "A cada 4 unidades, 2 são pagas e as 2 mais baratas saem de graça."
      ),
      "a conta em uma frase, embaixo do Comprando e do Pague"
    )
    await form.locator(`[data-alvo="${B.title}"]`).check()
    await form.locator('[data-campo="promocional"]').uncheck()
    await form.locator('[data-campo="etiqueta"]').fill("4 por 2")
    const previa = semEspaco(await form.locator("[data-previa-promocao]").textContent())
    ok(
      previa === `Leve 4, pague 2 em ${B.title} · sem data de fim · fora do preço promocional`,
      "a prévia diz a promoção inteira, antes de criar",
      previa
    )
    // O aviso é lido quando entra: a lista refeita pode chegar depois de ele sumir (6 s).
    const criada = await avisoDoClique(pagina, () => form.locator('button[type="submit"]').click())
    const naApi = (await medusa("/dashboard/cupons", { metodo: "GET", token: tokenMkt })).corpo
    const T = (naApi.promocoes ?? []).find((p) => p.nome === nomeDa("T")) ?? {}
    if (T.id) promocoesDaRodada.add(T.id)
    await linhaDe(T.codigo).waitFor({ timeout: 15000 })
    ok(
      /criada/.test(criada) &&
        (await pagina.locator("[data-form-promocao]").count()) === 0 &&
        T.etiqueta === "4 por 2" &&
        T.regra === "sem data de fim · fora do preço promocional",
      "criada pela gaveta: o aviso, a gaveta fecha, e a promoção entra na lista",
      `aviso: ${criada} · ${JSON.stringify(T)}`
    )
    await avisoDoClique(pagina, () => linhaDe(T.codigo).locator(".chave").click())
    const depois = (await medusa("/dashboard/cupons", { metodo: "GET", token: tokenMkt })).corpo
    ok(
      (depois.promocoes ?? []).find((p) => p.codigo === T.codigo)?.situacao === "pausado" &&
        /Pausada/.test(await linhaDe(T.codigo).textContent()),
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
    await cel.pagina.waitForSelector("[data-promocoes]")
    const semRolagem = await semRolagemDeLado(cel.pagina)
    await hidratado(cel.pagina, "[data-nova-promocao]")
    await cel.pagina.locator("[data-nova-promocao]").click()
    await cel.pagina.locator("[data-form-promocao]").waitFor()
    ok(
      semRolagem && (await semRolagemDeLado(cel.pagina)),
      "no celular, sem rolagem de lado (a lista e a gaveta)"
    )
  }

  /* ── a loja ────────────────────────────────────────────────────────────── */

  if (LOJA) {
    titulo("Na loja")
    const { pagina } = await novaAba()
    // As ações da loja seguradas 1,5 s quando `segurar` (como no conferir-checkout):
    // dá pra ver a sacola antes da resposta do Medusa.
    let segurar = false
    await pagina.route("**/*", async (rota) => {
      const r = rota.request()
      if (segurar && r.method() === "POST" && r.headers()["next-action"]) await esperar(1500)
      await rota.continue().catch(() => null)
    })
    // O card da vitrine: o selo da promoção em cima, e o do desconto logo embaixo.
    await pagina.goto(`${LOJA}/produtos`, { waitUntil: "load" })
    const card = pagina.locator("article.produto", {
      has: pagina.locator(`a[href="/produtos/${A.handle}"]`),
    })
    await card.first().waitFor({ timeout: 30000 })
    const seloDaPromocao = card.first().locator(".produto__selo[data-promocao]")
    const seloDoDesconto = card.first().locator(".produto__selo[data-desconto]")
    ok(
      semEspaco(await seloDaPromocao.textContent()) === "Leve 3, pague 2",
      "o card tem o selo da promoção",
      semEspaco(await seloDaPromocao.textContent())
    )
    const descontoDeA = descontoDo(A.id)
    if (descontoDeA === null) {
      ok((await seloDoDesconto.count()) === 0, "sem de/por, o card não tem o selo do desconto")
    } else {
      const [emCima, embaixo] = [
        await seloDaPromocao.boundingBox(),
        await seloDoDesconto.boundingBox(),
      ]
      ok(
        semEspaco(await seloDoDesconto.textContent()) === `-${descontoDeA}%` &&
          emCima &&
          embaixo &&
          embaixo.y >= emCima.y + emCima.height,
        `e o do desconto (-${descontoDeA}%) logo embaixo, sem cobrir`,
        `${semEspaco(await seloDoDesconto.textContent().catch(() => ""))} ${JSON.stringify([emCima, embaixo])}`
      )
    }
    // A página do produto: o selo, o cartão de 3 e o preço das 3.
    await pagina.goto(`${LOJA}/produtos/${A.handle}`, { waitUntil: "load" })
    await pagina.waitForSelector(".compra__precos")
    await hidratado(pagina, ".compra__comprar")
    ok(
      semEspaco(await pagina.locator(".compra [data-promocao]").textContent()) ===
        "Leve 3, pague 2",
      "a página do produto tem o selo embaixo do preço"
    )
    const cartao2 = pagina.locator("label.compra__kit", { has: pagina.locator('input[value="2"]') })
    const textoDo2 = semEspaco(await cartao2.textContent().catch(() => ""))
    ok(
      textoDo2.includes(reais(2 * fA[2])) && !textoDo2.includes("Leve 3"),
      "o cartão de 2 unidades continua, com o preço da faixa de 2",
      textoDo2
    )
    await cartao2.locator('input[value="2"]').check({ force: true })
    const porDe2 = semEspaco(await pagina.locator(".compra__por").first().textContent())
    ok(porDe2 === reais(2 * fA[2]), "escolhendo 2, o preço lá em cima é o da faixa", porDe2)
    const cartao3 = pagina.locator("label.compra__kit", { has: pagina.locator('input[value="3"]') })
    const textoDo3 = semEspaco(await cartao3.textContent().catch(() => ""))
    ok(
      textoDo3.includes("Leve 3, pague 2") && textoDo3.includes(reais(2 * umaDeA)),
      "o cartão de 3 unidades: a etiqueta e o preço de 2",
      textoDo3
    )
    await cartao3.locator('input[value="3"]').check({ force: true })
    const por = semEspaco(await pagina.locator(".compra__por").first().textContent())
    ok(por === reais(2 * umaDeA), "escolhendo 3, o preço lá em cima é o de 2", por)
    // A sacola: 2 unidades, o empurrão; mais uma, a de graça.
    const cartao1 = pagina.locator("label.compra__kit", { has: pagina.locator('input[value="1"]') })
    await cartao1.locator('input[value="1"]').check({ force: true })
    await pagina.locator('button[aria-label="Aumentar quantidade"]').click()
    await pagina.locator(".compra__comprar").click()
    const gaveta = pagina.locator("#carrinho-gaveta")
    const recado = gaveta.locator("[data-promocao-linha]")
    await recado.first().waitFor({ timeout: 30000 })
    await pagina.waitForFunction(
      () => !document.querySelector("#carrinho-gaveta .sacolinha__item[data-mexendo]"),
      undefined,
      { timeout: 30000 }
    )
    const parcialDe2 = semEspaco(await gaveta.locator(".sacolinha__parcial").first().textContent())
    // A terceira não sai de graça de 2 pra 3: a faixa de 2 deixa de valer. O empurrão diz quanto.
    const empurrao = `Leve 3, pague 2 · mais 1 por ${reais(2 * umaDeA - 2 * fA[2])}`
    ok(
      semEspaco(await recado.first().textContent()) === semEspaco(empurrao) &&
        parcialDe2 === reais(2 * fA[2]),
      "na sacola, com 2: o empurrão pra terceira com o preço dela, e a linha pela faixa de 2",
      `${semEspaco(await recado.first().textContent())} | ${parcialDe2}`
    )
    segurar = true
    await gaveta.locator('.sacolinha__item button[aria-label^="Aumentar"]').first().click()
    // Enquanto o Medusa não responde, a linha esmaece com o total previsto — sem as de graça,
    // e sem a faixa de 2, que não vale no 3.
    await gaveta.locator(".sacolinha__item[data-mexendo]").first().waitFor({ timeout: 5000 })
    const previsto = semEspaco(await gaveta.locator(".sacolinha__parcial").first().textContent())
    segurar = false
    await pagina.waitForFunction(
      () =>
        /1 de graça/.test(
          document.querySelector("#carrinho-gaveta [data-promocao-linha]")?.textContent ?? ""
        ) && !document.querySelector("#carrinho-gaveta .sacolinha__item[data-mexendo]"),
      undefined,
      { timeout: 30000 }
    )
    const parcial = semEspaco(await gaveta.locator(".sacolinha__parcial").first().textContent())
    ok(
      semEspaco(await recado.first().textContent()) === "Leve 3, pague 2 · 1 de graça" &&
        parcial === reais(2 * umaDeA) &&
        previsto === reais(2 * umaDeA),
      "com 3: uma de graça, e a linha custa o preço de 2 — já no clique, antes da resposta",
      `${semEspaco(await recado.first().textContent())} | ${parcial} | no clique: ${previsto}`
    )
    // Pausada, o selo sai (o painel avisa a loja).
    await medusa(`/dashboard/promocoes/${P.id}`, { token: tokenMkt, corpo: { acao: "pausar" } })
    let semSelo = false
    for (let i = 0; i < 20 && !semSelo; i++) {
      await esperar(1000)
      await pagina.goto(`${LOJA}/produtos/${A.handle}`, { waitUntil: "load" })
      await pagina.waitForSelector(".compra__precos")
      semSelo = (await pagina.locator(".compra [data-promocao]").count()) === 0
    }
    ok(semSelo, "pausada, o selo sai da página do produto")
    if (descontoDeA !== null) {
      await pagina.goto(`${LOJA}/produtos`, { waitUntil: "load" })
      await card.first().waitFor({ timeout: 30000 })
      const selos = await card.first().locator(".produto__selo").allTextContents()
      ok(
        selos.length === 1 && semEspaco(selos[0]) === `-${descontoDeA}%`,
        "e no card fica só o do desconto",
        JSON.stringify(selos)
      )
    }
  }

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.join(" | "))
} catch (e) {
  falhou(`o conferidor quebrou: ${e instanceof Error ? e.stack : e}`)
} finally {
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
  // Pausadas pelo painel (a pausa devolve os produtos às faixas na hora), e apagadas.
  for (const id of promocoesDaRodada) {
    if (tokenMkt)
      await medusa(`/dashboard/promocoes/${id}`, { token: tokenMkt, corpo: { acao: "pausar" } })
    await adm(`/admin/promotions/${id}`, { metodo: "DELETE" })
  }
  const { corpo } = await adm(`/admin/promotions?limit=300&fields=id,code`)
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
  await frenet.fechar?.()
  await pagarme.fechar?.()
}

process.exit(resumo())
