import { emailMascarado } from "./clientes"
import { quando, type Data } from "./formato"

/**
 * OS CARRINHOS ABANDONADOS NO PAINEL — quem pôs produto na sacola e não
 * fechou, em que passo parou, e o link pra chamar no WhatsApp. Código puro,
 * com testes; a leitura do banco é `ler-carrinhos.ts`.
 *
 * SÓ A LISTA, POR ENQUANTO: os e-mails automáticos (os 5 do protótipo) vêm
 * depois. Aqui é pra ver e chamar à mão.
 *
 * ┌─ ONDE A PESSOA PAROU ──────────────────────────────────────────────────┐
 * │ Pelo que o carrinho tem, com a mesma régua do checkout da loja          │
 * │ (`etapaDoCarrinho`, em `apps/loja/src/lib/checkout-visivel.ts`):        │
 * │ • sacola: sem e-mail — pôs produto e não deu o contato;                │
 * │ • contato: com e-mail e sem o CPF/CNPJ — parou no primeiro passo;      │
 * │ • entrega: sem o endereço inteiro ou sem o frete escolhido;            │
 * │ • pagamento: tudo pronto e não pagou (ou tentou e não passou).         │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * UMA LINHA POR PESSOA: a mesma pessoa abre mais de um carrinho (outro
 * aparelho, a sacola que expirou). Vale o mais recente, pelo e-mail — ou
 * pelo telefone, sem e-mail. Carrinho sem nenhum dos dois não tem com quem
 * falar: vira só um número ("sem contato").
 *
 * VOLTOU: a pessoa comprou depois — um pedido com o mesmo e-mail, feito
 * depois da última mexida no carrinho. Sai dos parados.
 */

export const DIAS = 30
/** Mexido há menos que isso, a pessoa pode estar no site agora: fica em "Agora". */
export const PARADO_MIN = 30

export type Etapa = "sacola" | "contato" | "entrega" | "pagamento"
export const ETAPAS: Etapa[] = ["sacola", "contato", "entrega", "pagamento"]
export const NOME_DA_ETAPA: Record<Etapa, string> = {
  sacola: "Sacola",
  contato: "Contato",
  entrega: "Entrega",
  pagamento: "Pagamento",
}

type Endereco = {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  postal_code?: string | null
  address_1?: string | null
  metadata?: Record<string, unknown> | null
} | null

export type CarrinhoCru = {
  id: string
  email?: string | null
  updated_at: Data
  customer?: {
    email?: string | null
    first_name?: string | null
    last_name?: string | null
    phone?: string | null
  } | null
  shipping_address?: Endereco
  billing_address?: Endereco
  items?:
    | ({
        title?: string | null
        product_title?: string | null
        quantity?: unknown
        unit_price?: unknown
      } | null)[]
    | null
  shipping_methods?: ({ id?: string | null } | null)[] | null
  payment_collection?: {
    payment_sessions?: ({ status?: string | null } | null)[] | null
  } | null
}

export type PedidoDaPessoa = {
  id: string
  display_id?: number | null
  email?: string | null
  created_at: Data
  status?: string | null
}

/** Quem chamou no WhatsApp, do registro da equipe. */
export type Chamado = { quem: string; em: Data }

export type Filtro = "parados" | "agora" | "voltaram"
export const FILTROS: Filtro[] = ["parados", "agora", "voltaram"]
export const ehFiltro = (v: unknown): v is Filtro =>
  typeof v === "string" && (FILTROS as string[]).includes(v)

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const data = (d: Data) => (d instanceof Date ? d : new Date(d))
const centavos = (v: number) => Math.round(v * 100) / 100

