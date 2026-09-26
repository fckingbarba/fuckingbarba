import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260926213501 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "crm_visitante" drop constraint if exists "crm_visitante_chave_unique";`);
    this.addSql(`create table if not exists "crm_evento" ("id" text not null, "visitante_id" text not null, "email" text null, "tipo" text not null, "dados" jsonb null, "pagina" text not null, "carrinho_id" text null, "em" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "crm_evento_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_evento_deleted_at" ON "crm_evento" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_evento_visitante_id_em" ON "crm_evento" ("visitante_id", "em") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_evento_email_em" ON "crm_evento" ("email", "em") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_evento_em" ON "crm_evento" ("em") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "crm_visitante" ("id" text not null, "chave" text not null, "email" text null, "cliente_id" text null, "como" text check ("como" in ('conta', 'checkout', 'newsletter')) null, "identificado_em" timestamptz null, "origem" jsonb null, "primeira_em" timestamptz not null, "ultima_em" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "crm_visitante_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_visitante_deleted_at" ON "crm_visitante" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_crm_visitante_chave_unique" ON "crm_visitante" ("chave") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_visitante_email" ON "crm_visitante" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_visitante_ultima_em" ON "crm_visitante" ("ultima_em") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "crm_evento" cascade;`);

    this.addSql(`drop table if exists "crm_visitante" cascade;`);
  }

}
