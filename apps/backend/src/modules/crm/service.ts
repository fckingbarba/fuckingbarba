import type { Context } from "@medusajs/framework/types"
import {
  generateEntityId,
  InjectManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils"
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex"
import { chaveDoVisitante, momentoDo, origemDoLote, type Lote } from "../../lib/crm/eventos"
import type { ArquivoDaNuvemshop } from "../../lib/crm/nuvemshop"
import type { AvisoDoEmail } from "../../lib/crm/resend"
import type {
  ContaDoTipo,
  ContaDoTipoDeEmail,
  EmailLidoDoBanco,
  EventoLidoDoBanco,
  NumerosDoCrm,
  NumerosDosEmails,
  PedidoLidoDaBase,
  PessoaLidaDaBase,
  PessoaNoCrm,
  ResumoDaBase,
} from "../../lib/painel/crm"
import { CarrinhoDaBase, PedidoDaBase, PessoaDaBase } from "./models/base-da-nuvemshop"
import { EmailDoCrm } from "./models/email"
import { Evento } from "./models/evento"
import { EnvioDoFluxo, SaiuDaLista } from "./models/fluxos"
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
  PessoasDaBase: PessoaDaBase,
  PedidosDaBase: PedidoDaBase,
  CarrinhosDaBase: CarrinhoDaBase,
  EnviosDosFluxos: EnvioDoFluxo,
  Saidas: SaiuDaLista,
})

/** Uma decisão do motor dos fluxos, como o banco devolve (`lib/crm/fluxos.ts` usa o `Registro`). */
export type RegistroLido = {
  email: string
  fluxo: string
  chave: string
  toque: string
  como: string
  em: Date
  cupom: string | null
  cupom_ate: Date | null
}

