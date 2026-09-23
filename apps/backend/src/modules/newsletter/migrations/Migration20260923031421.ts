import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260923031421 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "newsletter_inscricao" drop constraint if exists "newsletter_inscricao_email_unique";`
    )
    this.addSql(
      `create table if not exists "newsletter_inscricao" ("id" text not null, "email" text not null, "origem" text null, "consentido_em" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "newsletter_inscricao_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_newsletter_inscricao_email_unique" ON "newsletter_inscricao" ("email") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_newsletter_inscricao_deleted_at" ON "newsletter_inscricao" ("deleted_at") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "newsletter_inscricao" cascade;`)
  }
}
