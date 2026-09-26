import { datasDo, SO_AS_COMPRAS_DA_LOJA, soDoEndereco, type Periodo } from "./marketing"
import { nomeDaOrigem, type LinhaGa4, type RelatorioGa4 } from "./visitas"

/**
 * OS CANAIS DO MARKETING — de onde vêm as visitas e as vendas, pelo Google
 * Analytics, e as campanhas (os links com UTM). A aba "Canais" do protótipo.
 * Código puro, com testes (`__tests__/marketing-canais.unit.spec.ts`).
 *
 * AS VISITAS são as sessões do endereço da loja (o `hostName`, como no
 * Resumo: o Analytics é o mesmo do site da Nuvemshop até a virada).
 *
 * AS VENDAS são as compras que a loja manda pro GA4 pelo servidor (entrega
 * 0094), com a sessão de quem comprou: o GA4 dá a origem da sessão. Elas não
 * têm página, então o filtro delas é o id do pedido (`SO_AS_COMPRAS_DA_LOJA`).
 *
 * QUEM RECUSA OS COOKIES não entra no GA4 — nem a visita, nem a compra. Os
 * pedidos pagos da loja que o GA4 não viu ficam à parte (`semOrigem`): a
 * soma dos canais mais eles é o que a loja vendeu.
 */

export type LinhaDoCanal = {
  nome: string
  visitas: number
  pedidos: number
  receita: number
  /** De cada 100 visitas do canal, quantas viraram pedido pago (duas casas); `null` sem visita. */
  conversao: number | null
}

export type Campanha = {
  nome: string
  /** O canal de onde a campanha mais trouxe gente. */
  canal: string
  visitas: number
  pedidos: number
  receita: number
}

export type Achado = {
  tipo: "bom" | "problema" | "oportunidade" | "info"
  titulo: string
  texto: string
}

export type Canais = {
  canais: LinhaDoCanal[]
  campanhas: Campanha[]
  totais: { visitas: number; pedidos: number; receita: number }
  /** Os pedidos pagos da loja que o GA4 não viu (quem recusou os cookies). */
  semOrigem: { pedidos: number; receita: number }
  achado: Achado | null
}

const centavos = (v: number) => Math.round(v * 100) / 100
const numero = (v: string | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}
const dimensao = (l: LinhaGa4, i: number) => l.dimensionValues?.[i]?.value ?? ""
const metrica = (l: LinhaGa4, i: number) => numero(l.metricValues?.[i]?.value ?? undefined)
const porcento = (v: number) => `${v.toFixed(2).replace(".", ",")}%`

/** Meio de anúncio pago: o que o link do Google Ads e dos anúncios das redes traz. */
const PAGO = /^(cpc|ppc|paid|paidsocial|paid[-_]social|ads?)$/

/**
 * O nome do canal que o dono reconhece, pela origem e o meio da sessão: o
 * do Início (`nomeDaOrigem`), com o anúncio separado da busca e o
 * influenciador (o do montador de link) com nome próprio.
 */
export function canalDe(fonte: string, meio: string): string {
  const f = fonte.trim().toLowerCase()
  const m = meio.trim().toLowerCase()
  if (/^influenciador/.test(f)) return "Influenciadores"
  const nome = nomeDaOrigem(fonte, meio)
  if (nome === "Google") return PAGO.test(m) ? "Google (anúncio)" : "Google (busca)"
  if ((nome === "Instagram" || nome === "Facebook" || nome === "TikTok") && PAGO.test(m))
    return `${nome} (anúncio)`
  return nome
}

/** A campanha de verdade: a do link com UTM — o GA4 põe as dele entre parênteses. */
const ehCampanha = (nome: string) => Boolean(nome.trim()) && !/^\(.*\)$/.test(nome.trim())

/** As duas perguntas ao GA4: as visitas por origem, meio e campanha, e as compras da loja. */
export function perguntasDosCanais(periodo: Periodo, hosts: string[]) {
  const dimensions = [
    { name: "sessionSource" },
    { name: "sessionMedium" },
    { name: "sessionCampaignName" },
  ]
  const endereco = soDoEndereco(hosts)
  return [
    {
      dateRanges: datasDo(periodo),
      dimensions,
      metrics: [{ name: "sessions" }],
      ...(endereco ? { dimensionFilter: endereco } : {}),
      limit: "1000",
    },
    {
      dateRanges: datasDo(periodo),
      dimensions,
      metrics: [{ name: "ecommercePurchases" }, { name: "purchaseRevenue" }],
      dimensionFilter: SO_AS_COMPRAS_DA_LOJA,
      limit: "1000",
    },
  ]
}

/**
 * Os canais e as campanhas do período. `pagos`: os pedidos pagos da loja no
 * período (o Medusa) — o que passar do que o GA4 viu fica "sem origem".
 */
