/**
 * CONFERIDOR DOS ENVIOS — o aviso do parceiro de entrega chegando de
 * verdade no Medusa, e o cliente vendo na conta e no e-mail.
 *
 *   FRENET_WEBHOOK_TOKEN=token-de-teste (e os falsos de sempre, ver AGENTS.md) npm run backend:dev
 *   npm run loja:dev
 *   ADMIN_EMAIL=… ADMIN_SENHA=… node ferramentas/conferir-envio.mjs
 *
 * Duas rodadas pro registro de pedidos no painel da Frenet (a seção 7c):
 * como está em produção, sem o token de parceiro (nada vai pro painel); e
 * ligado — o Medusa com FRENET_PARCEIRO_TOKEN=parceiro-de-teste,
 * FRENET_WHITELABEL_URL=http://127.0.0.1:4310 e
 * MEDUSA_BACKEND_URL=http://127.0.0.1:9000 (o endereço do aviso que vai em
 * cada pedido), e este conferidor com o mesmo FRENET_PARCEIRO_TOKEN.
 *
 * O parceiro é a Frenet, com os avisos no formato da documentação dela
 * ("Atualização de Tracking"), mandados daqui pra `/hooks/envio/frenet` —
 * como a Frenet mandaria. Os pedidos nascem como na loja (Frenet e Pagar.me
 * falsos, `pedido-de-teste.mjs`), o admin posta pela API dele, e os e-mails
 * caem num Resend falso. Cada rodada usa códigos de rastreio novos.
 *
 * Variáveis: LOJA (padrão http://localhost:3000), MEDUSA_BACKEND_URL,
 * NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY (sai do `.env.development.local`),
 * FRENET_WEBHOOK_TOKEN (padrão `token-de-teste`, o mesmo do backend),
 * ADMIN_EMAIL, ADMIN_SENHA e CHROMIUM.
 *
 * Os pedidos pagos e postados ficam (levam uma unidade de estoque cada); o
 * cancelado já nasce cancelado.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • aviso sem a chave, ou de parceiro que a loja não conhece, entrando;  │
 * │ • o aviso pelo número do pedido não achando o pedido, ou o Medusa não  │
 * │   marcando enviado (com o código e o link) e entregue;                 │
 * │ • aviso repetido virando evento repetido ou e-mail repetido;           │
 * │ • evento fora de ordem puxando o pacote pra trás;                      │
 * │ • o "postado" do admin (a hora do clique) passando por cima do que a   │
 * │   transportadora contou; o aviso separando de novo o que o admin já    │
 * │   separou;                                                             │
 * │ • aviso sem dono perdido, em vez de ligar quando o código aparece;     │
 * │ • e-mail que não sai, que sai duas vezes, ou que sai quando o admin    │
 * │   pediu pra não avisar;                                                │
 * │ • e-mail de atraso ou de pedido cancelado (esses a loja conversa), ou  │
 * │   aviso mexendo em pedido cancelado;                                   │
 * │ • a conta sem a situação e o caminho do pacote, ou a rota com o bruto  │
 * │   do parceiro na resposta;                                             │
 * │ • a etiqueta feita à mão no painel da Frenet (que não manda aviso)     │
 * │   parada no "postado" — a loja tem que perguntar, com o serviço que o  │
 * │   pedido guardou na cotação;                                           │
 * │ • o pedido pago que não vai sozinho pro painel da Frenet (com o token  │
 * │   de parceiro), que vai duas vezes, que vai sem o que a etiqueta       │
 * │   precisa, ou que vai sem o token; o pago antes de o registro ligar    │
 * │   indo também; a postagem que não volta como "enviado"; o cancelado   │
 * │   que fica no painel; e a recusa ou a queda da Frenet tratadas igual.  │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { readFileSync } from "node:fs"
import { isDeepStrictEqual } from "node:util"
import { chromium } from "playwright"
import { subirFrenetFalsa } from "./frenet-falsa.mjs"
import { subirPagarmeFalso } from "./pagarme-falso.mjs"
import { fabricaDePedidos } from "./pedido-de-teste.mjs"
import { subirResendFalso } from "./resend-falso.mjs"

const LOJA =
  process.env.LOJA ??
  (process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:3000")
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const TOKEN = process.env.FRENET_WEBHOOK_TOKEN ?? "token-de-teste"

function doEnv(nome) {
  if (process.env[nome]) return process.env[nome]
  try {
    const env = readFileSync(new URL("../.env.development.local", import.meta.url), "utf8")
    return env.match(new RegExp(`^${nome}=(.+)$`, "m"))?.[1]?.trim() ?? ""
  } catch {
    return ""
  }
}
const CHAVE = doEnv("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY")

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
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const RODADA = Date.now().toString(36)
let n = 0
const novoEmail = () => `envio.${RODADA}.${++n}@teste.fuckingbarba.dev`

/* Códigos no formato dos Correios (duas letras, nove dígitos, BR) que não
   se repetem entre rodadas: sete dígitos do relógio e dois de sequência. */
const RELOGIO = String(Date.now()).slice(-7)
let seq = 0
const novoCodigo = (letras) => `${letras}${RELOGIO}${String(++seq).padStart(2, "0")}BR`
let ultimoEnvio = Number(String(Date.now()).slice(-6)) * 100
const novoShipmentId = () => ++ultimoEnvio
const urlDe = (codigo) => `https://rastreio.frenet.com.br/COR/${codigo}`

