import type { Context } from "@medusajs/framework/types"
import {
  generateEntityId,
  InjectManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils"
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex"
import type { MensagemQueChegou, SituacaoQueChegou } from "../../lib/whatsapp/meta"
import {
  ehRespostaAutomatica,
  type ConversaLida,
  type MensagemLida,
} from "../../lib/whatsapp/regras"
import { Conversa } from "./models/conversa"
import { Mensagem } from "./models/mensagem"

type Contexto = Context<EntityManager>

/** A conversa como o job lê. */
export type ConversaDaFila = ConversaLida & {
  id: string
  telefone: string
  nome: string | null
  tentativas: number
}

/** O que sai: o texto do atendente ou da equipe, com o que ajuda a entender. */
export type MensagemQueSai = {
  conversaId: string
  autor: "bot" | "equipe"
  texto: string
  wamid: string | null
  situacao: "enviada" | "falhou"
  erro?: string | null
  dados?: Record<string, unknown> | null
  em: Date
}

/** A ordem das situações: "entregue" que chega depois de "lida" não desfaz a leitura. */
const ORDEM = `case situacao when 'enviada' then 1 when 'entregue' then 2 when 'lida' then 3 else 0 end`
const ORDEM_NOVA = `case ? when 'enviada' then 1 when 'entregue' then 2 when 'lida' then 3 else 0 end`

/**
 * AS TABELAS DO WHATSAPP — `listConversas`, `listMensagems`… (o Medusa gera),
 * e as contas que precisam ser do banco numa linha só: a Meta manda o mesmo
 * aviso de novo quando a resposta atrasa, e duas mensagens do mesmo número
 * chegam juntas — nenhuma das duas coisas pode criar conversa dobrada nem
 * mensagem repetida. Por isso o `insert … on conflict`, como no CRM.
 */
const Tabelas = MedusaService({ Conversas: Conversa, Mensagens: Mensagem })

export default class WhatsappService extends Tabelas {
  /**
   * A MENSAGEM QUE CHEGOU: a conversa (criada na primeira vez), a mensagem
   * (uma vez só, pelo `wamid`) e a fila — a conversa passa a esperar resposta,
   * a não ser que a mensagem seja a resposta automática do WhatsApp Business
   * de quem escreveu. Devolve se a mensagem era nova.
   */
  @InjectManager()
  async receber(m: MensagemQueChegou, @MedusaContext() ctx: Contexto = {}): Promise<boolean> {
    const pedeResposta = !ehRespostaAutomatica(m.texto)
    const [conversa] = (await ctx.manager!.execute(
      `insert into whatsapp_conversa (id, telefone, nome, created_at, updated_at)
       values (?, ?, ?, now(), now())
       on conflict (telefone) where deleted_at is null do update set
         nome = coalesce(excluded.nome, whatsapp_conversa.nome),
         updated_at = now()
       returning id`,
      [generateEntityId(undefined, "wcon"), m.telefone, m.nome]
    )) as { id: string }[]

    const nova = (await ctx.manager!.execute(
      `insert into whatsapp_mensagem
         (id, conversa_id, wamid, direcao, autor, tipo, texto, dados, em, created_at, updated_at)
       values (?, ?, ?, 'entrada', 'cliente', ?, ?, ?, ?, now(), now())
       on conflict (wamid) where deleted_at is null and wamid is not null do nothing
       returning id`,
      [
        generateEntityId(undefined, "wmsg"),
        conversa.id,
        m.wamid,
        m.tipo,
        m.texto,
        pedeResposta ? null : JSON.stringify({ automatica: true }),
        m.em,
      ]
    )) as { id: string }[]
    if (!nova.length) return false

    await ctx.manager!.execute(
      `update whatsapp_conversa set
         ultima_entrada_em = greatest(coalesce(ultima_entrada_em, ?), ?),
         pendente_desde = case when ? then coalesce(pendente_desde, ?) else pendente_desde end,
         updated_at = now()
       where id = ?`,
      [m.em, m.em, pedeResposta, m.em, conversa.id]
    )
    return true
  }

  /** "Entregue", "lida", "falhou" — sem voltar atrás ("entregue" depois de "lida" não muda nada). */
  @InjectManager()
  async anotarSituacao(s: SituacaoQueChegou, @MedusaContext() ctx: Contexto = {}): Promise<void> {
    if (s.situacao === "falhou") {
      await ctx.manager!.execute(
        `update whatsapp_mensagem set situacao = 'falhou', erro = ?, updated_at = now()
          where wamid = ? and deleted_at is null`,
        [s.erro, s.wamid]
      )
      return
    }
    await ctx.manager!.execute(
      `update whatsapp_mensagem set situacao = ?, updated_at = now()
        where wamid = ? and deleted_at is null and direcao = 'saida'
          and coalesce(situacao, '') <> 'falhou' and ${ORDEM} < ${ORDEM_NOVA}`,
      [s.situacao, s.wamid, s.situacao]
    )
  }

  /** As conversas com mensagem esperando resposta, das mais antigas pras mais novas. */
  @InjectManager()
  async fila(limite: number, @MedusaContext() ctx: Contexto = {}): Promise<ConversaDaFila[]> {
    const linhas = (await ctx.manager!.execute(
      `select id, telefone, nome, situacao, equipe_desde, ultima_entrada_em, pendente_desde, tentativas
         from whatsapp_conversa
        where deleted_at is null and pendente_desde is not null
        order by pendente_desde asc
        limit ?`,
      [limite]
    )) as Record<string, unknown>[]
    return linhas.map((l) => ({
      id: String(l.id),
      telefone: String(l.telefone),
      nome: (l.nome as string | null) ?? null,
      situacao: l.situacao === "equipe" ? "equipe" : "bot",
      equipe_desde: data(l.equipe_desde),
      ultima_entrada_em: data(l.ultima_entrada_em),
      pendente_desde: data(l.pendente_desde),
      tentativas: Number(l.tentativas) || 0,
    }))
  }

  /** As últimas mensagens da conversa (as automáticas do outro lado ficam de fora). */
  @InjectManager()
  async historico(
    conversaId: string,
    p: { limite: number; desde: Date },
    @MedusaContext() ctx: Contexto = {}
  ): Promise<(MensagemLida & { wamid: string | null; chegou: Date })[]> {
    const linhas = (await ctx.manager!.execute(
      `select autor, tipo, texto, em, wamid, created_at, dados->>'leuAte' as leu_ate
         from whatsapp_mensagem
        where conversa_id = ? and deleted_at is null and em >= ?
          and coalesce((dados->>'automatica')::boolean, false) = false
          and not (direcao = 'saida' and situacao = 'falhou')
        order by created_at desc
        limit ?`,
      [conversaId, p.desde, p.limite]
    )) as Record<string, unknown>[]
    return linhas.map((l) => {
      const autor = l.autor === "bot" || l.autor === "equipe" ? l.autor : "cliente"
      const chegou = data(l.created_at) ?? data(l.em) ?? new Date(0)
      const leuAte = autor === "bot" ? data(l.leu_ate) : null
      return {
        autor,
        tipo: String(l.tipo),
        texto: (l.texto as string | null) ?? null,
        em: data(l.em) ?? new Date(0),
        // A resposta do atendente vem logo depois do que ele leu — e a mensagem que chegou
        // enquanto ele respondia fica DEPOIS dela, esperando (ver `respondida`).
        ordem: leuAte ? new Date(leuAte.getTime() + 1) : chegou,
        wamid: (l.wamid as string | null) ?? null,
        chegou,
      }
    })
  }

  /** Quantas respostas o atendente deu nesta conversa desde `desde`. */
  @InjectManager()
  async respostasDoBot(
    conversaId: string,
    desde: Date,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<number> {
    const [l] = (await ctx.manager!.execute(
      `select count(*)::int as n from whatsapp_mensagem
        where conversa_id = ? and deleted_at is null and autor = 'bot' and em >= ?`,
      [conversaId, desde]
    )) as { n: number }[]
    return Number(l?.n) || 0
  }

  /** A hora da última mensagem da equipe na conversa (ou `null`). */
  @InjectManager()
  async ultimaDaEquipe(
    conversaId: string,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<Date | null> {
    const [l] = (await ctx.manager!.execute(
      `select max(em) as em from whatsapp_mensagem
        where conversa_id = ? and deleted_at is null and autor = 'equipe'`,
      [conversaId]
    )) as { em: unknown }[]
    return data(l?.em)
  }

  /** Grava o que a loja mandou (ou tentou mandar). */
  @InjectManager()
  async anotarSaida(m: MensagemQueSai, @MedusaContext() ctx: Contexto = {}): Promise<void> {
    await ctx.manager!.execute(
      `insert into whatsapp_mensagem
         (id, conversa_id, wamid, direcao, autor, tipo, texto, situacao, erro, dados, em, created_at, updated_at)
       values (?, ?, ?, 'saida', ?, 'texto', ?, ?, ?, ?, ?, now(), now())
       on conflict (wamid) where deleted_at is null and wamid is not null do nothing`,
      [
        generateEntityId(undefined, "wmsg"),
        m.conversaId,
        m.wamid,
        m.autor,
        m.texto,
        m.situacao,
        m.erro ?? null,
        m.dados ? JSON.stringify(m.dados) : null,
        m.em,
      ]
    )
  }

  /**
   * RESPONDIDA: a fila sai — mas só se nada chegou depois da última mensagem
   * que o atendente leu (`lidaAte`, a hora em que ela CHEGOU na loja, com
   * milissegundo: a hora da Meta é em segundos, e duas no mesmo segundo
   * pareciam a mesma). A que chegou no meio da resposta fica esperando a
   * próxima rodada, que lê tudo de novo. O banco guarda microssegundo e o
   * `Date` só milissegundo: a comparação é no milissegundo, senão a própria
   * mensagem lida parecia mais nova que ela mesma.
   */
  @InjectManager()
  async respondida(
    conversaId: string,
    lidaAte: Date,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<void> {
    await ctx.manager!.execute(
      `update whatsapp_conversa set
         pendente_desde =
           (select min(em) from whatsapp_mensagem
             where conversa_id = whatsapp_conversa.id and deleted_at is null
               and autor = 'cliente' and date_trunc('milliseconds', created_at) > ?
               and coalesce((dados->>'automatica')::boolean, false) = false),
         tentativas = 0,
         updated_at = now()
       where id = ?`,
      [lidaAte, conversaId]
    )
  }

  /** Tira da fila sem responder (a equipe cuida, ou a janela de 24 horas fechou). */
  @InjectManager()
  async largar(conversaId: string, @MedusaContext() ctx: Contexto = {}): Promise<void> {
    await ctx.manager!.execute(
      `update whatsapp_conversa set pendente_desde = null, tentativas = 0, updated_at = now()
        where id = ?`,
      [conversaId]
    )
  }

  /** Não saiu nesta rodada: conta a tentativa (a próxima rodada tenta de novo). */
  @InjectManager()
  async falhou(conversaId: string, @MedusaContext() ctx: Contexto = {}): Promise<number> {
    const [l] = (await ctx.manager!.execute(
      `update whatsapp_conversa set tentativas = tentativas + 1, updated_at = now()
        where id = ? returning tentativas`,
      [conversaId]
    )) as { tentativas: number }[]
    return Number(l?.tentativas) || 0
  }

  /** A conversa passa pra equipe (ou volta pro atendente). */
  @InjectManager()
  async passar(
    conversaId: string,
    para: { situacao: "bot" } | { situacao: "equipe"; motivo: string; em: Date },
    @MedusaContext() ctx: Contexto = {}
  ): Promise<void> {
    if (para.situacao === "bot") {
      await ctx.manager!.execute(
        `update whatsapp_conversa set situacao = 'bot', equipe_desde = null, equipe_motivo = null,
           updated_at = now() where id = ?`,
        [conversaId]
      )
      return
    }
    await ctx.manager!.execute(
      `update whatsapp_conversa set situacao = 'equipe', equipe_desde = ?, equipe_motivo = ?,
         updated_at = now() where id = ?`,
      [para.em, para.motivo.slice(0, 300), conversaId]
    )
  }
}

function data(v: unknown): Date | null {
  if (v === null || v === undefined) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}
