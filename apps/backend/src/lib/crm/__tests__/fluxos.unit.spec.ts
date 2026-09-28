import {
  aindaAtiva,
  CHAVE_DOS_FLUXOS,
  comecoDoPix,
  deMadrugada,
  decidir,
  diasDoFluxo,
  FLUXOS,
  fluxosLigados,
  guardarConfigDosFluxos,
  lerConfigDosFluxos,
  ganhouCupomHaPouco,
  noControle,
  toqueDaVez,
  type Entrada,
  type Registro,
  validadeDoCupom,
} from "../fluxos"

/**
 * As regras do motor dos fluxos: o toque da vez, o que começou antes de
 * ligar, um fluxo por vez, comprou-parou, o teto, o grupo de controle e o
 * cupom a cada 60 dias.
 */

const MIN = 60 * 1000
const HORA = 60 * MIN
const DIA = 24 * HORA
const LIGOU = new Date("2026-09-27T12:00:00Z")
const ligados = { pix: LIGOU, checkout: LIGOU }

/** Um e-mail fora do grupo de controle dos dois fluxos (o controle é sorteado pelo e-mail). */
const EMAIL = (() => {
  for (let i = 0; ; i++) {
    const e = `rafael${i}@exemplo.com`
    if (!noControle(e, "checkout") && !noControle(e, "pix") && !noControle(e, "carrinho")) return e
  }
})()

const checkout = (extra: Partial<Entrada> = {}): Entrada => ({
  fluxo: "checkout",
  chave: "cart_1",
  email: EMAIL,
  comeco: new Date(LIGOU.getTime() + HORA),
  comprou: false,
  ...extra,
})
const depois = (e: Entrada, ms: number) => new Date(e.comeco.getTime() + ms)
const registro = (extra: Partial<Registro> = {}): Registro => ({
  email: EMAIL,
  fluxo: "checkout",
  chave: "cart_1",
  toque: "checkout-30min",
  em: LIGOU,
  como: "enviado",
  ...extra,
})

describe("o toque da vez", () => {
  it("nenhum antes dos 30 minutos; o de 30 minutos depois", () => {
    const e = checkout()
    expect(toqueDaVez(e, [], depois(e, 29 * MIN))).toBeNull()
    expect(toqueDaVez(e, [], depois(e, 31 * MIN))).toEqual({
      toque: expect.objectContaining({ id: "checkout-30min" }),
      pulados: [],
    })
  })

  it("com dois vencidos (a rotina parou), sai só o mais novo, e o outro fica pulado", () => {
    const e = checkout()
    expect(toqueDaVez(e, [], depois(e, 5 * HORA))).toEqual({
      toque: expect.objectContaining({ id: "checkout-4h" }),
      pulados: ["checkout-30min"],
    })
  })

  it("o que já saiu não sai de novo; vencido há mais de 12 horas não sai mais", () => {
    const e = checkout()
    expect(toqueDaVez(e, [registro()], depois(e, 40 * MIN))).toBeNull()
    expect(toqueDaVez(e, [registro()], depois(e, 4 * HORA + 13 * HORA))).toBeNull()
    expect(aindaAtiva(e, [registro()], depois(e, 4 * HORA + 13 * HORA))).toBe(true)
    expect(aindaAtiva(e, [registro()], depois(e, 2 * DIA + 13 * HORA))).toBe(false)
  })

  it("o Pix começa 15 minutos antes de vencer", () => {
    expect(comecoDoPix(new Date("2026-09-27T15:30:00Z")).toISOString()).toBe(
      "2026-09-27T15:15:00.000Z"
    )
  })
})

