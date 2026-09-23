/**
 * CONFERIDOR DO ERP — o Bling conectado pelo admin, o estoque espelhado e a
 * nota fiscal de cada pedido pago, de ponta a ponta, contra um Bling falso.
 *
 *   BLING_CLIENT_ID=cliente-de-teste BLING_CLIENT_SECRET=segredo-de-teste \
 *   BLING_URL=http://127.0.0.1:4340/Api/v3 \
 *   BLING_AUTORIZACAO_URL=http://127.0.0.1:4340/Api/v3/oauth/authorize \
 *   MEDUSA_BACKEND_URL=http://127.0.0.1:9000 (e os falsos de sempre, ver AGENTS.md) npm run backend:dev
 *   ADMIN_EMAIL=… ADMIN_SENHA=… node ferramentas/conferir-erp.mjs
 *
 * Com o registro no painel da Frenet ligado no Medusa (FRENET_PARCEIRO_TOKEN
 * e FRENET_WHITELABEL_URL, como no conferir-envio) e o mesmo
 * FRENET_PARCEIRO_TOKEN aqui, ele confere também que a nota vai junto do
 * pedido pro painel.
 *
 * Os pedidos nascem como na loja (`pedido-de-teste.mjs`), com Pix pago pelo
 * Pagar.me falso; os e-mails pra equipe caem no Resend falso. O Bling falso
 * (`bling-falso.mjs`) é novo a cada rodada — por isso a primeira coisa é
 * conectar de novo, como alguém faria no admin.
 *
 * O ESTOQUE LOCAL VOLTA AO QUE ERA no fim, mesmo se ele quebrar no meio: a
 * sincronização copia os saldos pequenos do Bling falso, e os outros
 * conferidores precisam de estoque pra montar pedido.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • a conexão que não conclui, ou que troca o código de autorização duas │
 * │   vezes (no Bling, isso revoga o acesso), ou que aceita estado forjado;│
 * │ • o estoque que não segue o Bling, que zera o SKU que o Bling não tem, │
 * │   ou que desconta DUAS vezes o pedido que já foi pro Bling;            │
 * │ • o aviso de estoque sem a assinatura certa entrando;                  │
 * │ • o pedido pago sem nota, com a nota em dobro, com a parcela que não   │
 * │   fecha, ou com o e-mail do Bling indo pro cliente;                    │
 * │ • a nota que demora na SEFAZ e ninguém volta pra buscar; a rejeitada   │
 * │   sem aviso pra equipe, e a corrigida no Bling que a loja não percebe; │
 * │ • o cancelado que deixa pedido e nota no Bling — ou a nota autorizada  │
 * │   de pedido cancelado sem o e-mail que manda cancelar em 24 horas;     │
 * │ • o pedido sem CPF sem aviso; a conexão que cai em silêncio.           │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { readFileSync } from "node:fs"
import { subirBlingFalso } from "./bling-falso.mjs"
import { subirFrenetFalsa } from "./frenet-falsa.mjs"
import { subirPagarmeFalso } from "./pagarme-falso.mjs"
import { fabricaDePedidos } from "./pedido-de-teste.mjs"
import { subirResendFalso } from "./resend-falso.mjs"

const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const PARCEIRO = process.env.FRENET_PARCEIRO_TOKEN ?? ""

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
async function esperarQue(condicao, ms = 15000) {
  for (const fim = Date.now() + ms; Date.now() < fim; await esperar(250)) {
    const v = await condicao()
    if (v) return v
  }
  return await condicao()
}

const RODADA = Date.now().toString(36)
let n = 0
const novoEmail = () => `erp.${RODADA}.${++n}@teste.fuckingbarba.dev`
const CPF = "11144477735"

/* ── o que precisa estar de pé ────────────────────────────────────────────── */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_SENHA = process.env.ADMIN_SENHA
if (!ADMIN_EMAIL || !ADMIN_SENHA) {
  console.log(
    "  ⚠  este conferidor monta pedidos: precisa de ADMIN_EMAIL e ADMIN_SENHA (o admin LOCAL)"
  )
  process.exit(1)
}
const { token: tokenAdmin } = await (
  await fetch(`${MEDUSA}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_SENHA }),
  })
).json()
async function adm(caminho, opcoes = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    ...opcoes,
    headers: { "content-type": "application/json", authorization: `Bearer ${tokenAdmin}` },
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

{
  const r = await adm("/admin/erp")
  if (r.status === 404) {
    console.log("  ⚠  o backend não tem a rota /admin/erp — suba o desta versão")
    process.exit(1)
  }
  if (!r.corpo.configurado) {
    console.log(
      "  ⚠  o Medusa está sem o app do Bling. Suba com BLING_CLIENT_ID=cliente-de-teste " +
        "BLING_CLIENT_SECRET=segredo-de-teste BLING_URL=http://127.0.0.1:4340/Api/v3 " +
        "BLING_AUTORIZACAO_URL=http://127.0.0.1:4340/Api/v3/oauth/authorize"
    )
    process.exit(1)
  }
}

const resend = await subirResendFalso()
const frenet = await subirFrenetFalsa()
const pagarme = await subirPagarmeFalso({
  webhook: {
    url: `${MEDUSA}/hooks/payment/pagarme_pagarme`,
    segredo: process.env.MEDUSA_WEBHOOK_SEGREDO ?? "segredo-de-teste",
  },
})
const bling = await subirBlingFalso({ volta: `${MEDUSA}/hooks/erp/bling/autorizado` })
const fabrica = fabricaDePedidos({ medusa: MEDUSA, chave: CHAVE, tokenAdmin, pagarme })
const AVISO = `${MEDUSA}/hooks/erp/bling`

/** Os e-mails pra equipe (o admin local) com este assunto. */
const praEquipe = (assunto) =>
  resend.emails.filter((e) => e.to?.includes(ADMIN_EMAIL) && e.subject === assunto)
const pendencias = async () => (await adm("/admin/erp")).corpo.pendencias ?? []

/* ── o estoque de antes, pra devolver no fim ──────────────────────────────── */

async function niveisDeEstoque() {
  const { corpo } = await adm(
    "/admin/inventory-items?limit=200&fields=id,sku,location_levels.location_id,location_levels.stocked_quantity"
  )
  return (corpo.inventory_items ?? []).flatMap((i) =>
    (i.location_levels ?? []).map((n) => ({
      item: i.id,
      local: n.location_id,
      guardado: n.stocked_quantity,
    }))
  )
}
const estoqueDeAntes = await niveisDeEstoque()
async function devolverEstoque() {
  for (const n of estoqueDeAntes) {
    await adm(`/admin/inventory-items/${n.item}/location-levels/${n.local}`, {
      method: "POST",
      body: JSON.stringify({ stocked_quantity: n.guardado }),
    })
  }
  console.log(`
  ·  estoque local devolvido ao que era (${estoqueDeAntes.length} item(ns))`)
}

try {
  /* ── 1. conectar ──────────────────────────────────────────────────────────── */

  titulo("Conectar o Bling pelo admin")
  let volta = ""
  {
    const { corpo } = await adm("/admin/erp/conectar", { method: "POST" })
    const url = new URL(corpo.url ?? "http://x")
    ok(
      `${url.origin}${url.pathname}` === `${bling.url}/oauth/authorize` &&
        url.searchParams.get("client_id") === "cliente-de-teste" &&
        (url.searchParams.get("state") ?? "").length >= 24,
      "o botão leva à tela de autorização do Bling, com o client id e um estado aleatório",
      corpo.url
    )
    const tela = await fetch(url, { redirect: "manual" })
    volta = tela.headers.get("location") ?? ""
    const fim = await fetch(volta, { redirect: "manual" })
    ok(
      fim.headers.get("location") === "/app/erp?conectado=1",
      "a volta troca o código e cai na tela do ERP, conectado",
      fim.headers.get("location")
    )
    const s = (await adm("/admin/erp")).corpo
    ok(
      s.conectado && s.empresa === "FuckingBarba (Bling falso)" && Boolean(s.notasDesde),
      "o admin mostra a empresa e desde quando as notas saem",
      JSON.stringify({ conectado: s.conectado, empresa: s.empresa })
    )
    const f5 = await fetch(volta, { redirect: "manual" })
    ok(
      /erro=/.test(f5.headers.get("location") ?? "") &&
        bling.codigosTrocados === 1 &&
        !bling.revogado,
      "o F5 na volta não troca o código de novo (no Bling, isso revogaria o acesso)",
      `${f5.headers.get("location")} · trocados ${bling.codigosTrocados}`
    )
    const forjado = await fetch(`${MEDUSA}/hooks/erp/bling/autorizado?code=x&state=forjado`, {
      redirect: "manual",
    })
    ok(
      /erro=/.test(forjado.headers.get("location") ?? ""),
      "estado que não saiu do admin não conecta"
    )
  }

  /* ── 2. estoque ───────────────────────────────────────────────────────────── */

  titulo("O estoque segue o Bling")
  const { corpo: catalogo } = await adm("/admin/products?fields=handle,variants.sku&limit=100")
  const skuDe = Object.fromEntries(
    (catalogo.products ?? []).map((p) => [p.handle, p.variants?.[0]?.sku]).filter(([, sku]) => sku)
  )
  const SKU_OLEO = skuDe["oleo-para-barba"]
  const usadosEmPedido = new Set(["oleo-para-barba", "balm-para-barba", "shampoo-para-barba"])
  const [handleSo, SKU_SO] =
    Object.entries(skuDe).find(([h]) => !usadosEmPedido.has(h) && !/kit/.test(h)) ?? []
  const [, SKU_FORA] =
    Object.entries(skuDe).find(([h]) => h !== handleSo && !usadosEmPedido.has(h)) ?? []
  for (const [handle, sku] of Object.entries(skuDe)) {
    if (sku !== SKU_FORA) bling.produto(sku, handle === "oleo-para-barba" ? 40 : 25)
  }
  bling.produto(SKU_SO, 7)

  async function itemDeEstoque(sku) {
    const { corpo } = await adm(
      `/admin/inventory-items?sku=${encodeURIComponent(sku)}&fields=stocked_quantity,reserved_quantity`
    )
    const item = corpo.inventory_items?.[0]
    return item
      ? {
          guardado: Number(item.stocked_quantity ?? 0),
          reservado: Number(item.reserved_quantity ?? 0),
        }
      : null
  }
  /** O que ainda dá pra vender: o guardado menos as reservas de TODOS os pedidos em aberto. */
  async function disponivel(sku) {
    const i = await itemDeEstoque(sku)
    return i ? i.guardado - i.reservado : null
  }
  /*
  O guardado de um SKU que nenhum pedido deste conferidor usa é o saldo do Bling
  puro: não há pedido dele no Bling pra somar. (O que dá pra vender pode ser
  menos: Pix de outras rodadas, ainda esperando, reservam — e o Bling nem sabe
  deles. É o comportamento certo.)
*/
  const guardado = async (sku) => (await itemDeEstoque(sku))?.guardado ?? null
  {
    const { status, corpo } = await adm("/admin/erp/estoque", { method: "POST" })
    const r = corpo.relatorio ?? {}
    ok(status === 200 && r.ok, "a sincronização lê o Bling", JSON.stringify(corpo).slice(0, 160))
    ok(
      (await guardado(SKU_SO)) === 7,
      `o saldo do Bling vira o estoque da loja (${SKU_SO}: 7)`,
      String(await guardado(SKU_SO))
    )
    ok(
      SKU_FORA ? r.naoAchados?.includes(SKU_FORA) : false,
      `SKU que o Bling não tem (${SKU_FORA}) fica de fora, e o relatório diz qual`,
      JSON.stringify(r.naoAchados)
    )
    ok(
      bling.chamadas.every((c) => c.jwt),
      "toda chamada ao Bling pede o JWT (enable-jwt: 1)"
    )

    bling.produto(SKU_SO, 3)
    const antes = (await adm("/admin/erp")).corpo.estoque?.em
    ok(
      (await bling.avisar(AVISO, "stock.updated", {
        produto: { id: bling.produtos.get(SKU_SO).id },
      })) === 200,
      "o aviso assinado de estoque é aceito"
    )
    const mudou = await esperarQue(
      async () =>
        (await adm("/admin/erp")).corpo.estoque?.em !== antes && (await guardado(SKU_SO)) === 3,
      12000
    )
    ok(Boolean(mudou), "e a loja sincroniza sozinha, em segundos", String(await guardado(SKU_SO)))
    ok(
      (await bling.avisar(AVISO, "stock.updated", { produto: { id: 1 } }, { segredo: "chute" })) ===
        401,
      "aviso sem a assinatura certa, 401"
    )
  }

  /* ── 3. a nota do pedido pago ─────────────────────────────────────────────── */

  titulo("O pedido pago vira nota fiscal autorizada")
  bling.sefaz = "autoriza"
  const quem = novoEmail()
  await adm("/admin/erp/estoque", { method: "POST" })
  const livreAntes = await disponivel(SKU_OLEO)
  const A = await fabrica.pedidoPix(quem, [["oleo-para-barba", 2]], { documento: CPF })
  await fabrica.pagar(A)
  const refA = `FB-${A.numero}`
  const notaA = await esperarQue(() =>
    bling.notaDoPedidoDeVenda(refA)?.situacao === 5 ? bling.notaDoPedidoDeVenda(refA) : null
  )
  ok(
    Boolean(notaA),
    `pago, o #${A.numero} vira pedido de venda ${refA} no Bling e a nota é autorizada`
  )
  {
    const venda = bling.pedidoDeVenda(refA) ?? {}
    const contato = [...bling.contatos.values()].find((c) => c.numeroDocumento === CPF) ?? {}
    ok(
      contato.nome === "Rafael Teste" &&
        contato.tipo === "F" &&
        contato.indicadorIe === 9 &&
        contato.endereco?.geral?.municipio === "Blumenau" &&
        contato.endereco?.geral?.bairro === "Itoupava Central",
      "o cliente no Bling: pelo CPF, com o endereço em partes",
      JSON.stringify(contato).slice(0, 200)
    )
    ok(
      venda.contato?.id === contato.id &&
        venda.itens?.length === 1 &&
        venda.itens[0].codigo === SKU_OLEO &&
        venda.itens[0].quantidade === 2 &&
        venda.itens[0].produto?.id === bling.produtos.get(SKU_OLEO).id,
      "o pedido de venda: o item pelo SKU e pelo id do produto no Bling",
      JSON.stringify(venda.itens)
    )
    const { corpo } = await adm(`/admin/orders/${A.id}?fields=total`)
    ok(
      venda.parcelas?.length === 1 &&
        Math.abs(venda.parcelas[0].valor - Number(corpo.order?.total)) < 0.005 &&
        venda.parcelas[0].formaPagamento?.id === 12,
      "uma parcela, do valor que a pessoa pagou, na forma de pagamento Pix da conta",
      JSON.stringify(venda.parcelas)
    )
    ok(notaA?.enviarEmail === "false", "e o e-mail do Bling pro cliente fica desligado")

    await adm("/admin/erp/notas", { method: "POST" })
    await adm("/admin/erp/notas", { method: "POST" })
    ok(
      [...bling.pedidos.values()].filter((p) => p.numeroLoja === refA).length === 1 &&
        notaA?.envios === 1,
      "uma vez só: a varredura não cria outro pedido nem manda a nota de novo"
    )

    await adm("/admin/erp/estoque", { method: "POST" })
    ok(
      (await disponivel(SKU_OLEO)) === livreAntes - 2,
      "e o estoque não desconta duas vezes o pedido que já está no Bling",
      `antes ${livreAntes}, agora ${await disponivel(SKU_OLEO)}`
    )
  }

  if (PARCEIRO) {
    const naFrenet = await esperarQue(() => frenet.pedidos.find((p) => p.corpo?.Order?.Id === refA))
    ok(
      naFrenet?.corpo?.Order?.Invoice?.Number === notaA?.numero &&
        naFrenet?.corpo?.Order?.Invoice?.Key === notaA?.chaveAcesso,
      "e o pedido vai pro painel da Frenet com a nota junto",
      JSON.stringify(naFrenet?.corpo?.Order?.Invoice)
    )
  } else {
    console.log(
      "  ·  a nota junto do pedido na Frenet: rode com FRENET_PARCEIRO_TOKEN (e o Medusa também)"
    )
  }

  /* ── 4. a SEFAZ demora ────────────────────────────────────────────────────── */

  titulo("A SEFAZ demora: a loja volta pra buscar")
  bling.sefaz = "demora"
  {
    const B = await fabrica.pedidoPix(novoEmail(), [["oleo-para-barba", 1]], { documento: CPF })
    await fabrica.pagar(B)
    const refB = `FB-${B.numero}`
    const esperando = await esperarQue(() => bling.notaDoPedidoDeVenda(refB)?.situacao === 3)
    ok(Boolean(esperando), "a nota vai pra SEFAZ e fica esperando o recibo")
    await adm("/admin/erp/notas", { method: "POST" })
    await adm("/admin/erp/notas", { method: "POST" })
    ok(
      bling.notaDoPedidoDeVenda(refB)?.situacao === 5 &&
        bling.notaDoPedidoDeVenda(refB)?.envios === 1,
      "a varredura consulta até a autorização — sem mandar a nota de novo"
    )
    if (PARCEIRO) {
      const naFrenet = await esperarQue(() =>
        frenet.pedidos.find((p) => p.corpo?.Order?.Id === refB)
      )
      ok(
        Boolean(naFrenet?.corpo?.Order?.Invoice?.Key),
        "autorizada, o pedido segue pra Frenet com a nota"
      )
    }
  }

  /* ── 5. rejeitada ─────────────────────────────────────────────────────────── */

  titulo("A nota rejeitada: e-mail pra equipe, e a loja acompanha a correção")
  bling.sefaz = "rejeita"
  {
    const C = await fabrica.pedidoPix(novoEmail(), [["balm-para-barba", 1]], { documento: CPF })
    await fabrica.pagar(C)
    const refC = `FB-${C.numero}`
    ok(
      Boolean(await esperarQue(() => bling.notaDoPedidoDeVenda(refC)?.situacao === 4)),
      "a SEFAZ rejeita"
    )
    ok(
      Boolean(await esperarQue(() => praEquipe(`A nota do pedido #${C.numero} não saiu`).length)),
      "a equipe recebe o e-mail de que a nota não saiu"
    )
    ok(
      (await pendencias()).some((p) => p.referencia === refC && p.tipo === "rejeitada"),
      "e a tela do ERP mostra a pendência"
    )
    bling.autorizar(bling.notaDoPedidoDeVenda(refC))
    ok(
      (await bling.avisar(AVISO, "invoice.updated", {
        id: bling.notaDoPedidoDeVenda(refC).id,
        situacao: 5,
      })) === 200,
      "corrigida e reenviada no Bling, o aviso da nota chega"
    )
    ok(
      Boolean(
        await esperarQue(async () => !(await pendencias()).some((p) => p.referencia === refC))
      ),
      "e a loja percebe a autorização: a pendência some"
    )
  }

  /* ── 6. cancelado antes da autorização ────────────────────────────────────── */

  titulo("Cancelado antes da autorização: a loja desfaz no Bling")
  bling.sefaz = "pendente"
  {
    const D = await fabrica.pedidoPix(novoEmail(), [["shampoo-para-barba", 1]], { documento: CPF })
    await fabrica.pagar(D)
    const refD = `FB-${D.numero}`
    const nota = await esperarQue(() => bling.notaDoPedidoDeVenda(refD))
    ok(nota?.situacao === 1, "a nota ficou pendente no Bling")
    await fabrica.cancelar(D)
    const desfeito = await esperarQue(
      () => bling.pedidoDeVenda(refD)?.situacao === 12 && !bling.notas.has(nota?.id)
    )
    ok(Boolean(desfeito), "cancelado: a nota pendente é apagada e o pedido de venda, cancelado")
    ok(
      praEquipe(`Cancele a nota do pedido #${D.numero} no Bling`).length === 0,
      "sem e-mail pra equipe: não havia nota autorizada"
    )
  }

  /* ── 7. cancelado com a nota autorizada ───────────────────────────────────── */

  titulo("Cancelado com a nota autorizada: e-mail pra cancelar no Bling em 24 horas")
  bling.sefaz = "autoriza"
  {
    const E = await fabrica.pedidoPix(novoEmail(), [["oleo-para-barba", 1]], { documento: CPF })
    await fabrica.pagar(E)
    const refE = `FB-${E.numero}`
    ok(
      Boolean(await esperarQue(() => bling.notaDoPedidoDeVenda(refE)?.situacao === 5)),
      "a nota foi autorizada"
    )
    await fabrica.cancelar(E)
    const email = await esperarQue(
      () => praEquipe(`Cancele a nota do pedido #${E.numero} no Bling`)[0]
    )
    ok(
      Boolean(email) &&
        /Cancele até/.test(email?.html ?? email?.text ?? "") &&
        email.html.includes(bling.notaDoPedidoDeVenda(refE).chaveAcesso),
      "a equipe recebe o e-mail com a nota, a chave e o prazo"
    )
    ok(
      (await pendencias()).some((p) => p.referencia === refE && p.tipo === "cancelar" && p.prazo),
      "e a tela do ERP mostra a nota pra cancelar, com o prazo"
    )
    ok(
      bling.pedidoDeVenda(refE)?.situacao !== 12,
      "a loja não mexe no pedido de venda com nota autorizada"
    )
  }

  /* ── 8. sem CPF ───────────────────────────────────────────────────────────── */

  titulo("Pedido sem CPF: não vai pro Bling, e a equipe fica sabendo")
  {
    const F = await fabrica.pedidoPix(novoEmail(), [["shampoo-para-barba", 1]])
    await fabrica.pagar(F)
    const email = await esperarQue(() => praEquipe(`A nota do pedido #${F.numero} não saiu`)[0])
    ok(Boolean(email) && /CPF\/CNPJ/.test(email?.html ?? ""), "o e-mail diz que falta o CPF/CNPJ")
    ok(!bling.pedidoDeVenda(`FB-${F.numero}`), "e nada foi criado no Bling")
    ok(
      (await pendencias()).some((p) => p.referencia === `FB-${F.numero}` && p.tipo === "nao-sai"),
      "a tela do ERP mostra: emitir à mão"
    )
  }

  /* ── 9. a conexão cai ─────────────────────────────────────────────────────── */

  titulo("A conexão cai: a loja para e avisa")
  {
    bling.acessos.clear()
    bling.renovacao = null
    const { corpo } = await adm("/admin/erp/estoque", { method: "POST" })
    ok(
      corpo.relatorio?.ok === false,
      "o Bling recusa a renovação: a sincronização não anda",
      JSON.stringify(corpo).slice(0, 160)
    )
    const s = (await adm("/admin/erp")).corpo
    ok(
      !s.conectado && /Invalid refresh token/.test(s.queda ?? ""),
      "o admin mostra que caiu, e por quê",
      s.queda
    )
    ok(
      Boolean(await esperarQue(() => praEquipe("A conexão com o Bling caiu").length)),
      "e a equipe recebe o e-mail pra conectar de novo"
    )
  }
} finally {
  await devolverEstoque()
}

/* ── fim ──────────────────────────────────────────────────────────────────── */

bling.fechar()
await resend.fechar()
await frenet.fechar?.()
await pagarme.fechar?.()
console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
