/**
 * CONFERIDOR DAS CONFIGURAÇÕES DO PAINEL — o dono grava os dados da empresa,
 * o frete, a emergência e a hora da nota pelo painel, e a loja mostra.
 * (Não é o `apps/loja/ferramentas/conferir-configuracoes.mjs`, que confere a
 * rota pública da loja; este confere a tela do painel e o que ela grava.)
 *
 *   (Medusa local; painel e loja no ar)
 *   node apps/dashboard/ferramentas/conferir-configuracoes.mjs
 *
 * Variáveis: as de `pecas.mjs`, e mais NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 * ADMIN_EMAIL e ADMIN_SENHA (o admin LOCAL: guardar as configurações do
 * começo e devolver no fim) e LOJA (a loja local).
 *
 * DESFAZ O QUE MUDOU, mesmo quando falha: as configurações e a janela da
 * nota voltam ao que eram, e os membros da rodada saem da equipe.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o campo errado gravado em silêncio (o CNPJ que não confere, o        │
 * │   WhatsApp sem DDD, o frete fixo sem preço, a emergência sem prazo);   │
 * │ • salvar uma parte e apagar as outras (o frete apagando a empresa);    │
 * │ • o teto de custo do frete perdido por não estar na tela;              │
 * │ • a loja que não mostra o que foi salvo; a janela da nota que não muda;│
 * │ • a operação entrando nas configurações;                               │
 * │ • rolagem de lado no celular; erro no console.                         │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import {
  abrirNavegador,
  caixaDoResend,
  DONO,
  entrar as entrarPelaTela,
  esperar,
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
const LOJA = (process.env.LOJA ?? "http://localhost:3000").replace(/\/+$/, "")
const OP = `op.${RODADA}@painel.teste`
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
async function adm(caminho, { metodo = "GET", corpo } = {}) {
  const r = await fetch(`${MEDUSA}${caminho}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${tokenAdmin}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: r.status, corpo: await r.json().catch(() => ({})) }
}
const publicas = async () =>
  (
    await (
      await fetch(`${MEDUSA}/store/configuracoes`, { headers: { "x-publishable-api-key": CHAVE } })
    ).json()
  ).configuracoes

// O que estava antes da rodada: volta no fim.
const { configuracoes: antes } = (await adm("/admin/configuracoes")).corpo
const { corpo: erpAntes } = await adm("/admin/erp")
const janelaAntes = erpAntes?.conexao?.janelaDaNota ?? erpAntes?.janelaDaNota ?? 5

let tokenDoDono = ""

try {
  titulo("Quem entra")
  const dono = await novaAba()
  const cookieDono = await entrarPelaTela(dono, DONO, caixa)
  if (!cookieDono) throw new Error("o dono não entrou (o código não chegou no Resend falso?)")
  tokenDoDono = cookieDono.value
  const convite = await medusa("/dashboard/equipe", {
    token: tokenDoDono,
    corpo: { nome: "Operação Teste", email: OP, papel: "operacao" },
  })
  const op = await novaAba()
  const cookieOp = await entrarPelaTela(op, OP, caixa)
  const lerOp = await medusa("/dashboard/configuracoes", { metodo: "GET", token: cookieOp?.value })
  const gravarOp = await medusa("/dashboard/configuracoes/empresa", {
    token: cookieOp?.value,
    corpo: { razaoSocial: "x" },
  })
  ok(
    convite.status === 200 && lerOp.status === 403 && gravarOp.status === 403,
    "a operação não abre nem grava as configurações",
    `${convite.status} ${lerOp.status} ${gravarOp.status}`
  )

  /* ── pela API ─────────────────────────────────────────────────────────── */

  titulo("Os dados da empresa (API)")
  const gravar = (parte, corpo) =>
    medusa(`/dashboard/configuracoes/${parte}`, { token: tokenDoDono, corpo })
  const errado = await gravar("empresa", {
    cnpj: "11.222.333/0001-99",
    whatsapp: "98826",
    email: "contato@",
  })
  ok(
    errado.status === 422 && ["cnpj", "email", "whatsapp"].every((c) => errado.corpo.erros?.[c]),
    "o CNPJ que não confere, o WhatsApp sem DDD e o e-mail torto voltam campo a campo",
    JSON.stringify(errado.corpo)
  )
  const empresa = {
    razaoSocial: `Barba Forte ${RODADA} LTDA`,
    cnpj: "11222333000181",
    endereco: "Rua das Palmeiras, 100 — Blumenau/SC",
    whatsapp: "(47) 98826-1551",
    email: `contato.${RODADA}@fuckingbarba.dev`,
    horario: "Seg a sex, 9h às 18h\nSáb, 9h às 13h",
    prazoDePostagem: "até 1 dia útil",
  }
  const certo = await gravar("empresa", empresa)
  const p1 = await publicas()
  ok(
    certo.status === 200 &&
      p1.empresa.cnpj === "11.222.333/0001-81" &&
      p1.empresa.razaoSocial === empresa.razaoSocial &&
      p1.atendimento.whatsapp === "5547988261551" &&
      p1.atendimento.horario?.length === 2 &&
      p1.atendimento.prazoDePostagem === "até 1 dia útil",
    "gravado: o CNPJ com pontos, o WhatsApp com 55, o horário por linha — e a rota da loja já mostra",
    JSON.stringify({ status: certo.status, empresa: p1.empresa, atendimento: p1.atendimento })
  )
  let rodape = ""
  for (let i = 0; i < 20 && !rodape.includes(empresa.email); i++) {
    await esperar(1000)
    rodape = await (await fetch(`${LOJA}/`)).text()
  }
  ok(
    rodape.includes(empresa.email) && rodape.includes("wa.me/5547988261551"),
    "a loja mostra no rodapé em segundos (o Medusa avisa a loja)",
    rodape.includes(empresa.email) ? "" : "o e-mail novo não apareceu no HTML da loja"
  )

  titulo("O frete (API)")
  const semPreco = await gravar("frete", { modo: "fixo", piso: "99", preco: "" })
  ok(
    semPreco.status === 422 && semPreco.corpo.erros?.preco,
    "frete fixo sem preço é recusado",
    JSON.stringify(semPreco.corpo)
  )
  // O teto de custo não está na tela: o que o admin gravou tem que ficar.
  await adm("/admin/configuracoes", {
    metodo: "POST",
    corpo: {
      ...(await adm("/admin/configuracoes")).corpo.configuracoes,
      frete: { modo: "gratis", piso: 149.9, alvo: "mais-barata", tetoDeCusto: 55 },
    },
  })
  const frete = await gravar("frete", { modo: "gratis", piso: "R$ 199,90", alvo: "todas" })
  const p2 = await publicas()
  ok(
    frete.status === 200 &&
      p2.frete.modo === "gratis" &&
      p2.frete.piso === 199.9 &&
      p2.frete.alvo === "todas" &&
      p2.frete.tetoDeCusto === 55 &&
      p2.empresa.razaoSocial === empresa.razaoSocial &&
      semEspaco(frete.corpo.frase) ===
        "Frete grátis a partir de R$ 199,90 em produtos, em todas as opções.",
    "o frete muda, o teto de custo fica, e os dados da empresa continuam lá",
    JSON.stringify({ corpo: frete.corpo, frete: p2.frete })
  )
  const semPrazo = await gravar("emergencia", { preco: "24,90", prazo: "" })
  const emergencia = await gravar("emergencia", { preco: "24,90", prazo: "7 dias úteis" })
  const a3 = (await adm("/admin/configuracoes")).corpo.configuracoes
  ok(
    semPrazo.status === 422 &&
      semPrazo.corpo.erros?.prazo &&
      emergencia.status === 200 &&
      a3.cotacao.precoDeEmergencia === 24.9 &&
      a3.cotacao.prazoDeEmergencia === "7 dias úteis" &&
      a3.frete.piso === 199.9,
    "a emergência: com preço, o prazo é obrigatório; gravada, o frete continua",
    JSON.stringify({ semPrazo: semPrazo.corpo, cotacao: a3.cotacao })
  )

  titulo("A nota e os e-mails (API)")
  const janelaErrada = await gravar("nota", { janela: 10 })
  const janela = await gravar("nota", { janela: 15 })
  const tela = (await medusa("/dashboard/configuracoes", { metodo: "GET", token: tokenDoDono }))
    .corpo
  ok(
    janelaErrada.status === 400 && janela.status === 200 && tela.nota?.janela === 15,
    "a janela da nota: só as da tela; a de 15 minutos fica gravada",
    `${janelaErrada.status} ${janela.status} ${tela.nota?.janela}`
  )
  ok(
    tela.emails?.equipe?.length === 5 &&
      tela.emails.equipe.every((e) => /\(dono\)|\(operação\)/.test(e.quem)) &&
      tela.emails.equipe.slice(0, 3).every((e) => e.quem.includes("(operação)")) &&
      !tela.emails.equipe[4].quem.includes("(operação)"),
    "os avisos da equipe: a nota pra operação e o dono; o estorno só pro dono",
    JSON.stringify(tela.emails?.equipe?.map((e) => e.quem))
  )

  /* ── a tela ───────────────────────────────────────────────────────────── */

  titulo("A tela do dono")
  const { pagina } = dono
  await pagina.goto(`${PAINEL}/configuracoes`)
  await pagina.waitForURL(/\/configuracoes\/empresa$/)
  await hidratado(pagina, '[data-form="empresa"] [data-campo="cnpj"]')
  ok(
    (await pagina.locator('[data-form="empresa"] [data-campo="cnpj"]').inputValue()) ===
      "11.222.333/0001-81" &&
      (await pagina.locator('[data-campo="whatsapp"]').inputValue()) === "(47) 98826-1551" &&
      (await pagina.locator('.abas a[aria-current="page"]').textContent()) === "Dados da empresa",
    "/configuracoes abre nos dados da empresa, com o que está gravado"
  )
  const aviso = pagina.locator(".aviso")
  const salvarPelaTela = async (formulario) => {
    const vez = await aviso.getAttribute("data-vez")
    await pagina.locator(`[data-form="${formulario}"] button[type="submit"]`).click()
    await pagina.waitForFunction(
      (v) => document.querySelector(".aviso")?.getAttribute("data-vez") !== v,
      vez,
      { timeout: 30000 }
    )
    return semEspaco(await aviso.textContent())
  }
  await pagina.locator('[data-campo="cnpj"]').fill("11.222.333/0001-00")
  const recusado = await salvarPelaTela("empresa")
  ok(
    /Confira o que está marcado/.test(recusado) &&
      (await pagina.locator('[data-campo="cnpj"]').getAttribute("aria-invalid")) === "true",
    "pela tela: o CNPJ errado volta marcado no campo",
    recusado
  )
  await pagina.locator('[data-campo="cnpj"]').fill("11222333000181")
  await pagina.locator('[data-campo="prazoDePostagem"]').fill("até 2 dias úteis")
  const salvo = await salvarPelaTela("empresa")
  await pagina.waitForFunction(
    () => document.querySelector('[data-campo="cnpj"]')?.value === "11.222.333/0001-81",
    null,
    { timeout: 10000 }
  )
  ok(
    /^Dados da empresa salvos\./.test(salvo) &&
      (await publicas()).atendimento.prazoDePostagem === "até 2 dias úteis",
    "pela tela: salvo, o aviso diz, e o CNPJ volta arrumado no campo",
    salvo
  )

  await pagina.goto(`${PAINEL}/configuracoes/frete`)
  await hidratado(pagina, '[data-form="frete"]')
  await pagina.locator('[data-opcao="modo:fixo"]').check()
  const comPreco = await pagina.locator('[data-form="frete"] [data-campo="preco"]').count()
  await pagina.locator('[data-form="frete"] [data-campo="preco"]').fill("9,90")
  await pagina.locator('[data-form="frete"] [data-campo="piso"]').fill("99,00")
  const doFrete = await salvarPelaTela("frete")
  await pagina.waitForFunction(
    () =>
      /Frete de R\$\s9,90/.test(document.querySelector("[data-frase-do-frete]")?.textContent ?? ""),
    null,
    { timeout: 10000 }
  )
  const p4 = await publicas()
  ok(
    comPreco === 1 &&
      /^Frete de R\$ 9,90 a partir de R\$ 99,00/.test(doFrete) &&
      p4.frete.modo === "fixo" &&
      p4.frete.preco === 9.9,
    "pela tela: o preço fixo aparece com o modo, grava, e a frase de hoje muda",
    doFrete
  )

  await pagina.goto(`${PAINEL}/configuracoes/nota`)
  await hidratado(pagina, "[data-erp]")
  const temJanela = (await pagina.locator("[data-janela]").count()) > 0
  if (temJanela) {
    const vez = await aviso.getAttribute("data-vez")
    await pagina.locator('[data-janela="30"]').check()
    await pagina.waitForFunction(
      (v) => document.querySelector(".aviso")?.getAttribute("data-vez") !== v,
      vez,
      { timeout: 30000 }
    )
  }
  const depois = (await medusa("/dashboard/configuracoes", { metodo: "GET", token: tokenDoDono }))
    .corpo
  ok(
    !temJanela ||
      (depois.nota?.janela === 30 && /30 minutos/.test(semEspaco(await aviso.textContent()))),
    "pela tela: a janela da nota muda no clique",
    `${depois.nota?.janela}`
  )

  for (const [aba, seletor] of [
    ["pagamento", '[data-linhas="pagamento"] .linha'],
    ["entrega", '[data-linhas="entrega"] .linha'],
    ["emails", "[data-aviso-da-equipe]"],
  ]) {
    await pagina.goto(`${PAINEL}/configuracoes/${aba}`)
    await pagina.waitForSelector(seletor)
  }
  ok(
    (await pagina.locator("[data-aviso-da-equipe]").count()) === 5 &&
      (await pagina.locator("[data-emails-cliente] .linha").count()) === 6,
    "as abas de conferir: pagamento, entrega e os e-mails (5 avisos da equipe, 6 do cliente)"
  )

  titulo("A operação e o celular")
  await op.pagina.goto(`${PAINEL}/configuracoes/empresa`)
  ok(
    semEspaco(await op.pagina.locator("main").textContent()).includes(
      "Essa área não é do seu papel"
    ),
    "a operação: 'não é do seu papel'"
  )
  const contextoCel = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    storageState: await dono.contexto.storageState(),
  })
  const cel = await contextoCel.newPage()
  cel.on("pageerror", (e) => errosDeConsole.push(`${cel.url()}: ${e.message}`))
  let rolaDeLado = []
  for (const aba of ["empresa", "frete", "nota", "emails"]) {
    await cel.goto(`${PAINEL}/configuracoes/${aba}`)
    await cel.waitForSelector(".abas")
    if (!(await semRolagemDeLado(cel))) rolaDeLado.push(aba)
  }
  ok(!rolaDeLado.length, "no celular, sem rolagem de lado", rolaDeLado.join(", "))

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.join(" | "))
} catch (e) {
  falhou(`o conferidor quebrou: ${e instanceof Error ? e.stack : e}`)
} finally {
  await adm("/admin/configuracoes", { metodo: "POST", corpo: antes })
  await adm("/admin/erp/notas/janela", { metodo: "POST", corpo: { minutos: janelaAntes } })
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
