/**
 * CONFERIDOR DO WHATSAPP DA LOJA — a mensagem que chega pelo webhook da Meta
 * e a resposta que o atendente manda, de ponta a ponta, sem navegador.
 *
 *   node ferramentas/conferir-whatsapp.mjs
 *
 * Variáveis: MEDUSA_BACKEND_URL, DATABASE_URL (o banco do backend local: o
 *            conferidor lê as conversas direto dele), WHATSAPP_APP_SEGREDO e
 *            WHATSAPP_VERIFICACAO (os mesmos do backend; padrão: os de teste),
 *            ADMIN_EMAIL e ADMIN_SENHA (o admin local: a parte 2 faz pedidos
 *            de teste, com a Frenet e o Pagar.me falsos — PORTA_FALSA e
 *            PORTA_PAGARME_FALSO, as mesmas do FRENET_URL e do PAGARME_URL —,
 *            e REVALIDAR_SEGREDO, o do backend: sem a assinatura da loja, a
 *            trava de 3 Pix em 40 minutos barra a segunda rodada).
 *
 * O backend sobe apontando pro WhatsApp e pra IA falsos (`whatsapp-falso.mjs`,
 * na 4380 — este conferidor sobe os dois):
 *   WHATSAPP_URL=http://127.0.0.1:4380 ANTHROPIC_URL=http://127.0.0.1:4380
 *   LOJA_URL=http://127.0.0.1:4380 WHATSAPP_TOKEN=token-de-teste
 *   WHATSAPP_NUMERO_ID=100000000000001 WHATSAPP_APP_SEGREDO=segredo-de-teste
 *   WHATSAPP_VERIFICACAO=verificacao-de-teste ANTHROPIC_API_KEY=sk-ant-teste
 *
 * ┌─ A PERGUNTA QUE ESTE ARQUIVO RESPONDE ─────────────────────────────────┐
 * │ Quem escreve pro número da loja recebe UMA resposta, que leu tudo o    │
 * │ que a pessoa mandou, com o produto do catálogo de verdade e o link     │
 * │ marcado; a IA recebe o pedido do jeito certo (o modelo, a reserva, o   │
 * │ cache); o aviso sem a assinatura da Meta não entra; a conversa que vai │
 * │ pra equipe fica quieta; a resposta automática do outro lado não é      │
 * │ respondida; e a IA fora do ar termina no "vou chamar alguém do time".  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * A PARTE 2 (os pedidos do telefone, o Pix em mensagem separada, o frete, a
 * sacola montada, o refazer e o pedido de outra pessoa) faz dois pedidos de
 * teste com o telefone dos pedidos de teste (`pedido-de-teste.mjs`) e conversa
 * por esse número — roda junto com a parte 1.
 *
 * DEMORA uns 5 minutos: o atendente responde de minuto em minuto (o job
 * `responder-no-whatsapp`), e a IA fora precisa de três rodadas seguidas
 * antes de chamar a equipe. As conversas da rodada saem do banco no fim.
 */

import { createHmac } from "node:crypto"
import pg from "pg"
import { subirFrenetFalsa } from "./frenet-falsa.mjs"
import { subirPagarmeFalso } from "./pagarme-falso.mjs"
import { fabricaDePedidos } from "./pedido-de-teste.mjs"
import { subirWhatsappFalso } from "./whatsapp-falso.mjs"

const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const BANCO = process.env.DATABASE_URL
const SEGREDO = process.env.WHATSAPP_APP_SEGREDO ?? "segredo-de-teste"
const VERIFICACAO = process.env.WHATSAPP_VERIFICACAO ?? "verificacao-de-teste"
const NUMERO_DA_LOJA = "100000000000001"
const SOCORRO = "Opa! Vou chamar alguém do time pra continuar com você por aqui, só um instante."

if (!BANCO) {
  console.log("  ⚠  falta o DATABASE_URL do backend local — nada a conferir")
  process.exit(1)
}

let passou = 0
let falhou = 0
const ok = (cond, texto, detalhe = "") => {
  console.log(
    `${cond ? "  ok  " : " FALHA"} ${texto}${cond || !detalhe ? "" : `\n         ${detalhe}`}`
  )
  cond ? passou++ : falhou++
}
const titulo = (t) => console.log(`\n${t}`)
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms))

