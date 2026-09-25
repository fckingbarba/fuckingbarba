import { PADRAO, type Configuracoes } from "../../configuracoes"
import {
  AVISOS_DA_EQUIPE,
  camposEmBranco,
  cnpjValido,
  destinatarios,
  ehJanela,
  formularioDaEmpresa,
  freteEmFrase,
  lerEmergencia,
  lerEmpresa,
  lerFrete,
  MAX_PENDENCIAS,
  pendenciasEmFrase,
  telaDasConfiguracoes,
  whatsappNaTela,
  type DadosDasConfiguracoes,
  type MembroParaAviso,
} from "../configuracoes"

/**
 * As configurações no painel: o formulário da empresa e do frete campo a
 * campo, pra quem vai cada aviso da equipe, e a tela das abas.
 */

const semEspaco = (s: string) => s.replace(/\s/g, " ")

describe("os dados da empresa", () => {
  it("o CNPJ confere pelos dois últimos números", () => {
    expect(cnpjValido("11222333000181")).toBe(true)
    expect(cnpjValido("11222333000182")).toBe(false)
    expect(cnpjValido("11111111111111")).toBe(false)
    expect(cnpjValido("123")).toBe(false)
  })

  it("lê o formulário: CNPJ formatado, WhatsApp com 55, horário por linha, em branco vira nulo", () => {
    const lido = lerEmpresa({
      razaoSocial: "  Barba Forte LTDA ",
      cnpj: "11222333000181",
      endereco: "",
      whatsapp: "(47) 98826-1551",
      email: "contato@fuckingbarba.com.br",
      horario: "Seg a sex, 9h às 18h\n\n  Sáb, 9h às 13h  ",
      prazoDePostagem: "até 1 dia útil",
    })
    expect(lido).toEqual({
      ok: true,
      valor: {
        empresa: { razaoSocial: "Barba Forte LTDA", cnpj: "11.222.333/0001-81", endereco: null },
        atendimento: {
          whatsapp: "5547988261551",
          email: "contato@fuckingbarba.com.br",
          horario: ["Seg a sex, 9h às 18h", "Sáb, 9h às 13h"],
          prazoDePostagem: "até 1 dia útil",
        },
      },
    })
  })

  it("diz o que está errado em cada campo", () => {
    const lido = lerEmpresa({
      cnpj: "11.222.333/0001-99",
      whatsapp: "98826",
      email: "contato@",
      horario: "1\n2\n3\n4\n5",
    })
    expect(lido.ok).toBe(false)
    expect(!lido.ok && Object.keys(lido.erros).sort()).toEqual([
      "cnpj",
      "email",
      "horario",
      "whatsapp",
    ])
  })

  it("mostra o gravado no jeito do campo, e diz o que está em branco", () => {
    expect(whatsappNaTela("5547988261551")).toBe("(47) 98826-1551")
    expect(whatsappNaTela("554733221100")).toBe("(47) 3322-1100")
    expect(whatsappNaTela(null)).toBe("")
    const c: Configuracoes = {
      ...PADRAO,
      empresa: { razaoSocial: "Barba Forte LTDA", cnpj: null, endereco: null },
      atendimento: {
        whatsapp: "5547988261551",
        email: null,
        horario: ["Seg a sex"],
        prazoDePostagem: null,
      },
    }
    const f = formularioDaEmpresa(c)
    expect(f).toMatchObject({
      razaoSocial: "Barba Forte LTDA",
      whatsapp: "(47) 98826-1551",
      horario: "Seg a sex",
    })
    expect(camposEmBranco(f)).toEqual(["CNPJ", "endereço", "e-mail", "prazo de postagem"])
  })
})

