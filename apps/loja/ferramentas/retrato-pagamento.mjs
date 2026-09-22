/**
 * RETRATO DO PAGAMENTO — pra olhar, não pra passar ou falhar.
 *
 *   node ferramentas/retrato-pagamento.mjs
 *
 * Contra um `next build` + `next start` feitos com o `.env.development.local`
 * exportado (o porquê está no `retrato-calculadora.mjs`), e com o backend de
 * pé como o `conferir-pagamento.mjs` pede: Frenet e Pagar.me falsos.
 *
 * Variáveis: LOJA_URL (padrão :3100), CHROMIUM, SAIDA, MEDUSA_BACKEND_URL,
 *            NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL, ADMIN_SENHA,
 *            MEDUSA_WEBHOOK_SEGREDO.
 *
 * Fotografa, em 1440px e em 390px: o passo 3 com Pix e com cartão, a recusa
 * do cartão, o Pix esperando na tela de obrigado, o pedido pago e o pedido
 * cancelado. O comportamento (valores, token, conciliação) quem confere é o
 * `conferir-pagamento.mjs`; aqui é o desenho.
 *
 * Liga o Pagar.me na região pelo admin e devolve como estava no fim.
 */

import { chromium } from "playwright"
import { mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { subirFrenetFalsa } from "./frenet-falsa.mjs"
import { subirPagarmeFalso } from "./pagarme-falso.mjs"

const LOJA = process.env.LOJA_URL ?? "http://127.0.0.1:3100"
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
const CROMO = process.env.CHROMIUM || undefined
const SAIDA = process.env.SAIDA ?? join(tmpdir(), "retratos-pagamento")
const SEGREDO = process.env.MEDUSA_WEBHOOK_SEGREDO ?? "segredo-de-teste"

await mkdir(SAIDA, { recursive: true })
const frenet = await subirFrenetFalsa()
const pagarme = await subirPagarmeFalso({
  webhook: { url: `${MEDUSA}/hooks/payment/pagarme_pagarme`, segredo: SEGREDO },
})

const entrar = await fetch(`${MEDUSA}/auth/user/emailpass`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_SENHA }),
})
const { token } = await entrar.json()
const cabAdmin = { "content-type": "application/json", authorization: `Bearer ${token}` }
const cabLoja = { "content-type": "application/json", "x-publishable-api-key": CHAVE }
const adm = async (c, o = {}) => (await fetch(`${MEDUSA}${c}`, { headers: cabAdmin, ...o })).json()
const loja = async (c, o = {}) => (await fetch(`${MEDUSA}${c}`, { headers: cabLoja, ...o })).json()

const { regions } = await adm("/admin/regions?fields=id,currency_code,*payment_providers")
const regiao = regions.find((r) => r.currency_code === "brl")
const antes = (regiao.payment_providers ?? []).map((p) => p.id)
await adm(`/admin/regions/${regiao.id}`, {
  method: "POST",
  body: JSON.stringify({ payment_providers: ["pp_pagarme_pagarme"] }),
})

const navegador = await chromium.launch(CROMO ? { executablePath: CROMO } : {})

async function sacola(contexto) {
  const { products } = await loja(
    `/store/products?handle=shampoo-para-barba&region_id=${regiao.id}&fields=*variants`
  )
  const { cart } = await loja("/store/carts", {
    method: "POST",
    body: JSON.stringify({ region_id: regiao.id }),
  })
  await loja(`/store/carts/${cart.id}/line-items`, {
    method: "POST",
    body: JSON.stringify({ variant_id: products[0].variants[0].id, quantity: 2 }),
  })
  await contexto.addCookies([{ name: "carrinho", value: cart.id, url: LOJA }])
}

/**
 * Envia o passo pelo botão que estiver à vista: no celular, o de dentro do
 * passo some e quem manda é a barra fixa do rodapé.
 */
async function enviar(pagina, form) {
  const doPasso = pagina.locator(`${form} button[type=submit]`)
  if (await doPasso.isVisible()) await doPasso.click()
  else await pagina.locator(".barra__btn").click()
}

async function ateOPagamento(pagina) {
  await pagina.goto(`${LOJA}/checkout`, { waitUntil: "networkidle" })
  const campo = (n) => pagina.locator(`.fluxo [name="${n}"]`)
  await campo("email").fill("retrato@fuckingbarba.invalid")
  await campo("nome").fill("Matheus")
  await campo("sobrenome").fill("Retrato")
  await campo("telefone").fill("(11) 99999-9999")
  await campo("documento").fill("111.444.777-35")
  await enviar(pagina, "#form-contato")
  await pagina.locator("#form-entrega").waitFor({ timeout: 25000 })
  await campo("cep").fill("01310-100")
  await pagina.waitForFunction(() => document.querySelector('.fluxo [name="rua"]')?.value, null, {
    timeout: 25000,
  })
  await pagina.locator("#form-entrega .opcao").first().waitFor({ timeout: 25000 })
  await campo("numero").fill("1578")
  await enviar(pagina, "#form-entrega")
  await pagina.locator("#form-pagamento").waitFor({ timeout: 25000 })
  await pagina.waitForTimeout(500)
}

