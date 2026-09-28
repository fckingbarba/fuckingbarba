import { randomBytes } from "node:crypto"
import {
  decidir,
  DESCONTO_DO_RESGATE,
  FLUXOS,
  lerConfigDosFluxos,
  registrosDoMotor,
  TOQUE_DA_RESPOSTA_DO_RESGATE,
} from "../fluxos"
import {
  adormecido,
  chaveDoResgate,
  deuSinalDepois,
  emailDaChave,
  PRAZO_DO_SIM,
  resgateDoToken,
  tokenDoResgate,
  whatsappDoResultado,
  type RespostaDoResgate,
} from "../resgate"

/**
 * O resgate e o sunset (0192): quem passou do dia de comprar de novo — a
 * pergunta de 1 clique, o cupom de 15% pra quem não respondeu, e o "Quer
 * continuar recebendo?" de quem não deu sinal nenhum em 45 dias.
 */

const DIA = 24 * 60 * 60 * 1000
// 28/09, meio-dia em Brasília.
const AGORA = new Date("2026-09-28T15:00:00Z")
const antes = (dias: number) => new Date(AGORA.getTime() - dias * DIA)
const EMAIL = "rafael@exemplo.com"
const CHAVE = chaveDoResgate(EMAIL, antes(1))
const PEDIDO = "nso_01K5ZB0W6Y7Q8R9S0T1V2W3X4Y"
const K = randomBytes(32)

describe("o resgate no motor", () => {
  it("começa desligado, é o último da fila, e os toques são 0, 7 (o cupom), 9 e 45 dias", () => {
    expect(lerConfigDosFluxos({}).fluxos.resgate).toEqual({ ligado: false, desde: null })
    expect(FLUXOS.resgate.toques.map((t) => t.depois / DIA)).toEqual([0, 7, 9, 45])
    expect(FLUXOS.resgate.toques.filter((t) => t.cupom).map((t) => t.id)).toEqual(["resgate-7d"])
    expect(Math.max(...Object.values(FLUXOS).map((f) => f.prioridade))).toBe(
      FLUXOS.resgate.prioridade
    )
    expect(DESCONTO_DO_RESGATE).toBe(15)
  })

  it("ligar não dispara pra quem já estava em risco; quem fica em risco depois, recebe no dia", () => {
    const entrada = (desde: Date) => ({
      fluxo: "resgate" as const,
      chave: chaveDoResgate(EMAIL, desde),
      email: EMAIL,
      comeco: desde,
      inicio: desde,
      comprou: false,
    })
    const ligou = antes(10)
    expect(
      decidir({
        entradas: [entrada(antes(12))],
        registros: [],
        ligados: { resgate: ligou },
        agora: AGORA,
      })
    ).toBeNull()
    const r = decidir({
      entradas: [entrada(new Date(AGORA.getTime() - 60 * 1000))],
      registros: [],
      ligados: { resgate: ligou },
      agora: AGORA,
    })
    expect(r?.decisao.tipo === "nada" ? null : r?.decisao.toque.id).toBe("resgate-agora")
  })

  it("a resposta mora no registro: não conta no teto, mas o cupom do “Tá caro” conta nos 60 dias", () => {
    const [resposta] = registrosDoMotor([
      {
        email: EMAIL,
        fluxo: "resgate",
        chave: CHAVE,
        toque: TOQUE_DA_RESPOSTA_DO_RESGATE,
        como: "caro",
        em: antes(1),
        cupom: "VOLTA-7KQ2MX",
      },
    ])
    expect(resposta).toMatchObject({ como: "pulado", cupom: "VOLTA-7KQ2MX" })
    // Um carrinho abandonado da mesma pessoa, no toque do desconto: sai sem cupom novo.
    const carrinho = {
      fluxo: "carrinho" as const,
      chave: "cart_1",
      email: EMAIL,
      comeco: new Date(AGORA.getTime() - DIA - 60 * 1000),
      comprou: false,
    }
    const decisao = decidir({
      entradas: [carrinho],
      registros: [resposta],
      ligados: { carrinho: antes(30) },
      agora: AGORA,
    })?.decisao
    expect(decisao?.tipo === "mandar" && decisao.toque.id).toBe("carrinho-24h")
    expect(decisao?.tipo === "mandar" && decisao.darCupom).toBe(false)
  })
})

