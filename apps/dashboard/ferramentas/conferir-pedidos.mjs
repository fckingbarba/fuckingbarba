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
 * Faz oito pedidos de verdade, um em cada canto da vida deles — Pix
 * esperando, Pix vencido, cartão em análise, pago, enviado, entregue,
 * cancelado e estornado —, com e-mails que nunca se repetem, e compara o que
 * a tela mostra com o que a API do painel responde. O pago e o estornado
 * levam a oferta do checkout (um desconto, como o do cupom): o total do
 * painel é conferido contra o que o Pagar.me cobrou. Os pedidos
 * ficam no banco local (como os do `conferir-conta.mjs`); os membros da
 * rodada saem da equipe no fim.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • um pedido na situação errada (o Pix vencido como esperando, o pago   │
 * │   que não aparece pra despachar, o cartão em análise como pago);       │
 * │ • o total que não é o cobrado (a conta de antes do cupom ou da         │
 * │   oferta; o zero do pedido estornado);                                 │
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
/**
 * O título da fila do Início sem a IDADE: "Cartão em análise há 4 min — #23"
 * vira "Cartão em análise há … — #23". A idade é contada na hora em que o
 * backend responde, e a tela e este conferidor fazem dois pedidos, em dois
 * instantes: com dezenas de cartões parados em análise no banco local, algum
 * vira o minuto entre uma leitura e outra. Ler a API depois da tela não
 * resolve — continuam dois instantes. Da idade, só a forma é conferida.
 */
const semIdade = (titulo) =>
  semEspaco(titulo).replace(/ há \d+ (?:min|h(?: \d{2})?) — /, " há … — ")
