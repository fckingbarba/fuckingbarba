import { emailDoCrm } from "../../emails/crm"
import {
  cabeNoPublico,
  caminhoQueVale,
  chaveDaCampanha,
  emailDaCampanha,
  lerCampanha,
  marcaDaCampanha,
  noControleDaCampanha,
  paragrafos,
  resultadoDaCampanha,
  resultadoFechou,
  resultadoGuardado,
  textoDoBanco,
  bancoDoTexto,
  varianteDa,
  type TextoDaCampanha,
} from "../campanhas"

/**
 * As campanhas do CRM (0206): o formulário conferido, o sorteio do assunto e
 * do controle, o e-mail (oferta, sem cupom) e o resultado — quem comprou em 7
 * dias, por assunto, contra o controle.
 */

const MIN = 60 * 1000
const DIA = 24 * 60 * MIN
const AGORA = new Date("2026-09-29T15:00:00Z")
const PUBLICADOS = new Set(["fator-de-crescimento-para-barba", "oleo-para-barba"])
const ler = (extra: Record<string, unknown>, agendar = false) =>
  lerCampanha(
    {
      nome: "Black Friday",
      assunto: "Começou a Black",
      assuntoB: "",
      previa: "Até amanhã, na loja toda.",
      titulo: "Black Friday",
      texto: "A Black chegou.\n\nOs preços valem até domingo.",
      botao: { texto: "Ver a loja", caminho: "/" },
      produtos: ["fator-de-crescimento-para-barba"],
      publico: "todos",
      ...extra,
    },
    { publicados: PUBLICADOS, agora: AGORA, agendar }
  )

describe("o formulário", () => {
  it("o que vale fica, sem espaço sobrando; o assunto B vazio é sem teste", () => {
    const r = ler({ nome: "  Black   Friday  " })
    expect(r.ok && r.campanha).toEqual({
      nome: "Black Friday",
      assunto: "Começou a Black",
      assuntoB: null,
      previa: "Até amanhã, na loja toda.",
      titulo: "Black Friday",
      texto: "A Black chegou.\n\nOs preços valem até domingo.",
      botao: { texto: "Ver a loja", caminho: "/" },
      produtos: ["fator-de-crescimento-para-barba"],
      publico: "todos",
      jeito: "oferta",
    })
    expect(r.ok && r.agenda).toBeNull()
  })

  it("cada campo que errou, com o porquê", () => {
    const r = ler({
      nome: "",
      assunto: "oi",
      assuntoB: "começou a black",
      titulo: "",
      texto: "   ",
      botao: { texto: "Ver", caminho: "https://outro.site" },
      produtos: ["fator-de-crescimento-para-barba", "nao-existe"],
      publico: "vip",
    })
    expect(r.ok).toBe(false)
    expect(!r.ok && Object.keys(r.erros).sort()).toEqual(
      ["assunto", "botao", "nome", "produtos", "publico", "texto", "titulo"].sort()
    )
    // O assunto B igual ao A (sem contar maiúsculas) também é erro.
    const b = ler({ assuntoB: "COMEÇOU A BLACK" })
    expect(!b.ok && b.erros.assuntoB).toBe("O assunto B tem que ser diferente do A.")
    expect(ler({ produtos: ["a", "b", "c", "d"] }).ok).toBe(false)
  })

  it("o jeito: sem ele, oferta; o recado vale; outro, não", () => {
    const recado = ler({ jeito: "recado" })
    expect(recado.ok && recado.campanha.jeito).toBe("recado")
    const torto = ler({ jeito: "sms" })
    expect(!torto.ok && torto.erros.jeito).toBe("Escolha como o e-mail chega.")
  })

  it("no recado, nenhum campo escrito com emoji; na oferta, pode", () => {
    const r = ler({
      jeito: "recado",
      assunto: "Chegou 🔥",
      assuntoB: "Tá na loja ⚡",
      previa: "Corre 🏃",
      titulo: "Novidade ✨",
      texto: "O óleo novo chegou. 👊",
      botao: { texto: "Ver 👀", caminho: "/" },
    })
    expect(r.ok).toBe(false)
    expect(!r.ok && Object.keys(r.erros).sort()).toEqual(
      ["assunto", "assuntoB", "botao", "previa", "texto", "titulo"].sort()
    )
    expect(!r.ok && r.erros.assunto).toBe("No recado, sem emoji: ele leva o e-mail pra Promoções.")
    expect(ler({ jeito: "oferta", assunto: "Chegou 🔥" }).ok).toBe(true)
    // O erro de antes fica: o assunto curto é "Escreva o assunto", com ou sem emoji.
    const curto = ler({ jeito: "recado", assunto: "🔥" })
    expect(!curto.ok && curto.erros.assunto).toBe("Escreva o assunto.")
  })

  it("o botão: a página inicial, a lista, ou um produto publicado", () => {
    expect(caminhoQueVale("/", PUBLICADOS)).toBe(true)
    expect(caminhoQueVale("/produtos", PUBLICADOS)).toBe(true)
    expect(caminhoQueVale("/produtos/oleo-para-barba", PUBLICADOS)).toBe(true)
    expect(caminhoQueVale("/produtos/nao-existe", PUBLICADOS)).toBe(false)
    expect(caminhoQueVale("//outro.site", PUBLICADOS)).toBe(false)
    // Sem botão nenhum, vale.
    expect(ler({ botao: { texto: "", caminho: "" } }).ok).toBe(true)
  })

  it("agendar: entre 5 minutos e 120 dias daqui", () => {
    const em = (ms: number) => new Date(AGORA.getTime() + ms).toISOString()
    expect(ler({ agenda: em(10 * MIN) }, true).ok).toBe(true)
    const cedo = ler({ agenda: em(2 * MIN) }, true)
    expect(!cedo.ok && cedo.erros.agenda).toBe("Escolha uma hora daqui a pelo menos 5 minutos.")
    expect(ler({ agenda: em(121 * DIA) }, true).ok).toBe(false)
    expect(ler({ agenda: "amanhã" }, true).ok).toBe(false)
    // Sem agendar, a agenda nem é lida.
    expect(ler({ agenda: "amanhã" }).ok).toBe(true)
  })

  it("os parágrafos: separados por linha em branco, cada um numa linha", () => {
    expect(paragrafos("Um\ncom quebra.\n\n\n  Dois.  \n")).toEqual(["Um com quebra.", "Dois."])
  })
})

