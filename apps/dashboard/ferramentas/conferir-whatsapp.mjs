/**
 * CONFERIDOR DO WHATSAPP NO PAINEL (0234) — as conversas do número da loja:
 * a lista, o número amarelo no menu, o e-mail da equipe, a conversa aberta,
 * responder como equipe, devolver pro atendente, a janela de 24 horas, os
 * ajustes (liga/desliga e regras) e o "Testar o atendente".
 *
 *   (Medusa local apontando pro WhatsApp e a IA de mentira; painel no ar)
 *   node apps/dashboard/ferramentas/conferir-whatsapp.mjs
 *
 * Variáveis: as de `pecas.mjs`, e mais DATABASE_URL (o banco do Medusa) e
 * WHATSAPP_APP_SEGREDO (padrão `segredo-de-teste`). O backend sobe com as
 * variáveis de `loja/ferramentas/whatsapp-falso.mjs` (a Meta e a IA na
 * 4380) e com o RESEND_URL na porta do PORTA_RESEND. As conversas nascem
 * como na vida real: o aviso da Meta, assinado, no `/hooks/whatsapp`.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • a conversa que não aparece, ou a da equipe sem o número no menu, sem │
 * │   o "esperando" ou sem o e-mail pra operação e pro dono;               │
 * │ • a resposta da equipe que não sai pela Meta, não fica na conversa com │
 * │   o nome de quem mandou, ou deixa a conversa "esperando";              │
 * │ • devolver que não devolve; responder fora da janela de 24 horas;      │
 * │ • o liga/desliga e as regras que não gravam; o teste que manda algo    │
 * │   pelo WhatsApp, cria conversa ou ignora as regras ainda não salvas;   │
 * │ • o marketing abrindo a área; rolagem de lado no celular; console.     │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * No fim, as conversas da rodada saem do banco, os ajustes voltam a ser os
 * de antes e a equipe da rodada sai.
 */

import { createHmac } from "node:crypto"
import pg from "pg"
import { subirWhatsappFalso } from "../../loja/ferramentas/whatsapp-falso.mjs"
import {
  abrirNavegador,
  avisoDoClique,
  caixaDoResend,
  DONO,
  entrar,
  esperar,
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
if (!process.env.DATABASE_URL) {
  console.log("  ⚠  falta DATABASE_URL (o banco do Medusa)")
  process.exit(1)
}
const SEGREDO_DA_META = process.env.WHATSAPP_APP_SEGREDO ?? "segredo-de-teste"
const semEspaco = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()

/** Um número por cenário, que nenhuma outra rodada usa: 55 + DDD 99 + 9 + rodada + cenário. */
const FIM = String(Date.now()).slice(-6)
const numero = (cenario) => `55999${FIM}${String(cenario).padStart(2, "0")}`
let contador = 0

/** O aviso da Meta com uma mensagem de texto, assinado como a Meta assina. */
async function chegou(telefone, nome, texto, em = new Date()) {
  const corpo = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "200000000000002",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "5500000000000",
                phone_number_id: "100000000000001",
              },
              contacts: [{ profile: { name: nome }, wa_id: telefone }],
              messages: [
                {
                  from: telefone,
                  id: `wamid.PAINEL${FIM}${++contador}`,
                  timestamp: String(Math.floor(em.getTime() / 1000)),
                  type: "text",
                  text: { body: texto },
                },
              ],
            },
          },
        ],
      },
    ],
  })
  const r = await fetch(`${MEDUSA}/hooks/whatsapp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${createHmac("sha256", SEGREDO_DA_META).update(corpo).digest("hex")}`,
    },
    body: corpo,
  })
  return r.status
}

const banco = new pg.Client({ connectionString: process.env.DATABASE_URL })
await banco.connect()
const conversaDoBanco = async (telefone) =>
  (
    await banco.query(
      "select * from whatsapp_conversa where telefone = $1 and deleted_at is null",
      [telefone]
    )
  ).rows[0] ?? null
const mensagensDoBanco = async (telefone) =>
  (
    await banco.query(
      `select m.* from whatsapp_mensagem m join whatsapp_conversa c on c.id = m.conversa_id
        where c.telefone = $1 and m.deleted_at is null order by m.em, m.created_at`,
      [telefone]
    )
  ).rows

