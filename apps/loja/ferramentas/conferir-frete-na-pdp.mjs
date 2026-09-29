/**
 * CONFERIDOR DO FRETE NA PÁGINA DO PRODUTO (0208) — a calculadora da caixa
 * de compra: os cartões das entregas, a barra do frete grátis e o produto
 * que completa, numa loja de pé com a Frenet de mentira atrás.
 *
 *   node ferramentas/conferir-frete-na-pdp.mjs
 *
 * Variáveis: LOJA (padrão http://localhost:3000), PORTA_FALSA (a da Frenet
 * falsa, a mesma do `FRENET_URL` do backend) e CHROMIUM. Pede um produto
 * abaixo do piso do frete grátis e a vitrine com algum que fecha a conta —
 * a semente do repo tem os dois.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o cartão de uma entrega parecer botão (os dois têm de ser iguais);   │
 * │ • os cartões estourarem a caixa no celular;                            │
 * │ • o preço, o prazo ou quem entrega na tela não serem os da cotação;    │
 * │ • a barra dizer um "falta" que a sugestão não fecha;                   │
 * │ • o produto sugerido não entrar no Comprar — ou entrar sem aparecer;   │
 * │ • o "Frete grátis garantido" aparecer sem ser verdade;                 │
 * │ • o "Trocar" não devolver o campo.                                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { comAFaixaRespondida } from "./faixa-respondida.mjs"
import { MAIS_BARATA, MAIS_RAPIDA, subirFrenetFalsa } from "./frenet-falsa.mjs"

const LOJA =
  process.env.LOJA ??
  (process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:3000")
const PRODUTO = process.env.PRODUTO ?? "oleo-para-barba"
const CELULAR = { width: 390, height: 844 }

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
const reais = (t) =>
  Number(
    String(t)
      .replace(/[^\d,]/g, "")
      .replace(",", ".")
  )
const brl = (n) => `R$ ${n.toFixed(2).replace(".", ",")}`

const frenet = await subirFrenetFalsa()
const { chromium } = await import("playwright")
const navegador = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
)
comAFaixaRespondida(navegador, LOJA)
const errosDeConsole = []
const RUIDO_DE_DEV = /_next\/hmr|websocket|favicon/i

async function novaAba(viewport = CELULAR) {
  const contexto = await navegador.newContext({ viewport })
  // O "N" do `next dev` mora no canto de baixo e come clique. Produção não tem.
  await contexto.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const estilo = document.createElement("style")
      estilo.textContent = "nextjs-portal{display:none!important}"
      document.head.append(estilo)
    })
  })
  const pagina = await contexto.newPage()
  pagina.on(
    "console",
    (m) => m.type() === "error" && !RUIDO_DE_DEV.test(m.text()) && errosDeConsole.push(m.text())
  )
  return { contexto, pagina }
}

/** Clicar com o alvo no meio da tela: embaixo mora a barra de compra, em cima o cabeçalho. */
async function clicar(alvo) {
  await alvo.evaluate((e) => e.scrollIntoView({ block: "center" }))
  await alvo.click()
}

/** Abre o produto e calcula o CEP — depois de a página hidratar (o campo é controlado). */
async function cotar(pagina, cep = "01310-100") {
  await pagina.goto(`${LOJA}/produtos/${PRODUTO}`, { waitUntil: "load" })
  const campo = pagina.locator(".cep__campo")
  await campo.waitFor({ timeout: 20000 })
  for (let i = 0; i < 20; i++) {
    await campo.fill(cep)
    if (await pagina.locator(".cep__botao:not([disabled])").count()) break
    await pagina.waitForTimeout(300)
  }
  await clicar(pagina.locator(".cep__botao"))
  await pagina.locator(".cep__opcao, .cep__erro").first().waitFor({ timeout: 25000 })
}

