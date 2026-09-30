import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260930161824 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "fin_pedido" drop constraint if exists "fin_pedido_pedido_id_unique";`);
    this.addSql(`create table if not exists "fin_pedido" ("id" text not null, "pedido_id" text not null, "taxa" integer null, "taxa_de" text null, "frete" integer null, "tentativas" integer not null default 0, "tentou_em" timestamptz null, "erro" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fin_pedido_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_fin_pedido_deleted_at" ON "fin_pedido" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fin_pedido_pedido_id_unique" ON "fin_pedido" ("pedido_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fin_pedido" cascade;`);
  }

}
