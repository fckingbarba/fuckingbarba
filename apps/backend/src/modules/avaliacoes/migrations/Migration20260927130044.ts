import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260927130044 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "avaliacao" drop constraint if exists "avaliacao_pedido_id_produto_id_unique";`);
    this.addSql(`create table if not exists "avaliacao" ("id" text not null, "pedido_id" text not null, "numero" integer not null, "produto_id" text not null, "produto_nome" text not null, "nome" text not null, "nota" integer not null, "texto" text not null, "situacao" text check ("situacao" in ('nova', 'aprovada', 'recusada')) not null default 'nova', "moderada_em" timestamptz null, "moderada_por" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "avaliacao_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_avaliacao_deleted_at" ON "avaliacao" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_avaliacao_pedido_id_produto_id_unique" ON "avaliacao" ("pedido_id", "produto_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_avaliacao_situacao" ON "avaliacao" ("situacao") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_avaliacao_produto_id" ON "avaliacao" ("produto_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "avaliacao" cascade;`);
  }

}
