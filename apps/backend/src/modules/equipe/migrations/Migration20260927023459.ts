import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260927023459 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "equipe_acesso" drop constraint if exists "equipe_acesso_papel_area_unique";`);
    this.addSql(`create table if not exists "equipe_acesso" ("id" text not null, "papel" text check ("papel" in ('operacao', 'marketing')) not null, "area" text not null, "abre" boolean not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "equipe_acesso_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_equipe_acesso_deleted_at" ON "equipe_acesso" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_equipe_acesso_papel_area_unique" ON "equipe_acesso" ("papel", "area") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "equipe_acesso" cascade;`);
  }

}