describe("o frete", () => {
  const gratis = {
    modo: "gratis" as const,
    piso: 149.9,
    alvo: "mais-barata" as const,
    tetoDeCusto: 40,
  }

  it("a promoção: grátis e fixo com os valores em reais; o teto que já estava fica", () => {
    expect(lerFrete({ modo: "gratis", piso: "R$ 199,90", alvo: "todas" }, gratis)).toEqual({
      ok: true,
      valor: { modo: "gratis", piso: 199.9, alvo: "todas", tetoDeCusto: 40 },
    })
    expect(lerFrete({ modo: "fixo", piso: "99", preco: "9,90" }, { modo: "nenhuma" })).toEqual({
      ok: true,
      valor: { modo: "fixo", piso: 99, preco: 9.9, alvo: "mais-barata", tetoDeCusto: null },
    })
    expect(lerFrete({ modo: "nenhuma", piso: "x" }, gratis)).toEqual({
      ok: true,
      valor: { modo: "nenhuma" },
    })
  })

  it("o que falta, campo a campo", () => {
    const semPiso = lerFrete({ modo: "gratis", piso: "" }, gratis)
    expect(!semPiso.ok && Object.keys(semPiso.erros)).toEqual(["piso"])
    const semPreco = lerFrete({ modo: "fixo", piso: "99", preco: "0" }, gratis)
    expect(!semPreco.ok && Object.keys(semPreco.erros)).toEqual(["preco"])
    const semModo = lerFrete({}, gratis)
    expect(!semModo.ok && semModo.erros.modo).toBe("Escolha a promoção.")
  })

  it("a emergência: em branco não vende; com preço, o prazo é obrigatório", () => {
    expect(lerEmergencia({ preco: "", prazo: "" })).toEqual({
      ok: true,
      valor: { precoDeEmergencia: null, prazoDeEmergencia: null },
    })
    expect(lerEmergencia({ preco: "24,90", prazo: "7 dias úteis" })).toEqual({
      ok: true,
      valor: { precoDeEmergencia: 24.9, prazoDeEmergencia: "7 dias úteis" },
    })
    const semPrazo = lerEmergencia({ preco: "24,90" })
    expect(!semPrazo.ok && Object.keys(semPrazo.erros)).toEqual(["prazo"])
  })

  it("a regra em frase", () => {
    expect(semEspaco(freteEmFrase(gratis))).toBe(
      "Frete grátis a partir de R$ 149,90 em produtos, na opção mais barata."
    )
    expect(
      semEspaco(
        freteEmFrase({ modo: "fixo", piso: 99, preco: 9.9, alvo: "todas", tetoDeCusto: null })
      )
    ).toBe("Frete de R$ 9,90 a partir de R$ 99,00 em produtos, em todas as opções.")
    expect(freteEmFrase({ modo: "nenhuma" })).toBe(
      "Sem promoção: quem compra paga o frete da cotação."
    )
  })

  it("a janela da nota: só as da tela", () => {
    expect([0, 5, 15, 30, 60, 120, 240].every(ehJanela)).toBe(true)
    expect(ehJanela(10)).toBe(false)
    expect(ehJanela("5")).toBe(false)
  })
})

describe("pra quem vai o aviso da equipe", () => {
  const membros: MembroParaAviso[] = [
    { nome: "Ana", email: "Ana@loja.com", papel: "dono", situacao: "ativo" },
    { nome: "Bruno", email: "bruno@loja.com", papel: "operacao", situacao: "ativo" },
    { nome: "Caio", email: "caio@loja.com", papel: "operacao", situacao: "convidado" },
    { nome: "Duda", email: "duda@loja.com", papel: "marketing", situacao: "ativo" },
  ]

  it("pro papel que resolve (só quem está ativo), sem repetir", () => {
    expect(destinatarios(["operacao", "dono"], membros, [])).toEqual({
      emails: ["ana@loja.com", "bruno@loja.com"],
      quem: "Ana (dono), Bruno (operação)",
    })
    expect(destinatarios(["dono"], membros, ["admin@loja.com"]).emails).toEqual(["ana@loja.com"])
  })

  it("sem ninguém do papel, o dono; sem ninguém no painel, os usuários do admin", () => {
    const soDono = membros.filter((m) => m.papel === "dono")
    expect(destinatarios(["operacao"], soDono, [])).toEqual({
      emails: ["ana@loja.com"],
      quem: "Ana (dono: ninguém do papel ainda)",
    })
    expect(destinatarios(["operacao", "dono"], [], ["admin@loja.com", "admin@loja.com"])).toEqual({
      emails: ["admin@loja.com"],
      quem: "os usuários do admin do Medusa (ninguém no painel ainda)",
    })
  })

  it("a nota vai pra operação e o dono; o Bling e o estorno, pro dono", () => {
    expect(AVISOS_DA_EQUIPE.map((a) => [a.nome, a.papeis.join("+")])).toEqual([
      ["A nota do pedido não saiu", "operacao+dono"],
      ["Confira a nota do pedido", "operacao+dono"],
      ["Cancele a nota (ou o pedido) no Bling", "operacao+dono"],
      ["A conexão com o Bling caiu", "dono"],
      ["O estorno do pedido não saiu", "dono"],
    ])
  })
})

