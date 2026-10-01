import { catalogoEmTexto, linkDoProduto, semHtml, type ProdutoDoAtendente } from "../catalogo"
import { duvidasDaLoja, duvidasDoHtml, duvidasEmTexto, esquecerDuvidas } from "../duvidas"
import { lerAjustesDoWhatsapp, LIMITE_DAS_REGRAS } from "../ajustes"

/**
 * O que o atendente sabe: o catálogo em texto (o preço de agora, as faixas
 * de quantidade, a promoção, o esgotado e o texto da página), as dúvidas da
 * página /duvidas e as regras do dono.
 */

const LOJA = "https://www.fuckingbarba.com.br"

const fator: ProdutoDoAtendente = {
  nome: "Fator de Crescimento",
  handle: "fator-de-crescimento-para-barba",
  categorias: ["Barba"],
  resumo: "Ativa os fios\n e preenche falhas.",
  variantes: [{ nome: null, preco: 129.9, precoCheio: 149.9, vende: true }],
  promocoes: [],
  conteudo: {
    funciona: {
      comoTitulo: "Como funciona",
      comoFotoDe: "",
      comoTexto: ["Estimula o folículo."],
      usoTitulo: "Como usar",
      usoFotoDe: "",
      usoPassos: ["Lave a barba", "Aplique 5 gotas"],
      dica: "Use à noite",
    },
    quem: { titulo: "Pra quem", sim: ["barba falhada"], nao: ["menor de 18 anos"] },
    rotina: {
      titulo: "Rotina",
      itens: [{ handle: "oleo-para-barba", passo: "Passo 3", para: "hidrata" }],
    },
    duvidas: {
      titulo: "Dúvidas",
      perguntas: [{ pergunta: "Em quanto tempo?", resposta: ["60 a 90 dias", "de uso diário."] }],
    },
  },
  levaJunto: ["Shampoo para Barba"],
}

const oleo: ProdutoDoAtendente = {
  nome: "Óleo para Barba",
  handle: "oleo-para-barba",
  categorias: [],
  resumo: null,
  variantes: [{ nome: null, preco: 79.9, precoCheio: null, vende: false }],
  promocoes: [],
  conteudo: {},
  levaJunto: [],
}

describe("o catálogo em texto", () => {
  const texto = catalogoEmTexto([oleo, fator], LOJA)

  it("na ordem do nome, com o código pras ferramentas e o link marcado de onde veio", () => {
    expect(texto.indexOf("## Fator")).toBeLessThan(texto.indexOf("## Óleo"))
    expect(texto).toContain("Código (pras ferramentas): fator-de-crescimento-para-barba")
    expect(texto).toContain(
      `Link: ${LOJA}/produtos/fator-de-crescimento-para-barba?utm_source=whatsapp&utm_medium=atendimento&utm_campaign=atendente`
    )
  })

  it("o preço de agora, com o riscado, e as faixas da lista de quantidade", () => {
    expect(texto).toMatch(/Preço: R\$\s129,90 \(de R\$\s149,90\)/)
    // A mesma conta da lista "Desconto por quantidade": 2 por R$ 248,90; 3 por R$ 363,90
    // (o total de 3 desce até um ",90" que dê pra dividir em centavos).
    expect(texto).toMatch(/2 unidades: R\$\s124,45 cada \(4% a menos; 2 saem R\$\s248,90\)/)
    expect(texto).toMatch(/3 ou mais unidades: R\$\s121,30 cada \(6% a menos; 3 saem R\$\s363,90\)/)
  })

  it("o esgotado avisa, e não ganha faixa", () => {
    const bloco = texto.slice(texto.indexOf("## Óleo"))
    expect(bloco).toContain("ESGOTADO agora")
    expect(bloco).not.toContain("Levando mais")
  })

  it("o texto da página: como usar, pra quem não é, as dúvidas e o leve junto", () => {
    expect(texto).toContain("Como usar: 1) Lave a barba 2) Aplique 5 gotas")
    expect(texto).toContain("Dica de uso: Use à noite")
    expect(texto).toContain("Pra quem NÃO é: menor de 18 anos")
    expect(texto).toContain("- P: Em quanto tempo? R: 60 a 90 dias de uso diário.")
    expect(texto).toContain("Combina com: Shampoo para Barba")
    // A rotina diz o nome do produto, não o endereço dele.
    expect(texto).toContain("Rotina recomendada: Passo 3 (Óleo para Barba): hidrata")
    expect(texto).toContain("Resumo: Ativa os fios e preenche falhas.")
  })

  it("com 'Leve 3, pague 2' valendo, a faixa de 3 sai e a promoção entra", () => {
    const t = catalogoEmTexto(
      [{ ...fator, promocoes: [{ etiqueta: "Leve 3, pague 2", comprando: 3, ate: null }] }],
      LOJA
    )
    expect(t).toMatch(/2 unidades: /)
    expect(t).not.toMatch(/3 ou mais unidades/)
    expect(t).toContain(
      "PROMOÇÃO valendo agora: Leve 3, pague 2 — o desconto entra sozinho na sacola"
    )
  })

  it("o mesmo catálogo dá o mesmo texto (é o pedaço que fica no cache da IA)", () => {
    expect(catalogoEmTexto([fator, oleo], LOJA)).toBe(texto)
  })

  it("variantes com nome aparecem uma por linha", () => {
    const t = catalogoEmTexto(
      [
        {
          ...oleo,
          variantes: [
            { nome: "30 ml", preco: 79.9, precoCheio: null, vende: true },
            { nome: "60 ml", preco: 129.9, precoCheio: null, vende: false },
          ],
        },
      ],
      LOJA
    )
    expect(t).toMatch(/- 30 ml: R\$\s79,90\n- 60 ml: R\$\s129,90 \(esgotada\)/)
  })
})

