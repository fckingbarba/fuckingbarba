import { CAMPOS_DO_VIGIA } from "../../painel/ler"
import { horaDeLimpar } from "../vigia"

/**
 * O vigia (0199): lê de cada pedido só o que a conta dos problemas usa, e
 * limpa as tabelas uma vez por hora — não a cada 5 minutos.
 */
describe("o vigia", () => {
  const as = (hhmm: string) => new Date(`2026-09-28T${hhmm}:00-03:00`)

  it("o job roda nos minutos 1, 6, 11…: só a rodada dos primeiros minutos limpa", () => {
    expect(horaDeLimpar(as("13:01"))).toBe(true)
    for (const m of ["06", "11", "16", "21", "26", "31", "36", "41", "46", "51", "56"])
      expect(horaDeLimpar(as(`13:${m}`))).toBe(false)
  })

  it("dos pedidos, só o número, a situação e o metadata (o estorno e a Frenet moram nele)", () => {
    expect([...CAMPOS_DO_VIGIA].sort()).toEqual(
      ["created_at", "display_id", "id", "metadata", "status"].sort()
    )
    // Nada do que pesa: o total calculado, os itens, o endereço, o pagamento.
    for (const c of CAMPOS_DO_VIGIA) expect(c).not.toMatch(/total|items|address|payment/)
  })
})
