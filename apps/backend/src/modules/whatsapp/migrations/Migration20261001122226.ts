import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261001122226 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "whatsapp_mensagem" drop constraint if exists "whatsapp_mensagem_wamid_unique";`);
    this.addSql(`alter table if exists "whatsapp_conversa" drop constraint if exists "whatsapp_conversa_telefone_unique";`);
    this.addSql(`create table if not exists "whatsapp_conversa" ("id" text not null, "telefone" text not null, "nome" text null, "situacao" text check ("situacao" in ('bot', 'equipe')) not null default 'bot', "equipe_desde" timestamptz null, "equipe_motivo" text null, "ultima_entrada_em" timestamptz null, "pendente_desde" timestamptz null, "tentativas" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "whatsapp_conversa_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_whatsapp_conversa_deleted_at" ON "whatsapp_conversa" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_whatsapp_conversa_telefone_unique" ON "whatsapp_conversa" ("telefone") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_whatsapp_conversa_pendente_desde" ON "whatsapp_conversa" ("pendente_desde") WHERE deleted_at IS NULL AND pendente_desde IS NOT NULL;`);

    this.addSql(`create table if not exists "whatsapp_mensagem" ("id" text not null, "conversa_id" text not null, "wamid" text null, "direcao" text check ("direcao" in ('entrada', 'saida')) not null, "autor" text check ("autor" in ('cliente', 'bot', 'equipe')) not null, "tipo" text not null default 'texto', "texto" text null, "situacao" text null, "erro" text null, "dados" jsonb null, "em" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "whatsapp_mensagem_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_whatsapp_mensagem_deleted_at" ON "whatsapp_mensagem" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_whatsapp_mensagem_wamid_unique" ON "whatsapp_mensagem" ("wamid") WHERE deleted_at IS NULL AND wamid IS NOT NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_whatsapp_mensagem_conversa_id_em" ON "whatsapp_mensagem" ("conversa_id", "em") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "whatsapp_conversa" cascade;`);

    this.addSql(`drop table if exists "whatsapp_mensagem" cascade;`);
  }

}
