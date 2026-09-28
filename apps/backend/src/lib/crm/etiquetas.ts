import { dia } from "../painel/formato"

/**
 * AS ETIQUETAS DE CADA PESSOA — o "Quem é quem" do plano do CRM (o "Ciclo da
 * Barba"): a etapa, o engajamento, o dia do tratamento, a próxima compra e se
 * ela é sensível a cupom. É o que os fluxos de e-mail vão usar pra escolher
 * quem recebe o quê; por enquanto, aparece na ficha do cliente no painel.
 *
 * Código puro, com testes. Recebe os pedidos (de todos os cadastros com o
 * mesmo e-mail), os sinais (o último clique num e-mail da loja, a última
 * visita com o sim dos cookies, a inscrição na newsletter) e a hora; devolve
 * as cinco, cada uma com o porquê em frase.
 *
 * ┌─ QUANTO DURA CADA FRASCO ──────────────────────────────────────────────┐
 * │ A próxima compra é a entrega do último pedido pago + o que dura o      │
 * │ primeiro produto dele a acabar. Os dias e as regras (quando alguém     │
 * │ fica em risco, quente, sensível a cupom) são os do protótipo — o       │
 * │ padrão. Quem abre o CRM muda os dois no painel (CRM → Ajustes,         │
 * │ `lib/crm/ajustes.ts`), e o histórico da Nuvemshop vai acertar os       │
 * │ números de verdade.                                                    │
 * └────────────────────────────────────────────────────────────────────────┘
 */

export type Componente = "fator" | "oleo" | "shampoo" | "balm" | "spray" | "pasta"

/** Os tipos de produto, na ordem da tela dos Ajustes. */
export const COMPONENTES: readonly Componente[] = [
  "fator",
  "oleo",
  "shampoo",
  "balm",
  "spray",
  "pasta",
]

/** O nome de cada tipo na tela ("Fator de Crescimento"). */
export const NOME_DO_TIPO: Record<Componente, string> = {
  fator: "Fator de Crescimento",
  oleo: "Óleo",
  shampoo: "Shampoo",
  balm: "Balm",
  spray: "Spray",
  pasta: "Pasta",
}

/** Quantos dias dura cada frasco (o padrão do protótipo). */
export const DIAS_PADRAO: Record<Componente, number> = {
  fator: 30,
  oleo: 45,
  shampoo: 45,
  balm: 60,
  spray: 45,
  pasta: 60,
}

const NOME_DO_COMPONENTE: Record<Componente, string> = {
  fator: "o Fator de Crescimento",
  oleo: "o Óleo",
  shampoo: "o Shampoo",
  balm: "o Balm",
  spray: "o Spray",
  pasta: "a Pasta",
}

/** Os kits cujo endereço não diz o que vem dentro. */
const KITS: Record<string, Componente[]> = {
  "kit-completo-para-barba": ["shampoo", "balm", "oleo"],
}

/**
 * O que vem em cada produto, pelo SKU — o código do Bling, o mesmo na
 * Nuvemshop e no Medusa. Vale antes do endereço: os kits Essencial e
 * Hidratação não dizem no nome o que trazem. Produto novo: ponha aqui.
 */
const SKUS: Record<string, readonly (readonly [Componente, number])[]> = {
  FBFCB01: [["fator", 1]],
  FBKIT05: [["fator", 2]],
  FBKIT06: [["fator", 3]],
  FBKIT07: [["fator", 6]],
  FBSH01: [["shampoo", 1]],
  FBKIT03: [["shampoo", 2]],
  FBOL01: [["oleo", 1]],
  FBBM01: [["balm", 1]],
  FBMSP01: [["spray", 1]],
  FBPMT01: [["pasta", 1]],
  FBPBR01: [["pasta", 1]],
  FBKIT01: [
    ["shampoo", 1],
    ["balm", 1],
    ["oleo", 1],
  ],
  FBKIT02: [
    ["shampoo", 1],
    ["balm", 1],
  ],
  FBKIT04: [
    ["shampoo", 1],
    ["oleo", 1],
  ],
  FBKIT08: [
    ["fator", 1],
    ["shampoo", 1],
  ],
}

/**
 * O SKU do produto avulso de cada tipo: uma unidade, sozinho (o primeiro da
 * tabela — a pasta matte, das duas pastas). É o "repor" de quem comprou kit.
 */
