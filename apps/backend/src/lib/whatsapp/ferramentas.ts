import type Anthropic from "@anthropic-ai/sdk"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { normalizarEmail } from "../../modules/codigo/regras"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import { cotarFrete } from "../cotar-frete"
import { carrinhoNovo, copiaDo, lerPedido } from "../crm/voltar-ao-checkout"
import { linkDeVoltar } from "../crm/voltar"
import { emReais } from "../emails/moldura"
import { criarLimite } from "../limite"
import type { ClienteDoWhatsapp } from "./cliente"
import { daLojaAntiga, lerPedidosDoWhatsapp, pedidoEmTexto, type PedidoNoWhatsapp } from "./pedidos"

/**
 * AS FERRAMENTAS DO ATENDENTE — o que ele consulta e faz no sistema da loja
 * no meio da conversa (a parte 2 do WhatsApp, entrega 0233):
 *
 *   ver_meus_pedidos       os pedidos do número que está escrevendo;
 *   ver_pedido             um pedido pelo número E o e-mail da compra (quem
 *                          escreve de outro número): só a situação e o rastreio;
 *   mandar_codigo_do_pix   o copia e cola do Pix que ainda vale, numa
 *                          mensagem SÓ COM ELE, logo depois da resposta — no
 *                          WhatsApp a pessoa copia a mensagem inteira, e o app
 *                          do banco não aceita o código com texto junto;
 *   cotar_frete            o frete pra um CEP, pela mesma conta da página do
 *                          produto e do checkout (`lib/cotar-frete.ts`);
 *   montar_sacola          um carrinho com os produtos e o link que abre o
 *                          checkout com ele (o mesmo `/voltar` dos e-mails);
 *   refazer_pedido         o "Refazer o pedido" de uma compra do número
 *                          (da loja nova ou da Nuvemshop).
 *
 * ┌─ QUEM VÊ O QUÊ ────────────────────────────────────────────────────────┐
 * │ Do número que escreve (`cliente.ts`): tudo — produtos, total, Pix,     │
 * │ rastreio, refazer (o checkout abre com o endereço dele). De outro      │
 * │ número, com o número do pedido e o e-mail certos: só a situação e o    │
 * │ rastreio. Endereço, CPF e cartão nunca saem daqui. As tentativas de    │
 * │ número + e-mail têm limite: ninguém fica chutando pedidos.             │
 * └────────────────────────────────────────────────────────────────────────┘
 */

export type ContextoDasFerramentas = {
  container: MedusaContainer
  telefone: string
  cliente: ClienteDoWhatsapp | null
  loja: string
  agora: Date
  /** O que sai em mensagens separadas, depois da resposta (o copia e cola do Pix). */
  depois: string[]
}

export type ResultadoDaFerramenta = { conteudo: string; erro?: boolean }

/** A marca dos links que o atendente manda: o Marketing conta como WhatsApp. */
export const UTM_DO_ATENDENTE = "utm_source=whatsapp&utm_medium=atendimento&utm_campaign=atendente"

/** O link que abre o checkout com este carrinho ou pedido refeito (o `/voltar` dos e-mails). */
export const linkDoCheckout = (loja: string, id: string, agora: Date) =>
  `${loja}/voltar/${linkDeVoltar(id, agora)}?${UTM_DO_ATENDENTE}`

/* ── os limites, por número, na memória ──────────────────────────────────── */

const HORA = 60 * 60 * 1000
export const LIMITES = {
  /** Número + e-mail errados seguidos: ninguém fica chutando. */
  verPedido: { limite: 5, ms: HORA },
  /** Cada cotação é uma ida à Frenet. */
  frete: { limite: 10, ms: HORA },
  /** Cada sacola é um carrinho no banco. */
  sacola: { limite: 6, ms: HORA },
}
const limite = criarLimite()
function cabe(ctx: ContextoDasFerramentas, qual: keyof typeof LIMITES): boolean {
  const chave = `${qual}:${ctx.telefone}`
  if (!limite.cabe(chave, LIMITES[qual], ctx.agora.getTime())) return false
  limite.contar(chave, LIMITES[qual], ctx.agora.getTime())
  return true
}

/* ── as definições (sempre na mesma ordem: entram no cache da IA) ────────── */

const ITENS = {
  type: "array",
  description: "Os produtos, pelo código que aparece na lista de produtos, e as quantidades.",
  items: {
    type: "object",
    properties: {
      produto: { type: "string", description: "O código do produto (ex.: oleo-para-barba)." },
      quantidade: { type: "integer", description: "Quantas unidades (1 a 10)." },
    },
    required: ["produto", "quantidade"],
    additionalProperties: false,
  },
} as const

