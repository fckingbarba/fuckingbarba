import { linkDeVoltar, voltaDoLink } from "../voltar"

/**
 * O link de voltar: abre o carrinho ou o pedido certo, vence em 7 dias, e
 * nada que não saiu daqui passa — nem o id trocado, nem a hora esticada.
 */

const CARRINHO = "cart_01K6ABCDEFGHJKMNPQRSTVWXYZ"
const PEDIDO = "order_01K6ABCDEFGHJKMNPQRSTVWXYZ"
const AGORA = new Date("2026-09-27T20:00:00Z")
const DIA = 24 * 60 * 60 * 1000

describe("o link de voltar", () => {
  const antes = process.env.JWT_SECRET
  beforeAll(() => {
    process.env.JWT_SECRET = "segredo-de-teste"
  })
  afterAll(() => {
    if (antes === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = antes
  })

  it("abre o carrinho e o pedido que o fizeram", () => {
    expect(voltaDoLink(linkDeVoltar(CARRINHO, AGORA), AGORA)).toEqual({
      tipo: "carrinho",
      id: CARRINHO,
    })
    expect(voltaDoLink(linkDeVoltar(PEDIDO, AGORA), AGORA)).toEqual({ tipo: "pedido", id: PEDIDO })
  })

  it("vence em 7 dias", () => {
    const t = linkDeVoltar(CARRINHO, AGORA)
    expect(voltaDoLink(t, new Date(AGORA.getTime() + 6 * DIA))).not.toBeNull()
    expect(voltaDoLink(t, new Date(AGORA.getTime() + 8 * DIA))).toBeNull()
  })

  it("nada que não saiu daqui passa", () => {
    const [id, vence, assinatura] = linkDeVoltar(CARRINHO, AGORA).split(".")
    const outro = "cart_01K6ABCDEFGHJKMNPQRSTVWXYA"
    expect(voltaDoLink(`${outro}.${vence}.${assinatura}`, AGORA)).toBeNull()
    const esticado = (parseInt(vence, 36) + 30 * 24 * 3600).toString(36)
    expect(voltaDoLink(`${id}.${esticado}.${assinatura}`, AGORA)).toBeNull()
    expect(voltaDoLink(`${id}.${vence}`, AGORA)).toBeNull()
    expect(voltaDoLink("lixo", AGORA)).toBeNull()
    expect(voltaDoLink(42, AGORA)).toBeNull()
    process.env.JWT_SECRET = "outro-segredo"
    expect(voltaDoLink(`${id}.${vence}.${assinatura}`, AGORA)).toBeNull()
    process.env.JWT_SECRET = "segredo-de-teste"
  })

  it("só carrinho e pedido do Medusa", () => {
    expect(() => linkDeVoltar("cus_01K6ABCDEFGHJKMNPQRSTVWXYZ", AGORA)).toThrow()
    expect(() => linkDeVoltar("cart_curto", AGORA)).toThrow()
  })
})
