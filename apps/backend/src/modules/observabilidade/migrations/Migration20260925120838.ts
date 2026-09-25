import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260925120838 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "obs_ocorrencia" drop constraint if exists "obs_ocorrencia_tipo_chave_dia_unique";`
    )
    this.addSql(
      `create table if not exists "obs_medida" ("id" text not null, "metrica" text not null, "valor" real not null, "aparelho" text not null, "pagina" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "obs_medida_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_obs_medida_deleted_at" ON "obs_medida" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_obs_medida_metrica_aparelho" ON "obs_medida" ("metrica", "aparelho") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_obs_medida_created_at" ON "obs_medida" ("created_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "obs_ocorrencia" ("id" text not null, "tipo" text not null, "chave" text not null, "dia" text not null, "pagina" text not null, "detalhe" text null, "vezes" integer not null default 0, "internas" integer not null default 0, "primeira_em" timestamptz not null, "ultima_em" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "obs_ocorrencia_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_obs_ocorrencia_deleted_at" ON "obs_ocorrencia" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_obs_ocorrencia_tipo_chave_dia_unique" ON "obs_ocorrencia" ("tipo", "chave", "dia") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_obs_ocorrencia_dia" ON "obs_ocorrencia" ("dia") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "obs_medida" cascade;`)

    this.addSql(`drop table if exists "obs_ocorrencia" cascade;`)
  }
}