/** O toque que vai sair, reservado antes do envio. */
export type ToqueReservado = {
  email: string
  fluxo: string
  chave: string
  toque: string
  em: Date
}

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

  /**
   * A BASE DA NUVEMSHOP, GRAVADA — o arquivo que `lerArquivoDaNuvemshop`
   * leu, em lotes de 200, atualizando pelo e-mail, pelo número do pedido ou
   * pelo id do carrinho (mandar de novo não duplica). Devolve quantos
   * entraram agora e quantos já estavam.
   *
   * O "ACEITA OFERTAS" FICA COM A DECISÃO MAIS NOVA: a da Nuvemshop (a data
   * da coluna Marketing) ou a de quem saiu da lista pela loja nova
   * (`tirarDaBaseDasOfertas`, que anota a hora). Mandar a base de novo não
   * põe de volta na lista quem saiu depois.
   */
  @InjectManager()
  async importarDaNuvemshop(
    arquivo: ArquivoDaNuvemshop,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<{ novos: number; atualizados: number }> {
    let novos = 0
    let atualizados = 0
    const gravar = async (sql: string, valores: unknown[]) => {
      const linhas = (await ctx.manager!.execute(sql, valores)) as { novo: boolean }[]
      for (const l of linhas)
        if (l.novo) novos++
        else atualizados++
    }
    const centavos = (reais: number) => Math.round(reais * 100)
    if (arquivo.tipo === "clientes")
      for (const lote of emLotes(arquivo.pessoas))
        await gravar(
          `insert into crm_base_pessoa
             (id, email, nome, aceita_ofertas, ofertas_em, newsletter_em, tinha_conta, desde, created_at, updated_at)
           values ${lote.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, now(), now())").join(", ")}
           on conflict (email) where deleted_at is null do update set
             nome = excluded.nome,
             aceita_ofertas = case
               when crm_base_pessoa.ofertas_em is not null
                and (excluded.ofertas_em is null or excluded.ofertas_em < crm_base_pessoa.ofertas_em)
               then crm_base_pessoa.aceita_ofertas else excluded.aceita_ofertas end,
             ofertas_em = greatest(crm_base_pessoa.ofertas_em, excluded.ofertas_em),
             newsletter_em = excluded.newsletter_em,
             tinha_conta = excluded.tinha_conta, desde = excluded.desde, updated_at = now()
           returning (xmax = 0) as novo`,
          lote.flatMap((p) => [
            generateEntityId(undefined, "nsp"),
            p.email,
            p.nome,
            p.aceitaOfertas,
            p.ofertasEm,
            p.newsletterEm,
            p.tinhaConta,
            p.desde,
          ])
        )
    else if (arquivo.tipo === "vendas")
      for (const lote of emLotes(arquivo.pedidos))
        await gravar(
          `insert into crm_base_pedido
             (id, numero, email, feito_em, pago_em, enviado_em, pagamento, envio, total, desconto,
              frete, cupom, meio, itens, created_at, updated_at)
           values ${lote.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())").join(", ")}
           on conflict (numero) where deleted_at is null do update set
             email = excluded.email, feito_em = excluded.feito_em, pago_em = excluded.pago_em,
             enviado_em = excluded.enviado_em, pagamento = excluded.pagamento,
             envio = excluded.envio, total = excluded.total, desconto = excluded.desconto,
             frete = excluded.frete, cupom = excluded.cupom, meio = excluded.meio,
             itens = excluded.itens, updated_at = now()
           returning (xmax = 0) as novo`,
          lote.flatMap((p) => [
            generateEntityId(undefined, "nso"),
            p.numero,
            p.email,
            p.feitoEm,
            p.pagoEm,
            p.enviadoEm,
            p.pagamento,
            p.envio,
            centavos(p.total),
            centavos(p.desconto),
            centavos(p.frete),
            p.cupom,
            p.meio,
            JSON.stringify(p.itens),
          ])
        )
    else
      for (const lote of emLotes(arquivo.carrinhos))
        await gravar(
          `insert into crm_base_carrinho
             (id, carrinho, email, criado_em, tipo, total, itens, created_at, updated_at)
           values ${lote.map(() => "(?, ?, ?, ?, ?, ?, ?, now(), now())").join(", ")}
           on conflict (carrinho) where deleted_at is null do update set
             email = excluded.email, criado_em = excluded.criado_em, tipo = excluded.tipo,
             total = excluded.total, itens = excluded.itens, updated_at = now()
           returning (xmax = 0) as novo`,
          lote.flatMap((c) => [
            generateEntityId(undefined, "nsc"),
            c.id,
            c.email,
            c.criadoEm,
            c.tipo,
            centavos(c.total),
            JSON.stringify(c.itens),
          ])
        )
    return { novos, atualizados }
  }

  /**
   * A pessoa da base da Nuvemshop que pediu pra sair das ofertas: o "Aceita"
   * vira "não aceita", com a data de agora. `true` se ela estava aceitando.
   */
  @InjectManager()
  async tirarDaBaseDasOfertas(
    email: string,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<boolean> {
    const linhas = (await ctx.manager!.execute(
      `update crm_base_pessoa set aceita_ofertas = false, ofertas_em = now(), updated_at = now()
        where email = ? and aceita_ofertas and deleted_at is null
        returning id`,
      [email]
    )) as { id: string }[]
    return linhas.length > 0
  }

  /** Os números da base: pessoas, quem aceita ofertas, pedidos, carrinhos e quando entrou. */
  @InjectManager()
  async resumoDaBase(@MedusaContext() ctx: Contexto = {}): Promise<ResumoDaBase> {
    const [r] = (await ctx.manager!.execute(
      `select
         (select count(*) from crm_base_pessoa where deleted_at is null)::int as pessoas,
         (select count(*) from crm_base_pessoa where deleted_at is null and aceita_ofertas)::int as "aceitam",
         (select count(*) from crm_base_pedido where deleted_at is null)::int as pedidos,
         (select count(*) from crm_base_pedido
           where deleted_at is null and pagamento = 'confirmado')::int as pagos,
         (select coalesce(sum(total), 0) from crm_base_pedido
           where deleted_at is null and pagamento = 'confirmado')::bigint as "vendidoCentavos",
         (select min(feito_em) from crm_base_pedido where deleted_at is null) as "primeiroPedido",
         (select max(feito_em) from crm_base_pedido where deleted_at is null) as "ultimoPedido",
         (select count(*) from crm_base_carrinho where deleted_at is null)::int as carrinhos,
         greatest(
           (select max(updated_at) from crm_base_pessoa),
           (select max(updated_at) from crm_base_pedido),
           (select max(updated_at) from crm_base_carrinho)
         ) as "importadoEm"`
    )) as (Omit<ResumoDaBase, "vendidoCentavos"> & { vendidoCentavos: string | number })[]
    return { ...r, vendidoCentavos: Number(r.vendidoCentavos) }
  }

  /** As pessoas da base: o e-mail, o sim das ofertas e a newsletter. */
  @InjectManager()
  async pessoasDaBase(@MedusaContext() ctx: Contexto = {}): Promise<PessoaLidaDaBase[]> {
    return (await ctx.manager!.execute(
      `select email, aceita_ofertas as "aceitaOfertas", newsletter_em as "newsletterEm"
         from crm_base_pessoa where deleted_at is null`
    )) as PessoaLidaDaBase[]
  }

  /**
   * Os itens dos pedidos PAGOS da loja antiga feitos desde `desde` — a parte
   * da Nuvemshop nos mais vendidos da home (`api/store/mais-vendidos`,
   * `lib/mais-vendidos.ts`). Só os itens: nada de e-mail, número ou valor.
   */
  @InjectManager()
  async vendidosDaBase(
    desde: Date,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<{ itens: unknown }[]> {
    return (await ctx.manager!.execute(
      `select itens from crm_base_pedido
        where deleted_at is null and pagamento = 'confirmado' and feito_em >= ?`,
      [desde]
    )) as { itens: unknown }[]
  }

  /** Os pedidos da base — de um e-mail (a ficha), ou todos (as contas da aba). */
  @InjectManager()
  async pedidosDaBase(
    email: string | null = null,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<PedidoLidoDaBase[]> {
    return (await ctx.manager!.execute(
      `select numero, email, feito_em as "feitoEm", pago_em as "pagoEm", pagamento, envio,
              total, cupom, itens
         from crm_base_pedido
        where deleted_at is null ${email === null ? "" : "and email = ?"}
        order by feito_em asc`,
      email === null ? [] : [email]
    )) as PedidoLidoDaBase[]
  }

  /**
   * QUEM PODE RECEBER A ESTREIA (entrega 0181): as pessoas da base que
   * aceitam ofertas, com o primeiro nome e desde quando são clientes.
   */
  @InjectManager()
  async pessoasDaEstreia(
    @MedusaContext() ctx: Contexto = {}
  ): Promise<{ email: string; nome: string | null; desde: Date | null }[]> {
    return (await ctx.manager!.execute(
      `select email, nome, desde from crm_base_pessoa
        where deleted_at is null and aceita_ofertas`
    )) as { email: string; nome: string | null; desde: Date | null }[]
  }

  /**
   * Os sinais de todo mundo, pelo e-mail — o último clique num e-mail da
   * loja e a última anotação do site. As contas da aba da base.
   */
  @InjectManager()
  async sinaisDeTodos(
    @MedusaContext() ctx: Contexto = {}
  ): Promise<Map<string, { ultimoClique: Date | null; ultimaVisita: Date | null }>> {
    const cliques = (await ctx.manager!.execute(
      `select para as email, max(ultimo_clique_em) as em from crm_email
        where deleted_at is null and not equipe and para is not null and ultimo_clique_em is not null
        group by para`
    )) as { email: string; em: Date }[]
    const visitas = (await ctx.manager!.execute(
      `select email, max(em) as em from crm_evento
        where deleted_at is null and email is not null group by email`
    )) as { email: string; em: Date }[]
    const sinais = new Map<string, { ultimoClique: Date | null; ultimaVisita: Date | null }>()
    for (const c of cliques) sinais.set(c.email, { ultimoClique: c.em, ultimaVisita: null })
    for (const v of visitas)
      sinais.set(v.email, {
        ultimoClique: sinais.get(v.email)?.ultimoClique ?? null,
        ultimaVisita: v.em,
      })
    return sinais
  }
  /* ── os fluxos (`lib/crm/fluxos.ts`, a rotina `fluxos-do-crm`) ──────────── */

  /**
   * O que o motor já decidiu, desde `desde` — só destes e-mails, ou de todo
   * mundo (a tela do painel). O toque reservado e não confirmado (a rodada
   * caiu no meio do envio) conta como feito: melhor perder um e-mail que
   * mandar dois.
   */
  @InjectManager()
  async registrosDosFluxos(
    desde: Date,
    emails: string[] | null = null,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<RegistroLido[]> {
    const campos = `select email, fluxo, chave, toque, como, em, cupom, cupom_ate from crm_envio
      where deleted_at is null and em >= ?`
    if (emails === null)
      return (await ctx.manager!.execute(`${campos} order by em asc`, [desde])) as RegistroLido[]
    const lidos: RegistroLido[] = []
    for (const lote of emLotes([...new Set(emails)]))
      lidos.push(
        ...((await ctx.manager!.execute(`${campos} and email in (${lugares(lote)})`, [
          desde,
          ...lote,
        ])) as RegistroLido[])
      )
    return lidos
  }

  /**
   * Anota o que não é envio: o toque pulado (a rotina parou e ele passou) e
   * o do grupo de controle. `false` se já estava.
   */
  @InjectManager()
  async anotarNoFluxo(
    r: ToqueReservado & { como: "pulado" | "controle" },
    @MedusaContext() ctx: Contexto = {}
  ): Promise<boolean> {
    const linhas = (await ctx.manager!.execute(
      `insert into crm_envio (id, email, fluxo, chave, toque, como, em, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, now(), now())
       on conflict (fluxo, chave, toque) where deleted_at is null do nothing
       returning id`,
      [generateEntityId(undefined, "env"), r.email, r.fluxo, r.chave, r.toque, r.como, r.em]
    )) as { id: string }[]
    return linhas.length > 0
  }

  /**
   * Reserva o toque ANTES de mandar: o índice único (fluxo, carrinho ou
   * pedido, toque) garante que duas rodadas juntas não mandem o mesmo e-mail.
   * Devolve o id da reserva, ou null se outra rodada chegou antes.
   */
  @InjectManager()
  async reservarToque(
    r: ToqueReservado,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<string | null> {
    const linhas = (await ctx.manager!.execute(
      `insert into crm_envio (id, email, fluxo, chave, toque, como, em, created_at, updated_at)
       values (?, ?, ?, ?, ?, 'enviando', ?, now(), now())
       on conflict (fluxo, chave, toque) where deleted_at is null do nothing
       returning id`,
      [generateEntityId(undefined, "env"), r.email, r.fluxo, r.chave, r.toque, r.em]
    )) as { id: string }[]
    return linhas[0]?.id ?? null
  }

  /**
   * QUEM SE CADASTROU NO POP-UP DA 1ª COMPRA desde uma hora: o toque
   * `boas-vindas-agora` que saiu, com o cupom. É a entrada da sequência das
   * boas-vindas no motor (entrega 0178).
   */
  @InjectManager()
  async cadastrosDasBoasVindas(
    desde: Date,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<{ email: string; em: Date; cupom: string | null; cupom_ate: Date | null }[]> {
    return (await ctx.manager!.execute(
      `select email, em, cupom, cupom_ate from crm_envio
        where deleted_at is null and fluxo = 'boas-vindas' and toque = 'boas-vindas-agora'
          and como = 'enviado' and em >= ?
        order by em desc limit 5000`,
      [desde]
    )) as { email: string; em: Date; cupom: string | null; cupom_ate: Date | null }[]
  }

  /**
   * A ESCOLHA DO "BARBA OU CABELO?" (entrega 0178): a trilha que a pessoa
   * clicou no e-mail de 1 dia das boas-vindas. Fica no registro dos fluxos,
   * como o toque `boas-vindas-escolha` (a trilha no `como`), e a última vale.
   * Não conta como e-mail: o teto e a tela só contam o que saiu.
   */
  @InjectManager()
  async anotarEscolha(
    email: string,
    trilha: string,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<void> {
    await ctx.manager!.execute(
      `insert into crm_envio (id, email, fluxo, chave, toque, como, em, created_at, updated_at)
       values (?, ?, 'boas-vindas', ?, 'boas-vindas-escolha', ?, now(), now(), now())
       on conflict (fluxo, chave, toque) where deleted_at is null
       do update set como = excluded.como, em = now(), updated_at = now()`,
      [generateEntityId(undefined, "env"), email, email, trilha]
    )
  }

  /** O e-mail saiu: a reserva vira envio, com o id do Resend e o cupom, se teve. */
  @InjectManager()
  async confirmarToque(
    id: string,
    {
      resendId,
      cupom,
      cupomAte,
    }: { resendId: string | null; cupom: string | null; cupomAte: Date | null },
    @MedusaContext() ctx: Contexto = {}
  ): Promise<void> {
    await ctx.manager!.execute(
      `update crm_envio set como = 'enviado', resend_id = ?, cupom = ?, cupom_ate = ?, updated_at = now()
        where id = ?`,
      [resendId, cupom, cupomAte, id]
    )
  }

  /** O e-mail não saiu: a reserva some, e a próxima rodada tenta de novo. */
  @InjectManager()
  async desfazerToque(id: string, @MedusaContext() ctx: Contexto = {}): Promise<void> {
    await ctx.manager!.execute(
      `update crm_envio set deleted_at = now(), updated_at = now() where id = ?`,
      [id]
    )
  }

  /**
   * As sacolas que têm dono, desde `desde`: o carrinho de cada anotação do
   * CRM com e-mail, e o e-mail da mais nova. É assim que o carrinho abandonado
   * sabe pra quem mandar — a sacola não tem e-mail, mas quem aceitou os
   * cookies e já se identificou (a conta, a newsletter, uma compra de antes)
   * tem as anotações com ele. Começar por aqui, e não pelas sacolas, deixa de
   * fora as de quem ninguém sabe quem é — que são quase todas.
   */
  @InjectManager()
  async carrinhosComDono(
    desde: Date,
    @MedusaContext() ctx: Contexto = {}
  ): Promise<Map<string, string>> {
    const linhas = (await ctx.manager!.execute(
      `select distinct on (carrinho_id) carrinho_id, email from crm_evento
        where deleted_at is null and email is not null and carrinho_id is not null and em >= ?
        order by carrinho_id, em desc`,
      [desde]
    )) as { carrinho_id: string; email: string }[]
    return new Map(linhas.map((l) => [l.carrinho_id, l.email]))
  }

  /** Anota quem saiu da lista (o "Sair da lista" de qualquer e-mail do CRM), com a hora. */
  @InjectManager()
  async saiuDaLista(email: string, @MedusaContext() ctx: Contexto = {}): Promise<void> {
    await ctx.manager!.execute(
      `insert into crm_saiu (id, email, em, created_at, updated_at) values (?, ?, now(), now(), now())
       on conflict (email) where deleted_at is null do update set em = now(), updated_at = now()`,
      [generateEntityId(undefined, "sai"), email]
    )
  }

  /** Quem destes e-mails saiu da lista, e quando. */
  @InjectManager()
  async quemSaiu(
    emails: string[],
    @MedusaContext() ctx: Contexto = {}
  ): Promise<Map<string, Date>> {
    const saidas = new Map<string, Date>()
    for (const lote of emLotes([...new Set(emails)])) {
      const linhas = (await ctx.manager!.execute(
        `select email, em from crm_saiu where deleted_at is null and email in (${lugares(lote)})`,
        lote
      )) as { email: string; em: Date }[]
      for (const l of linhas) saidas.set(l.email, new Date(l.em))
    }
    return saidas
  }

  /**
   * Quem destes e-mails não pode receber: o endereço voltou de vez (não
   * existe; a caixa cheia de agora não conta), está bloqueado no Resend, ou a
   * pessoa marcou um e-mail da loja como spam. Mandar de novo pra
   * esses é o que joga a loja inteira no spam do Gmail.
   */
  @InjectManager()
  async semEntrega(emails: string[], @MedusaContext() ctx: Contexto = {}): Promise<Set<string>> {
    const fora = new Set<string>()
    for (const lote of emLotes([...new Set(emails)])) {
      const linhas = (await ctx.manager!.execute(
        `select distinct para as email from crm_email
          where deleted_at is null and not equipe
            and (reclamou_em is not null or suprimido_em is not null
              or (devolvido_em is not null and coalesce(devolucao, '') not ilike 'transient%'))
            and para in (${lugares(lote)})`,
        lote
      )) as { email: string }[]
      for (const l of linhas) fora.add(l.email)
    }
    return fora
  }
}

/** `?, ?, ?` — um lugar por item da lista, pro `in (…)`. */
const lugares = (lista: unknown[]) => lista.map(() => "?").join(", ")

/** Em pedaços de 200: o insert de uma vez só com 3 mil linhas passaria do limite de parâmetros. */
function emLotes<T>(lista: T[], tamanho = 200): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho))
  return lotes
}
