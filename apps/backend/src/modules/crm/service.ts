import type { Context } from "@medusajs/framework/types"
import {
  generateEntityId,
  InjectManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils"
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex"
import { chaveDoVisitante, momentoDo, origemDoLote, type Lote } from "../../lib/crm/eventos"
import type { ContaDoTipo, EventoLidoDoBanco, NumerosDoCrm } from "../../lib/painel/crm"
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
  ): Promise<{ eventos: number; visitantes: number }> {
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
    return { eventos: eventos?.n ?? 0, visitantes: visitantes?.n ?? 0 }
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
}
