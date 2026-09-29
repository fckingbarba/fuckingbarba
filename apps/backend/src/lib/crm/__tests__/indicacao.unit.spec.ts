import { emailDoCrm } from "../../emails/crm"
import { emailDoIndique, emailDoPremio } from "../../emails/indicacao"
import { emailDaJornada } from "../../emails/jornada"
import { ehCupomDoCrm } from "../fluxos"
import {
  codigoDoBrother,
  cupomDoAmigo,
  indiqueDoCodigo,
  linkDoWhatsApp,
  mensagemDoWhatsApp,
  PORCENTO_DO_AMIGO,
  PREMIOS_POR_ANO,
  semPremio,
} from "../indicacao"

/**
 * O indique um brother (0215): o cupom do link (15% na 1ª compra, uma vez
 * por pessoa, sem data e sem limite), o link e o WhatsApp, o código no
 * pedido, quando quem indicou não ganha o prêmio, e os três e-mails — oferta,
 * sem emoji, sem dizer quem é o brother.
 */

const LOJA = "https://www.fuckingbarba.com.br"
const sair = { pagina: `${LOJA}/sair/x`, umClique: "https://api/crm/sair?t=x" }
const loja = { url: LOJA, whatsapp: null, empresa: null, cnpj: null }
const EMOJI = /\p{Extended_Pictographic}/u
const PROPAGANDA = /Esqueceu|Última chamada|Ainda dá tempo|em 1 clique|tá aqui/i

describe("o link", () => {
  it("o cupom do brother: 15%, só na 1ª compra, uma vez por pessoa, sem data e sem limite", () => {
    expect(cupomDoAmigo("BROTHER-7KQ2MX")).toMatchObject({
      codigo: "BROTHER-7KQ2MX",
      tipo: "porcento",
      valor: PORCENTO_DO_AMIGO,
      aplicarA: "loja",
      combina: true,
      limite: null,
      porCliente: 1,
      primeiraCompra: true,
      de: null,
      ate: null,
    })
  })

  it("o link cai no /discount da loja, e o WhatsApp leva a mensagem com ele", () => {
    const i = indiqueDoCodigo(LOJA, "BROTHER-7KQ2MX")
    expect(i.link).toBe(`${LOJA}/discount/BROTHER-7KQ2MX`)
    expect(i.whatsapp.startsWith("https://wa.me/?text=")).toBe(true)
    expect(decodeURIComponent(i.whatsapp.slice("https://wa.me/?text=".length))).toBe(
      mensagemDoWhatsApp(i.link)
    )
    expect(linkDoWhatsApp(i.link)).toBe(i.whatsapp)
    expect(mensagemDoWhatsApp(i.link)).toContain(`${PORCENTO_DO_AMIGO}% na primeira compra`)
  })

  it("o código do pedido: o primeiro de brother, sem maiúscula de diferença", () => {
    expect(codigoDoBrother([null, "VOLTA-AAAAAA", " brother-7kq2mx "])).toBe("BROTHER-7KQ2MX")
    expect(codigoDoBrother(["BEMVINDO-AAAAAA", undefined])).toBeNull()
  })

  it("os cupons do indique são do CRM: fora da lista de Cupons do painel", () => {
    expect(ehCupomDoCrm("BROTHER-7KQ2MX")).toBe(true)
    expect(ehCupomDoCrm("VALEU-7KQ2MX")).toBe(true)
    expect(ehCupomDoCrm("BARBA10")).toBe(false)
  })
})

describe("o prêmio", () => {
  it("não sai pra ele mesmo, nem depois dos 10 do ano", () => {
    expect(semPremio({ indicador: "a@x.com", amigo: "b@x.com", premiosNoAno: 0 })).toBeNull()
    expect(semPremio({ indicador: "a@x.com", amigo: " A@X.com ", premiosNoAno: 0 })).toBe(
      "ele-mesmo"
    )
    expect(
      semPremio({ indicador: "a@x.com", amigo: "b@x.com", premiosNoAno: PREMIOS_POR_ANO - 1 })
    ).toBeNull()
    expect(
      semPremio({ indicador: "a@x.com", amigo: "b@x.com", premiosNoAno: PREMIOS_POR_ANO })
    ).toBe("teto-do-ano")
  })
})

