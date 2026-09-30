import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260930135118 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "fin_valor" drop constraint if exists "fin_valor_chave_desde_unique";`);
    this.addSql(`create table if not exists "fin_despesa" ("id" text not null, "descricao" text not null, "categoria" text not null, "valor" integer not null, "mes" text not null, "repete" boolean not null default false, "ate" text null, "lancada_por" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fin_despesa_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_fin_despesa_deleted_at" ON "fin_despesa" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_fin_despesa_mes" ON "fin_despesa" ("mes") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "fin_valor" ("id" text not null, "chave" text not null, "desde" text not null, "valor" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fin_valor_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_fin_valor_deleted_at" ON "fin_valor" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fin_valor_chave_desde_unique" ON "fin_valor" ("chave", "desde") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fin_despesa" cascade;`);

    this.addSql(`drop table if exists "fin_valor" cascade;`);
  }

}