/** Espera a condição (de 2 em 2 s) até o tempo acabar; devolve o último valor. */
async function esperar(ler, ate, tempoS) {
  const fim = Date.now() + tempoS * 1000
  let v = await ler()
  while (!ate(v) && Date.now() < fim) {
    await dormir(2000)
    v = await ler()
  }
  return v
}

const RODADA = String(Date.now()).slice(-6)
/** Um número por cenário, que nenhuma outra rodada usa: 55 + DDD 99 + 9 + rodada + cenário. */
const numero = (cenario) => `5599${9}${RODADA}${String(cenario).padStart(2, "0")}`
let contador = 0
const wamid = () => `wamid.TESTE${RODADA}${++contador}`

function aviso({
  mensagens = [],
  situacoes = [],
  nome = null,
  telefone,
  numeroDaLoja = NUMERO_DA_LOJA,
}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "200000000000002",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "5500000000000", phone_number_id: numeroDaLoja },
              ...(telefone && nome
                ? { contacts: [{ profile: { name: nome }, wa_id: telefone }] }
                : {}),
              ...(mensagens.length ? { messages: mensagens } : {}),
              ...(situacoes.length ? { statuses: situacoes } : {}),
            },
          },
        ],
      },
    ],
  }
}

const texto = (telefone, corpo, id = wamid()) => ({
  from: telefone,
  id,
  timestamp: String(Math.floor(Date.now() / 1000)),
  type: "text",
  text: { body: corpo },
})

