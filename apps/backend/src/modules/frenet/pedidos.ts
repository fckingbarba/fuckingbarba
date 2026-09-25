import { createHmac } from "node:crypto"
import { texto, type PedidoParaOParceiro, type RegistroNoParceiro } from "../../lib/envios/parceiro"
import { MINIMO } from "./client"

/**
 * O PEDIDO PAGO NO PAINEL DA FRENET — a API de pedidos deles.
 *
 *   POST https://whitelabel.frenet.com.br/v1/orders
 *   cabeçalhos: token (o da loja, FRENET_TOKEN)
 *               x-partner-token (o de parceiro, FRENET_PARCEIRO_TOKEN)
 *
 * É o que a Nuvemshop faz hoje: o pedido pago aparece no painel da Frenet
 * com endereço, itens e o serviço que o cliente escolheu, e quem despacha só
 * gera a etiqueta. E, como entrou pela API de uma plataforma, a postagem
 * AVISA (o webhook "Atualização de Tracking", em `rastreio.ts`): o pedido
 * vira "enviado" sozinho, e o cliente recebe o e-mail "a caminho". Quem
 * decide quando mandar é `lib/envios/registro.ts`; aqui é só o formato deles.
 *
 * ┌─ DESLIGADO ATÉ O TOKEN DE PARCEIRO CHEGAR ─────────────────────────────┐
 * │ A API de pedidos exige, além do token da loja, o de PARCEIRO, que a    │
 * │ Frenet só entrega depois da homologação. Sem o `FRENET_PARCEIRO_TOKEN` │
 * │ no Railway, `registraPedidos()` diz não e nada daqui roda — nem no     │
 * │ pagamento, nem na varredura.                                           │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O REMETENTE É O DA CONTA (`UseFrenetRegistration`): o endereço de coleta
 * cadastrado no painel da Frenet. A loja não repete aqui o que já está lá.
 *
 * A CAIXA É UM PALPITE, que quem despacha corrige no painel se precisar: o
 * peso é a soma do que as variantes têm cadastrado (o mesmo da cotação), e
 * as medidas são as dos produtos empilhados — o maior comprimento, a maior
 * largura, a soma das alturas —, nunca menores que o mínimo dos Correios.
 * Medida que falta no cadastro não é inventada: o item vai sem ela.
 *
 * ┌─ CADA PEDIDO LEVA O ENDEREÇO DO AVISO, ASSINADO ───────────────────────┐
 * │ O webhook de rastreio cadastrado na conta vale "pros pedidos da        │
 * │ plataforma" — e se a plataforma da loja, com o token de parceiro, vai  │
 * │ ser a mesma daquele cadastro, só a homologação diz. Pra não depender   │
 * │ disso, cada pedido leva o `TrackingNotificationUrl` (o aviso DESTE     │
 * │ pedido, da documentação deles): `…/hooks/envio/frenet?pedido=FB-1042   │
 * │ &assinatura=…`.                                                        │
 * │                                                                        │
 * │ A assinatura é do `FRENET_WEBHOOK_TOKEN`, mas presa ao pedido          │
 * │ (`assinaturaDoAviso`): a chave da porta não vai no endereço, e quem    │
 * │ ler um endereço desses num log só consegue falar daquele pedido — o    │
 * │ `rastreio.ts` recusa aviso de outro. Sem `MEDUSA_BACKEND_URL` (o       │
 * │ endereço público da API), o pedido vai sem, e vale o da conta.         │
 * └────────────────────────────────────────────────────────────────────────┘
 */

const ORIGEM = "https://whitelabel.frenet.com.br"

/** `FRENET_WHITELABEL_URL` é só pro conferidor, que aponta pra Frenet falsa. */
const endereco = (caminho: string) =>
  new URL(caminho, process.env.FRENET_WHITELABEL_URL || ORIGEM).toString()

const PRAZO_MS = 15_000

export const registraPedidos = () =>
  Boolean(process.env.FRENET_TOKEN && process.env.FRENET_PARCEIRO_TOKEN)

/** A assinatura do aviso de UM pedido — a conta é conferida em `rastreio.ts`. */
export const assinaturaDoAviso = (referencia: string, segredo: string) =>
  createHmac("sha256", segredo).update(`aviso:frenet:${referencia}`).digest("hex")

