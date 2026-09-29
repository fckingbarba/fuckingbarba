import { esquecerABaseGuardada, novaLeitura, type FontesDaLeitura } from "../leitura"
import type { PedidoLidoDaBase } from "../../painel/crm"

/**
 * A leitura da rodada do CRM (0199): os fluxos medidos em dias dividem uma
 * leitura só por rodada, e a base da Nuvemshop fica na memória entre as
 * rodadas até a versão dela mudar (mandar os arquivos de novo).
 */

const PEDIDO_DA_BASE: PedidoLidoDaBase = {
  id: "nso_1",
  numero: "3101",
  email: "rafael@exemplo.com",
  feitoEm: "2026-08-01T12:00:00.000Z",
  pagoEm: "2026-08-01T12:05:00.000Z",
  pagamento: "confirmado",
  envio: "entregue",
  total: 14990,
  cupom: null,
  itens: [{ sku: "FBFC01", nome: "Fator de Crescimento", quantidade: 1, valor: 14990 }],
}

function banco({ versao = "1:2026-09-27T15:43:00.000Z", baseFalha = 0 } = {}) {
  const lidas = { loja: 0, base: 0, versao: 0, pessoas: 0, sinais: 0, metadata: 0 }
  let atual = versao
  let falhas = baseFalha
  const fontes: FontesDaLeitura = {
    pedidosDaLoja: async () => (lidas.loja++, []),
    pedidosDaBase: async () => {
      lidas.base++
      if (falhas > 0) {
        falhas--
        throw new Error("o banco caiu")
      }
      return [PEDIDO_DA_BASE]
    },
    versaoDaBase: async () => (lidas.versao++, atual),
    pessoasDaEstreia: async () => (lidas.pessoas++, []),
    sinaisDeTodos: async () => (lidas.sinais++, new Map()),
    metadataDaLoja: async () => (lidas.metadata++, null),
  }
  return { fontes, lidas, mandarDeNovo: (nova: string) => (atual = nova) }
}

beforeEach(() => esquecerABaseGuardada())

describe("a leitura da rodada do CRM", () => {
  it("os quatro fluxos pedem, a rodada lê cada coisa uma vez", async () => {
    const { fontes, lidas } = banco()
    const leitura = novaLeitura(fontes)
    // Estreia, reposição, jornada e resgate, ao mesmo tempo.
    await Promise.all(
      [1, 2, 3, 4].map(() =>
        Promise.all([
          leitura.pedidosDaLoja(),
          leitura.pedidosDaBase(),
          leitura.pessoasDaEstreia(),
          leitura.sinaisDeTodos(),
          leitura.metadataDaLoja(),
        ])
      )
    )
    expect(lidas).toEqual({ loja: 1, base: 1, versao: 1, pessoas: 1, sinais: 1, metadata: 1 })
  })

  it("a base fica na memória entre as rodadas: cada rodada só pergunta a versão", async () => {
    const { fontes, lidas } = banco()
    for (let rodada = 0; rodada < 3; rodada++) {
      const leitura = novaLeitura(fontes)
      expect(await leitura.pedidosDaBase()).toEqual([PEDIDO_DA_BASE])
      await leitura.pedidosDaLoja()
    }
    expect(lidas.base).toBe(1)
    expect(lidas.versao).toBe(3)
    // Os pedidos da loja nova mudam a toda hora: esses são lidos em toda rodada.
    expect(lidas.loja).toBe(3)
  })

  it("mandar os arquivos de novo muda a versão, e a base é relida", async () => {
    const { fontes, lidas, mandarDeNovo } = banco()
    await novaLeitura(fontes).pedidosDaBase()
    mandarDeNovo("2876:2026-09-29T10:00:00.000Z")
    await novaLeitura(fontes).pedidosDaBase()
    await novaLeitura(fontes).pedidosDaBase()
    expect(lidas.base).toBe(2)
  })

  it("a base que falhou não fica guardada: a próxima rodada lê de novo", async () => {
    const { fontes, lidas } = banco({ baseFalha: 1 })
    await expect(novaLeitura(fontes).pedidosDaBase()).rejects.toThrow("o banco caiu")
    expect(await novaLeitura(fontes).pedidosDaBase()).toEqual([PEDIDO_DA_BASE])
    expect(lidas.base).toBe(2)
  })
})
