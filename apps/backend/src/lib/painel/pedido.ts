import { totalDoPedido } from "../avisar-cancelamento"
import { documentoDoPedido, lerEndereco, telefone, type EnderecoDoMedusa } from "../dados-do-pedido"
import { lerRegistro as lerConfirmacao } from "../confirmar-pedido"
import { lerRegistroNoPedido } from "../envios/registro"
import { lerRegistros as lerEstornos } from "../estornos"
import { lerEstado, type Estado } from "../../modules/pagarme/situacao"
import {
  acaoDaNota,
  estornoPraTentar,
  eventoDoFeito,
  motivoDaFrenet,
  notaSaiEm,
  type AcaoDaNota,
  type FeitoNoPedido,
} from "./acoes"
import { dia, emFrase, hora, minutosEntre, duracao, quando, reais, type Data } from "./formato"

/**
 * O PEDIDO DO JEITO DO PAINEL — onde ele está, o que travou, e o caminho.
 *
 * Código puro: recebe o pedido como o Medusa devolve (mais a nota do ERP e
 * os envios, que moram em tabelas nossas) e devolve o que a tela mostra, já
 * em frase. É aqui que "pago, sem nota, fora da Frenet" vira "Em separação ·
 * espera a nota". Quem lê do banco é `ler.ts`, ao lado; os testes moram em
 * `__tests__/pedido.unit.spec.ts`.
 *
 * ┌─ O QUE O PAPEL NÃO VÊ NÃO SAI DAQUI ───────────────────────────────────┐
 * │ O CPF inteiro só vai no detalhe do DONO (`verCpf`). Pra operação, sai  │
 * │ mascarado — e não é a tela que mascara: o número inteiro nem chega no  │
 * │ painel. Os botões também: o "Tentar o estorno de novo" só vem marcado  │
 * │ pro dono (`Permissoes`), e a rota confere de novo antes de fazer.      │
 * └────────────────────────────────────────────────────────────────────────┘
 */

/* ── o que chega do banco ─────────────────────────────────────────────────── */

type Quando = Date | string | number | null | undefined

export type PagamentoCru = {
  amount?: unknown
  captured_at?: Quando
  canceled_at?: Quando
  provider_id?: string | null
  refunds?: { amount?: unknown; created_at?: Quando }[] | null
}

export type SessaoCrua = {
  provider_id?: string | null
  status?: string | null
  created_at?: Quando
  data?: Record<string, unknown> | null
}

export type ItemCru = {
  id: string
  title?: string | null
  product_title?: string | null
  product_id?: string | null
  product_handle?: string | null
  variant_title?: string | null
  variant_sku?: string | null
  thumbnail?: string | null
  quantity?: unknown
  unit_price?: unknown
  compare_at_unit_price?: unknown
  total?: unknown
  adjustments?: { code?: string | null; amount?: unknown }[] | null
}

export type EnvioDoMedusa = {
  id: string
  created_at?: Quando
  shipped_at?: Quando
  delivered_at?: Quando
  canceled_at?: Quando
  labels?: { tracking_number?: string | null; tracking_url?: string | null }[] | null
}

export type PedidoCru = {
  id: string
  display_id?: number | null
  created_at: Data
  canceled_at?: Quando
  status?: string | null
  email?: string | null
  customer?: { has_account?: boolean | null } | null
  total?: unknown
  /** O estorno, que o Medusa grava como crédito e desconta do `total` — ver `totalDo`. */
  credit_line_total?: unknown
  item_subtotal?: unknown
  discount_total?: unknown
  shipping_total?: unknown
  metadata?: Record<string, unknown> | null
  items?: ItemCru[] | null
  shipping_address?: EnderecoDoMedusa | null
  billing_address?: EnderecoDoMedusa | null
  shipping_methods?: { name?: string | null }[] | null
  payment_collections?:
    { payment_sessions?: SessaoCrua[] | null; payments?: PagamentoCru[] | null }[] | null
  fulfillments?: EnvioDoMedusa[] | null
}

/** A nota do pedido, da tabela `erp_nota` — só o que a tela usa. */
export type NotaCrua = {
  situacao: string
  referencia: string
  numero?: string | null
  serie?: string | null
  detalhe?: string | null
  erro?: string | null
  definitivo?: boolean | null
  cancelar?: boolean | null
  proxima_em?: Quando
  emitida_em?: Quando
  created_at?: Quando
  updated_at?: Quando
}

/** Um pacote, da tabela `envio` — só o que a tela usa. */
export type EnvioCru = {
  codigo?: string | null
  url?: string | null
  transportadora?: string | null
  servico?: string | null
  situacao?: string | null
  alerta?: string | null
  desde?: Quando
  postado_em?: Quando
  entregue_em?: Quando
}

/** O que a loja sabe fora do pedido e muda a leitura dele. */
export type Contexto = {
  agora: Date
  /** O ERP emite nota pros pedidos pagos depois disto (null: ERP desligado). */
  notasDesde: Date | null
  /** Minutos que a nota espera depois do pagamento (a janela de cancelamento). */
  janelaDaNota: number
}

/* ── ler o que chegou ─────────────────────────────────────────────────────── */

const numero = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
/** Soma de preços em reais sem o lixo do ponto flutuante (0,1 + 0,2). */
const centavos = (v: number) => Math.round(v * 100) / 100
/**
 * O total do pedido: o que foi cobrado, com o cupom e a oferta do checkout
 * descontados — a conta do e-mail de cancelado (`totalDoPedido`). Dois
 * cuidados com os números do Medusa:
 *
 * - o `total` é o que SOBROU: o estorno vira crédito (`credit_line_total`)
 *   e desconta — o pedido estornado inteiro mostraria R$ 0,00 ao lado de
 *   "o estorno de R$ 128,60 não saiu". Por isso o crédito volta pra conta;
 * - o `original_total` é a conta de ANTES dos descontos (cupom e oferta): o
 *   pedido de R$ 153,01 aparecia como R$ 158,50. Não serve.
 *
 * Em centavos: com a oferta, o Medusa guarda fração (10% de R$ 52,45 é
 * R$ 5,245, e o pedido fica em R$ 123,355), e o Pagar.me cobra o
 * arredondado (`emCentavos`: R$ 123,36) — é ele que aparece.
 */
