import {
  emFraseDoCrm,
  emFraseDoEmail,
  lerPeriodoDoCrm,
  montarEmailsDoCrm,
  montarTelaDoCrm,
  type EmailLidoDoBanco,
  type EmailsDaTela,
} from "../crm"

/**
 * A primeira tela do CRM: as anotações em frase, o e-mail mascarado, e todos
 * os tipos na ordem do caminho, com zero onde não houve nada.
 */

const OLEO = { variante: "variant_01", nome: "Óleo para barba", preco: 59.9, quantidade: 1 }
const FATOR = { variante: "variant_02", nome: "Fator de crescimento", preco: 89.9, quantidade: 2 }
const SEM_EMAILS: EmailsDaTela = {
  ligados: false,
  ultimoAviso: null,
  numeros: { enviados: 0, entregues: 0, abertos: 0, clicados: 0, naoChegaram: 0, reclamacoes: 0 },
  porTipo: [],
  ultimos: [],
}

describe("o período", () => {
  it("hoje, 7 ou 30 dias; o resto abre a semana", () => {
    expect(lerPeriodoDoCrm("hoje")).toBe("hoje")
    expect(lerPeriodoDoCrm("30d")).toBe("30d")
    expect(lerPeriodoDoCrm("90d")).toBe("7d")
    expect(lerPeriodoDoCrm(undefined)).toBe("7d")
  })
})

describe("cada anotação em frase", () => {
  it("de onde chegou, com o nome das origens do painel", () => {
    expect(emFraseDoCrm("visita", {})).toBe("chegou na loja · direto")
    expect(
      emFraseDoCrm("visita", {
        origem: {
          fonte: "ig",
          meio: "social",
          campanha: "black",
          conteudo: null,
          termo: null,
          de: null,
        },
      })
    ).toBe("chegou na loja · Instagram (black)")
    expect(
      emFraseDoCrm("visita", {
        origem: {
          fonte: null,
          meio: null,
          campanha: null,
          conteudo: null,
          termo: null,
          de: "google.com",
        },
      })
    ).toBe("chegou na loja · Google")
  })

  it("os produtos, a sacola e o checkout", () => {
    expect(emFraseDoCrm("produto_visto", { itens: [OLEO] })).toBe("viu Óleo para barba")
    expect(emFraseDoCrm("sacola_entrou", { itens: [FATOR, OLEO] })).toBe(
      "pôs 2× Fator de crescimento e mais 1 na sacola"
    )
    expect(emFraseDoCrm("sacola_saiu", { itens: [OLEO] })).toBe("tirou Óleo para barba da sacola")
    expect(emFraseDoCrm("checkout_comecou", { itens: [OLEO], valor: 59.9 })).toBe(
      "começou o checkout · R$\u00a059,90"
    )
    expect(emFraseDoCrm("entrega_escolhida", { frete: "PAC" })).toBe("escolheu a entrega · PAC")
    expect(emFraseDoCrm("pagamento_escolhido", { forma: "cartao", valor: 10 })).toBe(
      "escolheu cartão · R$\u00a010,00"
    )
    expect(emFraseDoCrm("pix_copiado", {})).toBe("copiou o Pix")
    expect(emFraseDoCrm("newsletter", null)).toBe("assinou a newsletter")
  })
})

describe("a tela", () => {
  it("todos os tipos na ordem, com zero; e-mail mascarado; tipo desconhecido fora", () => {
    const agora = new Date("2026-09-26T18:00:00Z")
    const tela = montarTelaDoCrm(
      {
        periodo: "hoje",
        emails: SEM_EMAILS,
        numeros: { visitantes: 3, identificados: 1, pessoas: 1, anotacoes: 5 },
        tipos: [
          { tipo: "sacola_entrou", vezes: 2, visitantes: 1 },
          { tipo: "visita", vezes: 3, visitantes: 3 },
        ],
        ultimos: [
          {
            id: "evt_2",
            tipo: "sacola_entrou",
            dados: { itens: [OLEO] },
            em: "2026-09-26T17:30:00Z",
            email: "rafael.souza@gmail.com",
          },
          { id: "evt_1", tipo: "coisa_velha", dados: null, em: agora, email: null },
          { id: "evt_0", tipo: "visita", dados: {}, em: "2026-09-26T17:00:00Z", email: null },
        ],
      },
      agora
    )
    expect(tela.tipos.map((t) => t.tipo)).toEqual([
      "visita",
      "produto_visto",
      "sacola_entrou",
      "sacola_saiu",
      "checkout_comecou",
      "contato_informado",
      "entrega_escolhida",
      "pagamento_escolhido",
      "pix_copiado",
      "newsletter",
      "conta_entrou",
    ])
    expect(tela.tipos[0]).toEqual({ tipo: "visita", nome: "Visitas", vezes: 3, visitantes: 3 })
    expect(tela.tipos[1]?.vezes).toBe(0)
    expect(tela.ultimos).toEqual([
      {
        id: "evt_2",
        tipo: "sacola_entrou",
        quando: "hoje, 14:30",
        quem: "r•••@gmail.com",
        oque: "pôs Óleo para barba na sacola",
      },
      {
        id: "evt_0",
        tipo: "visita",
        quando: "hoje, 14:00",
        quem: null,
        oque: "chegou na loja · direto",
      },
    ])
  })
})