/* ── o que precisa estar de pé ────────────────────────────────────────────── */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_SENHA = process.env.ADMIN_SENHA
if (!ADMIN_EMAIL || !ADMIN_SENHA) {
  console.log(
    "  ⚠  este conferidor monta pedidos: precisa de ADMIN_EMAIL e ADMIN_SENHA (o admin LOCAL)"
  )
  process.exit(1)
}

async function aviso(corpo, { chave = TOKEN, parceiro = "frenet", naConsulta = false } = {}) {
  const url = new URL(`${MEDUSA}/hooks/envio/${parceiro}`)
  if (naConsulta && chave) url.searchParams.set("chave", chave)
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(chave && !naConsulta ? { "x-webhook-token": chave } : {}),
    },
    body: JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

/* O aviso de status da carteira: a Frenet manda, o tradutor ignora com 200.
   É a sonda que não grava nada. */
const CARTEIRA = { OrderId: "0", ShipmentId: 0, ShipmentStatus: 5, Balance: 10 }

{
  const r = await aviso(CARTEIRA)
  if (r.status === 404) {
    console.log("  ⚠  o backend não tem a rota /hooks/envio/:parceiro — suba o desta versão")
    process.exit(1)
  }
  if (r.status === 401) {
    console.log(
      `  ⚠  o backend recusou a chave. Suba o Medusa com FRENET_WEBHOOK_TOKEN=${TOKEN} (ver AGENTS.md)`
    )
    process.exit(1)
  }
}

