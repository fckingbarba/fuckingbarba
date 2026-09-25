import type { Context } from "@medusajs/framework/types"
import {
  generateEntityId,
  InjectManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils"
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex"
import { ligarSinais, type Sinal as SinalRecebido } from "../../lib/observabilidade/sinal"
import { chaveDaOcorrencia, type EventoLido } from "../../lib/observabilidade/telemetria"
import { chaveDoDia } from "../../lib/painel/formato"
import { Medida } from "./models/medida"
import { Ocorrencia } from "./models/ocorrencia"
import { Problema } from "./models/problema"
import { Rotina } from "./models/rotina"
import { Sinal } from "./models/sinal"

type Contexto = Context<EntityManager>

/**
 * AS TABELAS DA OBSERVABILIDADE — `listProblemas`, `updateProblemas`… (o
 * Medusa gera), e três contas que não podem ser "lê, soma, grava": o sinal
 * e o começo e o fim de uma rodada. Duas chamadas ao mesmo tempo (dois
 * e-mails, duas cotações) perderiam uma na soma; aqui a soma é do banco,
 * numa linha só (`insert … on conflict do update`).
 *
 * As chaves no plural, como no módulo do ERP: o Medusa pluraliza do jeito
 * dele, e com a chave já no plural o tipo e o código concordam. "Sinais" não
 * serve — o tipo faz "Sinaises" (a regra do "-is" inglês), o código não.
 */
const Tabelas = MedusaService({
  Rotinas: Rotina,
  Problemas: Problema,
  SinaisDasIntegracoes: Sinal,
  Medidas: Medida,
  Ocorrencias: Ocorrencia,
})

export default class ObservabilidadeService extends Tabelas {
  constructor(...args: ConstructorParameters<typeof Tabelas>) {
    super(...args)
    // A porta dos sinais (`lib/observabilidade/sinal.ts`): o Medusa cria o
    // serviço uma vez, quando sobe.
    ligarSinais((s) => this.anotarSinal(s))
  }

  /** Soma o sinal no dia da integração (no fuso da loja). */
  @InjectManager()
  async anotarSinal(s: SinalRecebido, @MedusaContext() ctx: Contexto = {}): Promise<void> {
    const agora = new Date()
    await ctx.manager!.execute(
      `insert into obs_sinal
         (id, integracao, dia, ok, falhas, ultimo_ok_em, primeira_falha_em, ultima_falha_em,
          ultima_falha, ultima_falha_resumo, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())
       on conflict (integracao, dia) where deleted_at is null do update set
         ok = obs_sinal.ok + excluded.ok,
         falhas = obs_sinal.falhas + excluded.falhas,
         ultimo_ok_em = coalesce(excluded.ultimo_ok_em, obs_sinal.ultimo_ok_em),
         primeira_falha_em = coalesce(obs_sinal.primeira_falha_em, excluded.primeira_falha_em),
         ultima_falha_em = coalesce(excluded.ultima_falha_em, obs_sinal.ultima_falha_em),
         ultima_falha = case when excluded.falhas > 0 then excluded.ultima_falha
                             else obs_sinal.ultima_falha end,
         ultima_falha_resumo = case when excluded.falhas > 0 then excluded.ultima_falha_resumo
                                    else obs_sinal.ultima_falha_resumo end,
         updated_at = now()`,
      [
        generateEntityId(undefined, "sin"),
        s.integracao,
        chaveDoDia(agora),
        s.ok ? 1 : 0,
        s.ok ? 0 : 1,
        s.ok ? agora : null,
        s.ok ? null : agora,
        s.ok ? null : agora,
        s.ok ? null : (s.detalhe ?? null),
        s.ok ? null : (s.resumo ?? null),
      ]
    )
  }

  /** A rodada começou: a linha da rotina diz "rodando". */
  @InjectManager()
  async comecarRodada(nome: string, inicio: Date, @MedusaContext() ctx: Contexto = {}) {
    await ctx.manager!.execute(
      `insert into obs_rotina
         (id, nome, ultima_inicio, ultima_situacao, falhas_seguidas, created_at, updated_at)
       values (?, ?, ?, 'rodando', 0, now(), now())
       on conflict (nome) where deleted_at is null do update set
         ultima_inicio = excluded.ultima_inicio,
         ultima_fim = null,
         ultima_situacao = 'rodando',
         updated_at = now()`,
      [generateEntityId(undefined, "rot"), nome, inicio]
    )
  }

  /** A rodada acabou: bem (`erro` nulo) ou com o erro, sem dado de cliente. */
  @InjectManager()
  async terminarRodada(
    nome: string,
    { inicio, fim, erro }: { inicio: Date; fim: Date; erro: string | null },
    @MedusaContext() ctx: Contexto = {}
  ) {
    await ctx.manager!.execute(
      `update obs_rotina set
         ultima_fim = ?,
         ultima_duracao_ms = ?,
         ultima_situacao = ?,
         ultimo_erro = ?,
         ultimo_ok_em = case when ? then ? else ultimo_ok_em end,
         falhas_seguidas = case when ? then 0 else falhas_seguidas + 1 end,
         updated_at = now()
       where nome = ? and ultima_inicio = ? and deleted_at is null`,
      [
        fim,
        fim.getTime() - inicio.getTime(),
        erro === null ? "ok" : "erro",
        erro,
        erro === null,
        fim,
        erro === null,
        nome,
        inicio,
      ]
    )
  }

  /**
   * O que o navegador mandou (`POST /store/telemetria`): as medidas entram
   * uma por linha; a página que não existe e o erro somam no dia — na conta
   * do banco, como o sinal.
   */
  @InjectManager()
  async anotarTelemetria(eventos: EventoLido[], @MedusaContext() ctx: Contexto = {}) {
    const medidas = eventos.flatMap((e) =>
      e.tipo === "vital"
        ? [{ metrica: e.metrica, valor: e.valor, aparelho: e.aparelho, pagina: e.pagina }]
        : []
    )
    if (medidas.length) await this.createMedidas(medidas, ctx)

    const agora = new Date()
    const somadas = new Map<string, { e: EventoLido; vezes: number; internas: number }>()
    for (const e of eventos) {
      if (e.tipo === "vital") continue
      const chave = `${e.tipo}|${chaveDaOcorrencia(e)}`
      const atual = somadas.get(chave) ?? { e, vezes: 0, internas: 0 }
      atual.vezes++
      if (e.tipo === "404" && e.interna) atual.internas++
      atual.e = e
      somadas.set(chave, atual)
    }
    for (const { e, vezes, internas } of somadas.values()) {
      if (e.tipo === "vital") continue
      await ctx.manager!.execute(
        `insert into obs_ocorrencia
           (id, tipo, chave, dia, pagina, detalhe, vezes, internas, primeira_em, ultima_em,
            created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())
         on conflict (tipo, chave, dia) where deleted_at is null do update set
           vezes = obs_ocorrencia.vezes + excluded.vezes,
           internas = obs_ocorrencia.internas + excluded.internas,
           detalhe = coalesce(excluded.detalhe, obs_ocorrencia.detalhe),
           ultima_em = excluded.ultima_em,
           updated_at = now()`,
        [
          generateEntityId(undefined, "oco"),
          e.tipo,
          chaveDaOcorrencia(e),
          chaveDoDia(agora),
          e.pagina,
          e.tipo === "404" ? e.origem : e.mensagem,
          vezes,
          internas,
          agora,
          agora,
        ]
      )
    }
  }

  /**
   * A velocidade de verdade desde `desde`: o p75 de cada medida (como o
   * Google conta — 3 de cada 4 visitas foram pelo menos tão rápidas), por
   * aparelho, e a página mais lenta pra carregar no celular (com 5 visitas
   * medidas, no mínimo).
   */
  @InjectManager()
  async velocidade(desde: Date, @MedusaContext() ctx: Contexto = {}) {
    const medidas = (await ctx.manager!.execute(
      `select metrica, aparelho,
              percentile_cont(0.75) within group (order by valor) as p75,
              count(*)::int as n
         from obs_medida
        where created_at >= ? and deleted_at is null
        group by metrica, aparelho`,
      [desde]
    )) as { metrica: string; aparelho: string; p75: number; n: number }[]
    const [maisLenta] = (await ctx.manager!.execute(
      `select pagina,
              percentile_cont(0.75) within group (order by valor) as p75,
              count(*)::int as n
         from obs_medida
        where metrica = 'LCP' and aparelho = 'celular' and created_at >= ? and deleted_at is null
        group by pagina
       having count(*) >= 5
        order by p75 desc
        limit 1`,
      [desde]
    )) as { pagina: string; p75: number; n: number }[]
    return {
      medidas: medidas.map((m) => ({ ...m, p75: Number(m.p75), n: Number(m.n) })),
      maisLenta: maisLenta
        ? { pagina: maisLenta.pagina, p75: Number(maisLenta.p75), n: Number(maisLenta.n) }
        : null,
    }
  }

  /**
   * O que não precisa ficar: os sinais e as ocorrências de mais de 60 dias,
   * as medidas de mais de 28 (a conta da velocidade é de 28) e os problemas
   * resolvidos há mais de 90. Apaga de verdade — é registro de máquina.
   */
  @InjectManager()
  async limpar(agora: Date, @MedusaContext() ctx: Contexto = {}) {
    const DIA = 24 * 60 * 60 * 1000
    await ctx.manager!.execute(`delete from obs_sinal where dia < ?`, [
      chaveDoDia(agora.getTime() - 60 * DIA),
    ])
    await ctx.manager!.execute(`delete from obs_ocorrencia where dia < ?`, [
      chaveDoDia(agora.getTime() - 60 * DIA),
    ])
    await ctx.manager!.execute(`delete from obs_medida where created_at < ?`, [
      new Date(agora.getTime() - 28 * DIA),
    ])
    await ctx.manager!.execute(
      `delete from obs_problema where situacao = 'resolvido' and resolvido_em < ?`,
      [new Date(agora.getTime() - 90 * DIA)]
    )
  }
}
