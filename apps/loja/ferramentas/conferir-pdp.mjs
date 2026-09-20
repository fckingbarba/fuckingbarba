/**
 * CONFERIDOR DA PDP EDITÁVEL.
 *
 *   node ferramentas/conferir-pdp.mjs [url-da-loja]
 *
 * Variáveis: MEDUSA_BACKEND_URL, NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 *            ADMIN_EMAIL, ADMIN_SENHA, CHROMIUM.
 *
 * ┌─ A PERGUNTA QUE ESTE ARQUIVO RESPONDE ─────────────────────────────────┐
 * │ O texto das oito seções da PDP saiu de um arquivo TypeScript e foi pro │
 * │ `metadata` do produto. Mudança de endereço de conteúdo é onde texto    │
 * │ some sem ninguém notar: uma seção que não foi migrada não dá erro —    │
 * │ ela simplesmente não desenha, e a página continua bonita e mais curta. │
 * │                                                                         │
 * │ Então a conferência não é "a API devolve o que gravei" (isso é         │
 * │ tautologia). É: CADA FRASE da semente aparece na PÁGINA RENDERIZADA.   │
 * │ A semente é o arquivo que foi extraído do TypeScript antes da          │
 * │ migração — ou seja, o texto que estava no ar.                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * A parte que edita mexe no banco e RESTAURA no fim, inclusive se falhar no
 * meio. Sem credencial de admin, ela é pulada.
 */

import { readFileSync } from "node:fs"
import { chromium } from "playwright"

const LOJA = process.argv[2] ?? process.env.LOJA ?? "http://localhost:3000"
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
const CROMO = process.env.CHROMIUM || undefined
const EMAIL = process.env.ADMIN_EMAIL
const SENHA = process.env.ADMIN_SENHA

const SEMENTE = JSON.parse(
  readFileSync(new URL("../../backend/src/scripts/dados/pdp-inicial.json", import.meta.url), "utf8")
)
const COM_CONTEUDO = "fator-de-crescimento-para-barba"
const SEM_CONTEUDO = "oleo-para-barba"

let passou = 0
let falhou = 0
const confere = (nome, ok, detalhe = "") => {
  console.log(`${ok ? "  ok  " : " FALHA"} ${nome}${ok || !detalhe ? "" : `\n         ${detalhe}`}`)
  ok ? passou++ : falhou++
}

/** Toda string que está em qualquer folha do objeto. */
function frasesDe(valor, saida = []) {
  if (typeof valor === "string") saida.push(valor)
  else if (Array.isArray(valor)) valor.forEach((v) => frasesDe(v, saida))
  else if (valor && typeof valor === "object") Object.values(valor).forEach((v) => frasesDe(v, saida))
  return saida
}

/** Normaliza pra comparar TEXTO, não marcação nem renderização. */
const normaliza = (s) =>
  s
    .replace(/ /g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    // O texto editorial marca destaque com *asteriscos*, e o `realce.tsx`
    // os troca por <em>. Na página sobra a palavra, sem eles.
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    // Vários títulos têm `text-transform: uppercase` no CSS. Comparar em
    // maiúscula tira essa diferença dos dois lados de uma vez. Acento
    // continua contando — trocar um é perda de verdade.
    .toLocaleUpperCase("pt-BR")

const navegador = await chromium.launch(CROMO ? { executablePath: CROMO } : {})
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: { "cache-control": "no-cache", pragma: "no-cache" },
})
const pagina = await contexto.newPage()
const erros = []
pagina.on("pageerror", (e) => erros.push(String(e)))

const abrir = async (handle) => {
  const r = await pagina.goto(`${LOJA}/produtos/${handle}?_=${Date.now()}`, {
    waitUntil: "networkidle",
  })
  await pagina.waitForTimeout(400)
  return r?.status() ?? 0
}
/**
 * `textContent`, e NÃO `innerText`.
 *
 * `innerText` devolve o texto RENDERIZADO: ele pula o que está dentro de um
 * `<details>` fechado — e a seção de dúvidas é exatamente isso. Com ele, as
 * dezessete frases do FAQ apareciam como "sumidas" numa migração que não
 * perdeu nada.
 *
 * O que este teste precisa saber é se o conteúdo CHEGOU na página, não se
 * está visível neste instante — e é também o que o buscador lê. Por isso
 * `textContent`, que devolve tudo o que está no DOM.
 *
 * (`textContent` não aplica `text-transform`, então a comparação continua
 * precisando do `toLocaleUpperCase` do normalizador, agora dos dois lados.)
 */