async function postar(corpo, { assinatura } = {}) {
  const bruto = JSON.stringify(corpo)
  const r = await fetch(`${MEDUSA}/hooks/whatsapp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(assinatura === null
        ? {}
        : {
            "x-hub-signature-256":
              assinatura ?? `sha256=${createHmac("sha256", SEGREDO).update(bruto).digest("hex")}`,
          }),
    },
    body: bruto,
  })
  return r.status
}

const banco = new pg.Client({ connectionString: BANCO })
await banco.connect()
const conversa = async (telefone) =>
  (
    await banco.query(
      "select * from whatsapp_conversa where telefone = $1 and deleted_at is null",
      [telefone]
    )
  ).rows[0] ?? null
const mensagens = async (telefone) =>
  (
    await banco.query(
      `select m.* from whatsapp_mensagem m join whatsapp_conversa c on c.id = m.conversa_id
        where c.telefone = $1 and m.deleted_at is null order by m.em, m.created_at`,
      [telefone]
    )
  ).rows

const falso = await subirWhatsappFalso()
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_SENHA = process.env.ADMIN_SENHA
/** O telefone dos pedidos de teste (`pedido-de-teste.mjs`), como o WhatsApp manda. */
const DONO = "5511988887777"
const enviadasPara = (tel) => falso.enviadas.filter((m) => m.para === tel)
const pedidosCom = (marca) =>
  falso.pedidosAIa.filter((p) => JSON.stringify(p.corpo.messages).includes(marca))

async function apagarConversa(telefone) {
  await banco.query(
    `delete from whatsapp_mensagem where conversa_id in
       (select id from whatsapp_conversa where telefone = $1)`,
    [telefone]
  )
  await banco.query("delete from whatsapp_conversa where telefone = $1", [telefone])
}

let frenet = null
let pagarme = null

/**
 * A PARTE 2: devolve as checagens ([condição, frase, detalhe]) pra serem
 * impressas no fim — ela roda enquanto a parte 1 espera as respostas.
 */
async function rodarParte2() {
  const res = []
  const ver = (cond, texto, detalhe = "") => res.push([Boolean(cond), texto, detalhe])
  if (!ADMIN_EMAIL || !ADMIN_SENHA) {
    ver(false, "a parte 2 precisa de ADMIN_EMAIL e ADMIN_SENHA (o admin LOCAL)")
    return res
  }
  const chave = (
    await banco.query(
      "select token from api_key where type = 'publishable' and revoked_at is null limit 1"
    )
  ).rows[0]?.token
  frenet = await subirFrenetFalsa()
  pagarme = await subirPagarmeFalso({
    webhook: {
      url: `${MEDUSA}/hooks/payment/pagarme_pagarme`,
      segredo: process.env.MEDUSA_WEBHOOK_SEGREDO ?? "segredo-de-teste",
    },
  })
  const entrou = await fetch(`${MEDUSA}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_SENHA }),
  })
  const tokenAdmin = (await entrou.json()).token
  const fabrica = fabricaDePedidos({ medusa: MEDUSA, chave, tokenAdmin, pagarme })
  const loja = (caminho, init = {}) =>
    fetch(`${MEDUSA}${caminho}`, {
      ...init,
      headers: { "content-type": "application/json", "x-publishable-api-key": chave },
    }).then((r) => r.json())

  // Dois pedidos do telefone de teste: um Pix esperando e um pago e postado.
  const EMAIL = `whatsapp.${RODADA}@teste.fuckingbarba.dev`
  const pix = await fabrica.pedidoPix(EMAIL, [["shampoo-para-barba", 1]])
  const enviado = await fabrica.pedidoPix(EMAIL, [["oleo-para-barba", 2]])
  await fabrica.pagar(enviado)
  const CODIGO = `WA${RODADA}123BR`.slice(0, 13).padEnd(13, "0")
  await fabrica.enviar(enviado, { codigo: CODIGO, url: `https://rastreio.exemplo/${CODIGO}` })
  await apagarConversa(DONO)

  /** Manda a mensagem e espera a(s) resposta(s) que chegarem depois dela. */
  const conversar = async (de, texto, quantas = 1) => {
    const antes = enviadasPara(de).length
    await postar(
      aviso({ telefone: de, nome: "Rafael Teste", mensagens: [{ ...textoDe(de, texto) }] })
    )
    const chegou = await esperar(
      () => enviadasPara(de).slice(antes),
      (l) => l.length >= quantas,
      100
    )
    if (quantas > 1) await dormir(3000)
    return enviadasPara(de).slice(antes)
  }
  const voltar = async (resposta) => {
    const t = resposta.match(/\/voltar\/([^?\s]+)\?utm_source=whatsapp/)?.[1]
    if (!t) return null
    const r = await loja("/store/crm/voltar", { method: "POST", body: JSON.stringify({ t }) })
    if (!r?.carrinho) return { t, carrinho: null }
    const { cart } = await loja(`/store/carts/${r.carrinho}?fields=email,*items,*shipping_address`)
    return { t, carrinho: cart }
  }

  // De outro número: o pedido pelo número e o e-mail (em paralelo com o dono).
  const outro = numero(21)
  const deOutro = (async () => {
    const [certo] = await conversar(outro, `OUTRO ${enviado.numero} ${EMAIL.toUpperCase()}`)
    const [errado] = await conversar(outro, `OUTRO ${enviado.numero} errado@teste.dev`)
    return { certo: certo?.texto ?? "", errado: errado?.texto ?? "" }
  })()
  const doFrete = conversar(numero(20), "FRETE 89036-370 shampoo-para-barba")
  const doProduto = (async () => {
    const [certo] = await conversar(numero(22), "PRODUTO fator-de-crescimento-para-barba")
    const [errado] = await conversar(numero(22), "PRODUTO nao-existe")
    return { certo: certo?.texto ?? "", errado: errado?.texto ?? "" }
  })()

  const [pedidos] = await conversar(DONO, "PEDIDOS")
  const tp = pedidos?.texto ?? ""
  ver(
    tp.includes(`Pedido #${pix.numero}`) && tp.includes("esperando o pagamento do Pix"),
    "ver_meus_pedidos: o Pix esperando, do telefone",
    tp
  )
  ver(
    tp.includes(`Pedido #${enviado.numero}`) &&
      tp.includes("Produtos: 2x") &&
      tp.includes(`Rastreio: ${CODIGO}`),
    "e o pedido postado, com os produtos e o rastreio",
    tp
  )
  ver(
    !tp.includes("Rafael Teste,") && !/89036|Zimmermann|111\.?444/.test(tp),
    "sem endereço nem CPF",
    tp
  )
  const pedidoAIa = falso.pedidosAIa.find(
    (p) => JSON.stringify(p.corpo.messages).includes("PEDIDOS") && p.corpo.messages.length === 1
  )
  ver(
    String(pedidoAIa?.corpo.system?.[1]?.text).includes("Esta pessoa já é cliente"),
    "a IA sabe que o telefone é de cliente",
    String(pedidoAIa?.corpo.system?.[1]?.text)
  )

  const doPix = await conversar(DONO, `PIX ${pix.numero}`, 2)
  const { order } = await (
    await fetch(
      `${MEDUSA}/admin/orders/${pix.id}?fields=payment_collections.payment_sessions.data`,
      {
        headers: { authorization: `Bearer ${tokenAdmin}` },
      }
    )
  ).json()
  const copiaECola = (order.payment_collections ?? [])
    .flatMap((c) => c.payment_sessions ?? [])
    .map((s) => s.data?.pagarme?.pix?.copiaECola)
    .find(Boolean)
  ver(doPix.length === 2, "o Pix: a resposta e mais uma mensagem", `${doPix.length} mensagem(ns)`)
  ver(
    Boolean(copiaECola) && doPix[1]?.texto === copiaECola,
    "a segunda é SÓ o copia e cola do pedido",
    doPix[1]?.texto
  )
  ver(!String(doPix[0]?.texto).includes(String(copiaECola)), "e a resposta não repete o código")

  const [sacola] = await conversar(DONO, "SACOLA oleo-para-barba 2")
  const aberta = await voltar(sacola?.texto ?? "")
  ver(
    Boolean(aberta?.carrinho),
    "montar_sacola: o link abre um carrinho na loja (/voltar)",
    sacola?.texto
  )
  const linha = aberta?.carrinho?.items?.[0]
  ver(
    aberta?.carrinho?.items?.length === 1 &&
      linha?.quantity === 2 &&
      /óleo|oleo/i.test(linha?.product_title ?? ""),
    "com 2 óleos",
    JSON.stringify(aberta?.carrinho?.items?.map((i) => [i.product_title, i.quantity]))
  )
  ver(
    aberta?.carrinho?.email === EMAIL &&
      aberta?.carrinho?.shipping_address?.postal_code === "89036370",
    "e o e-mail e o endereço da última compra do telefone",
    `${aberta?.carrinho?.email} / ${aberta?.carrinho?.shipping_address?.postal_code}`
  )

  const [refazer] = await conversar(DONO, "REFAZER 0")
  const refeito = await voltar(refazer?.texto ?? "")
  ver(
    String(refeito?.t).startsWith("repor-order_"),
    "refazer_pedido: o link do 'Refazer o pedido'",
    refazer?.texto
  )
  ver(
    refeito?.carrinho?.items?.some(
      (i) => i.quantity === 2 && /óleo|oleo/i.test(i.product_title ?? "")
    ),
    "abre com os produtos da última compra paga (2 óleos)"
  )

  const frete = (await doFrete)[0]?.texto ?? ""
  ver(
    frete.includes("Frete pro CEP 89036-370") && /Econômico|Entrega/.test(frete),
    "cotar_frete: as opções pro CEP, pela conta do site",
    frete
  )

  const produto = await doProduto
  ver(
    produto.certo.includes("## Fator de Crescimento") && produto.certo.includes("Como usar:"),
    "ver_produto: a página do produto (o como usar, as dúvidas)",
    produto.certo
  )
  ver(
    produto.errado.includes('Não existe produto com o código "nao-existe"'),
    "e o código que não existe volta como erro, pra IA corrigir",
    produto.errado
  )

  const { certo, errado } = await deOutro
  ver(
    certo.includes(`Pedido #${enviado.numero}`) && certo.includes(`Rastreio: ${CODIGO}`),
    "ver_pedido: com o número e o e-mail certos, a situação e o rastreio",
    certo
  )
  ver(
    !certo.includes("Produtos") && !certo.includes("Total"),
    "sem os produtos nem o total (não é o telefone da compra)",
    certo
  )
  ver(
    errado.includes("Não achei um pedido com esse número e esse e-mail"),
    "com o e-mail errado, nada",
    errado
  )

  await apagarConversa(outro)
  await apagarConversa(numero(20))
  await apagarConversa(numero(22))
  return res
}

