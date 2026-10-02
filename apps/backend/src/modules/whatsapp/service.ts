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
  termosDaBusca,
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

/** Uma conversa como a tela do painel lê. */
export type ConversaDoPainel = ConversaLida & {
  id: string
  telefone: string
  nome: string | null
  equipe_motivo: string | null
  ultima: {
    texto: string | null
    autor: "cliente" | "bot" | "equipe"
    tipo: string
    em: Date
  } | null
}

export type ContagensDoPainel = {
  todas: number
  equipe: number
  atendente: number
  /** Com a equipe, e a última mensagem não é dela. */
  esperando: number
  esperandoDesde: Date | null
}

export type NumerosDoDia = {
  conversas: number
  respostas: number
  /** As respostas que gravaram o catálogo no cache (a primeira depois de uma hora parada). */
  gravacoes: number
  uso: {
    entrada: number
    saida: number
    cacheLido: number
    cacheCriado: number
    cacheCriado1h: number
  }
}

export type MensagemDoPainel = {
  id: string
  autor: "cliente" | "bot" | "equipe"
  tipo: string
  texto: string | null
  situacao: string | null
  erro: string | null
  dados: Record<string, unknown> | null
  em: Date
}

function conversaDoPainel(l: Record<string, unknown>): ConversaDoPainel {
  const autor = l.ultima_autor
  return {
    id: String(l.id),
    telefone: String(l.telefone),
    nome: (l.nome as string | null) ?? null,
    situacao: l.situacao === "equipe" ? "equipe" : "bot",
    equipe_desde: data(l.equipe_desde),
    equipe_motivo: (l.equipe_motivo as string | null) ?? null,
    ultima_entrada_em: data(l.ultima_entrada_em),
    pendente_desde: data(l.pendente_desde),
    ultima:
      autor === "cliente" || autor === "bot" || autor === "equipe"
        ? {
            texto: (l.ultima_texto as string | null) ?? null,
            autor,
            tipo: String(l.ultima_tipo ?? "texto"),
            em: data(l.ultima_em) ?? new Date(0),
          }
        : null,
  }
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

  /* ── o painel (`lib/painel/ler-whatsapp.ts`) ──────────────────────────── */

  /**
   * As conversas da tela, da mais recente pra mais antiga, com a última
   * mensagem de cada uma. `esperando`: com a equipe, e a última mensagem não é
   * da equipe — alguém precisa responder.
   */
  @InjectManager()
  async conversasDoPainel(
    p: {
      filtro: "todas" | "equipe" | "atendente"
      busca: string | null
      limite: number
      pular: number
    },
    @MedusaContext() ctx: Contexto = {}
  ): Promise<ConversaDoPainel[]> {
    const onde: string[] = ["c.deleted_at is null"]
    const valores: unknown[] = []
    if (p.filtro === "equipe") onde.push("c.situacao = 'equipe'")
    if (p.filtro === "atendente") onde.push("c.situacao = 'bot'")
    if (p.busca) {
      const { nome, numero } = termosDaBusca(p.busca)
      onde.push(numero ? "(c.nome ilike ? or c.telefone like ?)" : "c.nome ilike ?")
      valores.push(nome, ...(numero ? [numero] : []))
    }
    const linhas = (await ctx.manager!.execute(
      `select c.id, c.telefone, c.nome, c.situacao, c.equipe_desde, c.equipe_motivo,
              c.ultima_entrada_em, c.pendente_desde,
              u.texto as ultima_texto, u.autor as ultima_autor, u.tipo as ultima_tipo, u.em as ultima_em
         from whatsapp_conversa c
         join lateral (
           select texto, autor, tipo, em from whatsapp_mensagem m
            where m.conversa_id = c.id and m.deleted_at is null
              and not (m.direcao = 'saida' and m.situacao = 'falhou')
            order by m.created_at desc limit 1
         ) u on true
        where ${onde.join(" and ")}
        order by u.em desc
        limit ? offset ?`,
      [...valores, p.limite, p.pular]
    )) as Record<string, unknown>[]
    return linhas.map(conversaDoPainel)
  }

  /** As contas da tela: quantas em cada fita, quantas esperam a equipe e desde quando. */
  @InjectManager()
  async contagensDoPainel(@MedusaContext() ctx: Contexto = {}): Promise<ContagensDoPainel> {
    const [l] = (await ctx.manager!.execute(
      `select count(*)::int as todas,
              count(*) filter (where c.situacao = 'equipe')::int as equipe,
              count(*) filter (where c.situacao = 'bot')::int as atendente,
              count(*) filter (where c.situacao = 'equipe' and u.autor <> 'equipe')::int as esperando,
              min(c.equipe_desde) filter (where c.situacao = 'equipe' and u.autor <> 'equipe') as desde
         from whatsapp_conversa c
         join lateral (
           select autor from whatsapp_mensagem m
            where m.conversa_id = c.id and m.deleted_at is null
              and not (m.direcao = 'saida' and m.situacao = 'falhou')
            order by m.created_at desc limit 1
         ) u on true
        where c.deleted_at is null`
    )) as Record<string, unknown>[]
    return {
      todas: Number(l?.todas) || 0,
      equipe: Number(l?.equipe) || 0,
      atendente: Number(l?.atendente) || 0,
      esperando: Number(l?.esperando) || 0,
      esperandoDesde: data(l?.desde),
    }
  }

  /** O dia: as conversas com mensagem do cliente, as respostas do atendente e o uso da IA. */
  @InjectManager()
  async doDia(desde: Date, @MedusaContext() ctx: Contexto = {}): Promise<NumerosDoDia> {
    const [l] = (await ctx.manager!.execute(
      `select count(distinct conversa_id) filter (where autor = 'cliente')::int as conversas,
              count(*) filter (where autor = 'bot' and situacao is distinct from 'falhou')::int as respostas,
              coalesce(sum((dados->'uso'->>'entrada')::int) filter (where autor = 'bot'), 0)::int as entrada,
              coalesce(sum((dados->'uso'->>'saida')::int) filter (where autor = 'bot'), 0)::int as saida,
              coalesce(sum((dados->'uso'->>'cacheLido')::int) filter (where autor = 'bot'), 0)::int as cache_lido,
              coalesce(sum((dados->'uso'->>'cacheCriado')::int) filter (where autor = 'bot'), 0)::int as cache_criado,
              -- A resposta de antes da 0243 não separava a gravação de 1 hora: conta tudo como dela.
              coalesce(sum(coalesce((dados->'uso'->>'cacheCriado1h')::int, (dados->'uso'->>'cacheCriado')::int))
                filter (where autor = 'bot'), 0)::int as cache_criado_1h,
              count(*) filter (where autor = 'bot' and coalesce((dados->'uso'->>'cacheCriado1h')::int,
                case when (dados->'uso'->>'cacheCriado')::int > 2000 then 1 else 0 end) > 0)::int as gravacoes
         from whatsapp_mensagem
        where deleted_at is null and em >= ?`,
      [desde]
    )) as Record<string, unknown>[]
    return {
      conversas: Number(l?.conversas) || 0,
      respostas: Number(l?.respostas) || 0,
      gravacoes: Number(l?.gravacoes) || 0,
      uso: {
        entrada: Number(l?.entrada) || 0,
        saida: Number(l?.saida) || 0,
        cacheLido: Number(l?.cache_lido) || 0,
        cacheCriado: Number(l?.cache_criado) || 0,
        cacheCriado1h: Number(l?.cache_criado_1h) || 0,
      },
    }
  }

  /** Uma conversa, pelo id. */
  @InjectManager()
  async conversaDoPainel(
    id: string,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<ConversaDoPainel | null> {
    const [l] = (await ctx.manager!.execute(
      `select c.id, c.telefone, c.nome, c.situacao, c.equipe_desde, c.equipe_motivo,
              c.ultima_entrada_em, c.pendente_desde,
              null as ultima_texto, null as ultima_autor, null as ultima_tipo, null as ultima_em
         from whatsapp_conversa c where c.id = ? and c.deleted_at is null`,
      [id]
    )) as Record<string, unknown>[]
    return l ? conversaDoPainel(l) : null
  }

  /** As mensagens de uma conversa, das mais antigas pras mais novas (as `limite` últimas). */
  @InjectManager()
  async mensagensDoPainel(
    conversaId: string,
    limite: number,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<MensagemDoPainel[]> {
    const linhas = (await ctx.manager!.execute(
      `select id, autor, tipo, texto, situacao, erro, dados, em from (
         select * from whatsapp_mensagem where conversa_id = ? and deleted_at is null
          order by created_at desc limit ?
       ) m order by m.created_at asc`,
      [conversaId, limite]
    )) as Record<string, unknown>[]
    return linhas.map((l) => ({
      id: String(l.id),
      autor: l.autor === "bot" || l.autor === "equipe" ? l.autor : "cliente",
      tipo: String(l.tipo),
      texto: (l.texto as string | null) ?? null,
      situacao: (l.situacao as string | null) ?? null,
      erro: (l.erro as string | null) ?? null,
      dados: (l.dados as Record<string, unknown> | null) ?? null,
      em: data(l.em) ?? new Date(0),
    }))
  }

  /**
   * A EQUIPE RESPONDEU: a conversa fica com ela (o atendente quieto até
   * `VOLTA_PRO_BOT_EM_H` depois da última mensagem da equipe), e sai da fila.
   */
  @InjectManager()
  async equipeAssumiu(
    conversaId: string,
    em: Date,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<void> {
    await ctx.manager!.execute(
      `update whatsapp_conversa set situacao = 'equipe',
         equipe_desde = coalesce(equipe_desde, ?),
         equipe_motivo = coalesce(equipe_motivo, 'a equipe assumiu a conversa'),
         pendente_desde = null, tentativas = 0, updated_at = now()
       where id = ?`,
      [em, conversaId]
    )
  }

  /**
   * DEVOLVER PRO ATENDENTE: a conversa volta pro bot; se a última mensagem é
   * do cliente (ninguém respondeu), ela entra na fila — o atendente responde
   * na próxima rodada.
   */
  @InjectManager()
  async devolver(conversaId: string, @MedusaContext() ctx: Contexto = {}): Promise<void> {
    await ctx.manager!.execute(
      `update whatsapp_conversa c set situacao = 'bot', equipe_desde = null, equipe_motivo = null,
         tentativas = 0,
         pendente_desde = (
           select case when u.autor = 'cliente' then u.em else null end from (
             select autor, em from whatsapp_mensagem m
              where m.conversa_id = c.id and m.deleted_at is null
                and coalesce((m.dados->>'automatica')::boolean, false) = false
                and not (m.direcao = 'saida' and m.situacao = 'falhou')
              order by m.created_at desc limit 1
           ) u
         ),
         updated_at = now()
       where c.id = ?`,
      [conversaId]
    )
  }

  /** Cada mensagem desde `desde`, com o telefone da conversa — as vendas pelo WhatsApp. */
  @InjectManager()
  async momentosDesde(
    desde: Date,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<{ telefone: string; em: Date }[]> {
    const linhas = (await ctx.manager!.execute(
      `select c.telefone, m.em from whatsapp_mensagem m
         join whatsapp_conversa c on c.id = m.conversa_id and c.deleted_at is null
        where m.deleted_at is null and m.em >= ?`,
      [desde]
    )) as Record<string, unknown>[]
    return linhas.flatMap((l) => {
      const em = data(l.em)
      return em ? [{ telefone: String(l.telefone), em }] : []
    })
  }

  /**
   * O PRAZO (`jobs/limpar-o-whatsapp.ts`): apaga DE VERDADE as mensagens de
   * antes de `antes` e, depois, a conversa que ficou sem mensagem nenhuma — o
   * telefone e o nome do perfil saem junto com a última.
   */
  @InjectManager()
  async limpar(
    antes: Date,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<{ mensagens: number; conversas: number }> {
    const [mensagens] = (await ctx.manager!.execute(
      `with apagadas as (delete from whatsapp_mensagem where em < ? returning 1)
       select count(*)::int as n from apagadas`,
      [antes]
    )) as { n: number }[]
    const [conversas] = (await ctx.manager!.execute(
      `with apagadas as (
         delete from whatsapp_conversa c
          where coalesce(c.ultima_entrada_em, c.created_at) < ?
            and c.pendente_desde is null
            and not exists (select 1 from whatsapp_mensagem m where m.conversa_id = c.id)
         returning 1
       )
       select count(*)::int as n from apagadas`,
      [antes]
    )) as { n: number }[]
    return { mensagens: mensagens?.n ?? 0, conversas: conversas?.n ?? 0 }
  }
}

function data(v: unknown): Date | null {
  if (v === null || v === undefined) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}