describe("a decisão de uma pessoa", () => {
  it("manda o toque da vez", () => {
    const e = checkout()
    const r = decidir({ entradas: [e], registros: [], ligados, agora: depois(e, 31 * MIN) })
    expect(r?.decisao).toEqual({
      tipo: "mandar",
      toque: expect.objectContaining({ id: "checkout-30min" }),
      pulados: [],
      darCupom: false,
    })
  })

  it("só vale o que começou depois de ligar, e só fluxo ligado", () => {
    const antes = checkout({ comeco: new Date(LIGOU.getTime() - HORA) })
    expect(
      decidir({ entradas: [antes], registros: [], ligados, agora: depois(antes, 31 * MIN) })
    ).toBeNull()
    const e = checkout()
    expect(
      decidir({ entradas: [e], registros: [], ligados: { pix: LIGOU }, agora: depois(e, 31 * MIN) })
    ).toBeNull()
  })

  it("o Pix conta pela hora do pedido: o que nasceu depois de ligar vale, mesmo com a régua antes", () => {
    const pix: Entrada = {
      ...checkout(),
      fluxo: "pix",
      chave: "order_1",
      comeco: new Date(LIGOU.getTime() - 10 * MIN),
      inicio: new Date(LIGOU.getTime() + MIN),
    }
    const agora = new Date(pix.comeco.getTime() + DIA + MIN)
    expect(decidir({ entradas: [pix], registros: [], ligados, agora })?.decisao).toMatchObject({
      tipo: "mandar",
      toque: { id: "pix-24h" },
    })
    const antes = { ...pix, inicio: new Date(LIGOU.getTime() - MIN) }
    expect(decidir({ entradas: [antes], registros: [], ligados, agora })).toBeNull()
  })

  it("comprou, parou", () => {
    const e = checkout({ comprou: true })
    expect(
      decidir({ entradas: [e], registros: [], ligados, agora: depois(e, 31 * MIN) })
    ).toBeNull()
  })

  it("um fluxo por vez: o Pix é o dono, mesmo esperando o próximo toque", () => {
    const pix: Entrada = { ...checkout(), fluxo: "pix", chave: "order_1" }
    const carrinho = checkout({ chave: "cart_2", comeco: new Date(pix.comeco.getTime() + HORA) })
    const jaAvisou: Registro = { ...registro(), fluxo: "pix", chave: "order_1", toque: "pix-vence" }
    const r = decidir({
      entradas: [carrinho, pix],
      registros: [jaAvisou],
      ligados,
      agora: depois(carrinho, 31 * MIN),
    })
    expect(r?.entrada.fluxo).toBe("pix")
    expect(r?.decisao).toEqual({ tipo: "nada" })
  })

  it("acabou o Pix, o checkout anda", () => {
    const pix: Entrada = { ...checkout(), fluxo: "pix", chave: "order_1", comprou: true }
    const carrinho = checkout({ chave: "cart_2" })
    const r = decidir({
      entradas: [pix, carrinho],
      registros: [],
      ligados,
      agora: depois(carrinho, 31 * MIN),
    })
    expect(r?.entrada.chave).toBe("cart_2")
  })

  it("o teto: 3 e-mails em 24 horas seguram o próximo", () => {
    const e = checkout()
    const agora = depois(e, 4 * HORA + MIN)
    const tres = [0, 1, 2].map((i) =>
      registro({ chave: `cart_${i + 10}`, em: new Date(agora.getTime() - (i + 1) * HORA) })
    )
    expect(
      decidir({ entradas: [e], registros: [...tres, registro()], ligados, agora })?.decisao
    ).toEqual({ tipo: "teto", toque: expect.objectContaining({ id: "checkout-4h" }) })
    // Pulado e controle não contam no teto.
    const semContar = tres.map((r, i) => ({ ...r, como: i ? "pulado" : "controle" }) as Registro)
    expect(
      decidir({ entradas: [e], registros: [...semContar, registro()], ligados, agora })?.decisao
        .tipo
    ).toBe("mandar")
  })

  it("o cupom: no toque de 24 horas, e só um a cada 60 dias", () => {
    const e = checkout()
    const agora = depois(e, DIA + MIN)
    expect(decidir({ entradas: [e], registros: [], ligados, agora })?.decisao).toMatchObject({
      tipo: "mandar",
      toque: { id: "checkout-24h" },
      darCupom: true,
    })
    const cupomHa = (dias: number) =>
      registro({
        chave: "cart_9",
        cupom: "VOLTA-AB12CD",
        em: new Date(agora.getTime() - dias * DIA),
      })
    expect(
      decidir({ entradas: [e], registros: [cupomHa(30)], ligados, agora })?.decisao
    ).toMatchObject({ tipo: "mandar", darCupom: false })
    expect(
      decidir({ entradas: [e], registros: [cupomHa(61)], ligados, agora })?.decisao
    ).toMatchObject({ tipo: "mandar", darCupom: true })
    expect(ganhouCupomHaPouco([cupomHa(59)], EMAIL, agora)).toBe(true)
  })
})