export function montarCanais(
  [visitas, compras]: RelatorioGa4[],
  pagos: { pedidos: number; receita: number }
): Canais {
  const canais = new Map<string, LinhaDoCanal>()
  const campanhas = new Map<string, Campanha & { deOnde: Map<string, number> }>()
  const canal = (nome: string) => {
    const atual = canais.get(nome) ?? { nome, visitas: 0, pedidos: 0, receita: 0, conversao: null }
    canais.set(nome, atual)
    return atual
  }
  const campanha = (nome: string) => {
    const atual = campanhas.get(nome) ?? {
      nome,
      canal: "",
      visitas: 0,
      pedidos: 0,
      receita: 0,
      deOnde: new Map<string, number>(),
    }
    campanhas.set(nome, atual)
    return atual
  }

  for (const l of visitas?.rows ?? []) {
    const nome = canalDe(dimensao(l, 0), dimensao(l, 1))
    const n = metrica(l, 0)
    canal(nome).visitas += n
    if (ehCampanha(dimensao(l, 2))) {
      const c = campanha(dimensao(l, 2).trim())
      c.visitas += n
      c.deOnde.set(nome, (c.deOnde.get(nome) ?? 0) + n)
    }
  }
  for (const l of compras?.rows ?? []) {
    const nome = canalDe(dimensao(l, 0), dimensao(l, 1))
    const [pedidos, receita] = [metrica(l, 0), metrica(l, 1)]
    const linha = canal(nome)
    linha.pedidos += pedidos
    linha.receita = centavos(linha.receita + receita)
    if (ehCampanha(dimensao(l, 2))) {
      const c = campanha(dimensao(l, 2).trim())
      c.pedidos += pedidos
      c.receita = centavos(c.receita + receita)
      // Compra sem visita no período (a visita foi antes): o canal vem da compra.
      if (!c.deOnde.size) c.deOnde.set(nome, 0)
    }
  }

  const linhas = [...canais.values()]
    .map((l) => ({
      ...l,
      conversao: l.visitas > 0 ? Math.round((l.pedidos / l.visitas) * 10_000) / 100 : null,
    }))
    .sort((a, b) => b.receita - a.receita || b.visitas - a.visitas || a.nome.localeCompare(b.nome))
  const totais = {
    visitas: linhas.reduce((s, l) => s + l.visitas, 0),
    pedidos: linhas.reduce((s, l) => s + l.pedidos, 0),
    receita: centavos(linhas.reduce((s, l) => s + l.receita, 0)),
  }
  const lista: Canais = {
    canais: linhas,
    campanhas: [...campanhas.values()]
      .map(({ deOnde, ...c }) => ({
        ...c,
        canal: [...deOnde.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
      }))
      .sort(
        (a, b) => b.receita - a.receita || b.visitas - a.visitas || a.nome.localeCompare(b.nome)
      ),
    totais,
    semOrigem: {
      pedidos: Math.max(0, pagos.pedidos - totais.pedidos),
      receita: Math.max(0, centavos(pagos.receita - totais.receita)),
    },
    achado: null,
  }
  return { ...lista, achado: achadoDosCanais(lista) }
}

/** Abaixo disso, qualquer diferença entre os canais pode ser acaso. */
export const MINIMO_PRA_CONCLUIR = { visitas: 200, pedidos: 5, doCanal: 30 }

/**
 * O que os canais querem dizer, numa frase: o que vende mais por visita
 * contra o que traz mais gente — ou que ainda é pouco pra dizer.
 */
export function achadoDosCanais(c: Omit<Canais, "achado">): Achado | null {
  const { visitas, pedidos } = c.totais
  if (visitas < MINIMO_PRA_CONCLUIR.visitas || pedidos < MINIMO_PRA_CONCLUIR.pedidos)
    return {
      tipo: "info",
      titulo: "Ainda é pouco pra comparar os canais",
      texto:
        `${visitas} visitas e ${pedidos} ${pedidos === 1 ? "pedido" : "pedidos"} com origem no período: ` +
        "qualquer diferença entre os canais pode ser acaso. Com mais gente (depois da virada), " +
        "aqui aparece qual canal vende mais.",
    }
  const comVolume = c.canais.filter(
    (l) =>
      l.visitas >= MINIMO_PRA_CONCLUIR.doCanal && l.conversao !== null && l.nome !== "Sem origem"
  )
  if (!comVolume.length) return null
  const melhor = [...comVolume].sort((a, b) => b.conversao! - a.conversao!)[0]
  const maior = [...comVolume].sort((a, b) => b.visitas - a.visitas)[0]
  if (melhor.nome === maior.nome)
    return {
      tipo: "bom",
      titulo: `${melhor.nome} é o canal que mais traz gente e que mais vende`,
      texto: `${melhor.nome} converte ${porcento(melhor.conversao!)} das visitas. Vale reforçar o que funciona lá.`,
    }
  const vezes = Math.round(maior.visitas / Math.max(1, melhor.visitas))
  return {
    tipo: "bom",
    titulo: `${melhor.nome} vende mais por visita; ${maior.nome} traz mais gente`,
    texto:
      `${melhor.nome} converte ${porcento(melhor.conversao!)} das visitas; ${maior.nome}, ` +
      `${porcento(maior.conversao!)}` +
      (vezes > 1 ? ` — mas traz ${vezes} vezes mais visitas` : "") +
      `. Os dois juntos: ${maior.nome} pra trazer, ${melhor.nome} pra fechar.`,
  }
}
