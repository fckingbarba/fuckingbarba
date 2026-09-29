import { abrirEntrega, enderecosDaEntrega, fecharEntrega } from "../entrega-da-base"
import type { EntregaDaNuvemshop } from "../nuvemshop"

/**
 * A entrega dos pedidos da Nuvemshop (0202): cifrada no banco, com a chave
 * que sai do JWT_SECRET, e aberta no carrinho do "Refazer o pedido" do jeito
 * que o checkout da loja grava.
 */

const ENTREGA: EntregaDaNuvemshop = {
  nome: "Rafael",
  sobrenome: "da Silva",
  telefone: "+5511988887777",
  documento: { tipo: "cpf", valor: "11144477735" },
  cep: "89010000",
  rua: "Rua Um",
  numero: "1",
  complemento: "Apto 2",
  bairro: "Centro",
  cidade: "Blumenau",
  uf: "SC",
}

describe("a entrega cifrada", () => {
  const antes = process.env.JWT_SECRET
  beforeEach(() => {
    process.env.JWT_SECRET = "segredo-de-teste"
  })
  afterAll(() => {
    if (antes === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = antes
  })

  it("fecha e abre igual — e o banco não vê nada legível", () => {
    const fechada = fecharEntrega(ENTREGA)!
    expect(fechada).toMatch(/^v1\./)
    expect(fechada).not.toMatch(/11144477735|988887777|Rua Um|Blumenau|89010000|Rafael/)
    expect(abrirEntrega(fechada)).toEqual(ENTREGA)
    // Duas vezes a mesma entrega, dois textos diferentes (o começo sorteado).
    expect(fecharEntrega(ENTREGA)).not.toBe(fechada)
  })

  it("outro segredo, texto mexido, torto ou nada: não abre", () => {
    const fechada = fecharEntrega(ENTREGA)!
    const [v, iv, marca, corpo] = fechada.split(".")
    const mexido = [v, iv, marca, (corpo[0] === "A" ? "B" : "A") + corpo.slice(1)].join(".")
    expect(abrirEntrega(mexido)).toBeNull()
    for (const torto of [null, undefined, "", "v1.a.b", "v2." + fechada.slice(3)])
      expect(abrirEntrega(torto)).toBeNull()
    process.env.JWT_SECRET = "outro-segredo"
    expect(abrirEntrega(fechada)).toBeNull()
  })

  it("sem o segredo, nada é guardado", () => {
    delete process.env.JWT_SECRET
    expect(fecharEntrega(ENTREGA)).toBeNull()
    expect(abrirEntrega("v1.a.b.c")).toBeNull()
  })
})

describe("os endereços do carrinho", () => {
  it("como o checkout grava: rua e número, complemento e bairro, o documento só na cobrança", () => {
    const { shipping_address, billing_address } = enderecosDaEntrega(ENTREGA)
    expect(shipping_address).toEqual({
      first_name: "Rafael",
      last_name: "da Silva",
      phone: "+5511988887777",
      address_1: "Rua Um, 1",
      address_2: "Apto 2 — Centro",
      city: "Blumenau",
      province: "SC",
      postal_code: "89010000",
      country_code: "br",
      metadata: { rua: "Rua Um", numero: "1", complemento: "Apto 2", bairro: "Centro" },
    })
    expect(billing_address.metadata).toEqual({
      ...shipping_address.metadata,
      documento: { tipo: "cpf", valor: "11144477735" },
    })
  })

  it("sem complemento, sem celular e sem documento: o que tem", () => {
    const { shipping_address, billing_address } = enderecosDaEntrega({
      ...ENTREGA,
      complemento: "",
      telefone: null,
      documento: null,
    })
    expect(shipping_address.address_2).toBe("Centro")
    expect(shipping_address).not.toHaveProperty("phone")
    expect(billing_address.metadata).not.toHaveProperty("documento")
  })
})
