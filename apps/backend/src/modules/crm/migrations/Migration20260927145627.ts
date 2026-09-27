import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260927145627 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "crm_base_pessoa" drop constraint if exists "crm_base_pessoa_email_unique";`);
    this.addSql(`alter table if exists "crm_base_pedido" drop constraint if exists "crm_base_pedido_numero_unique";`);
    this.addSql(`alter table if exists "crm_base_carrinho" drop constraint if exists "crm_base_carrinho_carrinho_unique";`);
    this.addSql(`create table if not exists "crm_base_carrinho" ("id" text not null, "carrinho" text not null, "email" text not null, "criado_em" timestamptz not null, "tipo" text null, "total" integer not null, "itens" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "crm_base_carrinho_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_base_carrinho_deleted_at" ON "crm_base_carrinho" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_crm_base_carrinho_carrinho_unique" ON "crm_base_carrinho" ("carrinho") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_base_carrinho_email" ON "crm_base_carrinho" ("email") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "crm_base_pedido" ("id" text not null, "numero" text not null, "email" text not null, "feito_em" timestamptz not null, "pago_em" timestamptz null, "enviado_em" timestamptz null, "pagamento" text not null, "envio" text not null, "total" integer not null, "desconto" integer not null, "frete" integer not null, "cupom" text null, "meio" text null, "itens" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "crm_base_pedido_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_base_pedido_deleted_at" ON "crm_base_pedido" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_crm_base_pedido_numero_unique" ON "crm_base_pedido" ("numero") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_base_pedido_email" ON "crm_base_pedido" ("email") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "crm_base_pessoa" ("id" text not null, "email" text not null, "nome" text null, "aceita_ofertas" boolean not null default false, "ofertas_em" timestamptz null, "newsletter_em" timestamptz null, "tinha_conta" boolean not null default false, "desde" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "crm_base_pessoa_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_base_pessoa_deleted_at" ON "crm_base_pessoa" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_crm_base_pessoa_email_unique" ON "crm_base_pessoa" ("email") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "crm_base_carrinho" cascade;`);

    this.addSql(`drop table if exists "crm_base_pedido" cascade;`);

    this.addSql(`drop table if exists "crm_base_pessoa" cascade;`);
  }

}