describe("os e-mails da loja", () => {
  const AGORA = new Date("2026-09-27T18:00:00Z")
  const email = (extra: Partial<EmailLidoDoBanco>): EmailLidoDoBanco => ({
    id: "eml_1",
    tipo: "pedido-confirmado",
    para: "rafael.souza@gmail.com",
    enviado_em: "2026-09-27T17:00:00Z",
    entregue_em: null,
    atrasado_em: null,
    aberto_em: null,
    ultima_abertura_em: null,
    clicado_em: null,
    ultimo_clique_em: null,
    ultimo_link: null,
    devolvido_em: null,
    devolucao: null,
    reclamou_em: null,
    falhou_em: null,
    suprimido_em: null,
    ...extra,
  })

  it("o mais importante primeiro: spam, não chegou, clique, abertura, entrega", () => {
    expect(emFraseDoEmail(email({})).oque).toBe("“Pedido confirmado” saiu")
    expect(emFraseDoEmail(email({ entregue_em: "2026-09-27T17:00:05Z" })).oque).toBe(
      "recebeu “Pedido confirmado”"
    )
    const clicou = email({
      entregue_em: "2026-09-27T17:00:05Z",
      aberto_em: "2026-09-27T17:05:00Z",
      clicado_em: "2026-09-27T17:06:00Z",
      ultimo_clique_em: "2026-09-27T17:30:00Z",
      ultimo_link: "/conta/pedidos/:id",
    })
    expect(emFraseDoEmail(clicou)).toEqual({
      quando: "2026-09-27T17:30:00Z",
      oque: "clicou em “Pedido confirmado” · /conta/pedidos/:id",
      nivel: "bom",
    })
    expect(emFraseDoEmail({ ...clicou, reclamou_em: "2026-09-27T17:40:00Z" })).toMatchObject({
      oque: "marcou “Pedido confirmado” como spam",
      nivel: "ruim",
    })
  })

  it("não chegou, com o porquê em frase", () => {
    expect(
      emFraseDoEmail(
        email({
          tipo: "codigo-de-entrar",
          devolvido_em: "2026-09-27T17:00:03Z",
          devolucao: "Permanent · General: 550",
        })
      ).oque
    ).toBe("“Código de entrar” não chegou · o endereço não aceita e-mail")
    expect(
      emFraseDoEmail(
        email({ devolvido_em: "2026-09-27T17:00:03Z", devolucao: "Transient · MailboxFull" })
      ).oque
    ).toBe("“Pedido confirmado” não chegou · a caixa recusou por agora")
    expect(emFraseDoEmail(email({ tipo: null, suprimido_em: "2026-09-27T17:00:01Z" })).oque).toBe(
      "“Outro” não chegou · o endereço está bloqueado no Resend (já voltou ou reclamou antes)"
    )
    expect(
      emFraseDoEmail(email({ tipo: "envio-saiu", aberto_em: "2026-09-27T17:10:00Z" })).oque
    ).toBe("abriu “Saiu pra entrega”")
  })

  it("a tela: o nome de cada tipo, o e-mail mascarado e a hora do último aviso", () => {
    const tela = montarEmailsDoCrm(
      {
        ligados: true,
        ultimoAviso: new Date("2026-09-27T17:45:00Z"),
        numeros: {
          enviados: 2,
          entregues: 2,
          abertos: 1,
          clicados: 1,
          naoChegaram: 0,
          reclamacoes: 0,
        },
        porTipo: [
          {
            tipo: "pedido-confirmado",
            enviados: 1,
            entregues: 1,
            abertos: 1,
            clicados: 1,
            naoChegaram: 0,
            reclamacoes: 0,
          },
          {
            tipo: null,
            enviados: 1,
            entregues: 1,
            abertos: 0,
            clicados: 0,
            naoChegaram: 0,
            reclamacoes: 0,
          },
        ],
        ultimos: [
          email({ entregue_em: "2026-09-27T17:00:05Z", aberto_em: "2026-09-27T17:05:00Z" }),
        ],
      },
      AGORA
    )
    expect(tela.ultimoAviso).toBe("hoje, 14:45")
    expect(tela.porTipo.map((t) => t.nome)).toEqual(["Pedido confirmado", "Outro"])
    expect(tela.ultimos).toEqual([
      {
        id: "eml_1",
        quando: "hoje, 14:05",
        quem: "r•••@gmail.com",
        oque: "abriu “Pedido confirmado”",
        nivel: "bom",
      },
    ])
  })
})
