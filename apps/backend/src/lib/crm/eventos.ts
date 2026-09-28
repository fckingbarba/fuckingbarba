import { createHash } from "node:crypto"
import { normalizarEmail } from "../../modules/codigo/regras"
import { dominioDe, normalizarPagina } from "../observabilidade/telemetria"

/**
 * O QUE A LOJA ANOTA DE CADA PESSOA — a base do CRM (o "Ciclo da Barba"):
 * o que cada navegador fez na loja, e, a partir do dia em que a pessoa deixa
 * o e-mail, de quem é. Chega por `POST /store/crm/eventos`, que só o
 * servidor da loja chama (assinado).
 *
 * Código puro, com testes. Tudo o que entra é suspeito — a rota da loja que
 * recebe o recado do navegador é pública: cada evento é conferido e cortado,
 * e só fica o que o CRM usa. O que não está na lista abaixo morre aqui.
 *
 * ┌─ SÓ COM O "ACEITAR" DA FAIXA DE COOKIES ───────────────────────────────┐
 * │ Quem confere é a loja, duas vezes: o navegador só manda depois do sim  │
 * │ (`apps/loja/src/lib/rastrear.ts`), e a rota dela lê o cookie da        │
 * │ resposta antes de repassar (`apps/loja/src/app/api/eventos`). Sem o    │
 * │ sim, nada chega aqui, e nem o cookie do visitante existe.              │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O VISITANTE é o navegador: um código aleatório que a loja guarda num
 * cookie dela (`fb_visitante`, `httpOnly`). Aqui ele entra embaralhado
 * (`chaveDoVisitante`): o banco não guarda o valor do cookie.
 *
 * A PESSOA é o e-mail. Ele NUNCA vem do navegador: vem da conta (o token do
 * cliente, que o Medusa confere), do carrinho (o e-mail do checkout, que o
 * Medusa já tem) ou da newsletter (o servidor da loja, na hora da
 * inscrição) — ver `api/store/crm/eventos/route.ts`.
 */

/** Os tipos que o CRM guarda, na língua dele. */
export const TIPOS = [
  "visita",
  "produto_visto",
  "produto_lido",
  "video_assistido",
  "sacola_entrou",
  "sacola_saiu",
  "checkout_comecou",
  "contato_informado",
  "entrega_escolhida",
  "pagamento_escolhido",
  "pix_copiado",
  "newsletter",
  "conta_entrou",
] as const
export type Tipo = (typeof TIPOS)[number]

/**
 * O nome que chega → o tipo do CRM. O navegador manda o mesmo evento que
 * manda pro Google (o formato de e-commerce do GA4): a loja tem uma porta de
 * saída só, e o que o CRM anota é o mesmo que o Analytics conta. `visita` e
 * `contato_informado` são só da loja (o Google conta a visita sozinho, e o
 * e-mail no checkout não é evento dele), e também os dois da navegação
 * abandonada (entrega 0198): `produto_lido` (1 minuto na página do produto,
 * com a aba na frente) e `video_assistido` (abriu um vídeo do "Vê na
 * prática"), com o item no formato do Google.
 */
const DO_NAVEGADOR = new Map<string, Tipo>([
  ["visita", "visita"],
  ["view_item", "produto_visto"],
  ["produto_lido", "produto_lido"],
  ["video_assistido", "video_assistido"],
  ["add_to_cart", "sacola_entrou"],
  ["remove_from_cart", "sacola_saiu"],
  ["begin_checkout", "checkout_comecou"],
  ["contato_informado", "contato_informado"],
  ["add_shipping_info", "entrega_escolhida"],
  ["add_payment_info", "pagamento_escolhido"],
  ["pix_copiado", "pix_copiado"],
])

/**
 * OS DO SERVIDOR DA LOJA — a inscrição na newsletter e a entrada na conta.
 * Só valem com a identificação junto, que só o servidor da loja põe (a rota
 * que repassa o recado do navegador monta o corpo de novo, sem ela): o
 * navegador não consegue anotar "assinou a newsletter" em nome de ninguém.
 */
const DO_SERVIDOR = new Map<string, Tipo>([
  ["newsletter", "newsletter"],
  ["conta_entrou", "conta_entrou"],
])

