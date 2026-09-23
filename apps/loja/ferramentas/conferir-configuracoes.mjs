/**
 * CONFERIDOR DAS CONFIGURAÇÕES — o contrato e os três modos de frete.
 *
 *   node ferramentas/conferir-configuracoes.mjs [url-da-loja]
 *
 * Variáveis: MEDUSA_BACKEND_URL, NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 *            ADMIN_EMAIL, ADMIN_SENHA, CHROMIUM.
 *
 * ┌─ POR QUE ESTE CONFERIDOR EXISTE ───────────────────────────────────────┐
 * │ A política de frete é escrita DUAS vezes: o tipo no backend            │
 * │ (`src/lib/configuracoes.ts`) e o tipo na loja (`src/lib/               │
 * │ configuracoes.ts`). São pacotes separados, então é contrato de rede —  │
 * │ e contrato de rede diverge em silêncio. Um `piso` que vira `pisoMinimo`│
 * │ de um lado compila nos dois e só aparece como "frete grátis a partir   │
 * │ de R$ 0,00" na faixa amarela do topo do site.                          │
 * │                                                                         │
 * │ Então aqui a rota é PEDIDA DE VERDADE e o formato é conferido campo a  │
 * │ campo — e, com credencial de admin, os três modos são gravados e a     │
 * │ tela é conferida depois de cada um.                                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * A PARTE DOS TRÊS MODOS MEXE NO BANCO. Ela grava e, no fim, RESTAURA o que
 * estava antes — inclusive se um teste falhar no meio. Sem credencial, ela é
 * pulada e o conferidor só valida o contrato, o que já vale a rodada.
 */

import { chromium } from "playwright"

const LOJA = process.argv[2] ?? process.env.LOJA ?? "http://localhost:3000"
const MEDUSA = process.env.MEDUSA_BACKEND_URL ?? "http://127.0.0.1:9000"
const CHAVE = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""
const CROMO = process.env.CHROMIUM || undefined
const EMAIL = process.env.ADMIN_EMAIL
const SENHA = process.env.ADMIN_SENHA

let passou = 0
let falhou = 0

function confere(nome, ok, detalhe = "") {
  console.log(`${ok ? "  ok  " : " FALHA"} ${nome}${ok || !detalhe ? "" : `\n         ${detalhe}`}`)
  ok ? passou++ : falhou++
}

const lerPublica = async () => {
  const r = await fetch(`${MEDUSA}/store/configuracoes`, {
    headers: { "x-publishable-api-key": CHAVE },
  })
  if (!r.ok) throw new Error(`Medusa respondeu ${r.status} — confira a CHAVE`)
  return (await r.json()).configuracoes
}

/* ── 1. o contrato ───────────────────────────────────────────────────── */

const c = await lerPublica()

confere("a rota devolve um objeto de configurações", c && typeof c === "object")
confere(
  "tem as quatro seções: frete, empresa, atendimento, home",
  ["frete", "empresa", "atendimento", "home"].every((k) => k in c),
  `veio ${Object.keys(c ?? {}).join(", ")}`
)
confere(
  "o modo do frete é um dos três conhecidos",
  ["nenhuma", "gratis", "fixo"].includes(c.frete?.modo),
  `veio ${JSON.stringify(c.frete?.modo)}`
)
confere(
  "empresa tem razaoSocial, cnpj e endereco (texto ou null)",
  ["razaoSocial", "cnpj", "endereco"].every(
    (k) => k in c.empresa && (c.empresa[k] === null || typeof c.empresa[k] === "string")
  ),
  JSON.stringify(c.empresa)
)
confere(
  "atendimento tem whatsapp, email, horario e prazoDePostagem",
  ["whatsapp", "email", "horario", "prazoDePostagem"].every((k) => k in c.atendimento),
  JSON.stringify(c.atendimento)
)
/* O vídeo da história da marca: nenhum, ou inteiro — endereço e as duas
   medidas, que é o que a home usa pra reservar o espaço antes de ele chegar. */
confere(
  "home.video é null ou { url, largura, altura }",
  c.home?.video === null ||
    (typeof c.home?.video?.url === "string" &&
      Number.isInteger(c.home.video.largura) &&
      Number.isInteger(c.home.video.altura)),
  JSON.stringify(c.home)
)
confere(
  "quando há promoção, ela traz piso e alvo",
  c.frete.modo === "nenhuma" || (typeof c.frete.piso === "number" && "alvo" in c.frete),
  JSON.stringify(c.frete)
)
/* O número que vale é decimal em reais, como o resto do Medusa v2 — não
   centavos. Um dia em que isto virar 14990 a loja mostra o piso certo com a
   vírgula no lugar errado, que é o tipo de erro que passa no olho. */
confere(
  "o piso é decimal em reais, não centavos",
  c.frete.modo === "nenhuma" || c.frete.piso < 100000,
  JSON.stringify(c.frete)
)

/* ── 2. os três modos, na tela ───────────────────────────────────────── */

