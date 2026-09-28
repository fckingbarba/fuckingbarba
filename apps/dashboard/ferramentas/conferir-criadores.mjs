/**
 * CONFERIDOR DOS CRIADORES NO PAINEL — as inscrições da página escondida
 * /criadores da loja, pra aprovar ou recusar: as três fitas, os contatos e os
 * perfis na linha, o link da página pra copiar, o apagar de vez, e quem não
 * abre a área.
 *
 *   (Medusa local; painel no ar)
 *   node apps/dashboard/ferramentas/conferir-criadores.mjs
 *
 * Variáveis: as de `pecas.mjs`, e mais NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 * ADMIN_EMAIL e ADMIN_SENHA. As inscrições nascem como na loja
 * (`POST /store/criadores`, assinado com o IP da rodada).
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • a inscrição que não aparece nas novas, ou sem o WhatsApp, o e-mail,  │
 * │   os perfis, o vídeo ou o modelo;                                      │
 * │ • o WhatsApp que não abre a conversa com a mensagem pronta;            │
 * │ • aprovar sem sair da fita, sem o aviso ou sem o nome de quem aprovou; │
 * │ • apagar sem confirmação, ou a nova; a recusada que se inscreve de     │
 * │   novo e não volta pra fila;                                           │
 * │ • a operação abrindo a área (WhatsApp e e-mail de quem não é cliente); │
 * │ • rolagem de lado no celular; erro no console.                         │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * No fim, as inscrições da rodada saem do banco e a equipe da rodada sai.
 */

