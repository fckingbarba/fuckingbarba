import {
  chaveDoPreco,
  ehListaDeOferta,
  enderecoDoNome,
  lerOfertaNova,
  normalizarEndereco,
  PREFIXO_DA_LISTA,
  precosDaLista,
  situacaoDaOferta,
  sugerirEndereco,
  type ProdutoDaLoja,
} from "../ofertas/regras"

const agora = new Date("2026-10-01T15:00:00.000Z") // 12:00 em Brasília
const loja = new Map<string, ProdutoDaLoja>([
  ["prod_FATOR", { nome: "Fator", preco: 89.9 }],
  ["prod_OLEO", { nome: "Óleo", preco: 59.9 }],
  ["prod_SEM", { nome: "Sem preço", preco: null }],
])
const valida = {
  nome: "Lista VIP de outubro",
  titulo: "Só pra quem tem o link",
  chamada: "  O Fator e o óleo   mais baratos até domingo. ",
  endereco: "vip-outubro-k7m2",
  de: "",
  ate: "2026-10-05T23:59",
  produtos: [
    { produto: "prod_FATOR", por: "69,90" },
    { produto: "prod_OLEO", por: 49.9 },
  ],
}

describe("lerOfertaNova", () => {
  it("aceita a oferta e limpa os textos", () => {
    const r = lerOfertaNova(valida, agora, loja)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.oferta).toEqual({
      nome: "Lista VIP de outubro",
      titulo: "Só pra quem tem o link",
      chamada: "O Fator e o óleo mais baratos até domingo.",
      endereco: "vip-outubro-k7m2",
      comeca: agora.getTime(),
      termina: new Date("2026-10-05T23:59:59.999-03:00").getTime(),
      produtos: [
        { produto: "prod_FATOR", por: 69.9 },
        { produto: "prod_OLEO", por: 49.9 },
      ],
    })
  })

  it("começo no futuro fica; no passado vira agora", () => {
    const futuro = lerOfertaNova({ ...valida, de: "2026-10-02T08:00" }, agora, loja)
    expect(futuro.ok && futuro.oferta.comeca).toBe(new Date("2026-10-02T08:00:00-03:00").getTime())
    const passado = lerOfertaNova({ ...valida, de: "2026-09-20T08:00" }, agora, loja)
    expect(passado.ok && passado.oferta.comeca).toBe(agora.getTime())
  })

  it("o fim é obrigatório, no futuro, depois do começo e em até 90 dias", () => {
    const erro = (extra: object) => {
      const r = lerOfertaNova({ ...valida, ...extra }, agora, loja)
      return r.ok ? null : r.erros.ate
    }
    expect(erro({ ate: "" })).toBe("Até quando: data e hora.")
    expect(erro({ ate: "2026-10-01T11:59" })).toBe("Esse fim já passou.")
    expect(erro({ de: "2026-10-03T10:00", ate: "2026-10-03T09:00" })).toBe(
      "O fim tem que ser depois do começo."
    )
    expect(erro({ ate: "2027-01-15T10:00" })).toBe("No máximo 90 dias de oferta.")
    expect(erro({ ate: "2026-12-29T10:00" })).toBeNull()
  })

  it("o por tem que ser desconto de verdade sobre o preço de hoje", () => {
    const r = lerOfertaNova(
      {
        ...valida,
        produtos: [
          { produto: "prod_FATOR", por: "89,90" },
          { produto: "prod_OLEO", por: "9,90" },
          { produto: "prod_SEM", por: "10" },
        ],
      },
      agora,
      loja
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erros["por:prod_FATOR"]).toBe("Tem que ser menos que o preço de hoje (R$ 89,90).")
    expect(r.erros["por:prod_OLEO"]).toBe("Mais de 80% de desconto: confira o valor.")
    expect(r.erros["por:prod_SEM"]).toBe("Este produto está sem preço na loja.")
  })

  it("produto que não existe, repetido, nenhum ou demais", () => {
    const sem = lerOfertaNova({ ...valida, produtos: [] }, agora, loja)
    expect(!sem.ok && sem.erros.produtos).toBe("Escolha pelo menos um produto.")
    const fora = lerOfertaNova(
      { ...valida, produtos: [{ produto: "prod_X", por: 10 }] },
      agora,
      loja
    )
    expect(!fora.ok && fora.erros.produtos).toBe(
      "Algum produto não existe mais na loja: recarregue a página."
    )
    const repetido = lerOfertaNova(
      {
        ...valida,
        produtos: [
          { produto: "prod_FATOR", por: 69.9 },
          { produto: "prod_FATOR", por: 59.9 },
        ],
      },
      agora,
      loja
    )
    expect(repetido.ok && repetido.oferta.produtos).toEqual([{ produto: "prod_FATOR", por: 69.9 }])
    const muitos = new Map(
      Array.from({ length: 13 }, (_, i) => [`prod_${i}`, { nome: `P${i}`, preco: 50 }] as const)
    )
    const demais = lerOfertaNova(
      { ...valida, produtos: [...muitos.keys()].map((produto) => ({ produto, por: 40 })) },
      agora,
      muitos
    )
    expect(!demais.ok && demais.erros.produtos).toBe("No máximo 12 produtos.")
  })

  it("nome, título e endereço", () => {
    const r = lerOfertaNova({ ...valida, nome: " ", titulo: "", endereco: "a" }, agora, loja)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.erros).sort()).toEqual(["endereco", "nome", "titulo"])
    const comAcento = lerOfertaNova({ ...valida, endereco: "Promoção João!" }, agora, loja)
    expect(comAcento.ok && comAcento.oferta.endereco).toBe("promocao-joao")
  })
})

