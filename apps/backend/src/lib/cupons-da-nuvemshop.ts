import { PREFIXO_DO_BUMP } from "./bumps"
import { hojeEmBrasilia, promocaoDoCupom, type CupomNovo } from "./cupons"

/**
 * OS CUPONS DA NUVEMSHOP NA LOJA NOVA — quem já tem um código continua
 * usando depois da virada.
 *
 * A lista é a que o dono mandou em 26/09: todos os cupons ativos da
 * Nuvemshop naquele dia, escritos aqui como a Nuvemshop mostra, coluna por
 * coluna. Quem cria é a migração `migration-scripts/cupons-da-nuvemshop.ts`,
 * UMA vez, no deploy — do mesmo jeito que o painel cria (`promocaoDoCupom`,
 * em `lib/cupons.ts`): os cupons aparecem em Cupons e descontos, com a chave
 * de pausar.
 *
 * COMO CADA COLUNA DE LÁ VIRA CUPOM AQUI (`lerCupomDaNuvemshop`):
 *   - Desconto: "10 %" é porcentagem; "R$ 20", reais. Os dois só nos
 *     produtos, como lá ("Frete: Não incluído").
 *   - Usos: "0 de 1" é limite — 1 uso no total, menos o que já foi usado lá.
 *     "14 usos" é sem limite, e a conta daqui começa do zero.
 *   - Vigência: "… até 29/09/2026 às 23:59" vale até o fim do dia 29/09, em
 *     Brasília, como lá. O começo já tinha passado em todos.
 *   - Limites: "Sem limites" não põe condição. "1 limite" é uma condição que
 *     a lista não mostra: entra pela `condicao`, com o que o dono disser, e
 *     sem ela o cupom fica de fora.
 *
 * O QUE FICA DE FORA, com o motivo no log do deploy (`planoDosCupons`): o
 * frete grátis (o cupom de frete ainda não existe aqui — ESTADO.md, "Cupons
 * e descontos"), o "1 limite" sem a `condicao`, o que já tiver vencido no
 * dia do deploy (os de poucos dias, com o nome do cliente no código) e o
 * código que já existe no Medusa, em qualquer caixa.
 *
 * O código fica como era lá, com "_" e tudo: o painel não aceita "_" num
 * cupom novo, mas o Medusa e a loja aceitam, e a pessoa digita o que recebeu.
 */

/** Uma linha da lista de cupons da Nuvemshop, como ela mostra. */
export type CupomDaNuvemshop = {
  codigo: string
  /** "10 %", "R$ 20" ou "Frete grátis". */
  desconto: string
  /** "0 de 1" (com limite) ou "14 usos" (sem). */
  usos: string
  /** Quando não é "Indeterminada": "26/09/2026 às 00:00 até 29/09/2026 às 23:59". */
  vigencia?: string
  /** Quando não é "Sem limites": "1 limite". */
  limites?: string
  /** O que o "1 limite" quer dizer: a lista não mostra, e quem diz é o dono. */
  condicao?: Partial<Pick<CupomNovo, "minimo" | "porCliente" | "primeiraCompra" | "combina">>
}

/** O dia da lista: o que ela diz de usos e de "ativo" é desse dia. */
export const DIA_DA_LISTA = "2026-09-26"