/** Espera `ler()` dar algo que `ate` aceite, até `segundos`. */
async function aguardar(ler, ate, segundos) {
  const fim = Date.now() + segundos * 1000
  let v
  while (Date.now() < fim) {
    v = await ler()
    if (ate(v)) return v
    await esperar(2000)
  }
  return v
}

const resend = await subirResend()
const caixa = caixaDoResend(resend)
const falso = await subirWhatsappFalso()
const { navegador, novaAba, errosDeConsole } = await abrirNavegador()

const RAFAEL = numero(1) // pergunta do produto: o atendente responde
const BRUNO = numero(2) // pede uma pessoa: vai pra equipe
const CAIO = numero(3) // escreveu há 30 horas: a janela fechou
const telefones = [RAFAEL, BRUNO, CAIO]
const NOME_R = `Rafael Teste ${RODADA}`
const NOME_B = `Bruno Teste ${RODADA}`
const NOME_C = `Caio Teste ${RODADA}`
const OPE = `ope.${RODADA}@painel.teste`
const MKT = `mkt.${RODADA}@painel.teste`

let tokenDoDono = ""
let ajustesAntes = null

const tela = async (token, q = "") =>
  medusa(`/dashboard/whatsapp${q}`, { metodo: "GET", token }).then((r) => r.corpo)
const linhaDe = (t, id) => (t?.conversas ?? []).find((c) => c.id === id)
const avisosDe = async (token) =>
  (await medusa("/dashboard/eu", { metodo: "GET", token })).corpo.avisos ?? {}