const resend = await subirResendFalso().catch((e) => {
  console.log(`  ⚠  não consegui subir o Resend falso na 4330 (${e.message})`)
  process.exit(1)
})
const frenet = await subirFrenetFalsa()
const pagarme = await subirPagarmeFalso({
  webhook: {
    url: `${MEDUSA}/hooks/payment/pagarme_pagarme`,
    segredo: process.env.MEDUSA_WEBHOOK_SEGREDO ?? "segredo-de-teste",
  },
})
const { token: tokenAdmin } = await (
  await fetch(`${MEDUSA}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_SENHA }),
  })
).json()
const fabrica = fabricaDePedidos({ medusa: MEDUSA, chave: CHAVE, tokenAdmin, pagarme })

/* ── os avisos, no formato da Frenet ──────────────────────────────────────── */

/** "21/09/2026 14:30" — a hora de Brasília, como a Frenet escreve. */
const hora = (minutosAtras) =>
  new Date(Date.now() - minutosAtras * 60_000)
    .toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "")

const evento = (codigo, minutosAtras, descricao, local = "Blumenau-SC") => ({
  EventDateTime: hora(minutosAtras),
  EventDescription: descricao,
  EventLocation: local,
  EventType: String(codigo),
})

const avisoDe = ({ pedido, codigo, shipment, eventos, referencia }) => ({
  OrderId: referencia ?? String(pedido.numero),
  ShipmentId: shipment,
  TrackingNumber: codigo,
  TrackingUrl: urlDe(codigo),
  ServiceDescrition: "PAC",
  TrackingEvents: eventos,
})

/* ── os e-mails ───────────────────────────────────────────────────────────── */

const deCodigo = (e) => /^\d{6} é o seu código/.test(e.subject ?? "")
/* A confirmação do pagamento ("Pedido #N confirmado") é do conferidor de
   pagamento: o Pix que a fábrica paga também a dispara, e ela não é deste caminho. */
const deConfirmacao = (e) => /^Pedido #\d+ confirmado$/.test(e.subject ?? "")
/** Os e-mails do caminho da encomenda pra um endereço — sem o de código e sem a confirmação. */
const dePedido = (email) =>
  resend.emails.filter((e) => e.to?.includes(email) && !deCodigo(e) && !deConfirmacao(e))
const assuntos = (email) => dePedido(email).map((e) => e.subject)

async function esperarAssunto(email, assunto, ms = 10000) {
  const fim = Date.now() + ms
  while (Date.now() < fim) {
    const achado = dePedido(email).find((e) => e.subject === assunto)
    if (achado) return achado
    await esperar(150)
  }
  return undefined
}
/** O tempo de um e-mail que NÃO devia sair ter saído, se fosse sair. */
const silencio = () => esperar(3000)

/* ── 1. a porta ───────────────────────────────────────────────────────────── */

titulo("A porta dos avisos")
{
  let r = await aviso(CARTEIRA, { chave: null })
  ok(r.status === 401, "sem a chave, 401", String(r.status))
  r = await aviso(CARTEIRA, { chave: "chute" })
  ok(r.status === 401, "com a chave errada, 401", String(r.status))
  r = await aviso(CARTEIRA, { naConsulta: true })
  ok(r.status === 200, "a chave também vale no fim da URL (?chave=)", String(r.status))
  r = await aviso(CARTEIRA, { parceiro: "correios" })
  ok(r.status === 404, "parceiro que a loja não conhece, 404", String(r.status))
  r = await aviso({ foo: "bar" })
  ok(r.status === 400, "o que não é aviso da Frenet, 400", String(r.status))
  r = await aviso(CARTEIRA)
  ok(
    r.status === 200 && typeof r.corpo.ignorado === "string",
    "o aviso de status da carteira é entendido e ignorado (200)",
    JSON.stringify(r.corpo)
  )
  r = await aviso({ OrderId: "1", TrackingEvents: [] })
  ok(
    r.status === 200 && r.corpo.envios?.[0]?.ignorado,
    "aviso sem código nem id do envio não vira envio",
    JSON.stringify(r.corpo)
  )
}

/* ── 2. o pacote contado pela Frenet ──────────────────────────────────────── */

titulo("O pacote contado pela Frenet, do ponto de coleta à entrega")
const CLIENTE = novoEmail()
const A = await fabrica.pedidoPix(CLIENTE, [["oleo-para-barba", 1]])
await fabrica.pagar(A)
const COD_A = novoCodigo("QS")
const SHIP_A = novoShipmentId()
const doA = (eventos) => avisoDe({ pedido: A, codigo: COD_A, shipment: SHIP_A, eventos })
{
  const coleta = [evento(18, 600, "Aguardando coleta no ponto de postagem")]
  let r = await aviso(doA(coleta))
  ok(
    r.status === 200 && r.corpo.envios?.[0]?.pedido === A.id,
    `o aviso pelo NÚMERO do pedido (#${A.numero}) acha o pedido`,
    JSON.stringify(r.corpo)
  )
  ok(
    r.corpo.envios?.[0]?.situacao === "postado",
    "o 18 (aguardando coleta) já é postado: saiu da loja"
  )
  let o = await fabrica.noAdmin(A.id)
  ok(
    o.fulfillment_status === "shipped",
    "o Medusa marca o pedido como enviado",
    o.fulfillment_status
  )
  const etiqueta = o.fulfillments
    .flatMap((f) => f.labels ?? [])
    .find((l) => l.tracking_number === COD_A)
  ok(etiqueta?.tracking_url === urlDe(COD_A), "com o código e o link da Frenet na etiqueta")
  const aCaminho = await esperarAssunto(CLIENTE, `Pedido #${A.numero} a caminho`)
  ok(Boolean(aCaminho?.html?.includes(COD_A)), "e o e-mail 'a caminho' sai, com o código")

  r = await aviso(doA(coleta))
  ok(r.corpo.envios?.[0]?.novos === 0, "o mesmo aviso de novo não vira evento de novo")
  r = await aviso(doA([evento(1, 300, "Objeto em trânsito - por favor aguarde", "Curitiba-PR")]))
  ok(r.corpo.envios?.[0]?.situacao === "em_transito", "em trânsito")
  r = await aviso(doA([evento(0, 590, "Objeto postado")]))
  ok(
    r.corpo.envios?.[0]?.situacao === "em_transito",
    "o 'postado' que chega DEPOIS do 'em trânsito' não puxa o pacote pra trás",
    JSON.stringify(r.corpo)
  )
  await silencio()
  ok(
    dePedido(CLIENTE).length === 1,
    "e nenhum e-mail a mais: nem pelo repetido, nem pelo em trânsito",
    assuntos(CLIENTE).join(" | ")
  )

  await aviso(doA([evento(5, 60, "Objeto saiu para entrega ao destinatário", "Joinville-SC")]))
  ok(
    Boolean(await esperarAssunto(CLIENTE, `Pedido #${A.numero} saiu pra entrega`)),
    "saiu pra entrega: e-mail"
  )
  r = await aviso(doA([evento(9, 5, "Objeto entregue ao destinatário", "Joinville-SC")]))
  ok(r.corpo.envios?.[0]?.situacao === "entregue", "entregue")
  o = await fabrica.noAdmin(A.id)
  ok(o.fulfillment_status === "delivered", "o Medusa marca como entregue", o.fulfillment_status)
  ok(
    Boolean(await esperarAssunto(CLIENTE, `Pedido #${A.numero} entregue`)),
    "e o e-mail de entregue sai"
  )
  ok(
    dePedido(CLIENTE).length === 3,
    "três e-mails no caminho todo: a caminho, saiu pra entrega, entregue",
    assuntos(CLIENTE).join(" | ")
  )
}

/* ── 3. o admin primeiro, a Frenet depois ─────────────────────────────────── */

titulo("O admin posta, a Frenet continua a história")
const B = await fabrica.pedidoPix(CLIENTE, [["balm-para-barba", 1]])
await fabrica.pagar(B)
const COD_B = novoCodigo("QT")
{
  // Digitado como gente digita: minúsculo, com espaço.
  const digitado = COD_B.toLowerCase().replace(/^(..)(\d{9})/, "$1 $2 ")
  await fabrica.enviar(B, { codigo: digitado })
  ok(
    Boolean(await esperarAssunto(CLIENTE, `Pedido #${B.numero} a caminho`)),
    "o 'Mark as shipped' com código também avisa o cliente"
  )
  const r = await aviso(
    avisoDe({
      pedido: B,
      codigo: COD_B,
      shipment: novoShipmentId(),
      referencia: "PLAT-9999",
      eventos: [evento(1, 120, "Objeto em trânsito - por favor aguarde", "Curitiba-PR")],
    })
  )
  ok(
    r.corpo.envios?.[0]?.pedido === B.id,
    "o aviso acha o pedido pelo código que o admin digitou (minúsculo, com espaço)",
    JSON.stringify(r.corpo)
  )
  ok(
    r.corpo.envios?.[0]?.situacao === "em_transito",
    "e o 'postado' do admin (a hora do clique, mais nova) não passa por cima do que a transportadora contou"
  )
  await silencio()
  ok(
    dePedido(CLIENTE).filter((e) => e.subject.includes(`#${B.numero}`)).length === 1,
    "sem e-mail repetido"
  )
}

/* ── 3b. separado no admin, postado pela Frenet ───────────────────────────── */

titulo("O admin separa, a Frenet posta")
{
  const G = await fabrica.pedidoPix(novoEmail(), [["oleo-para-barba", 1]])
  await fabrica.pagar(G)
  const separado = await fabrica.separar(G)
  const COD_G = novoCodigo("QY")
  await aviso(
    avisoDe({
      pedido: G,
      codigo: COD_G,
      shipment: novoShipmentId(),
      eventos: [evento(0, 40, "Objeto postado")],
    })
  )
  const o = await fabrica.noAdmin(G.id)
  const vivos = o.fulfillments.filter((f) => !f.canceled_at)
  ok(
    vivos.length === 1 && vivos[0].id === separado && Boolean(vivos[0].shipped_at),
    "o aviso posta O MESMO envio que o admin separou — sem separar de novo",
    JSON.stringify(vivos.map((f) => [f.id === separado, Boolean(f.shipped_at)]))
  )
  ok(
    (vivos[0]?.labels ?? []).some((l) => l.tracking_number === COD_G),
    "com a etiqueta do código"
  )
}

/* ── 4. o aviso sem dono ──────────────────────────────────────────────────── */

titulo("O aviso que chega antes do pedido ter código")
const OUTRO = novoEmail()
const COD_C = novoCodigo("QU")
{
  const r = await aviso(
    avisoDe({
      pedido: null,
      codigo: COD_C,
      shipment: novoShipmentId(),
      referencia: "NUVEM-8812",
      eventos: [evento(1, 90, "Objeto em trânsito - por favor aguarde", "Curitiba-PR")],
    })
  )
  ok(
    r.status === 200 && r.corpo.envios?.[0]?.pedido === null,
    "de pedido que a loja não conhece: guardado, sem dono",
    JSON.stringify(r.corpo)
  )
  const C = await fabrica.pedidoPix(OUTRO, [["oleo-para-barba", 1]])
  await fabrica.pagar(C)
  await fabrica.enviar(C, { codigo: COD_C })
  const e = await esperarAssunto(OUTRO, `Pedido #${C.numero} a caminho`)
  ok(Boolean(e?.html?.includes(COD_C)), "e liga quando o código aparece num pedido — com o e-mail")
}

/* ── 5. atraso ────────────────────────────────────────────────────────────── */

titulo("Atraso")
const D = await fabrica.pedidoPix(CLIENTE, [["shampoo-para-barba", 1]])
await fabrica.pagar(D)
const COD_D = novoCodigo("QV")
{
  const SHIP_D = novoShipmentId()
  await aviso(
    avisoDe({
      pedido: D,
      codigo: COD_D,
      shipment: SHIP_D,
      eventos: [evento(0, 200, "Objeto postado")],
    })
  )
  await esperarAssunto(CLIENTE, `Pedido #${D.numero} a caminho`)
  const antes = dePedido(CLIENTE).length
  const r = await aviso(
    avisoDe({
      pedido: D,
      codigo: COD_D,
      shipment: SHIP_D,
      eventos: [evento(2, 30, "Atraso na entrega", "Curitiba-PR")],
    })
  )
  ok(r.corpo.envios?.[0]?.situacao === "postado", "o atraso não muda onde o pacote está")
  await silencio()
  ok(
    dePedido(CLIENTE).length === antes,
    "e não vira e-mail — aparece na conta",
    assuntos(CLIENTE).join(" | ")
  )
}

/* ── 6. "não avisar o cliente" ────────────────────────────────────────────── */

titulo("O admin pede pra não avisar")
const E = await fabrica.pedidoPix(CLIENTE, [["oleo-para-barba", 1]])
await fabrica.pagar(E)
const COD_E = novoCodigo("QW")
{
  await fabrica.enviar(E, { codigo: COD_E, avisar: false })
  await silencio()
  ok(
    !assuntos(CLIENTE).includes(`Pedido #${E.numero} a caminho`),
    "postado com 'não avisar': sem e-mail",
    assuntos(CLIENTE).join(" | ")
  )
  await aviso(
    avisoDe({
      pedido: E,
      codigo: COD_E,
      shipment: novoShipmentId(),
      eventos: [evento(5, 20, "Objeto saiu para entrega ao destinatário", "Joinville-SC")],
    })
  )
  ok(
    Boolean(await esperarAssunto(CLIENTE, `Pedido #${E.numero} saiu pra entrega`)),
    "mas o momento seguinte avisa"
  )
}

/* ── 7. pedido cancelado ──────────────────────────────────────────────────── */

titulo("Aviso de pedido cancelado")
{
  const quem = novoEmail()
  const F = await fabrica.pedidoPix(quem, [["oleo-para-barba", 1]])
  await fabrica.cancelar(F)
  const r = await aviso(
    avisoDe({
      pedido: F,
      codigo: novoCodigo("QX"),
      shipment: novoShipmentId(),
      eventos: [evento(0, 30, "Objeto postado")],
    })
  )
  const o = await fabrica.noAdmin(F.id)
  ok(
    r.status === 200 && o.status === "canceled" && !(o.fulfillments ?? []).length,
    "é guardado, e não mexe no pedido",
    `${r.status} ${o.status} ${(o.fulfillments ?? []).length} envio(s)`
  )
  await silencio()
  // O "Pedido #N cancelado" é do cancelamento (sai desde 22/09), não do aviso.
  const doAviso = dePedido(quem).filter((e) => e.subject !== `Pedido #${F.numero} cancelado`)
  ok(doAviso.length === 0, "nem avisa o cliente do envio", assuntos(quem).join(" | "))
}

/* ── 7b. a etiqueta do painel: sem aviso, a loja pergunta ──────────────────── */

titulo("A etiqueta do painel: sem aviso, a loja pergunta à Frenet")
{
  /*
    A Frenet confirmou (23/09): a etiqueta gerada à mão no painel não manda
    o aviso de rastreio. O admin cadastra o código ("Mark as shipped") e a
    loja pergunta de hora em hora — aqui, pela rota que roda a rodada na
    hora. A Frenet falsa responde o que o teste pôr em `rastreios`.
  */
  const quem = novoEmail()
  const P = await fabrica.pedidoPix(quem, [["shampoo-para-barba", 1]])
  await fabrica.pagar(P)
  const admin = async (caminho, opcoes = {}) =>
    (
      await fetch(`${MEDUSA}${caminho}`, {
        ...opcoes,
        headers: { "content-type": "application/json", authorization: `Bearer ${tokenAdmin}` },
      })
    ).json()
  const consultarAgora = () => admin("/admin/envios/consultar", { method: "POST" })

  const { order } = await admin(`/admin/orders/${P.id}?fields=id,*shipping_methods`)
  const servico = order?.shipping_methods?.[0]?.data?.servico
  ok(
    typeof servico?.codigo === "string" && servico.codigo.length > 0,
    "o pedido guardou o serviço da Frenet escolhido na cotação",
    JSON.stringify(order?.shipping_methods?.[0]?.data)
  )

  const COD_P = novoCodigo("QP")
  await fabrica.enviar(P, { codigo: COD_P })
  await esperarAssunto(quem, `Pedido #${P.numero} a caminho`)

  frenet.rastreios.set(COD_P, [
    evento(1, 90, "Objeto em trânsito - por favor aguarde", "Curitiba-PR"),
  ])
  let r = await consultarAgora()
  const pergunta = frenet.consultas.findLast((c) => c.corpo?.TrackingNumber === COD_P)
  ok(Boolean(pergunta), "a rodada pergunta à Frenet pelo pacote postado", JSON.stringify(r))
  ok(
    pergunta?.corpo?.ShippingServiceCode === servico?.codigo,
    "com o serviço que o pedido guardou",
    JSON.stringify(pergunta?.corpo)
  )
  ok(Boolean(pergunta?.token), "e com o token da loja")
  ok((r.relatorio?.andaram ?? 0) >= 1, "o pacote anda: em trânsito", JSON.stringify(r.relatorio))

  frenet.rastreios.set(COD_P, [
    ...frenet.rastreios.get(COD_P),
    evento(9, 5, "Objeto entregue ao destinatário", "Joinville-SC"),
  ])
  await consultarAgora()
  const o = await fabrica.noAdmin(P.id)
  ok(o.fulfillment_status === "delivered", "entregue: o Medusa marca", o.fulfillment_status)
  ok(
    Boolean(await esperarAssunto(quem, `Pedido #${P.numero} entregue`)),
    "e o e-mail de entregue sai, sem aviso nenhum da Frenet"
  )

  const antes = frenet.consultas.filter((c) => c.corpo?.TrackingNumber === COD_P).length
  r = await consultarAgora()
  await silencio()
  ok(
    frenet.consultas.filter((c) => c.corpo?.TrackingNumber === COD_P).length === antes,
    "entregue, o pacote sai da rodada: ninguém pergunta de novo"
  )
  ok(
    dePedido(quem).filter((e) => e.subject === `Pedido #${P.numero} entregue`).length === 1,
    "e nenhum e-mail repetido",
    assuntos(quem).join(" | ")
  )
}

/* ── 7c. o pedido pago vai sozinho pro painel da Frenet ───────────────────── */

titulo("O pedido pago vai sozinho pro painel da Frenet (o token de parceiro)")
{
  const PARCEIRO = process.env.FRENET_PARCEIRO_TOKEN ?? ""
  const noPainel = (numero) => frenet.pedidos.filter((p) => p.corpo?.Order?.Id === `FB-${numero}`)
  async function esperarNoPainel(numero, ms = 10000) {
    for (const fim = Date.now() + ms; Date.now() < fim; await esperar(150)) {
      if (noPainel(numero).length) break
    }
    return noPainel(numero)
  }
  /** O registro no pedido (`metadata.fb_parceiro`), quando ele satisfizer `cond`. */
  async function registroQuando(pedido, cond, ms = 10000) {
    let r = null
    for (const fim = Date.now() + ms; Date.now() < fim; await esperar(250)) {
      r = (await fabrica.noAdmin(pedido.id)).metadata?.fb_parceiro ?? null
      if (r && cond(r)) break
    }
    return r
  }
  const adm = async (caminho, opcoes = {}) => {
    const r = await fetch(`${MEDUSA}${caminho}`, {
      ...opcoes,
      headers: { "content-type": "application/json", authorization: `Bearer ${tokenAdmin}` },
    })
    return r.json().catch(() => ({}))
  }
  const varrer = () => adm("/admin/envios/registrar", { method: "POST" })

  if (!PARCEIRO) {
    // Como está em produção até a Frenet mandar o token.
    const R = await fabrica.pedidoPix(novoEmail(), [["oleo-para-barba", 1]])
    await fabrica.pagar(R)
    await silencio()
    ok(
      frenet.pedidos.length === 0,
      "sem o token de parceiro, nenhum pedido vai pro painel",
      `${frenet.pedidos.length} foram — o Medusa está com FRENET_PARCEIRO_TOKEN?`
    )
    ok(!(await fabrica.noAdmin(R.id)).metadata?.fb_parceiro, "e o pedido não ganha registro")
    const v = await varrer()
    ok(
      v.relatorio?.pendentes === 0 && frenet.pedidos.length === 0,
      "a varredura também não faz nada",
      JSON.stringify(v)
    )
    console.log(
      "  ·  o registro ligado: Medusa com FRENET_PARCEIRO_TOKEN=parceiro-de-teste, " +
        "FRENET_WHITELABEL_URL=http://127.0.0.1:4310 e MEDUSA_BACKEND_URL=http://127.0.0.1:9000, " +
        "e este conferidor com o mesmo token"
    )
  } else {
    /* 1. pago → no painel, com o que a etiqueta precisa */
    const quem = novoEmail()
    const R = await fabrica.pedidoPix(quem, [
      ["oleo-para-barba", 2],
      ["balm-para-barba", 1],
    ])
    await fabrica.pagar(R)
    const [chegou] = await esperarNoPainel(R.numero)
    ok(
      Boolean(chegou),
      `pago, o #${R.numero} entra no painel como FB-${R.numero}`,
      `${frenet.pedidos.length} no painel — o Medusa está com FRENET_PARCEIRO_TOKEN e FRENET_WHITELABEL_URL?`
    )
    const envio = chegou?.corpo ?? {}
    ok(
      chegou?.parceiro === PARCEIRO && Boolean(chegou?.token),
      "com o token da loja e o de parceiro"
    )
    ok(
      envio.Order?.UseFrenetRegistration === true && !envio.Order?.From,
      "o remetente é o cadastrado na conta"
    )
    const para = envio.Order?.To ?? {}
    ok(
      para.Name === "Rafael Teste" && para.Email === quem && para.Cellphone === "11988887777",
      "o destinatário: nome, e-mail e o celular sem o +55",
      JSON.stringify(para)
    )
    ok(
      isDeepStrictEqual(para.Address, {
        ZipCode: "89036370",
        City: "Blumenau",
        Street: "Rua Doutor Pedro Zimmermann",
        AddressNumber: "99",
        AddressComplement: "Casa 2",
        AddressQuarter: "Itoupava Central",
        AddressState: "SC",
        Country: "BR",
      }),
      "o endereço em partes, com o bairro separado",
      JSON.stringify(para.Address)
    )
    const itens = envio.Order?.Items ?? []
    ok(
      itens.length === 2 &&
        itens.some((i) => i.Quantity === 2) &&
        itens.every((i) => i.OrderId === `FB-${R.numero}` && i.ItemId && i.ProductName),
      "os dois itens, com a quantidade e a linha do pedido",
      JSON.stringify(itens.map((i) => [i.ProductName, i.Quantity]))
    )
    const [caixa] = envio.Volumes ?? []
    ok(
      caixa?.OrderItemsId?.length === 2 && caixa.Length >= 16 && caixa.DeclaredValue > 0,
      "uma caixa, nunca menor que o mínimo dos Correios, com o valor declarado",
      JSON.stringify(caixa)
    )
    ok(
      ["04510", "LOG01"].includes(envio.Quotation?.ShippingServiceCode),
      "e o serviço que o cliente escolheu na cotação",
      JSON.stringify(envio.Quotation)
    )
    const enderecoDoAviso = String(envio.TrackingNotificationUrl ?? "")
    ok(
      enderecoDoAviso.startsWith(
        `${MEDUSA}/hooks/envio/frenet?pedido=FB-${R.numero}&assinatura=`
      ) && !enderecoDoAviso.includes(TOKEN),
      "com o endereço do aviso deste pedido, assinado — sem a chave da porta nele",
      enderecoDoAviso || "sem TrackingNotificationUrl (o Medusa está com MEDUSA_BACKEND_URL?)"
    )
    const registro = await registroQuando(R, (r) => r.entrou)
    ok(
      registro?.entrou === true &&
        registro.id === String(chegou?.envio) &&
        registro.referencia === `FB-${R.numero}`,
      "o pedido guarda o id do envio na Frenet",
      JSON.stringify(registro)
    )
    const loja = (await adm("/admin/stores")).stores?.[0]
    ok(
      !Number.isNaN(Date.parse(loja?.metadata?.fb_parceiros?.frenet?.pedidos_desde ?? "")),
      "e a loja guarda desde quando o registro vale",
      JSON.stringify(loja?.metadata?.fb_parceiros)
    )

    /* 2. uma vez só */
    await varrer()
    await varrer()
    ok(
      noPainel(R.numero).length === 1,
      "uma vez só: o evento repetido e a varredura não mandam de novo",
      `${noPainel(R.numero).length} vezes`
    )

    /* 3. a postagem volta sozinha, pelo endereço que foi no pedido */
    const naUrlDoAviso = async (corpo) => {
      const resposta = await fetch(enderecoDoAviso, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      })
      return { status: resposta.status, corpo: await resposta.json().catch(() => ({})) }
    }
    const COD_R = novoCodigo("QR")
    const postagemDeR = {
      OrderId: `FB-${R.numero}`,
      ShipmentId: chegou?.envio,
      TrackingNumber: COD_R,
      TrackingUrl: urlDe(COD_R),
      ServiceDescrition: "PAC",
      TrackingEvents: [evento(18, 30, "Aguardando coleta no ponto de postagem")],
    }
    let r = await naUrlDoAviso({ ...postagemDeR, OrderId: `FB-${R.numero + 1000}` })
    ok(r.status === 401, "o endereço de um pedido não serve pra avisar de outro", String(r.status))
    r = await naUrlDoAviso(postagemDeR)
    ok(
      r.status === 200 && r.corpo.envios?.[0]?.pedido === R.id,
      "a Frenet chama o endereço que foi no pedido — sem cabeçalho — e o aviso acha o pedido",
      `${r.status} ${JSON.stringify(r.corpo)}`
    )
    ok(
      (await fabrica.noAdmin(R.id)).fulfillment_status === "shipped",
      "e o pedido vira enviado — ninguém marcou nada"
    )
    ok(
      Boolean(await esperarAssunto(quem, `Pedido #${R.numero} a caminho`)),
      "com o e-mail 'a caminho'"
    )

    // Pelo aviso da conta (com o cabeçalho), os dois caminhos que acham o pedido.
    const S = await fabrica.pedidoPix(novoEmail(), [["shampoo-para-barba", 1]])
    await fabrica.pagar(S)
    const [doS] = await esperarNoPainel(S.numero)
    const COD_S = novoCodigo("QS")
    r = await aviso(
      avisoDe({
        pedido: S,
        codigo: COD_S,
        shipment: doS?.envio,
        referencia: "PLAT-OUTRA-COISA",
        eventos: [evento(0, 20, "Objeto postado")],
      })
    )
    ok(
      r.corpo.envios?.[0]?.pedido === S.id,
      "o id do envio que a loja guardou acha o pedido, mesmo com outro número no aviso",
      JSON.stringify(r.corpo)
    )
    const X = await fabrica.pedidoPix(novoEmail(), [["balm-para-barba", 1]])
    await fabrica.pagar(X)
    await esperarNoPainel(X.numero)
    const COD_X = novoCodigo("QX")
    r = await aviso(
      avisoDe({
        pedido: X,
        codigo: COD_X,
        shipment: novoShipmentId(),
        referencia: `FB-${X.numero}`,
        eventos: [evento(0, 20, "Objeto postado")],
      })
    )
    ok(
      r.corpo.envios?.[0]?.pedido === X.id,
      `e o nome do pedido no painel (FB-${X.numero}) também, quando o id não bate`,
      JSON.stringify(r.corpo)
    )

    /* 4. o cancelado sai do painel */
    const T = await fabrica.pedidoPix(novoEmail(), [["oleo-para-barba", 1]])
    await fabrica.pagar(T)
    const [doT] = await esperarNoPainel(T.numero)
    await registroQuando(T, (x) => x.entrou)
    await fabrica.cancelar(T)
    const saiu = await registroQuando(T, (x) => Boolean(x.tirado_em))
    ok(
      Boolean(saiu?.tirado_em) &&
        frenet.retirados.some((x) => x.id === String(doT?.envio) && x.como === "cancelar"),
      "cancelado, sai do painel (o envio é cancelado na Frenet)",
      JSON.stringify({ saiu, retirados: frenet.retirados })
    )

    /* 5. a Frenet recusa: não insiste */
    frenet.roteiroDosPedidos = "recusa"
    const U = await fabrica.pedidoPix(novoEmail(), [["oleo-para-barba", 1]])
    await fabrica.pagar(U)
    const recusado = await registroQuando(U, (x) => x.definitivo)
    frenet.roteiroDosPedidos = "normal"
    ok(
      recusado?.definitivo === true && /CEP de destino inválido/.test(recusado.erro ?? ""),
      "recusado pela Frenet: fica registrado, com o motivo dela",
      JSON.stringify(recusado)
    )
    await varrer()
    ok(
      noPainel(U.numero).length === 0 &&
        (await fabrica.noAdmin(U.id)).metadata?.fb_parceiro?.tentativas === 1,
      "e a varredura não insiste (a etiqueta desse é à mão)"
    )

    /* 6. a Frenet fora do ar: fica pra depois */
    frenet.roteiroDosPedidos = "queda"
    const V = await fabrica.pedidoPix(novoEmail(), [["oleo-para-barba", 1]])
    await fabrica.pagar(V)
    const caiu = await registroQuando(V, (x) => x.tentativas >= 1)
    frenet.roteiroDosPedidos = "normal"
    ok(
      caiu?.entrou === false && !caiu.definitivo && /500/.test(caiu.erro ?? ""),
      "Frenet fora do ar: não entrou, e não desistiu",
      JSON.stringify(caiu)
    )
    const v = await varrer()
    ok(
      noPainel(V.numero).length === 0 && v.relatorio?.pendentes === 0,
      "e a varredura espera antes de tentar de novo (10 minutos, depois 20, 40…)",
      JSON.stringify(v)
    )

    /* 7. pago antes de o registro ligar: etiqueta à mão, fora do painel */
    const metaAntes = loja?.metadata ?? {}
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await adm(`/admin/stores/${loja?.id}`, {
      method: "POST",
      body: JSON.stringify({
        metadata: { ...metaAntes, fb_parceiros: { frenet: { pedidos_desde: amanha } } },
      }),
    })
    const W = await fabrica.pedidoPix(novoEmail(), [["oleo-para-barba", 1]])
    await fabrica.pagar(W)
    await silencio()
    await varrer()
    ok(
      noPainel(W.numero).length === 0 && !(await fabrica.noAdmin(W.id)).metadata?.fb_parceiro,
      "o pedido pago antes de o registro ligar não vai (pode já ter etiqueta feita à mão)"
    )
    await adm(`/admin/stores/${loja?.id}`, {
      method: "POST",
      body: JSON.stringify({ metadata: metaAntes }),
    })

    // O que ficou pra trás de propósito (a queda, o pago "antes") sai de cena:
    // senão a próxima varredura manda os dois pro painel falso.
    await fabrica.cancelar(V)
    await fabrica.cancelar(W)
  }
}

