import { readdirSync } from "node:fs"
import { join } from "node:path"
import {
  conciliarProblemas,
  integracoesNaTela,
  intervaloDaAgenda,
  minutosDaAgenda,
  noArNaTela,
  problemaDoErp,
  problemasDasOcorrencias,
  problemasDasRotinas,
  problemasDosPedidos,
  problemasDosSinais,
  proximaRodada,
  ROTINAS,
  rotinaNaTela,
  telaDaObservabilidade,
  velocidadeNaTela,
  type EstadoDasIntegracoes,
  type LinhaDoProblema,
  type ProblemaAchado,
} from "../observabilidade"
import type { PedidoCru } from "../pedido"

/**
 * A observabilidade em código puro: as agendas das rotinas, os problemas que
 * o vigia acha, o que ele grava, e a tela conforme o papel.
 */

// 25/09/2026, 21:10 em Brasília.
const AGORA = new Date("2026-09-26T00:10:00Z")
const min = (n: number) => new Date(AGORA.getTime() - n * 60_000)

describe("as rotinas", () => {
  it("a agenda de cada rotina é a do job, e todo job está na lista", async () => {
    const pasta = join(__dirname, "../../../jobs")
    const jobs = readdirSync(pasta).filter((f) => f.endsWith(".ts"))
    expect(jobs.map((f) => f.replace(/\.ts$/, "")).sort()).toEqual(
      ROTINAS.map((r) => r.nome).sort()
    )
    for (const r of ROTINAS) {
      const { config } = await import(join(pasta, r.nome))
      expect(config).toEqual({ name: r.nome, schedule: r.agenda })
    }
  })

  it("os minutos, o intervalo e a próxima rodada", () => {
    expect(minutosDaAgenda("2-59/5 * * * *").slice(0, 3)).toEqual([2, 7, 12])
    expect(minutosDaAgenda("23 * * * *")).toEqual([23])
    expect(minutosDaAgenda("* * * * *")).toHaveLength(60)
    expect(ROTINAS.map((r) => intervaloDaAgenda(r.agenda))).toEqual([1, 5, 5, 5, 5, 5, 10, 60, 60])
    expect(proximaRodada("2-59/5 * * * *", AGORA).toISOString()).toBe("2026-09-26T00:12:00.000Z")
    expect(proximaRodada("23 * * * *", AGORA).toISOString()).toBe("2026-09-26T00:23:00.000Z")
    expect(() => minutosDaAgenda("0 3 * * *")).toThrow(/fora do formato/)
  })

  it("em frase: ok, falhou uma vez, falhando, parada, rodando, travada e a que nunca rodou", () => {
    const def = ROTINAS.find((r) => r.nome === "conciliar-pagamentos")!
    const base = { nome: def.nome, ultima_duracao_ms: 1234 }
    expect(
      rotinaNaTela(def, { ...base, ultima_inicio: min(3), ultima_situacao: "ok" }, AGORA)
    ).toMatchObject({
      s: "ok",
      ultima: "hoje, 21:07",
      duracao: "1,2 s",
      proxima: "21:15",
      texto: null,
    })
    const uma = rotinaNaTela(
      def,
      {
        ...base,
        ultima_inicio: min(3),
        ultima_situacao: "erro",
        ultimo_erro: "o Pagar.me não respondeu",
        falhas_seguidas: 1,
      },
      AGORA
    )
    expect(uma.s).toBe("atencao")
    expect(uma.texto).toBe("Falhou: O Pagar.me não respondeu. Tenta de novo sozinha às 21:15.")
    expect(
      rotinaNaTela(
        def,
        { ...base, ultima_inicio: min(3), ultima_situacao: "erro", falhas_seguidas: 4 },
        AGORA
      ).texto
    ).toMatch(/^Falhou nas últimas 4 vezes/)
    expect(
      rotinaNaTela(def, { ...base, ultima_inicio: min(20), ultima_situacao: "ok" }, AGORA)
    ).toMatchObject({
      s: "erro",
      texto: "Parou: não roda desde hoje, 20:50.",
    })
    expect(
      rotinaNaTela(def, { ...base, ultima_inicio: min(1), ultima_situacao: "rodando" }, AGORA).texto
    ).toBe("Rodando agora.")
    expect(
      rotinaNaTela(def, { ...base, ultima_inicio: min(45), ultima_situacao: "rodando" }, AGORA).s
    ).toBe("erro")
    expect(rotinaNaTela(def, undefined, AGORA)).toMatchObject({
      s: "espera",
      texto: "Ainda não rodou.",
    })
  })
})

