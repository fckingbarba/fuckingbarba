import { ofertasPorPadrao } from "../ofertas-por-padrao"

/**
 * As ofertas por e-mail ligadas por padrão (0184): o cliente novo, e o de
 * antes, ganham o sim com a data do cadastro — menos quem já tem o sim dele
 * e quem saiu da lista.
 */

const CADASTRO = new Date("2026-09-28T14:00:00Z")

describe("o sim por padrão", () => {
  it("sem sim: ganha o do cadastro, com a origem; o do WhatsApp fica como estava", () => {
    expect(ofertasPorPadrao(null, CADASTRO, false)).toEqual({
      email: "2026-09-28T14:00:00.000Z",
      origem: "padrao",
    })
    expect(
      ofertasPorPadrao(
        { documento: "x", ofertas: { email: null, whatsapp: null } },
        CADASTRO,
        false
      )
    ).toEqual({ email: "2026-09-28T14:00:00.000Z", whatsapp: null, origem: "padrao" })
    // O metadata torto não derruba: vale como sem sim.
    expect(ofertasPorPadrao({ ofertas: "sim" }, CADASTRO, false)?.email).toBe(
      "2026-09-28T14:00:00.000Z"
    )
  })

  it("quem já tem o sim fica com o dele; quem saiu da lista não volta sozinho", () => {
    expect(
      ofertasPorPadrao({ ofertas: { email: "2026-09-20T10:00:00Z" } }, CADASTRO, false)
    ).toBeNull()
    expect(ofertasPorPadrao(null, CADASTRO, true)).toBeNull()
  })
})
