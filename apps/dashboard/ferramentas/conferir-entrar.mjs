/**
 * CONFERIDOR DO PAINEL — entrar, os papéis e a equipe, pela tela, com um
 * Resend de mentira atrás.
 *
 *   RESEND_URL=http://127.0.0.1:4330 RESEND_API_KEY=re_teste_falsa \
 *     DASHBOARD_DONO_EMAIL=dono@painel.teste npm run backend:dev
 *   npm run dev -w @fuckingbarba/dashboard
 *   DASHBOARD_DONO_EMAIL=dono@painel.teste REVALIDAR_SEGREDO=… \
 *     node apps/dashboard/ferramentas/conferir-entrar.mjs
 *
 * Variáveis: as de `pecas.mjs` (PAINEL, MEDUSA_BACKEND_URL, REVALIDAR_SEGREDO,
 * DASHBOARD_DONO_EMAIL, PORTA_RESEND, CHROMIUM) e
 * NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY (opcional: sem ela, pula a prova de que
 * o código da loja não abre o painel).
 *
 * Cria membros de teste com e-mails que nunca se repetem
 * (`op.<hora>@painel.teste`…) e tira todos da equipe no fim. O dono do
 * `DASHBOARD_DONO_EMAIL` pede um código por rodada: o limite de 5 por hora
 * por e-mail vale pra ele também.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PRA TRAVAR ─────────────────────────────────┐
 * │ • o painel abrindo sem sessão, ou indexável;                           │
 * │ • `/dashboard/*` respondendo sem a assinatura do painel;               │
 * │ • quem não é da equipe recebendo código — ou a tela contando que não é;│
 * │ • código errado entrando, ou o código da loja abrindo o painel;        │
 * │ • o token ao alcance do JavaScript da página;                          │
 * │ • o convite sem e-mail, ou o convidado sem conseguir entrar;           │
 * │ • um papel vendo a área que não é dele — na tela OU na API;            │
 * │ • papel trocado ou pessoa removida seguindo como antes até o token     │
 * │   vencer (30 dias);                                                    │
 * │ • a tabela dos acessos mudada pelo dono sem valer no servidor, ou só   │
 * │   depois do token vencer; o Início, a Equipe ou o dono mudando; o     │
 * │   estorno abrindo sem os Pedidos; o convite com a lista de antes;      │
 * │ • o papel criado pelo dono (0223) abrindo mais do que as caixinhas     │
 * │   dele, o telefone dos clientes sem a caixinha, nome repetido, papel   │
 * │   apagado com gente dentro, ou a operação criando papel;               │
 * │ • o dono se removendo ou mudando o próprio papel;                      │
 * │ • o token da equipe abrindo o admin do Medusa;                         │
 * │ • a casca do celular (abas, "Mais") quebrada, ou rolagem de lado;      │
 * │ • erro no console.                                                     │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import {
  abrirNavegador,
  avisoDoClique,
  caixaDoResend,
  caminho,
  codigoDe,
  digitarCodigo,
  DONO,
  doConvite,
  doPainel,
  entrar as entrarPelaTela,
  esperar,
  exigirAmbiente,
  falhou,
  hidratado,
  medusa,
  MEDUSA,
  menu,
  ok,
  PAINEL,
  pedirCodigo,
  resumo,
  RODADA,
  semRolagemDeLado,
  subirResend,
  textoDe,
  titulo,
} from "./pecas.mjs"

const CHAVE_DA_LOJA = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
exigirAmbiente()

const OPERACAO = `op.${RODADA}@painel.teste`
const MARKETING = `mkt.${RODADA}@painel.teste`
const DE_FORA = `fora.${RODADA}@painel.teste`
const ATENDE = `atende.${RODADA}@painel.teste`
/** O papel que a rodada cria (e apaga no fim): o nome leva a rodada, pra nunca repetir. */
const ATENDIMENTO = `Atendimento ${RODADA}`

const resend = await subirResend()
console.log(`  ⚙  Resend falso :${resend.porta} · painel ${PAINEL} · Medusa ${MEDUSA}`)
const { quantos, esperarEmail } = caixaDoResend(resend)
const { navegador, novaAba, errosDeConsole } = await abrirNavegador()

/** Entra pela tela, do e-mail ao Início. Devolve o cookie (pra testar a API com o token). */
const entrar = (pagina, contexto, email) =>
  entrarPelaTela({ pagina, contexto }, email, { quantos, esperarEmail })

/* ════════════════════════════════════════════════════════════════════════ */

let tokenDoDono = ""
/** A tabela dos acessos antes da rodada — volta a ser ela no fim, mesmo se a rodada quebrar. */
let acessoDeAntes = null

/**
 * O corpo do `POST /dashboard/acessos` pra uma matriz: a coluna inteira de
 * cada papel — a operação, o marketing e cada papel criado pelo dono que
 * estiver na matriz (as colunas dele aparecem no `inicio`, que todos abrem).
 */
const colunaDa = (matriz, papel) => Object.keys(matriz).filter((a) => matriz[a].includes(papel))
const corpoDosAcessos = (matriz) => ({
  acesso: Object.fromEntries(
    ["operacao", "marketing", ...matriz.inicio.filter((p) => p.startsWith("papel_"))].map((p) => [
      p,
      colunaDa(matriz, p),
    ])
  ),
})