/** Em que passo a pessoa parou, e a frase. */
export function ondeParou(c: CarrinhoCru): { etapa: Etapa; texto: string } {
  if (!texto(c.email)) return { etapa: "sacola", texto: "Pôs na sacola e não deu o contato" }
  const documento = c.billing_address?.metadata?.documento as { valor?: unknown } | undefined
  if (!texto(documento?.valor))
    return { etapa: "contato", texto: "Parou no contato, o primeiro passo" }
  const e = c.shipping_address
  const meta = e?.metadata ?? {}
  const endereco = Boolean(
    texto(e?.postal_code) && texto(meta.rua ?? e?.address_1) && texto(meta.numero)
  )
  if (!endereco || !(c.shipping_methods ?? []).some(Boolean))
    return { etapa: "entrega", texto: "Deu o contato e parou na entrega" }
  const sessoes = (c.payment_collection?.payment_sessions ?? []).filter(Boolean)
  if (sessoes.some((s) => s?.status === "error"))
    return { etapa: "pagamento", texto: "Tentou pagar e o pagamento não passou" }
  return {
    etapa: "pagamento",
    texto: sessoes.length ? "Tentou pagar e não fechou" : "Chegou no pagamento e não pagou",
  }
}

/** "(11) 98888-7777" → "5511988887777". Nulo se não parece telefone do Brasil. */
export function telefoneDoWhatsapp(v: unknown): string | null {
  const d = texto(v).replace(/\D/g, "").replace(/^0+/, "")
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d
  return d.length === 10 || d.length === 11 ? `55${d}` : null
}