const pedido = (extra: Partial<PedidoCru> = {}): PedidoCru =>
  ({ id: "order_1", display_id: 17, status: "completed", metadata: {}, ...extra }) as PedidoCru

describe("os problemas que moram nos pedidos", () => {
  it("o estorno que não saiu é grave, do dono, e sai sozinho", () => {
    const [p] = problemasDosPedidos(
      [
        {
          o: pedido({
            metadata: {
              estornos: {
                pay_1: {
                  situacao: "falhou",
                  esperado: 7760,
                  devolvido: 0,
                  cobranca: "ch_1",
                  forma: "pix",
                  motivo: "sem saldo pra devolver",
                  tentativas: 2,
                  desde: "2026-09-25T18:40:00Z",
                  sozinha: true,
                  proxima: "2026-09-26T00:40:00Z",
                },
              },
            },
          }),
          nota: null,
          envios: [],
        },
      ],
      AGORA
    )
    expect(p).toMatchObject({
      chave: "estorno/order_1/pay_1",
      nivel: "grave",
      area: "Pagamento",
      soDono: true,
      sozinho: true,
      titulo: "O estorno do #17 não saiu",
      acao: { texto: "Abrir o pedido", href: "/pedidos/order_1" },
      vezes: 2,
    })
    expect(p.texto.replace(/\s/g, " ")).toBe(
      "R$ 77,60 do Pix — sem saldo pra devolver. A loja tenta de novo sozinha hoje, 21:40."
    )
  })

  it("a nota rejeitada, a nota pra cancelar, a Frenet que recusou e a entrega que voltou", () => {
    const achados = problemasDosPedidos(
      [
        {
          o: pedido(),
          nota: { situacao: "rejeitada", referencia: "#17", erro: "Rejeição 778: NCM inexistente" },
          envios: [{ codigo: "BR1", situacao: "devolvido", transportadora: "Correios" }],
        },
        {
          o: pedido({ id: "order_2", display_id: 18, status: "canceled" }),
          nota: { situacao: "autorizada", referencia: "#18", cancelar: true },
          envios: [],
        },
        {
          o: pedido({
            id: "order_3",
            display_id: 19,
            metadata: {
              fb_parceiro: {
                parceiro: "frenet",
                em: "2026-09-25T12:00:00Z",
                entrou: false,
                definitivo: true,
                erro: "CEP sem atendimento",
                tentativas: 3,
              },
            },
          }),
          nota: null,
          envios: [],
        },
      ],
      AGORA
    )
    const titulos = achados.map((a) => a.titulo)
    expect(titulos).toContain("A nota do #17 foi rejeitada")
    expect(titulos).toContain("Problema na entrega do #17")
    expect(titulos).toContain("Cancelar a nota do #18 no Bling")
    expect(titulos).toContain("A Frenet recusou o #19")
    expect(achados.find((a) => a.chave === "nota/order_1/rejeitada")?.texto).toBe(
      "Rejeição 778: NCM inexistente. Corrija no Bling e reenvie por lá — a loja percebe sozinha."
    )
    expect(achados.find((a) => a.area === "Entrega")?.texto).toBe(
      "O pacote voltou pra loja. Fale com o cliente pra combinar."
    )
    expect(achados.every((a) => a.sozinho && !a.soDono)).toBe(true)
  })
})

