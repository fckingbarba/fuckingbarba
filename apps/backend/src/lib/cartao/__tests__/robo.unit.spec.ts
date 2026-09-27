import { estadoNovo, gravar, RECUSAS, type Estado } from "../../../modules/pagarme/situacao"
import { cartaoNaTela, problemasDoCartao } from "../../painel/observabilidade"
import {
  decidir,
  freioLigado,
  LIMITES,
  PROVEDOR_DO_PAGARME,
  RESPOSTA_DA_BARRADA,
  RESUMO_VAZIO,
  resultadoDaSessao,
  semOIp,
  sessaoQueVai,
  type Contagem,
  type ResumoDoCartao,
} from "../robo"

/**
 * O robô testando cartão: que sessão vai pro Pagar.me, quem passa pela porta
 * (a sacola, a pessoa, o que chega sem a loja, o freio), como cada tentativa
 * terminou, e o que a Observabilidade mostra.
 */

const AGORA = new Date("2026-09-26T20:00:00Z")

const zerada: Contagem = {
  doCarrinho: 1,
  daPessoa: 1,
  diretas: 0,
  recusas: 0,
  terminadas: 0,
  daLoja: 1,
}
const com = (extra: Partial<Contagem>): Contagem => ({ ...zerada, ...extra })

const estado = (extra: Partial<Estado>): Estado => ({ ...estadoNovo("cartao", 8990, 1), ...extra })

describe("a sessão que vai pro parceiro", () => {
  const sessao = (
    id: string,
    data: Record<string, unknown>,
    provider_id = PROVEDOR_DO_PAGARME
  ) => ({
    id,
    provider_id,
    data,
  })
  const carrinho = (...sessoes: ReturnType<typeof sessao>[]) => ({
    payment_collection: { payment_sessions: sessoes },
  })

  it("é a do parceiro que ainda não foi, com a forma e o parceiro", () => {
    expect(
      sessaoQueVai(carrinho(sessao("payses_1", gravar(estadoNovo("cartao", 8990, 2)))))
    ).toEqual({ id: "payses_1", valor: 8990, forma: "cartao", provedor: PROVEDOR_DO_PAGARME })
    // O Pix também vai (0150): é anotado pro disjuntor, sem passar pelas travas.
    expect(sessaoQueVai(carrinho(sessao("payses_1", gravar(estadoNovo("pix", 8990, 1)))))).toEqual({
      id: "payses_1",
      valor: 8990,
      forma: "pix",
      provedor: PROVEDOR_DO_PAGARME,
    })
    expect(
      sessaoQueVai(
        carrinho(
          sessao(
            "payses_2",
            { mercadopago: estadoNovo("pix", 5000, 1), entrada: null },
            "pp_mercadopago_mercadopago"
          )
        )
      )
    ).toEqual({ id: "payses_2", valor: 5000, forma: "pix", provedor: "pp_mercadopago_mercadopago" })
  })

  it("a sessão que já foi e outro provedor não passam pela porta", () => {
    expect(
      sessaoQueVai(
        carrinho(
          sessao("payses_1", gravar(estado({ situacao: "recusado", recusa: RECUSAS.banco })))
        )
      )
    ).toBe(null)
    expect(
      sessaoQueVai(
        carrinho(sessao("payses_1", gravar(estadoNovo("cartao", 8990, 1)), "pp_system_default"))
      )
    ).toBe(null)
    // O estado do Pagar.me numa sessão do Mercado Pago não é dele: não vale.
    expect(
      sessaoQueVai(
        carrinho(
          sessao("payses_1", gravar(estadoNovo("pix", 8990, 1)), "pp_mercadopago_mercadopago")
        )
      )
    ).toBe(null)
  })

  it("carrinho sem coleção, sem sessão ou com sessão sem dados: nada", () => {
    expect(sessaoQueVai(undefined)).toBe(null)
    expect(sessaoQueVai(null)).toBe(null)
    expect(sessaoQueVai({ payment_collection: null })).toBe(null)
    expect(sessaoQueVai({ payment_collection: { payment_sessions: [null] } })).toBe(null)
    expect(sessaoQueVai(carrinho(sessao("payses_1", {})))).toBe(null)
  })
})

describe("o freio", () => {
  it("liga com 8 recusas nos 30 minutos, se forem pelo menos 3 de cada 4", () => {
    expect(freioLigado({ recusas: 7, terminadas: 7 })).toBe(false)
    expect(freioLigado({ recusas: 8, terminadas: 8 })).toBe(true)
    expect(freioLigado({ recusas: 8, terminadas: 10 })).toBe(true)
    expect(freioLigado({ recusas: 8, terminadas: 11 })).toBe(false)
    expect(freioLigado({ recusas: 30, terminadas: 40 })).toBe(true)
  })

  it("uma tarde boa, com recusa de gente no meio das vendas, não é robô", () => {
    expect(freioLigado({ recusas: 9, terminadas: 30 })).toBe(false)
  })
})

