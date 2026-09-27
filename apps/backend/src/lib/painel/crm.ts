import { PREFIXO_DO_BUMP } from "../bumps"
import { AJUSTES_PADRAO, type AjustesDoCrm } from "../crm/ajustes"
import {
  etiquetasDaPessoa,
  NOME_DA_ETAPA,
  type Engajamento,
  type Etapa,
  type Etiquetas,
  type PedidoDaPessoa,
} from "../crm/etiquetas"
import { TIPOS, type Dados, type Item, type Origem, type Tipo } from "../crm/eventos"
import { recomprasPorTipo } from "../crm/nuvemshop"
import { PREFIXO_DA_PROMOCAO } from "../cupons"
import { emailNoLog } from "../email"
import { dia, quando, reais } from "./formato"
import { pagamentoDo, totalDo, type EnvioCru, type PedidoCru } from "./pedido"
import { nomeDaOrigem } from "./visitas"

/**
 * O CRM DO PAINEL — a primeira tela: o que a loja anotou de cada pessoa
 * (`lib/crm/eventos.ts`), no período. Quantos navegadores, quantos já têm
 * e-mail, cada tipo de anotação, e as últimas, em frase.
 *
 * Código puro, como o `marketing.ts`: recebe as contas do banco (o serviço
 * do módulo `crm`) e devolve a tela pronta. Testes em
 * `__tests__/crm.unit.spec.ts`.
 *
 * O E-MAIL SAI MASCARADO ("r•••@gmail.com"): a tela mostra que a anotação
 * tem dono, e não quem é.
 *
 * OS E-MAILS DA LOJA (parte 2, entrega 0138): o que os avisos do Resend
 * contam dos e-mails de cliente que saíram no período — chegaram, foram
 * abertos, levaram clique, não chegaram, viraram reclamação —, por tipo, e
 * os últimos em frase (`lib/crm/resend.ts`).
 *
 * A FICHA DE CADA PESSOA (parte 3, entrega 0145): na ficha do cliente, as
 * cinco etiquetas (`lib/crm/etiquetas.ts`), de onde ela chegou e o caminho
 * dela — o site, os e-mails e as compras juntos.
 *
 * A BASE DA NUVEMSHOP (parte 5, entrega 0156): os pedidos da loja antiga
 * contam nas etiquetas e no caminho da ficha, e a aba da base mostra quem é
 * quem nela inteira (`montarTelaDaBase`).
 */

export const PERIODOS_DO_CRM = ["hoje", "7d", "30d"] as const
export type PeriodoDoCrm = (typeof PERIODOS_DO_CRM)[number]
/** Uma semana: com pouca gente na loja nova, o dia de hoje sozinho quase sempre está vazio. */
export const PERIODO_PADRAO_DO_CRM: PeriodoDoCrm = "7d"

export const lerPeriodoDoCrm = (v: unknown): PeriodoDoCrm =>
  (PERIODOS_DO_CRM as readonly unknown[]).includes(v) ? (v as PeriodoDoCrm) : PERIODO_PADRAO_DO_CRM

/** O nome de cada contagem, na ordem do caminho da pessoa na loja. */
export const NOME_DO_TIPO: Record<Tipo, string> = {
  visita: "Visitas",
  produto_visto: "Produtos vistos",
  sacola_entrou: "Entraram na sacola",
  sacola_saiu: "Saíram da sacola",
  checkout_comecou: "Checkouts começados",
  contato_informado: "E-mails no checkout",
  entrega_escolhida: "Entregas escolhidas",
  pagamento_escolhido: "Pagamentos escolhidos",
  pix_copiado: "Pix copiados",
  newsletter: "Assinaram a newsletter",
  conta_entrou: "Entraram na conta",
}

/** Quantas anotações de cada tipo, e de quantos navegadores (o banco soma). */
export type ContaDoTipo = { tipo: string; vezes: number; visitantes: number }

export type NumerosDoCrm = {
  /** Navegadores que disseram sim aos cookies e fizeram alguma coisa no período. */
  visitantes: number
  /** Desses, os que já têm e-mail. */
  identificados: number
  /** E-mails diferentes: a pessoa com dois aparelhos conta uma vez. */
  pessoas: number
  anotacoes: number
}

export type EventoLidoDoBanco = {
  id: string
  tipo: string
  dados: Dados | null
  em: Date | string
  email: string | null
}