/** Os tipos do checkout: é quando o carrinho já pode ter o e-mail. */
export const DO_CHECKOUT = new Set<Tipo>([
  "checkout_comecou",
  "contato_informado",
  "entrega_escolhida",
  "pagamento_escolhido",
  "pix_copiado",
])

export type Item = { variante: string; nome: string; preco: number; quantidade: number }

/** De onde a pessoa chegou: a campanha do link (`?utm_…`) e o site que mandou. */
export type Origem = {
  fonte: string | null
  meio: string | null
  campanha: string | null
  conteudo: string | null
  termo: string | null
  /** O domínio de onde veio ("instagram.com") — nunca o endereço inteiro. */
  de: string | null
}

export type Dados = {
  itens?: Item[]
  valor?: number
  frete?: string
  forma?: "pix" | "cartao"
  origem?: Origem
}

export type EventoDoCrm = {
  tipo: Tipo
  /** A página, sem o que identifica alguém ("/produtos/oleo-para-barba"). */
  pagina: string
  dados: Dados
  /** Há quantos milissegundos aconteceu, quando o navegador mandou. */
  ha: number
}

export type Identificacao = { como: "newsletter"; email: string } | { como: "conta" }

export type Lote = {
  /** O valor do cookie do visitante (a rota embaralha antes de guardar). */
  visitante: string
  carrinho: string | null
  identificacao: Identificacao | null
  eventos: EventoDoCrm[]
}

/** Até 20 por envio: o navegador junta os de alguns segundos. */
export const MAX_EVENTOS = 20
const MAX_ITENS = 10
/** O evento mais velho que um envio carrega: a aba que ficou na fila (o navegador manda em segundos). */
const MAX_HA_MS = 10 * 60_000
const TETO_DE_DINHEIRO = 100_000

const VISITANTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CARRINHO = /^cart_[0-9A-Z]{20,40}$/i
const VARIANTE = /^variant_[0-9A-Z]{20,40}$/i
/** A campanha do link: letras, números e uns poucos separadores. */
const DA_CAMPANHA = /^[\p{L}\p{N} _.+|:-]+$/u

/** Tem a cara do cookie do visitante (o código aleatório que a loja cria)? */
export const ehVisitante = (v: unknown): v is string => typeof v === "string" && VISITANTE.test(v)

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null
  const limpo = v.replace(/\s+/g, " ").trim().slice(0, max)
  return limpo || null
}

const dinheiro = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number.NaN
  return Number.isFinite(n) && n >= 0 && n <= TETO_DE_DINHEIRO ? Math.round(n * 100) / 100 : null
}

function lerItens(bruto: unknown): Item[] {
  if (!Array.isArray(bruto)) return []
  const itens: Item[] = []
  for (const b of bruto.slice(0, MAX_ITENS)) {
    const i = (b ?? {}) as Record<string, unknown>
    const preco = dinheiro(i.price)
    if (typeof i.item_id !== "string" || !VARIANTE.test(i.item_id) || preco === null) continue
    const q = Number(i.quantity ?? 1)
    itens.push({
      variante: i.item_id,
      nome: texto(i.item_name, 80) ?? "",
      preco,
      quantidade: Number.isInteger(q) && q >= 1 && q <= 99 ? q : 1,
    })
  }
  return itens
}

/** Um campo da campanha ("instagram", "bio"): minúsculo, curto, sem o que não é de campanha. */
function daCampanha(v: unknown): string | null {
  const t = texto(v, 80)?.toLowerCase() ?? null
  return t && DA_CAMPANHA.test(t) ? t : null
}

/**
 * A origem da visita. O navegador manda a campanha do link e o endereço de
 * onde veio; fica o domínio só — e nem ele, se for a própria loja (é a
 * pessoa andando de uma página pra outra).
 */
export function lerOrigem(bruto: unknown, loja: string | null): Origem | null {
  const d = (bruto ?? {}) as Record<string, unknown>
  const de = dominioDe(d.de)
  const origem: Origem = {
    fonte: daCampanha(d.utm_source),
    meio: daCampanha(d.utm_medium),
    campanha: daCampanha(d.utm_campaign),
    conteudo: daCampanha(d.utm_content),
    termo: daCampanha(d.utm_term),
    de: de && !(loja && de === loja.replace(/^www\./, "")) ? de : null,
  }
  return Object.values(origem).some(Boolean) ? origem : null
}