export const totalDo = (o: Pick<PedidoCru, "total" | "credit_line_total">) =>
  centavos(numero(totalDoPedido(o)))
const texto = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "")
const emData = (v: Quando): Date | null => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
const primeira = (datas: (Date | null)[]) =>
  datas.filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0] ?? null

const PAGARME = "pp_pagarme_pagarme"

export type Forma = "pix" | "cartao"

export type Pagamento = {
  forma: Forma | null
  estado: Estado | null
  /** Quando o dinheiro entrou (a primeira captura). */
  pagoEm: Date | null
  /** Quanto o Medusa registrou de estorno, em reais. */
  estornado: number
  estornadoEm: Date | null
}

/** A sessão que virou o pagamento do pedido — a do Pagar.me que chegou mais longe. */
export function pagamentoDo(o: PedidoCru): Pagamento {
  const colecoes = o.payment_collections ?? []
  const sessoes = colecoes.flatMap((c) => c.payment_sessions ?? [])
  const pagamentos = colecoes.flatMap((c) => c.payments ?? [])
  const nossas = sessoes.filter((s) => s.provider_id === PAGARME)
  const escolhida =
    nossas.find((s) => s.status === "authorized" || s.status === "captured") ??
    nossas[nossas.length - 1] ??
    null
  const estado = escolhida ? lerEstado(escolhida.data ?? null) : null
  const refunds = pagamentos.flatMap((p) => p.refunds ?? [])
  return {
    forma: estado?.forma ?? null,
    estado,
    pagoEm: primeira(pagamentos.map((p) => emData(p.captured_at))),
    estornado: refunds.reduce((s, r) => s + numero(r.amount), 0),
    estornadoEm: primeira(refunds.map((r) => emData(r.created_at))),
  }
}

/* ── onde o pedido está ───────────────────────────────────────────────────── */

export type Situacao =
  "pix" | "vencido" | "analise" | "separacao" | "enviado" | "entregue" | "cancelado" | "combinar"

export const NOME_DA_SITUACAO: Record<Situacao, string> = {
  pix: "Aguardando Pix",
  vencido: "Pix vencido",
  analise: "Em análise",
  separacao: "Em separação",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
  combinar: "Pagamento a combinar",
}

const enviosAtivos = (o: PedidoCru) => (o.fulfillments ?? []).filter((f) => !f.canceled_at)

export function situacaoDo(o: PedidoCru, p: Pagamento, agora: Date): Situacao {
  if (o.status === "canceled") return "cancelado"
  const envios = enviosAtivos(o)
  if (envios.some((f) => f.delivered_at)) return "entregue"
  if (envios.some((f) => f.shipped_at)) return "enviado"
  if (p.pagoEm) return "separacao"
  switch (p.estado?.situacao) {
    case "aguardando": {
      const expira = emData(p.estado.pix?.expiraEm)
      return expira && expira.getTime() <= agora.getTime() ? "vencido" : "pix"
    }
    case "analise":
      return "analise"
    case "pago":
      return "separacao"
    default:
      return "combinar"
  }
}

/* ── o que travou ─────────────────────────────────────────────────────────── */

export type Problema = "estorno" | "nota" | "frenet" | "entrega"

export const NOME_DO_PROBLEMA: Record<Problema, string> = {
  estorno: "Estorno falhou",
  nota: "Nota com problema",
  frenet: "Fora da Frenet",
  entrega: "Problema na entrega",
}

/** A nota precisa de alguém? (Não conta a que a loja segue tentando sozinha.) */
export function notaTravada(n: NotaCrua | null | undefined): boolean {
  if (!n) return false
  if (n.cancelar) return n.situacao === "autorizada"
  return (
    n.situacao === "rejeitada" ||
    n.situacao === "denegada" ||
    (n.situacao === "a-emitir" && Boolean(n.definitivo))
  )
}

const ALERTAS_DE_ENTREGA = new Set(["nao_entregue"])
const FINS_RUINS = new Set(["devolvido", "extraviado"])

/** O que mais trava primeiro: dinheiro de cliente, depois nota, Frenet e entrega. */
export function problemaDo(
  o: PedidoCru,
  nota: NotaCrua | null,
  envios: EnvioCru[]
): Problema | null {
  const estornos = Object.values(lerEstornos(o.metadata))
  if (estornos.some((e) => e.situacao === "falhou")) return "estorno"
  if (notaTravada(nota)) return "nota"
  const parceiro = lerRegistroNoPedido(o.metadata)
  if (o.status !== "canceled" && parceiro && !parceiro.entrou && parceiro.definitivo)
    return "frenet"
  if (
    envios.some((e) => ALERTAS_DE_ENTREGA.has(e.alerta ?? "") || FINS_RUINS.has(e.situacao ?? ""))
  )
    return "entrega"
  return null
}

/**
 * Pronto pra despachar: pago, não saiu, e sem nada esperando antes da
 * etiqueta — a nota autorizada (ou o pedido de antes do ERP) e nada travado.
 */
export function prontoPraDespachar(
  situacao: Situacao,
  nota: NotaCrua | null,
  pagoEm: Date | null,
  ctx: Contexto
): boolean {
  if (situacao !== "separacao") return false
  if (!emiteNota(pagoEm, ctx)) return true
  return nota?.situacao === "autorizada"
}

