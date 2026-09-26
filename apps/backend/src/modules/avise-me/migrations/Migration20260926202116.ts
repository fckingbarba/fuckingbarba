import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260926202116 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "aviso_de_estoque" drop constraint if exists "aviso_de_estoque_email_variante_id_unique";`
    )
    this.addSql(
      `create table if not exists "aviso_de_estoque" ("id" text not null, "email" text null, "variante_id" text not null, "produto_id" text not null, "consentido_em" timestamptz not null, "avisado_em" timestamptz null, "falhas" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "aviso_de_estoque_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_aviso_de_estoque_deleted_at" ON "aviso_de_estoque" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_aviso_de_estoque_email_variante_id_unique" ON "aviso_de_estoque" ("email", "variante_id") WHERE email IS NOT NULL AND deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_aviso_de_estoque_variante_id" ON "aviso_de_estoque" ("variante_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_aviso_de_estoque_produto_id" ON "aviso_de_estoque" ("produto_id") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "aviso_de_estoque" cascade;`)
  }
}