export const FERRAMENTAS_DA_LOJA: Anthropic.Beta.BetaTool[] = [
  {
    name: "ver_meus_pedidos",
    description:
      "Os pedidos feitos com o telefone deste WhatsApp (até 5, do mais novo): situação, produtos, total, " +
      "Pix e rastreio. Use quando a pessoa perguntar do pedido dela, do rastreio, do Pix, ou quiser repetir uma compra.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "ver_pedido",
    description:
      "Um pedido pelo número E pelo e-mail usado na compra — pra quem comprou com outro telefone. " +
      "Devolve só a situação e o rastreio. Peça os dois à pessoa antes de usar.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        numero: { type: "integer", description: "O número do pedido, sem o #." },
        email: { type: "string", description: "O e-mail usado na compra." },
      },
      required: ["numero", "email"],
      additionalProperties: false,
    },
  },
  {
    name: "mandar_codigo_do_pix",
    description:
      "Manda o código Pix copia e cola de um pedido deste telefone que está esperando o pagamento, numa " +
      "mensagem separada logo depois da sua resposta (só o código, pra pessoa copiar). Nunca escreva o código você.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { numero: { type: "integer", description: "O número do pedido, sem o #." } },
      required: ["numero"],
      additionalProperties: false,
    },
  },
  {
    name: "cotar_frete",
    description:
      "O frete e o prazo de entrega pra um CEP, com estes produtos — a mesma conta do site e do checkout, " +
      "já com o frete grátis quando vale. Sem produto definido, use 1 unidade do que a pessoa está olhando.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        cep: { type: "string", description: "O CEP, com ou sem traço." },
        itens: ITENS,
      },
      required: ["cep", "itens"],
      additionalProperties: false,
    },
  },
  {
    name: "montar_sacola",
    description:
      "Monta a sacola com estes produtos e devolve o link que abre o checkout com ela pronta (o desconto por " +
      "quantidade e a promoção já entram). Use quando a pessoa decidir comprar, ou pedir o link de mais de um produto.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { itens: ITENS },
      required: ["itens"],
      additionalProperties: false,
    },
  },
  {
    name: "refazer_pedido",
    description:
      "O link que abre o checkout com os mesmos produtos de uma compra deste telefone (e o endereço dela). " +
      "Use pra 'quero repetir', 'manda de novo', reposição, ou o Pix que venceu. Número 0 = a última compra.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        numero: {
          type: "integer",
          description: "O número do pedido, sem o #; 0 pra última compra.",
        },
      },
      required: ["numero"],
      additionalProperties: false,
    },
  },
]

/* ── os produtos pedidos ──────────────────────────────────────────────────── */

type ItemPedido = { produto: string; quantidade: number }

/** Os itens que a IA mandou, pelo código (o handle), na variante que está à venda. */
async function variantesDos(
  container: MedusaContainer,
  itens: unknown
): Promise<
  | { ok: true; itens: { variant_id: string; quantity: number; nome: string }[] }
  | { ok: false; motivo: string }
> {
  const lista = (Array.isArray(itens) ? itens : []) as ItemPedido[]
  const pedidos = lista.flatMap((i) => {
    const handle = typeof i?.produto === "string" ? i.produto.trim().toLowerCase() : ""
    const q = Math.trunc(Number(i?.quantidade))
    return handle && q > 0 ? [{ handle, quantidade: Math.min(q, 10) }] : []
  })
  if (!pedidos.length || pedidos.length > 10)
    return { ok: false, motivo: "Diga quais produtos e quantas unidades." }
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product",
    fields: ["id", "handle", "title", "variants.id"],
    filters: {
      handle: [...new Set(pedidos.map((p) => p.handle))],
      status: ProductStatus.PUBLISHED,
    },
  })
  const porHandle = new Map(
    (data as { handle: string; title?: string | null; variants?: { id: string }[] | null }[]).map(
      (p) => [p.handle, p]
    )
  )
  const desconhecidos = pedidos.filter((p) => !porHandle.get(p.handle)?.variants?.length)
  if (desconhecidos.length)
    return {
      ok: false,
      motivo: `Não existe produto com o código ${desconhecidos.map((d) => `"${d.handle}"`).join(", ")}: use o código da lista de produtos.`,
    }
  const quantos = new Map<string, { quantity: number; nome: string }>()
  for (const p of pedidos) {
    const produto = porHandle.get(p.handle)!
    const variante = produto.variants![0].id
    const antes = quantos.get(variante)
    quantos.set(variante, {
      quantity: (antes?.quantity ?? 0) + p.quantidade,
      nome: (produto.title ?? p.handle).trim(),
    })
  }
  return { ok: true, itens: [...quantos].map(([variant_id, v]) => ({ variant_id, ...v })) }
}

