import { emailMascarado } from "./clientes"
import { quando, type Data } from "./formato"
import { fotosDos } from "./pedido"

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
        product_id?: string | null
        thumbnail?: string | null
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
export function ondeParou(c: CarrinhoCru): { etapa: Etapa; texto: string; falhou?: true } {
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
    return { etapa: "pagamento", texto: "Tentou pagar e o pagamento não passou", falhou: true }
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

/** O e-mail da pessoa: o do carrinho; sem ele, o da conta. Em minúsculas. */
const emailDe = (doCarrinho: unknown, daConta: unknown) =>
  (texto(doCarrinho) || texto(daConta)).toLowerCase() || null

/** O telefone do WhatsApp: o do endereço; sem ele, o da conta. */
const telefoneDe = (doEndereco: unknown, daConta: unknown) =>
  telefoneDoWhatsapp(doEndereco) ?? telefoneDoWhatsapp(daConta)

export function contatoDo(c: CarrinhoCru): {
  nome: string | null
  email: string | null
  telefone: string | null
} {
  const e = c.shipping_address
  const nome =
    [e?.first_name, e?.last_name].map(texto).filter(Boolean).join(" ") ||
    [c.customer?.first_name, c.customer?.last_name].map(texto).filter(Boolean).join(" ")
  return {
    nome: nome || null,
    email: emailDe(c.email, c.customer?.email),
    telefone: telefoneDe(e?.phone, c.customer?.phone),
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
  /** O pagamento foi tentado e não passou: o passo fica vermelho no painel. */
  falhou: boolean
  /** Até três fotos da sacola, e quantos produtos diferentes (o "+N"). */
  fotos: string[]
  produtos: number
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

/**
 * O QUE A CONTA DA LISTA PRECISA DE CADA CARRINHO — de quem é, quando mexeu
 * e quanto tem na sacola. Sai numa ida só ao banco, pra todos os carrinhos
 * do mês (`ler-carrinhos.ts`); o carrinho inteiro (os itens, o endereço, o
 * pagamento) só se lê pros 30 da página mostrada (0249).
 */
export type ResumoDoCarrinho = {
  id: string
  updated_at: Data
  email?: string | null
  /** O e-mail e o telefone da conta, de quem entrou. */
  email_da_conta?: string | null
  telefone_da_conta?: string | null
  /** O telefone do endereço de entrega. */
  telefone_do_endereco?: string | null
  /** Quantos itens a sacola tem: sem nenhum, não é carrinho abandonado. */
  itens: number
  /** Preço × quantidade, somados. */
  valor: number
}

/** O resumo de um carrinho inteiro — a mesma conta da leitura do banco. */
export function resumoDo(c: CarrinhoCru): ResumoDoCarrinho {
  const itens = itensDo(c)
  return {
    id: c.id,
    updated_at: c.updated_at,
    email: c.email,
    email_da_conta: c.customer?.email,
    telefone_da_conta: c.customer?.phone,
    telefone_do_endereco: c.shipping_address?.phone,
    itens: itens.length,
    valor: itens.reduce((s, i) => s + i.preco * i.quantidade, 0),
  }
}

/** O carrinho que vira linha: o mais recente da pessoa, e a situação dele. */
export type Escolhido = {
  id: string
  situacao: Filtro
  /** O valor da sacola, pros números de cima. */
  valor: number
  /** O pedido que a pessoa fez depois (voltou). */
  pedido: PedidoDaPessoa | null
}

export type ContaDosCarrinhos = Pick<TelaDosCarrinhos, "filtro" | "contagem" | "numeros"> & {
  /** Os do filtro, do mais recente pro mais antigo: a página sai daqui. */
  doFiltro: Escolhido[]
}

/**
 * A CONTA DA LISTA, só com os resumos: uma linha por pessoa, quem voltou e
 * comprou, as fitas e os números de cima. As linhas em si (o passo, as
 * fotos, o WhatsApp) são `linhasDosCarrinhos`, só pros da página.
 */
export function contarOsCarrinhos({
  resumos,
  pedidos,
  agora,
  filtro,
}: {
  resumos: ResumoDoCarrinho[]
  pedidos: PedidoDaPessoa[]
  agora: Date
  filtro: Filtro
}): ContaDosCarrinhos {
  const desde = agora.getTime() - DIAS * 24 * 3600 * 1000
  const paradoAntesDe = agora.getTime() - PARADO_MIN * 60 * 1000

  // Uma linha por pessoa: o carrinho mais recente dela.
  const porPessoa = new Map<string, { r: ResumoDoCarrinho; email: string | null }>()
  const semContato = { quantos: 0, valor: 0 }
  const ordenados = [...resumos]
    .filter((r) => r.itens > 0 && data(r.updated_at).getTime() >= desde)
    .sort((a, b) => data(b.updated_at).getTime() - data(a.updated_at).getTime())
  for (const r of ordenados) {
    const email = emailDe(r.email, r.email_da_conta)
    const chave = email ?? telefoneDe(r.telefone_do_endereco, r.telefone_da_conta)
    if (!chave) {
      semContato.quantos++
      semContato.valor += r.valor
      continue
    }
    if (!porPessoa.has(chave)) porPessoa.set(chave, { r, email })
  }

  const comprasPorEmail = new Map<string, PedidoDaPessoa[]>()
  for (const p of pedidos) {
    const email = texto(p.email).toLowerCase()
    if (!email || p.status === "canceled") continue
    comprasPorEmail.set(email, [...(comprasPorEmail.get(email) ?? []), p])
  }

  const todos: Escolhido[] = [...porPessoa.values()].map(({ r, email }) => {
    const parado = data(r.updated_at).getTime()
    const voltou = (email ? (comprasPorEmail.get(email) ?? []) : [])
      .filter((p) => data(p.created_at).getTime() > parado)
      .sort((a, b) => data(a.created_at).getTime() - data(b.created_at).getTime())[0]
    return {
      id: r.id,
      situacao: voltou ? "voltaram" : parado <= paradoAntesDe ? "parados" : "agora",
      valor: centavos(r.valor),
      pedido: voltou ?? null,
    }
  })

  const soma = (l: Escolhido[]) => centavos(l.reduce((s, x) => s + x.valor, 0))
  const de = (f: Filtro) => todos.filter((l) => l.situacao === f)
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
    doFiltro: de(filtro),
  }
}

/**
 * As linhas dos escolhidos, com o carrinho inteiro de cada um. O que fechou
 * entre a conta e esta leitura não vem mais — e fica de fora.
 */
export function linhasDosCarrinhos(
  escolhidos: Escolhido[],
  carrinhos: CarrinhoCru[],
  {
    chamados,
    agora,
    verContato,
  }: { chamados: Map<string, Chamado>; agora: Date; verContato: boolean }
): LinhaDoCarrinho[] {
  const porId = new Map(carrinhos.map((c) => [c.id, c]))
  return escolhidos.flatMap((e) => {
    const c = porId.get(e.id)
    if (!c) return []
    const contato = contatoDo(c)
    const itens = itensDo(c)
    const parado = data(c.updated_at)
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
      falhou: Boolean(onde.falhou),
      ...fotosDos((c.items ?? []).filter((i): i is NonNullable<typeof i> => Boolean(i))),
      situacao: e.situacao,
      pedido: e.pedido ? { id: e.pedido.id, numero: Number(e.pedido.display_id ?? 0) } : null,
      whatsapp:
        verContato && contato.telefone
          ? linkDoWhatsapp(contato.telefone, mensagemDoWhatsapp(contato.nome, itens))
          : null,
      chamado: chamado ? { quem: chamado.quem, quando: quando(chamado.em, agora) } : null,
    }
  })
}

/** A tela inteira, dos carrinhos inteiros: a conta e as linhas juntas (os testes). */
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
  const { doFiltro, ...conta } = contarOsCarrinhos({
    resumos: carrinhos.map(resumoDo),
    pedidos,
    agora,
    filtro,
  })
  return {
    ...conta,
    verContato,
    carrinhos: linhasDosCarrinhos(doFiltro, carrinhos, { chamados, agora, verContato }),
  }
}