import {
  abrirNavegador,
  caixaDoResend,
  DONO,
  entrar as entrarPelaTela,
  exigirAmbiente,
  falhou,
  hidratado,
  IP,
  medusa,
  MEDUSA,
  menu,
  ok,
  PAINEL,
  resumo,
  RODADA,
  SEGREDO,
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

/** A inscrição como a loja manda: o servidor dela assina e passa o IP de quem está do outro lado. */
async function inscrever(corpo) {
  const r = await fetch(`${MEDUSA}/store/criadores`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": CHAVE,
      "x-loja-segredo": SEGREDO,
      "x-cliente-ip": IP,
    },
    body: JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}

/** As inscrições de um e-mail, direto do banco (pelo admin). */
const doBanco = async (email) =>
  (
    await medusa(`/admin/criadores?email=${encodeURIComponent(email)}`, {
      metodo: "GET",
      token: tokenAdmin,
      assinado: false,
    })
  ).corpo.inscricoes ?? []

/** A tela pela API, como o painel pede. */
const tela = async (token, filtro = "novas") =>
  (await medusa(`/dashboard/criadores?filtro=${filtro}`, { metodo: "GET", token })).corpo
const naTela = (t, id) => (t?.inscricoes ?? []).find((c) => c.id === id)

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

const EMAIL_A = `criador.a.${RODADA}@teste.fuckingbarba.dev`
const EMAIL_B = `criador.b.${RODADA}@teste.fuckingbarba.dev`
let tokenDoDono = ""
const emails = [EMAIL_A, EMAIL_B]

try {
  titulo("Duas inscrições, como a loja manda")
  const a = await inscrever({
    nome: `Rafael Teste ${RODADA}`,
    whatsapp: "(47) 99999-0000",
    email: EMAIL_A,
    cidade: "Joinville, SC",
    instagram: "@Rafael.Barba",
    tiktok: "https://www.tiktok.com/@rafa.barba",
    seguidores: "1-10mil",
    barba: "cheia",
    experiencia: "algumas",
    video: "instagram.com/reel/abc123",
    parceria: true,
    modelo: "fixo",
    aceite: true,
  })
  const b = await inscrever({
    nome: `Bruno Teste ${RODADA}`,
    whatsapp: "47 3333-0000",
    email: EMAIL_B,
    cidade: "Curitiba, PR",
    tiktok: "brunobarba",
    barba: "crescendo",
    modelo: "comissao",
    aceite: true,
  })
  ok(a.status === 200 && b.status === 200, "as duas entram", `${a.status} ${b.status}`)
  const [ia] = await doBanco(EMAIL_A)
  const [ib] = await doBanco(EMAIL_B)
  ok(
    ia?.whatsapp === "47999990000" &&
      ia?.instagram === "rafael.barba" &&
      ia?.tiktok === "rafa.barba" &&
      ia?.video === "https://instagram.com/reel/abc123" &&
      ia?.parceria === true &&
      ia?.situacao === "nova",
    "no banco, limpas: WhatsApp em dígitos, perfis sem @ nem link, vídeo com https",
    JSON.stringify(ia)
  )

  titulo("Quem entra")
  const dono = await novaAba()
  const cookieDono = await entrarPelaTela(dono, DONO, caixa)
  if (!cookieDono) throw new Error("o dono não entrou (o código não chegou no Resend falso?)")
  tokenDoDono = cookieDono.value
  const nomeDoDono = (await medusa("/dashboard/eu", { metodo: "GET", token: tokenDoDono })).corpo
    .membro?.nome
  const MKT = `mkt.${RODADA}@painel.teste`
  const OPE = `ope.${RODADA}@painel.teste`
  await medusa("/dashboard/equipe", {
    token: tokenDoDono,
    corpo: { nome: "Marketing Teste", email: MKT, papel: "marketing" },
  })
  await medusa("/dashboard/equipe", {
    token: tokenDoDono,
    corpo: { nome: "Operação Teste", email: OPE, papel: "operacao" },
  })
  const mkt = await novaAba()
  const cookieMkt = await entrarPelaTela(mkt, MKT, caixa)
  const ope = await novaAba()
  const cookieOpe = await entrarPelaTela(ope, OPE, caixa)
  ok(Boolean(nomeDoDono && cookieMkt && cookieOpe), "o dono, o marketing e a operação entram")

  titulo("A tela (API)")
  const t0 = await tela(tokenDoDono)
  const la = naTela(t0, ia?.id)
  ok(Boolean(la && naTela(t0, ib?.id)), "as duas nas novas")
  ok(
    la?.whatsapp?.texto === "(47) 99999-0000" &&
      la?.whatsapp?.link?.startsWith("https://wa.me/5547999990000?text=") &&
      decodeURIComponent(la.whatsapp.link.split("text=")[1] ?? "").startsWith("Oi, Rafael!"),
    "o WhatsApp formatado, e o link abre a conversa com a mensagem pronta",
    JSON.stringify(la?.whatsapp)
  )
  ok(
    semEspaco(la?.perfis?.map((p) => `${p.rede} @${p.arroba} ${p.link}`).join(" | ")) ===
      "Instagram @rafael.barba https://www.instagram.com/rafael.barba/ | TikTok @rafa.barba https://www.tiktok.com/@rafa.barba",
    "os dois perfis, com o link de cada um",
    JSON.stringify(la?.perfis)
  )
  ok(
    la?.modelo?.nome === "Fixo" &&
      la?.barba === "Barba cheia" &&
      la?.experiencia === "Já gravou algumas vezes" &&
      la?.seguidores === "1 mil a 10 mil seguidores" &&
      la?.parceria === true,
    "o modelo e as respostas, em frase",
    JSON.stringify(la)
  )
  ok(
    t0.modelos?.fixo >= 1 && t0.modelos?.comissao >= 1 && t0.contagem?.novas >= 2,
    "as contas de cima (novas e modelos)",
    JSON.stringify({ contagem: t0.contagem, modelos: t0.modelos })
  )
  ok(
    t0.pagina === `${new URL(process.env.LOJA ?? "http://localhost:3000").origin}/criadores` ||
      /\/criadores$/.test(t0.pagina ?? ""),
    "o link da página, pra mandar",
    t0.pagina
  )
  ok(t0.paginacao?.porPagina === 30, "a lista vem em páginas de 30", JSON.stringify(t0.paginacao))
  const tMkt = await tela(cookieMkt.value)
  ok(Boolean(naTela(tMkt, ia?.id)), "o marketing abre a área")
  const tOpe = await medusa("/dashboard/criadores", { metodo: "GET", token: cookieOpe.value })
  ok(tOpe.status === 403, "a operação não abre (403)", `HTTP ${tOpe.status}`)

  titulo("A tela do dono")
  const { pagina } = dono
  await pagina.goto(`${PAINEL}/criadores`)
  await pagina.waitForSelector("[data-tela] h1")
  const doMenu = await menu(pagina)
  ok(doMenu.includes("Criadores"), "o menu tem Criadores (em Pessoas)", doMenu.join(", "))
  const linha = pagina.locator(`[data-criador="${ia?.id}"]`)
  await linha.waitFor()
  const textoDaLinha = semEspaco(await linha.textContent())
  ok(
    textoDaLinha.includes(`Rafael Teste ${RODADA}`) &&
      textoDaLinha.includes("(47) 99999-0000") &&
      textoDaLinha.includes(EMAIL_A) &&
      textoDaLinha.includes("Joinville, SC") &&
      textoDaLinha.includes("topa anúncio de parceria"),
    "a linha tem o nome, o WhatsApp, o e-mail, a cidade e a parceria",
    textoDaLinha
  )
  ok(
    (await linha.locator(`a[data-whatsapp="${ia?.id}"]`).getAttribute("href"))?.startsWith(
      "https://wa.me/5547999990000?text="
    ) &&
      (await linha.locator(`a[data-video="${ia?.id}"]`).getAttribute("href")) ===
        "https://instagram.com/reel/abc123" &&
      (await linha.locator('a[href="https://www.instagram.com/rafael.barba/"]').count()) === 1,
    "o botão do WhatsApp, o vídeo e o Instagram são links de verdade"
  )
  ok(
    (await pagina.locator("[data-copiar-pagina]").count()) === 1 &&
      /\/criadores$/.test(
        (await pagina.locator("[data-pagina-dos-criadores] a").getAttribute("href")) ?? ""
      ),
    "o link da página e o botão de copiar, em cima"
  )
  await hidratado(pagina, `[data-aprovar="${ia?.id}"]`)
  const aprovou = await apertar(pagina, `[data-aprovar="${ia?.id}"]`)
  ok(!aprovou.erro && /chamar no WhatsApp/.test(aprovou.texto), "aprovar avisa", aprovou.texto)
  await pagina.locator(`[data-criador="${ia?.id}"]`).waitFor({ state: "detached" })
  ok(true, "e ela sai das novas")
  const tAprovadas = await tela(tokenDoDono, "aprovadas")
  ok(
    naTela(tAprovadas, ia?.id)?.decisao?.startsWith(`Aprovada por ${nomeDoDono} · `),
    "nas aprovadas, com quem aprovou e quando",
    naTela(tAprovadas, ia?.id)?.decisao
  )

  titulo("Recusar, inscrever de novo, apagar")
  const nova = await medusa(`/dashboard/criadores/${ib?.id}`, {
    token: tokenDoDono,
    corpo: { acao: "apagar" },
  })
  ok(nova.status === 409, "a nova não se apaga (recusa antes)", `HTTP ${nova.status}`)
  await pagina.goto(`${PAINEL}/criadores`)
  await hidratado(pagina, `[data-recusar="${ib?.id}"]`)
  const recusou = await apertar(pagina, `[data-recusar="${ib?.id}"]`)
  ok(/Recusada/.test(recusou.texto), "recusar avisa", recusou.texto)
  const [recusada] = await doBanco(EMAIL_B)
  ok(recusada?.situacao === "recusada", "no banco, recusada", recusada?.situacao)
  const deNovo = await inscrever({
    nome: `Bruno Teste ${RODADA}`,
    whatsapp: "47 3333-0000",
    email: EMAIL_B,
    cidade: "Curitiba, PR",
    tiktok: "brunobarba",
    barba: "media",
    modelo: "fixo",
    aceite: true,
  })
  const [voltou] = await doBanco(EMAIL_B)
  ok(
    deNovo.status === 200 &&
      voltou?.id === ib?.id &&
      voltou?.situacao === "nova" &&
      voltou?.modelo === "fixo",
    "quem foi recusado e se inscreve de novo volta pra fila (a mesma inscrição, atualizada)",
    JSON.stringify({ status: deNovo.status, situacao: voltou?.situacao, modelo: voltou?.modelo })
  )
  await medusa(`/dashboard/criadores/${ib?.id}`, { token: tokenDoDono, corpo: { acao: "recusar" } })
  await pagina.goto(`${PAINEL}/criadores?filtro=recusadas`)
  await pagina.locator(`[data-apagar="${ib?.id}"]`).waitFor()
  await hidratado(pagina, `[data-apagar="${ib?.id}"]`)
  await pagina.click(`[data-apagar="${ib?.id}"]`)
  await pagina.locator(`[data-confirmar-apagar="${ib?.id}"]`).waitFor()
  ok(true, "apagar pede confirmação antes")
  const apagou = await apertar(pagina, `[data-confirmar-apagar="${ib?.id}"]`)
  ok(/Apagada de vez/.test(apagou.texto), "apagar avisa", apagou.texto)
  ok((await doBanco(EMAIL_B)).length === 0, "e ela sai do banco")

  titulo("A operação, na tela")
  const doMenuOpe = await (async () => {
    await ope.pagina.goto(`${PAINEL}/`)
    await ope.pagina.waitForSelector("[data-tela] h1")
    return menu(ope.pagina)
  })()
  ok(!doMenuOpe.includes("Criadores"), "o menu dela não tem Criadores", doMenuOpe.join(", "))

  titulo("O celular")
  const cel = await novaAba({ width: 390, height: 844 })
  await cel.contexto.addCookies(await dono.contexto.cookies())
  await cel.pagina.goto(`${PAINEL}/criadores?filtro=aprovadas`)
  await cel.pagina.locator(`[data-criador="${ia?.id}"]`).waitFor()
  ok(await semRolagemDeLado(cel.pagina), "sem rolagem de lado")

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.join(" | "))
} catch (err) {
  falhou(`o conferidor quebrou: ${err instanceof Error ? err.stack : err}`)
} finally {
  // As inscrições da rodada saem do banco, e a equipe da rodada sai.
  for (const email of emails)
    for (const i of await doBanco(email).catch(() => []))
      for (const acao of ["recusar", "apagar"])
        await medusa(`/admin/criadores/${i.id}`, {
          token: tokenAdmin,
          assinado: false,
          corpo: { acao },
        })
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
