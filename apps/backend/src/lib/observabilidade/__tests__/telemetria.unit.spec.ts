import {
  chaveDaOcorrencia,
  dominioDe,
  lerEventos,
  MAX_EVENTOS,
  normalizarPagina,
} from "../telemetria"

/**
 * O que o navegador manda: a página sem o que identifica alguém, o domínio
 * de onde veio, e só o evento que faz sentido.
 */

describe("a página e a origem", () => {
  it("sem busca, sem #, e sem id, número comprido ou e-mail no caminho", () => {
    expect(normalizarPagina("/produtos/fator-de-crescimento?cor=preto#fotos")).toBe(
      "/produtos/fator-de-crescimento"
    )
    expect(normalizarPagina("/conta/pedidos/order_01JABCDEF123")).toBe("/conta/pedidos/:id")
    expect(normalizarPagina("/checkout/retomar/1234567")).toBe("/checkout/retomar/:n")
    expect(normalizarPagina("/cliente/ana.souza@gmail.com")).toBe("/cliente/:email")
    expect(normalizarPagina("/token/a1b2c3d4e5f6g7h8i9j0k1")).toBe("/token/:id")
    expect(normalizarPagina("/")).toBe("/")
    expect(normalizarPagina("https://x.com/a")).toBeNull()
    expect(normalizarPagina(42)).toBeNull()
  })

  it("de onde veio, só o domínio", () => {
    expect(dominioDe("https://www.google.com/search?q=barba")).toBe("google.com")
    expect(dominioDe("android-app://com.google.android.gm/")).toBe("com.google.android.gm")
    expect(dominioDe("")).toBeNull()
    expect(dominioDe("não é endereço")).toBeNull()
  })
})

describe("os eventos", () => {
  it("a medida no teto, a página que não existe (interna ou de fora) e o erro limpo", () => {
    const lidos = lerEventos(
      {
        eventos: [
          { tipo: "vital", metrica: "LCP", valor: 2612.4567, aparelho: "celular", pagina: "/" },
          { tipo: "vital", metrica: "CLS", valor: 0.031, aparelho: "tablet", pagina: "/barba" },
          { tipo: "vital", metrica: "LCP", valor: 900_000, aparelho: "celular", pagina: "/" },
          { tipo: "vital", metrica: "TTFB", valor: 100, pagina: "/" },
          { tipo: "404", pagina: "/pomada-60g", origem: "https://www.google.com/search?q=x" },
          { tipo: "404", pagina: "/kitz", origem: "https://loja.fuckingbarba.com.br/barba" },
          {
            tipo: "erro",
            pagina: "/checkout",
            mensagem: "falhou pra ana@x.com.br, CPF 123.456.789-09",
          },
          { tipo: "erro", pagina: "/checkout", mensagem: "" },
          { tipo: "outro", pagina: "/" },
        ],
      },
      "loja.fuckingbarba.com.br"
    )
    expect(lidos).toEqual([
      { tipo: "vital", metrica: "LCP", valor: 2612.457, aparelho: "celular", pagina: "/" },
      { tipo: "vital", metrica: "CLS", valor: 0.031, aparelho: "computador", pagina: "/barba" },
      { tipo: "404", pagina: "/pomada-60g", origem: "google.com", interna: false },
      { tipo: "404", pagina: "/kitz", origem: "loja.fuckingbarba.com.br", interna: true },
      { tipo: "erro", pagina: "/checkout", mensagem: "falhou pra a•••@x.com.br, CPF •••" },
    ])
    expect(chaveDaOcorrencia(lidos[2] as never)).toBe("/pomada-60g")
    expect(chaveDaOcorrencia(lidos[4] as never)).toBe(
      "falhou pra a•••@x.com.br, CPF ••• @ /checkout"
    )
  })

  it("corpo errado não lê nada; mais que o teto, só os primeiros", () => {
    expect(lerEventos(null, null)).toEqual([])
    expect(lerEventos({ eventos: "x" }, null)).toEqual([])
    const muitos = Array.from({ length: 50 }, () => ({ tipo: "404", pagina: "/x" }))
    expect(lerEventos({ eventos: muitos }, null)).toHaveLength(MAX_EVENTOS)
  })
})