describe("as peças do catálogo", () => {
  it("o link do produto", () => {
    expect(linkDoProduto(LOJA, "kit-completo")).toBe(
      `${LOJA}/produtos/kit-completo?utm_source=whatsapp&utm_medium=atendimento&utm_campaign=atendente`
    )
  })

  it("a descrição do Bling sem HTML, cortada", () => {
    expect(semHtml("<p>Óleo&nbsp;<b>leve</b></p><p>sem&amp;cheiro</p>")).toBe(
      "Óleo leve\nsem&cheiro"
    )
    expect(semHtml("<p></p>")).toBeNull()
    expect(semHtml("a ".repeat(400), 20)?.endsWith("…")).toBe(true)
  })
})

describe("as dúvidas da página /duvidas", () => {
  const html = `<html><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Tem frete grátis?",
        acceptedAnswer: { "@type": "Answer", text: "Frete grátis a partir de R$ 149,90." },
      },
      { "@type": "Question", name: "Sem resposta" },
    ],
  })}</script><script type="application/ld+json">{quebrado</script></html>`

  it("lê o JSON-LD FAQPage e pula o que vem torto", () => {
    expect(duvidasDoHtml(html)).toEqual([
      { pergunta: "Tem frete grátis?", resposta: "Frete grátis a partir de R$ 149,90." },
    ])
    expect(duvidasEmTexto(duvidasDoHtml(html))).toBe(
      "- P: Tem frete grátis? R: Frete grátis a partir de R$ 149,90."
    )
    expect(duvidasDoHtml("<html>sem nada</html>")).toEqual([])
  })
})

describe("as dúvidas lidas da loja", () => {
  const original = global.fetch
  afterEach(() => {
    global.fetch = original
    esquecerDuvidas()
  })
  const pagina = (texto: string) =>
    `<script type="application/ld+json">${JSON.stringify({
      "@type": "FAQPage",
      mainEntity: [{ name: "Parcela?", acceptedAnswer: { text: texto } }],
    })}</script>`

  it("guarda a leitura; com a loja fora, fica a última boa", async () => {
    let fora = false
    let pedidos = 0
    global.fetch = (async () => {
      pedidos++
      if (fora) throw new Error("fora")
      return new Response(pagina("Em até 3x."), { status: 200 })
    }) as typeof fetch
    expect(await duvidasDaLoja(LOJA, 0)).toBe("- P: Parcela? R: Em até 3x.")
    expect(await duvidasDaLoja(LOJA, 1000)).toBe("- P: Parcela? R: Em até 3x.")
    expect(pedidos).toBe(1)
    fora = true
    expect(await duvidasDaLoja(LOJA, 2 * 60 * 60_000)).toBe("- P: Parcela? R: Em até 3x.")
  })

  it("sem nenhuma leitura boa, null", async () => {
    global.fetch = (async () => new Response("erro", { status: 500 })) as typeof fetch
    expect(await duvidasDaLoja(LOJA, 0)).toBeNull()
  })
})

describe("os ajustes do dono", () => {
  it("ligado por padrão; as regras em texto, cortadas no limite", () => {
    expect(lerAjustesDoWhatsapp(null)).toEqual({ ligado: true, regras: null })
    expect(lerAjustesDoWhatsapp({ fb_whatsapp: { ligado: false, regras: "  " } })).toEqual({
      ligado: false,
      regras: null,
    })
    expect(
      lerAjustesDoWhatsapp({ fb_whatsapp: { regras: "x".repeat(LIMITE_DAS_REGRAS + 10) } }).regras
    ).toHaveLength(LIMITE_DAS_REGRAS)
  })
})
