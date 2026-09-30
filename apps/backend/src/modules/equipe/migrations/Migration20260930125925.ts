import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260930125925 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "equipe_papel" ("id" text not null, "nome" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "equipe_papel_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_equipe_papel_deleted_at" ON "equipe_papel" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "equipe_acesso" drop constraint if exists "equipe_acesso_papel_check";`);

    this.addSql(`alter table if exists "equipe_membro" drop constraint if exists "equipe_membro_papel_check";`);

    this.addSql(`alter table if exists "equipe_acesso" alter column "papel" type text using ("papel"::text);`);

    this.addSql(`alter table if exists "equipe_membro" alter column "papel" type text using ("papel"::text);`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "equipe_papel" cascade;`);

    this.addSql(`alter table if exists "equipe_acesso" add constraint "equipe_acesso_papel_check" check("papel" in ('operacao', 'marketing'));`);

    this.addSql(`alter table if exists "equipe_membro" add constraint "equipe_membro_papel_check" check("papel" in ('dono', 'operacao', 'marketing'));`);
  }

}
