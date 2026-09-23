import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260923155302 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "erp_nota" drop constraint if exists "erp_nota_pedido_id_unique";`
    )
    this.addSql(
      `alter table if exists "erp_conexao" drop constraint if exists "erp_conexao_erp_unique";`
    )
    this.addSql(
      `create table if not exists "erp_conexao" ("id" text not null, "erp" text not null, "empresa" text null, "credenciais" text null, "conectado_em" timestamptz null, "notas_desde" timestamptz null, "estado" text null, "estado_em" timestamptz null, "queda" text null, "queda_avisada_em" timestamptz null, "estoque" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "erp_conexao_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_erp_conexao_deleted_at" ON "erp_conexao" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_erp_conexao_erp_unique" ON "erp_conexao" ("erp") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "erp_nota" ("id" text not null, "pedido_id" text not null, "erp" text not null, "referencia" text not null, "situacao" text not null default 'a-emitir', "no_erp" jsonb null, "id_no_erp" text null, "detalhe" text null, "numero" text null, "serie" text null, "chave" text null, "valor" integer null, "emitida_em" timestamptz null, "link_danfe" text null, "tentativas" integer not null default 0, "erro" text null, "definitivo" boolean not null default false, "proxima_em" timestamptz null, "cancelar" boolean not null default false, "avisos" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "erp_nota_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_erp_nota_deleted_at" ON "erp_nota" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_erp_nota_pedido_id_unique" ON "erp_nota" ("pedido_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_erp_nota_erp_id_no_erp" ON "erp_nota" ("erp", "id_no_erp") WHERE id_no_erp IS NOT NULL AND deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_erp_nota_situacao" ON "erp_nota" ("situacao") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "erp_conexao" cascade;`)

    this.addSql(`drop table if exists "erp_nota" cascade;`)
  }
}