// prettier-ignore
export const CUPONS_DA_NUVEMSHOP: CupomDaNuvemshop[] = [
  { codigo: "0P2XSB", desconto: "10 %", usos: "0 de 1" },
  { codigo: "10PILA", desconto: "R$ 10", usos: "1 uso", limites: "1 limite" },
  { codigo: "1A3LZK", desconto: "10 %", usos: "0 de 1" },
  { codigo: "1NODFR", desconto: "10 %", usos: "0 de 1" },
  { codigo: "1QQVYJ", desconto: "10 %", usos: "0 de 1" },
  { codigo: "2P7L09", desconto: "10 %", usos: "0 de 1" },
  { codigo: "310GSE", desconto: "10 %", usos: "0 de 1" },
  { codigo: "3W9JZO", desconto: "10 %", usos: "0 de 1" },
  { codigo: "40YI0O", desconto: "10 %", usos: "0 de 1" },
  { codigo: "46357H", desconto: "10 %", usos: "0 de 1" },
  { codigo: "6CV0E6", desconto: "10 %", usos: "0 de 1" },
  { codigo: "6D7ER6", desconto: "10 %", usos: "0 de 1" },
  { codigo: "6PZYH2", desconto: "10 %", usos: "0 de 1" },
  { codigo: "6ZSZ23", desconto: "10 %", usos: "0 de 1" },
  { codigo: "7D9ZO1", desconto: "10 %", usos: "0 de 1" },
  { codigo: "8ZKJV4", desconto: "10 %", usos: "0 de 1" },
  { codigo: "979W00", desconto: "10 %", usos: "0 de 1" },
  { codigo: "9ZUELC", desconto: "10 %", usos: "0 de 1" },
  { codigo: "A1SZ1N", desconto: "10 %", usos: "0 de 1" },
  { codigo: "A5OD1M", desconto: "10 %", usos: "0 de 1" },
  { codigo: "AQESXY", desconto: "10 %", usos: "0 de 1" },
  { codigo: "ARTHUR10", desconto: "10 %", usos: "14 usos" },
  { codigo: "ARTHUR20", desconto: "R$ 20", usos: "0 de 1" },
  { codigo: "ARTIDA10_7XGS", desconto: "10 %", usos: "0 de 1", vigencia: "26/09/2026 às 00:00 até 29/09/2026 às 23:59" },
  { codigo: "BARBA15", desconto: "15 %", usos: "14 usos" },
  { codigo: "BE7XK9", desconto: "10 %", usos: "0 de 1" },
  { codigo: "CARLOS10_FRJR", desconto: "10 %", usos: "0 de 1", vigencia: "24/09/2026 às 00:00 até 27/09/2026 às 23:59" },
  { codigo: "CLEYTO10_KE9T", desconto: "10 %", usos: "0 de 1", vigencia: "26/09/2026 às 00:00 até 29/09/2026 às 23:59" },
  { codigo: "CUPOM20", desconto: "R$ 20", usos: "0 de 1" },
  { codigo: "DANILODANGER", desconto: "10 %", usos: "1 uso" },
  { codigo: "DG6V0X", desconto: "10 %", usos: "0 de 1" },
  { codigo: "DICAS016", desconto: "10 %", usos: "0 usos" },
  { codigo: "DOMSABINO", desconto: "10 %", usos: "0 usos" },
  { codigo: "EIIELW", desconto: "10 %", usos: "0 de 1" },
  { codigo: "FELIPELISITA", desconto: "10 %", usos: "1 uso" },
  { codigo: "FLAVIO10_FM5X", desconto: "10 %", usos: "0 de 1", vigencia: "24/09/2026 às 00:00 até 27/09/2026 às 23:59" },
  { codigo: "FOLTRAN10", desconto: "10 %", usos: "1 uso" },
  { codigo: "FRETEG", desconto: "Frete grátis", usos: "1 uso", limites: "1 limite" },
  { codigo: "FRETEGRATISDOM", desconto: "Frete grátis", usos: "0 de 1" },
  { codigo: "FUCKING10OFF", desconto: "10 %", usos: "9 usos" },
  { codigo: "GAB10", desconto: "10 %", usos: "2 usos" },
  { codigo: "GABRIEL10", desconto: "10 %", usos: "0 usos" },
  { codigo: "H5VHLF", desconto: "10 %", usos: "0 de 1" },
  { codigo: "HENRIQ10_9HYJ", desconto: "10 %", usos: "0 de 1", vigencia: "23/09/2026 às 00:00 até 26/09/2026 às 23:59" },
  { codigo: "HZ2Z0U", desconto: "10 %", usos: "0 de 1" },
  { codigo: "ITAPEMA25", desconto: "R$ 25", usos: "1 uso", limites: "1 limite" },
  { codigo: "JAO10", desconto: "10 %", usos: "0 usos" },
  { codigo: "JED10", desconto: "10 %", usos: "0 usos" },
  { codigo: "JOO10_7YR8", desconto: "10 %", usos: "0 de 1", vigencia: "24/09/2026 às 00:00 até 27/09/2026 às 23:59" },
  { codigo: "K5Q6YA", desconto: "10 %", usos: "0 de 1" },
  { codigo: "KEX773", desconto: "10 %", usos: "0 de 1" },
  { codigo: "KIT15", desconto: "15 %", usos: "0 de 1", limites: "1 limite" },
  { codigo: "KXWRXG", desconto: "10 %", usos: "0 de 1" },
  { codigo: "LEANDRO20", desconto: "R$ 20", usos: "0 de 1" },
  { codigo: "LEMESAK", desconto: "10 %", usos: "1 uso" },
  { codigo: "LHMMZG", desconto: "10 %", usos: "0 de 1" },
  { codigo: "LUIZ10_K8C7", desconto: "10 %", usos: "0 de 1", vigencia: "24/09/2026 às 00:00 até 27/09/2026 às 23:59" },
  { codigo: "M08DMX", desconto: "10 %", usos: "0 de 1" },
  { codigo: "MARCEL10_26ZC", desconto: "10 %", usos: "0 de 1", vigencia: "23/09/2026 às 00:00 até 26/09/2026 às 23:59" },
  { codigo: "MARIA10_T5AL", desconto: "10 %", usos: "0 de 1", vigencia: "26/09/2026 às 00:00 até 29/09/2026 às 23:59" },
  { codigo: "MARIA10_ZVDB", desconto: "10 %", usos: "0 de 1", vigencia: "25/09/2026 às 00:00 até 28/09/2026 às 23:59" },
  { codigo: "MGK395", desconto: "10 %", usos: "0 de 1" },
  { codigo: "MORETTI10", desconto: "10 %", usos: "0 usos" },
  { codigo: "MRFADE", desconto: "10 %", usos: "0 usos" },
  { codigo: "MUV18Z", desconto: "10 %", usos: "0 de 1" },
  { codigo: "NAPLA9", desconto: "10 %", usos: "0 de 1" },
  { codigo: "NI2SSW", desconto: "10 %", usos: "0 de 1" },
  { codigo: "NUTRILM", desconto: "10 %", usos: "0 usos" },
  { codigo: "O8Z0TI", desconto: "10 %", usos: "0 de 1" },
  { codigo: "OHENRIQUE", desconto: "10 %", usos: "13 usos" },
  { codigo: "OVONY7", desconto: "10 %", usos: "0 de 1" },
  { codigo: "PAGLARIN10", desconto: "10 %", usos: "0 usos" },
  { codigo: "PALMIERE", desconto: "10 %", usos: "1 uso" },
  { codigo: "PFSPFC", desconto: "10 %", usos: "0 de 1" },
  { codigo: "PR10", desconto: "10 %", usos: "0 usos" },
  { codigo: "PRIMEIRA10", desconto: "10 %", usos: "3 usos", limites: "1 limite" },
  { codigo: "PRIMEIRACOMPRA", desconto: "10 %", usos: "170 usos" },
  { codigo: "PRIMEIRACOMPRA15", desconto: "15 %", usos: "0 usos" },
  { codigo: "Q3EV50", desconto: "10 %", usos: "0 de 1" },
  { codigo: "Q8ZZOH", desconto: "10 %", usos: "0 de 1" },
  { codigo: "QD0BQ2", desconto: "10 %", usos: "0 de 1" },
  { codigo: "R19L7L", desconto: "10 %", usos: "0 de 1" },
  { codigo: "RAN35A", desconto: "10 %", usos: "0 de 1" },
  { codigo: "RIBEIRO", desconto: "10 %", usos: "0 usos", limites: "1 limite" },
  { codigo: "RICARDO10", desconto: "10 %", usos: "0 de 1" },
  { codigo: "RICK10", desconto: "10 %", usos: "0 usos" },
  { codigo: "RUBIS", desconto: "10 %", usos: "0 usos" },
  { codigo: "S7EG85", desconto: "10 %", usos: "0 de 1" },
  { codigo: "SANDRO10", desconto: "10 %", usos: "0 de 1" },
  { codigo: "T7M8MP", desconto: "10 %", usos: "0 de 1" },
  { codigo: "THOMAS10", desconto: "10 %", usos: "0 usos" },
  { codigo: "TW4I7P", desconto: "10 %", usos: "0 de 1" },
  { codigo: "TWUDX2", desconto: "10 %", usos: "0 de 1" },
  { codigo: "ULTIMOPASSO10OFF", desconto: "10 %", usos: "0 usos" },
  { codigo: "UVUEUJ", desconto: "10 %", usos: "0 de 1" },
  { codigo: "VAI0MN", desconto: "10 %", usos: "0 de 1" },
  { codigo: "VAN3BI", desconto: "10 %", usos: "0 de 1" },
  { codigo: "VANS10OFF", desconto: "10 %", usos: "3 usos" },
  { codigo: "VICTOR10_YMMY", desconto: "10 %", usos: "0 de 1", vigencia: "26/09/2026 às 00:00 até 29/09/2026 às 23:59" },
  { codigo: "VM10", desconto: "10 %", usos: "0 usos" },
  { codigo: "VOLTA10", desconto: "10 %", usos: "13 usos" },
  { codigo: "WB0GSU", desconto: "10 %", usos: "0 de 1" },
  { codigo: "WILSON10_6XU5", desconto: "10 %", usos: "0 de 1", vigencia: "25/09/2026 às 00:00 até 28/09/2026 às 23:59" },
  { codigo: "XL9UAF", desconto: "10 %", usos: "0 de 1" },
  { codigo: "Y19SXM", desconto: "10 %", usos: "0 de 1" },
  { codigo: "YBUDTA", desconto: "10 %", usos: "0 de 1" },
  { codigo: "YMW4C8", desconto: "10 %", usos: "0 de 1" },
  { codigo: "Z1ZHO0", desconto: "10 %", usos: "0 de 1" },
  { codigo: "ZEPAULO", desconto: "10 %", usos: "0 usos" },
  { codigo: "ZHSTGF", desconto: "10 %", usos: "0 de 1" },
  { codigo: "ZKVI3I", desconto: "10 %", usos: "0 de 1" },
]