/** O endereço do aviso deste pedido, ou `null` sem o endereço público da API ou sem a chave. */
export function urlDoAviso(referencia: string): string | null {
  const base = (process.env.MEDUSA_BACKEND_URL ?? "").trim().replace(/\/+$/, "")
  const segredo = process.env.FRENET_WEBHOOK_TOKEN ?? ""
  if (!/^https?:\/\/[^/]/.test(base) || !segredo) return null
  const url = new URL(`${base}/hooks/envio/frenet`)
  url.searchParams.set("pedido", referencia)
  url.searchParams.set("assinatura", assinaturaDoAviso(referencia, segredo))
  return url.toString()
}

/* ── o corpo ──────────────────────────────────────────────────────────────── */

const kg = (gramas: number) => Number((gramas / 1000).toFixed(3))
const umaCasa = (cm: number) => Math.round(cm * 10) / 10
const centavos = (reais: number) => Math.round(reais * 100) / 100

/** Só o que o cadastro tem: medida zerada fica de fora, em vez de ir como zero. */
const seTiver = <K extends string>(chave: K, v: number) =>
  (v > 0 ? { [chave]: v } : {}) as Partial<Record<K, number>>

/** A caixa do pedido: os produtos empilhados, nunca menor que o mínimo dos Correios. */
export function caixaDoPedido(itens: PedidoParaOParceiro["itens"]) {
  const gramas = itens.reduce((s, i) => s + i.pesoEmGramas * i.quantidade, 0)
  return {
    ...seTiver("Weight", kg(gramas)),
    Length: umaCasa(Math.max(MINIMO.comprimento, ...itens.map((i) => i.comprimento))),
    Width: umaCasa(Math.max(MINIMO.largura, ...itens.map((i) => i.largura))),
    Height: umaCasa(
      Math.max(
        MINIMO.altura,
        itens.reduce((s, i) => s + i.altura * i.quantidade, 0)
      )
    ),
  }
}

/** Celular brasileiro: DDD + 9 + oito dígitos. */
const ehCelular = (telefone: string) => /^\d{2}9\d{8}$/.test(telefone)

export function corpoDoPedido(
  p: PedidoParaOParceiro,
  { aviso = null }: { aviso?: string | null } = {}
) {
  const d = p.destinatario
  const e = d.endereco
  return [
    {
      ...(aviso ? { TrackingNotificationUrl: aviso } : {}),
      Order: {
        Id: p.referencia,
        Value: centavos(p.total),
        Created: p.criadoEm,
        UseFrenetRegistration: true,
        ...(p.nota
          ? {
              Invoice: {
                Number: p.nota.numero,
                ...(p.nota.serie ? { Series: p.nota.serie } : {}),
                Key: p.nota.chave,
                ...(p.nota.valor !== null ? { Value: centavos(p.nota.valor) } : {}),
                ...(p.nota.emitidaEm ? { Date: p.nota.emitidaEm } : {}),
              },
            }
          : {}),
        Items: p.itens.map((i) => ({
          OrderId: p.referencia,
          ItemId: i.id,
          ...(i.produtoId ? { ProductId: i.produtoId } : {}),
          ...(i.sku ? { SKU: i.sku } : {}),
          ProductName: i.nome,
          Quantity: i.quantidade,
          Price: centavos(i.preco),
          ...seTiver("Weight", kg(i.pesoEmGramas)),
          ...seTiver("Length", umaCasa(i.comprimento)),
          ...seTiver("Width", umaCasa(i.largura)),
          ...seTiver("Height", umaCasa(i.altura)),
        })),
        To: {
          Name: d.nome,
          ...(p.email ? { Email: p.email } : {}),
          ...(d.telefone ? { Phone: d.telefone } : {}),
          ...(d.telefone && ehCelular(d.telefone) ? { Cellphone: d.telefone } : {}),
          ...(d.documento ? { Document: d.documento } : {}),
          Address: {
            ZipCode: e.cep,
            City: e.cidade,
            Street: e.rua,
            AddressNumber: e.numero,
            ...(e.complemento ? { AddressComplement: e.complemento } : {}),
            AddressQuarter: e.bairro,
            AddressState: e.uf,
            Country: "BR",
          },
        },
      },
      /*
        UM volume, e OBJETO, não lista: no esquema da documentação deles
        (`ShipmentBase.Volumes` → `Volume`, em "Inserir pedidos na Frenet").
        A lista com um volume dentro a Frenet recusava com 400 antes de ler o
        pedido — foi o #19, o primeiro de verdade (25/09).
      */
      Volumes: {
        ...caixaDoPedido(p.itens),
        Price: centavos(p.valorDosProdutos),
        DeclaredValue: centavos(p.valorDosProdutos),
        OrderItemsId: p.itens.map((i) => i.id),
      },
      ...(p.servico
        ? {
            Quotation: {
              ShippingServiceCode: p.servico.codigo,
              ...(p.servico.nome ? { ShippingServiceName: p.servico.nome } : {}),
              ...(p.servico.transportadora ? { Carrier: p.servico.transportadora } : {}),
              PlatformShippingPrice: centavos(p.frete),
            },
          }
        : {}),
    },
  ]
}