const textoDaPagina = () => pagina.evaluate(() => document.body.textContent ?? "")
const secoesNaTela = () =>
  pagina.$$eval("section[class]", (n) => [
    ...new Set(n.map((e) => e.className.split(" ")[0]).filter((c) => c && !c.includes("__"))),
  ])

try {
  /* ── 1. nada se perdeu na mudança de endereço ────────────────────────── */
  confere(`/produtos/${COM_CONTEUDO} responde 200`, (await abrir(COM_CONTEUDO)) === 200)

  const texto = normaliza(await textoDaPagina())
  const frases = frasesDe(SEMENTE[COM_CONTEUDO])
  /* Handle de produto e nome de foto são referência, não texto exibido —
     eles viram link e imagem, não aparecem escritos na tela. */
  const exibidas = frases.filter((f) => f.includes(" ") && f.length > 3)
  const sumidas = exibidas.filter((f) => !texto.includes(normaliza(f)))

  confere(
    `as ${exibidas.length} frases da semente aparecem na página`,
    sumidas.length === 0,
    sumidas.slice(0, 3).map((f) => `sumiu: "${f.slice(0, 70)}…"`).join("\n         ")
  )

  const secoes = await secoesNaTela()
  const esperadas = Object.keys(SEMENTE[COM_CONTEUDO])
  confere(
    `as ${esperadas.length} seções desenham`,
    esperadas.every((s) => secoes.includes(s)),
    `na tela: ${secoes.join(", ")}`
  )

  /* ── 2. produto sem conteúdo tem PDP enxuta, e isso não é erro ───────── */
  confere(`/produtos/${SEM_CONTEUDO} responde 200`, (await abrir(SEM_CONTEUDO)) === 200)
  const enxuta = await secoesNaTela()
  confere(
    "produto sem conteúdo não desenha seção editorial nenhuma",
    !esperadas.some((s) => enxuta.includes(s)),
    enxuta.join(", ")
  )
  confere("mas a dobra continua de pé", enxuta.includes("pdp"), enxuta.join(", "))

  /* ── 3. editar no admin muda a loja ──────────────────────────────────── */
  if (!EMAIL || !SENHA) {
    console.log("\n  ⚠  sem ADMIN_EMAIL/ADMIN_SENHA — a edição não foi testada")
  } else {
    const entrar = await fetch(`${MEDUSA}/auth/user/emailpass`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: SENHA }),
    })
    if (!entrar.ok) throw new Error(`login do admin falhou: ${entrar.status}`)
    const { token } = await entrar.json()
    const cab = { "content-type": "application/json", authorization: `Bearer ${token}` }

    const { products } = await (
      await fetch(`${MEDUSA}/store/products?handle=${COM_CONTEUDO}&fields=id,handle`, {
        headers: { "x-publishable-api-key": CHAVE },
      })
    ).json()
    const id = products[0].id

    const ler = async () => (await (await fetch(`${MEDUSA}/admin/produtos/${id}/pdp`, { headers: cab })).json()).pdp
    const gravar = async (pdp) =>
      (await (await fetch(`${MEDUSA}/admin/produtos/${id}/pdp`, {
        method: "POST", headers: cab, body: JSON.stringify(pdp),
      })).json())

    const antes = await ler()

    try {
      /* título novo aparece na tela */
      const MARCA = `TESTE ${Date.now()}`
      await gravar({
        ...antes,
        conteudo: { ...antes.conteudo, quem: { ...antes.conteudo.quem, titulo: MARCA } },
      })
      await abrir(COM_CONTEUDO)
      confere("título editado no admin aparece na loja", (await textoDaPagina()).includes(MARCA))

      /* desligar a seção pelo layout a faz sumir */
      await gravar({ ...antes, layout: { visibilidade: { "produto.quem": false } } })
      await abrir(COM_CONTEUDO)
      confere("seção desligada no layout some da página", !(await secoesNaTela()).includes("quem"))

      /* e as outras continuam lá — desligar uma não derruba a página */
      confere(
        "e as outras sete continuam desenhando",
        esperadas.filter((s) => s !== "quem").every((s) => (secoes.includes(s))),
        (await secoesNaTela()).join(", ")
      )

      /* ── fundo de imagem: entra, e a cor da seção continua mandando ── */
      const FOTO = "https://acdn-us.mitiendanube.com/stores/006/689/600/products/pdp-1000x1000-22670c28eafa37f5ea17755696867196-1024-1024.webp"
      await gravar({ ...antes, fundos: { "produto.quem": { imagem: FOTO, veu: 70 } } })
      await abrir(COM_CONTEUDO)
      const embrulho = await pagina.$(".fundo--imagem > .quem")
      confere("seção com imagem ganha o embrulho de fundo", embrulho !== null)
      confere(
        "e a imagem escolhida é a que entra no CSS",
        (await pagina.$eval(".fundo--imagem", (e) => getComputedStyle(e).getPropertyValue("--fundo-imagem"))).includes("pdp-1000x1000"),
      )
      /* O véu é o que preserva o contraste: sem ele a foto crua fica atrás
         do texto. Se um dia alguém tirar o ::after, isto pega. */
      confere(
        "o véu por cima da foto existe",
        await pagina.$eval(".fundo--imagem", (e) => {
          const bg = getComputedStyle(e, "::after").backgroundImage + getComputedStyle(e, "::after").backgroundColor
          return bg.includes("rgb") || bg.includes("gradient")
        })
      )

      /* ── sem imagem, a seção volta a ser exatamente o que era ── */
      await gravar({ ...antes, fundos: {} })
      await abrir(COM_CONTEUDO)
      confere("sem imagem, nenhum embrulho é desenhado", (await pagina.$$(".fundo")).length === 0)

      /* ── quem combina aparece NA CAIXA DE COMPRA, não no carrossel ───── */
      const noCarrossel = () =>
        pagina.$$eval(".colecao--relacionados .produto__nome", (n) =>
          n.map((e) => e.textContent.trim())
        )
      const noJunto = () => pagina.$$eval(".junto__nome", (n) => n.map((e) => e.textContent.trim()))

      await gravar({ ...antes, combinada: {} })
      await abrir(COM_CONTEUDO)
      const vitrine = await noCarrossel()
      confere("sem escolha, o carrossel mostra o resto do catálogo", vitrine.length > 1, String(vitrine.length))
      confere("e a caixa de compra não oferece nada junto", (await noJunto()).length === 0)

      const DOIS = ["oleo-para-barba", "shampoo-para-barba"]
      await gravar({ ...antes, combinada: { produtos: DOIS } })
      await abrir(COM_CONTEUDO)
      const dupla = await noJunto()
      confere("os dois escolhidos aparecem na caixa de compra", dupla.length === 2, dupla.join(" | "))
      confere(
        "cada um com o próprio preço, pra somar sem abrir outra página",
        (await pagina.$$eval(".junto__preco", (n) => n.map((e) => e.textContent ?? ""))).every((t) =>
          t.includes("R$")
        )
      )
      /*
        DESMARCADAS. Caixa pré-marcada vende mais e é a prática que o cliente
        descobre no carrinho — e depois disso ele não confere só aquele item,
        confere a loja inteira.
      */
      confere(
        "e nascem desmarcadas",
        await pagina.$$eval(".junto__item input", (n) => n.every((e) => !e.checked))
      )
      /*
        A ESCOLHA DO ADMIN NÃO ENCOLHE O CARROSSEL. Foi assim por uns dias: a
        mesma lista mandava nos dois lugares, e escolher dois produtos pro
        cross-sell tirava do cliente a única vista do resto do catálogo que a
        PDP oferece — além de mostrar os mesmos dois produtos duas vezes na
        mesma página.
      */
      confere(
        "escolher dois não encolhe o carrossel do fim da página",
        (await noCarrossel()).length === vitrine.length,
        `antes ${vitrine.length}, agora ${(await noCarrossel()).length}`
      )

      await gravar({ ...antes, combinada: { produtos: ["nao-existe-este-handle", "oleo-para-barba"] } })
      await abrir(COM_CONTEUDO)
      confere("handle que não existe mais sai da oferta, o resto fica", (await noJunto()).length === 1)

      /* ── o clique leva o que foi marcado, na MESMA ida ───────────────── */
      await gravar({ ...antes, combinada: { produtos: DOIS } })
      /* Sacola nova: sem isto o teste conta o que sobrou de rodadas passadas. */
      await contexto.clearCookies()
      await abrir(COM_CONTEUDO)
      await pagina.check(".junto__lista li:first-child input")
      await pagina.click(".compra__comprar")
      await pagina.waitForSelector(".sacolinha__item", { timeout: 20_000 })
      await pagina.waitForTimeout(600)
      const naSacola = await pagina.$$eval(".sacolinha__nome", (n) =>
        n.map((e) => e.textContent.trim())
      )
      confere(
        "marcar um e comprar leva os DOIS pra sacola",
        naSacola.length === 2,
        naSacola.join(" | ")
      )
      await contexto.clearCookies()

      /* ── kits: a chave esconde OS DEGRAUS, não a compra ──────────────── */
      await gravar({ ...antes, combinada: { kits: false } })
      await abrir(COM_CONTEUDO)
      confere("kits desligados somem da dobra", (await pagina.$$(".compra__kits")).length === 0)
      /*
        ┌─ AS TRÊS DE BAIXO SÃO UMA REGRESSÃO QUE ESCAPOU ─────────────────┐
        │ A primeira versão da chave zerava a lista de degraus, e a        │
        │ `Compra` faz `if (!degrau) return null`: a coluna inteira sumia  │
        │ — preço, botão, garantias — e sobrava a foto ao lado de um vazio.│
        │                                                                   │
        │ A asserção que existia aqui procurava `.degrau, [data-degrau]`,  │
        │ duas classes que NUNCA existiram no HTML (os degraus são         │
        │ `.compra__kit`). Ela dava `0 <= 1` e passava — inclusive com a   │
        │ página quebrada.                                                 │
        │                                                                   │
        │ Testar pela AUSÊNCIA de algo cobra o nome certo: seletor errado  │
        │ torna a ausência sempre verdadeira. Por isso toda ausência aqui  │
        │ vem acompanhada de uma presença que prova que a tela existe.     │
        └───────────────────────────────────────────────────────────────────┘
      */
      confere("mas o preço continua na tela", (await pagina.$$(".compra__por")).length === 1)
      confere("e o botão de comprar também", (await pagina.$$(".compra__comprar")).length === 1)
      confere(
        "e ele não está desabilitado",
        await pagina.$eval(".compra__comprar", (e) => !e.disabled)
      )

      /* lixo no metadata não derruba a PDP: a seção some, a página fica */
      const sujo = await gravar({
        ...antes,
        conteudo: { ...antes.conteudo, duvidas: { titulo: "Torto", perguntas: "isto não é lista" } },
      })
      confere(
        "seção com lista torta é RECUSADA na gravação",
        sujo.pdp.conteudo.duvidas === undefined,
        JSON.stringify(sujo.pdp.conteudo.duvidas)
      )
      confere(`e a página continua respondendo 200`, (await abrir(COM_CONTEUDO)) === 200)
      confere("sem erro de JavaScript", erros.length === 0, erros.slice(0, 2).join(" | "))
    } finally {
      await gravar(antes)
      console.log("\n  ↩  conteúdo restaurado para o que estava antes")
    }

    const depois = await ler()
    confere(
      "o conteúdo voltou ao que era",
      JSON.stringify(depois) === JSON.stringify(antes),
      "algo ficou diferente depois do teste"
    )
  }
} finally {
  await navegador.close()
}

console.log(`\n${passou} passou, ${falhou} falhou\n`)
process.exit(falhou ? 1 : 0)