/** Os e-mails de cliente que saíram no período, e quantos deles… */
export type NumerosDosEmails = {
  enviados: number
  entregues: number
  abertos: number
  clicados: number
  naoChegaram: number
  reclamacoes: number
}

export type ContaDoTipoDeEmail = NumerosDosEmails & { tipo: string | null }

type Hora = Date | string | null

export type EmailLidoDoBanco = {
  id: string
  tipo: string | null
  para: string | null
  enviado_em: Hora
  entregue_em: Hora
  atrasado_em: Hora
  aberto_em: Hora
  ultima_abertura_em: Hora
  clicado_em: Hora
  ultimo_clique_em: Hora
  ultimo_link: string | null
  devolvido_em: Hora
  devolucao: string | null
  reclamou_em: Hora
  falhou_em: Hora
  suprimido_em: Hora
}

export type EmailsDaTela = {
  /** Os avisos do Resend estão ligados (o segredo do webhook está no Railway). */
  ligados: boolean
  /** "hoje, 14:32": o último aviso que chegou, de qualquer e-mail. */
  ultimoAviso: string | null
  numeros: NumerosDosEmails
  porTipo: (NumerosDosEmails & { tipo: string | null; nome: string })[]
  ultimos: {
    id: string
    quando: string
    quem: string | null
    oque: string
    /** Bom (abriu, clicou), ruim (não chegou, spam) ou nada. */
    nivel: "bom" | "ruim" | null
  }[]
}

export type TelaDoCrm = {
  periodo: PeriodoDoCrm
  numeros: NumerosDoCrm
  tipos: { tipo: Tipo; nome: string; vezes: number; visitantes: number }[]
  ultimos: { id: string; tipo: Tipo; quando: string; quem: string | null; oque: string }[]
  emails: EmailsDaTela
}

const ehTipo = (v: string): v is Tipo => (TIPOS as readonly string[]).includes(v)

/** "Óleo para barba" · "2× Óleo para barba" · "… e mais 2". */
function osItens(itens: Item[] | undefined, comQuantidade: boolean): string {
  const [primeiro, ...resto] = itens ?? []
  if (!primeiro) return "um produto"
  const nome = primeiro.nome || "um produto"
  const vezes = comQuantidade && primeiro.quantidade > 1 ? `${primeiro.quantidade}× ` : ""
  return `${vezes}${nome}${resto.length ? ` e mais ${resto.length}` : ""}`
}

const comValor = (frase: string, valor: number | undefined) =>
  typeof valor === "number" && valor > 0 ? `${frase} · ${reais(valor)}` : frase

/** "Instagram (black)" — pelo mesmo nome das origens do Início e do Marketing. */
function nomeDaChegada(o: Origem): string {
  const nome = o.fonte ? nomeDaOrigem(o.fonte, o.meio ?? "") : nomeDaOrigem(o.de ?? "", "")
  return `${nome}${o.campanha ? ` (${o.campanha})` : ""}`
}

/** "chegou na loja · Instagram" */
const aChegada = (d: Dados) => `chegou na loja · ${d.origem ? nomeDaChegada(d.origem) : "direto"}`

/** A anotação em frase, do jeito que o dono fala. */
export function emFraseDoCrm(tipo: Tipo, dados: Dados | null): string {
  const d = dados ?? {}
  switch (tipo) {
    case "visita":
      return aChegada(d)
    case "produto_visto":
      return `viu ${osItens(d.itens, false)}`
    case "sacola_entrou":
      return `pôs ${osItens(d.itens, true)} na sacola`
    case "sacola_saiu":
      return `tirou ${osItens(d.itens, true)} da sacola`
    case "checkout_comecou":
      return comValor("começou o checkout", d.valor)
    case "contato_informado":
      return "deixou o e-mail no checkout"
    case "entrega_escolhida":
      return `escolheu a entrega${d.frete ? ` · ${d.frete}` : ""}`
    case "pagamento_escolhido":
      return comValor(`escolheu ${d.forma === "pix" ? "Pix" : "cartão"}`, d.valor)
    case "pix_copiado":
      return comValor("copiou o Pix", d.valor)
    case "newsletter":
      return "assinou a newsletter"
    case "conta_entrou":
      return "entrou na conta"
  }
}

