import type { Context } from "@medusajs/framework/types"
import {
  generateEntityId,
  InjectManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils"
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex"
import { chaveDoVisitante, momentoDo, origemDoLote, type Lote } from "../../lib/crm/eventos"
import type { AvisoDoEmail } from "../../lib/crm/resend"
import type {
  ContaDoTipo,
  ContaDoTipoDeEmail,
  EmailLidoDoBanco,
  EventoLidoDoBanco,
  NumerosDoCrm,
  NumerosDosEmails,
  PessoaNoCrm,
} from "../../lib/painel/crm"
import { EmailDoCrm } from "./models/email"
import { Evento } from "./models/evento"
import { Visitante } from "./models/visitante"

type Contexto = Context<EntityManager>

export type Como = "conta" | "checkout" | "newsletter"

/** O visitante como a rota precisa: pra saber se ainda falta dizer de quem ele é. */
export type VisitanteLido = {
  id: string
  email: string | null
  cliente_id: string | null
  como: Como | null
}

/**
 * AS TABELAS DO CRM — `listVisitantes`, `listEventos`… (o Medusa gera), e as
 * contas que precisam ser do banco, numa linha só: dois recados do mesmo
 * navegador chegando juntos (a aba que fecha e a que abre) não podem criar
 * dois visitantes. Por isso o `insert … on conflict`, como na
 * observabilidade.
 */
const Tabelas = MedusaService({
  Visitantes: Visitante,
  Eventos: Evento,
  Emails: EmailDoCrm,
})

export default class CrmService extends Tabelas {
  /**
   * O que o navegador mandou: o visitante (criado na primeira vez, com a
   * origem da primeira visita) e, uma linha por evento, o que ele fez — com
   * o e-mail que ele tiver agora. Devolve o visitante.
   */
  @InjectManager()
  async anotar(
    lote: Lote,
    agora: Date,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<VisitanteLido> {
    const origem = origemDoLote(lote)
    const [visitante] = (await ctx.manager!.execute(
      `insert into crm_visitante (id, chave, origem, primeira_em, ultima_em, created_at, updated_at)
       values (?, ?, ?, ?, ?, now(), now())
       on conflict (chave) where deleted_at is null do update set
         ultima_em = greatest(crm_visitante.ultima_em, excluded.ultima_em),
         origem = coalesce(crm_visitante.origem, excluded.origem),
         updated_at = now()
       returning id, email, cliente_id, como`,
      [
        generateEntityId(undefined, "vis"),
        chaveDoVisitante(lote.visitante),
        origem ? JSON.stringify(origem) : null,
        agora,
        agora,
      ]
    )) as VisitanteLido[]

    if (lote.eventos.length) {
      await ctx.manager!.execute(
        `insert into crm_evento
           (id, visitante_id, email, tipo, dados, pagina, carrinho_id, em, created_at, updated_at)
         values ${lote.eventos.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, now(), now())").join(", ")}`,
        lote.eventos.flatMap((e) => [
          generateEntityId(undefined, "evt"),
          visitante.id,
          visitante.email,
          e.tipo,
          JSON.stringify(e.dados),
          e.pagina,
          lote.carrinho,
          momentoDo(e, agora),
        ])
      )
    }
    return visitante
  }

  /**
   * DE QUEM É O NAVEGADOR — e as anotações dele ainda sem e-mail passam a ser
   * dessa pessoa. O e-mail que a conta provou não é trocado pelo que alguém
   * digitou depois no checkout ou na newsletter (devolve falso). O cliente
   * do Medusa acompanha o e-mail: e-mail novo, cliente novo (ou nenhum).
   */
  @InjectManager()
  async identificar(
    visitanteId: string,
    quem: { email: string; clienteId: string | null; como: Como },
    @MedusaContext() ctx: Contexto = {}
  ): Promise<boolean> {
    const linhas = (await ctx.manager!.execute(
      `update crm_visitante set
         cliente_id = case when email is distinct from ? then ? else coalesce(?, cliente_id) end,
         identificado_em = case when email is distinct from ? then now() else identificado_em end,
         email = ?,
         como = ?,
         updated_at = now()
       where id = ? and deleted_at is null and (como is distinct from 'conta' or ? = 'conta')
       returning id`,
      [
        quem.email,
        quem.clienteId,
        quem.clienteId,
        quem.email,
        quem.email,
        quem.como,
        visitanteId,
        quem.como,
      ]
    )) as { id: string }[]
    if (!linhas.length) return false
    await ctx.manager!.execute(
      `update crm_evento set email = ?, updated_at = now()
        where visitante_id = ? and email is null and deleted_at is null`,
      [quem.email, visitanteId]
    )
    return true
  }

  /**
   * A PESSOA DISSE NÃO (a faixa, depois de ter dito sim): tudo o que este
   * navegador anotou sai do banco, de verdade — não é marcar como apagado.
   */
  @InjectManager()
  async esquecer(visitante: string, @MedusaContext() ctx: Contexto = {}): Promise<void> {
    const chave = chaveDoVisitante(visitante)
    await ctx.manager!.execute(
      `delete from crm_evento
        where visitante_id in (select id from crm_visitante where chave = ? and deleted_at is null)`,
      [chave]
    )
    await ctx.manager!.execute(`delete from crm_visitante where chave = ? and deleted_at is null`, [
      chave,
    ])
  }

  /**
   * O PRAZO: a anotação de antes de `antes` sai, e o visitante que não
   * aparece desde então também. Devolve quantos de cada. (O `deleted_at is
   * null` é pros índices, que são só das linhas vivas: aqui nada é marcado
   * como apagado, sai de vez.)
   */
  @InjectManager()
  async limpar(
    antes: Date,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<{ eventos: number; visitantes: number; emails: number }> {
    const [eventos] = (await ctx.manager!.execute(
      `with apagados as (delete from crm_evento where em < ? and deleted_at is null returning 1)
       select count(*)::int as n from apagados`,
      [antes]
    )) as { n: number }[]
    const [visitantes] = (await ctx.manager!.execute(
      `with apagados as (
         delete from crm_visitante where ultima_em < ? and deleted_at is null returning 1
       )
       select count(*)::int as n from apagados`,
      [antes]
    )) as { n: number }[]
    const [emails] = (await ctx.manager!.execute(
      `with apagados as (
         delete from crm_email
          where coalesce(enviado_em, created_at) < ? and deleted_at is null
         returning 1
       )
       select count(*)::int as n from apagados`,
      [antes]
    )) as { n: number }[]
    return {
      eventos: eventos?.n ?? 0,
      visitantes: visitantes?.n ?? 0,
      emails: emails?.n ?? 0,
    }
  }

  /** As contas da tela do painel (`lib/painel/crm.ts`), de `de` até `ate`. */
  @InjectManager()
  async resumo(
    de: Date,
    ate: Date,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<{ numeros: NumerosDoCrm; tipos: ContaDoTipo[]; ultimos: EventoLidoDoBanco[] }> {
    const [numeros] = (await ctx.manager!.execute(
      `select count(distinct visitante_id)::int as visitantes,
              count(distinct visitante_id) filter (where email is not null)::int as identificados,
              count(distinct email)::int as pessoas,
              count(*)::int as anotacoes
         from crm_evento
        where em >= ? and em < ? and deleted_at is null`,
      [de, ate]
    )) as NumerosDoCrm[]
    const tipos = (await ctx.manager!.execute(
      `select tipo, count(*)::int as vezes, count(distinct visitante_id)::int as visitantes
         from crm_evento
        where em >= ? and em < ? and deleted_at is null
        group by tipo`,
      [de, ate]
    )) as ContaDoTipo[]
    const ultimos = (await ctx.manager!.execute(
      `select id, tipo, dados, em, email
         from crm_evento
        where em >= ? and em < ? and deleted_at is null
        order by em desc, id desc
        limit 30`,
      [de, ate]
    )) as EventoLidoDoBanco[]
    return {
      numeros: numeros ?? { visitantes: 0, identificados: 0, pessoas: 0, anotacoes: 0 },
      tipos,
      ultimos,
    }
  }

  /**
   * UM AVISO DO RESEND (`lib/crm/resend.ts`): a linha do e-mail nasce no
   * primeiro, e cada um preenche a sua hora — a de primeira vez fica com a
   * mais antiga, a de última com a mais nova (o `least`/`greatest` do
   * Postgres pula o nulo). Aviso repetido ou fora de ordem não muda nada. O
   * clique conta também como aberto: quem clicou abriu, mesmo com a imagem
   * que mede a abertura bloqueada.
   */
  @InjectManager()
  async anotarAvisoDoEmail(
    aviso: AvisoDoEmail,
    equipe: boolean,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<void> {
    const { campo, em } = aviso
    const se = (sim: boolean) => (sim ? em : null)
    await ctx.manager!.execute(
      `insert into crm_email
         (id, resend_id, para, tipo, equipe, enviado_em, entregue_em, atrasado_em, aberto_em,
          ultima_abertura_em, clicado_em, ultimo_clique_em, ultimo_link, devolvido_em, devolucao,
          reclamou_em, falhou_em, suprimido_em, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())
       on conflict (resend_id) where deleted_at is null do update set
         para = coalesce(crm_email.para, excluded.para),
         tipo = coalesce(crm_email.tipo, excluded.tipo),
         equipe = crm_email.equipe or excluded.equipe,
         enviado_em = least(crm_email.enviado_em, excluded.enviado_em),
         entregue_em = least(crm_email.entregue_em, excluded.entregue_em),
         atrasado_em = greatest(crm_email.atrasado_em, excluded.atrasado_em),
         aberto_em = least(crm_email.aberto_em, excluded.aberto_em),
         ultima_abertura_em = greatest(crm_email.ultima_abertura_em, excluded.ultima_abertura_em),
         clicado_em = least(crm_email.clicado_em, excluded.clicado_em),
         ultimo_link = case
           when excluded.ultimo_clique_em is not null
            and excluded.ultimo_clique_em >= coalesce(crm_email.ultimo_clique_em, excluded.ultimo_clique_em)
           then excluded.ultimo_link
           else crm_email.ultimo_link
         end,
         ultimo_clique_em = greatest(crm_email.ultimo_clique_em, excluded.ultimo_clique_em),
         devolvido_em = least(crm_email.devolvido_em, excluded.devolvido_em),
         devolucao = coalesce(crm_email.devolucao, excluded.devolucao),
         reclamou_em = least(crm_email.reclamou_em, excluded.reclamou_em),
         falhou_em = least(crm_email.falhou_em, excluded.falhou_em),
         suprimido_em = least(crm_email.suprimido_em, excluded.suprimido_em),
         updated_at = now()`,
      [
        generateEntityId(undefined, "eml"),
        aviso.resendId,
        aviso.para,
        aviso.tipo,
        equipe,
        aviso.enviadoEm ?? em,
        se(campo === "entregue"),
        se(campo === "atrasado"),
        se(campo === "aberto" || campo === "clicado"),
        se(campo === "aberto" || campo === "clicado"),
        se(campo === "clicado"),
        se(campo === "clicado"),
        campo === "clicado" ? aviso.link : null,
        se(campo === "devolvido"),
        campo === "devolvido" ? aviso.devolucao : null,
        se(campo === "reclamou"),
        se(campo === "falhou"),
        se(campo === "suprimido"),
      ]
    )
  }

  /**
   * AS CONTAS DOS E-MAILS DE CLIENTE da tela do CRM (`lib/painel/crm.ts`):
   * os que saíram de `de` até `ate`, e quantos deles chegaram, foram abertos,
   * levaram clique, não chegaram e viraram reclamação — no total e por tipo;
   * os 15 que tiveram novidade por último; e a hora do último aviso.
   */
  @InjectManager()
  async resumoDosEmails(
    de: Date,
    ate: Date,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<{
    numeros: NumerosDosEmails
    porTipo: ContaDoTipoDeEmail[]
    ultimos: EmailLidoDoBanco[]
    ultimoAviso: Date | null
  }> {
    const contas = `count(*)::int as enviados,
              count(entregue_em)::int as entregues,
              count(aberto_em)::int as abertos,
              count(clicado_em)::int as clicados,
              count(*) filter (
                where devolvido_em is not null or falhou_em is not null or suprimido_em is not null
              )::int as "naoChegaram",
              count(reclamou_em)::int as reclamacoes`
    const doPeriodo = `enviado_em >= ? and enviado_em < ? and not equipe and deleted_at is null`
    const [numeros] = (await ctx.manager!.execute(
      `select ${contas} from crm_email where ${doPeriodo}`,
      [de, ate]
    )) as NumerosDosEmails[]
    const porTipo = (await ctx.manager!.execute(
      `select tipo, ${contas} from crm_email where ${doPeriodo}
        group by tipo order by count(*) desc, tipo`,
      [de, ate]
    )) as ContaDoTipoDeEmail[]
    const ultimos = (await ctx.manager!.execute(
      `select id, tipo, para, enviado_em, entregue_em, atrasado_em, aberto_em, ultima_abertura_em,
              clicado_em, ultimo_clique_em, ultimo_link, devolvido_em, devolucao, reclamou_em,
              falhou_em, suprimido_em
         from crm_email
        where not equipe and deleted_at is null and updated_at >= ?
        order by updated_at desc
        limit 15`,
      [de]
    )) as EmailLidoDoBanco[]
    const [ultimo] = (await ctx.manager!.execute(
      `select max(updated_at) as em from crm_email where deleted_at is null`
    )) as { em: Date | null }[]
    return {
      numeros: numeros ?? {
        enviados: 0,
        entregues: 0,
        abertos: 0,
        clicados: 0,
        naoChegaram: 0,
        reclamacoes: 0,
      },
      porTipo,
      ultimos,
      ultimoAviso: ultimo?.em ?? null,
    }
  }

  /**
   * O QUE O CRM SABE DE UMA PESSOA (o e-mail), pra ficha do cliente: o último
   * clique num e-mail da loja, a última coisa que ela fez no site, de onde
   * chegou da primeira vez, e as últimas anotações e e-mails dela.
   */
  @InjectManager()
  async pessoa(email: string, @MedusaContext() ctx: Contexto = {}): Promise<PessoaNoCrm> {
    const [sinais] = (await ctx.manager!.execute(
      `select
         (select max(ultimo_clique_em) from crm_email
           where para = ? and not equipe and deleted_at is null) as "ultimoClique",
         (select max(em) from crm_evento where email = ? and deleted_at is null) as "ultimaVisita"`,
      [email, email]
    )) as { ultimoClique: Date | null; ultimaVisita: Date | null }[]
    const [primeiro] = (await ctx.manager!.execute(
      `select origem, primeira_em from crm_visitante
        where email = ? and deleted_at is null
        order by primeira_em asc
        limit 1`,
      [email]
    )) as { origem: PessoaNoCrm["origem"]; primeira_em: Date }[]
    const eventos = (await ctx.manager!.execute(
      `select id, tipo, dados, em, email from crm_evento
        where email = ? and deleted_at is null
        order by em desc, id desc
        limit 30`,
      [email]
    )) as EventoLidoDoBanco[]
    const emails = (await ctx.manager!.execute(
      `select id, tipo, para, enviado_em, entregue_em, atrasado_em, aberto_em, ultima_abertura_em,
              clicado_em, ultimo_clique_em, ultimo_link, devolvido_em, devolucao, reclamou_em,
              falhou_em, suprimido_em
         from crm_email
        where para = ? and not equipe and deleted_at is null
        order by updated_at desc
        limit 20`,
      [email]
    )) as EmailLidoDoBanco[]
    return {
      ultimoClique: sinais?.ultimoClique ?? null,
      ultimaVisita: sinais?.ultimaVisita ?? null,
      origem: primeiro?.origem ?? null,
      primeiraVisita: primeiro?.primeira_em ?? null,
      eventos,
      emails,
    }
  }
}