/** Os dados que ficam de cada tipo — o resto do que veio, fora. Nulo: o evento não vale. */
function lerDados(tipo: Tipo, bruto: unknown, loja: string | null): Dados | null {
  const d = (bruto ?? {}) as Record<string, unknown>
  const valor = dinheiro(d.value)
  const comValor = valor === null ? {} : { valor }
  switch (tipo) {
    case "visita": {
      const origem = lerOrigem(d, loja)
      return origem ? { origem } : {}
    }
    case "produto_visto":
    case "produto_lido":
    case "video_assistido":
    case "sacola_entrou":
    case "sacola_saiu":
    case "checkout_comecou": {
      const itens = lerItens(d.items)
      return itens.length ? { itens, ...comValor } : null
    }
    case "entrega_escolhida": {
      const frete = texto(d.shipping_tier, 60)
      return { ...(frete ? { frete } : {}), ...comValor }
    }
    case "pagamento_escolhido":
      return d.payment_type === "pix" || d.payment_type === "cartao"
        ? { forma: d.payment_type, ...comValor }
        : null
    case "pix_copiado":
      return comValor
    case "contato_informado":
    case "newsletter":
    case "conta_entrou":
      return {}
  }
}

function lerIdentificacao(bruto: unknown): Identificacao | null {
  const b = (bruto ?? {}) as Record<string, unknown>
  if (b.como === "conta") return { como: "conta" }
  if (b.como === "newsletter") {
    const email = normalizarEmail(b.email)
    return email ? { como: "newsletter", email } : null
  }
  return null
}

/**
 * O lote que vale, do corpo `{ visitante, carrinho?, identificacao?, eventos }`.
 * Nulo quando o visitante não tem a cara do cookie da loja: sem ele, não há
 * de quem anotar. `loja` é o domínio da própria loja (a origem que não conta).
 */
export function lerLote(corpo: unknown, loja: string | null): Lote | null {
  const c = (corpo ?? {}) as Record<string, unknown>
  if (!ehVisitante(c.visitante)) return null
  const identificacao = lerIdentificacao(c.identificacao)
  const lista = Array.isArray(c.eventos) ? c.eventos.slice(0, MAX_EVENTOS) : []

  const eventos: EventoDoCrm[] = []
  for (const bruto of lista) {
    const e = (bruto ?? {}) as Record<string, unknown>
    const nome = typeof e.nome === "string" ? e.nome : ""
    const tipo = DO_NAVEGADOR.get(nome) ?? (identificacao ? DO_SERVIDOR.get(nome) : undefined)
    const pagina = normalizarPagina(e.pagina)
    if (!tipo || !pagina) continue
    const dados = lerDados(tipo, e.dados, loja)
    if (!dados) continue
    const ha = Number(e.ha)
    eventos.push({
      tipo,
      pagina,
      dados,
      ha: Number.isFinite(ha) ? Math.min(Math.max(Math.round(ha), 0), MAX_HA_MS) : 0,
    })
  }

  return {
    visitante: c.visitante.toLowerCase(),
    carrinho: typeof c.carrinho === "string" && CARRINHO.test(c.carrinho) ? c.carrinho : null,
    identificacao,
    eventos,
  }
}

/**
 * O valor do cookie, embaralhado — é o que o banco guarda. Quem ler o banco
 * não consegue se passar pelo navegador de ninguém.
 */
export function chaveDoVisitante(visitante: string): string {
  return createHash("sha256").update(`crm:${visitante.toLowerCase()}`).digest("hex")
}

/** Quando aconteceu: a hora do servidor, menos o "há quanto tempo" do navegador (o relógio dele não conta). */
export const momentoDo = (e: EventoDoCrm, agora: Date) => new Date(agora.getTime() - e.ha)

/** A origem da primeira visita do lote: é a que fica no visitante, se ele for novo. */
export const origemDoLote = (l: Lote): Origem | null =>
  l.eventos.find((e) => e.tipo === "visita" && e.dados.origem)?.dados.origem ?? null