describe("o ERP, as rotinas e os sinais", () => {
  it("a conexão do ERP que caiu, com o link do admin", () => {
    expect(
      problemaDoErp(
        { id: "bling", nome: "Bling", configurado: true, queda: null },
        { agora: AGORA, admin: null }
      )
    ).toBeNull()
    expect(
      problemaDoErp(
        { id: "bling", nome: "Bling", configurado: true, queda: "token expirado" },
        { agora: AGORA, admin: "https://api.loja" }
      )
    ).toMatchObject({
      chave: "erp-caiu/bling",
      nivel: "grave",
      titulo: "A conexão com o Bling caiu",
      acao: { href: "https://api.loja/app/erp", externo: true },
    })
  })

  it("a rotina falhando (grave depois de uma hora sem dar certo) e a que parou", () => {
    const achados = problemasDasRotinas(
      [
        {
          nome: "conciliar-pagamentos",
          ultima_inicio: min(2),
          ultima_situacao: "erro",
          falhas_seguidas: 3,
          ultimo_ok_em: min(17),
          ultimo_erro: "boom",
        },
        {
          nome: "sincronizar-estoque",
          ultima_inicio: min(2),
          ultima_situacao: "erro",
          falhas_seguidas: 20,
          ultimo_ok_em: min(100),
        },
        {
          nome: "confirmar-pedidos",
          ultima_inicio: min(2),
          ultima_situacao: "erro",
          falhas_seguidas: 1,
        },
        { nome: "bumps", ultima_inicio: min(200), ultima_situacao: "ok" },
        { nome: "vigiar-a-loja", ultima_inicio: min(200), ultima_situacao: "ok" },
      ],
      AGORA
    )
    expect(achados.map((a) => [a.chave, a.nivel])).toEqual([
      ["rotina/conciliar-pagamentos", "atencao"],
      ["rotina/sincronizar-estoque", "grave"],
      ["rotina-parada/bumps", "grave"],
    ])
    expect(achados[0].texto).toBe(
      "Falhou nas últimas 3 vezes; a última que deu certo foi hoje, 20:53. Ela tenta de novo sozinha, a cada 5 min."
    )
  })

  it("um cartão por dia: a cotação do frete (atenção sem emergência), o e-mail, o Pagar.me e o Bling", () => {
    const dia = "2026-09-25"
    const falhou = (integracao: string, extra = {}) => ({
      integracao,
      dia,
      ok: 10,
      falhas: 3,
      primeira_falha_em: new Date("2026-09-25T17:02:00Z"),
      ultima_falha_em: new Date("2026-09-25T17:06:00Z"),
      ultima_falha: "linha técnica",
      ...extra,
    })
    const semEmergencia = problemasDosSinais([falhou("frenet")], {
      agora: AGORA,
      emergencia: null,
      admin: "https://api.loja",
    })
    expect(semEmergencia[0]).toMatchObject({
      chave: "frete/2026-09-25",
      nivel: "atencao",
      sozinho: false,
      vezes: 3,
      titulo: "A cotação do frete falhou 3 vezes",
      texto:
        "A Frenet não respondeu hoje, entre 14:02 e 14:06. Sem preço de emergência, quem estava no checkout nessa hora ficou sem opção de entrega.",
      acao: { href: "https://api.loja/app/configuracoes" },
    })
    const comEmergencia = problemasDosSinais([falhou("frenet")], {
      agora: AGORA,
      emergencia: 29.9,
      admin: null,
    })
    expect(comEmergencia[0].nivel).toBe("info")
    expect(comEmergencia[0].texto).toMatch(/cobrou o preço de emergência \(R\$\s29,90\)/)

    const outros = problemasDosSinais(
      [
        falhou("resend", {
          falhas: 1,
          primeira_falha_em: new Date("2026-09-25T17:06:00Z"),
          ultima_falha_resumo: '"Pedido #17 a caminho", pra r•••@gmail.com',
        }),
        falhou("pagarme"),
        falhou("bling"),
        falhou("ga4"),
        { integracao: "loja", dia, ok: 3, falhas: 0 },
      ],
      { agora: AGORA, emergencia: null, admin: null }
    )
    expect(outros.map((o) => o.chave)).toEqual([
      "email/2026-09-25",
      "pagarme/2026-09-25",
      "bling/2026-09-25",
    ])
    expect(outros[0].titulo).toBe("Um e-mail não saiu")
    expect(outros[0].texto).toMatch(
      /^O Resend não aceitou hoje, às 14:06 — o último foi "Pedido #17 a caminho"/
    )
    expect(outros[1].texto).toMatch(/^Hoje, entre 14:02 e 14:06\. A conciliação/)
  })
})