describe("os botões", () => {
  it("o link leva a resposta, o pedido, o que acabou e a chave — e volta igual", () => {
    expect(CHAVE).toBe("rafael@exemplo.com|2026-09-27")
    expect(emailDaChave(CHAVE)).toBe(EMAIL)
    const respostas: RespostaDoResgate[] = ["caro", "esqueci", "resultado", "outro", "sim"]
    for (const resposta of respostas) {
      const link = { chave: CHAVE, pedido: PEDIDO, componente: "fator" as const, resposta }
      expect(resgateDoToken(tokenDoResgate(link, K), K)).toEqual(link)
    }
    const semNada = { chave: CHAVE, pedido: null, componente: null, resposta: "outro" as const }
    expect(resgateDoToken(tokenDoResgate(semNada, K), K)).toEqual(semNada)
  })

  it("link de outra chave, mexido ou torto não vale", () => {
    const t = tokenDoResgate(
      { chave: CHAVE, pedido: PEDIDO, componente: null, resposta: "caro" },
      K
    )
    expect(resgateDoToken(t, randomBytes(32))).toBeNull()
    const mexido = t.slice(0, 20) + (t[20] === "A" ? "B" : "A") + t.slice(21)
    expect(resgateDoToken(mexido, K)).toBeNull()
    for (const torto of [null, 42, "", "curto", "x".repeat(600), "com espaço e acento ç"])
      expect(resgateDoToken(torto, K)).toBeNull()
    expect(() =>
      tokenDoResgate({ chave: CHAVE, pedido: "order_1", componente: null, resposta: "caro" }, K)
    ).toThrow()
    expect(() =>
      tokenDoResgate({ chave: "sem-dia", pedido: null, componente: null, resposta: "caro" }, K)
    ).toThrow()
  })

  it("o “Não vi resultado” abre o WhatsApp da loja com a mensagem pronta", () => {
    expect(
      whatsappDoResultado("(47) 98826-1551", { curto: "Fator de Crescimento", artigo: "o" })
    ).toBe(
      `https://wa.me/47988261551?text=${encodeURIComponent(
        "Oi! Não vi resultado com o Fator de Crescimento e queria uma ajuda."
      )}`
    )
    expect(whatsappDoResultado("47988261551", null)).toContain(
      encodeURIComponent("com os produtos")
    )
    expect(whatsappDoResultado(null, null)).toBeNull()
    expect(whatsappDoResultado("123", null)).toBeNull()
  })
})

describe("o sunset", () => {
  const sunset = antes(8)
  const depois = (dias: number) => new Date(sunset.getTime() + dias * DIA)

  it("adormece 7 dias depois do “Quer continuar recebendo?”, sem o Sim nem sinal nenhum", () => {
    expect(PRAZO_DO_SIM).toBe(7 * DIA)
    expect(adormecido({ sunset, sim: null, sinais: [null, null, null] }, AGORA)).toBe(true)
    // Ainda no prazo.
    expect(adormecido({ sunset: antes(6), sim: null, sinais: [] }, AGORA)).toBe(false)
    // Sem o e-mail do sunset, ninguém adormece.
    expect(adormecido({ sunset: null, sim: null, sinais: [] }, AGORA)).toBe(false)
  })

  it("o Sim, um clique, uma visita ou uma compra depois do e-mail acordam; o de antes não vale", () => {
    expect(adormecido({ sunset, sim: depois(1), sinais: [] }, AGORA)).toBe(false)
    expect(adormecido({ sunset, sim: null, sinais: [null, depois(2), null] }, AGORA)).toBe(false)
    expect(adormecido({ sunset, sim: depois(-1), sinais: [depois(-3)] }, AGORA)).toBe(true)
    // Voltar muito depois também acorda.
    expect(adormecido({ sunset: antes(90), sim: null, sinais: [antes(1)] }, AGORA)).toBe(false)
  })

  it("o sinal de vida do toque de 45 dias: qualquer data depois do começo do resgate", () => {
    expect(deuSinalDepois([null, null], antes(45))).toBe(false)
    expect(deuSinalDepois([antes(50), null], antes(45))).toBe(false)
    expect(deuSinalDepois([null, antes(10)], antes(45))).toBe(true)
  })
})
