/**
 * CONFERIDOR DOS PEDIDOS E DO INÍCIO DO PAINEL — pela tela, contra a API.
 *
 *   FRENET_URL=http://127.0.0.1:4310/shipping/quote FRENET_TOKEN=teste \
 *   PAGARME_SECRET_KEY=sk_test_falsa PAGARME_URL=http://127.0.0.1:4320/core/v5 \
 *   MEDUSA_WEBHOOK_SEGREDO=segredo-de-teste RESEND_URL=http://127.0.0.1:4330 \
 *   RESEND_API_KEY=re_teste_falsa DASHBOARD_DONO_EMAIL=dono@painel.teste npm run backend:dev
 *   npm run dev -w @fuckingbarba/dashboard
 *   node apps/dashboard/ferramentas/conferir-pedidos.mjs
 *
 * Variáveis: as de `pecas.mjs`, e mais NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY (os
 * pedidos nascem pela API da loja), ADMIN_EMAIL e ADMIN_SENHA (o admin
 * LOCAL: pagar, postar, entregar e cancelar), MEDUSA_WEBHOOK_SEGREDO (o
 * aviso do Pix pago), PORTA_FALSA e PORTA_PAGARME_FALSO (as da Frenet e do
 * Pagar.me falsos, se o backend apontar pra outras).
 *
 * Faz sete pedidos de verdade, um em cada canto da vida deles — Pix
 * esperando, Pix vencido, cartão em análise, pago, enviado, entregue e
 * cancelado —, com e-mails que nunca se repetem, e compara o que a tela
 * mostra com o que a API do painel responde. Os pedidos ficam no banco
 * local (como os do `conferir-conta.mjs`); os membros da rodada saem da
 * equipe no fim.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • um pedido na situação errada (o Pix vencido como esperando, o pago   │
 * │   que não aparece pra despachar, o cartão em análise como pago);       │
 * │ • a tela dizendo uma coisa e a API outra — selo, caminho, total;       │
 * │ • as fitas de filtro contando errado, ou o filtro deixando passar;     │
 * │ • o CPF inteiro chegando pra operação (na tela OU na resposta);        │
 * │ • o marketing vendo pedido ou nome de cliente;                         │
 * │ • o Início com número que a API não deu;                               │
 * │ • rolagem de lado no celular; erro no console.                         │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { fabricaDePedidos } from "../../loja/ferramentas/pedido-de-teste.mjs"
import { subirFrenetFalsa } from "../../loja/ferramentas/frenet-falsa.mjs"
import { subirPagarmeFalso } from "../../loja/ferramentas/pagarme-falso.mjs"
import {
  abrirNavegador,
  caixaDoResend,
  caminho,
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
  textoDe,
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

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const reais = (v) => REAIS.format(v)
const semEspaco = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()

const NOME_DA_SITUACAO = {
  pix: "Aguardando Pix",
  vencido: "Pix vencido",
  analise: "Em análise",
  separacao: "Em separação",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
  combinar: "A combinar",
}
const NOME_DO_PROBLEMA = {
  estorno: "Estorno falhou",
  nota: "Nota com problema",
  frenet: "Fora da Frenet",
  entrega: "Problema na entrega",
}
/** O selo que a tela tem que mostrar pra esta linha da API — a mesma regra do `Status`. */
const seloDe = (l) =>
  l.problema
    ? NOME_DO_PROBLEMA[l.problema]
    : l.despachar
      ? "Pra despachar"
      : NOME_DA_SITUACAO[l.situacao]

const CPF = "11144477735"
const CPF_PONTUADO = "111.444.777-35"
const email = (quem) => `pedidos.${RODADA}.${quem}@teste.fuckingbarba.dev`

/* ── os falsos, o admin e os pedidos ─────────────────────────────────────── */

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

let tokenDoDono = ""