describe("o que o vigia grava", () => {
  const achado = (chave: string, extra: Partial<ProblemaAchado> = {}): ProblemaAchado => ({
    chave,
    nivel: "grave",
    area: "Pagamento",
    titulo: "t",
    texto: "x",
    acao: null,
    detalhe: null,
    pedidoId: null,
    vezes: 1,
    ocorreu: AGORA,
    sozinho: true,
    soDono: false,
    ...extra,
  })

  it("cria o novo, atualiza o aberto, reabre o que tinha saído sozinho e resolve o que sumiu", () => {
    const m = conciliarProblemas(
      [
        { id: "a", chave: "aberto", situacao: "aberto", sozinho: true },
        {
          id: "b",
          chave: "voltou",
          situacao: "resolvido",
          sozinho: true,
          resolvido_por: "sozinha",
          resolvido_em: min(60),
        },
        { id: "c", chave: "sumiu", situacao: "aberto", sozinho: true },
        {
          id: "d",
          chave: "fora-da-janela",
          situacao: "aberto",
          sozinho: true,
          pedido_id: "order_velho",
        },
        { id: "e", chave: "de-evento", situacao: "aberto", sozinho: false },
      ],
      [achado("novo"), achado("aberto"), achado("voltou"), achado("novo")],
      new Set(["order_1"])
    )
    expect(m.criar.map((a) => a.chave)).toEqual(["novo"])
    expect(m.atualizar).toEqual([
      { id: "a", achado: expect.objectContaining({ chave: "aberto" }), reabrir: false },
      { id: "b", achado: expect.objectContaining({ chave: "voltou" }), reabrir: true },
    ])
    expect(m.resolver).toEqual(["c"])
  })

  it("o de evento marcado como visto só volta se acontecer de novo depois", () => {
    const visto = {
      id: "v",
      chave: "frete/2026-09-25",
      situacao: "resolvido" as const,
      sozinho: false,
      resolvido_por: "eqp_1",
      resolvido_em: min(10),
    }
    expect(
      conciliarProblemas(
        [visto],
        [achado(visto.chave, { sozinho: false, ocorreu: min(30) })],
        new Set()
      ).atualizar
    ).toEqual([])
    expect(
      conciliarProblemas(
        [visto],
        [achado(visto.chave, { sozinho: false, ocorreu: min(2) })],
        new Set()
      ).atualizar[0].reabrir
    ).toBe(true)
  })
})

const SEM_MEDIDAS = { medidas: [], maisLenta: null }

