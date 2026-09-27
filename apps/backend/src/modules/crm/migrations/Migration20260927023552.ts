import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260927023552 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "crm_email" drop constraint if exists "crm_email_resend_id_unique";`);
    this.addSql(`create table if not exists "crm_email" ("id" text not null, "resend_id" text not null, "para" text null, "tipo" text null, "equipe" boolean not null default false, "enviado_em" timestamptz null, "entregue_em" timestamptz null, "atrasado_em" timestamptz null, "aberto_em" timestamptz null, "ultima_abertura_em" timestamptz null, "clicado_em" timestamptz null, "ultimo_clique_em" timestamptz null, "ultimo_link" text null, "devolvido_em" timestamptz null, "devolucao" text null, "reclamou_em" timestamptz null, "falhou_em" timestamptz null, "suprimido_em" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "crm_email_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_email_deleted_at" ON "crm_email" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_crm_email_resend_id_unique" ON "crm_email" ("resend_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_email_para" ON "crm_email" ("para") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_crm_email_enviado_em" ON "crm_email" ("enviado_em") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "crm_email" cascade;`);
  }

}
