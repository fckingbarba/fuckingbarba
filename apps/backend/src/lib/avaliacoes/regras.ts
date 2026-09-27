/**
 * AS REGRAS DAS AVALIAÇÕES — puras, com teste: o que a página aceita, como o
 * nome aparece, quem recebe o e-mail pedindo e quando.
 *
 * Quem lê e grava é o resto da pasta: `pedido.ts` (o pedido do link),
 * `pedir.ts` (a rodada do e-mail) e as rotas. Aqui só se decide.
 */

/* ── o que a página manda ─────────────────────────────────────────────────── */

export const NOTAS = [1, 2, 3, 4, 5] as const
export type Nota = (typeof NOTAS)[number]

/** Os tamanhos dos campos — os mesmos `maxLength` da página. */
export const LIMITES = {
  nome: { min: 2, max: 40 },
  texto: { min: 3, max: 1000 },
} as const

/** O id de produto do Medusa: `prod_` e um ULID. */
const ID_DO_PRODUTO = /^prod_[0-9A-Z]{26}$/

/** Caractere de controle (menos a quebra de linha, que o texto guarda). */
const CONTROLE = /[\u0000-\u0009\u000B-\u001F\u007F]/g

/**
 * O nome como vai aparecer: sem espaço sobrando e sem caractere de controle.
 * `null` fora do tamanho, ou sem nenhuma letra ("...", "123").
 */
export function limparNome(v: unknown): string | null {
  if (typeof v !== "string") return null
  const nome = v.replace(CONTROLE, " ").replace(/\s+/g, " ").trim()
  if (nome.length < LIMITES.nome.min || nome.length > LIMITES.nome.max) return null
  return /\p{L}/u.test(nome) ? nome : null
}

/**
 * O texto COMO A PESSOA ESCREVEU — é depoimento, e depoimento corrigido
 * vira anúncio da loja com o nome de outra pessoa. Só sai o que ninguém vê:
 * espaço nas pontas, caractere de controle, e mais de uma linha em branco
 * seguida (vira uma). `null` fora do tamanho.
 */
export function limparTexto(v: unknown): string | null {
  if (typeof v !== "string") return null
  const texto = v
    .replace(/\r\n?/g, "\n")
    .replace(CONTROLE, " ")
    .split("\n")
    .map((linha) => linha.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  if (texto.length < LIMITES.texto.min || texto.length > LIMITES.texto.max) return null
  return texto
}

export const ehNota = (v: unknown): v is Nota =>
  typeof v === "number" && (NOTAS as readonly number[]).includes(v)

export type AvaliacaoLida = { produtoId: string; nome: string; nota: Nota; texto: string }

export type CampoDaAvaliacao = "produto" | "nome" | "nota" | "texto"

/**
 * O corpo do `POST /store/avaliacoes`, conferido campo a campo — o primeiro
 * que não serve volta com o nome dele, pra página apontar o campo. Se o
 * produto é MESMO do pedido, quem confere é a rota, com o pedido lido.
 */
export function lerAvaliacao(
  corpo: unknown
): { ok: true; avaliacao: AvaliacaoLida } | { ok: false; campo: CampoDaAvaliacao } {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>
  const produtoId =
    typeof c.produto === "string" && ID_DO_PRODUTO.test(c.produto) ? c.produto : null
  if (!produtoId) return { ok: false, campo: "produto" }
  const nota = typeof c.nota === "string" ? Number(c.nota) : c.nota
  if (!ehNota(nota)) return { ok: false, campo: "nota" }
  const nome = limparNome(c.nome)
  if (!nome) return { ok: false, campo: "nome" }
  const texto = limparTexto(c.texto)
  if (!texto) return { ok: false, campo: "texto" }
  return { ok: true, avaliacao: { produtoId, nome, nota, texto } }
}

/**
 * O número do pedido como a pessoa digita: "#1.234", "FB-1234", " 1234 " →
 * 1234. Só os dígitos, até nove; `null` sem nenhum.
 */
export function numeroDoPedido(v: unknown): number | null {
  const digitos = (typeof v === "number" ? String(v) : typeof v === "string" ? v : "").replace(
    /\D/g,
    ""
  )
  if (!digitos || digitos.length > 9) return null
  const n = Number(digitos)
  return n > 0 ? n : null
}

/* ── o nome sugerido ──────────────────────────────────────────────────────── */

const comMaiuscula = (p: string) => p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1)