/** Uma mensagem de texto do número `de`. */
const textoDe = (de, corpo) => texto(de, corpo)

try {
  /* ── 1. a porta ──────────────────────────────────────────────────────── */
  titulo("1. A porta do webhook")
  const verificar = (senha) =>
    fetch(
      `${MEDUSA}/hooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(senha)}&hub.challenge=desafio${RODADA}`
    )
  const certa = await verificar(VERIFICACAO)
  ok(
    certa.status === 200 && (await certa.text()) === `desafio${RODADA}`,
    "o Verificar e salvar com a senha certa devolve o desafio"
  )
  ok((await verificar("senha-errada")).status === 403, "com a senha errada, 403")

  const ninguem = numero(90)
  const semAssinatura = aviso({ mensagens: [texto(ninguem, "oi")] })
  ok((await postar(semAssinatura, { assinatura: null })) === 401, "sem a assinatura da Meta, 401")
  ok(
    (await postar(semAssinatura, { assinatura: `sha256=${"0".repeat(64)}` })) === 401,
    "com a assinatura errada, 401"
  )
  ok((await conversa(ninguem)) === null, "e nada entrou no banco")

  const outro = numero(91)
  ok(
    (await postar(aviso({ mensagens: [texto(outro, "oi")], numeroDaLoja: "999" }))) === 200,
    "o aviso de outro número do app é aceito (200)…"
  )
  ok((await conversa(outro)) === null, "…e ignorado: não vira conversa da loja")

  // A parte 2 roda junto (o job responde todas as conversas de minuto em minuto).
  const parte2 = rodarParte2().catch((e) => [[false, "a parte 2 quebrou", String(e?.stack ?? e)]])

  /* ── 2. os cenários, todos de uma vez (o job responde de minuto em minuto) ── */
  const normal = numero(1)
  const humano = numero(2)
  const automatica = numero(3)
  const audio = numero(4)
  const janela = numero(5)
  const iaFora = numero(6)
  const recusa = numero(7)
  falso.roteiro.recusarPara.add(janela)

  const primeira = wamid()
  ok(
    (await postar(
      aviso({ telefone: normal, nome: "Rafael Teste", mensagens: [texto(normal, "oi", primeira)] })
    )) === 200,
    "a mensagem assinada entra (200)"
  )
  await dormir(2000)
  const segunda = wamid()
  await postar(aviso({ mensagens: [texto(normal, "quanto tá o fator?", segunda)] }))
  // A Meta manda de novo o que demorou: a mesma mensagem não entra duas vezes.
  await postar(aviso({ mensagens: [texto(normal, "oi", primeira)] }))

  await postar(aviso({ mensagens: [texto(humano, "quero falar com um humano")] }))
  await postar(
    aviso({ mensagens: [texto(automatica, "Mensagem automática: estou ausente no momento")] })
  )
  await postar(
    aviso({
      mensagens: [
        {
          from: audio,
          id: wamid(),
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: "audio",
          audio: { id: "m1", voice: true },
        },
      ],
    })
  )
  await postar(aviso({ mensagens: [texto(janela, `janela-${RODADA} tem o óleo?`)] }))
  await postar(aviso({ mensagens: [texto(iaFora, `IAFORA ${RODADA}`)] }))
  await postar(aviso({ mensagens: [texto(recusa, `RECUSA ${RODADA}`)] }))

  /* ── 3. a resposta ───────────────────────────────────────────────────── */
  titulo("2. A resposta (o atendente responde de minuto em minuto: até ~90 s)")
  const doNormal = await esperar(
    () => enviadasPara(normal),
    (l) => l.length > 0,
    100
  )
  ok(doNormal.length === 1, "UMA resposta pras duas mensagens", `${doNormal.length} resposta(s)`)
  const resposta = doNormal[0]?.texto ?? ""
  ok(resposta.includes("Recebi: oi | quanto tá o fator?"), "ela leu as duas, na ordem", resposta)
  ok(
    /\/produtos\/[a-z0-9-]+\?utm_source=whatsapp&utm_medium=atendimento/.test(resposta),
    "com o link de um produto do catálogo, marcado de onde veio",
    resposta
  )
  ok(doNormal[0]?.previa === true, "com a prévia do link ligada")
  ok(
    falso.digitando.some((d) => d.wamid === segunda && d.tipo === "text"),
    "antes, o 'digitando…' na última mensagem dela"
  )

  const pedido = pedidosCom("quanto tá o fator?")[0]
  ok(Boolean(pedido), "a IA recebeu o pedido")
  if (pedido) {
    const c = pedido.corpo
    ok(c.model === "claude-sonnet-5-5", "o modelo: Claude Sonnet 5.5", c.model)
    ok(c.fallbacks === "default", "a reserva da Anthropic ligada (fallbacks: default)")
    ok(
      String(pedido.cabecalhos["anthropic-beta"] ?? "").includes("server-side-fallback-2026-07-01"),
      "com o cabeçalho beta da reserva",
      String(pedido.cabecalhos["anthropic-beta"])
    )
    ok(c.output_config?.effort === "low", "esforço baixo")
    ok(
      c.system?.[0]?.cache_control?.type === "ephemeral" && c.system[0].cache_control.ttl === "1h",
      "as instruções e o catálogo no cache de 1 hora"
    )
    const instrucoes = c.system?.[0]?.text ?? ""
    ok(
      instrucoes.includes("PRODUTOS (o preço de agora") &&
        /## .+\nCódigo \(pras ferramentas\): [a-z0-9-]+\nLink: /.test(instrucoes),
      "o catálogo foi junto"
    )
    ok(
      !instrucoes.includes("Como usar:") && (c.tools ?? []).some((t) => t.name === "ver_produto"),
      "o catálogo vai enxuto: a página dos produtos vem pela ver_produto (0243)"
    )
    ok(
      instrucoes.includes("Frete grátis nas compras a partir de R$ 149,90 (de teste)"),
      "as dúvidas, lidas da página /duvidas da loja"
    )
    ok(!/\d{2}:\d{2}/.test(instrucoes), "sem hora no pedaço do cache")
    ok(String(c.system?.[1]?.text).includes("Rafael Teste"), "o nome do WhatsApp vai no contexto")
    ok(c.tool_choice === undefined, "sem forçar ferramenta")
  }

  const doBanco = await mensagens(normal)
  ok(
    doBanco.filter((m) => m.direcao === "entrada").length === 2,
    "a mensagem repetida pela Meta entrou uma vez só",
    `${doBanco.filter((m) => m.direcao === "entrada").length} entradas`
  )
  const saida = doBanco.find((m) => m.direcao === "saida")
  ok(
    saida?.autor === "bot" && saida?.situacao === "enviada",
    "a resposta foi guardada como do atendente"
  )
  ok(saida?.dados?.uso?.chamadas === 1, "com o uso da IA anotado")
  const depois = await conversa(normal)
  ok(depois?.pendente_desde === null && depois?.nome === "Rafael Teste", "a fila da conversa zerou")

  /* ── 4. as situações ─────────────────────────────────────────────────── */
  titulo("3. Entregue e lida")
  if (doNormal[0]) {
    const w = doNormal[0].wamid
    const s = (status) => ({
      id: w,
      status,
      timestamp: String(Math.floor(Date.now() / 1000)),
      recipient_id: normal,
    })
    await postar(aviso({ situacoes: [s("delivered")] }))
    await postar(aviso({ situacoes: [s("read")] }))
    await postar(aviso({ situacoes: [s("delivered")] }))
    const lida = (await mensagens(normal)).find((m) => m.wamid === w)
    ok(lida?.situacao === "lida", "lida, e o 'entregue' atrasado não desfaz", lida?.situacao)
  }

  /* ── 5. os outros cenários ───────────────────────────────────────────── */
  titulo("4. Pra equipe, automática, áudio e a janela fechada")
  const doHumano = await esperar(
    () => enviadasPara(humano),
    (l) => l.length > 0,
    60
  )
  ok(
    doHumano[0]?.texto === "Beleza! Vou chamar alguém do time pra continuar com você por aqui.",
    "quem pede uma pessoa recebe o aviso da IA",
    doHumano[0]?.texto
  )
  const comEquipe = await conversa(humano)
  ok(
    comEquipe?.situacao === "equipe" &&
      comEquipe?.equipe_motivo === "pediu pra falar com uma pessoa",
    "e a conversa passou pra equipe, com o motivo"
  )
  await postar(aviso({ mensagens: [texto(humano, "alô? tem alguém?")] }))

  const doAudio = await esperar(
    () => enviadasPara(audio),
    (l) => l.length > 0,
    60
  )
  ok(
    /\[mandou um áudio/.test(doAudio[0]?.texto ?? ""),
    "o áudio chega na IA como áudio",
    doAudio[0]?.texto
  )

  const daJanela = await esperar(
    async () => (await mensagens(janela)).filter((m) => m.direcao === "saida"),
    (l) => l.length > 0,
    60
  )
  ok(
    daJanela[0]?.situacao === "falhou" && String(daJanela[0]?.erro).includes("131047"),
    "a janela fechada: a resposta não sai, e o erro da Meta fica anotado",
    daJanela[0]?.erro
  )
  ok((await conversa(janela))?.pendente_desde === null, "e a conversa sai da fila (não insiste)")

  /* ── 6. a IA fora e a recusa ─────────────────────────────────────────── */
  titulo("5. A IA que recusa, e a IA fora (três rodadas: até ~4 min)")
  const daRecusa = await esperar(
    () => enviadasPara(recusa),
    (l) => l.length > 0,
    60
  )
  ok(
    daRecusa[0]?.texto === SOCORRO,
    "a recusa vira o 'vou chamar alguém do time'",
    daRecusa[0]?.texto
  )
  ok((await conversa(recusa))?.situacao === "equipe", "e a conversa vai pra equipe")

  const daIaFora = await esperar(
    () => enviadasPara(iaFora),
    (l) => l.length > 0,
    260
  )
  ok(daIaFora[0]?.texto === SOCORRO, "na terceira rodada sem IA, o aviso sai", daIaFora[0]?.texto)
  const caida = await conversa(iaFora)
  ok(
    caida?.situacao === "equipe" && caida?.equipe_motivo === "a IA não respondeu",
    "e a conversa vai pra equipe",
    `${caida?.situacao} / ${caida?.equipe_motivo}`
  )
  ok(Number(caida?.tentativas) === 0 && caida?.pendente_desde === null, "com a fila zerada")

  /* ── 7. o que ficou quieto ───────────────────────────────────────────── */
  titulo("6. O que o atendente não responde")
  ok(enviadasPara(automatica).length === 0, "a resposta automática do outro lado")
  const auto = await mensagens(automatica)
  ok(auto[0]?.dados?.automatica === true, "fica guardada, marcada como automática")
  ok((await conversa(automatica))?.pendente_desde === null, "e nunca entrou na fila")
  ok(enviadasPara(humano).length === 1, "a conversa com a equipe (o 'alô?' ficou sem robô)")
  ok((await conversa(humano))?.pendente_desde === null, "e saiu da fila")
  ok(pedidosCom(`janela-${RODADA}`).length === 1, "a da janela fechada foi tentada uma vez só")

  /* ── 8. a parte 2 ─────────────────────────────────────────────────────── */
  titulo("7. Parte 2: os pedidos, o Pix, o frete, a sacola, o refazer e o pedido de outra pessoa")
  for (const [cond, texto, detalhe] of await parte2) ok(cond, texto, detalhe)
} finally {
  // As conversas da rodada saem do banco: o próximo teste começa limpo.
  await banco.query(
    `delete from whatsapp_mensagem where conversa_id in
       (select id from whatsapp_conversa where telefone like $1)`,
    [`55999${RODADA}%`]
  )
  await banco.query("delete from whatsapp_conversa where telefone like $1", [`55999${RODADA}%`])
  await apagarConversa(DONO)
  await banco.end()
  await falso.fechar()
  await frenet?.fechar?.()
  await pagarme?.fechar?.()
}

console.log(`\n${passou} ok, ${falhou} falha(s)`)
process.exit(falhou ? 1 : 0)
