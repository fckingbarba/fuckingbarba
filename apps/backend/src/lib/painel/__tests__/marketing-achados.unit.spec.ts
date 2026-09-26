import {
  ACHADOS_NO_RESUMO,
  AINDA_E_POUCO,
  juntarAchados,
  NADA_FORA_DO_COMUM,
} from "../marketing-achados"
import type { Achado } from "../marketing-canais"

/**
 * "O que os dados dizem": as frases de todas as abas juntas — o que pede
 * conserto primeiro, depois as oportunidades e o que vai bem; no mesmo tipo,
 * a ordem das abas. O "ainda é pouco" de cada aba fica na aba.
 */

const frase = (tipo: Achado["tipo"], titulo: string): Achado => ({ tipo, titulo, texto: "…" })

describe("juntar as frases das abas", () => {
  it("o que pede conserto primeiro, depois as oportunidades e o que vai bem", () => {
    const r = juntarAchados(
      {
        funil: [frase("oportunidade", "funil: maior perda")],
        canais: [frase("bom", "canais: o melhor canal")],
        produtos: [frase("problema", "produtos: esgotado com visita")],
        clientes: [frase("oportunidade", "clientes: a 2ª compra")],
        pagamento: [
          frase("problema", "pagamento: cartão recusado"),
          frase("oportunidade", "pagamento: Pix vencido"),
        ],
      },
      null
    )
    expect(r.achados.map((a) => [a.aba, a.titulo])).toEqual([
      ["produtos", "produtos: esgotado com visita"],
      ["pagamento", "pagamento: cartão recusado"],
      ["funil", "funil: maior perda"],
      ["clientes", "clientes: a 2ª compra"],
      ["pagamento", "pagamento: Pix vencido"],
      ["canais", "canais: o melhor canal"],
    ])
    expect(r).toMatchObject({ mais: 0, semGoogle: null })
  })

  it("o 'ainda é pouco' de uma aba fica nela, quando outra tem conclusão", () => {
    const r = juntarAchados(
      {
        funil: [frase("info", "Ainda é pouco pra achar onde a loja perde gente")],
        pagamento: [frase("problema", "5 de 11 tentativas no cartão foram recusadas")],
      },
      null
    )
    expect(r.achados.map((a) => a.titulo)).toEqual(["5 de 11 tentativas no cartão foram recusadas"])
  })

  it(`cabem ${ACHADOS_NO_RESUMO}; as outras continuam nas abas`, () => {
    const r = juntarAchados(
      {
        funil: [frase("oportunidade", "a"), frase("oportunidade", "b")],
        produtos: [frase("problema", "c")],
        ofertas: [frase("bom", "d"), frase("bom", "e")],
        clientes: [frase("oportunidade", "f")],
        pagamento: [frase("problema", "g"), frase("oportunidade", "h")],
      },
      null
    )
    expect(r.achados.map((a) => a.titulo)).toEqual(["c", "g", "a", "b", "f", "h"])
    expect(r.mais).toBe(2)
  })

  it("se todas as abas dizem que é pouco, uma frase só — sem atalho", () => {
    const r = juntarAchados(
      {
        funil: [frase("info", "Ainda é pouco pra achar onde a loja perde gente")],
        clientes: [frase("info", "Ainda é pouco pra conhecer os clientes")],
      },
      null
    )
    expect(r.achados).toEqual([{ ...AINDA_E_POUCO, aba: null }])
  })

  it("nada a dizer, com tudo lido: nada fora do comum", () => {
    expect(juntarAchados({ ofertas: [], pagamento: [] }, null).achados).toEqual([
      { ...NADA_FORA_DO_COMUM, aba: null },
    ])
  })

  it("sem o Google: as frases da loja seguem, e o estado vai junto", () => {
    const r = juntarAchados({ pagamento: [frase("oportunidade", "Pix vencido")] }, "fora")
    expect(r).toMatchObject({ semGoogle: "fora", mais: 0 })
    expect(r.achados.map((a) => a.aba)).toEqual(["pagamento"])
    // Sem o Google e sem frase da loja, não dá pra dizer que está tudo bem.
    expect(juntarAchados({ ofertas: [] }, "recusado").achados).toEqual([])
  })
})
