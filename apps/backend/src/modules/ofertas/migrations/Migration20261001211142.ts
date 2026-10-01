import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261001211142 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "oferta_oculta" drop constraint if exists "oferta_oculta_slug_unique";`);
    this.addSql(`create table if not exists "oferta_oculta" ("id" text not null, "slug" text not null, "nome" text not null, "titulo" text not null, "chamada" text null, "comeca_em" timestamptz not null, "termina_em" timestamptz not null, "pausada" boolean not null default false, "produtos" jsonb not null, "lista_id" text null, "criada_por" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "oferta_oculta_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_oferta_oculta_deleted_at" ON "oferta_oculta" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_oferta_oculta_slug_unique" ON "oferta_oculta" ("slug") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "oferta_oculta" cascade;`);
  }

}