/**
 * "rafael" e "de souza" → "Rafael S.": o primeiro nome e a inicial do último
 * sobrenome, como o "André B." das avaliações. É só a SUGESTÃO que a página
 * põe no campo — quem escolhe como aparece é a pessoa. Nome completo no site
 * sem ela pedir, não.
 */
export function nomeSugerido(nome?: string | null, sobrenome?: string | null): string {
  const partes = (v?: string | null) =>
    (v ?? "").replace(CONTROLE, " ").trim().split(/\s+/).filter(Boolean)
  const [primeiro] = partes(nome)
  if (!primeiro) return ""
  const ultimo = partes(sobrenome).at(-1)
  const inicial = ultimo?.match(/\p{L}/u)?.[0]
  const sugerido = inicial
    ? `${comMaiuscula(primeiro)} ${inicial.toLocaleUpperCase("pt-BR")}.`
    : comMaiuscula(primeiro)
  return sugerido.slice(0, LIMITES.nome.max)
}

/* ── o pedido: pode avaliar? ──────────────────────────────────────────────── */

export type ItemDoPedido = {
  product_id?: string | null
  product_title?: string | null
  title?: string | null
  product_handle?: string | null
  thumbnail?: string | null
}

export type ProdutoDoPedido = {
  id: string
  nome: string
  handle: string | null
  imagem: string | null
}

/** Os produtos do pedido, um de cada, na ordem dos itens. Item sem produto (apagado) fica de fora. */
export function produtosDoPedido(
  itens: readonly (ItemDoPedido | null | undefined)[]
): ProdutoDoPedido[] {
  const vistos = new Map<string, ProdutoDoPedido>()
  for (const i of itens) {
    if (!i?.product_id || vistos.has(i.product_id)) continue
    vistos.set(i.product_id, {
      id: i.product_id,
      nome: (i.product_title ?? i.title ?? "").trim() || "Produto",
      handle: i.product_handle ?? null,
      imagem: i.thumbnail ?? null,
    })
  }
  return [...vistos.values()]
}

export type PedidoParaAvaliar = {
  status?: string | null
  /** Algum pagamento capturado (o dinheiro entrou). */
  pago: boolean
}

/**
 * Pedido que aceita avaliação: pago e não cancelado. A entrega não entra na
 * conta de propósito — o e-mail só sai depois dela, mas quem recebeu e o
 * rastreio não disse (a etiqueta feita à mão, o "entregue" que não veio)
 * ainda pode avaliar pela página, com o número e o e-mail da compra.
 */
export const aceitaAvaliacao = (p: PedidoParaAvaliar) => p.status !== "canceled" && p.pago

/* ── o e-mail que pede ────────────────────────────────────────────────────── */

const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS

/** Um dia depois da entrega: o tempo de abrir a caixa e usar uma vez. */
export const DEPOIS_DA_ENTREGA_MS = DIA_MS
/**
 * Até quantos dias depois da entrega o e-mail ainda sai. Passou disso (o
 * Resend fora uma semana, a loja parada), não sai mais: "o que achou?" de
 * uma compra de um mês atrás é e-mail que ninguém esperava.
 */
export const JANELA_EM_DIAS = 10
/**
 * A hora de Brasília em que o e-mail pode sair: das 9h às 20h59. A entrega
 * das 23h vira e-mail no dia seguinte às 9h, e não às 23h do outro dia.
 */
export const HORARIO = { de: 9, ate: 21 } as const

const HORA_EM_BRASILIA = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  hour: "numeric",
  hourCycle: "h23",
})

export function dentroDoHorario(agora: Date): boolean {
  const h = Number(HORA_EM_BRASILIA.format(agora))
  return h >= HORARIO.de && h < HORARIO.ate
}

