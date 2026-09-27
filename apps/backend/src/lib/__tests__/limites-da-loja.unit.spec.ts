import { Readable } from "node:stream"
import type { MedusaRequest } from "@medusajs/framework/http"
import { lerCorpoGrande } from "../corpo-grande"
import { juntar } from "../crm/nuvemshop"
import { criarLimite, criarTetoDoDia } from "../limite"
import { quemPede, redeDoIp } from "../quem-pede"

/**
 * Os limites que seguram a loja de pé (auditoria de 27/09): a rede de quem
 * pede, a vaga reservada antes do banco, o teto do dia e o corpo grande lido
 * depois da porta.
 */

const HORA = 60 * 60 * 1000

describe("a rede de quem pede", () => {
  it("o IPv4 inteiro; o IPv6 pelo bloco /64 — trocar de endereço na mesma rede não é outra pessoa", () => {
    expect(redeDoIp("189.10.20.30")).toBe("189.10.20.30")
    expect(redeDoIp("2804:14c:65a1:4000:1c2e:3a4b:5c6d:7e8f")).toBe("2804:14c:65a1:4000::/64")
    expect(redeDoIp("2804:14c:65a1:4000::1")).toBe("2804:14c:65a1:4000::/64")
    expect(redeDoIp("2804:14C:65A1:4000:ffff::2")).toBe("2804:14c:65a1:4000::/64")
    expect(redeDoIp("2804:14c:65a1:4001::1")).toBe("2804:14c:65a1:4001::/64")
  })

  it("o IPv4 dentro do IPv6 vira o IPv4; colchetes e zona saem; o que não é IP volta como veio", () => {
    expect(redeDoIp("::ffff:189.10.20.30")).toBe("189.10.20.30")
    expect(redeDoIp("[2001:db8::1]")).toBe("2001:db8:0:0::/64")
    expect(redeDoIp("fe80::1%en0")).toBe("fe80:0:0:0::/64")
    expect(redeDoIp("?")).toBe("?")
  })

  it("a chave do limite usa a rede, assinada ou não", () => {
    const antes = process.env.REVALIDAR_SEGREDO
    process.env.REVALIDAR_SEGREDO = "segredo-do-teste"
    try {
      const pedido = (cabecalhos: Record<string, string>, ip?: string) =>
        ({ headers: cabecalhos, ip }) as unknown as MedusaRequest
      expect(
        quemPede(
          pedido({ "x-loja-segredo": "segredo-do-teste", "x-cliente-ip": "2804:14c:65a1:4000::99" })
        )
      ).toEqual({ chave: "loja:2804:14c:65a1:4000::/64", assinado: true })
      expect(quemPede(pedido({}, "::ffff:10.0.0.7"))).toEqual({
        chave: "direto:10.0.0.7",
        assinado: false,
      })
    } finally {
      process.env.REVALIDAR_SEGREDO = antes
    }
  })
})

describe("a vaga reservada antes do banco", () => {
  const janela = { limite: 2, ms: HORA }

  it("conta na hora: pedidos ao mesmo tempo não passam todos pela conferência", () => {
    const limite = criarLimite()
    const passaram = [1, 2, 3, 4, 5].filter(() => {
      if (!limite.cabe("ip", janela, 1000)) return false
      limite.reservar("ip", janela, 1000)
      return true
    })
    expect(passaram).toHaveLength(2)
  })

  it("quem não mandou nada devolve a vaga — uma vez só", () => {
    const limite = criarLimite()
    const devolver = limite.reservar("ip", janela, 1000)
    limite.reservar("ip", janela, 1000)
    expect(limite.cabe("ip", janela, 1000)).toBe(false)
    devolver()
    devolver()
    expect(limite.cabe("ip", janela, 1000)).toBe(true)
    limite.reservar("ip", janela, 1000)
    expect(limite.cabe("ip", janela, 1000)).toBe(false)
  })
})

describe("o teto do dia", () => {
  it("soma por chave, recusa o que passa do teto e zera no dia seguinte (UTC)", () => {
    const teto = criarTetoDoDia()
    const hoje = Date.parse("2026-09-27T20:00:00Z")
    expect(teto.cabe("ip", 30, 20, hoje)).toBe(true)
    teto.somar("ip", 20, hoje)
    expect(teto.cabe("ip", 30, 10, hoje)).toBe(true)
    expect(teto.cabe("ip", 30, 11, hoje)).toBe(false)
    expect(teto.cabe("outro", 30, 30, hoje)).toBe(true)
    const amanha = Date.parse("2026-09-28T00:00:01Z")
    expect(teto.cabe("ip", 30, 30, amanha)).toBe(true)
    teto.somar("ip", 5, amanha)
    expect(teto.cabe("ip", 30, 26, amanha)).toBe(false)
  })
})

describe("o corpo grande, lido depois da porta", () => {
  const pedido = (partes: string[], cabecalhos: Record<string, string> = {}) =>
    Object.assign(Readable.from(partes.map((p) => Buffer.from(p))), {
      headers: cabecalhos,
    }) as unknown as MedusaRequest

  it("lê o JSON em pedaços", async () => {
    await expect(lerCorpoGrande(pedido(['{"uso":"fo', 'to","arquivo":"QUJD"}']))).resolves.toEqual({
      uso: "foto",
      arquivo: "QUJD",
    })
    await expect(lerCorpoGrande(pedido([]))).resolves.toEqual({})
  })

  it("recusa o que passa do teto — pelo cabeçalho, antes de ler, ou no meio da leitura", async () => {
    await expect(
      lerCorpoGrande(pedido(["{}"], { "content-length": "999999999" }), 1000)
    ).rejects.toThrow("corpo_grande")
    await expect(lerCorpoGrande(pedido(["x".repeat(600), "x".repeat(600)]), 1000)).rejects.toThrow(
      "corpo_grande"
    )
  })

  it("o que não é JSON é recusado com motivo", async () => {
    await expect(lerCorpoGrande(pedido(["não é json"]))).rejects.toThrow("corpo_invalido")
  })
})

describe("a base da Nuvemshop sem cópia a cada linha", () => {
  it("junta no mesmo array, e 200 mil itens do mesmo pedido passam num instante", () => {
    const mapa = new Map<string, number[]>()
    const inicio = Date.now()
    for (let i = 0; i < 200_000; i++) juntar(mapa, "#1", i)
    expect(mapa.get("#1")).toHaveLength(200_000)
    expect(Date.now() - inicio).toBeLessThan(1000)
  })
})
