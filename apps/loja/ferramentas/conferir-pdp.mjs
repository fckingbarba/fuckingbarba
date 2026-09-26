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
 * │ tautologia). É: CADA FRASE do arquivo aparece na PÁGINA RENDERIZADA.   │
 * │ Desde a entrega 0105 o arquivo é o `secoes-da-pdp.json` — as sete      │
 * │ seções de todos os produtos, que a migração grava —, conferido em cada │
 * │ produto que existe no banco local (a semente tem seis; o ar, 15).      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Desde a entrega 0114 ele também passa o DEDO na foto grande, no celular
 * (bloco 2): no celular, só os pontos embaixo dela trocavam a foto.
 *
 * A parte que edita mexe no banco e RESTAURA no fim, inclusive se falhar no
 * meio. Sem credencial de admin, ela é pulada.
 */

import { readFileSync } from "node:fs"
import { chromium } from "playwright"
import { vigiarRecargaDoDev } from "./recarga-do-dev.mjs"

const LOJA = process.argv[2] ?? process.env.LOJA ?? "http://localhost:3000"
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
const CROMO = process.env.CHROMIUM || undefined
const EMAIL = process.env.ADMIN_EMAIL
const SENHA = process.env.ADMIN_SENHA

/** As sete seções de cada produto, como a migração `secoes-da-pdp.ts` grava. */
const ARQUIVO = JSON.parse(
  readFileSync(
    new URL("../../backend/src/scripts/dados/secoes-da-pdp.json", import.meta.url),
    "utf8"
  )
)
const SECOES_ESCRITAS = ["promessa", "tempo", "rotina", "funciona", "versus", "quem", "duvidas"]
/** O texto de um produto, com o `copiaDe` dos kits resolvido. */
function textosDe(handle) {
  const proprio = ARQUIVO[handle] ?? {}
  const base = proprio.copiaDe ? textosDe(proprio.copiaDe) : {}
  return Object.fromEntries(
    SECOES_ESCRITAS.map((s) => [s, proprio[s] ?? base[s]]).filter(([, v]) => v)
  )
}
const COM_CONTEUDO = "fator-de-crescimento-para-barba"
/** O produto que o teste da página enxuta esvazia (e devolve no fim). */
const ENXUTO = "oleo-para-barba"

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
  else if (valor && typeof valor === "object")
    Object.values(valor).forEach((v) => frasesDe(v, saida))
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
/*
  E O CONSOLE, de todas as abas. Aviso do React não é exceção — não cai no
  `pageerror` —, é `console.error`: a chave repetida dos cartões de
  quantidade (desde 22/09) aparecia em toda PDP sem este arquivo ver, e quem
  achou foi o conferidor de checkout, de passagem. O websocket de recarga do
  `next dev` não conecta aqui e não é erro da loja. Nem o aviso do React que a
  recarga dele causa no meio da hidratação, quando um produto acabou de ser
  publicado ou apagado (os conferidores do painel) — ver `recarga-do-dev.mjs`.
*/
const noConsole = []
const RUIDO_DE_DEV = /_next\/hmr|websocket/i
const recargaDoDev = vigiarRecargaDoDev(contexto)
contexto.on(
  "console",
  (m) =>
    m.type() === "error" &&
    !RUIDO_DE_DEV.test(m.text()) &&
    !recargaDoDev(m) &&
    noConsole.push(m.text())
)

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
  /* ── 1. o texto de cada produto chegou na página dele ────────────────── */
  const esperadas = SECOES_ESCRITAS
  let conferidos = 0
  for (const handle of Object.keys(ARQUIVO)) {
    const status = await abrir(handle)
    // O banco local da semente tem seis produtos; os outros nove só existem no ar.
    if (status === 404) continue
    conferidos++
    const texto = normaliza(await textoDaPagina())
    /* Handle de produto e foto escolhida são referência, não texto exibido —
       eles viram link e imagem, não aparecem escritos na tela. */
    const exibidas = frasesDe(textosDe(handle)).filter((f) => f.includes(" ") && f.length > 3)
    const sumidas = exibidas.filter((f) => !texto.includes(normaliza(f)))
    const naTela = await secoesNaTela()
    confere(
      `${handle}: as ${esperadas.length} seções desenham, com as ${exibidas.length} frases do arquivo`,
      status === 200 && sumidas.length === 0 && esperadas.every((s) => naTela.includes(s)),
      [
        `HTTP ${status} · na tela: ${naTela.join(", ")}`,
        ...sumidas.slice(0, 3).map((f) => `sumiu: "${f.slice(0, 70)}…"`),
      ].join("\n         ")
    )
  }
  confere("o banco local tem produto com o texto do arquivo", conferidos > 0, "nenhum achado")

  /* ── 2. a foto grande passa no dedo, no celular ─────────────────────────
     O arrasto vai pelo CDP (`Input.dispatchTouchEvent`), que passa pela
     rolagem de verdade do navegador: um TouchEvent montado no DOM não rola
     nada, e deixaria passar o trilho quebrado. */
  const { products: comFotos = [] } = await (
    await fetch(`${MEDUSA}/store/products?limit=50&fields=handle,images.url`, {
      headers: { "x-publishable-api-key": CHAVE },
    })
  ).json()
  const doDedo = comFotos
    .filter((p) => (p.images?.length ?? 0) >= 2)
    .sort((a, b) => b.images.length - a.images.length)[0]
  if (!doDedo) {
    console.log("\n  ⚠  nenhum produto com duas fotos no banco — o dedo na galeria não foi testado")
  } else {
    const handle = doDedo.handle
    const total = doDedo.images.length
    const html = await (await fetch(`${LOJA}/produtos/${handle}?_=${Date.now()}`)).text()
    const noTrilho =
      html.split('class="galeria__trilho"')[1]?.split('class="galeria__miniaturas"')[0] ?? ""
    const fotosNoHtml = (noTrilho.match(/class="galeria__slide/g) ?? []).length
    const imagensNoHtml = (noTrilho.match(/<img/g) ?? []).length
    confere(
      `${handle}: das ${total} fotos do palco, só a primeira vem no HTML (é o LCP)`,
      fotosNoHtml === total && imagensNoHtml === 1 && /fetchpriority="high"/i.test(noTrilho),
      JSON.stringify({ fotosNoHtml, imagensNoHtml })
    )

    const celular = await navegador.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      extraHTTPHeaders: { "cache-control": "no-cache", pragma: "no-cache" },
    })
    const recargaNoCelular = vigiarRecargaDoDev(celular)
    celular.on(
      "console",
      (m) =>
        m.type() === "error" &&
        !RUIDO_DE_DEV.test(m.text()) &&
        !recargaNoCelular(m) &&
        noConsole.push(m.text())
    )
    try {
      const cel = await celular.newPage()
      const cdp = await celular.newCDPSession(cel)
      await cel.goto(`${LOJA}/produtos/${handle}?_=${Date.now()}`, { waitUntil: "load" })
      const estado = () =>
        cel.evaluate(() => {
          const t = document.querySelector(".galeria__trilho")
          return {
            // Sem trilho (o palco de antes, parado), a foto é -1: as checagens falham sem derrubar a rodada.
            foto: t ? Math.round((t.scrollLeft / t.clientWidth) * 100) / 100 : -1,
            ponto: [...document.querySelectorAll(".galeria__mini")].findIndex(
              (b) => b.getAttribute("aria-current") === "true"
            ),
            y: Math.round(scrollY),
          }
        })
      /** Espera o trilho parar inteiro na foto `i`, com o ponto marcando ela. */
      const parouEm = async (i) => {
        for (let n = 0; n < 40; n++) {
          const e = await estado()
          if (e.foto === i && e.ponto === i) return true
          await cel.waitForTimeout(100)
        }
        return false
      }
      const dedo = async (de, ate, passos = 12) => {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [de] })
        for (let k = 1; k <= passos; k++) {
          const x = de.x + ((ate.x - de.x) * k) / passos
          const y = de.y + ((ate.y - de.y) * k) / passos
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] })
          await cel.waitForTimeout(16)
        }
      }
      const soltar = async () => {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        await cel.waitForTimeout(900)
      }

      // A primeira foto é o LCP: a segunda só é PEDIDA depois que a página carregou.
      const segunda = await cel
        .waitForFunction(
          () => {
            const img = document.querySelectorAll(".galeria__slide")[1]?.querySelector("img")
            return Boolean(img?.complete && img.naturalWidth > 0)
          },
          null,
          { timeout: 15000 }
        )
        .then(
          () =>
            cel.evaluate(() => {
              const img = document.querySelectorAll(".galeria__slide")[1].querySelector("img")
              const pedido = performance.getEntriesByName(img.currentSrc)[0]
              const pagina = performance.getEntriesByType("navigation")[0]
              return {
                pediuEm: Math.round(pedido?.startTime ?? -1),
                carregouEm: Math.round(pagina?.loadEventStart ?? -1),
              }
            }),
          () => null
        )
      confere(
        "a segunda foto baixa, mas só é pedida depois que a página carregou",
        segunda !== null && segunda.carregouEm > 0 && segunda.pediuEm >= segunda.carregouEm,
        JSON.stringify(segunda)
      )
      const palco = await cel.locator(".galeria__palco").boundingBox()
      const meio = { x: palco.x + palco.width / 2, y: palco.y + palco.height / 2 }
      const direita = { x: palco.x + palco.width * 0.85, y: meio.y }
      const esquerda = { x: palco.x + palco.width * 0.15, y: meio.y }

      await dedo(direita, { x: direita.x - 90, y: meio.y }, 6)
      // O dedo para antes de soltar: sem impulso, o arrasto curto volta (o peteleco rápido passa).
      await cel.waitForTimeout(200)
      const noMeioDoArrasto = (await estado()).foto
      await soltar()
      confere(
        "a foto acompanha o dedo, e o arrasto curto e lento volta pra mesma",
        noMeioDoArrasto > 0.05 && (await parouEm(0)),
        JSON.stringify({ noMeioDoArrasto, depois: await estado() })
      )
      await dedo(direita, esquerda)
      await soltar()
      confere(
        "o dedo pra esquerda passa pra próxima foto, e o ponto marca ela",
        await parouEm(1),
        JSON.stringify(await estado())
      )
      await dedo(esquerda, direita)
      await soltar()
      confere("o dedo pra direita volta uma", await parouEm(0), JSON.stringify(await estado()))
      const antes = await estado()
      await dedo({ x: meio.x, y: meio.y + 150 }, { x: meio.x + 4, y: meio.y - 150 })
      await soltar()
      const depois = await estado()
      confere(
        "arrastar pra cima em cima da foto rola a página, e a foto fica",
        depois.y > antes.y + 100 && depois.foto === 0 && depois.ponto === 0,
        JSON.stringify({ antes, depois })
      )
      await cel.evaluate(() => scrollTo(0, 0))
      await cel.waitForTimeout(300)

      await dedo(direita, esquerda)
      await soltar()
      await parouEm(1)
      await cel.touchscreen.tap(meio.x, meio.y)
      const contador = cel.locator('.galeria__zoom-conta [aria-hidden="true"]')
      const noZoom = async () => (await contador.textContent())?.replace(/\s+/g, " ").trim()
      await contador.waitFor({ timeout: 3000 }).catch(() => {})
      confere(
        "o toque amplia a foto que está à vista",
        (await cel.evaluate(() => document.querySelector(".galeria__zoom")?.open)) &&
          (await noZoom()) === `2 / ${total}`,
        await noZoom()
      )
      await cel.locator(".galeria__zoom-seta--depois").click()
      await cel.keyboard.press("Escape")
      const ultimaVista = 2 % total
      confere(
        "fechando o zoom, a foto grande é a última vista nele",
        await parouEm(ultimaVista),
        JSON.stringify(await estado())
      )
      const outra = ultimaVista === 0 ? 1 : 0
      await cel.locator(".galeria__mini").nth(outra).tap()
      confere("o ponto leva até a foto", await parouEm(outra), JSON.stringify(await estado()))
      confere(
        "a página não rola de lado",
        await cel.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      )
    } finally {
      await celular.close()
    }
  }

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

    const ler = async () =>
      (await (await fetch(`${MEDUSA}/admin/produtos/${id}/pdp`, { headers: cab })).json()).pdp
    const gravar = async (pdp) =>
      await (
        await fetch(`${MEDUSA}/admin/produtos/${id}/pdp`, {
          method: "POST",
          headers: cab,
          body: JSON.stringify(pdp),
        })
      ).json()

    const antes = await ler()

    /* ── a política de frete, pra testar a tarja nos três modos ───────────
     *
     * A TARJA É UMA OFERTA, e no art. 30 do CDC oferta vincula. Por isso o
     * que se confere aqui não é "a tarja aparece": é que ela aparece só onde
     * o piso é alcançado, que ela DIZ o que a política diz (grátis ou o
     * preço fixo), e que ela SOME inteira quando não há promoção nenhuma.
     *
     * O número que ela mostra é comparado com o piso vindo da API, não com
     * outra conta feita aqui dentro — senão o teste e a tela erram juntos.
     */
    const configuracoesDaLoja = async () =>
      (
        await (
          await fetch(`${MEDUSA}/store/configuracoes`, {
            headers: { "x-publishable-api-key": CHAVE },
          })
        ).json()
      ).configuracoes

    const gravarFrete = async (frete, resto) => {
      const r = await fetch(`${MEDUSA}/admin/configuracoes`, {
        method: "POST",
        headers: cab,
        body: JSON.stringify({ frete, empresa: resto.empresa, atendimento: resto.atendimento }),
      })
      if (!r.ok) throw new Error(`gravar política falhou: ${r.status}`)
      /* A loja é avisada com perfil "seconds": chega na primeira requisição,
         mas a ida do backend até o /api/revalidar não é instantânea. */
      await pagina.waitForTimeout(700)
    }

    const emDigitos = (s) => Number(s.replace(/[^\d,]/g, "").replace(",", "."))

    /** `caixa(modo)`: grava a caixa de compra com os cartões ("unidades") ou o leve junto. */
    async function conferirTarjas(caixa) {
      const config = await configuracoesDaLoja()
      const original = config.frete
      const PISO = 139.9

      try {
        /* 1. FRETE GRÁTIS — o modo que está no ar hoje. */
        await gravarFrete(
          { modo: "gratis", piso: PISO, alvo: "mais-barata", tetoDeCusto: null },
          config
        )
        await caixa("unidades")
        await abrir(COM_CONTEUDO)

        /*
          O MEDIDOR DE "FALTAM R$ X" SAIU DAQUI, e no lugar entrou a
          calculadora de CEP. Estas duas asserções ficam pra garantir que a
          troca não desfez: uma cobra que a calculadora está na tela, a
          outra que a barrinha não voltou junto — duas caixas sobre frete na
          mesma coluna empurram o botão de comprar pra fora da primeira tela
          no celular.
        */
        confere(
          "a calculadora de CEP está na caixa de compra",
          (await pagina.$(".cep__campo")) !== null
        )
        confere(
          "e o medidor de 'faltam R$ X' não voltou junto",
          (await pagina.$(".medidor")) === null
        )
        /*
          A ressalva do "vale só na opção mais barata" mudou de casa junto
          com o medidor, e mudou de novo em 23/09: saiu das garantias da
          caixa de compra a pedido da loja — qual entrega sai de graça a
          pessoa vê em números na calculadora, e de novo na sacola e no
          checkout, onde escolhe. Ela continua valendo, e continua escrita
          nas Dúvidas (a resposta sobre o frete). É lá que se confere agora:
          aqui, desde então, esta checagem falhava cobrando o texto tirado.
        */
        await pagina.goto(`${LOJA}/duvidas?_=${Date.now()}`, { waitUntil: "networkidle" })
        confere(
          "a ressalva do alvo continua escrita em algum lugar — nas Dúvidas",
          (await textoDaPagina()).includes("opção de entrega mais barata")
        )
        await abrir(COM_CONTEUDO)

        const kits = await pagina.$$eval(".compra__kit", (n) =>
          n.map((e) => ({
            nome: e.querySelector(".compra__kit-nome")?.textContent?.trim() ?? "",
            tarja: e.querySelector(".tarja-frete")?.textContent?.trim() ?? null,
          }))
        )
        confere(
          "tarja só nos kits que alcançam o piso",
          kits.length === 3 &&
            kits[0].tarja === null &&
            /grátis/i.test(kits[1].tarja ?? "") &&
            /grátis/i.test(kits[2].tarja ?? ""),
          JSON.stringify(kits)
        )

        /*
          Com os preços de hoje, NENHUM dos dois fecha a conta sozinho
          (79,90 + 39,90 e 79,90 + 49,90 ficam abaixo de 139,90) — e marcar
          um faz o outro alcançar. É o caso que prova que a tarja depende do
          que está marcado, e não de uma conta fixa por produto.
        */
        await caixa("junto")
        await abrir(COM_CONTEUDO)
        confere(
          "nenhum item que combina fecha a conta sozinho",
          (await pagina.$$(".junto__item .tarja-frete")).length === 0
        )

        await pagina.check(".junto__lista li:first-child input")
        await pagina.waitForTimeout(350)
        const acesas = await pagina.$$eval(".junto__item", (n) =>
          n.map((e) => e.querySelector(".tarja-frete") !== null)
        )
        confere(
          "marcar um acende a tarja do outro",
          acesas[0] === false && acesas[1] === true,
          JSON.stringify(acesas)
        )

        await pagina.check(".junto__lista li:nth-child(2) input")
        await pagina.waitForTimeout(450)
        /*
          Com os dois marcados o pedido passa do piso. Quem responde isso
          agora são as TARJAS: as duas continuam acesas, porque tirar
          qualquer um dos dois derruba o frete grátis — ou seja, os dois são
          responsáveis por ele. Antes quem respondia era o medidor virando
          "conseguiu"; o medidor saiu e a pergunta continua valendo.
        */
        const aindaAcesas = await pagina.$$eval(".junto__item", (n) =>
          n.map((e) => e.querySelector(".tarja-frete") !== null)
        )
        confere(
          "com os dois marcados, as duas tarjas continuam de pé",
          aindaAcesas.length === 2 && aindaAcesas.every(Boolean),
          JSON.stringify(aindaAcesas)
        )

        /* 2. FRETE FIXO — a tarja diz o preço, não "grátis". */
        await gravarFrete(
          { modo: "fixo", piso: PISO, preco: 9.9, alvo: "todas", tetoDeCusto: null },
          config
        )
        await caixa("unidades")
        await abrir(COM_CONTEUDO)
        const fixas = await pagina.$$eval(".tarja-frete", (n) =>
          n.map((e) => e.textContent?.trim() ?? "")
        )
        confere(
          "com frete fixo a tarja diz o preço, e nunca 'grátis'",
          fixas.length > 0 && fixas.every((t) => t.includes("9,90") && !/grátis/i.test(t)),
          fixas.join(" | ")
        )

        /* 3. SEM POLÍTICA — não sobra promessa nenhuma na tela. */
        await gravarFrete({ modo: "nenhuma" }, config)
        await abrir(COM_CONTEUDO)
        confere(
          "sem política, some a tarja, o medidor e o selo das garantias",
          (await pagina.$$(".tarja-frete")).length === 0 &&
            (await pagina.$(".medidor")) === null &&
            !(await textoDaPagina()).includes("Frete grátis")
        )
      } finally {
        await gravarFrete(original, config)
        console.log("  ↩  política de frete restaurada")
      }
    }

    /**
     * OS TRÊS CARTÕES DE QUANTIDADE SÃO UMA GRADE SÓ.
     *
     * Cada cartão é `subgrid` de cinco linhas compartilhadas, então bolinha,
     * nome, preço e tarja ficam na mesma altura nos três mesmo que um tenha
     * fita e outro não, ou um tenha duas linhas de descrição e outro uma.
     *
     * Antes disso a fita — que só um cartão ganha — empurrava o conteúdo
     * DAQUELE cartão uns 30px pra baixo. Como o desencontro é de poucos
     * pixels e não quebra nada, ele passa por revisão de código e por
     * screenshot em tamanho pequeno; quem vê é o cliente, na tela cheia.
     * Por isso vira medida, e não olhar.
     *
     * A tolerância de 3px é o cartão marcado, que sobe 2px de propósito
     * (`transform: translate(-2px, -2px)` — a sombra dura da marca).
     */
    async function conferirAlinhamento() {
      const FOLGA = 3
      for (const largura of [1440, 400]) {
        const aba = await contexto.newPage()
        await aba.setViewportSize({ width: largura, height: 900 })
        await aba.goto(`${LOJA}/produtos/${COM_CONTEUDO}?_=${Date.now()}`, {
          waitUntil: "networkidle",
        })
        await aba.waitForTimeout(500)

        const medir = (seletor) =>
          aba.$$eval(seletor, (n) =>
            n.map((e) => {
              const r = e.getBoundingClientRect()
              return { topo: Math.round(r.top), alt: Math.round(r.height) }
            })
          )
        const espalhamento = (v) => Math.max(...v) - Math.min(...v)

        const cartoes = await medir(".compra__kit")
        confere(
          `${largura}px · os três cartões têm a mesma altura`,
          cartoes.length === 3 && espalhamento(cartoes.map((c) => c.alt)) === 0,
          JSON.stringify(cartoes)
        )

        for (const [nome, seletor] of [
          ["a bolinha", ".compra__kit input"],
          ["o nome", ".compra__kit-nome"],
          ["o preço", ".compra__kit-preco"],
        ]) {
          const caixas = await medir(seletor)
          confere(
            `${largura}px · ${nome} na mesma altura nos três`,
            caixas.length === 3 && espalhamento(caixas.map((c) => c.topo)) <= FOLGA,
            JSON.stringify(caixas)
          )
        }
        await aba.close()
      }

      /* A linha de apoio do avulso é do admin, e o avulso não tem de onde
         tirar sozinho: o `subtitle` dele descreve o produto, não a
         quantidade. Sem esta, o campo poderia sumir do contrato sem que
         nada reclamasse — só o cartão voltaria a ficar vazio. */
      await abrir(COM_CONTEUDO)
      const apoio = await pagina.$$eval(".compra__kit-abaixo", (n) =>
        n.map((e) => e.textContent?.trim() ?? "")
      )
      confere(
        "a linha escrita no admin aparece embaixo de '1 frasco'",
        apoio[0] === "1 mês de uso",
        apoio.join(" | ")
      )
    }

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

      /* e as outras continuam lá — desligar uma não derruba a página (olhando a
         tela de AGORA: até a 0105 olhava a de antes de desligar, e passava sempre) */
      const semQuem = await secoesNaTela()
      confere(
        `e as outras ${esperadas.length - 1} continuam desenhando`,
        esperadas.filter((s) => s !== "quem").every((s) => semQuem.includes(s)),
        semQuem.join(", ")
      )

      /* ── fundo de imagem: entra, e a cor da seção continua mandando ──
       *
       * A foto tem que morar no armazenamento da loja: endereço de fora o
       * admin descarta na gravação, e a loja na leitura (o otimizador de
       * imagem só abre os hosts dela). Serve a foto do próprio produto. */
      const { products: comFoto } = await (
        await fetch(`${MEDUSA}/store/products?handle=${COM_CONTEUDO}&fields=thumbnail`, {
          headers: { "x-publishable-api-key": CHAVE },
        })
      ).json()
      const FOTO = comFoto[0].thumbnail
      const ARQUIVO = new URL(FOTO).pathname.split("/").pop()
      await gravar({
        ...antes,
        fundos: { "produto.quem": { imagem: FOTO, imagemCelular: FOTO, veu: 70 } },
      })
      await abrir(COM_CONTEUDO)
      const embrulho = await pagina.$(".fundo--imagem > .quem")
      confere("seção com imagem ganha o embrulho de fundo", embrulho !== null)
      confere(
        "e a imagem escolhida é a que entra, pelo otimizador de imagem",
        await pagina.$eval(
          ".fundo--imagem .fundo__imagem img",
          (img, arquivo) => decodeURIComponent(img.getAttribute("src") ?? "").includes(arquivo),
          ARQUIVO
        )
      )
      /* O "Pra quem é" vira uma coluna só até 859 px (pdp-quem.css): é até
         aí que a foto do celular vale, e não no 767 das outras. */
      confere(
        "a do celular vale até o corte desta seção (859 px)",
        (await pagina.$eval(".fundo__imagem source", (s) => s.media)) === "(max-width: 859px)"
      )
      confere(
        "a foto fica atrás, cobrindo a seção, e o véu é o escolhido (70)",
        await pagina.$eval(".fundo--imagem", (e) => {
          const foto = getComputedStyle(e.querySelector(".fundo__imagem"))
          return (
            foto.position === "absolute" &&
            foto.zIndex === "-1" &&
            getComputedStyle(e).getPropertyValue("--veu").trim() === "70"
          )
        })
      )
      /* O véu é o que preserva o contraste: sem ele a foto crua fica atrás
         do texto. Se um dia alguém tirar o ::after, isto pega. */
      confere(
        "o véu por cima da foto existe",
        await pagina.$eval(".fundo--imagem", (e) => {
          const bg =
            getComputedStyle(e, "::after").backgroundImage +
            getComputedStyle(e, "::after").backgroundColor
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
      confere(
        "sem escolha, o carrossel mostra o resto do catálogo",
        vitrine.length > 1,
        String(vitrine.length)
      )
      confere("e a caixa de compra não oferece nada junto", (await noJunto()).length === 0)

      /* A CAIXA DE COMPRA É UMA COISA OU OUTRA (decidido em 23/09): os
         cartões de quantidade OU o leve junto, no mesmo lugar. Salvo antes
         da escolha (sem `modo`), vale o que a loja mostrava: os cartões. */
      const DOIS = ["oleo-para-barba", "shampoo-para-barba"]
      await gravar({ ...antes, combinada: { produtos: DOIS } })
      await abrir(COM_CONTEUDO)
      confere(
        "salvo antes da escolha, com produtos: os cartões, sem leve junto",
        (await pagina.$$(".compra__kit")).length === 3 && (await noJunto()).length === 0
      )
      await gravar({ ...antes, combinada: { modo: "junto", produtos: DOIS } })
      await abrir(COM_CONTEUDO)
      const dupla = await noJunto()
      confere(
        "os dois escolhidos aparecem na caixa de compra",
        dupla.length === 2,
        dupla.join(" | ")
      )
      confere(
        "e os cartões de quantidade saem do lugar",
        (await pagina.$$(".compra__kits")).length === 0 &&
          (await pagina.$$(".compra__comprar")).length === 1
      )
      confere(
        "cada um com o próprio preço, pra somar sem abrir outra página",
        (await pagina.$$eval(".junto__preco", (n) => n.map((e) => e.textContent ?? ""))).every(
          (t) => t.includes("R$")
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

      await gravar({
        ...antes,
        combinada: { modo: "junto", produtos: ["nao-existe-este-handle", "oleo-para-barba"] },
      })
      await abrir(COM_CONTEUDO)
      confere(
        "handle que não existe mais sai da oferta, o resto fica",
        (await noJunto()).length === 1
      )

      /* ── o clique leva o que foi marcado, na MESMA ida ───────────────── */
      await gravar({ ...antes, combinada: { modo: "junto", produtos: DOIS } })
      /* Sacola nova: sem isto o teste conta o que sobrou de rodadas passadas. */
      await contexto.clearCookies()
      await abrir(COM_CONTEUDO)
      await pagina.check(".junto__lista li:first-child input")
      await pagina.click(".compra__comprar")
      await pagina.waitForSelector(".sacolinha__item", { timeout: 20_000 })
      /* A gaveta abre no clique, com as linhas que a página já sabia desenhar
         (entrega 0104): o que conta é a sacola DEPOIS da resposta do Medusa —
         e limpar os cookies com a ação em voo deixaria o carrinho dela pra
         próxima conferência. */
      await pagina.waitForFunction(
        () =>
          !document.querySelector(".sacolinha[data-ocupada]") &&
          !document.querySelector(".sacolinha__item[data-chegando]"),
        null,
        { timeout: 20_000 }
      )
      const naSacola = await pagina.$$eval(".sacolinha__nome", (n) =>
        n.map((e) => e.textContent.trim())
      )
      confere(
        "marcar um e comprar leva os DOIS pra sacola",
        naSacola.length === 2,
        naSacola.join(" | ")
      )
      // Com a sacola aberta, o marcado continua marcado (desmarcar parecia que não tinha ido).
      confere(
        "e o que foi marcado continua marcado na página",
        await pagina.$eval(".junto__lista li:first-child input", (e) => e.checked)
      )
      await contexto.clearCookies()

      /* ── a tarja de frete: nos kits e nos que combinam ───────────────── */
      await conferirTarjas((modo) => gravar({ ...antes, combinada: { modo, produtos: DOIS } }))

      /* ── os três cartões de quantidade formam uma grade só ───────────── */
      await gravar({ ...antes, combinada: { modo: "unidades", notaDoAvulso: "1 mês de uso" } })
      await conferirAlinhamento()

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

      /* ── a rotina: cada produto uma vez só ─────────────────────────────
       *
       * Os handles da rotina são digitados no admin, e nada impede repetir
       * um ou pôr o próprio produto. Antes, cada repetido virava outro
       * cartão da MESMA variante: chave repetida no React, e as caixinhas
       * marcando e desmarcando juntas — a cópia do produto da página nascia
       * marcada, e desmarcá-la desmarcava o fixo.
       */
      const cartoesDaRotina = () =>
        pagina.$$eval(".rotina__item", (n) =>
          n.map((e) => ({
            nome: e.querySelector(".rotina__nome")?.textContent?.trim() ?? "",
            fixo: e.classList.contains("rotina__item--fixo"),
            marcado: e.querySelector("input")?.checked ?? false,
          }))
        )
      const nomes = (cartoes) => cartoes.map((c) => c.nome).join(" | ")
      await gravar(antes)
      await abrir(COM_CONTEUDO)
      const rotinaCerta = await cartoesDaRotina()
      const { rotina } = antes.conteudo
      await gravar({
        ...antes,
        conteudo: {
          ...antes.conteudo,
          rotina: {
            ...rotina,
            itens: [
              ...rotina.itens,
              { handle: COM_CONTEUDO, passo: "Passo 4 · de novo", para: "O produto da página." },
              { ...rotina.itens[0], passo: "Passo 5 · de novo" },
            ],
          },
        },
      })
      await abrir(COM_CONTEUDO)
      const rotinaRepetida = await cartoesDaRotina()
      confere(
        "rotina com produto repetido no admin mostra cada um uma vez só",
        rotinaCerta.length > 1 && nomes(rotinaRepetida) === nomes(rotinaCerta),
        `sem repetir: ${nomes(rotinaCerta)} · repetindo: ${nomes(rotinaRepetida)}`
      )
      confere(
        "e só o produto da página nasce marcado, travado",
        rotinaRepetida.filter((c) => c.marcado).length === 1 &&
          rotinaRepetida.every((c) => c.marcado === c.fixo),
        JSON.stringify(rotinaRepetida)
      )

      /* lixo no metadata não derruba a PDP: a seção some, a página fica */
      const sujo = await gravar({
        ...antes,
        conteudo: {
          ...antes.conteudo,
          duvidas: { titulo: "Torto", perguntas: "isto não é lista" },
        },
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

    /* ── produto sem texto tem PDP enxuta, e isso não é erro ──────────────
     *
     * Desde a 0105 todo produto do catálogo tem as sete seções; o produto
     * sem texto é o que nasce no painel. Pra conferir a página dele, o
     * teste esvazia o conteúdo de um e devolve no fim, mesmo se falhar. */
    const { products: enxutos } = await (
      await fetch(`${MEDUSA}/store/products?handle=${ENXUTO}&fields=id`, {
        headers: { "x-publishable-api-key": CHAVE },
      })
    ).json()
    const idEnxuto = enxutos?.[0]?.id
    if (idEnxuto) {
      const rota = `${MEDUSA}/admin/produtos/${idEnxuto}/pdp`
      const doEnxuto = (await (await fetch(rota, { headers: cab })).json()).pdp
      try {
        await fetch(rota, {
          method: "POST",
          headers: cab,
          body: JSON.stringify({ ...doEnxuto, conteudo: {} }),
        })
        confere(`/produtos/${ENXUTO}, sem texto, responde 200`, (await abrir(ENXUTO)) === 200)
        const enxuta = await secoesNaTela()
        confere(
          "produto sem texto não desenha seção editorial nenhuma",
          !esperadas.some((s) => enxuta.includes(s)),
          enxuta.join(", ")
        )
        confere("mas a dobra continua de pé", enxuta.includes("pdp"), enxuta.join(", "))
      } finally {
        await fetch(rota, { method: "POST", headers: cab, body: JSON.stringify(doEnxuto) })
      }
      const voltou = (await (await fetch(rota, { headers: cab })).json()).pdp
      confere(
        `o texto do ${ENXUTO} voltou ao que era`,
        JSON.stringify(voltou) === JSON.stringify(doEnxuto)
      )
    }
  }
} finally {
  await navegador.close()
}

confere(
  "nenhum erro no console",
  noConsole.length === 0,
  [...new Set(noConsole.map((t) => t.split("\n")[0].slice(0, 160)))].slice(0, 3).join(" | ")
)
if (recargaDoDev.descontados.length)
  console.log("  ·    descontado: o aviso do React da recarga do next dev (recarga-do-dev.mjs)")

console.log(`\n${passou} passou, ${falhou} falhou\n`)
process.exit(falhou ? 1 : 0)
