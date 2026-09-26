import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260926214705 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "obs_tentativa" ("id" text not null, "carrinho" text not null, "sessao" text null, "quem" text not null, "assinada" boolean not null default false, "resultado" text not null, "motivo" text null, "valor" integer null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "obs_tentativa_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_obs_tentativa_deleted_at" ON "obs_tentativa" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_obs_tentativa_created_at" ON "obs_tentativa" ("created_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_obs_tentativa_carrinho" ON "obs_tentativa" ("carrinho") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_obs_tentativa_quem" ON "obs_tentativa" ("quem") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "obs_tentativa" cascade;`)
  }
}