/** O nome de cada e-mail da loja, pela etiqueta do envio (`lib/email.ts`). */
const NOME_DO_EMAIL: Record<string, string> = {
  "pedido-confirmado": "Pedido confirmado",
  "pedido-cancelado": "Pedido cancelado",
  "pagamento-devolvido": "Pagamento devolvido",
  "envio-enviado": "Pedido a caminho",
  "envio-saiu": "Saiu pra entrega",
  "envio-retirar": "Esperando retirada",
  "envio-entregue": "Pedido entregue",
  "avise-me": "Voltou ao estoque",
  "codigo-de-entrar": "Código de entrar",
  "codigo-do-email-novo": "Código do e-mail novo",
  "email-trocado": "E-mail da conta trocado",
}

/** "Pedido confirmado"; sem etiqueta (os de antes da 0138), "Outro". */
export const nomeDoEmail = (tipo: string | null) => (tipo ? (NOME_DO_EMAIL[tipo] ?? tipo) : "Outro")

/** Por que não chegou, do jeito que o dono entende. */
function porQueNaoChegou(e: EmailLidoDoBanco): string {
  if (e.suprimido_em || /suppress/i.test(e.devolucao ?? ""))
    return "o endereço está bloqueado no Resend (já voltou ou reclamou antes)"
  if (e.falhou_em && !e.devolvido_em) return "o Resend não conseguiu mandar"
  if (/^transient/i.test(e.devolucao ?? "")) return "a caixa recusou por agora"
  return "o endereço não aceita e-mail"
}

/**
 * O que aconteceu com o e-mail, em frase — o mais importante primeiro: a
 * reclamação de spam, o que não chegou, o clique, a abertura, a entrega.
 */
export function emFraseDoEmail(e: EmailLidoDoBanco): {
  quando: Hora
  oque: string
  nivel: "bom" | "ruim" | null
} {
  const nome = `“${nomeDoEmail(e.tipo)}”`
  if (e.reclamou_em)
    return { quando: e.reclamou_em, oque: `marcou ${nome} como spam`, nivel: "ruim" }
  const naoChegou = e.devolvido_em ?? e.falhou_em ?? e.suprimido_em
  if (naoChegou)
    return {
      quando: naoChegou,
      oque: `${nome} não chegou · ${porQueNaoChegou(e)}`,
      nivel: "ruim",
    }
  if (e.clicado_em)
    return {
      quando: e.ultimo_clique_em ?? e.clicado_em,
      oque: `clicou em ${nome}${e.ultimo_link ? ` · ${e.ultimo_link}` : ""}`,
      nivel: "bom",
    }
  if (e.aberto_em)
    return { quando: e.ultima_abertura_em ?? e.aberto_em, oque: `abriu ${nome}`, nivel: "bom" }
  if (e.entregue_em) return { quando: e.entregue_em, oque: `recebeu ${nome}`, nivel: null }
  if (e.atrasado_em) return { quando: e.atrasado_em, oque: `${nome} está atrasando`, nivel: null }
  return { quando: e.enviado_em, oque: `${nome} saiu`, nivel: null }
}

export function montarEmailsDoCrm(
  entrada: {
    ligados: boolean
    ultimoAviso: Date | null
    numeros: NumerosDosEmails
    porTipo: ContaDoTipoDeEmail[]
    ultimos: EmailLidoDoBanco[]
  },
  agora: Date = new Date()
): EmailsDaTela {
  return {
    ligados: entrada.ligados,
    ultimoAviso: entrada.ultimoAviso ? quando(entrada.ultimoAviso, agora) : null,
    numeros: entrada.numeros,
    porTipo: entrada.porTipo.map((t) => ({ ...t, nome: nomeDoEmail(t.tipo) })),
    ultimos: entrada.ultimos.map((e) => {
      const f = emFraseDoEmail(e)
      return {
        id: e.id,
        quando: f.quando ? quando(f.quando, agora) : "",
        quem: e.para ? emailNoLog(e.para) : null,
        oque: f.oque,
        nivel: f.nivel,
      }
    }),
  }
}