/** O pedido pago agora recebe nota pela loja? Só com o ERP ligado, e pago depois de ligar. */
function emiteNota(pagoEm: Date | null, ctx: Contexto): boolean {
  if (!ctx.notasDesde) return false
  return !pagoEm || pagoEm.getTime() >= ctx.notasDesde.getTime()
}

/* ── os nomes curtos ──────────────────────────────────────────────────────── */

/**
 * O nome que cabe numa linha da lista: sem a marca, sem o "para Barba" e sem
 * o que vem depois do travessão. "Óleo para Barba FuckingBarba — 30ml" → "Óleo".
 */
export function nomeCurto(nome: string): string {
  return (
    texto(nome)
      .replace(/\s*(—|-)\s*.*$/, "")
      .replace(/\s+(fucking\s*barba)\b/gi, "")
      .replace(/\s+para barba\b/gi, "")
      .trim() || texto(nome)
  )
}

export function resumoDosItens(itens: ItemCru[]): string {
  return itens
    .map((i) => {
      const q = numero(i.quantity)
      const nome = nomeCurto(i.product_title ?? i.title ?? "Produto")
      return q > 1 ? `${q}× ${nome}` : nome
    })
    .join(" · ")
}

export const nomeDoCliente = (o: PedidoCru) =>
  [texto(o.shipping_address?.first_name), texto(o.shipping_address?.last_name)]
    .filter(Boolean)
    .join(" ") ||
  texto(o.email) ||
  "Sem nome"

/* ── a linha da lista ─────────────────────────────────────────────────────── */

export type LinhaDaLista = {
  id: string
  numero: number
  quando: string
  criadoEm: string
  cliente: { nome: string; cidade: string; uf: string }
  itens: string
  unidades: number
  forma: Forma | null
  situacao: Situacao
  problema: Problema | null
  despachar: boolean
  total: number
}

export function linhaDaLista(
  o: PedidoCru,
  nota: NotaCrua | null,
  envios: EnvioCru[],
  ctx: Contexto
): LinhaDaLista {
  const p = pagamentoDo(o)
  const situacao = situacaoDo(o, p, ctx.agora)
  const itens = o.items ?? []
  return {
    id: o.id,
    numero: o.display_id ?? 0,
    quando: quando(o.created_at, ctx.agora),
    criadoEm: new Date(o.created_at).toISOString(),
    cliente: {
      nome: nomeDoCliente(o),
      cidade: texto(o.shipping_address?.city),
      uf: texto(o.shipping_address?.province).toUpperCase(),
    },
    itens: resumoDosItens(itens),
    unidades: itens.reduce((s, i) => s + numero(i.quantity), 0),
    forma: p.forma,
    situacao,
    problema: problemaDo(o, nota, envios),
    despachar: prontoPraDespachar(situacao, nota, p.pagoEm, ctx),
    total: totalDo(o),
  }
}

/* ── os filtros da lista ──────────────────────────────────────────────────── */

export const FILTROS = [
  "todos",
  "despachar",
  "pagamento",
  "problemas",
  "enviado",
  "entregue",
  "cancelado",
] as const
export type Filtro = (typeof FILTROS)[number]

export const ehFiltro = (v: unknown): v is Filtro =>
  typeof v === "string" && (FILTROS as readonly string[]).includes(v)

export function passaNoFiltro(l: LinhaDaLista, f: Filtro): boolean {
  switch (f) {
    case "todos":
      return true
    case "despachar":
      return l.situacao === "separacao"
    case "pagamento":
      return l.situacao === "pix" || l.situacao === "analise"
    case "problemas":
      return l.problema !== null
    default:
      return l.situacao === f
  }
}

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

