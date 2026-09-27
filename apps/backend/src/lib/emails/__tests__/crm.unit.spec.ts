import { emailDoCrm, exemplosDoCrm, linkDoCrm, type EmailDoCrm, type ProdutoDoCrm } from "../crm"

/**
 * O modelo dos e-mails do CRM: o esqueleto (o oi, o título, o botão), cada
 * bloco, o rodapé com o sair da lista e os links, os cabeçalhos do clique
 * único, a versão em texto — e nada de fora entrando como HTML.
 */

const LOJA = "https://www.fuckingbarba.com.br"
const FATOR: ProdutoDoCrm = {
  nome: "Fator de Crescimento",
  handle: "fator-de-crescimento-para-barba",
  imagem: "https://cdn.exemplo/fator.jpg",
  preco: 79.9,
  precoCheio: 133.2,
}

const base = (extra: Partial<EmailDoCrm> = {}): EmailDoCrm => ({
  para: "rafael@exemplo.com",
  nome: "Rafael",
  assunto: "Hora de repor",
  previa: "Ele acaba por volta de 05/10.",
  titulo: "Hora de repor",
  texto: "O seu Fator acaba por volta de 05/10.",
  blocos: [],
  botao: { texto: "Comprar de novo", caminho: "/produtos/fator-de-crescimento-para-barba" },
  campanha: "reposicao",
  sair: {
    pagina: `${LOJA}/sair/abc`,
    umClique: "https://api.exemplo/crm/sair?t=abc",
  },
  loja: {
    url: LOJA,
    whatsapp: "5547999990000",
    empresa: "FuckingBarba Ltda",
    cnpj: "12.345.678/0001-90",
  },
  ...extra,
})

describe("o link do CRM", () => {
  it("leva a campanha no UTM, com ou sem busca no caminho", () => {
    expect(linkDoCrm(LOJA, "/produtos", "boas-vindas")).toBe(
      `${LOJA}/produtos?utm_source=loja&utm_medium=email&utm_campaign=crm-boas-vindas`
    )
    expect(linkDoCrm(LOJA, "carrinho?x=1", "carrinho")).toBe(
      `${LOJA}/carrinho?x=1&utm_source=loja&utm_medium=email&utm_campaign=crm-carrinho`
    )
  })
})

