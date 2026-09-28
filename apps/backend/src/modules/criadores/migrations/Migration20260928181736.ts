import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260928181736 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "criador_inscricao" drop constraint if exists "criador_inscricao_email_unique";`);
    this.addSql(`create table if not exists "criador_inscricao" ("id" text not null, "nome" text not null, "whatsapp" text not null, "email" text not null, "cidade" text not null, "instagram" text null, "tiktok" text null, "seguidores" text null, "barba" text not null, "experiencia" text null, "video" text null, "parceria" boolean not null default false, "modelo" text not null, "situacao" text check ("situacao" in ('nova', 'aprovada', 'recusada')) not null default 'nova', "consentido_em" timestamptz not null, "decidida_em" timestamptz null, "decidida_por" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "criador_inscricao_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_criador_inscricao_deleted_at" ON "criador_inscricao" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_criador_inscricao_email_unique" ON "criador_inscricao" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_criador_inscricao_situacao" ON "criador_inscricao" ("situacao") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "criador_inscricao" cascade;`);
  }

}
