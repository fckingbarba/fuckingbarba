import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260925093719 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "obs_sinal" drop constraint if exists "obs_sinal_integracao_dia_unique";`
    )
    this.addSql(
      `alter table if exists "obs_rotina" drop constraint if exists "obs_rotina_nome_unique";`
    )
    this.addSql(
      `alter table if exists "obs_problema" drop constraint if exists "obs_problema_chave_unique";`
    )
    this.addSql(
      `create table if not exists "obs_problema" ("id" text not null, "chave" text not null, "nivel" text check ("nivel" in ('grave', 'atencao', 'info')) not null, "area" text not null, "titulo" text not null, "texto" text not null, "acao" jsonb null, "detalhe" text null, "pedido_id" text null, "vezes" integer not null default 1, "primeira_em" timestamptz not null, "ultima_em" timestamptz not null, "situacao" text check ("situacao" in ('aberto', 'resolvido')) not null default 'aberto', "sozinho" boolean not null default true, "so_dono" boolean not null default false, "resolvido_em" timestamptz null, "resolvido_por" text null, "resolvido_nome" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "obs_problema_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_obs_problema_chave_unique" ON "obs_problema" ("chave") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_obs_problema_deleted_at" ON "obs_problema" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_obs_problema_situacao" ON "obs_problema" ("situacao") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_obs_problema_resolvido_em" ON "obs_problema" ("resolvido_em") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "obs_rotina" ("id" text not null, "nome" text not null, "ultima_inicio" timestamptz null, "ultima_fim" timestamptz null, "ultima_duracao_ms" integer null, "ultima_situacao" text null, "ultimo_erro" text null, "ultimo_ok_em" timestamptz null, "falhas_seguidas" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "obs_rotina_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_obs_rotina_nome_unique" ON "obs_rotina" ("nome") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_obs_rotina_deleted_at" ON "obs_rotina" ("deleted_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "obs_sinal" ("id" text not null, "integracao" text not null, "dia" text not null, "ok" integer not null default 0, "falhas" integer not null default 0, "ultimo_ok_em" timestamptz null, "primeira_falha_em" timestamptz null, "ultima_falha_em" timestamptz null, "ultima_falha" text null, "ultima_falha_resumo" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "obs_sinal_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_obs_sinal_deleted_at" ON "obs_sinal" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_obs_sinal_integracao_dia_unique" ON "obs_sinal" ("integracao", "dia") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "obs_problema" cascade;`)

    this.addSql(`drop table if exists "obs_rotina" cascade;`)

    this.addSql(`drop table if exists "obs_sinal" cascade;`)
  }
}
