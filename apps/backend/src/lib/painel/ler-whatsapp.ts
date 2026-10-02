import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { WHATSAPP } from "../../modules/whatsapp"
import type WhatsappService from "../../modules/whatsapp/service"
import { lerFichaDoSite } from "../crm/ficha-do-site"
import { ajustesDoWhatsapp } from "../whatsapp/ajustes"
import { custoDaGravacao, custoEmDolar } from "../whatsapp/atendente"
import { clientePeloTelefone } from "../whatsapp/cliente"
import { credenciaisDoWhatsapp } from "../whatsapp/meta"
import { lerPedidosDoWhatsapp, SITUACAO_CURTA } from "../whatsapp/pedidos"
import { chaveDoTelefone } from "../whatsapp/regras"
import { chaveDoDia, minutosEntre, duracao, reais } from "./formato"
import { POR_PAGINA } from "./paginas"
import {
  emDolar,
  janelaAte,
  linhaDaConversa,
  mensagemNaTela,
  telefoneNaTela,
  type ConversaNaTela,
  type FiltroDoWhatsapp,
  type QuemEscreve,
  type TelaDoWhatsapp,
} from "./whatsapp"

/**
 * AS LEITURAS DO WHATSAPP NO PAINEL — a tela das conversas e a conversa
 * aberta (`whatsapp.ts` monta; aqui se lê).
 */

const DIA = 24 * 60 * 60 * 1000
/** Quanto antes do pedido a conversa conta como "vendeu pelo WhatsApp". */
export const CONVERSA_ANTES_DO_PEDIDO_H = 48

/** O começo do dia de hoje, no fuso da loja (Brasília, sem horário de verão). */
function inicioDoDia(agora: Date): Date {
  return new Date(`${chaveDoDia(agora)}T00:00:00-03:00`)
}

/** As variáveis do Railway que faltam pro atendente responder. */
export function faltaPraResponder(env = process.env): string[] {
  const falta: string[] = []
  if (!credenciaisDoWhatsapp(env)) falta.push("WHATSAPP_TOKEN e WHATSAPP_NUMERO_ID")
  if (!env.WHATSAPP_APP_SEGREDO?.trim()) falta.push("WHATSAPP_APP_SEGREDO")
  if (!env.ANTHROPIC_API_KEY?.trim()) falta.push("ANTHROPIC_API_KEY")
  return falta
}

type PedidoDaVenda = {
  id: string
  status?: string | null
  created_at: string | Date
  total?: unknown
  shipping_address?: { phone?: string | null } | null
  billing_address?: { phone?: string | null } | null
  payment_collections?: { payments?: { captured_at?: unknown }[] | null }[] | null
}

/** "chegou agora" · "há 12 min" · "há 1 h 05" — a mais antiga esperando a equipe. */
export const haQuanto = (minutos: number) =>
  minutos < 1 ? "chegou agora" : `há ${duracao(minutos)}`

/**
 * AS VENDAS PELO WHATSAPP — os pedidos pagos (não cancelados) desde `desde`
 * cujo telefone conversou no WhatsApp da loja nas 48 horas antes do pedido.
 * O telefone casa como o do atendente (`chaveDoTelefone`). Devolve o total e,
 * por telefone, quanto comprou.
 */
export async function vendasPeloWhatsapp(
  container: MedusaContainer,
  desde: Date
): Promise<{ total: number; pedidos: number; porTelefone: Map<string, number> }> {
  const whatsapp = container.resolve<WhatsappService>(WHATSAPP)
  const momentos = await whatsapp.momentosDesde(
    new Date(desde.getTime() - CONVERSA_ANTES_DO_PEDIDO_H * 3_600_000)
  )
  const vazio = { total: 0, pedidos: 0, porTelefone: new Map<string, number>() }
  if (!momentos.length) return vazio
  const conversou = new Map<string, number[]>()
  for (const m of momentos) {
    const chave = chaveDoTelefone(m.telefone)
    if (chave) conversou.set(chave, [...(conversou.get(chave) ?? []), m.em.getTime()])
  }
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "created_at",
      "total",
      "shipping_address.phone",
      "billing_address.phone",
      "payment_collections.payments.captured_at",
    ],
    filters: { is_draft_order: false, created_at: { $gte: desde } },
    pagination: { take: 2000 },
  })
  const r = vazio
  for (const o of data as unknown as PedidoDaVenda[]) {
    if (o.status === "canceled") continue
    const pago = (o.payment_collections ?? []).some((c) =>
      (c.payments ?? []).some((p) => Boolean(p.captured_at))
    )
    if (!pago) continue
    const chaves = [o.shipping_address?.phone, o.billing_address?.phone]
      .map((t) => chaveDoTelefone(t))
      .filter((c): c is string => Boolean(c))
    const feito = new Date(o.created_at).getTime()
    const chave = chaves.find((c) =>
      (conversou.get(c) ?? []).some(
        (t) => t <= feito && feito - t <= CONVERSA_ANTES_DO_PEDIDO_H * 3_600_000
      )
    )
    if (!chave) continue
    const total = Number(o.total) || 0
    r.total += total
    r.pedidos++
    r.porTelefone.set(chave, (r.porTelefone.get(chave) ?? 0) + total)
  }
  return r
}

