/**
 * CONFERIDOR DO FINANCEIRO DO PAINEL — o DRE, as despesas e os custos, pela
 * tela, contra a API e contra os pedidos de verdade.
 *
 *   (Medusa local apontando pros falsos, como no conferir-pedidos; painel no ar)
 *   node apps/dashboard/ferramentas/conferir-financeiro.mjs
 *
 * Variáveis: as de `pecas.mjs`, e mais NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 * ADMIN_EMAIL e ADMIN_SENHA (os pedidos da rodada nascem pela API da loja e
 * são pagos e cancelados pelo admin local), MEDUSA_WEBHOOK_SEGREDO, e
 * PORTA_FALSA e PORTA_PAGARME_FALSO (a Frenet e o Pagar.me falsos).
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o DRE que não fecha: um total que não é a soma das linhas de cima,   │
 * │   ou o período que não é a soma dos meses;                             │
 * │ • o pedido pago que não entra (ou entra errado) na receita, nos        │
 * │   descontos e nos estornos — o cancelado depois de pago entrando sem   │
 * │   sair;                                                                │
 * │ • o custo, a embalagem e o Simples salvos que o DRE não usa, ou usa    │
 * │   com outra conta;                                                     │
 * │ • a despesa lançada que não cai na linha dela, a que repete que muda   │
 * │   os meses de antes, e o campo errado sem o aviso do lado;             │
 * │ • a tela dizendo um número e a API outro; a planilha do contador com   │
 * │   outro total;                                                         │
 * │ • a operação abrindo o Financeiro (na tela OU na API);                 │
 * │ • rolagem de lado no celular; erro no console.                         │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * No fim, o que a rodada lançou e salvou sai (o custo, a embalagem e o
 * Simples voltam ao que eram), e a equipe da rodada sai. Os pedidos ficam no
 * banco local, como os do `conferir-pedidos`.
 */

import { readFile } from "node:fs/promises"
import { fabricaDePedidos } from "../../loja/ferramentas/pedido-de-teste.mjs"
import { subirFrenetFalsa } from "../../loja/ferramentas/frenet-falsa.mjs"
import { subirPagarmeFalso } from "../../loja/ferramentas/pagarme-falso.mjs"
import {
  abrirNavegador,
  avisoDoClique,
  caixaDoResend,
  DONO,
  entrar as entrarPelaTela,
  exigirAmbiente,
  falhou,
  hidratado,
  medusa,
  MEDUSA,
  menu,
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

/* ── as contas de fora ────────────────────────────────────────────────────── */

const arred = (v) => Math.round(v * 100) / 100
const perto = (a, b) => Math.abs(a - b) < 0.011
const NUMERO = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const NA_PLANILHA = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
})
const INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })
const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
/** O que a tabela do DRE mostra: "6.547,75" · "−392,25" · "—". */
const naTabela = (v) => (v === 0 ? "—" : NUMERO.format(v).replace("-", "−"))
const noMesAMes = (v) =>
  Math.round(v) === 0 ? "—" : INTEIRO.format(Math.round(v)).replace("-", "−")
