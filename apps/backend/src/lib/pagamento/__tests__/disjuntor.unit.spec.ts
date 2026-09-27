import { conferirEntrada } from "../entrada"
import {
  DISJUNTOR,
  falhaDoErro,
  naoAtendeu,
  saudeDoParceiro,
  tempoFora,
  virada,
  type Terminada,
} from "../disjuntor"

/**
 * O disjuntor dos parceiros: quem conta como "não atendeu", quando o
 * parceiro sai do caminho e quando volta — e a virada que manda o e-mail.
 */

const PAGARME = "pp_pagarme_pagarme"
const MP = "pp_mercadopago_mercadopago"
const AGORA = new Date("2026-09-27T15:00:00Z")
const minutosAtras = (m: number) => new Date(AGORA.getTime() - m * 60_000)
const CINCO = 5 * 60_000

const fora = (m: number, provedor = PAGARME): Terminada => ({
  provedor,
  resultado: "erro",
  motivo: "fora",
  em: minutosAtras(m),
})
const incerto = (m: number, provedor = PAGARME): Terminada => ({
  ...fora(m, provedor),
  motivo: "incerto",
})
const gerado = (m: number, provedor = PAGARME): Terminada => ({
  provedor,
  resultado: "gerado",
  motivo: null,
  em: minutosAtras(m),
})

describe("quem não atendeu", () => {
  it("só o erro 'fora' e o 'incerto' — recusa, erro nosso e o Pix gerado não", () => {
    expect(naoAtendeu(fora(1))).toBe(true)
    expect(naoAtendeu(incerto(1))).toBe(true)
    expect(naoAtendeu({ resultado: "erro", motivo: "recusa" })).toBe(false)
    expect(naoAtendeu({ resultado: "erro", motivo: "interno" })).toBe(false)
    expect(naoAtendeu({ resultado: "recusada", motivo: "banco" })).toBe(false)
    expect(naoAtendeu(gerado(1))).toBe(false)
  })

  it("o erro do cliente: só o dado recusado é recusa; sem resposta, 5xx e a chave, fora", () => {
    expect(falhaDoErro("validacao")).toBe("recusa")
    expect(falhaDoErro("rede")).toBe("fora")
    expect(falhaDoErro("servidor")).toBe("fora")
    expect(falhaDoErro("autenticacao")).toBe("fora")
    expect(falhaDoErro("nao_encontrado")).toBe("fora")
  })
})

describe("a saúde de um parceiro", () => {
  it("três falhas seguidas tiram do caminho por 5 minutos, contados da última", () => {
    const s = saudeDoParceiro(PAGARME, [fora(1), incerto(2), fora(3)], AGORA, CINCO)
    expect(s.seguidas).toBe(3)
    expect(s.emQuedaDesde).toEqual(minutosAtras(3))
    expect(s.foraAte).toEqual(new Date(minutosAtras(1).getTime() + CINCO))
  })

  it("duas não bastam, e uma que deu certo no meio zera a conta", () => {
    expect(saudeDoParceiro(PAGARME, [fora(1), fora(2)], AGORA, CINCO).foraAte).toBeNull()
    const s = saudeDoParceiro(PAGARME, [fora(1), fora(2), gerado(3), fora(4)], AGORA, CINCO)
    expect(s).toMatchObject({ seguidas: 2, emQuedaDesde: null, foraAte: null })
  })

  it("passados os 5 minutos, volta pro caminho — mas segue em queda até uma dar certo", () => {
    const s = saudeDoParceiro(PAGARME, [fora(6), fora(7), fora(8)], AGORA, CINCO)
    expect(s.foraAte).toBeNull()
    expect(s.emQuedaDesde).toEqual(minutosAtras(8))
  })

  it("'seguidas' é entre as tentativas, não no relógio: com pouca venda, horas de queda contam", () => {
    const s = saudeDoParceiro(PAGARME, [fora(1), fora(90), fora(200)], AGORA, CINCO)
    expect(s.seguidas).toBe(3)
    expect(s.foraAte).not.toBeNull()
  })

  it("cada parceiro com as dele, em qualquer ordem", () => {
    const linhas = [fora(3), gerado(1, MP), fora(1), fora(2), fora(4, MP)]
    expect(saudeDoParceiro(PAGARME, linhas, AGORA, CINCO).seguidas).toBe(3)
    expect(saudeDoParceiro(MP, linhas, AGORA, CINCO)).toMatchObject({
      seguidas: 0,
      foraAte: null,
    })
  })

  it("sem tentativa nenhuma: bem", () => {
    expect(saudeDoParceiro(PAGARME, [], AGORA)).toEqual({
      id: PAGARME,
      seguidas: 0,
      emQuedaDesde: null,
      foraAte: null,
    })
  })

  it("o tempo fora é de 5 minutos — o conferidor encurta, nunca abaixo de 10 segundos", () => {
    expect(DISJUNTOR).toEqual({ falhas: 3, minutos: 5 })
    expect(tempoFora({})).toBe(CINCO)
    expect(tempoFora({ PAGAMENTO_DISJUNTOR_SEGUNDOS: "20" })).toBe(20_000)
    expect(tempoFora({ PAGAMENTO_DISJUNTOR_SEGUNDOS: "3" })).toBe(CINCO)
    expect(tempoFora({ PAGAMENTO_DISJUNTOR_SEGUNDOS: "abc" })).toBe(CINCO)
  })
})

