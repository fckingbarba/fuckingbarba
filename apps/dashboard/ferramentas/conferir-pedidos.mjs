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
 * │ • o Início com número que a API não deu; o período (0186) contando    │
 * │   diferente do Início de sempre, os botões e as datas sem trocar os    │
 * │   números, a marca do checkout contando duas vezes;                    │
 * │ • o porquê de quem saiu no pagamento (0244) diferente da API, ou a     │
 * │   marca do cartão que não passou da tela aceita sem ser da loja;       │
 * │ • o histórico da tela diferente do da API, ou o e-mail que não chegou  │
 * │   sem o vermelho (0248);                                               │
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

const INTEIRO = new Intl.NumberFormat("pt-BR")
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
    // 0155: a faixa mostra o título e as etiquetas; a frase inteira vai no "?".
    const faixasNaTela = await pagina.locator(".faixa").evaluateAll((els) =>
      els.map((f) => ({
        titulo: f.querySelector(".faixa__titulo")?.textContent ?? "",
        etiquetas: [...f.querySelectorAll(".faixa__etiqueta")].map((e) => e.textContent ?? ""),
        ajuda: f.querySelector("[data-ajuda] .ajuda__texto")?.textContent ?? "",
      }))
    )
    const emTexto = (fs) =>
      JSON.stringify(
        fs.map((f) => ({
          titulo: semEspaco(f.titulo),
          etiquetas: (f.etiquetas ?? []).map(semEspaco),
          ajuda: semEspaco(f.ajuda),
        }))
      )
    ok(
      emTexto(faixasNaTela) ===
        emTexto(
          d.faixas.map((f) => ({ titulo: f.titulo, etiquetas: f.etiquetas, ajuda: f.texto }))
        ),
      `#${d.numero}: as faixas da API — o título e as etiquetas à vista, a frase no "?"`,
      emTexto(faixasNaTela)
    )
    const forma = (await pagina.locator(".com-icone .forma").count())
      ? await pagina.locator(".com-icone .forma").getAttribute("data-forma")
      : null
    ok(
      forma === (d.pagamento.tipo ?? null),
      `#${d.numero}: o ícone do pagamento (${d.pagamento.forma})`,
      String(forma)
    )
    // O histórico da tela é o da API, linha a linha, e o vermelho só no que é problema (0248).
    const historicoNaTela = await pagina.locator(".historico li").evaluateAll((lis) =>
      lis.map((li) => [li.querySelector("span")?.textContent ?? "", li.hasAttribute("data-erro")])
    )
    const emLinhas = (ls) => JSON.stringify(ls.map(([texto, erro]) => [semEspaco(texto), erro]))
    ok(
      emLinhas(historicoNaTela) ===
        emLinhas(d.historico.map((e) => [`${e.titulo}${e.detalhe}`, Boolean(e.alerta)])),
      `#${d.numero}: o histórico da tela é o da API, e o vermelho só no que é problema`,
      emLinhas(historicoNaTela)
    )
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

  titulo("O Pix esperando: copiar o código e chamar no WhatsApp (0247)")
  {
    const { pagina, contexto } = dono
    const detalhe = async (quem, token = tokenDoDono) =>
      (await medusa(`/dashboard/pedidos/${pedidos[quem].id}`, { metodo: "GET", token })).corpo
        .pedido
    const d = await detalhe("pix")
    ok(
      Boolean(d.pagamento.pix?.codigo) && /^\d{2}:\d{2}$/.test(d.pagamento.pix?.valeAte ?? ""),
      "a API manda o código do Pix e até quando vale",
      JSON.stringify(d.pagamento.pix)
    )
    const texto = decodeURIComponent(String(d.cliente.whatsapp).split("?text=")[1] ?? "")
    ok(
      String(d.cliente.whatsapp).startsWith("https://wa.me/5511988887777?text=") &&
        texto.includes(
          `#${d.numero} está esperando o Pix, que vale até ${d.pagamento.pix?.valeAte}`
        ),
      "e o WhatsApp do cliente, com a mensagem do Pix pronta",
      texto
    )
    for (const quem of ["vencido", "pago"]) {
      const outro = await detalhe(quem)
      ok(outro.pagamento.pix === null, `${quem}: sem código do Pix na API`)
    }
    ok(
      String((await detalhe("pago")).cliente.whatsapp).startsWith("https://wa.me/55"),
      "o pago também tem o WhatsApp do cliente"
    )

    // O wa.me não sai da máquina: a aba nova recebe uma página vazia.
    await contexto.route("https://wa.me/**", (r) =>
      r.fulfill({ status: 200, contentType: "text/html", body: "<p>wa</p>" })
    )
    await contexto.grantPermissions(["clipboard-read", "clipboard-write"], { origin: PAINEL })
    await pagina.goto(`${PAINEL}/pedidos/${pedidos.pix.id}`)
    await hidratado(pagina, "[data-copiar-pix]")
    const bloco = pagina.locator("[data-pix-esperando]")
    ok(
      (await bloco.count()) === 1 && (await bloco.locator("[data-dica-pix]").count()) === 1,
      "o “O que fazer” do Pix, com a dica de mandar o código sozinho"
    )
    const links = await pagina
      .locator(`[data-whatsapp-pedido="${d.id}"]`)
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")))
    ok(
      links.length === 2 && links.every((l) => l === d.cliente.whatsapp),
      "o WhatsApp no “O que fazer” e no bloco do cliente é o da API",
      JSON.stringify(links)
    )
    await pagina.click("[data-copiar-pix]")
    await pagina.waitForSelector(".aviso", { timeout: 10000 })
    const copiado = await pagina.evaluate(() => navigator.clipboard.readText())
    ok(copiado === d.pagamento.pix?.codigo, "“Copiar o código do Pix” copia o código da API")
    await pagina.waitForSelector('.historico li:has-text("copiou o código do Pix")', {
      timeout: 15000,
    })
    ok(true, "e o histórico diz quem copiou")

    const [aba] = await Promise.all([
      pagina.waitForEvent("popup"),
      pagina.locator("[data-pix-esperando] [data-whatsapp-pedido]").click(),
    ])
    ok(aba.url() === d.cliente.whatsapp, "“Chamar no WhatsApp” abre o wa.me numa aba nova")
    await aba.close()
    await pagina.waitForSelector('.historico li:has-text("chamou no WhatsApp")', {
      timeout: 15000,
    })
    ok(true, "e o histórico diz quem chamou")

    // Clicar de novo não enche o histórico (o histórico lê só as 50 primeiras ações).
    for (const como of ["pix", "whatsapp"]) {
      const r = await medusa(`/dashboard/pedidos/${d.id}/contato`, {
        token: tokenDoDono,
        corpo: { como },
      })
      ok(r.status === 200, `de novo (${como}): 200`, String(r.status))
    }
    const linhas = (await detalhe("pix")).historico.map((e) => e.titulo)
    ok(
      linhas.filter((t) => t.endsWith("copiou o código do Pix")).length === 1 &&
        linhas.filter((t) => t.endsWith("chamou no WhatsApp")).length === 1,
      "o mesmo clique da mesma pessoa em 30 min vira uma linha só",
      JSON.stringify(linhas)
    )
    const ruim = await medusa(`/dashboard/pedidos/${d.id}/contato`, {
      token: tokenDoDono,
      corpo: { como: "sms" },
    })
    ok(ruim.status === 400, "outro “como” é recusado", String(ruim.status))
    const doMkt = await medusa(`/dashboard/pedidos/${d.id}/contato`, {
      token: cookieMkt.value,
      corpo: { como: "pix" },
    })
    ok(doMkt.status === 403, "o marketing não anota no pedido", String(doMkt.status))
    const daOp = await detalhe("pix", cookieOp.value)
    ok(
      daOp.cliente.whatsapp === d.cliente.whatsapp &&
        daOp.pagamento.pix?.codigo === d.pagamento.pix?.codigo,
      "a operação (abre os contatos) tem o código e o WhatsApp"
    )

    for (const quem of ["vencido", "pago"]) {
      await pagina.goto(`${PAINEL}/pedidos/${pedidos[quem].id}`)
      await pagina.waitForSelector(".caminho li")
      ok(
        (await pagina.locator("[data-copiar-pix]").count()) === 0,
        `${quem}: sem o botão de copiar o Pix`
      )
    }
    ok(
      (await pagina.locator("[data-whatsapp-pedido]").count()) === 1,
      "o pago tem só o WhatsApp do bloco do cliente"
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
      (await pagina.locator('[data-bloco="mais-vendidos"]').count()) === 1 &&
        (await pagina.locator('[data-bloco="pedidos-do-periodo"]').count()) === 0,
      "e tem os mais vendidos, sem a lista de pedidos"
    )
    const doMkt = (
      await medusa("/dashboard/inicio?periodo=hoje", { metodo: "GET", token: cookieMkt.value })
    ).corpo.periodo
    ok(
      doMkt?.pedidos === null && Array.isArray(doMkt?.checkout),
      "no período, a API do marketing vem sem os pedidos e com o checkout",
      JSON.stringify({ pedidos: doMkt?.pedidos, checkout: doMkt?.checkout?.length })
    )
  }

  titulo("O Início do dono")
  {
    const { pagina } = dono
    const api = (
      await medusa("/dashboard/inicio?periodo=hoje", { metodo: "GET", token: tokenDoDono })
    ).corpo
    const n = api.periodo
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector(".numeros")
    // Os três da loja; o das visitas (do Google) tem conferidor próprio, o conferir-visitas.
    const valores = (
      await pagina
        .locator('.numeros [data-numero]:not([data-numero="visitas"]) .numero__valor')
        .allTextContents()
    ).map(semEspaco)
    ok(
      valores.join(" | ") ===
        [INTEIRO.format(n.vendas.valor), reais(n.receita.valor), reais(n.ticket.valor)]
          .map(semEspaco)
          .join(" | "),
      "os números da tela são os da API",
      valores.join(" | ")
    )
    // A conta nova (0186) contra a de sempre, a das vendas de hoje, que tem os anos de estrada.
    ok(
      n.vendas.valor === api.numeros.vendasHoje.pedidos &&
        n.receita.valor === api.numeros.vendasHoje.valor &&
        n.vendas.valor >= 3,
      "hoje, as vendas e a receita são as de sempre (o pago, o enviado e o entregue da rodada, pelo menos)",
      JSON.stringify({
        periodo: [n.vendas.valor, n.receita.valor],
        deSempre: api.numeros.vendasHoje,
      })
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
    const pix = api.fila.find((f) => f.chave === "pix")
    ok(
      Boolean(pix?.pedidos?.some((p) => p.numero === pedidos.pix.numero)) &&
        /^R\$/.test(pix?.etiquetas?.[0] ?? "") &&
        /^R\$/.test(analise?.etiquetas?.[1] ?? ""),
      "o Pix da rodada está no “Pix esperando”, e os dois de pagamento dizem quanto espera",
      JSON.stringify({ pix, analise: analise?.etiquetas })
    )
    const hoje = (
      await pagina.locator('[data-bloco="pedidos-do-periodo"] .mini__titulo').allTextContents()
    ).map(semEspaco)
    ok(
      hoje.join(" | ") ===
        n.pedidos.lista.map((l) => semEspaco(`#${l.numero} · ${l.cliente.nome}`)).join(" | ") &&
        n.pedidos.lista.length === Math.min(6, n.pedidos.total) &&
        n.pedidos.lista[0]?.id === pedidos.estornado.id &&
        semEspaco(await textoDe(pagina, '[data-bloco="pedidos-do-periodo"] .contagem')) ===
          String(n.pedidos.total),
      "os “Pedidos de hoje” são os da API: os seis mais novos (o último da rodada em cima) e quantos são",
      hoje.join(" | ")
    )
    const barras = await pagina.locator('[data-numero="receita"] .barrinhas rect').count()
    ok(
      n.barras.length === 24 &&
        barras === n.barras.filter((b) => b.receita > 0).length &&
        barras >= 1,
      "o gráfico da receita: uma barra em cada hora com venda",
      String(barras)
    )
    const passos = await pagina.locator('[data-bloco="checkout"] .degrau__n b').allTextContents()
    ok(
      passos.join(",") === n.checkout.map((x) => INTEIRO.format(x.n)).join(",") &&
        n.checkout[3].n >= 8,
      "o checkout na tela é o da API (os oito pedidos da rodada, pelo menos, no “fizeram o pedido”)",
      passos.join(",")
    )
  }

  titulo("O Início no período (0186)")
  {
    const { pagina } = dono
    const doPeriodo = async (consulta, token = tokenDoDono) =>
      (await medusa(`/dashboard/inicio?${consulta}`, { metodo: "GET", token })).corpo
    const numerosNaTela = async () =>
      (
        await pagina
          .locator('.numeros [data-numero]:not([data-numero="visitas"]) .numero__valor')
          .allTextContents()
      )
        .map(semEspaco)
        .join(" | ")
    const numerosDa = (x) =>
      [INTEIRO.format(x.vendas.valor), reais(x.receita.valor), reais(x.ticket.valor)]
        .map(semEspaco)
        .join(" | ")

    const semana = await doPeriodo("periodo=7d")
    ok(
      semana.periodo.receita.valor === semana.numeros.semana.valor &&
        semana.periodo.vendas.valor === semana.numeros.semana.pedidos &&
        semana.periodo.ticket.valor === semana.numeros.semana.ticket,
      "7 dias: os mesmos números dos “últimos 7 dias” de sempre",
      JSON.stringify({ periodo: semana.periodo.vendas, deSempre: semana.numeros.semana })
    )
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector('[data-atalho="hoje"][aria-current]')
    await pagina.click('[data-atalho="7d"]')
    await pagina.waitForSelector('[data-atalho="7d"][aria-current]')
    ok(
      new URL(pagina.url()).search === "?periodo=7d" &&
        (await numerosNaTela()) === numerosDa(semana.periodo),
      "tocar em “7 dias” leva o período pro endereço e troca os números",
      `${pagina.url()} · ${await numerosNaTela()}`
    )
    ok(
      (await pagina.locator('[data-numero="receita"] .barrinhas rect').count()) ===
        semana.periodo.barras.filter((b) => b.receita > 0).length &&
        semana.periodo.barras.length === 7,
      "7 dias: uma barra por dia com venda"
    )

    await pagina.click("[data-comparar] summary")
    await pagina.click('[data-comparar-com="nenhum"]')
    await pagina.waitForURL((u) => u.searchParams.get("comparar") === "nenhum")
    await pagina.waitForFunction(
      () => !document.querySelector('[data-numero="vendas"] .numero__antes')
    )
    ok(
      (await pagina.locator('[data-numero="receita"] .barrinhas polyline').count()) === 0 &&
        (await pagina.locator(".periodo__legenda .leg-tracejado").count()) === 0 &&
        semEspaco(await textoDe(pagina, "[data-comparar] summary b")) === "nada",
      "“não comparar”: sem o de antes nos números, no gráfico e na legenda"
    )

    const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date()
    )
    await pagina.click("[data-escolher] summary")
    await pagina.fill('[data-escolher] input[name="de"]', dia)
    await pagina.fill('[data-escolher] input[name="ate"]', dia)
    await pagina.click('[data-escolher] button[type="submit"]')
    await pagina.waitForURL((u) => u.searchParams.get("de") === dia)
    await pagina.waitForSelector(".periodo__botao--datas[aria-current]")
    const escolhido = await doPeriodo(`de=${dia}&ate=${dia}&comparar=nenhum`)
    const deHoje = await doPeriodo("periodo=hoje")
    ok(
      new URL(pagina.url()).searchParams.get("comparar") === "nenhum" &&
        (await numerosNaTela()) === numerosDa(escolhido.periodo) &&
        numerosDa(escolhido.periodo) === numerosDa(deHoje.periodo) &&
        semEspaco(await textoDe(pagina, ".periodo__botao--datas")) ===
          `${dia.slice(8)}/${dia.slice(5, 7)}`,
      "as datas escolhidas (hoje a hoje, ainda sem comparar): os números de hoje",
      `${pagina.url()} · ${await numerosNaTela()}`
    )

    await pagina.goto(`${PAINEL}/?de=2026-02-31&ate=2026-03-02`)
    await pagina.waitForSelector("[data-aviso-do-periodo]")
    ok(
      /As datas não valem/.test(await textoDe(pagina, "[data-aviso-do-periodo]")) &&
        (await pagina.locator('[data-atalho="hoje"][aria-current]').count()) === 1,
      "datas que não existem: o aviso, e a tela de hoje"
    )

    // A marca de "começou o checkout" (a loja põe quando o checkout abre): um carrinho só com o produto.
    const cabecalhos = { "content-type": "application/json", "x-publishable-api-key": CHAVE }
    const { regions } = await (
      await fetch(`${MEDUSA}/store/regions`, { headers: cabecalhos })
    ).json()
    const regiao = regions.find((x) => x.currency_code === "brl")
    const { products } = await (
      await fetch(`${MEDUSA}/store/products?region_id=${regiao.id}&fields=*variants&limit=1`, {
        headers: cabecalhos,
      })
    ).json()
    const { cart } = await (
      await fetch(`${MEDUSA}/store/carts`, {
        method: "POST",
        headers: { ...cabecalhos, "x-loja-segredo": process.env.REVALIDAR_SEGREDO ?? "" },
        body: JSON.stringify({
          region_id: regiao.id,
          items: [{ variant_id: products[0].variants[0].id, quantity: 1 }],
        }),
      })
    ).json()
    const abrir = (carrinho, assinado = true) =>
      medusa("/store/checkout/aberto", {
        corpo: { carrinho },
        assinado,
        extras: { "x-publishable-api-key": CHAVE },
      })
    const antes = (await doPeriodo("periodo=hoje")).periodo.checkout.map((x) => x.n)
    const primeira = await abrir(cart.id)
    const segunda = await abrir(cart.id)
    const depois = (await doPeriodo("periodo=hoje")).periodo.checkout.map((x) => x.n)
    ok(
      primeira.corpo.marcado === true &&
        segunda.corpo.marcado === false &&
        depois[0] === antes[0] + 1 &&
        depois.slice(1).join() === antes.slice(1).join(),
      "o checkout aberto conta em “começaram” uma vez só, e em nenhum passo depois",
      JSON.stringify({ antes, depois, primeira: primeira.corpo, segunda: segunda.corpo })
    )
    const [semAssinatura, torto, sumido] = await Promise.all([
      abrir(cart.id, false),
      abrir("carrinho-torto"),
      abrir("cart_NAOEXISTE0000000000000000"),
    ])
    ok(
      semAssinatura.status === 401 && torto.status === 400 && sumido.status === 404,
      "a marca é só da loja: sem a assinatura, 401; carrinho torto, 400; que não existe, 404",
      `${semAssinatura.status} · ${torto.status} · ${sumido.status}`
    )

    titulo("Por que saíram no pagamento (0244)")
    // O mesmo carrinho, levado até o pagamento pela API da loja: sem tentativa nenhuma.
    const loja = async (rota, corpo) => {
      const r = await fetch(`${MEDUSA}${rota}`, {
        method: corpo === undefined ? "GET" : "POST",
        headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(`${rota} → ${r.status} ${JSON.stringify(j)}`)
      return j
    }
    const endereco = {
      first_name: "Rafael",
      last_name: `Saída ${RODADA}`,
      phone: "+5511988887777",
      address_1: "Rua Doutor Pedro Zimmermann, 99",
      city: "Blumenau",
      province: "SC",
      postal_code: "89036370",
      country_code: "br",
      metadata: { rua: "Rua Doutor Pedro Zimmermann", numero: "99", bairro: "Itoupava Central" },
    }
    const saidasAntes = (await doPeriodo("periodo=hoje")).periodo
    await loja(`/store/carts/${cart.id}`, {
      email: `saida.${RODADA}@fuckingbarba.invalid`,
      shipping_address: endereco,
      billing_address: {
        ...endereco,
        metadata: { ...endereco.metadata, documento: { tipo: "cpf", valor: "11144477735" } },
      },
    })
    const { shipping_options } = await loja(`/store/shipping-options?cart_id=${cart.id}`)
    await loja(`/store/carts/${cart.id}/shipping-methods`, { option_id: shipping_options[0].id })
    const noPagamento = (await doPeriodo("periodo=hoje")).periodo
    const saiu = (x) => x.checkout[2].n - x.checkout[3].n
    ok(
      noPagamento.saidas?.total === (saidasAntes.saidas?.total ?? 0) + 1 &&
        noPagamento.saidas.semTentar === (saidasAntes.saidas?.semTentar ?? 0) + 1 &&
        noPagamento.saidas.total === saiu(noPagamento),
      "o carrinho parado no pagamento, sem tentar: +1 em “sem tentar”, e o total é o “saíram” do passo",
      JSON.stringify({
        antes: saidasAntes.saidas,
        depois: noPagamento.saidas,
        saiu: saiu(noPagamento),
      })
    )

    const naTela = (carrinho, porque, assinado = true) =>
      medusa("/store/checkout/cartao-na-tela", {
        corpo: { carrinho, porque },
        assinado,
        extras: { "x-publishable-api-key": CHAVE },
      })
    const marcou = await naTela(cart.id, "dados")
    const comTela = (await doPeriodo("periodo=hoje")).periodo
    ok(
      marcou.status === 200 &&
        marcou.corpo.marcado === true &&
        comTela.saidas?.total === noPagamento.saidas.total &&
        comTela.saidas.naTela === noPagamento.saidas.naTela + 1 &&
        comTela.saidas.semTentar === noPagamento.saidas.semTentar - 1,
      "o cartão que não passou da tela (a marca da loja) sai de “sem tentar” e entra em “não passou da tela”",
      JSON.stringify({ marcou: marcou.corpo, antes: noPagamento.saidas, depois: comTela.saidas })
    )
    const [semAssinar, porqueTorto, naoExiste] = await Promise.all([
      naTela(cart.id, "dados", false),
      naTela(cart.id, "outro"),
      naTela("cart_NAOEXISTE0000000000000000", "conexao"),
    ])
    ok(
      semAssinar.status === 401 && porqueTorto.status === 400 && naoExiste.status === 404,
      "a marca do cartão também é só da loja: 401 sem assinatura, 400 com porquê torto, 404 sem carrinho",
      `${semAssinar.status} · ${porqueTorto.status} · ${naoExiste.status}`
    )

    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector('[data-bloco="checkout"] [data-saidas]')
    const naTelaDoPainel = Object.fromEntries(
      await pagina
        .locator('[data-barras="saidas"] li')
        .evaluateAll((lis) =>
          lis.map((li) => [
            li.getAttribute("data-saida"),
            Number(li.querySelector(".barras-h__num")?.firstChild?.textContent?.trim()),
          ])
        )
    )
    const s = comTela.saidas
    const daApi = Object.fromEntries(
      [
        ["banco", s.recusado.banco],
        ["antifraude", s.recusado.antifraude],
        ["dados", s.recusado.dados],
        ["na-tela", s.naTela],
        ["barrado", s.barrado],
        ["erro", s.erro],
        ["sem-tentar", s.semTentar],
        ["sem-registro", s.semRegistro],
      ].filter(([, n]) => n > 0)
    )
    const rotulo = semEspaco(await textoDe(pagina, ".saidas__rotulo"))
    ok(
      JSON.stringify(naTelaDoPainel) === JSON.stringify(daApi) &&
        rotulo.toLowerCase() ===
          `por que ${s.total} ${s.total === 1 ? "saiu" : "saíram"} no pagamento` &&
        Number(await pagina.getAttribute("[data-saidas]", "data-saidas")) === s.total,
      "na tela, os porquês e quantos são os da API (só os que aconteceram)",
      JSON.stringify({ naTela: naTelaDoPainel, daApi, rotulo })
    )
    const nota = await pagina.locator("[data-maior-perda]").count()
    ok(
      nota === 0 ||
        /a maior taxa de saída do período\.$/.test(
          semEspaco(await textoDe(pagina, "[data-maior-perda]"))
        ),
      "o aviso amarelo diz o que mede: a maior taxa de saída",
      nota ? await textoDe(pagina, "[data-maior-perda]") : "sem aviso"
    )
  }

  titulo("O Início da operação")
  {
    const { pagina } = op
    const api = (
      await medusa("/dashboard/inicio?periodo=hoje", { metodo: "GET", token: cookieOp.value })
    ).corpo.periodo
    await pagina.goto(`${PAINEL}/`)
    await pagina.waitForSelector('[data-bloco="pedidos-do-periodo"]')
    ok(
      api?.checkout === null &&
        api?.pedidos !== null &&
        (await pagina.locator('[data-bloco="checkout"], [data-taxa]').count()) === 0,
      "a operação vê os números e os pedidos, sem o checkout e as taxas (são do Marketing)",
      JSON.stringify({ checkout: api?.checkout })
    )
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
