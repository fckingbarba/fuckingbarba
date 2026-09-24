import {
  ACESSO,
  areasDo,
  conviteVenceEm,
  DIAS_DO_CONVITE,
  donoDoRailway,
  emOrdem,
  lerConvite,
  lerMudanca,
  membroPublico,
  NOME_DA_AREA,
  nomeDoEmail,
  podeAbrir,
  podeEntrar,
  podeMudar,
} from "../regras"

/**
 * As regras da equipe do painel: quem abre o quê, quem recebe código e as
 * mudanças que a loja não deixa fazer. O conferidor do painel
 * (`apps/dashboard/ferramentas/conferir-entrar.mjs`) prova o caminho pela
 * tela; aqui ficam as fronteiras — o convite no último segundo, o último
 * dono.
 */

const AGORA = Date.parse("2026-09-24T12:00:00.000Z")
const DIA = 24 * 60 * 60 * 1000

describe("podeAbrir — a matriz dos papéis", () => {
  it("o dono abre todas as áreas", () => {
    expect(areasDo("dono")).toEqual(Object.keys(ACESSO))
  })

  it("a operação não abre equipe, configurações, cupons nem home — nem estorna", () => {
    for (const area of ["equipe", "configuracoes", "cupons", "home", "estornos"] as const)
      expect(podeAbrir("operacao", area)).toBe(false)
    expect(podeAbrir("operacao", "pedidos")).toBe(true)
    expect(podeAbrir("operacao", "observabilidade")).toBe(true)
  })

  it("o marketing não abre pedidos, observabilidade, equipe nem configurações", () => {
    for (const area of [
      "pedidos",
      "estornos",
      "observabilidade",
      "equipe",
      "configuracoes",
    ] as const)
      expect(podeAbrir("marketing", area)).toBe(false)
    expect(podeAbrir("marketing", "cupons")).toBe(true)
    expect(podeAbrir("marketing", "home")).toBe(true)
  })

  it("todo papel abre o início", () => {
    for (const papel of ["dono", "operacao", "marketing"] as const)
      expect(podeAbrir(papel, "inicio")).toBe(true)
  })
})

describe("podeEntrar — quem recebe código", () => {
  const convidadoEm = new Date(AGORA - 2 * DIA)

  it("ativo entra; removido, nunca", () => {
    expect(podeEntrar({ situacao: "ativo" }, AGORA)).toBe(true)
    expect(podeEntrar({ situacao: "removido", convidado_em: convidadoEm }, AGORA)).toBe(false)
  })

  it("convidado entra dentro dos 7 dias, e não no segundo em que vence", () => {
    const vence = AGORA - 2 * DIA + DIAS_DO_CONVITE * DIA
    expect(podeEntrar({ situacao: "convidado", convidado_em: convidadoEm }, vence - 1)).toBe(true)
    expect(podeEntrar({ situacao: "convidado", convidado_em: convidadoEm }, vence)).toBe(false)
  })

  it("convidado sem data de convite não entra, e quem não é da equipe também não", () => {
    expect(podeEntrar({ situacao: "convidado", convidado_em: null }, AGORA)).toBe(false)
    expect(podeEntrar(null, AGORA)).toBe(false)
  })

  it("o convite vence 7 dias depois de feito", () => {
    expect(conviteVenceEm("2026-09-24T12:00:00.000Z")?.toISOString()).toBe(
      "2026-10-01T12:00:00.000Z"
    )
    expect(conviteVenceEm(null)).toBeNull()
  })
})

describe("lerConvite", () => {
  it("normaliza nome e e-mail", () => {
    expect(
      lerConvite({ nome: "  Carla   Mendes ", email: " Carla@Loja.COM ", papel: "operacao" })
    ).toEqual({
      ok: true,
      convite: { nome: "Carla Mendes", email: "carla@loja.com", papel: "operacao" },
    })
  })

  it("recusa nome curto, e-mail torto e papel que não existe", () => {
    expect(lerConvite({ nome: "C", email: "c@loja.com", papel: "dono" })).toEqual({
      ok: false,
      motivo: "nome_invalido",
    })
    expect(lerConvite({ nome: "Carla", email: "carla@", papel: "dono" })).toEqual({
      ok: false,
      motivo: "email_invalido",
    })
    expect(lerConvite({ nome: "Carla", email: "carla@loja.com", papel: "admin" })).toEqual({
      ok: false,
      motivo: "papel_invalido",
    })
    expect(lerConvite(undefined)).toEqual({ ok: false, motivo: "nome_invalido" })
  })
})

