/**
 * CONFERIDOR DOS CARRINHOS ABANDONADOS — a lista do painel: o passo em que
 * cada pessoa parou, uma linha por pessoa, quem voltou e comprou, o botão do
 * WhatsApp com a mensagem pronta (e quem já chamou), e o que o marketing não
 * vê.
 *
 *   (Medusa local; painel no ar)
 *   node apps/dashboard/ferramentas/conferir-carrinhos.mjs
 *
 * Variáveis: as de `pecas.mjs`, e mais NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 * ADMIN_EMAIL, ADMIN_SENHA, PORTA_FALSA e PORTA_PAGARME_FALSO. Os carrinhos
 * nascem pela API da loja, como o checkout faz — e, frescos, aparecem em
 * "No site agora" (os parados são os de mais de 30 minutos).
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o passo errado (a régua é a do checkout da loja);                    │
 * │ • a mesma pessoa em duas linhas; quem comprou depois contado parado;   │
 * │ • o link do WhatsApp sem o número certo ou sem a mensagem;             │
 * │ • o clique sem ficar anotado (quem já chamou, pra não chamar de novo); │
 * │ • o marketing vendo e-mail inteiro, telefone ou o botão;               │
 * │ • rolagem de lado no celular; erro no console.                         │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { subirFrenetFalsa } from "../../loja/ferramentas/frenet-falsa.mjs"
import { subirPagarmeFalso } from "../../loja/ferramentas/pagarme-falso.mjs"
import { fabricaDePedidos } from "../../loja/ferramentas/pedido-de-teste.mjs"
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
  console.log("  ⚠  faltam NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL e ADMIN_SENHA")
  process.exit(1)
}
const semEspaco = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()

const resend = await subirResend()
const frenet = await subirFrenetFalsa()
const pagarme = await subirPagarmeFalso({
  webhook: {
    url: `${MEDUSA}/hooks/payment/pagarme_pagarme`,
    segredo: process.env.MEDUSA_WEBHOOK_SEGREDO ?? "",
  },
})
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

/* ── os carrinhos, pela API da loja ───────────────────────────────────────── */