async function cartao(pagina, numero) {
  await pagina.locator("#form-pagamento .opcao", { hasText: "Cartão" }).locator("input").check()
  const campos = pagina.locator(".pagamento__painel[data-ativo] input")
  await campos.nth(0).fill(numero)
  await campos.nth(1).fill("Matheus Retrato")
  await campos.nth(2).fill("12/30")
  await campos.nth(3).fill("737")
  await pagina.locator("#parcelas").selectOption("3")
}

const pagar = (pagina) => enviar(pagina, "#form-pagamento")

/** Os pedidos das fotos, pra cancelar no fim e devolver o estoque. */
const pedidos = new Set()
const anotar = (pagina) => pedidos.add(pagina.url().split("/").pop())

const foto = (pagina, nome, alvo) =>
  (alvo ? pagina.locator(alvo) : pagina).screenshot({
    path: join(SAIDA, `${nome}.png`),
    ...(alvo ? {} : { fullPage: true }),
  })

try {
  for (const [tela, largura, altura] of [
    ["desktop", 1440, 1100],
    ["celular", 390, 900],
  ]) {
    const novo = async () => {
      const contexto = await navegador.newContext({
        viewport: { width: largura, height: altura },
        deviceScaleFactor: 2,
      })
      await sacola(contexto)
      return { contexto, pagina: await contexto.newPage() }
    }

    // Passo 3 com Pix, e o Pix esperando.
    {
      const { contexto, pagina } = await novo()
      await ateOPagamento(pagina)
      await foto(pagina, `passo3-pix-${tela}`, "#form-pagamento")
      await pagar(pagina)
      await pagina.waitForURL(/obrigado/, { timeout: 45000 })
      anotar(pagina)
      await pagina.locator(".feito__validade", { hasText: "Vale" }).waitFor({ timeout: 15000 })
      await foto(pagina, `obrigado-pix-${tela}`)
      const pedidoId = pagina.url().split("/").pop()
      // Pelo admin: pela loja, quem só tem o id lê a versão pública, sem a sessão.
      const { order } = await adm(
        `/admin/orders/${pedidoId}?fields=id,*payment_collections,*payment_collections.payment_sessions`
      )
      const sessao = order.payment_collections[0].payment_sessions[0].id
      await pagarme.pagar(pagarme.pedidoPorCodigo(sessao).pedido.id)
      await pagina.locator(".feito h1", { hasText: "confirmado" }).waitFor({ timeout: 40000 })
      await foto(pagina, `obrigado-pix-pago-${tela}`, ".feito")
      await contexto.close()
    }

    // Cartão: o formulário, a recusa, e o aprovado.
    {
      const { contexto, pagina } = await novo()
      await ateOPagamento(pagina)
      await cartao(pagina, "4000 0000 0000 0028")
      await foto(pagina, `passo3-cartao-${tela}`, "#form-pagamento")
      await pagar(pagina)
      await pagina.locator("#form-pagamento .erros-envio").waitFor({ timeout: 45000 })
      await pagina.locator("#form-pagamento .erros-envio").scrollIntoViewIfNeeded()
      await foto(pagina, `passo3-recusado-${tela}`, "#form-pagamento")
      await pagina
        .locator(".pagamento__painel[data-ativo] input")
        .nth(0)
        .fill("4000 0000 0000 0010")
      await pagina.locator(".pagamento__painel[data-ativo] input").nth(3).fill("737")
      await pagar(pagina)
      await pagina.waitForURL(/obrigado/, { timeout: 45000 })
      anotar(pagina)
      await pagina.locator(".feito h1").waitFor()
      await foto(pagina, `obrigado-cartao-${tela}`)
      await contexto.close()
    }
  }

  // O Pix que venceu, depois da conciliação.
  {
    const contexto = await navegador.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 2,
    })
    await sacola(contexto)
    const pagina = await contexto.newPage()
    await ateOPagamento(pagina)
    await pagar(pagina)
    await pagina.waitForURL(/obrigado/, { timeout: 45000 })
    const pedidoId = pagina.url().split("/").pop()
    const { order } = await adm(
      `/admin/orders/${pedidoId}?fields=id,*payment_collections,*payment_collections.payment_sessions`
    )
    const registro = pagarme.pedidoPorCodigo(order.payment_collections[0].payment_sessions[0].id)
    await pagarme.envelhecer(registro.pedido.id)
    await adm("/admin/pagamentos/conciliar", { method: "POST" })
    await pagina.reload({ waitUntil: "networkidle" })
    await foto(pagina, "obrigado-cancelado-desktop", ".feito")
    await contexto.close()
  }
} catch (e) {
  console.log(`  ✗ ${e instanceof Error ? e.message.split("\n")[0] : e}`)
} finally {
  for (const id of pedidos) {
    await adm(`/admin/orders/${id}/cancel`, { method: "POST" }).catch(() => null)
  }
  await adm(`/admin/regions/${regiao.id}`, {
    method: "POST",
    body: JSON.stringify({ payment_providers: antes }),
  })
  await navegador.close()
  frenet.fechar()
  pagarme.fechar()
}

console.log(`  fotos em ${SAIDA}`)