export function skuAvulso(componente: Componente): string | null {
  for (const [sku, partes] of Object.entries(SKUS))
    if (partes.length === 1 && partes[0][0] === componente && partes[0][1] === 1) return sku
  return null
}

const PALAVRAS: [RegExp, Componente][] = [
  [/fator-de-crescimento/, "fator"],
  [/(^|-)oleo(-|$)/, "oleo"],
  [/(^|-)shampoo(-|$)/, "shampoo"],
  [/(^|-)balm(-|$)/, "balm"],
  [/(^|-)spray(-|$)/, "spray"],
  [/(^|-)pasta(-|$)/, "pasta"],
]

/**
 * O que vem em cada unidade do produto, pelo endereço dele:
 * "kit-3-fator-de-crescimento-para-barba" → 3 Fatores; "kit-shampoo-…-duplo"
 * → 2 Shampoos; "kit-fator-…-e-shampoo" → 1 Fator e 1 Shampoo. Vazio pro que
 * não se sabe.
 */
export function componentesDoProduto(
  handle: string | null | undefined
): { componente: Componente; unidades: number }[] {
  if (!handle) return []
  const h = handle.toLowerCase()
  const kit = KITS[h]
  if (kit) return kit.map((componente) => ({ componente, unidades: 1 }))
  const achados = PALAVRAS.filter(([re]) => re.test(h)).map(([, c]) => c)
  if (achados.length !== 1) return achados.map((componente) => ({ componente, unidades: 1 }))
  const n = Number(/(^|-)kit-(\d+)-/.exec(h)?.[2] ?? (/(^|-)duplo(-|$)/.test(h) ? 2 : 1))
  return [{ componente: achados[0], unidades: Number.isInteger(n) && n > 0 ? n : 1 }]
}

/**
 * O que vem em cada unidade de um item de pedido: pelo SKU, se ele está na
 * tabela; senão, pelo endereço do produto (`componentesDoProduto`).
 */
export function componentesDoItem(item: {
  sku?: string | null
  handle?: string | null
}): { componente: Componente; unidades: number }[] {
  const doSku = item.sku ? SKUS[item.sku.trim().toUpperCase()] : undefined
  if (doSku) return doSku.map(([componente, unidades]) => ({ componente, unidades }))
  return componentesDoProduto(item.handle)
}

export type ItemDaPessoa = {
  handle: string | null
  /** O SKU da variante (o código do Bling) — manda mais que o endereço. */
  sku?: string | null
  nome: string
  quantidade: number
}

export type PedidoDaPessoa = {
  id: string
  numero: string | null
  pagoEm: Date | null
  entregueEm: Date | null
  cancelado: boolean
  itens: ItemDaPessoa[]
  /** Os cupons que ela digitou (sem a oferta do checkout e a promoção automática). */
  cupons: string[]
}

export type SinaisDaPessoa = {
  ultimoClique: Date | null
  ultimaVisita: Date | null
  newsletterDesde: Date | null
}

export type Etapa =
  "lead" | "primeira-compra" | "em-tratamento" | "recorrente" | "em-risco" | "sunset"

export const NOME_DA_ETAPA: Record<Etapa, string> = {
  lead: "Lead",
  "primeira-compra": "1ª compra",
  "em-tratamento": "Em tratamento",
  recorrente: "Recorrente",
  "em-risco": "Em risco",
  sunset: "Sunset",
}

export type Engajamento = "quente" | "morno" | "frio"

export type Etiquetas = {
  etapa: { valor: Etapa; porque: string }
  engajamento: { valor: Engajamento; porque: string }
  /** Os dias desde a entrega do primeiro Fator (nulo: não comprou, ou está a caminho). */
  tratamento: { dia: number | null; porque: string }
  proximaCompra: { em: Date | null; porque: string; estimada: boolean }
  /** Nulo: sem compra paga ainda, não dá pra saber. */
  cupom: { valor: boolean | null; porque: string }
}

/** As regras das etiquetas, em dias (e em compras, a do cupom). */
export type RegrasDasEtiquetas = {
  /** Passou tantos dias do dia de comprar de novo: em risco (o resgate do plano). */
  toleranciaDaReposicao: number
  /** Sem saber quanto duram os produtos: em risco com tantos dias sem pedido. */
  semPrevisao: number
  /** Em risco há tantos dias, sem clicar nem visitar nesse tempo: sunset. */
  sunset: number
  /** O sinal mais novo até tantos dias: quente… */
  quente: number
  /** …até tantos: morno; depois, frio. */
  morno: number
  /** O "sensível a cupom" olha as últimas tantas compras. */
  comprasDoCupom: number
}