describe("o sorteio", () => {
  const emails = Array.from({ length: 2000 }, (_, i) => `pessoa${i}@exemplo.com`)

  it("o assunto: metade de cada, sempre o mesmo pro mesmo e-mail", () => {
    const b = emails.filter((e) => varianteDa(e, "cmp_1") === "b").length
    expect(b).toBeGreaterThan(900)
    expect(b).toBeLessThan(1100)
    expect(varianteDa("Pessoa1@Exemplo.com ", "cmp_1")).toBe(
      varianteDa("pessoa1@exemplo.com", "cmp_1")
    )
  })

  it("o controle: uns 5%, outro sorteio em cada campanha", () => {
    const um = emails.filter((e) => noControleDaCampanha(e, "cmp_1"))
    const outro = emails.filter((e) => noControleDaCampanha(e, "cmp_2"))
    expect(um.length).toBeGreaterThan(60)
    expect(um.length).toBeLessThan(140)
    expect(um).not.toEqual(outro)
  })

  it("a chave e a marca do link", () => {
    expect(chaveDaCampanha("cmp_1", "rafael@exemplo.com")).toBe("cmp_1|rafael@exemplo.com")
    expect(marcaDaCampanha("Black Friday 2026!")).toBe("campanha-black-friday-2026")
    expect(marcaDaCampanha("!!!")).toBe("campanha")
  })

  it("os públicos pela etapa: o em risco leva o sunset junto", () => {
    expect(cabeNoPublico("clientes", "recorrente")).toBe(true)
    expect(cabeNoPublico("clientes", "lead")).toBe(false)
    expect(cabeNoPublico("leads", "lead")).toBe(true)
    expect(cabeNoPublico("em-risco", "sunset")).toBe(true)
    expect(cabeNoPublico("em-risco", "recorrente")).toBe(false)
    expect(cabeNoPublico("todos", "qualquer")).toBe(true)
  })
})

describe("o e-mail", () => {
  const texto = (extra: Partial<TextoDaCampanha> = {}): TextoDaCampanha => ({
    nome: "Black Friday",
    assunto: "Começou a Black",
    assuntoB: "A Black da FuckingBarba chegou",
    previa: "Até domingo.",
    titulo: "Black Friday",
    texto: "A Black chegou.\n\nOs preços valem até domingo.",
    botao: { texto: "Ver a loja", caminho: "/" },
    produtos: [],
    publico: "todos",
    jeito: "oferta",
    ...extra,
  })
  const p = {
    para: "rafael@exemplo.com",
    nome: "rafael silva",
    produtos: [
      {
        nome: "Óleo para Barba",
        handle: "oleo-para-barba",
        imagem: null,
        preco: 59.9,
        precoCheio: null,
      },
    ],
    sair: { pagina: "https://loja/sair/x", umClique: "https://api/crm/sair?t=x" },
    loja: { url: "https://www.fuckingbarba.com.br", whatsapp: null, empresa: null, cnpj: null },
  }

  it("oferta, com o assunto da variante, os parágrafos, o botão e os produtos — e sem cupom", () => {
    const a = emailDaCampanha(texto(), "a", p)
    const b = emailDaCampanha(texto(), "b", p)
    expect([a.assunto, b.assunto]).toEqual(["Começou a Black", "A Black da FuckingBarba chegou"])
    expect(a.estilo).toBe("oferta")
    expect(a.nome).toBe("Rafael")
    expect(a.texto).toBe("A Black chegou.")
    expect(a.blocos).toEqual([
      { tipo: "texto", texto: "Os preços valem até domingo." },
      { tipo: "produtos", produtos: p.produtos },
    ])
    expect(a.blocos.some((x) => x.tipo === "cupom")).toBe(false)
    const pronto = emailDoCrm(a)
    expect(pronto.cabecalhos["List-Unsubscribe"]).toBeTruthy()
    expect(pronto.html).toContain("utm_campaign=crm-campanha-black-friday")
    // Sem o teste, o B manda o A.
    expect(emailDaCampanha(texto({ assuntoB: null }), "b", p).assunto).toBe("Começou a Black")
  })

  it("o recado: o estilo lembrete — sem o cabeçalho de cancelar, e o sair da lista no pé", () => {
    const r = emailDaCampanha(texto({ jeito: "recado" }), "a", p)
    expect(r.estilo).toBe("lembrete")
    const pronto = emailDoCrm(r)
    expect(pronto.cabecalhos["List-Unsubscribe"]).toBeUndefined()
    expect(pronto.html).toContain("https://loja/sair/x")
    expect(pronto.html).toContain("utm_campaign=crm-campanha-black-friday")
  })

  it("o banco e de volta: igual", () => {
    const t = texto()
    const linha = {
      id: "cmp_1",
      situacao: "rascunho",
      agenda: null,
      comecou_em: null,
      acabou_em: null,
      por: null,
      ...bancoDoTexto(t),
    }
    expect(textoDoBanco(linha)).toEqual(t)
    expect(textoDoBanco({ ...linha, ...bancoDoTexto(texto({ jeito: "recado" })) }).jeito).toBe(
      "recado"
    )
    // A linha de antes da 0210, sem o jeito, é oferta.
    expect(textoDoBanco({ ...linha, jeito: null }).jeito).toBe("oferta")
  })
})