/* ── cada ferramenta ──────────────────────────────────────────────────────── */

async function meusPedidos(ctx: ContextoDasFerramentas): Promise<PedidoNoWhatsapp[]> {
  return ctx.cliente?.pedidos.length
    ? lerPedidosDoWhatsapp(ctx.container, { ids: ctx.cliente.pedidos.slice(0, 5) }, ctx.agora)
    : []
}

async function verMeusPedidos(ctx: ContextoDasFerramentas): Promise<ResultadoDaFerramenta> {
  const pedidos = await meusPedidos(ctx)
  const antigos = ctx.cliente?.email
    ? (await ctx.container.resolve<CrmService>(CRM).pedidosDaBase(ctx.cliente.email)).length
    : 0
  if (!pedidos.length)
    return {
      conteudo:
        (antigos
          ? `Nenhum pedido da loja nova com este telefone, e ${antigos} pedido(s) da loja antiga (antes de 27/09), cuja situação você não enxerga: pra eles, chame a equipe. `
          : "Nenhum pedido com o telefone deste WhatsApp. ") +
        "Se a pessoa comprou com outro telefone, peça o número do pedido e o e-mail da compra e use ver_pedido.",
    }
  const blocos = pedidos.map((p) => {
    const extra: string[] = []
    if (p.pix) extra.push("Dá pra mandar o código do Pix: mandar_codigo_do_pix.")
    if (p.situacao === "vencido" || (p.situacao === "cancelado" && !p.foiPago))
      extra.push("Dá pra refazer este pedido com o link de refazer_pedido.")
    return [pedidoEmTexto(p, { dono: true }), ...extra].join("\n")
  })
  if (antigos)
    blocos.push(
      `E ${antigos} pedido(s) da loja antiga (antes de 27/09): você não enxerga a situação deles (chame a equipe), mas refazer_pedido funciona.`
    )
  return { conteudo: blocos.join("\n\n") }
}

async function verPedido(
  input: unknown,
  ctx: ContextoDasFerramentas
): Promise<ResultadoDaFerramenta> {
  const { numero, email } = (input ?? {}) as { numero?: unknown; email?: unknown }
  const n = Math.trunc(Number(numero))
  const quem = normalizarEmail(email)
  if (!n || !quem)
    return { conteudo: "Preciso do número do pedido e do e-mail da compra.", erro: true }
  if (daLojaAntiga(n))
    return {
      conteudo:
        "É um pedido da loja antiga (antes de 27/09): você não enxerga a situação dele. Chame a equipe.",
    }
  if (!cabe(ctx, "verPedido"))
    return {
      conteudo:
        "Muitas tentativas de número e e-mail nesta hora. Não tente de novo agora: chame a equipe.",
      erro: true,
    }
  const [pedido] = await lerPedidosDoWhatsapp(ctx.container, { numero: n }, ctx.agora)
  // O pedido que não existe e o e-mail que não bate respondem igual: a ferramenta não diz se o número existe.
  if (!pedido || normalizarEmail(pedido.email) !== quem)
    return {
      conteudo:
        "Não achei um pedido com esse número e esse e-mail. Confira os dois com a pessoa (o número está no e-mail da compra).",
    }
  const dono = Boolean(ctx.cliente?.pedidos.includes(pedido.id))
  return { conteudo: pedidoEmTexto(pedido, { dono }) }
}

async function mandarCodigoDoPix(
  input: unknown,
  ctx: ContextoDasFerramentas
): Promise<ResultadoDaFerramenta> {
  const n = Math.trunc(Number((input as { numero?: unknown } | null)?.numero))
  const pedido = (await meusPedidos(ctx)).find((p) => p.numero === n)
  if (!pedido)
    return {
      conteudo:
        "Esse pedido não é deste telefone. O código do Pix só vai pro WhatsApp do telefone da compra.",
      erro: true,
    }
  if (!pedido.pix)
    return {
      conteudo:
        pedido.situacao === "vencido" || pedido.situacao === "cancelado"
          ? "O Pix deste pedido já venceu. Ofereça refazer o pedido (refazer_pedido)."
          : "Este pedido não está esperando Pix.",
    }
  ctx.depois.push(pedido.pix.codigo)
  const vence = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(pedido.pix.vence)
  return {
    conteudo: `O código vai numa mensagem separada, logo depois da sua resposta. Ele vale até ${vence}. Diga à pessoa pra copiar a próxima mensagem e colar no app do banco, em "Pix copia e cola". Não escreva o código.`,
  }
}