describe("a tela", () => {
  const integracoes = (extra: Partial<EstadoDasIntegracoes> = {}): EstadoDasIntegracoes => ({
    agora: AGORA,
    producao: true,
    loja: { configurada: true, ok: true, ms: 180, motivo: null, noAr: "99,98%" },
    medusaDesde: min(150),
    pagarme: true,
    frenet: true,
    resend: true,
    ga4: false,
    erp: { nome: "Bling", configurado: true, conectado: true, queda: null, ultimaNota: min(30) },
    sinais: [
      { integracao: "pagarme-aviso", dia: "2026-09-25", ok: 4, falhas: 0, ultimo_ok_em: min(2) },
      { integracao: "pagarme", dia: "2026-09-25", ok: 20, falhas: 0, ultimo_ok_em: min(5) },
      {
        integracao: "resend",
        dia: "2026-09-25",
        ok: 38,
        falhas: 1,
        ultimo_ok_em: min(1),
        ultima_falha_em: min(90),
      },
      {
        integracao: "frenet",
        dia: "2026-09-25",
        ok: 12,
        falhas: 3,
        ultimo_ok_em: min(40),
        ultima_falha_em: min(4),
      },
    ],
    ...extra,
  })

  it("as integrações em frase, com o último sinal", () => {
    const lista = integracoesNaTela(integracoes())
    const de = (id: string) => lista.find((i) => i.id === id)!
    expect(de("loja")).toMatchObject({
      s: "ok",
      texto: "No ar · 99,98% em 30 dias · respondeu em 180 ms",
      sinal: "agora",
    })
    expect(de("medusa").texto).toBe("No ar · ligado hoje, 18:40")
    expect(de("pagarme")).toMatchObject({
      s: "ok",
      texto: "Último aviso hoje, 21:08",
      sinal: "hoje, 21:08",
    })
    expect(de("erp")).toMatchObject({ s: "ok", texto: "Conectado · última nota hoje, 20:40" })
    expect(de("frenet")).toMatchObject({
      s: "erro",
      texto: "15 cotações hoje · 3 falharam (a última hoje, 21:06)",
    })
    expect(de("resend")).toMatchObject({ s: "atencao", texto: "38 e-mails hoje · 1 não saiu" })
    expect(de("ga4").s).toBe("off")

    const caida = integracoesNaTela(
      integracoes({
        loja: { configurada: true, ok: false, ms: null, motivo: "tempo esgotado", noAr: null },
        erp: {
          nome: "Bling",
          configurado: true,
          conectado: false,
          queda: "token expirado",
          ultimaNota: null,
        },
        resend: false,
      })
    )
    expect(caida.find((i) => i.id === "loja")).toMatchObject({
      s: "erro",
      texto: "Não respondeu agora: tempo esgotado.",
    })
    expect(caida.find((i) => i.id === "erp")).toMatchObject({
      s: "erro",
      texto: "A conexão caiu: Token expirado.",
    })
    expect(caida.find((i) => i.id === "resend")).toMatchObject({
      s: "erro",
      texto: "Sem a chave do Resend: nenhum e-mail sai.",
    })
  })

  const linha = (id: string, extra: Partial<LinhaDoProblema> = {}): LinhaDoProblema => ({
    id,
    chave: id,
    situacao: "aberto",
    sozinho: true,
    nivel: "grave",
    area: "Nota fiscal",
    titulo: id,
    texto: "x",
    primeira_em: min(60),
    ultima_em: min(1),
    ...extra,
  })

  it("o estorno só pro dono; o de evento se marca, o de estado não; os graves primeiro", () => {
    const problemas = [
      linha("frete", { nivel: "atencao", sozinho: false, vezes: 3, area: "Frete" }),
      linha("estorno", { so_dono: true, area: "Pagamento" }),
      linha("nota"),
      linha("antigo", { situacao: "resolvido", resolvido_por: "sozinha", resolvido_em: min(30) }),
      linha("visto", {
        situacao: "resolvido",
        sozinho: false,
        resolvido_por: "eqp_1",
        resolvido_nome: "Ana",
        resolvido_em: min(5),
      }),
    ]
    const rotinas = ROTINAS.map((r) => ({
      nome: r.nome,
      ultima_inicio: min(0.5),
      ultima_situacao: "ok",
    }))
    const dono = telaDaObservabilidade("dono", {
      agora: AGORA,
      problemas,
      rotinas,
      integracoes: integracoes(),
      velocidade: SEM_MEDIDAS,
      noAr: [],
    })
    expect(dono.problemas.map((p) => p.id)).toEqual(["estorno", "nota", "frete", "antigo", "visto"])
    expect(dono.geral).toMatchObject({ nivel: "grave", titulo: "2 problemas graves agora" })
    expect(dono.numeros.problemas).toEqual({ abertos: 3, graves: 2, olhar: 1 })
    expect(dono.numeros.rotinas).toEqual({ ok: 9, total: 9 })
    expect(dono.numeros.noAr).toEqual({
      valor: null,
      texto: "medindo: a loja é conferida de 5 em 5 min",
    })
    expect(dono.numeros.carregar).toEqual({
      valor: null,
      s: null,
      texto: "sem visitas medidas ainda",
    })
    const frete = dono.problemas.find((p) => p.id === "frete")!
    expect(frete).toMatchObject({ podeMarcar: true, meta: "3 vezes · a última hoje, 21:09" })
    expect(dono.problemas.find((p) => p.id === "nota")).toMatchObject({
      podeMarcar: false,
      meta: "desde hoje, 20:10",
    })
    expect(dono.problemas.find((p) => p.id === "antigo")?.resolvido).toBe(
      "Saiu sozinho hoje, 20:40"
    )
    expect(dono.problemas.find((p) => p.id === "visto")?.resolvido).toBe(
      "Resolvido por Ana, hoje, 21:05"
    )

    const operacao = telaDaObservabilidade("operacao", {
      agora: AGORA,
      problemas,
      rotinas,
      integracoes: integracoes(),
      velocidade: SEM_MEDIDAS,
      noAr: [],
    })
    expect(operacao.problemas.map((p) => p.id)).not.toContain("estorno")
    expect(operacao.geral.titulo).toBe("1 problema grave agora")
  })

  it("sem nada aberto, tudo funcionando; com as rotinas paradas, o aviso aparece sem tabela", () => {
    const rodando = ROTINAS.map((r) => ({
      nome: r.nome,
      ultima_inicio: min(0.5),
      ultima_situacao: "ok",
    }))
    expect(
      telaDaObservabilidade("operacao", {
        agora: AGORA,
        problemas: [],
        rotinas: rodando,
        integracoes: integracoes(),
        velocidade: SEM_MEDIDAS,
        noAr: [],
      }).geral
    ).toMatchObject({
      nivel: "info",
      titulo: "Tudo funcionando",
    })
    const paradas = ROTINAS.map((r) => ({
      nome: r.nome,
      ultima_inicio: min(40),
      ultima_situacao: "ok",
    }))
    const tela = telaDaObservabilidade("operacao", {
      agora: AGORA,
      problemas: [],
      rotinas: paradas,
      integracoes: integracoes(),
      velocidade: SEM_MEDIDAS,
      noAr: [],
    })
    expect(tela.problemas[0]).toMatchObject({
      id: "rotinas-paradas",
      nivel: "grave",
      titulo: "As rotinas automáticas pararam",
      podeMarcar: false,
    })
    expect(tela.problemas[0].texto).toMatch(/^Nenhuma roda desde hoje, 20:30\./)
    expect(tela.numeros.rotinas.ok).toBe(2)
  })
})