describe("o endereço", () => {
  it("sai do nome, sem acento, e ganha o sorteio", () => {
    expect(enderecoDoNome("Lista VIP — Outubro!")).toBe("lista-vip-outubro")
    expect(sugerirEndereco("Oferta do João", "K7M2")).toBe("oferta-do-joao-k7m2")
    expect(sugerirEndereco("!!!", "ab12")).toBe("oferta-ab12")
    expect(normalizarEndereco("  --Black  Friday-- ")).toBe("black-friday")
  })
})

describe("situacaoDaOferta", () => {
  const o = { comeca_em: "2026-10-01T12:00:00Z", termina_em: "2026-10-05T12:00:00Z" }
  it("agendada, no ar, encerrada e pausada", () => {
    expect(situacaoDaOferta(o, Date.parse("2026-10-01T11:59:59Z"))).toBe("agendada")
    expect(situacaoDaOferta(o, Date.parse("2026-10-01T12:00:00Z"))).toBe("no-ar")
    expect(situacaoDaOferta(o, Date.parse("2026-10-05T12:00:00Z"))).toBe("encerrada")
    expect(situacaoDaOferta({ ...o, pausada: true }, Date.parse("2026-10-02T12:00:00Z"))).toBe(
      "pausada"
    )
    // A pausada que passou do fim (ou foi encerrada) é encerrada: não liga mais.
    expect(situacaoDaOferta({ ...o, pausada: true }, Date.parse("2026-10-05T12:00:00Z"))).toBe(
      "encerrada"
    )
  })
})

describe("precosDaLista", () => {
  const faixas = [
    { min: 2, max: 2, valor: 86.3 },
    { min: 3, max: null, valor: 84.51 },
  ]
  it("com o por abaixo de tudo, só o por", () => {
    expect(precosDaLista(69.9, 89.9, faixas)).toEqual([{ min: null, max: null, valor: 69.9 }])
  })
  it("o promocional da vitrine abaixo do por vence", () => {
    expect(precosDaLista(69.9, 64.9, [])).toEqual([{ min: null, max: null, valor: 64.9 }])
  })
  it("faixa de quantidade abaixo do por entra, a de cima não", () => {
    expect(precosDaLista(85, 89.9, faixas)).toEqual([
      { min: null, max: null, valor: 85 },
      { min: 3, max: null, valor: 84.51 },
    ])
  })
  it("sem preço de hoje, fica o por", () => {
    expect(precosDaLista(69.9, null, [])).toEqual([{ min: null, max: null, valor: 69.9 }])
  })
  it("a chave separa a variação e a faixa", () => {
    expect(chaveDoPreco("pset_1", { min: null, max: null })).toBe("pset_1||")
    expect(chaveDoPreco("pset_1", { min: 3, max: null })).toBe("pset_1|3|")
  })
})

describe("ehListaDeOferta", () => {
  it("pelo começo do título", () => {
    expect(ehListaDeOferta(`${PREFIXO_DA_LISTA}vip-outubro-k7m2`)).toBe(true)
    expect(ehListaDeOferta("Promoção do painel")).toBe(false)
    expect(ehListaDeOferta(null)).toBe(false)
  })
})
