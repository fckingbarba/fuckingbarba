/**
 * CONFERIDOR DO ERP — o Bling conectado pelo admin, o estoque espelhado e a
 * nota fiscal de cada pedido pago, de ponta a ponta, contra um Bling falso.
 *
 *   BLING_CLIENT_ID=cliente-de-teste BLING_CLIENT_SECRET=segredo-de-teste \
 *   BLING_URL=http://127.0.0.1:4340/Api/v3 \
 *   BLING_AUTORIZACAO_URL=http://127.0.0.1:4340/Api/v3/oauth/authorize \
 *   NUVEMSHOP_LOJA_URL=http://127.0.0.1:4350 \
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
 * conferidores precisam de estoque pra montar pedido. A importação só mexe em
 * produtos de teste, criados aqui e apagados no fim — os da loja ficam.
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
 * │ • a janela antes da nota: a nota que sai antes dela fechar, o pedido   │
 * │   de venda que não vai na hora, o cancelado dentro dela que deixa algo │
 * │   no Bling ou manda e-mail, e o "Emitir agora" que não passa;          │
 * │ • o pedido sem CPF sem aviso; a conexão que cai em silêncio;           │
 * │ • a importação dos produtos que apaga o que a prévia não mostrou, que  │
 * │   troca o endereço ou a categoria do que já existe, que deixa o "de/   │
 * │   por" e os textos da página, que aponta a foto pro Bling, que apaga   │
 * │   produto com pedido esperando envio, ou que duplica ao rodar de novo; │
 * │   e que, rodada de novo, apaga o que a equipe refez depois;            │
 * │ • o endereço e as fotos da Nuvemshop que não chegam, que trocam o que  │
 * │   não devem (categoria de quem já tem, o publicado no caminho), ou que │
 * │   a importação do Bling desfaz depois.                                 │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { readFileSync } from "node:fs"
import { subirBlingFalso } from "./bling-falso.mjs"
import { subirFrenetFalsa } from "./frenet-falsa.mjs"
import { subirNuvemshopFalsa } from "./nuvemshop-falsa.mjs"
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
const nuvem = await subirNuvemshopFalsa()
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
/** O que os testes criaram no admin; desfeito no fim, do último pro primeiro. */
const limpar = []
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
    ok(
      s.janelaDaNota === 120 && Array.isArray(s.esperando),
      "sem ninguém escolher, a nota espera 2 horas depois do pagamento (o padrão)",
      String(s.janelaDaNota)
    )
    // As seções da nota, até a da janela, conferem a nota que sai na hora.
    const janelaAntes = s.janelaDaNota
    await adm("/admin/erp/notas/janela", { method: "POST", body: JSON.stringify({ minutos: 0 }) })
    limpar.push(() =>
      adm("/admin/erp/notas/janela", {
        method: "POST",
        body: JSON.stringify({ minutos: janelaAntes }),
      })
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

    // O Bling falso, como a especificação: sem `filtroSaldoEstoque`, a lista
    // só traz saldo positivo. O esgotado tem de chegar a zero mesmo assim.
    bling.produto(SKU_SO, 0)
    await adm("/admin/erp/estoque", { method: "POST" })
    ok(
      (await guardado(SKU_SO)) === 0,
      `o esgotado no Bling zera na loja (${SKU_SO}: 0) — a lista do Bling esconde o saldo zero`,
      String(await guardado(SKU_SO))
    )
    bling.produto(SKU_SO, 3)
  }

  /* ── 3. a nota do pedido pago ─────────────────────────────────────────────── */

  titulo("O pedido pago vira nota fiscal autorizada")
  bling.sefaz = "autoriza"
  const quem = novoEmail()
  await adm("/admin/erp/estoque", { method: "POST" })
  const livreAntes = await disponivel(SKU_OLEO)
  // O Bling já tem um cadastro com este CPF — de antes da loja nova, com o
  // e-mail e o telefone de outra pessoa, como o da primeira compra de teste em
  // produção (23/09). Quem comprou agora é quem tem de ir na nota.
  const antigo = bling.contato({
    nome: "Nome Antigo",
    tipo: "F",
    situacao: "A",
    numeroDocumento: CPF,
    indicadorIe: 9,
    email: "outra.pessoa@exemplo.com",
    emailNotaFiscal: "outra.pessoa@exemplo.com",
    telefone: "(11) 95428-3743",
    celular: "(11) 95428-3743",
    vendedor: { id: 3 },
    endereco: {
      geral: {
        endereco: "Rua Velha",
        numero: "1",
        bairro: "Centro",
        cep: "01001-000",
        municipio: "São Paulo",
        uf: "SP",
      },
    },
  })
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
    const digitos = (v) => String(v ?? "").replace(/\D/g, "")
    ok(
      contato.id === antigo.id &&
        contato.email === quem &&
        contato.emailNotaFiscal === quem &&
        digitos(contato.telefone).endsWith("988887777") &&
        digitos(contato.celular).endsWith("988887777") &&
        contato.vendedor?.id === 3,
      "o cadastro que já existia é atualizado com quem comprou — o e-mail da nota e o telefone " +
        "também —, sem perder o vendedor",
      JSON.stringify(contato).slice(0, 300)
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

    // A equipe põe o CPF no pedido e manda tentar de novo, pelo admin.
    const { corpo: lido } = await adm(`/admin/orders/${F.id}?fields=*billing_address`)
    const cobranca = lido.order?.billing_address ?? {}
    // Só os campos que o admin aceita no endereço (o validador é estrito).
    const CAMPOS = ["first_name", "last_name", "phone", "company", "address_1", "address_2"]
    CAMPOS.push("city", "country_code", "province", "postal_code")
    const { status: sEnd } = await adm(`/admin/orders/${F.id}`, {
      method: "POST",
      body: JSON.stringify({
        billing_address: {
          ...Object.fromEntries(
            CAMPOS.filter((k) => cobranca[k] != null).map((k) => [k, cobranca[k]])
          ),
          metadata: { ...(cobranca.metadata ?? {}), documento: { tipo: "cpf", valor: CPF } },
        },
      }),
    })
    const { corpo: tentou } = await adm("/admin/erp/notas/tentar", {
      method: "POST",
      body: JSON.stringify({ pedidoId: F.id }),
    })
    ok(
      sEnd === 200 &&
        tentou.resultado?.resultado === "autorizada" &&
        bling.notaDoPedidoDeVenda(`FB-${F.numero}`)?.situacao === 5,
      "com o CPF posto, “Tentar de novo” emite a nota na hora",
      JSON.stringify({ sEnd, tentou })
    )
    ok(
      !(await pendencias()).some((p) => p.referencia === `FB-${F.numero}`),
      "e a pendência some da tela"
    )
  }

  /* ── 8b. falta uma permissão no app ───────────────────────────────────────── */

  titulo("Falta uma permissão no app do Bling: a loja diz qual, e segue tentando")
  {
    // Como em produção (23/09): o app lê o cliente, mas não pode criar.
    bling.semEscopo.add("POST /contatos")
    const { corpo: pc } = await adm("/admin/erp/permissoes", { method: "POST" })
    const escopo = (nome, acao) => pc.permissoes?.find((p) => p.escopo === nome && p.acao === acao)
    ok(
      escopo("Clientes e Fornecedores", "gravar")?.ok === false &&
        escopo("Clientes e Fornecedores", "ler")?.ok === true &&
        pc.permissoes?.filter((p) => p.ok === false).length === 1,
      "a conferência aponta a que falta — gravar em Clientes e Fornecedores —, e só ela",
      JSON.stringify(pc.permissoes?.map((p) => [p.escopo, p.acao, p.ok]))
    )
    ok(
      pc.permissoes?.filter((p) => p.acao === "gravar").every((p) => p.ok !== null) &&
        pc.permissoes?.every((p) => p.ok !== null),
      "e confere a gravação sem gravar nada (o Bling recusa o pedido vazio antes)",
      JSON.stringify(pc.permissoes?.filter((p) => p.ok === null))
    )

    // Um cliente que o Bling ainda não tem: o CPF novo faz a loja precisar criar.
    const CPF_NOVO = "52998224725"
    const G = await fabrica.pedidoPix(novoEmail(), [["oleo-para-barba", 1]], {
      documento: CPF_NOVO,
    })
    await fabrica.pagar(G)
    const email = await esperarQue(() => praEquipe(`A nota do pedido #${G.numero} não saiu`)[0])
    ok(
      /Clientes e Fornecedores/.test(email?.html ?? "") &&
        /permissão de gravar/.test(email?.html ?? "") &&
        /Conectar de novo/.test(email?.html ?? "") &&
        /não emita à mão/.test(email?.html ?? ""),
      "a equipe recebe o e-mail com o escopo que falta, e que é pra conectar de novo (não emitir à mão)"
    )
    const pendente = (await pendencias()).find((p) => p.referencia === `FB-${G.numero}`)
    ok(
      pendente?.tipo === "tentando" && /Clientes e Fornecedores/.test(pendente.detalhe ?? ""),
      "a tela do ERP mostra a nota esperando, com o motivo",
      JSON.stringify(pendente)
    )
    ok(!bling.pedidoDeVenda(`FB-${G.numero}`), "e nada foi criado no Bling")

    // Alguém marca o escopo no app e conecta de novo, pelo admin.
    bling.semEscopo.clear()
    const { corpo: c2 } = await adm("/admin/erp/conectar", { method: "POST" })
    const volta2 = (await fetch(c2.url, { redirect: "manual" })).headers.get("location") ?? ""
    const fim2 = await fetch(volta2, { redirect: "manual" })
    await adm("/admin/erp/notas", { method: "POST" })
    ok(
      fim2.headers.get("location") === "/app/erp?conectado=1" &&
        bling.notaDoPedidoDeVenda(`FB-${G.numero}`)?.situacao === 5,
      "conectado de novo, a nota sai na varredura seguinte — sem esperar a vez dela",
      `${fim2.headers.get("location")} · ${bling.notaDoPedidoDeVenda(`FB-${G.numero}`)?.situacao}`
    )
    ok(!(await pendencias()).some((p) => p.referencia === `FB-${G.numero}`), "e a pendência some")
  }

  /* ── 8c. o cadastro que o Bling não deixa atualizar ─────────────────────── */

  titulo("O cadastro do cliente que o Bling não deixa atualizar: a nota sai, e a equipe confere")
  {
    const CPF_ANTIGO = "39053344705"
    bling.contato({
      nome: "Cadastro Antigo",
      tipo: "F",
      situacao: "A",
      numeroDocumento: CPF_ANTIGO,
      email: "antigo@exemplo.com",
      endereco: {
        geral: {
          endereco: "Rua Velha",
          numero: "1",
          bairro: "Centro",
          cep: "01001-000",
          municipio: "São Paulo",
          uf: "SP",
        },
      },
    })
    bling.recusarAtualizacaoDeContato = true
    const H = await fabrica.pedidoPix(novoEmail(), [["balm-para-barba", 1]], {
      documento: CPF_ANTIGO,
    })
    await fabrica.pagar(H)
    const nota = await esperarQue(() => bling.notaDoPedidoDeVenda(`FB-${H.numero}`)?.situacao === 5)
    const email = await esperarQue(() => praEquipe(`Confira a nota do pedido #${H.numero}`)[0])
    bling.recusarAtualizacaoDeContato = false
    ok(Boolean(nota), "a nota sai assim mesmo, com o cadastro que está lá")
    ok(
      /não foi atualizado/.test(email?.html ?? "") && /carta de correção/.test(email?.html ?? ""),
      "e a equipe recebe o e-mail pra conferir o destinatário da nota",
      email?.subject
    )
  }

  /* ── 8d. a janela antes da nota ────────────────────────────────────────────── */

  titulo("A janela: o pedido de venda vai na hora, a nota espera 2 horas")
  bling.sefaz = "autoriza"
  {
    const janela = (minutos) =>
      adm("/admin/erp/notas/janela", { method: "POST", body: JSON.stringify({ minutos }) })
    const invalidos = await Promise.all([-1, 1441, 1.5, "120", null].map((m) => janela(m)))
    ok(
      invalidos.every((r) => r.status === 400),
      "a janela só aceita minutos inteiros, de 0 a 24 horas",
      invalidos.map((r) => r.status).join(",")
    )
    const { status: sJ, corpo: cJ } = await janela(120)
    ok(
      sJ === 200 && (await adm("/admin/erp")).corpo.janelaDaNota === 120,
      "a tela grava a janela",
      JSON.stringify(cJ)
    )

    const J = await fabrica.pedidoPix(novoEmail(), [["oleo-para-barba", 1]], { documento: CPF })
    await fabrica.pagar(J)
    const pagoEm = Date.now()
    const refJ = `FB-${J.numero}`
    const vendaJ = await esperarQue(() => bling.pedidoDeVenda(refJ))
    // A varredura espera a trava do pedido: depois dela, o pagamento já passou todo.
    await adm("/admin/erp/notas", { method: "POST" })
    ok(
      Boolean(vendaJ) && !bling.notaDoPedidoDeVenda(refJ),
      `pago, o #${J.numero} vira pedido de venda no Bling na hora — e a nota espera`
    )
    await adm("/admin/erp/notas", { method: "POST" })
    ok(
      !bling.notaDoPedidoDeVenda(refJ) &&
        [...bling.pedidos.values()].filter((p) => p.numeroLoja === refJ).length === 1,
      "a varredura não emite antes de a janela fechar, nem cria outro pedido de venda"
    )
    const esperandoJ = (await adm("/admin/erp")).corpo.esperando?.find((e) => e.referencia === refJ)
    ok(
      Boolean(esperandoJ) &&
        Math.abs(new Date(esperandoJ.notaEm).getTime() - (pagoEm + 2 * 60 * 60 * 1000)) <
          5 * 60 * 1000,
      "a tela mostra o pedido esperando, com a hora da nota: 2 horas depois do pagamento",
      JSON.stringify(esperandoJ)
    )
    if (PARCEIRO) {
      await esperar(1500)
      ok(
        !frenet.pedidos.some((p) => p.corpo?.Order?.Id === refJ),
        "e o pedido ainda não vai pro painel da Frenet: a etiqueta espera a nota"
      )
    }

    await fabrica.cancelar(J)
    const desfeito = await esperarQue(() => bling.pedidoDeVenda(refJ)?.situacao === 12)
    ok(
      Boolean(desfeito) && !bling.notaDoPedidoDeVenda(refJ),
      "cancelado dentro da janela: o pedido de venda é cancelado no Bling, e nota nenhuma foi feita"
    )
    await esperar(1000)
    ok(
      praEquipe(`Cancele a nota do pedido #${J.numero} no Bling`).length === 0 &&
        !(await pendencias()).some((p) => p.referencia === refJ) &&
        !(await adm("/admin/erp")).corpo.esperando?.some((e) => e.referencia === refJ),
      "sem e-mail pra equipe, sem pendência, e ele sai da lista dos que esperam"
    )

    const K = await fabrica.pedidoPix(novoEmail(), [["balm-para-barba", 1]], { documento: CPF })
    await fabrica.pagar(K)
    const refK = `FB-${K.numero}`
    await esperarQue(() => bling.pedidoDeVenda(refK))
    const { corpo: agora } = await adm("/admin/erp/notas/tentar", {
      method: "POST",
      body: JSON.stringify({ pedidoId: K.id }),
    })
    ok(
      agora.resultado?.resultado === "autorizada" &&
        bling.notaDoPedidoDeVenda(refK)?.situacao === 5 &&
        !(await adm("/admin/erp")).corpo.esperando?.some((e) => e.referencia === refK),
      "“Emitir agora” emite na hora, sem esperar a janela — e ele sai da lista",
      JSON.stringify(agora)
    )
    if (PARCEIRO) {
      const naFrenet = await esperarQue(() =>
        frenet.pedidos.find((p) => p.corpo?.Order?.Id === refK)
      )
      ok(
        naFrenet?.corpo?.Order?.Invoice?.Number === bling.notaDoPedidoDeVenda(refK)?.numero,
        "e o pedido segue pro painel da Frenet com a nota"
      )
    }

    // O cadastro que o Bling não deixa atualizar, com a nota ainda na janela:
    // o aviso chega antes da nota — dá tempo de corrigir lá.
    bling.recusarAtualizacaoDeContato = true
    const M = await fabrica.pedidoPix(novoEmail(), [["balm-para-barba", 1]], {
      documento: "39053344705",
    })
    await fabrica.pagar(M)
    const emailM = await esperarQue(() => praEquipe(`Confira a nota do pedido #${M.numero}`)[0])
    bling.recusarAtualizacaoDeContato = false
    ok(
      /Corrija o cadastro do cliente no Bling antes de/.test(emailM?.text ?? "") &&
        !bling.notaDoPedidoDeVenda(`FB-${M.numero}`),
      "o cadastro que o Bling não deixa atualizar: o e-mail chega antes da nota, com a hora dela",
      emailM?.subject
    )

    const L = await fabrica.pedidoPix(novoEmail(), [["oleo-para-barba", 1]], { documento: CPF })
    await fabrica.pagar(L)
    const refL = `FB-${L.numero}`
    await esperarQue(() => bling.pedidoDeVenda(refL))
    await adm("/admin/erp/notas", { method: "POST" })
    const antesDeMudar = !bling.notaDoPedidoDeVenda(refL)
    await janela(0)
    await adm("/admin/erp/notas", { method: "POST" })
    ok(
      antesDeMudar &&
        bling.notaDoPedidoDeVenda(`FB-${L.numero}`)?.situacao === 5 &&
        bling.notaDoPedidoDeVenda(`FB-${M.numero}`)?.situacao === 5,
      "a janela mudou pra “na hora”: quem já estava esperando sai na varredura seguinte"
    )
  }

  /* ── 9. os produtos do Bling ──────────────────────────────────────────────── */

  titulo("Os produtos vêm do Bling: a prévia, a troca, e de novo")
  {
    const R = RODADA
    const { corpo: lojas } = await adm("/admin/stores?fields=default_sales_channel_id")
    const canal = lojas.stores?.[0]?.default_sales_channel_id
    const { corpo: perfis } = await adm("/admin/shipping-profiles?fields=id,type")
    const perfil =
      (perfis.shipping_profiles ?? []).find((x) => x.type === "default") ??
      perfis.shipping_profiles?.[0]
    const { corpo: locais } = await adm("/admin/stock-locations?fields=id")
    const local = locais.stock_locations?.[0]?.id
    const { corpo: cats } = await adm("/admin/product-categories?fields=id,handle&limit=50")
    const categoria =
      (cats.product_categories ?? []).find((c) => c.handle === "barba") ??
      cats.product_categories?.[0]

    /** Um produto do site, como os da loja: publicado, com categoria, perfil e estoque. */
    async function produtoNoSite({ nome, handle, sku, preco, metadata = {}, estoque = 0 }) {
      const { status, corpo } = await adm("/admin/products", {
        method: "POST",
        body: JSON.stringify({
          title: nome,
          subtitle: "O subtítulo de hoje",
          description: "A descrição de hoje.",
          handle,
          status: "published",
          shipping_profile_id: perfil?.id,
          sales_channels: canal ? [{ id: canal }] : [],
          categories: categoria ? [{ id: categoria.id }] : [],
          metadata,
          options: [{ title: "Tamanho", values: ["Único"] }],
          variants: [
            {
              title: "Único",
              sku,
              manage_inventory: true,
              options: { Tamanho: "Único" },
              prices: [{ amount: preco, currency_code: "brl" }],
              weight: 90,
            },
          ],
        }),
      })
      if (status !== 200)
        throw new Error(
          `o produto de teste não nasceu: ${status} ${JSON.stringify(corpo).slice(0, 200)}`
        )
      limpar.push(() => adm(`/admin/products/${corpo.product.id}`, { method: "DELETE" }))
      if (estoque && local) {
        const { corpo: itens } = await adm(
          `/admin/inventory-items?sku=${encodeURIComponent(sku)}&fields=id`
        )
        await adm(`/admin/inventory-items/${itens.inventory_items[0].id}/location-levels`, {
          method: "POST",
          body: JSON.stringify({ location_id: local, stocked_quantity: estoque }),
        })
      }
      return corpo.product
    }
    const produtoNoAdmin = async (id, campos) =>
      (await adm(`/admin/products/${id}?fields=${campos}`)).corpo.product

    // No site: o óleo (com os textos da página e o "de/por"), um que sai, e
    // um que sai mas tem um Pix esperando.
    const oleo = await produtoNoSite({
      nome: `Óleo de hoje ${R}`,
      handle: `teste-imp-oleo-${R}`,
      sku: `TIMP-OL-${R}`,
      preco: 79.9,
      metadata: { fb_pdp: { conteudo: { promessa: { titulo: "de hoje" } } }, outra: "chave" },
    })
    const sai = await produtoNoSite({
      nome: `Sai ${R}`,
      handle: `teste-imp-sai-${R}`,
      sku: `TIMP-SAI-${R}`,
      preco: 30,
    })
    const preso = await produtoNoSite({
      nome: `Sai com pedido ${R}`,
      handle: `teste-imp-preso-${R}`,
      sku: `TIMP-PRESO-${R}`,
      preco: 30,
      estoque: 5,
    })
    const { corpo: lp } = await adm("/admin/price-lists", {
      method: "POST",
      body: JSON.stringify({
        title: `Promo de teste ${R}`,
        description: "conferir-erp",
        type: "sale",
        status: "active",
        ends_at: new Date(Date.now() + 7 * 864e5).toISOString(),
        prices: [{ variant_id: oleo.variants[0].id, amount: 54.9, currency_code: "brl" }],
      }),
    })
    const promo = lp.price_list
    limpar.push(() => adm(`/admin/price-lists/${promo?.id}`, { method: "DELETE" }))
    const pedidoPreso = await fabrica.pedidoPix(novoEmail(), [[preso.handle, 1]])
    limpar.push(() => fabrica.cancelar(pedidoPreso))

    // No Bling: o mesmo óleo, um produto novo com variações, um insumo sem
    // preço, um serviço e um esgotado.
    const b = `http://127.0.0.1:${bling.porta}`
    const bOleo = bling.produto(`TIMP-OL-${R}`, 9, {
      nome: `Óleo do Bling ${R}`,
      preco: 59.9,
      pesoBruto: 0.12,
      dimensoes: { largura: 6, altura: 15, profundidade: 12, unidadeMedida: 1 },
      descricaoCurta: "<p>Texto <strong>do Bling</strong>.</p>",
      fotos: 2,
      externas: [`${b}/imagens/quebrada.html`],
    })
    const bNovo = bling.produto(`TIMP-NOVO-${R}`, 0, {
      nome: `Pomada Nova ${R}`,
      preco: 40,
      pesoBruto: 0.1,
      dimensoes: { largura: 80, altura: 60, profundidade: 80, unidadeMedida: 2 },
      descricaoCurta: "Pomada.",
      fotos: 1,
      variacoes: [
        { codigo: `TIMP-NOVO-${R}-50`, saldo: 4, nome: "Tamanho:50g", preco: 0 },
        {
          codigo: `TIMP-NOVO-${R}-100`,
          saldo: 6,
          nome: "Tamanho:100g",
          preco: 60,
          pesoBruto: 0.18,
        },
      ],
    })
    const bInsumo = bling.produto(`TIMP-INSUMO-${R}`, 100, { nome: `Rótulo ${R}`, preco: 0 })
    bling.produto(`TIMP-SERV-${R}`, 0, { nome: `Serviço ${R}`, preco: 10, tipo: "S" })
    const bZero = bling.produto(`TIMP-ZERO-${R}`, 0, { nome: `Esgotado ${R}`, preco: 25 })
    const HANDLE_NOVO = `pomada-nova-${R}`

    const { status: sp, corpo: previa } = await adm("/admin/erp/catalogo")
    const doErp = (x) => previa.produtos?.find((p) => p.id === String(x.id))
    const doSite = (x) => previa.doSite?.find((s) => s.id === x.id)
    ok(sp === 200, "a prévia lê o Bling", JSON.stringify(previa).slice(0, 160))
    ok(
      doErp(bOleo)?.como === "atualiza" &&
        doErp(bOleo).noSite[0] === oleo.id &&
        doErp(bOleo).handle === oleo.handle,
      "o mesmo SKU substitui no lugar, com o endereço de hoje",
      JSON.stringify(doErp(bOleo))
    )
    ok(
      doErp(bNovo)?.como === "novo" &&
        doErp(bNovo).variacoes === 2 &&
        doErp(bNovo).handle === HANDLE_NOVO,
      "o SKU que o site não tem entra como novo, com endereço gerado do nome",
      JSON.stringify(doErp(bNovo))
    )
    ok(
      /sem preço/.test(doErp(bInsumo)?.bloqueio ?? ""),
      "o insumo, sem preço no Bling, não entra",
      JSON.stringify(doErp(bInsumo))
    )
    ok(
      !previa.produtos?.some((p) => p.nome === `Serviço ${R}`) && Boolean(doErp(bZero)),
      "serviço não aparece; o esgotado aparece (a lista do Bling esconde saldo zero)"
    )
    ok(
      doSite(oleo)?.temTextos && doSite(oleo)?.preco === 54.9 && doSite(oleo)?.precoDe === 79.9,
      "a prévia mostra o de hoje: os textos da página e o “de R$ 79,90 por R$ 54,90”",
      JSON.stringify(doSite(oleo))
    )
    ok(
      doSite(preso)?.esperando >= 1,
      "e o produto do site que tem pedido esperando envio",
      JSON.stringify(doSite(preso))
    )
    ok(
      (await produtoNoAdmin(oleo.id, "title")).title === `Óleo de hoje ${R}`,
      "a prévia não muda nada"
    )

    const { status: s400 } = await adm("/admin/erp/catalogo", {
      method: "POST",
      body: JSON.stringify({ importar: "tudo" }),
    })
    ok(s400 === 400, "pedido torto: 400")

    const { status: si, corpo: troca } = await adm("/admin/erp/catalogo", {
      method: "POST",
      body: JSON.stringify({
        importar: [String(bOleo.id), String(bNovo.id)],
        remover: [sai.id, preso.id],
      }),
    })
    const r = troca.relatorio ?? {}
    ok(si === 200, "a troca roda", JSON.stringify(troca).slice(0, 300))
    const novo = (await adm(`/admin/products?handle=${HANDLE_NOVO}&fields=id`)).corpo.products?.[0]
    if (novo) limpar.push(() => adm(`/admin/products/${novo.id}`, { method: "DELETE" }))
    const tem = (lista, handle) => (lista ?? []).some((x) => x.handle === handle)
    ok(
      tem(r.atualizados, oleo.handle) &&
        tem(r.criados, HANDLE_NOVO) &&
        tem(r.removidos, sai.handle) &&
        tem(r.rascunho, preso.handle),
      "o relatório: um substituído, um novo, um que saiu e um que virou rascunho",
      JSON.stringify(r).slice(0, 400)
    )

    const o = await produtoNoAdmin(
      oleo.id,
      "id,title,subtitle,handle,description,metadata,thumbnail,*images,*categories,*variants,*variants.prices"
    )
    ok(
      o?.title === `Óleo do Bling ${R}` && !o.subtitle && o.description === "Texto do Bling.",
      "no lugar: o nome e a descrição do Bling (em texto), sem o subtítulo",
      JSON.stringify({ titulo: o?.title, sub: o?.subtitle, descricao: o?.description })
    )
    ok(
      o?.handle === oleo.handle && o.categories?.some((c) => c.id === categoria?.id),
      "o mesmo produto, no mesmo endereço e na mesma categoria"
    )
    ok(
      !o?.metadata?.fb_pdp && !o?.metadata?.outra && o?.metadata?.fb_erp?.id === String(bOleo.id),
      "os textos da página saem; fica a marca de onde ele veio",
      JSON.stringify(o?.metadata)
    )
    const v = o?.variants?.[0]
    ok(
      v?.weight === 120 && v?.length === 12 && v?.width === 6 && v?.height === 15,
      "o peso e a caixa do Bling, na variação, em grama e centímetro",
      JSON.stringify({ peso: v?.weight, c: v?.length, l: v?.width, a: v?.height })
    )
    ok(
      v?.prices?.length === 1 && v.prices[0].amount === 59.9,
      "o preço é o do Bling",
      JSON.stringify(v?.prices)
    )
    ok(
      (await adm(`/admin/price-lists/${promo?.id}`)).status === 404,
      "o “de/por” sai, e a lista de promoção que ficou vazia também"
    )
    const fotos = [...(o?.images ?? [])].sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0))
    ok(
      fotos.length === 2 &&
        fotos.every((f) => !f.url.includes(`:${bling.porta}`)) &&
        o.thumbnail === fotos[0].url,
      "as duas fotos, copiadas pro armazenamento da loja (não o link do Bling, que vence)",
      JSON.stringify(fotos.map((f) => f.url))
    )
    ok(
      r.fotos?.falharam?.length === 1 && /não é imagem/.test(r.fotos.falharam[0]),
      "o link cadastrado que não é foto fica de fora, e o relatório diz qual",
      JSON.stringify(r.fotos)
    )

    const n = await produtoNoAdmin(
      novo?.id,
      "id,status,*categories,*options,*options.values,*variants,*variants.prices"
    )
    ok(n?.status === "draft" && !n.categories?.length, "o novo entra em rascunho, sem categoria")
    const porSku = Object.fromEntries((n?.variants ?? []).map((x) => [x.sku, x]))
    const v50 = porSku[`TIMP-NOVO-${R}-50`]
    const v100 = porSku[`TIMP-NOVO-${R}-100`]
    ok(
      v50?.prices?.[0]?.amount === 40 &&
        v100?.prices?.[0]?.amount === 60 &&
        v50?.weight === 100 &&
        v100?.weight === 180 &&
        v50?.length === 8,
      "com as variações do Bling: cada uma com o preço e o peso dela (ou os do produto)",
      JSON.stringify(
        (n?.variants ?? []).map((x) => [x.sku, x.prices?.[0]?.amount, x.weight, x.length])
      )
    )
    ok(
      n?.options?.[0]?.title === "Tamanho" &&
        (n.options[0].values ?? [])
          .map((x) => x.value)
          .sort()
          .join(",") === "100g,50g",
      "a opção sai do nome da variação (Tamanho:50g)",
      JSON.stringify(n?.options)
    )
    await adm(`/admin/products/${novo?.id}`, {
      method: "POST",
      body: JSON.stringify({ status: "published" }),
    })
    await adm("/admin/erp/estoque", { method: "POST" })
    ok(
      (await guardado(`TIMP-NOVO-${R}-50`)) === 4 && (await guardado(`TIMP-NOVO-${R}-100`)) === 6,
      "publicado, o estoque dele vem do Bling (nasce com o lugar no estoque)",
      `${await guardado(`TIMP-NOVO-${R}-50`)} / ${await guardado(`TIMP-NOVO-${R}-100`)}`
    )

    ok((await adm(`/admin/products/${sai.id}?fields=id`)).status === 404, "o que saiu foi apagado")
    const p = await produtoNoAdmin(preso.id, "id,status")
    ok(
      p?.status === "draft" && (await fabrica.noAdmin(pedidoPreso.id)).items?.length === 1,
      "o que tem Pix esperando vira rascunho, e o pedido continua de pé",
      JSON.stringify(p)
    )

    // Depois da primeira vez, a equipe refaz o subtítulo, os textos da página
    // e cria uma promoção; no Bling, o preço e o nome mudam.
    await adm(`/admin/products/${oleo.id}`, {
      method: "POST",
      body: JSON.stringify({
        subtitle: "Feito pela equipe",
        metadata: { fb_pdp: { conteudo: { promessa: { titulo: "de novo" } } } },
      }),
    })
    const { corpo: lp2 } = await adm("/admin/price-lists", {
      method: "POST",
      body: JSON.stringify({
        title: `Promo nova ${R}`,
        description: "conferir-erp",
        type: "sale",
        status: "active",
        prices: [{ variant_id: oleo.variants[0].id, amount: 49.9, currency_code: "brl" }],
      }),
    })
    const promoNova = lp2.price_list
    limpar.push(() => adm(`/admin/price-lists/${promoNova?.id}`, { method: "DELETE" }))
    const capaAntes = (await produtoNoAdmin(oleo.id, "thumbnail"))?.thumbnail
    bling.produto(`TIMP-OL-${R}`, 9, { nome: `Óleo do Bling ${R} v2`, preco: 64.9 })
    const servidas = bling.fotosServidas

    const { corpo: de2 } = await adm("/admin/erp/catalogo", {
      method: "POST",
      body: JSON.stringify({ importar: [String(bOleo.id), String(bNovo.id)], remover: [] }),
    })
    const r2 = de2.relatorio ?? {}
    ok(
      tem(r2.atualizados, oleo.handle) &&
        tem(r2.atualizados, HANDLE_NOVO) &&
        !r2.criados?.length &&
        r2.fotos?.copiadas === 0 &&
        bling.fotosServidas === servidas,
      "de novo: os dois achados pelo SKU, e nenhuma foto baixada (já vieram do Bling)",
      JSON.stringify({ ...r2, estoque: undefined }).slice(0, 400)
    )
    const o2 = await produtoNoAdmin(
      oleo.id,
      "title,subtitle,thumbnail,metadata,*variants,*variants.prices"
    )
    ok(
      o2?.title === `Óleo do Bling ${R} v2` && o2.variants?.[0]?.prices?.[0]?.amount === 64.9,
      "o nome e o preço acompanham o Bling",
      JSON.stringify({ t: o2?.title, p: o2?.variants?.[0]?.prices })
    )
    ok(
      o2?.subtitle === "Feito pela equipe" &&
        o2.metadata?.fb_pdp?.conteudo?.promessa?.titulo === "de novo" &&
        o2.thumbnail === capaAntes &&
        (await adm(`/admin/price-lists/${promoNova?.id}`)).status === 200,
      "o que a equipe fez depois da primeira vez fica: subtítulo, textos, fotos e a promoção nova",
      JSON.stringify({ sub: o2?.subtitle, meta: o2?.metadata, capa: o2?.thumbnail === capaAntes })
    )
    const repetido = (await adm(`/admin/products?handle=${HANDLE_NOVO}-2&fields=id`)).corpo
    ok(
      !repetido.products?.length &&
        (await produtoNoAdmin(novo?.id, "status"))?.status === "published",
      "sem produto repetido, e a situação que a pessoa escolheu (publicado) fica"
    )

    /* ── 10. os endereços e as fotos da Nuvemshop ─────────────────────────── */

    titulo("Os endereços e as fotos vêm da Nuvemshop")
    const temCabelo = (cats.product_categories ?? []).find((c) => c.handle === "cabelo")
    const n3 = await produtoNoSite({
      nome: `Terceiro ${R}`,
      handle: `teste-n3-${R}`,
      sku: `TIMP-N3-${R}`,
      preco: 20,
    })
    const N1 = nuvem.produto({
      slug: `teste-nv-oleo-${R}`,
      nome: `Óleo na Nuvemshop ${R}`,
      skus: [`TIMP-OL-${R}`],
      fotos: 3,
      categoria: { nome: "Produtos para a Barba", slug: "produtos-para-a-barba" },
    })
    const N2 = nuvem.produto({
      slug: `teste-nv-pomada-${R}`,
      nome: `Pomada na Nuvemshop ${R}`,
      skus: [`TIMP-NOVO-${R}-50`, `TIMP-NOVO-${R}-100`],
      fotos: 2,
      categoria: { nome: "Para o Cabelo", slug: "para-o-cabelo" },
    })
    // O endereço de lá está com o rascunho que saiu do site (o que tinha Pix esperando).
    const N3 = nuvem.produto({
      slug: preso.handle,
      nome: `Terceiro na Nuvemshop ${R}`,
      skus: [`TIMP-N3-${R}`],
    })
    const N4 = nuvem.produto({ slug: `teste-nv-fora-${R}`, nome: "Fora", skus: [`TIMP-FORA-${R}`] })

    const { status: snp, corpo: pn } = await adm("/admin/nuvemshop")
    const item = (x) => pn.itens?.find((i) => i.nuvem.slug === x.slug)
    ok(
      snp === 200 && pn.loja === nuvem.url,
      "a prévia lê a loja da Nuvemshop (a falsa: NUVEMSHOP_LOJA_URL no Medusa)",
      `${snp} ${pn.loja ?? JSON.stringify(pn).slice(0, 160)}`
    )
    ok(
      item(N1)?.produto?.id === oleo.id &&
        item(N1).endereco?.de === oleo.handle &&
        item(N1).endereco?.para === N1.slug &&
        item(N1).trocaFotos &&
        item(N1).nuvem.fotos.length === 3 &&
        !item(N1).categoria,
      "casa pelo SKU: o endereço vira o de lá, as fotos também; a categoria de hoje fica",
      JSON.stringify(item(N1))
    )
    ok(
      item(N2)?.produto?.id === novo?.id &&
        item(N2).endereco?.para === N2.slug &&
        (temCabelo ? item(N2).categoria?.handle === "cabelo" : !item(N2).categoria),
      "o produto com variações casa por qualquer SKU; o que está sem categoria ganha a de lá",
      JSON.stringify(item(N2))
    )
    ok(
      item(N3)?.produto?.id === n3.id &&
        item(N3).ocupante?.id === preso.id &&
        item(N3).ocupante?.novoHandle === `${preso.handle}-antigo`,
      "o rascunho que está com o endereço de lá sai do caminho (vira -antigo)",
      JSON.stringify(item(N3))
    )
    ok(
      /nenhum produto do site/.test(item(N4)?.bloqueio ?? ""),
      "código que o site não tem: não dá, e diz por quê",
      JSON.stringify(item(N4))
    )
    ok((await produtoNoAdmin(oleo.id, "handle"))?.handle === oleo.handle, "a prévia não muda nada")

    const fotosAntes = nuvem.fotosServidas
    const { status: stn, corpo: tn } = await adm("/admin/nuvemshop", {
      method: "POST",
      body: JSON.stringify({ slugs: [N1.slug, N2.slug, N3.slug] }),
    })
    const rn = tn.relatorio ?? {}
    ok(
      stn === 200 &&
        rn.enderecos?.length === 3 &&
        rn.afastados?.some((a) => a.de === preso.handle) &&
        rn.fotos?.copiadas === 7 &&
        nuvem.fotosServidas === fotosAntes + 7,
      "a troca: três endereços, um rascunho fora do caminho, sete fotos copiadas",
      JSON.stringify(tn).slice(0, 400)
    )
    const on = await produtoNoAdmin(oleo.id, "handle,thumbnail,metadata,*images,*categories")
    const fotosN = [...(on?.images ?? [])].sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0))
    ok(
      on?.handle === N1.slug &&
        fotosN.length === 3 &&
        fotosN.every((f) => !f.url.includes(`:${nuvem.porta}`)) &&
        on.thumbnail === fotosN[0].url &&
        on.metadata?.fb_fotos?.origem === "nuvemshop" &&
        on.metadata?.fb_erp?.id === String(bOleo.id) &&
        on.categories?.some((c) => c.id === categoria?.id),
      "o óleo: endereço e fotos da Nuvemshop (copiadas pra loja), e o resto como estava",
      JSON.stringify({ h: on?.handle, n: fotosN.length, meta: on?.metadata })
    )
    const pn2 = await produtoNoAdmin(novo?.id, "handle,*categories")
    ok(
      pn2?.handle === N2.slug &&
        (temCabelo ? pn2.categories?.some((c) => c.handle === "cabelo") : true),
      "a pomada: o endereço de lá e a categoria que faltava",
      JSON.stringify(pn2)
    )
    ok(
      (await produtoNoAdmin(n3.id, "handle"))?.handle === preso.handle &&
        (await produtoNoAdmin(preso.id, "handle"))?.handle === `${preso.handle}-antigo`,
      "o terceiro ficou com o endereço, e o rascunho antigo com -antigo"
    )

    const { corpo: pn3 } = await adm("/admin/nuvemshop")
    const item3 = (x) => pn3.itens?.find((i) => i.nuvem.slug === x.slug)
    ok(
      [N1, N2, N3].every((x) => item3(x)?.pronto) && nuvem.fotosServidas === fotosAntes + 7,
      "de novo: os três aparecem prontos, e nenhuma foto é baixada outra vez",
      JSON.stringify([N1, N2, N3].map((x) => item3(x)?.pronto))
    )

    const servidas2 = bling.fotosServidas
    await adm("/admin/erp/catalogo", {
      method: "POST",
      body: JSON.stringify({ importar: [String(bOleo.id)], remover: [] }),
    })
    const depois = await produtoNoAdmin(oleo.id, "handle,thumbnail,*images")
    ok(
      depois?.handle === N1.slug &&
        depois.thumbnail === on?.thumbnail &&
        depois.images?.length === 3 &&
        bling.fotosServidas === servidas2,
      "e a importação do Bling, rodada depois, não troca o endereço nem as fotos da Nuvemshop",
      JSON.stringify({ h: depois?.handle, n: depois?.images?.length })
    )
  }

  /* ── 11. a conexão cai ────────────────────────────────────────────────────── */

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
  for (const desfazer of limpar.reverse()) await Promise.resolve(desfazer()).catch(() => {})
  await devolverEstoque()
}

/* ── fim ──────────────────────────────────────────────────────────────────── */

bling.fechar()
nuvem.fechar()
await resend.fechar()
await frenet.fechar?.()
await pagarme.fechar?.()
console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