describe("a virada, que manda o e-mail", () => {
  const saude = (linhas: Terminada[]) => saudeDoParceiro(PAGARME, linhas, AGORA, CINCO)

  it("a terceira falha seguida derruba", () => {
    expect(virada(saude([fora(2), fora(3)]), saude([fora(1), fora(2), fora(3)]))).toEqual({
      tipo: "caiu",
    })
  })

  it("a quarta falha, com ele já em queda, não derruba de novo (nada de e-mail a cada 5 minutos)", () => {
    const antes = saude([fora(6), fora(7), fora(8)])
    expect(virada(antes, saude([fora(0), fora(6), fora(7), fora(8)]))).toBeNull()
  })

  it("a primeira que dá certo depois da queda traz de volta, com a hora em que ela começou", () => {
    const antes = saude([fora(6), fora(7), fora(8)])
    expect(virada(antes, saude([gerado(0), fora(6), fora(7), fora(8)]))).toEqual({
      tipo: "voltou",
      desde: minutosAtras(8),
    })
  })

  it("o que dá certo com ele bem não é volta nenhuma", () => {
    expect(virada(saude([fora(2)]), saude([gerado(1), fora(2)]))).toBeNull()
  })
})

describe("a reserva, na entrada", () => {
  const entrada = (extra: Record<string, unknown>) => ({
    forma: "pix",
    comprador: {
      nome: "Rafael Souza",
      email: "rafael@exemplo.com",
      documento: "11144477735",
      tipoDocumento: "cpf",
      telefone: "+5547999998888",
    },
    endereco: {
      rua: "Rua das Palmeiras",
      numero: "10",
      complemento: "",
      bairro: "Centro",
      cidade: "Blumenau",
      uf: "SC",
      cep: "89036370",
    },
    itens: [{ codigo: "FBOL01", descricao: "Óleo", quantidade: 1, total: 62.58 }],
    frete: { total: 0, descricao: "" },
    ...extra,
  })

  it("só `true` de verdade, e só no Pix", () => {
    expect(conferirEntrada(entrada({ reserva: true }), 6258).reserva).toBe(true)
    expect(conferirEntrada(entrada({ reserva: "true" }), 6258).reserva).toBe(false)
    expect(conferirEntrada(entrada({}), 6258).reserva).toBe(false)
    expect(
      conferirEntrada(
        entrada({ forma: "cartao", token: "token_abcdef123456", reserva: true }),
        6258
      ).reserva
    ).toBe(false)
  })
})