/* ── 8. a conta ───────────────────────────────────────────────────────────── */

titulo("Na conta")
const navegador = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
)
const errosDeConsole = []
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } })
const pagina = await contexto.newPage()
pagina.on("pageerror", (e) => errosDeConsole.push(e.message))
pagina.on("console", (m) => {
  if (m.type() === "error") errosDeConsole.push(m.text())
})
const visivel = (sel) => pagina.locator(sel).filter({ visible: true })
const textoDe = async (sel) =>
  (
    (await visivel(sel)
      .first()
      .textContent()
      .catch(() => "")) ?? ""
  ).trim()

{
  // Entrar pelo código — contando só os e-mails de código (os de pedido também chegam aqui).
  const antes = resend.emails.filter((e) => e.to?.includes(CLIENTE) && deCodigo(e)).length
  await pagina.goto(`${LOJA}/conta/entrar`)
  await pagina.locator(".entrar input[name=email]").filter({ visible: true }).fill(CLIENTE)
  await pagina.locator(".entrar form button[type=submit]").filter({ visible: true }).click()
  await pagina.waitForURL("**/conta/entrar/codigo", { timeout: 20000 })
  let codigo = null
  for (const fim = Date.now() + 8000; !codigo && Date.now() < fim; await esperar(150)) {
    const deste = resend.emails.filter((e) => e.to?.includes(CLIENTE) && deCodigo(e))
    if (deste.length > antes) codigo = deste.at(-1).subject.match(/^\d{6}/)[0]
  }
  await pagina
    .locator(".entrar input[name=codigo]")
    .filter({ visible: true })
    .fill(codigo ?? "")
  await pagina.waitForURL(`${LOJA}/conta`, { timeout: 20000 })
  await visivel(".andamento__linha").first().waitFor({ timeout: 15000 })

  const linhas = await pagina.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll(".andamento__linha")]
        .filter((l) => l.checkVisibility())
        .map((l) => [l.dataset.pedido, l.querySelector(".andamento__txt")?.textContent ?? ""])
    )
  )
  ok(
    linhas[D.id]?.startsWith("A transportadora avisou atraso"),
    "a visão geral diz do atraso",
    linhas[D.id]
  )
  ok(linhas[E.id]?.startsWith("Chega hoje"), "e de quem saiu pra entrega", linhas[E.id])
  ok(linhas[B.id]?.startsWith("A caminho desde"), "e o em trânsito segue 'a caminho'", linhas[B.id])

  await pagina.goto(`${LOJA}/conta/pedidos/${A.id}`)
  await visivel("h1#t-pedido").waitFor({ timeout: 15000 })
  ok(
    (await textoDe(".rastreio__agora b")) === "Entregue",
    "o pedido entregue: a situação",
    await textoDe(".rastreio__agora b")
  )
  const eventos = await pagina.evaluate(() =>
    [...document.querySelectorAll(".rastreio > .rastreio__eventos li")]
      .filter((l) => l.checkVisibility())
      .map((l) => l.querySelector(".rastreio__evento")?.textContent)
  )
  ok(
    JSON.stringify(eventos) === JSON.stringify(["Entregue", "Saiu pra entrega", "Em trânsito"]),
    "os três últimos eventos à vista, do mais novo pro mais velho",
    JSON.stringify(eventos)
  )
  ok(
    (await textoDe(".rastreio__mais summary")) === "Ver o caminho todo (5)",
    "e o resto dobrado, com o total",
    await textoDe(".rastreio__mais summary")
  )
  ok(
    (await visivel(".rastreio a").getAttribute("href")) === urlDe(COD_A),
    "o link da transportadora"
  )
  ok(
    (await textoDe(".rastreio__rot")) === "Rastreio · Correios · PAC",
    "e quem leva",
    await textoDe(".rastreio__rot")
  )

  await pagina.goto(`${LOJA}/conta/pedidos/${B.id}`)
  await visivel("h1#t-pedido").waitFor({ timeout: 15000 })
  ok((await textoDe(".rastreio__agora b")) === "Em trânsito", "o do admin + Frenet: em trânsito")
  const doB = await pagina.evaluate(() =>
    [...document.querySelectorAll(".rastreio__eventos li")]
      .filter((l) => l.checkVisibility())
      .map((l) => l.querySelector(".rastreio__evento")?.textContent)
  )
  ok(
    JSON.stringify(doB) === JSON.stringify(["Em trânsito"]),
    "e a linha do tempo é a da transportadora (o 'Postado' do admin sai de cena)",
    JSON.stringify(doB)
  )

  await pagina.goto(`${LOJA}/conta/pedidos/${D.id}`)
  await visivel("h1#t-pedido").waitFor({ timeout: 15000 })
  ok((await textoDe(".rastreio__agora b")) === "Atrasado", "o atrasado: o alerta na frente")

  const sessao = (await contexto.cookies()).find((c) => c.name === "sessao")?.value
  const rota = await fetch(`${MEDUSA}/store/conta/pedidos/${A.id}/rastreio`, {
    headers: { "x-publishable-api-key": CHAVE, authorization: `Bearer ${sessao}` },
  })
  const texto = await rota.text()
  const corpo = JSON.parse(texto)
  ok(
    rota.status === 200 && corpo.rastreios?.[0]?.situacao === "entregue",
    "a rota de rastreio fala o vocabulário do núcleo",
    texto.slice(0, 120)
  )
  ok(!/"bruto"|"chave"|EventType/.test(texto), "sem o bruto do parceiro nem a chave de repetição")
}

ok(errosDeConsole.length === 0, "sem erro no console", errosDeConsole.slice(0, 3).join(" | "))

/* ── fim ──────────────────────────────────────────────────────────────────── */

await navegador.close()
await resend.fechar()
await frenet.fechar?.()
await pagarme.fechar?.()
console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