/* ── a resposta ───────────────────────────────────────────────────────────── */

/**
 * A chave em qualquer caixa. A documentação mostra as duas: o erro em
 * `Message`/`Details`, e a resposta do lote em `statusBatch`/`items`/
 * `shipmentId` (o JSON do ASP.NET, deles, sai em camelCase). Lendo só uma, o
 * pedido que ENTROU parecia não ter entrado — e a varredura mandaria de novo.
 */
function campo(o: unknown, nome: string): unknown {
  if (!o || typeof o !== "object" || Array.isArray(o)) return undefined
  const alvo = nome.toLowerCase()
  const chave = Object.keys(o).find((k) => k.toLowerCase() === alvo)
  return chave === undefined ? undefined : (o as Record<string, unknown>)[chave]
}

const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/**
 * O porquê do erro, numa linha — e nunca "sem motivo" se a Frenet disse
 * alguma coisa:
 * - `{Message, Details: [{Code, Message}]}`: o erro da documentação;
 * - `{title, errors: {"$[0].Volumes": ["…"]}}`: a validação do ASP.NET, que
 *   recusa o corpo antes de o código deles ler (foi o caso do #19, que ficou
 *   "sem motivo na resposta" porque só a primeira forma era lida);
 * - o que vier fora disso: o começo da resposta crua.
 */
function motivoDoErro(corpo: unknown, bruto = ""): string | null {
  const detalhes = lista(campo(corpo, "Details")).map((d) => texto(campo(d, "Message")))
  const erros = campo(corpo, "errors")
  const deValidacao =
    erros && typeof erros === "object" && !Array.isArray(erros)
      ? Object.entries(erros).flatMap(([onde, msgs]) =>
          (Array.isArray(msgs) ? msgs : [msgs]).map((m) =>
            texto(m) ? `${onde}: ${texto(m)}` : null
          )
        )
      : lista(erros).map((e) => texto(campo(e, "Message")) ?? texto(e))
  const partes = [
    texto(campo(corpo, "Message")),
    texto(campo(corpo, "title")),
    ...detalhes,
    ...deValidacao,
  ].filter((v): v is string => Boolean(v))
  if (partes.length) return [...new Set(partes)].join(" — ").slice(0, 500)
  return texto(bruto, 300)
}

/**
 * A resposta da Frenet → registrado ou não, e se adianta insistir.
 *
 * DEFINITIVO é a Frenet ter lido o pedido e recusado (400, ou erro no item
 * do lote): mandar de novo o mesmo pedido dá o mesmo não. Token recusado,
 * Frenet fora e tempo esgotado não são — a varredura tenta de novo.
 */
