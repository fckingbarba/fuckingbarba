import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260927202045 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "crm_saiu" drop constraint if exists "crm_saiu_email_unique";`);
    this.addSql(`alter table if exists "crm_envio" drop constraint if exists "crm_envio_fluxo_chave_toque_unique";`);
    this.addSql(`create table if not exists "crm_envio" ("id" text not null, "email" text not null, "fluxo" text not null, "chave" text not null, "toque" text not null, "como" text not null, "em" timestamptz not null, "cupom" text null, "cupom_ate" timestamptz null, "resend_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "crm_envio_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_envio_deleted_at" ON "crm_envio" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_crm_envio_fluxo_chave_toque_unique" ON "crm_envio" ("fluxo", "chave", "toque") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_envio_email" ON "crm_envio" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_envio_em" ON "crm_envio" ("em") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "crm_saiu" ("id" text not null, "email" text not null, "em" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "crm_saiu_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_saiu_deleted_at" ON "crm_saiu" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_crm_saiu_email_unique" ON "crm_saiu" ("email") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "crm_envio" cascade;`);

    this.addSql(`drop table if exists "crm_saiu" cascade;`);
  }

}