export function montarTelaDoCrm(
  entrada: {
    periodo: PeriodoDoCrm
    numeros: NumerosDoCrm
    tipos: ContaDoTipo[]
    ultimos: EventoLidoDoBanco[]
    emails: EmailsDaTela
  },
  agora: Date = new Date()
): TelaDoCrm {
  const porTipo = new Map(entrada.tipos.map((t) => [t.tipo, t]))
  return {
    emails: entrada.emails,
    periodo: entrada.periodo,
    numeros: entrada.numeros,
    tipos: TIPOS.map((tipo) => ({
      tipo,
      nome: NOME_DO_TIPO[tipo],
      vezes: porTipo.get(tipo)?.vezes ?? 0,
      visitantes: porTipo.get(tipo)?.visitantes ?? 0,
    })),
    ultimos: entrada.ultimos.flatMap((e) =>
      ehTipo(e.tipo)
        ? [
            {
              id: e.id,
              tipo: e.tipo,
              quando: quando(e.em, agora),
              quem: e.email ? emailNoLog(e.email) : null,
              oque: emFraseDoCrm(e.tipo, e.dados),
            },
          ]
        : []
    ),
  }
}

/* ── a ficha do cliente (parte 3, entrega 0145) ─────────────────────────── */

/** O que o CRM sabe de uma pessoa (o `pessoa` do serviço do módulo `crm`). */
export type PessoaNoCrm = {
  /** O último clique num e-mail da loja. */
  ultimoClique: Date | null
  /** A última coisa que ela fez no site, com o sim dos cookies. */
  ultimaVisita: Date | null
  /** De onde chegou da primeira vez (nula: direto, ou nunca visitou com o sim). */
  origem: Origem | null
  primeiraVisita: Date | null
  eventos: EventoLidoDoBanco[]
  emails: EmailLidoDoBanco[]
}

export type EtiquetaDaFicha = {
  chave: "etapa" | "engajamento" | "tratamento" | "proxima" | "cupom"
  nome: string
  valor: string
  porque: string
  /** Bom (recorrente, quente), ruim (em risco, sunset, a data que passou) ou nada. */
  tom: "bom" | "ruim" | null
}

export type PassoDoCaminho = {
  id: string
  /** O tipo da anotação, "email" ou "pedido": o ícone da linha. */
  tipo: string
  quando: string
  oque: string
  nivel: "bom" | "ruim" | null
}

export type FichaDoCrm = {
  etiquetas: EtiquetaDaFicha[]
  /** "Instagram (black) · primeira visita em 12/09", se a loja já viu a pessoa no site. */
  origem: string | null
  caminho: PassoDoCaminho[]
}

const emData = (v: Date | string | number | null | undefined): Date | null => {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isFinite(d.getTime()) ? d : null
}

/**
 * O pedido do Medusa do jeito das etiquetas: quando foi pago, quando chegou
 * (o aviso da Frenet ou o "entregue" do envio — o mais tarde dos dois), o que
 * veio e os cupons que a pessoa digitou (a oferta do checkout e a promoção
 * automática não são cupom).
 */
export function pedidoDaPessoa(o: PedidoCru, envios: EnvioCru[] = []): PedidoDaPessoa {
  const entregas = [
    ...(o.fulfillments ?? []).filter((f) => !f.canceled_at).map((f) => emData(f.delivered_at)),
    ...envios.map((e) => emData(e.entregue_em)),
  ].filter((d): d is Date => d !== null)
  const cupons = (o.items ?? [])
    .flatMap((i) => i.adjustments ?? [])
    .map((a) => a.code?.trim().toUpperCase() ?? "")
    .filter((c) => c && !c.startsWith(PREFIXO_DO_BUMP) && !c.startsWith(PREFIXO_DA_PROMOCAO))
  return {
    id: o.id,
    numero: o.display_id ? String(o.display_id) : null,
    pagoEm: pagamentoDo(o).pagoEm,
    entregueEm: entregas.length ? new Date(Math.max(...entregas.map((d) => d.getTime()))) : null,
    cancelado: Boolean(o.canceled_at) || o.status === "canceled",
    itens: (o.items ?? []).map((i) => ({
      handle: i.product_handle ?? null,
      sku: i.variant_sku ?? null,
      nome: i.product_title || i.title || "",
      quantidade: Number(i.quantity) || 1,
    })),
    cupons: [...new Set(cupons)],
  }
}

/**
 * A FICHA DO CRM DE UMA PESSOA — as cinco etiquetas em cartões (`lib/crm/
 * etiquetas.ts`), de onde ela chegou da primeira vez, e o caminho dela:
 * as anotações do site, os e-mails da loja e as compras, do mais novo pro
 * mais velho (até 25).
 */
