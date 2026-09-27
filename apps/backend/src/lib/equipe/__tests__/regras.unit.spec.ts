import {
  ACESSO_PADRAO,
  ajustesDa,
  AREAS,
  AREAS_FIXAS,
  areasDo,
  conviteVenceEm,
  DENTRO_DE,
  DIAS_DO_CONVITE,
  donoDoRailway,
  emOrdem,
  lerAcessos,
  lerConvite,
  lerMudanca,
  MATRIZ_PADRAO,
  matrizCom,
  membroPublico,
  mudancasEntre,
  NOME_DA_AREA,
  nomeDoEmail,
  PAPEIS,
  podeAbrir,
  podeEntrar,
  podeMudar,
  type Area,
  type Matriz,
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

/** A pergunta do jeito das rotas, na loja sem ajuste nenhum. */
const noPadrao = (papel: "dono" | "operacao" | "marketing", area: Area) =>
  podeAbrir(MATRIZ_PADRAO, papel, area)

describe("podeAbrir — a matriz dos papéis, no padrão", () => {
  it("o dono abre todas as áreas", () => {
    expect(areasDo(MATRIZ_PADRAO, "dono")).toEqual(Object.keys(ACESSO_PADRAO))
  })

  it("a operação não abre equipe, configurações, cupons nem home — nem estorna", () => {
    for (const area of [
      "equipe",
      "configuracoes",
      "cupons",
      "home",
      "estornos",
      "editarProdutos",
    ] as const)
      expect(noPadrao("operacao", area)).toBe(false)
    expect(noPadrao("operacao", "pedidos")).toBe(true)
    expect(noPadrao("operacao", "observabilidade")).toBe(true)
    // Os números de marketing não são da operação, nem o que o CRM anota das pessoas.
    expect(noPadrao("operacao", "marketing")).toBe(false)
    expect(noPadrao("operacao", "crm")).toBe(false)
    expect(noPadrao("operacao", "metaDoMes")).toBe(false)
  })

  it("o marketing não abre pedidos, observabilidade, equipe nem configurações", () => {
    for (const area of [
      "pedidos",
      "estornos",
      "observabilidade",
      "equipe",
      "configuracoes",
    ] as const)
      expect(noPadrao("marketing", area)).toBe(false)
    expect(noPadrao("marketing", "cupons")).toBe(true)
    expect(noPadrao("marketing", "home")).toBe(true)
    expect(noPadrao("marketing", "crm")).toBe(true)
    // Vê o Marketing; a meta, quem muda é o dono.
    expect(noPadrao("marketing", "marketing")).toBe(true)
    expect(noPadrao("marketing", "metaDoMes")).toBe(false)
  })

  it("todo papel abre o início", () => {
    for (const papel of ["dono", "operacao", "marketing"] as const)
      expect(noPadrao(papel, "inicio")).toBe(true)
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
    expect(Object.keys(NOME_DA_AREA).sort()).toEqual(Object.keys(ACESSO_PADRAO).sort())
  })
})

/* ── o dono mudando os acessos ────────────────────────────────────────────── */

/** O corpo que a tela manda: a coluna inteira de cada papel, a partir de uma matriz. */
const corpoDa = (m: Matriz) => ({
  acesso: {
    operacao: areasDo(m, "operacao") as string[],
    marketing: areasDo(m, "marketing") as string[],
  },
})
const com = (lista: string[], ...mais: string[]) => [...lista, ...mais]
const sem = (lista: string[], ...menos: string[]) => lista.filter((a) => !menos.includes(a))

describe("o padrão, as linhas fixas e o que mora dentro de outra área", () => {
  it("o dono abre toda linha do padrão — ninguém tranca a loja do lado de fora", () => {
    for (const area of AREAS) expect(ACESSO_PADRAO[area]).toContain("dono")
  })

  it("o Início abre pra todo papel e a Equipe é só do dono, e nenhuma das duas muda", () => {
    expect([...AREAS_FIXAS].sort()).toEqual(["equipe", "inicio"])
    const tudo = matrizCom(
      ["operacao", "marketing"].flatMap((papel) => [
        { papel, area: "inicio", abre: false },
        { papel, area: "equipe", abre: true },
      ])
    )
    expect(tudo.inicio).toEqual(["dono", "operacao", "marketing"])
    expect(tudo.equipe).toEqual(["dono"])
  })

  it("o que mora dentro de uma área aponta pra uma área de verdade, que não é fixa", () => {
    for (const [dentro, fora] of Object.entries(DENTRO_DE)) {
      expect(AREAS).toContain(dentro)
      expect(AREAS).toContain(fora)
      expect(AREAS_FIXAS).not.toContain(dentro)
      expect(AREAS_FIXAS).not.toContain(fora)
    }
  })

  it("no padrão, ninguém abre o que mora dentro de uma área sem abrir ela", () => {
    for (const [dentro, fora] of Object.entries(DENTRO_DE) as [Area, Area][])
      for (const papel of ACESSO_PADRAO[dentro]) expect(ACESSO_PADRAO[fora]).toContain(papel)
  })

  it("a matriz sem ajuste é a do padrão", () => {
    for (const area of AREAS) expect(MATRIZ_PADRAO[area]).toEqual([...ACESSO_PADRAO[area]])
  })
})

describe("matrizCom — o padrão com o que o dono mudou", () => {
  it("liga e desliga uma área pra um papel, e só pra ele", () => {
    const m = matrizCom([
      { papel: "operacao", area: "cupons", abre: true },
      { papel: "marketing", area: "carrinhos", abre: false },
    ])
    expect(podeAbrir(m, "operacao", "cupons")).toBe(true)
    expect(podeAbrir(m, "marketing", "cupons")).toBe(true)
    expect(podeAbrir(m, "marketing", "carrinhos")).toBe(false)
    expect(podeAbrir(m, "operacao", "carrinhos")).toBe(true)
    expect(podeAbrir(m, "dono", "carrinhos")).toBe(true)
  })

  it("o dono não tem ajuste: abre tudo, diga o banco o que disser", () => {
    const m = matrizCom([{ papel: "dono", area: "pedidos", abre: false }])
    expect(areasDo(m, "dono")).toEqual(AREAS)
  })

  it("ajuste que não vale mais (área que saiu do código, papel que não existe) não conta", () => {
    const m = matrizCom([
      { papel: "operacao", area: "area-que-saiu", abre: true },
      { papel: "admin", area: "cupons", abre: true },
    ])
    expect(m).toEqual(MATRIZ_PADRAO)
  })

  it("o que mora dentro fecha com a área de fora, mesmo que o banco diga que abre", () => {
    const m = matrizCom([
      { papel: "operacao", area: "pedidos", abre: false },
      { papel: "operacao", area: "estornos", abre: true },
      { papel: "marketing", area: "clientes", abre: false },
    ])
    expect(podeAbrir(m, "operacao", "estornos")).toBe(false)
    expect(podeAbrir(m, "marketing", "newsletter")).toBe(false)
    // Religada a de fora, a de dentro volta ao que estava: o marketing abre a newsletter no padrão.
    const volta = matrizCom([{ papel: "operacao", area: "estornos", abre: true }])
    expect(podeAbrir(volta, "operacao", "estornos")).toBe(true)
  })

  it("abre null (linha torta no banco) é fechado", () => {
    const m = matrizCom([{ papel: "marketing", area: "cupons", abre: null }])
    expect(podeAbrir(m, "marketing", "cupons")).toBe(false)
  })

  it("a área nova do código vale o padrão dela: ninguém precisa ajustar nada", () => {
    // Os ajustes gravados antes de uma área existir não falam dela.
    const m = matrizCom([{ papel: "operacao", area: "cupons", abre: true }])
    expect(m.crm).toEqual(MATRIZ_PADRAO.crm)
  })
})

describe("lerAcessos — o que a tela manda salvar", () => {
  const padrao = corpoDa(MATRIZ_PADRAO)

  it("a tabela do padrão volta como a matriz do padrão", () => {
    expect(lerAcessos(padrao)).toEqual({ ok: true, matriz: MATRIZ_PADRAO })
  })

  it("liga os cupons pra operação e desliga os pedidos (e o estorno) dela", () => {
    const r = lerAcessos({
      acesso: {
        operacao: com(sem(padrao.acesso.operacao, "pedidos"), "cupons"),
        marketing: padrao.acesso.marketing,
      },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(podeAbrir(r.matriz, "operacao", "cupons")).toBe(true)
    expect(podeAbrir(r.matriz, "operacao", "pedidos")).toBe(false)
    expect(podeAbrir(r.matriz, "dono", "pedidos")).toBe(true)
    expect(areasDo(r.matriz, "dono")).toEqual(AREAS)
  })

  it("recusa o que mora dentro de uma área sem ela", () => {
    const r = lerAcessos({
      acesso: {
        operacao: padrao.acesso.operacao,
        marketing: com(padrao.acesso.marketing, "estornos"),
      },
    })
    expect(r).toEqual({ ok: false, motivo: "sem_a_area_de_fora" })
    const certo = lerAcessos({
      acesso: {
        operacao: padrao.acesso.operacao,
        marketing: com(padrao.acesso.marketing, "pedidos", "estornos"),
      },
    })
    expect(certo.ok).toBe(true)
  })

  it("recusa mexer no Início e na Equipe", () => {
    expect(
      lerAcessos({
        acesso: {
          operacao: sem(padrao.acesso.operacao, "inicio"),
          marketing: padrao.acesso.marketing,
        },
      })
    ).toEqual({ ok: false, motivo: "linha_fixa" })
    expect(
      lerAcessos({
        acesso: {
          operacao: padrao.acesso.operacao,
          marketing: com(padrao.acesso.marketing, "equipe"),
        },
      })
    ).toEqual({ ok: false, motivo: "linha_fixa" })
  })

  it("recusa coluna do dono, papel que não existe, área que não existe e coluna faltando", () => {
    const ruins = [
      undefined,
      {},
      { acesso: [] },
      { acesso: { ...padrao.acesso, dono: ["inicio"] } },
      { acesso: { ...padrao.acesso, admin: ["inicio"] } },
      {
        acesso: {
          operacao: com(padrao.acesso.operacao, "financeiro"),
          marketing: padrao.acesso.marketing,
        },
      },
      { acesso: { operacao: padrao.acesso.operacao } },
      { acesso: { operacao: "inicio,pedidos", marketing: padrao.acesso.marketing } },
      { acesso: { operacao: [...padrao.acesso.operacao, 7], marketing: padrao.acesso.marketing } },
    ]
    for (const corpo of ruins)
      expect(lerAcessos(corpo)).toEqual({ ok: false, motivo: "acessos_invalidos" })
  })

  it("área repetida não muda nada", () => {
    const r = lerAcessos({
      acesso: {
        operacao: com(padrao.acesso.operacao, "pedidos", "pedidos"),
        marketing: padrao.acesso.marketing,
      },
    })
    expect(r).toEqual({ ok: true, matriz: MATRIZ_PADRAO })
  })
})

describe("ajustesDa e mudancasEntre — o que o banco guarda e o que o registro conta", () => {
  it("o padrão não guarda linha nenhuma", () => {
    expect(ajustesDa(MATRIZ_PADRAO)).toEqual([])
  })

  it("guarda só as diferenças, e a matriz volta igual a partir delas", () => {
    const r = lerAcessos({
      acesso: {
        operacao: com(sem(corpoDa(MATRIZ_PADRAO).acesso.operacao, "carrinhos"), "cupons"),
        marketing: com(corpoDa(MATRIZ_PADRAO).acesso.marketing, "pedidos"),
      },
    })
    if (!r.ok) throw new Error(r.motivo)
    const ajustes = ajustesDa(r.matriz)
    expect(ajustes).toEqual([
      { papel: "operacao", area: "carrinhos", abre: false },
      { papel: "operacao", area: "cupons", abre: true },
      { papel: "marketing", area: "pedidos", abre: true },
    ])
    expect(matrizCom(ajustes)).toEqual(r.matriz)
  })

  it("conta o que mudou de uma tabela pra outra, e nada quando é a mesma", () => {
    const antes = matrizCom([{ papel: "operacao", area: "cupons", abre: true }])
    const depois = matrizCom([{ papel: "marketing", area: "home", abre: false }])
    expect(mudancasEntre(antes, depois)).toEqual([
      { papel: "operacao", area: "cupons", abre: false },
      { papel: "marketing", area: "home", abre: false },
    ])
    expect(mudancasEntre(antes, antes)).toEqual([])
  })

  it("todo papel da matriz é um papel de verdade", () => {
    for (const area of AREAS) for (const p of MATRIZ_PADRAO[area]) expect(PAPEIS).toContain(p)
  })
})