describe("o grupo de controle", () => {
  it("é sempre a mesma resposta pro mesmo e-mail, e fica perto de 5%", () => {
    const emails = Array.from({ length: 4000 }, (_, i) => `pessoa${i}@exemplo.com`)
    const dentro = emails.filter((e) => noControle(e, "checkout")).length
    expect(dentro / emails.length).toBeGreaterThan(0.035)
    expect(dentro / emails.length).toBeLessThan(0.065)
    expect(noControle("Ana@Exemplo.com ", "checkout")).toBe(
      noControle("ana@exemplo.com", "checkout")
    )
  })

  it("quem cai no controle fica registrado sem receber", () => {
    const email = Array.from({ length: 500 }, (_, i) => `c${i}@exemplo.com`).find((x) =>
      noControle(x, "checkout")
    )!
    const e = checkout({ email })
    expect(
      decidir({ entradas: [e], registros: [], ligados, agora: depois(e, 31 * MIN) })?.decisao.tipo
    ).toBe("controle")
  })
})

describe("o aviso do Pix", () => {
  it("só sai antes de vencer", () => {
    const vence = new Date(LIGOU.getTime() + 2 * HORA)
    const e: Entrada = { ...checkout(), fluxo: "pix", chave: "order_1", comeco: comecoDoPix(vence) }
    expect(toqueDaVez(e, [], new Date(vence.getTime() - 10 * MIN))?.toque.id).toBe("pix-vence")
    expect(toqueDaVez(e, [], new Date(vence.getTime() - 30 * 1000))).toBeNull()
  })
})

describe("a configuração dos fluxos", () => {
  it("sem nada guardado: ligados (a estreia não), sem o desde, 10% de desconto", () => {
    expect(lerConfigDosFluxos({})).toEqual({
      fluxos: {
        pix: { ligado: true, desde: null },
        checkout: { ligado: true, desde: null },
        carrinho: { ligado: true, desde: null },
        "boas-vindas": { ligado: true, desde: null },
        estreia: { ligado: false, desde: null },
      },
      desconto: 10,
    })
    // O ligado sem desde ainda não vale: a primeira rodada só guarda a hora.
    expect(fluxosLigados(lerConfigDosFluxos(null))).toEqual({})
  })

  it("lê o guardado, volta igual, e ignora o torto", () => {
    const c = {
      fluxos: {
        pix: { ligado: false, desde: LIGOU },
        checkout: { ligado: true, desde: LIGOU },
        carrinho: { ligado: false, desde: null },
        "boas-vindas": { ligado: true, desde: null },
        estreia: { ligado: true, desde: LIGOU },
      },
      desconto: 15,
    }
    const guardado = { [CHAVE_DOS_FLUXOS]: guardarConfigDosFluxos(c) }
    expect(lerConfigDosFluxos(guardado)).toEqual(c)
    expect(fluxosLigados(c)).toEqual({ checkout: LIGOU, estreia: LIGOU })
    expect(
      lerConfigDosFluxos({
        [CHAVE_DOS_FLUXOS]: { desconto: 90, pix: { desde: "ontem" }, estreia: { ligado: "sim" } },
      })
    ).toEqual({
      fluxos: {
        pix: { ligado: true, desde: null },
        checkout: { ligado: true, desde: null },
        carrinho: { ligado: true, desde: null },
        "boas-vindas": { ligado: true, desde: null },
        estreia: { ligado: false, desde: null },
      },
      desconto: 10,
    })
  })
})