describe("o resultado", () => {
  const em = (dias: number) => new Date(AGORA.getTime() + dias * DIA)
  const reg = (email: string, toque: string, como = "enviado") => ({
    email,
    toque,
    como,
    em: AGORA,
  })
  const pedido = (email: string, dias: number, total = 100, status = "pending") => ({
    email,
    created_at: em(dias),
    total,
    status,
  })

  it("por assunto: quem recebeu, quem comprou em 7 dias e quanto; o controle, como se tivesse recebido", () => {
    const r = resultadoDaCampanha(
      { assunto: "A", assuntoB: "B" },
      [
        reg("a1@x.com", "a"),
        reg("a2@x.com", "a"),
        reg("b1@x.com", "b"),
        reg("b2@x.com", "b"),
        reg("c1@x.com", "controle", "controle"),
        reg("r1@x.com", "a", "enviando"),
      ],
      [
        pedido("a1@x.com", 2, 150),
        pedido("A1@X.com", 3, 90),
        pedido("b1@x.com", 1, 80),
        pedido("b2@x.com", 10, 999),
        pedido("a2@x.com", 1, 50, "canceled"),
        pedido("c1@x.com", 4, 70),
      ]
    )
    expect(r.variantes).toEqual([
      { variante: "a", assunto: "A", pessoas: 2, compraram: 1, vendido: 150 },
      { variante: "b", assunto: "B", pessoas: 2, compraram: 1, vendido: 80 },
    ])
    expect(r.controle).toEqual({ pessoas: 1, compraram: 1 })
    expect(r.vendeuMais).toBeNull()
  })

  it("o que vendeu mais, por pessoa; sem o teste, só o A", () => {
    const comTeste = resultadoDaCampanha(
      { assunto: "A", assuntoB: "B" },
      [reg("a1@x.com", "a"), reg("b1@x.com", "b"), reg("b2@x.com", "b")],
      [pedido("b1@x.com", 1)]
    )
    expect(comTeste.vendeuMais).toBe("b")
    const semTeste = resultadoDaCampanha(
      { assunto: "A", assuntoB: null },
      [reg("a1@x.com", "a")],
      []
    )
    expect(semTeste.variantes.map((v) => v.variante)).toEqual(["a"])
    expect(semTeste.vendeuMais).toBeNull()
  })
})

describe("o resultado guardado", () => {
  it("fecha 7 dias depois do fim do envio, só da que saiu", () => {
    const acabou = new Date(AGORA.getTime() - 7 * DIA)
    expect(resultadoFechou({ situacao: "enviada", acabou_em: acabou }, AGORA)).toBe(false)
    const antes = new Date(acabou.getTime() - MIN)
    expect(resultadoFechou({ situacao: "enviada", acabou_em: antes }, AGORA)).toBe(true)
    expect(resultadoFechou({ situacao: "parada", acabou_em: antes }, AGORA)).toBe(true)
    expect(resultadoFechou({ situacao: "enviando", acabou_em: null }, AGORA)).toBe(false)
    expect(resultadoFechou({ situacao: "enviada", acabou_em: null }, AGORA)).toBe(false)
  })

  it("lê de volta o que tem a forma do resultado, e só", () => {
    const r = resultadoDaCampanha({ assunto: "A", assuntoB: null }, [], [])
    expect(resultadoGuardado(JSON.parse(JSON.stringify(r)))).toEqual(r)
    expect(resultadoGuardado(null)).toBeNull()
    expect(resultadoGuardado({})).toBeNull()
    expect(resultadoGuardado({ variantes: [] })).toBeNull()
  })
})
