/**
 * CONFERIDOR DA TELA DE PRODUTOS — a lista, a página do produto e a gaveta
 * de uma seção, pela tela, contra a loja LOCAL: o que se salva no painel
 * aparece na página do produto em segundos.
 *
 *   (Medusa, painel e loja no ar — a loja com o MEDUSA_BACKEND_URL do Medusa
 *   local, a chave publicável e o REVALIDAR_SEGREDO; o Medusa com o
 *   LOJA_URL apontando pra ela, pra avisar)
 *   node apps/dashboard/ferramentas/conferir-produtos.mjs
 *
 * Variáveis: as de `pecas.mjs`; LOJA (padrão http://localhost:3000),
 * NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL e ADMIN_SENHA (o admin
 * LOCAL: cria o produto da rodada e apaga no fim).
 *
 * O produto da rodada nasce em rascunho, sem foto e sem categoria — como um
 * SKU novo do Bling — e é apagado no fim. A caixa de compra é conferida no
 * balm (os cartões de quantidade precisam das faixas de preço, que o job
 * cria em até 15 minutos pra produto novo); a página dele volta ao que era.
 * As imagens de teste são feitas aqui, na hora (o `sharp` do backend); os
 * vídeos, no próprio navegador (um canvas gravado pelo `MediaRecorder`, em
 * WebM — sem duração no cabeçalho, como o de um celular Android).
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • a operação editando (botão na tela, ou a rota aceitando);            │
 * │ • a seção pela metade gravada calada, ou recusada sem dizer o que      │
 * │   falta;                                                               │
 * │ • a foto que sobe do tamanho errado, deitada, com o EXIF (e a          │
 * │   localização), ou em outro formato que não WebP;                      │
 * │ • a medida sugerida diferente da medida da seção na loja;              │
 * │ • o que se salva no painel e não chega na loja (texto, fundo, a foto   │
 * │   do celular no corte certo, a ordem, ligar/desligar, a caixa, o       │
 * │   título dos relacionados, o subtítulo, o "Publicar", as fotos e os    │
 * │   vídeos da galeria, o vídeo do modo de uso, os casos de antes e       │
 * │   depois);                                                             │
 * │ • vídeo na capa; vídeo que não é vídeo subindo; o bilhete da subida    │
 * │   valendo duas vezes; caso de antes e depois sem a autorização;        │
 * │ • o topo saindo do lugar; o `</script>` de uma dúvida quebrando a      │
 * │   página; a mudança sem linha no histórico; erro no console.           │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { createRequire } from "node:module"
import {
  abrirNavegador,
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

const sharp = createRequire(new URL("../../backend/package.json", import.meta.url))("sharp")

exigirAmbiente()
const LOJA = (process.env.LOJA ?? "http://localhost:3000").replace(/\/+$/, "")
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

async function esperarQue(condicao, ms = 20000) {
  for (const fim = Date.now() + ms; Date.now() < fim; await esperar(400)) {
    const v = await condicao().catch(() => null)
    if (v) return v
  }
  return await condicao().catch(() => null)
}

/* ── o admin, os falsos e o navegador ─────────────────────────────────────── */

const resend = await subirResend()
const caixa = caixaDoResend(resend)
console.log(`  ⚙  Resend :${resend.porta} · painel ${PAINEL} · loja ${LOJA}`)
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

/** A página da loja, do servidor (sem navegador): o HTML inteiro, já com o que foi salvo. */
async function paginaDaLoja(handle, condicao, ms = 25000) {
  let html = ""
  const achou = await esperarQue(async () => {
    const r = await fetch(`${LOJA}/produtos/${handle}`, { cache: "no-store" })
    html = r.status === 200 ? await r.text() : ""
    return html && condicao(html) ? html : null
  }, ms)
  return achou ?? html
}

const detalhe = async (token, id) =>
  (await medusa(`/dashboard/produtos/${id}`, { metodo: "GET", token })).corpo

/** Aperta e devolve a frase do aviso de baixo — o novo, deste clique. */
async function apertar(pagina, alvo) {
  const aviso = pagina.locator(".aviso")
  const antes = await aviso.getAttribute("data-vez")
  await (typeof alvo === "string" ? pagina.locator(alvo) : alvo).click()
  await pagina.waitForFunction(
    (vez) => {
      const a = document.querySelector(".aviso")
      return a && !a.hasAttribute("data-fora") && a.getAttribute("data-vez") !== vez
    },
    antes,
    { timeout: 30000 }
  )
  return {
    texto: semEspaco(await aviso.textContent()),
    erro: (await aviso.getAttribute("data-erro")) !== null,
  }
}

/** Uma foto de teste: listras, pra ter conteúdo; `girar`: grava deitada, com a etiqueta de girar. */
async function foto(largura, altura, formato, { girar = false } = {}) {
  const [l, a] = girar ? [altura, largura] : [largura, altura]
  const listras = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${l}" height="${a}"><rect width="100%" height="100%" fill="#2a6f5a"/><rect width="50%" height="100%" fill="#ffd84d"/></svg>`
  )
  let s = sharp(listras)
  if (formato === "jpeg") s = s.jpeg({ quality: 90 })
  else s = s.png()
  if (girar) s = s.withMetadata({ orientation: 6 })
  return s.toBuffer()
}

/**
 * Um vídeo de teste, gravado no navegador: um canvas colorido mexendo, em
 * WebM. Volta os bytes, pra ir num `setInputFiles` como um arquivo qualquer.
 */
