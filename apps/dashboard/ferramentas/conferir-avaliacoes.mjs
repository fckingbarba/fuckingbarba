/**
 * CONFERIDOR DAS AVALIAÇÕES NO PAINEL — a lista pra aprovar ou recusar o que
 * chega de quem comprou (a página /avaliar da loja), as três fitas, o item
 * do Início, o apagar de vez, e o que o marketing não vê.
 *
 *   (Medusa local; painel no ar)
 *   node apps/dashboard/ferramentas/conferir-avaliacoes.mjs
 *
 * Variáveis: as de `pecas.mjs`, e mais NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 * ADMIN_EMAIL, ADMIN_SENHA, PORTA_FALSA e PORTA_PAGARME_FALSO. As avaliações
 * nascem como na loja sem o link: um pedido pago (a fábrica, com os falsos),
 * e o envio com o número do pedido e o e-mail da compra (`POST
 * /store/avaliacoes`). Uma vem de um pedido da loja antiga: o arquivo de
 * vendas da rodada entra na base da Nuvemshop (CRM → Base), pelo dono.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • a avaliação que não aparece nas novas, ou aparece sem o texto        │
 * │   inteiro, a nota ou o produto;                                        │
 * │ • aprovar sem ir pro site (`/store/avaliacoes`), sem sair da fita, sem │
 * │   o aviso ou sem o nome de quem aprovou;                               │
 * │ • "Tirar do site" que não tira; apagar sem confirmação, ou a nova;     │
 * │ • o "N avaliações esperando" do Início errado;                         │
 * │ • o marketing vendo o número do pedido;                                │
 * │ • o pedido da loja antiga com link pra uma página que não existe;      │
 * │ • rolagem de lado no celular; erro no console.                         │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * No fim, as avaliações da rodada saem do banco e a equipe da rodada sai
 * (o pedido fica, como nos outros conferidores).
 */

import { gzipSync } from "node:zlib"
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

