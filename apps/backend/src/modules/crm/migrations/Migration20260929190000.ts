import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/** O jeito de cada campanha do CRM (entrega 0210): a oferta ou o recado do Matheus. */
export class Migration20260929190000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "crm_campanha" add column if not exists "jeito" text not null default 'oferta';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "crm_campanha" drop column if exists "jeito";`);
  }

}