async function gravarVideo(pagina, largura, altura, segundos = 2) {
  const bytes = await pagina.evaluate(
    async ([l, a, s]) => {
      const c = Object.assign(document.createElement("canvas"), { width: l, height: a })
      const ctx = c.getContext("2d")
      const rec = new MediaRecorder(c.captureStream(24), { mimeType: "video/webm" })
      const partes = []
      rec.ondataavailable = (e) => e.data.size && partes.push(e.data)
      rec.start(200)
      const inicio = performance.now()
      await new Promise((fim) => {
        const quadro = setInterval(() => {
          const t = (performance.now() - inicio) / 1000
          ctx.fillStyle = `hsl(${(t * 140) % 360} 70% 45%)`
          ctx.fillRect(0, 0, l, a)
          ctx.fillStyle = "#ffd84d"
          ctx.fillRect((t * 160) % l, a / 3, l / 6, a / 6)
          if (t >= s) {
            clearInterval(quadro)
            fim()
          }
        }, 40)
      })
      rec.stop()
      await new Promise((fim) => (rec.onstop = fim))
      return [...new Uint8Array(await new Blob(partes).arrayBuffer())]
    },
    [largura, altura, segundos]
  )
  return Buffer.from(bytes)
}

/* ── o produto da rodada, e o que volta ao que era ────────────────────────── */

const HANDLE = `conferidor-${RODADA}`
const NOME = `Conferidor ${RODADA}`
let produtoId = ""
let balm = null
let pdpDoBalm = null
let tokenDoDono = ""

async function prepararProdutos() {
  const { corpo: modelo } = await adm(
    "/admin/products?handle=oleo-para-barba&fields=id,sales_channels.id,shipping_profile.id"
  )
  const oleo = modelo.products?.[0]
  const r = await adm("/admin/products", {
    metodo: "POST",
    corpo: {
      title: NOME,
      handle: HANDLE,
      status: "draft",
      weight: 100,
      options: [{ title: "Tamanho", values: ["Único"] }],
      variants: [
        {
          title: "Único",
          sku: `CONF-${RODADA}`,
          manage_inventory: false,
          options: { Tamanho: "Único" },
          prices: [{ amount: 89.9, currency_code: "brl" }],
        },
      ],
      sales_channels: (oleo?.sales_channels ?? []).map((c) => ({ id: c.id })),
      ...(oleo?.shipping_profile?.id ? { shipping_profile_id: oleo.shipping_profile.id } : {}),
    },
  })
  produtoId = r.corpo.product?.id ?? ""
  if (!produtoId) throw new Error(`não criei o produto da rodada: ${JSON.stringify(r.corpo)}`)
  const { corpo } = await adm("/admin/products?handle=balm-para-barba&fields=id,handle,title")
  balm = corpo.products?.[0] ?? null
  if (!balm) throw new Error("o balm não está no banco local (a semente?)")
  pdpDoBalm = (await adm(`/admin/produtos/${balm.id}/pdp`)).corpo.pdp
}

async function devolver() {
  if (produtoId) await adm(`/admin/products/${produtoId}`, { metodo: "DELETE" })
  if (balm && pdpDoBalm)
    await adm(`/admin/produtos/${balm.id}/pdp`, { metodo: "POST", corpo: pdpDoBalm })
  if (tokenDoDono) {
    const r = await medusa("/dashboard/equipe", { metodo: "GET", token: tokenDoDono })
    for (const m of r.corpo.membros ?? [])
      if (m.email.includes(RODADA))
        await medusa(`/dashboard/equipe/${m.id}`, {
          token: tokenDoDono,
          corpo: { acao: "remover" },
        })
  }
}

/* ── a rodada ─────────────────────────────────────────────────────────────── */

