import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260921233130 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "envio_evento" drop constraint if exists "envio_evento_envio_id_chave_unique";`);
    this.addSql(`alter table if exists "envio" drop constraint if exists "envio_parceiro_id_no_parceiro_unique";`);
    this.addSql(`alter table if exists "envio" drop constraint if exists "envio_codigo_unique";`);
    this.addSql(`create table if not exists "envio" ("id" text not null, "pedido_id" text null, "fulfillment_id" text null, "parceiro" text not null, "id_no_parceiro" text null, "referencia" text null, "codigo" text null, "url" text null, "transportadora" text null, "servico" text null, "situacao" text not null default 'aguardando', "alerta" text null, "desde" timestamptz null, "postado_em" timestamptz null, "entregue_em" timestamptz null, "avisos" jsonb null, "pendencia" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "envio_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_envio_deleted_at" ON "envio" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_envio_pedido_id" ON "envio" ("pedido_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_envio_codigo_unique" ON "envio" ("codigo") WHERE codigo IS NOT NULL AND deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_envio_parceiro_id_no_parceiro_unique" ON "envio" ("parceiro", "id_no_parceiro") WHERE id_no_parceiro IS NOT NULL AND deleted_at IS NULL;`);

    this.addSql(`create table if not exists "envio_evento" ("id" text not null, "tipo" text not null, "descricao" text not null, "local" text null, "quando" timestamptz not null, "origem" text not null, "chave" text not null, "bruto" jsonb null, "envio_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "envio_evento_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_envio_evento_envio_id" ON "envio_evento" ("envio_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_envio_evento_deleted_at" ON "envio_evento" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_envio_evento_envio_id_chave_unique" ON "envio_evento" ("envio_id", "chave") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "envio_evento" add constraint "envio_evento_envio_id_foreign" foreign key ("envio_id") references "envio" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "envio_evento" drop constraint if exists "envio_evento_envio_id_foreign";`);

    this.addSql(`drop table if exists "envio" cascade;`);

    this.addSql(`drop table if exists "envio_evento" cascade;`);
  }

}