describe("quem passa pela porta", () => {
  it("a sacola: 5 na hora passam, a 6ª não", () => {
    expect(decidir(com({ doCarrinho: 5 }), true)).toEqual({ passa: true })
    expect(decidir(com({ doCarrinho: 6 }), true)).toEqual({ passa: false, motivo: "carrinho" })
  })

  it("a pessoa (o IP que a loja assina): 8 na hora passam, a 9ª não", () => {
    expect(decidir(com({ daPessoa: 8 }), true)).toEqual({ passa: true })
    expect(decidir(com({ daPessoa: 9 }), true)).toEqual({ passa: false, motivo: "pessoa" })
  })

  it("sem a assinatura da loja, todo mundo divide um balde de 3 por hora", () => {
    expect(decidir(com({ diretas: 3, daPessoa: 50 }), false)).toEqual({ passa: true })
    expect(decidir(com({ diretas: 4 }), false)).toEqual({ passa: false, motivo: "diretas" })
    // Com a assinatura, o balde das diretas não é dela.
    expect(decidir(com({ diretas: 40 }), true)).toEqual({ passa: true })
  })

  it("com o freio ligado: 3 da loja em 10 minutos, 2 por sacola, 2 por pessoa", () => {
    const freio = { recusas: 8, terminadas: 9 }
    expect(decidir(com({ ...freio, daLoja: 3, doCarrinho: 2, daPessoa: 2 }), true)).toEqual({
      passa: true,
    })
    expect(decidir(com({ ...freio, daLoja: 4 }), true)).toEqual({ passa: false, motivo: "freio" })
    expect(decidir(com({ ...freio, doCarrinho: 3 }), true)).toEqual({
      passa: false,
      motivo: "freio",
    })
    expect(decidir(com({ ...freio, daPessoa: 3 }), true)).toEqual({ passa: false, motivo: "freio" })
  })

  it("o balde das diretas vale com o freio também", () => {
    expect(decidir(com({ recusas: 8, terminadas: 8, diretas: 4 }), false)).toEqual({
      passa: false,
      motivo: "diretas",
    })
  })

  it("a loja lê o motivo no `message`: limite, ou a pausa do freio", () => {
    expect(RESPOSTA_DA_BARRADA).toEqual({
      carrinho: "cartao_limite",
      pessoa: "cartao_limite",
      diretas: "cartao_limite",
      freio: "cartao_freio",
    })
  })

  it("os números que valem", () => {
    expect(LIMITES).toEqual({
      carrinho: { vezes: 5, minutos: 60 },
      pessoa: { vezes: 8, minutos: 60 },
      diretas: { vezes: 3, minutos: 60 },
      freio: { recusas: 8, parte: 0.75, minutos: 30 },
      noFreio: { carrinho: 2, pessoa: 2, loja: { vezes: 3, minutos: 10 } },
    })
  })
})

describe("como a tentativa terminou", () => {
  it("aprovada, em análise, e a que parou antes do Pagar.me", () => {
    expect(resultadoDaSessao(estado({ situacao: "pago" }))).toEqual({
      resultado: "aprovada",
      motivo: null,
    })
    expect(resultadoDaSessao(estado({ situacao: "analise" }))).toEqual({
      resultado: "analise",
      motivo: null,
    })
    expect(resultadoDaSessao(estado({ situacao: "nova" }))).toEqual({
      resultado: "parou",
      motivo: null,
    })
  })

  it("recusa é o banco, a análise de fraude e o dado do cartão que o Pagar.me não aceitou", () => {
    expect(resultadoDaSessao(estado({ situacao: "recusado", recusa: RECUSAS.banco }))).toEqual({
      resultado: "recusada",
      motivo: "banco",
    })
    expect(resultadoDaSessao(estado({ situacao: "recusado", recusa: RECUSAS.antifraude }))).toEqual(
      { resultado: "recusada", motivo: "antifraude" }
    )
    expect(resultadoDaSessao(estado({ situacao: "falhou", recusa: RECUSAS.dados }))).toEqual({
      resultado: "recusada",
      motivo: "dados",
    })
  })

  it("o Pagar.me fora do ar e a resposta perdida são erro — não ligam o freio", () => {
    expect(resultadoDaSessao(estado({ situacao: "falhou", recusa: RECUSAS.fora }))).toEqual({
      resultado: "erro",
      motivo: "fora",
    })
    expect(resultadoDaSessao(estado({ situacao: "incerto", recusa: RECUSAS.incerto }))).toEqual({
      resultado: "erro",
      motivo: "incerto",
    })
    expect(resultadoDaSessao(null)).toEqual({ resultado: "erro", motivo: "sem-sessao" })
  })

  it("o erro leva o porquê que o provedor gravou — só o 'fora' e o 'incerto' são o parceiro que não atendeu", () => {
    const pix = (extra: Partial<Estado>): Estado => ({ ...estadoNovo("pix", 8990, 1), ...extra })
    expect(resultadoDaSessao(pix({ situacao: "aguardando" }))).toEqual({
      resultado: "gerado",
      motivo: null,
    })
    expect(
      resultadoDaSessao(pix({ situacao: "falhou", recusa: RECUSAS.pix, falha: "fora" }))
    ).toEqual({ resultado: "erro", motivo: "fora" })
    expect(
      resultadoDaSessao(pix({ situacao: "falhou", recusa: RECUSAS.pix, falha: "recusa" }))
    ).toEqual({ resultado: "erro", motivo: "recusa" })
    expect(
      resultadoDaSessao(pix({ situacao: "falhou", recusa: RECUSAS.fora, falha: "interno" }))
    ).toEqual({ resultado: "erro", motivo: "interno" })
    // O Pix do Mercado Pago que sumiu no caminho grava a frase do Pix, e é "incerto".
    expect(
      resultadoDaSessao(pix({ situacao: "incerto", recusa: RECUSAS.pix, falha: "fora" }))
    ).toEqual({ resultado: "erro", motivo: "incerto" })
    // O cartão que o Pagar.me atendeu e não passou, por motivo que não é banco nem análise.
    expect(
      resultadoDaSessao(estado({ situacao: "recusado", recusa: RECUSAS.fora, falha: "recusa" }))
    ).toEqual({ resultado: "erro", motivo: "recusa" })
  })
})