export async function lerTelaDoWhatsapp(
  container: MedusaContainer,
  p: { filtro: FiltroDoWhatsapp; busca: string | null; pagina: number; contatos: boolean },
  agora = new Date()
): Promise<TelaDoWhatsapp> {
  const whatsapp = container.resolve<WhatsappService>(WHATSAPP)
  const busca = p.busca?.trim().slice(0, 60) || null
  const [contagem, doDia, vendas, ajustes] = await Promise.all([
    whatsapp.contagensDoPainel(),
    whatsapp.doDia(inicioDoDia(agora)),
    vendasPeloWhatsapp(container, new Date(agora.getTime() - 7 * DIA)),
    ajustesDoWhatsapp(container),
  ])
  const total = busca ? null : contagem[p.filtro]
  const paginas = total === null ? 1 : Math.max(1, Math.ceil(total / POR_PAGINA))
  const pagina = Math.min(Math.max(1, p.pagina), paginas)
  const conversas = await whatsapp.conversasDoPainel({
    filtro: p.filtro,
    busca,
    limite: POR_PAGINA,
    pular: (pagina - 1) * POR_PAGINA,
  })
  const custo = custoEmDolar(doDia.uso)
  const gravando = custoDaGravacao(doDia.uso)
  return {
    filtro: p.filtro,
    busca,
    contagem: { todas: contagem.todas, equipe: contagem.equipe, atendente: contagem.atendente },
    numeros: {
      esperando: contagem.esperando,
      esperandoHa: contagem.esperandoDesde
        ? haQuanto(minutosEntre(contagem.esperandoDesde, agora))
        : null,
      conversasHoje: doDia.conversas,
      respostasHoje: doDia.respostas,
      vendas: { total: reais(vendas.total), pedidos: vendas.pedidos },
      custoHoje: emDolar(custo),
      custoPorResposta: doDia.respostas ? emDolar(custo / doDia.respostas) : null,
      custoGravando: emDolar(gravando),
      gravacoes: doDia.gravacoes,
      custoRespondendo: emDolar(Math.max(0, custo - gravando)),
    },
    ligado: ajustes.ligado,
    falta: faltaPraResponder(),
    conversas: conversas.map((c) => {
      const chave = chaveDoTelefone(c.telefone)
      const comprou = chave ? vendas.porTelefone.get(chave) : undefined
      return linhaDaConversa(c, {
        contatos: p.contatos,
        agora,
        comprou: comprou ? reais(comprou) : null,
      })
    }),
    ...(total !== null && total > POR_PAGINA
      ? { paginacao: { pagina, paginas, porPagina: POR_PAGINA, itens: total } }
      : {}),
  }
}

/** Quem escreve: os pedidos do telefone, a ficha do site e o último pedido. */
async function quemEscreve(
  container: MedusaContainer,
  telefone: string,
  contatos: boolean,
  agora: Date
): Promise<QuemEscreve> {
  const vazio: QuemEscreve = {
    cliente: false,
    pedidos: 0,
    ficha: null,
    tratamento: null,
    reposicao: null,
    ultimoPedido: null,
  }
  const cliente = await clientePeloTelefone(container, telefone).catch(() => null)
  if (!cliente) return vazio
  if (!contatos) return { ...vazio, cliente: true, pedidos: cliente.pedidos.length }
  const [ficha, ultimos] = await Promise.all([
    cliente.email ? lerFichaDoSite(container, cliente.email, agora).catch(() => null) : null,
    cliente.pedidos.length
      ? lerPedidosDoWhatsapp(container, { ids: cliente.pedidos.slice(0, 1) }, agora).catch(() => [])
      : [],
  ])
  const ultimo = ultimos[0]
  return {
    cliente: true,
    pedidos: cliente.pedidos.length,
    ficha: cliente.clienteId ? `/clientes/${cliente.clienteId}` : null,
    tratamento: ficha?.tratamento ? `dia ${ficha.tratamento.dia} do Fator` : null,
    reposicao: ficha?.reposicao?.titulo ?? null,
    ultimoPedido: ultimo
      ? {
          numero: ultimo.numero,
          situacao: SITUACAO_CURTA[ultimo.situacao],
          itens: ultimo.itens.map((i) => `${i.quantidade}x ${i.nome}`).join(", "),
          total: ultimo.total !== null ? reais(ultimo.total) : null,
          href: `/pedidos/${ultimo.id}`,
        }
      : null,
  }
}

/** As mensagens que a tela mostra de uma conversa (as últimas). */
export const MENSAGENS_NA_TELA = 150

export async function lerConversaDoWhatsapp(
  container: MedusaContainer,
  id: string,
  p: { contatos: boolean },
  agora = new Date()
): Promise<ConversaNaTela | null> {
  const whatsapp = container.resolve<WhatsappService>(WHATSAPP)
  const c = await whatsapp.conversaDoPainel(id)
  if (!c) return null
  const [mensagens, quem] = await Promise.all([
    whatsapp.mensagensDoPainel(id, MENSAGENS_NA_TELA),
    quemEscreve(container, c.telefone, p.contatos, agora),
  ])
  return {
    id: c.id,
    nome: c.nome?.trim() || telefoneNaTela(c.telefone, p.contatos),
    telefone: telefoneNaTela(c.telefone, p.contatos),
    situacao: c.situacao,
    motivo: c.situacao === "equipe" ? c.equipe_motivo : null,
    janelaAte: janelaAte(c.ultima_entrada_em, agora),
    mensagens: mensagens.map((m) => mensagemNaTela(m, agora)),
    quem,
  }
}