describe("a tela", () => {
  const dados = (extra: Partial<DadosDasConfiguracoes> = {}): DadosDasConfiguracoes => ({
    configuracoes: {
      ...PADRAO,
      frete: { modo: "gratis", piso: 149.9, alvo: "mais-barata", tetoDeCusto: null },
      cotacao: { precoDeEmergencia: 20, prazoDeEmergencia: "7 dias úteis" },
    },
    pagamento: {
      configurado: true,
      pixMinutos: 30,
      parcelas: 3,
      parcelaMinima: 5,
      estornos: { horas: 6, tentativas: 8 },
    },
    erp: {
      nome: "Bling",
      configurado: true,
      conectado: true,
      conectadoEm: "2026-09-23T15:00:00Z",
      queda: null,
      janela: 5,
    },
    pendencias: [],
    entrega: { cotacao: true, painel: false },
    membros: [{ nome: "Ana", email: "ana@loja.com", papel: "dono", situacao: "ativo" }],
    usuariosDoAdmin: [],
    remetente: "FuckingBarba <nao-responda@fuckingbarba.com.br>",
    ...extra,
  })

  it("cada aba com o que está gravado, em frase", () => {
    const t = telaDasConfiguracoes(dados())
    expect(t.empresa.emBranco).toHaveLength(7)
    expect(t.frete).toMatchObject({
      modo: "gratis",
      piso: "149,90",
      preco: "",
      alvo: "mais-barata",
      emergencia: { preco: "20,00", prazo: "7 dias úteis" },
    })
    expect(semEspaco(t.frete.frase)).toBe(
      "Frete grátis a partir de R$ 149,90 em produtos, na opção mais barata."
    )
    expect(t.pagamento.map((l) => l.titulo)).toEqual(["Pagar.me", "Pix", "Cartão", "Estornos"])
    expect(semEspaco(t.pagamento[2].texto)).toMatch(
      /^Até 3x sem juros, parcela mínima de R\$ 5,00\./
    )
    expect(t.pagamento[3].texto).toMatch(/pedido de novo de 6 em 6 horas, até 8 vezes\.$/)
    expect(t.nota.erp.desde).toBe("Conectado em 23/09/2026 · estoque copiado de 5 em 5 minutos")
    expect(t.nota.janela).toBe(5)
    expect(t.nota.janelas.map((j) => j.minutos)).toEqual([0, 5, 15, 30, 60, 120, 240])
    // A janela gravada pela API, fora da lista, aparece marcada no fim.
    const outra = telaDasConfiguracoes(dados({ erp: { ...dados().erp, janela: 45 } }))
    expect(outra.nota.janelas.at(-1)).toEqual({ minutos: 45, nome: "45 min" })
    expect(t.entrega.map((l) => l.ligado)).toEqual([true, false, true])
    expect(t.emails.cliente.find((e) => e.nome === "Carrinho abandonado")?.saindo).toBe(false)
    expect(t.emails.remetente).toBe("nao-responda@fuckingbarba.com.br")
    expect(telaDasConfiguracoes(dados({ remetente: "loja@x.com" })).emails.remetente).toBe(
      "loja@x.com"
    )
    // A nota também é do dono: a Ana recebe direto, mesmo sem ninguém da operação.
    expect(t.emails.equipe[0].quem).toBe("Ana (dono)")
    expect(t.emails.equipe[4].quem).toBe("Ana (dono)")
  })
})