describe("quem, sem o IP", () => {
  it("a mesma pessoa dá a mesma chave, outra dá outra — e o IP não aparece", () => {
    const a = semOIp("loja:189.10.20.30", "segredo")
    expect(a).toMatch(/^loja:[0-9a-f]{16}$/)
    expect(a).not.toContain("189")
    expect(semOIp("loja:189.10.20.30", "segredo")).toBe(a)
    expect(semOIp("loja:189.10.20.31", "segredo")).not.toBe(a)
    expect(semOIp("direto:::1", "segredo")).toMatch(/^direto:[0-9a-f]{16}$/)
  })
})

describe("na Observabilidade", () => {
  const resumo = (extra: Partial<ResumoDoCartao>): ResumoDoCartao => ({
    ...RESUMO_VAZIO,
    ...extra,
  })

  it("sem robô: nenhum problema, e o freio desligado", () => {
    const r = resumo({ tentativas: 12, aprovadas: 9, analise: 1, recusadas: 2 })
    expect(problemasDoCartao(r, AGORA)).toEqual([])
    expect(cartaoNaTela(r)).toEqual({
      tentativas: 12,
      aprovadas: 10,
      recusadas: 2,
      barradas: 0,
      freio: { ligado: false, texto: "Freio desligado: nenhum sinal de robô testando cartão." },
    })
  })

  it("o freio ligado é grave, sai sozinho, e diz desde quando", () => {
    const desde = new Date("2026-09-26T19:41:00Z")
    const r = resumo({
      tentativas: 20,
      recusadas: 18,
      barradas: 30,
      freio: { recusas: 12, terminadas: 13, desde },
    })
    const [p] = problemasDoCartao(r, AGORA)
    expect(p).toMatchObject({
      chave: "robo-no-cartao",
      nivel: "grave",
      area: "Pagamento",
      sozinho: true,
      soDono: false,
      ocorreu: desde,
    })
    expect(p.texto).toContain("12 de 13 tentativas de cartão foram recusadas")
    expect(p.texto).toContain("o Pix segue normal")
    expect(p.detalhe).toBe(
      "[cartão] 12 recusas de 13 em 30 min; nas últimas 24 h, 18 recusadas e 30 barradas"
    )
    const tela = cartaoNaTela(r)
    expect(tela.freio.ligado).toBe(true)
    expect(tela.freio.texto).toMatch(/^Freio ligado desde \d\d:\d\d: 12 recusas de 13 tentativas/)
  })

  it("a tentativa sem a assinatura da loja é atenção, com o que conferir", () => {
    const [p] = problemasDoCartao(resumo({ diretas: 2 }), AGORA)
    expect(p).toMatchObject({
      chave: "cartao-sem-a-loja",
      nivel: "atencao",
      titulo: "2 tentativas de cartão sem passar pela loja",
      sozinho: true,
    })
    expect(p.texto).toContain("REVALIDAR_SEGREDO")
    expect(problemasDoCartao(resumo({ diretas: 1 }), AGORA)[0].titulo).toBe(
      "1 tentativa de cartão sem passar pela loja"
    )
  })
})