describe("de madrugada, só o urgente", () => {
  it("a madrugada é das 22h às 8h em Brasília", () => {
    expect(deMadrugada(new Date("2026-09-28T01:30:00Z"))).toBe(true) // 22h30 em Brasília
    expect(deMadrugada(new Date("2026-09-28T10:59:00Z"))).toBe(true) // 7h59
    expect(deMadrugada(new Date("2026-09-28T11:00:00Z"))).toBe(false) // 8h
  })

  it("o de 30 minutos sai; o de 4 horas espera as 8h", () => {
    // Começou às 21h de Brasília: o de 30 min vence às 21h30, o de 4 horas à 1h.
    const e = checkout({ comeco: new Date("2026-09-28T00:00:00Z") })
    const r30 = decidir({ entradas: [e], registros: [], ligados, agora: depois(e, 31 * MIN) })
    expect(r30?.decisao.tipo).toBe("mandar")
    const madrugada = decidir({
      entradas: [e],
      registros: [registro()],
      ligados,
      agora: depois(e, 4 * HORA + MIN),
    })
    expect(madrugada?.decisao).toEqual({ tipo: "nada" })
    const manha = decidir({
      entradas: [e],
      registros: [registro()],
      ligados,
      agora: new Date("2026-09-28T11:05:00Z"),
    })
    expect(manha?.decisao).toMatchObject({ tipo: "mandar", toque: { id: "checkout-4h" } })
  })
})

describe("o carrinho abandonado", () => {
  it("os toques: 1 h, 12 h, 1 dia com o cupom, 3 e 5 dias; o cupom vale 3 dias", () => {
    expect(FLUXOS.carrinho.toques.map((t) => [t.id, t.depois / HORA, Boolean(t.cupom)])).toEqual([
      ["carrinho-1h", 1, false],
      ["carrinho-12h", 12, false],
      ["carrinho-24h", 24, true],
      ["carrinho-3d", 72, false],
      ["carrinho-5d", 120, false],
    ])
    expect(validadeDoCupom("carrinho")).toBe(3 * DIA)
    expect(validadeDoCupom("checkout")).toBe(2 * DIA)
    // A janela do motor: o último toque, a validade dele e mais um dia.
    expect([diasDoFluxo("pix"), diasDoFluxo("checkout"), diasDoFluxo("carrinho")]).toEqual([
      4, 4, 7,
    ])
  })

  it("o checkout vem antes do carrinho da mesma pessoa", () => {
    const sacola: Entrada = { ...checkout(), fluxo: "carrinho", chave: "cart_9" }
    const noCheckout = checkout({ chave: "cart_10" })
    const r = decidir({
      entradas: [sacola, noCheckout],
      registros: [],
      ligados: { ...ligados, carrinho: LIGOU },
      agora: depois(sacola, HORA + MIN),
    })
    expect(r?.entrada.fluxo).toBe("checkout")
  })

  it("com o fluxo do carrinho sozinho, o de 1 hora sai", () => {
    const sacola: Entrada = { ...checkout(), fluxo: "carrinho", chave: "cart_9" }
    const r = decidir({
      entradas: [sacola],
      registros: [],
      ligados: { carrinho: LIGOU },
      agora: depois(sacola, HORA + MIN),
    })
    expect(r?.decisao).toMatchObject({ tipo: "mandar", toque: { id: "carrinho-1h" } })
  })
})