const somarMeses = (mes, n) => {
  const [a, m] = mes.split("-").map(Number)
  const t = a * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`
}
const semEspaco = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()

/** As linhas de cima que cada total soma — o DRE tem que fechar em todo mês. */
const SOMAS = {
  bruta: ["vendas", "freteCobrado"],
  deducoes: ["descontos", "cancelamentos", "simples"],
  liquida: ["bruta", "deducoes"],
  custoDosProdutos: ["custo", "embalagem"],
  lucroBruto: ["liquida", "custoDosProdutos"],
  variaveis: ["taxas", "fretePago", "comissoes"],
  margem: ["lucroBruto", "variaveis"],
  fixas: ["marketing", "plataforma", "pessoal", "contador", "outras"],
  operacional: ["margem", "fixas"],
  lucro: ["operacional", "financeiro"],
}
/** Os totais que não fecham (vazio = fecha). `v` é id → valor. */
const quebras = (v) =>
  Object.entries(SOMAS)
    .filter(
      ([t, partes]) =>
        !perto(
          v[t],
          partes.reduce((s, p) => s + v[p], 0)
        )
    )
    .map(([t]) => `${t}=${v[t]}`)

const valores = (t) => Object.fromEntries(t.linhas.map((l) => [l.id, l.valor]))
const linha = (t, id) => t.linhas.find((l) => l.id === id)

/* ── os falsos, o admin, a equipe ─────────────────────────────────────────── */

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
const fabrica = fabricaDePedidos({ medusa: MEDUSA, chave: CHAVE, tokenAdmin, pagarme })

let token = ""
const dre = async (q = "comparar=nenhum") =>
  (await medusa(`/dashboard/financeiro?${q}`, { metodo: "GET", token })).corpo
const despesas = async (mes) =>
  (await medusa(`/dashboard/financeiro/despesas?mes=${mes}`, { metodo: "GET", token })).corpo
const custos = async () =>
  (await medusa("/dashboard/financeiro/custos", { metodo: "GET", token })).corpo
const daRodada = (t) =>
  (t.grupos ?? []).flatMap((g) => g.itens).filter((d) => d.descricao.includes(RODADA))
const acharNa = async (mes, descricao) =>
  daRodada(await despesas(mes)).find((d) => d.descricao === descricao)

/** Lê um pedido pelo admin, com o que o DRE usa. */
async function noAdmin(id) {
  const r = await fetch(
    `${MEDUSA}/admin/orders/${id}?fields=id,status,total,credit_line_total,*items,*shipping_methods,*payment_collections.payments.refunds`,
    { headers: { authorization: `Bearer ${tokenAdmin}` } }
  )
  return (await r.json()).order
}
/** O que o DRE tem que contar de um pedido: os produtos, o frete, o cobrado e os estornos. */
function contaDo(o) {
  const produtos = arred(o.items.reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0))
  const frete = arred((o.shipping_methods ?? []).reduce((s, m) => s + Number(m.amount), 0))
  const cobrado = arred(Number(o.total) + Number(o.credit_line_total ?? 0))
  const estornos = arred(
    (o.payment_collections ?? [])
      .flatMap((c) => c.payments ?? [])
      .flatMap((p) => p.refunds ?? [])
      .reduce((s, r) => s + Number(r.amount), 0)
  )
  return { produtos, frete, cobrado, descontos: arred(produtos + frete - cobrado), estornos }
}

let antesDosCustos = null
const salvos = { custo: null, embalagem: null, simples: null }
let mes = ""

try {
  titulo("Quem entra")
  const dono = await novaAba({ width: 1440, height: 900 })
  const cookieDono = await entrarPelaTela(dono, DONO, caixa)
  if (!cookieDono) throw new Error("o dono não entrou (o código não chegou no Resend falso?)")
  token = cookieDono.value
  const OPE = `ope.${RODADA}@painel.teste`
  await medusa("/dashboard/equipe", {
    token,
    corpo: { nome: "Operação Teste", email: OPE, papel: "operacao" },
  })
  const ope = await novaAba()
  const cookieOpe = await entrarPelaTela(ope, OPE, caixa)
  ok(Boolean(cookieOpe), "o dono e a operação entram")
  const noMenu = await menu(dono.pagina)
  ok(
    noMenu.indexOf("Financeiro") > 0 &&
      noMenu.indexOf("Financeiro") === noMenu.indexOf("Marketing") + 1,
    "o Financeiro no menu do dono, logo depois do Marketing",
    noMenu.join(", ")
  )

  titulo("A operação não abre (no padrão)")
  ok(!(await menu(ope.pagina)).includes("Financeiro"), "fora do menu da operação")
  const rOpe = await medusa("/dashboard/financeiro", { metodo: "GET", token: cookieOpe?.value })
  const rOpeDespesa = await medusa("/dashboard/financeiro/despesas", {
    token: cookieOpe?.value,
    corpo: { descricao: "x", categoria: "outras", valor: "1", mes: "2026-09" },
  })
  const rOpeCustos = await medusa("/dashboard/financeiro/custos", {
    metodo: "GET",
    token: cookieOpe?.value,
  })
  ok(
    rOpe.status === 403 && rOpeDespesa.status === 403 && rOpeCustos.status === 403,
    "a API responde 403 ao DRE, às despesas e aos custos",
    `${rOpe.status} ${rOpeDespesa.status} ${rOpeCustos.status}`
  )
  await ope.pagina.goto(`${PAINEL}/financeiro`)
  await ope.pagina
    .getByText("não liberou “Financeiro”")
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => {})
  ok(
    (await ope.pagina.locator("main").innerText()).includes("não liberou “Financeiro”"),
    "a tela diz que o dono não liberou"
  )

  titulo("O DRE fecha")
  const t0 = await dre()
  mes = t0.periodo.hoje
  ok(t0.periodo.de === mes && t0.periodo.ate === mes, "sem nada, é este mês", t0.periodo.nome)
  ok(
    quebras(valores(t0)).length === 0,
    "cada total é a soma das linhas de cima",
    quebras(valores(t0)).join(" ")
  )
  const ano = await dre("periodo=ano")
  ok(
    ano.meses[0]?.mes === ano.periodo.de && ano.meses.at(-1)?.mes === ano.periodo.ate,
    "o ano: um mês por coluna, do começo do DRE até agora",
    `${ano.periodo.de} a ${ano.periodo.ate}`
  )
  ok(
    ano.meses.every((m) => quebras(m.valores).length === 0),
    "cada mês fecha",
    ano.meses.map((m) => `${m.mes}: ${quebras(m.valores).join(" ")}`).join(" | ")
  )
  ok(
    ano.linhas.every((l) =>
      perto(
        l.valor,
        ano.meses.reduce((s, m) => s + m.valores[l.id], 0)
      )
    ),
    "o período é a soma dos meses, linha a linha"
  )
  const bruta0 = linha(t0, "bruta").valor
  ok(
    bruta0 === 0 || t0.linhas.every((l) => l.pct === Math.round((l.valor / bruta0) * 1000) / 10),
    "o % de cada linha é de cada R$ 100 da receita bruta"
  )

  titulo("Os pedidos da rodada entram no DRE")
  const { products } = await (
    await fetch(`${MEDUSA}/store/products?fields=handle,id`, {
      headers: { "x-publishable-api-key": CHAVE },
    })
  ).json()
  const [a, b] = products
  const oferta = await fabrica.codigoDaOferta(a.handle)
  const antes = await dre()
  const pago = await fabrica.pedidoPix(
    `fin.${RODADA}.pago@teste.fuckingbarba.dev`,
    [[a.handle, 2]],
    { documento: "11144477735", cupom: oferta }
  )
  await fabrica.pagar(pago)
  const canc = await fabrica.pedidoPix(
    `fin.${RODADA}.canc@teste.fuckingbarba.dev`,
    [[b.handle, 1]],
    { documento: "11144477735" }
  )
  await fabrica.pagar(canc)
  await fabrica.cancelar(canc)
  const cp = contaDo(await noAdmin(pago.id))
  const cc = contaDo(await noAdmin(canc.id))
  const depois = await dre()
  const delta = (id) => arred(linha(depois, id).valor - linha(antes, id).valor)
  ok(
    perto(delta("vendas"), cp.produtos + cc.produtos),
    "as vendas crescem os produtos dos dois (o cancelado entra)",
    `${delta("vendas")} × ${cp.produtos + cc.produtos}`
  )
  ok(
    perto(delta("freteCobrado"), cp.frete + cc.frete),
    "o frete cobrado dos dois",
    `${delta("freteCobrado")} × ${cp.frete + cc.frete}`
  )
  ok(
    cp.descontos > 0 && perto(delta("descontos"), -(cp.descontos + cc.descontos)),
    "os descontos são os da oferta: produtos + frete − cobrado",
    `${delta("descontos")} × ${-(cp.descontos + cc.descontos)}`
  )
  ok(
    cc.estornos > 0 && perto(delta("cancelamentos"), -(cp.estornos + cc.estornos)),
    "o estorno do cancelado sai em Cancelamentos e estornos",
    `${delta("cancelamentos")} × ${-(cp.estornos + cc.estornos)} (estornado ${cc.estornos})`
  )
  ok(depois.pedidos.atual - antes.pedidos.atual === 1, "só o pago conta nos pedidos pagos")
  ok(
    quebras(valores(depois)).length === 0,
    "e o DRE segue fechando",
    quebras(valores(depois)).join(" ")
  )
  const daOferta = linha(depois, "descontos").detalhe.find((d) => d.nome === "Oferta do checkout")
  ok(Boolean(daOferta && daOferta.valor < 0), "o detalhe diz de onde veio o desconto (a oferta)")

  titulo("Custos e imposto, pela tela")
  antesDosCustos = await custos()
  const prodA = antesDosCustos.produtos.find((p) => p.id === a.id)
  // Valores diferentes dos que já estão no banco: sem mudança, o "vale desde" nem aparece
  // (e o Simples responde "Nada mudou"). Valendo desde o dia 1: o mês inteiro com eles.
  const custoNovo = prodA.custo === 12.34 ? 12.35 : 12.34
  const embNova = antesDosCustos.embalagem?.valor === 3.2 ? 3.3 : 3.2
  const antesDoSimples = antesDosCustos.simples.find((s) => s.mes === mes)?.valor ?? null
  const aliquotaNova = antesDoSimples === 6.54 ? 6.55 : 6.54
  const noCampo = (v) => v.toFixed(2).replace(".", ",")
  const diaUm = `${mes}-01`
  await dono.pagina.goto(`${PAINEL}/financeiro/custos`)
  const campoA = `tr[data-produto="${a.id}"] input[inputmode=decimal]`
  const diaA = `tr[data-produto="${a.id}"] input[type=date]`
  await hidratado(dono.pagina, campoA)
  await dono.pagina.fill(campoA, noCampo(custoNovo))
  const desdeA = await dono.pagina.locator(diaA).inputValue()
  ok(
    desdeA === (prodA.custo === null ? antesDosCustos.comeco : antesDosCustos.hoje),
    "o 'vale desde' aparece: o começo do DRE no primeiro custo, hoje em quem já tinha",
    desdeA
  )
  await dono.pagina.fill(diaA, diaUm)
  await dono.pagina.fill("#fin-embalagem", noCampo(embNova))
  await dono.pagina.fill("[data-embalagem] input[type=date]", diaUm)
  salvos.custo = { produto: a.id, desde: diaUm }
  salvos.embalagem = { desde: diaUm }
  const avisoCustos = await avisoDoClique(dono.pagina, () =>
    dono.pagina.click("form[data-custos] button[type=submit]")
  )
  ok(avisoCustos === "Custos salvos", "salva, com o aviso", avisoCustos)
  const c1 = await custos()
  const a1 = c1.produtos.find((p) => p.id === a.id)
  ok(
    a1?.custo === custoNovo && a1?.desde === diaUm,
    "a API devolve o custo e desde quando",
    JSON.stringify(a1)
  )
  ok(
    a1?.preco === null || perto(a1.sobra, a1.preco - custoNovo),
    "a sobra por unidade é o preço menos o custo"
  )
  await dono.pagina.reload()
  const campoSimples = `label[data-mes="${mes}"] input`
  await hidratado(dono.pagina, campoSimples)
  salvos.simples = { antes: antesDoSimples }
  await dono.pagina.fill(campoSimples, noCampo(aliquotaNova))
  const avisoSimples = await avisoDoClique(dono.pagina, () =>
    dono.pagina.click("form[data-simples] button[type=submit]")
  )
  ok(avisoSimples === "Alíquotas do Simples salvas", "o Simples do mês salva", avisoSimples)

  const t2 = await dre()
  const v2 = valores(t2)
  const custoA = linha(t2, "custo").detalhe.find((d) => d.nome.startsWith(`${a1.nome} · `))
  const unidadesA = Number(custoA?.nome.match(/· (\d+) unidade/)?.[1] ?? 0)
  ok(
    unidadesA >= 2 && perto(custoA.valor, -arred(custoNovo * unidadesA)),
    "o custo do produto no DRE é o custo novo × as unidades vendidas",
    JSON.stringify(custoA)
  )
  const emb = linha(t2, "embalagem").detalhe.find((d) =>
    semEspaco(d.nome).includes(`× R$ ${noCampo(embNova)}`)
  )
  ok(
    Boolean(emb) && Number(emb.nome.match(/^(\d+) pedido/)?.[1]) === t2.pedidos.atual,
    "a embalagem conta um por pedido pago (o cancelado fora)",
    JSON.stringify(emb)
  )
  const base = v2.bruta + v2.descontos + v2.cancelamentos
  ok(
    perto(v2.simples, -arred((Math.max(base, 0) * aliquotaNova) / 100)),
    "o Simples é a alíquota do mês sobre a venda menos descontos e estornos",
    `${v2.simples} × ${-arred((base * aliquotaNova) / 100)}`
  )
  ok(
    !linha(t2, "simples").falta && !t2.pendencias.some((p) => p.id === "simples"),
    "com a alíquota do mês, a etiqueta e a pendência somem"
  )
  ok(quebras(v2).length === 0, "e o DRE segue fechando", quebras(v2).join(" "))

  titulo("Despesas, pela tela")
  const antesDaDespesa = await despesas(mes)
  const dAntes = await dre()
  await dono.pagina.goto(`${PAINEL}/financeiro/despesas`)
  const form = "form[data-lancar-despesa]"
  await hidratado(dono.pagina, `${form} input[name=descricao]`)
  await dono.pagina.fill(`${form} input[name=descricao]`, `Meta Ads ${RODADA}`)
  await dono.pagina.fill(`${form} input[name=valor]`, "abc")
  const avisoRuim = await avisoDoClique(dono.pagina, () =>
    dono.pagina.click(`${form} button[type=submit]`)
  )
  ok(
    avisoRuim.startsWith("Não entendi o valor") &&
      (await dono.pagina.locator(`${form} .campo__erro`).innerText()).startsWith(
        "Não entendi o valor"
      ),
    "o valor errado volta com o aviso do lado do campo",
    avisoRuim
  )
  ok((await despesas(mes)).total === antesDaDespesa.total, "e nada é lançado")
  await dono.pagina.fill(`${form} input[name=valor]`, "1.234,56")
  await dono.pagina.selectOption(`${form} select[name=categoria]`, "marketing")
  const avisoLancou = await avisoDoClique(dono.pagina, () =>
    dono.pagina.click(`${form} button[type=submit]`)
  )
  ok(avisoLancou === "Despesa lançada", "lança, com o aviso", avisoLancou)
  const lancada = await acharNa(mes, `Meta Ads ${RODADA}`)
  ok(
    lancada?.valor === 1234.56 && lancada?.categoria === "marketing",
    "a API devolve a despesa",
    JSON.stringify(lancada)
  )
  await dono.pagina.locator(`[data-despesa="${lancada?.id}"]`).waitFor()
  ok(
    semEspaco(await dono.pagina.locator(`[data-despesa="${lancada?.id}"]`).innerText()).includes(
      "R$ 1.234,56"
    ),
    "a despesa aparece na lista do mês, com o valor"
  )
  const dDepois = await dre()
  ok(
    perto(linha(dDepois, "marketing").valor - linha(dAntes, "marketing").valor, -1234.56) &&
      perto(linha(dDepois, "lucro").valor - linha(dAntes, "lucro").valor, -1234.56),
    "cai em Marketing e anúncios, e o lucro desce o mesmo"
  )
  ok(
    linha(dDepois, "marketing").detalhe.some((d) => d.nome === `Meta Ads ${RODADA}`),
    "o detalhe da linha tem a despesa pelo nome"
  )

  titulo("A que repete: mudar vale dali em diante; apagar no 1º mês tira inteira")
  const anterior = somarMeses(mes, -1)
  const sistema = `Sistema ${RODADA}`
  await medusa("/dashboard/financeiro/despesas", {
    token,
    corpo: {
      descricao: sistema,
      categoria: "plataforma",
      valor: "100",
      mes: anterior,
      repete: true,
    },
  })
  const sisAnt = await acharNa(anterior, sistema)
  const sisMes = await acharNa(mes, sistema)
  ok(
    sisAnt?.valor === 100 && sisMes?.valor === 100 && sisMes?.repete === true,
    "entra no mês dela e nos seguintes"
  )
  await dono.pagina.reload()
  await hidratado(dono.pagina, `[data-despesa="${sisMes?.id}"] [data-mudar-despesa]`)
  await dono.pagina.click(`[data-despesa="${sisMes?.id}"] [data-mudar-despesa]`)
  const aberta = `form[data-despesa="${sisMes?.id}"]`
  ok(
    (await dono.pagina.locator(`${aberta} [data-apagar-despesa]`).textContent())?.trim() ===
      "Tirar deste mês em diante",
    "vista depois do primeiro mês, o apagar é 'Tirar deste mês em diante'"
  )
  await dono.pagina.fill(`${aberta} input[inputmode=decimal]`, "150")
  const avisoMudou = await avisoDoClique(dono.pagina, () =>
    dono.pagina.click(`${aberta} button[type=submit]`)
  )
  ok(avisoMudou === "Despesa salva", "salva, com o aviso", avisoMudou)
  const sisAnt2 = await acharNa(anterior, sistema)
  const sisMes2 = await acharNa(mes, sistema)
  const sisProx = await acharNa(somarMeses(mes, 1), sistema)
  ok(
    sisAnt2?.valor === 100 && sisMes2?.valor === 150 && sisProx?.valor === 150,
    "o mês de antes fica em 100; este e os seguintes, 150",
    `${sisAnt2?.valor} ${sisMes2?.valor} ${sisProx?.valor}`
  )
  const naoVe = await medusa(`/dashboard/financeiro/despesas/${sisAnt2?.id}/apagar`, {
    token,
    corpo: { visto: mes },
  })
  ok(
    naoVe.status === 404,
    "a de antes, que fechou no mês passado, não é vista neste mês",
    `${naoVe.status}`
  )
  await dono.pagina.reload()
  await hidratado(dono.pagina, `[data-despesa="${sisMes2?.id}"] [data-mudar-despesa]`)
  await dono.pagina.click(`[data-despesa="${sisMes2?.id}"] [data-mudar-despesa]`)
  const aberta2 = `form[data-despesa="${sisMes2?.id}"]`
  await dono.pagina.click(`${aberta2} [data-apagar-despesa]`)
  ok(
    (await dono.pagina.locator(`${aberta2} [data-apagar-despesa]`).textContent())?.trim() ===
      "Confirmar",
    "apagar pede a confirmação"
  )
  const avisoApagou = await avisoDoClique(dono.pagina, () =>
    dono.pagina.click(`${aberta2} [data-apagar-despesa]`)
  )
  ok(avisoApagou === "Despesa apagada", "a que começou neste mês some inteira", avisoApagou)
  const semEste = !(await acharNa(mes, sistema))
  const comAntes = (await acharNa(anterior, sistema))?.valor === 100
  ok(semEste && comAntes, "este mês sem ela; o mês de antes, com os 100")
  const parar = await medusa(`/dashboard/financeiro/despesas/${sisAnt2?.id}/apagar`, {
    token,
    corpo: { visto: anterior },
  })
  ok(parar.status === 200 && parar.corpo.parou === false, "apagada no primeiro mês, some inteira")

  titulo("A tela do DRE é a API")
  const t3 = await dre()
  await dono.pagina.goto(`${PAINEL}/financeiro?comparar=nenhum`)
  await dono.pagina.locator("[data-dre]").waitFor()
  const naTela = await dono.pagina.$$eval("[data-dre] [data-linha]", (ls) =>
    ls.map((l) => [
      l.getAttribute("data-linha"),
      l.querySelector("[data-valor]")?.textContent?.trim(),
    ])
  )
  const diferentes = t3.linhas.filter(
    (l) => naTela.find(([id]) => id === l.id)?.[1] !== naTabela(l.valor)
  )
  ok(
    naTela.length === t3.linhas.length && diferentes.length === 0,
    "cada linha com o valor da API",
    diferentes.map((l) => `${l.id}: ${naTabela(l.valor)}`).join(" ")
  )
  ok(
    semEspaco(await dono.pagina.locator('[data-numero="lucro"] .numero__valor').innerText()) ===
      semEspaco(REAIS.format(linha(t3, "lucro").valor).replace("-", "−")),
    "o número do lucro em cima é o da última linha"
  )
  const pendenciasNaTela = await dono.pagina.$$eval("[data-pendencia]", (ls) =>
    ls.map((l) => l.getAttribute("data-pendencia"))
  )
  ok(
    pendenciasNaTela.join() === t3.pendencias.map((p) => p.id).join(),
    "o 'Pra fechar certinho' é o da API",
    pendenciasNaTela.join()
  )
  ok(
    !(await dono.pagina.locator('[data-linha="marketing"] .dre__detalhe').isVisible()),
    "o detalhe da linha começa fechado"
  )
  await dono.pagina.click('[data-linha="marketing"] > summary')
  ok(
    (await dono.pagina.locator('[data-linha="marketing"] .dre__detalhe').innerText()).includes(
      `Meta Ads ${RODADA}`
    ),
    "e abre no toque, com a despesa pelo nome"
  )
  ok(
    (await dono.pagina.locator(".dre__linha--cabeca > span").count()) === 3,
    "sem comparar, só as colunas do período"
  )
  await dono.pagina.click("[data-comparar] > summary")
  await dono.pagina.click('[data-comparar-com="anterior"]')
  await dono.pagina.waitForURL((u) => !u.search.includes("comparar=nenhum"))
  await dono.pagina.locator(".dre[data-comparar]").waitFor()
  ok(
    (await dono.pagina.locator(".dre__linha--cabeca > span").count()) === 6,
    "comparando, o de antes, o % e a variação"
  )

  titulo("Os meses escolhidos e o mês a mês")
  await dono.pagina.click("[data-escolher] > summary")
  await dono.pagina.selectOption('[data-escolher] select[name="de"]', anterior)
  await dono.pagina.selectOption('[data-escolher] select[name="ate"]', mes)
  await dono.pagina.click("[data-escolher] button[type=submit]")
  await dono.pagina.waitForURL((u) => u.searchParams.get("de") === anterior)
  const doisMeses = await dre(`de=${anterior}&ate=${mes}`)
  await dono.pagina.locator("[data-nome-do-periodo]").waitFor()
  await dono.pagina
    .waitForFunction(
      (nome) =>
        document.querySelector("[data-nome-do-periodo]")?.textContent?.toLowerCase() === nome,
      doisMeses.periodo.nome,
      { timeout: 15000 }
    )
    .catch(() => {})
  ok(
    (await dono.pagina.locator("[data-nome-do-periodo]").innerText()).toLowerCase() ===
      doisMeses.periodo.nome,
    "o período escolhido na legenda",
    doisMeses.periodo.nome
  )
  await dono.pagina.click('[data-vista="meses"]')
  await dono.pagina.waitForURL((u) => u.searchParams.get("ver") === "meses")
  await dono.pagina.locator("[data-mes-a-mes]").waitFor()
  const celulas = await dono.pagina.$$eval('[data-mes-a-mes] tr[data-linha="lucro"] td', (tds) =>
    tds.map((td) => td.textContent.trim())
  )
  ok(
    celulas.slice(0, doisMeses.meses.length).join("|") ===
      doisMeses.meses.map((m) => noMesAMes(m.valores.lucro)).join("|") &&
      celulas[doisMeses.meses.length] === noMesAMes(linha(doisMeses, "lucro").valor),
    "uma coluna por mês e o total, com os valores da API",
    celulas.join("|")
  )
  ok(
    (await dono.pagina.locator("[data-lucro-por-mes] [data-mes]").count()) ===
      doisMeses.meses.length,
    "uma barra do lucro por mês"
  )

  titulo("A planilha do contador")
  const [baixado] = await Promise.all([
    dono.pagina.waitForEvent("download"),
    dono.pagina.click("[data-baixar-dre]"),
  ])
  const csv = await readFile(await baixado.path(), "utf-8")
  const semBom = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv
  const linhasCsv = semBom.trim().split("\n")
  const lucroCsv = linhasCsv.find((l) => l.includes("= Lucro líquido"))
  ok(
    csv.charCodeAt(0) === 0xfeff && linhasCsv[0].startsWith("Linha;"),
    "com o BOM e separada por ';'"
  )
  ok(
    linhasCsv.length === doisMeses.linhas.length + 1 &&
      lucroCsv?.split(";").at(-1) === NA_PLANILHA.format(linha(doisMeses, "lucro").valor),
    "todas as linhas, e o total do lucro é o da API",
    lucroCsv
  )
  ok(
    baixado.suggestedFilename() === `dre-fuckingbarba-${anterior}-a-${mes}.csv`,
    "o nome diz os meses",
    baixado.suggestedFilename()
  )

  titulo("Antes da loja nova")
  const td = await despesas(mes)
  await dono.pagina.goto(`${PAINEL}/financeiro/despesas`)
  await dono.pagina.locator("[data-antes-da-loja-nova]").waitFor()
  const grade = await dono.pagina.$$eval('[data-grade="taxas"] [role=cell]', (cs) =>
    cs.map((c) => c.getAttribute("data-estado"))
  )
  ok(
    grade.join() ===
      td.antesDaLojaNova.map((m) => (m.taxas ? "ok" : m.vendeu ? "falta" : "sem-venda")).join(),
    "um quadrinho por mês, no estado da API",
    grade.join()
  )

  titulo("O celular")
  const cel = await novaAba({ width: 390, height: 844 })
  await cel.contexto.addCookies(await dono.contexto.cookies())
  for (const p of [
    "/financeiro",
    "/financeiro?ver=meses&periodo=ano",
    "/financeiro/despesas",
    "/financeiro/custos",
  ]) {
    await cel.pagina.goto(`${PAINEL}${p}`)
    await cel.pagina.locator("[data-tela]").first().waitFor()
    ok(await semRolagemDeLado(cel.pagina), `sem rolagem de lado em ${p}`)
  }

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.join(" | "))
} catch (err) {
  falhou(`o conferidor quebrou: ${err instanceof Error ? err.stack : err}`)
} finally {
  if (token) {
    // O que a rodada lançou sai (a que repete, apagada no primeiro mês dela).
    if (mes)
      for (const m of [somarMeses(mes, -1), mes, somarMeses(mes, 1)])
        for (const d of daRodada(await despesas(m).catch(() => ({}))))
          await medusa(`/dashboard/financeiro/despesas/${d.id}/apagar`, {
            token,
            corpo: { visto: d.desde },
          })
    // O custo, a embalagem e o Simples voltam ao que eram.
    const emReais = (v) => (v === null || v === undefined ? "" : String(v).replace(".", ","))
    if (antesDosCustos && salvos.custo) {
      const antesA = antesDosCustos.produtos.find((p) => p.id === salvos.custo.produto)
      const emb = antesDosCustos.embalagem
      await medusa("/dashboard/financeiro/custos", {
        token,
        corpo: {
          custos: [
            {
              produto: salvos.custo.produto,
              valor: antesA?.desde === salvos.custo.desde ? emReais(antesA.custo) : "",
              desde: salvos.custo.desde,
            },
          ],
          embalagem: {
            valor: emb?.desde === salvos.embalagem?.desde ? emReais(emb.valor) : "",
            desde: salvos.embalagem?.desde ?? antesDosCustos.hoje,
          },
        },
      })
    }
    if (salvos.simples && mes)
      await medusa("/dashboard/financeiro/simples", {
        token,
        corpo: { mes, aliquota: emReais(salvos.simples.antes) },
      })
    const r = await medusa("/dashboard/equipe", { metodo: "GET", token })
    for (const m of r.corpo.membros ?? [])
      if (m.email.includes(RODADA))
        await medusa(`/dashboard/equipe/${m.id}`, { token, corpo: { acao: "remover" } })
  }
  await navegador.close()
  await resend.fechar()
  await frenet.fechar?.()
  await pagarme.fechar?.()
}

process.exit(resumo())
