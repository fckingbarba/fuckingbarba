/**
 * CONFERIDOR DA FRENET NO PAINEL — o pedido que a Frenet recusou: o motivo
 * dela na faixa do pedido (nunca "sem motivo" quando ela disse alguma coisa)
 * e o botão "Mandar pra Frenet de novo", que manda e diz no que deu.
 *
 *   (Medusa local com o registro na Frenet LIGADO e sem o Bling: ver abaixo)
 *   node apps/dashboard/ferramentas/conferir-frenet.mjs
 *
 * O Medusa sobe com FRENET_PARCEIRO_TOKEN=parceiro-de-teste,
 * FRENET_WHITELABEL_URL apontando pra Frenet falsa (a de PORTA_FALSA) e
 * MEDUSA_BACKEND_URL — como na seção 7c do `conferir-envio` da loja —, e sem
 * as variáveis do Bling (com o ERP ligado, o pedido espera a nota antes de ir
 * pra Frenet, e aqui não há Bling pra emitir). Este conferidor precisa do
 * mesmo FRENET_PARCEIRO_TOKEN no ambiente dele.
 *
 * Variáveis: as de `pecas.mjs`, e mais NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 * ADMIN_EMAIL, ADMIN_SENHA, FRENET_PARCEIRO_TOKEN, PORTA_FALSA e
 * PORTA_PAGARME_FALSO.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o #19 de 25/09: o 400 da validação da Frenet virando "sem motivo na  │
 * │   resposta" (a faixa tem que dizer o campo);                           │
 * │ • o volume em lista (a Frenet recusa: é um objeto);                    │
 * │ • o pedido recusado sem jeito de mandar de novo pelo painel;           │
 * │ • o botão mandando pedido que não é pra mandar (já entrou, cancelado); │
 * │ • o clique sem ficar no histórico, com o nome de quem apertou.         │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { subirFrenetFalsa } from "../../loja/ferramentas/frenet-falsa.mjs"
import { subirPagarmeFalso } from "../../loja/ferramentas/pagarme-falso.mjs"
import { fabricaDePedidos } from "../../loja/ferramentas/pedido-de-teste.mjs"
import {
  abrirNavegador,
  caixaDoResend,
  DONO,
  entrar as entrarPelaTela,
  esperar,
  exigirAmbiente,
  falhou,
  medusa,
  MEDUSA,
  ok,
  PAINEL,
  resumo,
  subirResend,
  titulo,
} from "./pecas.mjs"

exigirAmbiente()
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
if (!CHAVE || !process.env.ADMIN_EMAIL || !process.env.ADMIN_SENHA) {
  console.log("  ⚠  faltam NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY, ADMIN_EMAIL e ADMIN_SENHA")
  process.exit(1)
}
if (!process.env.FRENET_PARCEIRO_TOKEN) {
  console.log(
    "  ⚠  falta FRENET_PARCEIRO_TOKEN: o Medusa e este conferidor precisam do registro ligado"
  )
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
const novoEmail = () => `frenet.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@fb.invalid`

/** O registro no pedido (`metadata.fb_parceiro`), quando ele satisfizer `cond`. */
async function registroQuando(pedido, cond, ms = 15000) {
  let r = null
  for (const fim = Date.now() + ms; Date.now() < fim; await esperar(250)) {
    r = (await fabrica.noAdmin(pedido.id)).metadata?.fb_parceiro ?? null
    if (r && cond(r)) break
  }
  return r
}

/** Aperta o botão e devolve a frase do aviso novo, deste clique. */
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

const BOTAO = '.faixa button[data-acao="frenet"]'
const faixaDaFrenet = (pagina) =>
  pagina.locator(".faixa", {
    has: pagina.locator(".faixa__titulo", { hasText: "A Frenet recusou" }),
  })