async function loja(caminho, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: { "content-type": "application/json", "x-publishable-api-key": CHAVE },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${metodo} ${caminho} → ${r.status} ${JSON.stringify(j)}`)
  return j
}
const { regions } = await loja("/store/regions")
const regiao = regions.find((x) => x.currency_code === "brl")
const { products } = await loja(
  `/store/products?handle=shampoo-para-barba&region_id=${regiao.id}&fields=*variants`
)
const VARIANTE = products[0].variants[0].id
const ENDERECO = {
  first_name: "Rafael",
  last_name: `Carrinho ${RODADA}`,
  phone: "+5511988887777",
  address_1: "Rua Doutor Pedro Zimmermann, 99",
  address_2: "Casa 2 — Itoupava Central",
  city: "Blumenau",
  province: "SC",
  postal_code: "89036370",
  country_code: "br",
  metadata: { rua: "Rua Doutor Pedro Zimmermann", numero: "99", bairro: "Itoupava Central" },
}

/** Um carrinho parado num passo: "sacola", "contato", "entrega" ou "pagamento". */
async function carrinhoEm(passo, email) {
  const { cart } = await loja("/store/carts", { metodo: "POST", corpo: { region_id: regiao.id } })
  await loja(`/store/carts/${cart.id}/line-items`, {
    metodo: "POST",
    corpo: { variant_id: VARIANTE, quantity: 2 },
  })
  if (passo === "sacola") return cart.id
  if (passo === "contato") {
    await loja(`/store/carts/${cart.id}`, { metodo: "POST", corpo: { email } })
    return cart.id
  }
  await loja(`/store/carts/${cart.id}`, {
    metodo: "POST",
    corpo: {
      email,
      shipping_address: ENDERECO,
      billing_address: {
        ...ENDERECO,
        metadata: { ...ENDERECO.metadata, documento: { tipo: "cpf", valor: "11144477735" } },
      },
    },
  })
  if (passo === "entrega") return cart.id
  const { shipping_options } = await loja(`/store/shipping-options?cart_id=${cart.id}`)
  await loja(`/store/carts/${cart.id}/shipping-methods`, {
    metodo: "POST",
    corpo: { option_id: shipping_options[0].id },
  })
  return cart.id
}

const tela = async (token, filtro = "agora") =>
  (await medusa(`/dashboard/carrinhos?filtro=${filtro}`, { metodo: "GET", token })).corpo
const linha = (t, id) => (t?.carrinhos ?? []).find((l) => l.id === id)

let tokenDoDono = ""

try {
  titulo("Quem entra")
  const dono = await novaAba()
  const cookieDono = await entrarPelaTela(dono, DONO, caixa)
  if (!cookieDono) throw new Error("o dono não entrou (o código não chegou no Resend falso?)")
  tokenDoDono = cookieDono.value
  const nomeDoDono = (await medusa("/dashboard/eu", { metodo: "GET", token: tokenDoDono })).corpo
    .membro?.nome
  const MKT = `mkt.${RODADA}@painel.teste`
  await medusa("/dashboard/equipe", {
    token: tokenDoDono,
    corpo: { nome: "Marketing Teste", email: MKT, papel: "marketing" },
  })
  const mkt = await novaAba()
  const cookieMkt = await entrarPelaTela(mkt, MKT, caixa)
  ok(Boolean(nomeDoDono && cookieMkt), "o dono e o marketing entram")

  titulo("Onde cada pessoa parou (API)")
  const antes = await tela(tokenDoDono)
  const e = (nome) => `${nome}.${RODADA}@fuckingbarba.invalid`
  const ids = {
    sacola: await carrinhoEm("sacola"),
    contato: await carrinhoEm("contato", e("contato")),
    entrega: await carrinhoEm("entrega", e("entrega")),
    pagamento: await carrinhoEm("pagamento", e("pagamento")),
  }
  // A mesma pessoa com dois carrinhos: vale o mais recente.
  const velho = await carrinhoEm("contato", e("duas"))
  const novo = await carrinhoEm("pagamento", e("duas"))
  const t1 = await tela(tokenDoDono)
  ok(
    ["contato", "entrega", "pagamento"].every((p) => linha(t1, ids[p])?.etapa === p) &&
      !linha(t1, ids.sacola) &&
      t1.numeros.semContato.quantos > antes.numeros.semContato.quantos,
    "cada carrinho no passo em que parou; o sem e-mail nem telefone só conta",
    JSON.stringify(
      Object.fromEntries(Object.entries(ids).map(([p, id]) => [p, linha(t1, id)?.etapa ?? null]))
    )
  )
  ok(
    Boolean(linha(t1, novo)) && !linha(t1, velho),
    "a mesma pessoa numa linha só: a do carrinho mais recente"
  )
  const pago = linha(t1, ids.pagamento)
  const zap = pago?.whatsapp ? new URL(pago.whatsapp) : null
  ok(
    zap?.origin === "https://wa.me" &&
      zap.pathname === "/5511988887777" &&
      zap.searchParams.get("text")?.startsWith("Oi, Rafael! Aqui é da FuckingBarba.") &&
      zap.searchParams.get("text")?.includes("Shampoo") &&
      pago.quem.telefone === "(11) 98888-7777" &&
      !linha(t1, ids.contato)?.whatsapp,
    "o WhatsApp com o número e a mensagem pronta (o nome e o produto); sem telefone, sem botão",
    pago?.whatsapp
  )

  titulo("Quem voltou e comprou")
  const volta = await carrinhoEm("pagamento", e("volta"))
  const pedido = await fabrica.pedidoPix(e("volta"))
  const t2 = await tela(tokenDoDono, "voltaram")
  ok(
    linha(t2, volta)?.pedido?.numero === pedido.numero && !linha(await tela(tokenDoDono), volta),
    "comprou depois com o mesmo e-mail: sai de parado e vai pra “Voltaram”, com o pedido",
    JSON.stringify(linha(t2, volta)?.pedido)
  )

  titulo("A tela do dono")
  const { pagina } = dono
  await pagina.goto(`${PAINEL}/carrinhos?filtro=agora`)
  await hidratado(pagina, `[data-carrinho="${ids.pagamento}"] [data-whatsapp]`)
  const naTela = semEspaco(
    await pagina.locator(`tr[data-carrinho="${ids.pagamento}"]`).textContent()
  )
  ok(
    naTela.includes("Pagamento") &&
      naTela.includes("Chegou no pagamento e não pagou") &&
      naTela.includes("(11) 98888-7777") &&
      (await pagina.locator(`tr[data-carrinho="${ids.contato}"] [data-whatsapp]`).count()) === 0,
    "a linha: o passo, a frase e o telefone; sem telefone, sem botão",
    naTela
  )
  // O WhatsApp abre numa aba nova — aqui ela nem sai daqui.
  await dono.contexto.route("https://wa.me/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/html", body: "<p>WhatsApp</p>" })
  )
  const [aba] = await Promise.all([
    dono.contexto.waitForEvent("page"),
    pagina.locator(`tr[data-carrinho="${ids.pagamento}"] [data-whatsapp]`).click(),
  ])
  await aba.waitForLoadState()
  const aberto = new URL(aba.url())
  await aba.close()
  let chamado = null
  for (let i = 0; i < 20 && !chamado; i++) {
    chamado = linha(await tela(tokenDoDono), ids.pagamento)?.chamado ?? null
    if (!chamado) await new Promise((r) => setTimeout(r, 500))
  }
  await pagina.reload()
  await pagina.waitForSelector(`tr[data-carrinho="${ids.pagamento}"] [data-chamado]`)
  ok(
    aberto.origin === "https://wa.me" &&
      aberto.pathname === "/5511988887777" &&
      chamado?.quem === nomeDoDono &&
      semEspaco(
        await pagina.locator(`tr[data-carrinho="${ids.pagamento}"] [data-chamado]`).textContent()
      ).startsWith(`Chamado por ${nomeDoDono}`),
    "o botão abre o WhatsApp numa aba nova e fica anotado quem chamou",
    JSON.stringify({ url: aba.url(), chamado })
  )

  titulo("O marketing")
  const doMkt = await tela(cookieMkt.value)
  const vistoPeloMkt = linha(doMkt, ids.pagamento)
  const anotarMkt = await medusa(`/dashboard/carrinhos/${ids.pagamento}/whatsapp`, {
    token: cookieMkt.value,
  })
  ok(
    vistoPeloMkt?.quem?.email === `pa•••@fuckingbarba.invalid` &&
      vistoPeloMkt.quem.telefone === null &&
      vistoPeloMkt.whatsapp === null &&
      anotarMkt.status === 403,
    "o marketing vê o e-mail mascarado, sem telefone e sem o botão (e não anota)",
    JSON.stringify(vistoPeloMkt?.quem)
  )
  await mkt.pagina.goto(`${PAINEL}/carrinhos?filtro=agora`)
  await mkt.pagina.waitForSelector(`tr[data-carrinho="${ids.pagamento}"]`)
  ok(
    (await mkt.pagina.locator("[data-whatsapp]").count()) === 0 &&
      semEspaco(
        await mkt.pagina.locator(`tr[data-carrinho="${ids.pagamento}"]`).textContent()
      ).includes("O WhatsApp é com o dono e a operação"),
    "na tela do marketing: nenhum botão, e a frase de quem chama"
  )

  titulo("O celular")
  // A sessão do dono, sem pedir outro código (o painel limita os códigos por hora).
  const cel = await novaAba({ width: 390, height: 844 })
  await cel.contexto.addCookies(await dono.contexto.cookies())
  await cel.pagina.goto(`${PAINEL}/carrinhos?filtro=agora`)
  await cel.pagina.waitForSelector(`.cartao[data-carrinho="${ids.pagamento}"]`)
  ok(
    (await cel.pagina.locator(`tr[data-carrinho="${ids.pagamento}"]`).isVisible()) === false &&
      (await semRolagemDeLado(cel.pagina)),
    "no celular, os cartões no lugar da tabela, sem rolagem de lado"
  )

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.join(" | "))
} catch (err) {
  falhou(`o conferidor quebrou: ${err instanceof Error ? err.stack : err}`)
} finally {
  // A equipe da rodada sai (os carrinhos e o pedido ficam, como nos outros conferidores).
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
  pagarme.fechar()
  frenet.fechar()
}

process.exit(resumo())