export function montarFichaDoCrm(
  entrada: {
    etiquetas: Etiquetas
    origem: Origem | null
    primeiraVisita: Date | string | null
    eventos: EventoLidoDoBanco[]
    emails: EmailLidoDoBanco[]
    pedidos: {
      id: string
      numero: string | null
      pagoEm: Date | null
      total: number
      /** Da loja antiga (a base da Nuvemshop). */
      daNuvemshop?: boolean
    }[]
  },
  agora: Date = new Date()
): FichaDoCrm {
  const { etapa, engajamento, tratamento, proximaCompra, cupom } = entrada.etiquetas
  const etiquetas: EtiquetaDaFicha[] = [
    {
      chave: "etapa",
      nome: "Etapa",
      valor: NOME_DA_ETAPA[etapa.valor],
      porque: etapa.porque,
      tom:
        etapa.valor === "em-risco" || etapa.valor === "sunset"
          ? "ruim"
          : etapa.valor === "recorrente"
            ? "bom"
            : null,
    },
    {
      chave: "engajamento",
      nome: "Engajamento",
      valor: engajamento.valor[0].toUpperCase() + engajamento.valor.slice(1),
      porque: engajamento.porque,
      tom: engajamento.valor === "quente" ? "bom" : null,
    },
    {
      chave: "tratamento",
      nome: "Tratamento",
      valor: tratamento.dia === null ? "—" : `Dia ${tratamento.dia}`,
      porque: tratamento.porque,
      tom: null,
    },
    {
      chave: "proxima",
      nome: "Próxima compra",
      valor: proximaCompra.em ? dia(proximaCompra.em) : "—",
      porque:
        proximaCompra.em && proximaCompra.em < agora
          ? `${proximaCompra.porque} — a data já passou`
          : proximaCompra.porque,
      tom: proximaCompra.em && proximaCompra.em < agora ? "ruim" : null,
    },
    {
      chave: "cupom",
      nome: "Sensível a cupom",
      valor: cupom.valor === null ? "—" : cupom.valor ? "Sim" : "Não",
      porque: cupom.porque,
      tom: null,
    },
  ]

  const passos: (PassoDoCaminho & { em: Date })[] = []
  for (const e of entrada.eventos) {
    const em = emData(e.em)
    if (!em || !ehTipo(e.tipo)) continue
    passos.push({
      id: e.id,
      tipo: e.tipo,
      em,
      quando: "",
      oque: emFraseDoCrm(e.tipo, e.dados),
      nivel: null,
    })
  }
  for (const e of entrada.emails) {
    const f = emFraseDoEmail(e)
    const em = emData(f.quando)
    if (!em) continue
    passos.push({ id: e.id, tipo: "email", em, quando: "", oque: f.oque, nivel: f.nivel })
  }
  for (const p of entrada.pedidos) {
    if (!p.pagoEm) continue
    passos.push({
      id: p.id,
      tipo: "pedido",
      em: p.pagoEm,
      quando: "",
      oque: p.daNuvemshop
        ? `pagou ${p.numero ? `o pedido #${p.numero}` : "um pedido"} na Nuvemshop · ${reais(p.total)}`
        : `pagou o pedido${p.numero ? ` #${p.numero}` : ""} · ${reais(p.total)}`,
      nivel: "bom",
    })
  }
  const primeira = emData(entrada.primeiraVisita)
  // Sem a origem mas com a primeira visita: chegou direto (sem link de campanha nem site que mandou).
  const chegada = entrada.origem ? nomeDaChegada(entrada.origem) : primeira ? "Direto" : null
  return {
    etiquetas,
    origem: chegada && primeira ? `${chegada} · primeira visita em ${dia(primeira)}` : chegada,
    caminho: passos
      .sort((a, b) => b.em.getTime() - a.em.getTime())
      .slice(0, 25)
      .map(({ em, ...p }) => ({ ...p, quando: quando(em, agora) })),
  }
}

/**
 * A ficha do CRM a partir do que o banco devolve: os pedidos de todos os
 * cadastros com o mesmo e-mail, os envios, a newsletter e o que o CRM sabe,
 * com os Ajustes do CRM (quanto dura cada produto, as regras). Sem a área
 * dos pedidos, o número do pedido não aparece (o marketing vê a compra e o
 * valor, não o pedido).
 */