try {
  titulo("Depois de calcular, no celular")
  {
    const { contexto, pagina } = await novaAba()
    await cotar(pagina)

    const onde = await pagina.locator(".cep__onde").innerText()
    ok(
      /São Paulo · SP/.test(onde) && /01310-100/.test(onde),
      "o campo vira a linha de onde se cotou: cidade, UF e CEP",
      onde
    )
    ok((await pagina.locator(".cep__campo").count()) === 0, "e o campo sai")

    const cartoes = await pagina.locator(".cep__opcao").evaluateAll((ls) =>
      ls.map((l) => ({
        etiqueta: l.querySelector(".cep__etiqueta")?.textContent?.trim() ?? "",
        preco: l.querySelector(".cep__opcao-preco")?.textContent?.trim() ?? "",
        prazo: l.querySelector(".cep__opcao-prazo")?.textContent?.trim() ?? "",
        quem: l.querySelector(".cep__quem")?.textContent?.trim() ?? "",
        estilo: (() => {
          const c = getComputedStyle(l)
          return `${c.borderTopWidth}|${c.borderTopColor}|${c.boxShadow}|${c.backgroundColor}`
        })(),
        caixa: l.getBoundingClientRect().toJSON(),
      }))
    )
    ok(cartoes.length === 2, "duas entregas, em dois cartões", JSON.stringify(cartoes.length))
    ok(
      cartoes[0]?.etiqueta === "Mais barata" && cartoes[1]?.etiqueta === "Mais rápida",
      "com as etiquetas: mais barata e mais rápida",
      cartoes.map((c) => c.etiqueta).join(" | ")
    )
    ok(
      reais(cartoes[0]?.preco) === MAIS_BARATA && reais(cartoes[1]?.preco) === MAIS_RAPIDA,
      "com o preço da cotação",
      cartoes.map((c) => c.preco).join(" | ")
    )
    ok(
      cartoes.every((c) => /^Chega em \d+ dias? úte(is|l)$/.test(c.prazo)) &&
        cartoes.every((c) => c.quem.length > 0),
      "o prazo e quem entrega em cada um",
      JSON.stringify(cartoes.map((c) => [c.prazo, c.quem]))
    )
    ok(
      cartoes[0]?.estilo === cartoes[1]?.estilo &&
        !/rgb\(18, 24, 31\) \d+px \d+px 0px/.test(cartoes[0]?.estilo ?? ""),
      "os dois cartões iguais, sem sombra — nenhum parece botão",
      cartoes.map((c) => c.estilo).join(" ≠ ")
    )
    const caixa = await pagina.locator(".cep").boundingBox()
    ok(
      cartoes.every(
        (c) => c.caixa.left >= caixa.x && c.caixa.right <= caixa.x + caixa.width + 0.5
      ) && caixa.x + caixa.width <= CELULAR.width,
      "os cartões cabem na caixa, e a caixa na tela do celular",
      JSON.stringify({ caixa, direita: cartoes.map((c) => c.caixa.right) })
    )

    // O que falta, a barra, e o produto que completa.
    const frase = (await pagina.locator(".cep__falta-frase").textContent())
      .replace(/\s+/g, " ")
      .trim()
    const falta = reais(await pagina.locator(".cep__falta-frase mark").innerText())
    ok(
      /^Faltam R\$ [\d.,]+ pro frete grátis$/.test(frase) && falta > 0,
      "diz quanto falta pro frete grátis",
      frase
    )
    const largura = await pagina
      .locator(".cep__barra span")
      .evaluate(
        (e) => e.getBoundingClientRect().width / e.parentElement.getBoundingClientRect().width
      )
    ok(largura > 0 && largura < 1, "e a barra mostra o caminho andado", String(largura))

    const nome = await pagina.locator(".cep__completa-produto").innerText()
    const preco = reais(await pagina.locator(".cep__completa-preco").innerText())
    ok(
      preco >= falta,
      `o produto sugerido fecha sozinho o que falta (${nome}, ${brl(preco)})`,
      `falta ${brl(falta)}`
    )
    ok(
      /e o frete sai grátis/.test(await pagina.locator(".cep__completa-ganho").innerText()),
      "e diz o que a pessoa ganha"
    )

    // Adicionar: o frete fica grátis, e o produto fica à vista.
    await clicar(pagina.locator(".cep__completa-botao"))
    await pagina.locator(".cep__garantido").waitFor({ timeout: 20000 })
    ok(
      /Frete grátis garantido/i.test(await pagina.locator(".cep__garantido").innerText()),
      "adicionar recota, e aparece 'Frete grátis garantido'"
    )
    ok(
      (await pagina.locator(".cep__opcao-preco[data-gratis]").first().innerText()) === "Grátis",
      "a mais barata passa a 'Grátis'"
    )
    ok((await pagina.locator(".cep__falta").count()) === 0, "a barra sai — não falta mais nada")
    ok(
      /vai junto no pedido/.test(await pagina.locator(".cep__completa[data-posto]").innerText()),
      "e o produto posto fica na caixa: 'vai junto no pedido', com Tirar"
    )
    ok(
      /\+1/.test(await pagina.locator(".barra-compra").textContent()),
      "a barra de compra conta o produto a mais"
    )

    // Tirar volta a como era.
    await clicar(pagina.locator(".cep__completa-tirar"))
    await pagina.locator(".cep__completa-botao").waitFor({ timeout: 20000 })
    ok(
      (await pagina.locator(".cep__garantido").count()) === 0,
      "Tirar volta o que falta e a sugestão"
    )

    // Adicionar de novo e comprar: os dois vão pra sacola.
    await clicar(pagina.locator(".cep__completa-botao"))
    await pagina.locator(".cep__garantido").waitFor({ timeout: 20000 })
    await clicar(pagina.locator(".compra__comprar"))
    let itens = []
    for (let i = 0; i < 40 && itens.length < 2; i++) {
      await pagina.waitForTimeout(500)
      const r = await pagina.evaluate(() =>
        fetch("/api/sacola", { cache: "no-store" }).then((x) => x.json())
      )
      itens = r?.carrinho?.itens ?? []
    }
    ok(
      itens.length === 2 && itens.some((i) => i.nome.startsWith(nome.replace(/^\+\s*/, ""))),
      "Comprar põe os dois na sacola: o produto e o que completou o frete",
      JSON.stringify(itens.map((i) => i.nome))
    )
    await contexto.close()
  }

  titulo("Trocar o CEP")
  {
    const { contexto, pagina } = await novaAba()
    await cotar(pagina)
    await clicar(pagina.locator(".cep__trocar"))
    await pagina.locator(".cep__campo").waitFor({ timeout: 5000 })
    ok(
      await pagina.evaluate(() => document.activeElement?.classList.contains("cep__campo")),
      "Trocar volta o campo, com o cursor nele"
    )
    await pagina.locator(".cep__campo").fill("90010-150")
    await clicar(pagina.locator(".cep__botao"))
    await pagina.locator(".cep__onde", { hasText: "90010-150" }).waitFor({ timeout: 25000 })
    ok(
      /Porto Alegre · RS/.test(await pagina.locator(".cep__onde").innerText()),
      "e o CEP novo cota com a cidade dele"
    )
    await contexto.close()
  }

  titulo("No computador")
  {
    const { contexto, pagina } = await novaAba({ width: 1280, height: 900 })
    await cotar(pagina)
    const caixa = await pagina.locator(".cep").boundingBox()
    const lados = await pagina
      .locator(".cep__opcao")
      .evaluateAll((ls) => ls.map((l) => l.getBoundingClientRect().toJSON()))
    ok(
      lados.length === 2 &&
        Math.abs(lados[0].top - lados[1].top) < 1 &&
        lados.every((l) => l.right <= caixa.x + caixa.width + 0.5),
      "os dois cartões lado a lado, dentro da caixa",
      JSON.stringify({ caixa, lados })
    )
    await contexto.close()
  }

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.slice(0, 3).join(" | "))
} finally {
  await navegador.close()
  frenet.fechar?.()
}

console.log(`\n${testes - falhas}/${testes} ${falhas ? "— FALHOU" : "ok"}`)
process.exit(falhas ? 1 : 0)
