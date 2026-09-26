import { reais } from "./formato"
import { dentro, type Janela } from "./marketing"
import type { Achado } from "./marketing-canais"
import { pagamentoDo, totalDo, type PedidoCru } from "./pedido"

/**
 * OS CLIENTES DO MARKETING — quem compra, se volta, em quanto tempo, e de
 * onde. A aba "Clientes" do protótipo. Código puro, com testes
 * (`__tests__/marketing-clientes.unit.spec.ts`).
 *
 * A PESSOA É O E-MAIL do pedido (minúsculo): o mesmo cliente compra com e
 * sem conta, e o e-mail é o que junta. PRIMEIRA COMPRA é o primeiro pedido
 * pago daquele e-mail na loja nova — quem comprava na Nuvemshop conta como
 * novo aqui até alguém importar o histórico de lá.
 *
 * As partes são dos PEDIDOS do período (somam 100%): de cada 100 pedidos
 * pagos, quantos foram a primeira compra da pessoa e quantos a volta. O
 * tempo até a segunda compra é de toda a história da loja nova.
 */

export type LinhaDoEstado = {
  /** "SP", ou "Outros" (os de menos venda, juntos). */
  uf: string
  pedidos: number
  receita: number
  ticket: number
  /** O frete médio cobrado (com os grátis, que contam zero). */
  frete: number
}

export type ClientesDoMarketing = {
  /** Pessoas diferentes que compraram no período. */
  compraram: number
  primeira: { pedidos: number; parte: number | null; ticket: number }
  voltaram: { pedidos: number; parte: number | null; ticket: number }
  /** Da primeira pra segunda compra, em dias (a média), e de quantas pessoas. */
  segunda: { dias: number; pessoas: number } | null
  estados: LinhaDoEstado[]
  achados: Achado[]
}

const DIA_MS = 24 * 60 * 60 * 1000
const centavos = (v: number) => Math.round(v * 100) / 100
const numero = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Os estados pelo nome, pra quem guardou "São Paulo" em vez de "SP". */
const UF_DO_NOME: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
}
const UFS = new Set(Object.values(UF_DO_NOME))

/** "SP", "sp", "São Paulo" → "SP"; o que não é estado, `null`. */
export function ufDe(provincia: unknown): string | null {
  if (typeof provincia !== "string") return null
  const t = provincia.trim()
  if (UFS.has(t.toUpperCase())) return t.toUpperCase()
  const nome = t
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
  return UF_DO_NOME[nome] ?? null
}

/** Os estados que aparecem sozinhos; os outros vão juntos em "Outros". */
export const ESTADOS_NA_LISTA = 8

type Paga = { email: string; pagoEm: Date; total: number; uf: string | null; frete: number }

/** Os pedidos pagos (e não cancelados), com o e-mail, o estado e o frete. */
function pagasDos(pedidos: (PedidoCru & { shipping_total?: unknown })[]): Paga[] {
  return pedidos.flatMap((o) => {
    const { pagoEm } = pagamentoDo(o)
    const email = typeof o.email === "string" ? o.email.trim().toLowerCase() : ""
    if (!pagoEm || o.status === "canceled" || !email) return []
    return [
      {
        email,
        pagoEm,
        total: totalDo(o),
        uf: ufDe(o.shipping_address?.province),
        frete: centavos(numero(o.shipping_total)),
      },
    ]
  })
}

/**
 * `pedidos`: TODOS os pedidos da loja (a primeira compra de cada pessoa pode
 * ser de antes do período). `j`: o período.
 */
