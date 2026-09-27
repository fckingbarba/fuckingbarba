import { createHmac, randomBytes } from "node:crypto"
import {
  assinaturaConfere,
  etiquetaLimpa,
  lerAvisoDoResend,
  linkLimpo,
  TOLERANCIA_S,
} from "../resend"

/**
 * Os avisos do Resend: só com a assinatura dele (o padrão Svix), e só o que o
 * CRM usa — sem assunto, sem IP, sem e-mail no porquê da devolução.
 */

const SEGREDO = `whsec_${randomBytes(24).toString("base64")}`
const LOJA = "loja.fuckingbarba.com.br"
const AGORA = Date.parse("2026-09-27T12:00:00Z")

function assinar(corpo: string, id = "msg_1", ts = String(AGORA / 1000), segredo = SEGREDO) {
  const chave = Buffer.from(segredo.replace(/^whsec_/, ""), "base64")
  return `v1,${createHmac("sha256", chave).update(`${id}.${ts}.${corpo}`).digest("base64")}`
}

describe("a assinatura", () => {
  const corpo = JSON.stringify({ type: "email.delivered", data: { email_id: "e1" } })
  const base = {
    id: "msg_1",
    timestamp: String(AGORA / 1000),
    corpo,
    segredo: SEGREDO,
    agora: AGORA,
  }

  it("confere a do Resend, e só ela", () => {
    expect(assinaturaConfere({ ...base, assinaturas: assinar(corpo) })).toBe(true)
    const outroSegredo = `whsec_${randomBytes(24).toString("base64")}`
    expect(
      assinaturaConfere({
        ...base,
        assinaturas: assinar(corpo, "msg_1", base.timestamp, outroSegredo),
      })
    ).toBe(false)
    expect(assinaturaConfere({ ...base, corpo: `${corpo} `, assinaturas: assinar(corpo) })).toBe(
      false
    )
    expect(assinaturaConfere({ ...base, id: "msg_2", assinaturas: assinar(corpo) })).toBe(false)
  })

  it("na troca de segredo vêm duas: basta uma; a v2 não vale", () => {
    const velha = assinar(
      corpo,
      "msg_1",
      base.timestamp,
      `whsec_${randomBytes(24).toString("base64")}`
    )
    expect(assinaturaConfere({ ...base, assinaturas: `${velha} ${assinar(corpo)}` })).toBe(true)
    expect(assinaturaConfere({ ...base, assinaturas: assinar(corpo).replace(/^v1,/, "v2,") })).toBe(
      false
    )
  })

  it("aviso de mais de 5 minutos (repetição de alguém), sem segredo ou sem cabeçalho: não", () => {
    const velho = String(AGORA / 1000 - TOLERANCIA_S - 1)
    expect(
      assinaturaConfere({ ...base, timestamp: velho, assinaturas: assinar(corpo, "msg_1", velho) })
    ).toBe(false)
    expect(assinaturaConfere({ ...base, segredo: undefined, assinaturas: assinar(corpo) })).toBe(
      false
    )
    expect(assinaturaConfere({ ...base, id: undefined, assinaturas: assinar(corpo) })).toBe(false)
    expect(assinaturaConfere({ ...base, assinaturas: ["v1,x"] })).toBe(false)
  })
})

describe("o aviso", () => {
  const aviso = (
    type: string,
    data: Record<string, unknown>,
    created_at = "2026-09-27T12:00:05Z"
  ) => lerAvisoDoResend({ type, created_at, data: { email_id: "e1", ...data } }, LOJA)

  it("a entrega: o e-mail, o tipo da etiqueta e as horas; o assunto não fica", () => {
    expect(
      aviso("email.delivered", {
        to: ["Rafael@Gmail.com"],
        subject: "123456 é o seu código",
        created_at: "2026-09-27T12:00:00Z",
        tags: { tipo: "codigo-de-entrar" },
      })
    ).toEqual({
      campo: "entregue",
      resendId: "e1",
      para: "rafael@gmail.com",
      tipo: "codigo-de-entrar",
      enviadoEm: new Date("2026-09-27T12:00:00Z"),
      em: new Date("2026-09-27T12:00:05Z"),
      link: null,
      devolucao: null,
    })
  })

  it("o clique: a hora dele, a página da loja sem id; de fora, só o domínio; nada de IP", () => {
    const naLoja = aviso("email.clicked", {
      to: ["a@b.com"],
      click: {
        link: "https://www.loja.fuckingbarba.com.br/conta/pedidos/order_01K5ZB0W6Y7Q8R9S0T1V2W3X4Y?x=1",
        timestamp: "2026-09-27T13:10:00Z",
        ipAddress: "200.1.2.3",
        userAgent: "Safari",
      },
    })
    expect(naLoja?.campo).toBe("clicado")
    expect(naLoja?.em).toEqual(new Date("2026-09-27T13:10:00Z"))
    expect(naLoja?.link).toBe("/conta/pedidos/:id")
    expect(JSON.stringify(naLoja)).not.toContain("200.1.2.3")
    expect(
      aviso("email.clicked", { click: { link: "https://www.instagram.com/fuckingbarba" } })?.link
    ).toBe("instagram.com")
  })

  it("a devolução: o tipo e o porquê, com o e-mail mascarado", () => {
    expect(
      aviso("email.bounced", {
        to: ["x@y.com"],
        bounce: {
          type: "Permanent",
          subType: "General",
          message: "550 5.1.1 <joao.silva@gmail.com>: Recipient address rejected",
        },
      })?.devolucao
    ).toBe("Permanent · General: 550 5.1.1 <j•••@gmail.com>: Recipient address rejected")
  })

  it("cada tipo do Resend vira o seu campo; o resto não vale", () => {
    const campos = [
      ["email.sent", "enviado"],
      ["email.delivery_delayed", "atrasado"],
      ["email.opened", "aberto"],
      ["email.complained", "reclamou"],
      ["email.failed", "falhou"],
      ["email.suppressed", "suprimido"],
    ]
    for (const [tipo, campo] of campos) expect(aviso(tipo, {})?.campo).toBe(campo)
    expect(aviso("email.received", {})).toBeNull()
    expect(aviso("contact.created", {})).toBeNull()
    expect(lerAvisoDoResend({ type: "email.opened", data: {} }, LOJA)).toBeNull()
    expect(lerAvisoDoResend(null, LOJA)).toBeNull()
  })
})

describe("a etiqueta e o link", () => {
  it("a etiqueta que o Resend aceita", () => {
    expect(etiquetaLimpa("Pedido Confirmado!")).toBe("pedido-confirmado")
    expect(etiquetaLimpa("envio-saiu")).toBe("envio-saiu")
    expect(etiquetaLimpa("   ")).toBeNull()
    expect(etiquetaLimpa(undefined)).toBeNull()
  })

  it("o link que não é endereço não vira nada", () => {
    expect(linkLimpo("não é link", LOJA)).toBeNull()
    expect(linkLimpo("https://loja.fuckingbarba.com.br/", LOJA)).toBe("/")
  })
})
