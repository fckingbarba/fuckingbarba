import type { ConversaDoPainel, MensagemDoPainel } from "../../modules/whatsapp/service"
import { JANELA_H, textoDoCliente } from "../whatsapp/regras"
import { hora, quando, dia, chaveDoDia } from "./formato"
import type { Paginacao } from "./paginas"

/**
 * O WHATSAPP NO PAINEL (a área `whatsapp`, entrega 0234) — o que as telas
 * mostram, montado aqui: a lista das conversas, a conversa aberta, os
 * números do topo. Puro (as leituras moram em `ler-whatsapp.ts`).
 *
 * O TELEFONE é contato de cliente: inteiro só pra quem abre os `contatos`
 * (o dono e a operação, no padrão); pro resto, com o meio escondido.
 */

export type FiltroDoWhatsapp = "todas" | "equipe" | "atendente"

export const FILTROS: { id: FiltroDoWhatsapp; nome: string }[] = [
  { id: "todas", nome: "Todas" },
  { id: "equipe", nome: "Com a equipe" },
  { id: "atendente", nome: "Atendente" },
]

export const ehFiltro = (v: unknown): v is FiltroDoWhatsapp => FILTROS.some((f) => f.id === v)

export type LinhaDaConversa = {
  id: string
  nome: string
  telefone: string
  /** "14:32" hoje, "ontem" ou "28/09". */
  quando: string
  /** A última mensagem, com quem disse ("Atendente: …"). */
  ultima: string
  situacao: "bot" | "equipe"
  /** Por que está com a equipe ("quer trocar o produto"). */
  motivo: string | null
  /** Com a equipe, e a última mensagem não é dela: alguém precisa responder. */
  esperando: boolean
  /** O que o telefone comprou nos 7 dias, depois de conversar: "R$ 99,90". */
  comprou: string | null
}

export type NumerosDoWhatsapp = {
  esperando: number
  /** "há 48 min" — a mais antiga esperando a equipe. */
  esperandoHa: string | null
  conversasHoje: number
  respostasHoje: number
  vendas: { total: string; pedidos: number }
  custoHoje: string
  custoPorResposta: string | null
  /** Do custo de hoje: o que foi gravar o catálogo (e quantas vezes) e o que foi responder. */
  custoGravando: string
  gravacoes: number
  custoRespondendo: string
}

export type TelaDoWhatsapp = {
  filtro: FiltroDoWhatsapp
  busca: string | null
  contagem: Record<FiltroDoWhatsapp, number>
  numeros: NumerosDoWhatsapp
  /** O atendente ligado (o liga/desliga dos Ajustes). */
  ligado: boolean
  /** As variáveis do Railway que faltam pro atendente responder. */
  falta: string[]
  conversas: LinhaDaConversa[]
  paginacao?: Paginacao
}

export type MensagemNaTela = {
  id: string
  autor: "cliente" | "bot" | "equipe"
  texto: string
  /** "14:32" */
  hora: string
  /** A chave do dia ("2026-10-01") e o rótulo ("hoje", "ontem", "28/09"): a tela separa os dias. */
  diaChave: string
  dia: string
  /** O que o atendente fez nesta resposta, em frase ("Viu os pedidos"). */
  ferramentas: string[]
  /** Na que sai: enviada, entregue, lida ou falhou. */
  situacao: string | null
  erro: string | null
  /** A mensagem só com o código do Pix (o atendente manda separada, pra copiar). */
  separada: boolean
  /** Na da equipe: quem mandou. */
  quem: string | null
}

export type QuemEscreve = {
  cliente: boolean
  pedidos: number
  /** A ficha do cliente no painel (`/clientes/:id`), quando o telefone é de uma conta ou pedido. */
  ficha: string | null
  tratamento: string | null
  reposicao: string | null
  ultimoPedido: {
    numero: number
    situacao: string
    itens: string
    total: string | null
    href: string
  } | null
}

export type ConversaNaTela = {
  id: string
  nome: string
  telefone: string
  situacao: "bot" | "equipe"
  motivo: string | null
  /** Até quando dá pra responder (as 24 horas da Meta); `null` = a janela fechou. */
  janelaAte: string | null
  mensagens: MensagemNaTela[]
  quem: QuemEscreve
}