async function cotar(input: unknown, ctx: ContextoDasFerramentas): Promise<ResultadoDaFerramenta> {
  const { cep, itens } = (input ?? {}) as { cep?: unknown; itens?: unknown }
  const digitos = String(cep ?? "").replace(/\D/g, "")
  if (digitos.length !== 8)
    return { conteudo: "O CEP tem 8 dígitos: peça de novo à pessoa.", erro: true }
  const produtos = await variantesDos(ctx.container, itens)
  if (!produtos.ok) return { conteudo: produtos.motivo, erro: true }
  if (!cabe(ctx, "frete"))
    return {
      conteudo: "Muitas cotações nesta hora: peça pra pessoa ver o frete na página do produto.",
      erro: true,
    }
  const r = await cotarFrete(ctx.container, {
    cep: digitos,
    pedidos: produtos.itens.map((i) => ({ id: i.variant_id, quantidade: i.quantity })),
    carrinho: null,
  })
  if (!r.ok)
    return {
      conteudo:
        "Não consegui calcular o frete agora. Peça pra pessoa digitar o CEP na página do produto ou no checkout.",
      erro: true,
    }
  const { frete } = r
  const linhas = [
    `Frete pro CEP ${digitos.slice(0, 5)}-${digitos.slice(5)}, com ${produtos.itens.map((i) => `${i.quantity}x ${i.nome}`).join(", ")}:`,
    ...frete.opcoes.map((o) => {
      const preco =
        o.preco === 0
          ? `GRÁTIS${o.precoCheio ? ` (seria ${emReais(o.precoCheio)})` : ""}`
          : emReais(o.preco)
      const quem = o.transportadora ? `, ${o.transportadora}` : ""
      return `- ${o.nome}: ${preco}${quem}${o.prazo ? `, ${o.prazo} depois da postagem` : ""}`
    }),
  ]
  if (frete.faltaPraGratis !== null && frete.faltaPraGratis > 0)
    linhas.push(`Faltam ${emReais(frete.faltaPraGratis)} em produtos pro frete grátis.`)
  linhas.push("O valor final aparece no checkout, com o endereço completo.")
  return { conteudo: linhas.join("\n") }
}

/** O carrinho em texto: os produtos com o preço que ele cobra, os descontos e o total sem o frete. */
async function carrinhoEmTexto(container: MedusaContainer, id: string): Promise<string> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "cart",
    fields: [
      "id",
      "item_total",
      "discount_total",
      "items.product_title",
      "items.quantity",
      "items.unit_price",
    ],
    filters: { id },
  })
  const c = data[0] as
    | {
        item_total?: unknown
        discount_total?: unknown
        items?: { product_title?: string | null; quantity?: unknown; unit_price?: unknown }[] | null
      }
    | undefined
  if (!c) return ""
  const linhas = (c.items ?? []).map(
    (i) =>
      `- ${Number(i.quantity) || 1}x ${(i.product_title ?? "produto").trim()} (${emReais(Number(i.unit_price) || 0)} cada)`
  )
  const desconto = Number(c.discount_total) || 0
  if (desconto > 0) linhas.push(`Desconto da promoção: -${emReais(desconto)}`)
  const total = (Number(c.item_total) || 0) - desconto
  linhas.push(`Total dos produtos: ${emReais(total)} (o frete é escolhido no checkout)`)
  return linhas.join("\n")
}

async function regiaoECanal(container: MedusaContainer) {
  const [{ data: regioes }, lojas] = await Promise.all([
    container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "region",
      fields: ["id", "currency_code"],
    }),
    container
      .resolve(Modules.STORE)
      .listStores({}, { select: ["default_sales_channel_id"], take: 1 }),
  ])
  const regiao = (regioes as { id: string; currency_code?: string | null }[]).find(
    (r) => r.currency_code === "brl"
  )
  return {
    region_id: regiao?.id,
    sales_channel_id: lojas[0]?.default_sales_channel_id ?? undefined,
  }
}

