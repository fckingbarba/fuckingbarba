import { linkDoPedido, pedidoDoLink } from "../link"

const PEDIDO = "order_01M3GF52GC3EB02F1NY7T95Y08"
const original = process.env.JWT_SECRET

beforeEach(() => {
  process.env.JWT_SECRET = "segredo-do-teste"
})
afterAll(() => {
  if (original === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = original
})

describe("o link da avaliação", () => {
  it("o link feito aqui abre o pedido dele", () => {
    const p = linkDoPedido(PEDIDO)
    expect(p).toMatch(/^order_01M3GF52GC3EB02F1NY7T95Y08\.[A-Za-z0-9_-]{22}$/)
    expect(pedidoDoLink(p)).toBe(PEDIDO)
  })

  it("trocar o pedido, a assinatura ou um caractere dela não abre nada", () => {
    const p = linkDoPedido(PEDIDO)
    const [, assinatura] = p.split(".")
    const outro = "order_01M3GF52GC3EB02F1NY7T95Y09"
    expect(pedidoDoLink(`${outro}.${assinatura}`)).toBeNull()
    const trocado = assinatura.replace(/^./, (c) => (c === "A" ? "B" : "A"))
    expect(pedidoDoLink(`${PEDIDO}.${trocado}`)).toBeNull()
    expect(pedidoDoLink(`${PEDIDO}.${assinatura.slice(0, -1)}`)).toBeNull()
    expect(pedidoDoLink(`${PEDIDO}.${assinatura}.x`)).toBeNull()
  })

  it("com outro segredo (outra loja, ou o segredo trocado), o link não vale", () => {
    const p = linkDoPedido(PEDIDO)
    process.env.JWT_SECRET = "outro-segredo"
    expect(pedidoDoLink(p)).toBeNull()
  })

  it("o que não tem a forma de um link vira nada, sem quebrar", () => {
    for (const v of [undefined, null, 42, "", PEDIDO, "order_x.abc", `${"a".repeat(90)}`])
      expect(pedidoDoLink(v)).toBeNull()
  })

  it("não faz link de id que não é de pedido", () => {
    expect(() => linkDoPedido("cart_01M3GF52GC3EB02F1NY7T95Y08")).toThrow()
  })
})