export function fichaDoCrmDoCliente(
  entrada: {
    crm: PessoaNoCrm
    pedidos: PedidoCru[]
    envios: Map<string, EnvioCru[]>
    newsletterDesde: Date | null
    comNumero: boolean
    ajustes?: AjustesDoCrm
    /** Os pedidos dela na loja antiga (a base da Nuvemshop). */
    pedidosDaNuvemshop?: PedidoLidoDaBase[]
  },
  agora: Date = new Date()
): FichaDoCrm {
  const { dias, regras } = entrada.ajustes ?? AJUSTES_PADRAO
  const { crm } = entrada
  const pedidos = [
    ...entrada.pedidos.map((o) => {
      const p = pedidoDaPessoa(o, entrada.envios.get(o.id))
      return { ...p, total: totalDo(o), daNuvemshop: false }
    }),
    ...(entrada.pedidosDaNuvemshop ?? []).map(pedidoDaBase),
  ].map((p) => ({ ...p, numero: entrada.comNumero ? p.numero : null }))
  return montarFichaDoCrm(
    {
      etiquetas: etiquetasDaPessoa({
        pedidos,
        sinais: {
          ultimoClique: emData(crm.ultimoClique),
          ultimaVisita: emData(crm.ultimaVisita),
          newsletterDesde: entrada.newsletterDesde,
        },
        agora,
        dias,
        regras,
      }),
      origem: crm.origem,
      primeiraVisita: crm.primeiraVisita,
      eventos: crm.eventos,
      emails: crm.emails,
      pedidos: pedidos.filter((p) => !p.cancelado),
    },
    agora
  )
}

/* ── a base da Nuvemshop (parte 5, entrega 0156) ────────────────────────── */

/** Os números da base, como o serviço do módulo `crm` soma (`resumoDaBase`). */
export type ResumoDaBase = {
  pessoas: number
  aceitam: number
  pedidos: number
  pagos: number
  vendidoCentavos: number
  primeiroPedido: Date | null
  ultimoPedido: Date | null
  carrinhos: number
  importadoEm: Date | null
}

export type PessoaLidaDaBase = { email: string; aceitaOfertas: boolean; newsletterEm: Date | null }

/** Um pedido da base como o banco devolve: o total em centavos, os itens pelo SKU. */
export type PedidoLidoDaBase = {
  numero: string
  email: string
  feitoEm: Date | string
  pagoEm: Date | string | null
  /** confirmado, recusado, estornado ou outro. */
  pagamento: string
  envio: string
  total: number
  cupom: string | null
  itens: { sku: string | null; nome: string; quantidade: number; valor: number }[] | null
}

/**
 * O pedido da loja antiga do jeito das etiquetas. Pago = confirmado (o
 * recusado nunca foi pago; o estornado conta como cancelado). A entrega não
 * vem no arquivo: fica a estimada das etiquetas (7 dias depois de pago).
 */
export function pedidoDaBase(
  p: PedidoLidoDaBase
): PedidoDaPessoa & { total: number; daNuvemshop: true } {
  const pago = p.pagamento === "confirmado" || p.pagamento === "estornado"
  return {
    id: `nuvemshop:${p.numero}`,
    numero: p.numero,
    pagoEm: pago ? (emData(p.pagoEm) ?? emData(p.feitoEm)) : null,
    entregueEm: null,
    cancelado: p.pagamento === "estornado",
    itens: (p.itens ?? []).map((i) => ({
      handle: null,
      sku: i.sku,
      nome: i.nome,
      quantidade: i.quantidade,
    })),
    cupons: p.cupom ? [p.cupom] : [],
    total: p.total / 100,
    daNuvemshop: true,
  }
}

const COM_ANO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})
const ENGAJAMENTOS: Engajamento[] = ["quente", "morno", "frio"]
const NOME_DO_ENGAJAMENTO: Record<Engajamento, string> = {
  quente: "Quentes",
  morno: "Mornos",
  frio: "Frios",
}
const ETAPAS: Etapa[] = [
  "lead",
  "primeira-compra",
  "em-tratamento",
  "recorrente",
  "em-risco",
  "sunset",
]

