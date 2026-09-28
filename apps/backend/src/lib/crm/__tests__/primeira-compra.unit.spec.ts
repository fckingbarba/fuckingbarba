import { PRODUTOS_DOS_EXEMPLOS } from "../../emails/crm"
import {
  lerCadastro,
  produtosDoEmail,
  trilhaDaPagina,
  trilhaDosComponentes,
} from "../primeira-compra"

/**
 * O cadastro do pop-up da 1ª compra: o corpo conferido, a trilha pela página
 * em que a pessoa estava, e os produtos do e-mail do cupom.
 */

describe("o corpo do pop-up", () => {
  it("o nome aparado, o e-mail normalizado e a página só se for da loja", () => {
    expect(
      lerCadastro({
        nome: "  rafael   silva ",
        email: " Rafael@Exemplo.COM ",
        pagina: "/produtos/oleo-para-barba",
      })
    ).toEqual({
      ok: true,
      cadastro: {
        nome: "rafael silva",
        email: "rafael@exemplo.com",
        pagina: "/produtos/oleo-para-barba",
      },
    })
    for (const pagina of ["https://outro.site/x", "/busca?q=barba", "produtos/x", 42]) {
      const r = lerCadastro({ nome: "Ana", email: "ana@exemplo.com", pagina })
      expect(r.ok && r.cadastro.pagina).toBeNull()
    }
  })

  it("o nome precisa de duas letras, sem código; o e-mail, de ser e-mail", () => {
    for (const nome of ["", " ", "a", "12", "<script>", "x".repeat(61), undefined])
      expect(lerCadastro({ nome, email: "ana@exemplo.com" })).toEqual({
        ok: false,
        erro: "nome_invalido",
      })
    for (const email of ["", "ana", "ana@", undefined])
      expect(lerCadastro({ nome: "Ana", email })).toEqual({ ok: false, erro: "email_invalido" })
    expect(lerCadastro({ nome: "Zé", email: "ze@exemplo.com" }).ok).toBe(true)
  })
})

describe("a trilha", () => {
  it("pelo produto: o Fator é crescer; óleo, balm e shampoo, cuidar; pasta e spray, cabelo", () => {
    expect(trilhaDaPagina("/produtos/fator-de-crescimento-para-barba")).toEqual({
      trilha: "crescimento",
      produto: "fator-de-crescimento-para-barba",
    })
    expect(trilhaDaPagina("/produtos/kit-fator-de-crescimento-para-barba-e-shampoo").trilha).toBe(
      "crescimento"
    )
    expect(trilhaDaPagina("/produtos/oleo-para-barba").trilha).toBe("cuidado")
    expect(trilhaDaPagina("/produtos/kit-completo-para-barba").trilha).toBe("cuidado")
    expect(trilhaDaPagina("/produtos/pasta-modeladora-matte-80g-fucking-barba").trilha).toBe(
      "cabelo"
    )
    expect(trilhaDosComponentes([])).toBe("geral")
  })

  it("pela página: Para cabelo é cabelo; a home, Para barba e Kits não dizem, e ficam no geral", () => {
    expect(trilhaDaPagina("/para-cabelo")).toEqual({ trilha: "cabelo", produto: null })
    for (const pagina of ["/", "/para-barba", "/kits", null])
      expect(trilhaDaPagina(pagina)).toEqual({ trilha: "geral", produto: null })
  })

  it("os produtos do e-mail: o que a pessoa via primeiro, e três no máximo", () => {
    expect(produtosDoEmail("cuidado", "balm-para-barba")).toEqual([
      "balm-para-barba",
      "kit-completo-para-barba",
      "oleo-para-barba",
    ])
    expect(produtosDoEmail("geral", null)).toEqual([...PRODUTOS_DOS_EXEMPLOS])
  })
})
