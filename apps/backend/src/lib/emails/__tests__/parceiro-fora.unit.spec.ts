import { emailDoParceiro, type AvisoDoParceiro } from "../parceiro-fora"

/**
 * O aviso do disjuntor pra equipe: o texto muda conforme quem mais está
 * ligado na loja e de pé — e nunca promete o que a loja não está fazendo.
 */

const PAGARME = { nome: "Pagar.me", formas: ["pix", "cartao"] as const }
const MP = { nome: "Mercado Pago", formas: ["pix"] as const }
// 14:05 em Brasília.
const DESDE = new Date("2026-09-27T17:05:00Z")

const aviso = (extra: Partial<AvisoDoParceiro>): AvisoDoParceiro => ({
  parceiro: PAGARME,
  reserva: false,
  tipo: "caiu",
  desde: DESDE,
  outros: [{ ...MP, emQueda: false }],
  ...extra,
})

describe("o aviso do parceiro que caiu", () => {
  it("o Pagar.me caiu com o Mercado Pago de pé: o Pix sai por ele, e o cartão sai da tela", () => {
    const e = emailDoParceiro("dono@loja.com", aviso({}))
    expect(e.assunto).toBe("O Pagar.me parou de responder: o Pix está saindo pelo Mercado Pago")
    expect(e.texto).toContain("Desde as 14:05, as últimas 3 tentativas")
    expect(e.texto).toContain("o Pix está saindo pelo Mercado Pago, e o cartão fica fora da tela")
    expect(e.texto).toContain("A cada 5 minutos a loja tenta o Pagar.me de novo")
    expect(e.para).toBe("dono@loja.com")
    expect(e.html).toContain("O Pagar.me parou")
  })

  it("os dois fora: diz que é provável que ninguém consiga pagar, e o WhatsApp", () => {
    const e = emailDoParceiro("dono@loja.com", aviso({ outros: [{ ...MP, emQueda: true }] }))
    expect(e.assunto).toBe("Os parceiros de pagamento pararam de responder")
    expect(e.texto).toContain("O Mercado Pago também não está respondendo")
    expect(e.texto).toContain("é provável que ninguém consiga pagar agora")
    expect(e.texto).toContain("WhatsApp")
  })

  it("sem reserva ligada: não promete Pix por outro lugar", () => {
    const e = emailDoParceiro("dono@loja.com", aviso({ outros: [] }))
    expect(e.assunto).toBe("O Pagar.me parou de responder")
    expect(e.texto).toContain("A loja não tem outro parceiro ligado")
    expect(e.texto).not.toContain("Mercado Pago")
  })

  it("a reserva caiu com o Pagar.me de pé: nada muda pra quem compra", () => {
    const e = emailDoParceiro(
      "dono@loja.com",
      aviso({ parceiro: MP, reserva: true, outros: [{ ...PAGARME, emQueda: false }] })
    )
    expect(e.assunto).toBe("O Mercado Pago parou de responder (a reserva do Pix)")
    expect(e.texto).toContain("Nada muda pra quem compra: o Pagar.me segue cobrando")
    expect(e.texto).toContain("se a chave da loja continua valendo")
  })
})

describe("o aviso do parceiro que voltou", () => {
  const agora = new Date("2026-09-27T17:32:00Z")

  it("o Pagar.me voltou: quanto tempo ficou fora, e o cartão de volta", () => {
    const e = emailDoParceiro("dono@loja.com", aviso({ tipo: "voltou" }), agora)
    expect(e.assunto).toBe("O Pagar.me voltou")
    expect(e.texto).toContain("voltou a responder às 14:32, depois de 27 min fora (desde as 14:05)")
    expect(e.texto).toContain("o cartão voltou pra tela")
    expect(e.texto).toContain("Não precisa fazer nada.")
  })

  it("a reserva voltou: o Pix reserva de pé de novo", () => {
    const e = emailDoParceiro(
      "dono@loja.com",
      aviso({
        parceiro: MP,
        reserva: true,
        tipo: "voltou",
        outros: [{ ...PAGARME, emQueda: false }],
      }),
      agora
    )
    expect(e.assunto).toBe("O Mercado Pago voltou")
    expect(e.texto).toContain("O Pix reserva, pelo Mercado Pago, está de pé de novo.")
  })
})