/** As ferramentas do atendente, como a equipe lê. */
export const FERRAMENTAS_NA_TELA: Record<string, string> = {
  ver_produto: "Viu a página do produto",
  ver_meus_pedidos: "Viu os pedidos",
  ver_pedido: "Viu um pedido",
  mandar_codigo_do_pix: "Mandou o Pix",
  cotar_frete: "Cotou o frete",
  montar_sacola: "Montou a sacola",
  refazer_pedido: "Refez o pedido",
  chamar_a_equipe: "Chamou a equipe",
}

/** "+55 (00) 90000-1234"; sem os contatos, "+55 (00) 9••••-1234". */
export function telefoneNaTela(telefone: string, inteiro: boolean): string {
  const d = telefone.replace(/\D/g, "")
  const pais = d.startsWith("55") && d.length >= 12 ? "55" : ""
  const resto = pais ? d.slice(2) : d
  if (resto.length < 10) return inteiro ? `+${d}` : `+${d.slice(0, 2)}•••${d.slice(-4)}`
  const ddd = resto.slice(0, 2)
  const numero = resto.slice(2)
  const meio = numero.slice(0, numero.length - 4)
  const fim = numero.slice(-4)
  const mostrado = inteiro ? meio : `${meio[0]}${"•".repeat(Math.max(0, meio.length - 1))}`
  return `${pais ? "+55 " : "+"}(${ddd}) ${mostrado}-${fim}`
}

const curto = (t: string, n = 90) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)

/** "14:32" hoje, "ontem", "28/09". */
export function quandoCurto(d: Date, agora: Date): string {
  const q = quando(d, agora)
  if (q.startsWith("hoje")) return hora(d)
  if (q.startsWith("ontem")) return "ontem"
  return dia(d)
}

const DE_QUEM = { cliente: "", bot: "Atendente: ", equipe: "Equipe: " } as const

export function linhaDaConversa(
  c: ConversaDoPainel,
  p: { contatos: boolean; agora: Date; comprou: string | null }
): LinhaDaConversa {
  const u = c.ultima
  const texto = u
    ? u.autor === "cliente"
      ? textoDoCliente({ tipo: u.tipo, texto: u.texto })
      : (u.texto ?? "")
    : ""
  return {
    id: c.id,
    nome: c.nome?.trim() || telefoneNaTela(c.telefone, p.contatos),
    telefone: telefoneNaTela(c.telefone, p.contatos),
    quando: u ? quandoCurto(u.em, p.agora) : "",
    ultima: curto(`${u ? DE_QUEM[u.autor] : ""}${texto}`),
    situacao: c.situacao,
    motivo: c.situacao === "equipe" ? (c.equipe_motivo ?? null) : null,
    esperando: c.situacao === "equipe" && u !== null && u.autor !== "equipe",
    comprou: p.comprou,
  }
}

const rotuloDoDia = (d: Date, agora: Date) => {
  const q = quando(d, agora)
  return q.startsWith("hoje") ? "hoje" : q.startsWith("ontem") ? "ontem" : dia(d)
}

export function mensagemNaTela(m: MensagemDoPainel, agora: Date): MensagemNaTela {
  const dados = m.dados ?? {}
  const ferramentas = Array.isArray(dados.ferramentas)
    ? [
        ...new Set(
          (dados.ferramentas as unknown[]).flatMap((f) =>
            typeof f === "string" ? [FERRAMENTAS_NA_TELA[f] ?? f] : []
          )
        ),
      ]
    : []
  if (dados.socorro && !ferramentas.includes("Chamou a equipe")) ferramentas.push("Chamou a equipe")
  return {
    id: m.id,
    autor: m.autor,
    texto:
      m.autor === "cliente" ? textoDoCliente({ tipo: m.tipo, texto: m.texto }) : (m.texto ?? ""),
    hora: hora(m.em),
    diaChave: chaveDoDia(m.em),
    dia: rotuloDoDia(m.em, agora),
    ferramentas,
    situacao: m.situacao,
    erro: m.erro,
    separada: dados.separada === true,
    quem: m.autor === "equipe" && typeof dados.nome === "string" ? dados.nome : null,
  }
}

/** Até quando a equipe consegue responder: 24 horas da última mensagem do cliente. */
export function janelaAte(ultimaEntrada: Date | null, agora: Date): string | null {
  if (!ultimaEntrada) return null
  const fim = new Date(ultimaEntrada.getTime() + JANELA_H * 3_600_000)
  if (fim.getTime() <= agora.getTime()) return null
  // "hoje, 18:40" ou "02/10, 14:31" (o dia seguinte).
  return quando(fim, agora)
}

/** "US$ 1,10" */
export const emDolar = (v: number) =>
  `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
