import { TIPOS, type Dados, type Item, type Tipo } from "../crm/eventos"
import { emailNoLog } from "../email"
import { quando, reais } from "./formato"
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

/** "chegou na loja · Instagram" — pelo mesmo nome das origens do Início e do Marketing. */
function aChegada(d: Dados): string {
  const o = d.origem
  if (!o) return "chegou na loja · direto"
  const nome = o.fonte ? nomeDaOrigem(o.fonte, o.meio ?? "") : nomeDaOrigem(o.de ?? "", "")
  return `chegou na loja · ${nome}${o.campanha ? ` (${o.campanha})` : ""}`
}

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