describe("os e-mails", () => {
  const indique = indiqueDoCodigo(LOJA, "BROTHER-7KQ2MX")
  const base = { para: "rafael@exemplo.com", nome: "rafael silva", indique, sair, loja }

  it("o convite: oferta, o código, o WhatsApp, a conta e o link — sem emoji nem frase de propaganda", () => {
    const e = emailDoIndique({ ...base, toque: "jornada-indique" })
    expect(e.estilo).toBe("oferta")
    expect(e.nome).toBe("Rafael")
    expect(e.assunto).toBe("Indique um brother: 15% pra ele, 15% pra você")
    expect(e.blocos[0]).toMatchObject({ tipo: "cupom", codigo: "BROTHER-7KQ2MX" })
    expect(e.blocos[1]).toEqual({
      tipo: "escolhas",
      itens: [
        { texto: "Mandar no WhatsApp", href: indique.whatsapp },
        { texto: "Ver na minha conta", href: `${LOJA}/conta` },
      ],
    })
    const pronto = emailDoCrm(e)
    expect(pronto.cabecalhos["List-Unsubscribe"]).toBeTruthy()
    expect(pronto.html).toContain(`${LOJA}/discount/BROTHER-7KQ2MX`)
    expect(EMOJI.test(pronto.html) || EMOJI.test(e.assunto)).toBe(false)
    expect(PROPAGANDA.test(`${e.assunto} ${e.previa} ${e.texto}`)).toBe(false)
  })

  it("o assunto do convite pela linha do pedido (0217): o Fator, a barba, o cabelo — e o geral", () => {
    const convite = (
      trilha: "crescimento" | "cuidado" | "cabelo" | "geral",
      produto: string | null
    ) => emailDoIndique({ ...base, toque: "jornada-indique", trilha, produto })
    const fator = convite("crescimento", "o Fator de Crescimento")
    expect(fator.assunto).toBe("Conhece alguém com a barba falhada?")
    expect(fator.texto).toBe(
      "Tá curtindo o Fator de Crescimento? Manda o seu link pra um brother que quer a barba " +
        "cheia: ele ganha 15% na primeira compra, e quando ele comprar, você ganha 15% na próxima."
    )
    expect(convite("cuidado", "o óleo").assunto).toBe("Conhece alguém que precisa cuidar da barba?")
    expect(convite("cuidado", "o óleo").texto).toMatch(
      /^Tá curtindo o óleo\? Manda o seu link pra um brother que precisa cuidar da barba:/
    )
    expect(convite("cabelo", "a pasta matte").assunto).toBe(
      "Conhece alguém que precisa dar um jeito no cabelo?"
    )
    // Sem o produto da linha, a loja; e o geral, o assunto de sempre.
    expect(convite("cabelo", null).texto).toMatch(/^Tá curtindo a FuckingBarba\?/)
    expect(convite("geral", null).assunto).toBe("Indique um brother: 15% pra ele, 15% pra você")
    for (const t of ["crescimento", "cuidado", "cabelo", "geral"] as const) {
      const e = convite(t, null)
      expect(PROPAGANDA.test(`${e.assunto} ${e.previa} ${e.texto}`)).toBe(false)
      expect(EMOJI.test(`${e.assunto} ${e.previa} ${e.texto}`)).toBe(false)
    }
  })

  it("o lembrete: o mesmo link, outro assunto", () => {
    const e = emailDoIndique({ ...base, toque: "jornada-indique-30d" })
    expect(e.assunto).toBe("Seu link continua valendo 15% pra você")
    expect(e.blocos[0]).toMatchObject({ tipo: "cupom", codigo: "BROTHER-7KQ2MX" })
    expect(PROPAGANDA.test(`${e.assunto} ${e.previa} ${e.texto}`)).toBe(false)
  })

  it("na jornada: sem o link, o dia fica sem e-mail; com ele, o convite", () => {
    const jornada = {
      para: "rafael@exemplo.com",
      nome: "Rafael",
      numero: 3312,
      principal: null,
      fator: null,
      sugestoes: [],
      checkin: null,
      sair,
      loja,
    }
    expect(emailDaJornada({ ...jornada, toque: "jornada-indique", indique: null })).toBeNull()
    expect(emailDaJornada({ ...jornada, toque: "jornada-indique-30d" })).toBeNull()
    expect(emailDaJornada({ ...jornada, toque: "jornada-indique", indique })?.assunto).toBe(
      "Indique um brother: 15% pra ele, 15% pra você"
    )
  })

  it("o prêmio: o cupom só dele, com o link que já aplica — e o brother não aparece", () => {
    const e = emailDoPremio({
      para: "rafael@exemplo.com",
      nome: "rafael",
      cupom: { codigo: "VALEU-7KQ2MX", porcento: 15, ate: new Date("2026-11-28T15:00:00Z") },
      sair,
      loja,
    })
    expect(e.estilo).toBe("oferta")
    expect(e.assunto).toBe("Seu brother comprou. Seus 15% chegaram")
    expect(e.botao).toEqual({ texto: "Usar meu cupom", caminho: "/discount/VALEU-7KQ2MX" })
    expect(e.blocos[0]).toMatchObject({ tipo: "cupom", codigo: "VALEU-7KQ2MX" })
    expect(e.texto).not.toMatch(/@/)
    expect(EMOJI.test(emailDoCrm(e).html)).toBe(false)
  })
})