if (!EMAIL || !SENHA) {
  console.log("\n  ⚠  sem ADMIN_EMAIL/ADMIN_SENHA — os três modos não foram testados")
} else {
  const entrar = await fetch(`${MEDUSA}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  })
  if (!entrar.ok) throw new Error(`login do admin falhou: ${entrar.status}`)
  const { token } = await entrar.json()

  /*
    A BASE É A DO ADMIN, e não a pública: a rota pública não mostra a
    cotação de emergência, e gravar em cima dela apagava o frete de
    emergência de quem rodasse este teste. O POST troca o objeto inteiro —
    só o frete muda aqui; o resto vai como estava.
  */
  const { configuracoes: base } = await fetch(`${MEDUSA}/admin/configuracoes`, {
    headers: { authorization: `Bearer ${token}` },
  }).then((r) => r.json())

  const gravar = async (frete) => {
    const r = await fetch(`${MEDUSA}/admin/configuracoes`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...base, frete }),
    })
    if (!r.ok) throw new Error(`gravar falhou: ${r.status}`)
    return r.json()
  }

  const navegador = await chromium.launch(CROMO ? { executablePath: CROMO } : {})
  /*
    SEM CACHE DO NAVEGADOR. Sem isto o teste mede o cache do Chromium, não o
    da loja: o HTML da home vem do disco do navegador e o teste "falha" com a
    tela antiga mesmo depois de a etiqueta ter caído do lado do servidor.
    Custou uma hora descobrir — fica escrito.
  */
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { "cache-control": "no-cache", pragma: "no-cache" },
  })
  const pagina = await contexto.newPage()

  /** O texto que a loja mostra sobre frete, em três lugares diferentes. */
  const oQueATelaDiz = async () => {
    /*
      UMA VISITA DE AQUECIMENTO ANTES. O aviso do admin marca a página como
      vencida, e a loja refaz ela no fundo: a primeira visita depois de
      salvar ainda recebe a versão velha (e dispara a nova), a segunda já vem
      certa. Sem isto o teste lê sempre a tela da troca ANTERIOR.
    */
    await fetch(`${LOJA}/?_=${Date.now()}`, { headers: { "cache-control": "no-cache" } })
    await new Promise((pronto) => setTimeout(pronto, 1500))
    await pagina.goto(`${LOJA}/?_=${Date.now()}`, { waitUntil: "networkidle" })
    const esteira = await pagina.$$eval(".anuncio__lista li", (n) =>
      n.map((e) => e.textContent.trim())
    )
    const trustbar = await pagina.$$eval(".trustbar__list li", (n) =>
      n.map((e) => e.textContent.replace(/\s+/g, " ").trim())
    )
    const tarjas = await pagina.$$eval(".produto__frete", (n) =>
      n.map((e) => e.textContent.trim())
    )
    return { esteira, trustbar, tarjas }
  }

  try {
    /* ── sem promoção: a loja não pode falar de frete grátis em lugar nenhum ── */
    await gravar({ modo: "nenhuma" })
    let tela = await oQueATelaDiz()
    confere(
      "modo=nenhuma: a esteira do topo não fala de frete",
      !tela.esteira.some((t) => /frete/i.test(t)),
      tela.esteira.join(" | ")
    )
    confere(
      "modo=nenhuma: a trustbar não tem card de frete",
      !tela.trustbar.some((t) => /frete/i.test(t)),
      tela.trustbar.join(" | ")
    )
    confere(
      "modo=nenhuma: nenhum card de produto tem tarja de frete",
      tela.tarjas.length === 0,
      tela.tarjas.join(" | ")
    )

    /* ── grátis: o número da tela é o número gravado ── */
    await gravar({ modo: "gratis", piso: 199.9, alvo: "mais-barata", tetoDeCusto: null })
    tela = await oQueATelaDiz()
    confere(
      "modo=gratis: a esteira anuncia o piso GRAVADO, não o antigo",
      tela.esteira.some((t) => t.includes("199,90") && /grátis/i.test(t)),
      tela.esteira.join(" | ")
    )
    confere(
      "modo=gratis: a trustbar mostra o mesmo piso",
      tela.trustbar.some((t) => t.includes("199,90")),
      tela.trustbar.join(" | ")
    )

    /* ── fixo: muda a PALAVRA, não só o número ── */
    await gravar({ modo: "fixo", piso: 99, preco: 9.9, alvo: "mais-barata", tetoDeCusto: null })
    tela = await oQueATelaDiz()
    confere(
      "modo=fixo: a esteira diz o preço do frete, e não 'grátis'",
      tela.esteira.some((t) => t.includes("9,90") && !/grátis/i.test(t)),
      tela.esteira.join(" | ")
    )
    confere(
      "modo=fixo: a trustbar também deixa de dizer 'grátis'",
      tela.trustbar.some((t) => t.includes("9,90")) &&
        !tela.trustbar.some((t) => /frete grátis/i.test(t)),
      tela.trustbar.join(" | ")
    )

    /* ── lixo no metadata não derruba a loja ── */
    const sujo = await gravar({ modo: "banana", piso: "muito" })
    confere(
      "modo inválido vira 'nenhuma' em vez de erro",
      sujo.configuracoes.frete.modo === "nenhuma",
      JSON.stringify(sujo.configuracoes.frete)
    )
  } finally {
    // Devolve o que estava antes, mesmo se algo acima explodiu.
    await gravar(c.frete)
    await navegador.close()
    console.log("\n  ↩  política restaurada para o que estava antes")
  }

  const depois = await lerPublica()
  confere(
    "a política voltou ao que era antes do teste",
    JSON.stringify(depois.frete) === JSON.stringify(c.frete),
    `antes ${JSON.stringify(c.frete)}, agora ${JSON.stringify(depois.frete)}`
  )
}

console.log(`\n${passou} passou, ${falhou} falhou\n`)
process.exit(falhou ? 1 : 0)