export type TelaDaBase = {
  /** Nada importado ainda: a aba mostra só como mandar os arquivos. */
  vazia: boolean
  numeros: {
    pessoas: number
    aceitam: number
    pedidos: number
    pagos: number
    vendido: number
    carrinhos: number
    /** "30/01/2026" */
    primeiroPedido: string | null
    ultimoPedido: string | null
    /** "hoje, 14:32" */
    importadoEm: string | null
  }
  /** Quem é quem na base: quantos em cada etapa, e desses quantos aceitam ofertas. */
  etapas: { etapa: Etapa; nome: string; pessoas: number; aceitam: number }[]
  engajamento: { valor: Engajamento; nome: string; pessoas: number; aceitam: number }[]
}

/**
 * A ABA DA BASE: os números do que entrou e as etiquetas da base inteira —
 * cada pessoa com os pedidos da loja antiga e os da nova (pelo e-mail), os
 * sinais do CRM (o último clique, a última anotação do site) e os Ajustes.
 */
export function montarTelaDaBase(
  entrada: {
    resumo: ResumoDaBase
    pessoas: PessoaLidaDaBase[]
    pedidos: PedidoLidoDaBase[]
    /** Os pedidos da loja nova de cada e-mail, já do jeito das etiquetas. */
    pedidosDaLoja: Map<string, PedidoDaPessoa[]>
    sinais: Map<string, { ultimoClique: Date | null; ultimaVisita: Date | null }>
    ajustes: AjustesDoCrm
  },
  agora: Date = new Date()
): TelaDaBase {
  const { resumo } = entrada
  const daBase = new Map<string, PedidoDaPessoa[]>()
  for (const p of entrada.pedidos)
    daBase.set(p.email, [...(daBase.get(p.email) ?? []), pedidoDaBase(p)])
  const porEtapa = new Map(ETAPAS.map((e) => [e, { pessoas: 0, aceitam: 0 }]))
  const porEngajamento = new Map(ENGAJAMENTOS.map((e) => [e, { pessoas: 0, aceitam: 0 }]))
  for (const pessoa of entrada.pessoas) {
    const sinais = entrada.sinais.get(pessoa.email)
    const e = etiquetasDaPessoa({
      pedidos: [
        ...(daBase.get(pessoa.email) ?? []),
        ...(entrada.pedidosDaLoja.get(pessoa.email) ?? []),
      ],
      sinais: {
        ultimoClique: emData(sinais?.ultimoClique),
        ultimaVisita: emData(sinais?.ultimaVisita),
        newsletterDesde: emData(pessoa.newsletterEm),
      },
      agora,
      dias: entrada.ajustes.dias,
      regras: entrada.ajustes.regras,
    })
    for (const conta of [porEtapa.get(e.etapa.valor), porEngajamento.get(e.engajamento.valor)]) {
      if (!conta) continue
      conta.pessoas++
      if (pessoa.aceitaOfertas) conta.aceitam++
    }
  }
  const comAno = (d: Date | string | null) => (emData(d) ? COM_ANO.format(emData(d)!) : null)
  return {
    vazia: resumo.pessoas + resumo.pedidos + resumo.carrinhos === 0,
    numeros: {
      pessoas: resumo.pessoas,
      aceitam: resumo.aceitam,
      pedidos: resumo.pedidos,
      pagos: resumo.pagos,
      vendido: resumo.vendidoCentavos / 100,
      carrinhos: resumo.carrinhos,
      primeiroPedido: comAno(resumo.primeiroPedido),
      ultimoPedido: comAno(resumo.ultimoPedido),
      importadoEm: resumo.importadoEm ? quando(resumo.importadoEm, agora) : null,
    },
    etapas: ETAPAS.map((etapa) => ({
      etapa,
      nome: NOME_DA_ETAPA[etapa],
      ...(porEtapa.get(etapa) ?? { pessoas: 0, aceitam: 0 }),
    })),
    engajamento: ENGAJAMENTOS.map((valor) => ({
      valor,
      nome: NOME_DO_ENGAJAMENTO[valor],
      ...(porEngajamento.get(valor) ?? { pessoas: 0, aceitam: 0 }),
    })),
  }
}

/** O que o histórico da loja antiga diz de quanto dura cada tipo — nulo sem a base. */
export function recomprasDaBase(pedidos: PedidoLidoDaBase[]) {
  if (!pedidos.length) return null
  return recomprasPorTipo(
    pedidos.map((p) => ({
      email: p.email,
      feitoEm: emData(p.feitoEm) ?? new Date(0),
      pago: p.pagamento === "confirmado",
      itens: (p.itens ?? []).map((i) => ({ sku: i.sku, quantidade: i.quantidade })),
    }))
  )
}