try {
  await prepararProdutos()

  titulo("Quem entra")
  const dono = await novaAba()
  const cookieDono = await entrarPelaTela(dono, DONO, caixa)
  if (!cookieDono) throw new Error("o dono não entrou (o código não chegou no Resend falso?)")
  const tokenDono = cookieDono.value
  tokenDoDono = tokenDono
  for (const [papel, quem, nome] of [
    ["operacao", `op.${RODADA}@painel.teste`, "Operação Teste"],
    ["marketing", `mkt.${RODADA}@painel.teste`, "Marketing Teste"],
  ]) {
    const r = await medusa("/dashboard/equipe", {
      token: tokenDono,
      corpo: { nome, email: quem, papel },
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

  /* ── a lista ──────────────────────────────────────────────────────────── */

  titulo("A lista")
  {
    const { pagina } = dono
    const api = (await medusa("/dashboard/produtos", { metodo: "GET", token: tokenDono })).corpo
    await pagina.goto(`${PAINEL}/produtos`)
    await pagina.waitForSelector(".tabela tbody tr")
    const linhas = await pagina.locator(".tabela tbody tr").count()
    ok(
      linhas === api.produtos.length && linhas === api.contagem.todos,
      "a tabela tem os produtos todos, e a fita diz quantos",
      `${linhas} linhas · ${api.contagem.todos}`
    )
    const doConferidor = pagina.locator(".tabela tbody tr", { hasText: NOME })
    ok(
      semEspaco(await doConferidor.locator(".status").textContent()) === "Rascunho",
      "o produto novo do Bling aparece em rascunho"
    )
    await pagina.locator('.filtros a[href="/produtos?filtro=rascunho"]').click()
    await pagina.waitForURL(/filtro=rascunho/)
    await pagina.waitForSelector('.filtro[aria-current="page"]')
    const rascunhos = (await pagina.locator(".tabela tbody tr").allTextContents()).map(semEspaco)
    ok(
      rascunhos.length === api.contagem.rascunho && rascunhos.some((t) => t.includes(NOME)),
      "a fita Rascunhos filtra (e o endereço guarda o filtro)",
      `${rascunhos.length} · ${api.contagem.rascunho}`
    )
    const celular = await novaAba({ width: 390, height: 844 })
    await celular.contexto.addCookies([{ ...cookieDono }])
    await celular.pagina.goto(`${PAINEL}/produtos`)
    await celular.pagina.waitForSelector(".cartoes .cartao")
    ok(
      (await celular.pagina.locator(".cartoes .cartao").count()) === api.produtos.length &&
        (await semRolagemDeLado(celular.pagina)),
      "no celular, cartões, sem rolar de lado"
    )
    await celular.pagina.goto(`${PAINEL}/produtos/${produtoId}`)
    await celular.pagina.waitForSelector(".secoes")
    ok(await semRolagemDeLado(celular.pagina), "a página do produto no celular, sem rolar de lado")
    await celular.contexto.close()
  }

  /* ── a operação vê ────────────────────────────────────────────────────── */

  titulo("A operação vê; quem edita é o marketing ou o dono")
  {
    const { pagina } = op
    await pagina.goto(`${PAINEL}/produtos/${produtoId}`)
    await pagina.waitForSelector(".secoes")
    ok(
      (await pagina.locator("[data-editar]").count()) === 0 &&
        (await pagina.locator("[data-publicar]").count()) === 0 &&
        (await pagina.locator(".escolha").count()) === 0 &&
        (await pagina.locator(".secao .chave:not([disabled])").count()) === 0 &&
        (await pagina.locator("[data-subtitulo]").getAttribute("readonly")) !== null &&
        (await pagina.locator("[data-subir-galeria], .galeria__botoes").count()) === 0,
      "na tela dela: sem Editar, sem Publicar, chaves, caixa e galeria só pra ver"
    )
    const d = await detalhe(tokenOp, produtoId)
    ok(d.produto?.podeEditar === false, "e o backend diz que ela não edita")
    const recusas = []
    for (const [acao, corpo] of [
      ["secao", { secao: "produto.quem", valores: {} }],
      ["ordem", { secao: "produto.quem", mudanca: "desligar" }],
      ["caixa", { modo: "unidades", nota: "", junto: [] }],
      ["textos", { subtitulo: "x", categoriaId: "" }],
      ["publicar", {}],
      ["imagens", { uso: "fundo-computador", arquivo: "AAAA" }],
      ["galeria", { acao: "tirar", url: "x" }],
      ["videos/envio", { tipo: "video/mp4", tamanho: 10 }],
    ]) {
      const r = await medusa(`/dashboard/produtos/${produtoId}/${acao}`, { token: tokenOp, corpo })
      if (r.status !== 403) recusas.push(`${acao}: ${r.status}`)
    }
    ok(!recusas.length, "as oito rotas de mudar recusam a operação (403)", recusas.join(", "))
  }

  /* ── publicar o rascunho ──────────────────────────────────────────────── */

  const { pagina } = mkt
  const abrirProduto = async (id = produtoId) => {
    await pagina.goto(`${PAINEL}/produtos/${id}`)
    await pagina.waitForSelector(".secoes")
    await hidratado(pagina, ".secoes .chave")
  }

  titulo("Publicar o rascunho")
  {
    await abrirProduto()
    ok(
      /Em rascunho, fora do site/.test(await pagina.locator(".faixa").first().textContent()),
      "a faixa diz que está fora do site"
    )
    const fora = await fetch(`${LOJA}/produtos/${HANDLE}`)
    ok(fora.status === 404, "e a loja ainda não abre a página dele", String(fora.status))
    await pagina.locator("[data-publicar]").click()
    const pergunta = semEspaco(await pagina.locator(".publicar-pergunta").textContent())
    ok(
      pergunta.includes("Está sem foto e sem categoria. Publicar mesmo assim?"),
      "sem foto e sem categoria, a tela pergunta antes",
      pergunta
    )
    const r = await apertar(pagina, pagina.getByRole("button", { name: "Publicar mesmo assim" }))
    ok(
      !r.erro && r.texto.startsWith("No site — o produto aparece na loja"),
      "publicado, e o aviso diz",
      r.texto
    )
    const d = await detalhe(tokenMkt, produtoId)
    ok(d.produto?.publicado === true, "o produto está publicado no Medusa")
    const html = await paginaDaLoja(HANDLE, (h) => h.includes(NOME))
    ok(html.includes(NOME), "a página dele abre na loja")
    const denovo = await medusa(`/dashboard/produtos/${produtoId}/publicar`, {
      token: tokenMkt,
      corpo: {},
    })
    ok(denovo.status === 409 && denovo.corpo.message === "ja_publicado", "publicar de novo: 409")
  }

  /* ── subtítulo e categoria ────────────────────────────────────────────── */

  titulo("Subtítulo e categoria")
  const SUBTITULO = `Linha do conferidor ${RODADA}`
  {
    await abrirProduto()
    await pagina.fill("[data-subtitulo]", SUBTITULO)
    await pagina.selectOption("[data-categoria]", { label: "Barba" })
    const r = await apertar(pagina, "[data-textos] button[type=submit]")
    ok(!r.erro && r.texto.startsWith("Salvo"), "salvo", r.texto)
    const d = await detalhe(tokenMkt, produtoId)
    ok(
      d.produto?.subtitulo === SUBTITULO && d.produto?.categoria === "Barba",
      "o Medusa guardou o subtítulo e a categoria",
      `${d.produto?.subtitulo} · ${d.produto?.categoria}`
    )
    const html = await paginaDaLoja(HANDLE, (h) => h.includes(SUBTITULO))
    ok(html.includes(SUBTITULO), "o subtítulo aparece na página do produto")
  }

  /* ── as fotos e os vídeos da galeria ──────────────────────────────────── */

  titulo("A galeria: fotos e vídeos")
  {
    await abrirProduto()
    const galeria = async () => (await detalhe(tokenMkt, produtoId)).produto?.galeria ?? []
    const itensNaTela = () => pagina.locator("[data-galeria] .galeria__item")
    ok(
      /Sem foto de capa/.test(await pagina.locator("[data-galeria]").textContent()),
      "sem foto, a tela avisa que a vitrine fica sem imagem"
    )
    const subirFoto = async (buffer, nome = "foto.png") => {
      const antes = await itensNaTela().count()
      await pagina.setInputFiles('[data-subir-galeria="foto"]', {
        name: nome,
        mimeType: nome.endsWith(".jpg") ? "image/jpeg" : "image/png",
        buffer,
      })
      await pagina.waitForFunction(
        (n) => document.querySelectorAll("[data-galeria] .galeria__item").length > n,
        antes,
        { timeout: 60000 }
      )
    }
    await subirFoto(await foto(1600, 1600, "png"))
    let g = await galeria()
    ok(
      g.length === 1 &&
        g[0].tipo === "foto" &&
        /\/static\/.+-galeria.*\.webp$/.test(g[0].url) &&
        (await pagina.locator("[data-galeria] .galeria__capa").count()) === 1,
      "a primeira foto sobe em WebP e vira a capa",
      JSON.stringify(g)
    )
    const capa = g[0].url
    const { corpo: adminProduto } = await adm(
      `/admin/products/${produtoId}?fields=thumbnail,metadata,images.url,images.rank`
    )
    ok(
      adminProduto.product?.thumbnail === capa &&
        adminProduto.product?.metadata?.fb_fotos?.origem === "painel",
      "no Medusa: a thumbnail é a capa, e as fotos ficam marcadas como escolhidas no painel",
      JSON.stringify({
        thumb: adminProduto.product?.thumbnail,
        marca: adminProduto.product?.metadata?.fb_fotos?.origem,
      })
    )
    await subirFoto(await foto(1600, 1000, "jpeg"), "deitada.jpg")
    ok(
      /Não é quadrada/.test(await pagina.locator("[data-galeria]").textContent()),
      "foto que não é quadrada: a tela avisa da faixa branca"
    )

    const videoQuadrado = await gravarVideo(pagina, 480, 480)
    const antes = await itensNaTela().count()
    await pagina.setInputFiles('[data-subir-galeria="video"]', {
      name: "video.webm",
      mimeType: "video/webm",
      buffer: videoQuadrado,
    })
    await pagina.waitForFunction(
      (n) => document.querySelectorAll("[data-galeria] .galeria__item").length > n,
      antes,
      { timeout: 90000 }
    )
    g = await galeria()
    const video = g.find((i) => i.tipo === "video")
    ok(
      g.length === 3 &&
        g[2]?.tipo === "video" &&
        /\/static\/.+-video.*\.webm$/.test(video?.url ?? "") &&
        /\/static\/.+-poster.*\.webp$/.test(video?.poster ?? "") &&
        video?.largura === 480 &&
        video?.altura === 480 &&
        video?.duracao >= 1 &&
        video?.duracao <= 4,
      "o vídeo sobe direto pro Medusa, com a capa, as medidas e a duração (o WebM sem duração no cabeçalho)",
      JSON.stringify(video)
    )

    const setaDoVideo = (para) =>
      pagina.locator(`li[data-url="${video.url}"] [data-mover-galeria="${para}"]`)
    await apertar(pagina, setaDoVideo("antes"))
    g = await galeria()
    ok(
      g.map((i) => i.tipo).join(",") === "foto,video,foto" &&
        (await setaDoVideo("antes").isDisabled()),
      "o vídeo anda pra esquerda; na frente da capa ele não vai (a seta desliga)",
      g.map((i) => i.tipo).join(",")
    )
    const naCapa = await medusa(`/dashboard/produtos/${produtoId}/galeria`, {
      token: tokenMkt,
      corpo: { acao: "mover", url: video.url, para: "antes" },
    })
    ok(naCapa.status === 409 && naCapa.corpo.message === "capa", "e a rota também não deixa (409)")

    const bilhete = await medusa(`/dashboard/produtos/${produtoId}/videos/envio`, {
      token: tokenMkt,
      corpo: { tipo: "video/mp4", tamanho: 4000 },
    })
    const destino = `${MEDUSA}${bilhete.corpo.caminho}`
    const falso = await fetch(destino, {
      method: "PUT",
      headers: { "content-type": "video/mp4" },
      body: Buffer.alloc(4000, 65),
    })
    const deNovo = await fetch(destino, {
      method: "PUT",
      headers: { "content-type": "video/mp4" },
      body: Buffer.alloc(4000, 65),
    })
    ok(
      falso.status === 400 &&
        (await falso.json()).message === "nao_e_video" &&
        deNovo.status === 409,
      "arquivo que não é vídeo é recusado pelos bytes, e o bilhete não vale duas vezes"
    )
    await pagina.setInputFiles('[data-subir-galeria="video"]', {
      name: "iphone.mov",
      mimeType: "video/quicktime",
      buffer: Buffer.alloc(100),
    })
    await pagina.waitForSelector("[data-galeria] .slot__erro")
    ok(
      /\.MOV do iPhone/.test(await pagina.locator("[data-galeria] .slot__erro").textContent()),
      "o .MOV do iPhone: a tela diz pra exportar como MP4"
    )

    const html = await paginaDaLoja(HANDLE, (h) => h.includes("galeria__mini--video"))
    ok(
      html.includes("galeria__mini--video") &&
        html.indexOf("galeria__mini--video") < html.lastIndexOf("galeria__mini"),
      "na loja: o vídeo entre as miniaturas, na ordem do painel"
    )
    const loja = await novaAba({ width: 1280, height: 900 })
    await loja.pagina.goto(`${LOJA}/produtos/${HANDLE}`)
    await loja.pagina.locator(".galeria__mini--video").click()
    const noPalco = await loja.pagina
      .locator(".galeria__palco--video video")
      .getAttribute("src", { timeout: 15000 })
    ok(noPalco === video.url, "escolhido, o vídeo toca no palco da dobra", noPalco ?? "")
    await loja.contexto.close()

    await apertar(pagina, pagina.locator(`li[data-url="${capa}"] [data-tirar-galeria]`))
    g = await galeria()
    ok(
      g.length === 2 && g[0].tipo === "foto" && g[0].url !== capa && g[1].tipo === "video",
      "tirar a capa: a outra foto vem pra frente, na frente do vídeo",
      g.map((i) => i.tipo).join(",")
    )
  }

  /* ── uma seção: o que falta, e a lista ────────────────────────────────── */

  titulo("Uma seção: o que falta, e a lista")
  {
    await pagina.locator('[data-editar="produto.promessa"]').click()
    await pagina.waitForSelector('[data-editor="produto.promessa"]')
    await hidratado(pagina, '[data-campo="chapeu"]')
    ok(
      (await pagina.locator(".gaveta__titulo").textContent()) === "Benefícios" &&
        (await pagina.locator('[data-editar="produto.promessa"]').textContent()) === "Escrever",
      "a seção vazia abre em “Escrever”, com o nome da tela"
    )
    await pagina.fill('[data-campo="chapeu"]', "Uso diário")
    await pagina.fill('[data-campo="titulo"]', "O que muda na *sua cara*")
    await pagina.locator('[data-editor] button[type="submit"]').click()
    await pagina.waitForSelector(".gaveta__erro")
    ok(
      semEspaco(await pagina.locator(".gaveta__erro").textContent()) ===
        "Falta preencher: Benefícios." &&
        (await pagina.locator('[data-campo="itens.0"]').getAttribute("aria-invalid")) === "true",
      "sem benefício, não grava: diz o que falta e marca o campo"
    )
    const antes = await detalhe(tokenMkt, produtoId)
    ok(
      antes.produto?.secoes?.find((s) => s.id === "produto.promessa")?.vazia === true,
      "e nada foi gravado"
    )
    await pagina.fill('[data-campo="itens.0"]', "Barba mais cheia")
    await pagina.locator('[data-mais="itens"]').click()
    await pagina.waitForFunction(
      () => document.activeElement?.getAttribute("data-campo") === "itens.1"
    )
    ok(true, "o benefício novo entra com o cursor nele")
    await pagina.keyboard.type("Fios mais grossos")
    await pagina.locator('[data-mover="subir"][data-lista="itens"][data-i="1"]').click()
    ok(
      (await pagina.locator('[data-campo="itens.0"]').inputValue()) === "Fios mais grossos" &&
        (await pagina.evaluate(() => document.activeElement?.dataset.mover)) === "descer",
      "subir troca a ordem, e o foco fica no item (na seta que ainda anda)"
    )
  }

  /* ── o fundo ──────────────────────────────────────────────────────────── */

  titulo("A imagem de fundo")
  let fundoGravado = null
  {
    ok(
      semEspaco(await pagina.locator('[data-ideal="computador"]').textContent()) ===
        "2880 × 890 px" &&
        semEspaco(await pagina.locator('[data-ideal="celular"]').textContent()) ===
          "1170 × 1644 px",
      "a medida ideal de cada lado, a da seção na loja"
    )
    ok(
      await pagina.locator('input[data-subir="celular"]').isDisabled(),
      "a do celular espera a do computador"
    )
    await pagina.setInputFiles('input[data-subir="computador"]', {
      name: "foto.heic",
      mimeType: "image/heic",
      buffer: Buffer.from("não é foto"),
    })
    const heic = await pagina.waitForSelector(".slot--computador .slot__erro")
    ok(/HEIC/.test(await heic.textContent()), "foto .HEIC: diz o que fazer")
    await pagina.setInputFiles('input[data-subir="computador"]', {
      name: "fundo.png",
      mimeType: "image/png",
      buffer: await foto(4000, 1236, "png"),
    })
    await pagina.waitForSelector(".slot--computador .slot__previa img", { timeout: 60000 })
    await pagina.waitForFunction(() =>
      /px/.test(document.querySelector(".slot--computador .slot__info")?.textContent ?? "")
    )
    ok(
      (await pagina.locator(".slot--computador .slot__info").textContent()).startsWith(
        "2880 × 890 px"
      ),
      "PNG de 4000 px: sobe encolhido até 2880",
      await pagina.locator(".slot--computador .slot__info").textContent()
    )
    await pagina.setInputFiles('input[data-subir="celular"]', {
      name: "celular.jpg",
      mimeType: "image/jpeg",
      buffer: await foto(1170, 1644, "jpeg", { girar: true }),
    })
    await pagina.waitForSelector(".slot--celular .slot__previa img", { timeout: 60000 })
    await pagina.waitForFunction(() =>
      /px/.test(document.querySelector(".slot--celular .slot__info")?.textContent ?? "")
    )
    const infoCelular = await pagina.locator(".slot--celular").textContent()
    ok(
      infoCelular.includes("1170 × 1644 px") && !infoCelular.includes("Essa é deitada"),
      "a foto do celular gravada deitada (com a etiqueta de girar) sobe em pé",
      semEspaco(infoCelular)
    )
    await pagina.locator('[data-campo="veu"]').fill("70")
    ok(
      /--veu:\s*70/.test(await pagina.locator(".fundo-form").getAttribute("style")),
      "o véu muda a prévia na hora"
    )
    const r = await apertar(pagina, '[data-editor] button[type="submit"]')
    ok(!r.erro && r.texto.startsWith("Salvo — a página do produto"), "salvo", r.texto)
    const d = await detalhe(tokenMkt, produtoId)
    const secao = d.produto?.secoes?.find((s) => s.id === "produto.promessa")
    fundoGravado = secao?.fundo ?? null
    ok(
      secao?.vazia === false &&
        JSON.stringify(secao?.valores?.itens) === '["Fios mais grossos","Barba mais cheia"]',
      "o texto gravado, na ordem da tela"
    )
    ok(
      Boolean(fundoGravado) &&
        /\/static\/.+\.webp$/.test(fundoGravado.imagem) &&
        /\/static\/.+\.webp$/.test(fundoGravado.imagemCelular ?? "") &&
        fundoGravado.veu === 70,
      "o fundo gravado: as duas no armazenamento, em WebP, véu 70",
      JSON.stringify(fundoGravado)
    )
    if (fundoGravado) {
      const pc = await sharp(
        Buffer.from(await (await fetch(fundoGravado.imagem)).arrayBuffer())
      ).metadata()
      const cel = await sharp(
        Buffer.from(await (await fetch(fundoGravado.imagemCelular)).arrayBuffer())
      ).metadata()
      ok(
        pc.format === "webp" &&
          pc.width === 2880 &&
          pc.height === 890 &&
          cel.format === "webp" &&
          cel.width === 1170 &&
          cel.height === 1644 &&
          !cel.exif,
        "no armazenamento: 2880 × 890 e 1170 × 1644, WebP, sem EXIF",
        `${pc.format} ${pc.width}×${pc.height} · ${cel.format} ${cel.width}×${cel.height}`
      )
    }
    await pagina.waitForSelector(".gaveta", { state: "detached" })
    // A lista se refaz logo depois da gaveta fechar: espera o selo, sem contar antes da hora.
    const comImagem = pagina
      .locator(".secao", { hasText: "Benefícios" })
      .locator(".selo", { hasText: "com imagem" })
    await comImagem.waitFor({ timeout: 15000 }).catch(() => {})
    ok((await comImagem.count()) === 1, "na lista, a seção ganha o selo “com imagem”")
    const html = await paginaDaLoja(HANDLE, (h) => h.includes("fundo__imagem"))
    const trecho = html.slice(html.indexOf('class="fundo fundo--imagem"'))
    const nome = (u) => encodeURIComponent(new URL(u).pathname.split("/").pop())
    ok(
      html.includes('style="--veu:70"') &&
        trecho.indexOf("<section") === trecho.indexOf('<section class="promessa"') &&
        /<source media="\(max-width: 767px\)"/.test(trecho) &&
        fundoGravado &&
        trecho.indexOf(nome(fundoGravado.imagemCelular)) < trecho.indexOf("<img") &&
        trecho.indexOf(nome(fundoGravado.imagem)) > trecho.indexOf("<img"),
      "na loja: a foto atrás dos Benefícios, a do celular até 767 px, véu 70"
    )
    ok(
      html.includes("Fios mais grossos") && html.includes("<em>sua cara</em>"),
      "e o texto, com o destaque do asterisco"
    )
  }

  /* ── ligar, desligar e a ordem ────────────────────────────────────────── */

  titulo("Ligar, desligar e a ordem")
  {
    for (const [secao, valores] of [
      ["produto.quem", { titulo: "Pra quem é", sim: ["Quem quer barba"], nao: ["Quem não"] }],
      [
        "produto.duvidas",
        {
          titulo: "Dúvidas",
          perguntas: [
            {
              pergunta: "Tem </script><script>alert(1)</script> nele?",
              resposta: ["Não tem.", "Segundo parágrafo."],
            },
          ],
        },
      ],
    ]) {
      const r = await medusa(`/dashboard/produtos/${produtoId}/secao`, {
        token: tokenMkt,
        corpo: { secao, valores },
      })
      ok(r.status === 200, `${secao} escrita pela rota`, JSON.stringify(r.corpo).slice(0, 120))
    }
    await abrirProduto()
    const chave = '.secao .chave[data-secao="produto.promessa"]'
    let r = await apertar(pagina, chave)
    ok(
      !r.erro &&
        r.texto.startsWith("Seção desligada") &&
        (await pagina.locator(chave).getAttribute("aria-checked")) === "false",
      "desligar vale na hora",
      r.texto
    )
    let html = await paginaDaLoja(HANDLE, (h) => !h.includes('class="promessa"'))
    ok(!html.includes('class="promessa"'), "e a loja tira a seção")
    r = await apertar(pagina, chave)
    html = await paginaDaLoja(HANDLE, (h) => h.includes('class="promessa"'))
    ok(!r.erro && html.includes('class="promessa"'), "ligar de novo, e ela volta")

    const subirDuvidas = '[data-secao="produto.duvidas"][data-mover="subir"]'
    r = await apertar(pagina, subirDuvidas)
    ok(
      !r.erro &&
        (await pagina.evaluate(() => document.activeElement?.dataset.secao)) === "produto.duvidas",
      "subir as Dúvidas: o foco continua nela",
      r.texto
    )
    const d = await detalhe(tokenMkt, produtoId)
    const ordem = d.produto.secoes.map((s) => s.id)
    ok(
      ordem[0] === "produto.dobra" &&
        ordem.indexOf("produto.duvidas") < ordem.indexOf("produto.quem"),
      "a ordem gravada: Dúvidas antes do Pra quem é, o topo no lugar",
      ordem.join(" ")
    )
    html = await paginaDaLoja(
      HANDLE,
      (h) =>
        h.indexOf('class="duvidas"') > 0 && h.indexOf('class="duvidas"') < h.indexOf('class="quem"')
    )
    ok(
      html.indexOf('class="duvidas"') > 0 &&
        html.indexOf('class="duvidas"') < html.indexOf('class="quem"'),
      "a loja mostra na ordem nova"
    )
    ok(
      await pagina.locator('[data-secao="produto.promessa"][data-mover="subir"]').isDisabled(),
      "a primeira depois do topo não sobe"
    )
    const topo = await medusa(`/dashboard/produtos/${produtoId}/ordem`, {
      token: tokenMkt,
      corpo: { secao: "produto.promessa", mudanca: "subir" },
    })
    const fixa = await medusa(`/dashboard/produtos/${produtoId}/ordem`, {
      token: tokenMkt,
      corpo: { secao: "produto.dobra", mudanca: "desligar" },
    })
    ok(
      topo.status === 409 && fixa.status === 409,
      "e a rota também não deixa (409), nem mexer no topo"
    )
    ok(
      html.includes("\\u003c/script>\\u003cscript>alert(1)\\u003c/script>") &&
        !html.includes("</script><script>alert(1)"),
      "o </script> de uma dúvida não fecha o JSON do Google"
    )
  }

  /* ── o título dos relacionados ────────────────────────────────────────── */

  titulo("O título dos relacionados")
  {
    await pagina.locator('[data-editar="produto.relacionados"]').click()
    await hidratado(pagina, '[data-campo="titulo"]')
    await pagina.fill('[data-campo="titulo"]', "Combina com o conferidor")
    const r = await apertar(pagina, '[data-editor] button[type="submit"]')
    const html = await paginaDaLoja(HANDLE, (h) => h.includes("Combina com o conferidor"))
    ok(!r.erro && /Combina com o conferidor/.test(html), "o título novo na loja", r.texto)
  }

  /* ── o vídeo do modo de uso ───────────────────────────────────────────── */

  titulo("O vídeo do modo de uso")
  {
    await abrirProduto()
    await pagina.locator('[data-editar="produto.funciona"]').click()
    await hidratado(pagina, '[data-campo="comoTitulo"]')
    await pagina.fill('[data-campo="comoTitulo"]', "Como funciona")
    await pagina.fill('[data-campo="comoTexto.0"]', "Age na raiz.")
    await pagina.selectOption('[data-campo="comoFotoDe"]', HANDLE)
    await pagina.fill('[data-campo="usoTitulo"]', "Modo de uso")
    await pagina.fill('[data-campo="usoPassos.0"]', "Aplique depois do banho.")
    await pagina.selectOption('[data-campo="usoFotoDe"]', HANDLE)
    await pagina.setInputFiles('input[data-campo="usoVideo"]', {
      name: "uso.webm",
      mimeType: "video/webm",
      buffer: await gravarVideo(pagina, 640, 360),
    })
    await pagina.waitForSelector(".slot--uso .slot__previa video", { timeout: 90000 })
    ok(
      !/Não é deitado/.test(await pagina.locator(".slot--uso").textContent()),
      "o vídeo deitado (16:9) sobe sem aviso de corte"
    )
    const r = await apertar(pagina, '[data-editor] button[type="submit"]')
    const d = await detalhe(tokenMkt, produtoId)
    const funciona = d.produto?.secoes?.find((x) => x.id === "produto.funciona")
    const usoVideo = funciona?.valores?.usoVideo
    ok(
      !r.erro && /\.webm$/.test(usoVideo?.url ?? "") && usoVideo?.largura === 640,
      "salvo: o vídeo vai junto da seção",
      JSON.stringify(usoVideo)
    )
    const selo = pagina
      .locator(".secao", { hasText: "Como funciona e modo de uso" })
      .locator(".selo", { hasText: "com vídeo" })
    await selo.waitFor({ timeout: 15000 }).catch(() => {})
    ok((await selo.count()) === 1, "na lista, a seção ganha o selo “com vídeo”")
    const html = await paginaDaLoja(HANDLE, (h) => h.includes("funciona__foto--video"))
    ok(
      html.includes("funciona__foto--video") && html.includes(usoVideo?.url ?? "ø"),
      "na loja: o vídeo no lugar da foto do modo de uso"
    )
  }

  /* ── o antes e depois ─────────────────────────────────────────────────── */

  titulo("Antes e depois")
  {
    await abrirProduto()
    await pagina.locator('[data-editar="produto.antes-depois"]').click()
    await hidratado(pagina, '[data-campo="casos.0.nome"]')
    await pagina.fill('[data-campo="casos.0.nome"]', "André B.")
    await pagina.fill('[data-campo="casos.0.tempo"]', "90 dias")
    for (const lado of ["antes", "depois"]) {
      await pagina.setInputFiles(`input[data-campo="casos.0.${lado}"]`, {
        name: `${lado}.jpg`,
        mimeType: "image/jpeg",
        buffer: await foto(900, 1050, "jpeg"),
      })
    }
    await pagina.waitForFunction(
      () => document.querySelectorAll(".slot--caso .slot__previa img").length === 2,
      null,
      { timeout: 60000 }
    )
    ok(
      semEspaco(await pagina.locator(".slot--caso .slot__medida").first().textContent()) ===
        "Ideal: 900 × 1050 px · em pé",
      "cada foto com a medida do quadro da loja (6 × 7)"
    )
    await pagina.locator('[data-editor] button[type="submit"]').click()
    await pagina.waitForSelector(".gaveta__erro")
    ok(
      semEspaco(await pagina.locator(".gaveta__erro").textContent()) ===
        "Falta preencher: Caso 1: a autorização por escrito.",
      "sem a autorização marcada, o caso não grava (LGPD)"
    )
    await pagina.locator('[data-campo="casos.0.autorizou"]').check()
    const r = await apertar(pagina, '[data-editor] button[type="submit"]')
    const d = await detalhe(tokenMkt, produtoId)
    const casos = d.produto?.secoes?.find((x) => x.id === "produto.antes-depois")?.valores?.casos
    ok(
      !r.erro &&
        casos?.length === 1 &&
        casos[0].autorizou === true &&
        /-caso.*\.webp$/.test(casos[0].antes),
      "com a autorização: gravado, com as fotos em WebP",
      JSON.stringify(casos)
    )
    const html = await paginaDaLoja(HANDLE, (h) => h.includes('class="antesdepois"'))
    ok(
      html.includes('class="antesdepois"') &&
        /Depois · (<!-- -->)?90 dias/.test(html) &&
        html.includes("antesdepois__aviso"),
      "na loja: o caso com as duas fotos, o tempo e a ressalva"
    )
  }

  /* ── a caixa de compra ────────────────────────────────────────────────── */

  titulo("A caixa de compra (no balm)")
  {
    await abrirProduto(balm.id)
    const salvar = "[data-salvar-caixa]"
    ok(await pagina.locator(salvar).isDisabled(), "sem mudança, o Salvar fica apagado")
    await pagina.locator('.escolha input[value="junto"]').check()
    let r = await apertar(pagina, salvar)
    ok(
      r.erro && r.texto === "Escolha pelo menos um produto pro leve junto.",
      "leve junto sem produto: diz o que falta",
      r.texto
    )
    await pagina.selectOption('[data-caixa-junto="0"]', "oleo-para-barba")
    ok(
      (await pagina.locator(".junto-previa__item").count()) === 1 &&
        /Óleo/.test(await pagina.locator(".junto-previa__nome").first().textContent()),
      "a prévia mostra o escolhido"
    )
    r = await apertar(pagina, salvar)
    ok(!r.erro && /leve junto/.test(r.texto), "salvo", r.texto)
    let html = await paginaDaLoja(balm.handle, (h) => h.includes('class="junto"'))
    ok(
      html.includes('class="junto"') && !html.includes('class="compra__kits"'),
      "na loja: o leve junto no lugar dos cartões"
    )
    const NOTA = "Dura uns 30 dias"
    await pagina.locator('.escolha input[value="unidades"]').check()
    await pagina.fill("[data-caixa-nota]", NOTA)
    ok(
      (await pagina.locator(".unid-cartao").first().textContent()).includes(NOTA),
      "a linha embaixo de “1 unidade” aparece na prévia"
    )
    r = await apertar(pagina, salvar)
    ok(!r.erro && /cartões de quantidade/.test(r.texto), "salvo", r.texto)
    html = await paginaDaLoja(balm.handle, (h) => h.includes(NOTA))
    ok(
      html.includes('class="compra__kits"') &&
        html.includes(NOTA) &&
        !html.includes('class="junto"'),
      "na loja: os cartões de volta, com a linha"
    )
    const vazio = await medusa(`/dashboard/produtos/${balm.id}/caixa`, {
      token: tokenMkt,
      corpo: { modo: "junto", nota: "", junto: [] },
    })
    const eleMesmo = await medusa(`/dashboard/produtos/${balm.id}/caixa`, {
      token: tokenMkt,
      corpo: { modo: "junto", nota: "", junto: [balm.handle] },
    })
    ok(
      vazio.corpo.message === "junto_vazio" && eleMesmo.corpo.message === "junto_invalido",
      "a rota recusa leve junto vazio, e com o próprio produto"
    )
  }

  /* ── o histórico ──────────────────────────────────────────────────────── */

  titulo("O que a equipe mudou")
  {
    await abrirProduto()
    const linhas = (
      await pagina.locator("[data-historico] .historico li span").allTextContents()
    ).map(semEspaco)
    const tem = (t) => linhas.some((l) => l.includes(t))
    ok(
      tem("Marketing Teste publicou no site") &&
        linhas.some(
          (l) =>
            l.includes("Marketing Teste editou Benefícios") && l.includes("com imagem de fundo")
        ) &&
        tem("Marketing Teste desligou Benefícios") &&
        tem("Marketing Teste subiu Perguntas frequentes") &&
        tem("Marketing Teste mudou o subtítulo ou a categoria") &&
        tem("Marketing Teste pôs um vídeo na galeria") &&
        tem("Marketing Teste pôs uma foto na galeria") &&
        tem("Marketing Teste mudou a ordem da galeria") &&
        tem("Marketing Teste tirou uma foto da galeria"),
      "cada mudança numa linha, com o nome de quem fez",
      linhas.slice(0, 6).join(" | ")
    )
  }

  titulo("Console")
  ok(!errosDeConsole.length, "nenhum erro no console", errosDeConsole.slice(0, 3).join(" | "))
} catch (e) {
  falhou(e instanceof Error ? e.message : String(e))
} finally {
  await devolver().catch(() => {})
  await navegador.close()
  await resend.fechar?.()
}

process.exit(resumo())