export function montarClientes(
  pedidos: (PedidoCru & { shipping_total?: unknown })[],
  j: Janela
): ClientesDoMarketing {
  const pagas = pagasDos(pedidos).sort((a, b) => a.pagoEm.getTime() - b.pagoEm.getTime())
  const porPessoa = new Map<string, Paga[]>()
  for (const p of pagas) porPessoa.set(p.email, [...(porPessoa.get(p.email) ?? []), p])

  const noPeriodo = pagas.filter((p) => dentro(p.pagoEm, j))
  const ehPrimeira = (p: Paga) => porPessoa.get(p.email)![0] === p
  const primeiras = noPeriodo.filter(ehPrimeira)
  const voltas = noPeriodo.filter((p) => !ehPrimeira(p))
  const ticket = (l: Paga[]) =>
    l.length ? centavos(l.reduce((s, p) => s + p.total, 0) / l.length) : 0
  const primeiraParte = noPeriodo.length
    ? Math.round((primeiras.length / noPeriodo.length) * 100)
    : null

  const intervalos = [...porPessoa.values()]
    .filter((l) => l.length > 1)
    .map((l) => (l[1].pagoEm.getTime() - l[0].pagoEm.getTime()) / DIA_MS)
  const segunda = intervalos.length
    ? {
        dias: Math.round(intervalos.reduce((s, d) => s + d, 0) / intervalos.length),
        pessoas: intervalos.length,
      }
    : null

  const porUf = new Map<string, { pedidos: number; receita: number; frete: number }>()
  for (const p of noPeriodo) {
    const uf = p.uf ?? "Sem estado"
    const atual = porUf.get(uf) ?? { pedidos: 0, receita: 0, frete: 0 }
    atual.pedidos++
    atual.receita = centavos(atual.receita + p.total)
    atual.frete = centavos(atual.frete + p.frete)
    porUf.set(uf, atual)
  }
  const ordenados = [...porUf.entries()].sort(
    (a, b) => b[1].receita - a[1].receita || b[1].pedidos - a[1].pedidos
  )
  const linha = (uf: string, s: { pedidos: number; receita: number; frete: number }) => ({
    uf,
    pedidos: s.pedidos,
    receita: s.receita,
    ticket: centavos(s.receita / s.pedidos),
    frete: centavos(s.frete / s.pedidos),
  })
  const estados = ordenados.slice(0, ESTADOS_NA_LISTA).map(([uf, s]) => linha(uf, s))
  const resto = ordenados.slice(ESTADOS_NA_LISTA)
  if (resto.length)
    estados.push(
      linha(
        `Outros ${resto.length}`,
        resto.reduce(
          (t, [, s]) => ({
            pedidos: t.pedidos + s.pedidos,
            receita: centavos(t.receita + s.receita),
            frete: centavos(t.frete + s.frete),
          }),
          { pedidos: 0, receita: 0, frete: 0 }
        )
      )
    )

  const semAchados = {
    compraram: new Set(noPeriodo.map((p) => p.email)).size,
    primeira: { pedidos: primeiras.length, parte: primeiraParte, ticket: ticket(primeiras) },
    // A volta é o resto: as duas somam 100 (1 de 8 e 7 de 8 arredondados dariam 13 + 88).
    voltaram: {
      pedidos: voltas.length,
      parte: primeiraParte === null ? null : 100 - primeiraParte,
      ticket: ticket(voltas),
    },
    segunda,
    estados,
  }
  return { ...semAchados, achados: achadosDosClientes(semAchados, noPeriodo.length) }
}

/** Abaixo disso de pedidos pagos no período, as partes podem ser acaso. */
export const MINIMO_DE_PEDIDOS = 10
/** O frete que pesa: acima disso, o estado aparece no achado. */
export const FRETE_QUE_PESA = 30

/**
 * O que os clientes querem dizer: em quanto tempo a pessoa volta (e o
 * lembrete que antecipa a volta), e o estado onde o frete pesa — ou que
 * ainda é pouco pra dizer.
 */
export function achadosDosClientes(
  c: Omit<ClientesDoMarketing, "achados">,
  pedidos: number
): Achado[] {
  if (pedidos < MINIMO_DE_PEDIDOS)
    return [
      {
        tipo: "info",
        titulo: "Ainda é pouco pra conhecer os clientes",
        texto:
          `${pedidos} ${pedidos === 1 ? "pedido pago" : "pedidos pagos"} no período: as partes podem ` +
          "ser acaso. Com mais pedidos (depois da virada), aqui aparece em quanto tempo a pessoa volta " +
          "e onde o frete pesa.",
      },
    ]
  const achados: Achado[] = []
  if (c.segunda && c.segunda.pessoas >= 5)
    achados.push({
      tipo: "oportunidade",
      titulo: `A segunda compra vem ${c.segunda.dias} dias depois da primeira, em média`,
      texto:
        `É a média de ${c.segunda.pessoas} pessoas que voltaram. Um lembrete uns dias antes (quando o ` +
        "produto está no fim) antecipa a volta — é um e-mail novo, pra fazer.",
    })
  const [pesado] = c.estados
    .filter((e) => !e.uf.startsWith("Outros") && e.uf !== "Sem estado" && e.pedidos >= 3)
    .filter((e) => e.frete > FRETE_QUE_PESA)
    .sort((a, b) => b.frete - a.frete)
  if (pesado)
    achados.push({
      tipo: "problema",
      titulo: `Em ${pesado.uf}, o frete médio passa de ${reais(FRETE_QUE_PESA)}`,
      texto: `${reais(pesado.frete)} por pedido, em ${pesado.pedidos} pedidos no período. É onde o frete mais pesa na conta — e onde mais gente desiste na entrega.`,
    })
  return achados
}