/** A busca da lista: número, nome, e-mail ou cidade. */
export function passaNaBusca(l: LinhaDaLista, email: string, termo: string): boolean {
  const t = semAcento(termo.trim().replace(/^#/, ""))
  if (!t) return true
  return semAcento(`${l.numero} ${l.cliente.nome} ${email} ${l.cliente.cidade}`).includes(t)
}

/* ── o pedido inteiro ─────────────────────────────────────────────────────── */

export type EstadoDoPasso = "feito" | "agora" | "erro" | ""
export type Passo = { nome: string; estado: EstadoDoPasso; texto: string }

export type Faixa = {
  nivel: "grave" | "atencao" | "info"
  titulo: string
  texto: string
  /** O botão que resolve, dentro da faixa — só vem quando o papel pode apertar. */
  botao?: "nota" | "estorno" | "frenet"
  /** A linha pequena de baixo: pra quem vê a faixa e não aperta, de quem é. */
  rodape?: string
}

export type Evento = { quando: string; em: string; titulo: string; detalhe: string }

export type Detalhe = {
  id: string
  numero: number
  quando: string
  situacao: Situacao
  problema: Problema | null
  despachar: boolean
  total: number
  faixas: Faixa[]
  caminho: Passo[]
  cancelado: string | null
  itens: {
    nome: string
    variante: string | null
    sku: string | null
    imagem: string | null
    quantidade: number
    unitario: number
    /** O preço cheio, quando o de quem leva mais saiu mais barato. */
    cheio: number | null
    total: number
  }[]
  totais: {
    /** O que os produtos custaram, no preço cobrado (o "de" fica na linha de cada item). */
    produtos: number
    cupons: { codigo: string; valor: number }[]
    frete: number
    formaDeEntrega: string
    total: number
  }
  historico: Evento[]
  /** Os botões do pedido, já conferidos contra o papel e o estado. */
  acoes: {
    /** "agora": a nota espera a janela. "de-novo": a loja desistiu de emitir. */
    nota: AcaoDaNota | null
    /** "Tentar o estorno de novo" (só o dono, só o estorno que a loja pede sozinha). */
    estorno: boolean
    /** A frase que vai com o "Emitir a nota agora". */
    dica: string | null
  }
  pagamento: { forma: string; detalhe: string }
  nota: string | null
  entrega: {
    nome: string
    linha1: string
    linha2: string
    cidadeUf: string
    cep: string
    forma: string
    frenet: string | null
    rastreios: { codigo: string; texto: string; url: string | null }[]
  } | null
  cliente: {
    nome: string
    email: string
    celular: string | null
    documento: { tipo: "cpf" | "cnpj"; mascarado: string; inteiro: string | null } | null
    conta: boolean
  }
}

const cep = (v: string) => (v.length === 8 ? `${v.slice(0, 5)}-${v.slice(5)}` : v)

/** "11988887777" → "(11) 98888-7777" */
export function celularLegivel(v: string | null): string | null {
  if (!v) return null
  if (v.length === 11) return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`
  if (v.length === 10) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`
  return v
}

/** CPF: "•••.444.777-••" · CNPJ: "••.•••.444/0001-••" — o miolo, que não identifica sozinho. */
export function mascarar(doc: { tipo: "cpf" | "cnpj"; valor: string }): string {
  const v = doc.valor
  return doc.tipo === "cpf"
    ? `•••.${v.slice(3, 6)}.${v.slice(6, 9)}-••`
    : `••.•••.${v.slice(5, 8)}/${v.slice(8, 12)}-••`
}

export function comPontuacao(doc: { tipo: "cpf" | "cnpj"; valor: string }): string {
  const v = doc.valor
  return doc.tipo === "cpf"
    ? `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`
    : `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`
}

const NOME_DO_ENVIO: Record<string, string> = {
  aguardando: "etiqueta criada",
  postado: "postado",
  em_transito: "a caminho",
  saiu_para_entrega: "saiu pra entrega",
  aguardando_retirada: "esperando retirada na agência",
  entregue: "entregue",
  devolvido: "voltando pra loja",
  extraviado: "extraviado",
}

function textoDoPagamento(p: Pagamento, situacao: Situacao): string {
  const e = p.estado
  if (!e) return "Sem pagamento pelo Pagar.me"
  if (e.forma === "pix") {
    if (p.pagoEm) return `Pago às ${hora(p.pagoEm)} de ${dia(p.pagoEm)}`
    if (situacao === "pix" && e.pix?.expiraEm) return `Vale até ${hora(e.pix.expiraEm)}`
    if (situacao === "vencido") return "O QR venceu sem pagamento"
    return "Não foi pago"
  }
  const cartao = e.cartao ? `${e.cartao.bandeira} final ${e.cartao.final}` : "Cartão"
  const parcelas =
    e.parcelas > 1 && e.valor ? ` · ${e.parcelas}x de ${reais(e.valor / 100 / e.parcelas)}` : ""
  if (p.pagoEm) return `${cartao}${parcelas} · cobrado às ${hora(p.pagoEm)}`
  if (situacao === "analise") return `${cartao}${parcelas} · reservado, em análise de fraude`
  if (e.recusa) return `${cartao} · ${e.recusa}`
  return `${cartao}${parcelas}`
}

/** A nota, em uma linha — pro bloco do pagamento. */
function textoDaNota(n: NotaCrua | null, pagoEm: Date | null, ctx: Contexto): string | null {
  if (!emiteNota(pagoEm, ctx) && !n) return null
  if (!n) return pagoEm ? "sai em instantes" : "sai depois do pagamento"
  const num = n.numero ? `NF-e ${n.numero}` : "A nota"
  switch (n.situacao) {
    case "autorizada":
      return n.cancelar
        ? `${num} autorizada — precisa ser cancelada no Bling (pedido cancelado)`
        : `${num} · autorizada${n.emitida_em ? ` às ${hora(n.emitida_em)} de ${dia(n.emitida_em)}` : ""}`
    case "processando":
      return "Na SEFAZ, esperando a autorização"
    case "rejeitada":
      return `Rejeitada pela SEFAZ${n.detalhe ? `: ${n.detalhe}` : ""}`
    case "denegada":
      return `Denegada pela SEFAZ${n.detalhe ? `: ${n.detalhe}` : ""}`
    case "cancelada":
      return `${num} cancelada no Bling`
    case "desfeita":
      return "Desfeita no Bling (o pedido foi cancelado)"
    default: {
      if (n.definitivo) return `Não sai sozinha${n.erro ? `: ${n.erro}` : ""}`
      if (n.erro) return `Não saiu ainda (${n.erro}) — a loja tenta de novo`
      const sai = pagoEm ? notaSaiEm(pagoEm, ctx) : null
      return sai && sai.getTime() > ctx.agora.getTime()
        ? `Sai às ${hora(sai)} (${ctx.janelaDaNota} min depois do pagamento)`
        : "Saindo agora"
    }
  }
}

/** Os seis passos do protótipo: feito, pagamento, nota, Frenet, enviado, entregue. */
function caminhoDo(
  o: PedidoCru,
  p: Pagamento,
  situacao: Situacao,
  nota: NotaCrua | null,
  envios: EnvioCru[],
  ctx: Contexto
): Passo[] {
  const passos: Passo[] = [
    { nome: "Pedido feito", estado: "feito", texto: hora(o.created_at) },
    { nome: "Pagamento", estado: "", texto: "" },
    { nome: "Nota fiscal", estado: "", texto: "" },
    { nome: "Na Frenet", estado: "", texto: "" },
    { nome: "Enviado", estado: "", texto: "" },
    { nome: "Entregue", estado: "", texto: "" },
  ]
  const [, pag, nf, frenet, enviado, entregue] = passos

  // Pagamento
  if (p.pagoEm) {
    pag.estado = "feito"
    pag.texto = `${p.forma === "cartao" ? "cartão cobrado" : "Pix pago"} · ${hora(p.pagoEm)}`
  } else if (situacao === "pix") {
    pag.estado = "agora"
    pag.texto = p.estado?.pix?.expiraEm
      ? `esperando o Pix · vence ${hora(p.estado.pix.expiraEm)}`
      : "esperando o Pix"
  } else if (situacao === "analise") {
    pag.estado = "agora"
    const desde = pagamentoDesde(o)
    pag.texto = `em análise de fraude${desde ? ` · ${duracao(minutosEntre(desde, ctx.agora))}` : ""}`
  } else if (situacao === "vencido") {
    pag.estado = "erro"
    pag.texto = "o Pix venceu"
  }

  // Nota
  const emite = emiteNota(p.pagoEm, ctx)
  if (!emite && !nota) {
    nf.texto = p.pagoEm ? "sem nota pela loja" : ""
  } else if (!p.pagoEm && !nota) {
    nf.texto = "espera o pagamento"
  } else if (!nota) {
    nf.estado = "agora"
    nf.texto = "sai em instantes"
  } else if (nota.situacao === "autorizada") {
    nf.estado = nota.cancelar ? "erro" : "feito"
    nf.texto = nota.cancelar
      ? "cancelar no Bling"
      : `${nota.numero ? `NF-e ${nota.numero}` : "autorizada"}${nota.emitida_em ? ` · ${hora(nota.emitida_em)}` : ""}`
  } else if (nota.situacao === "rejeitada" || nota.situacao === "denegada") {
    nf.estado = "erro"
    nf.texto = nota.situacao === "rejeitada" ? "rejeitada pela SEFAZ" : "denegada pela SEFAZ"
  } else if (nota.situacao === "processando") {
    nf.estado = "agora"
    nf.texto = "na SEFAZ"
  } else if (nota.situacao === "a-emitir") {
    nf.estado = nota.definitivo ? "erro" : "agora"
    nf.texto = nota.definitivo
      ? "não sai sozinha"
      : nota.erro
        ? "tentando de novo"
        : (textoDaNota(nota, p.pagoEm, ctx) ?? "").replace(/^Sai às (\d\d:\d\d).*$/, "sai às $1")
  } else if (nota.situacao === "cancelada" || nota.situacao === "desfeita") {
    nf.texto = nota.situacao === "cancelada" ? "cancelada" : "desfeita"
  }

  // Frenet
  const parceiro = lerRegistroNoPedido(o.metadata)
  const saiu = envios.some((e) => e.postado_em) || enviosAtivos(o).some((f) => f.shipped_at)
  if (parceiro?.entrou) {
    frenet.estado = "feito"
    frenet.texto = `${parceiro.referencia} · ${hora(parceiro.em)}`
  } else if (parceiro && !parceiro.entrou) {
    frenet.estado = parceiro.definitivo ? "erro" : "agora"
    frenet.texto = parceiro.definitivo ? "a Frenet recusou" : "tentando entrar"
  } else if (saiu) {
    frenet.texto = "etiqueta feita fora do painel"
  } else if (p.pagoEm && situacao === "separacao") {
    const esperaNota = emite && nota?.situacao !== "autorizada"
    frenet.estado = esperaNota ? "" : "agora"
    frenet.texto = esperaNota ? "espera a nota" : "entra em instantes"
  }

  // Enviado e entregue
  const pacote = envios.find((e) => e.postado_em) ?? envios[0] ?? null
  const postadoEm =
    primeira(envios.map((e) => emData(e.postado_em))) ??
    primeira(enviosAtivos(o).map((f) => emData(f.shipped_at)))
  const entregueEm =
    primeira(envios.map((e) => emData(e.entregue_em))) ??
    primeira(enviosAtivos(o).map((f) => emData(f.delivered_at)))
  if (postadoEm) {
    enviado.estado = "feito"
    enviado.texto = `postado · ${dia(postadoEm)}, ${hora(postadoEm)}`
  } else if (enviosAtivos(o).length && situacao === "separacao") {
    enviado.estado = "agora"
    enviado.texto = "separado, falta postar"
  }
  if (entregueEm) {
    entregue.estado = "feito"
    entregue.texto = `${dia(entregueEm)}, ${hora(entregueEm)}`
  } else if (postadoEm) {
    const ruim = envios.find(
      (e) => ALERTAS_DE_ENTREGA.has(e.alerta ?? "") || FINS_RUINS.has(e.situacao ?? "")
    )
    entregue.estado = ruim ? "erro" : "agora"
    entregue.texto = ruim
      ? ruim.alerta === "nao_entregue"
        ? "tentativa sem sucesso"
        : (NOME_DO_ENVIO[ruim.situacao ?? ""] ?? "com problema")
      : pacote?.situacao === "saiu_para_entrega" || pacote?.situacao === "aguardando_retirada"
        ? NOME_DO_ENVIO[pacote.situacao]
        : "a caminho"
  }

  // Cancelado: o primeiro passo que não andou é onde parou.
  if (situacao === "cancelado") {
    const parou = passos.find((x) => x.estado !== "feito")
    if (parou) {
      parou.estado = "erro"
      parou.texto = "cancelado"
    }
    for (const x of passos) if (x !== parou && x.estado === "agora") x.estado = ""
  }
  return passos
}

/** Quando o pagamento começou (a sessão escolhida nasceu) — pra "em análise há 12 min". */
function pagamentoDesde(o: PedidoCru): Date | null {
  const sessoes = (o.payment_collections ?? []).flatMap((c) => c.payment_sessions ?? [])
  return primeira(sessoes.filter((s) => s.provider_id === PAGARME).map((s) => emData(s.created_at)))
}

function historicoDo(
  o: PedidoCru,
  p: Pagamento,
  nota: NotaCrua | null,
  envios: EnvioCru[],
  ctx: Contexto,
  feitos: FeitoNoPedido[]
): Evento[] {
  const eventos: { em: Date; ordem: number; titulo: string; detalhe: string }[] = []
  const feito = emData(o.created_at)
  /*
    O Pix nasce um instante ANTES do pedido (a sessão de pagamento é do
    carrinho; o pedido nasce no fim). Na linha do tempo, nada vem antes do
    "Pedido feito": o que é de antes fica na hora dele, na ordem anotada.
  */
  const add = (em: Quando, titulo: string, detalhe = "") => {
    const d = emData(em)
    if (!d) return
    const hora = feito && d.getTime() < feito.getTime() ? feito : d
    eventos.push({ em: hora, ordem: eventos.length, titulo, detalhe })
  }
  const n = o.display_id ?? 0

  add(
    o.created_at,
    "Pedido feito",
    o.customer?.has_account ? "na conta do cliente" : "no site, sem conta"
  )
  if (p.estado?.forma === "pix" && p.estado.pix?.expiraEm)
    add(pagamentoDesde(o), "Pix gerado", `vale até ${hora(p.estado.pix.expiraEm)}`)
  if (p.estado?.forma === "cartao") {
    const inicio = pagamentoDesde(o)
    if (inicio && (p.pagoEm || p.estado.situacao === "analise"))
      add(inicio, "Cartão autorizado", "o valor fica só reservado — nada na fatura ainda")
  }
  if (p.pagoEm) add(p.pagoEm, p.forma === "cartao" ? "Cartão cobrado" : "Pix pago", "")

  const confirmacao = lerConfirmacao(o.metadata)
  if (confirmacao)
    add(
      confirmacao.em,
      confirmacao.como === "email"
        ? `E-mail "Pedido #${n} confirmado" enviado`
        : "O e-mail de confirmação não saiu",
      confirmacao.como === "email" ? "" : (confirmacao.motivo ?? "")
    )

  if (nota) {
    add(nota.created_at, `Pedido ${nota.referencia} na fila da nota`, "no Bling")
    if (nota.emitida_em)
      add(
        nota.emitida_em,
        `${nota.numero ? `NF-e ${nota.numero}` : "Nota"} autorizada`,
        "pela SEFAZ, via Bling"
      )
    if (nota.situacao === "rejeitada" || nota.situacao === "denegada")
      add(
        nota.updated_at,
        `A SEFAZ ${nota.situacao === "rejeitada" ? "rejeitou" : "denegou"} a nota`,
        nota.detalhe ?? ""
      )
    else if (nota.situacao === "a-emitir" && nota.definitivo)
      add(nota.updated_at, "A nota não sai sozinha", nota.erro ?? "")
  }

  const parceiro = lerRegistroNoPedido(o.metadata)
  if (parceiro?.entrou) add(parceiro.em, `Pedido ${parceiro.referencia} entrou no painel da Frenet`)
  else if (parceiro?.definitivo) add(parceiro.em, "A Frenet recusou o pedido", parceiro.erro ?? "")

  for (const e of envios) {
    const pacote = [e.transportadora, e.servico].filter(Boolean).join(" ")
    if (e.postado_em) add(e.postado_em, "Postado", [pacote, e.codigo].filter(Boolean).join(" · "))
    if (e.entregue_em) add(e.entregue_em, "Entregue", pacote)
  }
  if (!envios.length) {
    for (const f of enviosAtivos(o)) {
      const codigo = f.labels?.[0]?.tracking_number ?? ""
      add(f.shipped_at, "Postado", codigo)
      add(f.delivered_at, "Entregue")
    }
  }

  if (o.status === "canceled") add(o.canceled_at, "Pedido cancelado")
  const cancelamento = (
    o.metadata?.emails as { cancelado?: { em?: string; como?: string } } | undefined
  )?.cancelado
  if (cancelamento?.em && cancelamento.como === "email")
    add(cancelamento.em, `E-mail "Pedido #${n} cancelado" enviado`)
  if (p.estornado > 0) add(p.estornadoEm, "Estorno pedido ao Pagar.me", reais(p.estornado))
  for (const e of Object.values(lerEstornos(o.metadata))) {
    if (e.situacao === "falhou") add(e.desde, "O estorno não saiu", e.motivo ?? "")
    if (e.confirmado)
      add(e.confirmado, "Estorno confirmado pelo Pagar.me", reais(e.devolvido / 100))
  }

  // O que alguém da equipe fez pelo painel, com o nome (o registro da equipe).
  for (const f of feitos) {
    const evento = eventoDoFeito(f)
    if (evento) add(f.em, evento.titulo, evento.detalhe)
  }

  return eventos
    .sort((a, b) => a.em.getTime() - b.em.getTime() || a.ordem - b.ordem)
    .map((e) => ({
      quando: quando(e.em, ctx.agora),
      em: e.em.toISOString(),
      titulo: e.titulo,
      detalhe: e.detalhe,
    }))
}

function faixasDo(
  o: PedidoCru,
  p: Pagamento,
  situacao: Situacao,
  nota: NotaCrua | null,
  envios: EnvioCru[],
  { permissoes, acaoNota }: { permissoes: Permissoes; acaoNota: AcaoDaNota | null }
): Faixa[] {
  const faixas: Faixa[] = []
  const depois: Faixa[] = []
  let comBotao = false
  for (const e of Object.values(lerEstornos(o.metadata))) {
    // O que falhou e depois saiu: a faixa verde, pra ninguém estornar de novo à mão.
    const confirmado = emData(e.confirmado)
    if (e.situacao === "devolvido" && e.desde && confirmado) {
      depois.push({
        nivel: "info",
        titulo: "O estorno saiu",
        texto:
          `O Pagar.me confirmou em ${dia(confirmado)}, às ${hora(confirmado)}: ` +
          `${reais(e.devolvido / 100)} voltaram pra quem comprou. Ele tinha falhado antes.`,
      })
      continue
    }
    if (e.situacao !== "falhou") continue
    const falta = reais(Math.max(0, e.esperado - e.devolvido) / 100)
    const proxima = emData(e.proxima)
    const faixa: Faixa = {
      nivel: "grave",
      titulo: `O estorno de ${falta} não saiu`,
      texto:
        `O Pagar.me não devolveu${e.motivo ? `: ${e.motivo}` : ""}. ` +
        (!e.sozinha
          ? "Este a loja não pede de novo sozinha: estorne pelo painel do Pagar.me, na cobrança " +
            `${e.cobranca}.`
          : proxima
            ? `A loja pede de novo sozinha — a próxima tentativa é às ${hora(proxima)} de ${dia(proxima)}.`
            : `A loja já pediu de novo ${e.tentativas} ${e.tentativas === 1 ? "vez" : "vezes"} e ` +
              `parou de tentar sozinha: tente aqui, ou estorne pelo painel do Pagar.me, na cobrança ${e.cobranca}.`),
    }
    // Um botão só, mesmo com dois pagamentos: o pedido de novo confere o pedido inteiro.
    if (!permissoes.estorno) faixa.rodape = "Estorno é com o dono."
    else if (e.sozinha && !comBotao) {
      faixa.botao = "estorno"
      comBotao = true
    }
    faixas.push(faixa)
  }
  if (nota && notaTravada(nota)) {
    const desistiu = !nota.cancelar && nota.situacao === "a-emitir"
    faixas.push({
      nivel: "grave",
      titulo: nota.cancelar
        ? "A nota precisa ser cancelada no Bling"
        : desistiu
          ? "A nota não sai sozinha"
          : `A SEFAZ ${nota.situacao === "rejeitada" ? "rejeitou" : "denegou"} a nota`,
      texto: nota.cancelar
        ? `O pedido foi cancelado depois da nota${nota.numero ? ` ${nota.numero}` : ""} sair. Cancele no Bling em até 24 horas da emissão.`
        : desistiu
          ? `A loja desistiu de emitir: ${emFrase(nota.erro ?? "o Bling recusou o pedido")} ` +
            "Corrija o que falta e tente de novo — ou emita à mão no Bling."
          : `${emFrase(nota.detalhe ?? nota.erro ?? "Sem detalhe do Bling")} Corrija no Bling e reenvie por lá: a loja percebe sozinha e o pedido segue pra Frenet.`,
      ...(desistiu && acaoNota === "de-novo" && permissoes.nota ? { botao: "nota" as const } : {}),
    })
  }
  const parceiro = lerRegistroNoPedido(o.metadata)
  if (o.status !== "canceled" && parceiro && !parceiro.entrou && parceiro.definitivo) {
    faixas.push({
      nivel: "grave",
      titulo: "A Frenet recusou o pedido",
      texto:
        `${emFrase(motivoDaFrenet(parceiro.erro ?? "Sem detalhe"))} Corrigido o que ela apontou, mande de novo; ` +
        "ou faça a etiqueta à mão no painel da Frenet — e aí não mande de novo, senão o pedido aparece duas vezes lá.",
      ...(permissoes.frenet ? { botao: "frenet" as const } : {}),
    })
  }
  const ruim = envios.find(
    (e) => ALERTAS_DE_ENTREGA.has(e.alerta ?? "") || FINS_RUINS.has(e.situacao ?? "")
  )
  if (ruim) {
    faixas.push({
      nivel: "grave",
      titulo:
        ruim.situacao === "extraviado"
          ? "O pacote foi extraviado"
          : ruim.situacao === "devolvido"
            ? "O pacote está voltando pra loja"
            : "A transportadora não conseguiu entregar",
      texto: `${[ruim.transportadora, ruim.codigo].filter(Boolean).join(" · ")}. Fale com o cliente pra combinar.`,
    })
  }
  if (situacao === "analise") {
    faixas.push({
      nivel: "atencao",
      titulo: "Cartão em análise de fraude",
      texto:
        "O banco autorizou e o valor está só reservado no limite — nada entrou na fatura. Aprovado, a loja cobra sozinha e o pedido segue. Reprovado, a reserva é desfeita e o cliente recebe o e-mail.",
    })
  }
  if (situacao === "pix" && p.estado?.pix?.expiraEm) {
    faixas.push({
      nivel: "atencao",
      titulo: "Esperando o Pix",
      texto: `Vale até ${hora(p.estado.pix.expiraEm)}. Não pago, o pedido é cancelado sozinho e o estoque volta.`,
    })
  }
  if (situacao === "vencido") {
    faixas.push({
      nivel: "info",
      titulo: "O Pix venceu",
      texto:
        "O pedido é cancelado sozinho em alguns minutos e o estoque volta. Se a pessoa pagar um QR vencido, o Pagar.me recusa.",
    })
  }
  return [...faixas, ...depois]
}

/** O que o papel de quem pede pode ver e apertar no pedido. */
export type Permissoes = {
  /** O documento inteiro (só o dono). */
  verCpf: boolean
  /** "Emitir a nota agora" e "Tentar a nota de novo" (quem abre os pedidos). */
  nota?: boolean
  /** "Tentar o estorno de novo" (só o dono). */
  estorno?: boolean
  /** "Mandar pra Frenet de novo" (quem abre os pedidos). */
  frenet?: boolean
}

export function detalheDo(
  o: PedidoCru,
  nota: NotaCrua | null,
  envios: EnvioCru[],
  ctx: Contexto,
  permissoes: Permissoes,
  feitos: FeitoNoPedido[] = []
): Detalhe {
  const { verCpf } = permissoes
  const p = pagamentoDo(o)
  const situacao = situacaoDo(o, p, ctx.agora)
  const acaoNota = permissoes.nota ? acaoDaNota(nota, situacao, p.pagoEm, ctx) : null
  const itens = (o.items ?? []).map((i) => {
    const unitario = numero(i.unit_price)
    const cheio = numero(i.compare_at_unit_price)
    return {
      nome: texto(i.product_title ?? i.title) || "Produto",
      variante:
        i.variant_title && !/^(único|default)/i.test(i.variant_title)
          ? texto(i.variant_title)
          : null,
      sku: texto(i.variant_sku) || null,
      imagem: texto(i.thumbnail) || null,
      quantidade: numero(i.quantity),
      unitario,
      cheio: cheio > unitario ? cheio : null,
      total: numero(i.total) || centavos(unitario * numero(i.quantity)),
    }
  })
  const cupons = new Map<string, number>()
  for (const i of o.items ?? [])
    for (const a of i.adjustments ?? []) {
      const codigo = texto(a.code) || "Desconto"
      cupons.set(codigo, centavos((cupons.get(codigo) ?? 0) + numero(a.amount)))
    }

  const endereco = o.shipping_address ?? null
  const lido = endereco ? lerEndereco(endereco) : null
  const parceiro = lerRegistroNoPedido(o.metadata)
  const envioDoMedusa = enviosAtivos(o)
  const rastreios = envios.length
    ? envios
        .filter((e) => e.codigo)
        .map((e) => ({
          codigo: e.codigo!,
          texto: [
            NOME_DO_ENVIO[e.situacao ?? ""] ?? e.situacao ?? "",
            e.desde ? quando(e.desde, ctx.agora) : "",
            [e.transportadora, e.servico].filter(Boolean).join(" "),
          ]
            .filter(Boolean)
            .join(" · "),
          url: urlSegura(e.url),
        }))
    : envioDoMedusa.flatMap((f) =>
        (f.labels ?? [])
          .filter((l) => l.tracking_number)
          .map((l) => ({
            codigo: l.tracking_number!,
            texto: "etiqueta do admin",
            url: urlSegura(l.tracking_url),
          }))
      )

  const doc = documentoDoPedido(o.billing_address, o.shipping_address)
  const canceladoEm = emData(o.canceled_at)

  return {
    id: o.id,
    numero: o.display_id ?? 0,
    quando: quando(o.created_at, ctx.agora),
    situacao,
    problema: problemaDo(o, nota, envios),
    despachar: prontoPraDespachar(situacao, nota, p.pagoEm, ctx),
    total: totalDo(o),
    faixas: faixasDo(o, p, situacao, nota, envios, { permissoes, acaoNota }),
    caminho: caminhoDo(o, p, situacao, nota, envios, ctx),
    cancelado:
      situacao === "cancelado"
        ? `Cancelado${canceladoEm ? ` em ${dia(canceladoEm)}, às ${hora(canceladoEm)}` : ""}.` +
          (p.estornado > 0 ? ` Estorno de ${reais(p.estornado)} pedido ao Pagar.me.` : "")
        : null,
    itens,
    totais: {
      produtos: centavos(itens.reduce((s, i) => s + i.unitario * i.quantidade, 0)),
      cupons: [...cupons.entries()].map(([codigo, valor]) => ({ codigo, valor })),
      frete: numero(o.shipping_total),
      formaDeEntrega: texto(o.shipping_methods?.[0]?.name) || "Entrega",
      total: totalDo(o),
    },
    historico: historicoDo(o, p, nota, envios, ctx, feitos),
    acoes: {
      nota: acaoNota,
      estorno: Boolean(permissoes.estorno) && estornoPraTentar(o.metadata),
      dica:
        acaoNota === "agora" && p.pagoEm
          ? `Ela sai sozinha às ${hora(notaSaiEm(p.pagoEm, ctx))}. Precisa despachar antes? ` +
            "Emita aqui — nunca à mão no Bling, senão ela sai duas vezes."
          : null,
    },
    pagamento: {
      forma: p.forma === "pix" ? "Pix" : p.forma === "cartao" ? "Cartão de crédito" : "A combinar",
      detalhe: textoDoPagamento(p, situacao),
    },
    nota: textoDaNota(nota, p.pagoEm, ctx),
    entrega:
      endereco && lido
        ? {
            nome: nomeDoCliente(o),
            linha1: `${lido.rua}, ${lido.numero}`,
            linha2: [lido.complemento, lido.bairro].filter(Boolean).join(" — "),
            cidadeUf: `${lido.cidade}/${lido.uf}`,
            cep: cep(lido.cep),
            forma: texto(o.shipping_methods?.[0]?.name) || "Entrega",
            frenet: parceiro
              ? parceiro.entrou
                ? `${parceiro.referencia} · no painel`
                : `${parceiro.referencia} · ${parceiro.definitivo ? "recusado" : "tentando"}`
              : null,
            rastreios,
          }
        : null,
    cliente: {
      nome: nomeDoCliente(o),
      email: texto(o.email),
      celular: celularLegivel(telefone(endereco?.phone)),
      documento: doc
        ? { tipo: doc.tipo, mascarado: mascarar(doc), inteiro: verCpf ? comPontuacao(doc) : null }
        : null,
      conta: Boolean(o.customer?.has_account),
    },
  }
}

/** Só link de verdade: o endereço de rastreio vem do parceiro ou do admin, e `javascript:` também é texto. */
function urlSegura(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null
  } catch {
    return null
  }
}
