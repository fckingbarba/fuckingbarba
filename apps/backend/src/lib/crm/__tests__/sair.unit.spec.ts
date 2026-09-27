import { randomBytes } from "node:crypto"
import { emailDoTokenDeSair, tokenDeSair } from "../sair"

/**
 * O link de sair da lista: o e-mail vai cifrado, volta igual, e qualquer
 * mexida no `t` (ou outra chave) vira nada.
 */

const CHAVE = randomBytes(32)

describe("o link de sair da lista", () => {
  it("o e-mail vai cifrado — não aparece no link — e volta limpo", () => {
    const t = tokenDeSair(" Rafael@Exemplo.com ", CHAVE)
    expect(t).not.toMatch(/rafael|exemplo/i)
    expect(t).toMatch(/^[\w-]+$/)
    expect(emailDoTokenDeSair(t, CHAVE)).toBe("rafael@exemplo.com")
    // Cada e-mail sai com um link diferente (o IV é novo), e os dois valem.
    const outro = tokenDeSair("rafael@exemplo.com", CHAVE)
    expect(outro).not.toBe(t)
    expect(emailDoTokenDeSair(outro, CHAVE)).toBe("rafael@exemplo.com")
  })

  it("mexido, de outra chave ou lixo: nada", () => {
    const t = tokenDeSair("rafael@exemplo.com", CHAVE)
    const mexido = t.slice(0, 20) + (t[20] === "A" ? "B" : "A") + t.slice(21)
    expect(emailDoTokenDeSair(mexido, CHAVE)).toBeNull()
    expect(emailDoTokenDeSair(t, randomBytes(32))).toBeNull()
    expect(emailDoTokenDeSair("curto", CHAVE)).toBeNull()
    expect(emailDoTokenDeSair("com espaço e acento ção".repeat(3), CHAVE)).toBeNull()
    expect(emailDoTokenDeSair(undefined, CHAVE)).toBeNull()
    expect(() => tokenDeSair("não é e-mail", CHAVE)).toThrow()
  })
})
