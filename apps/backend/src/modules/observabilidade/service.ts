import type { Context } from "@medusajs/framework/types"
import {
  generateEntityId,
  InjectManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils"
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex"
import { ligarSinais, type Sinal as SinalRecebido } from "../../lib/observabilidade/sinal"
import { chaveDoDia } from "../../lib/painel/formato"
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
   * O que não precisa ficar: os sinais de mais de 60 dias e os problemas
   * resolvidos há mais de 90. Apaga de verdade — é registro de máquina.
   */
  @InjectManager()
  async limpar(agora: Date, @MedusaContext() ctx: Contexto = {}) {
    const DIA = 24 * 60 * 60 * 1000
    await ctx.manager!.execute(`delete from obs_sinal where dia < ?`, [
      chaveDoDia(agora.getTime() - 60 * DIA),
    ])
    await ctx.manager!.execute(
      `delete from obs_problema where situacao = 'resolvido' and resolvido_em < ?`,
      [new Date(agora.getTime() - 90 * DIA)]
    )
  }
}