try {
  titulo("Os pedidos da rodada")
  const { products } = await (
    await fetch(`${MEDUSA}/store/products?fields=handle`, {
      headers: { "x-publishable-api-key": CHAVE },
    })
  ).json()
  const [a, b, c] = products.map((p) => p.handle)

  const pedidos = {}
  pedidos.pix = await fabrica.pedidoPix(email("pix"), [[a, 1]], { documento: CPF })
  pedidos.vencido = await fabrica.pedidoPix(email("vencido"), [[b, 1]], {
    validadeSegundos: -30,
    documento: CPF,
  })
  pedidos.analise = await fabrica.pedidoCartao(email("analise"), [[c, 1]])
  pedidos.pago = await fabrica.pedidoPix(email("pago"), [[a, 2]], { documento: CPF })
  await fabrica.pagar(pedidos.pago)
  pedidos.enviado = await fabrica.pedidoPix(
    email("enviado"),
    [
      [b, 1],
      [c, 1],
    ],
    { documento: CPF }
  )
  await fabrica.pagar(pedidos.enviado)
  await fabrica.enviar(pedidos.enviado, { codigo: `AA${RODADA.slice(-6).toUpperCase()}BR` })
  pedidos.entregue = await fabrica.pedidoPix(email("entregue"), [[c, 1]], { documento: CPF })
  await fabrica.pagar(pedidos.entregue)
  await fabrica.entregar(
    pedidos.entregue,
    await fabrica.enviar(pedidos.entregue, { codigo: `AB${RODADA.slice(-6).toUpperCase()}BR` })
  )
  pedidos.cancelado = await fabrica.pedidoPix(email("cancelado"), [[a, 1]], { documento: CPF })
  await fabrica.cancelar(pedidos.cancelado)
  ok(
    Object.values(pedidos).every((p) => p.id),
    "sete pedidos feitos pela API da loja"
  )

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

  titulo("Onde cada pedido está (API)")
  const lista = await medusa(`/dashboard/pedidos?busca=${RODADA}`, {
    metodo: "GET",
    token: tokenDoDono,
  })
  const linha = (quem) => lista.corpo.pedidos?.find((l) => l.id === pedidos[quem].id)
  const esperado = {
    pix: "pix",
    vencido: "vencido",
    analise: "analise",
    pago: "separacao",
    enviado: "enviado",
    entregue: "entregue",
    cancelado: "cancelado",
  }
  for (const [quem, situacao] of Object.entries(esperado))
    ok(linha(quem)?.situacao === situacao, `${quem}: ${situacao}`, JSON.stringify(linha(quem)))
  ok(linha("analise")?.forma === "cartao", "o cartão aparece como cartão")

  titulo("A lista, na tela do dono")
  {
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/pedidos?busca=${RODADA}`)
    await pagina.waitForSelector(".tabela tbody tr")
    for (const quem of Object.keys(esperado)) {
      const l = linha(quem)
      const tr = pagina.locator(".tabela tbody tr", { hasText: `#${l.numero}` })
      const selo = semEspaco(await tr.locator(".status").first().textContent())
      ok(selo === seloDe(l), `#${l.numero} (${quem}) com o selo "${seloDe(l)}"`, selo)
      const total = semEspaco(await tr.locator("td.direita").textContent())
      ok(total === semEspaco(reais(l.total)), `#${l.numero}: total da tela = da API`, total)
    }
    const fitas = await pagina.locator(".filtros .filtro").allTextContents()
    const todos = fitas.find((f) => f.startsWith("Todos"))
    ok(
      semEspaco(todos) === `Todos ${lista.corpo.contagem.todos}`,
      "a fita “Todos” conta o que a API conta",
      todos
    )
    ok(
      (await pagina.locator(".tabela tbody tr").count()) === lista.corpo.pedidos.length,
      "a busca mostra as linhas que a API achou"
    )

    await pagina.goto(`${PAINEL}/pedidos?filtro=despachar&busca=${RODADA}`)
    await pagina.waitForSelector(".tabela tbody tr")
    const selos = (await pagina.locator(".tabela tbody tr .status").allTextContents()).map(
      semEspaco
    )
    ok(
      selos.length > 0 && selos.every((s) => s === "Pra despachar" || s === "Em separação"),
      "o filtro “Pra despachar” só deixa passar quem espera sair",
      selos.join(", ")
    )
    ok(
      (await pagina.locator(".tabela tbody tr", { hasText: `#${linha("pix").numero}` }).count()) ===
        0,
      "o Pix esperando fica fora do “Pra despachar”"
    )

    await pagina.goto(`${PAINEL}/pedidos?busca=${linha("enviado").numero}`)
    ok(
      (await pagina
        .locator(".tabela tbody tr", { hasText: `#${linha("enviado").numero}` })
        .count()) === 1,
      "a busca pelo número acha o pedido"
    )
  }

  titulo("O pedido inteiro, na tela do dono")
  for (const quem of ["pix", "analise", "pago", "enviado", "cancelado"]) {
    const { pagina } = dono
    const api = await medusa(`/dashboard/pedidos/${pedidos[quem].id}`, {
      metodo: "GET",
      token: tokenDoDono,
    })
    const d = api.corpo.pedido
    await pagina.goto(`${PAINEL}/pedidos/${pedidos[quem].id}`)
    await pagina.waitForSelector(".caminho li")
    const passos = await pagina
      .locator(".caminho li")
      .evaluateAll((lis) =>
        lis.map((li) =>
          li.hasAttribute("data-feito")
            ? "feito"
            : li.hasAttribute("data-agora")
              ? "agora"
              : li.hasAttribute("data-erro")
                ? "erro"
                : ""
        )
      )
    ok(
      passos.join(",") === d.caminho.map((p) => p.estado).join(","),
      `#${d.numero} (${quem}): o caminho da tela é o da API`,
      `${passos.join(",")} ≠ ${d.caminho.map((p) => p.estado).join(",")}`
    )
    const total = semEspaco(await pagina.locator(".totais .total dd").textContent())
    ok(total === semEspaco(reais(d.totais.total)), `#${d.numero}: o total`, total)
    const selo = semEspaco(await pagina.locator(".titulo-status .status").textContent())
    ok(selo === seloDe(d), `#${d.numero}: o selo do título`, selo)
  }
  {
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/pedidos/${pedidos.pago.id}`)
    await hidratado(pagina, ".cpf button")
    ok(
      (await textoDe(pagina, ".cpf .num")) === "•••.444.777-••",
      "o CPF abre mascarado, até pro dono"
    )
    await pagina.click(".cpf button")
    ok(
      (await textoDe(pagina, ".cpf .num")) === CPF_PONTUADO,
      "e o “Mostrar” do dono mostra o inteiro"
    )
    ok(
      (await pagina.locator(".faixa", { hasText: "Esperando o Pix" }).count()) === 0,
      "pago não tem a faixa do Pix"
    )
    await pagina.goto(`${PAINEL}/pedidos/${pedidos.analise.id}`)
    ok(
      (await pagina.locator(".faixa", { hasText: "Cartão em análise de fraude" }).count()) === 1,
      "o cartão em análise explica que o valor está só reservado"
    )
  }

  titulo("A operação: os pedidos, sem o CPF inteiro")
  {
    const { pagina } = op
    const api = await medusa(`/dashboard/pedidos/${pedidos.pago.id}`, {
      metodo: "GET",
      token: cookieOp.value,
    })
    ok(
      api.status === 200 && api.corpo.pedido.cliente.documento.inteiro === null,
      "a API não manda o CPF inteiro"
    )
    await pagina.goto(`${PAINEL}/pedidos/${pedidos.pago.id}`)
    await pagina.waitForSelector(".caminho li")
    const html = await pagina.content()
    ok(!html.includes(CPF_PONTUADO) && !html.includes(CPF), "o CPF inteiro nem chega na página")
    ok((await pagina.locator(".cpf button").count()) === 0, "e não tem “Mostrar”")
    ok(
      (await pagina.locator("text=O documento inteiro só o dono vê.").count()) === 1,
      "a tela diz por quê"
    )
  }

  titulo("O marketing não vê pedido")
  {
    const { pagina } = mkt
    const api = await medusa("/dashboard/pedidos", { metodo: "GET", token: cookieMkt.value })
    ok(api.status === 403, "a API da lista responde 403", String(api.status))
    await pagina.goto(`${PAINEL}/pedidos/${pedidos.pago.id}`)
    ok(
      (await textoDe(pagina, "h1")) === "Essa área não é do seu papel",
      "o pedido na mão mostra “sem acesso”"
    )
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector(".numeros")
    const html = await pagina.content()
    // O e-mail do próprio membro (`mkt.<rodada>@…`) vai na página, na casca; o dos clientes, não.
    ok(
      !html.includes("Rafael Teste") && !html.includes(`pedidos.${RODADA}.`),
      "o Início do marketing não tem nome nem e-mail de cliente"
    )
    ok(
      (await pagina.locator("text=Mais vendidos da semana").count()) === 1,
      "e tem os mais vendidos"
    )
  }

  titulo("O Início do dono")
  {
    const { pagina } = dono
    const api = (await medusa("/dashboard/inicio", { metodo: "GET", token: tokenDoDono })).corpo
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector(".numeros")
    const valores = (await pagina.locator(".numero__valor").allTextContents()).map(semEspaco)
    ok(
      valores.join(" | ") ===
        [api.numeros.vendasHoje.valor, api.numeros.esperando.valor, api.numeros.semana.valor]
          .map((v) => semEspaco(reais(v)))
          .join(" | "),
      "os números da tela são os da API",
      valores.join(" | ")
    )
    const fila = (await pagina.locator(".fila__titulo").allTextContents()).map(semEspaco)
    ok(
      fila.join(" | ") === api.fila.map((f) => semEspaco(f.titulo)).join(" | "),
      "a fila é a da API",
      fila.join(" | ")
    )
    const hoje = await pagina.locator(".mini a .mini__titulo").allTextContents()
    ok(
      [pedidos.pix, pedidos.pago, pedidos.cancelado].every((p) =>
        hoje.some((t) => t.startsWith(`#${p.numero} `))
      ),
      "os pedidos da rodada estão nos “Pedidos de hoje”"
    )
    const barras = await pagina.locator(".barras-v__col").count()
    ok(barras === 7, "o gráfico tem os 7 dias", String(barras))
  }

  titulo("No celular")
  {
    const celular = await novaAba({ width: 390, height: 844 })
    await celular.contexto.addCookies([
      { name: "painel_sessao", value: tokenDoDono, url: PAINEL, httpOnly: true, sameSite: "Lax" },
    ])
    const { pagina } = celular
    await pagina.goto(`${PAINEL}/pedidos?busca=${RODADA}`)
    await pagina.waitForSelector(".cartoes .cartao")
    ok(await pagina.locator(".cartoes").isVisible(), "a lista vira cartões")
    ok(!(await pagina.locator(".tabela-rola").isVisible()), "e a tabela some")
    ok(await semRolagemDeLado(pagina), "sem rolagem de lado na lista")
    await pagina.goto(`${PAINEL}/pedidos/${pedidos.enviado.id}`)
    await pagina.waitForSelector(".caminho li")
    ok(await semRolagemDeLado(pagina), "sem rolagem de lado no pedido")
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector(".numeros")
    ok(await semRolagemDeLado(pagina), "sem rolagem de lado no Início")
    ok(caminho(pagina) === "/", "o celular abre o Início")
    await celular.contexto.close()
  }

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.slice(0, 5).join(" | "))
} catch (e) {
  falhou(e instanceof Error ? e.message : String(e))
} finally {
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
}

process.exit(resumo())