describe("o e-mail", () => {
  it("o esqueleto: o oi, o título, o texto e o botão com UTM", () => {
    const e = emailDoCrm(base())
    expect(e.para).toBe("rafael@exemplo.com")
    expect(e.assunto).toBe("Hora de repor")
    expect(e.html).toContain("Oi, Rafael!")
    expect(e.html).toContain("Hora de repor")
    expect(e.html).toContain(
      `${LOJA}/produtos/fator-de-crescimento-para-barba?utm_source=loja&amp;utm_medium=email&amp;utm_campaign=crm-reposicao`
    )
    expect(emailDoCrm(base({ nome: null })).html).toContain("Oi!")
  })

  it("o rodapé: por que recebeu, o sair em 1 clique, a empresa e os quatro links", () => {
    const { html, texto } = emailDoCrm(base())
    expect(html).toContain("Você recebeu porque aceitou receber ofertas da FuckingBarba.")
    expect(html).toContain(`href="${LOJA}/sair/abc"`)
    expect(html).toContain("Sair da lista em 1 clique")
    expect(html).toContain("FuckingBarba Ltda · CNPJ 12.345.678/0001-90")
    expect(html).toContain("https://www.instagram.com/fuckingbarba")
    expect(html).toContain("https://www.tiktok.com/@fuckingbarba")
    expect(html).toContain("https://wa.me/5547999990000")
    expect(texto).toContain(`Sair da lista: ${LOJA}/sair/abc`)
    expect(texto).toContain("TikTok: https://www.tiktok.com/@fuckingbarba")
    const semWhats = emailDoCrm(base({ loja: { ...base().loja, whatsapp: null } }))
    expect(semWhats.html).not.toContain("wa.me")
  })

  it("os cabeçalhos: o clique único quando tem o endereço do backend; senão, só a página", () => {
    expect(emailDoCrm(base()).cabecalhos).toEqual({
      "List-Unsubscribe": "<https://api.exemplo/crm/sair?t=abc>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    })
    expect(
      emailDoCrm(base({ sair: { pagina: `${LOJA}/sair/abc`, umClique: null } })).cabecalhos
    ).toEqual({ "List-Unsubscribe": `<${LOJA}/sair/abc>` })
  })

  it("cada bloco: produtos, cupom, depoimento, passos, selo e texto", () => {
    const { html, texto } = emailDoCrm(
      base({
        blocos: [
          { tipo: "produtos", titulo: "Pra você", produtos: [FATOR] },
          { tipo: "cupom", codigo: "VOLTA10", oque: "10% de volta", validade: "vale 7 dias" },
          { tipo: "depoimento", texto: "Fechou a falha.", quem: "Diego, Joinville", estrelas: 4 },
          { tipo: "passos", titulo: "Como usar", passos: ["Lave", "Aplique", "Massageie"] },
          { tipo: "selo", texto: "Frete grátis até amanhã" },
          { tipo: "texto", texto: "Qualquer dúvida, é só responder." },
        ],
      })
    )
    expect(html).toContain("fator.jpg")
    expect(html).toContain("R$\u00a079,90")
    expect(html).toContain("R$\u00a0133,20")
    expect(html).toContain("VOLTA10")
    expect(html).toContain("★★★★☆")
    expect(html).toContain("“Fechou a falha.”")
    expect(html).toContain("Massageie")
    expect(html).toContain("Frete grátis até amanhã")
    expect(html).toContain("Qualquer dúvida, é só responder.")
    expect(texto).toContain("- Fator de Crescimento · R$\u00a079,90: ")
    expect(texto).toContain("10% de volta: VOLTA10 (vale 7 dias)")
    expect(texto).toContain("1. Lave  2. Aplique  3. Massageie")
  })

  it("no modo escuro: o texto no amarelo não clareia; o link e as estrelas acompanham", () => {
    const { html } = emailDoCrm(
      base({
        blocos: [
          { tipo: "produtos", produtos: [FATOR] },
          { tipo: "cupom", codigo: "VOLTA10", oque: "10% de volta", validade: "vale 7 dias" },
          { tipo: "depoimento", texto: "Fechou a falha.", quem: "Diego" },
          { tipo: "selo", texto: "Frete grátis até amanhã" },
        ],
      })
    )
    // Cada frase de cima do amarelo (o cupom e o selo): sem a classe que o modo escuro clareia.
    const classesDe = (texto: string) => html.match(new RegExp(`<p([^>]*)>${texto}</p>`))?.[1]
    for (const texto of ["10% de volta", "VOLTA10", "vale 7 dias", "Frete grátis até amanhã"]) {
      expect(classesDe(texto)).toBeDefined()
      expect(classesDe(texto)).not.toMatch(/fb-texto|fb-suave/)
    }
    expect(html).toMatch(/class="fb-texto"[^>]*>Ver na loja</)
    expect(html).toMatch(/class="fb-verde"[^>]*>★/)
  })

  it("o que vem de fora nunca vira HTML", () => {
    const { html } = emailDoCrm(
      base({
        nome: "<b>Rafa</b>",
        blocos: [
          {
            tipo: "produtos",
            produtos: [{ ...FATOR, nome: '<img src=x onerror="alert(1)">' }],
          },
        ],
      })
    )
    expect(html).not.toContain("<b>Rafa</b>")
    expect(html).not.toContain('<img src=x onerror="alert(1)">')
    expect(html).toContain("&lt;b&gt;Rafa&lt;/b&gt;")
  })
})

describe("os exemplos do painel", () => {
  it("os três, com os produtos que existem; sem o produto, o bloco some", () => {
    const produtos = new Map([[FATOR.handle, FATOR]])
    const exemplos = exemplosDoCrm({
      para: "dono@exemplo.com",
      nome: "Matheus",
      sair: base().sair,
      loja: base().loja,
      produtos,
      acabaEm: "05/10",
    })
    expect(exemplos.map((x) => x.id)).toEqual(["boas-vindas", "reposicao", "carrinho"])
    const reposicao = emailDoCrm(exemplos[1].email)
    expect(reposicao.assunto).toBe("O seu Fator de Crescimento está acabando")
    expect(reposicao.html).toContain("acaba por volta de 05/10")
    const boasVindas = exemplos[0].email
    expect(boasVindas.blocos.find((b) => b.tipo === "produtos")).toMatchObject({
      produtos: [FATOR],
    })
    // O carrinho sem o Kit Completo na loja: o texto não inventa o nome.
    expect(exemplos[2].email.texto).toContain("Você deixou um produto na sacola")
  })
})
