import { createHmac } from "node:crypto"
import {
  assinaturaConfere,
  credenciaisDoWhatsapp,
  desafioDaVerificacao,
  enviarTexto,
  ErroDaMeta,
  lerAvisoDaMeta,
} from "../meta"

/**
 * O WhatsApp pela Cloud API da Meta: o aviso que chega (as mensagens e as
 * situações), a assinatura, a verificação do webhook e o envio.
 */

const NUMERO = "100000000000001"
const AGORA = new Date("2026-10-01T15:00:00Z")

function aviso(valor: Record<string, unknown>, numero = NUMERO) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "200000000000002",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "5500000000000", phone_number_id: numero },
              ...valor,
            },
          },
        ],
      },
    ],
  }
}

const contato = { profile: { name: "Rafael Souza" }, wa_id: "5547999990000" }
const msg = (extra: Record<string, unknown>) => ({
  from: "5547999990000",
  id: `wamid.${Math.random().toString(36).slice(2)}`,
  timestamp: "1759330800",
  ...extra,
})

describe("o aviso que chega", () => {
  it("lê o texto, com o nome do perfil e a hora da Meta", () => {
    const a = lerAvisoDaMeta(
      aviso({ contacts: [contato], messages: [msg({ type: "text", text: { body: " Oi! " } })] }),
      NUMERO,
      AGORA
    )
    expect(a.mensagens).toHaveLength(1)
    expect(a.mensagens[0]).toMatchObject({
      telefone: "5547999990000",
      nome: "Rafael Souza",
      tipo: "texto",
      texto: "Oi!",
    })
    expect(a.mensagens[0].em.toISOString()).toBe("2025-10-01T15:00:00.000Z")
  })

  it("o botão, a lista, a foto com legenda, o áudio, a figurinha e o que o WhatsApp não mostra", () => {
    const a = lerAvisoDaMeta(
      aviso({
        messages: [
          msg({ type: "button", button: { text: "Quero ver", payload: "x" } }),
          msg({
            type: "interactive",
            interactive: { type: "list_reply", list_reply: { id: "1", title: "Barba" } },
          }),
          msg({ type: "image", image: { caption: "isso aqui serve?", id: "m1" } }),
          msg({ type: "audio", audio: { id: "m2", voice: true } }),
          msg({ type: "sticker", sticker: { id: "m3" } }),
          msg({ type: "unsupported", errors: [{ code: 131051 }] }),
        ],
      }),
      NUMERO,
      AGORA
    )
    expect(a.mensagens.map((m) => [m.tipo, m.texto])).toEqual([
      ["botao", "Quero ver"],
      ["botao", "Barba"],
      ["imagem", "isso aqui serve?"],
      ["audio", null],
      ["figurinha", null],
      ["outro", null],
    ])
  })

  it("a reação e os avisos do sistema não viram mensagem", () => {
    const a = lerAvisoDaMeta(
      aviso({
        messages: [
          msg({ type: "reaction", reaction: { message_id: "wamid.x", emoji: "👍" } }),
          msg({ type: "system", system: { body: "trocou de número" } }),
        ],
      }),
      NUMERO,
      AGORA
    )
    expect(a.mensagens).toEqual([])
  })

  it("o aviso de outro número do app (o de teste da Meta) fica de fora", () => {
    const a = lerAvisoDaMeta(
      aviso({ messages: [msg({ type: "text", text: { body: "oi" } })] }, "999"),
      NUMERO,
      AGORA
    )
    expect(a.mensagens).toEqual([])
    expect(a.deOutroNumero).toBe(1)
  })

  it("as situações: enviada, entregue, lida e a que falhou, com o erro", () => {
    const a = lerAvisoDaMeta(
      aviso({
        statuses: [
          { id: "w1", status: "sent", timestamp: "1759330800", recipient_id: "5547999990000" },
          { id: "w2", status: "delivered", timestamp: "1759330801" },
          { id: "w3", status: "read", timestamp: "1759330802" },
          {
            id: "w4",
            status: "failed",
            timestamp: "1759330803",
            errors: [
              {
                code: 131047,
                title: "Re-engagement message",
                error_data: { details: "Message failed to send because more than 24 hours" },
              },
            ],
          },
          { id: "w5", status: "deleted", timestamp: "1759330804" },
        ],
      }),
      NUMERO,
      AGORA
    )
    expect(a.situacoes.map((s) => [s.wamid, s.situacao])).toEqual([
      ["w1", "enviada"],
      ["w2", "entregue"],
      ["w3", "lida"],
      ["w4", "falhou"],
    ])
    expect(a.situacoes[3].erro).toBe(
      "131047 — Re-engagement message — Message failed to send because more than 24 hours"
    )
  })

  it("o que vem torto é pulado, sem derrubar o resto", () => {
    expect(lerAvisoDaMeta(null, NUMERO).mensagens).toEqual([])
    expect(lerAvisoDaMeta({ entry: "x" }, NUMERO).mensagens).toEqual([])
    const a = lerAvisoDaMeta(
      aviso({
        messages: [
          { type: "text", text: { body: "sem remetente" }, id: "w1" },
          msg({ type: "text", text: { body: "boa" } }),
        ],
      }),
      NUMERO,
      AGORA
    )
    expect(a.mensagens.map((m) => m.texto)).toEqual(["boa"])
  })
})