try {
  titulo("Quem entra")
  const dono = await novaAba()
  const cookieDono = await entrar(dono, DONO, caixa)
  if (!cookieDono) throw new Error("o dono não entrou (o código não chegou no Resend falso?)")
  tokenDoDono = cookieDono.value
  const nomeDoDono = (await medusa("/dashboard/eu", { metodo: "GET", token: tokenDoDono })).corpo
    .membro?.nome
  await medusa("/dashboard/equipe", {
    token: tokenDoDono,
    corpo: { nome: "Operação Teste", email: OPE, papel: "operacao" },
  })
  await medusa("/dashboard/equipe", {
    token: tokenDoDono,
    corpo: { nome: "Marketing Teste", email: MKT, papel: "marketing" },
  })
  const ope = await novaAba()
  const cookieOpe = await entrar(ope, OPE, caixa)
  const mkt = await novaAba()
  const cookieMkt = await entrar(mkt, MKT, caixa)
  ok(Boolean(nomeDoDono && cookieOpe && cookieMkt), "o dono, a operação e o marketing entram")
  ajustesAntes = (
    await medusa("/dashboard/whatsapp/ajustes", { metodo: "GET", token: tokenDoDono })
  ).corpo
  if (!ajustesAntes.ligado)
    await medusa("/dashboard/whatsapp/ajustes", { token: tokenDoDono, corpo: { ligado: true } })

  titulo("Três conversas chegam pela Meta (o atendente responde de minuto em minuto: até ~90 s)")
  const emailsAntes = {
    dono: caixa.quantos(DONO, (e) => /^WhatsApp: /.test(e.subject ?? "")),
    ope: caixa.quantos(OPE, (e) => /^WhatsApp: /.test(e.subject ?? "")),
  }
  const enviadasAntes = falso.enviadas.length
  const chegaram = [
    await chegou(RAFAEL, NOME_R, "oi, quanto tá o fator?"),
    await chegou(BRUNO, NOME_B, "quero falar com um humano, chegou vazando"),
    await chegou(CAIO, NOME_C, "oi", new Date(Date.now() - 30 * 3600_000)),
  ]
  ok(
    chegaram.every((s) => s === 200),
    "o webhook aceita as três",
    chegaram.join(" ")
  )
  const doBot = (tel) => async () =>
    (await mensagensDoBanco(tel)).filter((m) => m.autor === "bot").length
  await aguardar(
    async () => [await doBot(RAFAEL)(), (await conversaDoBanco(BRUNO))?.situacao],
    ([r, b]) => r >= 1 && b === "equipe",
    150
  )
  const cR = await conversaDoBanco(RAFAEL)
  const cB = await conversaDoBanco(BRUNO)
  const cC = await conversaDoBanco(CAIO)
  ok((await doBot(RAFAEL)()) >= 1, "o atendente respondeu o Rafael")
  ok(
    cB?.situacao === "equipe" && /pessoa/.test(cB?.equipe_motivo ?? ""),
    "o Bruno foi pra equipe, com o motivo",
    JSON.stringify({ situacao: cB?.situacao, motivo: cB?.equipe_motivo })
  )

  titulo("O e-mail da equipe (operação e dono)")
  const doWhats = (e) => e.subject === `WhatsApp: Bruno precisa de alguém da equipe`
  const pDono = await caixa.esperarEmail(DONO, doWhats, emailsAntes.dono, 15000)
  const pOpe = await caixa.esperarEmail(OPE, doWhats, emailsAntes.ope, 15000)
  ok(Boolean(pDono && pOpe), "chegou pro dono e pra operação", `${!!pDono} ${!!pOpe}`)
  ok(
    (pOpe?.html ?? "").includes(`/whatsapp/${cB?.id}`) &&
      (pOpe?.text ?? "").includes("chegou vazando"),
    "com o link da conversa e a última mensagem dele"
  )
  ok(caixa.quantos(MKT, doWhats) === 0, "o marketing não recebe (não é da área)")

  titulo("A tela (API)")
  const t0 = await tela(tokenDoDono)
  const lR = linhaDe(t0, cR?.id)
  const lB = linhaDe(t0, cB?.id)
  ok(Boolean(lR && lB && linhaDe(t0, cC?.id)), "as três na lista")
  ok(
    lB?.esperando === true && lB?.situacao === "equipe" && lR?.esperando === false,
    "o Bruno esperando a equipe; o Rafael não",
    JSON.stringify({ b: lB?.esperando, r: lR?.esperando })
  )
  ok(
    t0.numeros?.esperando >= 1 && t0.contagem?.equipe >= 1 && t0.numeros?.respostasHoje >= 1,
    "os números de cima: esperando, com a equipe, respostas de hoje",
    JSON.stringify({ numeros: t0.numeros, contagem: t0.contagem })
  )
  ok(/^US\$ /.test(t0.numeros?.custoHoje ?? ""), "o custo de hoje, em dólar", t0.numeros?.custoHoje)
  const soEquipe = await tela(tokenDoDono, "?filtro=equipe")
  ok(
    Boolean(linhaDe(soEquipe, cB?.id)) && !linhaDe(soEquipe, cR?.id),
    "a fita Com a equipe tem só as da equipe"
  )
  const busca = await tela(tokenDoDono, `?busca=${encodeURIComponent(NOME_R)}`)
  ok(
    busca.conversas?.length === 1 && busca.conversas[0].id === cR?.id,
    "a busca pelo nome acha só ele",
    String(busca.conversas?.length)
  )
  const porNumero = await tela(tokenDoDono, `?busca=${BRUNO.slice(-8)}`)
  ok(Boolean(linhaDe(porNumero, cB?.id)), "e pelo número também")
  const avDono = await avisosDe(tokenDoDono)
  const avOpe = await avisosDe(cookieOpe.value)
  const avMkt = await avisosDe(cookieMkt.value)
  ok(
    avDono.whatsapp >= 1 && avOpe.whatsapp >= 1 && avMkt.whatsapp === undefined,
    "o número do menu: dono e operação veem; o marketing não",
    JSON.stringify({ dono: avDono.whatsapp, ope: avOpe.whatsapp, mkt: avMkt.whatsapp })
  )
  const tMkt = await medusa("/dashboard/whatsapp", { metodo: "GET", token: cookieMkt.value })
  const cMkt = await medusa(`/dashboard/whatsapp/conversas/${cB?.id}`, {
    metodo: "GET",
    token: cookieMkt.value,
  })
  ok(
    tMkt.status === 403 && cMkt.status === 403,
    "o marketing não abre (403)",
    `${tMkt.status} ${cMkt.status}`
  )
  const fora = await medusa(`/dashboard/whatsapp/conversas/${cC?.id}`, {
    token: tokenDoDono,
    corpo: { acao: "responder", texto: "oi" },
  })
  ok(
    fora.status === 409 && fora.corpo.message === "janela",
    "fora da janela de 24 horas a API recusa (409)",
    `${fora.status} ${fora.corpo.message}`
  )

  titulo("A tela do dono")
  const { pagina } = dono
  await pagina.goto(`${PAINEL}/whatsapp`)
  await pagina.waitForSelector("[data-tela] h1")
  const doMenu = await menu(pagina)
  ok(doMenu.includes("WhatsApp"), "o menu tem WhatsApp", doMenu.join(", "))
  const num = pagina.locator('.lateral .nav a[href="/whatsapp"] .nav__num')
  ok(
    Number(await num.textContent().catch(() => 0)) >= 1 &&
      (await num.getAttribute("data-grave")) === null,
    "com o número amarelo (não é o vermelho dos problemas)"
  )
  const linhaB = pagina.locator(`[data-conversa="${cB?.id}"]`)
  await linhaB.waitFor()
  ok(
    (await linhaB.getAttribute("data-esperando")) !== null &&
      /Equipe · .*pessoa/.test(semEspaco(await linhaB.textContent())),
    "a linha do Bruno: esperando, com o selo da equipe e o motivo",
    semEspaco(await linhaB.textContent())
  )
  await hidratado(pagina, `[data-conversa="${cB?.id}"]`)
  await linhaB.click()
  await pagina.waitForURL(new RegExp(`/whatsapp/${cB?.id}`))
  const aberta = pagina.locator(`[data-conversa-aberta="${cB?.id}"]`)
  await aberta.waitFor()
  ok((await aberta.locator("[data-com-a-equipe]").count()) === 1, "a faixa Com a equipe")
  const doAtendente = semEspaco(
    await aberta.locator('[data-mensagens] .wa-msg[data-autor="bot"]').last().textContent()
  )
  ok(/Chamou a equipe/.test(doAtendente), "a resposta do atendente diz o que ele fez", doAtendente)
  const tel = semEspaco(await aberta.locator(".wa__tel").textContent())
  ok(
    tel.startsWith(`+55 (99) 9${FIM.slice(0, 4)}-${FIM.slice(4)}`),
    "o telefone inteiro, pra quem abre os contatos",
    tel
  )
  ok(
    /Ainda não comprou/.test(semEspaco(await pagina.locator("[data-quem]").textContent())),
    "quem escreve: ainda não comprou"
  )

  titulo("Responder como equipe")
  await hidratado(pagina, "[data-responder] textarea")
  const RESPOSTA = `Oi Bruno, aqui é da loja (${RODADA}). Me manda uma foto?`
  await pagina.fill("[data-responder] textarea", RESPOSTA)
  const enviou = await avisoDoClique(pagina, () =>
    pagina.click('[data-responder] button[type="submit"]')
  )
  ok(/Enviada pelo WhatsApp/.test(enviou), "o aviso", enviou)
  const saiu = falso.enviadas.find((m) => m.para === BRUNO && m.texto === RESPOSTA)
  ok(Boolean(saiu), "saiu pela Meta, pro número dele")
  const daEquipe = (await mensagensDoBanco(BRUNO)).find((m) => m.texto === RESPOSTA)
  ok(
    daEquipe?.autor === "equipe" &&
      daEquipe?.wamid === saiu?.wamid &&
      daEquipe?.dados?.nome === nomeDoDono?.split(" ")[0],
    "na conversa como da equipe, com o primeiro nome de quem mandou",
    JSON.stringify({ autor: daEquipe?.autor, dados: daEquipe?.dados })
  )
  await pagina
    .locator('[data-mensagens] .wa-msg[data-autor="equipe"]', { hasText: RODADA })
    .waitFor({ timeout: 20000 })
  ok(
    semEspaco(
      await pagina.locator('[data-mensagens] .wa-msg[data-autor="equipe"]').last().textContent()
    ).startsWith(`Equipe · ${nomeDoDono?.split(" ")[0]}`),
    "na tela, com quem mandou"
  )
  ok(
    (await pagina.locator("[data-responder] textarea").inputValue()) === "",
    "o campo fica vazio pra próxima"
  )
  const t1 = await tela(tokenDoDono)
  ok(
    linhaDe(t1, cB?.id)?.esperando === false && linhaDe(t1, cB?.id)?.situacao === "equipe",
    "a equipe respondeu: não está mais esperando (e continua com a equipe)"
  )
  ok(
    ((await avisosDe(tokenDoDono)).whatsapp ?? 0) === (avDono.whatsapp ?? 0) - 1,
    "o número do menu desce um"
  )

  titulo("Devolver pro atendente")
  await hidratado(pagina, "[data-devolver]")
  const devolveu = await avisoDoClique(pagina, () => pagina.click("[data-devolver]"))
  ok(/Devolvida/.test(devolveu), "o aviso", devolveu)
  const depois = await conversaDoBanco(BRUNO)
  ok(
    depois?.situacao === "bot" && depois?.pendente_desde === null,
    "volta pro atendente; a última foi da equipe, então ele não responde nada",
    JSON.stringify({ situacao: depois?.situacao, pendente: depois?.pendente_desde })
  )
  await pagina.locator("[data-com-a-equipe]").waitFor({ state: "detached", timeout: 20000 })
  ok(true, "a faixa Com a equipe sai")

  titulo("A janela fechada")
  await pagina.goto(`${PAINEL}/whatsapp/${cC?.id}`)
  await pagina.locator(`[data-conversa-aberta="${cC?.id}"]`).waitFor()
  ok(
    (await pagina.locator("[data-janela-fechada]").count()) === 1 &&
      (await pagina.locator("[data-responder]").count()) === 0,
    "passou de 24 horas: sem o campo de responder, com o porquê"
  )

  titulo("A operação abre; o marketing não")
  await ope.pagina.goto(`${PAINEL}/whatsapp/${cR?.id}`)
  await ope.pagina.locator(`[data-conversa-aberta="${cR?.id}"]`).waitFor()
  ok(
    (await ope.pagina.locator("[data-responder]").count()) === 1,
    "a operação abre a conversa e pode responder"
  )
  await mkt.pagina.goto(`${PAINEL}/`)
  await mkt.pagina.waitForSelector("[data-tela] h1")
  ok(!(await menu(mkt.pagina)).includes("WhatsApp"), "o menu do marketing não tem WhatsApp")
  await mkt.pagina.goto(`${PAINEL}/whatsapp`)
  await mkt.pagina.waitForSelector("[data-tela], main")
  ok(
    (await mkt.pagina.locator("[data-lista-whatsapp]").count()) === 0,
    "e o endereço direto não mostra as conversas"
  )

  titulo("Ajustes: desligar, ligar, as regras")
  await pagina.goto(`${PAINEL}/whatsapp/ajustes`)
  await hidratado(pagina, "[data-chave]")
  const desligou = await avisoDoClique(pagina, () => pagina.click("[data-chave]"))
  ok(/Atendente desligado/.test(desligou), "desligar avisa", desligou)
  ok(
    (await medusa("/dashboard/whatsapp/ajustes", { metodo: "GET", token: tokenDoDono })).corpo
      .ligado === false,
    "e grava"
  )
  await pagina.locator('[data-chave][aria-pressed="false"]').waitFor()
  const ligou = await avisoDoClique(pagina, () => pagina.click("[data-chave]"))
  ok(/Atendente ligado/.test(ligou), "ligar de novo avisa", ligou)
  const REGRA = `Nunca chame de mano (${RODADA}).`
  await pagina.fill("#wa-regras", REGRA)
  const salvou = await avisoDoClique(pagina, () => pagina.click("[data-salvar-regras]"))
  ok(/Regras salvas/.test(salvou), "salvar as regras avisa", salvou)
  ok(
    (await medusa("/dashboard/whatsapp/ajustes", { metodo: "GET", token: tokenDoDono })).corpo
      .regras === REGRA,
    "e grava"
  )
  const grande = await medusa("/dashboard/whatsapp/ajustes", {
    token: tokenDoDono,
    corpo: { regras: "x".repeat(ajustesAntes.limite + 1) },
  })
  ok(grande.status === 422, "regras grandes demais: 422", String(grande.status))

  titulo("Testar o atendente")
  const NAO_SALVA = `Regra ainda não salva ${RODADA}.`
  await pagina.fill("#wa-regras", `${REGRA}\n${NAO_SALVA}`)
  const enviadasAntesDoTeste = falso.enviadas.length
  const conversasAntes = (await banco.query("select count(*)::int as n from whatsapp_conversa"))
    .rows[0].n
  const PERGUNTA = `tem frete grátis? ${RODADA}`
  await pagina.fill("[data-teste-mensagem]", PERGUNTA)
  await pagina.click('.wa-teste__compor button[type="submit"]')
  const resposta = pagina.locator("[data-teste-resposta]").last()
  await resposta.waitFor({ timeout: 60000 })
  ok(
    /Recebi: tem frete grátis/.test(semEspaco(await resposta.textContent())),
    "o atendente responde na tela",
    semEspaco(await resposta.textContent())
  )
  const meta = semEspaco(await pagina.locator("[data-teste-meta]").last().textContent())
  ok(/US\$ /.test(meta) && /sabia: não é cliente/.test(meta), "com o custo e o que ele sabia", meta)
  const pedido = falso.pedidosAIa.find((p) => JSON.stringify(p.corpo.messages).includes(PERGUNTA))
  const sistema = (pedido?.corpo.system ?? []).map((b) => b.text).join("\n")
  ok(sistema.includes(NAO_SALVA), "usou as regras do campo, mesmo sem salvar")
  ok(
    falso.enviadas.length === enviadasAntesDoTeste &&
      (await banco.query("select count(*)::int as n from whatsapp_conversa")).rows[0].n ===
        conversasAntes,
    "nada saiu pelo WhatsApp, e nenhuma conversa nasceu"
  )
  ok(falso.enviadas.length > enviadasAntes, "(as respostas de verdade, lá em cima, saíram)")

  titulo("O celular")
  const cel = await novaAba({ width: 390, height: 844 })
  await cel.contexto.addCookies(await dono.contexto.cookies())
  await cel.pagina.goto(`${PAINEL}/whatsapp`)
  await cel.pagina.locator(`[data-conversa="${cR?.id}"]`).waitFor()
  ok(await semRolagemDeLado(cel.pagina), "a lista, sem rolagem de lado")
  await cel.pagina.goto(`${PAINEL}/whatsapp/${cR?.id}`)
  await cel.pagina.locator(`[data-conversa-aberta="${cR?.id}"]`).waitFor()
  ok(await semRolagemDeLado(cel.pagina), "a conversa, sem rolagem de lado")
  ok(
    !(await cel.pagina.locator("[data-lista-whatsapp]").isVisible()),
    "com a conversa aberta, só ela (a seta volta)"
  )
  await cel.pagina.goto(`${PAINEL}/whatsapp/ajustes`)
  await cel.pagina.locator("[data-teste]").waitFor()
  ok(await semRolagemDeLado(cel.pagina), "os ajustes, sem rolagem de lado")

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.join(" | "))
} catch (err) {
  falhou(`o conferidor quebrou: ${err instanceof Error ? err.stack : err}`)
} finally {
  // As conversas da rodada saem do banco, os ajustes voltam e a equipe da rodada sai.
  for (const tel of telefones) {
    await banco
      .query(
        `delete from whatsapp_mensagem where conversa_id in
           (select id from whatsapp_conversa where telefone = $1)`,
        [tel]
      )
      .catch(() => {})
    await banco.query("delete from whatsapp_conversa where telefone = $1", [tel]).catch(() => {})
  }
  if (tokenDoDono) {
    if (ajustesAntes)
      await medusa("/dashboard/whatsapp/ajustes", {
        token: tokenDoDono,
        corpo: { ligado: ajustesAntes.ligado, regras: ajustesAntes.regras ?? "" },
      })
    const r = await medusa("/dashboard/equipe", { metodo: "GET", token: tokenDoDono })
    for (const m of r.corpo.membros ?? [])
      if (m.email.includes(RODADA))
        await medusa(`/dashboard/equipe/${m.id}`, {
          token: tokenDoDono,
          corpo: { acao: "remover" },
        })
  }
  await banco.end()
  await navegador.close()
  await resend.fechar()
  await falso.fechar()
}

process.exit(resumo())