/** Onde a lista da tela se separa da da API — a falha diz o item, não a lista inteira. */
function primeiraDiferenca(tela, api) {
  let i = 0
  while (i < Math.max(tela.length, api.length) && tela[i] === api[i]) i++
  return `item ${i + 1}: tela “${tela[i] ?? "—"}”, API “${api[i] ?? "—"}”`
}

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
  const oferta = await fabrica.codigoDaOferta(a)

  const pedidos = {}
  pedidos.pix = await fabrica.pedidoPix(email("pix"), [[a, 1]], { documento: CPF })
  pedidos.vencido = await fabrica.pedidoPix(email("vencido"), [[b, 1]], {
    validadeSegundos: -30,
    documento: CPF,
  })
  pedidos.analise = await fabrica.pedidoCartao(email("analise"), [[c, 1]])
  pedidos.pago = await fabrica.pedidoPix(email("pago"), [[a, 2]], {
    documento: CPF,
    cupom: oferta,
  })
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
  // Pago e cancelado: o Medusa estorna e grava a devolução como crédito — o `total` dele vira zero.
  pedidos.estornado = await fabrica.pedidoPix(email("estornado"), [[a, 1]], {
    documento: CPF,
    cupom: oferta,
  })
  await fabrica.pagar(pedidos.estornado)
  await fabrica.cancelar(pedidos.estornado)
  ok(
    Object.values(pedidos).every((p) => p.id),
    "oito pedidos feitos pela API da loja"
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
    estornado: "cancelado",
  }
  for (const [quem, situacao] of Object.entries(esperado))
    ok(linha(quem)?.situacao === situacao, `${quem}: ${situacao}`, JSON.stringify(linha(quem)))
  ok(linha("analise")?.forma === "cartao", "o cartão aparece como cartão")

  titulo("O total é o cobrado (API)")
  for (const quem of ["pago", "estornado"]) {
    const cobrado = await fabrica.cobrado(pedidos[quem])
    const d = (
      await medusa(`/dashboard/pedidos/${pedidos[quem].id}`, { metodo: "GET", token: tokenDoDono })
    ).corpo.pedido
    ok(
      (d?.totais?.cupons ?? []).some((c) => c.codigo === oferta) &&
        linha(quem)?.total === cobrado &&
        d?.total === cobrado &&
        d?.totais?.total === cobrado,
      `${quem}: com a oferta descontada, a lista e o pedido mostram o cobrado (${reais(cobrado)})`,
      JSON.stringify({ lista: linha(quem)?.total, pedido: d?.totais, cobrado })
    )
  }

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

    // As linhas em desenho (0148): a foto de cada produto, o Pix ou o cartão, e os seis passos.
    const desenho = []
    for (const quem of Object.keys(esperado)) {
      const l = linha(quem)
      const tr = pagina.locator(".tabela tbody tr", { hasText: `#${l.numero}` })
      const forma = await tr.locator(".forma").getAttribute("data-forma")
      const passos = await tr.locator(".passos").getAttribute("data-passos")
      const fotos = await tr.locator(".fotos img").count()
      if (forma !== l.forma || passos !== l.passos.join(",") || fotos !== l.fotos.length)
        desenho.push(`#${l.numero}: ${forma} ${passos} ${fotos}`)
    }
    ok(
      desenho.length === 0 && Object.keys(esperado).every((q) => linha(q)?.fotos?.length >= 1),
      "cada linha: a foto do produto, o ícone do Pix ou do cartão e os seis passos, os da API",
      desenho.join(" | ")
    )
    ok(
      linha("entregue")?.passos[4] === "feito" &&
        linha("entregue")?.passos[5] === "feito" &&
        linha("pix")?.passos[1] === "agora" &&
        linha("vencido")?.passos[1] === "erro",
      "os passos: o entregue enviado e entregue; o Pix esperando no pagamento; o vencido, com problema",
      JSON.stringify(["entregue", "pix", "vencido"].map((q) => linha(q)?.passos))
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

  titulo("A lista em páginas")
  {
    // De 30 em 30 (entrega 0146): a página é só o recorte; as fitas contam a lista inteira.
    const api = async (q) =>
      (await medusa(`/dashboard/pedidos${q}`, { metodo: "GET", token: tokenDoDono })).corpo
    const p1 = await api("")
    const pag = p1.paginacao ?? {}
    ok(
      pag.porPagina === 30 &&
        p1.pedidos.length === Math.min(30, pag.itens) &&
        pag.itens === p1.contagem.todos &&
        pag.paginas === Math.max(1, Math.ceil(pag.itens / 30)),
      "a API manda uma página de 30, e conta a lista inteira",
      JSON.stringify({ paginacao: pag, linhas: p1.pedidos.length, todos: p1.contagem.todos })
    )
    const { pagina } = dono
    if (pag.paginas > 1) {
      const p2 = await api("?pagina=2")
      const ids1 = new Set(p1.pedidos.map((l) => l.id))
      ok(
        p2.pedidos.length > 0 &&
          p2.pedidos.every((l) => !ids1.has(l.id)) &&
          p1.pedidos.at(-1).criadoEm >= p2.pedidos[0].criadoEm,
        "a página 2 continua a 1, sem repetir pedido",
        JSON.stringify({ fim1: p1.pedidos.at(-1)?.numero, comeco2: p2.pedidos[0]?.numero })
      )
      await pagina.goto(`${PAINEL}/pedidos`)
      await hidratado(pagina, "[data-paginas] a[rel=next]")
      await pagina.locator("[data-paginas] a[rel=next]").click()
      await pagina.waitForURL((u) => u.searchParams.get("pagina") === "2", { timeout: 15000 })
      await pagina.waitForSelector(`.tabela tbody tr >> text=#${p2.pedidos[0].numero}`)
      const primeira = semEspaco(
        await pagina.locator(".tabela tbody tr .tabela__num").first().textContent()
      )
      ok(
        primeira === `#${p2.pedidos[0].numero}` &&
          (await pagina.locator(".tabela tbody tr").count()) === p2.pedidos.length,
        "“Próxima página” abre a 2, com os pedidos que a API manda nela",
        primeira
      )
      const quantos = semEspaco(
        await pagina.locator("[data-paginas] .paginas__quantos").textContent()
      )
      ok(
        quantos === `31–${Math.min(60, pag.itens)} de ${pag.itens}`,
        "o pé diz quais estão na tela, e de quantos",
        quantos
      )
      const todos = (await pagina.locator(".filtros .filtro").allTextContents()).find((f) =>
        f.startsWith("Todos")
      )
      ok(
        semEspaco(todos) === `Todos ${p1.contagem.todos}`,
        "na página 2, a fita “Todos” segue contando todos",
        todos
      )
      const ultima = await api("?pagina=999999")
      await pagina.goto(`${PAINEL}/pedidos?pagina=999999`)
      await pagina.waitForSelector("[data-paginas] [aria-current=page]")
      ok(
        ultima.paginacao?.pagina === pag.paginas &&
          semEspaco(await pagina.locator("[data-paginas] [aria-current=page]").textContent()) ===
            String(pag.paginas),
        "a página que não existe vira a última",
        JSON.stringify(ultima.paginacao)
      )
    } else {
      await pagina.goto(`${PAINEL}/pedidos`)
      await pagina.waitForSelector(".tabela tbody tr")
      ok((await pagina.locator("[data-paginas]").count()) === 0, "uma página só: o pé não aparece")
    }
  }

  titulo("O pedido inteiro, na tela do dono")
  for (const quem of ["pix", "analise", "pago", "enviado", "cancelado", "estornado"]) {
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
    // Os três de dinheiro; o das visitas (do Google) tem conferidor próprio, o conferir-visitas.
    const valores = (
      await pagina.locator(".numeros .numero:not([data-visitas]) .numero__valor").allTextContents()
    ).map(semEspaco)
    ok(
      valores.join(" | ") ===
        [api.numeros.vendasHoje.valor, api.numeros.esperando.valor, api.numeros.semana.valor]
          .map((v) => semEspaco(reais(v)))
          .join(" | "),
      "os números da tela são os da API",
      valores.join(" | ")
    )
    const fila = (await pagina.locator(".fila__titulo").allTextContents()).map(semIdade)
    const filaDaApi = api.fila.map((f) => semIdade(f.titulo))
    ok(
      fila.join(" | ") === filaDaApi.join(" | "),
      "a fila é a da API",
      primeiraDiferenca(fila, filaDaApi)
    )
    // A fila agrupada (0148): o que é igual vem junto, com o número de pedidos e os pedidos um por um.
    const chaves = api.fila.map((f) => f.chave)
    ok(
      chaves.every(Boolean) &&
        new Set(chaves).size === chaves.length &&
        api.fila.every((f) => !f.pedidos || f.quantos === f.pedidos.length),
      "a fila junta o que é igual: uma chave por item, e o número é o de pedidos",
      JSON.stringify(api.fila.map((f) => [f.chave, f.quantos, f.pedidos?.length]))
    )
    const analise = api.fila.find((f) => f.chave === "analise")
    ok(
      Boolean(analise?.pedidos?.some((p) => p.numero === pedidos.analise.numero)) &&
        /^há /.test(analise?.etiquetas?.[0] ?? ""),
      "o cartão em análise da rodada está no item dos cartões, com a idade do mais antigo",
      JSON.stringify(analise)
    )
    const naTela = []
    for (const f of api.fila) {
      const item = pagina.locator(`[data-chave="${f.chave}"]`)
      const contagem = f.quantos ? semEspaco(await item.locator(".contagem").textContent()) : ""
      const fichas = (await item.locator(".ficha:not(.ficha--mais)").allTextContents()).map(
        semEspaco
      )
      const mais = semEspaco(
        await item
          .locator(".ficha--mais")
          .textContent()
          .catch(() => "")
      )
      const esperadas = (f.pedidos ?? []).slice(0, 6).map((p) => `#${p.numero}`)
      const sobra = Math.max(0, (f.pedidos ?? []).length - 6)
      if (
        contagem !== (f.quantos ? String(f.quantos) : "") ||
        fichas.join(",") !== esperadas.join(",") ||
        mais !== (sobra ? `+${sobra}` : "") ||
        (await item.locator("[data-ajuda]").count()) !== (f.texto ? 1 : 0)
      )
        naTela.push(`${f.chave}: ${contagem} ${fichas.join(",")} ${mais}`)
    }
    ok(
      naTela.length === 0,
      "cada item na tela: o número, os pedidos (até 6, e o +N) e o “?” com a explicação",
      naTela.join(" | ")
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
