import { randomBytes } from "node:crypto"
import { checkinDoToken, tokenDoCheckin, whatsappDaDuvida } from "../checkin"

/**
 * O check-in de 7 dias (0187): o link cifrado com o pedido e a resposta —
 * só "bem" e "duvida" —, e o WhatsApp da dúvida com a mensagem pronta.
 */

const CHAVE = randomBytes(32)
const PEDIDO = "order_01K6ABCDEFGHJKMNPQRSTVWXYZ"

describe("o link do check-in", () => {
  it("vai e volta com o pedido e a resposta", () => {
    expect(checkinDoToken(tokenDoCheckin(PEDIDO, "bem", CHAVE), CHAVE)).toEqual({
      pedido: PEDIDO,
      resposta: "bem",
    })
    expect(checkinDoToken(tokenDoCheckin(PEDIDO, "duvida", CHAVE), CHAVE)?.resposta).toBe("duvida")
  })

  it("mexido, de outra chave, torto, ou de pedido fora do formato: nada", () => {
    const t = tokenDoCheckin(PEDIDO, "bem", CHAVE)
    const mexido = t.slice(0, -2) + (t.endsWith("AA") ? "BB" : "AA")
    expect(checkinDoToken(mexido, CHAVE)).toBeNull()
    expect(checkinDoToken(t, randomBytes(32))).toBeNull()
    for (const torto of [undefined, "", "abc", 42, "x".repeat(300)])
      expect(checkinDoToken(torto, CHAVE)).toBeNull()
    expect(() => tokenDoCheckin("cart_01K6ABCDEFGHJKMNPQRSTVWXYZ", "bem", CHAVE)).toThrow()
  })
})

describe("o WhatsApp da dúvida", () => {
  it("o número só com dígitos, e a mensagem com o pedido", () => {
    expect(whatsappDaDuvida("+55 (47) 98826-1551", 3312)).toBe(
      `https://wa.me/5547988261551?text=${encodeURIComponent("Oi! Tenho uma dúvida sobre o meu pedido #3312.")}`
    )
    expect(whatsappDaDuvida(null, 3312)).toBeNull()
    expect(whatsappDaDuvida("123", 3312)).toBeNull()
  })
})