describe("podeMudar — a loja nunca fica sem dono", () => {
  const dono = { id: "eqp_dono", papel: "dono" as const }
  const outroDono = { id: "eqp_dono2", papel: "dono" as const, situacao: "ativo" as const }
  const operacao = { id: "eqp_op", papel: "operacao" as const, situacao: "ativo" as const }

  it("só o dono mexe na equipe", () => {
    expect(
      podeMudar({
        quem: { id: "eqp_op", papel: "operacao" },
        alvo: { ...outroDono },
        mudanca: { tipo: "remover" },
        donosAtivos: 2,
      })
    ).toEqual({ ok: false, motivo: "nao_e_dono" })
  })

  it("ninguém muda o próprio papel nem se remove", () => {
    const eu = { ...dono, situacao: "ativo" as const }
    expect(
      podeMudar({ quem: dono, alvo: eu, mudanca: { tipo: "remover" }, donosAtivos: 3 })
    ).toEqual({
      ok: false,
      motivo: "a_si_mesmo",
    })
    expect(
      podeMudar({
        quem: dono,
        alvo: eu,
        mudanca: { tipo: "papel", papel: "marketing" },
        donosAtivos: 3,
      })
    ).toEqual({ ok: false, motivo: "a_si_mesmo" })
  })

  it("o último dono ativo não perde o papel nem sai", () => {
    const quem = { id: "eqp_x", papel: "dono" as const }
    expect(
      podeMudar({ quem, alvo: outroDono, mudanca: { tipo: "remover" }, donosAtivos: 1 })
    ).toEqual({
      ok: false,
      motivo: "ultimo_dono",
    })
    expect(
      podeMudar({
        quem,
        alvo: outroDono,
        mudanca: { tipo: "papel", papel: "operacao" },
        donosAtivos: 1,
      })
    ).toEqual({ ok: false, motivo: "ultimo_dono" })
    expect(
      podeMudar({ quem, alvo: outroDono, mudanca: { tipo: "remover" }, donosAtivos: 2 })
    ).toEqual({
      ok: true,
    })
  })

  it("o dono muda e remove os outros papéis", () => {
    expect(
      podeMudar({
        quem: dono,
        alvo: operacao,
        mudanca: { tipo: "papel", papel: "marketing" },
        donosAtivos: 1,
      })
    ).toEqual({ ok: true })
    expect(
      podeMudar({ quem: dono, alvo: operacao, mudanca: { tipo: "remover" }, donosAtivos: 1 })
    ).toEqual({
      ok: true,
    })
  })

  it("reenviar convite só pra quem ainda não entrou; removido não muda mais", () => {
    expect(
      podeMudar({
        quem: dono,
        alvo: { ...operacao, situacao: "convidado" },
        mudanca: { tipo: "reenviar" },
        donosAtivos: 1,
      })
    ).toEqual({ ok: true })
    expect(
      podeMudar({ quem: dono, alvo: operacao, mudanca: { tipo: "reenviar" }, donosAtivos: 1 })
    ).toEqual({
      ok: false,
      motivo: "ja_entrou",
    })
    expect(
      podeMudar({
        quem: dono,
        alvo: { ...operacao, situacao: "removido" },
        mudanca: { tipo: "remover" },
        donosAtivos: 1,
      })
    ).toEqual({ ok: false, motivo: "ja_removido" })
  })
})

describe("membroPublico", () => {
  it("dá o prazo do convite só a quem é convidado", () => {
    const base = {
      id: "eqp_1",
      nome: "Júlia",
      email: "julia@loja.com",
      papel: "marketing" as const,
    }
    expect(
      membroPublico({ ...base, situacao: "convidado", convidado_em: "2026-09-24T12:00:00.000Z" })
    ).toEqual({
      ...base,
      situacao: "convidado",
      convite_vence_em: "2026-10-01T12:00:00.000Z",
      ultimo_acesso: null,
    })
    expect(
      membroPublico({ ...base, situacao: "ativo", convidado_em: "2026-09-24T12:00:00.000Z" })
        .convite_vence_em
    ).toBeNull()
  })
})

describe("lerMudanca", () => {
  it("lê papel, remover e reenviar", () => {
    expect(lerMudanca({ papel: "marketing" })).toEqual({ tipo: "papel", papel: "marketing" })
    expect(lerMudanca({ acao: "remover" })).toEqual({ tipo: "remover" })
    expect(lerMudanca({ acao: "reenviar" })).toEqual({ tipo: "reenviar" })
  })

  it("recusa o que não é nenhum dos três — e os dois juntos", () => {
    expect(lerMudanca({ papel: "admin" })).toBeNull()
    expect(lerMudanca({ acao: "apagar" })).toBeNull()
    expect(lerMudanca({ acao: "trocar", papel: "dono" })).toBeNull()
    expect(lerMudanca(undefined)).toBeNull()
  })
})

describe("o primeiro dono, do Railway", () => {
  const original = process.env.DASHBOARD_DONO_EMAIL
  afterAll(() => {
    if (original === undefined) delete process.env.DASHBOARD_DONO_EMAIL
    else process.env.DASHBOARD_DONO_EMAIL = original
  })

  it("lê o e-mail normalizado, ou null", () => {
    process.env.DASHBOARD_DONO_EMAIL = "  Matheus@FuckingBarba.com.br "
    expect(donoDoRailway()).toBe("matheus@fuckingbarba.com.br")
    process.env.DASHBOARD_DONO_EMAIL = "sem-arroba"
    expect(donoDoRailway()).toBeNull()
    delete process.env.DASHBOARD_DONO_EMAIL
    expect(donoDoRailway()).toBeNull()
  })

  it("tira o nome do e-mail", () => {
    expect(nomeDoEmail("matheus.saviczki@gmail.com")).toBe("Matheus Saviczki")
    expect(nomeDoEmail("carla_mendes92@loja.com")).toBe("Carla Mendes")
    expect(nomeDoEmail("x@loja.com")).toBe("Dono")
    expect(nomeDoEmail("123@loja.com")).toBe("Dono")
  })
})

describe("a lista da equipe", () => {
  it("ativos antes dos convidados, dono no alto, e por nome", () => {
    const lista = emOrdem([
      { nome: "Zé", papel: "operacao" as const, situacao: "convidado" as const },
      { nome: "Bia", papel: "marketing" as const, situacao: "ativo" as const },
      { nome: "Ana", papel: "operacao" as const, situacao: "ativo" as const },
      { nome: "Matheus", papel: "dono" as const, situacao: "ativo" as const },
    ])
    expect(lista.map((m) => m.nome)).toEqual(["Matheus", "Ana", "Bia", "Zé"])
  })

  it("toda área tem nome de menu", () => {
    expect(Object.keys(NOME_DA_AREA).sort()).toEqual(Object.keys(ACESSO).sort())
  })
})