/** As regras do protótipo — o padrão, enquanto ninguém mudar nos Ajustes. */
export const REGRAS_PADRAO: RegrasDasEtiquetas = {
  toleranciaDaReposicao: 20,
  semPrevisao: 60,
  sunset: 45,
  quente: 30,
  morno: 90,
  comprasDoCupom: 3,
}

const DIA_MS = 24 * 60 * 60 * 1000
/** Sem o aviso de entrega, conta como entregue 7 dias depois de pago… */
const ENTREGA_ESTIMADA_DIAS = 7
/** …a partir de 10 dias pago (antes, está "a caminho"). */
const SEM_AVISO_DE_ENTREGA_DIAS = 10

const mais = (d: Date, dias: number) => new Date(d.getTime() + dias * DIA_MS)
const diasEntre = (de: Date, ate: Date) => Math.floor((ate.getTime() - de.getTime()) / DIA_MS)
const haDias = (n: number) => (n <= 0 ? "hoje" : n === 1 ? "há 1 dia" : `há ${n} dias`)

/** A entrega do pedido: a do aviso, ou a estimada (pago + 7) depois de 10 dias sem aviso. */
function entregaDo(p: PedidoDaPessoa, agora: Date): { em: Date; estimada: boolean } | null {
  if (p.entregueEm) return { em: p.entregueEm, estimada: false }
  if (p.pagoEm && diasEntre(p.pagoEm, agora) >= SEM_AVISO_DE_ENTREGA_DIAS)
    return { em: mais(p.pagoEm, ENTREGA_ESTIMADA_DIAS), estimada: true }
  return null
}

/** Quando acaba o primeiro produto do pedido, a contar da entrega. */
export function quandoAcaba(
  p: PedidoDaPessoa,
  base: Date,
  dias: Record<Componente, number> = DIAS_PADRAO
): { em: Date; componente: Componente; unidades: number } | null {
  let melhor: { em: Date; componente: Componente; unidades: number } | null = null
  for (const item of p.itens) {
    for (const { componente, unidades } of componentesDoItem(item)) {
      const total = unidades * Math.max(1, item.quantidade)
      const em = mais(base, total * dias[componente])
      if (!melhor || em < melhor.em) melhor = { em, componente, unidades: total }
    }
  }
  return melhor
}

const temFator = (p: PedidoDaPessoa) =>
  p.itens.some((i) => componentesDoItem(i).some((c) => c.componente === "fator"))