try {
  titulo("Quem entra")
  const dono = await novaAba()
  const cookieDono = await entrarPelaTela(dono, DONO, caixa)
  if (!cookieDono) throw new Error("o dono não entrou (o código não chegou no Resend falso?)")
  const tokenDoDono = cookieDono.value
  const nomeDoDono = (await medusa("/dashboard/eu", { metodo: "GET", token: tokenDoDono })).corpo
    .membro?.nome
  ok(Boolean(nomeDoDono), "o dono entra")

  titulo("A Frenet recusa com o 400 da validação (o #19)")
  frenet.roteiroDosPedidos = "validacao"
  const A = await fabrica.pedidoPix(novoEmail(), [["oleo-para-barba", 1]])
  await fabrica.pagar(A)
  const recusado = await registroQuando(A, (r) => r.definitivo)
  frenet.roteiroDosPedidos = "normal"
  ok(
    recusado?.definitivo === true &&
      /One or more validation errors occurred\. — \$\[0\]\.Order\.To\.Address\.ZipCode: The ZipCode field is required\./.test(
        recusado.erro ?? ""
      ),
    "o motivo é o campo que a Frenet apontou — não “sem motivo na resposta”",
    JSON.stringify(recusado)
  )
  const { pagina } = dono
  await pagina.goto(`${PAINEL}/pedidos/${A.id}`)
  await pagina.waitForSelector(BOTAO)
  const faixa = semEspaco(await faixaDaFrenet(pagina).textContent())
  ok(
    faixa.includes("ZipCode") &&
      faixa.includes("mande de novo") &&
      semEspaco(await pagina.locator(BOTAO).textContent()) === "Mandar pra Frenet de novo",
    "a faixa do pedido diz o campo, e tem o botão “Mandar pra Frenet de novo”",
    faixa
  )

  titulo("Mandar de novo")
  const antes = frenet.pedidos.length
  const r1 = await apertar(pagina, BOTAO)
  const entrou = await registroQuando(A, (r) => r.entrou)
  const chegou = frenet.pedidos.slice(antes).find((p) => p.corpo?.Order?.Id === `FB-${A.numero}`)
  ok(
    !r1.erro &&
      r1.texto === `O #${A.numero} entrou no painel da Frenet. É só gerar a etiqueta lá.` &&
      entrou?.entrou === true &&
      entrou.tentativas === 2 &&
      Boolean(chegou),
    "corrigido o lado de lá: o botão manda, o aviso diz que entrou, e o pedido chega na Frenet",
    JSON.stringify({ aviso: r1.texto, entrou })
  )
  ok(
    chegou &&
      !Array.isArray(chegou.corpo.Volumes) &&
      chegou.corpo.Volumes?.OrderItemsId?.length === 1,
    "com o volume como a Frenet pede: um objeto, com a linha do pedido dentro",
    JSON.stringify(chegou?.corpo?.Volumes)
  )
  await pagina.goto(`${PAINEL}/pedidos/${A.id}`)
  await pagina.waitForSelector(".historico")
  const historico = (await pagina.locator(".historico li").allTextContents()).map(semEspaco)
  ok(
    (await faixaDaFrenet(pagina).count()) === 0 &&
      historico.some(
        (l) =>
          l.includes(`${nomeDoDono} mandou o pedido pra Frenet de novo`) &&
          l.includes("entrou no painel da Frenet")
      ),
    "a faixa sai, e o histórico guarda quem mandou e no que deu",
    historico.join(" | ")
  )
  const deNovo = await medusa(`/dashboard/pedidos/${A.id}/frenet`, { token: tokenDoDono })
  ok(
    deNovo.status === 409 &&
      frenet.pedidos.filter((p) => p.corpo?.Order?.Id === `FB-${A.numero}`).length === 1,
    "já no painel: a rota não manda de novo (409), e o pedido não aparece duas vezes lá",
    String(deNovo.status)
  )

  titulo("Recusado de novo")
  frenet.roteiroDosPedidos = "recusa"
  const B = await fabrica.pedidoPix(novoEmail(), [["oleo-para-barba", 1]])
  await fabrica.pagar(B)
  await registroQuando(B, (r) => r.definitivo)
  await pagina.goto(`${PAINEL}/pedidos/${B.id}`)
  await pagina.waitForSelector(BOTAO)
  const r2 = await apertar(pagina, BOTAO)
  frenet.roteiroDosPedidos = "normal"
  ok(
    r2.erro &&
      r2.texto ===
        "A Frenet recusou de novo: CEP de destino inválido. Faça a etiqueta à mão no painel da Frenet.",
    "a Frenet recusa de novo: o aviso diz o motivo, e o que fazer",
    r2.texto
  )

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.join(" | "))
} catch (e) {
  falhou(`o conferidor quebrou: ${e instanceof Error ? e.stack : e}`)
} finally {
  frenet.roteiroDosPedidos = "normal"
  await navegador.close()
  await resend.fechar()
  await pagarme.fechar?.()
  await frenet.fechar?.()
}

process.exit(resumo())
