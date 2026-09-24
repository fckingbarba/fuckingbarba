import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260924030124 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "equipe_membro" drop constraint if exists "equipe_membro_email_unique";`);
    this.addSql(`create table if not exists "equipe_membro" ("id" text not null, "email" text not null, "nome" text not null, "papel" text check ("papel" in ('dono', 'operacao', 'marketing')) not null, "situacao" text check ("situacao" in ('convidado', 'ativo', 'removido')) not null default 'convidado', "convidado_em" timestamptz null, "convidado_por" text null, "entrou_em" timestamptz null, "ultimo_acesso" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "equipe_membro_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_equipe_membro_email_unique" ON "equipe_membro" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_equipe_membro_deleted_at" ON "equipe_membro" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "equipe_registro" ("id" text not null, "membro_id" text null, "acao" text not null, "alvo_id" text null, "detalhe" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "equipe_registro_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_equipe_registro_deleted_at" ON "equipe_registro" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_equipe_registro_membro_id" ON "equipe_registro" ("membro_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_equipe_registro_alvo_id" ON "equipe_registro" ("alvo_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "equipe_membro" cascade;`);

    this.addSql(`drop table if exists "equipe_registro" cascade;`);
  }

}
