import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/** As campanhas do CRM (entrega 0206): o e-mail de data, o público e a hora. */
export class Migration20260929160000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "crm_campanha" ("id" text not null, "nome" text not null, "assunto" text not null, "assunto_b" text null, "previa" text not null, "titulo" text not null, "texto" text not null, "botao_texto" text null, "botao_caminho" text null, "produtos" jsonb not null, "publico" text not null, "situacao" text not null, "agenda" timestamptz null, "comecou_em" timestamptz null, "acabou_em" timestamptz null, "por" text null, "resultado" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "crm_campanha_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_campanha_deleted_at" ON "crm_campanha" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_campanha_situacao" ON "crm_campanha" ("situacao") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "crm_campanha" cascade;`);
  }

}