export function etiquetasDaPessoa(entrada: {
  pedidos: PedidoDaPessoa[]
  sinais: SinaisDaPessoa
  agora: Date
  dias?: Record<Componente, number>
  regras?: RegrasDasEtiquetas
}): Etiquetas {
  const { sinais, agora, dias = DIAS_PADRAO, regras = REGRAS_PADRAO } = entrada
  const pagos = entrada.pedidos
    .filter((p) => p.pagoEm && !p.cancelado)
    .sort((a, b) => a.pagoEm!.getTime() - b.pagoEm!.getTime())
  const ultimo = pagos.at(-1) ?? null

  /* ── a próxima compra ── */
  let proximaCompra: Etiquetas["proximaCompra"] = {
    em: null,
    porque: "ainda não comprou",
    estimada: false,
  }
  if (ultimo) {
    const entrega = entregaDo(ultimo, agora)
    const base = entrega ?? { em: mais(ultimo.pagoEm!, ENTREGA_ESTIMADA_DIAS), estimada: true }
    const acaba = quandoAcaba(ultimo, base.em, dias)
    proximaCompra = acaba
      ? {
          em: acaba.em,
          estimada: base.estimada,
          porque:
            `acaba ${NOME_DO_COMPONENTE[acaba.componente]}` +
            (acaba.unidades > 1 ? ` (${acaba.unidades} unidades)` : "") +
            (base.estimada ? ", com a entrega estimada" : ""),
        }
      : {
          em: null,
          estimada: false,
          porque: "não se sabe quanto duram os produtos do último pedido",
        }
  }

  /* ── a etapa ── */
  const ultimoSinalDeInteresse = maisNova([sinais.ultimoClique, sinais.ultimaVisita])
  let etapa: Etiquetas["etapa"]
  const risco = (() => {
    if (!ultimo) return null
    if (proximaCompra.em) {
      const desde = mais(proximaCompra.em, regras.toleranciaDaReposicao)
      return agora >= desde
        ? {
            desde,
            porque:
              regras.toleranciaDaReposicao > 0
                ? `passou ${regras.toleranciaDaReposicao} ${regras.toleranciaDaReposicao === 1 ? "dia" : "dias"} do dia de comprar de novo (${dia(proximaCompra.em)})`
                : `passou o dia de comprar de novo (${dia(proximaCompra.em)})`,
          }
        : null
    }
    const desde = mais(ultimo.pagoEm!, regras.semPrevisao)
    return agora >= desde ? { desde, porque: `${regras.semPrevisao} dias sem pedido` } : null
  })()
  if (!ultimo) {
    etapa = { valor: "lead", porque: "tem e-mail e ainda não comprou" }
  } else if (risco) {
    const sumiu =
      diasEntre(risco.desde, agora) >= regras.sunset &&
      (!ultimoSinalDeInteresse || diasEntre(ultimoSinalDeInteresse, agora) >= regras.sunset)
    etapa = sumiu
      ? {
          valor: "sunset",
          porque: `em risco há mais de ${regras.sunset} dias, sem clicar nem visitar a loja`,
        }
      : { valor: "em-risco", porque: risco.porque }
  } else if (pagos.length >= 2) {
    etapa = { valor: "recorrente", porque: `${pagos.length} pedidos pagos` }
  } else {
    const entrega = entregaDo(ultimo, agora)
    etapa = entrega
      ? {
          valor: "em-tratamento",
          porque: `1 pedido, ${entrega.estimada ? "entregue por volta de" : "recebido em"} ${dia(entrega.em)}`,
        }
      : {
          valor: "primeira-compra",
          porque: `pagou o pedido${ultimo.numero ? ` #${ultimo.numero}` : ""}, que ainda não chegou`,
        }
  }

  /* ── o engajamento ── */
  const sinaisComNome: [Date | null, string][] = [
    [sinais.ultimoClique, "clicou num e-mail da loja"],
    [sinais.ultimaVisita, "visitou a loja"],
    [ultimo?.pagoEm ?? null, "comprou"],
    [sinais.newsletterDesde, "assinou a newsletter"],
  ]
  const [quando, oque] = sinaisComNome
    .filter((s): s is [Date, string] => s[0] !== null)
    .sort((a, b) => b[0].getTime() - a[0].getTime())[0] ?? [null, ""]
  const engajamento: Etiquetas["engajamento"] = !quando
    ? { valor: "frio", porque: "nenhum sinal ainda" }
    : {
        valor:
          diasEntre(quando, agora) <= regras.quente
            ? "quente"
            : diasEntre(quando, agora) <= regras.morno
              ? "morno"
              : "frio",
        porque: `${oque} ${haDias(diasEntre(quando, agora))}`,
      }

  /* ── o dia do tratamento (o Fator) ── */
  const primeiroFator = pagos.find(temFator)
  let tratamento: Etiquetas["tratamento"]
  if (!primeiroFator) tratamento = { dia: null, porque: "não comprou o Fator de Crescimento" }
  else {
    const entrega = entregaDo(primeiroFator, agora)
    tratamento = entrega
      ? {
          dia: Math.max(0, diasEntre(entrega.em, agora)),
          porque: `desde a entrega do primeiro Fator (${entrega.estimada ? "por volta de " : ""}${dia(entrega.em)})`,
        }
      : { dia: null, porque: "o primeiro Fator está a caminho" }
  }

  /* ── sensível a cupom ── */
  const ultimas = pagos.slice(-regras.comprasDoCupom)
  const comCupom = ultimas.filter((p) => p.cupons.length > 0).length
  const cupom: Etiquetas["cupom"] = !ultimas.length
    ? { valor: null, porque: "ainda não comprou" }
    : {
        valor: comCupom === ultimas.length,
        porque:
          ultimas.length === 1
            ? `a ${pagos.length === 1 ? "única" : "última"} compra foi ${comCupom ? "com" : "sem"} cupom`
            : `${comCupom} das últimas ${ultimas.length} compras com cupom`,
      }

  return { etapa, engajamento, tratamento, proximaCompra, cupom }
}

function maisNova(datas: (Date | null)[]): Date | null {
  return datas.reduce<Date | null>((a, d) => (d && (!a || d > a) ? d : a), null)
}
