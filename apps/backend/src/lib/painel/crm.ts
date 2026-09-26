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
 * tem dono, e não quem é. A ficha de cada pessoa é a próxima parte.
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

export type TelaDoCrm = {
  periodo: PeriodoDoCrm
  numeros: NumerosDoCrm
  tipos: { tipo: Tipo; nome: string; vezes: number; visitantes: number }[]
  ultimos: { id: string; tipo: Tipo; quando: string; quem: string | null; oque: string }[]
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

export function montarTelaDoCrm(
  entrada: {
    periodo: PeriodoDoCrm
    numeros: NumerosDoCrm
    tipos: ContaDoTipo[]
    ultimos: EventoLidoDoBanco[]
  },
  agora: Date = new Date()
): TelaDoCrm {
  const porTipo = new Map(entrada.tipos.map((t) => [t.tipo, t]))
  return {
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