async function montarSacola(
  input: unknown,
  ctx: ContextoDasFerramentas
): Promise<ResultadoDaFerramenta> {
  const produtos = await variantesDos(ctx.container, (input as { itens?: unknown } | null)?.itens)
  if (!produtos.ok) return { conteudo: produtos.motivo, erro: true }
  if (!cabe(ctx, "sacola"))
    return {
      conteudo: "Muitas sacolas nesta hora: mande o link dos produtos em vez disso.",
      erro: true,
    }
  // Do dono do número: o e-mail, a conta e o endereço da última compra — o checkout abre preenchido.
  const ultimo = ctx.cliente?.pedidos[0]
    ? await lerPedido(ctx.container, ctx.cliente.pedidos[0])
    : undefined
  const base = await regiaoECanal(ctx.container)
  const carrinho = await carrinhoNovo(
    ctx.container,
    {
      region_id: ultimo?.region_id ?? base.region_id,
      sales_channel_id: ultimo?.sales_channel_id ?? base.sales_channel_id,
      ...(ultimo?.customer_id ? { customer_id: ultimo.customer_id } : {}),
      ...(ultimo?.email ? { email: ultimo.email } : {}),
      ...(ultimo
        ? {
            shipping_address: copiaDo(ultimo.shipping_address),
            billing_address: copiaDo(ultimo.billing_address),
          }
        : {}),
      metadata: { fb_origem: "whatsapp" },
    },
    produtos.itens.map(({ variant_id, quantity }) => ({ variant_id, quantity }))
  )
  if (!carrinho)
    return {
      conteudo: "Esses produtos estão esgotados agora: não deu pra montar a sacola.",
      erro: true,
    }
  return {
    conteudo: [
      `Sacola montada:`,
      await carrinhoEmTexto(ctx.container, carrinho),
      `Link pra pagar (abre o checkout com a sacola pronta; vale 7 dias): ${linkDoCheckout(ctx.loja, carrinho, ctx.agora)}`,
      ultimo ? "O checkout já abre com o endereço da última compra dele." : "",
    ]
      .filter(Boolean)
      .join("\n"),
  }
}

async function refazerPedido(
  input: unknown,
  ctx: ContextoDasFerramentas
): Promise<ResultadoDaFerramenta> {
  const n = Math.trunc(Number((input as { numero?: unknown } | null)?.numero)) || 0
  if (!ctx.cliente)
    return {
      conteudo:
        "Este telefone não tem compra na loja nova. Refazer só funciona pro WhatsApp do telefone da compra: monte a sacola (montar_sacola).",
      erro: true,
    }
  const pedidos = await meusPedidos(ctx)
  const daNova = n
    ? pedidos.find((p) => p.numero === n)
    : (pedidos.find((p) => p.foiPago) ??
      pedidos.find((p) => p.situacao === "vencido" || p.situacao === "cancelado"))
  if (daNova) {
    if (daNova.situacao === "pix")
      return {
        conteudo: "Esse pedido ainda está esperando o Pix: mande o código (mandar_codigo_do_pix).",
      }
    return {
      conteudo: `Link pra refazer o pedido #${daNova.numero} (${daNova.itens.map((i) => `${i.quantidade}x ${i.nome}`).join(", ")}), com o endereço dele; o que esgotou fica de fora; vale 7 dias: ${linkDoCheckout(ctx.loja, `repor-${daNova.id}`, ctx.agora)}`,
    }
  }
  // Da Nuvemshop: pelo e-mail das compras deste telefone.
  const antigos = ctx.cliente.email
    ? await ctx.container.resolve<CrmService>(CRM).pedidosDaBase(ctx.cliente.email)
    : []
  const antigo = n
    ? antigos.find((p) => Number(p.numero) === n)
    : [...antigos].sort((a, b) => new Date(b.feitoEm).getTime() - new Date(a.feitoEm).getTime())[0]
  if (antigo?.id)
    return {
      conteudo: `Link pra refazer o pedido #${antigo.numero} da loja antiga (${(antigo.itens ?? []).map((i) => `${i.quantidade}x ${i.nome}`).join(", ")}); o que esgotou fica de fora; vale 7 dias: ${linkDoCheckout(ctx.loja, `repor-${antigo.id}`, ctx.agora)}`,
    }
  return {
    conteudo: n
      ? `O pedido #${n} não é deste telefone. Refazer só funciona pras compras do telefone deste WhatsApp.`
      : "Não achei compra deste telefone pra refazer: monte a sacola (montar_sacola).",
    erro: true,
  }
}

/** Roda a ferramenta da loja pedida; `null` se o nome não é de nenhuma daqui. */
export async function usarFerramenta(
  nome: string,
  input: unknown,
  ctx: ContextoDasFerramentas
): Promise<ResultadoDaFerramenta | null> {
  switch (nome) {
    case "ver_meus_pedidos":
      return verMeusPedidos(ctx)
    case "ver_pedido":
      return verPedido(input, ctx)
    case "mandar_codigo_do_pix":
      return mandarCodigoDoPix(input, ctx)
    case "cotar_frete":
      return cotar(input, ctx)
    case "montar_sacola":
      return montarSacola(input, ctx)
    case "refazer_pedido":
      return refazerPedido(input, ctx)
    default:
      return null
  }
}