/** "(11) 98888-7777", pra tela. */
export function telefoneNaTela(digitos: string): string {
  const n = digitos.slice(2)
  return n.length === 11
    ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
    : `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
}

export function contatoDo(c: CarrinhoCru): {
  nome: string | null
  email: string | null
  telefone: string | null
} {
  const e = c.shipping_address
  const nome =
    [e?.first_name, e?.last_name].map(texto).filter(Boolean).join(" ") ||
    [c.customer?.first_name, c.customer?.last_name].map(texto).filter(Boolean).join(" ")
  const email = (texto(c.email) || texto(c.customer?.email)).toLowerCase()
  return {
    nome: nome || null,
    email: email || null,
    telefone: telefoneDoWhatsapp(e?.phone) ?? telefoneDoWhatsapp(c.customer?.phone),
  }
}

export type ItemDoCarrinho = { nome: string; quantidade: number; preco: number }

export function itensDo(c: CarrinhoCru): ItemDoCarrinho[] {
  return (c.items ?? [])
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
    .map((i) => ({
      nome: texto(i.product_title) || texto(i.title) || "Produto",
      quantidade: Number(i.quantity ?? 1) || 1,
      preco: Number(i.unit_price ?? 0) || 0,
    }))
}

/** O texto que abre no WhatsApp — a pessoa da equipe muda o que quiser antes de mandar. */
export function mensagemDoWhatsapp(nome: string | null, itens: ItemDoCarrinho[]): string {
  const primeiro = nome?.split(/\s+/)[0]
  const outros = itens.length - 1
  const produto = itens[0]?.nome ?? "uns produtos"
  const mais = outros > 0 ? ` e mais ${outros} ${outros === 1 ? "produto" : "produtos"}` : ""
  return (
    `Oi${primeiro ? `, ${primeiro}` : ""}! Aqui é da FuckingBarba. Vi que você separou ${produto}${mais} ` +
    "no site e não chegou a fechar a compra. Ficou alguma dúvida? Posso te ajudar por aqui."
  )
}

export const linkDoWhatsapp = (telefone: string, mensagem: string) =>
  `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`

export type LinhaDoCarrinho = {
  id: string
  /** "há 40 min", "hoje, 14:10". */
  quando: string
  paradoEm: string
  quem: { nome: string | null; email: string | null; telefone: string | null }
  itens: string
  unidades: number
  valor: number
  etapa: Etapa
  etapaTexto: string
  situacao: Filtro
  /** O pedido que a pessoa fez depois (voltou). */
  pedido: { id: string; numero: number } | null
  /** O link do WhatsApp — só pra quem vê o contato, e com telefone. */
  whatsapp: string | null
  chamado: { quem: string; quando: string } | null
}

export type TelaDosCarrinhos = {
  filtro: Filtro
  contagem: Record<Filtro, number>
  numeros: {
    parados: { quantos: number; valor: number }
    voltaram: { quantos: number; valor: number }
    semContato: { quantos: number; valor: number }
  }
  /** O marketing vê o e-mail mascarado e não vê o telefone (nem o botão). */
  verContato: boolean
  carrinhos: LinhaDoCarrinho[]
}

const resumoDosItens = (itens: ItemDoCarrinho[]) =>
  itens.map((i) => (i.quantidade > 1 ? `${i.quantidade}× ${i.nome}` : i.nome)).join(" · ")

export function telaDosCarrinhos({
  carrinhos,
  pedidos,
  chamados,
  agora,
  filtro,
  verContato,
}: {
  carrinhos: CarrinhoCru[]
  pedidos: PedidoDaPessoa[]
  chamados: Map<string, Chamado>
  agora: Date
  filtro: Filtro
  verContato: boolean
}): TelaDosCarrinhos {
  const desde = agora.getTime() - DIAS * 24 * 3600 * 1000
  const paradoAntesDe = agora.getTime() - PARADO_MIN * 60 * 1000

  // Uma linha por pessoa: o carrinho mais recente dela.
  const porPessoa = new Map<string, { c: CarrinhoCru; contato: ReturnType<typeof contatoDo> }>()
  const semContato = { quantos: 0, valor: 0 }
  const ordenados = [...carrinhos]
    .filter((c) => itensDo(c).length && data(c.updated_at).getTime() >= desde)
    .sort((a, b) => data(b.updated_at).getTime() - data(a.updated_at).getTime())
  for (const c of ordenados) {
    const contato = contatoDo(c)
    const chave = contato.email ?? contato.telefone
    if (!chave) {
      semContato.quantos++
      semContato.valor += itensDo(c).reduce((s, i) => s + i.preco * i.quantidade, 0)
      continue
    }
    if (!porPessoa.has(chave)) porPessoa.set(chave, { c, contato })
  }

  const comprasPorEmail = new Map<string, PedidoDaPessoa[]>()
  for (const p of pedidos) {
    const email = texto(p.email).toLowerCase()
    if (!email || p.status === "canceled") continue
    comprasPorEmail.set(email, [...(comprasPorEmail.get(email) ?? []), p])
  }

  const todas: LinhaDoCarrinho[] = [...porPessoa.values()].map(({ c, contato }) => {
    const itens = itensDo(c)
    const parado = data(c.updated_at)
    const voltou = (contato.email ? (comprasPorEmail.get(contato.email) ?? []) : [])
      .filter((p) => data(p.created_at).getTime() > parado.getTime())
      .sort((a, b) => data(a.created_at).getTime() - data(b.created_at).getTime())[0]
    const onde = ondeParou(c)
    const chamado = chamados.get(c.id)
    return {
      id: c.id,
      quando: quando(parado, agora),
      paradoEm: parado.toISOString(),
      quem: {
        nome: contato.nome,
        email: contato.email ? (verContato ? contato.email : emailMascarado(contato.email)) : null,
        telefone: verContato && contato.telefone ? telefoneNaTela(contato.telefone) : null,
      },
      itens: resumoDosItens(itens),
      unidades: itens.reduce((s, i) => s + i.quantidade, 0),
      valor: centavos(itens.reduce((s, i) => s + i.preco * i.quantidade, 0)),
      etapa: onde.etapa,
      etapaTexto: onde.texto,
      situacao: voltou ? "voltaram" : parado.getTime() <= paradoAntesDe ? "parados" : "agora",
      pedido: voltou ? { id: voltou.id, numero: Number(voltou.display_id ?? 0) } : null,
      whatsapp:
        verContato && contato.telefone
          ? linkDoWhatsapp(contato.telefone, mensagemDoWhatsapp(contato.nome, itens))
          : null,
      chamado: chamado ? { quem: chamado.quem, quando: quando(chamado.em, agora) } : null,
    }
  })

  const soma = (l: LinhaDoCarrinho[]) => centavos(l.reduce((s, x) => s + x.valor, 0))
  const de = (f: Filtro) => todas.filter((l) => l.situacao === f)
  return {
    filtro,
    contagem: {
      parados: de("parados").length,
      agora: de("agora").length,
      voltaram: de("voltaram").length,
    },
    numeros: {
      parados: { quantos: de("parados").length, valor: soma(de("parados")) },
      voltaram: { quantos: de("voltaram").length, valor: soma(de("voltaram")) },
      semContato: { quantos: semContato.quantos, valor: centavos(semContato.valor) },
    },
    verContato,
    carrinhos: de(filtro),
  }
}
