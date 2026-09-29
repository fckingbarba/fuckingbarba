import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/** Quem indica, no "Indique um brother" (entrega 0215): o link (o código) de cada e-mail. */
export class Migration20260929210000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "crm_indicador" ("id" text not null, "email" text not null, "codigo" text not null, "promocao_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "crm_indicador_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_indicador_deleted_at" ON "crm_indicador" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_crm_indicador_email_unique" ON "crm_indicador" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_crm_indicador_codigo_unique" ON "crm_indicador" ("codigo") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "crm_indicador" cascade;`);
  }

}