describe("a assinatura da Meta", () => {
  const corpo = JSON.stringify(aviso({ messages: [] }))
  const assinar = (c: string, segredo = "segredo-do-app") =>
    `sha256=${createHmac("sha256", segredo).update(c, "utf8").digest("hex")}`

  it("confere a certa, e só ela", () => {
    expect(
      assinaturaConfere({ assinatura: assinar(corpo), corpo, segredo: "segredo-do-app" })
    ).toBe(true)
    expect(
      assinaturaConfere({ assinatura: assinar(corpo, "outro"), corpo, segredo: "segredo-do-app" })
    ).toBe(false)
    expect(
      assinaturaConfere({
        assinatura: assinar(corpo),
        corpo: `${corpo} `,
        segredo: "segredo-do-app",
      })
    ).toBe(false)
  })

  it("sem segredo, sem cabeçalho ou com formato torto, nada confere", () => {
    expect(assinaturaConfere({ assinatura: assinar(corpo), corpo, segredo: undefined })).toBe(false)
    expect(assinaturaConfere({ assinatura: undefined, corpo, segredo: "segredo-do-app" })).toBe(
      false
    )
    expect(assinaturaConfere({ assinatura: "sha1=abc", corpo, segredo: "segredo-do-app" })).toBe(
      false
    )
    expect(assinaturaConfere({ assinatura: "sha256=zz", corpo, segredo: "segredo-do-app" })).toBe(
      false
    )
  })
})

describe("o Verificar e salvar", () => {
  const query = {
    "hub.mode": "subscribe",
    "hub.verify_token": "senha-longa",
    "hub.challenge": "123",
  }

  it("devolve o desafio só com a senha certa", () => {
    expect(desafioDaVerificacao(query, "senha-longa")).toBe("123")
    expect(
      desafioDaVerificacao({ ...query, "hub.verify_token": "outra" }, "senha-longa")
    ).toBeNull()
    expect(desafioDaVerificacao({ ...query, "hub.mode": "unsubscribe" }, "senha-longa")).toBeNull()
    expect(desafioDaVerificacao(query, undefined)).toBeNull()
  })
})

describe("mandar", () => {
  const cred = { numeroId: NUMERO, token: "token-de-teste", base: "http://127.0.0.1:4380" }
  const original = global.fetch
  afterEach(() => {
    global.fetch = original
  })

  it("as credenciais vêm do Railway, ou não vêm", () => {
    expect(credenciaisDoWhatsapp({ WHATSAPP_NUMERO_ID: "1", WHATSAPP_TOKEN: "t" })).toEqual({
      numeroId: "1",
      token: "t",
      base: "https://graph.facebook.com",
    })
    expect(credenciaisDoWhatsapp({ WHATSAPP_NUMERO_ID: "1" })).toBeNull()
    expect(
      credenciaisDoWhatsapp({
        WHATSAPP_NUMERO_ID: "1",
        WHATSAPP_TOKEN: "t",
        WHATSAPP_URL: "http://127.0.0.1:4380/",
      })?.base
    ).toBe("http://127.0.0.1:4380")
  })

  it("manda o texto com a prévia do link e devolve o wamid", async () => {
    const pedidos: { url: string; init: RequestInit }[] = []
    global.fetch = (async (url: string, init: RequestInit) => {
      pedidos.push({ url, init })
      return new Response(JSON.stringify({ messages: [{ id: "wamid.SAIU" }] }), { status: 200 })
    }) as typeof fetch
    expect(await enviarTexto(cred, "5547999990000", "Oi!")).toEqual({ wamid: "wamid.SAIU" })
    expect(pedidos[0].url).toBe(`http://127.0.0.1:4380/v26.0/${NUMERO}/messages`)
    expect((pedidos[0].init.headers as Record<string, string>).authorization).toBe(
      "Bearer token-de-teste"
    )
    expect(JSON.parse(String(pedidos[0].init.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5547999990000",
      type: "text",
      text: { body: "Oi!", preview_url: true },
    })
  })

  it("a recusa da Meta vira ErroDaMeta, com o código dela", async () => {
    global.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: "Re-engagement message", code: 131047 } }), {
        status: 400,
      })) as typeof fetch
    const erro = await enviarTexto(cred, "5547999990000", "Oi!").catch((e) => e)
    expect(erro).toBeInstanceOf(ErroDaMeta)
    expect(erro.codigo).toBe(131047)
  })
})