export function lerResposta(
  status: number,
  corpo: unknown,
  referencia: string,
  bruto = ""
): RegistroNoParceiro {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      motivo: `a Frenet recusou os tokens (${status}) — confira FRENET_TOKEN e FRENET_PARCEIRO_TOKEN`,
      definitivo: false,
    }
  }
  const motivo = motivoDoErro(corpo, bruto)
  if (status === 400) {
    return {
      ok: false,
      motivo: `a Frenet recusou o pedido: ${motivo ?? "sem motivo na resposta"}`,
      definitivo: true,
    }
  }
  if (status < 200 || status >= 300) {
    return {
      ok: false,
      motivo: `a Frenet respondeu ${status}${motivo ? `: ${motivo}` : ""}`,
      definitivo: false,
    }
  }

  const itens = lista(campo(corpo, "Items"))
  const item = itens.find((i) => texto(campo(i, "OrderId")) === referencia) ?? itens[0]
  const erros = lista(campo(item, "Errors"))
    .map((e) => texto(campo(e, "Message")))
    .filter((m): m is string => Boolean(m))
  if (erros.length) {
    return {
      ok: false,
      motivo: `a Frenet recusou o pedido: ${erros.join(" — ")}`,
      definitivo: true,
    }
  }
  const id = texto(campo(item, "ShipmentId"), 40)
  if (id && id !== "0") return { ok: true, idNoParceiro: id }
  if (texto(campo(corpo, "StatusBatch"))?.toLowerCase() === "erro") {
    return { ok: false, motivo: "a Frenet recusou o lote, sem dizer por quê", definitivo: true }
  }
  return { ok: false, motivo: "a Frenet respondeu sem o id do envio", definitivo: false }
}

/* ── as chamadas ──────────────────────────────────────────────────────────── */

/** `bruto` é o texto da resposta, pro motivo que não vem em JSON (`motivoDoErro`). */
type Resposta = { status: number; corpo: unknown; bruto: string } | { falhou: string }

async function chamar(
  metodo: "POST" | "DELETE",
  caminho: string,
  corpo?: unknown
): Promise<Resposta> {
  const desistir = new AbortController()
  const relogio = setTimeout(() => desistir.abort(), PRAZO_MS)
  try {
    const r = await fetch(endereco(caminho), {
      method: metodo,
      headers: {
        token: process.env.FRENET_TOKEN ?? "",
        "x-partner-token": process.env.FRENET_PARCEIRO_TOKEN ?? "",
        accept: "application/json",
        ...(corpo === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      signal: desistir.signal,
    })
    const bruto = await r.text()
    let lido: unknown = null
    try {
      lido = bruto ? JSON.parse(bruto) : null
    } catch {
      lido = null
    }
    return { status: r.status, corpo: lido, bruto }
  } catch (e) {
    return {
      falhou: desistir.signal.aborted
        ? "a Frenet não respondeu a tempo"
        : `a Frenet não atendeu (${e instanceof Error ? e.message : String(e)})`,
    }
  } finally {
    clearTimeout(relogio)
  }
}

export async function registrarPedido(p: PedidoParaOParceiro): Promise<RegistroNoParceiro> {
  if (!registraPedidos()) {
    return { ok: false, motivo: "sem FRENET_TOKEN ou FRENET_PARCEIRO_TOKEN", definitivo: false }
  }
  const r = await chamar(
    "POST",
    "/v1/orders",
    corpoDoPedido(p, { aviso: urlDoAviso(p.referencia) })
  )
  if ("falhou" in r) return { ok: false, motivo: r.falhou, definitivo: false }
  return lerResposta(r.status, r.corpo, p.referencia, r.bruto)
}

/**
 * Tira do painel o pedido cancelado: primeiro CANCELA o envio (com etiqueta
 * paga, é o que devolve o valor dela à carteira), e, se a Frenet não
 * cancelar, APAGA (o pedido que ainda não tem etiqueta). Pacote já postado
 * não sai por aqui — aí é com quem despacha, e o log diz qual.
 */
export async function tirarPedido(
  idNoParceiro: string
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!registraPedidos()) return { ok: false, motivo: "sem FRENET_TOKEN ou FRENET_PARCEIRO_TOKEN" }
  const id = encodeURIComponent(idNoParceiro)
  const falha = (r: Resposta) =>
    "falhou" in r
      ? r.falhou
      : `${r.status}${motivoDoErro(r.corpo, r.bruto) ? ` (${motivoDoErro(r.corpo, r.bruto)})` : ""}`

  const cancelar = await chamar("POST", `/v1/shipments/${id}/cancel`)
  if (!("falhou" in cancelar) && cancelar.status >= 200 && cancelar.status < 300)
    return { ok: true }
  const apagar = await chamar("DELETE", `/v1/shipments/${id}`)
  if (!("falhou" in apagar) && apagar.status >= 200 && apagar.status < 300) return { ok: true }
  return { ok: false, motivo: `cancelar: ${falha(cancelar)}; apagar: ${falha(apagar)}` }
}