describe("o site (parte 2)", () => {
  const dia = "2026-09-25"
  const quando = (h: string) => new Date(`2026-09-25T${h}:00-03:00`)

  it("a página que não existe: um cartão por dia, e o link quebrado nosso é atenção", () => {
    const [de404, deErro] = problemasDasOcorrencias(
      [
        {
          tipo: "404",
          chave: "/pomada-60g",
          dia,
          pagina: "/pomada-60g",
          detalhe: "google.com",
          vezes: 12,
          internas: 0,
          primeira_em: quando("09:00"),
          ultima_em: quando("20:40"),
        },
        {
          tipo: "404",
          chave: "/kitz",
          dia,
          pagina: "/kitz",
          detalhe: "loja.fuckingbarba.com.br",
          vezes: 2,
          internas: 2,
          primeira_em: quando("10:00"),
          ultima_em: quando("11:00"),
        },
        {
          tipo: "erro",
          chave: "x @ /checkout",
          dia,
          pagina: "/checkout",
          detalhe: "Cannot read properties of undefined",
          vezes: 3,
          primeira_em: quando("12:00"),
          ultima_em: quando("12:30"),
        },
      ],
      AGORA
    )
    expect(de404).toMatchObject({
      chave: "404/2026-09-25",
      nivel: "atencao",
      area: "Site",
      sozinho: false,
      vezes: 14,
      titulo: "14 visitas caíram em páginas que não existem",
      texto:
        "/pomada-60g (12), /kitz (2). 2 vieram de um link da própria loja: é link quebrado, pra consertar.",
    })
    expect(de404.detalhe).toBe(
      "GET /pomada-60g → 404 (12x, de google.com)\nGET /kitz → 404 (2x, de loja.fuckingbarba.com.br)"
    )
    expect(deErro).toMatchObject({
      chave: "erro-navegador/2026-09-25",
      nivel: "atencao",
      titulo: "3 erros no navegador de quem visitou",
    })
    expect(deErro.texto).toMatch(
      /^O mais comum: "Cannot read properties of undefined", em \/checkout \(3 vezes\)\./
    )
    const [soDeFora] = problemasDasOcorrencias(
      [
        {
          tipo: "404",
          chave: "/x",
          dia,
          pagina: "/x",
          vezes: 1,
          internas: 0,
          primeira_em: quando("09:00"),
          ultima_em: quando("09:00"),
        },
      ],
      AGORA
    )
    expect(soDeFora).toMatchObject({
      nivel: "info",
      titulo: "1 visita caiu numa página que não existe",
    })
  })

  it("a loja fora do ar: grave enquanto não volta; atenção depois", () => {
    const fora = (extra = {}) => ({
      integracao: "loja-no-ar",
      dia,
      ok: 200,
      falhas: 2,
      primeira_falha_em: quando("14:02"),
      ultima_falha_em: quando("14:07"),
      ultimo_ok_em: quando("21:05"),
      ...extra,
    })
    const [voltou] = problemasDosSinais([fora()], { agora: AGORA, emergencia: null, admin: null })
    expect(voltou).toMatchObject({
      chave: "loja-fora/2026-09-25",
      nivel: "atencao",
      titulo: "A loja ficou fora do ar",
      texto: "Uns 10 minutos fora hoje, entre 14:02 e 14:07. Voltou sozinha.",
    })
    const [agora] = problemasDosSinais([fora({ ultimo_ok_em: quando("14:00") })], {
      agora: AGORA,
      emergencia: null,
      admin: null,
    })
    expect(agora).toMatchObject({
      nivel: "grave",
      titulo: "A loja está fora do ar",
      acao: { texto: "Abrir a Vercel", externo: true },
    })
    expect(agora.texto).toMatch(/^Não respondeu na última conferência, às 14:07/)
  })

  it("a velocidade: o p75 em frase, a faixa do Google, e a página mais lenta quando passa do bom", () => {
    const v = velocidadeNaTela({
      medidas: [
        { metrica: "LCP", aparelho: "celular", p75: 2640, n: 30 },
        { metrica: "LCP", aparelho: "computador", p75: 1400, n: 12 },
        { metrica: "INP", aparelho: "celular", p75: 180, n: 20 },
        { metrica: "CLS", aparelho: "celular", p75: 0.31, n: 30 },
      ],
      maisLenta: { pagina: "/produtos/fator", p75: 3120, n: 8 },
    })
    const [lcp, inp, cls] = v.vitais
    expect(lcp.celular).toEqual({
      valor: "2,6 s",
      s: "medio",
      n: 30,
      ponto: 52.8,
      faixaBoa: 50,
      faixaMedia: 30,
    })
    expect(lcp.computador).toMatchObject({ valor: "1,4 s", s: "bom" })
    expect(inp.celular).toMatchObject({ valor: "180 ms", s: "bom" })
    expect(inp.computador).toBeNull()
    expect(cls.celular).toMatchObject({ valor: "0,31", s: "ruim" })
    expect(v.visitas).toBe(42)
    expect(v.maisLenta).toBe(
      "A página mais lenta no celular é /produtos/fator: 3,1 s pra carregar, em 8 visitas. A foto grande do topo costuma ser a culpada."
    )
    expect(
      velocidadeNaTela({ medidas: [], maisLenta: { pagina: "/", p75: 1200, n: 9 } }).maisLenta
    ).toBeNull()
  })

  it("o tempo no ar: pra baixo, com as quedas; desde quando mede, se faz menos de 30 dias", () => {
    const dias = [
      { integracao: "loja-no-ar", dia: "2026-09-20", ok: 287, falhas: 1 },
      { integracao: "loja-no-ar", dia: "2026-09-25", ok: 288, falhas: 0 },
      { integracao: "resend", dia: "2026-09-25", ok: 9, falhas: 9 },
    ]
    expect(noArNaTela(dias, AGORA)).toEqual({
      valor: "99,82%",
      texto: "desde 20/09 · 5 min fora, a última em 20/09",
    })
    expect(
      noArNaTela([{ integracao: "loja-no-ar", dia: "2026-08-01", ok: 10, falhas: 0 }], AGORA)
    ).toEqual({
      valor: "100%",
      texto: "30 dias · nenhuma queda",
    })
    expect(noArNaTela([], AGORA).valor).toBeNull()
  })

  it("na tela: o carregar no celular e o tempo no ar nos números", () => {
    const t = telaDaObservabilidade("dono", {
      agora: AGORA,
      problemas: [],
      rotinas: ROTINAS.map((r) => ({
        nome: r.nome,
        ultima_inicio: min(0.5),
        ultima_situacao: "ok",
      })),
      integracoes: {
        agora: AGORA,
        producao: true,
        loja: { configurada: true, ok: true, ms: 120, motivo: null, noAr: "100%" },
        medusaDesde: min(60),
        pagarme: true,
        frenet: true,
        resend: true,
        ga4: true,
        erp: { nome: "Bling", configurado: false, conectado: false, queda: null, ultimaNota: null },
        sinais: [],
      },
      velocidade: {
        medidas: [{ metrica: "LCP", aparelho: "celular", p75: 2100, n: 5 }],
        maisLenta: null,
      },
      noAr: [{ integracao: "loja-no-ar", dia: "2026-09-25", ok: 12, falhas: 0 }],
    })
    expect(t.numeros.carregar).toEqual({ valor: "2,1 s", s: "bom", texto: "bom: até 2,5 s" })
    expect(t.numeros.noAr).toEqual({ valor: "100%", texto: "desde 25/09 · nenhuma queda" })
    expect(t.velocidade.visitas).toBe(5)
  })
})