/** O que o e-mail já fez neste pedido — `metadata.emails.avaliacao`. */
export type RegistroDoPedido = {
  em: string
  /**
   * `email`: saiu. `dispensado`: não vai sair (o `motivo` diz por quê).
   * `recusado`: o Resend não aceita este endereço (422).
   */
  como: "email" | "dispensado" | "recusado"
  motivo?: string
}

export function lerRegistroDoPedido(metadata: unknown): RegistroDoPedido | null {
  const emails = (metadata as { emails?: unknown } | null | undefined)?.emails
  const r = (emails as { avaliacao?: unknown } | null | undefined)?.avaliacao
  if (!r || typeof r !== "object") return null
  const { em, como } = r as Record<string, unknown>
  if (typeof em !== "string" || (como !== "email" && como !== "dispensado" && como !== "recusado"))
    return null
  return r as RegistroDoPedido
}

/** O pacote como a rodada vê: onde ele está e quando chegou. */
export type EnvioDaRodada = {
  pedido_id: string | null
  situacao: string
  codigo: string | null
  entregue_em: Date | string | null
}

/** Os pacotes que ainda estão na rua — com eles, o pedido não chegou inteiro. */
const NA_RUA = new Set(["postado", "em_transito", "saiu_para_entrega", "aguardando_retirada"])

const quando = (d: Date | string) => (d instanceof Date ? d : new Date(d))

/**
 * Quando o pedido chegou INTEIRO: a última entrega dos pacotes dele, desde
 * que nenhum outro ainda esteja na rua (a caixa que não coube e foi depois).
 * Pacote "aguardando" SEM código é o registro no parceiro que ainda não
 * virou etiqueta — não conta; com código, é um pacote que vai sair. Pacote
 * devolvido ou extraviado não é entrega. `null`: ainda não chegou.
 */
export function chegouEm(envios: readonly EnvioDaRodada[]): Date | null {
  let ultima: Date | null = null
  for (const e of envios) {
    if (NA_RUA.has(e.situacao) || (e.situacao === "aguardando" && e.codigo)) return null
    if (e.situacao !== "entregue" || !e.entregue_em) continue
    const d = quando(e.entregue_em)
    if (!ultima || d > ultima) ultima = d
  }
  return ultima
}

export type PedidoDaRodada = {
  id: string
  status?: string | null
  email?: string | null
  metadata?: unknown
  pago: boolean
  /** Quantos produtos do pedido ainda não têm avaliação. */
  semAvaliacao: number
}

export type DecisaoDaRodada =
  | { mandar: true }
  | { mandar: false; motivo: "ja-registrado" | "esperando" | "fora-da-janela" }
  | {
      mandar: false
      motivo: "cancelado" | "nao-pago" | "sem-email" | "ja-avaliou"
      registrar: true
    }

/**
 * O pedido recebe o e-mail AGORA? `chegou` é o `chegouEm` dos pacotes dele.
 *
 * Os motivos com `registrar` não mudam mais (cancelado, sem e-mail, já
 * avaliou tudo pela página): ficam no pedido como `dispensado`, e a rodada
 * não volta nele. "Esperando" (menos de um dia) e "fora da janela" não
 * registram — o primeiro manda na próxima hora; o segundo nunca mais passa
 * pela rodada, que só lê as entregas da janela.
 */
export function decidirPedido(
  p: PedidoDaRodada,
  chegou: Date | null,
  agora: Date
): DecisaoDaRodada {
  if (lerRegistroDoPedido(p.metadata)) return { mandar: false, motivo: "ja-registrado" }
  if (!chegou || agora.getTime() - chegou.getTime() < DEPOIS_DA_ENTREGA_MS)
    return { mandar: false, motivo: "esperando" }
  if (agora.getTime() - chegou.getTime() > JANELA_EM_DIAS * DIA_MS)
    return { mandar: false, motivo: "fora-da-janela" }
  if (p.status === "canceled") return { mandar: false, motivo: "cancelado", registrar: true }
  if (!p.pago) return { mandar: false, motivo: "nao-pago", registrar: true }
  if (!p.email?.includes("@")) return { mandar: false, motivo: "sem-email", registrar: true }
  if (p.semAvaliacao === 0) return { mandar: false, motivo: "ja-avaliou", registrar: true }
  return { mandar: true }
}