/* ── a leitura de uma linha ────────────────────────────────────────────── */

export type LeituraDaNuvemshop = { ok: true; cupom: CupomNovo } | { ok: false; motivo: string }

/** O código como lá: maiúsculas, números, "-" e "_". */
const CODIGO = /^[A-Z0-9][A-Z0-9_-]{2,29}$/
const PORCENTO = /^(\d{1,3}) ?%$/
const REAIS = /^R\$ ?(\d{1,5}(?:,\d{1,2})?)$/
const COM_LIMITE = /^(\d+) de (\d+)$/
const SEM_LIMITE = /^\d+ usos?$/
const VIGENCIA = /^\d{2}\/\d{2}\/\d{4} às \d{2}:\d{2} até (\d{2})\/(\d{2})\/(\d{4}) às 23:59$/

/** A linha de lá como o cupom do painel — ou por que ela não vira cupom. */
export function lerCupomDaNuvemshop(c: CupomDaNuvemshop): LeituraDaNuvemshop {
  if (!CODIGO.test(c.codigo) || c.codigo.startsWith(PREFIXO_DO_BUMP))
    return { ok: false, motivo: `código que a loja não usa: "${c.codigo}"` }

  if (c.desconto === "Frete grátis")
    return { ok: false, motivo: "frete grátis — o cupom de frete ainda não existe na loja nova" }
  const porcento = c.desconto.match(PORCENTO)
  const reais = c.desconto.match(REAIS)
  const valor = porcento ? Number(porcento[1]) : reais ? Number(reais[1].replace(",", ".")) : NaN
  if (porcento ? valor < 1 || valor > 100 : !reais || valor <= 0)
    return { ok: false, motivo: `desconto que não sei ler: "${c.desconto}"` }

  const comLimite = c.usos.match(COM_LIMITE)
  if (!comLimite && !SEM_LIMITE.test(c.usos))
    return { ok: false, motivo: `usos que não sei ler: "${c.usos}"` }
  const limite = comLimite ? Number(comLimite[2]) - Number(comLimite[1]) : null
  if (limite !== null && limite < 1) return { ok: false, motivo: `esgotado lá (${c.usos})` }

  const fim = c.vigencia ? c.vigencia.match(VIGENCIA) : null
  if (c.vigencia && !fim) return { ok: false, motivo: `vigência que não sei ler: "${c.vigencia}"` }

  if (c.limites && !c.condicao)
    return { ok: false, motivo: `"${c.limites}" na Nuvemshop, e a lista não diz qual` }

  return {
    ok: true,
    cupom: {
      codigo: c.codigo,
      tipo: porcento ? "porcento" : "reais",
      valor,
      soMaisBarato: false,
      aplicarA: "loja",
      alvos: [],
      combina: c.condicao?.combina !== false,
      limite,
      porCliente: c.condicao?.porCliente ?? null,
      primeiraCompra: c.condicao?.primeiraCompra === true,
      de: null,
      ate: fim ? `${fim[3]}-${fim[2]}-${fim[1]}` : null,
      minimo: c.condicao?.minimo ?? null,
    },
  }
}

