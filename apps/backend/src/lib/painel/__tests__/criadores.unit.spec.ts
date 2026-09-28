import {
  emLinha,
  listaDasInscricoes,
  mensagemPraCriador,
  paginaDosCriadores,
  whatsappNaTela,
  type InscricaoCrua,
} from "../criadores"

const AGORA = new Date("2026-09-28T18:00:00Z") // 15h em Brasília

const inscricao = (i: Partial<InscricaoCrua> & { id: string }): InscricaoCrua => ({
  nome: "Rafael Souza",
  whatsapp: "47999990000",
  email: "rafael@email.com",
  cidade: "Joinville, SC",
  instagram: "rafael.barba",
  tiktok: null,
  seguidores: "1-10mil",
  barba: "cheia",
  experiencia: "nunca",
  video: null,
  parceria: false,
  modelo: "fixo",
  situacao: "nova",
  consentido_em: "2026-09-28T12:00:00Z",
  decidida_em: null,
  decidida_por: null,
  ...i,
})

describe("a lista dos criadores", () => {
  const cruas = [
    inscricao({ id: "cria_1", consentido_em: "2026-09-28T12:00:00Z" }),
    inscricao({ id: "cria_2", consentido_em: "2026-09-27T12:00:00Z", modelo: "comissao" }),
    inscricao({
      id: "cria_3",
      situacao: "aprovada",
      modelo: "comissao",
      decidida_em: "2026-09-28T10:00:00Z",
    }),
    inscricao({
      id: "cria_4",
      situacao: "aprovada",
      decidida_em: "2026-09-28T14:00:00Z",
    }),
    inscricao({ id: "cria_5", situacao: "recusada", modelo: "conversar" }),
  ]

  it("as novas vêm da que espera há mais tempo pra mais nova", () => {
    const { lista } = listaDasInscricoes(cruas, "novas")
    expect(lista.map((c) => c.id)).toEqual(["cria_2", "cria_1"])
  })

  it("as aprovadas, da decisão mais recente pra mais antiga", () => {
    const { lista } = listaDasInscricoes(cruas, "aprovadas")
    expect(lista.map((c) => c.id)).toEqual(["cria_4", "cria_3"])
  })

  it("as contas olham a lista inteira; os modelos, só novas e aprovadas", () => {
    const { contagem, modelos } = listaDasInscricoes(cruas, "recusadas")
    expect(contagem).toEqual({ novas: 2, aprovadas: 2, recusadas: 1 })
    expect(modelos).toEqual({ fixo: 2, comissao: 2, conversar: 0 })
  })
})

describe("uma linha da tela", () => {
  it("o WhatsApp aparece formatado e abre com a mensagem pronta", () => {
    const l = emLinha(inscricao({ id: "cria_1" }), { agora: AGORA })
    expect(l.whatsapp.texto).toBe("(47) 99999-0000")
    expect(l.whatsapp.link).toBe(
      `https://wa.me/5547999990000?text=${encodeURIComponent(mensagemPraCriador("Rafael Souza"))}`
    )
    expect(mensagemPraCriador("Rafael Souza")).toMatch(/^Oi, Rafael! Aqui é da FuckingBarba/)
  })

  it("os perfis viram links; os códigos viram frases", () => {
    const l = emLinha(
      inscricao({ id: "cria_1", tiktok: "rafa", experiencia: null, seguidores: null }),
      { agora: AGORA }
    )
    expect(l.perfis).toEqual([
      {
        rede: "Instagram",
        arroba: "rafael.barba",
        link: "https://www.instagram.com/rafael.barba/",
      },
      { rede: "TikTok", arroba: "rafa", link: "https://www.tiktok.com/@rafa" },
    ])
    expect(l.barba).toBe("Barba cheia")
    expect(l.experiencia).toBeNull()
    expect(l.seguidores).toBeNull()
    expect(l.modelo).toEqual({ id: "fixo", nome: "Fixo" })
    expect(l.quando).toBe("hoje, 09:00")
  })

  it("a decisão diz quem e quando; sem membro, foi o admin", () => {
    const aprovada = inscricao({
      id: "cria_1",
      situacao: "aprovada",
      decidida_em: "2026-09-27T13:02:00Z",
      decidida_por: "eqp_1",
    })
    expect(emLinha(aprovada, { quem: "Ana", agora: AGORA }).decisao).toBe(
      "Aprovada por Ana · ontem, 10:02"
    )
    expect(emLinha({ ...aprovada, decidida_por: null }, { agora: AGORA }).decisao).toBe(
      "Aprovada pelo admin · ontem, 10:02"
    )
    expect(emLinha(inscricao({ id: "cria_2" }), { agora: AGORA }).decisao).toBeNull()
  })

  it("o fixo de 10 dígitos também formata", () => {
    expect(whatsappNaTela("4733330000")).toBe("(47) 3333-0000")
  })
})

describe("o link da página", () => {
  it("sai do LOJA_URL, só a origem", () => {
    expect(paginaDosCriadores("https://www.fuckingbarba.com.br/")).toBe(
      "https://www.fuckingbarba.com.br/criadores"
    )
    expect(paginaDosCriadores(undefined)).toBeNull()
    expect(paginaDosCriadores("não é endereço")).toBeNull()
  })
})