async function loja(caminho, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: { "content-type": "application/json", "x-publishable-api-key": CHAVE },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

/** O id do produto pelo handle, pela API da loja. */
async function produtoPorHandle(handle) {
  const { corpo } = await loja(`/store/products?handle=${handle}&fields=id`)
  return corpo.products?.[0]?.id
}

/** A tela pela API, como o painel pede. */
const tela = async (token, filtro = "novas") =>
  (await medusa(`/dashboard/avaliacoes?filtro=${filtro}`, { metodo: "GET", token })).corpo
const naTela = (t, id) => (t?.avaliacoes ?? []).find((a) => a.id === id)

/** Aperta o botão e devolve o aviso de baixo quando ele entra (a tela refeita vem depois). */
async function apertar(pagina, seletor) {
  const aviso = pagina.locator(".aviso")
  const antes = await aviso.getAttribute("data-vez")
  await pagina.locator(seletor).click()
  await pagina.waitForFunction(
    (vez) => {
      const a = document.querySelector(".aviso")
      return a && !a.hasAttribute("data-fora") && a.getAttribute("data-vez") !== vez
    },
    antes,
    { timeout: 60000 }
  )
  return {
    texto: semEspaco(await aviso.textContent()),
    erro: (await aviso.getAttribute("data-erro")) !== null,
  }
}

let tokenDoDono = ""
const criadas = []

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

  titulo("Duas avaliações de um pedido pago, como a loja manda")
  const EMAIL = `painel.avaliar.${RODADA}@teste.fuckingbarba.dev`
  const pedido = await fabrica.pedidoPix(EMAIL, [
    ["oleo-para-barba", 1],
    ["balm-para-barba", 1],
  ])
  await fabrica.pagar(pedido)
  const [idDoOleo, idDoBalm, idDoFator] = await Promise.all(
    ["oleo-para-barba", "balm-para-barba", "fator-de-crescimento-para-barba"].map(produtoPorHandle)
  )
  const TEXTO_BOM = `Teste ${RODADA}: segurou o dia todo.`
  const TEXTO_RUIM = `Teste ${RODADA}: chegou vazando.\n\nO frasco veio aberto.`
  for (const [produto, nota, texto] of [
    [idDoOleo, 5, TEXTO_BOM],
    [idDoBalm, 1, TEXTO_RUIM],
  ]) {
    // Sem o link: o número do pedido e o e-mail da compra, como a página manda (desde a 0193).
    const r = await loja("/store/avaliacoes", {
      metodo: "POST",
      corpo: { numero: `#${pedido.numero}`, email: EMAIL, produto, nome: "Rafael T.", nota, texto },
    })
    ok(
      r.status === 200 && JSON.stringify(r.corpo) === '{"ok":true}',
      `a de ${nota} estrela(s) entrou pelo número e o e-mail — e a resposta não traz nada do pedido`,
      `${r.status} ${JSON.stringify(r.corpo)}`
    )
  }
  const { corpo: doAdmin } = await medusa(`/admin/avaliacoes?pedido=${pedido.id}`, {
    metodo: "GET",
    token: tokenAdmin,
    assinado: false,
  })
  const boa = doAdmin.avaliacoes?.find((a) => a.nota === 5)
  const ruim = doAdmin.avaliacoes?.find((a) => a.nota === 1)
  criadas.push(...(doAdmin.avaliacoes ?? []).map((a) => a.id))

  titulo("Um pedido da loja antiga (a base da Nuvemshop)")
  // Dois pedidos no arquivo de vendas, como a Nuvemshop exporta: um pago (o Fator) e um recusado.
  const EMAIL_ANTIGO = `antigo.${RODADA}@teste.fuckingbarba.dev`
  const NUMERO_ANTIGO = String(700_000_000 + (Date.now() % 90_000_000))
  const NUMERO_RECUSADO = String(Number(NUMERO_ANTIGO) + 1)
  const dataBR = (ms) => {
    const d = new Date(ms - 3 * 60 * 60 * 1000)
    const p = (n) => String(n).padStart(2, "0")
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00`
  }
  const venda = (numero, pagamento) =>
    `${numero};${EMAIL_ANTIGO};${dataBR(Date.now() - 40 * 24 * 60 * 60 * 1000)};Aberto;${pagamento};Entregue;79.90;0.00;15.00;94.90;João Velho;Fator de Crescimento para Barba 30ml;79.90;1;FBFCB01;Pix`
  const vendas = Buffer.from(
    [
      "Número do Pedido;E-mail;Data;Status do Pedido;Status do Pagamento;Status do Envio;Subtotal;Desconto;Valor do Frete;Total;Nome do comprador;Nome do Produto;Valor do Produto;Quantidade Comprada;SKU;Meio de pagamento",
      venda(NUMERO_ANTIGO, "Confirmado"),
      venda(NUMERO_RECUSADO, "Recusado"),
    ].join("\r\n"),
    "latin1"
  )
  const subiu = await medusa("/dashboard/crm/base", {
    token: tokenDoDono,
    corpo: { nome: "vendas.csv", gzip: gzipSync(vendas).toString("base64") },
  })
  ok(
    subiu.status === 200 && subiu.corpo.tipo === "vendas",
    "o arquivo de vendas da rodada entra na base",
    `${subiu.status} ${JSON.stringify(subiu.corpo)}`
  )
  const TEXTO_ANTIGO = `Teste ${RODADA}: comprei na loja antiga e voltei.`
  const doAntigo = await loja("/store/avaliacoes", {
    metodo: "POST",
    corpo: {
      numero: NUMERO_ANTIGO,
      email: EMAIL_ANTIGO.toUpperCase(),
      produto: idDoFator,
      nome: "João V.",
      nota: 4,
      texto: TEXTO_ANTIGO,
    },
  })
  ok(
    doAntigo.status === 200,
    "quem comprou na loja antiga avalia pelo número e o e-mail de lá",
    `${doAntigo.status} ${JSON.stringify(doAntigo.corpo)}`
  )
  const recusado = await loja("/store/avaliacoes", {
    metodo: "POST",
    corpo: {
      numero: NUMERO_RECUSADO,
      email: EMAIL_ANTIGO,
      produto: idDoFator,
      nome: "João V.",
      nota: 4,
      texto: "Não paguei",
    },
  })
  ok(
    recusado.status === 409 && recusado.corpo.message === "nao_aceita",
    "o pedido recusado lá não aceita avaliação",
    `${recusado.status} ${JSON.stringify(recusado.corpo)}`
  )
  const outroProduto = await loja("/store/avaliacoes", {
    metodo: "POST",
    corpo: {
      numero: NUMERO_ANTIGO,
      email: EMAIL_ANTIGO,
      produto: idDoOleo,
      nome: "João V.",
      nota: 4,
      texto: "O óleo",
    },
  })
  ok(
    outroProduto.status === 409 && outroProduto.corpo.message === "fora_do_pedido",
    "e o produto que não veio no pedido de lá não entra",
    `${outroProduto.status} ${JSON.stringify(outroProduto.corpo)}`
  )
  const { corpo: recentes } = await medusa("/admin/avaliacoes", {
    metodo: "GET",
    token: tokenAdmin,
    assinado: false,
  })
  const antiga = (recentes.avaliacoes ?? []).find((a) => a.texto === TEXTO_ANTIGO)
  if (antiga) criadas.push(antiga.id)
  ok(
    /^nso_/.test(antiga?.pedido_id ?? "") && antiga?.numero === Number(NUMERO_ANTIGO),
    "ela fica ligada ao pedido da base, com o número de lá",
    JSON.stringify(antiga)
  )

  titulo("A tela (API)")
  const t0 = await tela(tokenDoDono)
  ok(
    naTela(t0, boa?.id)?.situacao === "nova" && naTela(t0, ruim?.id)?.situacao === "nova",
    "as duas nas novas"
  )
  ok(
    naTela(t0, ruim?.id)?.texto === TEXTO_RUIM,
    "o texto inteiro, como a pessoa escreveu (a quebra de linha junto)",
    JSON.stringify(naTela(t0, ruim?.id)?.texto)
  )
  ok(
    naTela(t0, boa?.id)?.pedido?.numero === pedido.numero &&
      naTela(t0, boa?.id)?.pedido?.nuvemshop === false,
    "o dono vê o número do pedido",
    JSON.stringify(naTela(t0, boa?.id)?.pedido)
  )
  ok(
    naTela(t0, antiga?.id)?.pedido?.nuvemshop === true &&
      naTela(t0, antiga?.id)?.pedido?.numero === Number(NUMERO_ANTIGO),
    "e o da loja antiga, marcado como da Nuvemshop",
    JSON.stringify(naTela(t0, antiga?.id)?.pedido)
  )
  ok(t0.paginacao?.porPagina === 30, "a lista vem em páginas de 30", JSON.stringify(t0.paginacao))
  const tMkt = await tela(cookieMkt.value)
  ok(
    naTela(tMkt, boa?.id) &&
      naTela(tMkt, boa?.id).pedido === null &&
      naTela(tMkt, antiga?.id)?.pedido === null,
    "o marketing abre as avaliações, sem o número do pedido",
    JSON.stringify(naTela(tMkt, boa?.id)?.pedido)
  )
  const inicio = (await medusa("/dashboard/inicio", { metodo: "GET", token: tokenDoDono })).corpo
  const item = (inicio.fila ?? []).find((f) => f.href === "/avaliacoes")
  ok(
    item?.titulo === "Avaliações esperando" && item?.quantos === t0.contagem.novas,
    "o Início diz quantas esperam",
    `${item?.titulo} · ${item?.quantos} · ${t0.contagem.novas} novas`
  )

  titulo("A tela do dono")
  const { pagina } = dono
  await pagina.goto(`${PAINEL}/avaliacoes`)
  await pagina.waitForSelector("[data-tela] h1")
  const doMenu = await menu(pagina)
  ok(doMenu.includes("Avaliações"), "o menu tem Avaliações (em Pessoas)", doMenu.join(", "))
  const linhaAntiga = pagina.locator(`[data-avaliacao="${antiga?.id}"]`)
  await linhaAntiga.waitFor()
  ok(
    semEspaco(await linhaAntiga.locator("[data-pedido-nuvemshop]").textContent()) ===
      `· Pedido #${NUMERO_ANTIGO} da Nuvemshop` &&
      (await linhaAntiga.locator("a[href^='/pedidos/']").count()) === 0,
    "a da loja antiga diz o número de lá, sem link (o pedido não tem página no painel)",
    semEspaco(await linhaAntiga.textContent())
  )
  const linhaBoa = pagina.locator(`[data-avaliacao="${boa?.id}"]`)
  await linhaBoa.waitFor()
  ok(
    semEspaco(await linhaBoa.locator(".aval__texto").textContent()) === TEXTO_BOM &&
      (await linhaBoa.locator(".aval__estrelas").getAttribute("aria-label")) === "Nota 5 de 5",
    "a linha tem o texto e a nota (as estrelas dizem em palavras)"
  )
  ok(
    (await linhaBoa.locator(`a[href="/pedidos/${pedido.id}"]`).count()) === 1,
    "e o link pro pedido"
  )
  await hidratado(pagina, `[data-aprovar="${boa?.id}"]`)
  const aprovou = await apertar(pagina, `[data-aprovar="${boa?.id}"]`)
  ok(
    !aprovou.erro && /já está no site/.test(aprovou.texto),
    "aprovar avisa que foi pro site",
    aprovou.texto
  )
  await pagina.locator(`[data-avaliacao="${boa?.id}"]`).waitFor({ state: "detached" })
  ok(true, "e ela sai das novas")
  const noSite = (await loja("/store/avaliacoes")).corpo.avaliacoes ?? []
  ok(
    noSite.some((a) => a.id === boa?.id && a.nome === "Rafael T."),
    "a aprovada está na lista do site"
  )
  const tSite = await tela(tokenDoDono, "no-site")
  ok(
    naTela(tSite, boa?.id)?.moderacao?.startsWith(`Aprovada por ${nomeDoDono} · `),
    "no site, com quem aprovou e quando",
    naTela(tSite, boa?.id)?.moderacao
  )

  await pagina.goto(`${PAINEL}/avaliacoes?filtro=no-site`)
  await pagina.locator(`[data-recusar="${boa?.id}"]`).waitFor()
  ok(
    semEspaco(await pagina.locator(`[data-recusar="${boa?.id}"]`).textContent()) ===
      "Tirar do site",
    "a do site tem o 'Tirar do site'"
  )
  await hidratado(pagina, `[data-recusar="${boa?.id}"]`)
  const tirou = await apertar(pagina, `[data-recusar="${boa?.id}"]`)
  ok(/não aparece no site/.test(tirou.texto), "tirar do site avisa", tirou.texto)
  const depois = (await loja("/store/avaliacoes")).corpo.avaliacoes ?? []
  ok(!depois.some((a) => a.id === boa?.id), "e ela sai da lista do site")

  titulo("Apagar de vez (a recusada), com confirmação")
  const nova = await medusa(`/dashboard/avaliacoes/${ruim?.id}`, {
    token: tokenDoDono,
    corpo: { acao: "apagar" },
  })
  ok(nova.status === 409, "a nova não se apaga (recusa antes)", `HTTP ${nova.status}`)
  await pagina.goto(`${PAINEL}/avaliacoes?filtro=recusadas`)
  await pagina.locator(`[data-apagar="${boa?.id}"]`).waitFor()
  await hidratado(pagina, `[data-apagar="${boa?.id}"]`)
  await pagina.click(`[data-apagar="${boa?.id}"]`)
  await pagina.locator(`[data-confirmar-apagar="${boa?.id}"]`).waitFor()
  ok(true, "apagar pede confirmação antes")
  const apagou = await apertar(pagina, `[data-confirmar-apagar="${boa?.id}"]`)
  ok(/Apagada de vez/.test(apagou.texto), "apagar avisa", apagou.texto)
  const { corpo: restou } = await medusa(`/admin/avaliacoes?pedido=${pedido.id}`, {
    metodo: "GET",
    token: tokenAdmin,
    assinado: false,
  })
  ok(
    !(restou.avaliacoes ?? []).some((a) => a.id === boa?.id),
    "e ela sai do banco",
    JSON.stringify((restou.avaliacoes ?? []).map((a) => a.id))
  )

  titulo("O marketing, na tela")
  await mkt.pagina.goto(`${PAINEL}/avaliacoes`)
  const linhaMkt = mkt.pagina.locator(`[data-avaliacao="${ruim?.id}"]`)
  await linhaMkt.waitFor()
  ok(
    (await linhaMkt.locator("a[href^='/pedidos/']").count()) === 0 &&
      !(await linhaMkt.textContent()).includes(`#${pedido.numero}`) &&
      (await mkt.pagina.locator("[data-pedido-nuvemshop]").count()) === 0,
    "sem o número do pedido, na tela também (nem o da loja antiga)"
  )

  titulo("O celular")
  const cel = await novaAba({ width: 390, height: 844 })
  await cel.contexto.addCookies(await dono.contexto.cookies())
  await cel.pagina.goto(`${PAINEL}/avaliacoes`)
  await cel.pagina.locator(`[data-avaliacao="${ruim?.id}"]`).waitFor()
  ok(await semRolagemDeLado(cel.pagina), "sem rolagem de lado")

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.join(" | "))
} catch (err) {
  falhou(`o conferidor quebrou: ${err instanceof Error ? err.stack : err}`)
} finally {
  // As avaliações da rodada saem do banco, e a equipe da rodada sai (o pedido fica).
  for (const id of criadas) {
    for (const acao of ["recusar", "apagar"])
      await medusa(`/admin/avaliacoes/${id}`, {
        token: tokenAdmin,
        assinado: false,
        corpo: { acao },
      })
  }
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