/* ── o plano da migração ───────────────────────────────────────────────── */

export type PromocaoDaNuvemshop = ReturnType<typeof promocaoDoCupom> & {
  metadata: { fb_nuvemshop: Omit<CupomDaNuvemshop, "codigo" | "condicao"> & { lista: string } }
}

export type PlanoDosCupons = {
  /**
   * Na ordem de criar: de Z a A. A lista do painel põe o mais novo em cima,
   * e assim ela lê de A a Z, como a da Nuvemshop.
   */
  criar: { codigo: string; promocao: PromocaoDaNuvemshop }[]
  jaExistem: string[]
  deFora: { codigo: string; motivo: string }[]
}

/**
 * O que a migração cria, o que pula (o código que já existe no Medusa, em
 * qualquer caixa) e o que fica de fora, com o motivo. A promoção é a do
 * painel, com a linha de lá guardada em `metadata.fb_nuvemshop`.
 */
export function planoDosCupons(
  lista: CupomDaNuvemshop[],
  existentes: (string | null | undefined)[],
  agora: Date
): PlanoDosCupons {
  const jaTem = new Set(existentes.filter(Boolean).map((c) => String(c).toUpperCase()))
  const hoje = hojeEmBrasilia(agora)
  const plano: PlanoDosCupons = { criar: [], jaExistem: [], deFora: [] }
  for (const linha of lista) {
    if (jaTem.has(linha.codigo.toUpperCase())) {
      plano.jaExistem.push(linha.codigo)
      continue
    }
    const lido = lerCupomDaNuvemshop(linha)
    if (!lido.ok) {
      plano.deFora.push({ codigo: linha.codigo, motivo: lido.motivo })
      continue
    }
    const { ate } = lido.cupom
    if (ate !== null && ate < hoje) {
      plano.deFora.push({
        codigo: linha.codigo,
        motivo: `venceu em ${ate.slice(8, 10)}/${ate.slice(5, 7)}`,
      })
      continue
    }
    const promocao = promocaoDoCupom(lido.cupom, "Nuvemshop", agora)
    const colunas = {
      desconto: linha.desconto,
      usos: linha.usos,
      ...(linha.vigencia ? { vigencia: linha.vigencia } : {}),
      ...(linha.limites ? { limites: linha.limites } : {}),
    }
    plano.criar.push({
      codigo: linha.codigo,
      promocao: {
        ...promocao,
        metadata: { ...promocao.metadata, fb_nuvemshop: { ...colunas, lista: DIA_DA_LISTA } },
      },
    })
    jaTem.add(linha.codigo.toUpperCase())
  }
  plano.criar.sort((a, b) => (a.codigo < b.codigo ? 1 : a.codigo > b.codigo ? -1 : 0))
  return plano
}