try {
  titulo("Sem sessão")
  {
    const { contexto, pagina } = await novaAba()
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    ok(caminho(pagina) === "/entrar", "o painel vira o “entrar”", pagina.url())
    const r = await fetch(`${PAINEL}/entrar`)
    ok(/noindex/.test(r.headers.get("x-robots-tag") ?? ""), "X-Robots-Tag: noindex")
    const robots = await (await fetch(`${PAINEL}/robots.txt`)).text()
    ok(/Disallow: \//.test(robots), "robots.txt fecha tudo", robots)
    await contexto.close()
  }

  titulo("A API do painel")
  {
    let r = await medusa("/dashboard/entrar/codigo", { corpo: { email: DONO }, assinado: false })
    ok(
      r.status === 403 && r.corpo.message === "sem_assinatura",
      "sem a assinatura: 403",
      JSON.stringify(r)
    )
    r = await medusa("/dashboard/eu", { metodo: "GET" })
    ok(r.status === 401, "assinado, mas sem token: 401", JSON.stringify(r))
    r = await medusa("/dashboard/qualquer-coisa-nova", { metodo: "GET" })
    ok(r.status === 401, "rota nova já nasce trancada", JSON.stringify(r))
  }

  titulo("De fora da equipe")
  {
    const { contexto, pagina } = await novaAba()
    const antes = resend.emails.length
    await pedirCodigo(pagina, DE_FORA)
    const frase = await textoDe(pagina, ".entrar__txt")
    ok(frase.includes(`Se ${DE_FORA} for da equipe`), "a tela não conta quem é da equipe", frase)
    await esperar(1500)
    ok(resend.emails.length === antes, "nenhum e-mail sai")
    await digitarCodigo(pagina, "123456")
    await pagina.waitForSelector(".campo__erro:not(:empty)", { timeout: 10000 })
    ok(
      (await textoDe(pagina, ".campo__erro")).startsWith("Código errado"),
      "qualquer código: “Código errado”"
    )
    await contexto.close()
  }

  titulo("O dono entra")
  const dono = await novaAba()
  {
    const { contexto, pagina } = dono
    const antes = quantos(DONO, doPainel)
    await pedirCodigo(pagina, DONO)
    const email = await esperarEmail(DONO, doPainel, antes)
    if (!email) {
      console.log(
        `  ⚠  o código do dono não chegou no Resend falso. Suba o Medusa com\n` +
          `     RESEND_URL=http://127.0.0.1:${resend.porta} RESEND_API_KEY=re_teste_falsa DASHBOARD_DONO_EMAIL=${DONO}`
      )
      throw new Error("sem o código do dono")
    }
    ok(
      email.subject.endsWith("é o seu código do painel da FuckingBarba"),
      "o assunto diz que é do painel"
    )
    ok(!/<a[\s>]/.test(email.html ?? ""), "o e-mail do código não tem link")

    await digitarCodigo(pagina, codigoDe(email) === "000000" ? "111111" : "000000")
    await pagina.waitForSelector(".campo__erro:not(:empty)", { timeout: 10000 })
    ok(
      (await textoDe(pagina, ".campo__erro")).startsWith("Código errado"),
      "código errado não entra"
    )

    await hidratado(pagina, "input[name=codigo]")
    await digitarCodigo(pagina, codigoDe(email))
    await pagina.waitForURL((u) => u.pathname === "/", { timeout: 15000 }).catch(() => {})
    ok(caminho(pagina) === "/", "o código certo entra", pagina.url())
    ok(/^(Bom dia|Boa tarde|Boa noite), /.test(await textoDe(pagina, "h1")), "o Início cumprimenta")

    const cookie = (await contexto.cookies()).find((c) => c.name === "painel_sessao")
    ok(Boolean(cookie?.httpOnly), "o token mora num cookie httpOnly")
    tokenDoDono = cookie?.value ?? ""
    ok(
      !(await pagina.evaluate(() => document.cookie.includes("painel_sessao"))),
      "o JavaScript da página não lê o token"
    )
    const itens = await menu(pagina)
    ok(
      ["Início", "Pedidos", "Configurações", "Layout da home", "Observabilidade"].every((i) =>
        itens.includes(i)
      ),
      "o menu do dono tem tudo",
      itens.join(", ")
    )
    await pagina.goto(`${PAINEL}/entrar`)
    ok(caminho(pagina) === "/", "com sessão, o “entrar” vira o Início")

    let r = await medusa("/admin/orders", { metodo: "GET", token: tokenDoDono, assinado: false })
    ok(r.status === 401, "o token da equipe não abre o admin do Medusa", String(r.status))
    r = await medusa("/dashboard/eu", { metodo: "GET", token: tokenDoDono, assinado: false })
    ok(r.status === 403, "o token sem a assinatura não abre o painel", String(r.status))
  }

  if (CHAVE_DA_LOJA) {
    titulo("O código da loja não abre o painel")
    const daConta = (e) => /^\d{6} é o seu código da FuckingBarba$/.test(e.subject ?? "")
    const antes = quantos(DONO, daConta)
    const pedirDaLoja = () =>
      medusa("/store/conta/codigo", {
        corpo: { email: DONO },
        assinado: false,
        extras: { "x-publishable-api-key": CHAVE_DA_LOJA },
      })
    // Rodada logo depois de outra: a loja pede os 30 segundos entre um código e outro.
    const pedido = await pedirDaLoja()
    if (pedido.status === 429 && pedido.corpo.message === "espera") {
      await esperar((Number(pedido.corpo.segundos) + 1) * 1000)
      await pedirDaLoja()
    }
    const daLoja = await esperarEmail(DONO, daConta, antes)
    const r = await medusa("/auth/equipe/codigo-equipe", {
      corpo: { email: DONO, codigo: codigoDe(daLoja) },
      assinado: false,
    })
    ok(
      Boolean(daLoja) && r.status === 401,
      "o código de cliente é recusado no painel",
      String(r.status)
    )
  } else {
    console.log("\n  (sem NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: pulei o código da loja)")
  }

  titulo("O dono convida")
  {
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    await hidratado(pagina, ".bloco__cabeca .btn")
    ok(
      (await pagina.locator(".linha", { hasText: DONO }).locator("text=Mudar").count()) === 0,
      "o dono não tem “Mudar” na própria linha"
    )

    async function convidar({ nome, email, papel }) {
      await pagina.click("text=Convidar pessoa")
      await pagina.waitForSelector(".gaveta #c-nome")
      await pagina.fill("#c-nome", nome)
      await pagina.fill("#c-email", email)
      await pagina.selectOption("#c-papel", papel)
      await pagina.click(".gaveta button[type=submit]")
    }

    await convidar({ nome: "Teste", email: "torto@", papel: "operacao" })
    await pagina.waitForSelector(".gaveta .campo__erro:not(:empty)", { timeout: 10000 })
    ok(
      (await textoDe(pagina, ".gaveta .campo__erro:not(:empty)")) === "Confere o e-mail.",
      "e-mail torto: o erro fica no campo"
    )
    await pagina.click(".gaveta .folha__fechar")

    await convidar({ nome: "Dono de Novo", email: DONO, papel: "marketing" })
    await pagina.waitForSelector(".gaveta .campo__erro:not(:empty)", { timeout: 10000 })
    ok(
      (await textoDe(pagina, ".gaveta .campo__erro:not(:empty)")) ===
        "Esse e-mail já está na equipe.",
      "quem já é da equipe não é convidado de novo"
    )
    await pagina.keyboard.press("Escape")
    ok((await pagina.locator(".gaveta").count()) === 0, "a gaveta fecha no Esc")

    const antes = quantos(OPERACAO, doConvite)
    await convidar({ nome: "Operação Teste", email: OPERACAO, papel: "operacao" })
    await pagina.waitForSelector(".gaveta", { state: "detached", timeout: 10000 })
    await pagina.waitForSelector(`.aviso:not([data-fora])`, { timeout: 10000 })
    ok(
      (await textoDe(pagina, ".aviso")).includes(`Convite mandado pra ${OPERACAO}`),
      "o aviso confirma o convite"
    )
    const convite = await esperarEmail(OPERACAO, doConvite, antes)
    ok(Boolean(convite), "o convite chega por e-mail")
    ok(
      /papel Operação/.test(convite?.text ?? "") && /Pedidos/.test(convite?.text ?? ""),
      "o convite diz o papel e o que ele abre"
    )
    const linha = pagina.locator(".linha", { hasText: OPERACAO })
    ok(
      (await linha.locator(".status", { hasText: "Convite" }).count()) === 1,
      "a lista mostra o convite"
    )

    await convidar({ nome: "Marketing Teste", email: MARKETING, papel: "marketing" })
    await pagina.waitForSelector(".gaveta", { state: "detached", timeout: 10000 })
    await esperarEmail(MARKETING, doConvite, 0)
    const antesDoReenvio = quantos(MARKETING, doConvite)
    const doMkt = pagina.locator(".linha", { hasText: MARKETING })
    await doMkt.locator("button", { hasText: "Mudar" }).click()
    await doMkt.locator("button", { hasText: "Reenviar convite" }).click()
    ok(
      Boolean(await esperarEmail(MARKETING, doConvite, antesDoReenvio)),
      "“Reenviar convite” manda de novo"
    )
  }

  titulo("A operação entra, e só vê o que é dela")
  const op = await novaAba()
  let tokenDaOperacao = ""
  {
    const { contexto, pagina } = op
    const cookie = await entrar(pagina, contexto, OPERACAO)
    ok(caminho(pagina) === "/" && Boolean(cookie), "o convidado entra com o código", pagina.url())
    tokenDaOperacao = cookie?.value ?? ""
    const itens = await menu(pagina)
    ok(
      itens.includes("Pedidos") && itens.includes("Observabilidade"),
      "o menu tem pedidos e observabilidade",
      itens.join(", ")
    )
    ok(
      !itens.includes("Configurações") &&
        !itens.includes("Cupons e descontos") &&
        !itens.includes("Layout da home"),
      "o menu não tem o que não é do papel",
      itens.join(", ")
    )
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    ok(
      (await textoDe(pagina, "h1")) === "Essa área não é do seu papel",
      "o endereço na mão mostra “sem acesso”"
    )
    await pagina.goto(`${PAINEL}/cupons`)
    ok((await textoDe(pagina, "h1")) === "Essa área não é do seu papel", "cupons também")

    let r = await medusa("/dashboard/equipe", { metodo: "GET", token: tokenDaOperacao })
    ok(
      r.status === 403 && r.corpo.message === "sem_acesso",
      "a API da equipe responde 403 pra operação",
      JSON.stringify(r)
    )
    r = await medusa("/dashboard/equipe", {
      token: tokenDaOperacao,
      corpo: { nome: "X Y", email: `x.${RODADA}@painel.teste`, papel: "dono" },
    })
    ok(r.status === 403, "a operação não convida", JSON.stringify(r))
  }

  titulo("O dono muda o que cada papel abre, e vale no próximo clique")
  {
    const { pagina } = dono
    const daApi = async () =>
      (await medusa("/dashboard/equipe", { metodo: "GET", token: tokenDoDono })).corpo
    // A rodada começa do padrão, e devolve no fim a tabela que achou.
    const achada = await daApi()
    acessoDeAntes = achada.acesso
    if (JSON.stringify(achada.acesso) !== JSON.stringify(achada.padrao))
      await medusa("/dashboard/acessos", {
        token: tokenDoDono,
        corpo: corpoDosAcessos(achada.padrao),
      })
    const antes = await daApi()

    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    await hidratado(pagina, ".acessos .matriz__caixa input")
    // A tela, célula a célula: "sim"/"nao" na caixinha, e o texto onde não tem.
    const lerTela = () =>
      pagina.locator(".acessos tbody tr").evaluateAll((linhas) =>
        Object.fromEntries(
          linhas.map((tr) => [
            tr.dataset.area,
            Object.fromEntries(
              [...tr.querySelectorAll("td")].map((td) => {
                const caixa = td.querySelector("input[type=checkbox]")
                return [
                  td.dataset.papel,
                  caixa ? (caixa.checked ? "sim" : "nao") : td.textContent.trim(),
                ]
              })
            ),
          ])
        )
      )
    // O telefone dos clientes (`doPapel`) é texto na operação e no marketing, e caixinha no papel criado.
    const criados = (antes.papeis ?? []).map((p) => p.id)
    const semCaixinha = (area, p) =>
      antes.fixas.includes(area) || (!p.startsWith("papel_") && antes.doPapel.includes(area))
    const esperado = Object.fromEntries(
      Object.entries(antes.acesso).map(([area, papeis]) => [
        area,
        {
          dono: "abre",
          ...Object.fromEntries(
            ["operacao", "marketing", ...criados].map((p) => [
              p,
              semCaixinha(area, p)
                ? papeis.includes(p)
                  ? "abre"
                  : "—"
                : papeis.includes(p)
                  ? "sim"
                  : "nao",
            ])
          ),
        },
      ])
    )
    const tela = await lerTela()
    ok(
      JSON.stringify(tela) === JSON.stringify(esperado),
      "a tabela é a da API: caixinha na operação e no marketing, “abre” no dono",
      JSON.stringify(tela)
    )
    ok(
      tela.inicio?.operacao === "abre" &&
        tela.inicio?.marketing === "abre" &&
        tela.equipe?.operacao === "—" &&
        tela.equipe?.marketing === "—",
      "o Início (todos) e a Equipe (só o dono) não têm caixinha"
    )
    ok(
      tela.contatos?.operacao === "abre" && tela.contatos?.marketing === "—",
      "o telefone dos clientes segue o papel na operação e no marketing (sem caixinha)",
      JSON.stringify(tela.contatos)
    )

    const caixa = (area, papel) =>
      pagina.locator(`.acessos tr[data-area="${area}"] td[data-papel="${papel}"] input`)
    await caixa("estornos", "marketing").check()
    ok(await caixa("pedidos", "marketing").isChecked(), "marcar o estorno marca os Pedidos junto")
    await caixa("pedidos", "marketing").uncheck()
    ok(
      !(await caixa("estornos", "marketing").isChecked()),
      "desmarcar os Pedidos desmarca o estorno"
    )
    ok(
      (await pagina.locator(".acessos__pendentes").count()) === 0,
      "de volta ao que estava, nada fica pendente"
    )

    // A operação ganha os cupons e perde a observabilidade; o marketing perde os carrinhos.
    await caixa("cupons", "operacao").check()
    await caixa("observabilidade", "operacao").uncheck()
    await caixa("carrinhos", "marketing").uncheck()
    ok(
      (await textoDe(pagina, ".acessos__pendentes")) === "3 mudanças sem salvar",
      "a tela conta o que falta salvar",
      await textoDe(pagina, ".acessos__pendentes")
    )
    ok(
      (await pagina.locator(".acessos td[data-mudado]").count()) === 3,
      "o que ficou diferente do padrão fica em amarelo"
    )
    await pagina.click(".acessos button:has-text('Salvar acessos')")
    await pagina.waitForSelector(`.aviso:not([data-fora])`, { timeout: 10000 })
    ok(
      (await textoDe(pagina, ".aviso")) ===
        "Acessos salvos: 3 mudanças. Vale a partir do próximo clique de cada pessoa.",
      "o aviso confirma",
      await textoDe(pagina, ".aviso")
    )
    // O aviso entra antes da tabela refeita: espera o "sem salvar" sair.
    await pagina
      .locator(".acessos__pendentes")
      .waitFor({ state: "detached", timeout: 10000 })
      .catch(() => {})
    const depois = await daApi()
    ok(
      depois.acesso.cupons.includes("operacao") &&
        !depois.acesso.observabilidade.includes("operacao") &&
        !depois.acesso.carrinhos.includes("marketing"),
      "a API guardou as três",
      JSON.stringify(depois.acesso)
    )
    ok(
      depois.acesso.inicio.join() === "dono,operacao,marketing" &&
        depois.acesso.equipe.join() === "dono" &&
        Object.values(depois.acesso).every((papeis) => papeis.includes("dono")),
      "o Início, a Equipe e o dono seguem iguais"
    )
    ok(
      JSON.stringify(await lerTela()) !== JSON.stringify(tela) &&
        (await pagina.locator(".acessos td[data-mudado]").count()) === 3,
      "a tabela refeita é a salva, com as três em amarelo"
    )

    const { pagina: pOp } = op
    await pOp.goto(`${PAINEL}/`)
    const itens = await menu(pOp)
    ok(
      itens.includes("Cupons e descontos") && !itens.includes("Observabilidade"),
      "no próximo clique, o menu da operação já é outro",
      itens.join(", ")
    )
    await pOp.goto(`${PAINEL}/cupons`)
    ok((await textoDe(pOp, "h1")) === "Cupons e descontos", "os cupons abrem pra ela")
    await pOp.goto(`${PAINEL}/observabilidade`)
    ok(
      (await textoDe(pOp, "h1")) === "Essa área não é do seu papel",
      "a observabilidade fechou pra ela na hora"
    )
    ok(
      (await textoDe(pOp, ".sem-acesso p")).includes("“Observabilidade”") &&
        (await textoDe(pOp, ".sem-acesso p")).includes("Equipe e acessos"),
      "e a tela diz o que fechou e a quem pedir",
      await textoDe(pOp, ".sem-acesso p")
    )
    let r = await medusa("/dashboard/cupons", { metodo: "GET", token: tokenDaOperacao })
    ok(r.status === 200, "a API dos cupons responde a ela", String(r.status))
    r = await medusa("/dashboard/observabilidade", { metodo: "GET", token: tokenDaOperacao })
    ok(
      r.status === 403 && r.corpo.message === "sem_acesso",
      "e a da observabilidade, não",
      JSON.stringify(r)
    )

    // O convite de quem ainda não entrou diz o que o papel abre AGORA.
    const doMkt = pagina.locator(".linha", { hasText: MARKETING })
    await doMkt.locator("button", { hasText: "Mudar" }).click()
    const resumoDoMkt = (await doMkt.locator(".pessoa__mudar .campo__ajuda").textContent()) ?? ""
    ok(
      resumoDoMkt.startsWith("Marketing: abre") && !resumoDoMkt.includes("Carrinhos"),
      "o resumo do papel, no “Mudar”, é o da tabela nova",
      resumoDoMkt
    )
    const antesDoReenvio = quantos(MARKETING, doConvite)
    await doMkt.locator("button", { hasText: "Reenviar convite" }).click()
    const convite = await esperarEmail(MARKETING, doConvite, antesDoReenvio)
    ok(
      /Cupons e descontos/.test(convite?.text ?? "") &&
        !/Carrinhos abandonados/.test(convite?.text ?? ""),
      "o convite reenviado lista o que o papel abre agora",
      convite?.text?.split("\n").find((l) => l.startsWith("Com esse papel"))
    )

    // O que a tela não deixa, a API também não.
    const base = corpoDosAcessos(depois.acesso)
    const com = (papel, ...areas) => ({
      acesso: { ...base.acesso, [papel]: [...base.acesso[papel], ...areas] },
    })
    r = await medusa("/dashboard/acessos", { token: tokenDaOperacao, corpo: base })
    ok(
      r.status === 403 && r.corpo.message === "sem_acesso",
      "a operação não mexe nos acessos",
      JSON.stringify(r)
    )
    r = await medusa("/dashboard/acessos", {
      token: tokenDoDono,
      corpo: com("marketing", "equipe"),
    })
    ok(
      r.status === 400 && r.corpo.message === "linha_fixa",
      "ninguém ganha a Equipe",
      JSON.stringify(r)
    )
    r = await medusa("/dashboard/acessos", {
      token: tokenDoDono,
      corpo: com("marketing", "estornos"),
    })
    ok(
      r.status === 400 && r.corpo.message === "sem_a_area_de_fora",
      "o estorno não abre sem os Pedidos",
      JSON.stringify(r)
    )
    r = await medusa("/dashboard/acessos", {
      token: tokenDoDono,
      corpo: { acesso: { ...base.acesso, dono: ["inicio"] } },
    })
    ok(
      r.status === 400 && r.corpo.message === "acessos_invalidos",
      "a coluna do dono não se manda",
      JSON.stringify(r)
    )
    r = await medusa("/dashboard/acessos", { token: tokenDoDono, corpo: base })
    ok(
      r.status === 200 && Array.isArray(r.corpo.mudou) && r.corpo.mudou.length === 0,
      "salvar a mesma tabela não muda nada",
      JSON.stringify(r.corpo.mudou)
    )

    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    await hidratado(pagina, ".acessos .matriz__caixa input")
    await pagina.click(".acessos button:has-text('Voltar ao padrão')")
    ok(
      (await textoDe(pagina, ".acessos__pendentes")) === "3 mudanças sem salvar",
      "“Voltar ao padrão” desfaz as três na tela"
    )
    await pagina.click(".acessos button:has-text('Salvar acessos')")
    await pagina.waitForSelector(`.aviso:not([data-fora])`, { timeout: 10000 })
    await pagina
      .locator(".acessos__pendentes")
      .waitFor({ state: "detached", timeout: 10000 })
      .catch(() => {})
    const fim = await daApi()
    ok(
      JSON.stringify(fim.acesso) === JSON.stringify(fim.padrao),
      "salvo, a loja volta ao padrão",
      JSON.stringify(fim.acesso)
    )
    ok((await pagina.locator(".acessos td[data-mudado]").count()) === 0, "e nada fica em amarelo")
    await pOp.goto(`${PAINEL}/`)
    const deVolta = await menu(pOp)
    ok(
      deVolta.includes("Observabilidade") && !deVolta.includes("Cupons e descontos"),
      "e o menu da operação volta a ser o de antes",
      deVolta.join(", ")
    )
  }

  titulo("O dono cria um papel sob medida (0223)")
  const atende = await novaAba()
  {
    const { pagina } = dono
    const daApi = async () =>
      (await medusa("/dashboard/equipe", { metodo: "GET", token: tokenDoDono })).corpo
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    await hidratado(pagina, ".acessos .matriz__caixa input")

    await pagina.click(".acessos button:has-text('Criar papel')")
    await pagina.waitForSelector(".gaveta #p-nome")
    await hidratado(pagina, ".gaveta #p-nome")
    await pagina.fill("#p-nome", ATENDIMENTO)
    const criou = await avisoDoClique(pagina, () => pagina.click(".gaveta button[type=submit]"))
    ok(criou.startsWith(`Papel “${ATENDIMENTO}” criado.`), "o aviso confirma o papel novo", criou)
    let api = await daApi()
    const papel = (api.papeis ?? []).find((p) => p.nome === ATENDIMENTO)
    ok(
      Boolean(papel?.id?.startsWith("papel_")) && papel?.pessoas === 0,
      "a API tem o papel",
      JSON.stringify(api.papeis)
    )
    const id = papel?.id ?? "papel_nao_criado"
    ok(
      Object.entries(api.acesso).every(
        ([area, papeis]) => papeis.includes(id) === (area === "inicio")
      ),
      "o papel nasce abrindo só o Início"
    )
    const cabeca = pagina.locator(`.acessos th[data-papel="${id}"] .matriz__papel`)
    await cabeca.waitFor({ timeout: 10000 })
    ok((await cabeca.textContent())?.trim() === ATENDIMENTO, "a tabela ganha a coluna dele")

    const caixa = (area) =>
      pagina.locator(`.acessos tr[data-area="${area}"] td[data-papel="${id}"] input`)
    ok(
      (await caixa("contatos").count()) === 1,
      "no papel criado, o telefone dos clientes é caixinha"
    )
    ok(
      (await caixa("equipe").count()) === 0 && (await caixa("inicio").count()) === 0,
      "o Início e a Equipe seguem sem caixinha"
    )
    for (const area of ["pedidos", "carrinhos", "clientes", "contatos"]) await caixa(area).check()
    ok(
      (await textoDe(pagina, ".acessos__pendentes")) === "4 mudanças sem salvar",
      "a tela conta as quatro",
      await textoDe(pagina, ".acessos__pendentes")
    )
    ok(
      (await pagina.locator(`.acessos td[data-papel="${id}"][data-mudado]`).count()) === 0,
      "o papel criado não tem padrão pra ficar em amarelo"
    )
    const salvou = await avisoDoClique(pagina, () =>
      pagina.click(".acessos button:has-text('Salvar acessos')")
    )
    ok(
      salvou === "Acessos salvos: 4 mudanças. Vale a partir do próximo clique de cada pessoa.",
      "salvo",
      salvou
    )
    await pagina
      .locator(".acessos__pendentes")
      .waitFor({ state: "detached", timeout: 10000 })
      .catch(() => {})
    api = await daApi()
    const abre = (area) => api.acesso[area]?.includes(id)
    ok(
      ["inicio", "pedidos", "carrinhos", "clientes", "contatos"].every(abre) &&
        !["estornos", "produtos", "cupons", "observabilidade", "equipe"].some(abre),
      "a API guardou o que foi marcado, e só",
      JSON.stringify(Object.keys(api.acesso).filter(abre))
    )

    // O convite com o papel criado.
    const antes = quantos(ATENDE, doConvite)
    await pagina.click("text=Convidar pessoa")
    await pagina.waitForSelector(".gaveta #c-nome")
    await hidratado(pagina, ".gaveta #c-nome")
    await pagina.fill("#c-nome", "Atende Teste")
    await pagina.fill("#c-email", ATENDE)
    await pagina.selectOption("#c-papel", id)
    await pagina.click(".gaveta button[type=submit]")
    await pagina.waitForSelector(".gaveta", { state: "detached", timeout: 10000 })
    const convite = await esperarEmail(ATENDE, doConvite, antes)
    const linhaDoConvite =
      convite?.text?.split("\n").find((l) => l.startsWith("Com esse papel")) ?? ""
    ok(
      (convite?.text ?? "").includes(`com o papel ${ATENDIMENTO}.`) &&
        linhaDoConvite.includes("Pedidos") &&
        linhaDoConvite.includes("Telefone e endereço dos clientes") &&
        !linhaDoConvite.includes("Cupons"),
      "o convite diz o nome do papel e o que ele abre",
      linhaDoConvite
    )
    const linha = pagina.locator(".linha", { hasText: ATENDE })
    await linha.waitFor({ timeout: 10000 })
    ok(
      (await linha.locator(".status", { hasText: ATENDIMENTO }).count()) === 1,
      "a lista mostra o nome do papel"
    )

    // A pessoa entra, e abre só o que o papel abre.
    const { contexto, pagina: pAt } = atende
    const cookie = await entrar(pAt, contexto, ATENDE)
    ok(caminho(pAt) === "/" && Boolean(cookie), "quem tem o papel criado entra", pAt.url())
    const tokenDoAtende = cookie?.value ?? ""
    const itens = await menu(pAt)
    ok(
      ["Início", "Pedidos", "Carrinhos abandonados", "Clientes"].every((i) => itens.includes(i)) &&
        !["Produtos", "Cupons e descontos", "Observabilidade", "Configurações", "CRM"].some((i) =>
          itens.includes(i)
        ),
      "o menu é o do papel criado",
      itens.join(", ")
    )
    ok(
      (await textoDe(pAt, ".lateral .quem__papel")) === ATENDIMENTO,
      "o nome do papel aparece embaixo do nome da pessoa"
    )
    await pAt.goto(`${PAINEL}/cupons`)
    ok((await textoDe(pAt, "h1")) === "Essa área não é do seu papel", "cupons fechados na tela")
    let r = await medusa("/dashboard/cupons", { metodo: "GET", token: tokenDoAtende })
    ok(r.status === 403 && r.corpo.message === "sem_acesso", "e na API", JSON.stringify(r))
    r = await medusa("/dashboard/eu", { metodo: "GET", token: tokenDoAtende })
    ok(
      r.corpo.membro?.papel_nome === ATENDIMENTO,
      "o /eu diz o nome do papel",
      JSON.stringify(r.corpo.membro)
    )
    // Com o telefone dos clientes: o WhatsApp dos carrinhos passa da permissão (e não acha o carrinho).
    const whatsapp = () =>
      medusa("/dashboard/carrinhos/cart_01K0000000000000000000000/whatsapp", {
        token: tokenDoAtende,
        corpo: {},
      })
    r = await whatsapp()
    ok(r.status === 404, "com o telefone dos clientes, chama no WhatsApp", JSON.stringify(r))
    await pAt.goto(`${PAINEL}/clientes`)
    ok(
      (await pAt.locator("[data-visao-marketing]").count()) === 0,
      "e vê a lista inteira de clientes"
    )

    // O dono tira o telefone: vale no próximo clique.
    const semTel = corpoDosAcessos(api.acesso)
    semTel.acesso[id] = semTel.acesso[id].filter((a) => a !== "contatos")
    r = await medusa("/dashboard/acessos", { token: tokenDoDono, corpo: semTel })
    ok(
      r.status === 200 && r.corpo.mudou?.length === 1,
      "o dono tira o telefone dos clientes",
      JSON.stringify(r.corpo)
    )
    r = await whatsapp()
    ok(
      r.status === 403 && r.corpo.message === "sem_permissao",
      "sem o telefone, o WhatsApp dos carrinhos fecha",
      JSON.stringify(r)
    )
    await pAt.goto(`${PAINEL}/clientes`)
    ok(
      (await textoDe(pAt, "[data-visao-marketing]")).includes("Visão do seu papel"),
      "e Clientes mostra só quem aceitou ofertas, como o marketing",
      await textoDe(pAt, "[data-visao-marketing]")
    )

    // O que a tela não deixa, a API também não.
    const base = corpoDosAcessos((await daApi()).acesso)
    const semOPapel = { acesso: { ...base.acesso } }
    delete semOPapel.acesso[id]
    r = await medusa("/dashboard/acessos", { token: tokenDoDono, corpo: semOPapel })
    ok(
      r.status === 409 && r.corpo.message === "papeis_mudaram",
      "a tabela sem a coluna de um papel que existe é recusada",
      JSON.stringify(r)
    )
    r = await medusa("/dashboard/acessos", {
      token: tokenDoDono,
      corpo: { acesso: { ...base.acesso, [id]: [...base.acesso[id], "equipe"] } },
    })
    ok(
      r.status === 400 && r.corpo.message === "linha_fixa",
      "o papel criado não ganha a Equipe",
      JSON.stringify(r)
    )
    r = await medusa("/dashboard/acessos", {
      token: tokenDoDono,
      corpo: { acesso: { ...base.acesso, marketing: [...base.acesso.marketing, "contatos"] } },
    })
    ok(
      r.status === 400 && r.corpo.message === "linha_fixa",
      "o marketing não ganha o telefone dos clientes pela tabela",
      JSON.stringify(r)
    )
    r = await medusa("/dashboard/papeis", {
      token: tokenDoDono,
      corpo: { nome: ATENDIMENTO.toUpperCase() },
    })
    ok(
      r.status === 409 && r.corpo.message === "nome_repetido",
      "nome repetido não passa",
      JSON.stringify(r)
    )
    r = await medusa("/dashboard/papeis", { token: tokenDoDono, corpo: { nome: "Operação" } })
    ok(
      r.status === 409 && r.corpo.message === "nome_repetido",
      "nem o nome de um papel de sempre",
      JSON.stringify(r)
    )
    r = await medusa("/dashboard/papeis", {
      token: tokenDoAtende,
      corpo: { nome: `Outro ${RODADA}` },
    })
    ok(r.status === 403, "quem não é dono não cria papel", JSON.stringify(r))
    r = await medusa(`/dashboard/papeis/${id}`, { token: tokenDoDono, corpo: { acao: "apagar" } })
    ok(
      r.status === 409 && r.corpo.message === "papel_com_gente",
      "papel com gente dentro não se apaga",
      JSON.stringify(r)
    )

    // Começar igual à operação: a coluna nasce copiada; e sem ninguém, apaga.
    r = await medusa("/dashboard/papeis", {
      token: tokenDoDono,
      corpo: { nome: `Cópia ${RODADA}`, igualA: "operacao" },
    })
    const copia = r.corpo.papel?.id
    api = await daApi()
    ok(
      r.status === 200 &&
        Object.values(api.acesso).every(
          (papeis) => papeis.includes(copia) === papeis.includes("operacao")
        ),
      "o papel que começa igual à operação abre o mesmo que ela",
      JSON.stringify(r)
    )
    r = await medusa(`/dashboard/papeis/${copia}`, {
      token: tokenDoDono,
      corpo: { acao: "apagar" },
    })
    api = await daApi()
    ok(
      r.status === 200 &&
        !(api.papeis ?? []).some((p) => p.id === copia) &&
        !api.acesso.inicio.includes(copia),
      "sem ninguém dentro, o papel se apaga (com a coluna)",
      JSON.stringify(r)
    )

    // Renomear, pela tela.
    const novoNome = `Suporte ${RODADA}`
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    await hidratado(pagina, ".acessos .matriz__caixa input")
    await pagina.click(`.acessos th[data-papel="${id}"] .matriz__papel`)
    await pagina.waitForSelector(".gaveta #p-renomear")
    await hidratado(pagina, ".gaveta #p-renomear")
    ok(
      (await pagina
        .locator(".gaveta .papel__apagar button", { hasText: "Apagar papel" })
        .count()) === 0 &&
        (await textoDe(pagina, ".gaveta .papel__apagar")).includes("mude antes o papel"),
      "com gente dentro, a gaveta explica em vez de oferecer o apagar"
    )
    await pagina.fill("#p-renomear", novoNome)
    const renomeou = await avisoDoClique(pagina, () =>
      pagina.click(".gaveta button:has-text('Salvar nome')")
    )
    ok(renomeou === `Agora o papel se chama “${novoNome}”.`, "renomeado", renomeou)
    r = await medusa("/dashboard/eu", { metodo: "GET", token: tokenDoAtende })
    ok(
      r.corpo.membro?.papel_nome === novoNome,
      "a pessoa já vê o nome novo",
      JSON.stringify(r.corpo.membro)
    )

    // No celular, as abas de quem tem o papel criado são as primeiras do menu dele.
    {
      const cel = await novaAba({ width: 390, height: 844 })
      await cel.contexto.addCookies([
        {
          name: "painel_sessao",
          value: tokenDoAtende,
          url: PAINEL,
          httpOnly: true,
          sameSite: "Lax",
        },
      ])
      await cel.pagina.goto(`${PAINEL}/`)
      await hidratado(cel.pagina, ".abas-cel button")
      const abas = (
        await cel.pagina.locator(".abas-cel a, .abas-cel button").allTextContents()
      ).map((t) => t.trim())
      ok(
        abas.join("|") === "Início|Pedidos|Carrinhos|Clientes|Mais",
        "as abas do celular são as do papel criado",
        abas.join("|")
      )
      await cel.contexto.close()
    }

    // O dono troca a pessoa pra operação pelo "Mudar", e o papel fica vazio: aí apaga, pela tela.
    const doAtende = pagina.locator(".linha", { hasText: ATENDE })
    await doAtende.locator("button", { hasText: "Mudar" }).click()
    ok(
      (await doAtende.locator(".pessoa__criados label", { hasText: novoNome }).count()) === 1,
      "o “Mudar” oferece os papéis criados"
    )
    await doAtende.locator("label", { hasText: "Operação" }).locator("input").check()
    const mudou = await avisoDoClique(pagina, () =>
      doAtende.locator("button", { hasText: "Salvar papel" }).click()
    )
    ok(mudou.includes("agora é Operação"), "a pessoa vai pra operação", mudou)
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    await hidratado(pagina, ".acessos .matriz__caixa input")
    await pagina.click(`.acessos th[data-papel="${id}"] .matriz__papel`)
    await pagina.waitForSelector(".gaveta .papel__apagar button")
    await pagina.click(".gaveta .papel__apagar button:has-text('Apagar papel')")
    const apagou = await avisoDoClique(pagina, () =>
      pagina.click(".gaveta .confirma button:has-text('Apagar papel')")
    )
    ok(apagou.startsWith("Papel apagado."), "o papel se apaga pela tela", apagou)
    await pagina
      .locator(`.acessos th[data-papel="${id}"]`)
      .waitFor({ state: "detached", timeout: 10000 })
      .catch(() => {})
    ok(
      (await pagina.locator(`.acessos th[data-papel="${id}"]`).count()) === 0,
      "e a coluna sai da tabela"
    )
    api = await daApi()
    ok(!(api.papeis ?? []).some((p) => p.id === id), "a API não tem mais o papel")
    await atende.contexto.close()
  }

  titulo("O dono muda o papel, e vale no próximo clique")
  {
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    await hidratado(pagina, ".bloco__cabeca .btn")
    const linha = pagina.locator(".linha", { hasText: OPERACAO })
    ok(
      (await linha.textContent())?.includes("último acesso hoje"),
      "a lista mostra o último acesso",
      await linha.textContent()
    )
    await linha.locator("button", { hasText: "Mudar" }).click()
    await linha.locator("label", { hasText: "Marketing" }).locator("input").check()
    await linha.locator("button", { hasText: "Salvar papel" }).click()
    await pagina.waitForSelector(`.aviso:not([data-fora])`, { timeout: 10000 })
    ok(
      (await textoDe(pagina, ".aviso")).includes("agora é Marketing"),
      "o aviso confirma o papel novo"
    )

    const { pagina: pOp } = op
    await pOp.goto(`${PAINEL}/`)
    const itens = await menu(pOp)
    ok(
      itens.includes("Cupons e descontos") && !itens.includes("Pedidos"),
      "o menu da pessoa já é o do marketing",
      itens.join(", ")
    )
    await pOp.goto(`${PAINEL}/pedidos`)
    ok(
      (await textoDe(pOp, "h1")) === "Essa área não é do seu papel",
      "pedidos fechou pra ela na hora"
    )

    const r = await medusa("/dashboard/eu", { metodo: "GET", token: tokenDoDono })
    const eu = r.corpo.membro?.id
    const s = await medusa(`/dashboard/equipe/${eu}`, {
      token: tokenDoDono,
      corpo: { acao: "remover" },
    })
    ok(
      s.status === 409 && s.corpo.message === "a_si_mesmo",
      "o dono não se remove",
      JSON.stringify(s)
    )
    const p = await medusa(`/dashboard/equipe/${eu}`, {
      token: tokenDoDono,
      corpo: { papel: "operacao" },
    })
    ok(
      p.status === 409 && p.corpo.message === "a_si_mesmo",
      "nem muda o próprio papel",
      JSON.stringify(p)
    )
  }

  titulo("O dono tira da equipe, e o acesso cai na hora")
  {
    const { pagina } = dono
    const linha = pagina.locator(".linha", { hasText: OPERACAO })
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    await hidratado(pagina, ".bloco__cabeca .btn")
    await linha.locator("button", { hasText: "Mudar" }).click()
    await linha.locator("button", { hasText: "Tirar da equipe" }).click()
    await linha.locator(".confirma button", { hasText: "Tirar da equipe" }).click()
    await pagina.waitForSelector(`.aviso:not([data-fora])`, { timeout: 10000 })
    ok((await textoDe(pagina, ".aviso")).includes("saiu da equipe"), "o aviso confirma")
    // O aviso entra antes da lista refeita (uns 20 ms no `next dev`): espera a
    // linha sair em vez de contar na hora. Se ela ficar, os 10 s passam e falha.
    await linha.waitFor({ state: "detached", timeout: 10000 }).catch(() => {})
    ok((await linha.count()) === 0, "a pessoa sai da lista")

    const { pagina: pOp } = op
    await pOp.goto(`${PAINEL}/`)
    await pOp.waitForURL(/\/entrar/, { timeout: 15000 }).catch(() => {})
    ok(caminho(pOp) === "/entrar", "no próximo clique, volta pro “entrar”", pOp.url())
    ok(
      (await textoDe(pOp, ".entrar__recado")).includes("acesso ao painel foi encerrado"),
      "com o recado de que o acesso acabou"
    )
    const r = await medusa("/dashboard/eu", { metodo: "GET", token: tokenDaOperacao })
    ok(
      r.status === 401 && r.corpo.message === "fora_da_equipe",
      "o token de 30 dias não abre mais nada",
      JSON.stringify(r)
    )
    const antes = quantos(OPERACAO, doPainel)
    await pedirCodigo(pOp, OPERACAO)
    await esperar(1500)
    ok(quantos(OPERACAO, doPainel) === antes, "e não recebe mais código")
  }

  titulo("No celular")
  {
    const { contexto, pagina } = await novaAba({ width: 390, height: 844 })
    await contexto.addCookies([
      { name: "painel_sessao", value: tokenDoDono, url: PAINEL, httpOnly: true, sameSite: "Lax" },
    ])
    await pagina.goto(`${PAINEL}/`)
    await hidratado(pagina, ".abas-cel button")
    ok(await pagina.locator(".abas-cel").isVisible(), "as abas de baixo aparecem")
    ok(!(await pagina.locator(".lateral").isVisible()), "o menu lateral some")
    const abas = (await pagina.locator(".abas-cel a, .abas-cel button").allTextContents()).map(
      (t) => t.trim()
    )
    ok(
      abas.join("|") === "Início|Pedidos|Produtos|Clientes|Mais",
      "as abas do dono",
      abas.join("|")
    )
    ok(await semRolagemDeLado(pagina), "sem rolagem de lado no Início")
    await pagina.click(".abas-cel button")
    await pagina.waitForSelector(".folha[role=dialog]")
    ok(
      (await pagina.locator(".folha .nav a", { hasText: "Configurações" }).count()) === 1,
      "o “Mais” tem o menu inteiro"
    )
    await pagina.keyboard.press("Escape")
    ok((await pagina.locator(".folha").count()) === 0, "o “Mais” fecha no Esc")
    await pagina.click(".topo-cel .avatar")
    await pagina.click(".folha .nav a:has-text('Configurações')")
    // As Configurações abrem na primeira aba, a dos dados da empresa.
    await pagina.waitForURL(/\/configuracoes\/empresa$/, { timeout: 15000 })
    ok((await pagina.locator(".folha").count()) === 0, "escolher pra onde ir fecha o “Mais”")
    ok(await semRolagemDeLado(pagina), "sem rolagem de lado nas configurações")
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    await hidratado(pagina, ".acessos .matriz__caixa input")
    ok(await semRolagemDeLado(pagina), "nem na tabela dos acessos")
    ok(
      await pagina
        .locator(".acessos .tabela-rola")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      "a tabela cabe inteira, sem rolar dentro dela"
    )
    await contexto.close()
  }

  titulo("Sair")
  {
    const { pagina } = dono
    await pagina.goto(`${PAINEL}/`)
    await hidratado(pagina, ".lateral .quem__sair")
    await pagina.click(".lateral .quem__sair")
    await pagina.waitForURL(/\/entrar\?saiu=1$/, { timeout: 15000 }).catch(() => {})
    ok(
      (await textoDe(pagina, ".entrar__recado")) === "Você saiu do painel.",
      "sai, com o recado",
      pagina.url()
    )
    await pagina.goto(`${PAINEL}/configuracoes/equipe`)
    ok(caminho(pagina) === "/entrar", "e o painel fecha")
  }

  titulo("Console")
  ok(errosDeConsole.length === 0, "nenhum erro no console", errosDeConsole.slice(0, 5).join(" | "))
} catch (e) {
  falhou(e instanceof Error ? e.message : String(e))
} finally {
  // Arruma a casa: a tabela dos acessos volta a ser a de antes, e quem esta
  // rodada convidou sai da equipe. O token do dono ainda vale no Medusa
  // depois do "Sair" — ele só existia no cookie.
  if (tokenDoDono && acessoDeAntes)
    await medusa("/dashboard/acessos", {
      token: tokenDoDono,
      corpo: corpoDosAcessos(acessoDeAntes),
    })
  if (tokenDoDono) {
    const r = await medusa("/dashboard/equipe", { metodo: "GET", token: tokenDoDono })
    for (const m of r.corpo.membros ?? [])
      if (m.email.includes(RODADA))
        await medusa(`/dashboard/equipe/${m.id}`, {
          token: tokenDoDono,
          corpo: { acao: "remover" },
        })
    // Os papéis que a rodada criou, depois de tirar as pessoas deles.
    for (const p of r.corpo.papeis ?? [])
      if (p.nome.includes(RODADA))
        await medusa(`/dashboard/papeis/${p.id}`, { token: tokenDoDono, corpo: { acao: "apagar" } })
  }
  await navegador.close()
  await resend.fechar()
}

process.exit(resumo())
