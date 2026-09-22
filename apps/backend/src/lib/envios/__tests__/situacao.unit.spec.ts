import {
  avisoPendente,
  chaveDoEvento,
  limparCodigo,
  momentoDe,
  resumir,
  transportadoraPeloCodigo,
  type EventoParaResumir,
  type TipoDeEvento,
} from "../situacao"

const HORA = 60 * 60 * 1000
const base = Date.parse("2026-09-20T12:00:00Z")
const em = (horas: number) => new Date(base + horas * HORA)
const e = (tipo: TipoDeEvento, horas: number): EventoParaResumir => ({ tipo, quando: em(horas) })

describe("resumir — onde o pacote está", () => {
  it("sem evento nenhum, está aguardando", () => {
    expect(resumir([])).toEqual({
      situacao: "aguardando",
      alerta: null,
      desde: null,
      postadoEm: null,
      entregueEm: null,
    })
  })

  it("o mais recente de andamento manda, e a ordem de CHEGADA não importa", () => {
    const r = resumir([e("saiu_para_entrega", 30), e("postado", 0), e("em_transito", 10)])
    expect(r.situacao).toBe("saiu_para_entrega")
    expect(r.desde).toEqual(em(30))
    expect(r.postadoEm).toEqual(em(0))
  })

  it("um 'em trânsito' depois do 'saiu pra entrega' quer dizer que voltou pra agência", () => {
    expect(resumir([e("saiu_para_entrega", 10), e("em_transito", 20)]).situacao).toBe("em_transito")
  })

  it("o alerta acende por cima e apaga no próximo andamento", () => {
    const aceso = resumir([e("postado", 0), e("em_transito", 5), e("atrasado", 8)])
    expect(aceso.situacao).toBe("em_transito")
    expect(aceso.alerta).toBe("atrasado")
    const apagado = resumir([e("postado", 0), e("atrasado", 8), e("saiu_para_entrega", 20)])
    expect(apagado.alerta).toBeNull()
    expect(apagado.situacao).toBe("saiu_para_entrega")
  })

  it("a primeira notícia sendo um atraso, o pacote já saiu", () => {
    const r = resumir([e("atrasado", 3)])
    expect(r.situacao).toBe("postado")
    expect(r.alerta).toBe("atrasado")
    expect(r.postadoEm).toEqual(em(3))
  })

  it("entregue é o fim: evento velho que chega depois não desfaz", () => {
    const r = resumir([e("postado", 0), e("entregue", 40), e("em_transito", 50)])
    expect(r.situacao).toBe("entregue")
    expect(r.entregueEm).toEqual(em(40))
  })

  it("entregue depois de devolvido é entregue ao REMETENTE: continua devolvido", () => {
    expect(resumir([e("postado", 0), e("devolvido", 20), e("entregue", 60)]).situacao).toBe(
      "devolvido"
    )
  })

  it("extraviado que aparece e é entregue vira entregue", () => {
    const r = resumir([e("postado", 0), e("extraviado", 20), e("entregue", 60)])
    expect(r.situacao).toBe("entregue")
    expect(r.entregueEm).toEqual(em(60))
  })

  it("informativo entra na linha do tempo e não muda nada", () => {
    expect(resumir([e("informativo", 0)]).situacao).toBe("aguardando")
    expect(resumir([e("em_transito", 0), e("informativo", 5)]).situacao).toBe("em_transito")
  })
})

describe("avisoPendente — o e-mail certo, uma vez só", () => {
  const agora = em(1)

  it("avisa o momento da situação de agora", () => {
    expect(avisoPendente({ situacao: "em_transito", desde: em(0), avisos: {} }, agora)).toBe(
      "enviado"
    )
    expect(avisoPendente({ situacao: "saiu_para_entrega", desde: em(0), avisos: {} }, agora)).toBe(
      "saiu"
    )
    expect(
      avisoPendente({ situacao: "aguardando_retirada", desde: em(0), avisos: {} }, agora)
    ).toBe("retirar")
    expect(avisoPendente({ situacao: "entregue", desde: em(0), avisos: {} }, agora)).toBe(
      "entregue"
    )
  })

  it("devolvido e extraviado não viram e-mail — a loja conversa", () => {
    expect(momentoDe("devolvido")).toBeNull()
    expect(momentoDe("extraviado")).toBeNull()
    expect(avisoPendente({ situacao: "extraviado", desde: em(0), avisos: {} }, agora)).toBeNull()
  })

  it("não repete, nem o dispensado pelo admin", () => {
    const enviado = { em: agora.toISOString(), como: "email" as const }
    const dispensado = { em: agora.toISOString(), como: "dispensado" as const }
    expect(
      avisoPendente({ situacao: "postado", desde: em(0), avisos: { enviado } }, agora)
    ).toBeNull()
    expect(
      avisoPendente({ situacao: "postado", desde: em(0), avisos: { enviado: dispensado } }, agora)
    ).toBeNull()
  })

  it("não volta atrás: depois do 'saiu pra entrega', um 'em trânsito' não manda 'foi enviado'", () => {
    const saiu = { em: agora.toISOString(), como: "email" as const }
    expect(
      avisoPendente({ situacao: "em_transito", desde: em(0), avisos: { saiu } }, agora)
    ).toBeNull()
    // …mas a retirada, que vem depois, avisa.
    expect(
      avisoPendente({ situacao: "aguardando_retirada", desde: em(0), avisos: { saiu } }, agora)
    ).toBe("retirar")
  })

  it("notícia velha não vira e-mail", () => {
    expect(
      avisoPendente({ situacao: "saiu_para_entrega", desde: em(-13), avisos: {} }, agora)
    ).toBeNull()
    expect(avisoPendente({ situacao: "postado", desde: em(-24 * 6), avisos: {} }, agora)).toBe(
      "enviado"
    )
    expect(avisoPendente({ situacao: "postado", desde: em(-24 * 8), avisos: {} }, agora)).toBeNull()
  })
})

describe("o código", () => {
  it("o dos Correios em maiúsculas e sem espaço; o dos outros, como veio", () => {
    expect(limparCodigo(" qs 123456789 br ")).toBe("QS123456789BR")
    expect(limparCodigo("JD0012345678")).toBe("JD0012345678")
    expect(limparCodigo("abc 123")).toBe("abc123")
    expect(limparCodigo("   ")).toBeNull()
    expect(limparCodigo(42)).toBeNull()
  })

  it("o que não tem cara de código não vira envio", () => {
    for (const lixo of ["#", "-", "n/a", "1234", "<script>"]) expect(limparCodigo(lixo)).toBeNull()
    expect(limparCodigo("LGI-0012.34_5")).toBe("LGI-0012.34_5")
  })

  it("reconhece os Correios pelo formato", () => {
    expect(transportadoraPeloCodigo("QS123456789BR")).toBe("Correios")
    expect(transportadoraPeloCodigo("JD0012345678")).toBeNull()
  })

  it("o mesmo evento tem a mesma chave; texto diferente, outra", () => {
    const a = { tipo: "em_transito" as const, quando: em(0), descricao: "Objeto em  trânsito" }
    expect(chaveDoEvento(a)).toBe(chaveDoEvento({ ...a, descricao: "objeto em trânsito " }))
    expect(chaveDoEvento(a)).not.toBe(chaveDoEvento({ ...a, descricao: "Objeto postado" }))
  })
})