describe("as pendências da nota", () => {
  it("as do ERP em frase, e as que esperam a janela depois", () => {
    const agora = new Date("2026-09-25T21:00:00-03:00")
    const l = pendenciasEmFrase(
      [
        {
          pedidoId: "order_1",
          referencia: "FB-1042",
          tipo: "rejeitada",
          detalhe: "Rejeição 778: NCM inexistente",
          prazo: null,
        },
        {
          pedidoId: "order_2",
          referencia: "FB-1043",
          tipo: "cancelar",
          detalhe: "NF-e nº 12, série 1",
          prazo: "2026-09-26T20:00:00-03:00",
        },
      ],
      [{ pedidoId: "order_3", referencia: "FB-1044", notaEm: "2026-09-25T21:13:00-03:00" }],
      agora
    )
    // O que tem prazo na SEFAZ vem antes, mesmo tendo chegado depois.
    expect(l).toEqual([
      {
        pedidoId: "order_2",
        numero: 1043,
        titulo: "FB-1043 — cancelar a nota no Bling",
        texto:
          "NF-e nº 12, série 1. O pedido foi cancelado depois de a nota sair. A SEFAZ aceita o cancelamento até 26/09, 20:00.",
      },
      {
        pedidoId: "order_1",
        numero: 1042,
        titulo: "FB-1042 — nota rejeitada",
        texto:
          "Rejeição 778: NCM inexistente. Corrija no Bling e reenvie por lá — a loja percebe sozinha.",
      },
      {
        pedidoId: "order_3",
        numero: 1044,
        titulo: "FB-1044 — esperando a janela",
        texto: "Sai às 21:13. Dá pra emitir antes, no pedido.",
      },
    ])
  })

  const tentando = (n: number, detalhe: string, prazo: string) =>
    Array.from({ length: n }, (_, i) => ({
      pedidoId: `order_t${i}`,
      referencia: `FB-${2000 - i}`,
      tipo: "tentando" as const,
      detalhe,
      prazo,
    }))

  it("com o Bling fora do ar, as notas da mesma queda viram uma linha só", () => {
    const agora = new Date("2026-09-25T16:00:00-03:00")
    const l = pendenciasEmFrase(
      [
        ...tentando(40, "O Bling não atendeu", "2026-09-25T16:19:00-03:00"),
        ...tentando(2, "Falta a permissão de notas no app", "2026-09-25T16:30:00-03:00").map(
          (p, i) => ({ ...p, pedidoId: `order_p${i}`, referencia: `FB-${3000 + i}` })
        ),
        {
          pedidoId: "order_r",
          referencia: "FB-1990",
          tipo: "rejeitada" as const,
          detalhe: "Rejeição 778",
          prazo: null,
        },
      ],
      [],
      agora
    )
    // A rejeitada precisa de alguém: primeiro. As 2 da outra razão, uma por uma. As 40, juntas.
    expect(l.map((p) => p.titulo)).toEqual([
      "FB-1990 — nota rejeitada",
      "FB-3000 — a nota ainda não saiu",
      "FB-3001 — a nota ainda não saiu",
      "40 notas ainda não saíram",
    ])
    expect(l[3]).toEqual({
      pedidoId: null,
      numero: 0,
      titulo: "40 notas ainda não saíram",
      texto:
        "FB-2000, FB-1999, FB-1998 e mais 37. O Bling não atendeu. A loja segue tentando sozinha — de novo hoje, 16:19.",
    })
    // A hora que já passou não aparece: a varredura atrasada tenta na próxima volta.
    const depois = pendenciasEmFrase(
      tentando(5, "O Bling não atendeu", "2026-09-25T16:19:00-03:00"),
      [],
      new Date("2026-09-25T16:30:00-03:00")
    )
    expect(depois[0].texto).toBe(
      "FB-2000, FB-1999, FB-1998 e mais 2. O Bling não atendeu. A loja segue tentando sozinha."
    )
  })

  it("a tela tem teto: o resto vira “e mais N”, com a lista inteira no admin", () => {
    const agora = new Date("2026-09-25T16:00:00-03:00")
    const rejeitadas = Array.from({ length: 35 }, (_, i) => ({
      pedidoId: `order_${i}`,
      referencia: `FB-${1000 + i}`,
      tipo: "rejeitada" as const,
      detalhe: null,
      prazo: null,
    }))
    const l = pendenciasEmFrase(rejeitadas, [], agora)
    expect(l).toHaveLength(MAX_PENDENCIAS)
    expect(l[MAX_PENDENCIAS - 2].titulo).toBe("FB-1028 — nota rejeitada")
    expect(l[MAX_PENDENCIAS - 1]).toEqual({
      pedidoId: null,
      numero: 0,
      titulo: "E mais 6 pendências",
      texto: "A lista inteira está no admin, na tela do Bling.",
    })
    // No teto exato, nada some.
    expect(pendenciasEmFrase(rejeitadas.slice(0, MAX_PENDENCIAS), [], agora)).toHaveLength(
      MAX_PENDENCIAS
    )
  })
})
